/**
 * Config Management Service - 系统配置管理服务
 * 提供配置加载、验证、更新、缓存等功能
 * 遵循Node.js最佳实践：类型安全、错误处理、性能优化
 */

import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import { SystemConfigQueries } from '../database/queries.js';
import { ServiceConfig, APIResponse, ServiceError } from '../types/index.js';

/**
 * 配置管理服务类
 */
class ConfigManagementService extends EventEmitter {
  constructor(config = {}) {
    super();

    this.isRunning = false;
    this.configCache = new Map();
    this.fileWatchers = new Map();
    this.watchInterval = null;

    // 配置验证模式
    this.configSchemas = new Map();

    // 默认配置
    this.defaultConfig = {
      // RSS配置
      rss: {
        maxConcurrentFetches: 5,
        defaultTimeout: 30000,
        maxRetries: 3,
        retryDelay: 1000,
        userAgent: 'NewsAggregator/1.0',
        maxContentLength: 50000,
        defaultLanguage: 'zh',
        cleanupInterval: 3600000 // 1小时
      },

      // NewsAPI配置
      newsapi: {
        enabled: true,
        apiKey: '',
        baseUrl: 'https://newsapi.org/v2',
        timeout: 30000,
        maxRetries: 3,
        articlesPerPage: 100,
        maxArticlesPerRequest: 100
      },

      // 翻译配置
      translation: {
        enabled: true,
        defaultService: 'openai',
        services: {
          openai: {
            enabled: true,
            model: 'gpt-3.5-turbo',
            maxTokens: 2000,
            temperature: 0.3
          },
          google: {
            enabled: false,
            apiKey: ''
          },
          baidu: {
            enabled: false,
            appId: '',
            secretKey: ''
          }
        },
        cache: {
          enabled: true,
          ttl: 86400000 // 24小时
        }
      },

      // AI分析配置
      ai: {
        enabled: true,
        defaultService: 'openai',
        services: {
          openai: {
            enabled: true,
            model: 'gpt-3.5-turbo',
            maxTokens: 1000,
            temperature: 0.5
          },
          anthropic: {
            enabled: false,
            model: 'claude-3-sonnet-20240229',
            maxTokens: 1000
          }
        },
        tasks: {
          sentiment: {
            enabled: true,
            threshold: 0.7
          },
          categorization: {
            enabled: true,
            threshold: 0.8
          },
          keywords: {
            enabled: true,
            maxKeywords: 10
          },
          summarization: {
            enabled: true,
            maxLength: 200
          }
        },
        cache: {
          enabled: true,
          ttl: 86400000 // 24小时
        }
      },

      // 邮件配置
      email: {
        enabled: false,
        defaultProvider: 'sendgrid',
        providers: {
          sendgrid: {
            enabled: true,
            apiKey: '',
            fromEmail: 'noreply@example.com'
          },
          smtp: {
            enabled: false,
            host: '',
            port: 587,
            secure: false,
            auth: {
              user: '',
              pass: ''
            }
          },
          ses: {
            enabled: false,
            region: 'us-east-1',
            accessKeyId: '',
            secretAccessKey: ''
          }
        },
        templates: {
          dailyDigest: {
            enabled: true,
            subject: '每日新闻摘要 - {{date}}'
          },
          breakingNews: {
            enabled: true,
            subject: '突发新闻: {{title}}'
          },
          systemAlert: {
            enabled: true,
            subject: '系统提醒: {{type}}'
          }
        }
      },

      // 数据库配置
      database: {
        pool: {
          min: 2,
          max: 10,
          idle: 30000,
          acquire: 10000
        },
        retry: {
          maxAttempts: 3,
          delayMs: 1000
        }
      },

      // 日志配置
      logging: {
        level: 'info',
        format: 'json',
        maxFiles: 5,
        maxSize: '10m',
        datePattern: 'YYYY-MM-DD'
      },

      // 调度配置
      scheduler: {
        enabled: true,
        rssFetchInterval: 1800000, // 30分钟
        newsapiFetchInterval: 1800000, // 30分钟
        cleanupInterval: 3600000, // 1小时
        statsInterval: 300000 // 5分钟
      },

      // 缓存配置
      cache: {
        enabled: true,
        provider: 'memory',
        ttl: 300000, // 5分钟
        maxSize: 1000
      },

      // 安全配置
      security: {
        rateLimit: {
          enabled: true,
          windowMs: 900000, // 15分钟
          max: 100
        },
        cors: {
          enabled: true,
          origin: ['http://localhost:3000'],
          credentials: true
        },
        helmet: {
          enabled: true
        }
      }
    };
  }

  /**
   * 初始化配置管理服务
   */
  async initialize() {
    try {
      logger.info('正在初始化Config Management Service...');

      // 初始化配置验证模式
      this.initConfigSchemas();

      // 加载配置文件
      await this.loadConfigFiles();

      // 加载数据库配置
      await this.loadDatabaseConfig();

      // 启动文件监控
      this.startFileWatching();

      // 启动配置验证
      this.startConfigValidation();

      this.isRunning = true;
      logger.info('Config Management Service初始化成功');
      return true;

    } catch (error) {
      logger.error('Config Management Service初始化失败:', error);
      throw error;
    }
  }

  /**
   * 初始化配置验证模式
   */
  initConfigSchemas() {
    // RSS配置模式
    this.configSchemas.set('rss', {
      type: 'object',
      properties: {
        maxConcurrentFetches: { type: 'integer', minimum: 1, maximum: 20 },
        defaultTimeout: { type: 'integer', minimum: 5000, maximum: 120000 },
        maxRetries: { type: 'integer', minimum: 0, maximum: 10 },
        retryDelay: { type: 'integer', minimum: 100, maximum: 10000 },
        maxContentLength: { type: 'integer', minimum: 1000, maximum: 100000 }
      },
      required: ['maxConcurrentFetches', 'defaultTimeout', 'maxRetries']
    });

    // NewsAPI配置模式
    this.configSchemas.set('newsapi', {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        apiKey: { type: 'string', minLength: 1 },
        articlesPerPage: { type: 'integer', minimum: 1, maximum: 100 }
      },
      required: ['enabled', 'apiKey']
    });

    // 翻译配置模式
    this.configSchemas.set('translation', {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        defaultService: { type: 'string', enum: ['openai', 'google', 'baidu'] }
      },
      required: ['enabled', 'defaultService']
    });

    // AI配置模式
    this.configSchemas.set('ai', {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        defaultService: { type: 'string', enum: ['openai', 'anthropic'] }
      },
      required: ['enabled', 'defaultService']
    });
  }

  /**
   * 加载配置文件
   */
  async loadConfigFiles() {
    const configFiles = [
      '.env',
      '.env.local',
      'config/default.json',
      'config/production.json',
      'config/development.json'
    ];

    for (const configFile of configFiles) {
      try {
        const configPath = path.resolve(configFile);
        const exists = await fs.access(configPath).then(() => true).catch(() => false);

        if (exists) {
          const config = await this.loadConfigFile(configPath);
          this.mergeConfig(config);
          logger.info(`配置文件加载成功: ${configFile}`);
        }
      } catch (error) {
        logger.warn(`配置文件加载失败: ${configFile}`, error.message);
      }
    }
  }

  /**
   * 加载单个配置文件
   */
  async loadConfigFile(filePath) {
    const ext = path.extname(filePath);
    const content = await fs.readFile(filePath, 'utf8');

    switch (ext) {
    case '.json':
      return JSON.parse(content);
    case '.env':
      return this.parseEnvFile(content);
    default:
      throw new Error(`不支持的配置文件格式: ${ext}`);
    }
  }

  /**
   * 解析.env文件
   */
  parseEnvFile(content) {
    const config = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...values] = trimmed.split('=');
        if (key && values.length > 0) {
          const value = values.join('=').replace(/^["']|["']$/g, '');
          config[key] = this.parseValue(value);
        }
      }
    }

    return config;
  }

  /**
   * 解析配置值
   */
  parseValue(value) {
    // 布尔值
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    // 数字
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    if (/^\d+\.\d+$/.test(value)) return parseFloat(value);

    // JSON
    if (value.startsWith('{') && value.endsWith('}')) {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }

    // 字符串
    return value;
  }

  /**
   * 加载数据库配置
   */
  async loadDatabaseConfig() {
    try {
      const dbConfigs = await SystemConfigQueries.getAll();

      for (const config of dbConfigs) {
        try {
          const value = JSON.parse(config.value);
          this.setNestedConfig(config.key, value);
          logger.info(`数据库配置加载成功: ${config.key}`);
        } catch (error) {
          logger.warn(`数据库配置解析失败: ${config.key}`, error.message);
        }
      }
    } catch (error) {
      logger.warn('数据库配置加载失败:', error.message);
    }
  }

  /**
   * 合并配置
   */
  mergeConfig(newConfig) {
    this.deepMerge(this.defaultConfig, newConfig);
  }

  /**
   * 深度合并对象
   */
  deepMerge(target, source) {
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {};
        this.deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }

  /**
   * 设置嵌套配置
   */
  setNestedConfig(key, value) {
    const keys = key.split('.');
    let current = this.defaultConfig;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;
  }

  /**
   * 获取配置值
   */
  get(key, defaultValue = null) {
    const keys = key.split('.');
    let current = this.defaultConfig;

    for (const k of keys) {
      if (current && typeof current === 'object' && k in current) {
        current = current[k];
      } else {
        return defaultValue;
      }
    }

    return current;
  }

  /**
   * 设置配置值
   */
  async set(key, value, options = {}) {
    try {
      const { persist = true, validate = true, emitEvent = true } = options;

      // 验证配置
      if (validate) {
        await this.validateConfig(key, value);
      }

      // 设置配置
      this.setNestedConfig(key, value);

      // 持久化到数据库
      if (persist) {
        await SystemConfigQueries.set(key, value, typeof value);
      }

      // 更新缓存
      this.configCache.set(key, {
        value,
        timestamp: Date.now()
      });

      // 发送事件
      if (emitEvent) {
        this.emit('configChanged', { key, value, timestamp: Date.now() });
      }

      logger.info(`配置更新成功: ${key}`);
      return new APIResponse({
        success: true,
        data: { key, value },
        message: '配置更新成功'
      });

    } catch (error) {
      logger.error(`配置更新失败: ${key}`, error);
      return new APIResponse({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * 验证配置
   */
  async validateConfig(key, value) {
    const configType = key.split('.')[0];
    const schema = this.configSchemas.get(configType);

    // 特殊验证
    if (key === 'newsapi.apiKey') {
      if (!value || typeof value !== 'string' || value.length < 10) {
        throw new ServiceError('NewsAPI密钥无效', 'INVALID_API_KEY');
      }
    }

    if (key.startsWith('translation.services.') && key.endsWith('.apiKey')) {
      if (value && typeof value !== 'string') {
        throw new ServiceError('翻译服务密钥格式错误', 'INVALID_API_KEY');
      }
    }

    // 如果是嵌套键，验证整个配置对象
    if (schema && key.includes('.')) {
      const configObj = this.get(configType);
      const errors = this.validateAgainstSchema(configObj, schema);
      if (errors.length > 0) {
        throw new ServiceError(`配置验证失败: ${errors.join(', ')}`, 'VALIDATION_ERROR');
      }
    }

    // 如果是根键，直接验证
    if (schema && !key.includes('.')) {
      const errors = this.validateAgainstSchema(value, schema);
      if (errors.length > 0) {
        throw new ServiceError(`配置验证失败: ${errors.join(', ')}`, 'VALIDATION_ERROR');
      }
    }
  }

  /**
   * 根据模式验证
   */
  validateAgainstSchema(data, schema) {
    const errors = [];

    if (schema.type === 'object') {
      if (typeof data !== 'object' || data === null) {
        errors.push('必须是对象');
        return errors;
      }

      if (schema.required) {
        for (const required of schema.required) {
          if (!(required in data)) {
            errors.push(`缺少必需字段: ${required}`);
          }
        }
      }

      if (schema.properties) {
        for (const [prop, propSchema] of Object.entries(schema.properties)) {
          if (prop in data) {
            this.validateProperty(data[prop], propSchema, errors, prop);
          }
        }
      }
    }

    return errors;
  }

  /**
   * 验证属性
   */
  validateProperty(value, schema, errors, propertyPath) {
    if (schema.type === 'integer') {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        errors.push(`${propertyPath} 必须是整数`);
      }
      if (schema.minimum !== undefined && value < schema.minimum) {
        errors.push(`${propertyPath} 不能小于 ${schema.minimum}`);
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        errors.push(`${propertyPath} 不能大于 ${schema.maximum}`);
      }
    }

    if (schema.type === 'string') {
      if (typeof value !== 'string') {
        errors.push(`${propertyPath} 必须是字符串`);
      }
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        errors.push(`${propertyPath} 长度不能小于 ${schema.minLength}`);
      }
    }

    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(`${propertyPath} 必须是以下值之一: ${schema.enum.join(', ')}`);
    }
  }

  /**
   * 获取所有配置
   */
  getAll() {
    return { ...this.defaultConfig };
  }

  /**
   * 获取配置统计
   */
  getConfigStats() {
    return {
      cacheSize: this.configCache.size,
      watcherCount: this.fileWatchers.size,
      isRunning: this.isRunning,
      configCount: this.countConfigKeys(this.defaultConfig),
      lastUpdated: this.configCache.size > 0 ?
        Math.max(...Array.from(this.configCache.values()).map(c => c.timestamp)) : null
    };
  }

  /**
   * 统计配置键数量
   */
  countConfigKeys(obj, prefix = '') {
    let count = 0;
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        count += this.countConfigKeys(value, `${prefix}${key}.`);
      } else {
        count++;
      }
    }
    return count;
  }

  /**
   * 重置配置
   */
  async reset(key, options = {}) {
    try {
      const { persist = true } = options;

      // 删除数据库配置
      if (persist) {
        await SystemConfigQueries.delete(key);
      }

      // 清除缓存
      this.configCache.delete(key);

      // 重置为默认值
      // 这里需要根据key找到对应的默认值并重置
      // 简化实现，直接从环境变量重新加载
      await this.loadConfigFiles();

      this.emit('configReset', { key, timestamp: Date.now() });
      logger.info(`配置重置成功: ${key}`);

      return new APIResponse({
        success: true,
        data: { key },
        message: '配置重置成功'
      });

    } catch (error) {
      logger.error(`配置重置失败: ${key}`, error);
      return new APIResponse({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * 启动文件监控
   */
  startFileWatching() {
    // 在Node.js中，可以使用fs.watch来监控文件变化
    // 这里简化实现，使用定时检查
    this.watchInterval = setInterval(async () => {
      try {
        await this.checkConfigChanges();
      } catch (error) {
        logger.warn('配置变化检查失败:', error.message);
      }
    }, 5000); // 每5秒检查一次
  }

  /**
   * 检查配置变化
   */
  async checkConfigChanges() {
    const configFiles = ['.env', 'config/default.json'];

    for (const configFile of configFiles) {
      try {
        const configPath = path.resolve(configFile);
        const stats = await fs.stat(configPath).catch(() => null);

        if (stats) {
          const lastCheck = this.fileWatchers.get(configFile);
          if (!lastCheck || stats.mtime > lastCheck) {
            this.fileWatchers.set(configFile, stats.mtime);

            // 重新加载配置文件
            const config = await this.loadConfigFile(configPath);
            this.mergeConfig(config);

            this.emit('configFileChanged', {
              file: configFile,
              timestamp: Date.now()
            });

            logger.info(`配置文件重新加载: ${configFile}`);
          }
        }
      } catch (error) {
        logger.warn(`配置文件检查失败: ${configFile}`, error.message);
      }
    }
  }

  /**
   * 启动配置验证
   */
  startConfigValidation() {
    // 定期验证配置
    setInterval(() => {
      try {
        this.validateAllConfigs();
      } catch (error) {
        logger.warn('配置验证失败:', error.message);
      }
    }, 60000); // 每分钟验证一次
  }

  /**
   * 验证所有配置
   */
  validateAllConfigs() {
    const errors = [];

    // 验证RSS配置
    const rssConfig = this.get('rss');
    const rssErrors = this.validateAgainstSchema(rssConfig, this.configSchemas.get('rss'));
    errors.push(...rssErrors.map(e => `rss.${e}`));

    // 验证NewsAPI配置
    const newsapiConfig = this.get('newsapi');
    const newsapiErrors = this.validateAgainstSchema(newsapiConfig, this.configSchemas.get('newsapi'));
    errors.push(...newsapiErrors.map(e => `newsapi.${e}`));

    if (errors.length > 0) {
      logger.warn('配置验证错误:', errors);
      this.emit('configValidationErrors', { errors, timestamp: Date.now() });
    }

    return errors;
  }

  /**
   * 停止服务
   */
  async stop() {
    try {
      if (this.watchInterval) {
        clearInterval(this.watchInterval);
        this.watchInterval = null;
      }

      this.configCache.clear();
      this.fileWatchers.clear();
      this.isRunning = false;

      logger.info('Config Management Service已停止');
    } catch (error) {
      logger.error('Config Management Service停止失败:', error);
    }
  }
}

export default ConfigManagementService;