/**
 * RSS服务模块 - 处理RSS源获取和解析
 * 遵循Node.js最佳实践：模块化、错误处理、日志记录
 */

import RSSParser from 'rss-parser';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { createClient } from '@supabase/supabase-js';
import logger from '../../utils/logger.js';
import { validateUrl } from '../../utils/validators.js';
import { CircuitBreaker } from '../../utils/circuit-breaker.js';

const rssParser = new RSSParser();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// RSS服务配置
const RSS_CONFIG = {
  maxRetries: 3,
  timeout: 30000,
  userAgent: 'NewsAggregator/1.0',
  maxArticlesPerSource: 100,
  minIntervalBetweenRequests: 1000,
  supportedFormats: ['rss', 'atom', 'rdf']
};

// RSS源健康状态缓存
const sourceHealthCache = new Map();

/**
 * RSS服务类
 */
class RSSService {
  constructor() {
    this.parser = rssParser;
    this.circuitBreaker = new CircuitBreaker({
      timeout: RSS_CONFIG.timeout,
      errorThresholdPercentage: 50,
      resetTimeout: 60000
    });
  }

  /**
   * 获取RSS源内容
   */
  async fetchRSSFeed(sourceId, sourceUrl) {
    try {
      logger.info(`正在获取RSS源: ${sourceUrl}`, { sourceId });

      // 验证URL格式
      if (!validateUrl(sourceUrl)) {
        throw new Error(`无效的RSS源URL: ${sourceUrl}`);
      }

      // 使用断路器保护
      const feed = await this.circuitBreaker.execute(async () => {
        const response = await axios.get(sourceUrl, {
          timeout: RSS_CONFIG.timeout,
          headers: {
            'User-Agent': RSS_CONFIG.userAgent,
            'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml'
          },
          validateStatus: (status) => status < 500
        });

        if (response.status !== 200) {
          throw new Error(`RSS源返回状态码: ${response.status}`);
        }

        // 解析RSS内容
        return await this.parser.parseString(response.data);
      });

      // 更新源健康状态
      await this.updateSourceHealth(sourceId, true);

      logger.info(`成功获取RSS源: ${sourceUrl}`, {
        sourceId,
        articleCount: feed.items.length
      });

      return {
        success: true,
        feed,
        articles: feed.items
      };

    } catch (error) {
      logger.error(`获取RSS源失败: ${sourceUrl}`, {
        sourceId,
        error: error.message
      });

      // 更新源健康状态
      await this.updateSourceHealth(sourceId, false, error.message);

      return {
        success: false,
        error: error.message,
        articles: []
      };
    }
  }

  /**
   * 批量获取多个RSS源
   */
  async fetchMultipleSources(sources) {
    const results = [];

    for (const source of sources) {
      try {
        // 限制请求频率
        if (results.length > 0) {
          await new Promise(resolve =>
            setTimeout(resolve, RSS_CONFIG.minIntervalBetweenRequests)
          );
        }

        const result = await this.fetchRSSFeed(source.id, source.url);
        results.push({
          sourceId: source.id,
          sourceUrl: source.url,
          ...result
        });

      } catch (error) {
        logger.error(`批量获取RSS源失败: ${source.url}`, {
          sourceId: source.id,
          error: error.message
        });

        results.push({
          sourceId: source.id,
          sourceUrl: source.url,
          success: false,
          error: error.message,
          articles: []
        });
      }
    }

    return results;
  }

  /**
   * 解析RSS文章并标准化格式
   */
  parseArticle(article, sourceId, sourceUrl) {
    return {
      id: uuidv4(),
      source_id: sourceId,
      title: this.cleanText(article.title),
      content: this.extractContent(article),
      summary: this.generateSummary(article),
      author: this.extractAuthor(article),
      publish_date: this.parseDate(article.pubDate),
      url: article.link,
      image_url: this.extractImageUrl(article),
      categories: this.extractCategories(article),
      tags: this.extractTags(article),
      raw_data: JSON.stringify(article),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  /**
   * 清理文本内容
   */
  cleanText(text) {
    if (!text) return '';

    return text
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s\u4e00-\u9fff.,!?;:()""''-]/g, '')
      .trim();
  }

  /**
   * 提取文章内容
   */
  extractContent(article) {
    if (article.content) {
      return article.content;
    }

    if (article['content:encoded']) {
      return article['content:encoded'];
    }

    if (article.summary) {
      return article.summary;
    }

    return '';
  }

  /**
   * 生成文章摘要
   */
  generateSummary(article) {
    const content = this.extractContent(article);
    if (!content) return '';

    // 移除HTML标签
    const plainText = content.replace(/<[^>]*>/g, '');

    // 截取前200个字符
    return plainText.length > 200
      ? `${plainText.substring(0, 200)  }...`
      : plainText;
  }

  /**
   * 提取作者信息
   */
  extractAuthor(article) {
    if (article.author) {
      return article.author;
    }

    if (article.creator) {
      return article.creator;
    }

    if (article['dc:creator']) {
      return article['dc:creator'];
    }

    return null;
  }

  /**
   * 解析日期
   */
  parseDate(dateString) {
    if (!dateString) return new Date().toISOString();

    try {
      const date = new Date(dateString);
      return isNaN(date.getTime())
        ? new Date().toISOString()
        : date.toISOString();
    } catch (error) {
      logger.warn(`日期解析失败: ${dateString}`, { error: error.message });
      return new Date().toISOString();
    }
  }

  /**
   * 提取图片URL
   */
  extractImageUrl(article) {
    if (article.enclosure?.url?.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      return article.enclosure.url;
    }

    if (article['media:content']?.url?.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      return article['media:content'].url;
    }

    return null;
  }

  /**
   * 提取分类
   */
  extractCategories(article) {
    const categories = [];

    if (article.categories) {
      if (Array.isArray(article.categories)) {
        categories.push(...article.categories);
      } else {
        categories.push(article.categories);
      }
    }

    return categories.filter(cat => cat && cat.trim());
  }

  /**
   * 提取标签
   */
  extractTags(article) {
    const tags = [];

    // 从标题提取关键词
    if (article.title) {
      const titleWords = article.title
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 2);
      tags.push(...titleWords);
    }

    // 从分类提取标签
    const categories = this.extractCategories(article);
    tags.push(...categories.map(cat => cat.toLowerCase()));

    // 去重并过滤
    return [...new Set(tags)]
      .filter(tag => tag.length > 1)
      .slice(0, 10);
  }

  /**
   * 保存文章到数据库
   */
  async saveArticles(articles) {
    try {
      if (articles.length === 0) {
        logger.info('没有文章需要保存');
        return { success: true, savedCount: 0 };
      }

      logger.info(`正在保存 ${articles.length} 篇文章到数据库`);

      // 批量插入文章
      const { error } = await supabase
        .from('news_articles')
        .upsert(articles, {
          onConflict: 'url',
          ignoreDuplicates: false
        })
        .select();

      if (error) {
        throw error;
      }

      logger.info(`成功保存 ${data.length} 篇文章`);

      return {
        success: true,
        savedCount: data.length
      };

    } catch (error) {
      logger.error('保存文章失败', { error: error.message });

      return {
        success: false,
        error: error.message,
        savedCount: 0
      };
    }
  }

  /**
   * 更新RSS源健康状态
   */
  async updateSourceHealth(sourceId, isHealthy, errorMessage = null) {
    try {
      const healthData = {
        is_healthy: isHealthy,
        last_checked: new Date().toISOString(),
        error_message: errorMessage
      };

      const { error } = await supabase
        .from('rss_sources')
        .update(healthData)
        .eq('id', sourceId);

      if (error) {
        logger.error(`更新RSS源健康状态失败: ${sourceId}`, { error: error.message });
      }

      // 更新缓存
      sourceHealthCache.set(sourceId, {
        ...healthData,
        timestamp: Date.now()
      });

    } catch (error) {
      logger.error(`更新RSS源健康状态失败: ${sourceId}`, { error: error.message });
    }
  }

  /**
   * 获取RSS源健康分数
   */
  getSourceHealthScore(sourceId) {
    const cached = sourceHealthCache.get(sourceId);
    if (!cached) return 0;

    // 基于健康状态和检查时间计算分数
    const age = Date.now() - cached.timestamp;
    const agePenalty = Math.min(age / (24 * 60 * 60 * 1000), 1); // 最大1天

    return cached.is_healthy
      ? Math.max(0, 100 - (agePenalty * 50))
      : Math.max(0, 50 - (agePenalty * 30));
  }

  /**
   * 验证RSS源格式
   */
  validateRSSFeed(feedData) {
    if (!feedData) {
      return { valid: false, errors: ['RSS源数据为空'] };
    }

    const errors = [];

    if (!feedData.title) {
      errors.push('缺少RSS源标题');
    }

    if (!feedData.items || !Array.isArray(feedData.items)) {
      errors.push('缺少文章列表或格式错误');
    }

    if (feedData.items && feedData.items.length === 0) {
      errors.push('RSS源没有文章');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 检查RSS源更新频率
   */
  async checkUpdateFrequency(sourceId, sourceUrl) {
    try {
      // 获取最近的文章
      const { data: recentArticles, error } = await supabase
        .from('news_articles')
        .select('publish_date')
        .eq('source_id', sourceId)
        .order('publish_date', { ascending: false })
        .limit(5);

      if (error) {
        throw error;
      }

      if (recentArticles.length < 2) {
        return { frequency: 'unknown', interval: 0 };
      }

      // 计算平均发布间隔
      const intervals = [];
      for (let i = 1; i < recentArticles.length; i++) {
        const interval = new Date(recentArticles[i-1].publish_date) -
                        new Date(recentArticles[i].publish_date);
        intervals.push(interval);
      }

      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

      // 分类更新频率
      let frequency = 'unknown';
      if (avgInterval < 60 * 60 * 1000) { // 1小时内
        frequency = 'frequent';
      } else if (avgInterval < 24 * 60 * 60 * 1000) { // 1天内
        frequency = 'normal';
      } else {
        frequency = 'infrequent';
      }

      return {
        frequency,
        interval: avgInterval
      };

    } catch (error) {
      logger.error(`检查RSS源更新频率失败: ${sourceId}`, { error: error.message });
      return { frequency: 'unknown', interval: 0 };
    }
  }

  /**
   * 获取RSS服务统计信息
   */
  async getStatistics() {
    try {
      const [
        { count: totalSources },
        { count: healthySources },
        { count: totalArticles },
        { count: recentArticles }
      ] = await Promise.all([
        supabase.from('rss_sources').select('*', { count: 'exact', head: true }),
        supabase.from('rss_sources').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('is_healthy', true),
        supabase.from('news_articles').select('*', { count: 'exact', head: true }),
        supabase.from('news_articles').select('*', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      ]);

      return {
        totalSources: totalSources || 0,
        healthySources: healthySources || 0,
        totalArticles: totalArticles || 0,
        recentArticles: recentArticles || 0,
        healthRate: totalSources ? (healthySources / totalSources) * 100 : 0
      };

    } catch (error) {
      logger.error('获取RSS服务统计信息失败', { error: error.message });
      return {
        totalSources: 0,
        healthySources: 0,
        totalArticles: 0,
        recentArticles: 0,
        healthRate: 0
      };
    }
  }
}

// 导出服务实例
export const rssService = new RSSService();
export default RSSService;