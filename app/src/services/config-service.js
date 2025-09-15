/**
 * 配置管理服务
 * 负责系统配置的读取、验证和热加载
 */

import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';
import logger from '../utils/logger.js';
import Joi from 'joi';


// 配置验证模式
const configSchema = Joi.object({
  // AI服务配置
  ai: Joi.object({
    baseUrl: Joi.string().uri().default('https://api.openai.com/v1'),
    apiKey: Joi.string().required(),
    models: Joi.object({
      deep: Joi.string().default('gpt-4-turbo'),
      summary: Joi.string().default('gpt-3.5-turbo'),
      sentiment: Joi.string().default('claude-haiku'),
    }).default(),
    timeout: Joi.number().positive().default(30000),
    retries: Joi.number().min(0).max(5).default(3),
  }).default(),

  // 邮件服务配置
  email: Joi.object({
    resendApiKey: Joi.string().required(),
    fromEmail: Joi.string().email().required(),
    toEmail: Joi.string().email().required(),
    templates: Joi.object({
      daily: Joi.string().default('daily-digest'),
      realtime: Joi.string().default('realtime-notification'),
    }).default(),
  }).default(),

  // Supabase配置
  supabase: Joi.object({
    url: Joi.string().uri().required(),
    key: Joi.string().required(),
    maxStorageMB: Joi.number().positive().default(500),
  }).default(),

  // 调度配置
  scheduler: Joi.object({
    dailyDigest: Joi.object({
      hour: Joi.number().min(0).max(23).default(8),
      minute: Joi.number().min(0).max(59).default(0),
    }).default(),
    realtime: Joi.object({
      enabled: Joi.boolean().default(true),
      startHour: Joi.number().min(0).max(23).default(7),
      endHour: Joi.number().min(0).max(23).default(22),
      interval: Joi.number().positive().default(15),
    }).default(),
  }).default(),

  // 处理配置
  processing: Joi.object({
    maxArticlesPerSource: Joi.number().positive().default(10),
    summaryLength: Joi.number().positive().default(200),
    cacheTimeout: Joi.number().positive().default(3600000),
    batchSize: Joi.number().positive().default(50),
  }).default(),

  // 数据库配置
  database: Joi.object({
    cleanupSchedule: Joi.string().default('0 2 * * *'),
    dataRetention: Joi.object({
      newsDays: Joi.number().positive().default(30),
      emailLogDays: Joi.number().positive().default(7),
      errorLogDays: Joi.number().positive().default(3),
    }).default(),
  }).default(),

  // 服务器配置
  server: Joi.object({
    port: Joi.number().positive().default(3000),
    host: Joi.string().default('0.0.0.0'),
    cors: Joi.object({
      origin: Joi.alternatives().try(
        Joi.string(),
        Joi.array().items(Joi.string())
      ).default('http://localhost:3000'),
    }).default(),
  }).default(),

  // 监控配置
  monitoring: Joi.object({
    logLevel: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
    healthCheckInterval: Joi.number().positive().default(30000),
    alertThresholds: Joi.object({
      errorRate: Joi.number().min(0).max(1).default(0.05),
      responseTime: Joi.number().positive().default(5000),
      storageUsage: Joi.number().min(0).max(1).default(0.9),
    }).default(),
  }).default(),
});

class ConfigService {
  constructor() {
    this.config = {};
    this.watchers = new Set();
    this.isInitialized = false;
  }

  /**
   * 初始化配置服务
   */
  async initialize() {
    try {
      logger.info('🔧 初始化配置服务...');

      // 加载默认配置
      await this.loadDefaultConfig();

      // 加载环境变量配置
      this.loadEnvironmentConfig();

      // 加载配置文件
      await this.loadFileConfig();

      // 验证配置
      await this.validateConfig();

      // 启动配置监听（开发环境）
      if (process.env.NODE_ENV === 'development') {
        await this.startConfigWatcher();
      }

      this.isInitialized = true;
      logger.info('✅ 配置服务初始化完成');

    } catch (error) {
      logger.error('❌ 配置服务初始化失败:', error);
      throw error;
    }
  }

  /**
   * 加载默认配置
   */
  async loadDefaultConfig() {
    this.config = {
      ai: {
        baseUrl: 'https://api.openai.com/v1',
        models: {
          deep: 'gpt-4-turbo',
          summary: 'gpt-3.5-turbo',
          sentiment: 'claude-haiku',
        },
        timeout: 30000,
        retries: 3,
      },
      email: {
        templates: {
          daily: 'daily-digest',
          realtime: 'realtime-notification',
        },
      },
      scheduler: {
        dailyDigest: {
          hour: 8,
          minute: 0,
        },
        realtime: {
          enabled: true,
          startHour: 7,
          endHour: 22,
          interval: 15,
        },
      },
      processing: {
        maxArticlesPerSource: 10,
        summaryLength: 200,
        cacheTimeout: 3600000,
        batchSize: 50,
      },
      database: {
        cleanupSchedule: '0 2 * * *',
        dataRetention: {
          newsDays: 30,
          emailLogDays: 7,
          errorLogDays: 3,
        },
      },
      server: {
        port: 3000,
        host: '0.0.0.0',
        cors: {
          origin: 'http://localhost:3000',
        },
      },
      monitoring: {
        logLevel: 'info',
        healthCheckInterval: 30000,
        alertThresholds: {
          errorRate: 0.05,
          responseTime: 5000,
          storageUsage: 0.9,
        },
      },
    };
  }

  /**
   * 加载环境变量配置
   */
  loadEnvironmentConfig() {
    const envMapping = {
      // AI服务
      'AI_BASE_URL': 'ai.baseUrl',
      'AI_API_KEY': 'ai.apiKey',
      'AI_MODEL_DEEP': 'ai.models.deep',
      'AI_MODEL_SUMMARY': 'ai.models.summary',
      'AI_MODEL_SENTIMENT': 'ai.models.sentiment',
      'AI_TIMEOUT': 'ai.timeout',
      'AI_RETRIES': 'ai.retries',

      // 邮件服务
      'RESEND_API_KEY': 'email.resendApiKey',
      'RESEND_FROM_EMAIL': 'email.fromEmail',
      'RESEND_TO_EMAIL': 'email.toEmail',

      // Supabase
      'SUPABASE_URL': 'supabase.url',
      'SUPABASE_KEY': 'supabase.key',
      'SUPABASE_MAX_STORAGE_MB': 'supabase.maxStorageMB',

      // 调度配置
      'DAILY_DIGEST_HOUR': 'scheduler.dailyDigest.hour',
      'DAILY_DIGEST_MINUTE': 'scheduler.dailyDigest.minute',
      'REALTIME_ENABLED': 'scheduler.realtime.enabled',
      'REALTIME_START_HOUR': 'scheduler.realtime.startHour',
      'REALTIME_END_HOUR': 'scheduler.realtime.endHour',
      'REALTIME_INTERVAL': 'scheduler.realtime.interval',

      // 处理配置
      'MAX_ARTICLES_PER_SOURCE': 'processing.maxArticlesPerSource',
      'SUMMARY_LENGTH': 'processing.summaryLength',
      'CACHE_TIMEOUT': 'processing.cacheTimeout',
      'BATCH_SIZE': 'processing.batchSize',

      // 服务器配置
      'PORT': 'server.port',
      'HOST': 'server.host',

      // 监控配置
      'LOG_LEVEL': 'monitoring.logLevel',
      'HEALTH_CHECK_INTERVAL': 'monitoring.healthCheckInterval',
    };

    for (const [envKey, configPath] of Object.entries(envMapping)) {
      const envValue = process.env[envKey];
      if (envValue !== undefined) {
        this.setNestedValue(this.config, configPath, this.parseValue(envValue));
      }
    }
  }

  /**
   * 加载配置文件
   */
  async loadFileConfig() {
    const configDir = path.join(process.cwd(), 'config');

    try {
      // 检查配置目录是否存在
      await fs.access(configDir);
    } catch {
      // 配置目录不存在，创建默认配置
      await this.createDefaultConfigFiles(configDir);
      return;
    }

    // 加载不同环境的配置文件
    const env = process.env.NODE_ENV || 'development';
    const configFiles = [
      'default.json',
      `${env}.json`,
      'local.json', // 本地覆盖配置
    ];

    for (const configFile of configFiles) {
      const configPath = path.join(configDir, configFile);

      try {
        const configData = await fs.readFile(configPath, 'utf8');
        const fileConfig = JSON.parse(configData);
        this.config = this.mergeDeep(this.config, fileConfig);
        logger.info(`📄 已加载配置文件: ${configFile}`);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          logger.warn(`⚠️ 加载配置文件失败 ${configFile}:`, error.message);
        }
      }
    }
  }

  /**
   * 创建默认配置文件
   */
  async createDefaultConfigFiles(configDir) {
    try {
      await fs.mkdir(configDir, { recursive: true });

      const defaultConfig = {
        ai: {
          baseUrl: 'https://api.openai.com/v1',
          models: {
            deep: 'gpt-4-turbo',
            summary: 'gpt-3.5-turbo',
            sentiment: 'claude-haiku',
          },
        },
        scheduler: {
          dailyDigest: { hour: 8, minute: 0 },
          realtime: { enabled: true, startHour: 7, endHour: 22, interval: 15 },
        },
        processing: {
          maxArticlesPerSource: 10,
          summaryLength: 200,
          cacheTimeout: 3600000,
        },
        server: { port: 3000, host: '0.0.0.0' },
        monitoring: { logLevel: 'info' },
      };

      await fs.writeFile(
        path.join(configDir, 'default.json'),
        JSON.stringify(defaultConfig, null, 2)
      );

      logger.info('📄 已创建默认配置文件');
    } catch (error) {
      logger.error('❌ 创建默认配置文件失败:', error);
    }
  }

  /**
   * 验证配置
   */
  async validateConfig() {
    try {
      await configSchema.validateAsync(this.config, {
        abortEarly: false,
        allowUnknown: true,
      });
      logger.info('✅ 配置验证通过');
    } catch (error) {
      logger.error('❌ 配置验证失败:', error.details);
      throw new Error(`配置验证失败: ${error.details.map(d => d.message).join(', ')}`);
    }
  }

  /**
   * 启动配置监听（开发环境）
   */
  async startConfigWatcher() {
    const configDir = path.join(process.cwd(), 'config');

    try {
      const watcher = fs.watch(configDir, { recursive: true }, async (eventType, filename) => {
        if (eventType === 'change' && filename.endsWith('.json')) {
          logger.info(`🔄 检测到配置文件变更: ${filename}`);
          await this.hotReloadConfig();
        }
      });

      process.on('SIGINT', () => watcher.close());
      process.on('SIGTERM', () => watcher.close());
    } catch (error) {
      logger.warn('⚠️ 配置文件监听启动失败:', error.message);
    }
  }

  /**
   * 热加载配置
   */
  async hotReloadConfig() {
    try {
      // 保存当前配置用于回滚
      const oldConfig = JSON.parse(JSON.stringify(this.config));

      // 重新加载配置
      await this.loadFileConfig();
      await this.validateConfig();

      // 通知监听器
      this.notifyConfigChange();

      logger.info('✅ 配置热加载成功');

    } catch (error) {
      logger.error('❌ 配置热加载失败:', error);
      // 可以选择回滚到旧配置
    }
  }

  /**
   * 获取配置值
   */
  get(key, defaultValue = undefined) {
    return this.getNestedValue(this.config, key, defaultValue);
  }

  /**
   * 设置配置值
   */
  async set(key, value) {
    const oldValue = this.getNestedValue(this.config, key);
    this.setNestedValue(this.config, key, value);

    try {
      await this.validateConfig();
      this.notifyConfigChange(key, value, oldValue);
      logger.info(`✅ 配置已更新: ${key} = ${value}`);
    } catch (error) {
      // 回滚到旧值
      this.setNestedValue(this.config, key, oldValue);
      throw error;
    }
  }

  /**
   * 获取完整配置
   */
  getAll() {
    return JSON.parse(JSON.stringify(this.config));
  }

  /**
   * 添加配置变更监听器
   */
  addConfigWatcher(callback) {
    this.watchers.add(callback);
    return () => this.watchers.delete(callback);
  }

  /**
   * 通知配置变更
   */
  notifyConfigChange(key, newValue, oldValue) {
    for (const callback of this.watchers) {
      try {
        callback({ key, newValue, oldValue, config: this.config });
      } catch (error) {
        logger.error('配置变更监听器执行失败:', error);
      }
    }
  }

  /**
   * 获取嵌套对象值
   */
  getNestedValue(obj, path, defaultValue = undefined) {
    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current === null || current === undefined) {
        return defaultValue;
      }
      current = current[key];
    }

    return current;
  }

  /**
   * 设置嵌套对象值
   */
  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (current[key] === undefined || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }

  /**
   * 深度合并对象
   */
  mergeDeep(target, source) {
    const output = Object.assign({}, target);

    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.mergeDeep(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }

    return output;
  }

  /**
   * 检查是否为对象
   */
  isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  /**
   * 解析环境变量值
   */
  parseValue(value) {
    // 尝试解析为JSON
    if (value.startsWith('{') || value.startsWith('[')) {
      try {
        return JSON.parse(value);
      } catch {
        // 不是JSON，继续其他解析
      }
    }

    // 尝试解析为数字
    if (/^-?\d+$/.test(value)) {
      return parseInt(value, 10);
    }

    // 尝试解析为浮点数
    if (/^-?\d+\.\d+$/.test(value)) {
      return parseFloat(value);
    }

    // 尝试解析为布尔值
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    // 返回字符串
    return value;
  }

  /**
   * 关闭服务
   */
  async shutdown() {
    this.watchers.clear();
    logger.info('✅ 配置服务已关闭');
  }
}

export default ConfigService;