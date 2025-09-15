/**
 * Cleanup服务模块 - 数据清理和维护
 * 遵循Node.js最佳实践：模块化、错误处理、日志记录
 */

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import logger from '../../utils/logger.js';
import { validateUUID } from '../../utils/validators.js';
import { CircuitBreaker } from '../../utils/circuit-breaker.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Cleanup服务配置
const CLEANUP_CONFIG = {
  batchSizes: {
    expiredSessions: 1000,
    failedJobs: 500,
    oldLogs: 2000,
    orphanedData: 100,
    tempFiles: 500
  },
  retentionPeriods: {
    sessions: 30, // 30天
    failedJobs: 7, // 7天
    logs: 90, // 90天
    analytics: 365, // 1年
    tempFiles: 1 // 1天
  },
  thresholds: {
    storageUsage: 80, // 80%
    databaseSize: 10000000000, // 10GB
    cleanupFrequency: 24 // 24小时
  },
  schedules: {
    sessionCleanup: {
      cron: '0 2 * * *', // 每天2点
      description: '清理过期会话'
    },
    failedJobCleanup: {
      cron: '0 3 * * *', // 每天3点
      description: '清理失败任务'
    },
    logCleanup: {
      cron: '0 4 * * 0', // 每周日4点
      description: '清理旧日志'
    },
    storageOptimization: {
      cron: '0 5 * * 0', // 每周日5点
      description: '存储优化'
    },
    integrityCheck: {
      cron: '0 6 * * 0', // 每周日6点
      description: '数据完整性检查'
    }
  }
};

// 清理操作类型
const CLEANUP_TYPES = {
  SESSION_CLEANUP: 'session_cleanup',
  FAILED_JOB_CLEANUP: 'failed_job_cleanup',
  LOG_CLEANUP: 'log_cleanup',
  STORAGE_OPTIMIZATION: 'storage_optimization',
  INTEGRITY_CHECK: 'integrity_check',
  ORPHANED_DATA_CLEANUP: 'orphaned_data_cleanup',
  TEMP_FILE_CLEANUP: 'temp_file_cleanup',
  INDEX_OPTIMIZATION: 'index_optimization'
};

/**
 * Cleanup服务类
 */
class CleanupService {
  constructor() {
    this.config = CLEANUP_CONFIG;
    this.circuitBreaker = new CircuitBreaker({
      timeout: 300000,
      errorThresholdPercentage: 50,
      resetTimeout: 60000
    });
    this.cleanupHistory = [];
    this.isRunning = false;
    this.activeTasks = new Map();
  }

  /**
   * 启动清理服务
   */
  async start() {
    try {
      logger.info('正在启动清理服务...');

      if (this.isRunning) {
        logger.warn('清理服务已经在运行中');
        return { success: true };
      }

      // 执行初始健康检查
      await this.performHealthCheck();

      this.isRunning = true;

      logger.info('清理服务启动成功');

      return { success: true };

    } catch (error) {
      logger.error('清理服务启动失败', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * 停止清理服务
   */
  async stop() {
    try {
      logger.info('正在停止清理服务...');

      if (!this.isRunning) {
        logger.warn('清理服务未在运行');
        return { success: true };
      }

      // 等待活跃任务完成
      await this.waitForActiveTasks();

      this.isRunning = false;

      logger.info('清理服务已停止');

      return { success: true };

    } catch (error) {
      logger.error('清理服务停止失败', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * 执行健康检查
   */
  async performHealthCheck() {
    try {
      logger.info('执行清理服务健康检查...');

      const health = {
        database: await this.checkDatabaseHealth(),
        storage: await this.checkStorageHealth(),
        performance: await this.checkPerformanceHealth(),
        cleanup: await this.checkCleanupHealth()
      };

      logger.info('清理服务健康检查完成', { health });

      return { success: true, health };

    } catch (error) {
      logger.error('健康检查失败', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * 清理过期会话
   */
  async cleanupExpiredSessions() {
    const taskId = uuidv4();
    try {
      logger.info('开始清理过期会话', { taskId });

      this.activeTasks.set(taskId, { type: CLEANUP_TYPES.SESSION_CLEANUP, startTime: Date.now() });

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - CLEANUP_CONFIG.retentionPeriods.sessions);

      // 使用断路器保护
      const result = await this.circuitBreaker.execute(async () => {
        const { data, error, count } = await supabase
          .from('user_sessions')
          .delete()
          .lt('last_activity', cutoffDate.toISOString())
          .select('*');

        if (error) throw error;

        return { deletedCount: count || 0 };
      });

      logger.info('过期会话清理完成', {
        taskId,
        deletedCount: result.deletedCount,
        duration: Date.now() - this.activeTasks.get(taskId).startTime
      });

      this.recordCleanup({
        type: CLEANUP_TYPES.SESSION_CLEANUP,
        deletedCount: result.deletedCount,
        duration: Date.now() - this.activeTasks.get(taskId).startTime,
        success: true
      });

      return {
        success: true,
        deletedCount: result.deletedCount,
        taskId
      };

    } catch (error) {
      logger.error('清理过期会话失败', { taskId, error: error.message });

      this.recordCleanup({
        type: CLEANUP_TYPES.SESSION_CLEANUP,
        error: error.message,
        success: false
      });

      return {
        success: false,
        error: error.message,
        taskId
      };
    } finally {
      this.activeTasks.delete(taskId);
    }
  }

  /**
   * 清理失败任务
   */
  async cleanupFailedJobs() {
    const taskId = uuidv4();
    try {
      logger.info('开始清理失败任务', { taskId });

      this.activeTasks.set(taskId, { type: CLEANUP_TYPES.FAILED_JOB_CLEANUP, startTime: Date.now() });

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - CLEANUP_CONFIG.retentionPeriods.failedJobs);

      const result = await this.circuitBreaker.execute(async () => {
        const { data, error, count } = await supabase
          .from('scheduled_jobs')
          .delete()
          .eq('status', 'failed')
          .lt('created_at', cutoffDate.toISOString())
          .select('*');

        if (error) throw error;

        return { deletedCount: count || 0 };
      });

      logger.info('失败任务清理完成', {
        taskId,
        deletedCount: result.deletedCount,
        duration: Date.now() - this.activeTasks.get(taskId).startTime
      });

      this.recordCleanup({
        type: CLEANUP_TYPES.FAILED_JOB_CLEANUP,
        deletedCount: result.deletedCount,
        duration: Date.now() - this.activeTasks.get(taskId).startTime,
        success: true
      });

      return {
        success: true,
        deletedCount: result.deletedCount,
        taskId
      };

    } catch (error) {
      logger.error('清理失败任务失败', { taskId, error: error.message });

      this.recordCleanup({
        type: CLEANUP_TYPES.FAILED_JOB_CLEANUP,
        error: error.message,
        success: false
      });

      return {
        success: false,
        error: error.message,
        taskId
      };
    } finally {
      this.activeTasks.delete(taskId);
    }
  }

  /**
   * 清理旧日志
   */
  async cleanupOldLogs() {
    const taskId = uuidv4();
    try {
      logger.info('开始清理旧日志', { taskId });

      this.activeTasks.set(taskId, { type: CLEANUP_TYPES.LOG_CLEANUP, startTime: Date.now() });

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - CLEANUP_CONFIG.retentionPeriods.logs);

      // 清理不同类型的日志
      const results = await Promise.allSettled([
        this.cleanupTableLogs('webhook_logs', cutoffDate),
        this.cleanupTableLogs('email_logs', cutoffDate),
        this.cleanupTableLogs('api_logs', cutoffDate),
        this.cleanupTableLogs('error_logs', cutoffDate)
      ]);

      const totalDeleted = results
        .filter(r => r.status === 'fulfilled')
        .reduce((sum, r) => sum + (r.value.deletedCount || 0), 0);

      logger.info('旧日志清理完成', {
        taskId,
        totalDeleted,
        duration: Date.now() - this.activeTasks.get(taskId).startTime
      });

      this.recordCleanup({
        type: CLEANUP_TYPES.LOG_CLEANUP,
        deletedCount: totalDeleted,
        duration: Date.now() - this.activeTasks.get(taskId).startTime,
        success: true
      });

      return {
        success: true,
        deletedCount: totalDeleted,
        taskId
      };

    } catch (error) {
      logger.error('清理旧日志失败', { taskId, error: error.message });

      this.recordCleanup({
        type: CLEANUP_TYPES.LOG_CLEANUP,
        error: error.message,
        success: false
      });

      return {
        success: false,
        error: error.message,
        taskId
      };
    } finally {
      this.activeTasks.delete(taskId);
    }
  }

  /**
   * 清理指定表的日志
   */
  async cleanupTableLogs(tableName, cutoffDate) {
    try {
      const { data, error, count } = await supabase
        .from(tableName)
        .delete()
        .lt('created_at', cutoffDate.toISOString())
        .select('*');

      if (error) throw error;

      return { deletedCount: count || 0 };

    } catch (error) {
      logger.error(`清理表 ${tableName} 日志失败`, { error: error.message });
      return { deletedCount: 0 };
    }
  }

  /**
   * 存储优化
   */
  async optimizeStorage() {
    const taskId = uuidv4();
    try {
      logger.info('开始存储优化', { taskId });

      this.activeTasks.set(taskId, { type: CLEANUP_TYPES.STORAGE_OPTIMIZATION, startTime: Date.now() });

      const optimizations = [];

      // 优化数据库表
      optimizations.push(this.optimizeDatabaseTables());

      // 清理临时文件
      optimizations.push(this.cleanupTempFiles());

      // 压缩旧数据
      optimizations.push(this.compressOldData());

      const results = await Promise.allSettled(optimizations);

      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const totalCount = results.length;

      logger.info('存储优化完成', {
        taskId,
        successCount,
        totalCount,
        duration: Date.now() - this.activeTasks.get(taskId).startTime
      });

      this.recordCleanup({
        type: CLEANUP_TYPES.STORAGE_OPTIMIZATION,
        successCount,
        totalCount,
        duration: Date.now() - this.activeTasks.get(taskId).startTime,
        success: true
      });

      return {
        success: true,
        successCount,
        totalCount,
        taskId
      };

    } catch (error) {
      logger.error('存储优化失败', { taskId, error: error.message });

      this.recordCleanup({
        type: CLEANUP_TYPES.STORAGE_OPTIMIZATION,
        error: error.message,
        success: false
      });

      return {
        success: false,
        error: error.message,
        taskId
      };
    } finally {
      this.activeTasks.delete(taskId);
    }
  }

  /**
   * 优化数据库表
   */
  async optimizeDatabaseTables() {
    try {
      const tables = ['articles', 'rss_sources', 'user_sessions', 'scheduled_jobs'];
      const results = [];

      for (const table of tables) {
        try {
          // 执行VACUUM分析
          const { error } = await supabase.rpc('vacuum_table', { table_name: table });

          if (error) throw error;

          results.push({ table, success: true });
        } catch (error) {
          results.push({ table, success: false, error: error.message });
        }
      }

      return results;

    } catch (error) {
      logger.error('优化数据库表失败', { error: error.message });
      return [];
    }
  }

  /**
   * 清理临时文件
   */
  async cleanupTempFiles() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - CLEANUP_CONFIG.retentionPeriods.tempFiles);

      // 这里应该连接到文件存储服务进行清理
      // 由于我们使用Supabase，这里模拟清理过程

      logger.info('清理临时文件', { cutoffDate: cutoffDate.toISOString() });

      return { success: true, cleanedFiles: 0 };

    } catch (error) {
      logger.error('清理临时文件失败', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * 压缩旧数据
   */
  async compressOldData() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);

      // 这里应该实现数据归档逻辑
      // 由于是示例，我们记录操作

      logger.info('压缩旧数据', { cutoffDate: cutoffDate.toISOString() });

      return { success: true, archivedRecords: 0 };

    } catch (error) {
      logger.error('压缩旧数据失败', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * 数据完整性检查
   */
  async performIntegrityCheck() {
    const taskId = uuidv4();
    try {
      logger.info('开始数据完整性检查', { taskId });

      this.activeTasks.set(taskId, { type: CLEANUP_TYPES.INTEGRITY_CHECK, startTime: Date.now() });

      const checks = [
        this.checkArticleIntegrity(),
        this.checkSourceIntegrity(),
        this.checkUserIntegrity()
      ];

      const results = await Promise.allSettled(checks);

      const integrityIssues = results
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value.issues || []);

      logger.info('数据完整性检查完成', {
        taskId,
        issuesFound: integrityIssues.length,
        duration: Date.now() - this.activeTasks.get(taskId).startTime
      });

      this.recordCleanup({
        type: CLEANUP_TYPES.INTEGRITY_CHECK,
        issuesFound: integrityIssues.length,
        duration: Date.now() - this.activeTasks.get(taskId).startTime,
        success: true
      });

      return {
        success: true,
        issuesFound: integrityIssues.length,
        issues: integrityIssues,
        taskId
      };

    } catch (error) {
      logger.error('数据完整性检查失败', { taskId, error: error.message });

      this.recordCleanup({
        type: CLEANUP_TYPES.INTEGRITY_CHECK,
        error: error.message,
        success: false
      });

      return {
        success: false,
        error: error.message,
        taskId
      };
    } finally {
      this.activeTasks.delete(taskId);
    }
  }

  /**
   * 检查文章完整性
   */
  async checkArticleIntegrity() {
    try {
      const { error } = await supabase.rpc('check_article_integrity');

      if (error) throw error;

      return { issues: data || [] };

    } catch (error) {
      logger.error('检查文章完整性失败', { error: error.message });
      return { issues: [] };
    }
  }

  /**
   * 检查源完整性
   */
  async checkSourceIntegrity() {
    try {
      const { error } = await supabase.rpc('check_source_integrity');

      if (error) throw error;

      return { issues: data || [] };

    } catch (error) {
      logger.error('检查源完整性失败', { error: error.message });
      return { issues: [] };
    }
  }

  /**
   * 检查用户完整性
   */
  async checkUserIntegrity() {
    try {
      const { error } = await supabase.rpc('check_user_integrity');

      if (error) throw error;

      return { issues: data || [] };

    } catch (error) {
      logger.error('检查用户完整性失败', { error: error.message });
      return { issues: [] };
    }
  }

  /**
   * 获取清理统计信息
   */
  async getStatistics() {
    try {
      const [
        totalCleanups,
        recentCleanups,
        failedCleanups,
        avgCleanupTime,
        storageStats
      ] = await Promise.all([
        this.getTotalCleanups(),
        this.getRecentCleanups(),
        this.getFailedCleanups(),
        this.getAverageCleanupTime(),
        this.getStorageStatistics()
      ]);

      return {
        totalCleanups,
        recentCleanups: recentCleanups || 0,
        failedCleanups: failedCleanups || 0,
        avgCleanupTime: avgCleanupTime || 0,
        storageStats,
        activeTasks: this.activeTasks.size,
        isRunning: this.isRunning
      };

    } catch (error) {
      logger.error('获取清理统计失败', { error: error.message });
      return {
        totalCleanups: 0,
        recentCleanups: 0,
        failedCleanups: 0,
        avgCleanupTime: 0,
        storageStats: null,
        activeTasks: this.activeTasks.size,
        isRunning: this.isRunning
      };
    }
  }

  /**
   * 获取总清理次数
   */
  async getTotalCleanups() {
    try {
      const { count, error } = await supabase
        .from('cleanup_history')
        .select('*', { count: 'exact', head: true });

      if (error) throw error;

      return count || 0;

    } catch (error) {
      logger.error('获取总清理次数失败', { error: error.message });
      return 0;
    }
  }

  /**
   * 获取最近清理次数
   */
  async getRecentCleanups() {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const { count, error } = await supabase
        .from('cleanup_history')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', yesterday.toISOString());

      if (error) throw error;

      return count || 0;

    } catch (error) {
      logger.error('获取最近清理次数失败', { error: error.message });
      return 0;
    }
  }

  /**
   * 获取失败清理次数
   */
  async getFailedCleanups() {
    try {
      const { count, error } = await supabase
        .from('cleanup_history')
        .select('*', { count: 'exact', head: true })
        .eq('success', false);

      if (error) throw error;

      return count || 0;

    } catch (error) {
      logger.error('获取失败清理次数失败', { error: error.message });
      return 0;
    }
  }

  /**
   * 获取平均清理时间
   */
  async getAverageCleanupTime() {
    try {
      const { error } = await supabase
        .from('cleanup_history')
        .select('duration')
        .eq('success', true)
        .limit(1000);

      if (error) throw error;

      if (data.length === 0) return 0;

      const totalTime = data.reduce((sum, item) => sum + (item.duration || 0), 0);
      return Math.round(totalTime / data.length);

    } catch (error) {
      logger.error('获取平均清理时间失败', { error: error.message });
      return 0;
    }
  }

  /**
   * 获取存储统计
   */
  async getStorageStatistics() {
    try {
      const { error } = await supabase.rpc('get_storage_statistics');

      if (error) throw error;

      return data;

    } catch (error) {
      logger.error('获取存储统计失败', { error: error.message });
      return null;
    }
  }

  /**
   * 检查数据库健康
   */
  async checkDatabaseHealth() {
    try {
      const { error } = await supabase.rpc('check_database_health');

      if (error) throw error;

      return {
        status: 'healthy',
        ...data
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  /**
   * 检查存储健康
   */
  async checkStorageHealth() {
    try {
      const { error } = await supabase.rpc('check_storage_usage');

      if (error) throw error;

      const usagePercentage = (data.used / data.total) * 100;
      const status = usagePercentage > CLEANUP_CONFIG.thresholds.storageUsage ? 'warning' : 'healthy';

      return {
        status,
        usagePercentage,
        ...data
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  /**
   * 检查性能健康
   */
  async checkPerformanceHealth() {
    try {
      const { error } = await supabase.rpc('monitor_database_performance');

      if (error) throw error;

      return {
        status: 'healthy',
        ...data
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  /**
   * 检查清理健康
   */
  async checkCleanupHealth() {
    try {
      const recentCleanups = await this.getRecentCleanups();
      const failedCleanups = await this.getFailedCleanups();

      const status = recentCleanups === 0 ? 'warning' : 'healthy';

      return {
        status,
        recentCleanups,
        failedCleanups
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  /**
   * 记录清理操作
   */
  async recordCleanup(cleanupData) {
    try {
      const { error } = await supabase
        .from('cleanup_history')
        .insert([{
          id: uuidv4(),
          type: cleanupData.type,
          deleted_count: cleanupData.deletedCount || 0,
          issues_found: cleanupData.issuesFound || 0,
          duration: cleanupData.duration || 0,
          success: cleanupData.success,
          error_message: cleanupData.error,
          metadata: cleanupData.metadata || {},
          created_at: new Date().toISOString()
        }]);

      if (error) {
        logger.error('记录清理操作失败', { error: error.message });
      }

    } catch (error) {
      logger.error('记录清理操作失败', { error: error.message });
    }
  }

  /**
   * 等待活跃任务完成
   */
  async waitForActiveTasks() {
    const maxWaitTime = 300000; // 最多等待5分钟
    const startTime = Date.now();

    while (this.activeTasks.size > 0 && Date.now() - startTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (this.activeTasks.size > 0) {
      logger.warn(`仍有 ${this.activeTasks.size} 个活跃任务`);
    }
  }

  /**
   * 获取活跃任务状态
   */
  getActiveTasks() {
    return Array.from(this.activeTasks.entries()).map(([id, task]) => ({
      id,
      ...task,
      duration: Date.now() - task.startTime
    }));
  }

  /**
   * 取消活跃任务
   */
  cancelActiveTask(taskId) {
    if (this.activeTasks.has(taskId)) {
      this.activeTasks.delete(taskId);
      logger.info(`已取消活跃任务: ${taskId}`);
      return true;
    }
    return false;
  }

  /**
   * 执行完整清理
   */
  async performFullCleanup() {
    try {
      logger.info('开始执行完整清理...');

      const cleanupTasks = [
        this.cleanupExpiredSessions(),
        this.cleanupFailedJobs(),
        this.cleanupOldLogs(),
        this.optimizeStorage(),
        this.performIntegrityCheck()
      ];

      const results = await Promise.allSettled(cleanupTasks);

      const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const totalCount = results.length;

      logger.info('完整清理完成', {
        successCount,
        totalCount,
        duration: Date.now() - startTime
      });

      return {
        success: true,
        successCount,
        totalCount,
        results
      };

    } catch (error) {
      logger.error('完整清理失败', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// 导出服务实例和常量
export const cleanupService = new CleanupService();
export { CLEANUP_TYPES };
export default CleanupService;