/**
 * 新闻聚合系统主入口文件
 * 初始化所有服务并启动应用
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { logger } from './utils/logger.js';
import { ConfigService } from './services/config-service.js';
import { WebService } from './services/web-service/index.js';
import { RssService } from './services/rss-service/index.js';
import { NewsService } from './services/news-service/index.js';
import AIService from './services/ai-service/index.js';
import { EmailService } from './services/email-service/index.js';
import { SchedulerService } from './services/scheduler-service/index.js';
import { CleanupService } from './services/cleanup-service/index.js';

// 加载环境变量
dotenv.config();

class NewsAggregatorApp {
  constructor() {
    this.app = express();
    this.configService = new ConfigService();
    this.services = {};
    this.isShuttingDown = false;
  }

  /**
   * 初始化应用
   */
  async initialize() {
    try {
      logger.info('🚀 启动新闻聚合系统...');

      // 初始化配置服务
      await this.configService.initialize();

      // 配置Express中间件
      this.setupMiddleware();

      // 初始化所有服务
      await this.initializeServices();

      // 设置路由
      this.setupRoutes();

      // 设置错误处理
      this.setupErrorHandling();

      // 启动服务器
      await this.startServer();

      // 启动调度服务
      await this.startScheduler();

      logger.info('✅ 新闻聚合系统启动成功');

    } catch (error) {
      logger.error('❌ 系统启动失败:', error);
      process.exit(1);
    }
  }

  /**
   * 设置Express中间件
   */
  setupMiddleware() {
    // 安全中间件
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ['\'self\''],
          styleSrc: ['\'self\'', '\'unsafe-inline\''],
          scriptSrc: ['\'self\''],
          imgSrc: ['\'self\'', 'data:', 'https:'],
        },
      },
    }));

    // CORS配置
    this.app.use(cors({
      origin: this.configService.get('cors.origin', 'http://localhost:3000'),
      credentials: true,
    }));

    // 压缩响应
    this.app.use(compression());

    // 解析JSON和URL编码数据
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // 请求日志
    this.app.use((req, _res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      next();
    });
  }

  /**
   * 初始化所有服务
   */
  async initializeServices() {
    logger.info('🔧 初始化服务...');

    // 按依赖顺序初始化服务
    this.services.config = this.configService;

    // Web服务
    this.services.web = new WebService(this.configService);
    await this.services.web.initialize();

    // RSS服务
    this.services.rss = new RssService(this.configService);
    await this.services.rss.initialize();

    // 新闻服务
    this.services.news = new NewsService(this.configService, this.services.rss);
    await this.services.news.initialize();

    // AI服务
    this.services.ai = new AIService(this.configService);
    await this.services.ai.initialize();

    // 邮件服务
    this.services.email = new EmailService(this.configService, this.services.ai);
    await this.services.email.initialize();

    // 调度服务
    this.services.scheduler = new SchedulerService(this.configService);
    await this.services.scheduler.initialize();

    // 清理服务
    this.services.cleanup = new CleanupService(this.configService);
    await this.services.cleanup.initialize();

    logger.info('✅ 所有服务初始化完成');
  }

  /**
   * 设置路由
   */
  setupRoutes() {
    // 健康检查
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: Object.keys(this.services).map(key => ({
          name: key,
          status: this.services[key].getStatus ? this.services[key].getStatus() : 'unknown',
        })),
      });
    });

    // API路由
    this.app.use('/api', this.services.web.getRouter());

    // 静态文件服务
    this.app.use(express.static('src/web/public'));

    // 前端路由
    this.app.get('*', (req, res) => {
      res.sendFile('src/web/public/index.html');
    });
  }

  /**
   * 设置错误处理
   */
  setupErrorHandling() {
    // 404处理
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `路径 ${req.originalUrl} 不存在`,
      });
    });

    // 全局错误处理
    this.app.use((error, req, res, _next) => {
      logger.error('应用错误:', error);

      // 开发环境返回详细错误信息
      if (process.env.NODE_ENV === 'development') {
        res.status(500).json({
          error: 'Internal Server Error',
          message: error.message,
          stack: error.stack,
        });
      } else {
        res.status(500).json({
          error: 'Internal Server Error',
          message: '服务器内部错误',
        });
      }
    });
  }

  /**
   * 启动HTTP服务器
   */
  async startServer() {
    const port = this.configService.get('server.port', 3000);
    const host = this.configService.get('server.host', '0.0.0.0');

    return new Promise((resolve, reject) => {
      this.server = this.app.listen(port, host, () => {
        logger.info(`🌐 HTTP服务器启动成功: http://${host}:${port}`);
        resolve();
      });

      this.server.on('error', (error) => {
        logger.error('HTTP服务器启动失败:', error);
        reject(error);
      });
    });
  }

  /**
   * 启动调度服务
   */
  async startScheduler() {
    await this.services.scheduler.start();

    // 注册定时任务
    this.services.scheduler.addJob('daily-digest', '0 8 * * *', async () => {
      logger.info('📧 执行每日邮件摘要任务');
      await this.services.email.sendDailyDigest();
    });

    this.services.scheduler.addJob('rss-monitor', '*/15 * * * *', async () => {
      logger.info('📡 执行RSS源监控任务');
      await this.services.rss.monitorRSSSources();
    });

    this.services.scheduler.addJob('news-aggregation', '0 */30 * * * *', async () => {
      logger.info('📰 执行新闻聚合任务');
      await this.services.news.fetchNewsFromSources();
    });

    this.services.scheduler.addJob('data-cleanup', '0 2 * * *', async () => {
      logger.info('🧹 执行数据清理任务');
      await this.services.cleanup.performCleanup();
    });

    logger.info('⏰ 调度服务启动成功');
  }

  /**
   * 优雅关闭
   */
  async shutdown() {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    logger.info('🛑 开始关闭系统...');

    try {
      // 停止HTTP服务器
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(resolve);
        });
        logger.info('✅ HTTP服务器已关闭');
      }

      // 停止调度服务
      if (this.services.scheduler) {
        await this.services.scheduler.stop();
        logger.info('✅ 调度服务已停止');
      }

      // 按反向顺序关闭其他服务
      const serviceNames = Object.keys(this.services).reverse();
      for (const serviceName of serviceNames) {
        const service = this.services[serviceName];
        if (service && typeof service.shutdown === 'function') {
          try {
            await service.shutdown();
            logger.info(`✅ ${serviceName} 服务已关闭`);
          } catch (error) {
            logger.error(`❌ 关闭 ${serviceName} 服务失败:`, error);
          }
        }
      }

      logger.info('✅ 系统关闭完成');
      process.exit(0);

    } catch (error) {
      logger.error('❌ 系统关闭失败:', error);
      process.exit(1);
    }
  }
}

// 创建应用实例并启动
const app = new NewsAggregatorApp();

// 优雅关闭处理
process.on('SIGTERM', () => app.shutdown());
process.on('SIGINT', () => app.shutdown());

// 未捕获的异常处理
process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常:', error);
  app.shutdown();
});

process.on('unhandledRejection', (reason, _promise) => {
  logger.error('未处理的Promise拒绝:', reason);
  app.shutdown();
});

// 启动应用
app.initialize().catch(error => {
  logger.error('应用启动失败:', error);
  process.exit(1);
});

export default app;