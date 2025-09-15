/**
 * 数据库查询函数集合 - 提供类型安全的数据库操作
 * 遵循Node.js最佳实践：参数化查询、错误处理、性能优化
 */

import dbClient from './client.js';
import logger from '../utils/logger.js';

/**
 * RSS源查询函数
 */
class RSSSourceQueries {
  /**
   * 获取RSS源列表
   * @param {QueryParams} params - 查询参数
   * @returns {Promise<PaginatedResult<RSSSource>>} 分页结果
   */
  static async list(params = {}) {
    try {
      const { pagination = { page: 1, limit: 10 }, filters = [], sort = { sortBy: 'created_at', sortOrder: 'desc' } } = params;

      const options = {
        table: 'rss_sources',
        select: '*',
        filters,
        order: {
          column: sort.sortBy,
          ascending: sort.sortOrder === 'asc'
        },
        range: {
          from: (pagination.page - 1) * pagination.limit,
          to: pagination.page * pagination.limit - 1
        }
      };

      const [data, totalCount] = await Promise.all([
        dbClient.query(options),
        this.count(filters)
      ]);

      const totalPages = Math.ceil(totalCount / pagination.limit);

      return {
        data,
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total: totalCount,
          totalPages,
          hasNext: pagination.page < totalPages,
          hasPrev: pagination.page > 1
        }
      };

    } catch (error) {
      logger.error('获取RSS源列表失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 根据ID获取RSS源
   * @param {string} id - RSS源ID
   * @returns {Promise<RSSSource|null>} RSS源
   */
  static async findById(id) {
    try {
      const data = await dbClient.query({
        table: 'rss_sources',
        select: '*',
        filters: [{ column: 'id', operator: 'eq', value: id }]
      });

      return data[0] || null;

    } catch (error) {
      logger.error(`获取RSS源失败: ${id}`, { error: error.message });
      throw error;
    }
  }

  /**
   * 创建RSS源
   * @param {Object} data - RSS源数据
   * @returns {Promise<RSSSource>} 创建的RSS源
   */
  static async create(data) {
    try {
      const source = await dbClient.insert({
        table: 'rss_sources',
        data: {
          ...data,
          fetch_error_count: 0,
          is_active: true
        }
      });

      logger.info(`RSS源创建成功: ${source.name}`);
      return source;

    } catch (error) {
      logger.error('创建RSS源失败', { error: error.message, data });
      throw error;
    }
  }

  /**
   * 更新RSS源
   * @param {string} id - RSS源ID
   * @param {Object} data - 更新数据
   * @returns {Promise<RSSSource>} 更新后的RSS源
   */
  static async update(id, data) {
    try {
      const source = await dbClient.update({
        table: 'rss_sources',
        data,
        filters: [{ column: 'id', operator: 'eq', value: id }]
      });

      logger.info(`RSS源更新成功: ${id}`);
      return source;

    } catch (error) {
      logger.error(`更新RSS源失败: ${id}`, { error: error.message, data });
      throw error;
    }
  }

  /**
   * 删除RSS源
   * @param {string} id - RSS源ID
   * @returns {Promise<boolean>} 是否成功删除
   */
  static async delete(id) {
    try {
      await dbClient.delete({
        table: 'rss_sources',
        filters: [{ column: 'id', operator: 'eq', value: id }]
      });

      logger.info(`RSS源删除成功: ${id}`);
      return true;

    } catch (error) {
      logger.error(`删除RSS源失败: ${id}`, { error: error.message });
      throw error;
    }
  }

  /**
   * 获取活跃的RSS源
   * @returns {Promise<Array<RSSSource>>} 活跃的RSS源列表
   */
  static async getActiveSources() {
    try {
      const data = await dbClient.query({
        table: 'rss_sources',
        filters: [
          { column: 'is_active', operator: 'eq', value: true }
        ],
        order: { column: 'last_fetched_at', ascending: true }
      });

      return data;

    } catch (error) {
      logger.error('获取活跃RSS源失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 更新RSS源获取状态
   * @param {string} id - RSS源ID
   * @param {Object} status - 状态数据
   * @returns {Promise<RSSSource>} 更新后的RSS源
   */
  static async updateFetchStatus(id, status) {
    try {
      return await this.update(id, {
        last_fetched_at: status.timestamp,
        last_fetch_status: status.status,
        fetch_error_count: status.errorCount || 0
      });

    } catch (error) {
      logger.error(`更新RSS源获取状态失败: ${id}`, { error: error.message });
      throw error;
    }
  }

  /**
   * 统计RSS源数量
   * @param {Array} filters - 过滤条件
   * @returns {Promise<number>} 数量
   */
  static async count(filters = []) {
    try {
      const { count } = await dbClient.rpc('count_rss_sources', { filters });
      return count || 0;

    } catch (error) {
      // 如果RPC不存在，使用基本查询
      logger.warn('count_rss_sources RPC不存在，使用基本查询');
      const data = await dbClient.query({
        table: 'rss_sources',
        select: 'id',
        filters
      });
      return data.length;
    }
  }
}

/**
 * 新闻文章查询函数
 */
class NewsArticleQueries {
  /**
   * 获取新闻文章列表
   * @param {QueryParams} params - 查询参数
   * @returns {Promise<PaginatedResult<NewsArticle>>} 分页结果
   */
  static async list(params = {}) {
    try {
      const { pagination = { page: 1, limit: 10 }, filters = [], sort = { sortBy: 'publish_date', sortOrder: 'desc' } } = params;

      const options = {
        table: 'news_articles',
        select: '*',
        filters,
        order: {
          column: sort.sortBy,
          ascending: sort.sortOrder === 'asc'
        },
        range: {
          from: (pagination.page - 1) * pagination.limit,
          to: pagination.page * pagination.limit - 1
        }
      };

      const [data, totalCount] = await Promise.all([
        dbClient.query(options),
        this.count(filters)
      ]);

      const totalPages = Math.ceil(totalCount / pagination.limit);

      return {
        data,
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total: totalCount,
          totalPages,
          hasNext: pagination.page < totalPages,
          hasPrev: pagination.page > 1
        }
      };

    } catch (error) {
      logger.error('获取新闻文章列表失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 根据ID获取新闻文章
   * @param {string} id - 文章ID
   * @returns {Promise<NewsArticle|null>} 新闻文章
   */
  static async findById(id) {
    try {
      const data = await dbClient.query({
        table: 'news_articles',
        select: '*',
        filters: [{ column: 'id', operator: 'eq', value: id }]
      });

      return data[0] || null;

    } catch (error) {
      logger.error(`获取新闻文章失败: ${id}`, { error: error.message });
      throw error;
    }
  }

  /**
   * 创建新闻文章
   * @param {Object} data - 文章数据
   * @returns {Promise<NewsArticle>} 创建的文章
   */
  static async create(data) {
    try {
      const article = await dbClient.insert({
        table: 'news_articles',
        data: {
          ...data,
          status: 'published',
          word_count: data.content ? data.content.split(/\s+/).length : 0
        }
      });

      logger.info(`新闻文章创建成功: ${article.title}`);
      return article;

    } catch (error) {
      logger.error('创建新闻文章失败', { error: error.message, data });
      throw error;
    }
  }

  /**
   * 批量创建新闻文章
   * @param {Array} articles - 文章数组
   * @returns {Promise<Array<NewsArticle>>} 创建的文章数组
   */
  static async bulkCreate(articles) {
    try {
      const processedArticles = articles.map(article => ({
        ...article,
        status: 'published',
        word_count: article.content ? article.content.split(/\s+/).length : 0
      }));

      const createdArticles = await dbClient.insert({
        table: 'news_articles',
        data: processedArticles
      });

      logger.info(`批量创建新闻文章成功: ${createdArticles.length} 篇`);
      return Array.isArray(createdArticles) ? createdArticles : [createdArticles];

    } catch (error) {
      logger.error('批量创建新闻文章失败', { error: error.message, count: articles.length });
      throw error;
    }
  }

  /**
   * 更新新闻文章
   * @param {string} id - 文章ID
   * @param {Object} data - 更新数据
   * @returns {Promise<NewsArticle>} 更新后的文章
   */
  static async update(id, data) {
    try {
      const article = await dbClient.update({
        table: 'news_articles',
        data,
        filters: [{ column: 'id', operator: 'eq', value: id }]
      });

      logger.info(`新闻文章更新成功: ${id}`);
      return article;

    } catch (error) {
      logger.error(`更新新闻文章失败: ${id}`, { error: error.message, data });
      throw error;
    }
  }

  /**
   * 删除新闻文章
   * @param {string} id - 文章ID
   * @returns {Promise<boolean>} 是否成功删除
   */
  static async delete(id) {
    try {
      await dbClient.delete({
        table: 'news_articles',
        filters: [{ column: 'id', operator: 'eq', value: id }]
      });

      logger.info(`新闻文章删除成功: ${id}`);
      return true;

    } catch (error) {
      logger.error(`删除新闻文章失败: ${id}`, { error: error.message });
      throw error;
    }
  }

  /**
   * 搜索新闻文章
   * @param {string} query - 搜索查询
   * @param {QueryParams} params - 查询参数
   * @returns {Promise<PaginatedResult<NewsArticle>>} 分页结果
   */
  static async search(query, params = {}) {
    try {
      const results = await dbClient.rpc('search_news_articles', {
        search_query: query,
        filters: params.filters || [],
        limit: params.pagination?.limit || 10,
        offset: (params.pagination?.page - 1) * params.pagination?.limit || 0
      });

      return results || { data: [], pagination: { total: 0, totalPages: 0 } };

    } catch (error) {
      logger.error('搜索新闻文章失败', { error: error.message, query });
      throw error;
    }
  }

  /**
   * 获取最新文章
   * @param {number} limit - 限制数量
   * @returns {Promise<Array<NewsArticle>>} 最新文章列表
   */
  static async getLatest(limit = 10) {
    try {
      const data = await dbClient.query({
        table: 'news_articles',
        filters: [
          { column: 'status', operator: 'eq', value: 'published' }
        ],
        order: { column: 'publish_date', ascending: false },
        limit
      });

      return data;

    } catch (error) {
      logger.error('获取最新新闻文章失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 按分类获取文章
   * @param {string} category - 分类
   * @param {QueryParams} params - 查询参数
   * @returns {Promise<PaginatedResult<NewsArticle>>} 分页结果
   */
  static async getByCategory(category, params = {}) {
    try {
      const filters = [
        { column: 'category', operator: 'eq', value: category },
        { column: 'status', operator: 'eq', value: 'published' },
        ...(params.filters || [])
      ];

      return await this.list({ ...params, filters });

    } catch (error) {
      logger.error(`按分类获取新闻文章失败: ${category}`, { error: error.message });
      throw error;
    }
  }

  /**
   * 统计新闻文章数量
   * @param {Array} filters - 过滤条件
   * @returns {Promise<number>} 数量
   */
  static async count(filters = []) {
    try {
      const { count } = await dbClient.rpc('count_news_articles', { filters });
      return count || 0;

    } catch (error) {
      // 如果RPC不存在，使用基本查询
      logger.warn('count_news_articles RPC不存在，使用基本查询');
      const data = await dbClient.query({
        table: 'news_articles',
        select: 'id',
        filters
      });
      return data.length;
    }
  }
}

/**
 * 用户查询函数
 */
class UserQueries {
  /**
   * 根据ID获取用户
   * @param {string} id - 用户ID
   * @returns {Promise<User|null>} 用户
   */
  static async findById(id) {
    try {
      const data = await dbClient.query({
        table: 'users',
        select: 'id, email, username, first_name, last_name, avatar_url, role, status, preferences, last_login_at, email_verified_at, created_at, updated_at, metadata',
        filters: [{ column: 'id', operator: 'eq', value: id }]
      });

      if (data[0]) {
        // 移除敏感字段
        delete data[0].password_hash;
      }

      return data[0] || null;

    } catch (error) {
      logger.error(`获取用户失败: ${id}`, { error: error.message });
      throw error;
    }
  }

  /**
   * 根据邮箱获取用户
   * @param {string} email - 邮箱地址
   * @returns {Promise<User|null>} 用户
   */
  static async findByEmail(email) {
    try {
      const data = await dbClient.query({
        table: 'users',
        select: 'id, email, username, first_name, last_name, avatar_url, role, status, preferences, last_login_at, email_verified_at, created_at, updated_at, metadata',
        filters: [{ column: 'email', operator: 'eq', value: email }]
      });

      if (data[0]) {
        // 移除敏感字段
        delete data[0].password_hash;
      }

      return data[0] || null;

    } catch (error) {
      logger.error(`根据邮箱获取用户失败: ${email}`, { error: error.message });
      throw error;
    }
  }

  /**
   * 创建用户
   * @param {Object} data - 用户数据
   * @returns {Promise<User>} 创建的用户
   */
  static async create(data) {
    try {
      // 密码哈希应该在服务层处理
      const user = await dbClient.insert({
        table: 'users',
        data: {
          ...data,
          status: 'pending',
          email_verified_at: null
        }
      });

      // 移除敏感字段
      delete user.password_hash;

      logger.info(`用户创建成功: ${user.email}`);
      return user;

    } catch (error) {
      logger.error('创建用户失败', { error: error.message, data });
      throw error;
    }
  }

  /**
   * 更新用户
   * @param {string} id - 用户ID
   * @param {Object} data - 更新数据
   * @returns {Promise<User>} 更新后的用户
   */
  static async update(id, data) {
    try {
      const user = await dbClient.update({
        table: 'users',
        data,
        filters: [{ column: 'id', operator: 'eq', value: id }]
      });

      // 移除敏感字段
      delete user.password_hash;

      logger.info(`用户更新成功: ${id}`);
      return user;

    } catch (error) {
      logger.error(`更新用户失败: ${id}`, { error: error.message, data });
      throw error;
    }
  }

  /**
   * 删除用户
   * @param {string} id - 用户ID
   * @returns {Promise<boolean>} 是否成功删除
   */
  static async delete(id) {
    try {
      await dbClient.delete({
        table: 'users',
        filters: [{ column: 'id', operator: 'eq', value: id }]
      });

      logger.info(`用户删除成功: ${id}`);
      return true;

    } catch (error) {
      logger.error(`删除用户失败: ${id}`, { error: error.message });
      throw error;
    }
  }
}

/**
 * 系统配置查询函数
 */
class SystemConfigQueries {
  /**
   * 获取配置值
   * @param {string} key - 配置键
   * @returns {Promise<any>} 配置值
   */
  static async get(key) {
    try {
      const data = await dbClient.query({
        table: 'system_configs',
        select: 'value, type',
        filters: [
          { column: 'key', operator: 'eq', value: key },
          { column: 'environment', operator: 'eq', value: process.env.NODE_ENV || 'development' }
        ]
      });

      const config = data[0];
      if (!config) {
        return null;
      }

      // 根据类型转换值
      switch (config.type) {
      case 'number':
        return Number(config.value);
      case 'boolean':
        return config.value === 'true';
      case 'json':
        return JSON.parse(config.value);
      case 'array':
        return JSON.parse(config.value);
      default:
        return config.value;
      }

    } catch (error) {
      logger.error(`获取配置失败: ${key}`, { error: error.message });
      throw error;
    }
  }

  /**
   * 设置配置值
   * @param {string} key - 配置键
   * @param {any} value - 配置值
   * @param {string} type - 值类型
   * @param {string} description - 描述
   * @returns {Promise<SystemConfig>} 创建或更新的配置
   */
  static async set(key, value, type = 'string', description = '') {
    try {
      const environment = process.env.NODE_ENV || 'development';

      // 转换值为字符串
      const stringValue = type === 'json' || type === 'array'
        ? JSON.stringify(value)
        : String(value);

      // 检查是否已存在
      const existing = await dbClient.query({
        table: 'system_configs',
        select: 'id',
        filters: [
          { column: 'key', operator: 'eq', value: key },
          { column: 'environment', operator: 'eq', value: environment }
        ]
      });

      let config;
      if (existing.length > 0) {
        // 更新现有配置
        config = await dbClient.update({
          table: 'system_configs',
          data: {
            value: stringValue,
            type,
            description
          },
          filters: [
            { column: 'key', operator: 'eq', value: key },
            { column: 'environment', operator: 'eq', value: environment }
          ]
        });
      } else {
        // 创建新配置
        config = await dbClient.insert({
          table: 'system_configs',
          data: {
            key,
            value: stringValue,
            type,
            description,
            environment,
            is_sensitive: key.toLowerCase().includes('password') || key.toLowerCase().includes('key')
          }
        });
      }

      logger.info(`配置设置成功: ${key}`);
      return config;

    } catch (error) {
      logger.error(`设置配置失败: ${key}`, { error: error.message });
      throw error;
    }
  }

  /**
   * 获取所有配置
   * @param {string} environment - 环境筛选
   * @returns {Promise<Array<SystemConfig>>} 配置列表
   */
  static async getAll(environment = null) {
    try {
      const filters = environment
        ? [{ column: 'environment', operator: 'eq', value: environment }]
        : [];

      const data = await dbClient.query({
        table: 'system_configs',
        filters,
        order: { column: 'key', ascending: true }
      });

      return data;

    } catch (error) {
      logger.error('获取所有配置失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 删除配置
   * @param {string} key - 配置键
   * @param {string} environment - 环境
   * @returns {Promise<boolean>} 是否成功删除
   */
  static async delete(key, environment = null) {
    try {
      const filters = [
        { column: 'key', operator: 'eq', value: key }
      ];

      if (environment) {
        filters.push({ column: 'environment', operator: 'eq', value: environment });
      }

      await dbClient.delete({
        table: 'system_configs',
        filters
      });

      logger.info(`配置删除成功: ${key}`);
      return true;

    } catch (error) {
      logger.error(`删除配置失败: ${key}`, { error: error.message });
      throw error;
    }
  }
}

// 导出所有查询类
export {
  RSSSourceQueries,
  NewsArticleQueries,
  UserQueries,
  SystemConfigQueries
};