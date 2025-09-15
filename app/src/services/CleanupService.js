/**
 * Cleanup Service - 清理服务
 * 提供系统清理、缓存管理、数据维护等功能
 * 遵循Node.js最佳实践：安全性、错误处理、性能优化
 */

import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import logger from '../utils/logger.js';
import dbClient from '../database/client.js';
import { ServiceError, APIResponse } from '../types/index.js';

/**
 * Cleanup Service类
 */
class CleanupService extends EventEmitter {
  constructor(config = {}) {
    super();

    this.isRunning = false;
    this.cleanupStats = {
      totalCleanups: 0,
      filesCleaned: 0,
      recordsCleaned: 0,
      cacheCleared: 0,
      errors: 0
    };

    // 清理配置
    this.cleanupConfig = {
      // 日志清理配置
      logs: {
        enabled: config.logsEnabled !== false,
        maxAge: config.logMaxAge || 7 * 24 * 60 * 60 * 1000, // 7天
        maxSize: config.logMaxSize || 100 * 1024 * 1024, // 100MB
        patterns: config.logPatterns || ['logs/*.log', '*.log']
      },

      // 缓存清理配置
      cache: {
        enabled: config.cacheEnabled !== false,
        maxAge: config.cacheMaxAge || 24 * 60 * 60 * 1000, // 24小时
        maxSize: config.cacheMaxSize || 500 * 1024 * 1024, // 500MB
        directories: config.cacheDirectories || ['cache', 'temp']
      },

      // 数据库清理配置
      database: {
        enabled: config.databaseEnabled !== false,
        expiredSessions: {
          enabled: config.expiredSessionsEnabled !== false,
          maxAge: config.expiredSessionsMaxAge || 30 * 24 * 60 * 60 * 1000 // 30天
        },
        failedTasks: {
          enabled: config.failedTasksEnabled !== false,
          maxAge: config.failedTasksMaxAge || 7 * 24 * 60 * 60 * 1000 // 7天
        },
        oldArticles: {
          enabled: config.oldArticlesEnabled !== false,
          maxAge: config.oldArticlesMaxAge || 90 * 24 * 60 * 60 * 1000, // 90天
          keepCount: config.oldArticlesKeepCount || 10000 // 保留最新10000条
        },
        auditLogs: {
          enabled: config.auditLogsEnabled !== false,
          maxAge: config.auditLogsMaxAge || 30 * 24 * 60 * 60 * 1000 // 30天
        }
      },

      // 临时文件清理配置
      tempFiles: {
        enabled: config.tempFilesEnabled !== false,
        maxAge: config.tempFilesMaxAge || 24 * 60 * 60 * 1000, // 24小时
        patterns: config.tempFilePatterns || ['temp/**/*', 'tmp/**/*', '*.tmp']
      },

      // 调度配置
      schedule: {
        enabled: config.scheduleEnabled !== false,
        interval: config.scheduleInterval || '0 2 * * *', // 每天凌晨2点
        timezone: config.scheduleTimezone || 'Asia/Shanghai'
      },

      // 通知配置
      notifications: {
        enabled: config.notificationsEnabled !== false,
        emailOnError: config.emailOnError !== false,
        webhookUrl: config.webhookUrl,
        threshold: config.notificationThreshold || 10 // 错误阈值
      }
    };

    // 清理规则
    this.cleanupRules = new Map();
    this.initializeCleanupRules();
  }

  /**
   * 初始化清理规则
   */
  initializeCleanupRules() {
    // 日志清理规则
    this.cleanupRules.set('logs', {
      name: '日志文件清理',
      description: '清理过期的日志文件',
      priority: 'low',
      execute: () => this.cleanupLogs(),
      schedule: this.cleanupConfig.schedule.interval
    });

    // 缓存清理规则
    this.cleanupRules.set('cache', {
      name: '缓存清理',
      description: '清理过期的缓存数据',
      priority: 'medium',
      execute: () => this.cleanupCache(),
      schedule: this.cleanupConfig.schedule.interval
    });

    // 数据库清理规则
    this.cleanupRules.set('database', {
      name: '数据库清理',
      description: '清理数据库中的过期数据',
      priority: 'high',
      execute: () => this.cleanupDatabase(),
      schedule: this.cleanupConfig.schedule.interval
    });

    // 临时文件清理规则
    this.cleanupRules.set('tempFiles', {
      name: '临时文件清理',
      description: '清理系统临时文件',
      priority: 'medium',
      execute: () => this.cleanupTempFiles(),
      schedule: this.cleanupConfig.schedule.interval
    });

    // 系统优化规则
    this.cleanupRules.set('optimization', {
      name: '系统优化',
      description: '执行系统优化任务',
      priority: 'low',
      execute: () => this.optimizeSystem(),
      schedule: '0 3 * * 0' // 每周日凌晨3点
    });
  }

  /**
   * 初始化Cleanup Service
   */
  async initialize() {
    try {
      logger.info('正在初始化Cleanup Service...');

      // 验证配置
      this.validateConfig();

      // 创建必要的目录
      await this.createRequiredDirectories();

      // 注册清理任务
      if (this.cleanupConfig.schedule.enabled) {
        await this.registerCleanupTasks();
      }

      this.isRunning = true;
      logger.info('Cleanup Service初始化成功');
      return true;

    } catch (error) {
      logger.error('Cleanup Service初始化失败:', error);
      throw error;
    }
  }

  /**
   * 验证配置
   */
  validateConfig() {
    // 验证时间配置
    if (this.cleanupConfig.logs.maxAge <= 0) {
      throw new ServiceError('日志最大年龄必须大于0', 'INVALID_LOG_MAX_AGE');
    }

    if (this.cleanupConfig.cache.maxAge <= 0) {
      throw new ServiceError('缓存最大年龄必须大于0', 'INVALID_CACHE_MAX_AGE');
    }

    // 验证路径配置
    if (this.cleanupConfig.tempFiles.patterns.length === 0) {
      throw new ServiceError('临时文件模式不能为空', 'INVALID_TEMP_FILE_PATTERNS');
    }

    logger.info('清理配置验证通过');
  }

  /**
   * 创建必要的目录
   */
  async createRequiredDirectories() {
    const directories = [
      'logs',
      'cache',
      'temp',
      'backup'
    ];

    for (const dir of directories) {
      try {
        await fs.mkdir(dir, { recursive: true });
        logger.debug(`创建目录: ${dir}`);
      } catch (error) {
        if (error.code !== 'EEXIST') {
          logger.error(`创建目录失败 ${dir}:`, error);
        }
      }
    }
  }

  /**
   * 注册清理任务
   */
  async registerCleanupTasks() {
    // 这里会与Scheduler Service集成
    // 由于Scheduler Service已经实现，这里只是预留接口
    logger.info('清理任务注册准备就绪');
  }

  /**
   * 执行完整清理
   */
  async performFullCleanup(options = {}) {
    try {
      const {
        force = false,
        dryRun = false,
        rules = ['logs', 'cache', 'database', 'tempFiles']
      } = options;

      logger.info('开始执行完整清理...', { force, dryRun, rules });

      const results = {};
      let totalFilesCleaned = 0;
      let totalRecordsCleaned = 0;
      let totalCacheCleared = 0;
      let errors = 0;

      // 按优先级排序规则
      const sortedRules = rules.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        const ruleA = this.cleanupRules.get(a);
        const ruleB = this.cleanupRules.get(b);
        return priorityOrder[ruleA.priority] - priorityOrder[ruleB.priority];
      });

      // 执行清理规则
      for (const ruleName of sortedRules) {
        const rule = this.cleanupRules.get(ruleName);
        if (!rule) {
          logger.warn(`未找到清理规则: ${ruleName}`);
          continue;
        }

        try {
          logger.info(`执行清理规则: ${rule.name}`);

          if (!dryRun) {
            const result = await rule.execute();
            results[ruleName] = result;

            totalFilesCleaned += result.filesCleaned || 0;
            totalRecordsCleaned += result.recordsCleaned || 0;
            totalCacheCleared += result.cacheCleared || 0;
          } else {
            results[ruleName] = { status: 'dry_run', message: '干运行模式，未实际执行' };
          }

          // 发送事件
          this.emit('cleanupCompleted', {
            operation: ruleName,
            result: results[ruleName],
            cleanedCount: results[ruleName].filesCleaned || results[ruleName].recordsCleaned || results[ruleName].cacheCleared || 0,
            timestamp: new Date().toISOString()
          });

        } catch (error) {
          logger.error(`清理规则执行失败 ${ruleName}:`, error);
          errors++;
          results[ruleName] = { status: 'error', error: error.message };

          // 发送错误事件
          this.emit('cleanupError', {
            rule: ruleName,
            error: error.message,
            timestamp: Date.now()
          });

          // 发送通用错误事件
          this.emit('error', {
            type: 'cleanup',
            rule: ruleName,
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
      }

      // 更新统计信息
      if (!dryRun) {
        this.cleanupStats.totalCleanups++;
        this.cleanupStats.filesCleaned += totalFilesCleaned;
        this.cleanupStats.recordsCleaned += totalRecordsCleaned;
        this.cleanupStats.cacheCleared += totalCacheCleared;
        this.cleanupStats.errors += errors;
      }

      const summary = {
        totalFilesCleaned,
        totalRecordsCleaned,
        totalCacheCleared,
        errors,
        rules: sortedRules.length,
        dryRun
      };

      logger.info('完整清理执行完成', summary);

      // 发送通知
      if (this.cleanupConfig.notifications.enabled && errors > 0) {
        await this.sendCleanupNotification(summary);
      }

      return new APIResponse({
        success: true,
        data: {
          summary,
          results,
          stats: this.cleanupStats
        },
        message: dryRun ? '清理干运行完成' : '清理完成'
      });

    } catch (error) {
      logger.error('完整清理执行失败:', error);

      // 发送错误事件
      this.emit('error', {
        type: 'cleanup',
        operation: 'fullCleanup',
        error: error.message,
        timestamp: new Date().toISOString()
      });

      throw error;
    }
  }

  /**
   * 清理日志文件
   */
  async cleanupLogs() {
    try {
      if (!this.cleanupConfig.logs.enabled) {
        return { filesCleaned: 0, message: '日志清理已禁用' };
      }

      logger.info('开始清理日志文件...');
      let filesCleaned = 0;
      const now = Date.now();
      const cutoffTime = now - this.cleanupConfig.logs.maxAge;

      // 遍历日志模式
      for (const pattern of this.cleanupConfig.logs.patterns) {
        const files = await glob(pattern);

        for (const file of files) {
          try {
            const stats = await fs.stat(file);

            // 检查文件年龄
            if (stats.mtime.getTime() < cutoffTime) {
              await fs.unlink(file);
              filesCleaned++;
              logger.debug(`删除日志文件: ${file}`);
            }

            // 检查文件大小
            if (stats.size > this.cleanupConfig.logs.maxSize) {
              // 如果文件过大，截断它
              const content = await fs.readFile(file, 'utf8');
              const lines = content.split('\n');
              const keepLines = Math.floor(lines.length / 2); // 保留一半内容
              const truncatedContent = lines.slice(-keepLines).join('\n');
              await fs.writeFile(file, truncatedContent, 'utf8');
              logger.debug(`截断日志文件: ${file}`);
            }
          } catch (error) {
            logger.error(`处理日志文件失败 ${file}:`, error);
          }
        }
      }

      logger.info(`日志清理完成，删除了 ${filesCleaned} 个文件`);
      return { filesCleaned, message: `清理了 ${filesCleaned} 个日志文件` };

    } catch (error) {
      logger.error('日志清理失败:', error);

      // 发送错误事件
      this.emit('error', {
        type: 'cleanup',
        operation: 'logs',
        error: error.message,
        timestamp: new Date().toISOString()
      });

      throw error;
    }
  }

  /**
   * 清理缓存
   */
  async cleanupCache() {
    try {
      if (!this.cleanupConfig.cache.enabled) {
        return { cacheCleared: 0, message: '缓存清理已禁用' };
      }

      logger.info('开始清理缓存...');
      let cacheCleared = 0;
      const now = Date.now();
      const cutoffTime = now - this.cleanupConfig.cache.maxAge;

      // 清理缓存目录
      for (const dir of this.cleanupConfig.cache.directories) {
        try {
          const files = await glob(path.join(dir, '**/*'));

          for (const file of files) {
            try {
              const stats = await fs.stat(file);

              if (stats.isFile() && stats.mtime.getTime() < cutoffTime) {
                await fs.unlink(file);
                cacheCleared++;
                logger.debug(`删除缓存文件: ${file}`);
              }
            } catch (error) {
              logger.error(`处理缓存文件失败 ${file}:`, error);
            }
          }
        } catch (error) {
          logger.error(`清理缓存目录失败 ${dir}:`, error);
        }
      }

      // 清理内存缓存（如果有的话）
      if (global.gc) {
        global.gc();
        logger.debug('执行了垃圾回收');
      }

      logger.info(`缓存清理完成，清理了 ${cacheCleared} 项`);
      return { cacheCleared, message: `清理了 ${cacheCleared} 项缓存` };

    } catch (error) {
      logger.error('缓存清理失败:', error);

      // 发送错误事件
      this.emit('error', {
        type: 'cleanup',
        operation: 'cache',
        error: error.message,
        timestamp: new Date().toISOString()
      });

      throw error;
    }
  }

  /**
   * 清理数据库
   */
  async cleanupDatabase() {
    try {
      if (!this.cleanupConfig.database.enabled) {
        return { recordsCleaned: 0, message: '数据库清理已禁用' };
      }

      logger.info('开始清理数据库...');
      let totalRecordsCleaned = 0;

      // 清理过期会话
      if (this.cleanupConfig.database.expiredSessions.enabled) {
        const sessionsCleaned = await this.cleanupExpiredSessions();
        totalRecordsCleaned += sessionsCleaned;
      }

      // 清理失败任务
      if (this.cleanupConfig.database.failedTasks.enabled) {
        const tasksCleaned = await this.cleanupFailedTasks();
        totalRecordsCleaned += tasksCleaned;
      }

      // 清理旧文章
      if (this.cleanupConfig.database.oldArticles.enabled) {
        const articlesCleaned = await this.cleanupOldArticles();
        totalRecordsCleaned += articlesCleaned;
      }

      // 清理审计日志
      if (this.cleanupConfig.database.auditLogs.enabled) {
        const logsCleaned = await this.cleanupAuditLogs();
        totalRecordsCleaned += logsCleaned;
      }

      logger.info(`数据库清理完成，清理了 ${totalRecordsCleaned} 条记录`);
      return { recordsCleaned: totalRecordsCleaned, message: `清理了 ${totalRecordsCleaned} 条数据库记录` };

    } catch (error) {
      logger.error('数据库清理失败:', error);
      throw error;
    }
  }

  /**
   * 清理过期会话
   */
  async cleanupExpiredSessions() {
    try {
      const cutoffTime = new Date(Date.now() - this.cleanupConfig.database.expiredSessions.maxAge);

      // 使用Supabase清理过期会话
      const { data, error, count } = await dbClient
        .from('sessions')
        .delete({ count: 'exact' })
        .lt('created_at', cutoffTime.toISOString())
        .select();

      if (error) {
        logger.error('删除过期会话失败:', error);
        return 0;
      }

      logger.info(`清理了 ${count} 个过期会话`);
      return count || 0;

    } catch (error) {
      logger.error('清理过期会话失败:', error);
      return 0;
    }
  }

  /**
   * 清理失败任务
   */
  async cleanupFailedTasks() {
    try {
      const cutoffTime = new Date(Date.now() - this.cleanupConfig.database.failedTasks.maxAge);

      // 使用Supabase清理失败任务记录
      const { data, error, count } = await dbClient
        .from('task_logs')
        .delete({ count: 'exact' })
        .eq('status', 'failed')
        .lt('created_at', cutoffTime.toISOString())
        .select();

      if (error) {
        logger.error('删除失败任务失败:', error);
        return 0;
      }

      logger.info(`清理了 ${count} 个失败任务记录`);
      return count || 0;

    } catch (error) {
      logger.error('清理失败任务失败:', error);
      return 0;
    }
  }

  /**
   * 清理旧文章
   */
  async cleanupOldArticles() {
    try {
      const cutoffTime = new Date(Date.now() - this.cleanupConfig.database.oldArticles.maxAge);
      const keepCount = this.cleanupConfig.database.oldArticles.keepCount;

      // 首先获取超过保留数量的文章总数
      const { count: totalCount, error: countError } = await dbClient
        .from('articles')
        .select('*', { count: 'exact', head: true });

      if (countError) {
        logger.error('获取文章总数失败:', countError);
        return 0;
      }

      const articlesToDelete = Math.max(0, (totalCount || 0) - keepCount);

      if (articlesToDelete <= 0) {
        logger.info('文章数量未超过保留限制，无需清理');
        return 0;
      }

      // 使用Supabase清理旧文章，按发布时间排序
      const { data, error, count } = await dbClient
        .from('articles')
        .delete({ count: 'exact' })
        .lt('published_at', cutoffTime.toISOString())
        .order('published_at', { ascending: true })
        .limit(articlesToDelete)
        .select();

      if (error) {
        logger.error('删除旧文章失败:', error);
        return 0;
      }

      logger.info(`清理了 ${count} 篇旧文章，保留最新 ${keepCount} 篇`);
      return count || 0;

    } catch (error) {
      logger.error('清理旧文章失败:', error);
      return 0;
    }
  }

  /**
   * 清理审计日志
   */
  async cleanupAuditLogs() {
    try {
      const cutoffTime = new Date(Date.now() - this.cleanupConfig.database.auditLogs.maxAge);

      // 使用Supabase清理审计日志
      const { data, error, count } = await dbClient
        .from('audit_logs')
        .delete({ count: 'exact' })
        .lt('created_at', cutoffTime.toISOString())
        .select();

      if (error) {
        logger.error('删除审计日志失败:', error);
        return 0;
      }

      logger.info(`清理了 ${count} 条审计日志`);
      return count || 0;

    } catch (error) {
      logger.error('清理审计日志失败:', error);
      return 0;
    }
  }

  /**
   * 清理临时文件
   */
  async cleanupTempFiles() {
    try {
      if (!this.cleanupConfig.tempFiles.enabled) {
        return { filesCleaned: 0, message: '临时文件清理已禁用' };
      }

      logger.info('开始清理临时文件...');
      let filesCleaned = 0;
      const now = Date.now();
      const cutoffTime = now - this.cleanupConfig.tempFiles.maxAge;

      // 遍历临时文件模式
      for (const pattern of this.cleanupConfig.tempFiles.patterns) {
        const files = await glob(pattern);

        for (const file of files) {
          try {
            const stats = await fs.stat(file);

            if (stats.isFile() && stats.mtime.getTime() < cutoffTime) {
              await fs.unlink(file);
              filesCleaned++;
              logger.debug(`删除临时文件: ${file}`);
            }
          } catch (error) {
            logger.error(`处理临时文件失败 ${file}:`, error);
          }
        }
      }

      logger.info(`临时文件清理完成，删除了 ${filesCleaned} 个文件`);
      return { filesCleaned, message: `清理了 ${filesCleaned} 个临时文件` };

    } catch (error) {
      logger.error('临时文件清理失败:', error);
      throw error;
    }
  }

  /**
   * 系统优化
   */
  async optimizeSystem() {
    try {
      logger.info('开始系统优化...');

      // 数据库优化
      await this.optimizeDatabase();

      // 文件系统优化
      await this.optimizeFileSystem();

      // 内存优化
      await this.optimizeMemory();

      logger.info('系统优化完成');
      return { message: '系统优化完成' };

    } catch (error) {
      logger.error('系统优化失败:', error);
      throw error;
    }
  }

  /**
   * 数据库优化
   */
  async optimizeDatabase() {
    try {
      logger.info('开始数据库优化...');

      // 更新统计信息
      const { error: analyzeError } = await dbClient.rpc('analyze_tables');
      if (analyzeError) {
        logger.warn('更新表统计信息失败:', analyzeError);
      }

      // 清理未使用的索引（如果支持）
      const { error: indexError } = await dbClient.rpc('cleanup_unused_indexes');
      if (indexError) {
        logger.warn('清理未使用索引失败:', indexError);
      }

      // 检查数据库大小
      const { data: dbSize, error: sizeError } = await dbClient.rpc('get_database_size');
      if (!sizeError && dbSize) {
        logger.info(`当前数据库大小: ${dbSize.size} MB`);
      }

      // 检查表的大小
      const { data: tableSizes, error: tableError } = await dbClient.rpc('get_table_sizes');
      if (!tableError && tableSizes) {
        tableSizes.forEach(table => {
          logger.debug(`表 ${table.table_name}: ${table.size} MB`);
        });
      }

      logger.info('数据库优化完成');
      return true;

    } catch (error) {
      logger.error('数据库优化失败:', error);
      return false;
    }
  }

  /**
   * 文件系统优化
   */
  async optimizeFileSystem() {
    try {
      // 执行文件系统优化操作
      logger.debug('执行文件系统优化');

      // 检查磁盘空间等
      return true;

    } catch (error) {
      logger.error('文件系统优化失败:', error);
      return false;
    }
  }

  /**
   * 内存优化
   */
  async optimizeMemory() {
    try {
      // 执行内存优化操作
      logger.debug('执行内存优化');

      // 强制垃圾回收
      if (global.gc) {
        global.gc();
      }

      return true;

    } catch (error) {
      logger.error('内存优化失败:', error);
      return false;
    }
  }

  /**
   * 发送清理通知
   */
  async sendCleanupNotification(summary) {
    try {
      if (!this.cleanupConfig.notifications.enabled) {
        return;
      }

      // 如果错误数超过阈值，发送通知
      if (summary.errors >= this.cleanupConfig.notifications.threshold) {
        logger.warn(`清理操作错误数超过阈值: ${summary.errors}`);

        // 这里可以集成Email Service或其他通知服务
        if (this.cleanupConfig.notifications.webhookUrl) {
          await this.sendWebhookNotification(summary);
        }
      }

    } catch (error) {
      logger.error('发送清理通知失败:', error);
    }
  }

  /**
   * 发送Webhook通知
   */
  async sendWebhookNotification(summary) {
    try {
      // 这里应该发送HTTP请求到webhook URL
      logger.debug(`发送清理通知到webhook: ${this.cleanupConfig.notifications.webhookUrl}`);

      return true;

    } catch (error) {
      logger.error('发送webhook通知失败:', error);
      return false;
    }
  }

  /**
   * 获取清理统计信息
   */
  getStats() {
    return {
      ...this.cleanupStats,
      isRunning: this.isRunning,
      config: this.cleanupConfig,
      rules: Array.from(this.cleanupRules.values()).map(rule => ({
        name: rule.name,
        description: rule.description,
        priority: rule.priority,
        schedule: rule.schedule
      }))
    };
  }

  /**
   * 获取清理规则
   */
  getRules() {
    return Array.from(this.cleanupRules.values()).map(rule => ({
      name: rule.name,
      description: rule.description,
      priority: rule.priority,
      schedule: rule.schedule
    }));
  }

  /**
   * 手动执行特定清理规则
   */
  async executeRule(ruleName, options = {}) {
    try {
      const rule = this.cleanupRules.get(ruleName);
      if (!rule) {
        throw new ServiceError(`未找到清理规则: ${ruleName}`, 'CLEANUP_RULE_NOT_FOUND');
      }

      logger.info(`手动执行清理规则: ${rule.name}`);

      const result = await rule.execute();

      // 发送事件
      this.emit('ruleExecuted', {
        rule: ruleName,
        result,
        timestamp: Date.now()
      });

      return new APIResponse({
        success: true,
        data: { rule: ruleName, result },
        message: `清理规则 ${ruleName} 执行完成`
      });

    } catch (error) {
      logger.error(`执行清理规则失败 ${ruleName}:`, error);
      throw error;
    }
  }

  /**
   * 停止服务
   */
  async stop() {
    try {
      this.isRunning = false;
      logger.info('Cleanup Service已停止');
    } catch (error) {
      logger.error('Cleanup Service停止失败:', error);
    }
  }
}

export default CleanupService;