/**
 * News Aggregator Service
 * 负责多源新闻聚合、去重、分组和智能分析
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { NewsArticleQueries } from '../database/queries.js';
import dbClient from '../database/client.js';
import logger from '../utils/logger.js';
import { RSSManagerService } from './RSSManagerService.js';
import AIAnalysisService from './AIAnalysisService.js';

export class NewsAggregatorService extends EventEmitter {
  constructor(config = {}) {
    super();
    this.isRunning = false;
    this.config = {
      similarityThreshold: config.similarityThreshold || 0.7,
      timeWindow: config.timeWindow || 24 * 60 * 60 * 1000, // 24小时
      minGroupSize: config.minGroupSize || 2,
      maxArticlesPerGroup: config.maxArticlesPerGroup || 10,
      enabledSources: config.enabledSources || ['rss', 'newsapi'],
      autoGroup: config.autoGroup !== false,
      scoring: {
        titleWeight: config.titleWeight || 0.4,
        contentWeight: config.contentWeight || 0.3,
        timeWeight: config.timeWeight || 0.2,
        sourceWeight: config.sourceWeight || 0.1
      },
      // 聚合配置
      maxConcurrentAggregations: 3,
      batchSize: 50,
      processingInterval: 60000, // 1分钟
      cacheTTL: 300000, // 5分钟

      // 质量过滤配置
      minContentLength: 200,
      maxContentLength: 10000,
      minWordCount: 50,
      spamKeywords: ['广告', '推广', '赞助', '点击这里', '立即购买'],

      // AI配置
      aiAnalysisEnabled: true,
      summaryEnabled: true,
      sentimentAnalysisEnabled: true,
      entityExtractionEnabled: true,

      // 分类配置
      autoCategorize: true,
      categoryConfidenceThreshold: 0.7
    };

    // 初始化服务
    this.rssManager = new RSSManagerService();
    this.aiService = new AIAnalysisService();

    // 处理队列
    this.processingQueue = [];
    this.isProcessing = false;
    this.aggregationCache = new Map();

    // 性能统计
    this.stats = {
      articlesProcessed: 0,
      duplicatesFiltered: 0,
      lowQualityFiltered: 0,
      categoriesAssigned: 0,
      summariesGenerated: 0,
      sentimentAnalysisCompleted: 0,
      entitiesExtracted: 0,
      errors: 0,
      lastAggregationTime: null,
      averageProcessingTime: 0
    };
  }

  async initialize() {
    try {
      logger.info('初始化News Aggregator Service...');

      // 加载配置
      await this.loadConfig();

      // 初始化依赖服务
      await this.rssManager.initialize();
      await this.aiService.initialize();

      // 启动处理队列
      this.startProcessingQueue();

      // 设置定时聚合
      this.startScheduledAggregation();

      this.isRunning = true;
      logger.info('News Aggregator Service 初始化完成');
      return true;
    } catch (error) {
      logger.error('News Aggregator Service 初始化失败:', error);
      throw error;
    }
  }

  async loadConfig() {
    try {
      const { error } = await dbClient
        .from('system_configs')
        .select('config_value')
        .eq('config_key', 'aggregator')
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        const dbConfig = JSON.parse(data.config_value);
        this.config = { ...this.config, ...dbConfig };
        logger.info('已加载聚合配置');
      }
    } catch (error) {
      logger.warn('加载聚合配置失败，使用默认配置:', error);
    }
  }

  async aggregateArticles(options = {}) {
    try {
      logger.info('开始聚合新闻文章...');

      const timeWindow = options.timeWindow || this.config.timeWindow;
      const enabledSources = options.enabledSources || this.config.enabledSources;

      // 获取时间窗口内的文章
      const articles = await this.getRecentArticles(timeWindow, enabledSources);
      logger.info(`获取到 ${articles.length} 篇文章进行聚合`);

      if (articles.length === 0) {
        logger.info('没有找到需要聚合的文章');
        return { groups: [], processed: 0 };
      }

      // 对文章进行分组
      const groups = await this.groupArticles(articles);
      logger.info(`生成了 ${groups.length} 个新闻组`);

      // 保存分组结果
      const savedGroups = await this.saveGroups(groups);

      return {
        groups: savedGroups,
        processed: articles.length,
        groupCount: groups.length
      };

    } catch (error) {
      logger.error('新闻聚合失败:', error);
      throw error;
    }
  }

  async getRecentArticles(timeWindow, enabledSources) {
    try {
      const cutoffTime = new Date(Date.now() - timeWindow).toISOString();

      let query = dbClient
        .from('news_articles')
        .select('*')
        .gte('published_at', cutoffTime)
        .eq('is_active', true);

      if (enabledSources.length > 0) {
        query = query.in('source_type', enabledSources);
      }

      const { error } = await query.order('published_at', { ascending: false });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error('获取最近文章失败:', error);
      throw error;
    }
  }

  async groupArticles(articles) {
    const groups = [];
    const processed = new Set();

    for (let i = 0; i < articles.length; i++) {
      if (processed.has(articles[i].id)) continue;

      const article = articles[i];
      const group = {
        key: this.generateGroupKey(article),
        title: this.generateGroupTitle(article),
        summary: '',
        category: article.category,
        articles: [article],
        confidence: 1.0,
        metadata: {
          primarySource: article.source_type,
          timeRange: {
            start: article.published_at,
            end: article.published_at
          },
          sources: new Set([article.source_type])
        }
      };

      processed.add(article.id);

      // 查找相似文章
      for (let j = i + 1; j < articles.length; j++) {
        if (processed.has(articles[j].id)) continue;

        const similarity = await this.calculateSimilarity(article, articles[j]);

        if (similarity >= this.config.similarityThreshold) {
          group.articles.push(articles[j]);
          processed.add(articles[j].id);
          group.confidence = Math.min(group.confidence, similarity);

          // 更新时间范围
          if (articles[j].published_at < group.metadata.timeRange.start) {
            group.metadata.timeRange.start = articles[j].published_at;
          }
          if (articles[j].published_at > group.metadata.timeRange.end) {
            group.metadata.timeRange.end = articles[j].published_at;
          }

          group.metadata.sources.add(articles[j].source_type);
        }
      }

      // 只有包含足够文章的组才保留
      if (group.articles.length >= this.config.minGroupSize) {
        group.summary = this.generateGroupSummary(group.articles);
        groups.push(group);
      }
    }

    return groups;
  }

  generateGroupKey(article) {
    // 基于标题关键词和类别生成组键
    const keywords = this.extractKeywords(article.title);
    const category = article.category;
    const date = new Date(article.published_at).toISOString().split('T')[0];

    return `${category}:${date}:${keywords.slice(0, 3).join(':')}`;
  }

  generateGroupTitle(article) {
    // 生成组标题，去除来源标识
    let title = article.title;

    // 移除常见的来源前缀
    const sourcePrefixes = [
      /^\[.*?\]\s*/, // [来源] 标题
      /^.*?-\s*/,   // 来源 - 标题
      /^.*?:\s*/    // 来源: 标题
    ];

    sourcePrefixes.forEach(prefix => {
      title = title.replace(prefix, '');
    });

    return title.trim();
  }

  extractKeywords(text) {
    // 简单的关键词提取
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      '的', '了', '是', '在', '和', '与', '或', '但', '在', '对', '关于', '通过', '用'
    ]);

    const words = text
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fff]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));

    // 统计词频
    const wordCount = {};
    words.forEach(word => {
      wordCount[word] = (wordCount[word] || 0) + 1;
    });

    // 返回频率最高的关键词
    return Object.entries(wordCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([word]) => word);
  }

  async calculateSimilarity(article1, article2) {
    try {
      const titleSimilarity = this.calculateTextSimilarity(article1.title, article2.title);
      const contentSimilarity = this.calculateContentSimilarity(article1, article2);
      const timeSimilarity = this.calculateTimeSimilarity(article1.published_at, article2.published_at);
      const sourceSimilarity = this.calculateSourceSimilarity(article1.source_type, article2.source_type);

      const weights = this.config.scoring;

      return (
        titleSimilarity * weights.titleWeight +
        contentSimilarity * weights.contentWeight +
        timeSimilarity * weights.timeWeight +
        sourceSimilarity * weights.sourceWeight
      );
    } catch (error) {
      logger.error('计算相似度失败:', error);
      return 0;
    }
  }

  calculateTextSimilarity(text1, text2) {
    // 使用简单的Jaccard相似度
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  calculateContentSimilarity(article1, article2) {
    const content1 = (article1.content || article1.summary || '').toLowerCase();
    const content2 = (article2.content || article2.summary || '').toLowerCase();

    if (!content1 || !content2) return 0;

    return this.calculateTextSimilarity(content1, content2);
  }

  calculateTimeSimilarity(time1, time2) {
    const date1 = new Date(time1);
    const date2 = new Date(time2);
    const diffHours = Math.abs(date1 - date2) / (1000 * 60 * 60);

    // 24小时内相似度为1，超过48小时相似度为0
    if (diffHours <= 24) return 1;
    if (diffHours >= 48) return 0;

    return 1 - (diffHours - 24) / 24;
  }

  calculateSourceSimilarity(source1, source2) {
    // 不同来源有更高的相似度权重
    return source1 === source2 ? 0.8 : 1.0;
  }

  generateGroupSummary(articles) {
    if (articles.length === 0) return '';

    // 选择最长的内容作为基础
    const baseArticle = articles.reduce((a, b) =>
      (a.content || a.summary || '').length > (b.content || b.summary || '').length ? a : b
    );

    let summary = baseArticle.summary || baseArticle.content || '';

    // 如果摘要太短，尝试从其他文章补充
    if (summary.length < 100) {
      for (const article of articles) {
        if (article !== baseArticle && (article.summary || article.content)) {
          const additionalText = article.summary || article.content;
          if (additionalText.length > summary.length) {
            summary = additionalText;
          }
        }
      }
    }

    // 限制摘要长度
    if (summary.length > 300) {
      summary = `${summary.substring(0, 300)  }...`;
    }

    return summary;
  }

  async saveGroups(groups) {
    const savedGroups = [];

    for (const group of groups) {
      try {
        // 保存聚合组
        const groupData = {
          group_key: group.key,
          title: group.title,
          summary: group.summary,
          category: group.category,
          article_count: group.articles.length,
          confidence_score: group.confidence,
          metadata: {
            ...group.metadata,
            sources: Array.from(group.metadata.sources)
          }
        };

        // TODO: 实现数据库表后启用
        // const savedGroup = await NewsAggregationGroupQueries.create(groupData);
        const savedGroup = { id: uuidv4(), ...groupData };

        // 保存文章与组的关联
        for (const article of group.articles) {
          await this.addArticleToGroup(savedGroup.id, article.id, {
            is_primary: article === group.articles[0],
            relevance_score: this.calculateArticleRelevance(article, group)
          });
        }

        savedGroups.push(savedGroup);
        logger.debug(`保存新闻组: ${savedGroup.title} (${group.articles.length} 篇文章)`);

      } catch (error) {
        logger.error('保存新闻组失败:', error);
      }
    }

    return savedGroups;
  }

  async addArticleToGroup(groupId, articleId, options = {}) {
    try {
      const { error } = await dbClient
        .from('news_article_groups')
        .insert([{
          group_id: groupId,
          article_id: articleId,
          relevance_score: options.relevance_score || 1.0,
          is_primary: options.is_primary || false
        }])
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      logger.error('添加文章到组失败:', error);
      throw error;
    }
  }

  calculateArticleRelevance(article, group) {
    // 计算文章相对于组的相关性分数
    let score = 1.0;

    // 主要文章得分更高
    if (article === group.articles[0]) {
      score += 0.2;
    }

    // 内容长度得分
    const contentLength = (article.content || article.summary || '').length;
    if (contentLength > 500) {
      score += 0.1;
    }

    // 时间得分（最新发布的得分更高）
    const articleTime = new Date(article.published_at);
    const groupTime = new Date(group.metadata.timeRange.end);
    const timeDiff = (groupTime - articleTime) / (1000 * 60 * 60); // 小时差
    if (timeDiff <= 1) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  async getGroups(params = {}) {
    try {
      // TODO: 实现数据库表后启用
      // const groups = await NewsAggregationGroupQueries.list({
      //   pagination: params.pagination,
      //   filters: params.filters,
      //   sort: params.sort || { sortBy: 'created_at', sortOrder: 'desc' }
      // });
      const groups = [];

      return groups;
    } catch (error) {
      logger.error('获取新闻组失败:', error);
      throw error;
    }
  }

  async getGroup(groupId, options = {}) {
    try {
      // TODO: 实现数据库表后启用
      // const group = await NewsAggregationGroupQueries.findById(groupId);
      const group = null; // 临时占位符
      if (!group) {
        throw new Error(`新闻组不存在: ${groupId}`);
      }

      // 获取组内文章
      const { data: articles } = await dbClient
        .from('news_article_groups')
        .select(`
          article_id,
          relevance_score,
          is_primary,
          news_articles (*)
        `)
        .eq('group_id', groupId)
        .order('relevance_score', { ascending: false });

      // 如果需要，限制文章数量
      let limitedArticles = articles || [];
      if (options.maxArticles && limitedArticles.length > options.maxArticles) {
        limitedArticles = limitedArticles.slice(0, options.maxArticles);
      }

      return {
        ...group,
        articles: limitedArticles.map(item => ({
          ...item.news_articles,
          relevance_score: item.relevance_score,
          is_primary: item.is_primary
        }))
      };
    } catch (error) {
      logger.error('获取新闻组详情失败:', error);
      throw error;
    }
  }

  async getGroupArticles(groupId, options = {}) {
    try {
      const { error } = await dbClient
        .from('news_article_groups')
        .select(`
          relevance_score,
          is_primary,
          news_articles (*)
        `)
        .eq('group_id', groupId)
        .order('relevance_score', { ascending: false });

      if (error) {
        throw error;
      }

      const articles = (data || []).map(item => ({
        ...item.news_articles,
        relevance_score: item.relevance_score,
        is_primary: item.is_primary
      }));

      return articles;
    } catch (error) {
      logger.error('获取组内文章失败:', error);
      throw error;
    }
  }

  async updateGroup(groupId, updateData) {
    try {
      // TODO: 实现数据库表后启用
      // const group = await NewsAggregationGroupQueries.update(groupId, updateData);
      const group = { id: groupId, ...updateData, updated_at: new Date().toISOString() };
      logger.info(`新闻组更新成功: ${group.title}`);
      return group;
    } catch (error) {
      logger.error('更新新闻组失败:', error);
      throw error;
    }
  }

  async deleteGroup(groupId) {
    try {
      // TODO: 实现数据库表后启用
      // await NewsAggregationGroupQueries.delete(groupId);
      logger.info(`新闻组删除成功: ${groupId}`);
      return true;
    } catch (error) {
      logger.error('删除新闻组失败:', error);
      throw error;
    }
  }

  async searchGroups(query, options = {}) {
    try {
      // 在组标题和摘要中搜索
      const { error } = await dbClient
        .from('news_aggregation_groups')
        .select('*')
        .or(`title.ilike.%${query}%,summary.ilike.%${query}%`)
        .order('created_at', { ascending: false })
        .limit(options.limit || 20);

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error('搜索新闻组失败:', error);
      throw error;
    }
  }

  async getStats() {
    try {
      const { data: groupStats } = await dbClient
        .from('news_aggregation_groups')
        .select('category, COUNT(*) as count')
        .group('category');

      const { data: totalGroups } = await dbClient
        .from('news_aggregation_groups')
        .select('id', { count: 'exact', head: true });

      const { data: totalArticles } = await dbClient
        .from('news_article_groups')
        .select('id', { count: 'exact', head: true });

      return {
        totalGroups: totalGroups?.length || 0,
        totalArticles: totalArticles?.length || 0,
        categoryDistribution: groupStats || [],
        config: this.config,
        isRunning: this.isRunning,
        processingStats: this.stats,
        activeAggregations: this.processingQueue.length,
        cacheSize: this.aggregationCache.size
      };
    } catch (error) {
      logger.error('获取聚合统计失败:', error);
      throw error;
    }
  }

  /**
   * 智能新闻聚合
   * @param {Object} options 聚合选项
   * @returns {Promise<Object>} 聚合结果
   */
  async smartAggregateNews(options = {}) {
    const {
      sourceIds = [],
      categories = [],
      maxArticles = 100,
      enableAI = true,
      skipCache = false
    } = options;

    const aggregationId = uuidv4();
    const startTime = Date.now();

    try {
      logger.info(`开始智能聚合新闻 - ID: ${aggregationId}`);

      // 检查缓存
      if (!skipCache) {
        const cachedResult = this.aggregationCache.get(aggregationId);
        if (cachedResult && Date.now() - cachedResult.timestamp < this.config.cacheTTL) {
          logger.info(`使用缓存结果 - ID: ${aggregationId}`);
          return cachedResult.data;
        }
      }

      // 获取活跃RSS源
      let rssSources;
      if (sourceIds.length > 0) {
        rssSources = await this.rssManager.getSources({
          filters: [
            { column: 'id', operator: 'in', value: sourceIds },
            { column: 'is_active', operator: 'eq', value: true }
          ]
        });
      } else {
        rssSources = await this.rssManager.getActiveSources();
      }

      // 按分类过滤
      if (categories.length > 0) {
        rssSources = rssSources.filter(source =>
          categories.includes(source.category)
        );
      }

      logger.info(`找到 ${rssSources.length} 个RSS源进行聚合`);

      // 批量抓取RSS源
      const fetchResults = await this.rssManager.fetchMultipleSources(
        rssSources.map(s => s.id),
        {
          batchSize: this.config.batchSize,
          maxConcurrentFetches: this.config.maxConcurrentAggregations
        }
      );

      // 处理抓取结果
      const articles = [];
      for (const result of fetchResults.results) {
        if (result.success && result.articles) {
          articles.push(...result.articles);
        }
      }

      logger.info(`抓取到 ${articles.length} 篇文章`);

      // 限制文章数量
      const limitedArticles = articles.slice(0, maxArticles);

      // 处理文章
      const processedArticles = [];
      for (const article of limitedArticles) {
        try {
          const processed = await this.processArticleSmart(article, { enableAI });
          if (processed) {
            processedArticles.push(processed);
          }
        } catch (error) {
          logger.error(`处理文章失败: ${article.title}`, error);
          this.stats.errors++;
        }
      }

      // 按时间排序
      processedArticles.sort((a, b) =>
        new Date(b.published_at) - new Date(a.published_at)
      );

      // 对文章进行分组
      const groups = await this.groupArticles(processedArticles);
      logger.info(`生成了 ${groups.length} 个新闻组`);

      const result = {
        aggregationId,
        totalArticles: articles.length,
        processedArticles: processedArticles.length,
        groups: groups.length,
        articles: processedArticles,
        stats: {
          duplicatesFiltered: this.stats.duplicatesFiltered,
          lowQualityFiltered: this.stats.lowQualityFiltered,
          categoriesAssigned: this.stats.categoriesAssigned,
          summariesGenerated: this.stats.summariesGenerated,
          processingTime: Date.now() - startTime
        }
      };

      // 缓存结果
      this.aggregationCache.set(aggregationId, {
        data: result,
        timestamp: Date.now()
      });

      // 更新统计
      this.stats.articlesProcessed += processedArticles.length;
      this.stats.lastAggregationTime = new Date();
      this.stats.averageProcessingTime =
        (this.stats.averageProcessingTime + (Date.now() - startTime)) / 2;

      logger.info(`智能新闻聚合完成 - ID: ${aggregationId}, 处理了 ${processedArticles.length} 篇文章`);
      this.emit('smartAggregationCompleted', result);

      return result;

    } catch (error) {
      logger.error(`智能新闻聚合失败 - ID: ${aggregationId}`, error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * 智能处理单篇文章
   * @param {Object} article 文章数据
   * @param {Object} options 处理选项
   * @returns {Promise<Object>} 处理后的文章
   */
  async processArticleSmart(article, options = {}) {
    const { enableAI = true } = options;

    try {
      // 1. 检查重复
      const isDuplicate = await this.checkDuplicate(article);
      if (isDuplicate) {
        this.stats.duplicatesFiltered++;
        return null;
      }

      // 2. 质量过滤
      const qualityScore = await this.filterQuality(article);
      if (qualityScore < 0.5) {
        this.stats.lowQualityFiltered++;
        return null;
      }

      // 3. 基础处理
      const processedArticle = {
        ...article,
        id: uuidv4(),
        quality_score: qualityScore,
        processed_at: new Date().toISOString(),
        language: article.language || 'zh',
        source_type: 'rss'
      };

      // 4. 自动分类
      if (this.config.autoCategorize) {
        const category = await this.categorizeArticle(processedArticle);
        if (category) {
          processedArticle.category = category;
          this.stats.categoriesAssigned++;
        }
      }

      // 5. AI分析
      if (enableAI && this.config.aiAnalysisEnabled) {
        try {
          // 生成摘要
          if (this.config.summaryEnabled) {
            const summary = await this.generateSummary(processedArticle);
            if (summary) {
              processedArticle.summary = summary;
              this.stats.summariesGenerated++;
            }
          }

          // 情感分析
          if (this.config.sentimentAnalysisEnabled) {
            const sentiment = await this.aiService.analyzeSentiment(processedArticle.content);
            if (sentiment) {
              processedArticle.sentiment = sentiment;
              this.stats.sentimentAnalysisCompleted++;
            }
          }

          // 实体提取
          if (this.config.entityExtractionEnabled) {
            const entities = await this.aiService.extractEntities(processedArticle.content);
            if (entities && entities.length > 0) {
              processedArticle.entities = entities;
              this.stats.entitiesExtracted++;
            }
          }
        } catch (error) {
          logger.error('AI分析失败:', error);
          // AI分析失败不影响文章处理
        }
      }

      // 6. 保存到数据库
      await this.saveArticle(processedArticle);

      return processedArticle;

    } catch (error) {
      logger.error('处理文章失败:', error);
      throw error;
    }
  }

  /**
   * 质量过滤
   * @param {Object} article 文章数据
   * @returns {Promise<number>} 质量分数
   */
  async filterQuality(article) {
    let score = 1.0;

    // 检查内容长度
    const contentLength = article.content?.length || 0;
    if (contentLength < this.config.minContentLength) {
      score *= 0.3;
    }
    if (contentLength > this.config.maxContentLength) {
      score *= 0.8;
    }

    // 检查词数
    const wordCount = article.content?.split(/\s+/).length || 0;
    if (wordCount < this.config.minWordCount) {
      score *= 0.5;
    }

    // 检查垃圾关键词
    const content = (`${article.title  } ${  article.content}`).toLowerCase();
    for (const keyword of this.config.spamKeywords) {
      if (content.includes(keyword.toLowerCase())) {
        score *= 0.6;
      }
    }

    // 检查标题质量
    if (article.title && article.title.length < 10) {
      score *= 0.7;
    }

    // 检查URL质量
    if (article.url && !article.url.startsWith('http')) {
      score *= 0.5;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * 生成文章摘要
   * @param {Object} article 文章数据
   * @returns {Promise<string>} 摘要
   */
  async generateSummary(article) {
    try {
      const content = article.content || '';
      if (content.length < 100) {
        return content;
      }

      // 简单的抽取式摘要
      const sentences = content.split(/[.!?。！？]/).filter(s => s.trim().length > 10);
      if (sentences.length <= 3) {
        return content;
      }

      // 选择前3个最长的句子
      const topSentences = `${sentences
        .sort((a, b) => b.length - a.length)
        .slice(0, 3)
        .join('。')  }。`;

      return topSentences;

    } catch (error) {
      logger.error('生成摘要失败:', error);
      return null;
    }
  }

  /**
   * 文章分类
   * @param {Object} article 文章数据
   * @returns {Promise<string>} 分类
   */
  async categorizeArticle(article) {
    try {
      const content = (`${article.title  } ${  article.content || ''}`).toLowerCase();

      // 简单的关键词分类
      const categoryKeywords = {
        'tech': ['科技', '技术', '人工智能', 'AI', '互联网', '软件', '硬件', '手机', '电脑'],
        'finance': ['金融', '股票', '投资', '经济', '财经', '基金', '银行', '保险'],
        'politics': ['政治', '政府', '政策', '法律', '国际', '外交', '选举', '国会'],
        'sports': ['体育', '足球', '篮球', '运动', '比赛', '奥运', '世界杯', 'NBA'],
        'entertainment': ['娱乐', '电影', '音乐', '明星', '综艺', '电视剧', '游戏'],
        'health': ['健康', '医疗', '疾病', '药物', '医院', '医生', '疫苗', '保健']
      };

      let bestCategory = null;
      let bestScore = 0;

      for (const [category, keywords] of Object.entries(categoryKeywords)) {
        let score = 0;
        for (const keyword of keywords) {
          if (content.includes(keyword)) {
            score++;
          }
        }

        if (score > bestScore && score >= 2) {
          bestScore = score;
          bestCategory = category;
        }
      }

      return bestCategory;

    } catch (error) {
      logger.error('文章分类失败:', error);
      return null;
    }
  }

  /**
   * 保存文章到数据库
   * @param {Object} article 文章数据
   */
  async saveArticle(article) {
    try {
      const { data, error } = await dbClient
        .from('news_articles')
        .insert([{
          id: article.id,
          title: article.title,
          content: article.content,
          summary: article.summary,
          url: article.url,
          author: article.author,
          published_at: article.published_at,
          source_id: article.source_id,
          category: article.category,
          language: article.language,
          sentiment: article.sentiment,
          quality_score: article.quality_score,
          processed_at: article.processed_at,
          source_type: article.source_type
        }])
        .select();

      if (error) {
        logger.error('保存文章失败:', error);
        throw error;
      }

      // 保存实体关联
      if (article.entities && article.entities.length > 0) {
        await this.saveArticleEntities(article.id, article.entities);
      }

      return data;

    } catch (error) {
      logger.error('保存文章失败:', error);
      throw error;
    }
  }

  /**
   * 保存文章实体关联
   * @param {string} articleId 文章ID
   * @param {Array} entities 实体列表
   */
  async saveArticleEntities(articleId, entities) {
    try {
      const entityRelations = entities.map(entity => ({
        article_id: articleId,
        entity_name: entity.name,
        entity_type: entity.type,
        confidence: entity.confidence || 0.8,
        created_at: new Date().toISOString()
      }));

      const { error } = await dbClient
        .from('article_entities')
        .insert(entityRelations);

      if (error) {
        logger.error('保存文章实体失败:', error);
      }

    } catch (error) {
      logger.error('保存文章实体失败:', error);
    }
  }

  /**
   * 启动处理队列
   */
  startProcessingQueue() {
    setInterval(() => {
      if (!this.isProcessing && this.processingQueue.length > 0) {
        this.processQueue();
      }
    }, this.config.processingInterval);
  }

  /**
   * 处理队列
   */
  async processQueue() {
    if (this.isProcessing) return;

    this.isProcessing = true;
    try {
      while (this.processingQueue.length > 0) {
        const task = this.processingQueue.shift();
        await this.processArticleSmart(task.article, task.options);
      }
    } catch (error) {
      logger.error('处理队列失败:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 等待处理完成
   */
  async waitForProcessingComplete() {
    while (this.isProcessing || this.processingQueue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * 启动定时聚合
   */
  startScheduledAggregation() {
    this.aggregationInterval = setInterval(async () => {
      try {
        await this.smartAggregateNews();
      } catch (error) {
        logger.error('定时聚合失败:', error);
      }
    }, this.config.processingInterval);
  }

  /**
   * 停止定时聚合
   */
  stopScheduledAggregation() {
    if (this.aggregationInterval) {
      clearInterval(this.aggregationInterval);
      this.aggregationInterval = null;
    }
  }

  /**
   * 清理缓存
   */
  clearCache() {
    this.aggregationCache.clear();
    logger.info('新闻聚合缓存已清理');
  }

  async processNewArticles(articles) {
    try {
      logger.info(`处理 ${articles.length} 篇新文章`);

      // 这里可以添加文章处理逻辑，比如去重、分类等
      for (const article of articles) {
        // 发送文章处理完成事件
        this.emit('articleProcessed', article);
      }

      logger.info('新文章处理完成');
    } catch (error) {
      logger.error('处理新文章失败:', error);
      this.emit('error', error);
    }
  }

  async updateArticleAnalysis(analysisResult) {
    try {
      logger.info(`更新文章分析结果: ${analysisResult.articleId}`);

      // 这里可以添加更新文章分析结果的逻辑

      logger.info('文章分析结果更新完成');
    } catch (error) {
      logger.error('更新文章分析结果失败:', error);
      this.emit('error', error);
    }
  }

  async manualGroup(articleIds, options = {}) {
    try {
      // 获取指定文章
      const { data: articles, error } = await dbClient
        .from('news_articles')
        .select('*')
        .in('id', articleIds);

      if (error) {
        throw error;
      }

      if (!articles || articles.length < this.config.minGroupSize) {
        throw new Error(`至少需要 ${this.config.minGroupSize} 篇文章才能创建组`);
      }

      // 创建组
      const group = {
        key: options.groupKey || `manual:${Date.now()}`,
        title: options.title || this.generateGroupTitle(articles[0]),
        summary: options.summary || this.generateGroupSummary(articles),
        category: options.category || articles[0].category,
        articles,
        confidence: options.confidence || 1.0,
        metadata: {
          isManual: true,
          createdBy: options.createdBy,
          timeRange: {
            start: Math.min(...articles.map(a => new Date(a.published_at))),
            end: Math.max(...articles.map(a => new Date(a.published_at)))
          },
          sources: [...new Set(articles.map(a => a.source_type))]
        }
      };

      const savedGroups = await this.saveGroups([group]);
      return savedGroups[0];
    } catch (error) {
      logger.error('手动创建新闻组失败:', error);
      throw error;
    }
  }
}

export default NewsAggregatorService;