/**
 * RSS Manager Service 测试
 * 遵循Node.js最佳实践：单元测试、集成测试、模拟测试
 */

import { jest } from '@jest/globals';
import RSSManager from './RSSManager.js';
import { RSSSourceQueries } from '../database/queries.js';
import dbClient from '../database/client.js';

// 模拟依赖
jest.mock('../database/queries.js');
jest.mock('../database/client.js');
jest.mock('../utils/logger.js', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
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

describe('RSSManager', () => {
  let rssManager;
  let mockParser;

  beforeEach(() => {
    // 重置所有模拟
    jest.clearAllMocks();

    // 创建RSS Manager实例
    rssManager = new RSSManager();

    // 获取模拟的RSS解析器
    mockParser = require('rss-parser').default();
  });

  describe('initialize', () => {
    it('应该成功初始化RSS Manager', async () => {
      // 模拟数据库配置
      dbClient.rpc.mockResolvedValue({
        timeout: 30000,
        maxRetries: 3,
        userAgent: 'NewsAggregator/1.0'
      });

      await rssManager.initialize();

      expect(rssManager.isRunning).toBe(true);
      expect(rssManager.config).toBeDefined();
      expect(rssManager.config.timeout).toBe(30000);
    });

    it('初始化失败时应该抛出错误', async () => {
      dbClient.rpc.mockRejectedValue(new Error('数据库连接失败'));

      await expect(rssManager.initialize()).rejects.toThrow('数据库连接失败');
    });

    it('配置加载失败时应该使用默认配置', async () => {
      dbClient.rpc.mockRejectedValue(new Error('配置不存在'));

      await rssManager.initialize();

      expect(rssManager.config).toEqual(rssManager.defaultConfig);
    });
  });

  describe('addSource', () => {
    it('应该成功添加RSS源', async () => {
      const sourceData = {
        name: '测试RSS源',
        url: 'https://example.com/feed.xml',
        description: '测试描述',
        category: 'tech',
        language: 'zh'
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

      const result = await rssManager.addSource(sourceData);

      expect(result).toBeDefined();
      expect(result.name).toBe(sourceData.name);
      expect(result.url).toBe(sourceData.url);
      expect(RSSSourceQueries.create).toHaveBeenCalledWith({
        ...sourceData,
        last_fetched_at: null,
        last_fetch_status: 'pending',
        fetch_error_count: 0,
        total_articles_fetched: 0,
        is_active: true
      });
    });

    it('RSS源验证失败时应该抛出错误', async () => {
      const sourceData = {
        name: '无效RSS源',
        url: 'https://invalid-url.com/feed.xml',
        description: '无效描述',
        category: 'tech',
        language: 'zh'
      };

      // 模拟验证失败
      mockParser.parseURL.mockRejectedValue(new Error('RSS解析失败'));

      await expect(rssManager.addSource(sourceData)).rejects.toThrow('RSS源验证失败: RSS解析失败');
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

      const result = await rssManager.validateSource(url);

      expect(result.valid).toBe(true);
      expect(result.feedInfo).toBeDefined();
      expect(result.feedInfo.title).toBe('测试RSS');
      expect(result.feedInfo.itemCount).toBe(2);
    });

    it('无效RSS源应该返回验证失败', async () => {
      const url = 'https://invalid-url.com/feed.xml';

      mockParser.parseURL.mockRejectedValue(new Error('网络错误'));

      const result = await rssManager.validateSource(url);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('网络错误');
    });
  });

  describe('updateSource', () => {
    it('应该成功更新RSS源', async () => {
      const sourceId = 'test-source-id';
      const updateData = {
        name: '更新后的RSS源',
        description: '更新后的描述'
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

      const result = await rssManager.updateSource(sourceId, updateData);

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

      await expect(rssManager.updateSource(sourceId, updateData)).rejects.toThrow('RSS源验证失败: 新URL无效');
    });
  });

  describe('deleteSource', () => {
    it('应该成功删除RSS源', async () => {
      const sourceId = 'test-source-id';

      RSSSourceQueries.delete.mockResolvedValue(true);

      const result = await rssManager.deleteSource(sourceId);

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

      const result = await rssManager.getSources();

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
        category: 'tech',
        language: 'zh'
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
      RSSSourceQueries.updateFetchStatus.mockResolvedValue(mockSource);

      const result = await rssManager.fetchSource(sourceId);

      expect(result.success).toBe(true);
      expect(result.articlesFound).toBe(2);
      expect(result.articlesSaved).toBe(2);
    });

    it('RSS源不存在时应该抛出错误', async () => {
      const sourceId = 'non-existent-source';

      RSSSourceQueries.findById.mockResolvedValue(null);

      const result = await rssManager.fetchSource(sourceId);

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

      const result = await rssManager.fetchSource(sourceId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('RSS解析失败');
    });
  });

  describe('fetchMultipleSources', () => {
    it('应该成功批量抓取多个RSS源', async () => {
      const sourceIds = ['source1', 'source2'];
      const options = { batchSize: 2 };

      // 模拟单个源抓取
      jest.spyOn(rssManager, 'fetchSource')
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

      const result = await rssManager.fetchMultipleSources(sourceIds, options);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.summary.totalSources).toBe(2);
      expect(result.summary.successCount).toBe(2);
      expect(result.summary.totalArticles).toBe(8);
    });
  });

  describe('processFeedItem', () => {
    it('应该正确处理Feed项目', async () => {
      const source = {
        id: 'test-source',
        name: '测试RSS源',
        category: 'tech',
        language: 'zh'
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
        defaultLanguage: 'zh'
      };

      const result = await rssManager.processFeedItem(item, source, config);

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
        category: 'tech',
        language: 'zh'
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
        defaultLanguage: 'zh'
      };

      const result = await rssManager.processFeedItem(item, source, config);

      expect(result).toBeNull();
    });
  });

  describe('testConnection', () => {
    it('应该成功测试RSS源连接', async () => {
      const url = 'https://example.com/feed.xml';

      mockParser.parseURL.mockResolvedValue({
        title: '测试RSS',
        description: '测试描述',
        items: []
      });

      const result = await rssManager.testConnection(url);

      expect(result.success).toBe(true);
      expect(result.responseTime).toBeGreaterThan(0);
      expect(result.feedInfo).toBeDefined();
    });

    it('连接测试失败时应该返回错误信息', async () => {
      const url = 'https://invalid-url.com/feed.xml';

      mockParser.parseURL.mockRejectedValue(new Error('连接失败'));

      const result = await rssManager.testConnection(url);

      expect(result.success).toBe(false);
      expect(result.error).toBe('连接失败');
    });
  });

  describe('辅助方法', () => {
    describe('cleanTitle', () => {
      it('应该正确清理标题', () => {
        expect(rssManager.cleanTitle('  测试  标题  ')).toBe('测试 标题');
        expect(rssManager.cleanTitle(null)).toBe('无标题');
        expect(rssManager.cleanTitle(undefined)).toBe('无标题');
      });
    });

    describe('cleanHTML', () => {
      it('应该正确清理HTML标签', () => {
        expect(rssManager.cleanHTML('<p>测试内容</p>')).toBe('测试内容');
        expect(rssManager.cleanHTML('<div>  多个  空格  </div>')).toBe('多个 空格');
        expect(rssManager.cleanHTML(null)).toBe('');
        expect(rssManager.cleanHTML('')).toBe('');
      });
    });

    describe('parseDate', () => {
      it('应该正确解析日期', () => {
        const validDate = '2024-01-01T00:00:00Z';
        const result = rssManager.parseDate(validDate);
        expect(result).toBeDefined();
        expect(new Date(result)).toBeInstanceOf(Date);
      });

      it('无效日期应该返回当前时间', () => {
        const invalidDate = 'invalid-date';
        const result = rssManager.parseDate(invalidDate);
        expect(result).toBeDefined();
      });
    });

    describe('countWords', () => {
      it('应该正确计算字数', () => {
        expect(rssManager.countWords('这是一个测试句子')).toBe(6);
        expect(rssManager.countWords('')).toBe(0);
        expect(rssManager.countWords(null)).toBe(0);
      });
    });

    describe('generateSummary', () => {
      it('应该生成正确的摘要', () => {
        const longText = '这是第一句话。这是第二句话。这是第三句话。这是第四句话。';
        const summary = rssManager.generateSummary(longText);
        expect(summary).toContain('这是第一句话');
        expect(summary).toContain('这是第二句话');
        expect(summary).toContain('...');
      });

      it('空内容应该返回空字符串', () => {
        expect(rssManager.generateSummary('')).toBe('');
        expect(rssManager.generateSummary(null)).toBe('');
      });
    });
  });

  describe('错误处理', () => {
    it('应该正确处理数据库错误', async () => {
      const sourceId = 'test-source-id';

      RSSSourceQueries.findById.mockRejectedValue(new Error('数据库错误'));

      const result = await rssManager.fetchSource(sourceId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('数据库错误');
    });

    it('应该正确处理网络错误', async () => {
      const url = 'https://example.com/feed.xml';

      mockParser.parseURL.mockRejectedValue(new Error('网络超时'));

      const result = await rssManager.testConnection(url);

      expect(result.success).toBe(false);
      expect(result.error).toBe('网络超时');
    });
  });
});