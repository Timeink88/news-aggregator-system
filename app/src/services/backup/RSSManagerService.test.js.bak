/**
 * RSS Manager Service 测试
 * 遵循Node.js最佳实践：单元测试、集成测试、模拟测试
 */

import { jest } from '@jest/globals';
import { RSSManagerService } from './RSSManagerService.js';
import { RSSSourceQueries } from '../database/queries.js';
import dbClient from '../database/client.js';

// 模拟依赖
jest.mock('../database/queries.js');
jest.mock('../database/client.js');
jest.mock('../utils/logger.js', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

// 模拟RSS解析器
jest.mock('rss-parser', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    parseURL: jest.fn()
  }))
}));

// 模拟UUID
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-uuid')
}));

// 模拟JSDOM
jest.mock('jsdom', () => ({
  JSDOM: jest.fn()
}));

// 模拟newspaper3k
jest.mock('newspaper3k', () => ({
  fullArticle: jest.fn()
}));

describe('RSSManagerService', () => {
  let rssManagerService;
  let mockParser;
  let mockNewspaper3k;

  beforeEach(() => {
    // 重置所有模拟
    jest.clearAllMocks();

    // 创建RSS Manager Service实例
    rssManagerService = new RSSManagerService();

    // 获取模拟的RSS解析器
    mockParser = require('rss-parser').default();
    mockNewspaper3k = require('newspaper3k');
  });

  describe('initialize', () => {
    it('应该成功初始化RSS Manager Service', async () => {
      // 模拟数据库配置
      dbClient.rpc.mockResolvedValue({
        timeout: 30000,
        maxRetries: 3,
        userAgent: 'NewsAggregator/1.0'
      });

      await rssManagerService.initialize();

      expect(rssManagerService.isRunning).toBe(true);
      expect(rssManagerService.config).toBeDefined();
      expect(rssManagerService.config.timeout).toBe(30000);
    });

    it('初始化失败时应该抛出错误', async () => {
      dbClient.rpc.mockRejectedValue(new Error('数据库连接失败'));

      await expect(rssManagerService.initialize()).rejects.toThrow('数据库连接失败');
    });

    it('配置加载失败时应该使用默认配置', async () => {
      dbClient.rpc.mockRejectedValue(new Error('配置不存在'));

      await rssManagerService.initialize();

      expect(rssManagerService.config).toEqual(rssManagerService.defaultConfig);
    });
  });

  describe('addSource', () => {
    it('应该成功添加RSS源', async () => {
      const sourceData = {
        name: '测试RSS源',
        url: 'https://example.com/feed.xml',
        category: 'tech'
      };

      // 模拟验证成功
      mockParser.parseURL.mockResolvedValue({
        title: '测试RSS源',
        description: '测试描述',
        items: []
      });

      // 模拟数据库插入
      RSSSourceQueries.create.mockResolvedValue({
        id: 'test-source-id',
        ...sourceData,
        is_active: true,
        created_at: new Date().toISOString()
      });

      const result = await rssManagerService.addSource(sourceData);

      expect(result).toBeDefined();
      expect(result.name).toBe(sourceData.name);
      expect(result.url).toBe(sourceData.url);
      expect(RSSSourceQueries.create).toHaveBeenCalledWith({
        url: sourceData.url,
        name: sourceData.name,
        category: sourceData.category,
        source_type: 'rss',
        is_active: true,
        last_checked: null,
        status: 'active',
        error_count: 0,
        max_articles: 10,
        fetch_interval: 300,
        priority: 5,
        metadata: {}
      });
    });

    it('RSS源验证失败时应该抛出错误', async () => {
      const sourceData = {
        name: '无效RSS源',
        url: 'https://invalid-url.com/feed.xml',
        category: 'tech'
      };

      // 模拟验证失败
      mockParser.parseURL.mockRejectedValue(new Error('RSS解析失败'));

      await expect(rssManagerService.addSource(sourceData)).rejects.toThrow('RSS源验证失败: RSS解析失败');
    });
  });

  describe('validateSource', () => {
    it('应该成功验证有效的RSS源', async () => {
      const url = 'https://example.com/feed.xml';

      mockParser.parseURL.mockResolvedValue({
        title: '测试RSS',
        description: '测试描述',
        language: 'zh',
        lastBuildDate: '2024-01-01',
        items: [
          { title: '文章1', link: 'https://example.com/1' },
          { title: '文章2', link: 'https://example.com/2' }
        ]
      });

      const result = await rssManagerService.validateSource(url);

      expect(result.valid).toBe(true);
      expect(result.feedInfo).toBeDefined();
      expect(result.feedInfo.title).toBe('测试RSS');
      expect(result.feedInfo.itemCount).toBe(2);
    });

    it('无效RSS源应该返回验证失败', async () => {
      const url = 'https://invalid-url.com/feed.xml';

      mockParser.parseURL.mockRejectedValue(new Error('网络错误'));

      const result = await rssManagerService.validateSource(url);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('网络错误');
    });
  });

  describe('updateSource', () => {
    it('应该成功更新RSS源', async () => {
      const sourceId = 'test-source-id';
      const updateData = {
        name: '更新后的RSS源'
      };

      // 模拟数据库查询
      RSSSourceQueries.findById.mockResolvedValue({
        id: sourceId,
        name: '原始RSS源',
        url: 'https://example.com/feed.xml'
      });

      // 模拟数据库更新
      RSSSourceQueries.update.mockResolvedValue({
        id: sourceId,
        ...updateData
      });

      const result = await rssManagerService.updateSource(sourceId, updateData);

      expect(result).toBeDefined();
      expect(result.name).toBe(updateData.name);
      expect(RSSSourceQueries.update).toHaveBeenCalledWith(sourceId, updateData);
    });

    it('更新URL时应该重新验证RSS源', async () => {
      const sourceId = 'test-source-id';
      const updateData = {
        url: 'https://new-url.com/feed.xml'
      };

      // 模拟源存在
      RSSSourceQueries.findById.mockResolvedValue({
        id: sourceId,
        name: '测试RSS源',
        url: 'https://old-url.com/feed.xml'
      });

      // 模拟验证失败
      mockParser.parseURL.mockRejectedValue(new Error('新URL无效'));

      await expect(rssManagerService.updateSource(sourceId, updateData)).rejects.toThrow('RSS源验证失败: 新URL无效');
    });
  });

  describe('deleteSource', () => {
    it('应该成功删除RSS源', async () => {
      const sourceId = 'test-source-id';

      RSSSourceQueries.delete.mockResolvedValue(true);

      const result = await rssManagerService.deleteSource(sourceId);

      expect(result).toBe(true);
      expect(RSSSourceQueries.delete).toHaveBeenCalledWith(sourceId);
    });
  });

  describe('getSources', () => {
    it('应该返回RSS源列表', async () => {
      const mockSources = [
        {
          id: 'source1',
          name: 'RSS源1',
          url: 'https://example1.com/feed.xml'
        },
        {
          id: 'source2',
          name: 'RSS源2',
          url: 'https://example2.com/feed.xml'
        }
      ];

      RSSSourceQueries.list.mockResolvedValue({
        data: mockSources,
        pagination: {
          page: 1,
          limit: 10,
          total: 2
        }
      });

      const result = await rssManagerService.getSources();

      expect(result).toBeDefined();
      expect(result.data).toHaveLength(2);
      expect(result.data[0].name).toBe('RSS源1');
    });
  });

  describe('fetchSource', () => {
    it('应该成功抓取RSS源', async () => {
      const sourceId = 'test-source-id';
      const mockSource = {
        id: sourceId,
        name: '测试RSS源',
        url: 'https://example.com/feed.xml',
        category: 'tech'
      };

      // 模拟源查询
      RSSSourceQueries.findById.mockResolvedValue(mockSource);

      // 模拟RSS解析
      mockParser.parseURL.mockResolvedValue({
        title: '测试RSS',
        items: [
          {
            title: '测试文章1',
            link: 'https://example.com/article1',
            description: '测试内容1',
            pubDate: '2024-01-01'
          },
          {
            title: '测试文章2',
            link: 'https://example.com/article2',
            description: '测试内容2',
            pubDate: '2024-01-02'
          }
        ]
      });

      // 模拟文章存在检查
      dbClient.query.mockResolvedValue([]);

      // 模拟文章插入
      dbClient.insert.mockResolvedValue({
        id: 'test-article-id',
        title: '测试文章1'
      });

      // 模拟状态更新
      RSSSourceQueries.update.mockResolvedValue(mockSource);

      const result = await rssManagerService.fetchSource(sourceId);

      expect(result.success).toBe(true);
      expect(result.articlesFound).toBe(2);
      expect(result.articlesSaved).toBe(2);
    });

    it('RSS源不存在时应该返回错误', async () => {
      const sourceId = 'non-existent-source';

      RSSSourceQueries.findById.mockResolvedValue(null);

      const result = await rssManagerService.fetchSource(sourceId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('RSS源不存在');
    });

    it('RSS解析失败时应该返回错误', async () => {
      const sourceId = 'test-source-id';
      const mockSource = {
        id: sourceId,
        name: '测试RSS源',
        url: 'https://example.com/feed.xml'
      };

      RSSSourceQueries.findById.mockResolvedValue(mockSource);
      mockParser.parseURL.mockRejectedValue(new Error('RSS解析失败'));

      const result = await rssManagerService.fetchSource(sourceId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('RSS解析失败');
    });
  });

  describe('fetchMultipleSources', () => {
    it('应该成功批量抓取多个RSS源', async () => {
      const sourceIds = ['source1', 'source2'];
      const options = { batchSize: 2 };

      // 模拟单个源抓取
      jest.spyOn(rssManagerService, 'fetchSource')
        .mockResolvedValueOnce({
          success: true,
          articlesFound: 5,
          articlesSaved: 5,
          executionTime: 1000
        })
        .mockResolvedValueOnce({
          success: true,
          articlesFound: 3,
          articlesSaved: 3,
          executionTime: 800
        });

      const result = await rssManagerService.fetchMultipleSources(sourceIds, options);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.summary.totalSources).toBe(2);
      expect(result.summary.successCount).toBe(2);
      expect(result.summary.totalArticles).toBe(8);
    });
  });

  describe('withRetry', () => {
    it('应该在重试成功后返回结果', async () => {
      const mockFn = jest.fn()
        .mockRejectedValueOnce(new Error('第一次失败'))
        .mockResolvedValueOnce('成功');

      const result = await rssManagerService.withRetry(mockFn, 'test-operation', 2);

      expect(result).toBe('成功');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('应该在重试次数用完后抛出错误', async () => {
      const mockFn = jest.fn()
        .mockRejectedValue(new Error('总是失败'));

      await expect(rssManagerService.withRetry(mockFn, 'test-operation', 3))
        .rejects.toThrow('总是失败');

      expect(mockFn).toHaveBeenCalledTimes(3);
    });
  });

  describe('extractContentWithNewspaper3k', () => {
    it('应该成功使用newspaper3k提取内容', async () => {
      const url = 'https://example.com/article';
      const config = {
        newspaper3kTimeout: 15000,
        defaultLanguage: 'zh'
      };

      const mockArticle = {
        text: '提取的文章内容',
        title: '文章标题',
        authors: ['作者1'],
        top_image: 'https://example.com/image.jpg',
        keywords: ['关键词1', '关键词2']
      };

      mockNewspaper3k.fullArticle.mockImplementation((url, options, callback) => {
        callback(null, mockArticle);
      });

      const result = await rssManagerService.extractContentWithNewspaper3k(url, config);

      expect(result.content).toBe(mockArticle.text);
      expect(result.title).toBe(mockArticle.title);
      expect(result.authors).toEqual(mockArticle.authors);
      expect(result.top_image).toBe(mockArticle.top_image);
      expect(result.keywords).toEqual(mockArticle.keywords);
    });

    it('newspaper3k超时应该抛出错误', async () => {
      const url = 'https://example.com/article';
      const config = {
        newspaper3kTimeout: 100, // 很短的超时时间
        defaultLanguage: 'zh'
      };

      mockNewspaper3k.fullArticle.mockImplementation((url, options, callback) => {
        // 不调用callback，模拟超时
      });

      await expect(rssManagerService.extractContentWithNewspaper3k(url, config))
        .rejects.toThrow('newspaper3k提取超时');
    });
  });

  describe('calculateExtractionQuality', () => {
    it('应该正确计算提取质量评分', () => {
      const article = {
        text: '这是一篇较长的文章内容，超过100个字符，应该获得较高的质量评分。',
        title: '有意义的标题',
        authors: ['作者名'],
        publish_date: new Date(),
        top_image: 'https://example.com/image.jpg',
        keywords: ['关键词1', '关键词2', '关键词3']
      };

      const score = rssManagerService.calculateExtractionQuality(article);

      expect(score).toBeGreaterThan(0.7); // 应该获得较高的评分
    });

    it('空文章应该获得较低的质量评分', () => {
      const article = {};

      const score = rssManagerService.calculateExtractionQuality(article);

      expect(score).toBe(0.5); // 默认评分
    });
  });

  describe('processFeedItem', () => {
    it('应该正确处理Feed项目', async () => {
      const source = {
        id: 'test-source',
        name: '测试RSS源',
        category: 'tech'
      };

      const item = {
        title: '测试文章',
        link: 'https://example.com/article',
        description: '这是测试内容',
        pubDate: '2024-01-01',
        author: '测试作者'
      };

      // 模拟文章存在检查
      dbClient.query.mockResolvedValue([]);

      const config = {
        maxContentLength: 50000,
        defaultLanguage: 'zh',
        useNewspaper3k: false
      };

      const result = await rssManagerService.processFeedItem(item, source, config);

      expect(result).toBeDefined();
      expect(result.title).toBe('测试文章');
      expect(result.source_id).toBe(source.id);
      expect(result.category).toBe(source.category);
      expect(result.language).toBe('zh');
    });

    it('文章已存在时应该返回null', async () => {
      const source = {
        id: 'test-source',
        name: '测试RSS源',
        category: 'tech'
      };

      const item = {
        title: '已存在的文章',
        link: 'https://example.com/existing-article',
        description: '已存在的内容'
      };

      // 模拟文章已存在
      dbClient.query.mockResolvedValue([{ id: 'existing-article-id' }]);

      const config = {
        maxContentLength: 50000,
        defaultLanguage: 'zh',
        useNewspaper3k: false
      };

      const result = await rssManagerService.processFeedItem(item, source, config);

      expect(result).toBeNull();
    });
  });

  describe('monitorSourceHealth', () => {
    it('应该返回RSS源健康状态', async () => {
      const sourceId = 'test-source-id';
      const mockSource = {
        id: sourceId,
        name: '测试RSS源',
        url: 'https://example.com/feed.xml',
        status: 'active',
        error_count: 0,
        last_checked: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // 2小时前
      };

      RSSSourceQueries.findById.mockResolvedValue(mockSource);

      const result = await rssManagerService.monitorSourceHealth(sourceId);

      expect(result).toBeDefined();
      expect(result.sourceId).toBe(sourceId);
      expect(result.sourceName).toBe(mockSource.name);
      expect(result.healthScore).toBeGreaterThan(80); // 应该是健康的
      expect(result.status).toBe(mockSource.status);
    });

    it('不存在的RSS源应该抛出错误', async () => {
      const sourceId = 'non-existent-source';

      RSSSourceQueries.findById.mockResolvedValue(null);

      await expect(rssManagerService.monitorSourceHealth(sourceId))
        .rejects.toThrow('RSS源不存在');
    });
  });

  describe('calculateHealthScore', () => {
    it('应该正确计算健康RSS源的评分', () => {
      const healthySource = {
        status: 'active',
        error_count: 0,
        last_checked: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString() // 1小时前
      };

      const score = rssManagerService.calculateHealthScore(healthySource);

      expect(score).toBeGreaterThan(80);
    });

    it('应该正确计算不健康RSS源的评分', () => {
      const unhealthySource = {
        status: 'error',
        error_count: 5,
        last_checked: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() // 48小时前
      };

      const score = rssManagerService.calculateHealthScore(unhealthySource);

      expect(score).toBeLessThan(50);
    });
  });

  describe('generateHealthRecommendations', () => {
    it('应该为低健康评分生成建议', () => {
      const recommendations = rssManagerService.generateHealthRecommendations(30, {
        status: 'error',
        error_count: 6
      });

      expect(recommendations).toContain('建议检查RSS源URL是否有效');
      expect(recommendations).toContain('错误次数过多，建议暂停该RSS源');
      expect(recommendations).toContain('RSS源处于错误状态，需要手动检查');
    });

    it('应该为高健康评分生成建议', () => {
      const recommendations = rssManagerService.generateHealthRecommendations(90, {
        status: 'active',
        error_count: 0
      });

      expect(recommendations).toContain('RSS源运行良好，建议保持当前配置');
    });
  });

  describe('辅助方法', () => {
    describe('cleanTitle', () => {
      it('应该正确清理标题', () => {
        expect(rssManagerService.cleanTitle('  测试  标题  ')).toBe('测试 标题');
        expect(rssManagerService.cleanTitle(null)).toBe('无标题');
        expect(rssManagerService.cleanTitle(undefined)).toBe('无标题');
      });
    });

    describe('cleanHTML', () => {
      it('应该正确清理HTML标签', () => {
        expect(rssManagerService.cleanHTML('<p>测试内容</p>')).toBe('测试内容');
        expect(rssManagerService.cleanHTML('<div>  多个  空格  </div>')).toBe('多个 空格');
        expect(rssManagerService.cleanHTML(null)).toBe('');
        expect(rssManagerService.cleanHTML('')).toBe('');
      });
    });

    describe('parseDate', () => {
      it('应该正确解析日期', () => {
        const validDate = '2024-01-01T00:00:00Z';
        const result = rssManagerService.parseDate(validDate);
        expect(result).toBeDefined();
        expect(new Date(result)).toBeInstanceOf(Date);
      });

      it('无效日期应该返回当前时间', () => {
        const invalidDate = 'invalid-date';
        const result = rssManagerService.parseDate(invalidDate);
        expect(result).toBeDefined();
      });
    });

    describe('countWords', () => {
      it('应该正确计算字数', () => {
        expect(rssManagerService.countWords('这是一个测试句子')).toBe(6);
        expect(rssManagerService.countWords('')).toBe(0);
        expect(rssManagerService.countWords(null)).toBe(0);
      });
    });

    describe('generateSummary', () => {
      it('应该生成正确的摘要', () => {
        const longText = '这是第一句话。这是第二句话。这是第三句话。这是第四句话。';
        const summary = rssManagerService.generateSummary(longText);
        expect(summary).toContain('这是第一句话');
        expect(summary).toContain('这是第二句话');
        expect(summary).toContain('...');
      });

      it('空内容应该返回空字符串', () => {
        expect(rssManagerService.generateSummary('')).toBe('');
        expect(rssManagerService.generateSummary(null)).toBe('');
      });
    });
  });

  describe('错误处理', () => {
    it('应该正确处理数据库错误', async () => {
      const sourceId = 'test-source-id';

      RSSSourceQueries.findById.mockRejectedValue(new Error('数据库错误'));

      const result = await rssManagerService.fetchSource(sourceId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('数据库错误');
    });

    it('应该正确处理网络错误', async () => {
      const url = 'https://example.com/feed.xml';

      mockParser.parseURL.mockRejectedValue(new Error('网络超时'));

      const result = await rssManagerService.testConnection(url);

      expect(result.success).toBe(false);
      expect(result.error).toBe('网络超时');
    });
  });

  describe('事件发射', () => {
    it('应该在添加RSS源时发射事件', async () => {
      const sourceData = {
        name: '测试RSS源',
        url: 'https://example.com/feed.xml',
        category: 'tech'
      };

      mockParser.parseURL.mockResolvedValue({
        title: '测试RSS源',
        items: []
      });

      RSSSourceQueries.create.mockResolvedValue({
        id: 'test-source-id',
        ...sourceData
      });

      const eventSpy = jest.fn();
      rssManagerService.on('sourceAdded', eventSpy);

      await rssManagerService.addSource(sourceData);

      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({
        id: 'test-source-id',
        name: sourceData.name
      }));
    });

    it('应该在抓取完成时发射事件', async () => {
      const sourceId = 'test-source-id';
      const mockSource = {
        id: sourceId,
        name: '测试RSS源',
        url: 'https://example.com/feed.xml',
        category: 'tech'
      };

      RSSSourceQueries.findById.mockResolvedValue(mockSource);
      mockParser.parseURL.mockResolvedValue({
        items: []
      });
      dbClient.query.mockResolvedValue([]);
      dbClient.insert.mockResolvedValue({});
      RSSSourceQueries.update.mockResolvedValue(mockSource);

      const eventSpy = jest.fn();
      rssManagerService.on('newsFetched', eventSpy);

      await rssManagerService.fetchSource(sourceId);

      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({
        source: sourceId,
        articlesSaved: 0
      }));
    });
  });
});