/**
 * NewsAPI Service
 * 处理NewsAPI源的获取、管理和新闻文章处理
 */

import { v4 as uuidv4 } from 'uuid';
import { NewsAPISourceQueries } from '../database/queries.js';
import dbClient from '../database/client.js';
import logger from '../utils/logger.js';

export class NewsAPIService {
  constructor(config = {}) {
    this.isRunning = false;
    this.activeFetches = new Map();
    this.fetchQueue = [];
    this.maxConcurrentFetches = config.maxConcurrentFetches || 3;

    // 性能优化：缓存和请求管理
    this.responseCache = new Map(); // 响应缓存
    this.requestTimestamps = new Map(); // 请求时间戳
    this.cacheTTL = 300000; // 5分钟缓存
    this.maxCacheSize = 500; // 最大缓存条目
    this.rateLimitDelay = 1000; // API速率限制延迟

    this.defaultConfig = {
      apiKey: config.apiKey || process.env.NEWSAPI_KEY || '09a79d9629f74b25a8eb8c92b2ad983f',
      baseUrl: 'https://newsapi.org/v2',
      timeout: config.timeout || 30000,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      maxArticlesPerRequest: config.maxArticlesPerRequest || 100,
      defaultLanguage: config.defaultLanguage || 'en',
      defaultCountry: config.defaultCountry || 'us',
      cacheEnabled: true,
      rateLimitEnabled: true
    };

    this.config = { ...this.defaultConfig, ...config };
    this.userAgent = 'NewsAggregator/1.0';
  }

  async initialize() {
    try {
      logger.info('初始化NewsAPI Service...');

      // 加载数据库配置
      await this.loadConfig();

      // 验证API密钥
      await this.validateApiKey();

      // 启动缓存清理
      this.startCacheCleanup();

      this.isRunning = true;
      logger.info('NewsAPI Service 初始化完成');
      return true;

    } catch (error) {
      logger.error('NewsAPI Service 初始化失败:', error);
      throw error;
    }
  }

  /**
   * 启动缓存清理
   */
  startCacheCleanup() {
    setInterval(() => {
      this.cleanupCache();
    }, this.cacheTTL);
  }

  /**
   * 清理缓存
   */
  cleanupCache() {
    const now = Date.now();
    let cleanedCount = 0;

    // 清理过期缓存
    for (const [key, cacheData] of this.responseCache.entries()) {
      if (now - cacheData.timestamp > this.cacheTTL) {
        this.responseCache.delete(key);
        cleanedCount++;
      }
    }

    // 如果缓存过大，清理最旧的条目
    if (this.responseCache.size > this.maxCacheSize) {
      const itemsToRemove = this.responseCache.size - this.maxCacheSize;
      const sortedItems = Array.from(this.responseCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);

      for (let i = 0; i < itemsToRemove; i++) {
        this.responseCache.delete(sortedItems[i][0]);
        cleanedCount++;
      }
    }

    // 清理请求时间戳
    for (const [key, timestamp] of this.requestTimestamps.entries()) {
      if (now - timestamp > this.cacheTTL) {
        this.requestTimestamps.delete(key);
      }
    }

    if (cleanedCount > 0) {
      logger.debug('NewsAPI缓存清理完成', { cleanedCount });
    }
  }

  /**
   * 获取缓存数据
   */
  getCacheData(key) {
    const cached = this.responseCache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.cacheTTL) {
      this.responseCache.delete(key);
      return null;
    }

    return cached.data;
  }

  /**
   * 设置缓存数据
   */
  setCacheData(key, data) {
    if (!this.config.cacheEnabled) return;

    // 如果缓存已满，先清理
    if (this.responseCache.size >= this.maxCacheSize) {
      this.cleanupCache();
    }

    this.responseCache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * 检查速率限制
   */
  async checkRateLimit(endpoint) {
    if (!this.config.rateLimitEnabled) return true;

    const now = Date.now();
    const lastRequest = this.requestTimestamps.get(endpoint);

    if (lastRequest && now - lastRequest < this.rateLimitDelay) {
      const delay = this.rateLimitDelay - (now - lastRequest);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    this.requestTimestamps.set(endpoint, now);
    return true;
  }

  async loadConfig() {
    try {
      const { error } = await dbClient
        .from('system_configs')
        .select('config_value')
        .eq('config_key', 'newsapi')
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        const dbConfig = JSON.parse(data.config_value);
        this.config = { ...this.config, ...dbConfig };
        logger.info('已加载NewsAPI配置');
      }
    } catch (error) {
      logger.warn('加载NewsAPI配置失败，使用默认配置:', error);
    }
  }

  async validateApiKey() {
    try {
      const response = await this.makeRequest('/top-headlines', {
        country: 'us',
        pageSize: 1
      });

      if (response.status === 'error') {
        throw new Error(`API密钥无效: ${response.message}`);
      }

      logger.info('NewsAPI密钥验证成功');
      return true;
    } catch (error) {
      logger.error('NewsAPI密钥验证失败:', error);
      throw error;
    }
  }

  async makeRequest(endpoint, params = {}) {
    const url = new URL(`${this.config.baseUrl}${endpoint}`);

    // 添加API密钥
    url.searchParams.append('apiKey', this.config.apiKey);

    // 添加其他参数
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value);
      }
    });

    const fetchId = uuidv4();
    this.activeFetches.set(fetchId, { url: url.toString(), startTime: Date.now() });

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(this.config.timeout)
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          status: 'error',
          message: data.message || `HTTP ${response.status}`,
          code: response.status
        };
      }

      return {
        status: 'ok',
        data,
        requestInfo: {
          url: url.toString(),
          responseTime: Date.now() - this.activeFetches.get(fetchId).startTime
        }
      };
    } catch (error) {
      logger.error('NewsAPI请求失败:', error);
      return {
        status: 'error',
        message: error.message,
        code: 'NETWORK_ERROR'
      };
    } finally {
      this.activeFetches.delete(fetchId);
    }
  }

  async addSource(sourceData) {
    try {
      // 验证NewsAPI源
      const validationResult = await this.validateSource(sourceData.source_id);
      if (!validationResult.valid) {
        throw new Error(`NewsAPI源验证失败: ${validationResult.error}`);
      }

      // 准备源数据
      const newSource = {
        source_id: sourceData.source_id,
        name: sourceData.name || validationResult.sourceInfo.name,
        description: sourceData.description || validationResult.sourceInfo.description,
        category: sourceData.category || 'general',
        language: sourceData.language || validationResult.sourceInfo.language || 'en',
        country: sourceData.country || validationResult.sourceInfo.country || 'us',
        is_active: sourceData.is_active !== false,
        api_config: sourceData.api_config || {}
      };

      const source = await NewsAPISourceQueries.create(newSource);
      logger.info(`NewsAPI源添加成功: ${source.name}`);
      return source;
    } catch (error) {
      logger.error('添加NewsAPI源失败:', error);
      throw error;
    }
  }

  async validateSource(sourceId) {
    try {
      // 获取所有可用源
      const response = await this.makeRequest('/sources', {
        language: 'en'
      });

      if (response.status === 'error') {
        return {
          valid: false,
          error: response.message
        };
      }

      const sources = response.data.sources;
      const sourceInfo = sources.find(s => s.id === sourceId);

      if (!sourceInfo) {
        return {
          valid: false,
          error: `源ID '${sourceId}' 不存在`
        };
      }

      return {
        valid: true,
        sourceInfo: {
          id: sourceInfo.id,
          name: sourceInfo.name,
          description: sourceInfo.description,
          category: sourceInfo.category,
          language: sourceInfo.language,
          country: sourceInfo.country
        }
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  async getAvailableSources(params = {}) {
    try {
      const response = await this.makeRequest('/sources', {
        language: params.language,
        country: params.country,
        category: params.category
      });

      if (response.status === 'error') {
        throw new Error(response.message);
      }

      return {
        sources: response.data.sources,
        total: response.data.sources.length
      };
    } catch (error) {
      logger.error('获取可用NewsAPI源失败:', error);
      throw error;
    }
  }

  async fetchSource(sourceId, options = {}) {
    const fetchId = `newsapi-${sourceId}-${Date.now()}`;

    try {
      logger.info(`开始抓取NewsAPI源: ${sourceId}`);

      // 检查源是否存在
      const source = await NewsAPISourceQueries.findById(sourceId);
      if (!source) {
        throw new Error(`NewsAPI源不存在: ${sourceId}`);
      }

      // 更新源状态
      await NewsAPISourceQueries.updateFetchStatus(sourceId, {
        status: 'running',
        last_fetched_at: new Date().toISOString()
      });

      // 准备请求参数
      const requestParams = {
        sources: sourceId,
        pageSize: options.maxArticles || this.config.maxArticlesPerRequest,
        language: source.language || this.config.defaultLanguage
      };

      // 获取文章
      const response = await this.makeRequest('/everything', requestParams);

      if (response.status === 'error') {
        throw new Error(response.message);
      }

      const articles = response.data.articles;
      logger.info(`从NewsAPI源 ${sourceId} 获取到 ${articles.length} 篇文章`);

      // 处理文章
      const processedArticles = [];
      let savedCount = 0;

      for (const article of articles) {
        try {
          const processedArticle = await this.processArticle(article, source);
          if (processedArticle) {
            processedArticles.push(processedArticle);
            savedCount++;
          }
        } catch (error) {
          logger.warn(`处理文章失败: ${error.message}`);
        }
      }

      // 更新源统计信息
      await NewsAPISourceQueries.updateFetchStatus(sourceId, {
        status: 'completed',
        total_articles_fetched: (source.total_articles_fetched || 0) + savedCount,
        fetch_error_count: 0,
        last_fetched_at: new Date().toISOString()
      });

      logger.info(`NewsAPI源 ${sourceId} 抓取完成，保存 ${savedCount} 篇文章`);

      return {
        success: true,
        sourceId,
        articlesFound: articles.length,
        articlesSaved: savedCount,
        executionTime: response.requestInfo?.responseTime || 0,
        articles: processedArticles
      };

    } catch (error) {
      logger.error(`NewsAPI源 ${sourceId} 抓取失败:`, error);

      // 更新源错误状态
      try {
        await NewsAPISourceQueries.updateFetchStatus(sourceId, {
          status: 'failed',
          last_fetched_at: new Date().toISOString()
        });
      } catch (updateError) {
        logger.warn('更新源错误状态失败:', updateError.message);
      }

      return {
        success: false,
        sourceId,
        error: error.message
      };
    }
  }

  async processArticle(article, source) {
    try {
      // 检查文章是否已存在
      const existingArticle = await this.checkArticleExists(article.url);
      if (existingArticle) {
        logger.debug(`文章已存在: ${article.url}`);
        return null;
      }

      // 处理文章内容
      const processedArticle = {
        title: this.cleanTitle(article.title),
        content: this.cleanContent(article.content || article.description),
        summary: this.generateSummary(article.description || article.content),
        url: article.url,
        image_url: article.urlToImage,
        author: article.author,
        source_type: 'newsapi',
        newsapi_source_id: source.id,
        original_language: source.language || 'en',
        category: source.category,
        published_at: article.publishedAt ? new Date(article.publishedAt).toISOString() : new Date().toISOString(),
        word_count: this.countWords(article.content || article.description),
        reading_time: this.calculateReadingTime(article.content || article.description),
        tags: this.extractTags(article.title, article.description),
        metadata: {
          source_name: source.name,
          api_source: 'newsapi',
          raw_data: article
        }
      };

      // 保存文章
      const savedArticle = await this.saveArticle(processedArticle);
      logger.debug(`文章保存成功: ${savedArticle.title}`);

      return savedArticle;
    } catch (error) {
      logger.error(`处理文章失败: ${error.message}`);
      throw error;
    }
  }

  async checkArticleExists(url) {
    try {
      const { data, error } = await dbClient
        .from('news_articles')
        .select('id')
        .eq('url', url)
        .single();

      return data || null;
    } catch (error) {
      return null;
    }
  }

  async saveArticle(articleData) {
    try {
      const { data, error } = await dbClient
        .from('news_articles')
        .insert([articleData])
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      logger.error('保存文章失败:', error);
      throw error;
    }
  }

  async fetchTopHeadlines(params = {}) {
    try {
      logger.info('获取头条新闻...');

      const requestParams = {
        country: params.country || this.config.defaultCountry,
        category: params.category,
        pageSize: params.pageSize || 20,
        page: params.page || 1
      };

      const response = await this.makeRequest('/top-headlines', requestParams);

      if (response.status === 'error') {
        throw new Error(response.message);
      }

      const articles = response.data.articles;
      logger.info(`获取到 ${articles.length} 篇头条新闻`);

      return {
        success: true,
        articles,
        totalResults: response.data.totalResults,
        responseTime: response.requestInfo?.responseTime || 0
      };

    } catch (error) {
      logger.error('获取头条新闻失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async searchNews(params = {}) {
    try {
      logger.info(`搜索新闻: ${params.q}`);

      const requestParams = {
        q: params.q,
        searchIn: params.searchIn,
        sources: params.sources,
        domains: params.domains,
        excludeDomains: params.excludeDomains,
        from: params.from,
        to: params.to,
        language: params.language || this.config.defaultLanguage,
        sortBy: params.sortBy || 'publishedAt',
        pageSize: params.pageSize || 20,
        page: params.page || 1
      };

      const response = await this.makeRequest('/everything', requestParams);

      if (response.status === 'error') {
        throw new Error(response.message);
      }

      const articles = response.data.articles;
      logger.info(`搜索到 ${articles.length} 篇文章`);

      return {
        success: true,
        articles,
        totalResults: response.data.totalResults,
        responseTime: response.requestInfo?.responseTime || 0
      };

    } catch (error) {
      logger.error('搜索新闻失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 辅助方法
  cleanTitle(title) {
    if (!title) return '无标题';
    return title.trim().replace(/\s+/g, ' ');
  }

  cleanContent(content) {
    if (!content) return '';
    return content
      .trim()
      .replace(/\[+\]/g, '') // 移除方括号
      .replace(/\s+/g, ' ')
      .substring(0, 5000); // 限制长度
  }

  generateSummary(content) {
    if (!content) return '';
    const sentences = content.split(/[.!?]/).filter(s => s.trim().length > 0);
    if (sentences.length <= 2) return content;
    return `${sentences.slice(0, 2).join('. ')  }...`;
  }

  countWords(text) {
    if (!text) return 0;
    return text.trim().split(/\s+/).length;
  }

  calculateReadingTime(text) {
    const wordsPerMinute = 200;
    const wordCount = this.countWords(text);
    return Math.max(1, Math.ceil(wordCount / wordsPerMinute));
  }

  extractTags(title, content) {
    const text = `${title} ${content}`.toLowerCase();
    const tags = [];

    // 简单的关键词提取
    const keywords = ['tech', 'technology', 'business', 'finance', 'politics', 'science', 'health'];
    keywords.forEach(keyword => {
      if (text.includes(keyword)) {
        tags.push(keyword);
      }
    });

    return tags;
  }

  async getSources(params = {}) {
    try {
      const sources = await NewsAPISourceQueries.list({
        pagination: params.pagination,
        filters: params.filters,
        sort: params.sort
      });

      return sources;
    } catch (error) {
      logger.error('获取NewsAPI源列表失败:', error);
      throw error;
    }
  }

  async updateSource(id, updateData) {
    try {
      const source = await NewsAPISourceQueries.update(id, updateData);
      logger.info(`NewsAPI源更新成功: ${source.name}`);
      return source;
    } catch (error) {
      logger.error('更新NewsAPI源失败:', error);
      throw error;
    }
  }

  async deleteSource(id) {
    try {
      await NewsAPISourceQueries.delete(id);
      logger.info(`NewsAPI源删除成功: ${id}`);
      return true;
    } catch (error) {
      logger.error('删除NewsAPI源失败:', error);
      throw error;
    }
  }

  async getStats() {
    return {
      activeFetches: this.activeFetches.size,
      maxConcurrentFetches: this.maxConcurrentFetches,
      config: this.config,
      isRunning: this.isRunning
    };
  }
}

export default NewsAPIService;