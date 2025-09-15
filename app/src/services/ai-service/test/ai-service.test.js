/**
 * AI服务测试用例
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { aiService, ENTITY_TYPES } from '../index.js';
import { validateUUID } from '../../../utils/validators.js';

// Mock依赖
jest.mock('openai');
jest.mock('@supabase/supabase-js');
jest.mock('../../../utils/logger.js');

const mockOpenAI = require('openai');
const mockSupabase = require('@supabase/supabase-js');

describe('AI Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    aiService.clearCache();
    aiService.dailyCost = 0;
  });

  describe('analyzeArticle', () => {
    it('should analyze article successfully', async () => {
      const articleId = 'test-article-id';
      const content = 'This is a test article content for analysis';

      // Mock OpenAI responses
      mockOpenAI.chat.completions.create.mockImplementation(() => ({
        choices: [{ message: { content: JSON.stringify({
          score: 0.8,
          label: 'positive',
          confidence: 0.9
        }) } }]
      }));

      mockSupabase.createClient().from().insert().select().single.mockResolvedValue({
        data: { id: 'analysis-result-id' },
        error: null
      });

      const result = await aiService.analyzeArticle(articleId, content);

      expect(result).toBeDefined();
      expect(result.article_id).toBe(articleId);
      expect(result.sentiment_score).toBeDefined();
      expect(result.sentiment_label).toBeDefined();
      expect(result.entities).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.categories).toBeDefined();
      expect(result.keywords).toBeDefined();
    });

    it('should use cache for subsequent calls', async () => {
      const articleId = 'test-article-id';
      const content = 'Test content';

      // Mock OpenAI responses
      mockOpenAI.chat.completions.create.mockImplementation(() => ({
        choices: [{ message: { content: JSON.stringify({
          score: 0.8,
          label: 'positive',
          confidence: 0.9
        }) } }]
      }));

      mockSupabase.createClient().from().insert().select().single.mockResolvedValue({
        data: { id: 'analysis-result-id' },
        error: null
      });

      // 第一次调用
      const result1 = await aiService.analyzeArticle(articleId, content);
      expect(result1).toBeDefined();

      // 第二次调用应该使用缓存
      const result2 = await aiService.analyzeArticle(articleId, content);
      expect(result2).toBeDefined();

      // OpenAI API应该只调用一次
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(5); // 5个分析任务
    });

    it('should handle cost limit exceeded', async () => {
      aiService.dailyCost = 15; // 超过限制

      await expect(aiService.analyzeArticle('test-id', 'test content'))
        .rejects.toThrow('已达到每日AI费用限制');
    });
  });

  describe('analyzeArticles', () => {
    it('should analyze multiple articles successfully', async () => {
      const articles = [
        { id: 'article-1', content: 'Content 1' },
        { id: 'article-2', content: 'Content 2' }
      ];

      // Mock OpenAI responses
      mockOpenAI.chat.completions.create.mockImplementation(() => ({
        choices: [{ message: { content: JSON.stringify({
          score: 0.8,
          label: 'positive',
          confidence: 0.9
        }) } }]
      }));

      mockSupabase.createClient().from().insert().select().single.mockResolvedValue({
        data: { id: 'analysis-result-id' },
        error: null
      });

      const result = await aiService.analyzeArticles(articles);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
      expect(result.totalCost).toBeGreaterThan(0);
    });

    it('should handle empty articles array', async () => {
      const result = await aiService.analyzeArticles([]);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(result.totalCost).toBe(0);
    });
  });

  describe('analyzeSentiment', () => {
    it('should analyze sentiment successfully', async () => {
      const text = 'This is a very positive and happy text';

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          score: 0.9,
          label: 'positive',
          confidence: 0.95
        }) } }]
      });

      const result = await aiService.analyzeSentiment(text);

      expect(result.score).toBe(0.9);
      expect(result.label).toBe('positive');
      expect(result.confidence).toBe(0.95);
    });

    it('should handle API errors', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API Error'));

      const result = await aiService.analyzeSentiment('test text');

      expect(result.score).toBe(0);
      expect(result.label).toBe('neutral');
      expect(result.confidence).toBe(0);
    });

    it('should normalize score to [-1, 1] range', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          score: 2.5, // 超出范围
          label: 'positive',
          confidence: 0.95
        }) } }]
      });

      const result = await aiService.analyzeSentiment('test text');

      expect(result.score).toBe(1); // 应该被标准化为1
    });
  });

  describe('extractEntities', () => {
    it('should extract entities successfully', async () => {
      const text = 'Apple Inc. CEO Tim Cook announced the iPhone 15 in California on September 12, 2023.';

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          entities: [
            { text: 'Apple Inc.', type: 'COMPANY', start_pos: 0, end_pos: 10, confidence: 0.95 },
            { text: 'Tim Cook', type: 'PERSON', start_pos: 16, end_pos: 24, confidence: 0.9 },
            { text: 'iPhone 15', type: 'PRODUCT', start_pos: 35, end_pos: 43, confidence: 0.9 },
            { text: 'California', type: 'LOCATION', start_pos: 48, end_pos: 58, confidence: 0.8 },
            { text: 'September 12, 2023', type: 'DATE', start_pos: 62, end_pos: 80, confidence: 0.95 }
          ]
        }) } }]
      });

      const result = await aiService.extractEntities(text);

      expect(result).toHaveLength(5);
      expect(result[0].text).toBe('Apple Inc.');
      expect(result[0].type).toBe('COMPANY');
      expect(result[0].id).toBeDefined();
    });

    it('should handle empty text', async () => {
      const result = await aiService.extractEntities('');

      expect(result).toEqual([]);
    });

    it('should handle API errors', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API Error'));

      const result = await aiService.extractEntities('test text');

      expect(result).toEqual([]);
    });
  });

  describe('generateSummary', () => {
    it('should generate summary successfully', async () => {
      const text = 'This is a long article text that needs to be summarized. It contains multiple sentences and important information that should be captured in a concise summary.';

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'This is a concise summary of the article.' } }]
      });

      const result = await aiService.generateSummary(text);

      expect(result.text).toBe('This is a concise summary of the article.');
      expect(result.wordCount).toBeGreaterThan(0);
    });

    it('should handle API errors', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API Error'));

      const result = await aiService.generateSummary('test text');

      expect(result.text).toBe('');
      expect(result.wordCount).toBe(0);
    });
  });

  describe('classifyCategories', () => {
    it('should classify categories successfully', async () => {
      const text = 'This article discusses the latest technology trends and innovations in artificial intelligence.';

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          primary_category: 'technology',
          secondary_categories: ['science'],
          confidence: 0.9
        }) } }]
      });

      const result = await aiService.classifyCategories(text);

      expect(result.primary).toBe('technology');
      expect(result.secondary).toEqual(['science']);
      expect(result.confidence).toBe(0.9);
    });

    it('should handle API errors', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API Error'));

      const result = await aiService.classifyCategories('test text');

      expect(result.primary).toBe('other');
      expect(result.secondary).toEqual([]);
      expect(result.confidence).toBe(0);
    });

    it('should normalize confidence to [0, 1] range', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          primary_category: 'technology',
          secondary_categories: [],
          confidence: 1.5 // 超出范围
        }) } }]
      });

      const result = await aiService.classifyCategories('test text');

      expect(result.confidence).toBe(1); // 应该被标准化为1
    });
  });

  describe('extractKeywords', () => {
    it('should extract keywords successfully', async () => {
      const text = 'Artificial intelligence and machine learning are transforming the technology industry.';

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          keywords: ['artificial intelligence', 'machine learning', 'technology', 'transformation']
        }) } }]
      });

      const result = await aiService.extractKeywords(text);

      expect(result).toEqual(['artificial intelligence', 'machine learning', 'technology', 'transformation']);
    });

    it('should handle API errors', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API Error'));

      const result = await aiService.extractKeywords('test text');

      expect(result).toEqual([]);
    });
  });

  describe('generateEmbedding', () => {
    it('should generate embedding successfully', async () => {
      const text = 'Test text for embedding generation';

      mockOpenAI.embeddings.create.mockResolvedValue({
        data: [{ embedding: [0.1, 0.2, 0.3, 0.4] }]
      });

      const result = await aiService.generateEmbedding(text);

      expect(result).toEqual([0.1, 0.2, 0.3, 0.4]);
    });

    it('should handle API errors', async () => {
      mockOpenAI.embeddings.create.mockRejectedValue(new Error('API Error'));

      await expect(aiService.generateEmbedding('test text'))
        .rejects.toThrow('API Error');
    });
  });

  describe('saveAnalysisResult', () => {
    it('should save analysis result successfully', async () => {
      const analysis = {
        id: 'analysis-id',
        article_id: 'article-id',
        sentiment_score: 0.8,
        sentiment_label: 'positive'
      };

      mockSupabase.createClient().from().insert().select().single.mockResolvedValue({
        data: analysis,
        error: null
      });

      const result = await aiService.saveAnalysisResult(analysis);

      expect(result).toEqual(analysis);
    });

    it('should handle database errors', async () => {
      const analysis = {
        id: 'analysis-id',
        article_id: 'article-id',
        sentiment_score: 0.8,
        sentiment_label: 'positive'
      };

      mockSupabase.createClient().from().insert().select().single.mockResolvedValue({
        data: null,
        error: { message: 'Database error' }
      });

      await expect(aiService.saveAnalysisResult(analysis))
        .rejects.toThrow('Database error');
    });
  });

  describe('getAnalysisResult', () => {
    it('should get analysis result successfully', async () => {
      const articleId = 'article-id';
      const mockAnalysis = {
        id: 'analysis-id',
        article_id: articleId,
        sentiment_score: 0.8,
        sentiment_label: 'positive'
      };

      mockSupabase.createClient().from().select().single.mockResolvedValue({
        data: mockAnalysis,
        error: null
      });

      const result = await aiService.getAnalysisResult(articleId);

      expect(result).toEqual(mockAnalysis);
    });

    it('should handle not found analysis', async () => {
      mockSupabase.createClient().from().select().single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' }
      });

      const result = await aiService.getAnalysisResult('nonexistent-id');

      expect(result).toBeNull();
    });
  });

  describe('findSimilarArticles', () => {
    it('should find similar articles successfully', async () => {
      const articleId = 'article-id';
      const embedding = [0.1, 0.2, 0.3];
      const mockSimilarArticles = [
        { id: 'similar-1', similarity: 0.9 },
        { id: 'similar-2', similarity: 0.8 }
      ];

      mockSupabase.createClient().rpc.mockResolvedValue({
        data: mockSimilarArticles,
        error: null
      });

      const result = await aiService.findSimilarArticles(articleId, embedding, 5);

      expect(result).toEqual(mockSimilarArticles);
    });

    it('should handle database errors', async () => {
      mockSupabase.createClient().rpc.mockResolvedValue({
        data: null,
        error: { message: 'Database error' }
      });

      const result = await aiService.findSimilarArticles('article-id', [0.1, 0.2], 5);

      expect(result).toEqual([]);
    });
  });

  describe('estimateAnalysisCost', () => {
    it('should estimate cost correctly', async () => {
      const text = 'a'.repeat(400); // 100 tokens

      const cost = aiService.estimateAnalysisCost(text);

      expect(cost).toBe(0.01); // 100 * 0.0001
    });

    it('should handle empty text', async () => {
      const cost = aiService.estimateAnalysisCost('');

      expect(cost).toBe(0);
    });
  });

  describe('getStatistics', () => {
    it('should get statistics successfully', async () => {
      aiService.dailyCost = 5.5;

      mockSupabase.createClient().from().select.mockReturnValue({
        count: jest.fn().mockReturnValue({
          head: jest.fn().mockReturnValue({
            gte: jest.fn().mockResolvedValue({ count: 100 })
          })
        })
      });

      mockSupabase.createClient().rpc.mockResolvedValue({
        data: [],
        error: null
      });

      const result = await aiService.getStatistics();

      expect(result.totalAnalyses).toBe(100);
      expect(result.todayAnalyses).toBe(100);
      expect(result.dailyCost).toBe(5.5);
      expect(result.dailyLimit).toBe(10);
      expect(result.costUtilization).toBe(55);
    });
  });

  describe('resetDailyCost', () => {
    it('should reset daily cost', () => {
      aiService.dailyCost = 5.5;

      aiService.resetDailyCost();

      expect(aiService.dailyCost).toBe(0);
      expect(aiService.lastCostReset).toBeGreaterThan(Date.now() - 1000);
    });
  });

  describe('clearCache', () => {
    it('should clear cache', () => {
      aiService.analysisCache.set('test-id', { data: 'test', timestamp: Date.now() });

      expect(aiService.analysisCache.size).toBe(1);

      aiService.clearCache();

      expect(aiService.analysisCache.size).toBe(0);
    });
  });

  describe('checkCostLimit', () => {
    it('should check cost limit correctly', () => {
      aiService.dailyCost = 5;

      const result = aiService.checkCostLimit();

      expect(result.withinLimit).toBe(true);
      expect(result.currentCost).toBe(5);
      expect(result.limit).toBe(10);
      expect(result.remaining).toBe(5);
    });

    it('should detect cost limit exceeded', () => {
      aiService.dailyCost = 15;

      const result = aiService.checkCostLimit();

      expect(result.withinLimit).toBe(false);
      expect(result.currentCost).toBe(15);
      expect(result.limit).toBe(10);
      expect(result.remaining).toBe(-5);
    });
  });

  describe('Circuit Breaker', () => {
    it('should handle circuit breaker open state', async () => {
      // 强制开启断路器
      aiService.circuitBreaker.forceOpen();

      await expect(aiService.analyzeSentiment('test text'))
        .rejects.toThrow('Circuit breaker is OPEN');
    });

    it('should recover from circuit breaker', async () => {
      // 强制开启断路器
      aiService.circuitBreaker.forceOpen();

      // 设置下一次尝试时间为过去
      aiService.circuitBreaker.nextAttemptTime = Date.now() - 1000;

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          score: 0.8,
          label: 'positive',
          confidence: 0.9
        }) } }]
      });

      const result = await aiService.analyzeSentiment('test text');

      expect(result.score).toBe(0.8);
      expect(aiService.circuitBreaker.state).toBe('CLOSED');
    });
  });
});