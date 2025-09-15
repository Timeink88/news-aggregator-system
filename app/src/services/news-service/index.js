/**
 * News服务模块 - 新闻文章处理和存储
 * 遵循Node.js最佳实践：模块化、错误处理、日志记录
 */

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import logger from '../../utils/logger.js';
import { validateArticle, validateUUID } from '../../utils/validators.js';
import { CircuitBreaker } from '../../utils/circuit-breaker.js';
import { EventEmitter } from 'node:events';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// News服务配置
const NEWS_CONFIG = {
  maxRetries: 3,
  batchSize: 100,
  cacheTimeout: 300000, // 5分钟
  maxContentLength: 10000, // 最大内容长度
  similarityThreshold: 0.8, // 相似度阈值
  deduplicationWindow: 24 * 60 * 60 * 1000, // 24小时去重窗口
  categoryWeights: {
    'technology': 1.2,
    'finance': 1.1,
    'politics': 1.0,
    'business': 1.0,
    'other': 0.8
  }
};

/**
 * News服务类
 */
class NewsService extends EventEmitter {
  constructor() {
    super();
    this.articleCache = new Map();
    this.circuitBreaker = new CircuitBreaker({
      timeout: 30000,
      errorThresholdPercentage: 50,
      resetTimeout: 60000
    });
    this.processingQueue = [];
    this.isProcessing = false;
  }

  /**
   * 保存文章到数据库
   */
  async saveArticle(article) {
    try {
      logger.info(`正在保存文章: ${article.title}`, { articleId: article.id });

      // 验证文章数据
      if (!validateArticle(article)) {
        throw new Error('文章数据格式无效');
      }

      // 检查重复
      const isDuplicate = await this.checkDuplicate(article);
      if (isDuplicate) {
        logger.info(`文章已存在，跳过保存: ${article.title}`, { articleId: article.id });
        return { success: true, duplicate: true, articleId: article.id };
      }

      // 处理文章内容
      const processedArticle = await this.processArticle(article);

      // 保存到数据库
      const { error } = await supabase
        .from('news_articles')
        .upsert([processedArticle], {
          onConflict: 'url',
          ignoreDuplicates: false
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      logger.info(`文章保存成功: ${article.title}`, { articleId: data.id });

      // 发出事件
      this.emit('articleSaved', data);

      return {
        success: true,
        duplicate: false,
        articleId: data.id,
        article: data
      };

    } catch (error) {
      logger.error(`保存文章失败: ${article.title}`, {
        articleId: article.id,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        articleId: article.id
      };
    }
  }

  /**
   * 批量保存文章
   */
  async saveArticles(articles) {
    try {
      logger.info(`开始批量保存 ${articles.length} 篇文章`);

      if (articles.length === 0) {
        return { success: true, savedCount: 0, duplicateCount: 0 };
      }

      // 分批处理
      const results = [];
      for (let i = 0; i < articles.length; i += NEWS_CONFIG.batchSize) {
        const batch = articles.slice(i, i + NEWS_CONFIG.batchSize);
        const batchResult = await this.saveBatch(batch);
        results.push(batchResult);
      }

      const totalSaved = results.reduce((sum, r) => sum + r.savedCount, 0);
      const totalDuplicates = results.reduce((sum, r) => sum + r.duplicateCount, 0);
      const totalErrors = results.reduce((sum, r) => sum + r.errorCount, 0);

      logger.info(`批量保存完成: 保存 ${totalSaved} 篇, 重复 ${totalDuplicates} 篇, 错误 ${totalErrors} 篇`);

      return {
        success: totalErrors === 0,
        savedCount: totalSaved,
        duplicateCount: totalDuplicates,
        errorCount: totalErrors,
        results
      };

    } catch (error) {
      logger.error('批量保存文章失败', { error: error.message });

      return {
        success: false,
        savedCount: 0,
        duplicateCount: 0,
        errorCount: articles.length,
        error: error.message
      };
    }
  }

  /**
   * 保存一批文章
   */
  async saveBatch(articles) {
    try {
      // 过滤和验证文章
      const validArticles = articles.filter(article => validateArticle(article));
      const invalidCount = articles.length - validArticles.length;

      if (validArticles.length === 0) {
        return { savedCount: 0, duplicateCount: 0, errorCount: invalidCount };
      }

      // 处理文章内容
      const processedArticles = await Promise.all(
        validArticles.map(article => this.processArticle(article))
      );

      // 批量插入
      const { error } = await this.circuitBreaker.execute(async () => {
        return await supabase
          .from('news_articles')
          .upsert(processedArticles, {
            onConflict: 'url',
            ignoreDuplicates: false
          })
          .select();
      });

      if (error) {
        throw error;
      }

      logger.info(`批量保存完成: ${data.length} 篇文章`);

      return {
        savedCount: data.length,
        duplicateCount: 0,
        errorCount: invalidCount
      };

    } catch (error) {
      logger.error('批量保存失败', { error: error.message });

      return {
        savedCount: 0,
        duplicateCount: 0,
        errorCount: articles.length
      };
    }
  }

  /**
   * 处理文章内容
   */
  async processArticle(article) {
    try {
      const processed = {
        ...article,
        id: article.id || uuidv4(),
        content: this.cleanContent(article.content),
        summary: this.generateSummary(article.content),
        word_count: this.countWords(article.content),
        reading_time: this.calculateReadingTime(article.content),
        language: this.detectLanguage(article.content),
        sentiment_score: await this.analyzeSentiment(article.content),
        processed_at: new Date().toISOString()
      };

      return processed;

    } catch (error) {
      logger.error('处理文章内容失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 清理文章内容
   */
  cleanContent(content) {
    if (!content) return '';

    return content
      .replace(/<script[^>]*>.*?<\/script>/gis, '') // 移除脚本
      .replace(/<style[^>]*>.*?<\/style>/gis, '') // 移除样式
      .replace(/<[^>]*>/g, ' ') // 移除HTML标签
      .replace(/\s+/g, ' ') // 合并空白字符
      .replace(/[^\w\s\u4e00-\u9fff.,!?;:()""''-]/g, '') // 移除特殊字符
      .trim()
      .substring(0, NEWS_CONFIG.maxContentLength);
  }

  /**
   * 生成文章摘要
   */
  generateSummary(content) {
    if (!content) return '';

    const plainText = this.cleanContent(content);
    const sentences = plainText.split(/[.!?]+/).filter(s => s.trim());

    if (sentences.length <= 1) {
      return plainText.substring(0, 200);
    }

    // 简单的摘要生成：取前3句话
    const summary = `${sentences.slice(0, 3).join('. ')  }.`;
    return summary.length > 300 ? `${summary.substring(0, 300)  }...` : summary;
  }

  /**
   * 计算字数
   */
  countWords(content) {
    if (!content) return 0;

    const plainText = this.cleanContent(content);
    const words = plainText.split(/\s+/);
    return words.filter(word => word.length > 0).length;
  }

  /**
   * 计算阅读时间
   */
  calculateReadingTime(content) {
    const wordCount = this.countWords(content);
    // 假设阅读速度为每分钟200字
    return Math.ceil(wordCount / 200);
  }

  /**
   * 检测语言
   */
  detectLanguage(content) {
    if (!content) return 'unknown';

    const plainText = this.cleanContent(content);

    // 简单的语言检测
    const chineseRegex = /[\u4e00-\u9fff]/;
    const englishRegex = /^[a-zA-Z\s.,!?;:()""'-]+$/;

    if (chineseRegex.test(plainText)) {
      return 'zh-CN';
    } else if (englishRegex.test(plainText)) {
      return 'en';
    } else {
      return 'unknown';
    }
  }

  /**
   * 分析情感
   */
  async analyzeSentiment(content) {
    // 简单的情感分析（基于关键词）
    const positiveKeywords = ['好', '优秀', '成功', '增长', '提高', 'excellent', 'good', 'success', 'growth'];
    const negativeKeywords = ['坏', '失败', '下降', '问题', '危机', 'bad', 'failure', 'decline', 'problem'];

    if (!content) return 0;

    const plainText = content.toLowerCase();
    let score = 0;

    positiveKeywords.forEach(keyword => {
      if (plainText.includes(keyword)) score += 1;
    });

    negativeKeywords.forEach(keyword => {
      if (plainText.includes(keyword)) score -= 1;
    });

    // 标准化到[-1, 1]范围
    return Math.max(-1, Math.min(1, score / 10));
  }

  /**
   * 检查重复文章
   */
  async checkDuplicate(article) {
    try {
      // 检查URL重复
      const { data: urlDuplicate } = await supabase
        .from('news_articles')
        .select('id')
        .eq('url', article.url)
        .single();

      if (urlDuplicate) {
        return true;
      }

      // 检查标题相似度
      const similarArticles = await this.findSimilarArticles(article);
      if (similarArticles.length > 0) {
        return true;
      }

      return false;

    } catch (error) {
      logger.error('检查文章重复失败', { error: error.message });
      return false;
    }
  }

  /**
   * 查找相似文章
   */
  async findSimilarArticles(article) {
    try {
      const timeWindow = new Date(Date.now() - NEWS_CONFIG.deduplicationWindow);

      const { data } = await supabase
        .from('news_articles')
        .select('id, title, similarity_score')
        .gte('created_at', timeWindow.toISOString())
        .limit(50);

      if (!data || data.length === 0) {
        return [];
      }

      // 计算相似度
      const similar = data.filter(item => {
        const similarity = this.calculateSimilarity(article.title, item.title);
        return similarity >= NEWS_CONFIG.similarityThreshold;
      });

      return similar;

    } catch (error) {
      logger.error('查找相似文章失败', { error: error.message });
      return [];
    }
  }

  /**
   * 计算文本相似度
   */
  calculateSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;

    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);

    const intersection = words1.filter(word => words2.includes(word));
    const union = [...new Set([...words1, ...words2])];

    return intersection.length / union.length;
  }

  /**
   * 获取文章
   */
  async getArticle(articleId) {
    try {
      if (!validateUUID(articleId)) {
        throw new Error('无效的文章ID');
      }

      // 检查缓存
      const cached = this.articleCache.get(articleId);
      if (cached && Date.now() - cached.timestamp < NEWS_CONFIG.cacheTimeout) {
        return cached.data;
      }

      // 从数据库获取
      const { error } = await supabase
        .from('news_articles')
        .select('*')
        .eq('id', articleId)
        .single();

      if (error) {
        throw error;
      }

      // 缓存结果
      this.articleCache.set(articleId, {
        data,
        timestamp: Date.now()
      });

      return data;

    } catch (error) {
      logger.error(`获取文章失败: ${articleId}`, { error: error.message });
      throw error;
    }
  }

  /**
   * 获取文章列表
   */
  async getArticles(options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        sourceId,
        category,
        startDate,
        endDate,
        sortBy = 'publish_date',
        sortOrder = 'desc'
      } = options;

      let query = supabase
        .from('news_articles')
        .select('*', { count: 'exact' });

      // 添加过滤条件
      if (sourceId) {
        query = query.eq('source_id', sourceId);
      }

      if (category) {
        query = query.contains('categories', [category]);
      }

      if (startDate) {
        query = query.gte('publish_date', startDate);
      }

      if (endDate) {
        query = query.lte('publish_date', endDate);
      }

      // 添加排序
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });

      // 添加分页
      const offset = (page - 1) * limit;
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        throw error;
      }

      return {
        success: true,
        articles: data || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit)
        }
      };

    } catch (error) {
      logger.error('获取文章列表失败', { error: error.message });
      return {
        success: false,
        articles: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0
        },
        error: error.message
      };
    }
  }

  /**
   * 搜索文章
   */
  async searchArticles(query, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        fields = ['title', 'content', 'summary'],
        fuzzy = true
      } = options;

      // 使用PostgreSQL的全文搜索
      const searchText = fuzzy ? `${query}:*` : query;

      const { data, error, count } = await supabase
        .from('news_articles')
        .select('*', { count: 'exact' })
        .textSearch('search_vector', searchText, {
          type: 'websearch',
          config: 'english'
        })
        .order('rank', { ascending: false })
        .range((page - 1) * limit, page * limit - 1);

      if (error) {
        throw error;
      }

      return {
        success: true,
        articles: data || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit)
        },
        query
      };

    } catch (error) {
      logger.error(`搜索文章失败: ${query}`, { error: error.message });
      return {
        success: false,
        articles: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0
        },
        query,
        error: error.message
      };
    }
  }

  /**
   * 获取热门文章
   */
  async getPopularArticles(options = {}) {
    try {
      const {
        period = '24h', // 24h, 7d, 30d
        limit = 10
      } = options;

      const periodMap = {
        '24h': 24,
        '7d': 24 * 7,
        '30d': 24 * 30
      };

      const hours = periodMap[period] || 24;
      const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);

      const { error } = await supabase
        .from('news_articles')
        .select('*')
        .gte('publish_date', cutoffTime.toISOString())
        .order('view_count', { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return {
        success: true,
        articles: data || [],
        period
      };

    } catch (error) {
      logger.error('获取热门文章失败', { error: error.message });
      return {
        success: false,
        articles: [],
        period: options.period || '24h',
        error: error.message
      };
    }
  }

  /**
   * 更新文章统计
   */
  async updateArticleStats(articleId, stats) {
    try {
      if (!validateUUID(articleId)) {
        throw new Error('无效的文章ID');
      }

      const { error } = await supabase
        .from('news_articles')
        .update(stats)
        .eq('id', articleId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      logger.info(`文章统计更新成功: ${articleId}`, { stats });

      return {
        success: true,
        article: data
      };

    } catch (error) {
      logger.error(`更新文章统计失败: ${articleId}`, { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 删除文章
   */
  async deleteArticle(articleId) {
    try {
      if (!validateUUID(articleId)) {
        throw new Error('无效的文章ID');
      }

      const { error } = await supabase
        .from('news_articles')
        .delete()
        .eq('id', articleId);

      if (error) {
        throw error;
      }

      // 清除缓存
      this.articleCache.delete(articleId);

      logger.info(`文章删除成功: ${articleId}`);

      return {
        success: true,
        articleId
      };

    } catch (error) {
      logger.error(`删除文章失败: ${articleId}`, { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取统计信息
   */
  async getStatistics() {
    try {
      const [
        { count: totalArticles },
        { count: todayArticles },
        { count: thisWeekArticles },
        { count: thisMonthArticles },
        { data: categoryStats },
        { data: sourceStats }
      ] = await Promise.all([
        supabase.from('news_articles').select('*', { count: 'exact', head: true }),
        supabase.from('news_articles').select('*', { count: 'exact', head: true }).gte('created_at', new Date().toISOString().split('T')[0]),
        supabase.from('news_articles').select('*', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
        supabase.from('news_articles').select('*', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
        supabase.rpc('get_category_statistics'),
        supabase.rpc('get_source_statistics')
      ]);

      return {
        totalArticles: totalArticles || 0,
        todayArticles: todayArticles || 0,
        thisWeekArticles: thisWeekArticles || 0,
        thisMonthArticles: thisMonthArticles || 0,
        categoryStats: categoryStats || [],
        sourceStats: sourceStats || []
      };

    } catch (error) {
      logger.error('获取新闻统计信息失败', { error: error.message });
      return {
        totalArticles: 0,
        todayArticles: 0,
        thisWeekArticles: 0,
        thisMonthArticles: 0,
        categoryStats: [],
        sourceStats: []
      };
    }
  }

  /**
   * 清理缓存
   */
  clearCache() {
    this.articleCache.clear();
    logger.info('News服务缓存已清理');
  }
}

// 导出服务实例
export const newsService = new NewsService();
export default NewsService;