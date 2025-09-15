/**
 * Supabase配置模块
 * 专门处理Supabase相关的配置和连接管理
 */

import { createClient } from '@supabase/supabase-js';
import logger from '../src/utils/logger.js';

class SupabaseConfig {
  constructor() {
    this.client = null;
    this.initialized = false;
    this.serviceKey = null;
    this.anonKey = null;
    this.projectUrl = null;
  }

  /**
   * 初始化Supabase配置
   */
  async initialize() {
    try {
      logger.info('🔧 初始化Supabase配置...');

      // 加载配置
      this.loadConfiguration();

      // 验证配置
      this.validateConfiguration();

      // 创建客户端
      this.createClient();

      // 测试连接
      await this.testConnection();

      this.initialized = true;
      logger.info('✅ Supabase配置初始化完成', {
        projectUrl: this.projectUrl,
        hasServiceKey: !!this.serviceKey,
        hasAnonKey: !!this.anonKey,
      });

    } catch (error) {
      logger.error('❌ Supabase配置初始化失败:', error);
      throw error;
    }
  }

  /**
   * 加载配置
   */
  loadConfiguration() {
    // 从环境变量加载配置
    this.projectUrl = process.env.SUPABASE_URL;
    this.anonKey = process.env.SUPABASE_KEY;
    this.serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // 存储限制配置
    this.maxStorageMB = parseInt(process.env.SUPABASE_MAX_STORAGE_MB || '500');
    this.storageWarningThreshold = parseFloat(process.env.SUPABASE_STORAGE_WARNING_THRESHOLD || '0.8');
    this.storageCriticalThreshold = parseFloat(process.env.SUPABASE_STORAGE_CRITICAL_THRESHOLD || '0.95');

    // 连接池配置
    this.poolConfig = {
      max: parseInt(process.env.SUPABASE_POOL_MAX || '10'),
      min: parseInt(process.env.SUPABASE_POOL_MIN || '2'),
      idleTimeoutMillis: parseInt(process.env.SUPABASE_POOL_IDLE_TIMEOUT || '30000'),
      connectionTimeoutMillis: parseInt(process.env.SUPABASE_POOL_CONNECTION_TIMEOUT || '30000'),
    };

    // 超时配置
    this.timeouts = {
      connect: parseInt(process.env.SUPABASE_CONNECT_TIMEOUT || '30000'),
      read: parseInt(process.env.SUPABASE_READ_TIMEOUT || '30000'),
      write: parseInt(process.env.SUPABASE_WRITE_TIMEOUT || '30000'),
    };

    // 重试配置
    this.retryConfig = {
      maxRetries: parseInt(process.env.SUPABASE_MAX_RETRIES || '3'),
      retryDelay: parseInt(process.env.SUPABASE_RETRY_DELAY || '1000'),
    };

    // 缓存配置
    this.cacheConfig = {
      enabled: process.env.SUPABASE_CACHE_ENABLED === 'true',
      ttl: parseInt(process.env.SUPABASE_CACHE_TTL || '3600'),
      maxSize: parseInt(process.env.SUPABASE_CACHE_MAX_SIZE || '1000'),
    };
  }

  /**
   * 验证配置
   */
  validateConfiguration() {
    const errors = [];

    // 检查必需的配置
    if (!this.projectUrl) {
      errors.push('SUPABASE_URL is required');
    }

    if (!this.anonKey) {
      errors.push('SUPABASE_KEY is required');
    }

    // 验证URL格式
    try {
      new URL(this.projectUrl);
    } catch {
      errors.push('SUPABASE_URL must be a valid URL');
    }

    // 验证存储配置
    if (this.maxStorageMB <= 0 || this.maxStorageMB > 10000) {
      errors.push('SUPABASE_MAX_STORAGE_MB must be between 1 and 10000');
    }

    if (this.storageWarningThreshold < 0 || this.storageWarningThreshold > 1) {
      errors.push('SUPABASE_STORAGE_WARNING_THRESHOLD must be between 0 and 1');
    }

    if (this.storageCriticalThreshold < 0 || this.storageCriticalThreshold > 1) {
      errors.push('SUPABASE_STORAGE_CRITICAL_THRESHOLD must be between 0 and 1');
    }

    if (this.storageCriticalThreshold <= this.storageWarningThreshold) {
      errors.push('SUPABASE_STORAGE_CRITICAL_THRESHOLD must be greater than SUPABASE_STORAGE_WARNING_THRESHOLD');
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
    }
  }

  /**
   * 创建Supabase客户端
   */
  createClient() {
    const clientOptions = {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      db: {
        schema: 'public',
      },
      global: {
        headers: {
          'x-application-name': 'news-aggregator',
          'x-application-version': '1.0.0',
        },
      },
    };

    // 创建主要客户端（使用anon key）
    this.client = createClient(this.projectUrl, this.anonKey, clientOptions);

    // 如果有service key，创建服务角色客户端
    if (this.serviceKey) {
      this.serviceClient = createClient(this.projectUrl, this.serviceKey, {
        ...clientOptions,
        db: {
          schema: 'public',
        },
      });
    }
  }

  /**
   * 测试连接
   */
  async testConnection() {
    try {
      const startTime = Date.now();

      // 使用简单的查询测试连接
      const { data, error } = await this.client
        .from('system_config')
        .select('config_key')
        .limit(1);

      const responseTime = Date.now() - startTime;

      if (error) {
        throw new Error(`Connection test failed: ${error.message}`);
      }

      logger.info('🔌 Supabase连接测试成功', {
        responseTime: `${responseTime}ms`,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        responseTime,
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      logger.error('❌ Supabase连接测试失败:', error);
      throw error;
    }
  }

  /**
   * 获取客户端
   */
  getClient(useServiceRole = false) {
    if (!this.initialized) {
      throw new Error('Supabase not initialized');
    }

    if (useServiceRole && this.serviceClient) {
      return this.serviceClient;
    }

    return this.client;
  }

  /**
   * 获取配置
   */
  getConfig() {
    return {
      projectUrl: this.projectUrl,
      maxStorageMB: this.maxStorageMB,
      storageWarningThreshold: this.storageWarningThreshold,
      storageCriticalThreshold: this.storageCriticalThreshold,
      poolConfig: this.poolConfig,
      timeouts: this.timeouts,
      retryConfig: this.retryConfig,
      cacheConfig: this.cacheConfig,
      hasServiceKey: !!this.serviceKey,
    };
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    try {
      const startTime = Date.now();

      // 测试基本连接
      const { error: connectionError } = await this.client
        .from('system_config')
        .select('count')
        .limit(1);

      if (connectionError) {
        throw new Error(`Connection test failed: ${connectionError.message}`);
      }

      // 测试RPC函数
      const { error: rpcError } = await this.client.rpc('get_database_size');

      const responseTime = Date.now() - startTime;

      if (rpcError && !rpcError.message.includes('does not exist')) {
        throw new Error(`RPC test failed: ${rpcError.message}`);
      }

      return {
        status: 'healthy',
        responseTime,
        timestamp: new Date().toISOString(),
        details: {
          connection: 'ok',
          rpc: rpcError ? 'not_available' : 'ok',
          serviceRole: !!this.serviceClient,
        },
      };

    } catch (error) {
      logger.error('❌ Supabase健康检查失败:', error);
      return {
        status: 'unhealthy',
        message: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * 获取存储使用情况
   */
  async getStorageUsage() {
    try {
      // 尝试使用RPC函数
      const { data, error } = await this.client.rpc('check_storage_usage');

      if (error) {
        logger.warn('⚠️ RPC function not available, using fallback method');

        // 回退方法：查询表大小
        const tables = ['news_articles', 'rss_sources', 'users', 'system_logs', 'email_logs'];
        const sizes = {};

        for (const table of tables) {
          try {
            const { data: tableData } = await this.client
              .from(table)
              .select('*', { count: 'exact', head: true });

            sizes[table] = {
              rowCount: tableData.count || 0,
              estimatedSizeMB: tableData.count * 0.1, // 粗略估计
            };
          } catch (err) {
            logger.warn(`⚠️ Failed to get size for table ${table}:`, err.message);
          }
        }

        const totalMB = Object.values(sizes).reduce((sum, table) => sum + table.estimatedSizeMB, 0);

        return {
          totalMB,
          tables: Object.entries(sizes).map(([name, info]) => ({
            table_name: name,
            table_size_mb: info.estimatedSizeMB,
            row_count: info.rowCount,
          })),
        };
      }

      return data;

    } catch (error) {
      logger.error('❌ 获取存储使用情况失败:', error);
      throw error;
    }
  }

  /**
   * 配置验证工具
   */
  validateEnvironmentVariables() {
    const required = ['SUPABASE_URL', 'SUPABASE_KEY'];
    const optional = [
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_MAX_STORAGE_MB',
      'SUPABASE_STORAGE_WARNING_THRESHOLD',
      'SUPABASE_STORAGE_CRITICAL_THRESHOLD',
    ];

    const missing = required.filter(key => !process.env[key]);
    const present = optional.filter(key => process.env[key]);

    return {
      required: {
        missing,
        present: required.filter(key => process.env[key]),
      },
      optional: {
        present,
        missing: optional.filter(key => !process.env[key]),
      },
      valid: missing.length === 0,
    };
  }

  /**
   * 生成配置文档
   */
  generateConfigDocumentation() {
    return {
      description: 'Supabase Configuration for News Aggregator System',
      requiredVariables: [
        {
          name: 'SUPABASE_URL',
          description: 'Your Supabase project URL',
          example: 'https://your-project.supabase.co',
        },
        {
          name: 'SUPABASE_KEY',
          description: 'Your Supabase anonymous key',
          example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
      ],
      optionalVariables: [
        {
          name: 'SUPABASE_SERVICE_ROLE_KEY',
          description: 'Service role key for administrative operations',
          example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
        {
          name: 'SUPABASE_MAX_STORAGE_MB',
          description: 'Maximum storage limit in MB',
          default: '500',
        },
        {
          name: 'SUPABASE_STORAGE_WARNING_THRESHOLD',
          description: 'Storage usage warning threshold (0-1)',
          default: '0.8',
        },
        {
          name: 'SUPABASE_STORAGE_CRITICAL_THRESHOLD',
          description: 'Storage usage critical threshold (0-1)',
          default: '0.95',
        },
      ],
      currentConfig: this.getConfig(),
    };
  }

  /**
   * 关闭连接
   */
  async shutdown() {
    try {
      this.client = null;
      this.serviceClient = null;
      this.initialized = false;
      logger.info('✅ Supabase配置已关闭');
    } catch (error) {
      logger.error('❌ 关闭Supabase配置失败:', error);
    }
  }
}

// 创建单例实例
const supabaseConfig = new SupabaseConfig();

export default supabaseConfig;