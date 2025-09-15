/**
 * AI Analysis Service
 * 提供新闻文章的AI分析功能，包括情感分析、股票实体提取、关键词提取、分类等
 */

import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
// import { AIAnalysisTaskQueries } from '../database/queries.js'; // TODO: 实现数据库表后启用
import dbClient from '../database/client.js';
import logger from '../utils/logger.js';

export class AIAnalysisService extends EventEmitter {
  constructor(config = {}) {
    super();
    this.isRunning = false;
    this.activeTasks = new Map();
    this.taskQueue = [];
    this.maxConcurrentTasks = config.maxConcurrentTasks || 3;

    // 性能统计
    this.stats = {
      articlesProcessed: 0,
      duplicatesFiltered: 0,
      lowQualityFiltered: 0,
      categoriesAssigned: 0,
      summariesGenerated: 0,
      sentimentAnalysisCompleted: 0,
      entitiesExtracted: 0,
      stockEntitiesExtracted: 0,
      errors: 0,
      lastAggregationTime: null,
      averageProcessingTime: 0
    };

    // 成本统计
    this.costStats = {
      dailyCost: 0,
      monthlyCost: 0,
      totalCost: 0,
      serviceCosts: {
        openai: 0,
        anthropic: 0,
        deepseek: 0,
        local: 0
      },
      lastCostUpdate: new Date()
    };

    // 用户偏好（用于推荐）
    this.userPreferences = {
      userId: null,
      preferredCategories: new Set(),
      preferredTopics: new Set(),
      readingHistory: [],
      feedbackScores: new Map(),
      lastUpdated: new Date()
    };

    // 推荐缓存
    this.recommendationCache = new Map();
    this.lastRecommendationUpdate = new Date();

    this.config = {
      // OpenAI配置
      openai: {
        enabled: config.openai?.enabled !== false,
        apiKey: config.openai?.apiKey || process.env.OPENAI_API_KEY,
        model: config.openai?.model || 'gpt-3.5-turbo',
        maxTokens: config.openai?.maxTokens || 1000,
        temperature: config.openai?.temperature || 0.3,
        costPerToken: config.openai?.costPerToken || 0.002 // USD per 1K tokens
      },

      // Anthropic配置
      anthropic: {
        enabled: config.anthropic?.enabled !== false,
        apiKey: config.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY,
        model: config.anthropic?.model || 'claude-3-sonnet-20240229',
        maxTokens: config.anthropic?.maxTokens || 1000,
        temperature: config.anthropic?.temperature || 0.3,
        costPerToken: config.anthropic?.costPerToken || 0.015 // USD per 1K tokens
      },

      // DeepSeek配置
      deepseek: {
        enabled: config.deepseek?.enabled !== false,
        baseUrl: config.deepseek?.baseUrl || process.env.DEEPSEEK_BASE_URL,
        apiKey: config.deepseek?.apiKey || process.env.DEEPSEEK_API_KEY,
        model: config.deepseek?.model || process.env.DEEPSEEK_MODEL || 'DeepSeek-V3.1',
        maxTokens: config.deepseek?.maxTokens || 1000,
        temperature: config.deepseek?.temperature || 0.3,
        costPerToken: config.deepseek?.costPerToken || 0.001 // USD per 1K tokens
      },

      // 本地AI配置
      local: {
        enabled: config.local?.enabled || false,
        endpoint: config.local?.endpoint || 'http://localhost:8000',
        model: config.local?.model || 'llama2',
        maxTokens: config.local?.maxTokens || 1000,
        costPerToken: 0 // 本地模型无成本
      },

      // 默认设置
      defaultService: config.defaultService || 'openai',
      timeout: config.timeout || 30000,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      autoAnalyze: config.autoAnalyze !== false,
      cacheEnabled: config.cacheEnabled !== false,
      cacheTTL: config.cacheTTL || 3600,
      batchSize: config.batchSize || 5,

      // 成本控制配置
      costControl: {
        enabled: config.costControl?.enabled !== false,
        dailyBudget: config.costControl?.dailyBudget || 10.0, // USD
        monthlyBudget: config.costControl?.monthlyBudget || 200.0, // USD
        alertThreshold: config.costControl?.alertThreshold || 0.8, // 80% of budget
        autoModelSwitch: config.costControl?.autoModelSwitch !== false
      },

      // 推荐引擎配置
      recommendations: {
        enabled: config.recommendations?.enabled !== false,
        maxRecommendations: config.recommendations?.maxRecommendations || 10,
        refreshInterval: config.recommendations?.refreshInterval || 3600, // 1 hour
        userPreferences: {
          categories: config.recommendations?.userPreferences?.categories || [],
          topics: config.recommendations?.userPreferences?.topics || [],
          sentimentPreference: config.recommendations?.userPreferences?.sentimentPreference || 'neutral'
        }
      },

      // 多模型智能切换配置
      modelSelection: {
        enabled: config.modelSelection?.enabled !== false,
        strategy: config.modelSelection?.strategy || 'cost_effective', // cost_effective, quality_first, balanced
        performanceThreshold: config.modelSelection?.performanceThreshold || 0.8,
        fallbackModels: config.modelSelection?.fallbackModels || ['deepseek', 'openai']
      },

      // 分析配置
      analysis: {
        sentiment: {
          enabled: config.analysis?.sentiment?.enabled !== false,
          prompt: '请分析以下文本的情感倾向，返回positive、negative或neutral，并给出0-1的置信度分数：'
        },
        category: {
          enabled: config.analysis?.category?.enabled !== false,
          categories: ['tech', 'finance', 'politics', 'health', 'sports', 'entertainment'],
          prompt: '请将以下新闻文本分类到最合适的类别中，只返回类别名称：'
        },
        keywords: {
          enabled: config.analysis?.keywords?.enabled !== false,
          maxKeywords: config.analysis?.keywords?.maxKeywords || 10,
          prompt: '请从以下文本中提取最重要的关键词，以逗号分隔：'
        },
        summary: {
          enabled: config.analysis?.summary?.enabled !== false,
          maxLength: config.analysis?.summary?.maxLength || 200,
          prompt: '请为以下新闻文本生成一个简洁的摘要，不超过200字：'
        },
        importance: {
          enabled: config.analysis?.importance?.enabled !== false,
          prompt: '请评估以下新闻的重要性，给出0-1的分数，并简要说明理由：'
        },
        entities: {
          enabled: config.analysis?.entities?.enabled !== false,
          prompt: '请从以下文本中提取所有实体（人名、公司名、地名、组织名等），以JSON格式返回：{"entities": [{"name": "实体名", "type": "实体类型", "confidence": 0.0-1.0}]}'
        },
        stockEntities: {
          enabled: config.analysis?.stockEntities?.enabled !== false,
          prompt: '请从以下金融新闻中提取所有股票相关的实体，包括股票代码、公司名称、股票价格变动等，以JSON格式返回：{"stocks": [{"symbol": "股票代码", "company": "公司名", "change": "涨跌幅", "action": "操作建议", "confidence": 0.0-1.0}]}'
        },
        topics: {
          enabled: config.analysis?.topics?.enabled !== false,
          maxTopics: config.analysis?.topics?.maxTopics || 5,
          prompt: '请为以下文本识别主要话题，以逗号分隔返回话题名称：'
        },
        risk: {
          enabled: config.analysis?.risk?.enabled !== false,
          prompt: '请分析以下文本的风险等级（low/medium/high）和主要风险因素，以JSON格式返回：{"risk_level": "low|medium|high", "risk_factors": ["因素1", "因素2"], "confidence": 0.0-1.0}'
        }
      }
    };
  }

  async initialize() {
    try {
      logger.info('初始化AI Analysis Service...');

      // 加载数据库配置
      await this.loadConfig();

      // 验证AI服务
      await this.validateServices();

      this.isRunning = true;
      logger.info('AI Analysis Service 初始化完成');
      return true;

    } catch (error) {
      logger.error('AI Analysis Service 初始化失败:', error);
      throw error;
    }
  }

  async loadConfig() {
    try {
      const { error } = await dbClient
        .from('system_configs')
        .select('config_value')
        .eq('config_key', 'ai_analysis')
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        const dbConfig = JSON.parse(data.config_value);
        this.config = { ...this.config, ...dbConfig };
        logger.info('已加载AI分析配置');
      }
    } catch (error) {
      logger.warn('加载AI分析配置失败，使用默认配置:', error);
    }
  }

  async validateServices() {
    const availableServices = [];

    // 验证OpenAI
    if (this.config.openai.enabled && this.config.openai.apiKey) {
      try {
        const isValid = await this.testOpenAI();
        if (isValid) {
          availableServices.push('openai');
        }
      } catch (error) {
        logger.warn('OpenAI服务验证失败:', error.message);
        this.config.openai.enabled = false;
      }
    }

    // 验证Anthropic
    if (this.config.anthropic.enabled && this.config.anthropic.apiKey) {
      try {
        const isValid = await this.testAnthropic();
        if (isValid) {
          availableServices.push('anthropic');
        }
      } catch (error) {
        logger.warn('Anthropic服务验证失败:', error.message);
        this.config.anthropic.enabled = false;
      }
    }

    // 验证DeepSeek
    if (this.config.deepseek.enabled && this.config.deepseek.apiKey && this.config.deepseek.baseUrl) {
      try {
        const isValid = await this.testDeepSeek();
        if (isValid) {
          availableServices.push('deepseek');
        }
      } catch (error) {
        logger.warn('DeepSeek服务验证失败:', error.message);
        this.config.deepseek.enabled = false;
      }
    }

    // 验证本地AI
    if (this.config.local.enabled) {
      try {
        const isValid = await this.testLocalAI();
        if (isValid) {
          availableServices.push('local');
        }
      } catch (error) {
        logger.warn('本地AI服务验证失败:', error.message);
        this.config.local.enabled = false;
      }
    }

    if (availableServices.length === 0) {
      throw new Error('没有可用的AI分析服务');
    }

    // 如果默认服务不可用，选择第一个可用的
    if (!availableServices.includes(this.config.defaultService)) {
      this.config.defaultService = availableServices[0];
      logger.warn(`默认AI服务不可用，切换到: ${this.config.defaultService}`);
    }

    logger.info(`可用AI服务: ${availableServices.join(', ')}`);
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

  async testDeepSeek() {
    try {
      const response = await fetch(`${this.config.deepseek.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.config.deepseek.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async testLocalAI() {
    try {
      const response = await fetch(`${this.config.local.endpoint}/v1/models`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async analyzeArticle(articleId, analysisTypes, options = {}) {
    try {
      logger.info(`开始分析文章: ${articleId}`);

      // 获取文章
      const article = await this.getArticle(articleId);
      if (!article) {
        throw new Error(`文章不存在: ${articleId}`);
      }

      // 准备分析文本
      const textToAnalyze = this.prepareTextForAnalysis(article);
      if (!textToAnalyze) {
        throw new Error('文章没有可分析的内容');
      }

      const results = {};

      // 执行各种分析
      for (const analysisType of analysisTypes) {
        if (!this.config.analysis[analysisType]?.enabled) {
          logger.warn(`分析类型 ${analysisType} 未启用`);
          continue;
        }

        try {
          // 创建分析任务
          const task = await this.createAnalysisTask({
            article_id: articleId,
            task_type: analysisType,
            ai_service: options.service || this.config.defaultService,
            prompt: this.buildPrompt(analysisType, textToAnalyze)
          });

          // 执行分析
          const result = await this.executeAnalysisTask(task);
          results[analysisType] = result;

          if (result.success) {
            logger.info(`文章 ${analysisType} 分析完成: ${articleId}`);

            // 发送分析完成事件
            this.emit('analysisCompleted', {
              articleId,
              analysisType,
              result: results[analysisType],
              timestamp: new Date().toISOString()
            });
          }
        } catch (error) {
          logger.error(`文章 ${analysisType} 分析失败: ${articleId}`, error);
          results[analysisType] = {
            success: false,
            error: error.message
          };

          // 发送错误事件
          this.emit('error', {
            type: 'analysis',
            articleId,
            analysisType,
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
      }

      return {
        success: true,
        articleId,
        results
      };

    } catch (error) {
      logger.error(`分析文章失败: ${articleId}`, error);
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

  prepareTextForAnalysis(article) {
    // 准备要分析的文本，结合标题和内容
    const title = article.title || '';
    const content = article.content || article.summary || '';

    if (!title && !content) {
      return null;
    }

    // 对于不同的分析类型，可能需要不同的文本准备方式
    let combinedText = title;
    if (content) {
      combinedText += `\n\n${  content}`;
    }

    // 限制文本长度
    const maxLength = 2000;
    if (combinedText.length > maxLength) {
      combinedText = `${combinedText.substring(0, maxLength)  }...`;
    }

    return combinedText;
  }

  buildPrompt(analysisType, text) {
    const analysisConfig = this.config.analysis[analysisType];
    if (!analysisConfig) {
      throw new Error(`未知的分析类型: ${analysisType}`);
    }

    switch (analysisType) {
    case 'sentiment':
      return `${analysisConfig.prompt}\n\n${text}\n\n请以JSON格式返回：{"sentiment": "positive|negative|neutral", "confidence": 0.0-1.0, "reason": "简要说明"}`;

    case 'category':
      const categories = this.config.analysis.category.categories.join(', ');
      return `${analysisConfig.prompt}\n可选类别：${categories}\n\n${text}\n\n只返回类别名称`;

    case 'keywords':
      return `${analysisConfig.prompt}\n最多提取${analysisConfig.maxKeywords}个关键词\n\n${text}\n\n以逗号分隔返回关键词`;

    case 'summary':
      return `${analysisConfig.prompt}\n\n${text}\n\n请生成简洁的摘要`;

    case 'importance':
      return `${analysisConfig.prompt}\n\n${text}\n\n请以JSON格式返回：{"importance": 0.0-1.0, "reason": "简要说明"}`;

    case 'entities':
      return `${analysisConfig.prompt}\n\n${text}\n\n请提取所有实体`;

    case 'stockEntities':
      return `${analysisConfig.prompt}\n\n${text}\n\n请提取股票相关实体`;

    case 'topics':
      return `${analysisConfig.prompt}\n最多提取${analysisConfig.topics.maxTopics}个话题\n\n${text}\n\n以逗号分隔返回话题`;

    case 'risk':
      return `${analysisConfig.prompt}\n\n${text}\n\n请分析风险等级`;

    default:
      throw new Error(`不支持的分析类型: ${analysisType}`);
    }
  }

  async createAnalysisTask(taskData) {
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
        .from('ai_analysis_tasks')
        .insert([task])
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      logger.error('创建分析任务失败:', error);
      throw error;
    }
  }

  async executeAnalysisTask(task) {
    const startTime = Date.now();

    try {
      // 更新任务状态
      await this.updateTaskStatus(task.id, 'processing');

      // 执行分析
      const result = await this.performAnalysis(
        task.prompt,
        task.task_type,
        task.ai_service
      );

      const processingTime = Date.now() - startTime;

      if (result.success) {
        // 解析结果
        const parsedResult = this.parseAnalysisResult(result.rawResponse, task.task_type);

        await this.updateTaskStatus(task.id, 'completed', {
          result: parsedResult,
          processing_time
        });

        return {
          ...result,
          parsedResult,
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

  async performAnalysis(prompt, analysisType, service) {
    try {
      let response;

      switch (service) {
      case 'openai':
        response = await this.analyzeWithOpenAI(prompt, analysisType);
        break;
      case 'anthropic':
        response = await this.analyzeWithAnthropic(prompt, analysisType);
        break;
      case 'deepseek':
        response = await this.analyzeWithDeepSeek(prompt, analysisType);
        break;
      case 'local':
        response = await this.analyzeWithLocalAI(prompt, analysisType);
        break;
      default:
        throw new Error(`不支持的AI服务: ${service}`);
      }

      return {
        success: true,
        rawResponse: response,
        service
      };

    } catch (error) {
      logger.error(`${service} 分析失败:`, error);
      return {
        success: false,
        error: error.message,
        service
      };
    }
  }

  async analyzeWithOpenAI(prompt, analysisType) {
    try {
      const config = this.config.openai;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            {
              role: 'system',
              content: this.getSystemPrompt(analysisType)
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: config.maxTokens,
          temperature: config.temperature
        }),
        signal: AbortSignal.timeout(this.config.timeout)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'OpenAI API错误');
      }

      return data.choices[0].message.content.trim();

    } catch (error) {
      logger.error('OpenAI分析失败:', error);
      throw error;
    }
  }

  async analyzeWithAnthropic(prompt, analysisType) {
    try {
      const config = this.config.anthropic;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': config.apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: config.maxTokens,
          messages: [
            {
              role: 'user',
              content: `${this.getSystemPrompt(analysisType)}\n\n${prompt}`
            }
          ]
        }),
        signal: AbortSignal.timeout(this.config.timeout)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Anthropic API错误');
      }

      return data.content[0].text.trim();

    } catch (error) {
      logger.error('Anthropic分析失败:', error);
      throw error;
    }
  }

  async analyzeWithLocalAI(prompt, analysisType) {
    try {
      const config = this.config.local;

      const response = await fetch(`${config.endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            {
              role: 'system',
              content: this.getSystemPrompt(analysisType)
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: config.maxTokens,
          temperature: 0.3
        }),
        signal: AbortSignal.timeout(this.config.timeout)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || '本地AI API错误');
      }

      return data.choices[0].message.content.trim();

    } catch (error) {
      logger.error('本地AI分析失败:', error);
      throw error;
    }
  }

  async analyzeWithDeepSeek(prompt, analysisType) {
    try {
      const config = this.config.deepseek;

      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            {
              role: 'system',
              content: this.getSystemPrompt(analysisType)
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: config.maxTokens,
          temperature: config.temperature
        }),
        signal: AbortSignal.timeout(this.config.timeout)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'DeepSeek API错误');
      }

      return data.choices[0].message.content.trim();

    } catch (error) {
      logger.error('DeepSeek分析失败:', error);
      throw error;
    }
  }

  getSystemPrompt(analysisType) {
    switch (analysisType) {
    case 'sentiment':
      return '你是一个专业的情感分析专家，擅长分析文本的情感倾向。';
    case 'category':
      return '你是一个专业的文本分类专家，擅长将新闻文本分类到合适的类别中。';
    case 'keywords':
      return '你是一个专业的关键词提取专家，擅长从文本中提取重要的关键词。';
    case 'summary':
      return '你是一个专业的摘要生成专家，擅长为长文本生成简洁的摘要。';
    case 'importance':
      return '你是一个专业的重要性评估专家，擅长评估新闻的重要性和影响力。';
    default:
      return '你是一个专业的AI分析专家。';
    }
  }

  parseAnalysisResult(rawResponse, analysisType) {
    try {
      switch (analysisType) {
      case 'sentiment':
        try {
          const parsed = JSON.parse(rawResponse);
          return {
            sentiment: parsed.sentiment || 'neutral',
            confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
            reason: parsed.reason || ''
          };
        } catch {
          // 如果不是JSON格式，尝试解析文本
          const text = rawResponse.toLowerCase();
          let sentiment = 'neutral';
          if (text.includes('positive') || text.includes('积极')) sentiment = 'positive';
          else if (text.includes('negative') || text.includes('消极')) sentiment = 'negative';

          return {
            sentiment,
            confidence: 0.7,
            reason: rawResponse
          };
        }

      case 'category':
        return {
          category: rawResponse.trim().toLowerCase(),
          confidence: 0.8
        };

      case 'keywords':
        const keywords = rawResponse
          .split(',')
          .map(k => k.trim())
          .filter(k => k.length > 0)
          .slice(0, this.config.analysis.keywords.maxKeywords);

        return {
          keywords,
          count: keywords.length
        };

      case 'summary':
        return {
          summary: rawResponse.trim(),
          length: rawResponse.length
        };

      case 'importance':
        try {
          const parsed = JSON.parse(rawResponse);
          return {
            importance: Math.max(0, Math.min(1, parsed.importance || 0.5)),
            reason: parsed.reason || ''
          };
        } catch {
          return {
            importance: 0.5,
            reason: rawResponse
          };
        }

      case 'entities':
        try {
          const parsed = JSON.parse(rawResponse);
          return {
            entities: parsed.entities || [],
            count: (parsed.entities || []).length
          };
        } catch {
          return {
            entities: [],
            count: 0,
            error: '无法解析实体'
          };
        }

      case 'stockEntities':
        try {
          const parsed = JSON.parse(rawResponse);
          return {
            stocks: parsed.stocks || [],
            count: (parsed.stocks || []).length
          };
        } catch {
          return {
            stocks: [],
            count: 0,
            error: '无法解析股票实体'
          };
        }

      case 'topics':
        const topics = rawResponse
          .split(',')
          .map(t => t.trim())
          .filter(t => t.length > 0)
          .slice(0, this.config.analysis.topics.maxTopics);

        return {
          topics,
          count: topics.length
        };

      case 'risk':
        try {
          const parsed = JSON.parse(rawResponse);
          return {
            riskLevel: parsed.risk_level || 'medium',
            riskFactors: parsed.risk_factors || [],
            confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5))
          };
        } catch {
          return {
            riskLevel: 'medium',
            riskFactors: [],
            confidence: 0.5
          };
        }

      default:
        return {
          raw: rawResponse
        };
      }
    } catch (error) {
      logger.error('解析分析结果失败:', error);
      return {
        error: error.message,
        raw: rawResponse
      };
    }
  }

  async updateTaskStatus(taskId, status, updateData = {}) {
    try {
      const { error } = await dbClient
        .from('ai_analysis_tasks')
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
      logger.error('更新分析任务状态失败:', error);
    }
  }

  async batchAnalyze(articleIds, analysisTypes, options = {}) {
    try {
      logger.info(`开始批量分析 ${articleIds.length} 篇文章`);

      const results = [];
      const batchSize = options.batchSize || this.config.batchSize;

      // 分批处理
      for (let i = 0; i < articleIds.length; i += batchSize) {
        const batch = articleIds.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(
          batch.map(articleId => this.analyzeArticle(articleId, analysisTypes, options))
        );

        results.push(...batchResults.map((result, index) => ({
          articleId: batch[index],
          success: result.status === 'fulfilled',
          result: result.status === 'fulfilled' ? result.value : null,
          error: result.status === 'rejected' ? result.reason.message : null
        })));

        // 批次间延迟
        if (i + batchSize < articleIds.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      const successCount = results.filter(r => r.success).length;
      logger.info(`批量分析完成: ${successCount}/${articleIds.length} 成功`);

      return {
        success: true,
        results,
        totalCount: articleIds.length,
        successCount
      };

    } catch (error) {
      logger.error('批量分析失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getAnalysisTasks(params = {}) {
    try {
      // TODO: 实现数据库表后启用
      // const tasks = await AIAnalysisTaskQueries.list({
      //   pagination: params.pagination,
      //   filters: params.filters,
      //   sort: params.sort
      // });
      const tasks = { data: [], total: 0 };

      return tasks;
    } catch (error) {
      logger.error('获取分析任务失败:', error);
      throw error;
    }
  }

  async getArticleAnalysis(articleId) {
    try {
      const { error } = await dbClient
        .from('ai_analysis_tasks')
        .select('*')
        .eq('article_id', articleId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      const analysis = {};
      (data || []).forEach(task => {
        analysis[task.task_type] = {
          result: task.result,
          service: task.ai_service,
          processingTime: task.processing_time,
          createdAt: task.created_at
        };
      });

      return analysis;
    } catch (error) {
      logger.error('获取文章分析失败:', error);
      throw error;
    }
  }

  async getStats() {
    try {
      const { data: taskStats } = await dbClient
        .from('ai_analysis_tasks')
        .select('status, COUNT(*) as count')
        .group('status');

      const { data: typeStats } = await dbClient
        .from('ai_analysis_tasks')
        .select('task_type, COUNT(*) as count')
        .group('task_type');

      const { data: serviceStats } = await dbClient
        .from('ai_analysis_tasks')
        .select('ai_service, COUNT(*) as count')
        .group('ai_service');

      return {
        activeTasks: this.activeTasks.size,
        maxConcurrentTasks: this.maxConcurrentTasks,
        taskStats: taskStats || [],
        typeStats: typeStats || [],
        serviceStats: serviceStats || [],
        config: this.config,
        isRunning: this.isRunning
      };
    } catch (error) {
      logger.error('获取AI分析统计失败:', error);
      throw error;
    }
  }

  async retryFailedTask(taskId) {
    try {
      // TODO: 实现数据库表后启用
      // const task = await AIAnalysisTaskQueries.findById(taskId);
      const task = null; // 临时占位符
      if (!task) {
        throw new Error(`分析任务不存在: ${taskId}`);
      }

      if (task.status !== 'failed') {
        throw new Error(`任务状态不是失败状态: ${task.status}`);
      }

      // 检查重试次数
      if (task.retry_count >= this.config.maxRetries) {
        throw new Error('任务已达到最大重试次数');
      }

      // 更新重试次数
      // TODO: 实现数据库表后启用
      // await AIAnalysisTaskQueries.update(taskId, {
      //   retry_count: task.retry_count + 1,
      //   status: 'pending'
      // });
      logger.info(`模拟更新任务重试次数: ${taskId}`);

      // 重新执行任务
      const result = await this.executeAnalysisTask({ ...task, retry_count: task.retry_count + 1 });

      return result;
    } catch (error) {
      logger.error(`重试分析任务失败: ${taskId}`, error);
      throw error;
    }
  }

  async deleteTask(taskId) {
    try {
      // TODO: 实现数据库表后启用
      // await AIAnalysisTaskQueries.delete(taskId);
      logger.info(`模拟删除分析任务: ${taskId}`);
      return true;
    } catch (error) {
      logger.error('删除分析任务失败:', error);
      throw error;
    }
  }

  async searchArticlesByAnalysis(analysisType, query, options = {}) {
    try {
      // 根据分析类型搜索文章
      let searchQuery;

      switch (analysisType) {
      case 'sentiment':
        searchQuery = `result->>'sentiment' ilike '%${query}%'`;
        break;
      case 'category':
        searchQuery = `result->>'category' ilike '%${query}%'`;
        break;
      case 'keywords':
        searchQuery = `result->>'keywords' ilike '%${query}%'`;
        break;
      default:
        throw new Error(`不支持搜索的分析类型: ${analysisType}`);
      }

      const { error } = await dbClient
        .from('ai_analysis_tasks')
        .select(`
          article_id,
          result,
          ai_service,
          created_at,
          news_articles (*)
        `)
        .eq('task_type', analysisType)
        .eq('status', 'completed')
        .or(searchQuery)
        .order('created_at', { ascending: false })
        .limit(options.limit || 20);

      if (error) {
        throw error;
      }

      return (data || []).map(item => ({
        ...item.news_articles,
        analysis: {
          type: analysisType,
          result: item.result,
          service: item.ai_service,
          analyzedAt: item.created_at
        }
      }));

    } catch (error) {
      logger.error('根据分析结果搜索文章失败:', error);
      throw error;
    }
  }

  // 个性化推荐功能
  async getPersonalizedRecommendations(userId, options = {}) {
    try {
      if (!this.config.recommendations.enabled) {
        throw new Error('推荐功能未启用');
      }

      const cacheKey = `recommendations:${userId}`;

      // 检查缓存
      if (this.recommendationCache.has(cacheKey)) {
        const cached = this.recommendationCache.get(cacheKey);
        const cacheAge = Date.now() - cached.timestamp;

        if (cacheAge < this.config.recommendations.refreshInterval * 1000) {
          logger.info(`使用缓存推荐: ${userId}`);
          return cached.recommendations;
        }
      }

      // 加载用户偏好
      await this.loadUserPreferences(userId);

      // 获取推荐文章
      const recommendations = await this.generateRecommendations(userId, options);

      // 缓存结果
      this.recommendationCache.set(cacheKey, {
        recommendations,
        timestamp: Date.now()
      });

      logger.info(`生成个性化推荐: ${userId} - ${recommendations.length} 篇文章`);
      return recommendations;

    } catch (error) {
      logger.error('生成个性化推荐失败:', error);
      throw error;
    }
  }

  async loadUserPreferences(userId) {
    try {
      const { error } = await dbClient
        .from('user_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        this.userPreferences = {
          userId,
          preferredCategories: new Set(data.preferred_categories || []),
          preferredTopics: new Set(data.preferred_topics || []),
          readingHistory: data.reading_history || [],
          feedbackScores: new Map(Object.entries(data.feedback_scores || {})),
          lastUpdated: new Date()
        };
      } else {
        // 创建默认偏好
        this.userPreferences = {
          userId,
          preferredCategories: new Set(this.config.recommendations.userPreferences.categories),
          preferredTopics: new Set(this.config.recommendations.userPreferences.topics),
          readingHistory: [],
          feedbackScores: new Map(),
          lastUpdated: new Date()
        };
      }

    } catch (error) {
      logger.warn('加载用户偏好失败:', error);
    }
  }

  async generateRecommendations(userId, options = {}) {
    try {
      const maxRecommendations = options.maxRecommendations || this.config.recommendations.maxRecommendations;

      // 获取用户偏好的类别
      const preferredCategories = Array.from(this.userPreferences.preferredCategories);

      // 获取最近分析的文章
      let query = dbClient
        .from('news_articles')
        .select('*')
        .order('published_at', { ascending: false })
        .limit(100);

      if (preferredCategories.length > 0) {
        query = query.in('category', preferredCategories);
      }

      const { error } = await query;

      if (error) {
        throw error;
      }

      const articles = data || [];
      const recommendations = [];

      // 基于用户偏好评分
      for (const article of articles) {
        const score = this.calculateRecommendationScore(article);
        if (score > 0.5) { // 只推荐相关性高的文章
          recommendations.push({
            ...article,
            recommendationScore: score,
            reasons: this.generateRecommendationReasons(article)
          });
        }
      }

      // 按推荐分数排序
      recommendations.sort((a, b) => b.recommendationScore - a.recommendationScore);

      return recommendations.slice(0, maxRecommendations);

    } catch (error) {
      logger.error('生成推荐失败:', error);
      return [];
    }
  }

  calculateRecommendationScore(article) {
    let score = 0.5; // 基础分数

    // 类别偏好权重 (0.3)
    if (this.userPreferences.preferredCategories.has(article.category)) {
      score += 0.3;
    }

    // 时间新鲜度权重 (0.2)
    const articleAge = Date.now() - new Date(article.published_at).getTime();
    const ageInHours = articleAge / (1000 * 60 * 60);
    if (ageInHours < 24) score += 0.2;
    else if (ageInHours < 72) score += 0.1;

    // 阅读历史权重 (0.3)
    const historyScore = this.calculateHistoryScore(article);
    score += historyScore * 0.3;

    // 情感偏好权重 (0.2)
    const sentimentPreference = this.config.recommendations.userPreferences.sentimentPreference;
    // 这里可以结合文章的情感分析结果

    return Math.min(1.0, score);
  }

  calculateHistoryScore(article) {
    if (this.userPreferences.readingHistory.length === 0) {
      return 0;
    }

    // 简单的历史评分逻辑
    let score = 0;
    const recentHistory = this.userPreferences.readingHistory.slice(-10); // 最近10篇

    for (const history of recentHistory) {
      if (history.category === article.category) {
        score += 0.1;
      }

      // 可以添加更复杂的相关性计算
      // 比如关键词匹配、主题相似度等
    }

    return Math.min(1.0, score);
  }

  generateRecommendationReasons(article) {
    const reasons = [];

    if (this.userPreferences.preferredCategories.has(article.category)) {
      reasons.push(`基于您的类别偏好: ${article.category}`);
    }

    const articleAge = Date.now() - new Date(article.published_at).getTime();
    const ageInHours = articleAge / (1000 * 60 * 60);
    if (ageInHours < 24) {
      reasons.push('最新发布的内容');
    }

    if (this.userPreferences.readingHistory.length > 0) {
      reasons.push('基于您的阅读历史');
    }

    return reasons;
  }

  // 成本控制功能
  async checkCostControl() {
    if (!this.config.costControl.enabled) {
      return { canProceed: true, reason: '成本控制未启用' };
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // 获取今日成本
    const todayCost = await this.calculateCostForPeriod(startOfDay, now);
    const monthCost = await this.calculateCostForPeriod(startOfMonth, now);

    // 检查预算
    const dailyBudget = this.config.costControl.dailyBudget;
    const monthlyBudget = this.config.costControl.monthlyBudget;
    const alertThreshold = this.config.costControl.alertThreshold;

    if (todayCost >= dailyBudget * alertThreshold) {
      return {
        canProceed: false,
        reason: `今日成本已达到预警阈值: ${todayCost.toFixed(2)}/${dailyBudget}`,
        currentCost: todayCost,
        budget: dailyBudget,
        period: 'daily'
      };
    }

    if (monthCost >= monthlyBudget * alertThreshold) {
      return {
        canProceed: false,
        reason: `本月成本已达到预警阈值: ${monthCost.toFixed(2)}/${monthlyBudget}`,
        currentCost: monthCost,
        budget: monthlyBudget,
        period: 'monthly'
      };
    }

    return { canProceed: true, todayCost, monthCost };
  }

  async calculateCostForPeriod(startDate, endDate) {
    try {
      const { error } = await dbClient
        .from('ai_analysis_tasks')
        .select('ai_service, processing_time')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .eq('status', 'completed');

      if (error) {
        throw error;
      }

      let totalCost = 0;

      for (const task of data || []) {
        const serviceCost = this.calculateServiceCost(task.ai_service, task.processing_time);
        totalCost += serviceCost;
      }

      return totalCost;

    } catch (error) {
      logger.error('计算期间成本失败:', error);
      return 0;
    }
  }

  calculateServiceCost(service, processingTime) {
    // 简化的成本计算，实际应该根据token使用量计算
    const config = this.config[service];
    if (!config || !config.costPerToken) {
      return 0;
    }

    // 假设平均每秒钟处理1000个token
    const estimatedTokens = processingTime * 1000;
    return (estimatedTokens / 1000) * config.costPerToken;
  }

  // 多模型智能切换
  async selectOptimalModel(analysisType, textLength) {
    if (!this.config.modelSelection.enabled) {
      return this.config.defaultService;
    }

    const strategy = this.config.modelSelection.strategy;

    switch (strategy) {
    case 'cost_effective':
      return this.selectCostEffectiveModel(analysisType, textLength);
    case 'quality_first':
      return this.selectQualityModel(analysisType, textLength);
    case 'balanced':
      return this.selectBalancedModel(analysisType, textLength);
    default:
      return this.config.defaultService;
    }
  }

  selectCostEffectiveModel(analysisType, textLength) {
    // 简单文本使用便宜模型
    if (textLength < 500) {
      return 'deepseek'; // 最便宜
    }

    // 复杂分析使用中等成本模型
    if (['entities', 'stockEntities', 'risk'].includes(analysisType)) {
      return 'openai';
    }

    return 'deepseek';
  }

  selectQualityModel(analysisType, textLength) {
    // 高要求分析使用高质量模型
    if (['entities', 'stockEntities', 'risk'].includes(analysisType)) {
      return 'anthropic'; // 最高质量
    }

    // 情感分析使用中等质量
    if (analysisType === 'sentiment') {
      return 'openai';
    }

    return 'openai';
  }

  selectBalancedModel(analysisType, textLength) {
    // 平衡策略
    if (textLength < 300) {
      return 'deepseek';
    }

    if (['entities', 'stockEntities'].includes(analysisType)) {
      return 'openai';
    }

    return 'deepseek';
  }

  // 跟踪AI分析成本
  async trackAnalysisCost(taskId, service, processingTime) {
    try {
      const cost = this.calculateServiceCost(service, processingTime);

      // 更新成本统计
      this.costStats.totalCost += cost;
      this.costStats.serviceCosts[service] += cost;
      this.costStats.lastCostUpdate = new Date();

      // 记录到数据库
      const { error } = await dbClient
        .from('ai_cost_tracking')
        .insert([{
          task_id: taskId,
          service,
          cost,
          processing_time: processingTime,
          created_at: new Date().toISOString()
        }]);

      if (error) {
        logger.warn('记录成本追踪失败:', error);
      }

      logger.info(`AI分析成本: ${service} - ${cost.toFixed(4)} USD`);

      // 检查成本预警
      const costCheck = await this.checkCostControl();
      if (!costCheck.canProceed) {
        this.emit('costAlert', costCheck);
        logger.warn('成本预警:', costCheck.reason);
      }

    } catch (error) {
      logger.error('追踪分析成本失败:', error);
    }
  }

  // 获取成本报告
  async getCostReport(period = 'month') {
    try {
      let startDate;
      const endDate = new Date();

      switch (period) {
      case 'day':
        startDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
        break;
      case 'week':
        startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
        break;
      default:
        throw new Error('不支持的报告周期');
      }

      const { error } = await dbClient
        .from('ai_cost_tracking')
        .select('service, SUM(cost) as total_cost, COUNT(*) as task_count')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .group('service');

      if (error) {
        throw error;
      }

      const serviceCosts = data || [];
      const totalCost = serviceCosts.reduce((sum, item) => sum + parseFloat(item.total_cost), 0);

      return {
        period,
        totalCost,
        serviceCosts,
        budget: {
          daily: this.config.costControl.dailyBudget,
          monthly: this.config.costControl.monthlyBudget
        },
        utilization: {
          daily: await this.calculateCostForPeriod(
            new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()),
            endDate
          ) / this.config.costControl.dailyBudget,
          monthly: totalCost / this.config.costControl.monthlyBudget
        }
      };

    } catch (error) {
      logger.error('获取成本报告失败:', error);
      throw error;
    }
  }

  // 用户反馈功能
  async addUserFeedback(userId, articleId, rating, feedback = '') {
    try {
      const { error } = await dbClient
        .from('user_feedback')
        .insert([{
          user_id: userId,
          article_id: articleId,
          rating,
          feedback,
          created_at: new Date().toISOString()
        }]);

      if (error) {
        throw error;
      }

      // 更新用户偏好
      await this.updateUserPreferencesFromFeedback(userId, articleId, rating);

      logger.info(`记录用户反馈: ${userId} - ${articleId} - ${rating}`);
      return true;

    } catch (error) {
      logger.error('添加用户反馈失败:', error);
      throw error;
    }
  }

  async updateUserPreferencesFromFeedback(userId, articleId, rating) {
    try {
      // 获取文章信息
      const { error } = await dbClient
        .from('news_articles')
        .select('category, title')
        .eq('id', articleId)
        .single();

      if (error) {
        throw error;
      }

      // 更新反馈分数
      if (rating >= 4) {
        this.userPreferences.feedbackScores.set(data.category,
          (this.userPreferences.feedbackScores.get(data.category) || 0) + 1
        );
        this.userPreferences.preferredCategories.add(data.category);
      }

      // 清除推荐缓存
      this.recommendationCache.delete(`recommendations:${userId}`);

    } catch (error) {
      logger.warn('更新用户偏好失败:', error);
    }
  }
}

export default AIAnalysisService;