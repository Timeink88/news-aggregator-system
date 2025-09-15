/**
 * News服务测试用例
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { newsService } from '../index.js';
import { validateArticle, validateUUID } from '../../../utils/validators.js';

// Mock依赖
jest.mock('@supabase/supabase-js');
jest.mock('../../../utils/logger.js');

const mockSupabase = require('@supabase/supabase-js');

describe('News Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    newsService.clearCache();
  });

  describe('saveArticle', () => {
    it('should save article successfully', async () => {
      const article = {
        id: 'test-article-id',
        title: 'Test Article',
        content: 'This is a test article content',
        url: 'https://example.com/article',
        source_id: 'test-source-id'
      };

      mockSupabase.createClient().from().upsert().select().single.mockResolvedValue({
        data: { ...article, id: 'saved-article-id' },
        error: null
      });

      mockSupabase.createClient().from().select().single.mockResolvedValue({
        data: null,
        error: null
      });

      const result = await newsService.saveArticle(article);

      expect(result.success).toBe(true);
      expect(result.articleId).toBeDefined();
      expect(result.duplicate).toBe(false);
    });

    it('should handle duplicate article', async () => {
      const article = {
        id: 'test-article-id',
        title: 'Test Article',
        content: 'This is a test article content',
        url: 'https://example.com/article',
        source_id: 'test-source-id'
      };

      // 模拟找到重复文章
      mockSupabase.createClient().from().select().single.mockResolvedValue({
        data: { id: 'existing-article-id' },
        error: null
      });

      const result = await newsService.saveArticle(article);

      expect(result.success).toBe(true);
      expect(result.duplicate).toBe(true);
    });

    it('should handle invalid article', async () => {
      const invalidArticle = {
        title: 'Test Article'
        // 缺少必要字段
      };

      const result = await newsService.saveArticle(invalidArticle);

      expect(result.success).toBe(false);
      expect(result.error).toContain('文章数据格式无效');
    });
  });

  describe('saveArticles', () => {
    it('should save multiple articles successfully', async () => {
      const articles = [
        {
          id: 'article-1',
          title: 'Article 1',
          content: 'Content 1',
          url: 'https://example.com/1',
          source_id: 'source-1'
        },
        {
          id: 'article-2',
          title: 'Article 2',
          content: 'Content 2',
          url: 'https://example.com/2',
          source_id: 'source-1'
        }
      ];

      mockSupabase.createClient().from().upsert().select().mockResolvedValue({
        data: articles.map(a => ({ ...a, id: `saved-${a.id}` })),
        error: null
      });

      mockSupabase.createClient().from().select().single.mockResolvedValue({
        data: null,
        error: null
      });

      const result = await newsService.saveArticles(articles);

      expect(result.success).toBe(true);
      expect(result.savedCount).toBe(2);
      expect(result.duplicateCount).toBe(0);
      expect(result.errorCount).toBe(0);
    });

    it('should handle empty articles array', async () => {
      const result = await newsService.saveArticles([]);

      expect(result.success).toBe(true);
      expect(result.savedCount).toBe(0);
      expect(result.duplicateCount).toBe(0);
      expect(result.errorCount).toBe(0);
    });
  });

  describe('processArticle', () => {
    it('should process article with additional metadata', async () => {
      const article = {
        id: 'test-article',
        title: 'Test Article',
        content: 'This is a test article content with multiple words for testing word count and reading time calculation.',
        url: 'https://example.com/article',
        source_id: 'test-source-id'
      };

      const processed = await newsService.processArticle(article);

      expect(processed.id).toBeDefined();
      expect(processed.content).toBeDefined();
      expect(processed.summary).toBeDefined();
      expect(processed.word_count).toBeGreaterThan(0);
      expect(processed.reading_time).toBeGreaterThan(0);
      expect(processed.language).toBeDefined();
      expect(processed.sentiment_score).toBeDefined();
      expect(processed.processed_at).toBeDefined();
    });

    it('should handle article with empty content', async () => {
      const article = {
        id: 'test-article',
        title: 'Test Article',
        content: '',
        url: 'https://example.com/article',
        source_id: 'test-source-id'
      };

      const processed = await newsService.processArticle(article);

      expect(processed.content).toBe('');
      expect(processed.summary).toBe('');
      expect(processed.word_count).toBe(0);
      expect(processed.reading_time).toBe(0);
    });
  });

  describe('cleanContent', () => {
    it('should remove HTML tags and scripts', () => {
      const dirtyContent = '<script>alert("test")</script><style>body{color:red}</style><p>This is <strong>content</strong></p>';
      const cleaned = newsService.cleanContent(dirtyContent);

      expect(cleaned).not.toContain('<script>');
      expect(cleaned).not.toContain('<style>');
      expect(cleaned).not.toContain('<p>');
      expect(cleaned).not.toContain('<strong>');
      expect(cleaned).toContain('This is content');
    });

    it('should handle empty content', () => {
      const cleaned = newsService.cleanContent('');
      expect(cleaned).toBe('');
    });

    it('should truncate long content', () => {
      const longContent = 'a'.repeat(15000);
      const cleaned = newsService.cleanContent(longContent);

      expect(cleaned.length).toBe(10000);
    });
  });

  describe('generateSummary', () => {
    it('should generate summary from content', () => {
      const content = 'This is the first sentence. This is the second sentence. This is the third sentence. This is the fourth sentence.';
      const summary = newsService.generateSummary(content);

      expect(summary).toContain('first sentence');
      expect(summary).toContain('second sentence');
      expect(summary).toContain('third sentence');
    });

    it('should handle short content', () => {
      const content = 'Short content';
      const summary = newsService.generateSummary(content);

      expect(summary).toBe('Short content');
    });

    it('should handle empty content', () => {
      const summary = newsService.generateSummary('');
      expect(summary).toBe('');
    });
  });

  describe('countWords', () => {
    it('should count words correctly', () => {
      const content = 'This is a test content with multiple words';
      const count = newsService.countWords(content);

      expect(count).toBe(8);
    });

    it('should handle empty content', () => {
      const count = newsService.countWords('');
      expect(count).toBe(0);
    });

    it('should handle content with extra spaces', () => {
      const content = '  Multiple   spaces   between   words  ';
      const count = newsService.countWords(content);

      expect(count).toBe(4);
    });
  });

  describe('calculateReadingTime', () => {
    it('should calculate reading time correctly', () => {
      const content = 'a '.repeat(400); // 200 words
      const readingTime = newsService.calculateReadingTime(content);

      expect(readingTime).toBe(1);
    });

    it('should round up reading time', () => {
      const content = 'a '.repeat(300); // 150 words
      const readingTime = newsService.calculateReadingTime(content);

      expect(readingTime).toBe(1);
    });
  });

  describe('detectLanguage', () => {
    it('should detect Chinese content', () => {
      const content = '这是一个中文测试内容';
      const language = newsService.detectLanguage(content);

      expect(language).toBe('zh-CN');
    });

    it('should detect English content', () => {
      const content = 'This is an English test content';
      const language = newsService.detectLanguage(content);

      expect(language).toBe('en');
    });

    it('should return unknown for mixed content', () => {
      const content = 'This is mixed 内容';
      const language = newsService.detectLanguage(content);

      expect(language).toBe('unknown');
    });

    it('should handle empty content', () => {
      const language = newsService.detectLanguage('');
      expect(language).toBe('unknown');
    });
  });

  describe('analyzeSentiment', () => {
    it('should detect positive sentiment', async () => {
      const content = '这是一个很好的成功案例，增长迅速';
      const sentiment = await newsService.analyzeSentiment(content);

      expect(sentiment).toBeGreaterThan(0);
    });

    it('should detect negative sentiment', async () => {
      const content = '这是一个失败案例，问题严重，导致下降';
      const sentiment = await newsService.analyzeSentiment(content);

      expect(sentiment).toBeLessThan(0);
    });

    it('should handle neutral content', async () => {
      const content = '这是一个普通的报道';
      const sentiment = await newsService.analyzeSentiment(content);

      expect(sentiment).toBe(0);
    });

    it('should handle empty content', async () => {
      const sentiment = await newsService.analyzeSentiment('');
      expect(sentiment).toBe(0);
    });
  });

  describe('calculateSimilarity', () => {
    it('should calculate high similarity for similar texts', () => {
      const text1 = 'This is a test article about technology';
      const text2 = 'This is another test article about technology';
      const similarity = newsService.calculateSimilarity(text1, text2);

      expect(similarity).toBeGreaterThan(0.5);
    });

    it('should calculate low similarity for different texts', () => {
      const text1 = 'This is about technology';
      const text2 = 'This is about cooking recipes';
      const similarity = newsService.calculateSimilarity(text1, text2);

      expect(similarity).toBeLessThan(0.5);
    });

    it('should handle empty texts', () => {
      const similarity = newsService.calculateSimilarity('', '');
      expect(similarity).toBe(0);
    });
  });

  describe('getArticle', () => {
    it('should get article from database', async () => {
      const articleId = 'test-article-id';
      const mockArticle = {
        id: articleId,
        title: 'Test Article',
        content: 'Test content'
      };

      mockSupabase.createClient().from().select().single.mockResolvedValue({
        data: mockArticle,
        error: null
      });

      const result = await newsService.getArticle(articleId);

      expect(result).toEqual(mockArticle);
    });

    it('should handle invalid article ID', async () => {
      await expect(newsService.getArticle('invalid-id'))
        .rejects.toThrow('无效的文章ID');
    });

    it('should use cache for subsequent calls', async () => {
      const articleId = 'test-article-id';
      const mockArticle = {
        id: articleId,
        title: 'Test Article',
        content: 'Test content'
      };

      mockSupabase.createClient().from().select().single.mockResolvedValue({
        data: mockArticle,
        error: null
      });

      // 第一次调用
      const result1 = await newsService.getArticle(articleId);
      expect(result1).toEqual(mockArticle);

      // 第二次调用应该使用缓存
      const result2 = await newsService.getArticle(articleId);
      expect(result2).toEqual(mockArticle);

      // 数据库查询应该只调用一次
      expect(mockSupabase.createClient().from().select().single).toHaveBeenCalledTimes(1);
    });
  });

  describe('getArticles', () => {
    it('should get articles with pagination', async () => {
      const mockArticles = [
        { id: '1', title: 'Article 1' },
        { id: '2', title: 'Article 2' }
      ];

      mockSupabase.createClient().from().select().mockReturnValue({
        eq: jest.fn().mockReturnThis(),
        contains: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: mockArticles,
          error: null,
          count: 2
        })
      });

      const result = await newsService.getArticles({
        page: 1,
        limit: 10,
        sortBy: 'publish_date',
        sortOrder: 'desc'
      });

      expect(result.success).toBe(true);
      expect(result.articles).toEqual(mockArticles);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);
      expect(result.pagination.total).toBe(2);
    });
  });

  describe('searchArticles', () => {
    it('should search articles successfully', async () => {
      const mockArticles = [
        { id: '1', title: 'Search Result 1' },
        { id: '2', title: 'Search Result 2' }
      ];

      mockSupabase.createClient().from().select().mockReturnValue({
        textSearch: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: mockArticles,
          error: null,
          count: 2
        })
      });

      const result = await newsService.searchArticles('test query');

      expect(result.success).toBe(true);
      expect(result.articles).toEqual(mockArticles);
      expect(result.query).toBe('test query');
    });
  });

  describe('getPopularArticles', () => {
    it('should get popular articles for 24h period', async () => {
      const mockArticles = [
        { id: '1', title: 'Popular Article 1', view_count: 100 },
        { id: '2', title: 'Popular Article 2', view_count: 80 }
      ];

      mockSupabase.createClient().from().select().mockReturnValue({
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: mockArticles,
          error: null
        })
      });

      const result = await newsService.getPopularArticles({ period: '24h', limit: 10 });

      expect(result.success).toBe(true);
      expect(result.articles).toEqual(mockArticles);
      expect(result.period).toBe('24h');
    });
  });

  describe('updateArticleStats', () => {
    it('should update article stats successfully', async () => {
      const articleId = 'test-article-id';
      const stats = { view_count: 100, like_count: 10 };

      mockSupabase.createClient().from().update().eq().select().single.mockResolvedValue({
        data: { id: articleId, ...stats },
        error: null
      });

      const result = await newsService.updateArticleStats(articleId, stats);

      expect(result.success).toBe(true);
      expect(result.article).toEqual({ id: articleId, ...stats });
    });

    it('should handle invalid article ID', async () => {
      await expect(newsService.updateArticleStats('invalid-id', { view_count: 100 }))
        .rejects.toThrow('无效的文章ID');
    });
  });

  describe('deleteArticle', () => {
    it('should delete article successfully', async () => {
      const articleId = 'test-article-id';

      mockSupabase.createClient().from().delete().eq().mockResolvedValue({
        error: null
      });

      const result = await newsService.deleteArticle(articleId);

      expect(result.success).toBe(true);
      expect(result.articleId).toBe(articleId);
    });

    it('should handle invalid article ID', async () => {
      await expect(newsService.deleteArticle('invalid-id'))
        .rejects.toThrow('无效的文章ID');
    });
  });

  describe('getStatistics', () => {
    it('should get statistics successfully', async () => {
      const mockStats = {
        totalArticles: 100,
        todayArticles: 10,
        thisWeekArticles: 50,
        thisMonthArticles: 80,
        categoryStats: [{ category: 'technology', count: 50 }],
        sourceStats: [{ source_id: 'source-1', count: 30 }]
      };

      // Mock all the database calls
      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          count: jest.fn().mockReturnValue({
            head: jest.fn().mockReturnValue({
              gte: jest.fn().mockResolvedValue({ count: 100 })
            })
          })
        })
      });

      mockSupabase.createClient().from = mockFrom;
      mockSupabase.createClient().rpc = jest.fn().mockResolvedValue({
        data: [],
        error: null
      });

      const result = await newsService.getStatistics();

      expect(result.totalArticles).toBe(100);
      expect(result.todayArticles).toBe(0);
      expect(result.thisWeekArticles).toBe(0);
      expect(result.thisMonthArticles).toBe(0);
      expect(result.categoryStats).toEqual([]);
      expect(result.sourceStats).toEqual([]);
    });
  });

  describe('clearCache', () => {
    it('should clear article cache', () => {
      // 添加一些缓存数据
      newsService.articleCache.set('test-id', { data: 'test', timestamp: Date.now() });

      expect(newsService.articleCache.size).toBe(1);

      newsService.clearCache();

      expect(newsService.articleCache.size).toBe(0);
    });
  });
});