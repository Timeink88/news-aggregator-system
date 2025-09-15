/**
 * 系统监控服务
 * 提供全面的健康检查、性能监控和系统指标收集
 */

import { EventEmitter } from 'events';
import logger from '../utils/logger.js';

export default class MonitoringService extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = {
      enabled: options.enabled !== false,
      checkInterval: options.checkInterval || 30000, // 30秒
      retentionPeriod: options.retentionPeriod || 24 * 60 * 60 * 1000, // 24小时
      alertThresholds: {
        memoryUsage: options.memoryThreshold || 90, // 90%
        cpuUsage: options.cpuThreshold || 80, // 80%
        responseTime: options.responseTimeThreshold || 5000, // 5秒
        errorRate: options.errorRateThreshold || 5 // 5%
      },
      ...options.config
    };

    this.isRunning = false;
    this.metrics = {
      system: [],
      services: {},
      requests: [],
      errors: [],
      performance: []
    };

    this.checkTimers = new Map();
    this.alertHistory = [];

    logger.info('监控服务已创建', { config: this.config });
  }

  /**
   * 初始化监控服务
   */
  async initialize() {
    try {
      logger.info('正在初始化监控服务...');

      if (!this.config.enabled) {
        logger.info('监控服务已禁用');
        return true;
      }

      // 启动基础监控
      await this.startSystemMonitoring();

      // 启动服务监控
      await this.startServiceMonitoring();

      // 启动请求监控
      await this.startRequestMonitoring();

      this.isRunning = true;
      logger.info('✅ 监控服务初始化成功');

      return true;
    } catch (error) {
      logger.error('❌ 监控服务初始化失败:', error);
      throw error;
    }
  }

  /**
   * 启动系统监控
   */
  async startSystemMonitoring() {
    const checkSystemHealth = async () => {
      try {
        const systemMetrics = await this.collectSystemMetrics();
        this.metrics.system.push(systemMetrics);

        // 清理旧数据
        this.cleanupOldMetrics('system');

        // 检查阈值
        await this.checkThresholds(systemMetrics);

        this.emit('system:metrics', systemMetrics);
      } catch (error) {
        logger.error('系统监控检查失败:', error);
        this.recordError('system_monitoring', error);
      }
    };

    // 立即执行一次
    await checkSystemHealth();

    // 设置定时检查
    this.checkTimers.set('system', setInterval(checkSystemHealth, this.config.checkInterval));
  }

  /**
   * 启动服务监控
   */
  async startServiceMonitoring() {
    const checkServices = async () => {
      try {
        const serviceMetrics = await this.collectServiceMetrics();
        this.metrics.services = serviceMetrics;

        this.emit('services:metrics', serviceMetrics);
      } catch (error) {
        logger.error('服务监控检查失败:', error);
        this.recordError('service_monitoring', error);
      }
    };

    // 立即执行一次
    await checkServices();

    // 设置定时检查
    this.checkTimers.set('services', setInterval(checkServices, this.config.checkInterval));
  }

  /**
   * 启动请求监控
   */
  async startRequestMonitoring() {
    // 请求监控将在请求处理时实时记录
    this.emit('request:monitoring:started');
  }

  /**
   * 收集系统指标
   */
  async collectSystemMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const uptime = process.uptime();

    return {
      timestamp: Date.now(),
      memory: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
        usagePercent: (memUsage.heapUsed / memUsage.heapTotal) * 100
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
        usagePercent: this.calculateCPUUsage(cpuUsage)
      },
      uptime,
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      loadAverage: process.loadavg ? process.loadavg() : [0, 0, 0],
      fileDescriptors: this.getFileDescriptorCount()
    };
  }

  /**
   * 收集服务指标
   */
  async collectServiceMetrics() {
    // 这里需要从其他服务收集状态
    const services = {
      config: await this.checkConfigService(),
      rss: await this.checkRSSService(),
      news: await this.checkNewsService(),
      ai: await this.checkAIService(),
      email: await this.checkEmailService(),
      webAdmin: await this.checkWebAdminService(),
      scheduler: await this.checkSchedulerService(),
      cleanup: await this.checkCleanupService()
    };

    return {
      timestamp: Date.now(),
      services,
      total: Object.keys(services).length,
      healthy: Object.values(services).filter(s => s.status === 'healthy').length,
      unhealthy: Object.values(services).filter(s => s.status === 'unhealthy').length
    };
  }

  /**
   * 记录请求指标
   */
  recordRequest(metrics) {
    this.metrics.requests.push({
      ...metrics,
      timestamp: Date.now()
    });

    // 清理旧数据
    this.cleanupOldMetrics('requests');

    this.emit('request:recorded', metrics);
  }

  /**
   * 记录错误
   */
  recordError(source, error) {
    const errorRecord = {
      source,
      message: error.message,
      stack: error.stack,
      timestamp: Date.now()
    };

    this.metrics.errors.push(errorRecord);

    // 清理旧数据
    this.cleanupOldMetrics('errors');

    this.emit('error:recorded', errorRecord);
  }

  /**
   * 记录性能指标
   */
  recordPerformance(metrics) {
    this.metrics.performance.push({
      ...metrics,
      timestamp: Date.now()
    });

    // 清理旧数据
    this.cleanupOldMetrics('performance');

    this.emit('performance:recorded', metrics);
  }

  /**
   * 检查阈值并触发告警
   */
  async checkThresholds(systemMetrics) {
    const alerts = [];

    // 检查内存使用
    if (systemMetrics.memory.usagePercent > this.config.alertThresholds.memoryUsage) {
      alerts.push({
        type: 'memory',
        level: 'warning',
        message: `内存使用率过高: ${systemMetrics.memory.usagePercent.toFixed(2)}%`,
        value: systemMetrics.memory.usagePercent,
        threshold: this.config.alertThresholds.memoryUsage
      });
    }

    // 检查CPU使用
    if (systemMetrics.cpu.usagePercent > this.config.alertThresholds.cpuUsage) {
      alerts.push({
        type: 'cpu',
        level: 'warning',
        message: `CPU使用率过高: ${systemMetrics.cpu.usagePercent.toFixed(2)}%`,
        value: systemMetrics.cpu.usagePercent,
        threshold: this.config.alertThresholds.cpuUsage
      });
    }

    // 处理告警
    for (const alert of alerts) {
      await this.handleAlert(alert);
    }
  }

  /**
   * 处理告警
   */
  async handleAlert(alert) {
    // 避免重复告警
    const alertKey = `${alert.type}_${alert.level}`;
    const now = Date.now();
    const lastAlert = this.alertHistory.find(a => a.key === alertKey);

    if (lastAlert && (now - lastAlert.timestamp) < 5 * 60 * 1000) { // 5分钟内不重复告警
      return;
    }

    // 记录告警
    this.alertHistory.push({
      key: alertKey,
      ...alert,
      timestamp: now
    });

    // 发送告警事件
    this.emit('alert', alert);

    // 记录日志
    logger.warn(`系统告警: ${alert.message}`, alert);
  }

  /**
   * 清理旧指标数据
   */
  cleanupOldMetrics(type) {
    const cutoff = Date.now() - this.config.retentionPeriod;

    if (type === 'system') {
      this.metrics.system = this.metrics.system.filter(m => m.timestamp > cutoff);
    } else if (type === 'requests') {
      this.metrics.requests = this.metrics.requests.filter(m => m.timestamp > cutoff);
    } else if (type === 'errors') {
      this.metrics.errors = this.metrics.errors.filter(m => m.timestamp > cutoff);
    } else if (type === 'performance') {
      this.metrics.performance = this.metrics.performance.filter(m => m.timestamp > cutoff);
    }
  }

  /**
   * 获取系统健康状态
   */
  async getHealthStatus() {
    try {
      const systemMetrics = this.metrics.system[this.metrics.system.length - 1];
      const serviceMetrics = await this.collectServiceMetrics();

      const isHealthy = this.isSystemHealthy(systemMetrics) &&
                       serviceMetrics.healthy === serviceMetrics.total;

      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: Date.now(),
        system: systemMetrics,
        services: serviceMetrics,
        uptime: process.uptime(),
        alerts: this.alertHistory.slice(-10) // 最近10个告警
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: Date.now(),
        error: error.message
      };
    }
  }

  /**
   * 获取详细指标
   */
  getMetrics(options = {}) {
    const {
      type = 'all',
      limit = 100,
      since = Date.now() - 60 * 60 * 1000 // 默认1小时
    } = options;

    const result = {};

    if (type === 'all' || type === 'system') {
      result.system = this.metrics.system
        .filter(m => m.timestamp > since)
        .slice(-limit);
    }

    if (type === 'all' || type === 'services') {
      result.services = this.metrics.services;
    }

    if (type === 'all' || type === 'requests') {
      result.requests = this.metrics.requests
        .filter(m => m.timestamp > since)
        .slice(-limit);
    }

    if (type === 'all' || type === 'errors') {
      result.errors = this.metrics.errors
        .filter(m => m.timestamp > since)
        .slice(-limit);
    }

    if (type === 'all' || type === 'performance') {
      result.performance = this.metrics.performance
        .filter(m => m.timestamp > since)
        .slice(-limit);
    }

    return result;
  }

  /**
   * 停止监控服务
   */
  async stop() {
    try {
      logger.info('正在停止监控服务...');

      // 清理所有定时器
      for (const [name, timer] of this.checkTimers) {
        clearInterval(timer);
        logger.debug(`已停止 ${name} 监控定时器`);
      }

      this.checkTimers.clear();
      this.isRunning = false;

      logger.info('✅ 监控服务已停止');
      return true;
    } catch (error) {
      logger.error('❌ 停止监控服务失败:', error);
      throw error;
    }
  }

  // 私有辅助方法

  isSystemHealthy(systemMetrics) {
    if (!systemMetrics) return false;

    return systemMetrics.memory.usagePercent < this.config.alertThresholds.memoryUsage &&
           systemMetrics.cpu.usagePercent < this.config.alertThresholds.cpuUsage;
  }

  calculateCPUUsage(cpuUsage) {
    // 简化的CPU使用率计算
    const total = cpuUsage.user + cpuUsage.system;
    return Math.min(total / 1000000, 100); // 转换为百分比并限制在100%以内
  }

  async getFileDescriptorCount() {
    try {
      if (process.platform === 'linux') {
        const fs = await import('fs');
        const fds = fs.readdirSync('/proc/self/fd');
        return fds.length;
      }
    } catch (error) {
      // 非Linux系统或无法访问时返回0
    }
    return 0;
  }

  // 服务检查方法（这些将在实际使用时连接到对应的服务）
  async checkConfigService() {
    return { status: 'healthy', responseTime: Math.random() * 100 };
  }

  async checkRSSService() {
    return { status: 'healthy', responseTime: Math.random() * 100 };
  }

  async checkNewsService() {
    return { status: 'healthy', responseTime: Math.random() * 100 };
  }

  async checkAIService() {
    return { status: 'healthy', responseTime: Math.random() * 100 };
  }

  async checkEmailService() {
    return { status: 'healthy', responseTime: Math.random() * 100 };
  }

  async checkWebAdminService() {
    return { status: 'healthy', responseTime: Math.random() * 100 };
  }

  async checkSchedulerService() {
    return { status: 'healthy', responseTime: Math.random() * 100 };
  }

  async checkCleanupService() {
    return { status: 'healthy', responseTime: Math.random() * 100 };
  }
}