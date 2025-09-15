/**
 * Scheduler Service 测试文件
 * 测试任务调度、执行、监控等功能
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import SchedulerService from '../SchedulerService.js';
import ConfigService from '../ConfigService.js';
import { RSSManagerService } from '../RSSManagerService.js';
import NewsAggregatorService from '../NewsAggregatorService.js';
import AIAnalysisService from '../AIAnalysisService.js';
import EmailService from '../EmailService.js';

// Mock dependencies
jest.mock('node-cron');
jest.mock('../ConfigService.js');
jest.mock('../RSSManagerService.js');
jest.mock('../NewsAggregatorService.js');
jest.mock('../AIAnalysisService.js');
jest.mock('../EmailService.js');
jest.mock('../../utils/logger.js');

describe('SchedulerService', () => {
  let schedulerService;
  let mockConfigService;
  let mockRSSManagerService;
  let mockNewsAggregatorService;
  let mockAIAnalysisService;
  let mockEmailService;
  let mockLogger;
  let mockCron;

  const testConfig = {
    maxConcurrentTasks: 5,
    enablePredefinedTasks: true,
    timezone: 'Asia/Shanghai'
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock instances
    mockConfigService = new ConfigService();
    mockRSSManagerService = new RSSManagerService();
    mockNewsAggregatorService = new NewsAggregatorService();
    mockAIAnalysisService = new AIAnalysisService();
    mockEmailService = new EmailService();
    mockLogger = require('../../utils/logger.js');
    mockCron = require('node-cron');

    // Setup mock service methods
    mockConfigService.initialize = jest.fn().mockResolvedValue(true);
    mockConfigService.stop = jest.fn().mockResolvedValue(true);
    mockConfigService.isRunning = true;

    mockRSSManagerService.initialize = jest.fn().mockResolvedValue(true);
    mockRSSManagerService.stop = jest.fn().mockResolvedValue(true);
    mockRSSManagerService.monitorAllSources = jest.fn().mockResolvedValue({
      sourceCount: 10,
      activeCount: 8,
      errorCount: 2
    });
    mockRSSManagerService.isRunning = true;

    mockNewsAggregatorService.initialize = jest.fn().mockResolvedValue(true);
    mockNewsAggregatorService.stop = jest.fn().mockResolvedValue(true);
    mockNewsAggregatorService.smartAggregateNews = jest.fn().mockResolvedValue({
      success: true,
      data: {
        articles: [
          { id: '1', title: 'Test Article 1', category: 'tech', ai_analysis_completed: false },
          { id: '2', title: 'Test Article 2', category: 'finance', ai_analysis_completed: false }
        ]
      }
    });
    mockNewsAggregatorService.getRecentNews = jest.fn().mockResolvedValue({
      success: true,
      data: {
        articles: [
          { id: '1', title: '突发新闻', category: 'politics', published_at: new Date().toISOString() },
          { id: '2', title: '央行降息', category: 'finance', published_at: new Date().toISOString() }
        ]
      }
    });
    mockNewsAggregatorService.isRunning = true;

    mockAIAnalysisService.initialize = jest.fn().mockResolvedValue(true);
    mockAIAnalysisService.stop = jest.fn().mockResolvedValue(true);
    mockAIAnalysisService.analyzeArticle = jest.fn().mockResolvedValue({
      success: true,
      sentiment: 'positive'
    });
    mockAIAnalysisService.isRunning = true;

    mockEmailService.initialize = jest.fn().mockResolvedValue(true);
    mockEmailService.stop = jest.fn().mockResolvedValue(true);
    mockEmailService.sendDailyDigest = jest.fn().mockResolvedValue({
      success: true
    });
    mockEmailService.sendRealtimeNotification = jest.fn().mockResolvedValue({
      success: true
    });
    mockEmailService.isRunning = true;

    mockLogger.info = jest.fn();
    mockLogger.warn = jest.fn();
    mockLogger.error = jest.fn();

    // Mock cron
    mockCron.validate = jest.fn().mockReturnValue(true);
    mockCron.schedule = jest.fn().mockReturnValue({
      start: jest.fn(),
      stop: jest.fn(),
      destroy: jest.fn(),
      nextDates: jest.fn().mockReturnValue([new Date()])
    });

    // Create SchedulerService instance with mocked dependencies
    schedulerService = new SchedulerService({
      ...testConfig,
      configService: mockConfigService,
      rssManagerService: mockRSSManagerService,
      newsAggregatorService: mockNewsAggregatorService,
      aiAnalysisService: mockAIAnalysisService,
      emailService: mockEmailService
    });
  });

  describe('Initialization', () => {
    it('应该成功初始化SchedulerService', async () => {
      const result = await schedulerService.initialize();

      expect(result).toBe(true);
      expect(schedulerService.isRunning).toBe(true);
      expect(mockConfigService.initialize).toHaveBeenCalled();
      expect(mockRSSManagerService.initialize).toHaveBeenCalled();
      expect(mockNewsAggregatorService.initialize).toHaveBeenCalled();
      expect(mockAIAnalysisService.initialize).toHaveBeenCalled();
      expect(mockEmailService.initialize).toHaveBeenCalled();
    });

    it('应该注册预定义任务组', async () => {
      await schedulerService.initialize();

      expect(schedulerService.taskGroups.has('news')).toBe(true);
      expect(schedulerService.taskGroups.has('analysis')).toBe(true);
      expect(schedulerService.taskGroups.has('cleanup')).toBe(true);
      expect(schedulerService.taskGroups.has('notification')).toBe(true);
    });

    it('应该注册预设任务', async () => {
      await schedulerService.initialize();

      expect(schedulerService.tasks.has('rss-monitoring')).toBe(true);
      expect(schedulerService.tasks.has('daily-digest')).toBe(true);
      expect(schedulerService.tasks.has('news-aggregation')).toBe(true);
      expect(schedulerService.tasks.has('realtime-notification-check')).toBe(true);
      expect(schedulerService.tasks.has('data-cleanup')).toBe(true);
      expect(schedulerService.tasks.has('health-check')).toBe(true);
    });

    it('应该处理初始化失败', async () => {
      mockConfigService.initialize.mockRejectedValue(new Error('Config service failed'));

      await expect(schedulerService.initialize()).rejects.toThrow('Config service failed');
      expect(schedulerService.isRunning).toBe(false);
    });
  });

  describe('Task Registration', () => {
    beforeEach(async () => {
      await schedulerService.initialize();
    });

    it('应该成功注册任务', () => {
      const taskOptions = {
        id: 'test-task',
        name: 'Test Task',
        schedule: '*/5 * * * *',
        handler: jest.fn().mockResolvedValue({ success: true }),
        enabled: true,
        tags: ['test']
      };

      const task = schedulerService.registerTask(taskOptions);

      expect(task.id).toBe('test-task');
      expect(task.name).toBe('Test Task');
      expect(schedulerService.tasks.has('test-task')).toBe(true);
      expect(schedulerService.schedules.has('test-task')).toBe(true);
      expect(mockCron.schedule).toHaveBeenCalledWith(taskOptions.schedule, expect.any(Function), {
        scheduled: false,
        timezone: testConfig.timezone
      });
    });

    it('应该拒绝无效的任务配置', () => {
      const invalidTaskOptions = [
        { schedule: '*/5 * * * *', handler: jest.fn() }, // 缺少name
        { name: 'Test Task', handler: jest.fn() }, // 缺少schedule
        { name: 'Test Task', schedule: 'invalid-cron', handler: jest.fn() }, // 无效cron
        { name: 'Test Task', schedule: '*/5 * * * *' } // 缺少handler
      ];

      invalidTaskOptions.forEach(options => {
        expect(() => schedulerService.registerTask(options)).toThrow();
      });
    });

    it('应该拒绝重复的任务ID', () => {
      const taskOptions = {
        id: 'daily-digest', // 已存在的ID
        name: 'Duplicate Task',
        schedule: '*/5 * * * *',
        handler: jest.fn()
      };

      expect(() => schedulerService.registerTask(taskOptions)).toThrow('任务已存在');
    });

    it('应该自动启动已启用的任务', () => {
      const taskOptions = {
        id: 'auto-start-task',
        name: 'Auto Start Task',
        schedule: '*/5 * * * *',
        handler: jest.fn(),
        enabled: true
      };

      const task = schedulerService.registerTask(taskOptions);
      const scheduler = schedulerService.schedules.get('auto-start-task');

      expect(scheduler.start).toHaveBeenCalled();
      expect(task.nextRunAt).toBeDefined();
    });
  });

  describe('Task Execution', () => {
    beforeEach(async () => {
      await schedulerService.initialize();
    });

    it('应该成功执行任务', async () => {
      const mockHandler = jest.fn().mockResolvedValue('Task completed');

      const task = schedulerService.registerTask({
        id: 'execution-test',
        name: 'Execution Test',
        schedule: '*/5 * * * *',
        handler: mockHandler,
        enabled: true
      });

      const result = await schedulerService.executeTask('execution-test');

      expect(result.success).toBe(true);
      expect(result.result).toBe('Task completed');
      expect(mockHandler).toHaveBeenCalled();
      expect(task.runCount).toBe(1);
      expect(task.errorCount).toBe(0);
    });

    it('应该处理任务执行失败', async () => {
      const mockHandler = jest.fn().mockRejectedValue(new Error('Task failed'));

      const task = schedulerService.registerTask({
        id: 'failure-test',
        name: 'Failure Test',
        schedule: '*/5 * * * *',
        handler: mockHandler,
        enabled: true,
        maxRetries: 2,
        retryDelay: 100
      });

      const result = await schedulerService.executeTask('failure-test');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(mockHandler).toHaveBeenCalledTimes(3); // 1次初始 + 2次重试
      expect(task.runCount).toBe(1);
      expect(task.errorCount).toBe(1);
    });

    it('应该跳过已禁用的任务', async () => {
      const mockHandler = jest.fn();

      schedulerService.registerTask({
        id: 'disabled-task',
        name: 'Disabled Task',
        schedule: '*/5 * * * *',
        handler: mockHandler,
        enabled: false
      });

      const result = await schedulerService.executeTask('disabled-task');

      expect(result).toBeUndefined();
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('应该跳过正在运行的任务', async () => {
      let handlerResolve;
      const handlerPromise = new Promise(resolve => {
        handlerResolve = resolve;
      });

      const mockHandler = jest.fn(() => handlerPromise);

      const task = schedulerService.registerTask({
        id: 'running-task',
        name: 'Running Task',
        schedule: '*/5 * * * *',
        handler: mockHandler,
        enabled: true,
        concurrent: false
      });

      // 第一次执行
      const firstExecution = schedulerService.executeTask('running-task');

      // 第二次执行应该被跳过
      const secondExecution = schedulerService.executeTask('running-task');

      expect(secondExecution).toBeUndefined();

      // 完成第一次执行
      handlerResolve('First execution completed');
      await firstExecution;
    });
  });

  describe('Task Management', () => {
    beforeEach(async () => {
      await schedulerService.initialize();
    });

    it('应该启动任务', async () => {
      const task = schedulerService.tasks.get('daily-digest');
      task.enabled = false;

      const result = await schedulerService.startTask('daily-digest');

      expect(result).toBe(true);
      expect(task.enabled).toBe(true);
      expect(schedulerService.schedules.get('daily-digest').start).toHaveBeenCalled();
    });

    it('应该停止任务', async () => {
      const result = await schedulerService.stopTask('daily-digest');

      expect(result).toBe(true);
      const task = schedulerService.tasks.get('daily-digest');
      expect(task.enabled).toBe(false);
      expect(schedulerService.schedules.get('daily-digest').stop).toHaveBeenCalled();
    });

    it('应该删除任务', async () => {
      const taskId = 'news-aggregation';
      const result = await schedulerService.deleteTask(taskId);

      expect(result).toBe(true);
      expect(schedulerService.tasks.has(taskId)).toBe(false);
      expect(schedulerService.schedules.has(taskId)).toBe(false);

      // 检查是否从任务组中移除
      for (const group of schedulerService.taskGroups.values()) {
        expect(group.tasks.includes(taskId)).toBe(false);
      }
    });

    it('应该立即执行任务', async () => {
      const taskId = 'health-check';
      const task = schedulerService.tasks.get(taskId);
      const originalHandler = task.handler;

      // Mock handler
      task.handler = jest.fn().mockResolvedValue({ success: true });

      const result = await schedulerService.runTaskNow(taskId);

      expect(result.success).toBe(true);
      expect(task.handler).toHaveBeenCalled();

      // 恢复原始handler
      task.handler = originalHandler;
    });
  });

  describe('Predefined Task Execution', () => {
    beforeEach(async () => {
      await schedulerService.initialize();
    });

    it('应该执行RSS源监控任务', async () => {
      const result = await schedulerService.monitorRSSSources();

      expect(result.success).toBe(true);
      expect(result.sourceCount).toBe(10);
      expect(result.activeCount).toBe(8);
      expect(result.errorCount).toBe(2);
      expect(mockRSSManagerService.monitorAllSources).toHaveBeenCalled();
    });

    it('应该执行每日新闻摘要任务', async () => {
      const result = await schedulerService.generateDailyDigest();

      expect(result.success).toBe(true);
      expect(result.articleCount).toBe(2);
      expect(result.emailSent).toBe(true);
      expect(mockNewsAggregatorService.getRecentNews).toHaveBeenCalledWith({
        hours: 24,
        maxArticles: 100,
        categories: ['tech', 'finance', 'politics']
      });
      expect(mockEmailService.sendDailyDigest).toHaveBeenCalled();
    });

    it('应该处理没有新闻数据的摘要生成', async () => {
      mockNewsAggregatorService.getRecentNews.mockResolvedValue({
        success: true,
        data: { articles: [] }
      });

      const result = await schedulerService.generateDailyDigest();

      expect(result.success).toBe(true);
      expect(result.message).toBe('没有新闻数据需要处理');
      expect(mockEmailService.sendDailyDigest).not.toHaveBeenCalled();
    });

    it('应该执行新闻聚合和分析任务', async () => {
      const result = await schedulerService.aggregateAndAnalyzeNews();

      expect(result.success).toBe(true);
      expect(result.articleCount).toBe(2);
      expect(result.analysisCount).toBe(2);
      expect(mockNewsAggregatorService.smartAggregateNews).toHaveBeenCalledWith({
        maxArticles: 50,
        enableAI: true,
        skipCache: false
      });
      expect(mockAIAnalysisService.analyzeArticle).toHaveBeenCalledTimes(2);
    });

    it('应该执行实时通知检查任务', async () => {
      const result = await schedulerService.checkRealtimeNotifications();

      expect(result.success).toBe(true);
      expect(result.articleCount).toBe(2);
      expect(result.notificationCount).toBe(2);
      expect(mockNewsAggregatorService.getRecentNews).toHaveBeenCalledWith({
        minutes: 30,
        maxArticles: 50
      });
      expect(mockEmailService.sendRealtimeNotification).toHaveBeenCalledTimes(2);
    });

    it('应该执行数据清理任务', async () => {
      const result = await schedulerService.cleanupOldData();

      expect(result.success).toBe(true);
      expect(result.cleanedCount).toBeGreaterThan(0);
    });

    it('应该执行系统健康检查任务', async () => {
      const result = await schedulerService.performHealthCheck();

      expect(result.success).toBe(true);
      expect(result.healthStatus).toBeDefined();
      expect(result.healthStatus.overall).toBe('healthy');
      expect(result.healthStatus.services).toBeDefined();
      expect(result.healthStatus.scheduler).toBeDefined();
    });

    it('应该检测到不健康的服务', async () => {
      mockAIAnalysisService.isRunning = false;

      const result = await schedulerService.performHealthCheck();

      expect(result.success).toBe(true);
      expect(result.healthStatus.overall).toBe('degraded');
      expect(result.healthStatus.services.ai.status).toBe('unhealthy');
    });
  });

  describe('Task Groups', () => {
    beforeEach(async () => {
      await schedulerService.initialize();
    });

    it('应该正确分配任务到组', () => {
      const rssTask = schedulerService.tasks.get('rss-monitoring');
      const newsTask = schedulerService.tasks.get('news-aggregation');

      expect(schedulerService.taskGroups.get('news').tasks).toContain(rssTask.id);
      expect(schedulerService.taskGroups.get('news').tasks).toContain(newsTask.id);
    });

    it('应该获取任务组统计', () => {
      const groupStats = schedulerService.getGroupStats();

      expect(groupStats.news).toBeDefined();
      expect(groupStats.news.taskCount).toBeGreaterThan(0);
      expect(groupStats.news.enabledTaskCount).toBeGreaterThan(0);
      expect(groupStats.news.totalRuns).toBeDefined();
      expect(groupStats.news.totalErrors).toBeDefined();
    });

    it('应该检查任务组并发限制', () => {
      const task = schedulerService.tasks.get('rss-monitoring');
      const canRun = schedulerService.checkGroupConcurrency(task);

      expect(typeof canRun).toBe('boolean');
    });
  });

  describe('History and Statistics', () => {
    beforeEach(async () => {
      await schedulerService.initialize();
    });

    it('应该记录任务执行历史', async () => {
      const taskId = 'health-check';
      const task = schedulerService.tasks.get(taskId);
      const originalHandler = task.handler;

      task.handler = jest.fn().mockResolvedValue({ success: true });

      await schedulerService.executeTask(taskId);

      expect(schedulerService.history.length).toBe(1);
      expect(schedulerService.history[0].taskId).toBe(taskId);
      expect(schedulerService.history[0].success).toBe(true);

      // 恢复原始handler
      task.handler = originalHandler;
    });

    it('应该获取执行历史', () => {
      // 添加一些测试历史记录
      schedulerService.history.push(
        { id: '1', taskId: 'test-1', success: true, timestamp: Date.now() },
        { id: '2', taskId: 'test-2', success: false, timestamp: Date.now() - 1000 }
      );

      const history = schedulerService.getHistory({
        limit: 10,
        offset: 0
      });

      expect(history.data.length).toBe(2);
      expect(history.pagination.total).toBe(2);
      expect(history.pagination.hasMore).toBe(false);
    });

    it('应该获取服务统计', () => {
      const stats = schedulerService.getStats();

      expect(stats.isRunning).toBe(true);
      expect(stats.taskCount).toBeGreaterThan(0);
      expect(stats.enabledTaskCount).toBeGreaterThan(0);
      expect(stats.totalRuns).toBeDefined();
      expect(stats.totalErrors).toBeDefined();
      expect(stats.executor).toBeDefined();
    });

    it('应该获取任务详情', () => {
      const taskId = 'daily-digest';
      const details = schedulerService.getTaskDetails(taskId);

      expect(details.id).toBe(taskId);
      expect(details.name).toBeDefined();
      expect(details.enabled).toBeDefined();
      expect(details.runCount).toBeDefined();
      expect(details.errorCount).toBeDefined();
    });

    it('应该获取任务列表', () => {
      const tasks = schedulerService.getTasks({
        enabled: true,
        tags: ['news']
      });

      expect(Array.isArray(tasks)).toBe(true);
      expect(tasks.length).toBeGreaterThan(0);
      tasks.forEach(task => {
        expect(task.enabled).toBe(true);
        expect(task.tags).toContain('news');
      });
    });
  });

  describe('Utility Methods', () => {
    beforeEach(async () => {
      await schedulerService.initialize();
    });

    it('应该正确检测突发新闻', () => {
      const articles = [
        { title: '突发：重大政策发布', published_at: new Date().toISOString() },
        { title: '央行降息0.25个百分点', published_at: new Date().toISOString() },
        { title: '突发：重大政策发布', published_at: new Date().toISOString() }, // 重复标题
        { title: '普通新闻', published_at: new Date(Date.now() - 3600000).toISOString() } // 1小时前
      ];

      const breakingNews = schedulerService.detectBreakingNews(articles);

      expect(breakingNews.length).toBe(3); // 2条突发新闻 + 1条重复
    });

    it('应该正确按类别分类文章', () => {
      const articles = [
        { title: '科技新闻', category: 'tech' },
        { title: '财经新闻', category: 'finance' },
        { title: '政治新闻', category: 'politics' },
        { title: '其他新闻', category: 'other' }
      ];

      const categorized = schedulerService.categorizeArticles(articles);

      expect(categorized.tech.length).toBe(1);
      expect(categorized.finance.length).toBe(1);
      expect(categorized.politics.length).toBe(1);
      expect(categorized.other.length).toBe(1);
    });

    it('应该提取关键词', () => {
      const text = '人工智能技术发展迅速，在金融科技领域应用广泛';
      const keywords = schedulerService.extractKeywords(text);

      expect(Array.isArray(keywords)).toBe(true);
      expect(keywords.length).toBeGreaterThan(0);
      expect(keywords).toContain('人工智能');
      expect(keywords).toContain('金融');
    });

    it('应该生成新闻摘要', async () => {
      const articles = [
        { title: 'AI技术突破', category: 'tech', url: 'http://example.com/1', source_type: 'rss' },
        { title: '股市大涨', category: 'finance', url: 'http://example.com/2', source_type: 'newsapi' }
      ];

      const digest = await schedulerService.generateNewsDigest(articles);

      expect(digest.date).toBeDefined();
      expect(digest.totalArticles).toBe(2);
      expect(digest.categories).toBeDefined();
      expect(digest.summary).toBeDefined();
    });

    it('应该验证URL', () => {
      expect(schedulerService.isValidURL('https://example.com')).toBe(true);
      expect(schedulerService.isValidURL('http://example.com/feed.xml')).toBe(true);
      expect(schedulerService.isValidURL('invalid-url')).toBe(false);
    });
  });

  describe('Service Stop', () => {
    it('应该正确停止服务', async () => {
      await schedulerService.initialize();

      // 添加一些测试数据
      schedulerService.tasks.set('test-task', { id: 'test-task' });
      schedulerService.schedules.set('test-task', {
        stop: jest.fn(),
        destroy: jest.fn()
      });

      await schedulerService.stop();

      expect(schedulerService.isRunning).toBe(false);
      expect(mockConfigService.stop).toHaveBeenCalled();
      expect(mockRSSManagerService.stop).toHaveBeenCalled();
      expect(mockNewsAggregatorService.stop).toHaveBeenCalled();
      expect(mockAIAnalysisService.stop).toHaveBeenCalled();
      expect(mockEmailService.stop).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await schedulerService.initialize();
    });

    it('应该处理任务执行异常', async () => {
      const taskId = 'health-check';
      const task = schedulerService.tasks.get(taskId);
      const originalHandler = task.handler;

      // 模拟异常
      task.handler = jest.fn().mockImplementation(() => {
        throw new Error('Task execution failed');
      });

      const result = await schedulerService.executeTask(taskId);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      // 恢复原始handler
      task.handler = originalHandler;
    });

    it('应该处理服务依赖异常', async () => {
      mockRSSManagerService.monitorAllSources.mockRejectedValue(new Error('RSS service down'));

      const result = await schedulerService.monitorRSSSources();

      expect(result.success).toBe(false);
      expect(result.error).toBe('RSS service down');
    });

    it('应该处理不存在的任务', async () => {
      const result = await schedulerService.executeTask('non-existent-task');

      expect(result).toBeUndefined();
    });
  });
});