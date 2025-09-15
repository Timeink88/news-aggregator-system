/**
 * Translation Service
 * 提供新闻文章翻译功能，支持多种翻译服务
 */

import { v4 as uuidv4 } from 'uuid';
import { TranslationTaskQueries } from '../database/queries.js';
import dbClient from '../database/client.js';
import logger from '../utils/logger.js';

export class TranslationService {
  constructor(config = {}) {
    this.isRunning = false;
    this.activeTasks = new Map();
    this.taskQueue = [];
    this.maxConcurrentTasks = config.maxConcurrentTasks || 3;

    this.config = {
      // 翻译服务配置
      google: {
        enabled: config.google?.enabled !== false,
        apiKey: config.google?.apiKey || process.env.GOOGLE_TRANSLATE_API_KEY,
        projectId: config.google?.projectId || process.env.GOOGLE_PROJECT_ID
      },
      openai: {
        enabled: config.openai?.enabled !== false,
        apiKey: config.openai?.apiKey || process.env.OPENAI_API_KEY,
        model: config.openai?.model || 'gpt-3.5-turbo',
        maxTokens: config.openai?.maxTokens || 2000
      },
      anthropic: {
        enabled: config.anthropic?.enabled !== false,
        apiKey: config.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY,
        model: config.anthropic?.model || 'claude-3-sonnet-20240229',
        maxTokens: config.anthropic?.maxTokens || 2000
      },

      // 默认设置
      defaultService: config.defaultService || 'google',
      timeout: config.timeout || 30000,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      maxTextLength: config.maxTextLength || 5000,
      batchSize: config.batchSize || 10,
      autoTranslate: config.autoTranslate !== false,
      cacheEnabled: config.cacheEnabled !== false,
      cacheTTL: config.cacheTTL || 3600 // 1小时
    };
  }

  async initialize() {
    try {
      logger.info('初始化Translation Service...');

      // 加载数据库配置
      await this.loadConfig();

      // 验证翻译服务
      await this.validateServices();

      this.isRunning = true;
      logger.info('Translation Service 初始化完成');
      return true;

    } catch (error) {
      logger.error('Translation Service 初始化失败:', error);
      throw error;
    }
  }

  async loadConfig() {
    try {
      const { error } = await dbClient
        .from('system_configs')
        .select('config_value')
        .eq('config_key', 'translation')
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        const dbConfig = JSON.parse(data.config_value);
        this.config = { ...this.config, ...dbConfig };
        logger.info('已加载翻译配置');
      }
    } catch (error) {
      logger.warn('加载翻译配置失败，使用默认配置:', error);
    }
  }

  async validateServices() {
    const availableServices = [];

    // 验证Google翻译
    if (this.config.google.enabled && this.config.google.apiKey) {
      try {
        const isValid = await this.testGoogleTranslate();
        if (isValid) {
          availableServices.push('google');
        }
      } catch (error) {
        logger.warn('Google翻译服务验证失败:', error.message);
        this.config.google.enabled = false;
      }
    }

    // 验证OpenAI翻译
    if (this.config.openai.enabled && this.config.openai.apiKey) {
      try {
        const isValid = await this.testOpenAI();
        if (isValid) {
          availableServices.push('openai');
        }
      } catch (error) {
        logger.warn('OpenAI翻译服务验证失败:', error.message);
        this.config.openai.enabled = false;
      }
    }

    // 验证Anthropic翻译
    if (this.config.anthropic.enabled && this.config.anthropic.apiKey) {
      try {
        const isValid = await this.testAnthropic();
        if (isValid) {
          availableServices.push('anthropic');
        }
      } catch (error) {
        logger.warn('Anthropic翻译服务验证失败:', error.message);
        this.config.anthropic.enabled = false;
      }
    }

    if (availableServices.length === 0) {
      throw new Error('没有可用的翻译服务');
    }

    // 如果默认服务不可用，选择第一个可用的
    if (!availableServices.includes(this.config.defaultService)) {
      this.config.defaultService = availableServices[0];
      logger.warn(`默认翻译服务不可用，切换到: ${this.config.defaultService}`);
    }

    logger.info(`可用翻译服务: ${availableServices.join(', ')}`);
  }

  async testGoogleTranslate() {
    try {
      // 这里应该调用Google翻译API进行测试
      // 简化实现，假设API密钥格式正确即可
      return !!this.config.google.apiKey;
    } catch (error) {
      return false;
    }
  }

  async testOpenAI() {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${this.config.openai.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async testAnthropic() {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': this.config.anthropic.apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.config.anthropic.model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'test' }]
        })
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async translateText(text, targetLanguage, sourceLanguage = 'auto', options = {}) {
    try {
      // 检查缓存
      if (this.config.cacheEnabled) {
        const cachedResult = await this.getFromCache(text, targetLanguage, sourceLanguage);
        if (cachedResult) {
          return cachedResult;
        }
      }

      // 选择翻译服务
      const service = options.service || this.config.defaultService;

      // 执行翻译
      let result;
      switch (service) {
      case 'google':
        result = await this.translateWithGoogle(text, targetLanguage, sourceLanguage);
        break;
      case 'openai':
        result = await this.translateWithOpenAI(text, targetLanguage, sourceLanguage);
        break;
      case 'anthropic':
        result = await this.translateWithAnthropic(text, targetLanguage, sourceLanguage);
        break;
      default:
        throw new Error(`不支持的翻译服务: ${service}`);
      }

      // 缓存结果
      if (this.config.cacheEnabled && result.success) {
        await this.saveToCache(text, targetLanguage, sourceLanguage, result);
      }

      return result;

    } catch (error) {
      logger.error('翻译失败:', error);
      return {
        success: false,
        error: error.message,
        originalText: text,
        targetLanguage,
        sourceLanguage
      };
    }
  }

  async translateWithGoogle(text, targetLanguage, sourceLanguage = 'auto') {
    try {
      const url = new URL('https://translation.googleapis.com/language/translate/v2');
      url.searchParams.append('key', this.config.google.apiKey);
      url.searchParams.append('q', text);
      url.searchParams.append('target', targetLanguage);
      if (sourceLanguage !== 'auto') {
        url.searchParams.append('source', sourceLanguage);
      }

      const response = await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(this.config.timeout)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Google翻译API错误');
      }

      const translation = data.data.translations[0];

      return {
        success: true,
        translatedText: translation.translatedText,
        detectedLanguage: translation.detectedSourceLanguage,
        service: 'google',
        confidence: 1.0
      };

    } catch (error) {
      logger.error('Google翻译失败:', error);
      throw error;
    }
  }

  async translateWithOpenAI(text, targetLanguage, sourceLanguage = 'auto') {
    try {
      const prompt = `请将以下文本翻译成${targetLanguage}，保持原文的语气和格式：

${text}

请只返回翻译结果，不要添加任何解释。`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.openai.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.config.openai.model,
          messages: [
            { role: 'system', content: '你是一个专业的翻译助手，擅长准确翻译各种文本。' },
            { role: 'user', content: prompt }
          ],
          max_tokens: this.config.openai.maxTokens,
          temperature: 0.1
        }),
        signal: AbortSignal.timeout(this.config.timeout)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'OpenAI翻译API错误');
      }

      const translatedText = data.choices[0].message.content.trim();

      return {
        success: true,
        translatedText,
        detectedLanguage: sourceLanguage,
        service: 'openai',
        confidence: 0.95
      };

    } catch (error) {
      logger.error('OpenAI翻译失败:', error);
      throw error;
    }
  }

  async translateWithAnthropic(text, targetLanguage, sourceLanguage = 'auto') {
    try {
      const prompt = `请将以下文本翻译成${targetLanguage}，保持原文的语气和格式：

${text}

请只返回翻译结果，不要添加任何解释。`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': this.config.anthropic.apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.config.anthropic.model,
          max_tokens: this.config.anthropic.maxTokens,
          messages: [
            { role: 'user', content: prompt }
          ]
        }),
        signal: AbortSignal.timeout(this.config.timeout)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Anthropic翻译API错误');
      }

      const translatedText = data.content[0].text.trim();

      return {
        success: true,
        translatedText,
        detectedLanguage: sourceLanguage,
        service: 'anthropic',
        confidence: 0.95
      };

    } catch (error) {
      logger.error('Anthropic翻译失败:', error);
      throw error;
    }
  }

  async translateArticle(articleId, targetLanguage, options = {}) {
    try {
      logger.info(`开始翻译文章: ${articleId} -> ${targetLanguage}`);

      // 获取文章
      const article = await this.getArticle(articleId);
      if (!article) {
        throw new Error(`文章不存在: ${articleId}`);
      }

      // 检查是否已经翻译过
      const existingTranslation = await this.getExistingTranslation(articleId, targetLanguage);
      if (existingTranslation && !options.forceRetranslate) {
        logger.info(`文章 ${articleId} 已有翻译到 ${targetLanguage}`);
        return existingTranslation;
      }

      // 准备翻译文本
      const textToTranslate = this.prepareTextForTranslation(article);
      if (!textToTranslate) {
        throw new Error('文章没有可翻译的内容');
      }

      // 创建翻译任务
      const task = await this.createTranslationTask({
        article_id: articleId,
        source_language: article.original_language || 'auto',
        target_language: targetLanguage,
        translation_service: options.service || this.config.defaultService,
        source_text: textToTranslate
      });

      // 执行翻译
      const result = await this.executeTranslationTask(task);

      if (result.success) {
        // 保存翻译历史
        await this.saveTranslationHistory({
          task_id: task.id,
          article_id: articleId,
          original_text: textToTranslate,
          translated_text: result.translatedText,
          source_language: result.detectedLanguage || article.original_language,
          target_language: targetLanguage,
          translation_service: result.service,
          confidence_score: result.confidence,
          processing_time: result.processingTime
        });

        logger.info(`文章翻译完成: ${articleId} -> ${targetLanguage}`);
      }

      return result;

    } catch (error) {
      logger.error(`翻译文章失败: ${articleId}`, error);
      throw error;
    }
  }

  async getArticle(articleId) {
    try {
      const { error } = await dbClient
        .from('news_articles')
        .select('*')
        .eq('id', articleId)
        .single();

      if (error) {
        return null;
      }

      return data;
    } catch (error) {
      return null;
    }
  }

  async getExistingTranslation(articleId, targetLanguage) {
    try {
      const { error } = await dbClient
        .from('translation_history')
        .select('*')
        .eq('article_id', articleId)
        .eq('target_language', targetLanguage)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        return null;
      }

      return {
        success: true,
        translatedText: data.translated_text,
        service: data.translation_service,
        confidence: data.confidence_score,
        isCached: true
      };
    } catch (error) {
      return null;
    }
  }

  prepareTextForTranslation(article) {
    // 准备要翻译的文本，结合标题和内容
    const title = article.title || '';
    const content = article.content || article.summary || '';

    if (!title && !content) {
      return null;
    }

    // 如果内容太长，进行截断
    let combinedText = title;
    if (content) {
      combinedText += `\n\n${  content}`;
    }

    if (combinedText.length > this.config.maxTextLength) {
      combinedText = `${combinedText.substring(0, this.config.maxTextLength)  }...`;
    }

    return combinedText;
  }

  async createTranslationTask(taskData) {
    try {
      const task = {
        id: uuidv4(),
        ...taskData,
        status: 'pending',
        retry_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { error } = await dbClient
        .from('translation_tasks')
        .insert([task])
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      logger.error('创建翻译任务失败:', error);
      throw error;
    }
  }

  async executeTranslationTask(task) {
    const startTime = Date.now();

    try {
      // 更新任务状态
      await this.updateTaskStatus(task.id, 'processing');

      // 执行翻译
      const result = await this.translateText(
        task.source_text,
        task.target_language,
        task.source_language,
        { service: task.translation_service }
      );

      const processingTime = Date.now() - startTime;

      if (result.success) {
        await this.updateTaskStatus(task.id, 'completed', {
          translated_text: result.translatedText,
          processing_time
        });

        return {
          ...result,
          processingTime,
          taskId: task.id
        };
      } else {
        await this.updateTaskStatus(task.id, 'failed', {
          error_message: result.error,
          processing_time
        });

        return {
          success: false,
          error: result.error,
          processingTime,
          taskId: task.id
        };
      }

    } catch (error) {
      const processingTime = Date.now() - startTime;

      await this.updateTaskStatus(task.id, 'failed', {
        error_message: error.message,
        processing_time
      });

      return {
        success: false,
        error: error.message,
        processingTime,
        taskId: task.id
      };
    }
  }

  async updateTaskStatus(taskId, status, updateData = {}) {
    try {
      const { error } = await dbClient
        .from('translation_tasks')
        .update({
          status,
          ...updateData,
          updated_at: new Date().toISOString()
        })
        .eq('id', taskId);

      if (error) {
        throw error;
      }
    } catch (error) {
      logger.error('更新翻译任务状态失败:', error);
    }
  }

  async saveTranslationHistory(historyData) {
    try {
      const history = {
        id: uuidv4(),
        ...historyData,
        created_at: new Date().toISOString()
      };

      const { error } = await dbClient
        .from('translation_history')
        .insert([history]);

      if (error) {
        throw error;
      }
    } catch (error) {
      logger.error('保存翻译历史失败:', error);
    }
  }

  async getFromCache(text, targetLanguage, sourceLanguage) {
    // 简单的缓存实现，实际项目中可以使用Redis
    const cacheKey = this.generateCacheKey(text, targetLanguage, sourceLanguage);
    // 这里应该查询缓存表，简化实现
    return null;
  }

  async saveToCache(text, targetLanguage, sourceLanguage, result) {
    // 简单的缓存实现，实际项目中可以使用Redis
    const cacheKey = this.generateCacheKey(text, targetLanguage, sourceLanguage);
    // 这里应该保存到缓存表，简化实现
  }

  generateCacheKey(text, targetLanguage, sourceLanguage) {
    const hash = require('crypto')
      .createHash('md5')
      .update(`${sourceLanguage}:${targetLanguage}:${text}`)
      .digest('hex');
    return `translation:${hash}`;
  }

  async batchTranslate(articleIds, targetLanguage, options = {}) {
    try {
      logger.info(`开始批量翻译 ${articleIds.length} 篇文章`);

      const results = [];
      const batchSize = options.batchSize || this.config.batchSize;

      // 分批处理
      for (let i = 0; i < articleIds.length; i += batchSize) {
        const batch = articleIds.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(
          batch.map(articleId => this.translateArticle(articleId, targetLanguage, options))
        );

        results.push(...batchResults.map((result, index) => ({
          articleId: batch[index],
          success: result.status === 'fulfilled',
          result: result.status === 'fulfilled' ? result.value : null,
          error: result.status === 'rejected' ? result.reason.message : null
        })));

        // 批次间延迟
        if (i + batchSize < articleIds.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      const successCount = results.filter(r => r.success).length;
      logger.info(`批量翻译完成: ${successCount}/${articleIds.length} 成功`);

      return {
        success: true,
        results,
        totalCount: articleIds.length,
        successCount
      };

    } catch (error) {
      logger.error('批量翻译失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getTranslationTasks(params = {}) {
    try {
      const tasks = await TranslationTaskQueries.list({
        pagination: params.pagination,
        filters: params.filters,
        sort: params.sort
      });

      return tasks;
    } catch (error) {
      logger.error('获取翻译任务失败:', error);
      throw error;
    }
  }

  async getTranslationHistory(params = {}) {
    try {
      let query = dbClient
        .from('translation_history')
        .select('*')
        .order('created_at', { ascending: false });

      if (params.articleId) {
        query = query.eq('article_id', params.articleId);
      }

      if (params.limit) {
        query = query.limit(params.limit);
      }

      const { error } = await query;

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error('获取翻译历史失败:', error);
      throw error;
    }
  }

  async getStats() {
    try {
      const { data: taskStats } = await dbClient
        .from('translation_tasks')
        .select('status, COUNT(*) as count')
        .group('status');

      const { data: historyCount } = await dbClient
        .from('translation_history')
        .select('id', { count: 'exact', head: true });

      const { data: serviceStats } = await dbClient
        .from('translation_history')
        .select('translation_service, COUNT(*) as count')
        .group('translation_service');

      return {
        activeTasks: this.activeTasks.size,
        maxConcurrentTasks: this.maxConcurrentTasks,
        taskStats: taskStats || [],
        totalTranslations: historyCount || 0,
        serviceStats: serviceStats || [],
        config: this.config,
        isRunning: this.isRunning
      };
    } catch (error) {
      logger.error('获取翻译统计失败:', error);
      throw error;
    }
  }

  async retryFailedTask(taskId) {
    try {
      const task = await TranslationTaskQueries.findById(taskId);
      if (!task) {
        throw new Error(`翻译任务不存在: ${taskId}`);
      }

      if (task.status !== 'failed') {
        throw new Error(`任务状态不是失败状态: ${task.status}`);
      }

      // 检查重试次数
      if (task.retry_count >= this.config.maxRetries) {
        throw new Error('任务已达到最大重试次数');
      }

      // 更新重试次数
      await TranslationTaskQueries.update(taskId, {
        retry_count: task.retry_count + 1,
        status: 'pending'
      });

      // 重新执行任务
      const result = await this.executeTranslationTask({ ...task, retry_count: task.retry_count + 1 });

      return result;
    } catch (error) {
      logger.error(`重试翻译任务失败: ${taskId}`, error);
      throw error;
    }
  }

  async deleteTask(taskId) {
    try {
      await TranslationTaskQueries.delete(taskId);
      logger.info(`翻译任务删除成功: ${taskId}`);
      return true;
    } catch (error) {
      logger.error('删除翻译任务失败:', error);
      throw error;
    }
  }

  async clearHistory(articleId) {
    try {
      const { error } = await dbClient
        .from('translation_history')
        .delete()
        .eq('article_id', articleId);

      if (error) {
        throw error;
      }

      logger.info(`文章翻译历史清除成功: ${articleId}`);
      return true;
    } catch (error) {
      logger.error('清除翻译历史失败:', error);
      throw error;
    }
  }
}

export default TranslationService;