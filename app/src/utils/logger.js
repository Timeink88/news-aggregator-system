/**
 * 日志工具模块
 * 提供统一的日志记录功能
 */

import winston from 'winston';
import path from 'path';
import fs from 'fs';

// 确保日志目录存在
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss',
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// 开发环境格式
const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss',
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

// 创建Winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'news-aggregator' },
  transports: [
    // 错误日志文件
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // 组合日志文件
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// 开发环境添加控制台输出
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: devFormat,
  }));
}

// 创建服务特定的logger工厂
export function createServiceLogger(serviceName) {
  return logger.child({ service: serviceName });
}

// 性能监控logger
export const performanceLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  defaultMeta: { service: 'performance' },
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'performance.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 3,
    }),
  ],
});

// 安全事件logger
export const securityLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  defaultMeta: { service: 'security' },
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'security.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 3,
    }),
  ],
});

// 审计日志logger
export const auditLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  defaultMeta: { service: 'audit' },
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'audit.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 3,
    }),
  ],
});

// 性能监控装饰器
export function logPerformance(target, propertyKey, descriptor) {
  const originalMethod = descriptor.value;

  descriptor.value = async function(...args) {
    const start = performance.now();
    const serviceName = this.constructor.name;
    const methodName = propertyKey;

    try {
      const result = await originalMethod.apply(this, args);
      const duration = performance.now() - start;

      performanceLogger.info('Method execution completed', {
        service: serviceName,
        method: methodName,
        duration: Math.round(duration),
        argsCount: args.length,
      });

      return result;
    } catch (error) {
      const duration = performance.now() - start;

      performanceLogger.error('Method execution failed', {
        service: serviceName,
        method: methodName,
        duration: Math.round(duration),
        error: error.message,
      });

      throw error;
    }
  };

  return descriptor;
}

// 错误处理工具
export function logError(error, context = {}) {
  logger.error('Application error', {
    error: error.message,
    stack: error.stack,
    ...context,
  });
}

// 性能测量工具
export function measureTime(name) {
  const start = performance.now();

  return {
    end: (additionalContext = {}) => {
      const duration = performance.now() - start;
      performanceLogger.info('Time measurement', {
        name,
        duration: Math.round(duration),
        ...additionalContext,
      });
      return duration;
    },
  };
}

// 批量操作日志
export function logBatchOperation(operation, total, success, failed, duration) {
  logger.info('Batch operation completed', {
    operation,
    total,
    success,
    failed,
    duration: Math.round(duration),
    successRate: Math.round((success / total) * 100),
  });
}

export default logger;