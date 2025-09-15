/**
 * 中间件模块
 * 导出所有中间件类
 */

import AuthMiddleware from './authMiddleware.js';
import ValidationMiddleware from './validationMiddleware.js';
import LoggingMiddleware from './loggingMiddleware.js';
import ErrorMiddleware from './errorMiddleware.js';

// 导出中间件类
export {
  AuthMiddleware,
  ValidationMiddleware,
  LoggingMiddleware,
  ErrorMiddleware
};

// 默认导出
export default {
  AuthMiddleware,
  ValidationMiddleware,
  LoggingMiddleware,
  ErrorMiddleware
};