/**
 * Authentication Middleware
 * 提供JWT认证和权限验证中间件
 */

import jwt from 'jsonwebtoken';
import { z } from 'zod';
import logger from '../utils/logger.js';

// 请求验证schemas
const validationSchemas = {
  createUser: z.object({
    email: z.string().email('邮箱格式不正确'),
    password: z.string().min(6, '密码长度至少6位'),
    name: z.string().min(1, '姓名不能为空'),
    role: z.enum(['admin', 'user', 'editor']).optional().default('user')
  }),

  updateUser: z.object({
    email: z.string().email('邮箱格式不正确').optional(),
    name: z.string().min(1, '姓名不能为空').optional(),
    role: z.enum(['admin', 'user', 'editor']).optional()
  }),

  rssSource: z.object({
    name: z.string().min(1, 'RSS源名称不能为空'),
    url: z.string().url('RSS源URL格式不正确'),
    category: z.string().optional(),
    description: z.string().optional(),
    updateInterval: z.number().min(60, '更新间隔至少60秒').optional()
  }),

  config: z.object({
    key: z.string().min(1, '配置键不能为空'),
    value: z.any(),
    type: z.enum(['string', 'number', 'boolean', 'object', 'array']).optional(),
    description: z.string().optional()
  })
};

/**
 * 验证请求数据
 */
export function validateRequest(schemaName) {
  return (req, res, _next) => {
    try {
      const schema = validationSchemas[schemaName];
      if (!schema) {
        throw new Error(`未知的验证schema: ${schemaName}`);
      }

      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: '请求数据验证失败',
          errors: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        });
      }

      logger.error('请求验证失败:', error);
      res.status(500).json({
        success: false,
        message: '请求验证失败',
        error: error.message
      });
    }
  };
}

/**
 * JWT认证中间件
 */
export function authenticateJWT(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: '访问令牌缺失'
      });
    }

    const webAdminService = req.app.get('webAdminService');
    const decoded = webAdminService.verifyToken(token);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: '无效的访问令牌'
      });
    }

    req.user = decoded;
    req.token = token;
    next();
  } catch (error) {
    logger.error('JWT认证失败:', error);
    res.status(401).json({
      success: false,
      message: '认证失败',
      error: error.message
    });
  }
}

/**
 * 角色授权中间件
 */
export function authorizeRoles(...roles) {
  return (req, res, _next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: '未认证用户'
        });
      }

      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: '权限不足'
        });
      }

      next();
    } catch (error) {
      logger.error('角色授权失败:', error);
      res.status(500).json({
        success: false,
        message: '授权检查失败',
        error: error.message
      });
    }
  };
}

/**
 * 可选JWT认证中间件（用于可选的认证路由）
 */
export function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const webAdminService = req.app.get('webAdminService');
      const decoded = webAdminService.verifyToken(token);

      if (decoded) {
        req.user = decoded;
        req.token = token;
      }
    }

    next();
  } catch (error) {
    logger.warn('可选认证失败:', error);
    next(); // 继续执行，但不设置用户信息
  }
}

/**
 * API密钥认证中间件
 */
export function authenticateAPIKey(req, res, next) {
  try {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API密钥缺失'
      });
    }

    const configService = req.app.get('configService');
    const validApiKey = configService.get('api.keys');

    if (!validApiKey || !Array.isArray(validApiKey) || !validApiKey.includes(apiKey)) {
      return res.status(401).json({
        success: false,
        message: '无效的API密钥'
      });
    }

    req.apiKey = apiKey;
    next();
  } catch (error) {
    logger.error('API密钥认证失败:', error);
    res.status(500).json({
      success: false,
      message: 'API密钥认证失败',
      error: error.message
    });
  }
}

/**
 * 请求限流中间件
 */
export function rateLimiter(options = {}) {
  const {
    windowMs = 15 * 60 * 1000, // 15分钟
    max = 100, // 最多100次请求
    message = '请求过于频繁，请稍后再试'
  } = options;

  const requestCounts = new Map();

  return (req, res, _next) => {
    const clientId = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const now = Date.now();

    // 清理过期的请求记录
    if (!requestCounts.has(clientId)) {
      requestCounts.set(clientId, []);
    }

    const userRequests = requestCounts.get(clientId);
    const validRequests = userRequests.filter(timestamp => now - timestamp < windowMs);
    requestCounts.set(clientId, validRequests);

    if (validRequests.length >= max) {
      return res.status(429).json({
        success: false,
        message
      });
    }

    validRequests.push(now);
    next();
  };
}

/**
 * 请求日志中间件
 */
export function requestLogger(req, res, next) {
  const startTime = Date.now();
  const { method, originalUrl, ip, headers } = req;

  // 记录请求开始
  logger.info(`${method} ${originalUrl}`, {
    ip,
    userAgent: headers['user-agent'],
    timestamp: new Date().toISOString()
  });

  // 监听响应完成
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const { statusCode } = res;

    logger.info(`${method} ${originalUrl} ${statusCode}`, {
      duration,
      ip,
      timestamp: new Date().toISOString()
    });
  });

  next();
}

/**
 * 错误处理中间件
 */
export function errorHandler(error, req, res, next) {
  logger.error('未处理的错误:', {
    error: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    user: req.user?.id
  });

  // 不暴露内部错误信息
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
}

/**
 * 404处理中间件
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: '请求的资源不存在',
    path: req.originalUrl
  });
}