/**
 * 新闻聚合系统主应用入口
 * 遵循Node.js最佳实践：模块化、错误处理、日志记录
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ES模块环境下的路径处理
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../.env') });

import logger from './utils/logger.js';
import { globalErrorHandler, AppError, ErrorType, ErrorSeverity } from './utils/errorHandler.js';
import { RSSManager } from './services/RSSManager.js';
import NewsAggregatorService from './services/NewsAggregatorService.js';
import AIAnalysisService from './services/AIAnalysisService.js';
import EmailService from './services/EmailService.js';
import WebAdminService from './services/WebAdminService.js';
import SchedulerService from './services/SchedulerService.js';
import CleanupService from './services/CleanupService.js';
import ConfigManagementService from './services/ConfigManagementService.js';
import MonitoringService from './services/MonitoringService.js';
import ExpressServer from './server.js';

/**
 * 新闻聚合系统主应用类
 */
class NewsAggregatorApp {
  constructor(options = {}) {
    this.services = new Map();
    this.isRunning = false;
    this.startTime = null;
    this.healthStatus = {
      overall: 'unknown',
      services: {},
      lastCheck: null
    };
    this.options = options;
    this.expressServer = null;

    // 初始化配置
    this.config = {
      environment: process.env.NODE_ENV || 'development',
      port: process.env.PORT || 4545,
      host: process.env.HOST || 'localhost',
      services: {
        config: { enabled: true },
        rss: { enabled: true },
        news: { enabled: true },
        ai: { enabled: true },
        email: { enabled: true },
        webAdmin: { enabled: true },
        scheduler: { enabled: true },
        cleanup: { enabled: true },
        monitoring: { enabled: true }
      }
    };
  }

  /**
   * 初始化应用
   */
  async initialize() {
    try {
      logger.info('正在初始化新闻聚合系统...');

      // 注册所有服务
      await this.registerServices();

      // 初始化服务
      await this.initializeServices();

      // 设置服务间依赖关系
      await this.setupServiceDependencies();

      // 注册事件处理器
      this.setupEventHandlers();

      logger.info('新闻聚合系统初始化完成');

    } catch (error) {
      logger.error('应用初始化失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 注册所有服务
   */
  async registerServices() {
    logger.info('注册系统服务...');

    try {
      // 创建服务实例
      if (this.config.services.config.enabled) {
        this.services.set('config', new ConfigManagementService());
      }

      if (this.config.services.rss.enabled) {
        this.services.set('rss', new RSSManager());
      }

      if (this.config.services.news.enabled) {
        this.services.set('news', new NewsAggregatorService());
      }

      if (this.config.services.ai.enabled) {
        this.services.set('ai', new AIAnalysisService());
      }

      if (this.config.services.email.enabled) {
        this.services.set('email', new EmailService());
      }

      if (this.config.services.webAdmin.enabled) {
        this.services.set('webAdmin', new WebAdminService());
      }

      if (this.config.services.scheduler.enabled) {
        this.services.set('scheduler', new SchedulerService());
      }

      if (this.config.services.cleanup.enabled) {
        this.services.set('cleanup', new CleanupService());
      }

      if (this.config.services.monitoring.enabled) {
        this.services.set('monitoring', new MonitoringService());
      }

      // 创建Express服务器
      this.expressServer = new ExpressServer({
        port: this.config.port,
        host: this.config.host,
        environment: this.config.environment
      });

    } catch (error) {
      logger.error('注册服务失败:', error);
      throw error;
    }

    logger.info(`已注册 ${this.services.size} 个系统服务`);
  }

  /**
   * 初始化所有服务
   */
  async initializeServices() {
    logger.info('初始化服务...');

    const initializationOrder = [
      'config',   // 1. Config服务 - 配置管理
      'monitoring', // 2. Monitoring服务 - 系统监控
      'rss',     // 3. RSS服务 - 数据源
      'news',    // 4. News服务 - 新闻处理
      'ai',      // 5. AI服务 - 智能分析
      'email',   // 6. Email服务 - 邮件通知
      'webAdmin', // 7. WebAdmin服务 - Web管理
      'scheduler', // 8. Scheduler服务 - 任务调度
      'cleanup'   // 9. Cleanup服务 - 数据清理
    ];

    for (const serviceName of initializationOrder) {
      try {
        const service = this.services.get(serviceName);
        if (service && typeof service.initialize === 'function') {
          await service.initialize();
          logger.info(`服务初始化成功: ${serviceName}`);
        }
      } catch (error) {
        logger.error(`服务初始化失败: ${serviceName}`, { error: error.message });
        // 继续初始化其他服务，但记录错误
      }
    }
  }

  /**
   * 设置服务间依赖关系
   */
  async setupServiceDependencies() {
    logger.info('设置服务依赖关系...');

    try {
      // RSS服务依赖
      const rssService = this.services.get('rss');
      if (rssService && rssService.setDependencies) {
        rssService.setDependencies({
          newsService: this.services.get('news'),
          aiService: this.services.get('ai')
        });
      }

      // News服务依赖
      const newsService = this.services.get('news');
      if (newsService && newsService.setDependencies) {
        newsService.setDependencies({
          aiService: this.services.get('ai'),
          emailService: this.services.get('email')
        });
      }

      // AI服务依赖
      const aiService = this.services.get('ai');
      if (aiService && aiService.setDependencies) {
        aiService.setDependencies({
          newsService: this.services.get('news')
        });
      }

      // Email服务依赖
      const emailService = this.services.get('email');
      if (emailService && emailService.setDependencies) {
        emailService.setDependencies({
          newsService: this.services.get('news'),
          aiService: this.services.get('ai')
        });
      }

      // Web服务依赖
      const webService = this.services.get('web');
      if (webService && webService.setDependencies) {
        webService.setDependencies({
          newsService: this.services.get('news'),
          emailService: this.services.get('email')
        });
      }

      // Scheduler服务依赖
      const schedulerService = this.services.get('scheduler');
      if (schedulerService && schedulerService.setDependencies) {
        schedulerService.setDependencies({
          rssService: this.services.get('rss'),
          newsService: this.services.get('news'),
          aiService: this.services.get('ai'),
          emailService: this.services.get('email'),
          cleanupService: this.services.get('cleanup')
        });
      }

      // Cleanup服务依赖
      const cleanupService = this.services.get('cleanup');
      if (cleanupService && cleanupService.setDependencies) {
        cleanupService.setDependencies({
          newsService: this.services.get('news'),
          schedulerService: this.services.get('scheduler')
        });
      }

      logger.info('服务依赖关系设置完成');

    } catch (error) {
      logger.error('设置服务依赖关系失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 设置事件处理器
   */
  setupEventHandlers() {
    logger.info('设置事件处理器...');

    // RSS服务事件
    const rssService = this.services.get('rss');
    if (rssService) {
      rssService.on('newsFetched', (data) => {
        logger.info('收到新闻获取事件', { source: data.source, count: data.articles.length });
        this.services.get('news')?.processNewArticles(data.articles);
      });

      rssService.on('error', (error) => {
        logger.error('RSS服务错误', { error: error.message });
      });
    }

    // News服务事件
    const newsService = this.services.get('news');
    if (newsService) {
      newsService.on('articleProcessed', (article) => {
        logger.info('文章处理完成', { id: article.id, title: article.title });

        // 触发AI分析
        this.services.get('ai')?.analyzeArticle(article);
      });

      newsService.on('error', (error) => {
        logger.error('News服务错误', { error: error.message });
      });
    }

    // AI服务事件
    const aiService = this.services.get('ai');
    if (aiService) {
      aiService.on('analysisCompleted', (result) => {
        logger.info('AI分析完成', { articleId: result.articleId, sentiment: result.sentiment });

        // 更新文章分析结果
        this.services.get('news')?.updateArticleAnalysis(result);
      });

      aiService.on('error', (error) => {
        logger.error('AI服务错误', { error: error.message });
      });
    }

    // Email服务事件
    const emailService = this.services.get('email');
    if (emailService) {
      emailService.on('emailSent', (data) => {
        logger.info('邮件发送成功', { to: data.to, subject: data.subject });
      });

      emailService.on('error', (error) => {
        logger.error('Email服务错误', { error: error.message });
      });
    }

    // Scheduler服务事件
    const schedulerService = this.services.get('scheduler');
    if (schedulerService) {
      schedulerService.on('jobAdded', (job) => {
        logger.info('任务已添加', { name: job.name, type: job.type });
      });

      schedulerService.on('jobCompleted', (job) => {
        const duration = job.duration || (job.endTime && job.startTime ? job.endTime - job.startTime : 0);
        logger.info('任务执行完成', { name: job.name, duration });
      });

      schedulerService.on('jobFailed', (job) => {
        logger.error('任务执行失败', { name: job.name, error: job.error });
      });
    }

    // Cleanup服务事件
    const cleanupService = this.services.get('cleanup');
    if (cleanupService) {
      cleanupService.on('cleanupCompleted', (result) => {
        logger.info('清理操作完成', { operation: result.operation, cleanedCount: result.cleanedCount });
      });

      cleanupService.on('error', (error) => {
        logger.error('Cleanup服务错误', { error: error.message });
      });
    }

    logger.info('事件处理器设置完成');
  }

  /**
   * 启动应用
   */
  async start() {
    try {
      if (this.isRunning) {
        logger.warn('应用已经在运行中');
        return;
      }

      logger.info('正在启动新闻聚合系统...');
      this.startTime = new Date();

      // 初始化应用
      await this.initialize();

      // 启动所有服务
      await this.startServices();

      // 启动定期健康检查
      this.startHealthCheck();

      this.isRunning = true;

      logger.info('新闻聚合系统启动成功', {
        startTime: this.startTime,
        services: this.services.size,
        version: process.env.APP_VERSION || '1.0.0'
      });

    } catch (error) {
      logger.error('应用启动失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 启动所有服务
   */
  async startServices() {
    logger.info('启动系统服务...');

    // 并行启动组 - 可以同时启动的服务
    const parallelGroups = [
      {
        name: '基础服务组',
        services: ['config', 'cleanup'],
        dependencies: []
      },
      {
        name: '数据处理组',
        services: ['rss', 'news'],
        dependencies: ['config']
      },
      {
        name: '功能服务组',
        services: ['ai', 'email'],
        dependencies: ['config', 'news']
      },
      {
        name: '界面服务组',
        services: ['webAdmin'],
        dependencies: ['config', 'news']
      },
      {
        name: '调度服务组',
        services: ['scheduler'],
        dependencies: ['config', 'rss', 'news', 'ai', 'email']
      }
    ];

    // 按组启动服务
    for (const group of parallelGroups) {
      logger.info(`启动${group.name}...`);

      // 检查依赖是否满足
      const dependenciesMet = group.dependencies.every(dep =>
        this.healthStatus.services[dep] === 'healthy'
      );

      if (!dependenciesMet) {
        logger.warn(`${group.name}依赖未满足，跳过并行启动`);
        continue;
      }

      // 并行启动组内服务
      const startPromises = group.services.map(async (serviceName) => {
        try {
          const service = this.services.get(serviceName);
          if (service && typeof service.initialize === 'function') {
            await service.initialize();
            logger.info(`服务初始化成功: ${serviceName}`);
            this.healthStatus.services[serviceName] = 'healthy';
            return { serviceName, success: true };
          }
          return { serviceName, success: false, reason: '服务不存在或无initialize方法' };
        } catch (error) {
          logger.error(`服务初始化异常: ${serviceName}`, { error: error.message });
          this.healthStatus.services[serviceName] = 'unhealthy';
          return { serviceName, success: false, reason: error.message };
        }
      });

      // 等待组内所有服务启动完成
      const results = await Promise.all(startPromises);
      const successCount = results.filter(r => r.success).length;
      logger.info(`${group.name}启动完成: ${successCount}/${group.services.length} 成功`);
    }

    // 设置监控服务到服务器
    const monitoringService = this.services.get('monitoring');
    if (monitoringService && this.expressServer) {
      this.expressServer.setMonitoringService(monitoringService);
      logger.info('监控服务已集成到Express服务器');
    }

    // 启动Express服务器
    if (this.expressServer) {
      try {
        await this.expressServer.start();
        logger.info('Express服务器启动成功');
        this.healthStatus.services['express'] = 'healthy';
      } catch (error) {
        logger.error('Express服务器启动失败:', error);
        this.healthStatus.services['express'] = 'unhealthy';
      }
    }
  }

  /**
   * 启动定期健康检查
   */
  startHealthCheck() {
    const healthCheckInterval = parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000');

    setInterval(async () => {
      await this.performHealthCheck();
    }, healthCheckInterval);

    logger.info(`健康检查已启动，间隔: ${healthCheckInterval}ms`);
  }

  /**
   * 执行健康检查
   */
  async performHealthCheck() {
    try {
      let overallHealthy = true;
      const serviceStatuses = {};

      for (const [serviceName, service] of this.services) {
        try {
          if (typeof service.getHealthStatus === 'function') {
            const status = await service.getHealthStatus();
            serviceStatuses[serviceName] = status.status;
            if (status.status !== 'healthy') {
              overallHealthy = false;
            }
          } else {
            serviceStatuses[serviceName] = 'unknown';
          }
        } catch (error) {
          serviceStatuses[serviceName] = 'unhealthy';
          overallHealthy = false;
        }
      }

      this.healthStatus = {
        overall: overallHealthy ? 'healthy' : 'unhealthy',
        services: serviceStatuses,
        lastCheck: new Date()
      };

      if (!overallHealthy) {
        logger.warn('系统健康检查发现问题', { status: this.healthStatus });
      }

    } catch (error) {
      logger.error('健康检查失败', { error: error.message });
    }
  }

  /**
   * 停止应用
   */
  async stop() {
    try {
      if (!this.isRunning) {
        logger.warn('应用未在运行');
        return;
      }

      logger.info('正在停止新闻聚合系统...');

      // 停止所有服务
      await this.stopServices();

      this.isRunning = false;

      const uptime = this.getUptime();
      logger.info('新闻聚合系统已停止', { uptime: `${uptime}ms` });

    } catch (error) {
      logger.error('应用停止失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 停止所有服务
   */
  async stopServices() {
    logger.info('停止系统服务...');

    // 先停止Express服务器
    if (this.expressServer) {
      try {
        await this.expressServer.stop();
        logger.info('Express服务器停止成功');
      } catch (error) {
        logger.error('Express服务器停止失败:', error);
      }
    }

    const stopOrder = [
      'scheduler',  // 1. 先停止调度服务，停止新任务
      'webAdmin',   // 2. 停止Web管理服务
      'email',      // 3. 停止Email服务
      'ai',         // 4. 停止AI服务
      'news',       // 5. 停止News服务
      'rss',        // 6. 停止RSS服务
      'cleanup',    // 7. 停止清理服务
      'config'      // 8. 最后停止配置服务
    ];

    for (const serviceName of stopOrder) {
      try {
        const service = this.services.get(serviceName);
        if (service && typeof service.stop === 'function') {
          await service.stop();
          logger.info(`服务停止成功: ${serviceName}`);
        }
      } catch (error) {
        logger.error(`服务停止异常: ${serviceName}`, { error: error.message });
      }
    }
  }

  /**
   * 获取应用状态
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      startTime: this.startTime,
      uptime: this.getUptime(),
      healthStatus: this.healthStatus,
      services: Array.from(this.services.keys()),
      version: process.env.APP_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    };
  }

  /**
   * 获取运行时间
   */
  getUptime() {
    if (!this.startTime) return 0;
    return Date.now() - this.startTime.getTime();
  }

  /**
   * 获取服务实例
   */
  getService(serviceName) {
    return this.services.get(serviceName);
  }

  /**
   * 处理应用错误
   */
  handleApplicationError(error, context = {}) {
    return globalErrorHandler.handleError(new AppError(
      error.message || '应用错误',
      ErrorType.SERVICE,
      ErrorSeverity.MEDIUM,
      { ...context, service: 'application' }
    ));
  }

  /**
   * 获取错误报告
   */
  getErrorReport() {
    return globalErrorHandler.createErrorReport();
  }

  /**
   * 获取错误统计
   */
  getErrorStats() {
    return globalErrorHandler.getStats();
  }

  /**
   * 处理优雅关闭
   */
  async gracefulShutdown() {
    logger.info('接收到关闭信号，开始优雅关闭...');

    try {
      await this.stop();
      logger.info('应用优雅关闭完成');
      process.exit(0);
    } catch (error) {
      logger.error('优雅关闭失败', { error: error.message });
      process.exit(1);
    }
  }
}

// 创建应用实例
const app = new NewsAggregatorApp();

// 设置进程信号处理
process.on('SIGTERM', () => app.gracefulShutdown());
process.on('SIGINT', () => app.gracefulShutdown());

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  globalErrorHandler.handleError(new AppError(
    `未捕获的异常: ${error.message}`,
    ErrorType.SERVICE,
    ErrorSeverity.CRITICAL,
    { stack: error.stack, originalError: error }
  ));
  app.gracefulShutdown();
});

// 处理未处理的Promise拒绝
process.on('unhandledRejection', (reason, _promise) => {
  globalErrorHandler.handleError(new AppError(
    `未处理的Promise拒绝: ${reason}`,
    ErrorType.SERVICE,
    ErrorSeverity.HIGH,
    { reason }
  ));
  app.gracefulShutdown();
});

// 导出应用类和实例
export default NewsAggregatorApp;
export { app };

// 如果直接运行此文件，启动应用
if (import.meta.url === `file://${process.argv[1]}`) {
  app.start().catch(error => {
    logger.error('应用启动失败', { error: error.message });
    process.exit(1);
  });
}