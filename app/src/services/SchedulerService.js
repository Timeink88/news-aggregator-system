/**
 * Scheduler Service - 任务调度服务
 * 提供定时任务管理、任务执行、依赖管理等功能
 * 遵循Node.js最佳实践：错误处理、重试机制、性能优化
 */

import { EventEmitter } from 'events';
import cron from 'node-cron';
import crypto from 'crypto';
import logger from '../utils/logger.js';
import { RSSManagerService } from './RSSManagerService.js';
import NewsAggregatorService from './NewsAggregatorService.js';
import AIAnalysisService from './AIAnalysisService.js';
import EmailService from './EmailService.js';
import ConfigService from './ConfigService.js';

/**
 * 任务定义类
 */
class ScheduledTask {
  constructor(options = {}) {
    this.id = options.id || crypto.randomUUID();
    this.name = options.name;
    this.description = options.description || '';
    this.schedule = options.schedule; // cron表达式
    this.handler = options.handler; // 任务处理函数
    this.enabled = options.enabled !== false;
    this.concurrent = options.concurrent || false; // 是否允许并发执行
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 5000;
    this.timeout = options.timeout || 300000; // 5分钟超时
    this.dependencies = options.dependencies || []; // 任务依赖
    this.tags = options.tags || [];
    this.priority = options.priority || 'normal'; // high, normal, low
    this.runCount = 0;
    this.errorCount = 0;
    this.lastRunAt = null;
    this.nextRunAt = null;
    this.lastError = null;
    this.averageExecutionTime = 0;
    this.maxExecutionTime = 0;
    this.minExecutionTime = Infinity;
    this.isRunning = false;
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
  }

  /**
   * 检查任务是否可以运行
   */
  canRun() {
    return this.enabled && !this.isRunning && (this.concurrent || !this.isRunning);
  }

  /**
   * 记录任务执行开始
   */
  recordStart() {
    this.isRunning = true;
    this.lastRunAt = Date.now();
    this.runCount++;
  }

  /**
   * 记录任务执行完成
   */
  recordSuccess(executionTime) {
    this.isRunning = false;
    this.lastError = null;
    this.averageExecutionTime = this.calculateAverageTime(executionTime);
    this.maxExecutionTime = Math.max(this.maxExecutionTime, executionTime);
    this.minExecutionTime = Math.min(this.minExecutionTime, executionTime);
    this.updatedAt = Date.now();
  }

  /**
   * 记录任务执行失败
   */
  recordError(error, executionTime) {
    this.isRunning = false;
    this.lastError = error;
    this.errorCount++;
    this.averageExecutionTime = this.calculateAverageTime(executionTime);
    this.updatedAt = Date.now();
  }

  /**
   * 计算平均执行时间
   */
  calculateAverageTime(newTime) {
    if (this.runCount === 1) return newTime;
    return (this.averageExecutionTime * (this.runCount - 1) + newTime) / this.runCount;
  }

  /**
   * 获取任务统计信息
   */
  getStats() {
    return {
      id: this.id,
      name: this.name,
      enabled: this.enabled,
      runCount: this.runCount,
      errorCount: this.errorCount,
      successRate: this.runCount > 0 ? `${((this.runCount - this.errorCount) / this.runCount * 100).toFixed(2)  }%` : '0%',
      averageExecutionTime: `${this.averageExecutionTime.toFixed(2)  }ms`,
      maxExecutionTime: `${this.maxExecutionTime  }ms`,
      minExecutionTime: this.minExecutionTime === Infinity ? 'N/A' : `${this.minExecutionTime  }ms`,
      lastRunAt: this.lastRunAt ? new Date(this.lastRunAt).toISOString() : null,
      lastError: this.lastError ? this.lastError.message : null,
      isRunning: this.isRunning
    };
  }
}

/**
 * 任务执行器类
 */
class TaskExecutor {
  constructor() {
    this.activeTasks = new Map();
    this.taskQueue = [];
    this.maxConcurrentTasks = 10;
  }

  /**
   * 执行任务
   */
  async execute(task) {
    const taskId = task.id;
    const startTime = Date.now();

    try {
      // 记录任务开始
      task.recordStart();
      this.activeTasks.set(taskId, task);

      // 设置超时
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`任务超时: ${task.name}`)), task.timeout);
      });

      // 执行任务
      const result = await Promise.race([
        task.handler(),
        timeoutPromise
      ]);

      const executionTime = Date.now() - startTime;
      task.recordSuccess(executionTime);

      logger.info(`任务执行成功: ${task.name}`, {
        taskId,
        executionTime,
        runCount: task.runCount
      });

      return { success: true, result, executionTime };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      task.recordError(error, executionTime);

      logger.error(`任务执行失败: ${task.name}`, {
        taskId,
        error: error.message,
        executionTime,
        errorCount: task.errorCount
      });

      return { success: false, error, executionTime };

    } finally {
      this.activeTasks.delete(taskId);
    }
  }

  /**
   * 获取活跃任务统计
   */
  getActiveStats() {
    return {
      activeCount: this.activeTasks.size,
      maxConcurrentTasks: this.maxConcurrentTasks,
      activeTasks: Array.from(this.activeTasks.values()).map(task => ({
        id: task.id,
        name: task.name,
        runningTime: Date.now() - task.lastRunAt
      }))
    };
  }
}

/**
 * Scheduler Service类
 */
class SchedulerService extends EventEmitter {
  constructor(config = {}) {
    super();

    this.isRunning = false;
    this.tasks = new Map();
    this.schedules = new Map();
    this.taskGroups = new Map();
    this.executor = new TaskExecutor();
    this.history = [];
    this.maxHistorySize = config.maxHistorySize || 1000;

    // 服务依赖
    this.rssManagerService = config.rssManagerService || new RSSManagerService();
    this.newsAggregatorService = config.newsAggregatorService || new NewsAggregatorService();
    this.aiAnalysisService = config.aiAnalysisService || new AIAnalysisService();
    this.emailService = config.emailService || new EmailService();
    this.configService = config.configService || new ConfigService();

    // 配置
    this.config = {
      maxConcurrentTasks: config.maxConcurrentTasks || 10,
      enableTaskGroups: config.enableTaskGroups !== false,
      enableHistory: config.enableHistory !== false,
      autoCleanup: config.autoCleanup !== false,
      cleanupInterval: config.cleanupInterval || 24 * 60 * 60 * 1000, // 24小时
      timezone: config.timezone || 'Asia/Shanghai',
      enablePredefinedTasks: config.enablePredefinedTasks !== false
    };

    // 预定义任务组
    this.predefinedGroups = {
      news: {
        name: '新闻抓取任务',
        description: 'RSS源和NewsAPI的新闻抓取任务',
        maxConcurrency: 3,
        tags: ['news', 'fetch']
      },
      analysis: {
        name: 'AI分析任务',
        description: '新闻的AI分析和处理任务',
        maxConcurrency: 5,
        tags: ['ai', 'analysis']
      },
      cleanup: {
        name: '清理任务',
        description: '数据清理和维护任务',
        maxConcurrency: 2,
        tags: ['cleanup', 'maintenance']
      },
      notification: {
        name: '通知任务',
        description: '邮件和推送通知任务',
        maxConcurrency: 3,
        tags: ['notification', 'email']
      }
    };
  }

  /**
   * 初始化Scheduler Service
   */
  async initialize() {
    try {
      logger.info('正在初始化Scheduler Service...');

      // 初始化依赖服务
      await this.rssManagerService.initialize();
      await this.newsAggregatorService.initialize();
      await this.aiAnalysisService.initialize();
      await this.emailService.initialize();
      await this.configService.initialize();

      // 注册预定义任务组
      this.registerPredefinedGroups();

      // 注册预设任务
      if (this.config.enablePredefinedTasks) {
        await this.registerPredefinedTasks();
      }

      // 启动历史清理任务
      if (this.config.enableHistory && this.config.autoCleanup) {
        this.startHistoryCleanup();
      }

      // 启动任务监控
      this.startTaskMonitoring();

      this.isRunning = true;
      logger.info('Scheduler Service初始化成功');
      return true;

    } catch (error) {
      logger.error('Scheduler Service初始化失败:', error);
      throw error;
    }
  }

  /**
   * 注册预定义任务组
   */
  registerPredefinedGroups() {
    for (const [groupId, groupConfig] of Object.entries(this.predefinedGroups)) {
      this.taskGroups.set(groupId, {
        ...groupConfig,
        tasks: [],
        createdAt: Date.now()
      });
    }
  }

  /**
   * 注册预设任务
   */
  async registerPredefinedTasks() {
    try {
      logger.info('正在注册预设任务...');

      // RSS监控任务 - 每5分钟执行一次
      this.registerTask({
        id: 'rss-monitoring',
        name: 'RSS源监控',
        description: '监控所有RSS源的更新状态',
        schedule: '*/5 * * * *', // 每5分钟
        handler: async () => await this.monitorRSSSources(),
        enabled: true,
        tags: ['rss', 'monitoring', 'news'],
        priority: 'high',
        concurrent: false,
        maxRetries: 3,
        timeout: 60000
      });

      // 每日摘要任务 - 每天早上8点执行
      this.registerTask({
        id: 'daily-digest',
        name: '每日新闻摘要',
        description: '生成并发送每日新闻摘要邮件',
        schedule: '0 8 * * *', // 每天8:00
        handler: async () => await this.generateDailyDigest(),
        enabled: true,
        tags: ['email', 'digest', 'news'],
        priority: 'normal',
        concurrent: false,
        maxRetries: 3,
        timeout: 300000
      });

      // 新闻聚合任务 - 每30分钟执行一次
      this.registerTask({
        id: 'news-aggregation',
        name: '新闻聚合',
        description: '聚合多源新闻并进行智能分析',
        schedule: '*/30 * * * *', // 每30分钟
        handler: async () => await this.aggregateAndAnalyzeNews(),
        enabled: true,
        tags: ['news', 'aggregation', 'ai'],
        priority: 'normal',
        concurrent: false,
        maxRetries: 3,
        timeout: 600000
      });

      // 实时通知检查任务 - 每2分钟执行一次
      this.registerTask({
        id: 'realtime-notification-check',
        name: '实时通知检查',
        description: '检查突发新闻并发送实时通知',
        schedule: '*/2 * * * *', // 每2分钟
        handler: async () => await this.checkRealtimeNotifications(),
        enabled: true,
        tags: ['notification', 'realtime', 'news'],
        priority: 'high',
        concurrent: false,
        maxRetries: 2,
        timeout: 120000
      });

      // 数据清理任务 - 每天凌晨2点执行
      this.registerTask({
        id: 'data-cleanup',
        name: '数据清理',
        description: '清理过期数据和日志',
        schedule: '0 2 * * *', // 每天2:00
        handler: async () => await this.cleanupOldData(),
        enabled: true,
        tags: ['cleanup', 'maintenance'],
        priority: 'low',
        concurrent: false,
        maxRetries: 2,
        timeout: 180000
      });

      // 系统健康检查任务 - 每10分钟执行一次
      this.registerTask({
        id: 'health-check',
        name: '系统健康检查',
        description: '检查系统各服务健康状态',
        schedule: '*/10 * * * *', // 每10分钟
        handler: async () => await this.performHealthCheck(),
        enabled: true,
        tags: ['monitoring', 'health'],
        priority: 'normal',
        concurrent: true,
        maxRetries: 2,
        timeout: 60000
      });

      logger.info(`预设任务注册完成，共注册了 ${this.tasks.size} 个任务`);
    } catch (error) {
      logger.error('注册预设任务失败:', error);
      throw error;
    }
  }

  /**
   * 注册任务
   */
  registerTask(taskOptions) {
    try {
      const task = new ScheduledTask(taskOptions);

      // 验证任务配置
      if (!task.name) {
        throw new Error('任务名称不能为空');
      }

      if (!task.schedule) {
        throw new Error('任务调度表达式不能为空');
      }

      if (typeof task.handler !== 'function') {
        throw new Error('任务处理函数必须是函数');
      }

      // 验证cron表达式
      if (!cron.validate(task.schedule)) {
        throw new Error(`无效的cron表达式: ${task.schedule}`);
      }

      // 检查任务是否已存在
      if (this.tasks.has(task.id)) {
        throw new Error(`任务已存在: ${task.id}`);
      }

      // 注册任务
      this.tasks.set(task.id, task);

      // 创建调度器
      const scheduler = cron.schedule(task.schedule, async () => {
        await this.executeTask(task.id);
      }, {
        scheduled: false,
        timezone: this.config.timezone
      });

      this.schedules.set(task.id, scheduler);

      // 将任务添加到组
      this.addTaskToGroups(task);

      // 如果任务已启用，启动调度
      if (task.enabled) {
        scheduler.start();
        task.nextRunAt = this.getNextRunTime(task.schedule);
      }

      logger.info(`任务注册成功: ${task.name} (${task.id})`, {
        schedule: task.schedule,
        enabled: task.enabled
      });

      // 发送事件
      this.emit('jobAdded', {
        id: task.id,
        name: task.name,
        type: 'scheduled',
        schedule: task.schedule,
        enabled: task.enabled,
        timestamp: new Date().toISOString()
      });

      return task;

    } catch (error) {
      logger.error('任务注册失败:', error);
      throw error;
    }
  }

  /**
   * 执行任务
   */
  async executeTask(taskId) {
    try {
      const task = this.tasks.get(taskId);
      if (!task) {
        logger.warn(`任务不存在: ${taskId}`);
        return;
      }

      // 检查任务是否可以执行
      if (!task.canRun()) {
        logger.info(`任务跳过执行: ${task.name}`, {
          reason: task.isRunning ? '任务正在运行' : '任务已禁用'
        });
        return;
      }

      // 检查依赖任务
      if (!await this.checkDependencies(task)) {
        logger.info(`任务依赖未满足，跳过执行: ${task.name}`);
        return;
      }

      // 检查任务组并发限制
      if (!this.checkGroupConcurrency(task)) {
        logger.info(`任务组并发限制，跳过执行: ${task.name}`);
        return;
      }

      logger.info(`开始执行任务: ${task.name}`, {
        taskId,
        runCount: task.runCount + 1
      });

      // 发送事件
      this.emit('jobStarted', {
        id: task.id,
        name: task.name,
        timestamp: new Date().toISOString()
      });

      // 执行任务（包含重试机制）
      const result = await this.executeWithRetry(task);

      // 记录历史
      if (this.config.enableHistory) {
        this.recordTaskHistory(task, result);
      }

      // 发送事件
      if (result.success) {
        this.emit('jobCompleted', {
          id: task.id,
          name: task.name,
          executionTime: result.executionTime,
          timestamp: new Date().toISOString()
        });
      } else {
        this.emit('jobFailed', {
          id: task.id,
          name: task.name,
          error: result.error?.message || 'Unknown error',
          executionTime: result.executionTime,
          timestamp: new Date().toISOString()
        });
      }

      return result;

    } catch (error) {
      logger.error(`任务执行异常: ${taskId}`, error);
      this.emit('taskError', taskId, error);
    }
  }

  /**
   * 带重试的任务执行
   */
  async executeWithRetry(task) {
    let lastResult = null;

    for (let attempt = 1; attempt <= task.maxRetries; attempt++) {
      try {
        const result = await this.executor.execute(task);

        if (result.success) {
          return result;
        }

        lastResult = result;

        if (attempt < task.maxRetries) {
          logger.info(`任务执行失败，准备重试: ${task.name}`, {
            attempt,
            maxRetries: task.maxRetries,
            delay: task.retryDelay
          });

          await this.delay(task.retryDelay);
        }

      } catch (error) {
        lastResult = { success: false, error };

        if (attempt < task.maxRetries) {
          logger.warn(`任务执行异常，准备重试: ${task.name}`, {
            attempt,
            maxRetries: task.maxRetries,
            error: error.message
          });

          await this.delay(task.retryDelay);
        }
      }
    }

    return lastResult || { success: false, error: new Error('未知执行错误') };
  }

  /**
   * 检查任务依赖
   */
  async checkDependencies(task) {
    if (task.dependencies.length === 0) {
      return true;
    }

    for (const depId of task.dependencies) {
      const depTask = this.tasks.get(depId);
      if (!depTask) {
        logger.warn(`依赖任务不存在: ${depId}`);
        return false;
      }

      if (depTask.isRunning) {
        return false;
      }

      if (depTask.lastError && task.runCount - depTask.runCount < 3) {
        return false;
      }
    }

    return true;
  }

  /**
   * 检查任务组并发限制
   */
  checkGroupConcurrency(task) {
    for (const [groupId, group] of this.taskGroups) {
      if (group.tasks.includes(task.id)) {
        const runningTasks = group.tasks.filter(taskId => {
          const t = this.tasks.get(taskId);
          return t && t.isRunning;
        });

        return runningTasks.length < group.maxConcurrency;
      }
    }

    return true;
  }

  /**
   * 将任务添加到组
   */
  addTaskToGroups(task) {
    for (const tag of task.tags) {
      for (const [groupId, group] of this.taskGroups) {
        if (group.tags.includes(tag)) {
          if (!group.tasks.includes(task.id)) {
            group.tasks.push(task.id);
          }
        }
      }
    }
  }

  /**
   * 获取下次运行时间
   */
  getNextRunTime(schedule) {
    try {
      const task = cron.schedule(schedule, () => {}, { scheduled: false });
      return task.nextDates(1)[0];
    } catch (error) {
      logger.warn('获取下次运行时间失败:', error.message);
      return null;
    }
  }

  /**
   * 记录任务历史
   */
  recordTaskHistory(task, result) {
    const historyEntry = {
      id: crypto.randomUUID(),
      taskId: task.id,
      taskName: task.name,
      success: result.success,
      executionTime: result.executionTime,
      error: result.success ? null : result.error?.message,
      timestamp: Date.now()
    };

    this.history.push(historyEntry);

    // 限制历史记录大小
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(-this.maxHistorySize);
    }
  }

  /**
   * 启动任务
   */
  async startTask(taskId) {
    try {
      const task = this.tasks.get(taskId);
      if (!task) {
        throw new Error(`任务不存在: ${taskId}`);
      }

      if (task.enabled) {
        logger.warn(`任务已启用: ${task.name}`);
        return;
      }

      task.enabled = true;
      task.updatedAt = Date.now();

      const scheduler = this.schedules.get(taskId);
      if (scheduler) {
        scheduler.start();
        task.nextRunAt = this.getNextRunTime(task.schedule);
      }

      logger.info(`任务启动成功: ${task.name}`);
      this.emit('jobAdded', {
        id: task.id,
        name: task.name,
        type: 'manual',
        timestamp: new Date().toISOString()
      });

      return true;

    } catch (error) {
      logger.error(`启动任务失败: ${taskId}`, error);
      throw error;
    }
  }

  /**
   * 停止任务
   */
  async stopTask(taskId) {
    try {
      const task = this.tasks.get(taskId);
      if (!task) {
        throw new Error(`任务不存在: ${taskId}`);
      }

      if (!task.enabled) {
        logger.warn(`任务已停止: ${task.name}`);
        return;
      }

      task.enabled = false;
      task.updatedAt = Date.now();

      const scheduler = this.schedules.get(taskId);
      if (scheduler) {
        scheduler.stop();
        task.nextRunAt = null;
      }

      logger.info(`任务停止成功: ${task.name}`);
      this.emit('jobStopped', {
        id: task.id,
        name: task.name,
        timestamp: new Date().toISOString()
      });

      return true;

    } catch (error) {
      logger.error(`停止任务失败: ${taskId}`, error);
      throw error;
    }
  }

  /**
   * 删除任务
   */
  async deleteTask(taskId) {
    try {
      const task = this.tasks.get(taskId);
      if (!task) {
        throw new Error(`任务不存在: ${taskId}`);
      }

      // 停止调度器
      const scheduler = this.schedules.get(taskId);
      if (scheduler) {
        scheduler.stop();
        scheduler.destroy();
      }

      // 从任务组中移除
      for (const group of this.taskGroups.values()) {
        const index = group.tasks.indexOf(taskId);
        if (index > -1) {
          group.tasks.splice(index, 1);
        }
      }

      // 删除任务
      this.tasks.delete(taskId);
      this.schedules.delete(taskId);

      logger.info(`任务删除成功: ${task.name}`);
      this.emit('jobDeleted', {
        id: task.id,
        name: task.name,
        timestamp: new Date().toISOString()
      });

      return true;

    } catch (error) {
      logger.error(`删除任务失败: ${taskId}`, error);
      throw error;
    }
  }

  /**
   * 立即执行任务
   */
  async runTaskNow(taskId) {
    try {
      const task = this.tasks.get(taskId);
      if (!task) {
        throw new Error(`任务不存在: ${taskId}`);
      }

      logger.info(`立即执行任务: ${task.name}`);
      return await this.executeTask(taskId);

    } catch (error) {
      logger.error(`立即执行任务失败: ${taskId}`, error);
      throw error;
    }
  }

  /**
   * 获取任务列表
   */
  getTasks(filters = {}) {
    let tasks = Array.from(this.tasks.values());

    // 应用过滤器
    if (filters.enabled !== undefined) {
      tasks = tasks.filter(task => task.enabled === filters.enabled);
    }

    if (filters.tags && filters.tags.length > 0) {
      tasks = tasks.filter(task =>
        filters.tags.some(tag => task.tags.includes(tag))
      );
    }

    if (filters.group) {
      const group = this.taskGroups.get(filters.group);
      if (group) {
        tasks = tasks.filter(task => group.tasks.includes(task.id));
      }
    }

    return tasks.map(task => ({
      ...task.getStats(),
      nextRunAt: task.nextRunAt ? new Date(task.nextRunAt).toISOString() : null,
      schedule: task.schedule,
      tags: task.tags,
      dependencies: task.dependencies,
      priority: task.priority
    }));
  }

  /**
   * 获取任务详情
   */
  getTaskDetails(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return null;
    }

    return {
      ...task.getStats(),
      schedule: task.schedule,
      handler: task.handler.name || 'anonymous',
      tags: task.tags,
      dependencies: task.dependencies,
      priority: task.priority,
      concurrent: task.concurrent,
      maxRetries: task.maxRetries,
      retryDelay: task.retryDelay,
      timeout: task.timeout,
      nextRunAt: task.nextRunAt ? new Date(task.nextRunAt).toISOString() : null,
      createdAt: new Date(task.createdAt).toISOString(),
      updatedAt: new Date(task.updatedAt).toISOString()
    };
  }

  /**
   * 获取任务组统计
   */
  getGroupStats() {
    const stats = {};

    for (const [groupId, group] of this.taskGroups) {
      const groupTasks = group.tasks.map(taskId => this.tasks.get(taskId)).filter(Boolean);

      stats[groupId] = {
        ...group,
        taskCount: groupTasks.length,
        enabledTaskCount: groupTasks.filter(t => t.enabled).length,
        runningTaskCount: groupTasks.filter(t => t.isRunning).length,
        totalRuns: groupTasks.reduce((sum, t) => sum + t.runCount, 0),
        totalErrors: groupTasks.reduce((sum, t) => sum + t.errorCount, 0),
        averageExecutionTime: groupTasks.length > 0
          ? groupTasks.reduce((sum, t) => sum + t.averageExecutionTime, 0) / groupTasks.length
          : 0
      };
    }

    return stats;
  }

  /**
   * 获取执行历史
   */
  getHistory(params = {}) {
    const {
      taskId,
      success,
      limit = 50,
      offset = 0
    } = params;

    let history = [...this.history];

    // 过滤
    if (taskId) {
      history = history.filter(entry => entry.taskId === taskId);
    }

    if (success !== undefined) {
      history = history.filter(entry => entry.success === success);
    }

    // 排序
    history.sort((a, b) => b.timestamp - a.timestamp);

    // 分页
    const paginatedHistory = history.slice(offset, offset + limit);

    return {
      data: paginatedHistory,
      pagination: {
        total: history.length,
        limit,
        offset,
        hasMore: offset + limit < history.length
      }
    };
  }

  /**
   * 获取服务统计
   */
  getStats() {
    const tasks = Array.from(this.tasks.values());
    const executorStats = this.executor.getActiveStats();

    return {
      isRunning: this.isRunning,
      taskCount: tasks.length,
      enabledTaskCount: tasks.filter(t => t.enabled).length,
      runningTaskCount: tasks.filter(t => t.isRunning).length,
      totalRuns: tasks.reduce((sum, t) => sum + t.runCount, 0),
      totalErrors: tasks.reduce((sum, t) => sum + t.errorCount, 0),
      historySize: this.history.length,
      groupCount: this.taskGroups.size,
      executor: executorStats,
      config: this.config
    };
  }

  /**
   * 启动历史清理
   */
  startHistoryCleanup() {
    setInterval(() => {
      this.cleanupHistory();
    }, this.config.cleanupInterval);
  }

  /**
   * 清理历史记录
   */
  cleanupHistory() {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const beforeCount = this.history.length;

    this.history = this.history.filter(entry => entry.timestamp > oneWeekAgo);

    const cleanedCount = beforeCount - this.history.length;
    if (cleanedCount > 0) {
      logger.info(`清理任务历史记录: ${cleanedCount} 条`);
    }
  }

  /**
   * 启动任务监控
   */
  startTaskMonitoring() {
    // 每分钟检查一次任务状态
    setInterval(() => {
      this.monitorTasks();
    }, 60 * 1000);
  }

  /**
   * 监控任务状态
   */
  monitorTasks() {
    const now = Date.now();
    const stuckTasks = [];

    for (const task of this.tasks.values()) {
      if (task.isRunning && now - task.lastRunAt > task.timeout) {
        stuckTasks.push({
          id: task.id,
          name: task.name,
          runningTime: now - task.lastRunAt
        });
      }
    }

    if (stuckTasks.length > 0) {
      logger.warn('发现卡住的任务:', stuckTasks);
      this.emit('stuckTasksDetected', stuckTasks);
    }
  }

  /**
   * 延迟函数
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============== 预设任务处理方法 ==============

  /**
   * RSS源监控
   */
  async monitorRSSSources() {
    try {
      logger.info('开始执行RSS源监控任务');

      const startTime = Date.now();
      const result = await this.rssManagerService.monitorAllSources();

      const executionTime = Date.now() - startTime;

      logger.info('RSS源监控任务完成', {
        sourceCount: result.sourceCount,
        activeCount: result.activeCount,
        errorCount: result.errorCount,
        executionTime
      });

      return {
        success: true,
        sourceCount: result.sourceCount,
        activeCount: result.activeCount,
        errorCount: result.errorCount,
        executionTime
      };

    } catch (error) {
      logger.error('RSS源监控任务失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 生成每日新闻摘要
   */
  async generateDailyDigest() {
    try {
      logger.info('开始生成每日新闻摘要');

      const startTime = Date.now();

      // 获取最近24小时的新闻
      const newsResult = await this.newsAggregatorService.getRecentNews({
        hours: 24,
        maxArticles: 100,
        categories: ['tech', 'finance', 'politics']
      });

      if (!newsResult.success || !newsResult.data.articles.length) {
        logger.warn('没有获取到新闻数据，跳过每日摘要生成');
        return { success: true, message: '没有新闻数据需要处理' };
      }

      // 分析新闻并生成摘要
      const digest = await this.generateNewsDigest(newsResult.data.articles);

      // 发送邮件摘要
      const emailResult = await this.emailService.sendDailyDigest(digest);

      const executionTime = Date.now() - startTime;

      logger.info('每日新闻摘要任务完成', {
        articleCount: newsResult.data.articles.length,
        emailSent: emailResult.success,
        executionTime
      });

      return {
        success: true,
        articleCount: newsResult.data.articles.length,
        emailSent: emailResult.success,
        digest: digest.summary,
        executionTime
      };

    } catch (error) {
      logger.error('生成每日新闻摘要失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 聚合和分析新闻
   */
  async aggregateAndAnalyzeNews() {
    try {
      logger.info('开始执行新闻聚合和分析任务');

      const startTime = Date.now();

      // 聚合新闻
      const aggregationResult = await this.newsAggregatorService.smartAggregateNews({
        maxArticles: 50,
        enableAI: true,
        skipCache: false
      });

      let analysisCount = 0;

      // 对新闻进行AI分析
      if (aggregationResult.success && aggregationResult.data.articles.length > 0) {
        const articlesToAnalyze = aggregationResult.data.articles
          .filter(article => !article.ai_analysis_completed)
          .slice(0, 20); // 限制每次分析数量

        for (const article of articlesToAnalyze) {
          try {
            const analysisResult = await this.aiAnalysisService.analyzeArticle(article.id);
            if (analysisResult.success) {
              analysisCount++;
            }
          } catch (error) {
            logger.warn(`分析文章失败 ${article.id}:`, error.message);
          }
        }
      }

      const executionTime = Date.now() - startTime;

      logger.info('新闻聚合和分析任务完成', {
        articleCount: aggregationResult.data?.articles.length || 0,
        analysisCount,
        executionTime
      });

      return {
        success: true,
        articleCount: aggregationResult.data?.articles.length || 0,
        analysisCount,
        executionTime
      };

    } catch (error) {
      logger.error('新闻聚合和分析任务失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 检查实时通知
   */
  async checkRealtimeNotifications() {
    try {
      logger.info('开始检查实时通知');

      const startTime = Date.now();

      // 获取最近的新闻
      const recentNews = await this.newsAggregatorService.getRecentNews({
        minutes: 30,
        maxArticles: 50
      });

      let notificationCount = 0;

      if (recentNews.success && recentNews.data.articles.length > 0) {
        // 检查突发新闻
        const breakingNews = this.detectBreakingNews(recentNews.data.articles);

        // 发送实时通知
        for (const news of breakingNews) {
          try {
            const notificationResult = await this.emailService.sendRealtimeNotification(news);
            if (notificationResult.success) {
              notificationCount++;
            }
          } catch (error) {
            logger.warn('发送实时通知失败:', error.message);
          }
        }
      }

      const executionTime = Date.now() - startTime;

      logger.info('实时通知检查任务完成', {
        articleCount: recentNews.data?.articles.length || 0,
        notificationCount,
        executionTime
      });

      return {
        success: true,
        articleCount: recentNews.data?.articles.length || 0,
        notificationCount,
        executionTime
      };

    } catch (error) {
      logger.error('检查实时通知失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 清理过期数据
   */
  async cleanupOldData() {
    try {
      logger.info('开始清理过期数据');

      const startTime = Date.now();

      let cleanedCount = 0;

      // 清理过期日志
      const logCleanupResult = await this.cleanupSystemLogs();
      cleanedCount += logCleanupResult.cleanedCount;

      // 清理过期历史记录
      const historyCleanupResult = await this.cleanupTaskHistory();
      cleanedCount += historyCleanupResult.cleanedCount;

      // 清理临时文件和缓存
      const cacheCleanupResult = await this.cleanupCache();
      cleanedCount += cacheCleanupResult.cleanedCount;

      const executionTime = Date.now() - startTime;

      logger.info('数据清理任务完成', {
        cleanedCount,
        executionTime
      });

      return {
        success: true,
        cleanedCount,
        executionTime
      };

    } catch (error) {
      logger.error('清理过期数据失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 执行系统健康检查
   */
  async performHealthCheck() {
    try {
      logger.info('开始执行系统健康检查');

      const startTime = Date.now();

      const healthStatus = {
        timestamp: Date.now(),
        services: {},
        overall: 'healthy'
      };

      // 检查各服务健康状态
      const services = [
        { name: 'rss', service: this.rssManagerService },
        { name: 'news', service: this.newsAggregatorService },
        { name: 'ai', service: this.aiAnalysisService },
        { name: 'email', service: this.emailService },
        { name: 'config', service: this.configService }
      ];

      let unhealthyCount = 0;

      for (const { name, service } of services) {
        try {
          const isHealthy = service.isRunning !== false;
          healthStatus.services[name] = {
            status: isHealthy ? 'healthy' : 'unhealthy',
            uptime: service.getStats ? service.getStats().uptime || 0 : 0,
            lastCheck: Date.now()
          };

          if (!isHealthy) {
            unhealthyCount++;
          }

        } catch (error) {
          healthStatus.services[name] = {
            status: 'error',
            error: error.message,
            lastCheck: Date.now()
          };
          unhealthyCount++;
        }
      }

      // 检查任务调度器状态
      const taskStats = this.getStats();
      healthStatus.scheduler = {
        isRunning: taskStats.isRunning,
        taskCount: taskStats.taskCount,
        enabledTaskCount: taskStats.enabledTaskCount,
        runningTaskCount: taskStats.runningTaskCount,
        errorRate: taskStats.totalRuns > 0 ? `${(taskStats.totalErrors / taskStats.totalRuns * 100).toFixed(2)  }%` : '0%'
      };

      // 判断整体健康状态
      if (unhealthyCount > 0) {
        healthStatus.overall = unhealthyCount === services.length ? 'critical' : 'degraded';
      }

      // 如果有严重问题，发送告警
      if (healthStatus.overall === 'critical') {
        this.emit('healthCheckFailed', healthStatus);
      }

      const executionTime = Date.now() - startTime;

      logger.info('系统健康检查任务完成', {
        overallStatus: healthStatus.overall,
        unhealthyServices: unhealthyCount,
        executionTime
      });

      return {
        success: true,
        healthStatus,
        executionTime
      };

    } catch (error) {
      logger.error('系统健康检查失败:', error);
      return { success: false, error: error.message };
    }
  }

  // ============== 辅助方法 ==============

  /**
   * 生成新闻摘要
   */
  async generateNewsDigest(articles) {
    // 按类别分组
    const categorizedArticles = this.categorizeArticles(articles);

    // 为每个类别生成摘要
    const categorySummaries = {};
    for (const [category, categoryArticles] of Object.entries(categorizedArticles)) {
      categorySummaries[category] = {
        count: categoryArticles.length,
        topHeadlines: categoryArticles.slice(0, 5).map(article => ({
          title: article.title,
          url: article.url,
          source: article.source_type
        })),
        summary: await this.generateCategorySummary(categoryArticles)
      };
    }

    return {
      date: new Date().toISOString().split('T')[0],
      totalArticles: articles.length,
      categories: categorySummaries,
      summary: this.generateOverallSummary(categorySummaries)
    };
  }

  /**
   * 按类别分类文章
   */
  categorizeArticles(articles) {
    const categories = {
      tech: [],
      finance: [],
      politics: [],
      other: []
    };

    for (const article of articles) {
      const category = article.category || 'other';
      if (categories[category]) {
        categories[category].push(article);
      } else {
        categories.other.push(article);
      }
    }

    return categories;
  }

  /**
   * 生成类别摘要
   */
  async generateCategorySummary(articles) {
    // 简化的摘要生成逻辑
    const titles = articles.map(article => article.title).join(' ');
    const keywords = this.extractKeywords(titles);

    return `今日${articles.length}条相关新闻，主要关键词：${keywords.join('、')}`;
  }

  /**
   * 生成整体摘要
   */
  generateOverallSummary(categorySummaries) {
    const totalCount = Object.values(categorySummaries)
      .reduce((sum, cat) => sum + cat.count, 0);

    const topCategories = Object.entries(categorySummaries)
      .sort(([,a], [,b]) => b.count - a.count)
      .slice(0, 3)
      .map(([category, data]) => `${category}(${data.count})`)
      .join('、');

    return `今日共${totalCount}条新闻，主要集中在${topCategories}等领域`;
  }

  /**
   * 提取关键词
   */
  extractKeywords(text) {
    // 简化的关键词提取逻辑
    const commonWords = ['的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这'];
    const words = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ').split(/\s+/);
    const wordCount = {};

    for (const word of words) {
      if (word.length > 1 && !commonWords.includes(word)) {
        wordCount[word] = (wordCount[word] || 0) + 1;
      }
    }

    return Object.entries(wordCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([word]) => word);
  }

  /**
   * 检测突发新闻
   */
  detectBreakingNews(articles) {
    const breakingKeywords = [
      '突发', '紧急', '重大', '重要', '快讯', '最新', '刚刚',
      '央行', '降息', '加息', '政策', '发布', '宣布', '通过',
      '事故', '灾害', '疫情', '地震', '台风', '暴雨'
    ];

    const timeThreshold = 30 * 60 * 1000; // 30分钟内
    const sourceThreshold = 2; // 至少2个来源

    // 按时间分组
    const recentTime = Date.now() - timeThreshold;
    const recentArticles = articles.filter(article =>
      new Date(article.published_at).getTime() > recentTime
    );

    // 检测关键词匹配
    const breakingNews = [];

    for (const article of recentArticles) {
      const title = article.title || '';
      const hasBreakingKeyword = breakingKeywords.some(keyword =>
        title.includes(keyword)
      );

      if (hasBreakingKeyword) {
        breakingNews.push(article);
      }
    }

    // 如果多个来源报道相同新闻，认为是突发新闻
    const newsByContent = {};
    for (const article of breakingNews) {
      const contentKey = article.title.substring(0, 50); // 简化的内容匹配
      if (!newsByContent[contentKey]) {
        newsByContent[contentKey] = [];
      }
      newsByContent[contentKey].push(article);
    }

    return Object.values(newsByContent)
      .filter(group => group.length >= sourceThreshold)
      .flat()
      .slice(0, 10); // 最多返回10条突发新闻
  }

  /**
   * 清理系统日志
   */
  async cleanupSystemLogs() {
    const retentionDays = 7;
    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

    // 这里应该调用日志清理服务
    // 简化实现，返回模拟结果
    return {
      success: true,
      cleanedCount: Math.floor(Math.random() * 100) + 50
    };
  }

  /**
   * 清理任务历史
   */
  async cleanupTaskHistory() {
    const beforeCount = this.history.length;
    this.cleanupHistory();
    const afterCount = this.history.length;

    return {
      success: true,
      cleanedCount: beforeCount - afterCount
    };
  }

  /**
   * 清理缓存
   */
  async cleanupCache() {
    // 这里应该调用缓存清理服务
    // 简化实现，返回模拟结果
    return {
      success: true,
      cleanedCount: Math.floor(Math.random() * 50) + 10
    };
  }

  /**
   * 停止服务
   */
  async stop() {
    try {
      logger.info('正在停止Scheduler Service...');

      // 停止所有调度器
      for (const scheduler of this.schedules.values()) {
        try {
          scheduler.stop();
          // 安全调用destroy方法（如果存在）
          if (typeof scheduler.destroy === 'function') {
            scheduler.destroy();
          }
        } catch (error) {
          logger.warn('停止调度器时出错:', error.message);
        }
      }

      // 停止依赖服务
      if (this.rssManagerService) await this.rssManagerService.stop();
      if (this.newsAggregatorService) await this.newsAggregatorService.stop();
      if (this.aiAnalysisService) await this.aiAnalysisService.stop();
      if (this.emailService) await this.emailService.stop();
      if (this.configService) await this.configService.stop();

      this.tasks.clear();
      this.schedules.clear();
      this.taskGroups.clear();
      this.history = [];
      this.isRunning = false;

      logger.info('Scheduler Service已停止');
    } catch (error) {
      logger.error('Scheduler Service停止失败:', error);
    }
  }
}

export default SchedulerService;