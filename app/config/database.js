/**
 * 数据库配置模块
 * 提供数据库连接和配置管理
 */

import logger from '../src/utils/logger.js';
import supabaseIntegration from '../src/integrations/supabase.js';

class DatabaseConfig {
  constructor() {
    this.initialized = false;
    this.pool = null;
  }

  /**
   * 初始化数据库配置
   */
  async initialize() {
    try {
      logger.info('🔧 初始化数据库配置...');

      // 初始化Supabase连接
      await supabaseIntegration.initialize();

      // 配置数据库连接池
      await this.setupConnectionPool();

      // 运行数据库健康检查
      await this.healthCheck();

      this.initialized = true;
      logger.info('✅ 数据库配置初始化完成');

    } catch (error) {
      logger.error('❌ 数据库配置初始化失败:', error);
      throw error;
    }
  }

  /**
   * 设置连接池配置
   */
  async setupConnectionPool() {
    try {
      // 获取数据库配置
      const poolConfig = await this.getPoolConfig();

      // 设置连接池参数
      if (process.env.NODE_ENV === 'production') {
        // 生产环境连接池配置
        poolConfig.max = 20;
        poolConfig.min = 5;
        poolConfig.idleTimeoutMillis = 30000;
        poolConfig.connectionTimeoutMillis = 30000;
      } else {
        // 开发环境连接池配置
        poolConfig.max = 10;
        poolConfig.min = 2;
        poolConfig.idleTimeoutMillis = 60000;
        poolConfig.connectionTimeoutMillis = 5000;
      }

      logger.info('🔧 数据库连接池配置完成', poolConfig);

    } catch (error) {
      logger.error('❌ 设置连接池失败:', error);
      throw error;
    }
  }

  /**
   * 获取连接池配置
   */
  async getPoolConfig() {
    return {
      // 基础连接配置
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'news_aggregator',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',

      // 连接池配置
      max: parseInt(process.env.DB_POOL_MAX) || 10,
      min: parseInt(process.env.DB_POOL_MIN) || 2,
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 30000,

      // SSL配置
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,

      // 查询超时
      statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT) || 30000,

      // 应用名称
      application_name: 'news-aggregator',
    };
  }

  /**
   * 数据库健康检查
   */
  async healthCheck() {
    try {
      const startTime = Date.now();

      // 使用Supabase进行健康检查
      const healthResult = await supabaseIntegration.healthCheck();

      const responseTime = Date.now() - startTime;

      logger.info('🏥 数据库健康检查完成', {
        status: healthResult.status,
        responseTime: `${responseTime}ms`,
        timestamp: healthResult.timestamp,
      });

      return {
        status: healthResult.status,
        responseTime,
        timestamp: new Date().toISOString(),
        details: healthResult,
      };

    } catch (error) {
      logger.error('❌ 数据库健康检查失败:', error);
      return {
        status: 'error',
        message: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * 获取数据库统计信息
   */
  async getStats() {
    try {
      // 通过Supabase获取系统统计信息
      const stats = await supabaseIntegration.getSystemStats();

      return {
        database: {
          status: 'connected',
          type: 'supabase',
          version: '15.1.0.89',
        },
        tables: {
          rss_sources: stats.rssSources,
          news_articles: stats.articles,
          users: stats.users,
          system_logs: stats.systemLogs || 0,
        },
        performance: {
          recent_articles: stats.recentArticles,
          storage_usage: stats.storageUsage,
        },
        health: await this.healthCheck(),
      };

    } catch (error) {
      logger.error('❌ 获取数据库统计失败:', error);
      throw error;
    }
  }

  /**
   * 测试数据库连接
   */
  async testConnection() {
    try {
      // 简单的连接测试
      const { data, error } = await supabaseIntegration.getClient()
        .from('system_config')
        .select('config_key')
        .limit(1);

      if (error) {
        throw new Error(`Connection test failed: ${error.message}`);
      }

      return {
        success: true,
        message: 'Database connection test successful',
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      logger.error('❌ 数据库连接测试失败:', error);
      return {
        success: false,
        message: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * 执行原始查询
   */
  async executeQuery(query, params = []) {
    try {
      // 注意：在Supabase中，通常建议使用RPC或内置方法
      // 这里提供基本的查询功能
      const client = supabaseIntegration.getClient();

      // 对于复杂查询，建议创建RPC函数
      logger.warn('⚠️ 使用原始查询，建议创建RPC函数', { query });

      throw new Error('Raw queries should be replaced with RPC functions or built-in Supabase methods');

    } catch (error) {
      logger.error('❌ 执行查询失败:', error);
      throw error;
    }
  }

  /**
   * 监控数据库性能
   */
  async startPerformanceMonitoring() {
    try {
      // 定期检查数据库性能
      setInterval(async () => {
        try {
          const stats = await this.getStats();

          // 检查存储使用情况
          if (stats.performance.storage_usage) {
            const usagePercentage = (stats.performance.storage_usage.totalMB / 500) * 100;

            if (usagePercentage > 80) {
              logger.warn('⚠️ 数据库存储使用率过高', {
                usagePercentage: `${usagePercentage.toFixed(2)}%`,
                threshold: '80%',
              });
            }
          }

          // 记录性能指标
          await supabaseIntegration.logSystemLog(
            'info',
            'Database performance metrics collected',
            'database',
            {
              stats,
              timestamp: new Date().toISOString(),
            }
          );

        } catch (error) {
          logger.error('❌ 性能监控失败:', error);
        }
      }, 300000); // 每5分钟检查一次

      logger.info('📊 数据库性能监控已启动');

    } catch (error) {
      logger.error('❌ 启动性能监控失败:', error);
    }
  }

  /**
   * 获取配置建议
   */
  getConfigurationRecommendations() {
    const env = process.env.NODE_ENV || 'development';

    if (env === 'production') {
      return {
        pool: {
          max: 20,
          min: 5,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 30000,
        },
        monitoring: {
          interval: 300000,
          storageThreshold: 80,
        },
        backup: {
          enabled: true,
          schedule: '0 2 * * *',
          retention: 7,
        },
      };
    } else {
      return {
        pool: {
          max: 10,
          min: 2,
          idleTimeoutMillis: 60000,
          connectionTimeoutMillis: 5000,
        },
        monitoring: {
          interval: 600000,
          storageThreshold: 90,
        },
        backup: {
          enabled: false,
        },
      };
    }
  }

  /**
   * 验证配置
   */
  async validateConfiguration() {
    const errors = [];
    const warnings = [];

    // 检查必需的环境变量
    const requiredEnvVars = [
      'SUPABASE_URL',
      'SUPABASE_KEY',
    ];

    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        errors.push(`Missing required environment variable: ${envVar}`);
      }
    }

    // 检查配置值
    if (process.env.DB_POOL_MAX && parseInt(process.env.DB_POOL_MAX) > 50) {
      warnings.push('DB_POOL_MAX is set very high, consider reducing it');
    }

    if (process.env.DB_CONNECTION_TIMEOUT && parseInt(process.env.DB_CONNECTION_TIMEOUT) > 60000) {
      warnings.push('DB_CONNECTION_TIMEOUT is set very high, consider reducing it');
    }

    // 测试连接
    try {
      const connectionTest = await this.testConnection();
      if (!connectionTest.success) {
        errors.push(`Database connection test failed: ${connectionTest.message}`);
      }
    } catch (error) {
      errors.push(`Database connection test error: ${error.message}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 关闭数据库连接
   */
  async shutdown() {
    try {
      logger.info('🛑 开始关闭数据库连接...');

      // 关闭Supabase连接
      await supabaseIntegration.shutdown();

      this.initialized = false;
      logger.info('✅ 数据库连接已关闭');

    } catch (error) {
      logger.error('❌ 关闭数据库连接失败:', error);
    }
  }

  /**
   * 获取数据库客户端
   */
  getClient() {
    if (!this.initialized) {
      throw new Error('Database not initialized');
    }
    return supabaseIntegration.getClient();
  }

  /**
   * 检查是否已初始化
   */
  isInitialized() {
    return this.initialized;
  }
}

// 创建单例实例
const databaseConfig = new DatabaseConfig();

export default databaseConfig;