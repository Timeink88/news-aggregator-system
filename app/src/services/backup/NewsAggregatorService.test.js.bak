import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { NewsAggregatorService } from './NewsAggregatorService.js';
import { EventEmitter } from 'events';

// Mock dependencies
jest.mock('./RSSManagerService.js');
jest.mock('./AIAnalysisService.js');
jest.mock('../database/client.js');
jest.mock('../utils/logger.js');

describe('NewsAggregatorService', () => {
  let newsAggregatorService;
  let mockRSSManager;
  let mockAIService;
  let mockDbClient;
  let mockLogger;

  // Mock data
  const mockRSSSources = [
    {
      id: 'source1',
      name: 'TechCrunch',
      url: 'https://techcrunch.com/feed/',
      category: 'tech',
      is_active: true
    },
    {
      id: 'source2',
      name: 'Reuters',
      url: 'https://reuters.com/feed/',
      category: 'finance',
      is_active: true
    }
  ];

  const mockArticles = [
    {
      title: 'AI Technology Breakthrough',
      content: 'Scientists have made a breakthrough in AI technology that could revolutionize the industry.',
      url: 'https://example.com/ai-breakthrough',
      author: 'John Doe',
      published_at: '2023-12-01T10:00:00Z',
      source_id: 'source1',
      category: 'tech',
      language: 'en'
    },
    {
      title: 'Stock Market Hits Record High',
      content: 'The stock market reached a new record high as investors remain optimistic about economic recovery.',
      url: 'https://example.com/stock-record',
      author: 'Jane Smith',
      published_at: '2023-12-01T11:00:00Z',
      source_id: 'source2',
      category: 'finance',
      language: 'en'
    }
  ];

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock instances
    mockRSSManager = {
      initialize: jest.fn().mockResolvedValue(true),
      getActiveSources: jest.fn().mockResolvedValue(mockRSSSources),
      getSources: jest.fn().mockResolvedValue(mockRSSSources),
      fetchMultipleSources: jest.fn().mockResolvedValue({
        results: [
          {
            success: true,
            articles: mockArticles
          }
        ]
      })
    };

    mockAIService = {
      initialize: jest.fn().mockResolvedValue(true),
      analyzeSentiment: jest.fn().mockResolvedValue({
        sentiment: 'positive',
        confidence: 0.85
      }),
      extractEntities: jest.fn().mockResolvedValue([
        {
          name: 'AI',
          type: 'technology',
          confidence: 0.9
        }
      ])
    };

    mockDbClient = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      group: jest.fn().mockReturnThis(),
      insert: jest.fn().mockResolvedValue({
        data: [{ id: 'article1' }],
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

    // Mock module imports
    jest.doMock('./RSSManagerService.js', () => ({
      default: jest.fn().mockImplementation(() => mockRSSManager)
    }));

    jest.doMock('./AIAnalysisService.js', () => ({
      default: jest.fn().mockImplementation(() => mockAIService)
    }));

    jest.doMock('../database/client.js', () => mockDbClient);
    jest.doMock('../utils/logger.js', () => mockLogger);

    // Create service instance
    newsAggregatorService = new NewsAggregatorService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create instance with default configuration', () => {
      expect(newsAggregatorService).toBeInstanceOf(EventEmitter);
      expect(newsAggregatorService.isRunning).toBe(false);
      expect(newsAggregatorService.config.similarityThreshold).toBe(0.7);
      expect(newsAggregatorService.config.maxConcurrentAggregations).toBe(3);
      expect(newsAggregatorService.stats.articlesProcessed).toBe(0);
    });

    it('should create instance with custom configuration', () => {
      const customConfig = {
        similarityThreshold: 0.8,
        maxConcurrentAggregations: 5,
        batchSize: 100
      };

      const customService = new NewsAggregatorService(customConfig);
      expect(customService.config.similarityThreshold).toBe(0.8);
      expect(customService.config.maxConcurrentAggregations).toBe(5);
      expect(customService.config.batchSize).toBe(100);
    });
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      const result = await newsAggregatorService.initialize();

      expect(result).toBe(true);
      expect(newsAggregatorService.isRunning).toBe(true);
      expect(mockRSSManager.initialize).toHaveBeenCalled();
      expect(mockAIService.initialize).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('News Aggregator Service ËŒ');
    });

    it('should handle initialization errors', async () => {
      mockRSSManager.initialize.mockRejectedValue(new Error('Initialization failed'));

      await expect(newsAggregatorService.initialize()).rejects.toThrow('Initialization failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'News Aggregator Service Ë1%:',
        expect.any(Error)
      );
    });
  });

  describe('smartAggregateNews', () => {
    beforeEach(async () => {
      await newsAggregatorService.initialize();
    });

    it('should aggregate news successfully', async () => {
      const result = await newsAggregatorService.smartAggregateNews();

      expect(result).toBeDefined();
      expect(result.aggregationId).toBeDefined();
      expect(result.totalArticles).toBe(2);
      expect(result.processedArticles).toBeGreaterThan(0);
      expect(result.articles).toBeDefined();
      expect(Array.isArray(result.articles)).toBe(true);

      expect(mockRSSManager.getActiveSources).toHaveBeenCalled();
      expect(mockRSSManager.fetchMultipleSources).toHaveBeenCalled();
    });

    it('should filter by source IDs', async () => {
      const sourceIds = ['source1'];
      await newsAggregatorService.smartAggregateNews({ sourceIds });

      expect(mockRSSManager.getSources).toHaveBeenCalledWith({
        filters: [
          { column: 'id', operator: 'in', value: sourceIds },
          { column: 'is_active', operator: 'eq', value: true }
        ]
      });
    });

    it('should filter by categories', async () => {
      const categories = ['tech'];
      await newsAggregatorService.smartAggregateNews({ categories });

      expect(mockRSSManager.getActiveSources).toHaveBeenCalled();
    });

    it('should limit articles count', async () => {
      const maxArticles = 1;
      const result = await newsAggregatorService.smartAggregateNews({ maxArticles });

      expect(result.processedArticles).toBeLessThanOrEqual(maxArticles);
    });

    it('should use cache when available', async () => {
      const cacheKey = 'test-cache';
      const cachedData = {
        data: { aggregationId: cacheKey, articles: [] },
        timestamp: Date.now()
      };

      newsAggregatorService.aggregationCache.set(cacheKey, cachedData);

      // Mock UUID generation to return predictable value
      const { v4: uuidv4 } = await import('uuid');
      jest.spyOn(uuidv4, 'v4').mockReturnValue(cacheKey);

      const result = await newsAggregatorService.smartAggregateNews();

      expect(result.aggregationId).toBe(cacheKey);
      expect(mockLogger.info).toHaveBeenCalledWith(`(XÓœ - ID: ${cacheKey}`);
    });

    it('should handle aggregation errors', async () => {
      mockRSSManager.fetchMultipleSources.mockRejectedValue(new Error('Fetch failed'));

      await expect(newsAggregatorService.smartAggregateNews()).rejects.toThrow('Fetch failed');
    });
  });

  describe('processArticleSmart', () => {
    beforeEach(async () => {
      await newsAggregatorService.initialize();
    });

    it('should process article successfully', async () => {
      const article = mockArticles[0];
      const result = await newsAggregatorService.processArticleSmart(article);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.quality_score).toBeGreaterThan(0);
      expect(result.processed_at).toBeDefined();
      expect(result.source_type).toBe('rss');
    });

    it('should filter duplicate articles', async () => {
      const article = mockArticles[0];

      // Mock checkDuplicate to return true
      newsAggregatorService.checkDuplicate = jest.fn().mockResolvedValue(true);

      const result = await newsAggregatorService.processArticleSmart(article);

      expect(result).toBeNull();
      expect(newsAggregatorService.stats.duplicatesFiltered).toBe(1);
    });

    it('should filter low quality articles', async () => {
      const article = mockArticles[0];

      // Mock filterQuality to return low score
      newsAggregatorService.filterQuality = jest.fn().mockResolvedValue(0.3);

      const result = await newsAggregatorService.processArticleSmart(article);

      expect(result).toBeNull();
      expect(newsAggregatorService.stats.lowQualityFiltered).toBe(1);
    });

    it('should categorize article', async () => {
      const article = mockArticles[0];

      const result = await newsAggregatorService.processArticleSmart(article);

      expect(result.category).toBeDefined();
      expect(newsAggregatorService.stats.categoriesAssigned).toBe(1);
    });

    it('should perform AI analysis when enabled', async () => {
      const article = mockArticles[0];

      const result = await newsAggregatorService.processArticleSmart(article, { enableAI: true });

      expect(result.summary).toBeDefined();
      expect(result.sentiment).toBeDefined();
      expect(result.entities).toBeDefined();

      expect(mockAIService.analyzeSentiment).toHaveBeenCalled();
      expect(mockAIService.extractEntities).toHaveBeenCalled();
    });

    it('should skip AI analysis when disabled', async () => {
      const article = mockArticles[0];

      const result = await newsAggregatorService.processArticleSmart(article, { enableAI: false });

      expect(result.summary).toBeUndefined();
      expect(result.sentiment).toBeUndefined();
      expect(result.entities).toBeUndefined();

      expect(mockAIService.analyzeSentiment).not.toHaveBeenCalled();
      expect(mockAIService.extractEntities).not.toHaveBeenCalled();
    });

    it('should save article to database', async () => {
      const article = mockArticles[0];

      await newsAggregatorService.processArticleSmart(article);

      expect(mockDbClient.from).toHaveBeenCalledWith('news_articles');
      expect(mockDbClient.insert).toHaveBeenCalled();
    });
  });

  describe('filterQuality', () => {
    it('should calculate quality score correctly', async () => {
      const goodArticle = {
        title: 'Good Article Title',
        content: 'This is a good article with sufficient content length and quality words.',
        url: 'https://example.com/good-article'
      };

      const score = await newsAggregatorService.filterQuality(goodArticle);

      expect(score).toBeGreaterThan(0.5);
    });

    it('should penalize short content', async () => {
      const shortArticle = {
        title: 'Short',
        content: 'Too short',
        url: 'https://example.com/short'
      };

      const score = await newsAggregatorService.filterQuality(shortArticle);

      expect(score).toBeLessThan(0.5);
    });

    it('should penalize spam keywords', async () => {
      const spamArticle = {
        title: 'Click here for amazing deal',
        content: 'Advertisement: Buy now! Sponsored content.',
        url: 'https://example.com/spam'
      };

      const score = await newsAggregatorService.filterQuality(spamArticle);

      expect(score).toBeLessThan(0.7);
    });
  });

  describe('categorizeArticle', () => {
    it('should categorize tech articles correctly', async () => {
      const techArticle = {
        title: 'AI Technology Revolution',
        content: 'New artificial intelligence technology is changing the software and hardware industry.'
      };

      const category = await newsAggregatorService.categorizeArticle(techArticle);

      expect(category).toBe('tech');
    });

    it('should categorize finance articles correctly', async () => {
      const financeArticle = {
        title: 'Stock Market Analysis',
        content: 'Investment in banking and insurance funds shows economic growth.'
      };

      const category = await newsAggregatorService.categorizeArticle(financeArticle);

      expect(category).toBe('finance');
    });

    it('should return null for uncategorized articles', async () => {
      const uncategorizedArticle = {
        title: 'Random Article',
        content: 'This article does not match any specific category.'
      };

      const category = await newsAggregatorService.categorizeArticle(uncategorizedArticle);

      expect(category).toBeNull();
    });
  });

  describe('generateSummary', () => {
    it('should generate summary for long content', async () => {
      const longContent = 'This is the first sentence. This is the second sentence which is longer than the first one. This is the third sentence that is the longest of all three sentences.';
      const article = { content: longContent };

      const summary = await newsAggregatorService.generateSummary(article);

      expect(summary).toBeDefined();
      expect(summary.length).toBeGreaterThan(0);
      expect(summary.length).toBeLessThanOrEqual(longContent.length);
    });

    it('should return short content as is', async () => {
      const shortContent = 'Short content.';
      const article = { content: shortContent };

      const summary = await newsAggregatorService.generateSummary(article);

      expect(summary).toBe(shortContent);
    });
  });

  describe('checkDuplicate', () => {
    it('should detect duplicate articles', async () => {
      const article = mockArticles[0];

      // Mock database to return similar articles
      mockDbClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          ilike: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({
              data: [article],
              error: null
            })
          })
        })
      });

      const isDuplicate = await newsAggregatorService.checkDuplicate(article);

      expect(isDuplicate).toBe(true);
    });

    it('should return false for unique articles', async () => {
      const article = mockArticles[0];

      // Mock database to return no similar articles
      mockDbClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          ilike: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        })
      });

      const isDuplicate = await newsAggregatorService.checkDuplicate(article);

      expect(isDuplicate).toBe(false);
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      await newsAggregatorService.initialize();
    });

    it('should return comprehensive statistics', async () => {
      // Mock database responses
      mockDbClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          group: jest.fn().mockResolvedValue({
            data: [{ category: 'tech', count: 10 }],
            error: null
          })
        })
      });

      mockDbClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          mockReturnValueOnce({
            resolvedValue: {
              data: [{ id: 'group1' }],
              error: null
            }
          })
        })
      });

      const stats = await newsAggregatorService.getStats();

      expect(stats).toBeDefined();
      expect(stats.isRunning).toBe(true);
      expect(stats.config).toBeDefined();
      expect(stats.processingStats).toBeDefined();
      expect(stats.categoryDistribution).toBeDefined();
    });
  });

  describe('Event Emission', () => {
    beforeEach(async () => {
      await newsAggregatorService.initialize();
    });

    it('should emit events for successful operations', async () => {
      const mockListener = jest.fn();
      newsAggregatorService.on('smartAggregationCompleted', mockListener);

      await newsAggregatorService.smartAggregateNews();

      expect(mockListener).toHaveBeenCalledWith(
        expect.objectContaining({
          aggregationId: expect.any(String),
          articles: expect.any(Array)
        })
      );
    });

    it('should emit error events', async () => {
      const mockListener = jest.fn();
      newsAggregatorService.on('error', mockListener);

      mockRSSManager.fetchMultipleSources.mockRejectedValue(new Error('Test error'));

      try {
        await newsAggregatorService.smartAggregateNews();
      } catch (error) {
        // Expected to throw
      }

      expect(mockListener).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration correctly', () => {
      const newConfig = {
        similarityThreshold: 0.9,
        batchSize: 200
      };

      newsAggregatorService.updateConfig(newConfig);

      expect(newsAggregatorService.config.similarityThreshold).toBe(0.9);
      expect(newsAggregatorService.config.batchSize).toBe(200);
    });

    it('should emit config updated event', () => {
      const mockListener = jest.fn();
      newsAggregatorService.on('configUpdated', mockListener);

      const newConfig = { similarityThreshold: 0.9 };
      newsAggregatorService.updateConfig(newConfig);

      expect(mockListener).toHaveBeenCalledWith(
        expect.objectContaining({
          similarityThreshold: 0.9
        })
      );
    });
  });

  describe('Cache Management', () => {
    it('should clear cache correctly', () => {
      newsAggregatorService.aggregationCache.set('test', { data: 'test' });

      expect(newsAggregatorService.aggregationCache.size).toBe(1);

      newsAggregatorService.clearCache();

      expect(newsAggregatorService.aggregationCache.size).toBe(0);
      expect(mockLogger.info).toHaveBeenCalledWith('°ûZXò');
    });
  });
});