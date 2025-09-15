/**
 * RSS服务测试用例
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { rssService } from '../index.js';
import { validateUrl, validateRSSUrl } from '../../../utils/validators.js';
import { CircuitBreaker } from '../../../utils/circuit-breaker.js';

// Mock依赖
jest.mock('rss-parser');
jest.mock('axios');
jest.mock('@supabase/supabase-js');
jest.mock('../../../utils/logger.js');

const mockRSSParser = require('rss-parser');
const mockAxios = require('axios');
const mockSupabase = require('@supabase/supabase-js');

describe('RSS Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // 重置断路器状态
    rssService.circuitBreaker.reset();
  });

  describe('URL Validation', () => {
    it('should validate valid URLs', () => {
      expect(validateUrl('https://example.com')).toBe(true);
      expect(validateUrl('http://example.com')).toBe(true);
      expect(validateUrl('https://example.com/rss')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(validateUrl('not-a-url')).toBe(false);
      expect(validateUrl('ftp://example.com')).toBe(false);
      expect(validateUrl('')).toBe(false);
      expect(validateUrl(null)).toBe(false);
    });
  });

  describe('RSS URL Validation', () => {
    it('should validate RSS URLs', () => {
      expect(validateRSSUrl('https://example.com/feed.xml')).toBe(true);
      expect(validateRSSUrl('https://example.com/rss')).toBe(true);
      expect(validateRSSUrl('https://example.com/atom')).toBe(true);
      expect(validateRSSUrl('https://example.com/feed.rss')).toBe(true);
    });

    it('should reject non-RSS URLs', () => {
      expect(validateRSSUrl('https://example.com/page')).toBe(false);
      expect(validateRSSUrl('https://example.com/article')).toBe(false);
    });
  });

  describe('fetchRSSFeed', () => {
    it('should fetch RSS feed successfully', async () => {
      const mockFeed = {
        title: 'Test Feed',
        items: [
          {
            title: 'Test Article',
            link: 'https://example.com/article',
            pubDate: '2024-01-01T00:00:00Z'
          }
        ]
      };

      mockAxios.get.mockResolvedValue({
        status: 200,
        data: '<rss><channel><title>Test Feed</title><item><title>Test Article</title><link>https://example.com/article</link><pubDate>2024-01-01T00:00:00Z</pubDate></item></channel></rss>'
      });

      mockRSSParser.default.prototype.parseString.mockResolvedValue(mockFeed);

      const result = await rssService.fetchRSSFeed('test-source-id', 'https://example.com/feed.xml');

      expect(result.success).toBe(true);
      expect(result.feed).toEqual(mockFeed);
      expect(result.articles).toEqual(mockFeed.items);
    });

    it('should handle fetch errors', async () => {
      mockAxios.get.mockRejectedValue(new Error('Network error'));

      const result = await rssService.fetchRSSFeed('test-source-id', 'https://example.com/feed.xml');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
      expect(result.articles).toEqual([]);
    });

    it('should handle invalid URLs', async () => {
      const result = await rssService.fetchRSSFeed('test-source-id', 'invalid-url');

      expect(result.success).toBe(false);
      expect(result.error).toContain('无效的RSS源URL');
    });
  });

  describe('parseArticle', () => {
    it('should parse article correctly', () => {
      const article = {
        title: 'Test Article',
        link: 'https://example.com/article',
        pubDate: '2024-01-01T00:00:00Z',
        content: 'Test content',
        author: 'Test Author'
      };

      const result = rssService.parseArticle(article, 'source-id', 'https://example.com/feed.xml');

      expect(result.title).toBe('Test Article');
      expect(result.source_id).toBe('source-id');
      expect(result.url).toBe('https://example.com/article');
      expect(result.author).toBe('Test Author');
      expect(result.publish_date).toBe('2024-01-01T00:00:00.000Z');
      expect(result.id).toBeDefined();
    });

    it('should handle missing fields', () => {
      const article = {
        title: 'Test Article',
        link: 'https://example.com/article'
      };

      const result = rssService.parseArticle(article, 'source-id', 'https://example.com/feed.xml');

      expect(result.title).toBe('Test Article');
      expect(result.author).toBeNull();
      expect(result.publish_date).toBeDefined();
    });
  });

  describe('extractContent', () => {
    it('should extract content from content field', () => {
      const article = {
        content: 'Main content'
      };

      const result = rssService.extractContent(article);
      expect(result).toBe('Main content');
    });

    it('should extract content from content:encoded field', () => {
      const article = {
        'content:encoded': 'Encoded content'
      };

      const result = rssService.extractContent(article);
      expect(result).toBe('Encoded content');
    });

    it('should extract content from summary field', () => {
      const article = {
        summary: 'Summary content'
      };

      const result = rssService.extractContent(article);
      expect(result).toBe('Summary content');
    });

    it('should return empty string if no content found', () => {
      const article = {};

      const result = rssService.extractContent(article);
      expect(result).toBe('');
    });
  });

  describe('parseDate', () => {
    it('should parse valid date', () => {
      const result = rssService.parseDate('2024-01-01T00:00:00Z');
      expect(result).toBe('2024-01-01T00:00:00.000Z');
    });

    it('should handle invalid date', () => {
      const result = rssService.parseDate('invalid-date');
      expect(result).toBeDefined();
      expect(new Date(result)).toBeInstanceOf(Date);
    });

    it('should handle empty date', () => {
      const result = rssService.parseDate('');
      expect(result).toBeDefined();
      expect(new Date(result)).toBeInstanceOf(Date);
    });
  });

  describe('extractCategories', () => {
    it('should extract categories from array', () => {
      const article = {
        categories: ['Tech', 'News', 'AI']
      };

      const result = rssService.extractCategories(article);
      expect(result).toEqual(['Tech', 'News', 'AI']);
    });

    it('should extract category from string', () => {
      const article = {
        categories: 'Tech'
      };

      const result = rssService.extractCategories(article);
      expect(result).toEqual(['Tech']);
    });

    it('should handle missing categories', () => {
      const article = {};

      const result = rssService.extractCategories(article);
      expect(result).toEqual([]);
    });

    it('should filter empty categories', () => {
      const article = {
        categories: ['Tech', '', 'News', null, 'AI']
      };

      const result = rssService.extractCategories(article);
      expect(result).toEqual(['Tech', 'News', 'AI']);
    });
  });

  describe('validateRSSFeed', () => {
    it('should validate valid RSS feed', () => {
      const feed = {
        title: 'Test Feed',
        items: [
          { title: 'Article 1' },
          { title: 'Article 2' }
        ]
      };

      const result = rssService.validateRSSFeed(feed);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject empty feed', () => {
      const result = rssService.validateRSSFeed(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('RSS源数据为空');
    });

    it('should reject feed without title', () => {
      const feed = {
        items: [{ title: 'Article 1' }]
      };

      const result = rssService.validateRSSFeed(feed);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('缺少RSS源标题');
    });

    it('should reject feed without items', () => {
      const feed = {
        title: 'Test Feed'
      };

      const result = rssService.validateRSSFeed(feed);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('缺少文章列表或格式错误');
    });

    it('should reject feed with empty items', () => {
      const feed = {
        title: 'Test Feed',
        items: []
      };

      const result = rssService.validateRSSFeed(feed);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('RSS源没有文章');
    });
  });

  describe('Circuit Breaker', () => {
    it('should handle circuit breaker open state', async () => {
      // 强制开启断路器
      rssService.circuitBreaker.forceOpen();

      await expect(rssService.fetchRSSFeed('test-source-id', 'https://example.com/feed.xml'))
        .rejects.toThrow('Circuit breaker is OPEN');
    });

    it('should recover from circuit breaker', async () => {
      // 强制开启断路器
      rssService.circuitBreaker.forceOpen();

      // 设置下一次尝试时间为过去
      rssService.circuitBreaker.nextAttemptTime = Date.now() - 1000;

      // 成功执行应该关闭断路器
      mockAxios.get.mockResolvedValue({
        status: 200,
        data: '<rss><channel><title>Test Feed</title></channel></rss>'
      });

      mockRSSParser.default.prototype.parseString.mockResolvedValue({
        title: 'Test Feed',
        items: []
      });

      const result = await rssService.fetchRSSFeed('test-source-id', 'https://example.com/feed.xml');

      expect(result.success).toBe(true);
      expect(rssService.circuitBreaker.state).toBe('CLOSED');
    });
  });

  describe('getSourceHealthScore', () => {
    it('should return high score for healthy source', () => {
      rssService.sourceHealthCache.set('test-source-id', {
        is_healthy: true,
        timestamp: Date.now() - 1000 // 1秒前
      });

      const score = rssService.getSourceHealthScore('test-source-id');
      expect(score).toBeGreaterThan(80);
    });

    it('should return low score for unhealthy source', () => {
      rssService.sourceHealthCache.set('test-source-id', {
        is_healthy: false,
        timestamp: Date.now() - 1000 // 1秒前
      });

      const score = rssService.getSourceHealthScore('test-source-id');
      expect(score).toBeLessThan(60);
    });

    it('should return 0 for unknown source', () => {
      const score = rssService.getSourceHealthScore('unknown-source-id');
      expect(score).toBe(0);
    });
  });
});