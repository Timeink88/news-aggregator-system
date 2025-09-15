/**
 * 错误处理中间件
 * 提供统一的错误处理和响应格式化功能
 * 遵循Node.js最佳实践：安全性、错误处理、性能优化
 */

import { AppError, ErrorType, ErrorSeverity } from '../utils/errorHandler.js';
import logger from '../utils/logger.js';

/**
 * 错误处理中间件类
 */
class ErrorMiddleware {
  constructor(config = {}) {
    this.config = {
      enableDetailedErrors: config.enableDetailedErrors !== false,
      enableErrorLogging: config.enableErrorLogging !== false,
      enableErrorTracking: config.enableErrorTracking !== false,
      showErrorStack: config.showErrorStack !== false,
      sendErrorReports: config.sendErrorReports !== false,
      errorReportThreshold: config.errorReportThreshold || 5,
      excludedErrorTypes: config.excludedErrorTypes || [
        'ValidationError',
        'NotFoundError'
      ],
      maxErrorHistory: config.maxErrorHistory || 100,
      notificationChannels: config.notificationChannels || ['log', 'email']
    };

    // 错误历史记录
    this.errorHistory = [];

    // 错误统计
    this.errorStats = {
      totalErrors: 0,
      errorsByType: {},
      errorsBySeverity: {},
      lastResetTime: Date.now()
    };

    // 初始化
    this.initialize();
  }

  /**
   * 初始化中间件
   */
  initialize() {
    // 定期清理错误历史
    setInterval(() => {
      this.cleanupErrorHistory();
    }, 60 * 60 * 1000); // 每小时清理一次

    // 定期重置统计
    setInterval(() => {
      this.resetErrorStats();
    }, 24 * 60 * 60 * 1000); // 每24小时重置一次

    // 绑定方法上下文
    this.handleError = this.handleError.bind(this);

    logger.info('错误处理中间件初始化完成');
  }

  /**
   * 全局错误处理中间件
   */
  handleError(error, req, res, next) {
    try {
      // 标准化错误对象
      const appError = this.normalizeError(error);

      // 记录错误
      if (this.config.enableErrorLogging) {
        this.logError(appError, req);
      }

      // 更新统计
      this.updateErrorStats(appError);

      // 追踪错误
      if (this.config.enableErrorTracking) {
        this.trackError(appError, req);
      }

      // 发送错误报告
      if (this.shouldSendErrorReport(appError)) {
        this.sendErrorReport(appError, req);
      }

      // 发送响应
      this.sendErrorResponse(appError, req, res);

    } catch (handlingError) {
      // 如果错误处理过程中出现错误，记录并发送基本响应
      logger.error('错误处理过程中发生错误:', handlingError);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: '内部服务器错误'
      });
    }
  }

  /**
   * 404处理中间件
   */
  handleNotFound = (req, res, next) => {
    const error = new AppError(
      `路由未找到: ${req.method} ${req.path}`,
      ErrorType.ROUTING,
      ErrorSeverity.LOW,
      {
        method: req.method,
        path: req.path,
        query: req.query,
        userAgent: req.get('User-Agent')
      }
    );

    this.handleError(error, req, res, next);
  };

  /**
   * 异常处理中间件
   */
  handleAsyncErrors = (fn) => {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  };

  /**
   * 包装异步路由处理器
   */
  wrapAsyncHandler = (fn) => {
    return (req, res, next) => {
      fn(req, res, next).catch(next);
    };
  };

  /**
   * 标准化错误对象
   */
  normalizeError(error) {
    // 检查error参数是否为null或undefined
    if (!error) {
      return new AppError(
        '未知错误',
        ErrorType.SERVICE,
        ErrorSeverity.MEDIUM,
        { originalError: null }
      );
    }

    if (error instanceof AppError) {
      return error;
    }

    // 处理Joi验证错误
    if (error.isJoi) {
      return new AppError(
        '请求数据验证失败',
        ErrorType.VALIDATION,
        ErrorSeverity.LOW,
        {
          details: error.details,
          originalError: error
        }
      );
    }

    // 处理Sequelize错误
    if (error.name === 'SequelizeValidationError') {
      return new AppError(
        '数据库验证失败',
        ErrorType.DATABASE,
        ErrorSeverity.MEDIUM,
        {
          details: error.errors,
          originalError: error
        }
      );
    }

    // 处理JWT错误
    if (error.name === 'JsonWebTokenError') {
      return new AppError(
        'JWT令牌无效',
        ErrorType.AUTHENTICATION,
        ErrorSeverity.MEDIUM,
        { originalError: error }
      );
    }

    if (error.name === 'TokenExpiredError') {
      return new AppError(
        'JWT令牌已过期',
        ErrorType.AUTHENTICATION,
        ErrorSeverity.LOW,
        { originalError: error }
      );
    }

    // 处理网络错误
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return new AppError(
        '网络连接失败',
        ErrorType.NETWORK,
        ErrorSeverity.HIGH,
        { originalError: error }
      );
    }

    // 处理文件系统错误
    if (error.code === 'ENOENT') {
      return new AppError(
        '文件未找到',
        ErrorType.FILE_SYSTEM,
        ErrorSeverity.LOW,
        { originalError: error }
      );
    }

    // 处理权限错误
    if (error.code === 'EACCES') {
      return new AppError(
        '权限不足',
        ErrorType.PERMISSION,
        ErrorSeverity.HIGH,
        { originalError: error }
      );
    }

    // 处理数据库连接错误
    if (error.code === 'ECONNREFUSED' && error.address === 'database') {
      return new AppError(
        '数据库连接失败',
        ErrorType.DATABASE,
        ErrorSeverity.CRITICAL,
        { originalError: error }
      );
    }

    // 默认错误
    return new AppError(
      error?.message || '未知错误',
      ErrorType.SERVICE,
      ErrorSeverity.MEDIUM,
      { originalError: error }
    );
  }

  /**
   * 记录错误
   */
  logError(error, req) {
    const logData = {
      error: {
        name: error.name,
        message: error.message,
        type: error.type,
        severity: error.severity,
        stack: this.config.showErrorStack ? error.stack : undefined
      },
      request: {
        id: req.id,
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      },
      timestamp: new Date().toISOString()
    };

    // 根据严重程度选择日志级别
    switch (error.severity) {
    case ErrorSeverity.CRITICAL:
      logger.error('严重错误', logData);
      break;
    case ErrorSeverity.HIGH:
      logger.error('高级错误', logData);
      break;
    case ErrorSeverity.MEDIUM:
      logger.warn('中级错误', logData);
      break;
    case ErrorSeverity.LOW:
      logger.debug('低级错误', logData);
      break;
    }
  }

  /**
   * 更新错误统计
   */
  updateErrorStats(error) {
    this.errorStats.totalErrors++;

    // 按类型统计
    if (!this.errorStats.errorsByType[error.type]) {
      this.errorStats.errorsByType[error.type] = 0;
    }
    this.errorStats.errorsByType[error.type]++;

    // 按严重程度统计
    if (!this.errorStats.errorsBySeverity[error.severity]) {
      this.errorStats.errorsBySeverity[error.severity] = 0;
    }
    this.errorStats.errorsBySeverity[error.severity]++;
  }

  /**
   * 追踪错误
   */
  trackError(error, req) {
    const errorRecord = {
      id: this.generateErrorId(),
      error: {
        name: error.name,
        message: error.message,
        type: error.type,
        severity: error.severity
      },
      request: {
        id: req.id,
        method: req.method,
        path: req.path,
        ip: req.ip
      },
      timestamp: new Date().toISOString()
    };

    this.errorHistory.push(errorRecord);

    // 保持历史记录在限制范围内
    if (this.errorHistory.length > this.config.maxErrorHistory) {
      this.errorHistory.shift();
    }
  }

  /**
   * 发送错误报告
   */
  sendErrorReport(error, req) {
    const report = {
      error: {
        name: error.name,
        message: error.message,
        type: error.type,
        severity: error.severity,
        stack: error.stack
      },
      request: {
        id: req.id,
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      },
      timestamp: new Date().toISOString()
    };

    // 根据配置的通知渠道发送报告
    if (this.config.notificationChannels.includes('log')) {
      logger.error('发送错误报告', report);
    }

    if (this.config.notificationChannels.includes('email')) {
      this.sendEmailReport(report);
    }

    if (this.config.notificationChannels.includes('webhook')) {
      this.sendWebhookReport(report);
    }
  }

  /**
   * 发送邮件报告
   */
  sendEmailReport(report) {
    // 这里应该集成邮件服务
    logger.warn('发送邮件错误报告（需要配置邮件服务）', { report });
  }

  /**
   * 发送Webhook报告
   */
  sendWebhookReport(report) {
    // 这里应该集成Webhook服务
    logger.warn('发送Webhook错误报告（需要配置Webhook服务）', { report });
  }

  /**
   * 发送错误响应
   */
  sendErrorResponse(error, req, res) {
    const response = {
      success: false,
      error: this.getErrorCode(error.type),
      message: this.getErrorMessage(error),
      timestamp: new Date().toISOString()
    };

    // 添加请求ID
    if (req.id) {
      response.requestId = req.id;
    }

    // 在开发环境中添加详细信息
    if (this.config.enableDetailedErrors && process.env.NODE_ENV === 'development') {
      response.details = {
        type: error.type,
        severity: error.severity,
        stack: error.stack
      };

      if (error.context) {
        response.details.context = error.context;
      }
    }

    // 根据错误类型设置状态码
    const statusCode = this.getStatusCode(error.type);
    res.status(statusCode).json(response);
  }

  /**
   * 获取错误代码
   */
  getErrorCode(errorType) {
    const errorCodeMap = {
      [ErrorType.VALIDATION]: 'VALIDATION_ERROR',
      [ErrorType.AUTHENTICATION]: 'AUTHENTICATION_ERROR',
      [ErrorType.AUTHORIZATION]: 'AUTHORIZATION_ERROR',
      [ErrorType.DATABASE]: 'DATABASE_ERROR',
      [ErrorType.NETWORK]: 'NETWORK_ERROR',
      [ErrorType.FILE_SYSTEM]: 'FILE_SYSTEM_ERROR',
      [ErrorType.PERMISSION]: 'PERMISSION_ERROR',
      [ErrorType.ROUTING]: 'NOT_FOUND',
      [ErrorType.SERVICE]: 'INTERNAL_SERVER_ERROR'
    };

    return errorCodeMap[errorType] || 'INTERNAL_SERVER_ERROR';
  }

  /**
   * 获取错误消息
   */
  getErrorMessage(error) {
    if (error.userMessage) {
      return error.userMessage;
    }

    const messageMap = {
      [ErrorType.VALIDATION]: '请求数据验证失败',
      [ErrorType.AUTHENTICATION]: '认证失败',
      [ErrorType.AUTHORIZATION]: '权限不足',
      [ErrorType.DATABASE]: '数据库操作失败',
      [ErrorType.NETWORK]: '网络连接失败',
      [ErrorType.FILE_SYSTEM]: '文件操作失败',
      [ErrorType.PERMISSION]: '权限不足',
      [ErrorType.ROUTING]: '资源未找到',
      [ErrorType.SERVICE]: '内部服务器错误'
    };

    return messageMap[error.type] || error.message || '未知错误';
  }

  /**
   * 获取状态码
   */
  getStatusCode(errorType) {
    const statusCodeMap = {
      [ErrorType.VALIDATION]: 400,
      [ErrorType.AUTHENTICATION]: 401,
      [ErrorType.AUTHORIZATION]: 403,
      [ErrorType.ROUTING]: 404,
      [ErrorType.NETWORK]: 503,
      [ErrorType.DATABASE]: 500,
      [ErrorType.FILE_SYSTEM]: 500,
      [ErrorType.PERMISSION]: 403,
      [ErrorType.SERVICE]: 500
    };

    return statusCodeMap[errorType] || 500;
  }

  /**
   * 检查是否应该发送错误报告
   */
  shouldSendErrorReport(error) {
    if (!this.config.sendErrorReports) {
      return false;
    }

    // 检查是否在排除列表中
    if (this.config.excludedErrorTypes.includes(error.name)) {
      return false;
    }

    // 检查错误严重程度
    if (error.severity === ErrorSeverity.CRITICAL || error.severity === ErrorSeverity.HIGH) {
      return true;
    }

    // 检查错误频率
    const errorTypeCount = this.errorStats.errorsByType[error.type] || 0;
    return errorTypeCount >= this.config.errorReportThreshold;
  }

  /**
   * 清理错误历史
   */
  cleanupErrorHistory() {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    this.errorHistory = this.errorHistory.filter(record => {
      const recordTime = new Date(record.timestamp).getTime();
      return recordTime > oneDayAgo;
    });
  }

  /**
   * 重置错误统计
   */
  resetErrorStats() {
    const oldStats = { ...this.errorStats };
    this.errorStats = {
      totalErrors: 0,
      errorsByType: {},
      errorsBySeverity: {},
      lastResetTime: Date.now()
    };

    logger.info('错误统计已重置', { oldStats });
  }

  /**
   * 生成错误ID
   */
  generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
  }

  /**
   * 获取错误统计
   */
  getStats() {
    return {
      ...this.errorStats,
      uptime: Date.now() - this.errorStats.lastResetTime,
      errorHistory: this.errorHistory.length,
      config: {
        enableDetailedErrors: this.config.enableDetailedErrors,
        enableErrorLogging: this.config.enableErrorLogging,
        enableErrorTracking: this.config.enableErrorTracking,
        maxErrorHistory: this.config.maxErrorHistory,
        errorReportThreshold: this.config.errorReportThreshold
      }
    };
  }

  /**
   * 获取错误历史
   */
  getErrorHistory(limit = 10) {
    return this.errorHistory.slice(-limit);
  }

  /**
   * 获取错误趋势
   */
  getErrorTrend(hours = 24) {
    const now = Date.now();
    const timeWindow = hours * 60 * 60 * 1000;
    const cutoffTime = now - timeWindow;

    const trend = {};
    for (let i = 0; i < hours; i++) {
      const hourStart = cutoffTime + (i * 60 * 60 * 1000);
      const hourEnd = hourStart + 60 * 60 * 1000;

      trend[i] = this.errorHistory.filter(record => {
        const recordTime = new Date(record.timestamp).getTime();
        return recordTime >= hourStart && recordTime < hourEnd;
      }).length;
    }

    return trend;
  }
}

export default ErrorMiddleware;