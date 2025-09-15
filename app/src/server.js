/**
 * Express.js 服务器主文件
 * 提供Web服务器基础和中间件配置
 * 遵循Node.js最佳实践：安全性、错误处理、性能优化
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import { EventEmitter } from 'events';
import logger from './utils/logger.js';
import configService from './services/ConfigManagementService.js';
import webAdminService from './services/WebAdminService.js';
import { AuthMiddleware, ValidationMiddleware, LoggingMiddleware, ErrorMiddleware } from './middleware/index.js';
import { createMonitoringMiddleware, createRateLimitMiddleware } from './middleware/monitoring.js';
import { registerRoutes } from './routes/index.js';

/**
 * Express服务器类
 */
class ExpressServer extends EventEmitter {
  constructor(options = {}) {
    super();

    this.app = express();
    this.server = null;
    this.isRunning = false;

    // 服务器配置
    this.config = {
      port: options.port || process.env.PORT || 3000,
      host: options.host || process.env.HOST || 'localhost',
      environment: process.env.NODE_ENV || 'development',
      trustProxy: options.trustProxy !== false,
      cors: {
        enabled: options.corsEnabled !== false,
        origin: options.corsOrigin || ['http://localhost:3000'],
        credentials: options.corsCredentials !== false
      },
      rateLimit: {
        enabled: options.rateLimitEnabled !== false,
        windowMs: options.rateLimitWindowMs || 15 * 60 * 1000, // 15分钟
        max: options.rateLimitMax || 100, // 限制每个IP 100个请求
        message: options.rateLimitMessage || '请求过于频繁，请稍后再试'
      },
      compression: {
        enabled: options.compressionEnabled !== false,
        threshold: options.compressionThreshold || 1024 // 1KB
      },
      security: {
        helmet: options.helmetEnabled !== false,
        hsts: options.hstsEnabled !== false,
        contentSecurityPolicy: options.cspEnabled !== false
      },
      logging: {
        enabled: options.loggingEnabled !== false,
        format: options.logFormat || 'combined',
        skip: options.logSkip || this.skipLogRoutes
      },
      static: {
        enabled: options.staticEnabled !== false,
        path: options.staticPath || './public',
        maxAge: options.staticMaxAge || '1h'
      },

      // 管理后台静态文件
      admin: {
        enabled: options.adminEnabled !== false,
        path: options.adminPath || './public/admin'
      },
      uploads: {
        enabled: options.uploadsEnabled !== false,
        path: options.uploadsPath || './uploads',
        maxFileSize: options.maxFileSize || 10 * 1024 * 1024 // 10MB
      }
    };

    // 路由配置
    this.routes = {
      api: '/api',
      admin: '/api/admin',
      health: '/health',
      monitoring: '/api/monitoring',
      static: '/static'
    };

    // 中间件配置
    this.middlewares = [];
    this.errorHandlers = [];

    // 服务器统计
    this.stats = {
      requests: 0,
      errors: 0,
      startTime: null,
      uptime: 0
    };

    // 初始化配置
    this.initializeConfig();

    // 监控服务
    this.monitoringService = null;
  }

  /**
   * 设置监控服务
   */
  setMonitoringService(monitoringService) {
    this.monitoringService = monitoringService;
    logger.info('监控服务已设置到服务器');
  }

  /**
   * 初始化配置
   */
  initializeConfig() {
    // 创建中间件实例
    this.authMiddleware = new AuthMiddleware({
      jwtSecret: process.env.JWT_SECRET,
      enableRateLimit: true
    });

    this.validationMiddleware = new ValidationMiddleware({
      strictMode: true,
      enableSanitization: true
    });

    this.loggingMiddleware = new LoggingMiddleware({
      enableRequestLogging: true,
      enablePerformanceLogging: true,
      enableErrorLogging: true
    });

    this.errorMiddleware = new ErrorMiddleware({
      enableDetailedErrors: process.env.NODE_ENV === 'development',
      enableErrorTracking: true,
      sendErrorReports: true
    });

    // 根据环境调整配置
    if (this.config.environment === 'production') {
      this.config.security.helmet = true;
      this.config.security.hsts = true;
      this.config.security.contentSecurityPolicy = true;
      this.config.logging.format = 'combined';
    } else if (this.config.environment === 'development') {
      this.config.logging.format = 'dev';
      this.config.cors.origin = ['http://localhost:3000', 'http://localhost:3001'];
    }

    logger.info('服务器配置初始化完成', {
      environment: this.config.environment,
      port: this.config.port,
      host: this.config.host
    });
  }

  /**
   * 配置中间件
   */
  setupMiddlewares() {
    logger.info('配置中间件...');

    // 核心安全中间件
    if (this.config.security.helmet) {
      this.app.use(helmet({
        contentSecurityPolicy: this.config.security.contentSecurityPolicy ? {
          directives: {
            defaultSrc: ['\'self\''],
            styleSrc: ['\'self\'', '\'unsafe-inline\''],
            scriptSrc: ['\'self\''],
            imgSrc: ['\'self\'', 'data:', 'https:'],
            connectSrc: ['\'self\'']
          }
        } : false
      }));
      logger.debug('Helmet安全中间件已启用');
    }

    // CORS中间件
    if (this.config.cors.enabled) {
      this.app.use(cors({
        origin: this.config.cors.origin,
        credentials: this.config.cors.credentials,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
      }));
      logger.debug('CORS中间件已启用');
    }

    // 请求限制中间件
    if (this.config.rateLimit.enabled) {
      const limiter = rateLimit({
        windowMs: this.config.rateLimit.windowMs,
        max: this.config.rateLimit.max,
        message: this.config.rateLimit.message,
        standardHeaders: true,
        legacyHeaders: false,
        skip: (req) => {
          // 跳过健康检查
          return req.path.startsWith('/health');
        }
      });
      this.app.use(limiter);
      logger.debug('请求限制中间件已启用');
    }

    // 基础日志中间件
    if (this.config.logging.enabled) {
      this.app.use(morgan(this.config.logging.format, {
        stream: {
          write: (message) => {
            logger.info(message.trim());
          }
        },
        skip: this.config.logging.skip
      }));
      logger.debug('基础日志中间件已启用');
    }

    // 高级日志中间件
    this.app.use(this.loggingMiddleware.requestLogger);
    this.app.use(this.loggingMiddleware.performanceMonitor);
    this.app.use(this.loggingMiddleware.securityLogger);

    // 压缩中间件
    if (this.config.compression.enabled) {
      this.app.use(compression({
        threshold: this.config.compression.threshold,
        filter: (req, res) => {
          // 不压缩某些文件类型
          if (req.headers['x-no-compression']) {
            return false;
          }
          return compression.filter(req, res);
        }
      }));
      logger.debug('压缩中间件已启用');
    }

    // 解析中间件
    this.app.use(express.json({
      limit: '10mb',
      verify: (req, res, buf) => {
        // 验证JSON大小
        if (buf.length > 10 * 1024 * 1024) {
          throw new Error('请求体过大');
        }
      }
    }));

    this.app.use(express.urlencoded({
      extended: true,
      limit: '10mb'
    }));

    this.app.use(cookieParser());

    // 静态文件中间件
    if (this.config.static.enabled) {
      this.app.use(this.routes.static, express.static(this.config.static.path, {
        maxAge: this.config.static.maxAge,
        etag: true,
        lastModified: true
      }));
      logger.debug(`静态文件中间件已启用: ${this.config.static.path}`);
    }

    // 管理后台静态文件中间件
    if (this.config.admin.enabled) {
      this.app.use('/admin', express.static(this.config.admin.path, {
        maxAge: this.config.static.maxAge,
        etag: true,
        lastModified: true
      }));
      logger.debug(`管理后台静态文件中间件已启用: ${this.config.admin.path}`);
    }

    // 自定义中间件
    this.setupCustomMiddlewares();

    // 响应日志中间件（在路由之前，错误处理之后）
    this.app.use(this.loggingMiddleware.responseLogger);

    logger.info('中间件配置完成');
  }

  /**
   * 设置自定义中间件
   */
  setupCustomMiddlewares() {
    // 请求ID中间件
    this.app.use((req, res, _next) => {
      req.id = req.headers['x-request-id'] || generateRequestId();
      res.set('X-Request-ID', req.id);
      next();
    });

    // 请求时间中间件
    this.app.use((req, res, _next) => {
      req.startTime = Date.now();
      next();
    });

    // 统计中间件
    this.app.use((req, res, _next) => {
      this.stats.requests++;
      res.on('finish', () => {
        const responseTime = Date.now() - req.startTime;
        logger.debug('请求处理完成', {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          responseTime: `${responseTime}ms`
        });
      });
      next();
    });

    // 配置中间件
    this.app.use((req, res, _next) => {
      req.config = configService;
      req.app = this.app; // 为路由提供app访问权限

      // 注册所有服务到app，供路由使用
      if (!this.app.get('configService')) {
        this.app.set('configService', configService);
      }
      if (!this.app.get('webAdminService')) {
        this.app.set('webAdminService', webAdminService);
      }

      next();
    });

    // 监控中间件
    if (this.monitoringService) {
      const monitoringMiddleware = createMonitoringMiddleware(this.monitoringService);
      this.app.use(monitoringMiddleware.requestMonitor);
    }

    // 健康检查路由将在setupRoutes中设置
  }

  /**
   * 设置路由
   */
  async setupRoutes() {
    logger.info('设置路由...');

    // 健康检查路由
    this.app.get('/health', this.healthCheck.bind(this));
    this.app.get('/health/detailed', this.detailedHealthCheck.bind(this));

    // 注册所有API路由
    registerRoutes(this.app);

    // 404处理
    this.app.use(this.handleNotFound.bind(this));

    // 根路径重定向到管理后台
    this.app.get('/', (req, res) => {
      res.redirect('/admin/');
    });

    logger.info('路由设置完成');
  }

  
  /**
   * 设置错误处理
   */
  setupErrorHandling() {
    logger.info('设置错误处理...');

    // 404错误处理
    this.app.use(this.errorMiddleware.handleNotFound);

    // 全局错误处理（必须在所有路由和其他中间件之后）
    this.app.use((err, req, res, next) => {
      this.errorMiddleware.handleError(err, req, res, next);
    });

    // 未捕获的Promise异常
    process.on('unhandledRejection', (reason, _promise) => {
      logger.error('未处理的Promise拒绝', { reason, promise });
      this.emit('error', new Error(`未处理的Promise拒绝: ${reason}`));
    });

    // 未捕获的异常
    process.on('uncaughtException', (error) => {
      logger.error('未捕获的异常', error);
      this.emit('error', error);

      // 在生产环境中，可能需要优雅地关闭服务器
      if (this.config.environment === 'production') {
        this.gracefulShutdown();
      }
    });

    logger.info('错误处理设置完成');
  }

  /**
   * 健康检查
   */
  healthCheck(req, res) {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: this.config.environment
    });
  }

  /**
   * 详细健康检查
   */
  async detailedHealthCheck(req, res) {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: this.config.environment,
        services: {},
        system: {
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version
        }
      };

      // 检查各个服务状态
      try {
        health.services.configService = configService.isRunning ? 'healthy' : 'unhealthy';
      } catch (error) {
        health.services.configService = 'unhealthy';
      }

      try {
        health.services.webAdminService = webAdminService.isRunning ? 'healthy' : 'unhealthy';
      } catch (error) {
        health.services.webAdminService = 'unhealthy';
      }

      // 计算总体健康状态
      const allHealthy = Object.values(health.services).every(status => status === 'healthy');
      health.status = allHealthy ? 'healthy' : 'degraded';

      res.status(allHealthy ? 200 : 503).json(health);

    } catch (error) {
      logger.error('详细健康检查失败:', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  }

  /**
   * 处理404错误
   */
  handleNotFound(req, res) {
    const error = {
      message: '资源未找到',
      path: req.path,
      method: req.method
    };

    if (req.path.startsWith('/api')) {
      res.status(404).json({
        success: false,
        error: 'API_ENDPOINT_NOT_FOUND',
        message: 'API端点未找到',
        details: error
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: '页面未找到',
        details: error
      });
    }
  }

  /**
   * 处理错误
   */
  handleErrors(error, req, res, next) {
    this.stats.errors++;

    logger.error('请求处理错误', {
      error: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method,
      requestId: req.id
    });

    // 验证错误
    if (error instanceof Error && error.message.includes('validation')) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '请求验证失败',
        details: error.message
      });
    }

    // 限制错误
    if (error instanceof Error && error.message.includes('too many requests')) {
      return res.status(429).json({
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message: '请求频率超限',
        details: error.message
      });
    }

    // API错误
    if (req.path.startsWith('/api')) {
      res.status(500).json({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: '内部服务器错误',
        requestId: req.id
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: '内部服务器错误',
        requestId: req.id
      });
    }
  }

  /**
   * 跳过日志路由
   */
  skipLogRoutes(req, res) {
    return req.path.startsWith('/health') || req.path.startsWith('/static');
  }

  /**
   * 启动服务器
   */
  async start() {
    try {
      logger.info('启动Express服务器...');

      // 设置中间件
      this.setupMiddlewares();

      // 设置路由
      await this.setupRoutes();

      // 设置错误处理
      this.setupErrorHandling();

      // 启动服务器
      this.server = this.app.listen(this.config.port, this.config.host, () => {
        this.stats.startTime = Date.now();
        this.isRunning = true;
        logger.info('Express服务器已启动', {
          host: this.config.host,
          port: this.config.port,
          environment: this.config.environment,
          url: `http://${this.config.host}:${this.config.port}`
        });

        this.emit('started', {
          host: this.config.host,
          port: this.config.port,
          environment: this.config.environment
        });
      });

      // 设置服务器事件监听
      this.server.on('error', this.handleServerError.bind(this));
      this.server.on('connection', this.handleConnection.bind(this));

      // 设置优雅关闭
      this.setupGracefulShutdown();

      return true;

    } catch (error) {
      logger.error('Express服务器启动失败:', error);
      throw error;
    }
  }

  /**
   * 处理服务器错误
   */
  handleServerError(error) {
    logger.error('服务器错误:', error);
    this.emit('error', error);

    if (error.code === 'EADDRINUSE') {
      logger.error(`端口 ${this.config.port} 已被占用`);
    } else if (error.code === 'EACCES') {
      logger.error(`无权限监听端口 ${this.config.port}`);
    }
  }

  /**
   * 处理连接
   */
  handleConnection(socket) {
    logger.debug('新的客户端连接', {
      remoteAddress: socket.remoteAddress,
      remotePort: socket.remotePort
    });

    socket.on('close', () => {
      logger.debug('客户端连接关闭', {
        remoteAddress: socket.remoteAddress,
        remotePort: socket.remotePort
      });
    });
  }

  /**
   * 设置优雅关闭
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      logger.info(`接收到关闭信号: ${signal}`);
      await this.gracefulShutdown();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  /**
   * 优雅关闭
   */
  async gracefulShutdown() {
    try {
      logger.info('开始优雅关闭服务器...');

      if (this.server) {
        // 停止接受新连接
        this.server.close((err) => {
          if (err) {
            logger.error('关闭服务器时出错:', err);
          } else {
            logger.info('服务器已关闭');
          }
        });

        // 强制关闭超时
        setTimeout(() => {
          logger.warn('强制关闭服务器');
          process.exit(1);
        }, 10000);
      }

      this.isRunning = false;
      this.emit('stopped');

    } catch (error) {
      logger.error('优雅关闭失败:', error);
      process.exit(1);
    }
  }

  /**
   * 获取服务器统计
   */
  getStats() {
    return {
      ...this.stats,
      uptime: this.stats.startTime ? Date.now() - this.stats.startTime : 0,
      isRunning: this.isRunning,
      config: {
        environment: this.config.environment,
        port: this.config.port,
        host: this.config.host
      },
      middleware: {
        auth: this.authMiddleware?.getStats() || null,
        validation: this.validationMiddleware?.getStats() || null,
        logging: this.loggingMiddleware?.getStats() || null,
        error: this.errorMiddleware?.getStats() || null
      }
    };
  }

  /**
   * 停止服务器
   */
  async stop() {
    try {
      await this.gracefulShutdown();
      logger.info('Express服务器已停止');
    } catch (error) {
      logger.error('停止Express服务器失败:', error);
      throw error;
    }
  }
}

/**
 * 生成请求ID
 */
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export default ExpressServer;