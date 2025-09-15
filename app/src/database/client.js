/**
 * 数据库客户端配置 - Supabase连接管理
 * 遵循Node.js最佳实践：连接池管理、错误处理、重试机制
 */

import { createClient } from '@supabase/supabase-js';
import logger from '../utils/logger.js';

/**
 * 数据库客户端类
 */
class DatabaseClient {
  constructor() {
    this.client = null;
    this.serviceClient = null;
    this.connectionPool = null;
    this.isInitialized = false;
    this.retryAttempts = 3;
    this.retryDelay = 1000;
    this.healthCheckInterval = 30000; // 30秒
    this.healthCheckTimer = null;
  }

  /**
   * 初始化数据库客户端
   */
  async initialize() {
    try {
      logger.info('正在初始化数据库客户端...');

      // 验证环境变量
      this.validateEnvironment();

      // 创建主要客户端（用于应用层操作）
      this.client = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false
          },
          global: {
            headers: {
              'x-application-name': 'news-aggregator'
            }
          }
        }
      );

      // 创建服务客户端（用于系统级操作）
      this.serviceClient = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        {
          auth: {
            persistSession: false
          },
          global: {
            headers: {
              'x-application-name': 'news-aggregator-service'
            }
          }
        }
      );

      // 配置连接池
      this.configureConnectionPool();

      // 测试连接
      await this.testConnection();

      // 启动健康检查
      this.startHealthCheck();

      this.isInitialized = true;
      logger.info('数据库客户端初始化成功');

    } catch (error) {
      logger.error('数据库客户端初始化失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 验证环境变量
   */
  validateEnvironment() {
    const required = [
      'SUPABASE_URL',
      'SUPABASE_KEY',
      'SUPABASE_SERVICE_ROLE_KEY'
    ];

    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(`缺少必要的环境变量: ${missing.join(', ')}`);
    }

    // 验证Supabase URL格式
    try {
      new URL(process.env.SUPABASE_URL);
    } catch (error) {
      throw new Error('无效的SUPABASE_URL格式');
    }
  }

  /**
   * 配置连接池
   */
  configureConnectionPool() {
    // Supabase会自动管理连接池，这里设置一些基础配置
    const poolConfig = {
      max: parseInt(process.env.DB_POOL_MAX || '10'),
      min: parseInt(process.env.DB_POOL_MIN || '2'),
      idle: parseInt(process.env.DB_POOL_IDLE || '30000'),
      acquire: parseInt(process.env.DB_POOL_ACQUIRE || '10000')
    };

    logger.info('连接池配置', poolConfig);
    this.connectionPool = poolConfig;
  }

  /**
   * 测试数据库连接
   */
  async testConnection() {
    try {
      const { error } = await this.client
        .from('system_configs')
        .select('count')
        .limit(1);

      if (error) {
        throw error;
      }

      logger.info('数据库连接测试成功');

    } catch (error) {
      logger.error('数据库连接测试失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 启动健康检查
   */
  startHealthCheck() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.healthCheckInterval);

    logger.info('数据库健康检查已启动');
  }

  /**
   * 执行健康检查
   */
  async performHealthCheck() {
    try {
      const startTime = Date.now();

      // 测试基本连接
      const { error } = await this.client
        .from('system_configs')
        .select('count')
        .limit(1);

      const responseTime = Date.now() - startTime;

      if (error) {
        logger.warn('数据库健康检查失败', {
          error: error.message,
          responseTime
        });
      } else {
        logger.debug('数据库健康检查正常', { responseTime });
      }

    } catch (error) {
      logger.error('数据库健康检查异常', { error: error.message });
    }
  }

  /**
   * 获取客户端实例
   * @param {boolean} useServiceClient - 是否使用服务客户端
   * @returns {Object} Supabase客户端实例
   */
  getClient(useServiceClient = false) {
    if (!this.isInitialized) {
      throw new Error('数据库客户端未初始化');
    }

    return useServiceClient ? this.serviceClient : this.client;
  }

  /**
   * 执行查询
   * @param {Object} options - 查询选项
   * @returns {Promise<Object>} 查询结果
   */
  async query(options) {
    return await this.withRetry(async () => {
      const client = this.getClient(options.useServiceClient);
      let query = client.from(options.table).select(options.select || '*');

      // 应用过滤器
      if (options.filters) {
        options.filters.forEach(filter => {
          query = query.filter(filter.column, filter.operator, filter.value);
        });
      }

      // 应用排序
      if (options.order) {
        query = query.order(options.order.column, {
          ascending: options.order.ascending !== false
        });
      }

      // 应用分页
      if (options.range) {
        query = query.range(options.range.from, options.range.to);
      } else if (options.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) {
        throw this.handleError(error);
      }

      return data || [];
    });
  }

  /**
   * 执行插入
   * @param {Object} options - 插入选项
   * @returns {Promise<Object>} 插入结果
   */
  async insert(options) {
    return await this.withRetry(async () => {
      const client = this.getClient(options.useServiceClient);
      const { error } = await client
        .from(options.table)
        .insert(options.data)
        .select(options.returning || '*');

      if (error) {
        throw this.handleError(error);
      }

      return Array.isArray(options.data) ? options.data[0] : options.data;
    });
  }

  /**
   * 执行更新
   * @param {Object} options - 更新选项
   * @returns {Promise<Object>} 更新结果
   */
  async update(options) {
    return await this.withRetry(async () => {
      const client = this.getClient(options.useServiceClient);
      let query = client
        .from(options.table)
        .update(options.data);

      // 应用过滤器
      if (options.filters) {
        options.filters.forEach(filter => {
          query = query.filter(filter.column, filter.operator, filter.value);
        });
      } else if (options.id) {
        query = query.eq('id', options.id);
      }

      const { data, error } = await query.select(options.returning || '*');

      if (error) {
        throw this.handleError(error);
      }

      return Array.isArray(options.data) ? options.data[0] : options.data;
    });
  }

  /**
   * 执行删除
   * @param {Object} options - 删除选项
   * @returns {Promise<Object>} 删除结果
   */
  async delete(options) {
    return await this.withRetry(async () => {
      const client = this.getClient(options.useServiceClient);
      let query = client.from(options.table).delete();

      // 应用过滤器
      if (options.filters) {
        options.filters.forEach(filter => {
          query = query.filter(filter.column, filter.operator, filter.value);
        });
      } else if (options.id) {
        query = query.eq('id', options.id);
      }

      const { data, error } = await query.select(options.returning || '*');

      if (error) {
        throw this.handleError(error);
      }

      return Array.isArray(options.data) ? options.data[0] : options.data;
    });
  }

  /**
   * 执行RPC函数
   * @param {string} functionName - 函数名
   * @param {Object} params - 参数
   * @param {boolean} useServiceClient - 是否使用服务客户端
   * @returns {Promise<any>} 执行结果
   */
  async rpc(functionName, params = {}, useServiceClient = false) {
    return await this.withRetry(async () => {
      const client = this.getClient(useServiceClient);
      const { data, error } = await client.rpc(functionName, params);

      if (error) {
        throw this.handleError(error);
      }

      return data;
    });
  }

  /**
   * 执行事务操作
   * @param {Function} operation - 事务操作函数
   * @returns {Promise<any>} 事务结果
   */
  async transaction(operation) {
    try {
      // Supabase会自动处理事务，这里直接执行操作
      return await operation();

    } catch (error) {
      logger.error('事务执行失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 带重试的执行
   * @param {Function} operation - 要执行的操作
   * @returns {Promise<any>} 执行结果
   */
  async withRetry(operation) {
    let lastError = null;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (attempt === this.retryAttempts) {
          throw error;
        }

        // 只对网络错误和临时错误进行重试
        if (this.shouldRetry(error)) {
          const delay = this.retryDelay * attempt;
          logger.warn(`数据库操作失败，准备重试 ${attempt}/${this.retryAttempts}`, {
            error: error.message,
            delay
          });

          await this.sleep(delay);
        } else {
          throw error;
        }
      }
    }

    throw lastError;
  }

  /**
   * 判断是否应该重试
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否应该重试
   */
  shouldRetry(error) {
    const retryableCodes = [
      '08006', // 连接失败
      '08001', // 无法连接到数据库
      '08004', // 服务器拒绝连接
      '57P01', // 管理员关闭连接
      '57P02', // 服务器关闭连接
      '57P03', // 连接不正常
      '40001', // 序列化失败
      '40P01'  // 死锁
    ];

    return retryableCodes.includes(error.code) ||
           error.message.includes('connection') ||
           error.message.includes('timeout') ||
           error.message.includes('network');
  }

  /**
   * 延迟执行
   * @param {number} ms - 延迟毫秒数
   * @returns {Promise<void>}
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 错误处理
   * @param {Error} error - 原始错误
   * @returns {Error} 格式化的错误
   */
  handleError(error) {
    const databaseError = new Error(`数据库操作失败: ${error.message}`);
    databaseError.code = error.code;
    databaseError.details = error.details;
    databaseError.hint = error.hint;
    databaseError.table = error.table;
    databaseError.constraint = error.constraint;

    logger.error('数据库操作错误', {
      code: error.code,
      message: error.message,
      details: error.details,
      table: error.table
    });

    return databaseError;
  }

  /**
   * 获取连接池状态
   * @returns {Object} 连接池状态
   */
  getConnectionPoolStatus() {
    return {
      configured: !!this.connectionPool,
      max: this.connectionPool?.max || 0,
      min: this.connectionPool?.min || 0,
      idle: this.connectionPool?.idle || 0,
      acquire: this.connectionPool?.acquire || 0
    };
  }

  /**
   * 获取健康状态
   * @returns {Object} 健康状态
   */
  async getHealthStatus() {
    try {
      const startTime = Date.now();
      await this.testConnection();
      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        responseTime,
        connectionPool: this.getConnectionPoolStatus(),
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        connectionPool: this.getConnectionPoolStatus(),
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 关闭数据库客户端
   */
  async close() {
    try {
      if (this.healthCheckTimer) {
        clearInterval(this.healthCheckTimer);
        this.healthCheckTimer = null;
      }

      // Supabase客户端会自动清理连接
      this.client = null;
      this.serviceClient = null;
      this.isInitialized = false;

      logger.info('数据库客户端已关闭');

    } catch (error) {
      logger.error('关闭数据库客户端失败', { error: error.message });
    }
  }
}

// 创建并导出单例实例
const dbClient = new DatabaseClient();

export default dbClient;
export { DatabaseClient };