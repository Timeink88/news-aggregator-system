/**
 * 全局错误处理器
 * 提供统一的错误分类、处理和报告功能
 */

import logger from './logger.js';

/**
 * 错误类型枚举
 */
export const ErrorType = {
  DATABASE: 'DATABASE_ERROR',
  API: 'API_ERROR',
  NETWORK: 'NETWORK_ERROR',
  AUTHENTICATION: 'AUTH_ERROR',
  AUTHORIZATION: 'AUTHZ_ERROR',
  VALIDATION: 'VALIDATION_ERROR',
  CONFIGURATION: 'CONFIG_ERROR',
  SERVICE: 'SERVICE_ERROR',
  EXTERNAL: 'EXTERNAL_ERROR',
  UNKNOWN: 'UNKNOWN_ERROR'
};

/**
 * 错误严重级别
 */
export const ErrorSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * 应用错误类
 */
export class AppError extends Error {
  constructor(message, type = ErrorType.UNKNOWN, severity = ErrorSeverity.MEDIUM, context = {}) {
    super(message);
    this.name = this.constructor.name;
    this.type = type;
    this.severity = severity;
    this.context = context;
    this.timestamp = new Date().toISOString();
    this.id = this.generateErrorId();

    // 确保堆栈跟踪被正确捕获
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * 生成唯一错误ID
   */
  generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 转换为JSON
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      message: this.message,
      type: this.type,
      severity: this.severity,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

/**
 * 数据库错误
 */
export class DatabaseError extends AppError {
  constructor(message, operation, table, context = {}) {
    super(message, ErrorType.DATABASE, ErrorSeverity.HIGH, {
      operation,
      table,
      ...context
    });
    this.name = 'DatabaseError';
  }
}

/**
 * API错误
 */
export class APIError extends AppError {
  constructor(message, endpoint, statusCode, context = {}) {
    super(message, ErrorType.API, ErrorSeverity.MEDIUM, {
      endpoint,
      statusCode,
      ...context
    });
    this.name = 'APIError';
    this.statusCode = statusCode;
  }
}

/**
 * 网络错误
 */
export class NetworkError extends AppError {
  constructor(message, url, context = {}) {
    super(message, ErrorType.NETWORK, ErrorSeverity.MEDIUM, {
      url,
      ...context
    });
    this.name = 'NetworkError';
  }
}

/**
 * 认证错误
 */
export class AuthenticationError extends AppError {
  constructor(message, userId, context = {}) {
    super(message, ErrorType.AUTHENTICATION, ErrorSeverity.HIGH, {
      userId,
      ...context
    });
    this.name = 'AuthenticationError';
  }
}

/**
 * 验证错误
 */
export class ValidationError extends AppError {
  constructor(message, field, value, context = {}) {
    super(message, ErrorType.VALIDATION, ErrorSeverity.LOW, {
      field,
      value,
      ...context
    });
    this.name = 'ValidationError';
  }
}

/**
 * 配置错误
 */
export class ConfigurationError extends AppError {
  constructor(message, configKey, context = {}) {
    super(message, ErrorType.CONFIGURATION, ErrorSeverity.CRITICAL, {
      configKey,
      ...context
    });
    this.name = 'ConfigurationError';
  }
}

/**
 * 全局错误处理器类
 */
export class ErrorHandler {
  constructor() {
    this.errorCallbacks = new Map();
    this.errorStats = {
      total: 0,
      byType: {},
      bySeverity: {},
      recent: []
    };
    this.setupGlobalHandlers();
  }

  /**
   * 设置全局错误处理器
   */
  setupGlobalHandlers() {
    // 未捕获的异常
    process.on('uncaughtException', (error) => {
      this.handleError(new AppError(
        `未捕获的异常: ${error.message}`,
        ErrorType.UNKNOWN,
        ErrorSeverity.CRITICAL,
        { stack: error.stack, originalError: error }
      ));

      // 给系统2秒时间完成清理工作
      setTimeout(() => {
        process.exit(1);
      }, 2000);
    });

    // 未处理的Promise拒绝
    process.on('unhandledRejection', (reason, promise) => {
      this.handleError(new AppError(
        `未处理的Promise拒绝: ${reason}`,
        ErrorType.UNKNOWN,
        ErrorSeverity.HIGH,
        { reason, promise }
      ));
    });
  }

  /**
   * 注册错误回调
   */
  registerCallback(type, callback) {
    if (!this.errorCallbacks.has(type)) {
      this.errorCallbacks.set(type, []);
    }
    this.errorCallbacks.get(type).push(callback);
  }

  /**
   * 处理错误
   */
  handleError(error) {
    // 如果不是AppError实例，包装它
    const appError = error instanceof AppError ? error : new AppError(
      error.message || '未知错误',
      ErrorType.UNKNOWN,
      ErrorSeverity.MEDIUM,
      { originalError: error }
    );

    // 更新统计
    this.updateStats(appError);

    // 记录错误
    this.logError(appError);

    // 执行回调
    this.executeCallbacks(appError);

    return appError;
  }

  /**
   * 记录错误
   */
  logError(error) {
    const logData = {
      errorId: error.id,
      type: error.type,
      severity: error.severity,
      context: error.context,
      stack: error.stack
    };

    switch (error.severity) {
    case ErrorSeverity.CRITICAL:
      logger.error('🚨 严重错误', logData);
      break;
    case ErrorSeverity.HIGH:
      logger.error('⚠️ 高优先级错误', logData);
      break;
    case ErrorSeverity.MEDIUM:
      logger.warn('⚡ 中等优先级错误', logData);
      break;
    case ErrorSeverity.LOW:
      logger.info('ℹ️ 低优先级错误', logData);
      break;
    }
  }

  /**
   * 更新错误统计
   */
  updateStats(error) {
    this.errorStats.total++;

    // 按类型统计
    this.errorStats.byType[error.type] = (this.errorStats.byType[error.type] || 0) + 1;

    // 按严重级别统计
    this.errorStats.bySeverity[error.severity] = (this.errorStats.bySeverity[error.severity] || 0) + 1;

    // 最近错误列表（保留最近100个）
    this.errorStats.recent.unshift({
      id: error.id,
      type: error.type,
      severity: error.severity,
      message: error.message,
      timestamp: error.timestamp
    });

    if (this.errorStats.recent.length > 100) {
      this.errorStats.recent = this.errorStats.recent.slice(0, 100);
    }
  }

  /**
   * 执行回调
   */
  executeCallbacks(error) {
    const callbacks = this.errorCallbacks.get(error.type) || [];
    const globalCallbacks = this.errorCallbacks.get('*') || [];

    [...callbacks, ...globalCallbacks].forEach(callback => {
      try {
        callback(error);
      } catch (callbackError) {
        logger.error('错误回调执行失败', {
          errorId: error.id,
          callbackError: callbackError.message
        });
      }
    });
  }

  /**
   * 获取错误统计
   */
  getStats() {
    return { ...this.errorStats };
  }

  /**
   * 创建错误报告
   */
  createErrorReport() {
    const stats = this.getStats();
    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        totalErrors: stats.total,
        uniqueTypes: Object.keys(stats.byType).length,
        criticalErrors: stats.bySeverity[ErrorSeverity.CRITICAL] || 0
      },
      byType: stats.byType,
      bySeverity: stats.bySeverity,
      recentErrors: stats.recent.slice(0, 10), // 最近10个错误
      recommendations: this.generateRecommendations(stats)
    };

    return report;
  }

  /**
   * 生成改进建议
   */
  generateRecommendations(stats) {
    const recommendations = [];

    if (stats.byType[ErrorType.DATABASE] > 10) {
      recommendations.push('数据库错误频繁，建议检查数据库连接和查询优化');
    }

    if (stats.byType[ErrorType.API] > 20) {
      recommendations.push('API调用错误较多，建议检查外部服务可用性和重试机制');
    }

    if (stats.byType[ErrorType.NETWORK] > 15) {
      recommendations.push('网络连接问题频发，建议增强网络稳定性和超时处理');
    }

    if (stats.bySeverity[ErrorSeverity.CRITICAL] > 5) {
      recommendations.push('严重错误较多，建议立即进行系统维护和检查');
    }

    if (stats.total > 100 && Object.keys(stats.byType).length > 5) {
      recommendations.push('错误类型多样化，建议进行全面的系统健康检查');
    }

    return recommendations;
  }
}

// 创建全局错误处理器实例
export const globalErrorHandler = new ErrorHandler();

// 导出便捷函数
export const handleError = (error) => globalErrorHandler.handleError(error);
export const getErrorStats = () => globalErrorHandler.getStats();
export const createErrorReport = () => globalErrorHandler.createErrorReport();

// 默认导出
export default globalErrorHandler;