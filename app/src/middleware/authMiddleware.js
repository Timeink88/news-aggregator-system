/**
 * 认证中间件
 * 提供用户认证和授权功能
 * 遵循Node.js最佳实践：安全性、错误处理、性能优化
 */

import jwt from 'jsonwebtoken';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import logger from '../utils/logger.js';
import { ServiceError } from '../types/index.js';

/**
 * 认证中间件类
 */
class AuthMiddleware {
  constructor(config = {}) {
    this.config = {
      jwtSecret: config.jwtSecret || process.env.JWT_SECRET || 'your-secret-key',
      jwtExpiration: config.jwtExpiration || '24h',
      refreshTokenExpiration: config.refreshTokenExpiration || '7d',
      bcryptRounds: config.bcryptRounds || 12,
      maxLoginAttempts: config.maxLoginAttempts || 5,
      lockoutDuration: config.lockoutDuration || 15 * 60 * 1000, // 15分钟
      enableRateLimit: config.enableRateLimit !== false,
      rateLimitWindow: config.rateLimitWindow || 15 * 60 * 1000, // 15分钟
      rateLimitMax: config.rateLimitMax || 100, // 每个IP 100个请求
      sessions: config.sessions || {
        maxSessions: config.maxSessions || 5,
        sessionTimeout: config.sessionTimeout || 24 * 60 * 60 * 1000 // 24小时
      }
    };

    // 登录尝试记录
    this.loginAttempts = new Map();

    // 会话管理
    this.activeSessions = new Map();

    // 速率限制器
    this.rateLimiter = new RateLimiterMemory({
      points: this.config.rateLimitMax,
      duration: this.config.rateLimitWindow / 1000
    });

    // 初始化
    this.initialize();
  }

  /**
   * 初始化中间件
   */
  initialize() {
    // 清理过期会话
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60 * 60 * 1000); // 每小时清理一次

    logger.info('认证中间件初始化完成');
  }

  /**
   * 认证中间件
   */
  authenticate = async (req, res, next) => {
    try {
      const token = this.extractToken(req);

      if (!token) {
        return this.unauthorized(res, '缺少认证令牌');
      }

      // 验证速率限制
      if (this.config.enableRateLimit) {
        try {
          await this.rateLimiter.consume(req.ip);
        } catch (rejRes) {
          return this.tooManyRequests(res);
        }
      }

      // 验证JWT令牌
      const decoded = jwt.verify(token, this.config.jwtSecret);

      // 检查会话是否有效
      const session = this.activeSessions.get(decoded.sessionId);
      if (!session || session.userId !== decoded.userId) {
        return this.unauthorized(res, '无效的会话');
      }

      // 检查会话是否过期
      if (session.expiresAt < Date.now()) {
        this.activeSessions.delete(decoded.sessionId);
        return this.unauthorized(res, '会话已过期');
      }

      // 更新会话最后活动时间
      session.lastActivity = Date.now();

      // 将用户信息添加到请求对象
      req.user = decoded;
      req.session = session;

      logger.debug('用户认证成功', { userId: decoded.userId, sessionId: decoded.sessionId });
      next();

    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        return this.unauthorized(res, '无效的令牌');
      } else if (error.name === 'TokenExpiredError') {
        return this.unauthorized(res, '令牌已过期');
      }

      logger.error('认证过程中发生错误:', error);
      this.internalError(res, '认证失败');
    }
  };

  /**
   * 角色授权中间件
   */
  authorize = (roles = []) => {
    return (req, res, next) => {
      if (!req.user) {
        return this.unauthorized(res, '需要认证');
      }

      const userRoles = req.user.roles || [];
      const hasRequiredRole = roles.some(role => userRoles.includes(role));

      if (!hasRequiredRole) {
        return this.forbidden(res, '权限不足');
      }

      logger.debug('用户授权成功', { userId: req.user.userId, roles: userRoles });
      next();
    };
  };

  /**
   * 权限检查中间件
   */
  checkPermission = (permission) => {
    return (req, res, next) => {
      if (!req.user) {
        return this.unauthorized(res, '需要认证');
      }

      const userPermissions = req.user.permissions || [];

      if (!userPermissions.includes(permission)) {
        return this.forbidden(res, '权限不足');
      }

      logger.debug('用户权限检查通过', { userId: req.user.userId, permission });
      next();
    };
  };

  /**
   * API密钥认证中间件
   */
  authenticateApiKey = async (req, res, next) => {
    try {
      const apiKey = req.headers['x-api-key'] || req.query.api_key;

      if (!apiKey) {
        return this.unauthorized(res, '缺少API密钥');
      }

      // 这里应该验证API密钥的有效性
      // 由于没有具体的数据库表，这里只是示例
      const isValidApiKey = await this.validateApiKey(apiKey);

      if (!isValidApiKey) {
        return this.unauthorized(res, '无效的API密钥');
      }

      // 将API密钥信息添加到请求对象
      req.apiKey = apiKey;
      req.isApiKeyAuth = true;

      logger.debug('API密钥认证成功', { apiKey: `${apiKey.substring(0, 8)  }...` });
      next();

    } catch (error) {
      logger.error('API密钥认证过程中发生错误:', error);
      this.internalError(res, 'API密钥认证失败');
    }
  };

  /**
   * 登录速率限制中间件
   */
  loginRateLimit = async (req, res, next) => {
    try {
      const ip = req.ip;
      const identifier = req.body.email || req.body.username || ip;

      // 检查是否被锁定
      const lockInfo = this.loginAttempts.get(identifier);
      if (lockInfo && lockInfo.lockedUntil > Date.now()) {
        return this.tooManyRequests(res, '账户被锁定，请稍后再试');
      }

      // 检查登录尝试次数
      if (lockInfo && lockInfo.attempts >= this.config.maxLoginAttempts) {
        const lockoutTime = Date.now() + this.config.lockoutDuration;
        this.loginAttempts.set(identifier, {
          ...lockInfo,
          lockedUntil: lockoutTime
        });

        logger.warn('账户因多次失败登录被锁定', { identifier, lockoutTime });
        return this.tooManyRequests(res, '账户被锁定，请稍后再试');
      }

      next();

    } catch (error) {
      logger.error('登录速率限制检查失败:', error);
      next();
    }
  };

  /**
   * 记录登录成功
   */
  recordLoginSuccess(identifier) {
    this.loginAttempts.delete(identifier);
  }

  /**
   * 记录登录失败
   */
  recordLoginFailure(identifier) {
    const current = this.loginAttempts.get(identifier) || {
      attempts: 0,
      firstAttempt: Date.now(),
      lockedUntil: 0
    };

    this.loginAttempts.set(identifier, {
      attempts: current.attempts + 1,
      firstAttempt: current.firstAttempt,
      lockedUntil: current.lockedUntil
    });
  }

  /**
   * 创建JWT令牌
   */
  generateTokens(userId, userData = {}) {
    const sessionId = this.generateSessionId();
    const payload = {
      userId,
      sessionId,
      ...userData,
      iat: Date.now()
    };

    const accessToken = jwt.sign(payload, this.config.jwtSecret, {
      expiresIn: this.config.jwtExpiration
    });

    const refreshToken = jwt.sign(
      { userId, sessionId, type: 'refresh' },
      this.config.jwtSecret,
      { expiresIn: this.config.refreshTokenExpiration }
    );

    // 创建会话
    this.activeSessions.set(sessionId, {
      userId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      expiresAt: Date.now() + this.config.sessions.sessionTimeout,
      metadata: userData
    });

    return { accessToken, refreshToken, sessionId };
  }

  /**
   * 刷新令牌
   */
  refreshToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, this.config.jwtSecret);

      if (decoded.type !== 'refresh') {
        throw new Error('无效的刷新令牌');
      }

      const session = this.activeSessions.get(decoded.sessionId);
      if (!session || session.userId !== decoded.userId) {
        throw new Error('无效的会话');
      }

      // 生成新的访问令牌
      const newAccessToken = jwt.sign(
        {
          userId: decoded.userId,
          sessionId: decoded.sessionId,
          ...session.metadata
        },
        this.config.jwtSecret,
        { expiresIn: this.config.jwtExpiration }
      );

      return { accessToken: newAccessToken, sessionId: decoded.sessionId };

    } catch (error) {
      logger.error('令牌刷新失败:', error);
      throw new ServiceError('令牌刷新失败', 'TOKEN_REFRESH_FAILED');
    }
  }

  /**
   * 注销会话
   */
  logout(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      this.activeSessions.delete(sessionId);
      logger.info('用户会话已注销', { userId: session.userId, sessionId });
      return true;
    }
    return false;
  }

  /**
   * 注销用户所有会话
   */
  logoutAllSessions(userId) {
    let count = 0;
    for (const [sessionId, session] of this.activeSessions) {
      if (session.userId === userId) {
        this.activeSessions.delete(sessionId);
        count++;
      }
    }

    if (count > 0) {
      logger.info('用户所有会话已注销', { userId, sessionsCount: count });
    }

    return count;
  }

  /**
   * 获取用户会话列表
   */
  getUserSessions(userId) {
    const sessions = [];
    for (const [sessionId, session] of this.activeSessions) {
      if (session.userId === userId) {
        sessions.push({
          sessionId,
          createdAt: session.createdAt,
          lastActivity: session.lastActivity,
          expiresAt: session.expiresAt,
          metadata: session.metadata
        });
      }
    }
    return sessions;
  }

  /**
   * 清理过期会话
   */
  cleanupExpiredSessions() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [sessionId, session] of this.activeSessions) {
      if (session.expiresAt < now) {
        this.activeSessions.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug(`清理了 ${cleanedCount} 个过期会话`);
    }
  }

  /**
   * 提取令牌
   */
  extractToken(req) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return req.headers['x-access-token'] || req.query.token;
  }

  /**
   * 验证API密钥
   */
  async validateApiKey(apiKey) {
    // 这里应该查询数据库验证API密钥
    // 由于没有具体的表结构，这里只是示例
    return apiKey.length > 10; // 简单验证
  }

  /**
   * 生成会话ID
   */
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
  }

  /**
   * 获取认证统计信息
   */
  getStats() {
    return {
      activeSessions: this.activeSessions.size,
      loginAttempts: this.loginAttempts.size,
      rateLimitEnabled: this.config.enableRateLimit,
      config: {
        maxLoginAttempts: this.config.maxLoginAttempts,
        lockoutDuration: this.config.lockoutDuration,
        sessionTimeout: this.config.sessions.sessionTimeout
      }
    };
  }

  /**
   * 响应错误方法
   */
  unauthorized(res, message) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: message || '未授权'
    });
  }

  forbidden(res, message) {
    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: message || '禁止访问'
    });
  }

  tooManyRequests(res, message) {
    return res.status(429).json({
      success: false,
      error: 'TOO_MANY_REQUESTS',
      message: message || '请求过于频繁'
    });
  }

  internalError(res, message) {
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: message || '内部服务器错误'
    });
  }
}

export default AuthMiddleware;