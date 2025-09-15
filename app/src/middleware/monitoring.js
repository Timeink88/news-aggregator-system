/**
 * 监控中间件
 * 为Express服务器提供请求监控和性能跟踪
 */

import logger from '../utils/logger.js';

export function createMonitoringMiddleware(monitoringService) {
  return {
    /**
     * 请求监控中间件
     */
    requestMonitor: (req, res, _next) => {
      const startTime = Date.now();
      const requestInfo = {
        method: req.method,
        path: req.path,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        timestamp: startTime
      };

      // 监听响应完成
      res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        const requestMetrics = {
          ...requestInfo,
          statusCode: res.statusCode,
          responseTime,
          success: res.statusCode < 400
        };

        // 记录请求指标
        if (monitoringService) {
          monitoringService.recordRequest(requestMetrics);
        }

        // 记录性能指标
        if (monitoringService) {
          monitoringService.recordPerformance({
            type: 'request',
            endpoint: `${req.method} ${req.path}`,
            responseTime,
            memory: process.memoryUsage(),
            timestamp: startTime
          });
        }

        // 记录慢请求
        if (responseTime > 1000) { // 超过1秒的请求
          logger.warn('慢请求检测', {
            method: req.method,
            path: req.path,
            responseTime: `${responseTime}ms`,
            statusCode: res.statusCode
          });
        }
      });

      next();
    },

    /**
     * 错误监控中间件
     */
    errorMonitor: (error, req, res, _next) => {
      const errorInfo = {
        message: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
        timestamp: Date.now()
      };

      // 记录错误
      if (monitoringService) {
        monitoringService.recordError('express_middleware', error);
      }

      logger.error('请求处理错误', errorInfo);

      // 继续传递给下一个错误处理器
      next(error);
    },

    /**
     * 健康检查中间件
     */
    healthCheck: async (req, res, _next) => {
      try {
        if (monitoringService) {
          const health = await monitoringService.getHealthStatus();

          if (req.query.detailed === 'true') {
            res.json(health);
          } else {
            res.json({
              status: health.status,
              timestamp: health.timestamp,
              uptime: health.uptime
            });
          }
        } else {
          res.json({
            status: 'healthy',
            timestamp: Date.now(),
            uptime: process.uptime(),
            message: 'Monitoring service not available'
          });
        }
      } catch (error) {
        res.status(503).json({
          status: 'unhealthy',
          timestamp: Date.now(),
          error: error.message
        });
      }
    },

    /**
     * 指标端点中间件
     */
    metricsEndpoint: async (req, res, _next) => {
      try {
        if (!monitoringService) {
          return res.status(503).json({
            success: false,
            message: 'Monitoring service not available'
          });
        }

        const options = {
          type: req.query.type || 'all',
          limit: parseInt(req.query.limit) || 100,
          since: req.query.since ? parseInt(req.query.since) : Date.now() - 60 * 60 * 1000
        };

        const metrics = monitoringService.getMetrics(options);

        res.json({
          success: true,
          timestamp: Date.now(),
          data: metrics
        });
      } catch (error) {
        logger.error('获取指标失败:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to fetch metrics',
          error: error.message
        });
      }
    },

    /**
     * 系统信息中间件
     */
    systemInfo: (req, res, _next) => {
      const systemInfo = {
        node: {
          version: process.version,
          platform: process.platform,
          arch: process.arch
        },
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        timestamp: Date.now()
      };

      res.json(systemInfo);
    },

    /**
     * 告警历史中间件
     */
    alertsEndpoint: async (req, res, _next) => {
      try {
        if (!monitoringService) {
          return res.status(503).json({
            success: false,
            message: 'Monitoring service not available'
          });
        }

        const limit = parseInt(req.query.limit) || 50;
        const alerts = monitoringService.alertHistory.slice(-limit);

        res.json({
          success: true,
          timestamp: Date.now(),
          data: alerts
        });
      } catch (error) {
        logger.error('获取告警历史失败:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to fetch alerts',
          error: error.message
        });
      }
    }
  };
}

/**
 * 简单的请求限流中间件
 */
export function createRateLimitMiddleware(options = {}) {
  const config = {
    windowMs: options.windowMs || 60 * 1000, // 1分钟
    max: options.max || 100, // 最大请求数
    skipSuccessfulRequests: options.skipSuccessfulRequests || false,
    ...options
  };

  const requests = new Map();

  return (req, res, _next) => {
    const clientId = req.ip || req.connection.remoteAddress;
    const now = Date.now();

    // 清理过期记录
    if (!requests.has(clientId)) {
      requests.set(clientId, []);
    }

    const clientRequests = requests.get(clientId);
    const validRequests = clientRequests.filter(time => now - time < config.windowMs);

    // 检查是否超过限制
    if (validRequests.length >= config.max) {
      return res.status(429).json({
        success: false,
        message: '请求过于频繁，请稍后再试',
        retryAfter: Math.ceil(config.windowMs / 1000)
      });
    }

    // 记录新请求
    validRequests.push(now);
    requests.set(clientId, validRequests);

    // 监听响应完成
    if (!config.skipSuccessfulRequests) {
      res.on('finish', () => {
        if (res.statusCode >= 400) {
          // 失败的请求从计数中移除
          const index = validRequests.indexOf(now);
          if (index > -1) {
            validRequests.splice(index, 1);
          }
        }
      });
    }

    next();
  };
}

/**
 * 性能监控中间件
 */
export function createPerformanceMiddleware() {
  const performanceMetrics = new Map();

  return {
    /**
     * 开始性能测量
     */
    startMeasurement: (req, res, _next) => {
      const startTime = process.hrtime();
      const startMemory = process.memoryUsage();

      res.locals.performanceMeasurement = {
        startTime,
        startMemory,
        checkpoints: []
      };

      next();
    },

    /**
     * 添加检查点
     */
    addCheckpoint: (name) => {
      return (req, res, _next) => {
        if (res.locals.performanceMeasurement) {
          const elapsed = process.hrtime(res.locals.performanceMeasurement.startTime);
          const elapsedMs = elapsed[0] * 1000 + elapsed[1] / 1000000;

          res.locals.performanceMeasurement.checkpoints.push({
            name,
            timestamp: Date.now(),
            elapsedMs,
            memory: process.memoryUsage()
          });
        }

        next();
      };
    },

    /**
     * 结束性能测量
     */
    endMeasurement: (req, res, _next) => {
      if (!res.locals.performanceMeasurement) {
        return next();
      }

      const measurement = res.locals.performanceMeasurement;
      const elapsed = process.hrtime(measurement.startTime);
      const elapsedMs = elapsed[0] * 1000 + elapsed[1] / 1000000;
      const endMemory = process.memoryUsage();

      const performanceData = {
        method: req.method,
        path: req.path,
        totalElapsedMs: elapsedMs,
        memoryDelta: {
          heapUsed: endMemory.heapUsed - measurement.startMemory.heapUsed,
          heapTotal: endMemory.heapTotal - measurement.startMemory.heapTotal
        },
        checkpoints: measurement.checkpoints,
        timestamp: Date.now()
      };

      // 存储性能数据
      const key = `${req.method} ${req.path}`;
      if (!performanceMetrics.has(key)) {
        performanceMetrics.set(key, []);
      }

      performanceMetrics.get(key).push(performanceData);

      // 记录慢请求
      if (elapsedMs > 1000) {
        logger.warn('性能警告: 慢请求', {
          method: req.method,
          path: req.path,
          elapsedMs: `${elapsedMs}ms`,
          checkpoints: measurement.checkpoints.length
        });
      }

      // 在响应头中添加性能信息
      res.set('X-Response-Time', `${elapsedMs}ms`);
      res.set('X-Memory-Delta', `${endMemory.heapUsed - measurement.startMemory.heapUsed} bytes`);

      next();
    },

    /**
     * 获取性能报告
     */
    getPerformanceReport: (req, res, _next) => {
      const report = {
        timestamp: Date.now(),
        endpoints: {}
      };

      for (const [endpoint, metrics] of performanceMetrics.entries()) {
        const recentMetrics = metrics.slice(-100); // 最近100次请求

        report.endpoints[endpoint] = {
          requestCount: recentMetrics.length,
          averageResponseTime: recentMetrics.reduce((sum, m) => sum + m.totalElapsedMs, 0) / recentMetrics.length,
          minResponseTime: Math.min(...recentMetrics.map(m => m.totalElapsedMs)),
          maxResponseTime: Math.max(...recentMetrics.map(m => m.totalElapsedMs)),
          p95ResponseTime: this.calculatePercentile(recentMetrics.map(m => m.totalElapsedMs), 95),
          averageMemoryDelta: recentMetrics.reduce((sum, m) => sum + m.memoryDelta.heapUsed, 0) / recentMetrics.length
        };
      }

      res.json(report);
    }
  };
}

// 辅助函数
function calculatePercentile(values, percentile) {
  if (values.length === 0) return 0;

  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;

  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}