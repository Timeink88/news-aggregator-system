import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AIAnalysisService } from './AIAnalysisService.js';
import { EventEmitter } from 'events';

// Mock dependencies
jest.mock('../database/client.js');
jest.mock('../utils/logger.js');
jest.mock('uuid');

// Mock fetch
global.fetch = jest.fn();

describe('AIAnalysisService', () => {
  let aiAnalysisService;
  let mockDbClient;
  let mockLogger;
  let mockUUID;

  // Mock data
  const mockArticle = {
    id: 'article1',
    title: 'AI Technology Breakthrough',
    content: 'Scientists have made a breakthrough in AI technology that could revolutionize the industry.',
    url: 'https://example.com/ai-breakthrough',
    author: 'John Doe',
    published_at: '2023-12-01T10:00:00Z',
    category: 'tech'
  };

  const mockAnalysisTask = {
    id: 'task1',
    article_id: 'article1',
    task_type: 'sentiment',
    ai_service: 'openai',
    prompt: 'Analyze sentiment',
    status: 'pending',
    retry_count: 0,
    created_at: '2023-12-01T10:00:00Z',
    updated_at: '2023-12-01T10:00:00Z'
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock instances
    mockDbClient = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      group: jest.fn().mockReturnThis(),
      insert: jest.fn().mockResolvedValue({
        data: [mockAnalysisTask],
        error: null
      }),
      update: jest.fn().mockResolvedValue({
        data: null,
        error: null
      }),
      single: jest.fn().mockResolvedValue({
        data: { config_value: '{}' },
        error: null
      })
    };

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    mockUUID = {
      v4: jest.fn().mockReturnValue('test-uuid')
    };

    // Mock modules
    jest.doMock('../database/client.js', () => mockDbClient);
    jest.doMock('../utils/logger.js', () => mockLogger);
    jest.doMock('uuid', () => ({ v4: mockUUID.v4 }));

    // Create service instance
    aiAnalysisService = new AIAnalysisService({
      openai: {
        enabled: true,
        apiKey: 'test-openai-key',
        model: 'gpt-3.5-turbo',
        costPerToken: 0.002
      },
      deepseek: {
        enabled: true,
        apiKey: 'test-deepseek-key',
        baseUrl: 'https://api.deepseek.com',
        model: 'DeepSeek-V3.1',
        costPerToken: 0.001
      },
      costControl: {
        enabled: true,
        dailyBudget: 10.0,
        monthlyBudget: 200.0,
        alertThreshold: 0.8
      },
      recommendations: {
        enabled: true,
        maxRecommendations: 10
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create instance with default configuration', () => {
      expect(aiAnalysisService).toBeInstanceOf(EventEmitter);
      expect(aiAnalysisService.isRunning).toBe(false);
      expect(aiAnalysisService.maxConcurrentTasks).toBe(3);
      expect(aiAnalysisService.config.costControl.enabled).toBe(true);
      expect(aiAnalysisService.config.recommendations.enabled).toBe(true);
    });

    it('should create instance with custom configuration', () => {
      const customConfig = {
        maxConcurrentTasks: 5,
        costControl: {
          dailyBudget: 20.0,
          monthlyBudget: 400.0
        }
      };

      const customService = new AIAnalysisService(customConfig);
      expect(customService.maxConcurrentTasks).toBe(5);
      expect(customService.config.costControl.dailyBudget).toBe(20.0);
    });
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      // Mock service validation
      fetch.mockResolvedValueOnce({ ok: true });
      fetch.mockResolvedValueOnce({ ok: true });

      const result = await aiAnalysisService.initialize();

      expect(result).toBe(true);
      expect(aiAnalysisService.isRunning).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('AI Analysis Service 初始化完成');
    });

    it('should handle initialization errors', () => {
      fetch.mockRejectedValue(new Error('Service validation failed'));

      expect(aiAnalysisService.initialize()).rejects.toThrow('Service validation failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'AI Analysis Service 初始化失败:',
        expect.any(Error)
      );
    });
  });

  describe('loadConfig', () => {
    it('should load configuration from database', async () => {
      const dbConfig = {
        openai: {
          model: 'gpt-4',
          maxTokens: 2000
        }
      };

      mockDbClient.single.mockResolvedValueOnce({
        data: { config_value: JSON.stringify(dbConfig) },
        error: null
      });

      await aiAnalysisService.loadConfig();

      expect(aiAnalysisService.config.openai.model).toBe('gpt-4');
      expect(aiAnalysisService.config.openai.maxTokens).toBe(2000);
      expect(mockLogger.info).toHaveBeenCalledWith('已加载AI分析配置');
    });

    it('should handle database errors', async () => {
      mockDbClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' }
      });

      await aiAnalysisService.loadConfig();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        '加载AI分析配置失败，使用默认配置:',
        expect.any(Object)
      );
    });
  });

  describe('analyzeArticle', () => {
    beforeEach(async () => {
      // Initialize service
      fetch.mockResolvedValue({ ok: true });
      await aiAnalysisService.initialize();

      // Mock article retrieval
      mockDbClient.single.mockResolvedValueOnce({
        data: mockArticle,
        error: null
      });

      // Mock task creation
      mockDbClient.insert.mockResolvedValueOnce({
        data: [mockAnalysisTask],
        error: null
      });

      // Mock analysis execution
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: '{"sentiment": "positive", "confidence": 0.9}' } }]
        })
      });

      // Mock task status update
      mockDbClient.update.mockResolvedValue({
        data: null,
        error: null
      });
    });

    it('should analyze article successfully', async () => {
      const analysisTypes = ['sentiment'];
      const result = await aiAnalysisService.analyzeArticle('article1', analysisTypes);

      expect(result.success).toBe(true);
      expect(result.articleId).toBe('article1');
      expect(result.results.sentiment).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith('开始分析文章: article1');
    });

    it('should handle article not found', async () => {
      mockDbClient.single.mockResolvedValueOnce({
        data: null,
        error: null
      });

      await expect(aiAnalysisService.analyzeArticle('nonexistent', ['sentiment']))
        .rejects.toThrow('文章不存在: nonexistent');
    });

    it('should handle disabled analysis type', async () => {
      // Disable sentiment analysis
      aiAnalysisService.config.analysis.sentiment.enabled = false;

      const result = await aiAnalysisService.analyzeArticle('article1', ['sentiment']);

      expect(result.success).toBe(true);
      expect(result.results.sentiment).toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalledWith('分析类型 sentiment 未启用');
    });

    it('should handle analysis errors', async () => {
      fetch.mockRejectedValueOnce(new Error('Analysis failed'));

      const result = await aiAnalysisService.analyzeArticle('article1', ['sentiment']);

      expect(result.success).toBe(true);
      expect(result.results.sentiment.success).toBe(false);
      expect(result.results.sentiment.error).toBe('Analysis failed');
    });
  });

  describe('parseAnalysisResult', () => {
    it('should parse sentiment analysis result', () => {
      const rawResponse = '{"sentiment": "positive", "confidence": 0.9, "reason": "Good news"}';
      const result = aiAnalysisService.parseAnalysisResult(rawResponse, 'sentiment');

      expect(result.sentiment).toBe('positive');
      expect(result.confidence).toBe(0.9);
      expect(result.reason).toBe('Good news');
    });

    it('should parse entities result', () => {
      const rawResponse = '{"entities": [{"name": "OpenAI", "type": "company", "confidence": 0.9}]}';
      const result = aiAnalysisService.parseAnalysisResult(rawResponse, 'entities');

      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe('OpenAI');
      expect(result.count).toBe(1);
    });

    it('should handle invalid JSON', () => {
      const rawResponse = 'Invalid JSON response';
      const result = aiAnalysisService.parseAnalysisResult(rawResponse, 'sentiment');

      expect(result.sentiment).toBe('neutral');
      expect(result.confidence).toBe(0.7);
    });

    it('should handle stock entities', () => {
      const rawResponse = '{"stocks": [{"symbol": "AAPL", "company": "Apple Inc.", "change": "+2.5%", "action": "buy", "confidence": 0.9}]}';
      const result = aiAnalysisService.parseAnalysisResult(rawResponse, 'stockEntities');

      expect(result.stocks).toHaveLength(1);
      expect(result.stocks[0].symbol).toBe('AAPL');
      expect(result.count).toBe(1);
    });
  });

  describe('buildPrompt', () => {
    it('should build sentiment analysis prompt', () => {
      const text = 'This is good news';
      const prompt = aiAnalysisService.buildPrompt('sentiment', text);

      expect(prompt).toContain('请分析以下文本的情感倾向');
      expect(prompt).toContain(text);
      expect(prompt).toContain('JSON格式返回');
    });

    it('should build entity extraction prompt', () => {
      const text = 'Apple announced new iPhone';
      const prompt = aiAnalysisService.buildPrompt('entities', text);

      expect(prompt).toContain('提取所有实体');
      expect(prompt).toContain(text);
      expect(prompt).toContain('JSON格式');
    });

    it('should build stock entity prompt', () => {
      const text = 'Apple stock price increased';
      const prompt = aiAnalysisService.buildPrompt('stockEntities', text);

      expect(prompt).toContain('提取股票相关实体');
      expect(prompt).toContain('股票代码');
      expect(prompt).toContain('操作建议');
    });

    it('should throw error for unknown analysis type', () => {
      expect(() => aiAnalysisService.buildPrompt('unknown', 'text'))
        .toThrow('未知的分析类型: unknown');
    });
  });

  describe('analyzeWithOpenAI', () => {
    it('should analyze with OpenAI successfully', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Positive sentiment' } }]
        })
      });

      const result = await aiAnalysisService.analyzeWithOpenAI('Analyze this text', 'sentiment');

      expect(result).toBe('Positive sentiment');
      expect(fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-openai-key'
          })
        })
      );
    });

    it('should handle OpenAI API errors', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({
          error: { message: 'Invalid API key' }
        })
      });

      await expect(aiAnalysisService.analyzeWithOpenAI('text', 'sentiment'))
        .rejects.toThrow('Invalid API key');
    });
  });

  describe('analyzeWithDeepSeek', () => {
    it('should analyze with DeepSeek successfully', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Positive sentiment' } }]
        })
      });

      const result = await aiAnalysisService.analyzeWithDeepSeek('Analyze this text', 'sentiment');

      expect(result).toBe('Positive sentiment');
      expect(fetch).toHaveBeenCalledWith(
        'https://api.deepseek.com/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-deepseek-key'
          })
        })
      );
    });
  });

  describe('batchAnalyze', () => {
    beforeEach(async () => {
      // Initialize service
      fetch.mockResolvedValue({ ok: true });
      await aiAnalysisService.initialize();

      // Mock article retrieval and analysis
      mockDbClient.single.mockResolvedValue({
        data: mockArticle,
        error: null
      });

      mockDbClient.insert.mockResolvedValue({
        data: [mockAnalysisTask],
        error: null
      });

      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: '{"sentiment": "positive", "confidence": 0.9}' } }]
        })
      });

      mockDbClient.update.mockResolvedValue({
        data: null,
        error: null
      });
    });

    it('should analyze articles in batches', async () => {
      const articleIds = ['article1', 'article2', 'article3'];
      const result = await aiAnalysisService.batchAnalyze(articleIds, ['sentiment'], { batchSize: 2 });

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(3);
      expect(result.totalCount).toBe(3);
      expect(result.successCount).toBe(3);
    });

    it('should handle batch analysis errors', async () => {
      // Make one analysis fail
      fetch.mockRejectedValueOnce(new Error('Analysis failed'));

      const articleIds = ['article1', 'article2'];
      const result = await aiAnalysisService.batchAnalyze(articleIds, ['sentiment']);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.successCount).toBe(1); // One failed
    });
  });

  describe('getPersonalizedRecommendations', () => {
    beforeEach(async () => {
      // Initialize service
      fetch.mockResolvedValue({ ok: true });
      await aiAnalysisService.initialize();

      // Mock user preferences
      mockDbClient.single.mockResolvedValueOnce({
        data: {
          user_id: 'user1',
          preferred_categories: ['tech', 'finance'],
          preferred_topics: ['AI', 'stocks'],
          reading_history: [],
          feedback_scores: {}
        },
        error: null
      });

      // Mock articles
      mockDbClient.limit.mockResolvedValue({
        data: [
          { ...mockArticle, id: 'article1', category: 'tech' },
          { ...mockArticle, id: 'article2', category: 'finance' }
        ],
        error: null
      });
    });

    it('should generate personalized recommendations', async () => {
      const recommendations = await aiAnalysisService.getPersonalizedRecommendations('user1');

      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.length).toBeLessThanOrEqual(10);
      expect(mockLogger.info).toHaveBeenCalledWith('生成个性化推荐: user1');
    });

    it('should use cached recommendations', async () => {
      // Add to cache
      const cachedRecommendations = [{ id: 'cached1', recommendationScore: 0.9 }];
      aiAnalysisService.recommendationCache.set('recommendations:user1', {
        recommendations: cachedRecommendations,
        timestamp: Date.now()
      });

      const recommendations = await aiAnalysisService.getPersonalizedRecommendations('user1');

      expect(recommendations).toBe(cachedRecommendations);
      expect(mockLogger.info).toHaveBeenCalledWith('使用缓存推荐: user1');
    });

    it('should throw error when recommendations disabled', async () => {
      aiAnalysisService.config.recommendations.enabled = false;

      await expect(aiAnalysisService.getPersonalizedRecommendations('user1'))
        .rejects.toThrow('推荐功能未启用');
    });
  });

  describe('calculateRecommendationScore', () => {
    beforeEach(() => {
      aiAnalysisService.userPreferences = {
        preferredCategories: new Set(['tech']),
        readingHistory: [
          { category: 'tech', title: 'Previous tech article' }
        ],
        feedbackScores: new Map()
      };
    });

    it('should calculate high score for preferred category', () => {
      const article = { category: 'tech', published_at: new Date().toISOString() };
      const score = aiAnalysisService.calculateRecommendationScore(article);

      expect(score).toBeGreaterThan(0.7); // Base + category preference + freshness
    });

    it('should calculate lower score for non-preferred category', () => {
      const article = { category: 'sports', published_at: new Date().toISOString() };
      const score = aiAnalysisService.calculateRecommendationScore(article);

      expect(score).toBeLessThan(0.7); // Base + freshness only
    });

    it('should consider article freshness', () => {
      const oldArticle = {
        category: 'tech',
        published_at: '2020-01-01T00:00:00Z'
      };
      const score = aiAnalysisService.calculateRecommendationScore(oldArticle);

      expect(score).toBeLessThan(0.8); // No freshness bonus
    });
  });

  describe('checkCostControl', () => {
    beforeEach(async () => {
      // Initialize service
      fetch.mockResolvedValue({ ok: true });
      await aiAnalysisService.initialize();
    });

    it('should allow proceeding when under budget', async () => {
      // Mock low cost
      mockDbClient.group.mockResolvedValue({
        data: [],
        error: null
      });

      const result = await aiAnalysisService.checkCostControl();

      expect(result.canProceed).toBe(true);
      expect(result.todayCost).toBe(0);
      expect(result.monthCost).toBe(0);
    });

    it('should block when approaching daily budget', async () => {
      // Mock high cost (80% of daily budget)
      const highCostTasks = [
        { ai_service: 'openai', processing_time: 4000000 } // Simulated high cost
      ];

      mockDbClient.group.mockResolvedValue({
        data: highCostTasks,
        error: null
      });

      const result = await aiAnalysisService.checkCostControl();

      expect(result.canProceed).toBe(false);
      expect(result.period).toBe('daily');
      expect(result.reason).toContain('今日成本已达到预警阈值');
    });

    it('should return early when cost control disabled', async () => {
      aiAnalysisService.config.costControl.enabled = false;

      const result = await aiAnalysisService.checkCostControl();

      expect(result.canProceed).toBe(true);
      expect(result.reason).toBe('成本控制未启用');
    });
  });

  describe('selectOptimalModel', () => {
    beforeEach(() => {
      aiAnalysisService.config.modelSelection.enabled = true;
    });

    it('should select cost effective model for simple text', async () => {
      const model = await aiAnalysisService.selectOptimalModel('sentiment', 300);

      expect(model).toBe('deepseek'); // Cheapest for simple text
    });

    it('should select quality model for complex analysis', async () => {
      aiAnalysisService.config.modelSelection.strategy = 'quality_first';
      const model = await aiAnalysisService.selectOptimalModel('stockEntities', 1000);

      expect(model).toBe('anthropic'); // Highest quality
    });

    it('should use default service when model selection disabled', async () => {
      aiAnalysisService.config.modelSelection.enabled = false;

      const model = await aiAnalysisService.selectOptimalModel('sentiment', 500);

      expect(model).toBe('openai'); // Default service
    });
  });

  describe('calculateServiceCost', () => {
    it('should calculate cost for OpenAI', () => {
      const cost = aiAnalysisService.calculateServiceCost('openai', 5000); // 5 seconds

      expect(cost).toBeGreaterThan(0);
      // 5 seconds * 1000 tokens/second * $0.002 per 1K tokens
      expect(cost).toBeCloseTo(0.01, 2);
    });

    it('should return 0 for unknown service', () => {
      const cost = aiAnalysisService.calculateServiceCost('unknown', 5000);

      expect(cost).toBe(0);
    });

    it('should return 0 when no cost configuration', () => {
      aiAnalysisService.config.openai.costPerToken = undefined;

      const cost = aiAnalysisService.calculateServiceCost('openai', 5000);

      expect(cost).toBe(0);
    });
  });

  describe('trackAnalysisCost', () => {
    beforeEach(async () => {
      // Initialize service
      fetch.mockResolvedValue({ ok: true });
      await aiAnalysisService.initialize();

      // Mock cost tracking insert
      mockDbClient.insert.mockResolvedValue({
        data: null,
        error: null
      });
    });

    it('should track analysis cost', async () => {
      await aiAnalysisService.trackAnalysisCost('task1', 'openai', 5000);

      expect(aiAnalysisService.costStats.totalCost).toBeGreaterThan(0);
      expect(aiAnalysisService.costStats.serviceCosts.openai).toBeGreaterThan(0);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('AI分析成本: openai')
      );
    });

    it('should handle cost tracking errors', async () => {
      mockDbClient.insert.mockResolvedValue({
        data: null,
        error: { message: 'Database error' }
      });

      await aiAnalysisService.trackAnalysisCost('task1', 'openai', 5000);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        '记录成本追踪失败:',
        expect.any(Object)
      );
    });
  });

  describe('getCostReport', () => {
    beforeEach(async () => {
      // Initialize service
      fetch.mockResolvedValue({ ok: true });
      await aiAnalysisService.initialize();

      // Mock cost data
      mockDbClient.group.mockResolvedValue({
        data: [
          { service: 'openai', total_cost: '5.50', task_count: '10' },
          { service: 'deepseek', total_cost: '2.00', task_count: '5' }
        ],
        error: null
      });
    });

    it('should generate monthly cost report', async () => {
      const report = await aiAnalysisService.getCostReport('month');

      expect(report.period).toBe('month');
      expect(report.totalCost).toBe(7.50);
      expect(report.serviceCosts).toHaveLength(2);
      expect(report.budget.monthly).toBe(200.0);
      expect(report.utilization.monthly).toBeCloseTo(0.0375, 4); // 7.50 / 200.0
    });

    it('should handle invalid period', async () => {
      await expect(aiAnalysisService.getCostReport('invalid'))
        .rejects.toThrow('不支持的报告周期');
    });
  });

  describe('addUserFeedback', () => {
    beforeEach(async () => {
      // Initialize service
      fetch.mockResolvedValue({ ok: true });
      await aiAnalysisService.initialize();

      // Mock feedback insert
      mockDbClient.insert.mockResolvedValue({
        data: null,
        error: null
      });

      // Mock article retrieval for preference update
      mockDbClient.single.mockResolvedValue({
        data: { category: 'tech', title: 'Test article' },
        error: null
      });
    });

    it('should add user feedback successfully', async () => {
      const result = await aiAnalysisService.addUserFeedback('user1', 'article1', 5, 'Great article');

      expect(result).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        '记录用户反馈: user1 - article1 - 5'
      );
    });

    it('should update user preferences for positive feedback', async () => {
      await aiAnalysisService.addUserFeedback('user1', 'article1', 5);

      expect(aiAnalysisService.userPreferences.preferredCategories.has('tech')).toBe(true);
      expect(aiAnalysisService.userPreferences.feedbackScores.get('tech')).toBe(1);
    });

    it('should clear recommendation cache after feedback', async () => {
      // Add cache entry
      aiAnalysisService.recommendationCache.set('recommendations:user1', {
        recommendations: [],
        timestamp: Date.now()
      });

      await aiAnalysisService.addUserFeedback('user1', 'article1', 5);

      expect(aiAnalysisService.recommendationCache.has('recommendations:user1')).toBe(false);
    });
  });

  describe('Event Emission', () => {
    beforeEach(async () => {
      // Initialize service
      fetch.mockResolvedValue({ ok: true });
      await aiAnalysisService.initialize();

      // Mock successful analysis
      mockDbClient.single.mockResolvedValue({
        data: mockArticle,
        error: null
      });

      mockDbClient.insert.mockResolvedValue({
        data: [mockAnalysisTask],
        error: null
      });

      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: '{"sentiment": "positive", "confidence": 0.9}' } }]
        })
      });

      mockDbClient.update.mockResolvedValue({
        data: null,
        error: null
      });
    });

    it('should emit analysisCompleted event', async () => {
      const mockListener = jest.fn();
      aiAnalysisService.on('analysisCompleted', mockListener);

      await aiAnalysisService.analyzeArticle('article1', ['sentiment']);

      expect(mockListener).toHaveBeenCalledWith(
        expect.objectContaining({
          articleId: 'article1',
          analysisType: 'sentiment',
          result: expect.objectContaining({
            success: true
          })
        })
      );
    });

    it('should emit error event', async () => {
      const mockListener = jest.fn();
      aiAnalysisService.on('error', mockListener);

      fetch.mockRejectedValueOnce(new Error('Analysis failed'));

      await aiAnalysisService.analyzeArticle('article1', ['sentiment']);

      expect(mockListener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'analysis',
          articleId: 'article1',
          analysisType: 'sentiment',
          error: 'Analysis failed'
        })
      );
    });

    it('should emit costAlert event', async () => {
      const mockListener = jest.fn();
      aiAnalysisService.on('costAlert', mockListener);

      // Mock high cost situation
      mockDbClient.group.mockResolvedValue({
        data: [{ ai_service: 'openai', processing_time: 4000000 }],
        error: null
      });

      await aiAnalysisService.checkCostControl();

      expect(mockListener).toHaveBeenCalledWith(
        expect.objectContaining({
          canProceed: false,
          period: 'daily'
        })
      );
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      // Initialize service
      fetch.mockResolvedValue({ ok: true });
      await aiAnalysisService.initialize();

      // Mock database statistics
      mockDbClient.group.mockResolvedValue({
        data: [
          { status: 'completed', count: '10' },
          { status: 'pending', count: '2' }
        ],
        error: null
      });
    });

    it('should return comprehensive statistics', async () => {
      const stats = await aiAnalysisService.getStats();

      expect(stats.activeTasks).toBe(0);
      expect(stats.maxConcurrentTasks).toBe(3);
      expect(stats.taskStats).toBeDefined();
      expect(stats.config).toBeDefined();
      expect(stats.isRunning).toBe(true);
    });
  });
});