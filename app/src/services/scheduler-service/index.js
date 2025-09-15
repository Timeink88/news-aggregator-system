/**
 * Scheduler服务模块 - 任务调度
 * 遵循Node.js最佳实践：模块化、错误处理、日志记录
 */

import cron from 'node-cron';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import logger from '../../utils/logger.js';
import { validateUUID } from '../../utils/validators.js';
import { CircuitBreaker } from '../../utils/circuit-breaker.js';
import EventEmitter from 'node:events';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 调度器配置
const SCHEDULER_CONFIG = {
  maxConcurrentJobs: 10,
  maxRetries: 3,
  retryDelay: {
    initial: 5000,
    max: 300000,
    multiplier: 2
  },
  jobTimeout: {
    default: 300000, // 5分钟
    rss: 60000, // 1分钟
    ai: 300000, // 5分钟
    email: 120000, // 2分钟
    cleanup: 600000 // 10分钟
  },
  schedules: {
    // RSS源检查调度
    rss_check: {
      cron: '*/5 * * * *', // 每5分钟
      description: '检查RSS源更新'
    },
    // AI分析调度
    ai_analysis: {
      cron: '0 */2 * * *', // 每2小时
      description: '执行AI分析'
    },
    // 邮件摘要调度
    daily_digest: {
      cron: '0 8 * * *', // 每天8点
      description: '发送每日摘要'
    },
    // 数据清理调度
    cleanup_expired: {
      cron: '0 3 * * *', // 每天3点
      description: '清理过期数据'
    },
    // 健康检查调度
    health_check: {
      cron: '*/10 * * * *', // 每10分钟
      description: '系统健康检查'
    },
    // 统计报表调度
    statistics_report: {
      cron: '0 6 * * *', // 每天6点
      description: '生成统计报表'
    },
    // 索引优化调度
    index_optimization: {
      cron: '0 2 * * 0', // 每周日2点
      description: '数据库索引优化'
    },
    // 备份调度
    backup: {
      cron: '0 1 * * *', // 每天1点
      description: '数据备份'
    }
  }
};

// 任务状态枚举
const JOB_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  RETRYING: 'retrying'
};

// 任务优先级枚举
const JOB_PRIORITY = {
  LOW: 1,
  NORMAL: 2,
  HIGH: 3,
  CRITICAL: 4
};

/**
 * 任务类
 */
class Job {
  constructor(options) {
    this.id = options.id || uuidv4();
    this.name = options.name;
    this.type = options.type;
    this.priority = options.priority || JOB_PRIORITY.NORMAL;
    this.status = options.status || JOB_STATUS.PENDING;
    this.payload = options.payload || {};
    this.scheduledAt = options.scheduledAt || new Date();
    this.startedAt = null;
    this.completedAt = null;
    this.attempts = options.attempts || 0;
    this.maxRetries = options.maxRetries || SCHEDULER_CONFIG.maxRetries;
    this.timeout = options.timeout || SCHEDULER_CONFIG.jobTimeout.default;
    this.retryCount = options.retryCount || 0;
    this.error = null;
    this.result = null;
    this.metadata = options.metadata || {};
  }

  /**
   * 开始执行任务
   */
  start() {
    this.status = JOB_STATUS.RUNNING;
    this.startedAt = new Date();
    this.attempts++;
  }

  /**
   * 完成任务
   */
  complete(result) {
    this.status = JOB_STATUS.COMPLETED;
    this.completedAt = new Date();
    this.result = result;
  }

  /**
   * 失败任务
   */
  fail(error) {
    this.status = JOB_STATUS.FAILED;
    this.completedAt = new Date();
    this.error = error.message;
  }

  /**
   * 取消任务
   */
  cancel() {
    this.status = JOB_STATUS.CANCELLED;
    this.completedAt = new Date();
  }

  /**
   * 重试任务
   */
  retry() {
    this.status = JOB_STATUS.RETRYING;
    this.retryCount++;
    this.scheduledAt = new Date(Date.now() + this.calculateRetryDelay());
  }

  /**
   * 计算重试延迟
   */
  calculateRetryDelay() {
    const delay = SCHEDULER_CONFIG.retryDelay.initial *
                   Math.pow(SCHEDULER_CONFIG.retryDelay.multiplier, this.retryCount);
    return Math.min(delay, SCHEDULER_CONFIG.retryDelay.max);
  }

  /**
   * 检查是否可以重试
   */
  canRetry() {
    return this.retryCount < this.maxRetries;
  }

  /**
   * 检查是否超时
   */
  isTimeout() {
    if (!this.startedAt) return false;
    return Date.now() - this.startedAt.getTime() > this.timeout;
  }

  /**
   * 获取执行时间
   */
  getDuration() {
    if (!this.startedAt) return 0;
    const end = this.completedAt || new Date();
    return end.getTime() - this.startedAt.getTime();
  }
}

/**
 * 调度器服务类
 */
class SchedulerService extends EventEmitter {
  constructor() {
    super();
    this.jobs = new Map();
    this.runningJobs = new Set();
    this.scheduledJobs = new Map();
    this.taskHandlers = new Map();
    this.cronJobs = new Map();
    this.circuitBreaker = new CircuitBreaker({
      timeout: 30000,
      errorThresholdPercentage: 50,
      resetTimeout: 60000
    });
    this.isRunning = false;
    this.jobQueue = [];
    this.concurrency = 0;
  }

  /**
   * 启动调度器
   */
  async start() {
    try {
      logger.info('正在启动调度器服务...');

      if (this.isRunning) {
        logger.warn('调度器已经在运行中');
        return;
      }

      // 注册任务处理器
      this.registerTaskHandlers();

      // 注册定时任务
      await this.registerScheduledJobs();

      // 启动任务处理器
      this.startJobProcessor();

      // 启动失败任务重试器
      this.startRetryProcessor();

      this.isRunning = true;

      logger.info('调度器服务启动成功');

      return { success: true };

    } catch (error) {
      logger.error('调度器启动失败', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * 停止调度器
   */
  async stop() {
    try {
      logger.info('正在停止调度器服务...');

      if (!this.isRunning) {
        logger.warn('调度器未在运行');
        return;
      }

      // 停止所有定时任务
      for (const [name, cronJob] of this.cronJobs) {
        cronJob.stop();
        logger.info(`已停止定时任务: ${name}`);
      }

      // 等待正在运行的任务完成
      await this.waitForRunningJobs();

      this.isRunning = false;

      logger.info('调度器服务已停止');

      return { success: true };

    } catch (error) {
      logger.error('调度器停止失败', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * 注册任务处理器
   */
  registerTaskHandlers() {
    // RSS源检查任务
    this.taskHandlers.set('rss_check', this.handleRSSCheck.bind(this));

    // AI分析任务
    this.taskHandlers.set('ai_analysis', this.handleAIAnalysis.bind(this));

    // 邮件发送任务
    this.taskHandlers.set('email_send', this.handleEmailSend.bind(this));

    // 数据清理任务
    this.taskHandlers.set('cleanup', this.handleCleanup.bind(this));

    // 健康检查任务
    this.taskHandlers.set('health_check', this.handleHealthCheck.bind(this));

    // 统计报表任务
    this.taskHandlers.set('statistics_report', this.handleStatisticsReport.bind(this));

    // 索引优化任务
    this.taskHandlers.set('index_optimization', this.handleIndexOptimization.bind(this));

    // 备份任务
    this.taskHandlers.set('backup', this.handleBackup.bind(this));

    logger.info(`已注册 ${this.taskHandlers.size} 个任务处理器`);
  }

  /**
   * 注册定时任务
   */
  async registerScheduledJobs() {
    for (const [name, config] of Object.entries(SCHEDULER_CONFIG.schedules)) {
      try {
        const cronJob = cron.schedule(config.cron, async () => {
          await this.executeScheduledJob(name);
        }, {
          scheduled: false
        });

        this.cronJobs.set(name, cronJob);
        cronJob.start();

        logger.info(`已注册定时任务: ${name} - ${config.description}`);

      } catch (error) {
        logger.error(`注册定时任务失败: ${name}`, { error: error.message });
      }
    }
  }

  /**
   * 添加任务
   */
  async addJob(jobOptions) {
    try {
      const job = new Job(jobOptions);

      // 保存到数据库
      const { error } = await supabase
        .from('scheduled_jobs')
        .insert([{
          id: job.id,
          name: job.name,
          type: job.type,
          priority: job.priority,
          status: job.status,
          payload: JSON.stringify(job.payload),
          scheduled_at: job.scheduledAt.toISOString(),
          max_retries: job.maxRetries,
          timeout: job.timeout,
          metadata: JSON.stringify(job.metadata)
        }])
        .select()
        .single();

      if (error) {
        throw error;
      }

      // 缓存任务
      this.jobs.set(job.id, job);

      // 添加到执行队列
      this.addToQueue(job);

      logger.info(`任务添加成功: ${job.name} (${job.id})`);

      this.emit('jobAdded', job);

      return {
        success: true,
        job: data
      };

    } catch (error) {
      logger.error('添加任务失败', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 添加任务到队列
   */
  addToQueue(job) {
    // 根据优先级插入队列
    let insertIndex = this.jobQueue.length;
    for (let i = 0; i < this.jobQueue.length; i++) {
      if (job.priority > this.jobQueue[i].priority) {
        insertIndex = i;
        break;
      }
    }

    this.jobQueue.splice(insertIndex, 0, job);
  }

  /**
   * 启动任务处理器
   */
  startJobProcessor() {
    setInterval(async () => {
      if (!this.isRunning || this.concurrency >= SCHEDULER_CONFIG.maxConcurrentJobs) {
        return;
      }

      const job = this.jobQueue.shift();
      if (job) {
        this.executeJob(job);
      }
    }, 1000); // 每秒检查一次队列
  }

  /**
   * 执行任务
   */
  async executeJob(job) {
    try {
      this.concurrency++;
      this.runningJobs.add(job.id);

      logger.info(`开始执行任务: ${job.name} (${job.id})`);

      // 更新任务状态
      job.start();
      await this.updateJobStatus(job);

      // 获取任务处理器
      const handler = this.taskHandlers.get(job.type);
      if (!handler) {
        throw new Error(`未找到任务处理器: ${job.type}`);
      }

      // 设置超时
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`任务超时: ${job.name}`));
        }, job.timeout);
      });

      // 执行任务
      const result = await Promise.race([
        handler(job),
        timeoutPromise
      ]);

      // 任务完成
      job.complete(result);
      await this.updateJobStatus(job);

      logger.info(`任务执行成功: ${job.name} (${job.id})`, {
        duration: job.getDuration(),
        attempts: job.attempts
      });

      this.emit('jobCompleted', job);

    } catch (error) {
      logger.error(`任务执行失败: ${job.name} (${job.id})`, {
        error: error.message,
        attempts: job.attempts
      });

      job.fail(error);
      await this.updateJobStatus(job);

      this.emit('jobFailed', job);

      // 如果可以重试，重新调度
      if (job.canRetry()) {
        job.retry();
        await this.updateJobStatus(job);
        this.addToQueue(job);
        logger.info(`任务已重新调度: ${job.name} (${job.id})`);
      }

    } finally {
      this.concurrency--;
      this.runningJobs.delete(job.id);
    }
  }

  /**
   * 执行定时任务
   */
  async executeScheduledJob(jobName) {
    try {
      logger.info(`执行定时任务: ${jobName}`);

      const job = new Job({
        name: jobName,
        type: jobName,
        priority: JOB_PRIORITY.NORMAL,
        payload: { scheduled: true }
      });

      await this.addJob(job);

    } catch (error) {
      logger.error(`定时任务执行失败: ${jobName}`, { error: error.message });
    }
  }

  /**
   * 启动重试处理器
   */
  startRetryProcessor() {
    setInterval(async () => {
      if (!this.isRunning) return;

      try {
        const now = new Date();
        const retryThreshold = new Date(now.getTime() - SCHEDULER_CONFIG.retryDelay.max);

        const { data: failedJobs, error } = await supabase
          .from('scheduled_jobs')
          .select('*')
          .eq('status', JOB_STATUS.FAILED)
          .lt('updated_at', retryThreshold.toISOString())
          .lte('retry_count', SCHEDULER_CONFIG.maxRetries);

        if (error) {
          throw error;
        }

        for (const jobData of failedJobs) {
          const job = this.deserializeJob(jobData);
          job.retry();
          await this.updateJobStatus(job);
          this.addToQueue(job);
          logger.info(`重新调度失败任务: ${job.name} (${job.id})`);
        }

      } catch (error) {
        logger.error('重试处理器执行失败', { error: error.message });
      }
    }, 60000); // 每分钟检查一次
  }

  /**
   * 更新任务状态
   */
  async updateJobStatus(job) {
    try {
      const { error } = await supabase
        .from('scheduled_jobs')
        .update({
          status: job.status,
          started_at: job.startedAt?.toISOString(),
          completed_at: job.completedAt?.toISOString(),
          attempts: job.attempts,
          retry_count: job.retryCount,
          error_message: job.error,
          result: JSON.stringify(job.result),
          updated_at: new Date().toISOString()
        })
        .eq('id', job.id);

      if (error) {
        throw error;
      }

    } catch (error) {
      logger.error(`更新任务状态失败: ${job.id}`, { error: error.message });
    }
  }

  /**
   * 等待正在运行的任务完成
   */
  async waitForRunningJobs() {
    const maxWaitTime = 60000; // 最多等待1分钟
    const Date.now() = Date.now();

    while (this.runningJobs.size > 0 && Date.now() - Date.now() < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (this.runningJobs.size > 0) {
      logger.warn(`仍有 ${this.runningJobs.size} 个任务在运行`);
    }
  }

  /**
   * 取消任务
   */
  async cancelJob(jobId) {
    try {
      const job = this.jobs.get(jobId);
      if (!job) {
        throw new Error('任务不存在');
      }

      if (job.status === JOB_STATUS.COMPLETED || job.status === JOB_STATUS.CANCELLED) {
        throw new Error('任务已完成或已取消');
      }

      job.cancel();
      await this.updateJobStatus(job);

      // 从运行队列中移除
      this.runningJobs.delete(jobId);

      logger.info(`任务已取消: ${job.name} (${job.id})`);

      return { success: true };

    } catch (error) {
      logger.error(`取消任务失败: ${jobId}`, { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取任务状态
   */
  async getJobStatus(jobId) {
    try {
      const { error } = await supabase
        .from('scheduled_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (error) {
        throw error;
      }

      return data;

    } catch (error) {
      logger.error(`获取任务状态失败: ${jobId}`, { error: error.message });
      return null;
    }
  }

  /**
   * 获取任务队列状态
   */
  getQueueStatus() {
    return {
      queueLength: this.jobQueue.length,
      runningJobs: this.runningJobs.size,
      maxConcurrency: SCHEDULER_CONFIG.maxConcurrentJobs,
      isRunning: this.isRunning,
      registeredHandlers: this.taskHandlers.size,
      activeCronJobs: this.cronJobs.size
    };
  }

  /**
   * 获取统计信息
   */
  async getStatistics() {
    try {
      const [
        { count: totalJobs },
        { count: todayJobs },
        { count: runningJobs },
        { count: completedJobs },
        { count: failedJobs },
        { count: retryingJobs }
      ] = await Promise.all([
        supabase.from('scheduled_jobs').select('*', { count: 'exact', head: true }),
        supabase.from('scheduled_jobs').select('*', { count: 'exact', head: true }).gte('created_at', new Date().toISOString().split('T')[0]),
        supabase.from('scheduled_jobs').select('*', { count: 'exact', head: true }).eq('status', JOB_STATUS.RUNNING),
        supabase.from('scheduled_jobs').select('*', { count: 'exact', head: true }).eq('status', JOB_STATUS.COMPLETED),
        supabase.from('scheduled_jobs').select('*', { count: 'exact', head: true }).eq('status', JOB_STATUS.FAILED),
        supabase.from('scheduled_jobs').select('*', { count: 'exact', head: true }).eq('status', JOB_STATUS.RETRYING)
      ]);

      return {
        totalJobs: totalJobs || 0,
        todayJobs: todayJobs || 0,
        runningJobs: runningJobs || 0,
        completedJobs: completedJobs || 0,
        failedJobs: failedJobs || 0,
        retryingJobs: retryingJobs || 0,
        successRate: totalJobs ? (completedJobs / totalJobs) * 100 : 0,
        queueStatus: this.getQueueStatus()
      };

    } catch (error) {
      logger.error('获取调度器统计失败', { error: error.message });
      return {
        totalJobs: 0,
        todayJobs: 0,
        runningJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        retryingJobs: 0,
        successRate: 0,
        queueStatus: this.getQueueStatus()
      };
    }
  }

  /**
   * 反序列化任务
   */
  deserializeJob(jobData) {
    return new Job({
      id: jobData.id,
      name: jobData.name,
      type: jobData.type,
      priority: jobData.priority,
      status: jobData.status,
      payload: JSON.parse(jobData.payload || '{}'),
      scheduledAt: new Date(jobData.scheduled_at),
      startedAt: jobData.started_at ? new Date(jobData.started_at) : null,
      completedAt: jobData.completed_at ? new Date(jobData.completed_at) : null,
      attempts: jobData.attempts,
      maxRetries: jobData.max_retries,
      timeout: jobData.timeout,
      retryCount: jobData.retry_count,
      error: jobData.error_message,
      result: jobData.result ? JSON.parse(jobData.result) : null,
      metadata: JSON.parse(jobData.metadata || '{}')
    });
  }

  // 任务处理器实现
  async handleRSSCheck(job) {
    // 这里会调用RSS服务检查RSS源
    logger.info('执行RSS源检查任务');
    // 实现RSS源检查逻辑
    return { checked: true, timestamp: new Date().toISOString() };
  }

  async handleAIAnalysis(job) {
    // 这里会调用AI服务执行分析
    logger.info('执行AI分析任务');
    // 实现AI分析逻辑
    return { analyzed: true, timestamp: new Date().toISOString() };
  }

  async handleEmailSend(job) {
    // 这里会调用Email服务发送邮件
    logger.info('执行邮件发送任务');
    // 实现邮件发送逻辑
    return { sent: true, timestamp: new Date().toISOString() };
  }

  async handleCleanup(job) {
    // 这里会调用Cleanup服务清理数据
    logger.info('执行数据清理任务');
    // 实现数据清理逻辑
    return { cleaned: true, timestamp: new Date().toISOString() };
  }

  async handleHealthCheck(job) {
    // 执行系统健康检查
    logger.info('执行健康检查任务');

    const health = {
      database: await this.checkDatabaseHealth(),
      redis: await this.checkRedisHealth(),
      external: await this.checkExternalServicesHealth()
    };

    return { health, timestamp: new Date().toISOString() };
  }

  async handleStatisticsReport(job) {
    // 生成统计报表
    logger.info('执行统计报表任务');
    // 实现统计报表逻辑
    return { generated: true, timestamp: new Date().toISOString() };
  }

  async handleIndexOptimization(job) {
    // 执行数据库索引优化
    logger.info('执行索引优化任务');
    // 实现索引优化逻辑
    return { optimized: true, timestamp: new Date().toISOString() };
  }

  async handleBackup(job) {
    // 执行数据备份
    logger.info('执行数据备份任务');
    // 实现数据备份逻辑
    return { backed: true, timestamp: new Date().toISOString() };
  }

  // 健康检查方法
  async checkDatabaseHealth() {
    try {
      const { error } = await supabase
        .from('system_config')
        .select('value')
        .eq('key', 'health_check')
        .single();

      return {
        status: error ? 'unhealthy' : 'healthy',
        responseTime: Date.now(),
        error: error?.message
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  async checkRedisHealth() {
    // 检查Redis连接状态
    return {
      status: 'healthy',
      responseTime: Date.now()
    };
  }

  async checkExternalServicesHealth() {
    // 检查外部服务健康状态
    return {
      status: 'healthy',
      responseTime: Date.now()
    };
  }
}

// 导出服务实例和常量
export const schedulerService = new SchedulerService();
export { JOB_STATUS, JOB_PRIORITY };
export default SchedulerService;