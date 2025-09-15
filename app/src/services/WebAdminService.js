/**
 * Web Admin Service - Web管理服务
 * 提供用户认证、权限管理、会话管理等功能
 * 遵循Node.js最佳实践：安全性、错误处理、性能优化
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import { UserQueries, SystemConfigQueries } from '../database/queries.js';
import ConfigService from './ConfigService.js';
import { RSSManagerService } from './RSSManagerService.js';
import AIAnalysisService from './AIAnalysisService.js';
import EmailService from './EmailService.js';
import { APIResponse, ServiceError } from '../types/index.js';
/**
 * Web Admin Service类
 */
class WebAdminService extends EventEmitter {
  constructor(config = {}) {
    super();

    this.isRunning = false;
    this.activeSessions = new Map();
    this.failedLoginAttempts = new Map();
    this.userPermissions = new Map();
    this.auditLog = [];
    this.systemMetrics = new Map();
    this.alertRules = new Map();

    // 服务依赖
    this.configService = config.configService || new ConfigService();
    this.rssManagerService = config.rssManagerService || new RSSManagerService();
    this.aiAnalysisService = config.aiAnalysisService || new AIAnalysisService();
    this.emailService = config.emailService || new EmailService();

    // JWT配置
    this.jwtConfig = {
      secret: config.jwtSecret || process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex'),
      expiresIn: config.jwtExpiresIn || '24h',
      refreshExpiresIn: config.refreshExpiresIn || '7d'
    };

    // 安全配置
    this.securityConfig = {
      maxLoginAttempts: config.maxLoginAttempts || 5,
      lockoutDuration: config.lockoutDuration || 15 * 60 * 1000, // 15分钟
      sessionTimeout: config.sessionTimeout || 30 * 60 * 1000, // 30分钟
      passwordMinLength: config.passwordMinLength || 8,
      requireMFA: config.requireMFA || false,
      allowedOrigins: config.allowedOrigins || ['http://localhost:3000']
    };

    // 系统监控配置
    this.monitoringConfig = {
      enabled: config.monitoringEnabled !== false,
      metricsInterval: config.metricsInterval || 60000, // 1分钟
      alertThresholds: config.alertThresholds || {
        memoryUsage: 85, // 内存使用率阈值
        cpuUsage: 80,    // CPU使用率阈值
        errorRate: 5,    // 错误率阈值（每分钟）
        responseTime: 3000 // 响应时间阈值（毫秒）
      },
      retentionPeriod: config.retentionPeriod || 7 * 24 * 60 * 60 * 1000 // 7天
    };

    // 日志管理配置
    this.logConfig = {
      enabled: config.logEnabled !== false,
      maxLogEntries: config.maxLogEntries || 10000,
      logLevels: config.logLevels || ['error', 'warn', 'info', 'debug'],
      exportFormats: config.exportFormats || ['json', 'csv'],
      searchEnabled: config.searchEnabled !== false
    };

    // 测试工具配置
    this.testToolsConfig = {
      enabled: config.testToolsEnabled !== false,
      rssTestTimeout: config.rssTestTimeout || 10000,
      aiTestTimeout: config.aiTestTimeout || 30000,
      emailTestTimeout: config.emailTestTimeout || 15000
    };

    // 默认权限
    this.defaultPermissions = {
      admin: ['*'], // 管理员拥有所有权限
      editor: [
        'articles:read',
        'articles:create',
        'articles:update',
        'articles:delete',
        'sources:read',
        'sources:create',
        'sources:update',
        'config:read'
      ],
      viewer: [
        'articles:read',
        'sources:read',
        'config:read',
        'stats:read'
      ]
    };

    // 审计日志配置
    this.auditConfig = {
      enabled: config.auditEnabled !== false,
      maxLogEntries: config.maxLogEntries || 10000,
      logSensitiveActions: config.logSensitiveActions !== false
    };
  }

  /**
   * 初始化Web Admin Service
   */
  async initialize() {
    try {
      logger.info('正在初始化Web Admin Service...');

      // 验证并设置JWT密钥
      if (!this.jwtConfig.secret || this.jwtConfig.secret.length < 32) {
        const isDevelopment = process.env.NODE_ENV === 'development';
        if (isDevelopment) {
          // 开发环境自动生成JWT密钥
          this.jwtConfig.secret = crypto.randomBytes(64).toString('hex');
          logger.warn('开发环境：自动生成JWT密钥', {
            secretLength: this.jwtConfig.secret.length,
            note: '生产环境请设置JWT_SECRET环境变量'
          });
        } else {
          throw new ServiceError('JWT密钥无效或过短，请设置JWT_SECRET环境变量（至少32字符）', 'INVALID_JWT_SECRET');
        }
      }

      // 初始化依赖服务
      await this.configService.initialize();
      await this.rssManagerService.initialize();
      await this.aiAnalysisService.initialize();
      await this.emailService.initialize();

      // 加载用户权限
      await this.loadUserPermissions();

      // 启动会话清理任务
      this.startSessionCleanup();

      // 启动审计日志清理任务
      if (this.auditConfig.enabled) {
        this.startAuditLogCleanup();
      }

      // 启动系统监控
      if (this.monitoringConfig.enabled) {
        this.startSystemMonitoring();
      }

      // 启动日志收集
      if (this.logConfig.enabled) {
        this.startLogCollection();
      }

      // 初始化告警规则
      this.initializeAlertRules();

      // 创建默认管理员用户（如果不存在）
      await this.createDefaultAdmin();

      this.isRunning = true;
      logger.info('Web Admin Service初始化成功');
      return true;

    } catch (error) {
      logger.error('Web Admin Service初始化失败:', error);
      throw error;
    }
  }

  /**
   * 加载用户权限
   */
  async loadUserPermissions() {
    try {
      // 从数据库加载用户权限配置
      const permissions = await SystemConfigQueries.get('user_permissions');

      if (permissions && typeof permissions === 'object') {
        this.userPermissions = new Map(Object.entries(permissions));
      }

      // 合并默认权限
      for (const [role, perms] of Object.entries(this.defaultPermissions)) {
        if (!this.userPermissions.has(role)) {
          this.userPermissions.set(role, perms);
        }
      }

      logger.info(`用户权限加载完成，共 ${this.userPermissions.size} 个角色`);
    } catch (error) {
      logger.warn('用户权限加载失败，使用默认权限:', error.message);
      this.userPermissions = new Map(Object.entries(this.defaultPermissions));
    }
  }

  /**
   * 创建默认管理员用户
   */
  async createDefaultAdmin() {
    try {
      // 检查是否已存在管理员用户
      const adminEmail = 'admin@example.com';
      const existingAdmin = await UserQueries.findByEmail(adminEmail);

      if (!existingAdmin) {
        // 创建默认管理员用户
        const adminData = {
          email: adminEmail,
          username: 'admin',
          first_name: 'System',
          last_name: 'Administrator',
          role: 'admin',
          status: 'active',
          password: await this.hashPassword('admin123'), // 默认密码，生产环境应要求修改
          email_verified_at: new Date().toISOString(),
          preferences: {
            language: 'zh-CN',
            timezone: 'Asia/Shanghai',
            notifications: {
              email: true,
              browser: true
            }
          }
        };

        const admin = await UserQueries.create(adminData);
        logger.info('默认管理员用户创建成功:', admin.email);

        // 记录审计日志
        this.logAudit('CREATE_ADMIN', admin.id, 'system', {
          email: admin.email,
          role: admin.role
        });
      }
    } catch (error) {
      logger.error('创建默认管理员用户失败:', error);
    }
  }

  /**
   * 用户登录
   */
  async login(email, password, options = {}) {
    try {
      const { ipAddress, userAgent } = options;

      // 检查账户锁定状态
      if (this.isAccountLocked(email)) {
        throw new ServiceError('账户已被锁定，请稍后再试', 'ACCOUNT_LOCKED');
      }

      // 查找用户
      const user = await UserQueries.findByEmail(email);
      if (!user) {
        await this.recordFailedLogin(email, ipAddress);
        throw new ServiceError('用户名或密码错误', 'INVALID_CREDENTIALS');
      }

      // 检查用户状态
      if (user.status !== 'active') {
        throw new ServiceError('账户已被禁用', 'ACCOUNT_DISABLED');
      }

      // 验证密码
      const isPasswordValid = await this.verifyPassword(password, user.password_hash);
      if (!isPasswordValid) {
        await this.recordFailedLogin(email, ipAddress);
        throw new ServiceError('用户名或密码错误', 'INVALID_CREDENTIALS');
      }

      // 清除失败登录记录
      this.failedLoginAttempts.delete(email);

      // 生成访问令牌
      const accessToken = this.generateAccessToken(user);
      const refreshToken = this.generateRefreshToken(user);

      // 创建会话
      const session = {
        id: crypto.randomUUID(),
        userId: user.id,
        userAgent,
        ipAddress,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        refreshToken
      };

      this.activeSessions.set(session.id, session);

      // 更新用户最后登录时间
      await UserQueries.update(user.id, {
        last_login_at: new Date().toISOString()
      });

      // 记录审计日志
      this.logAudit('LOGIN', user.id, ipAddress, {
        userAgent,
        sessionId: session.id
      });

      logger.info(`用户登录成功: ${user.email}`);

      // 发送登录事件
      this.emit('login', {
        userId: user.id,
        email: user.email,
        sessionId: session.id,
        ipAddress,
        userAgent,
        timestamp: new Date().toISOString()
      });

      return new APIResponse({
        success: true,
        data: {
          user: this.sanitizeUser(user),
          accessToken,
          refreshToken,
          sessionId: session.id,
          expiresIn: this.getExpiresIn(this.jwtConfig.expiresIn)
        },
        message: '登录成功'
      });

    } catch (error) {
      logger.error('用户登录失败:', { email, error: error.message });
      throw error;
    }
  }

  /**
   * 用户登出
   */
  async logout(sessionId, options = {}) {
    try {
      const { userId, ipAddress } = options;

      const session = this.activeSessions.get(sessionId);
      if (session) {
        this.activeSessions.delete(sessionId);

        // 记录审计日志
        this.logAudit('LOGOUT', session.userId, ipAddress, {
          sessionId,
          userId
        });

        logger.info(`用户登出成功: ${session.userId}`);

        // 发送登出事件
        this.emit('logout', {
          userId: session.userId,
          sessionId,
          ipAddress,
          timestamp: new Date().toISOString()
        });
      }

      return new APIResponse({
        success: true,
        message: '登出成功'
      });

    } catch (error) {
      logger.error('用户登出失败:', error);
      throw error;
    }
  }

  /**
   * 刷新访问令牌
   */
  async refreshToken(refreshToken, options = {}) {
    try {
      const { ipAddress } = options;

      // 验证刷新令牌
      let decoded;
      try {
        decoded = jwt.verify(refreshToken, this.jwtConfig.secret);
      } catch (error) {
        throw new ServiceError('无效的刷新令牌', 'INVALID_REFRESH_TOKEN');
      }

      // 查找用户
      const user = await UserQueries.findById(decoded.userId);
      if (!user || user.status !== 'active') {
        throw new ServiceError('用户不存在或已被禁用', 'USER_NOT_FOUND');
      }

      // 生成新的访问令牌
      const newAccessToken = this.generateAccessToken(user);
      const newRefreshToken = this.generateRefreshToken(user);

      // 更新会话
      for (const [sessionId, session] of this.activeSessions) {
        if (session.userId === user.id && session.refreshToken === refreshToken) {
          session.lastActivity = Date.now();
          session.refreshToken = newRefreshToken;
          break;
        }
      }

      // 记录审计日志
      this.logAudit('REFRESH_TOKEN', user.id, ipAddress);

      return new APIResponse({
        success: true,
        data: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          expiresIn: this.getExpiresIn(this.jwtConfig.expiresIn)
        },
        message: '令牌刷新成功'
      });

    } catch (error) {
      logger.error('令牌刷新失败:', error);
      throw error;
    }
  }

  /**
   * 获取用户信息
   */
  async getUserInfo(userId) {
    try {
      const user = await UserQueries.findById(userId);
      if (!user) {
        throw new ServiceError('用户不存在', 'USER_NOT_FOUND');
      }

      const permissions = this.getUserPermissions(user.role);

      return new APIResponse({
        success: true,
        data: {
          user: this.sanitizeUser(user),
          permissions
        }
      });

    } catch (error) {
      logger.error('获取用户信息失败:', error);
      throw error;
    }
  }

  /**
   * 更新用户信息
   */
  async updateUserInfo(userId, updateData, options = {}) {
    try {
      const { ipAddress } = options;

      // 验证更新数据
      const allowedUpdates = ['first_name', 'last_name', 'preferences'];
      const updates = {};

      for (const key of allowedUpdates) {
        if (updateData[key] !== undefined) {
          updates[key] = updateData[key];
        }
      }

      if (Object.keys(updates).length === 0) {
        throw new ServiceError('没有有效的更新数据', 'INVALID_UPDATE_DATA');
      }

      // 更新用户信息
      const updatedUser = await UserQueries.update(userId, updates);

      // 记录审计日志
      this.logAudit('UPDATE_USER', userId, ipAddress, {
        updates: Object.keys(updates)
      });

      return new APIResponse({
        success: true,
        data: {
          user: this.sanitizeUser(updatedUser)
        },
        message: '用户信息更新成功'
      });

      // 发送用户信息更新事件
      this.emit('userUpdated', {
        userId,
        updates: Object.keys(updates),
        ipAddress,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('更新用户信息失败:', error);
      throw error;
    }
  }

  /**
   * 修改密码
   */
  async changePassword(userId, currentPassword, newPassword, options = {}) {
    try {
      const { ipAddress } = options;

      // 验证当前密码
      const user = await UserQueries.findById(userId);
      if (!user) {
        throw new ServiceError('用户不存在', 'USER_NOT_FOUND');
      }

      const isCurrentPasswordValid = await this.verifyPassword(currentPassword, user.password_hash);
      if (!isCurrentPasswordValid) {
        throw new ServiceError('当前密码错误', 'INVALID_CURRENT_PASSWORD');
      }

      // 验证新密码强度
      if (!this.isPasswordStrong(newPassword)) {
        throw new ServiceError('新密码强度不足', 'WEAK_PASSWORD');
      }

      // 生成新密码哈希
      const newPasswordHash = await this.hashPassword(newPassword);

      // 更新密码
      await UserQueries.update(userId, {
        password_hash: newPasswordHash
      });

      // 使所有现有会话失效
      this.invalidateUserSessions(userId);

      // 记录审计日志
      this.logAudit('CHANGE_PASSWORD', userId, ipAddress);

      logger.info(`用户密码修改成功: ${user.email}`);

      // 发送密码修改事件
      this.emit('passwordChanged', {
        userId: user.id,
        email: user.email,
        ipAddress,
        timestamp: new Date().toISOString()
      });

      return new APIResponse({
        success: true,
        message: '密码修改成功'
      });

    } catch (error) {
      logger.error('修改密码失败:', error);
      throw error;
    }
  }

  /**
   * 获取会话列表
   */
  async getUserSessions(userId) {
    try {
      const userSessions = Array.from(this.activeSessions.values())
        .filter(session => session.userId === userId)
        .map(session => ({
          id: session.id,
          userAgent: session.userAgent,
          ipAddress: session.ipAddress,
          createdAt: session.createdAt,
          lastActivity: session.lastActivity
        }));

      return new APIResponse({
        success: true,
        data: {
          sessions: userSessions
        }
      });

    } catch (error) {
      logger.error('获取用户会话失败:', error);
      throw error;
    }
  }

  /**
   * 终止指定会话
   */
  async terminateSession(sessionId, userId, options = {}) {
    try {
      const { ipAddress } = options;

      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new ServiceError('会话不存在', 'SESSION_NOT_FOUND');
      }

      if (session.userId !== userId) {
        throw new ServiceError('无权限终止此会话', 'INSUFFICIENT_PERMISSIONS');
      }

      this.activeSessions.delete(sessionId);

      // 记录审计日志
      this.logAudit('TERMINATE_SESSION', userId, ipAddress, {
        sessionId
      });

      // 发送会话终止事件
      this.emit('sessionTerminated', {
        userId,
        sessionId,
        ipAddress,
        timestamp: new Date().toISOString()
      });

      return new APIResponse({
        success: true,
        message: '会话已终止'
      });

    } catch (error) {
      logger.error('终止会话失败:', error);
      throw error;
    }
  }

  /**
   * 获取审计日志
   */
  async getAuditLogs(params = {}) {
    try {
      const {
        userId,
        action,
        startDate,
        endDate,
        page = 1,
        limit = 50
      } = params;

      let logs = [...this.auditLog];

      // 按用户ID过滤
      if (userId) {
        logs = logs.filter(log => log.userId === userId);
      }

      // 按操作类型过滤
      if (action) {
        logs = logs.filter(log => log.action === action);
      }

      // 按时间范围过滤
      if (startDate) {
        logs = logs.filter(log => log.timestamp >= new Date(startDate).getTime());
      }
      if (endDate) {
        logs = logs.filter(log => log.timestamp <= new Date(endDate).getTime());
      }

      // 排序
      logs.sort((a, b) => b.timestamp - a.timestamp);

      // 分页
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedLogs = logs.slice(startIndex, endIndex);

      return new APIResponse({
        success: true,
        data: {
          logs: paginatedLogs,
          pagination: {
            page,
            limit,
            total: logs.length,
            totalPages: Math.ceil(logs.length / limit)
          }
        }
      });

    } catch (error) {
      logger.error('获取审计日志失败:', error);
      throw error;
    }
  }

  /**
   * 获取服务统计信息
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      activeSessions: this.activeSessions.size,
      failedLoginAttempts: this.failedLoginAttempts.size,
      auditLogSize: this.auditLog.length,
      userPermissions: this.userPermissions.size,
      securityConfig: this.securityConfig,
      jwtConfig: {
        expiresIn: this.jwtConfig.expiresIn
      }
    };
  }

  // 辅助方法
  generateAccessToken(user) {
    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      type: 'access'
    };

    return jwt.sign(payload, this.jwtConfig.secret, {
      expiresIn: this.jwtConfig.expiresIn
    });
  }

  generateRefreshToken(user) {
    const payload = {
      userId: user.id,
      type: 'refresh'
    };

    return jwt.sign(payload, this.jwtConfig.secret, {
      expiresIn: this.jwtConfig.refreshExpiresIn
    });
  }

  getExpiresIn(expiresIn) {
    if (typeof expiresIn === 'string') {
      if (expiresIn.endsWith('h')) {
        return parseInt(expiresIn) * 3600 * 1000;
      } else if (expiresIn.endsWith('d')) {
        return parseInt(expiresIn) * 24 * 3600 * 1000;
      } else if (expiresIn.endsWith('m')) {
        return parseInt(expiresIn) * 60 * 1000;
      }
    }
    return expiresIn;
  }

  async hashPassword(password) {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  async verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  isPasswordStrong(password) {
    // 密码强度检查
    return password.length >= this.securityConfig.passwordMinLength &&
           /[a-z]/.test(password) &&
           /[A-Z]/.test(password) &&
           /\d/.test(password);
  }

  isAccountLocked(email) {
    const attempts = this.failedLoginAttempts.get(email);
    if (!attempts) return false;

    if (attempts.count >= this.securityConfig.maxLoginAttempts) {
      const lockTime = attempts.lastAttempt + this.securityConfig.lockoutDuration;
      return Date.now() < lockTime;
    }

    return false;
  }

  async recordFailedLogin(email, ipAddress) {
    const attempts = this.failedLoginAttempts.get(email) || {
      count: 0,
      lastAttempt: 0
    };

    attempts.count++;
    attempts.lastAttempt = Date.now();

    this.failedLoginAttempts.set(email, attempts);

    // 记录审计日志
    this.logAudit('FAILED_LOGIN', null, ipAddress, {
      email,
      attempts: attempts.count
    });

    // 如果达到最大尝试次数，记录锁定事件
    if (attempts.count >= this.securityConfig.maxLoginAttempts) {
      this.logAudit('ACCOUNT_LOCKED', null, ipAddress, {
        email,
        attempts: attempts.count
      });
    }
  }

  sanitizeUser(user) {
    const { password_hash, ...sanitized } = user;
    return sanitized;
  }

  getUserPermissions(role) {
    return this.userPermissions.get(role) || [];
  }

  hasPermission(role, permission) {
    const permissions = this.getUserPermissions(role);
    return permissions.includes('*') || permissions.includes(permission);
  }

  invalidateUserSessions(userId) {
    for (const [sessionId, session] of this.activeSessions) {
      if (session.userId === userId) {
        this.activeSessions.delete(sessionId);
      }
    }
  }

  logAudit(action, userId, ipAddress, data = {}) {
    if (!this.auditConfig.enabled) return;

    const logEntry = {
      id: crypto.randomUUID(),
      action,
      userId,
      ipAddress,
      timestamp: Date.now(),
      data
    };

    this.auditLog.push(logEntry);

    // 如果日志数量超过限制，删除最旧的日志
    if (this.auditLog.length > this.auditConfig.maxLogEntries) {
      this.auditLog = this.auditLog.slice(-this.auditConfig.maxLogEntries);
    }

    // 发送事件
    this.emit('auditLog', logEntry);
  }

  startSessionCleanup() {
    // 每5分钟清理一次过期会话
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 5 * 60 * 1000);
  }

  cleanupExpiredSessions() {
    const now = Date.now();
    const expiredSessions = [];

    for (const [sessionId, session] of this.activeSessions) {
      if (now - session.lastActivity > this.securityConfig.sessionTimeout) {
        expiredSessions.push(sessionId);
      }
    }

    for (const sessionId of expiredSessions) {
      const session = this.activeSessions.get(sessionId);
      this.activeSessions.delete(sessionId);

      // 记录审计日志
      this.logAudit('SESSION_EXPIRED', session.userId, session.ipAddress, {
        sessionId,
        duration: now - session.lastActivity
      });
    }

    if (expiredSessions.length > 0) {
      logger.info(`清理过期会话: ${expiredSessions.length} 个`);
    }
  }

  startAuditLogCleanup() {
    // 每天清理一次审计日志
    setInterval(() => {
      this.cleanupAuditLog();
    }, 24 * 60 * 60 * 1000);
  }

  cleanupAuditLog() {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const beforeCount = this.auditLog.length;

    this.auditLog = this.auditLog.filter(log => log.timestamp > thirtyDaysAgo);

    const cleanedCount = beforeCount - this.auditLog.length;
    if (cleanedCount > 0) {
      logger.info(`清理审计日志: ${cleanedCount} 条`);
    }
  }

  // ============== 系统监控 API 方法 ==============

  /**
   * 获取系统状态仪表板数据
   */
  async getSystemDashboard() {
    try {
      const systemMetrics = this.collectSystemMetrics();
      const serviceStatus = this.getServiceStatus();
      const recentAlerts = this.getRecentAlerts();
      const performanceMetrics = this.getPerformanceMetrics();

      return new APIResponse({
        success: true,
        data: {
          system: systemMetrics,
          services: serviceStatus,
          alerts: recentAlerts,
          performance: performanceMetrics,
          timestamp: Date.now()
        }
      });
    } catch (error) {
      logger.error('获取系统状态失败:', error);
      throw error;
    }
  }

  /**
   * 获取服务状态
   */
  async getServiceStatus() {
    try {
      const services = [
        { name: 'config', service: this.configService },
        { name: 'rss', service: this.rssManagerService },
        { name: 'ai', service: this.aiAnalysisService },
        { name: 'email', service: this.emailService }
      ];

      const status = services.map(({ name, service }) => ({
        name,
        isRunning: service.isRunning || false,
        uptime: service.getStats ? service.getStats().uptime || 0 : 0,
        lastCheck: Date.now(),
        health: service.getStats ? this.calculateServiceHealth(service.getStats()) : 'unknown'
      }));

      return new APIResponse({
        success: true,
        data: { services: status }
      });
    } catch (error) {
      logger.error('获取服务状态失败:', error);
      throw error;
    }
  }

  /**
   * 获取性能指标
   */
  async getPerformanceMetrics(options = {}) {
    try {
      const { timeRange = '1h', granularity = '1m' } = options;

      const metrics = this.systemMetrics.get('performance') || [];
      const filteredMetrics = this.filterMetricsByTimeRange(metrics, timeRange);
      const aggregatedMetrics = this.aggregateMetrics(filteredMetrics, granularity);

      return new APIResponse({
        success: true,
        data: {
          metrics: aggregatedMetrics,
          timeRange,
          granularity,
          summary: this.calculateMetricsSummary(aggregatedMetrics)
        }
      });
    } catch (error) {
      logger.error('获取性能指标失败:', error);
      throw error;
    }
  }

  /**
   * 获取告警规则
   */
  async getAlertRules() {
    try {
      const rules = Array.from(this.alertRules.values());

      return new APIResponse({
        success: true,
        data: { alertRules: rules }
      });
    } catch (error) {
      logger.error('获取告警规则失败:', error);
      throw error;
    }
  }

  /**
   * 更新告警规则
   */
  async updateAlertRules(rules, options = {}) {
    try {
      const { userId, ipAddress } = options;

      // 验证告警规则
      for (const rule of rules) {
        if (!this.validateAlertRule(rule)) {
          throw new ServiceError(`无效的告警规则: ${rule.name}`, 'INVALID_ALERT_RULE');
        }
      }

      // 更新告警规则
      this.alertRules.clear();
      for (const rule of rules) {
        this.alertRules.set(rule.id, rule);
      }

      // 记录审计日志
      this.logAudit('UPDATE_ALERT_RULES', userId, ipAddress, {
        ruleCount: rules.length,
        ruleNames: rules.map(r => r.name)
      });

      return new APIResponse({
        success: true,
        message: '告警规则更新成功',
        data: { alertRules: rules }
      });
    } catch (error) {
      logger.error('更新告警规则失败:', error);
      throw error;
    }
  }

  // ============== 日志管理 API 方法 ==============

  /**
   * 获取系统日志
   */
  async getSystemLogs(params = {}) {
    try {
      const {
        level,
        service,
        startDate,
        endDate,
        searchTerm,
        page = 1,
        limit = 100
      } = params;

      let logs = this.systemMetrics.get('logs') || [];

      // 按级别过滤
      if (level) {
        logs = logs.filter(log => log.level === level);
      }

      // 按服务过滤
      if (service) {
        logs = logs.filter(log => log.service === service);
      }

      // 按时间范围过滤
      if (startDate) {
        logs = logs.filter(log => log.timestamp >= new Date(startDate).getTime());
      }
      if (endDate) {
        logs = logs.filter(log => log.timestamp <= new Date(endDate).getTime());
      }

      // 搜索过滤
      if (searchTerm) {
        logs = logs.filter(log =>
          log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (log.data && JSON.stringify(log.data).toLowerCase().includes(searchTerm.toLowerCase()))
        );
      }

      // 排序
      logs.sort((a, b) => b.timestamp - a.timestamp);

      // 分页
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedLogs = logs.slice(startIndex, endIndex);

      return new APIResponse({
        success: true,
        data: {
          logs: paginatedLogs,
          pagination: {
            page,
            limit,
            total: logs.length,
            totalPages: Math.ceil(logs.length / limit)
          },
          filters: { level, service, searchTerm }
        }
      });
    } catch (error) {
      logger.error('获取系统日志失败:', error);
      throw error;
    }
  }

  /**
   * 导出日志
   */
  async exportLogs(params = {}) {
    try {
      const {
        format = 'json',
        level,
        service,
        startDate,
        endDate,
        searchTerm
      } = params;

      const logsResult = await this.getSystemLogs({
        level,
        service,
        startDate,
        endDate,
        searchTerm,
        page: 1,
        limit: 10000 // 获取更多日志用于导出
      });

      let exportData;
      let contentType;
      let filename;

      switch (format) {
      case 'json':
        exportData = JSON.stringify(logsResult.data.logs, null, 2);
        contentType = 'application/json';
        filename = `system-logs-${new Date().toISOString().split('T')[0]}.json`;
        break;
      case 'csv':
        exportData = this.convertLogsToCSV(logsResult.data.logs);
        contentType = 'text/csv';
        filename = `system-logs-${new Date().toISOString().split('T')[0]}.csv`;
        break;
      default:
        throw new ServiceError('不支持的导出格式', 'UNSUPPORTED_FORMAT');
      }

      return new APIResponse({
        success: true,
        data: {
          exportData,
          contentType,
          filename,
          recordCount: logsResult.data.logs.length
        }
      });
    } catch (error) {
      logger.error('导出日志失败:', error);
      throw error;
    }
  }

  /**
   * 清理日志
   */
  async cleanupLogs(options = {}) {
    try {
      const { userId, ipAddress, retentionDays = 7 } = options;

      const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
      const logs = this.systemMetrics.get('logs') || [];

      const beforeCount = logs.length;
      const filteredLogs = logs.filter(log => log.timestamp > cutoffTime);
      const cleanedCount = beforeCount - filteredLogs.length;

      this.systemMetrics.set('logs', filteredLogs);

      // 记录审计日志
      this.logAudit('CLEANUP_LOGS', userId, ipAddress, {
        retentionDays,
        cleanedCount,
        remainingCount: filteredLogs.length
      });

      logger.info(`日志清理完成: 删除 ${cleanedCount} 条，保留 ${filteredLogs.length} 条`);

      return new APIResponse({
        success: true,
        message: `日志清理完成，删除 ${cleanedCount} 条记录`,
        data: {
          cleanedCount,
          remainingCount: filteredLogs.length,
          retentionDays
        }
      });
    } catch (error) {
      logger.error('清理日志失败:', error);
      throw error;
    }
  }

  // ============== 测试工具 API 方法 ==============

  /**
   * 测试RSS源连通性
   */
  async testRSSSource(feedUrl, options = {}) {
    try {
      const { userId, ipAddress } = options;

      // 验证RSS URL
      if (!this.isValidURL(feedUrl)) {
        throw new ServiceError('无效的RSS URL', 'INVALID_RSS_URL');
      }

      const testResult = await this.rssManagerService.testFeed(feedUrl, {
        timeout: this.testToolsConfig.rssTestTimeout
      });

      // 记录审计日志
      this.logAudit('TEST_RSS_SOURCE', userId, ipAddress, {
        feedUrl,
        success: testResult.success,
        responseTime: testResult.responseTime
      });

      return new APIResponse({
        success: true,
        data: {
          feedUrl,
          testResult,
          timestamp: Date.now()
        }
      });
    } catch (error) {
      logger.error('RSS源测试失败:', error);
      throw error;
    }
  }

  /**
   * 测试AI分析功能
   */
  async testAIAnalysis(text, options = {}) {
    try {
      const { userId, ipAddress, analysisType = 'sentiment' } = options;

      if (!text || text.trim().length === 0) {
        throw new ServiceError('测试文本不能为空', 'EMPTY_TEXT');
      }

      const testResult = await this.aiAnalysisService.analyzeText(text, {
        type: analysisType,
        timeout: this.testToolsConfig.aiTestTimeout
      });

      // 记录审计日志
      this.logAudit('TEST_AI_ANALYSIS', userId, ipAddress, {
        analysisType,
        textLength: text.length,
        success: testResult.success
      });

      return new APIResponse({
        success: true,
        data: {
          analysisType,
          testResult,
          textLength: text.length,
          timestamp: Date.now()
        }
      });
    } catch (error) {
      logger.error('AI分析测试失败:', error);
      throw error;
    }
  }

  /**
   * 测试邮件发送
   */
  async testEmailSend(emailConfig, options = {}) {
    try {
      const { userId, ipAddress } = options;

      const { to, subject, template, templateData } = emailConfig;

      if (!to || !subject) {
        throw new ServiceError('收件人和主题不能为空', 'INVALID_EMAIL_CONFIG');
      }

      const testResult = await this.emailService.sendTestEmail({
        to,
        subject,
        template,
        templateData,
        timeout: this.testToolsConfig.emailTestTimeout
      });

      // 记录审计日志
      this.logAudit('TEST_EMAIL_SEND', userId, ipAddress, {
        to,
        subject,
        template,
        success: testResult.success
      });

      return new APIResponse({
        success: true,
        data: {
          emailConfig,
          testResult,
          timestamp: Date.now()
        }
      });
    } catch (error) {
      logger.error('邮件发送测试失败:', error);
      throw error;
    }
  }

  /**
   * 获取系统配置热加载状态
   */
  async getConfigStatus() {
    try {
      const configStatus = {
        isRunning: this.configService.isRunning,
        lastReload: this.configService.lastReload || null,
        configVersion: this.configService.configVersion || '1.0.0',
        watchedFiles: this.configService.watchedFiles || [],
        pendingChanges: this.configService.pendingChanges || false
      };

      return new APIResponse({
        success: true,
        data: { configStatus }
      });
    } catch (error) {
      logger.error('获取配置状态失败:', error);
      throw error;
    }
  }

  /**
   * 触发配置热加载
   */
  async reloadConfig(options = {}) {
    try {
      const { userId, ipAddress } = options;

      const result = await this.configService.hotReload();

      // 记录审计日志
      this.logAudit('RELOAD_CONFIG', userId, ipAddress, {
        success: result.success,
        configCount: result.configCount || 0
      });

      return new APIResponse({
        success: true,
        message: '配置重载成功',
        data: result
      });
    } catch (error) {
      logger.error('配置重载失败:', error);
      throw error;
    }
  }

  // ============== 辅助方法 ==============

  /**
   * 收集系统指标
   */
  collectSystemMetrics() {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();
    const cpuUsage = process.cpuUsage();

    return {
      memory: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
        usagePercent: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
        usagePercent: Math.round((cpuUsage.user + cpuUsage.system) / uptime / 10000)
      },
      uptime: uptime * 1000,
      timestamp: Date.now(),
      nodeVersion: process.version,
      platform: process.platform
    };
  }

  /**
   * 计算服务健康状态
   */
  calculateServiceHealth(stats) {
    if (!stats) return 'unknown';

    if (stats.errors && stats.errors > 10) return 'poor';
    if (stats.errors && stats.errors > 5) return 'fair';
    if (stats.uptime && stats.uptime < 300000) return 'good';
    return 'excellent';
  }

  /**
   * 验证告警规则
   */
  validateAlertRule(rule) {
    return !!(rule.name &&
           rule.id &&
           rule.condition &&
           rule.threshold !== undefined &&
           rule.action);
  }

  /**
   * 启动系统监控
   */
  startSystemMonitoring() {
    setInterval(() => {
      const metrics = this.collectSystemMetrics();
      this.systemMetrics.set('current', metrics);

      // 存储历史指标
      const history = this.systemMetrics.get('history') || [];
      history.push(metrics);

      // 清理旧数据
      const cutoff = Date.now() - this.monitoringConfig.retentionPeriod;
      const filteredHistory = history.filter(m => m.timestamp > cutoff);
      this.systemMetrics.set('history', filteredHistory);

      // 检查告警
      this.checkAlerts(metrics);

      // 发送指标收集事件
      this.emit('metricsCollected', metrics);
    }, this.monitoringConfig.metricsInterval);

    logger.info('系统监控已启动');
  }

  /**
   * 启动日志收集
   */
  startLogCollection() {
    // 监听全局日志事件
    process.on('log', (logEntry) => {
      const logs = this.systemMetrics.get('logs') || [];
      logs.push(logEntry);

      // 限制日志数量
      if (logs.length > this.logConfig.maxLogEntries) {
        this.systemMetrics.set('logs', logs.slice(-this.logConfig.maxLogEntries));
      } else {
        this.systemMetrics.set('logs', logs);
      }
    });

    logger.info('日志收集已启动');
  }

  /**
   * 初始化告警规则
   */
  initializeAlertRules() {
    const defaultRules = [
      {
        id: 'high_memory_usage',
        name: '内存使用率过高',
        condition: 'memory.usagePercent > threshold',
        threshold: 85,
        action: 'alert',
        enabled: true
      },
      {
        id: 'high_cpu_usage',
        name: 'CPU使用率过高',
        condition: 'cpu.usagePercent > threshold',
        threshold: 80,
        action: 'alert',
        enabled: true
      },
      {
        id: 'service_down',
        name: '服务离线',
        condition: 'service.isRunning === false',
        threshold: 0,
        action: 'alert',
        enabled: true
      }
    ];

    for (const rule of defaultRules) {
      this.alertRules.set(rule.id, rule);
    }
  }

  /**
   * 检查告警
   */
  checkAlerts(metrics) {
    const alerts = [];

    for (const rule of this.alertRules.values()) {
      if (!rule.enabled) continue;

      try {
        const condition = eval(rule.condition.replace(/threshold/g, rule.threshold));
        if (condition) {
          const alert = {
            id: crypto.randomUUID(),
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity || 'warning',
            message: rule.message || `触发告警规则: ${rule.name}`,
            timestamp: Date.now(),
            metrics
          };

          alerts.push(alert);
          this.emit('alert', alert);
        }
      } catch (error) {
        logger.error('告警规则检查失败:', { ruleId: rule.id, error: error.message });
      }
    }

    // 存储告警历史
    if (alerts.length > 0) {
      const alertHistory = this.systemMetrics.get('alerts') || [];
      alertHistory.push(...alerts);
      this.systemMetrics.set('alerts', alertHistory);
    }
  }

  /**
   * 获取最近告警
   */
  getRecentAlerts() {
    const alerts = this.systemMetrics.get('alerts') || [];
    const recent = alerts
      .filter(alert => Date.now() - alert.timestamp < 24 * 60 * 60 * 1000) // 24小时内
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 50); // 最多50条

    return recent;
  }

  /**
   * 过滤时间范围内的指标
   */
  filterMetricsByTimeRange(metrics, timeRange) {
    const now = Date.now();
    let startTime;

    switch (timeRange) {
    case '1h':
      startTime = now - 60 * 60 * 1000;
      break;
    case '6h':
      startTime = now - 6 * 60 * 60 * 1000;
      break;
    case '24h':
      startTime = now - 24 * 60 * 60 * 1000;
      break;
    case '7d':
      startTime = now - 7 * 24 * 60 * 60 * 1000;
      break;
    default:
      startTime = now - 60 * 60 * 1000; // 默认1小时
    }

    return metrics.filter(metric => metric.timestamp >= startTime);
  }

  /**
   * 聚合指标数据
   */
  aggregateMetrics(metrics, granularity) {
    // 简化的聚合逻辑，实际实现应根据粒度进行更复杂的聚合
    return metrics.map(metric => ({
      timestamp: metric.timestamp,
      memoryUsage: metric.memory.usagePercent,
      cpuUsage: metric.cpu.usagePercent,
      uptime: metric.uptime
    }));
  }

  /**
   * 计算指标摘要
   */
  calculateMetricsSummary(metrics) {
    if (metrics.length === 0) return null;

    const memoryUsage = metrics.map(m => m.memoryUsage);
    const cpuUsage = metrics.map(m => m.cpuUsage);

    return {
      memoryUsage: {
        avg: memoryUsage.reduce((a, b) => a + b) / memoryUsage.length,
        max: Math.max(...memoryUsage),
        min: Math.min(...memoryUsage)
      },
      cpuUsage: {
        avg: cpuUsage.reduce((a, b) => a + b) / cpuUsage.length,
        max: Math.max(...cpuUsage),
        min: Math.min(...cpuUsage)
      },
      dataPoints: metrics.length
    };
  }

  /**
   * 转换日志为CSV格式
   */
  convertLogsToCSV(logs) {
    const headers = ['timestamp', 'level', 'service', 'message', 'data'];
    const rows = logs.map(log => [
      new Date(log.timestamp).toISOString(),
      log.level,
      log.service || 'system',
      `"${log.message.replace(/"/g, '""')}"`,
      `"${JSON.stringify(log.data || {}).replace(/"/g, '""')}"`
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }

  /**
   * 验证URL
   */
  isValidURL(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 停止服务
   */
  async stop() {
    try {
      this.activeSessions.clear();
      this.failedLoginAttempts.clear();
      this.auditLog = [];
      this.systemMetrics.clear();
      this.alertRules.clear();
      this.isRunning = false;

      // 停止依赖服务
      if (this.configService) await this.configService.stop();
      if (this.rssManagerService) await this.rssManagerService.stop();
      if (this.aiAnalysisService) await this.aiAnalysisService.stop();
      if (this.emailService) await this.emailService.stop();

      logger.info('Web Admin Service已停止');
    } catch (error) {
      logger.error('Web Admin Service停止失败:', error);
    }
  }
}

export default WebAdminService;