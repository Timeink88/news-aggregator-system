/**
 * RSS Manager Service - RSS源管理和内容提取服务
 * 遵循Node.js最佳实践：错误处理、重试机制、性能优化、日志记录
 * 实现基于JSDOM和cheerio的高级内容提取
 */

import { EventEmitter } from 'events';
import RSSParser from 'rss-parser';
import logger from '../utils/logger.js';
import { RSSSourceQueries } from '../database/queries.js';
import dbClient from '../database/client.js';
import { v4 as uuidv4 } from 'uuid';
import { JSDOM } from 'jsdom';
import fetch from 'node-fetch';

// newspaper3k是Python库，在Node.js中不可用
// 我们将使用JSDOM和cheerio进行内容提取
const hasAdvancedContentExtraction = true;

// RSS解析器实例
const parser = new RSSParser({
  timeout: 30000,
  customFields: {
    item: ['media:content', 'media:thumbnail', 'enclosure', 'dc:creator', 'content:encoded']
  }
});

/**
 * RSS Manager Service类
 */
class RSSManagerService extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
    this.activeFetches = new Map();
    this.fetchQueue = [];
    this.maxConcurrentFetches = 5;

    // 性能优化：缓存和内存管理
    this.articleCache = new Map(); // 文章缓存
    this.sourceCache = new Map(); // RSS源缓存
    this.cacheTTL = 300000; // 5分钟缓存
    this.maxCacheSize = 1000; // 最大缓存条目
    this.cleanupInterval = 60000; // 1分钟清理一次

    // 并发控制
    this.fetchSemaphore = new Map(); // 并发信号量
    this.requestQueue = new Map(); // 请求队列

    // 重试机制配置
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffFactor: 2
    };

    this.defaultConfig = {
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      userAgent: 'NewsAggregator/1.0',
      maxContentLength: 50000,
      defaultLanguage: 'zh',
      cacheEnabled: true,
      maxConcurrentPerSource: 2,
      connectionTimeout: 10000,
      requestTimeout: 30000,
      // 高级内容提取配置
      useAdvancedExtraction: true,
      advancedExtractionTimeout: 15000,
      extractImages: true,
      extractMetadata: true,
      keepArticleHtml: false
    };
  }

  /**
   * 初始化RSS Manager Service
   */
  async initialize() {
    try {
      logger.info('正在初始化RSS Manager Service...');

      // 加载配置
      await this.loadConfig();

      // 启动定期清理
      this.startCleanupTask();

      // 启动健康检查
      this.startHealthCheck();

      logger.info('RSS Manager Service初始化成功');
      return true;

    } catch (error) {
      logger.error('RSS Manager Service初始化失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 加载配置
   */
  async loadConfig() {
    try {
      const rssConfig = await dbClient.rpc('get_system_config', { key: 'rss_monitoring' });
      if (rssConfig) {
        this.config = {
          ...this.defaultConfig,
          ...rssConfig
        };
      } else {
        this.config = this.defaultConfig;
      }
    } catch (error) {
      logger.warn('加载RSS配置失败，使用默认配置', { error: error.message });
      this.config = this.defaultConfig;
    }
  }

  /**
   * 启动定期清理任务
   */
  startCleanupTask() {
    // 每6小时清理一次活跃抓取缓存
    setInterval(() => {
      this.cleanupActiveFetches();
    }, 6 * 60 * 60 * 1000);

    // 每分钟清理一次缓存
    setInterval(() => {
      this.cleanupCache();
    }, this.cleanupInterval);

    logger.info('RSS清理任务已启动');
  }

  /**
   * 启动健康检查
   */
  startHealthCheck() {
    // 每30分钟检查一次服务健康状态
    setInterval(async () => {
      await this.performHealthCheck();
    }, 30 * 60 * 1000);

    logger.info('RSS健康检查已启动');
  }

  /**
   * 执行健康检查
   */
  async performHealthCheck() {
    try {
      const health = {
        timestamp: new Date().toISOString(),
        activeFetches: this.activeFetches.size,
        cacheSize: this.articleCache.size,
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime()
      };

      // 检查活跃抓取状态
      const staleFetches = Array.from(this.activeFetches.entries())
        .filter(([_, info]) => Date.now() - info.startTime > 30 * 60 * 1000);

      if (staleFetches.length > 0) {
        logger.warn('发现过期的RSS抓取任务', { staleFetches: staleFetches.length });
        staleFetches.forEach(([key]) => this.activeFetches.delete(key));
      }

      // 发送健康状态事件
      this.emit('healthCheck', health);

      logger.debug('RSS健康检查完成', health);

    } catch (error) {
      logger.error('RSS健康检查失败', { error: error.message });
    }
  }

  /**
   * 清理活跃抓取缓存
   */
  cleanupActiveFetches() {
    const now = Date.now();
    const staleTime = 30 * 60 * 1000; // 30分钟

    for (const [key, fetchInfo] of this.activeFetches.entries()) {
      if (now - fetchInfo.startTime > staleTime) {
        this.activeFetches.delete(key);
        logger.warn(`清理过期的RSS抓取任务: ${key}`);
      }
    }
  }

  /**
   * 清理缓存
   */
  cleanupCache() {
    const now = Date.now();
    let cleanedCount = 0;

    // 清理过期缓存
    for (const [key, cacheData] of this.articleCache.entries()) {
      if (now - cacheData.timestamp > this.cacheTTL) {
        this.articleCache.delete(key);
        cleanedCount++;
      }
    }

    // 清理RSS源缓存
    for (const [key, cacheData] of this.sourceCache.entries()) {
      if (now - cacheData.timestamp > this.cacheTTL) {
        this.sourceCache.delete(key);
        cleanedCount++;
      }
    }

    // 如果缓存过大，清理最旧的条目
    if (this.articleCache.size > this.maxCacheSize) {
      const itemsToRemove = this.articleCache.size - this.maxCacheSize;
      const sortedItems = Array.from(this.articleCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);

      for (let i = 0; i < itemsToRemove; i++) {
        this.articleCache.delete(sortedItems[i][0]);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug('缓存清理完成', { cleanedCount });
    }
  }

  /**
   * 获取缓存数据
   * @param {string} key - 缓存键
   * @returns {Object|null} 缓存数据
   */
  getCacheData(key) {
    const cached = this.articleCache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.cacheTTL) {
      this.articleCache.delete(key);
      return null;
    }

    return cached.data;
  }

  /**
   * 设置缓存数据
   * @param {string} key - 缓存键
   * @param {Object} data - 数据
   */
  setCacheData(key, data) {
    if (!this.config.cacheEnabled) return;

    // 如果缓存已满，先清理
    if (this.articleCache.size >= this.maxCacheSize) {
      this.cleanupCache();
    }

    this.articleCache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * 添加RSS源
   * @param {Object} sourceData - RSS源数据
   * @returns {Promise<Object>} 创建的RSS源
   */
  async addSource(sourceData) {
    try {
      logger.info('添加RSS源', { name: sourceData.name, url: sourceData.url });

      // 验证RSS源
      const validationResult = await this.validateSource(sourceData.url);
      if (!validationResult.valid) {
        throw new Error(`RSS源验证失败: ${validationResult.error}`);
      }

      // 创建RSS源
      const source = await RSSSourceQueries.create({
        url: sourceData.url,
        name: sourceData.name,
        category: sourceData.category,
        source_type: 'rss',
        is_active: true,
        last_checked: null,
        status: 'active',
        error_count: 0,
        max_articles: sourceData.max_articles || 10,
        fetch_interval: sourceData.fetch_interval || 300,
        priority: sourceData.priority || 5,
        metadata: sourceData.metadata || {}
      });

      logger.info('RSS源添加成功', { id: source.id, name: source.name });

      // 发送事件
      this.emit('sourceAdded', source);

      return source;

    } catch (error) {
      logger.error('添加RSS源失败', { error: error.message, sourceData });
      throw error;
    }
  }

  /**
   * 验证RSS源
   * @param {string} url - RSS源URL
   * @returns {Promise<Object>} 验证结果
   */
  async validateSource(url) {
    try {
      const feed = await parser.parseURL(url);

      return {
        valid: true,
        feedInfo: {
          title: feed.title,
          description: feed.description,
          language: feed.language,
          lastBuildDate: feed.lastBuildDate,
          itemCount: feed.items?.length || 0,
          link: feed.link
        }
      };

    } catch (error) {
      logger.error('RSS源验证失败', { url, error: error.message });

      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * 更新RSS源
   * @param {string} id - RSS源ID
   * @param {Object} updateData - 更新数据
   * @returns {Promise<Object>} 更新后的RSS源
   */
  async updateSource(id, updateData) {
    try {
      logger.info('更新RSS源', { id });

      // 如果更新URL，需要重新验证
      if (updateData.url) {
        const validationResult = await this.validateSource(updateData.url);
        if (!validationResult.valid) {
          throw new Error(`RSS源验证失败: ${validationResult.error}`);
        }
      }

      const source = await RSSSourceQueries.update(id, updateData);

      logger.info('RSS源更新成功', { id, name: source.name });

      // 发送事件
      this.emit('sourceUpdated', source);

      return source;

    } catch (error) {
      logger.error('更新RSS源失败', { id, error: error.message });
      throw error;
    }
  }

  /**
   * 删除RSS源
   * @param {string} id - RSS源ID
   * @returns {Promise<boolean>} 是否成功删除
   */
  async deleteSource(id) {
    try {
      logger.info('删除RSS源', { id });

      await RSSSourceQueries.delete(id);

      logger.info('RSS源删除成功', { id });

      // 发送事件
      this.emit('sourceDeleted', { id });

      return true;

    } catch (error) {
      logger.error('删除RSS源失败', { id, error: error.message });
      throw error;
    }
  }

  /**
   * 获取所有RSS源
   * @param {Object} params - 查询参数
   * @returns {Promise<PaginatedResult>} 分页结果
   */
  async getSources(params = {}) {
    try {
      const result = await RSSSourceQueries.list(params);
      return result;

    } catch (error) {
      logger.error('获取RSS源列表失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 获取活跃的RSS源
   * @returns {Promise<Array>} 活跃的RSS源列表
   */
  async getActiveSources() {
    try {
      const sources = await RSSSourceQueries.getActiveSources();
      return sources;

    } catch (error) {
      logger.error('获取活跃RSS源失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 抓取单个RSS源
   * @param {string} sourceId - RSS源ID
   * @param {Object} options - 抓取选项
   * @returns {Promise<Object>} 抓取结果
   */
  async fetchSource(sourceId, options = {}) {
    const fetchKey = `${sourceId}-${Date.now()}`;

    try {
      // 检查缓存
      const cacheKey = `source-${sourceId}`;
      const cachedResult = this.getCacheData(cacheKey);
      if (cachedResult && options.useCache !== false) {
        logger.debug('使用缓存数据', { sourceId });
        return cachedResult;
      }

      // 检查并发限制
      const currentFetches = Array.from(this.activeFetches.keys()).filter(key => key.startsWith(sourceId));
      if (currentFetches.length >= this.config.maxConcurrentPerSource) {
        logger.warn('RSS源并发请求过多', { sourceId, currentFetches: currentFetches.length });
        return { success: false, message: 'RSS源并发请求过多' };
      }

      // 记录抓取开始
      this.activeFetches.set(sourceId, {
        startTime: Date.now(),
        options
      });

      logger.info('开始抓取RSS源', { sourceId, options });

      // 获取RSS源信息
      const source = await RSSSourceQueries.findById(sourceId);
      if (!source) {
        throw new Error('RSS源不存在');
      }

      // 使用重试机制解析RSS
      const fetchResult = await this.withRetry(
        () => this.parseRSSFeed(source, options),
        `parseRSSFeed-${sourceId}`,
        this.config.maxRetries
      );

      // 保存文章
      const saveResult = await this.saveArticles(source, fetchResult.articles);

      // 更新RSS源状态
      await this.updateSourceStatus(sourceId, {
        last_checked: new Date().toISOString(),
        status: 'active',
        error_count: 0
      });

      // 清理抓取记录
      this.activeFetches.delete(sourceId);

      logger.info('RSS源抓取完成', {
        sourceId,
        articlesFound: fetchResult.articles.length,
        articlesSaved: saveResult.saved_count,
        executionTime: Date.now() - this.activeFetches.get(sourceId)?.startTime || Date.now()
      });

      // 发送事件
      this.emit('newsFetched', {
        source: sourceId,
        articles: fetchResult.articles,
        articlesSaved: saveResult.saved_count,
        executionTime: Date.now() - this.activeFetches.get(sourceId)?.startTime || Date.now()
      });

      // 缓存结果
      const result = {
        success: true,
        articlesFound: fetchResult.articles.length,
        articlesSaved: saveResult.saved_count,
        executionTime: Date.now() - this.activeFetches.get(sourceId)?.startTime || Date.now()
      };

      // 缓存成功的结果（缓存5分钟）
      this.setCacheData(cacheKey, result);

      return result;

    } catch (error) {
      // 清理抓取记录
      this.activeFetches.delete(sourceId);

      logger.error('RSS源抓取失败', { sourceId, error: error.message });

      // 发送错误事件
      this.emit('error', error);

      // 更新错误状态
      try {
        const source = await RSSSourceQueries.findById(sourceId);
        if (source) {
          await this.updateSourceStatus(sourceId, {
            last_checked: new Date().toISOString(),
            status: 'error',
            error_count: source.error_count + 1
          });
        }
      } catch (updateError) {
        logger.error('更新RSS源错误状态失败', { sourceId, error: updateError.message });
      }

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 重试机制
   * @param {Function} fn - 要重试的函数
   * @param {string} operation - 操作名称
   * @param {number} maxRetries - 最大重试次数
   * @returns {Promise<any>} 函数结果
   */
  async withRetry(fn, operation, maxRetries = 3) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt === maxRetries) {
          logger.error(`${operation} 重试失败`, { attempt, maxRetries, error: error.message });
          throw error;
        }

        const delay = Math.min(
          this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffFactor, attempt - 1),
          this.retryConfig.maxDelay
        );

        logger.warn(`${operation} 重试 ${attempt}/${maxRetries}`, {
          error: error.message,
          nextRetryIn: delay
        });

        await this.delay(delay);
      }
    }

    throw lastError;
  }

  /**
   * 解析RSS Feed
   * @param {Object} source - RSS源对象
   * @param {Object} options - 解析选项
   * @returns {Promise<Object>} 解析结果
   */
  async parseRSSFeed(source, options = {}) {
    try {
      const config = {
        ...this.config,
        ...options
      };

      // 解析RSS
      const feed = await parser.parseURL(source.url, {
        timeout: config.timeout,
        headers: {
          'User-Agent': config.userAgent
        }
      });

      // 处理文章
      const articles = await this.processFeedItems(feed.items, source, config);

      return {
        feedInfo: {
          title: feed.title,
          description: feed.description,
          language: feed.language,
          lastBuildDate: feed.lastBuildDate,
          link: feed.link
        },
        articles
      };

    } catch (error) {
      logger.error('解析RSS Feed失败', { sourceId: source.id, url: source.url, error: error.message });
      throw error;
    }
  }

  /**
   * 处理Feed项目
   * @param {Array} items - Feed项目数组
   * @param {Object} source - RSS源对象
   * @param {Object} config - 配置对象
   * @returns {Promise<Array>} 处理后的文章数组
   */
  async processFeedItems(items, source, config) {
    const articles = [];

    for (const item of items) {
      try {
        const article = await this.processFeedItem(item, source, config);
        if (article) {
          articles.push(article);
        }
      } catch (error) {
        logger.warn('处理Feed项目失败', {
          title: item.title,
          sourceId: source.id,
          error: error.message
        });
      }
    }

    return articles;
  }

  /**
   * 处理单个Feed项目
   * @param {Object} item - Feed项目
   * @param {Object} source - RSS源对象
   * @param {Object} config - 配置对象
   * @returns {Promise<Object|null>} 处理后的文章对象
   */
  async processFeedItem(item, source, config) {
    try {
      // 检查是否已存在
      const existingArticle = await this.checkArticleExists(item.link || item.guid);
      if (existingArticle) {
        return null;
      }

      // 使用高级内容提取（如果可用）
      let content, extractedData;
      if (config.useAdvancedExtraction && hasAdvancedContentExtraction) {
        try {
          extractedData = await this.extractContentWithAdvancedExtractor(item.link || item.guid, config);
          content = extractedData.content;
        } catch (error) {
          logger.warn('高级内容提取失败，使用基础提取', {
            url: item.link,
            error: error.message
          });
          content = this.extractContent(item);
        }
      } else {
        content = this.extractContent(item);
      }

      // 限制内容长度
      if (content.length > config.maxContentLength) {
        content = `${content.substring(0, config.maxContentLength)}...`;
      }

      // 清理HTML标签
      const cleanContent = this.cleanHTML(content);

      // 提取作者
      const author = this.extractAuthor(item, source);

      // 确定语言
      const language = item.language || source.language || config.defaultLanguage;

      // 创建文章对象
      const article = {
        title: this.cleanTitle(item.title),
        content: cleanContent,
        url: item.link || item.guid,
        author,
        publish_date: this.parseDate(item.pubDate || item.isoDate),
        source_id: source.id,
        source_type: 'rss',
        category: source.category,
        language,
        original_language: language,
        word_count: this.countWords(cleanContent),
        reading_time: Math.ceil(this.countWords(cleanContent) / 200), // 假设每分钟200字
        image_url: this.extractImage(item, extractedData),
        summary: this.generateSummary(cleanContent),
        tags: extractedData?.keywords || this.extractTags(item),
        metadata: {
          extracted_by: config.useAdvancedExtraction && hasAdvancedContentExtraction ? 'advanced' : 'basic',
          extraction_quality: extractedData?.quality || 0.8,
          source_feed_title: source.name,
          extraction_time: Date.now()
        }
      };

      return article;

    } catch (error) {
      logger.error('处理Feed项目失败', {
        title: item.title,
        sourceId: source.id,
        error: error.message
      });
      return null;
    }
  }

  /**
   * 使用newspaper3k进行内容提取
   * @param {string} url - 文章URL
   * @param {Object} config - 配置对象
   * @returns {Promise<Object>} 提取结果
   */
  async extractContentWithAdvancedExtractor(url, config) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('高级内容提取超时'));
      }, config.advancedExtractionTimeout);

      this.fetchUrlContent(url)
        .then(html => {
          clearTimeout(timeout);
          const extractedData = this.extractContentFromHTML(html, url);
          resolve(extractedData);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  async fetchUrlContent(url) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 15000
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      throw new Error(`获取URL内容失败: ${error.message}`);
    }
  }

  extractContentFromHTML(html, url) {
    try {
      const dom = new JSDOM(html);
      const document = dom.window.document;

      // 移除不需要的元素
      const unwantedElements = document.querySelectorAll('script, style, nav, header, footer, aside, .ads, .advertisement, .comments');
      unwantedElements.forEach(el => el.remove());

      // 尝试找到主要内容区域
      let contentElement = document.querySelector('article') ||
                          document.querySelector('[role="main"]') ||
                          document.querySelector('.content') ||
                          document.querySelector('.main-content') ||
                          document.querySelector('main');

      if (!contentElement) {
        // 如果找不到明确的内容区域，使用body但移除导航等
        contentElement = document.body;
      }

      // 提取文本内容
      const content = contentElement.textContent || contentElement.innerText || '';

      // 提取标题
      const title = document.querySelector('title')?.textContent ||
                   document.querySelector('h1')?.textContent || '';

      // 提取作者
      const author = document.querySelector('meta[name="author"]')?.content ||
                    document.querySelector('.author')?.textContent ||
                    document.querySelector('[rel="author"]')?.textContent || '';

      // 提取发布日期
      const publishDate = document.querySelector('meta[property="article:published_time"]')?.content ||
                          document.querySelector('time')?.getAttribute('datetime') ||
                          document.querySelector('.date')?.textContent || '';

      // 提取主图
      const topImage = document.querySelector('meta[property="og:image"]')?.content ||
                       document.querySelector('meta[name="twitter:image"]')?.content ||
                       document.querySelector('article img')?.src || '';

      // 提取关键词
      const keywords = document.querySelector('meta[name="keywords"]')?.content?.split(',') || [];

      return {
        content: content.trim(),
        title: title.trim(),
        authors: author ? [author.trim()] : [],
        publish_date: publishDate,
        top_image: topImage,
        images: [topImage].filter(Boolean),
        videos: [],
        keywords: keywords.map(k => k.trim()).filter(Boolean),
        summary: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
        quality: this.calculateExtractionQuality({ text: content })
      };
    } catch (error) {
      throw new Error(`HTML内容提取失败: ${error.message}`);
    }
  }

  /**
   * 计算内容提取质量评分
   * @param {Object} article - 提取的文章对象
   * @returns {number} 质量评分 (0-1)
   */
  calculateExtractionQuality(article) {
    let score = 0;
    let factors = 0;

    // 内容长度评分
    if (article.text && article.text.length > 100) {
      score += Math.min(article.text.length / 1000, 1) * 0.3;
    }
    factors++;

    // 标题评分
    if (article.title && article.title.length > 10) {
      score += 0.2;
    }
    factors++;

    // 作者评分
    if (article.authors && article.authors.length > 0) {
      score += 0.1;
    }
    factors++;

    // 发布日期评分
    if (article.publish_date) {
      score += 0.1;
    }
    factors++;

    // 图片评分
    if (article.top_image) {
      score += 0.1;
    }
    factors++;

    // 关键词评分
    if (article.keywords && article.keywords.length > 0) {
      score += Math.min(article.keywords.length / 10, 1) * 0.2;
    }
    factors++;

    return factors > 0 ? score / factors : 0.5;
  }

  /**
   * 检查文章是否已存在
   * @param {string} url - 文章URL
   * @returns {Promise<boolean>} 是否存在
   */
  async checkArticleExists(url) {
    try {
      const result = await dbClient.query({
        table: 'news_articles',
        select: 'id',
        filters: [{ column: 'url', operator: 'eq', value: url }]
      });

      return result.length > 0;

    } catch (error) {
      logger.error('检查文章存在性失败', { url, error: error.message });
      return false;
    }
  }

  /**
   * 保存文章
   * @param {Object} source - RSS源对象
   * @param {Array} articles - 文章数组
   * @returns {Promise<Object>} 保存结果
   */
  async saveArticles(source, articles) {
    try {
      let savedCount = 0;
      let skippedCount = 0;
      const errors = [];

      // 批量保存文章
      for (const article of articles) {
        try {
          await dbClient.insert({
            table: 'news_articles',
            data: article
          });

          savedCount++;

        } catch (error) {
          if (error.code === '23505') { // 唯一约束冲突
            skippedCount++;
          } else {
            logger.error('保存文章失败', {
              title: article.title,
              error: error.message
            });
            errors.push({
              title: article.title,
              error: error.message
            });
          }
        }
      }

      logger.info('文章保存完成', {
        sourceId: source.id,
        savedCount,
        skippedCount,
        errorCount: errors.length
      });

      return {
        saved_count: savedCount,
        skipped_count: skippedCount,
        error_count: errors.length,
        errors
      };

    } catch (error) {
      logger.error('批量保存文章失败', {
        sourceId: source.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 更新RSS源状态
   * @param {string} sourceId - RSS源ID
   * @param {Object} statusData - 状态数据
   * @returns {Promise<Object>} 更新后的RSS源
   */
  async updateSourceStatus(sourceId, statusData) {
    try {
      const source = await RSSSourceQueries.update(sourceId, statusData);
      return source;

    } catch (error) {
      logger.error('更新RSS源状态失败', { sourceId, error: error.message });
      throw error;
    }
  }

  /**
   * 批量抓取RSS源
   * @param {Array} sourceIds - RSS源ID数组
   * @param {Object} options - 抓取选项
   * @returns {Promise<Object>} 批量抓取结果
   */
  async fetchMultipleSources(sourceIds, options = {}) {
    try {
      logger.info('开始批量抓取RSS源', { sourceCount: sourceIds.length });

      const results = [];
      const batchSize = options.batchSize || this.maxConcurrentFetches;

      // 分批处理
      for (let i = 0; i < sourceIds.length; i += batchSize) {
        const batch = sourceIds.slice(i, i + batchSize);

        // 并行抓取
        const batchPromises = batch.map(sourceId =>
          this.fetchSource(sourceId, options).catch(error => ({
            success: false,
            sourceId,
            error: error.message
          }))
        );

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // 批次间延迟
        if (i + batchSize < sourceIds.length) {
          await this.delay(options.batchDelay || 1000);
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;
      const totalArticles = results.reduce((sum, r) => sum + (r.articlesSaved || 0), 0);

      logger.info('批量抓取完成', {
        successCount,
        failureCount,
        totalArticles,
        executionTime: Date.now() - options.startTime || Date.now()
      });

      return {
        success: true,
        results,
        summary: {
          totalSources: sourceIds.length,
          successCount,
          failureCount,
          totalArticles
        }
      };

    } catch (error) {
      logger.error('批量抓取RSS源失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 抓取所有活跃RSS源
   * @param {Object} options - 抓取选项
   * @returns {Promise<Object>} 抓取结果
   */
  async fetchAllActiveSources(options = {}) {
    try {
      const activeSources = await this.getActiveSources();
      const sourceIds = activeSources.map(source => source.id);

      return await this.fetchMultipleSources(sourceIds, {
        ...options,
        startTime: Date.now()
      });

    } catch (error) {
      logger.error('抓取所有活跃RSS源失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 获取RSS源统计信息
   * @param {string} sourceId - RSS源ID
   * @returns {Promise<Object>} 统计信息
   */
  async getSourceStats(sourceId) {
    try {
      const source = await RSSSourceQueries.findById(sourceId);
      if (!source) {
        throw new Error('RSS源不存在');
      }

      // 获取最近文章统计
      const recentArticles = await dbClient.query({
        table: 'news_articles',
        select: 'count',
        filters: [
          { column: 'source_id', operator: 'eq', value: sourceId },
          { column: 'publish_date', operator: 'gte', value: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() }
        ]
      });

      // 获取总文章数
      const totalArticles = await dbClient.query({
        table: 'news_articles',
        select: 'count',
        filters: [{ column: 'source_id', operator: 'eq', value: sourceId }]
      });

      return {
        source: {
          id: source.id,
          name: source.name,
          url: source.url,
          category: source.category,
          is_active: source.is_active
        },
        stats: {
          totalArticles: totalArticles.length || 0,
          recentArticles: recentArticles.length || 0,
          lastFetchedAt: source.last_checked,
          lastFetchStatus: source.status,
          fetchErrorCount: source.error_count,
          totalArticlesFetched: source.max_articles
        }
      };

    } catch (error) {
      logger.error('获取RSS源统计失败', { sourceId, error: error.message });
      throw error;
    }
  }

  /**
   * 测试RSS源连接
   * @param {string} url - RSS源URL
   * @returns {Promise<Object>} 测试结果
   */
  async testConnection(url) {
    try {
      const startTime = Date.now();

      const validationResult = await this.validateSource(url);
      const responseTime = Date.now() - startTime;

      return {
        success: validationResult.valid,
        responseTime,
        feedInfo: validationResult.feedInfo,
        error: validationResult.error
      };

    } catch (error) {
      logger.error('测试RSS源连接失败', { url, error: error.message });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 监控RSS源健康状态
   * @param {string} sourceId - RSS源ID
   * @returns {Promise<Object>} 健康状态
   */
  async monitorSourceHealth(sourceId) {
    try {
      const source = await RSSSourceQueries.findById(sourceId);
      if (!source) {
        throw new Error('RSS源不存在');
      }

      // 计算健康评分
      const healthScore = this.calculateHealthScore(source);

      // 获取最近性能数据
      const recentPerformance = await this.getRecentPerformance(sourceId);

      return {
        sourceId,
        sourceName: source.name,
        healthScore,
        status: source.status,
        lastChecked: source.last_checked,
        errorCount: source.error_count,
        recentPerformance,
        recommendations: this.generateHealthRecommendations(healthScore, source)
      };

    } catch (error) {
      logger.error('监控RSS源健康状态失败', { sourceId, error: error.message });
      throw error;
    }
  }

  /**
   * 计算RSS源健康评分
   * @param {Object} source - RSS源对象
   * @returns {number} 健康评分 (0-100)
   */
  calculateHealthScore(source) {
    let score = 100;

    // 错误计数影响
    score -= Math.min(source.error_count * 10, 50);

    // 最后检查时间影响
    if (source.last_checked) {
      const hoursSinceLastCheck = (Date.now() - new Date(source.last_checked).getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastCheck > 24) {
        score -= Math.min((hoursSinceLastCheck - 24) * 2, 30);
      }
    } else {
      score -= 20; // 从未检查过
    }

    // 状态影响
    if (source.status === 'error') {
      score -= 30;
    } else if (source.status === 'warning') {
      score -= 15;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * 获取最近性能数据
   * @param {string} sourceId - RSS源ID
   * @returns {Promise<Object>} 性能数据
   */
  async getRecentPerformance(sourceId) {
    try {
      // 获取最近7天的文章数量
      const recentArticles = await dbClient.query({
        table: 'news_articles',
        select: 'count, publish_date',
        filters: [
          { column: 'source_id', operator: 'eq', value: sourceId },
          { column: 'publish_date', operator: 'gte', value: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() }
        ],
        orderBy: 'publish_date DESC'
      });

      // 计算平均响应时间（如果有缓存数据）
      const avgResponseTime = this.getAverageResponseTime(sourceId);

      return {
        articlesLast7Days: recentArticles.length,
        avgResponseTime,
        consistency: this.calculateConsistency(recentArticles)
      };

    } catch (error) {
      logger.error('获取性能数据失败', { sourceId, error: error.message });
      return {
        articlesLast7Days: 0,
        avgResponseTime: 0,
        consistency: 0
      };
    }
  }

  /**
   * 生成健康建议
   * @param {number} healthScore - 健康评分
   * @param {Object} source - RSS源对象
   * @returns {Array<string>} 建议列表
   */
  generateHealthRecommendations(healthScore, source) {
    const recommendations = [];

    if (healthScore < 50) {
      recommendations.push('建议检查RSS源URL是否有效');
      recommendations.push('考虑增加抓取间隔');
    }

    if (source.error_count > 5) {
      recommendations.push('错误次数过多，建议暂停该RSS源');
    }

    if (source.status === 'error') {
      recommendations.push('RSS源处于错误状态，需要手动检查');
    }

    if (healthScore > 80) {
      recommendations.push('RSS源运行良好，建议保持当前配置');
    }

    return recommendations;
  }

  // 辅助方法
  extractContent(item) {
    return item.content || item['content:encoded'] || item.contentSnippet || item.summary || item.description || '';
  }

  cleanTitle(title) {
    if (!title) return '无标题';
    return title.trim().replace(/\s+/g, ' ');
  }

  cleanHTML(html) {
    if (!html) return '';

    // 移除HTML标签
    let text = html.replace(/<[^>]*>/g, ' ');

    // 清理多余的空白字符
    text = text.replace(/\s+/g, ' ').trim();

    return text;
  }

  extractAuthor(item, source) {
    return item.author || item['dc:creator'] || source.name;
  }

  parseDate(dateString) {
    if (!dateString) return new Date().toISOString();

    try {
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  countWords(text) {
    if (!text) return 0;
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  extractImage(item, extractedData = null) {
    // 优先使用高级内容提取的图片
    if (extractedData?.top_image) {
      return extractedData.top_image;
    }

    // 尝试从不同字段提取图片URL
    const imageFields = [
      'media:content',
      'media:thumbnail',
      'enclosure'
    ];

    for (const field of imageFields) {
      if (item[field] && item[field].$ && item[field].$.url) {
        return item[field].$.url;
      }
    }

    // 尝试从内容中提取图片
    const content = this.extractContent(item);
    const imgMatch = content.match(/<img[^>]+src="([^"]+)"/);
    if (imgMatch) {
      return imgMatch[1];
    }

    return null;
  }

  extractTags(item) {
    const tags = [];

    // 从分类中提取标签
    if (item.category) {
      if (Array.isArray(item.category)) {
        tags.push(...item.category);
      } else {
        tags.push(item.category);
      }
    }

    return tags;
  }

  generateSummary(content) {
    if (!content) return '';

    const sentences = content.split(/[.!?。！？]/).filter(s => s.trim().length > 0);
    if (sentences.length === 0) return '';

    return sentences.slice(0, 2).join('. ') + (sentences.length > 2 ? '...' : '');
  }

  getAverageResponseTime(sourceId) {
    // 这里可以从缓存或性能数据中获取平均响应时间
    // 简化实现，返回默认值
    return 1500; // 1.5秒
  }

  calculateConsistency(articles) {
    if (articles.length === 0) return 0;

    // 简化的一致性计算，基于文章分布
    const days = 7;
    const expectedPerDay = articles.length / days;
    const variance = Math.abs(expectedPerDay - 1); // 简化计算

    return Math.max(0, 1 - variance);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 创建并导出实例
const rssManagerService = new RSSManagerService();

export default rssManagerService;
export { RSSManagerService };