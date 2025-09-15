/**
 * 基础模型类 - 通用数据库操作
 * 遵循Node.js最佳实践：模块化、错误处理、日志记录、数据验证
 */

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';
import { validateUUID } from '../utils/validators.js';
// Supabase客户端实例
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * 基础模型类
 */
class BaseModel {
  /**
   * 构造函数
   * @param {string} tableName - 数据库表名
   * @param {string} primaryKey - 主键字段名，默认为'id'
   */
  constructor(tableName, primaryKey = 'id') {
    this.tableName = tableName;
    this.primaryKey = primaryKey;
    this.client = supabase;
  }

  /**
   * 生成UUID
   * @returns {string} UUID字符串
   */
  generateId() {
    return uuidv4();
  }

  /**
   * 验证UUID
   * @param {string} id - 要验证的ID
   * @returns {boolean} 是否有效
   */
  validateId(id) {
    return validateUUID(id);
  }

  /**
   * 查询记录
   * @param {string|number} id - 记录ID
   * @param {string} select - 选择字段，默认为'*'
   * @returns {Promise<Object|null>} 查询结果
   */
  async findById(id, select = '*') {
    try {
      if (!this.validateId(id)) {
        throw new Error('无效的ID格式');
      }

      const { error } = await this.client
        .from(this.tableName)
        .select(select)
        .eq(this.primaryKey, id)
        .single();

      if (error) {
        throw this.handleDatabaseError(error);
      }

      return data;

    } catch (error) {
      logger.error(`查询失败: ${this.tableName}[${id}]`, { error: error.message });
      throw error;
    }
  }

  /**
   * 条件查询记录
   * @param {SupabaseQueryOptions} options - 查询选项
   * @returns {Promise<Array>} 查询结果数组
   */
  async find(options = {}) {
    try {
      let query = this.client.from(this.tableName).select(options.select || '*');

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
        if (options.offset) {
          query = query.range(options.offset, options.offset + options.limit - 1);
        }
      }

      const { error } = await query;

      if (error) {
        throw this.handleDatabaseError(error);
      }

      return data || [];

    } catch (error) {
      logger.error(`查询失败: ${this.tableName}`, { error: error.message, options });
      throw error;
    }
  }

  /**
   * 分页查询
   * @param {Object} params - 分页参数
   * @param {number} params.page - 页码
   * @param {number} params.limit - 每页数量
   * @param {SupabaseQueryOptions} options - 查询选项
   * @returns {Promise<PaginatedResult>} 分页结果
   */
  async paginate(params = { page: 1, limit: 10 }, options = {}) {
    try {
      const page = Math.max(1, params.page);
      const limit = Math.min(100, Math.max(1, params.limit));
      const offset = (page - 1) * limit;

      // 获取总数
      let countQuery = this.client.from(this.tableName).select('*', { count: 'exact', head: true });

      if (options.filters) {
        options.filters.forEach(filter => {
          countQuery = countQuery.filter(filter.column, filter.operator, filter.value);
        });
      }

      const { count, error: countError } = await countQuery;

      if (countError) {
        throw this.handleDatabaseError(countError);
      }

      const total = count || 0;
      const totalPages = Math.ceil(total / limit);

      // 获取数据
      const data = await this.find({
        ...options,
        range: { from: offset, to: offset + limit - 1 }
      });

      return {
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      };

    } catch (error) {
      logger.error(`分页查询失败: ${this.tableName}`, { error: error.message, params, options });
      throw error;
    }
  }

  /**
   * 创建记录
   * @param {Object|Array} data - 要创建的数据
   * @param {string} returning - 返回字段，默认为'*'
   * @returns {Promise<Object>} 创建的记录
   */
  async create(data, returning = '*') {
    try {
      // 如果是单个对象，添加创建时间
      if (!Array.isArray(data)) {
        data = {
          ...data,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      } else {
        // 如果是数组，为每个记录添加创建时间
        data = data.map(item => ({
          ...item,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }));
      }

      const { data: result, error } = await this.client
        .from(this.tableName)
        .insert(data)
        .select(returning);

      if (error) {
        throw this.handleDatabaseError(error);
      }

      return Array.isArray(result) ? result[0] : result;

    } catch (error) {
      logger.error(`创建失败: ${this.tableName}`, { error: error.message, data });
      throw error;
    }
  }

  /**
   * 批量创建记录
   * @param {Array} data - 要创建的数据数组
   * @param {string} returning - 返回字段，默认为'*'
   * @returns {Promise<Array>} 创建的记录数组
   */
  async bulkCreate(data, returning = '*') {
    try {
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('批量创建数据必须是非空数组');
      }

      return await this.create(data, returning);

    } catch (error) {
      logger.error(`批量创建失败: ${this.tableName}`, { error: error.message, count: data.length });
      throw error;
    }
  }

  /**
   * 更新记录
   * @param {string|number} id - 记录ID
   * @param {Object} data - 更新数据
   * @param {string} returning - 返回字段，默认为'*'
   * @returns {Promise<Object|null>} 更新后的记录
   */
  async update(id, data, returning = '*') {
    try {
      if (!this.validateId(id)) {
        throw new Error('无效的ID格式');
      }

      // 添加更新时间
      const updateData = {
        ...data,
        updated_at: new Date().toISOString()
      };

      const { data: result, error } = await this.client
        .from(this.tableName)
        .update(updateData)
        .eq(this.primaryKey, id)
        .select(returning);

      if (error) {
        throw this.handleDatabaseError(error);
      }

      return Array.isArray(result) ? result[0] : result;

    } catch (error) {
      logger.error(`更新失败: ${this.tableName}[${id}]`, { error: error.message, data });
      throw error;
    }
  }

  /**
   * 条件更新记录
   * @param {Array} filters - 过滤条件数组
   * @param {Object} data - 更新数据
   * @param {string} returning - 返回字段，默认为'*'
   * @returns {Promise<Array>} 更新后的记录数组
   */
  async updateMany(filters, data, returning = '*') {
    try {
      if (!Array.isArray(filters) || filters.length === 0) {
        throw new Error('条件更新需要至少一个过滤器');
      }

      // 添加更新时间
      const updateData = {
        ...data,
        updated_at: new Date().toISOString()
      };

      let query = this.client
        .from(this.tableName)
        .update(updateData);

      // 应用过滤器
      filters.forEach(filter => {
        query = query.filter(filter.column, filter.operator, filter.value);
      });

      const { data: result, error } = await query.select(returning);

      if (error) {
        throw this.handleDatabaseError(error);
      }

      return result || [];

    } catch (error) {
      logger.error(`条件更新失败: ${this.tableName}`, { error: error.message, filters, data });
      throw error;
    }
  }

  /**
   * 删除记录
   * @param {string|number} id - 记录ID
   * @param {string} returning - 返回字段，默认为'*'
   * @returns {Promise<Object|null>} 删除的记录
   */
  async delete(id, returning = '*') {
    try {
      if (!this.validateId(id)) {
        throw new Error('无效的ID格式');
      }

      const { data: result, error } = await this.client
        .from(this.tableName)
        .delete()
        .eq(this.primaryKey, id)
        .select(returning);

      if (error) {
        throw this.handleDatabaseError(error);
      }

      return Array.isArray(result) ? result[0] : result;

    } catch (error) {
      logger.error(`删除失败: ${this.tableName}[${id}]`, { error: error.message });
      throw error;
    }
  }

  /**
   * 条件删除记录
   * @param {Array} filters - 过滤条件数组
   * @param {string} returning - 返回字段，默认为'*'
   * @returns {Promise<Array>} 删除的记录数组
   */
  async deleteMany(filters, returning = '*') {
    try {
      if (!Array.isArray(filters) || filters.length === 0) {
        throw new Error('条件删除需要至少一个过滤器');
      }

      let query = this.client.from(this.tableName).delete();

      // 应用过滤器
      filters.forEach(filter => {
        query = query.filter(filter.column, filter.operator, filter.value);
      });

      const { data: result, error } = await query.select(returning);

      if (error) {
        throw this.handleDatabaseError(error);
      }

      return result || [];

    } catch (error) {
      logger.error(`条件删除失败: ${this.tableName}`, { error: error.message, filters });
      throw error;
    }
  }

  /**
   * 软删除记录
   * @param {string|number} id - 记录ID
   * @returns {Promise<Object|null>} 更新后的记录
   */
  async softDelete(id) {
    try {
      return await this.update(id, {
        deleted_at: new Date().toISOString()
      });

    } catch (error) {
      logger.error(`软删除失败: ${this.tableName}[${id}]`, { error: error.message });
      throw error;
    }
  }

  /**
   * 恢复软删除的记录
   * @param {string|number} id - 记录ID
   * @returns {Promise<Object|null>} 更新后的记录
   */
  async restore(id) {
    try {
      return await this.update(id, {
        deleted_at: null
      });

    } catch (error) {
      logger.error(`恢复失败: ${this.tableName}[${id}]`, { error: error.message });
      throw error;
    }
  }

  /**
   * 统计记录数量
   * @param {Array} filters - 过滤条件数组
   * @returns {Promise<number>} 记录数量
   */
  async count(filters = []) {
    try {
      let query = this.client
        .from(this.tableName)
        .select('*', { count: 'exact', head: true });

      // 应用过滤器
      filters.forEach(filter => {
        query = query.filter(filter.column, filter.operator, filter.value);
      });

      const { count, error } = await query;

      if (error) {
        throw this.handleDatabaseError(error);
      }

      return count || 0;

    } catch (error) {
      logger.error(`统计失败: ${this.tableName}`, { error: error.message, filters });
      throw error;
    }
  }

  /**
   * 检查记录是否存在
   * @param {string|number} id - 记录ID
   * @returns {Promise<boolean>} 是否存在
   */
  async exists(id) {
    try {
      const result = await this.findById(id, this.primaryKey);
      return !!result;

    } catch (error) {
      return false;
    }
  }

  /**
   * 执行RPC函数
   * @param {string} functionName - 函数名
   * @param {Object} params - 函数参数
   * @returns {Promise<any>} 执行结果
   */
  async rpc(functionName, params = {}) {
    try {
      const { error } = await this.client
        .rpc(functionName, params);

      if (error) {
        throw this.handleDatabaseError(error);
      }

      return data;

    } catch (error) {
      logger.error(`RPC执行失败: ${this.tableName}.${functionName}`, { error: error.message, params });
      throw error;
    }
  }

  /**
   * 执行事务
   * @param {Function} operation - 事务操作函数
   * @returns {Promise<any>} 事务结果
   */
  async transaction(operation) {
    try {
      // Supabase会自动处理事务，这里直接执行操作
      return await operation();

    } catch (error) {
      logger.error(`事务执行失败: ${this.tableName}`, { error: error.message });
      throw error;
    }
  }

  /**
   * 处理数据库错误
   * @param {Error} error - 原始错误
   * @returns {DatabaseError} 格式化的错误对象
   */
  handleDatabaseError(error) {
    const databaseError = new DatabaseError(error.message || '数据库操作失败');
    databaseError.code = error.code;
    databaseError.details = error.details;
    databaseError.hint = error.hint;
    databaseError.table = this.tableName;
    databaseError.constraint = error.constraint;

    return databaseError;
  }

  /**
   * 数据验证
   * @param {Object} data - 要验证的数据
   * @param {Object} schema - 验证规则
   * @returns {Object} 验证结果
   */
  validate(data, schema) {
    const errors = [];
    const validated = {};

    for (const [field, rules] of Object.entries(schema)) {
      const value = data[field];

      // 检查必填字段
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field}是必填字段`);
        continue;
      }

      // 如果字段不存在且不是必填，跳过验证
      if (value === undefined && !rules.required) {
        continue;
      }

      // 类型验证
      if (rules.type && typeof value !== rules.type) {
        errors.push(`${field}类型必须是${rules.type}`);
        continue;
      }

      // 自定义验证
      if (rules.validate && !rules.validate(value)) {
        errors.push(`${field}格式不正确`);
        continue;
      }

      // 格式化
      if (rules.format) {
        validated[field] = rules.format(value);
      } else {
        validated[field] = value;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      data: validated
    };
  }

  /**
   * 数据清理
   * @param {Object} data - 要清理的数据
   * @returns {Object} 清理后的数据
   */
  sanitize(data) {
    const sanitized = {};

    for (const [key, value] of Object.entries(data)) {
      // 跳过undefined值
      if (value === undefined) {
        continue;
      }

      // 清理字符串
      if (typeof value === 'string') {
        sanitized[key] = value.trim();
      }
      // 清理数组
      else if (Array.isArray(value)) {
        sanitized[key] = value.filter(item => item !== undefined && item !== null);
      }
      // 清理对象
      else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitize(value);
      }
      else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * 获取表名
   * @returns {string} 表名
   */
  getTableName() {
    return this.tableName;
  }

  /**
   * 获取主键
   * @returns {string} 主键字段名
   */
  getPrimaryKey() {
    return this.primaryKey;
  }

  /**
   * 获取客户端实例
   * @returns {Object} Supabase客户端实例
   */
  getClient() {
    return this.client;
  }
}

export default BaseModel;