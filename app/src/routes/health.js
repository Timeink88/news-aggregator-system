/**
 * 健康检查和监控路由
 * 提供系统健康状态、性能指标和监控数据的API接口
 */

import express from 'express';
import { createMonitoringMiddleware, createRateLimitMiddleware } from '../middleware/monitoring.js';
import logger from '../utils/logger.js';

const router = express.Router();

// 健康检查路由 - 提供基础的系统健康状态
router.get('/', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: '1.0.0',
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version
    };

    // 检查内存使用率
    const memUsage = process.memoryUsage();
    const memoryUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    // 如果内存使用率超过90%，标记为warning
    if (memoryUsagePercent > 90) {
      health.status = 'warning';
      health.warnings = [`内存使用率过高: ${memoryUsagePercent.toFixed(2)}%`];
    }

    // 如果内存使用率超过95%，标记为unhealthy
    if (memoryUsagePercent > 95) {
      health.status = 'unhealthy';
      health.errors = [`内存使用率过高: ${memoryUsagePercent.toFixed(2)}%`];
    }

    // 根据请求参数返回不同级别的详情
    if (req.query.detailed === 'true') {
      health.detailed = {
        memory: {
          rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
          heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
          external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
          usagePercent: memoryUsagePercent.toFixed(2)
        },
        cpu: process.cpuUsage(),
        loadAverage: process.loadavg ? process.loadavg() : [0, 0, 0]
      };
    }

    // 设置状态码
    const statusCode = health.status === 'healthy' ? 200 :
      health.status === 'warning' ? 200 : 503;

    res.status(statusCode).json({
      success: true,
      message: '健康检查完成',
      data: health
    });
  } catch (error) {
    logger.error('健康检查失败:', error);
    res.status(503).json({
      success: false,
      message: '健康检查失败',
      error: error.message
    });
  }
});

// 详细的系统信息路由
router.get('/system', (req, res) => {
  try {
    const systemInfo = {
      node: {
        version: process.version,
        platform: process.platform,
        arch: process.arch
      },
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      cpu: process.cpuUsage(),
      loadAverage: process.loadavg ? process.loadavg() : [0, 0, 0],
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      message: '系统信息获取成功',
      data: systemInfo
    });
  } catch (error) {
    logger.error('获取系统信息失败:', error);
    res.status(500).json({
      success: false,
      message: '获取系统信息失败',
      error: error.message
    });
  }
});

// 内存使用情况路由
router.get('/memory', (req, res) => {
  try {
    const memUsage = process.memoryUsage();
    const memoryInfo = {
      rss: {
        value: memUsage.rss,
        formatted: `${Math.round(memUsage.rss / 1024 / 1024)}MB`
      },
      heapTotal: {
        value: memUsage.heapTotal,
        formatted: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`
      },
      heapUsed: {
        value: memUsage.heapUsed,
        formatted: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`
      },
      external: {
        value: memUsage.external,
        formatted: `${Math.round(memUsage.external / 1024 / 1024)}MB`
      },
      usagePercent: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      message: '内存信息获取成功',
      data: memoryInfo
    });
  } catch (error) {
    logger.error('获取内存信息失败:', error);
    res.status(500).json({
      success: false,
      message: '获取内存信息失败',
      error: error.message
    });
  }
});

// 活跃度检查路由 - 用于负载均衡器的活跃度检测
router.get('/live', (req, res) => {
  try {
    // 简单的活跃度检查，只返回200状态
    res.status(200).send('OK');
  } catch (error) {
    res.status(503).send('NOT OK');
  }
});

// 就绪度检查路由 - 用于检查服务是否准备好接收请求
router.get('/ready', async (req, res) => {
  try {
    // 检查关键依赖
    const checks = {
      database: true, // 这里应该添加实际的数据库连接检查
      redis: true,    // 这里应该添加实际的Redis连接检查
      externalServices: true // 这里应该添加外部服务检查
    };

    const isReady = Object.values(checks).every(check => check === true);

    if (isReady) {
      res.status(200).json({
        status: 'ready',
        checks,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        status: 'not ready',
        checks,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 综合诊断信息路由
router.get('/diagnostics', async (req, res) => {
  try {
    const diagnostics = {
      timestamp: new Date().toISOString(),
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      },
      system: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        loadAverage: process.loadavg ? process.loadavg() : [0, 0, 0]
      },
      environment: Object.keys(process.env)
        .filter(key => key.startsWith('NEWS_') || key.startsWith('NODE_') || key.startsWith('SUPABASE_'))
        .reduce((obj, key) => {
          obj[key] = process.env[key] ? '[REDACTED]' : undefined;
          return obj;
        }, {}),
      health: 'healthy'
    };

    // 内存健康检查
    const memUsage = process.memoryUsage();
    const memoryUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    if (memoryUsagePercent > 90) {
      diagnostics.health = 'warning';
      diagnostics.warnings = [`内存使用率过高: ${memoryUsagePercent.toFixed(2)}%`];
    }

    res.json({
      success: true,
      message: '诊断信息获取成功',
      data: diagnostics
    });
  } catch (error) {
    logger.error('获取诊断信息失败:', error);
    res.status(500).json({
      success: false,
      message: '获取诊断信息失败',
      error: error.message
    });
  }
});

export default router;