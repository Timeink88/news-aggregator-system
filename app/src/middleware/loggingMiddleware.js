/**
 * 日志中间件
 * 提供请求日志记录、性能监控和错误追踪功能
 * 遵循Node.js最佳实践：安全性、错误处理、性能优化
 */

import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';

/**
 * 日志中间件类
 */
class LoggingMiddleware {
  constructor(config = {}) {
    this.config = {
      enableRequestLogging: config.enableRequestLogging !== false,
      enableResponseLogging: config.enableResponseLogging !== false,
      enableErrorLogging: config.enableErrorLogging !== false,
      enablePerformanceLogging: config.enablePerformanceLogging !== false,
      logSensitiveData: config.logSensitiveData !== false,
      sensitiveFields: config.sensitiveFields || [
        'password', 'token', 'secret', 'key', 'authorization',
        'cookie', 'session', 'credit_card', 'ssn'
      ],
      logLevel: config.logLevel || 'info',
      slowRequestThreshold: config.slowRequestThreshold || 1000, // 1秒
      maxLogSize: config.maxLogSize || 10 * 1024, // 10KB
      excludePaths: config.excludePaths || [
        '/health',
        '/static',
        '/favicon.ico'
      ],
      includeHeaders: config.includeHeaders !== false,
      includeBody: config.includeBody !== false,
      includeQuery: config.includeQuery !== false
    };

    // 请求统计
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      slowRequests: 0,
      averageResponseTime: 0,
      lastResetTime: Date.now()
    };

    // 慢请求记录
    this.slowRequests = [];

    // 初始化
    this.initialize();
  }

  /**
   * 初始化中间件
   */
  initialize() {
    // 定期重置统计数据
    setInterval(() => {
      this.resetStats();
    }, 24 * 60 * 60 * 1000); // 每24小时重置一次

    logger.info('日志中间件初始化完成');
  }

  /**
   * 请求日志中间件
   */
  requestLogger = (req, res, next) => {
    if (!this.config.enableRequestLogging || this.shouldExcludePath(req.path)) {
      return next();
    }

    const startTime = Date.now();
    const requestId = this.generateRequestId();

    // 添加请求ID到请求对象
    req.id = requestId;
    req.startTime = startTime;

    // 记录请求开始
    this.logRequestStart(req);

    // 响应完成事件
    res.on('finish', () => {
      const responseTime = Date.now() - startTime;
      this.logRequestEnd(req, res, responseTime);
      this.updateStats(req, res, responseTime);
    });

    next();
  };

  /**
   * 响应日志中间件
   */
  responseLogger = (req, res, next) => {
    if (!this.config.enableResponseLogging || this.shouldExcludePath(req.path)) {
      return next();
    }

    const originalJson = res.json;
    const originalSend = res.send;

    // 拦截JSON响应
    res.json = function(data) {
      this.logResponse(req, res, data);
      return originalJson.call(this, data);
    }.bind(this);

    // 拦截Send响应
    res.send = function(data) {
      this.logResponse(req, res, data);
      return originalSend.call(this, data);
    }.bind(this);

    next();
  };

  /**
   * 错误日志中间件
   */
  errorLogger = (error, req, res, next) => {
    if (!this.config.enableErrorLogging) {
      return next(error);
    }

    this.logError(error, req, res);
    next(error);
  };

  /**
   * 性能监控中间件
   */
  performanceMonitor = (req, res, next) => {
    if (!this.config.enablePerformanceLogging || this.shouldExcludePath(req.path)) {
      return next();
    }

    const startTime = Date.now();
    const memoryBefore = process.memoryUsage();

    // 监控内存使用
    const memoryInterval = setInterval(() => {
      const memoryNow = process.memoryUsage();
      const memoryDiff = {
        heapUsed: memoryNow.heapUsed - memoryBefore.heapUsed,
        heapTotal: memoryNow.heapTotal - memoryBefore.heapTotal,
        external: memoryNow.external - memoryBefore.external
      };

      if (memoryDiff.heapUsed > 10 * 1024 * 1024) { // 10MB
        logger.warn('请求内存使用过高', {
          requestId: req.id,
          path: req.path,
          memoryDiff
        });
      }
    }, 1000);

    res.on('finish', () => {
      clearInterval(memoryInterval);
      const responseTime = Date.now() - startTime;
      const memoryAfter = process.memoryUsage();

      this.logPerformance(req, res, responseTime, memoryBefore, memoryAfter);
    });

    next();
  };

  /**
   * 安全日志中间件
   */
  securityLogger = (req, res, next) => {
    // 记录可疑请求
    if (this.isSuspiciousRequest(req)) {
      logger.warn('检测到可疑请求', {
        requestId: req.id,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
        headers: this.filterSensitiveHeaders(req.headers)
      });
    }

    // 检查SQL注入尝试
    if (this.containsSqlInjection(req)) {
      logger.warn('检测到可能的SQL注入尝试', {
        requestId: req.id,
        ip: req.ip,
        path: req.path,
        query: req.query,
        body: this.filterSensitiveData(req.body)
      });
    }

    // 检查XSS尝试
    if (this.containsXss(req)) {
      logger.warn('检测到可能的XSS攻击尝试', {
        requestId: req.id,
        ip: req.ip,
        path: req.path,
        query: req.query,
        body: this.filterSensitiveData(req.body)
      });
    }

    next();
  };

  /**
   * 记录请求开始
   */
  logRequestStart(req) {
    const logData = {
      requestId: req.id,
      method: req.method,
      path: req.path,
      query: this.config.includeQuery ? req.query : undefined,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      timestamp: new Date().toISOString()
    };

    if (this.config.includeHeaders) {
      logData.headers = this.filterSensitiveHeaders(req.headers);
    }

    if (this.config.includeBody && req.body) {
      logData.body = this.filterSensitiveData(req.body);
    }

    logger.info('请求开始', logData);
  }

  /**
   * 记录请求结束
   */
  logRequestEnd(req, res, responseTime) {
    const logData = {
      requestId: req.id,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      timestamp: new Date().toISOString()
    };

    // 检查是否为慢请求
    if (responseTime > this.config.slowRequestThreshold) {
      logData.slowRequest = true;
      this.recordSlowRequest(req, res, responseTime);
    }

    // 根据状态码选择日志级别
    if (res.statusCode >= 400 && res.statusCode < 500) {
      logger.warn('请求完成 - 客户端错误', logData);
    } else if (res.statusCode >= 500) {
      logger.error('请求完成 - 服务器错误', logData);
    } else {
      logger.info('请求完成', logData);
    }
  }

  /**
   * 记录响应
   */
  logResponse(req, res, data) {
    if (!this.config.enableResponseLogging || this.shouldExcludePath(req.path)) {
      return;
    }

    const logData = {
      requestId: req.id,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      dataSize: this.getDataSize(data),
      timestamp: new Date().toISOString()
    };

    logger.debug('响应数据', logData);
  }

  /**
   * 记录错误
   */
  logError(error, req, res) {
    const logData = {
      requestId: req.id,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      timestamp: new Date().toISOString()
    };

    logger.error('请求处理错误', logData);

    // 如果是严重错误，发送警报
    if (this.isCriticalError(error)) {
      this.sendErrorAlert(logData);
    }
  }

  /**
   * 记录性能数据
   */
  logPerformance(req, res, responseTime, memoryBefore, memoryAfter) {
    const logData = {
      requestId: req.id,
      method: req.method,
      path: req.path,
      responseTime: `${responseTime}ms`,
      memoryUsage: {
        before: {
          heapUsed: `${Math.round(memoryBefore.heapUsed / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memoryBefore.heapTotal / 1024 / 1024)}MB`
        },
        after: {
          heapUsed: `${Math.round(memoryAfter.heapUsed / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memoryAfter.heapTotal / 1024 / 1024)}MB`
        },
        diff: {
          heapUsed: `${Math.round((memoryAfter.heapUsed - memoryBefore.heapUsed) / 1024)}KB`
        }
      },
      timestamp: new Date().toISOString()
    };

    logger.debug('性能数据', logData);
  }

  /**
   * 更新统计信息
   */
  updateStats(req, res, responseTime) {
    this.stats.totalRequests++;

    if (res.statusCode < 400) {
      this.stats.successfulRequests++;
    } else {
      this.stats.failedRequests++;
    }

    if (responseTime > this.config.slowRequestThreshold) {
      this.stats.slowRequests++;
    }

    // 更新平均响应时间
    const totalTime = this.stats.averageResponseTime * (this.stats.totalRequests - 1) + responseTime;
    this.stats.averageResponseTime = totalTime / this.stats.totalRequests;
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    const oldStats = { ...this.stats };
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      slowRequests: 0,
      averageResponseTime: 0,
      lastResetTime: Date.now()
    };

    logger.info('统计信息已重置', { oldStats });
  }

  /**
   * 记录慢请求
   */
  recordSlowRequest(req, res, responseTime) {
    const slowRequest = {
      requestId: req.id,
      method: req.method,
      path: req.path,
      responseTime,
      timestamp: new Date().toISOString()
    };

    this.slowRequests.push(slowRequest);

    // 保持最近100个慢请求
    if (this.slowRequests.length > 100) {
      this.slowRequests.shift();
    }

    logger.warn('检测到慢请求', slowRequest);
  }

  /**
   * 过滤敏感数据
   */
  filterSensitiveData(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const filtered = {};
    for (const key in data) {
      if (this.config.sensitiveFields.some(field =>
        key.toLowerCase().includes(field.toLowerCase())
      )) {
        filtered[key] = '[FILTERED]';
      } else if (typeof data[key] === 'object' && data[key] !== null) {
        filtered[key] = this.filterSensitiveData(data[key]);
      } else {
        filtered[key] = data[key];
      }
    }

    return filtered;
  }

  /**
   * 过滤敏感头部
   */
  filterSensitiveHeaders(headers) {
    const filtered = {};
    for (const key in headers) {
      if (this.config.sensitiveFields.some(field =>
        key.toLowerCase().includes(field.toLowerCase())
      )) {
        filtered[key] = '[FILTERED]';
      } else {
        filtered[key] = headers[key];
      }
    }

    return filtered;
  }

  /**
   * 检查是否应该排除路径
   */
  shouldExcludePath(path) {
    return this.config.excludePaths.some(excludePath =>
      path.startsWith(excludePath)
    );
  }

  /**
   * 检查是否为可疑请求
   */
  isSuspiciousRequest(req) {
    // 检查User-Agent
    const userAgent = req.get('User-Agent');
    if (!userAgent || userAgent.length < 10) {
      return true;
    }

    // 检查请求方法
    if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      return true;
    }

    // 检查路径长度
    if (req.path.length > 500) {
      return true;
    }

    return false;
  }

  /**
   * 检查是否包含SQL注入
   */
  containsSqlInjection(req) {
    const patterns = [
      /(\s|^)(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|UNION|EXEC)(\s|$)/i,
      /(\s|^)(FROM|INTO|WHERE|SET|VALUES)(\s|$)/i,
      /[';]/
    ];

    const checkString = (str) => {
      if (typeof str !== 'string') return false;
      return patterns.some(pattern => pattern.test(str));
    };

    // 检查查询参数
    for (const key in req.query) {
      if (checkString(req.query[key])) return true;
    }

    // 检查请求体
    for (const key in req.body) {
      if (checkString(req.body[key])) return true;
    }

    return false;
  }

  /**
   * 检查是否包含XSS
   */
  containsXss(req) {
    const patterns = [
      /<script[^>]*>.*?<\/script>/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /<\?php/i,
      /<%.*%>/
    ];

    const checkString = (str) => {
      if (typeof str !== 'string') return false;
      return patterns.some(pattern => pattern.test(str));
    };

    // 检查查询参数
    for (const key in req.query) {
      if (checkString(req.query[key])) return true;
    }

    // 检查请求体
    for (const key in req.body) {
      if (checkString(req.body[key])) return true;
    }

    return false;
  }

  /**
   * 检查是否为严重错误
   */
  isCriticalError(error) {
    const criticalErrorTypes = [
      'Error',
      'TypeError',
      'ReferenceError',
      'SyntaxError'
    ];

    return criticalErrorTypes.includes(error.name) ||
           error.message.includes('memory') ||
           error.message.includes('disk') ||
           error.message.includes('database');
  }

  /**
   * 发送错误警报
   */
  sendErrorAlert(errorData) {
    // 这里可以集成邮件、Slack等通知服务
    logger.error('发送错误警报', errorData);
  }

  /**
   * 获取数据大小
   */
  getDataSize(data) {
    if (!data) return 0;
    return JSON.stringify(data).length;
  }

  /**
   * 生成请求ID
   */
  generateRequestId() {
    return uuidv4();
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      uptime: Date.now() - this.stats.lastResetTime,
      slowRequests: this.slowRequests.length,
      config: {
        enableRequestLogging: this.config.enableRequestLogging,
        enableResponseLogging: this.config.enableResponseLogging,
        enableErrorLogging: this.config.enableErrorLogging,
        enablePerformanceLogging: this.config.enablePerformanceLogging,
        slowRequestThreshold: this.config.slowRequestThreshold
      }
    };
  }

  /**
   * 获取慢请求列表
   */
  getSlowRequests(limit = 10) {
    return this.slowRequests.slice(-limit);
  }
}

export default LoggingMiddleware;