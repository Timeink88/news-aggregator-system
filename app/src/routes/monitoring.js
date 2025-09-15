/**
 * 监控指标路由
 * 提供系统性能指标、错误统计和监控数据的API接口
 */

import express from 'express';
import logger from '../utils/logger.js';

const router = express.Router();

// 存储监控数据的内存存储
const monitoringData = {
  requests: [],
  errors: [],
  performance: [],
  systemMetrics: []
};

// 清理旧数据的函数
function cleanupOldData(type, retentionPeriod = 60 * 60 * 1000) {
  const cutoff = Date.now() - retentionPeriod;
  if (monitoringData[type]) {
    monitoringData[type] = monitoringData[type].filter(item => item.timestamp > cutoff);
  }
}

// 请求指标路由
router.get('/requests', (req, res) => {
  try {
    const {
      limit = 100,
      since = Date.now() - 60 * 60 * 1000, // 默认1小时
      status,
      method
    } = req.query;

    let filteredRequests = monitoringData.requests.filter(req =>
      req.timestamp > parseInt(since)
    );

    if (status) {
      filteredRequests = filteredRequests.filter(req => req.statusCode === parseInt(status));
    }

    if (method) {
      filteredRequests = filteredRequests.filter(req => req.method === method);
    }

    const limitedRequests = filteredRequests.slice(-parseInt(limit));

    // 计算统计信息
    const stats = {
      totalRequests: filteredRequests.length,
      successRate: filteredRequests.filter(req => req.statusCode < 400).length / filteredRequests.length * 100,
      averageResponseTime: filteredRequests.reduce((sum, req) => sum + req.responseTime, 0) / filteredRequests.length,
      statusDistribution: {}
    };

    // 状态码分布
    filteredRequests.forEach(req => {
      const statusGroup = Math.floor(req.statusCode / 100) * 100;
      stats.statusDistribution[statusGroup] = (stats.statusDistribution[statusGroup] || 0) + 1;
    });

    res.json({
      success: true,
      message: '请求指标获取成功',
      data: {
        requests: limitedRequests,
        stats
      }
    });
  } catch (error) {
    logger.error('获取请求指标失败:', error);
    res.status(500).json({
      success: false,
      message: '获取请求指标失败',
      error: error.message
    });
  }
});

// 错误指标路由
router.get('/errors', (req, res) => {
  try {
    const {
      limit = 50,
      since = Date.now() - 60 * 60 * 1000, // 默认1小时
      source
    } = req.query;

    let filteredErrors = monitoringData.errors.filter(err =>
      err.timestamp > parseInt(since)
    );

    if (source) {
      filteredErrors = filteredErrors.filter(err => err.source === source);
    }

    const limitedErrors = filteredErrors.slice(-parseInt(limit));

    // 计算统计信息
    const stats = {
      totalErrors: filteredErrors.length,
      errorRate: filteredErrors.length / Math.max(monitoringData.requests.filter(req => req.timestamp > parseInt(since)).length, 1) * 100,
      errorSources: {}
    };

    // 错误源分布
    filteredErrors.forEach(err => {
      stats.errorSources[err.source] = (stats.errorSources[err.source] || 0) + 1;
    });

    res.json({
      success: true,
      message: '错误指标获取成功',
      data: {
        errors: limitedErrors,
        stats
      }
    });
  } catch (error) {
    logger.error('获取错误指标失败:', error);
    res.status(500).json({
      success: false,
      message: '获取错误指标失败',
      error: error.message
    });
  }
});

// 性能指标路由
router.get('/performance', (req, res) => {
  try {
    const {
      limit = 100,
      since = Date.now() - 60 * 60 * 1000, // 默认1小时
      type
    } = req.query;

    let filteredPerformance = monitoringData.performance.filter(perf =>
      perf.timestamp > parseInt(since)
    );

    if (type) {
      filteredPerformance = filteredPerformance.filter(perf => perf.type === type);
    }

    const limitedPerformance = filteredPerformance.slice(-parseInt(limit));

    // 计算统计信息
    const stats = {
      totalOperations: filteredPerformance.length,
      averageExecutionTime: filteredPerformance.reduce((sum, perf) => sum + perf.executionTime, 0) / filteredPerformance.length,
      types: {}
    };

    // 操作类型分布
    filteredPerformance.forEach(perf => {
      if (!stats.types[perf.type]) {
        stats.types[perf.type] = {
          count: 0,
          averageTime: 0
        };
      }
      stats.types[perf.type].count++;
    });

    // 计算每种类型的平均执行时间
    Object.keys(stats.types).forEach(type => {
      const typePerf = filteredPerformance.filter(perf => perf.type === type);
      stats.types[type].averageTime = typePerf.reduce((sum, perf) => sum + perf.executionTime, 0) / typePerf.length;
    });

    res.json({
      success: true,
      message: '性能指标获取成功',
      data: {
        performance: limitedPerformance,
        stats
      }
    });
  } catch (error) {
    logger.error('获取性能指标失败:', error);
    res.status(500).json({
      success: false,
      message: '获取性能指标失败',
      error: error.message
    });
  }
});

// 系统指标路由
router.get('/system', (req, res) => {
  try {
    const {
      limit = 50,
      since = Date.now() - 60 * 60 * 1000 // 默认1小时
    } = req.query;

    const filteredSystemMetrics = monitoringData.systemMetrics.filter(metric =>
      metric.timestamp > parseInt(since)
    );

    const limitedSystemMetrics = filteredSystemMetrics.slice(-parseInt(limit));

    // 计算统计信息
    const stats = {
      totalMetrics: limitedSystemMetrics.length,
      averageMemoryUsage: limitedSystemMetrics.reduce((sum, metric) => sum + metric.memory.heapUsed, 0) / limitedSystemMetrics.length,
      averageCpuUsage: limitedSystemMetrics.reduce((sum, metric) => sum + metric.cpu.usagePercent, 0) / limitedSystemMetrics.length,
      peakMemory: Math.max(...limitedSystemMetrics.map(metric => metric.memory.heapUsed)),
      peakCpu: Math.max(...limitedSystemMetrics.map(metric => metric.cpu.usagePercent))
    };

    res.json({
      success: true,
      message: '系统指标获取成功',
      data: {
        systemMetrics: limitedSystemMetrics,
        stats
      }
    });
  } catch (error) {
    logger.error('获取系统指标失败:', error);
    res.status(500).json({
      success: false,
      message: '获取系统指标失败',
      error: error.message
    });
  }
});

// 记录请求指标的中间件函数（可以被其他模块调用）
export function recordRequestMetric(metric) {
  monitoringData.requests.push({
    ...metric,
    timestamp: Date.now()
  });
  cleanupOldData('requests');
}

// 记录错误指标的中间件函数
export function recordErrorMetric(error) {
  monitoringData.errors.push({
    message: error.message,
    stack: error.stack,
    source: error.source || 'unknown',
    timestamp: Date.now()
  });
  cleanupOldData('errors');
}

// 记录性能指标的中间件函数
export function recordPerformanceMetric(metric) {
  monitoringData.performance.push({
    ...metric,
    timestamp: Date.now()
  });
  cleanupOldData('performance');
}

// 记录系统指标的中间件函数
export function recordSystemMetric(metric) {
  monitoringData.systemMetrics.push({
    ...metric,
    timestamp: Date.now()
  });
  cleanupOldData('systemMetrics');
}

// 获取当前监控数据的函数
export function getMonitoringData() {
  return monitoringData;
}

export default router;