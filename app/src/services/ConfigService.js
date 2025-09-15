/**
 * Config Management Service
 * 提供配置加载、验证、热重载和审计功能
 */

import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import { watch } from 'fs';
import dbClient from '../database/client.js';
import logger from '../utils/logger.js';

export class ConfigService extends EventEmitter {
  constructor(config = {}) {
    super();
    this.isRunning = false;
    this.configCache = new Map();
    this.watchers = new Map();
    this.validators = new Map();
    this.auditLog = [];
    this.maxAuditLogSize = config.maxAuditLogSize || 1000;

    // 配置模式定义
    this.configSchemas = {
      // RSS 配置模式
      rss: {
        maxSources: { type: 'number', default: 100, min: 1, max: 1000 },
        fetchInterval: { type: 'number', default: 300000, min: 60000, max: 3600000 },
        timeout: { type: 'number', default: 30000, min: 5000, max: 300000 },
        retryAttempts: { type: 'number', default: 3, min: 1, max: 10 },
        userAgent: { type: 'string', default: 'NewsAggregator/1.0' }
      },

      // AI 分析配置模式
      ai: {
        enabled: { type: 'boolean', default: true },
        defaultModel: { type: 'string', default: 'gpt-3.5-turbo', enum: ['gpt-3.5-turbo', 'gpt-4', 'claude-3', 'deepseek'] },
        maxTokens: { type: 'number', default: 1000, min: 100, max: 4000 },
        temperature: { type: 'number', default: 0.7, min: 0, max: 2 },
        costControl: {
          enabled: { type: 'boolean', default: true },
          dailyBudget: { type: 'number', default: 10.0, min: 1, max: 100 },
          monthlyBudget: { type: 'number', default: 200.0, min: 10, max: 1000 }
        }
      },

      // 邮件配置模式
      email: {
        enabled: { type: 'boolean', default: true },
        provider: { type: 'string', default: 'resend', enum: ['resend', 'sendgrid', 'ses'] },
        maxRetries: { type: 'number', default: 3, min: 1, max: 10 },
        batchSize: { type: 'number', default: 50, min: 1, max: 200 },
        dailyDigest: {
          enabled: { type: 'boolean', default: true },
          sendTime: { type: 'string', default: '09:00', pattern: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/ },
          maxArticles: { type: 'number', default: 20, min: 1, max: 100 }
        }
      },

      // 数据库配置模式
      database: {
        poolSize: { type: 'number', default: 10, min: 1, max: 50 },
        connectionTimeout: { type: 'number', default: 30000, min: 5000, max: 120000 },
        queryTimeout: { type: 'number', default: 30000, min: 5000, max: 120000 }
      },

      // 系统配置模式
      system: {
        logLevel: { type: 'string', default: 'info', enum: ['error', 'warn', 'info', 'debug'] },
        maxConcurrentTasks: { type: 'number', default: 5, min: 1, max: 20 },
        cleanupInterval: { type: 'number', default: 86400000, min: 3600000, max: 604800000 }, // 1 day default
        dataRetentionDays: { type: 'number', default: 30, min: 7, max: 365 }
      }
    };

    // 默认配置
    this.defaultConfig = {
      rss: this.configSchemas.rss,
      ai: this.configSchemas.ai,
      email: this.configSchemas.email,
      database: this.configSchemas.database,
      system: this.configSchemas.system
    };

    // 服务配置
    this.config = {
      configPath: config.configPath || './config',
      env: config.env || process.env.NODE_ENV || 'development',
      autoReload: config.autoReload !== false,
      backupEnabled: config.backupEnabled !== false,
      backupInterval: config.backupInterval || 3600000, // 1 hour
      auditEnabled: config.auditEnabled !== false
    };

    // 初始化验证器
    this.initializeValidators();
  }

  async initialize() {
    try {
      logger.info('初始化 Config Management Service...');

      // 加载配置文件
      await this.loadAllConfigs();

      // 启动文件监控
      if (this.config.autoReload) {
        await this.startFileWatchers();
      }

      // 启动定期备份
      if (this.config.backupEnabled) {
        this.startBackupScheduler();
      }

      this.isRunning = true;
      logger.info('Config Management Service 初始化完成');
      return true;

    } catch (error) {
      logger.error('Config Management Service 初始化失败:', error);
      throw error;
    }
  }

  initializeValidators() {
    // 为每种配置类型创建验证器
    Object.keys(this.configSchemas).forEach(configType => {
      this.validators.set(configType, (config) => {
        return this.validateConfig(configType, config);
      });
    });
  }

  async loadAllConfigs() {
    try {
      const configPromises = Object.keys(this.configSchemas).map(async (configType) => {
        try {
          const config = await this.loadConfig(configType);
          this.configCache.set(configType, config);
          logger.info(`已加载 ${configType} 配置`);
        } catch (error) {
          logger.warn(`加载 ${configType} 配置失败，使用默认配置:`, error.message);
          this.configCache.set(configType, this.getDefaultConfig(configType));
        }
      });

      await Promise.all(configPromises);

      // 加载环境变量覆盖
      await this.loadEnvironmentOverrides();

      logger.info('所有配置加载完成');
    } catch (error) {
      logger.error('加载配置失败:', error);
      throw error;
    }
  }

  async loadConfig(configType) {
    try {
      const configPath = this.getConfigPath(configType);
      const configData = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configData);

      // 验证配置
      const validationResult = this.validateConfig(configType, config);
      if (!validationResult.valid) {
        throw new Error(`配置验证失败: ${validationResult.errors.join(', ')}`);
      }

      return config;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // 配置文件不存在，创建默认配置
        const defaultConfig = this.getDefaultConfig(configType);
        await this.saveConfig(configType, defaultConfig);
        return defaultConfig;
      }
      throw error;
    }
  }

  async saveConfig(configType, config) {
    try {
      // 验证配置
      const validationResult = this.validateConfig(configType, config);
      if (!validationResult.valid) {
        throw new Error(`配置验证失败: ${validationResult.errors.join(', ')}`);
      }

      const configPath = this.getConfigPath(configType);
      const configDir = path.dirname(configPath);

      // 确保目录存在
      await fs.mkdir(configDir, { recursive: true });

      // 备份现有配置
      if (await this.fileExists(configPath)) {
        await this.backupConfig(configType);
      }

      // 保存新配置
      const configData = JSON.stringify(config, null, 2);
      await fs.writeFile(configPath, configData, 'utf8');

      // 更新缓存
      this.configCache.set(configType, config);

      // 记录审计日志
      await this.logAudit('config_update', configType, {
        oldConfig: this.configCache.get(configType),
        newConfig: config
      });

      // 发送配置变更事件
      this.emit('configChanged', {
        type: configType,
        config,
        timestamp: new Date().toISOString()
      });

      logger.info(`已保存 ${configType} 配置到 ${configPath}`);
      return true;
    } catch (error) {
      logger.error(`保存 ${configType} 配置失败:`, error);
      throw error;
    }
  }

  async loadEnvironmentOverrides() {
    try {
      const envOverrides = {};

      // RSS 配置环境变量
      if (process.env.RSS_MAX_SOURCES) {
        envOverrides.rss = { ...envOverrides.rss, maxSources: parseInt(process.env.RSS_MAX_SOURCES) };
      }
      if (process.env.RSS_FETCH_INTERVAL) {
        envOverrides.rss = { ...envOverrides.rss, fetchInterval: parseInt(process.env.RSS_FETCH_INTERVAL) };
      }

      // AI 配置环境变量
      if (process.env.AI_ENABLED) {
        envOverrides.ai = { ...envOverrides.ai, enabled: process.env.AI_ENABLED === 'true' };
      }
      if (process.env.AI_DEFAULT_MODEL) {
        envOverrides.ai = { ...envOverrides.ai, defaultModel: process.env.AI_DEFAULT_MODEL };
      }
      if (process.env.OPENAI_API_KEY) {
        envOverrides.ai = { ...envOverrides.ai, apiKey: process.env.OPENAI_API_KEY };
      }

      // 邮件配置环境变量
      if (process.env.EMAIL_ENABLED) {
        envOverrides.email = { ...envOverrides.email, enabled: process.env.EMAIL_ENABLED === 'true' };
      }
      if (process.env.RESEND_API_KEY) {
        envOverrides.email = { ...envOverrides.email, apiKey: process.env.RESEND_API_KEY };
      }
      if (process.env.FROM_EMAIL) {
        envOverrides.email = { ...envOverrides.email, fromEmail: process.env.FROM_EMAIL };
      }

      // 数据库配置环境变量
      if (process.env.DB_POOL_SIZE) {
        envOverrides.database = { ...envOverrides.database, poolSize: parseInt(process.env.DB_POOL_SIZE) };
      }
      if (process.env.DB_CONNECTION_TIMEOUT) {
        envOverrides.database = { ...envOverrides.database, connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT) };
      }

      // 应用环境变量覆盖
      Object.keys(envOverrides).forEach(configType => {
        const currentConfig = this.configCache.get(configType) || this.getDefaultConfig(configType);
        const mergedConfig = this.mergeConfig(currentConfig, envOverrides[configType]);
        this.configCache.set(configType, mergedConfig);
      });

      if (Object.keys(envOverrides).length > 0) {
        logger.info(`已应用 ${Object.keys(envOverrides).length} 个环境变量配置覆盖`);
      }
    } catch (error) {
      logger.error('加载环境变量覆盖失败:', error);
    }
  }

  validateConfig(configType, config) {
    const schema = this.configSchemas[configType];
    if (!schema) {
      return {
        valid: false,
        errors: [`未知的配置类型: ${configType}`]
      };
    }

    const errors = [];
    const validateField = (fieldPath, value, fieldSchema) => {
      if (value === undefined || value === null) {
        if (fieldSchema.default !== undefined) {
          return; // 使用默认值
        }
        errors.push(`${fieldPath} 是必需的`);
        return;
      }

      // 类型验证
      if (fieldSchema.type && typeof value !== fieldSchema.type) {
        errors.push(`${fieldPath} 必须是 ${fieldSchema.type} 类型，当前是 ${typeof value}`);
        return;
      }

      // 数值范围验证
      if (fieldSchema.type === 'number') {
        if (fieldSchema.min !== undefined && value < fieldSchema.min) {
          errors.push(`${fieldPath} 不能小于 ${fieldSchema.min}`);
        }
        if (fieldSchema.max !== undefined && value > fieldSchema.max) {
          errors.push(`${fieldPath} 不能大于 ${fieldSchema.max}`);
        }
      }

      // 枚举值验证
      if (fieldSchema.enum && !fieldSchema.enum.includes(value)) {
        errors.push(`${fieldPath} 必须是以下值之一: ${fieldSchema.enum.join(', ')}`);
      }

      // 正则表达式验证
      if (fieldSchema.pattern && !fieldSchema.pattern.test(value)) {
        errors.push(`${fieldPath} 格式不正确`);
      }

      // 递归验证对象
      if (fieldSchema.type === 'object' && typeof value === 'object') {
        Object.keys(fieldSchema).forEach(key => {
          if (key !== 'type' && typeof fieldSchema[key] === 'object') {
            validateField(`${fieldPath}.${key}`, value[key], fieldSchema[key]);
          }
        });
      }
    };

    // 验证所有字段
    Object.keys(schema).forEach(field => {
      if (typeof schema[field] === 'object') {
        validateField(field, config[field], schema[field]);
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }

  mergeConfig(baseConfig, overrideConfig) {
    const merged = { ...baseConfig };

    Object.keys(overrideConfig).forEach(key => {
      if (typeof overrideConfig[key] === 'object' && !Array.isArray(overrideConfig[key]) && overrideConfig[key] !== null) {
        merged[key] = this.mergeConfig(baseConfig[key] || {}, overrideConfig[key]);
      } else {
        merged[key] = overrideConfig[key];
      }
    });

    return merged;
  }

  getDefaultConfig(configType) {
    const schema = this.configSchemas[configType];
    if (!schema) {
      throw new Error(`未知的配置类型: ${configType}`);
    }

    const extractDefaults = (obj) => {
      const result = {};
      Object.keys(obj).forEach(key => {
        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
          if (obj[key].default !== undefined) {
            result[key] = obj[key].default;
          } else {
            result[key] = extractDefaults(obj[key]);
          }
        } else if (obj[key].default !== undefined) {
          result[key] = obj[key].default;
        }
      });
      return result;
    };

    return extractDefaults(schema);
  }

  getConfigPath(configType) {
    const fileName = `${configType}.${this.config.env}.json`;
    return path.join(this.config.configPath, fileName);
  }

  async startFileWatchers() {
    try {
      Object.keys(this.configSchemas).forEach(configType => {
        const configPath = this.getConfigPath(configType);

        const watcher = watch(configPath, async (eventType) => {
          if (eventType === 'change') {
            try {
              logger.info(`检测到 ${configType} 配置文件变更，重新加载...`);
              await this.reloadConfig(configType);
            } catch (error) {
              logger.error(`重新加载 ${configType} 配置失败:`, error);
            }
          }
        });

        this.watchers.set(configType, watcher);
        logger.info(`已启动 ${configType} 配置文件监控`);
      });
    } catch (error) {
      logger.error('启动文件监控失败:', error);
    }
  }

  async reloadConfig(configType) {
    try {
      const oldConfig = this.configCache.get(configType);
      const newConfig = await this.loadConfig(configType);

      // 验证新配置
      const validationResult = this.validateConfig(configType, newConfig);
      if (!validationResult.valid) {
        throw new Error(`新配置验证失败: ${validationResult.errors.join(', ')}`);
      }

      // 更新缓存
      this.configCache.set(configType, newConfig);

      // 记录审计日志
      await this.logAudit('config_reload', configType, {
        oldConfig,
        newConfig
      });

      // 发送热重载事件
      this.emit('configReloaded', {
        type: configType,
        oldConfig,
        newConfig,
        timestamp: new Date().toISOString()
      });

      logger.info(`${configType} 配置热重载完成`);
      return true;
    } catch (error) {
      logger.error(`重新加载 ${configType} 配置失败:`, error);

      // 记录失败事件
      this.emit('configReloadFailed', {
        type: configType,
        error: error.message,
        timestamp: new Date().toISOString()
      });

      throw error;
    }
  }

  startBackupScheduler() {
    setInterval(async () => {
      try {
        await this.backupAllConfigs();
      } catch (error) {
        logger.error('定期备份配置失败:', error);
      }
    }, this.config.backupInterval);

    logger.info(`配置定期备份已启动，间隔: ${this.config.backupInterval}ms`);
  }

  async backupAllConfigs() {
    try {
      const backupDir = path.join(this.config.configPath, 'backups', new Date().toISOString().replace(/[:.]/g, '-'));
      await fs.mkdir(backupDir, { recursive: true });

      const backupPromises = Object.keys(this.configSchemas).map(async (configType) => {
        try {
          const config = this.configCache.get(configType);
          if (config) {
            const backupPath = path.join(backupDir, `${configType}.json`);
            await fs.writeFile(backupPath, JSON.stringify(config, null, 2), 'utf8');
          }
        } catch (error) {
          logger.error(`备份 ${configType} 配置失败:`, error);
        }
      });

      await Promise.all(backupPromises);
      logger.info(`配置备份完成: ${backupDir}`);
    } catch (error) {
      logger.error('备份所有配置失败:', error);
      throw error;
    }
  }

  async backupConfig(configType) {
    try {
      const config = this.configCache.get(configType);
      if (!config) {
        return;
      }

      const backupDir = path.join(this.config.configPath, 'backups');
      await fs.mkdir(backupDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `${configType}.${timestamp}.json`);

      await fs.writeFile(backupPath, JSON.stringify(config, null, 2), 'utf8');
      logger.info(`${configType} 配置已备份到 ${backupPath}`);
    } catch (error) {
      logger.error(`备份 ${configType} 配置失败:`, error);
    }
  }

  async logAudit(action, configType, details = {}) {
    if (!this.config.auditEnabled) {
      return;
    }

    try {
      const auditEntry = {
        id: this.generateAuditId(),
        action,
        configType,
        details,
        timestamp: new Date().toISOString(),
        userId: details.userId || 'system'
      };

      this.auditLog.push(auditEntry);

      // 保持审计日志大小限制
      if (this.auditLog.length > this.maxAuditLogSize) {
        this.auditLog = this.auditLog.slice(-this.maxAuditLogSize);
      }

      // 保存到数据库
      await this.saveAuditToDatabase(auditEntry);

      logger.debug(`审计日志记录: ${action} - ${configType}`);
    } catch (error) {
      logger.error('记录审计日志失败:', error);
    }
  }

  async saveAuditToDatabase(auditEntry) {
    try {
      const { error } = await dbClient
        .from('config_audit_log')
        .insert([auditEntry]);

      if (error) {
        logger.error('保存审计日志到数据库失败:', error);
      }
    } catch (error) {
      logger.error('保存审计日志到数据库异常:', error);
    }
  }

  generateAuditId() {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  // 公共 API 方法
  getConfig(configType) {
    return this.configCache.get(configType) || this.getDefaultConfig(configType);
  }

  getAllConfigs() {
    const configs = {};
    Object.keys(this.configSchemas).forEach(configType => {
      configs[configType] = this.getConfig(configType);
    });
    return configs;
  }

  async updateConfig(configType, updates, options = {}) {
    try {
      const currentConfig = this.getConfig(configType);
      const newConfig = this.mergeConfig(currentConfig, updates);

      await this.saveConfig(configType, newConfig);

      if (options.notifyServices !== false) {
        // 通知相关服务配置已变更
        this.emit('configUpdated', {
          type: configType,
          oldConfig: currentConfig,
          newConfig,
          source: options.source || 'manual',
          timestamp: new Date().toISOString()
        });
      }

      return newConfig;
    } catch (error) {
      logger.error(`更新 ${configType} 配置失败:`, error);
      throw error;
    }
  }

  async resetConfig(configType, options = {}) {
    try {
      const defaultConfig = this.getDefaultConfig(configType);
      await this.saveConfig(configType, defaultConfig);

      if (options.notifyServices !== false) {
        this.emit('configReset', {
          type: configType,
          oldConfig: this.configCache.get(configType),
          newConfig: defaultConfig,
          source: options.source || 'manual',
          timestamp: new Date().toISOString()
        });
      }

      return defaultConfig;
    } catch (error) {
      logger.error(`重置 ${configType} 配置失败:`, error);
      throw error;
    }
  }

  getAuditLog(filters = {}) {
    let filteredLog = [...this.auditLog];

    if (filters.action) {
      filteredLog = filteredLog.filter(entry => entry.action === filters.action);
    }

    if (filters.configType) {
      filteredLog = filteredLog.filter(entry => entry.configType === filters.configType);
    }

    if (filters.userId) {
      filteredLog = filteredLog.filter(entry => entry.userId === filters.userId);
    }

    if (filters.startDate) {
      filteredLog = filteredLog.filter(entry => new Date(entry.timestamp) >= new Date(filters.startDate));
    }

    if (filters.endDate) {
      filteredLog = filteredLog.filter(entry => new Date(entry.timestamp) <= new Date(filters.endDate));
    }

    return filteredLog.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  getConfigSchema(configType) {
    return this.configSchemas[configType] || null;
  }

  getAllConfigSchemas() {
    return { ...this.configSchemas };
  }

  validateConfigChange(configType, changes) {
    const currentConfig = this.getConfig(configType);
    const proposedConfig = this.mergeConfig(currentConfig, changes);
    return this.validateConfig(configType, proposedConfig);
  }

  async getStats() {
    return {
      isRunning: this.isRunning,
      configCount: this.configCache.size,
      watchedFiles: this.watchers.size,
      auditLogSize: this.auditLog.length,
      lastBackup: '备份时间需要跟踪',
      configTypes: Object.keys(this.configSchemas),
      environment: this.config.env,
      autoReload: this.config.autoReload,
      uptime: process.uptime()
    };
  }

  async shutdown() {
    try {
      logger.info('正在关闭 Config Management Service...');

      this.isRunning = false;

      // 停止文件监控
      this.watchers.forEach((watcher, configType) => {
        watcher.close();
        logger.info(`已停止 ${configType} 配置文件监控`);
      });
      this.watchers.clear();

      // 备份当前配置
      if (this.config.backupEnabled) {
        await this.backupAllConfigs();
      }

      logger.info('Config Management Service 已关闭');
    } catch (error) {
      logger.error('关闭 Config Management Service 失败:', error);
    }
  }
}

export default ConfigService;