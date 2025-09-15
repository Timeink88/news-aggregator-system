/**
 * Supabase集成模块
 * 提供数据库连接和操作功能
 */

import { createClient } from '@supabase/supabase-js';
import logger from '../utils/logger.js';

class SupabaseIntegration {
  constructor() {
    this.client = null;
    this.initialized = false;
    this.connectionPool = null;
  }

  /**
   * 初始化Supabase连接
   */
  async initialize() {
    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_KEY;
      const maxStorageMB = parseInt(process.env.SUPABASE_MAX_STORAGE_MB || '500');

      if (!supabaseUrl || !supabaseKey) {
        throw new Error('SUPABASE_URL and SUPABASE_KEY environment variables are required');
      }

      // 创建Supabase客户端
      this.client = createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: false,
        },
        db: {
          schema: 'public',
        },
        global: {
          headers: {
            'x-application-name': 'news-aggregator',
          },
        },
      });

      // 测试连接
      const { error } = await this.client.from('rss_sources').select('count').limit(1);

      if (error) {
        throw new Error(`Supabase connection failed: ${error.message}`);
      }

      this.initialized = true;

      // 设置存储监控
      this.setupStorageMonitoring(maxStorageMB);

      logger.info('✅ Supabase连接初始化成功', {
        url: supabaseUrl,
        maxStorageMB,
      });

    } catch (error) {
      logger.error('❌ Supabase连接初始化失败:', error);
      throw error;
    }
  }

  /**
   * 设置存储监控
   */
  setupStorageMonitoring(maxStorageMB) {
    // 定期检查存储使用情况
    setInterval(async () => {
      try {
        const usage = await this.getStorageUsage();
        const usagePercentage = (usage.totalMB / maxStorageMB) * 100;

        logger.info('📊 存储使用情况', {
          totalMB: usage.totalMB,
          maxStorageMB,
          usagePercentage: `${usagePercentage.toFixed(2)  }%`,
        });

        // 如果使用率超过80%，发出警告
        if (usagePercentage > 80) {
          logger.warn('⚠️ 存储使用率过高', {
            usagePercentage: `${usagePercentage.toFixed(2)  }%`,
            threshold: '80%',
          });
        }

        // 如果使用率超过95%，触发清理
        if (usagePercentage > 95) {
          logger.warn('🚨 存储使用率超过阈值，触发清理', {
            usagePercentage: `${usagePercentage.toFixed(2)  }%`,
            threshold: '95%',
          });
          await this.performEmergencyCleanup();
        }

      } catch (error) {
        logger.error('❌ 存储监控失败:', error);
      }
    }, 300000); // 每5分钟检查一次
  }

  /**
   * 获取存储使用情况
   */
  async getStorageUsage() {
    try {
      // 获取各个表的大小
      const { data: tableSizes, error } = await this.client.rpc('check_storage_usage');

      if (error) {
        throw new Error(`Failed to get storage usage: ${error.message}`);
      }

      const totalMB = tableSizes.reduce((sum, table) => sum + table.table_size_mb, 0);

      return {
        totalMB,
        tables: tableSizes,
      };

    } catch (error) {
      logger.error('❌ 获取存储使用情况失败:', error);
      throw error;
    }
  }

  /**
   * 执行紧急清理
   */
  async performEmergencyCleanup() {
    try {
      logger.info('🧹 开始紧急数据清理...');

      // 调用存储过程清理过期数据
      const { error } = await this.client.rpc('cleanup_expired_data');

      if (error) {
        throw new Error(`Emergency cleanup failed: ${error.message}`);
      }

      // 记录清理操作
      await this.client
        .from('system_logs')
        .insert({
          level: 'warn',
          message: 'Emergency cleanup triggered due to high storage usage',
          service: 'cleanup',
          metadata: {
            reason: 'storage_usage_high',
            timestamp: new Date().toISOString(),
          },
        });

      logger.info('✅ 紧急数据清理完成');

    } catch (error) {
      logger.error('❌ 紧急清理失败:', error);
      throw error;
    }
  }

  /**
   * RSS源操作
   */
  async getRSSSources() {
    try {
      const { error } = await this.client
        .from('rss_sources')
        .select('*')
        .order('created_at');

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('❌ 获取RSS源失败:', error);
      throw error;
    }
  }

  async addRSSSource(source) {
    try {
      const { error } = await this.client
        .from('rss_sources')
        .insert([{
          url: source.url,
          name: source.name,
          category: source.category,
          max_articles: source.maxArticles || 10,
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('❌ 添加RSS源失败:', error);
      throw error;
    }
  }

  async updateRSSSource(id, updates) {
    try {
      const { error } = await this.client
        .from('rss_sources')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('❌ 更新RSS源失败:', error);
      throw error;
    }
  }

  async deleteRSSSource(id) {
    try {
      const { error } = await this.client
        .from('rss_sources')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (error) {
      logger.error('❌ 删除RSS源失败:', error);
      throw error;
    }
  }

  /**
   * 新闻文章操作
   */
  async getNewsArticles(filters = {}) {
    try {
      let query = this.client
        .from('news_articles')
        .select(`
          *,
          rss_sources(name, category),
          stock_entities(*)
        `);

      // 应用过滤器
      if (filters.category) {
        query = query.eq('category', filters.category);
      }
      if (filters.sourceId) {
        query = query.eq('source_id', filters.sourceId);
      }
      if (filters.sentiment) {
        query = query.eq('sentiment', filters.sentiment);
      }
      if (filters.dateFrom) {
        query = query.gte('publish_date', filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte('publish_date', filters.dateTo);
      }

      // 排序和分页
      const limit = filters.limit || 50;
      const offset = filters.offset || 0;

      query = query
        .order('publish_date', { ascending: false })
        .range(offset, offset + limit - 1);

      const { error } = await query;

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('❌ 获取新闻文章失败:', error);
      throw error;
    }
  }

  async addNewsArticle(article) {
    try {
      const { error } = await this.client
        .from('news_articles')
        .insert([{
          title: article.title,
          content: article.content,
          summary: article.summary,
          url: article.url,
          source_id: article.sourceId,
          category: article.category,
          author: article.author,
          publish_date: article.publishDate,
          sentiment: article.sentiment,
          language: article.language || 'zh',
          word_count: article.wordCount,
          reading_time: article.readingTime,
          tags: article.tags || [],
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('❌ 添加新闻文章失败:', error);
      throw error;
    }
  }

  async updateNewsArticle(id, updates) {
    try {
      const { error } = await this.client
        .from('news_articles')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('❌ 更新新闻文章失败:', error);
      throw error;
    }
  }

  /**
   * 股票实体操作
   */
  async addStockEntities(entities) {
    try {
      const { error } = await this.client
        .from('stock_entities')
        .insert(entities)
        .select();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('❌ 添加股票实体失败:', error);
      throw error;
    }
  }

  /**
   * 用户操作
   */
  async getUserByUsername(username) {
    try {
      const { error } = await this.client
        .from('users')
        .select('*')
        .eq('username', username)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } catch (error) {
      logger.error('❌ 获取用户失败:', error);
      throw error;
    }
  }

  async createUser(userData) {
    try {
      const { error } = await this.client
        .from('users')
        .insert([{
          username: userData.username,
          password_hash: userData.passwordHash,
          email: userData.email,
          role: userData.role || 'user',
          preferences: userData.preferences || {},
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('❌ 创建用户失败:', error);
      throw error;
    }
  }

  /**
   * 系统配置操作
   */
  async getSystemConfig(key) {
    try {
      const { error } = await this.client
        .from('system_config')
        .select('config_value')
        .eq('config_key', key)
        .eq('is_active', true)
        .single();

      if (error) throw error;
      return data.config_value;
    } catch (error) {
      logger.error('❌ 获取系统配置失败:', error);
      throw error;
    }
  }

  async updateSystemConfig(key, value) {
    try {
      const { error } = await this.client
        .from('system_config')
        .update({ config_value: value })
        .eq('config_key', key)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('❌ 更新系统配置失败:', error);
      throw error;
    }
  }

  /**
   * 日志操作
   */
  async logSystemLog(level, message, service = null, metadata = {}) {
    try {
      await this.client
        .from('system_logs')
        .insert({
          level,
          message,
          service,
          metadata,
        });
    } catch (error) {
      logger.error('❌ 记录系统日志失败:', error);
      // 不要抛出错误，避免影响主要功能
    }
  }

  /**
   * 获取系统统计信息
   */
  async getSystemStats() {
    try {
      const [rssSources, articles, users, storageUsage] = await Promise.all([
        this.client.from('rss_sources').select('count', { count: 'exact', head: true }),
        this.client.from('news_articles').select('count', { count: 'exact', head: true }),
        this.client.from('users').select('count', { count: 'exact', head: true }),
        this.getStorageUsage(),
      ]);

      const { data: recentArticles } = await this.client
        .from('news_articles')
        .select('count', { count: 'exact' })
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      return {
        rssSources: rssSources.count,
        articles: articles.count,
        users: users.count,
        recentArticles: recentArticles.count,
        storageUsage,
      };
    } catch (error) {
      logger.error('❌ 获取系统统计失败:', error);
      throw error;
    }
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    try {
      if (!this.initialized) {
        return { status: 'not_initialized', message: 'Supabase not initialized' };
      }

      const Date.now() = Date.now();
      const { error } = await this.client
        .from('system_config')
        .select('config_key')
        .limit(1);

      const responseTime = Date.now() - Date.now();

      if (error) {
        return {
          status: 'unhealthy',
          message: error.message,
          responseTime,
        };
      }

      return {
        status: 'healthy',
        message: 'Supabase connection is healthy',
        responseTime,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('❌ Supabase健康检查失败:', error);
      return {
        status: 'error',
        message: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * 关闭连接
   */
  async shutdown() {
    try {
      if (this.client) {
        // Supabase客户端不需要显式关闭
        this.client = null;
      }
      this.initialized = false;
      logger.info('✅ Supabase连接已关闭');
    } catch (error) {
      logger.error('❌ 关闭Supabase连接失败:', error);
    }
  }

  /**
   * 获取客户端实例
   */
  getClient() {
    if (!this.initialized) {
      throw new Error('Supabase client not initialized');
    }
    return this.client;
  }
}

// 创建单例实例
const supabaseIntegration = new SupabaseIntegration();

export default supabaseIntegration;