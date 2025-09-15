/**
 * Web Admin Service 测试文件
 * 测试用户认证、权限管理、系统监控、日志管理等功能
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import WebAdminService from './WebAdminService.js';
import ConfigService from './ConfigService.js';
import { RSSManagerService } from './RSSManagerService.js';
import AIAnalysisService from './AIAnalysisService.js';
import EmailService from './EmailService.js';
import { APIResponse, ServiceError } from '../types/index.js';

// Mock dependencies
jest.mock('./ConfigService.js', () => {
  return jest.fn().mockImplementation(() => ({
    initialize: jest.fn(),
    isRunning: true,
    hotReload: jest.fn(),
    getStats: jest.fn()
  }));
});

jest.mock('./RSSManagerService.js', () => {
  return jest.fn().mockImplementation(() => ({
    initialize: jest.fn(),
    isRunning: true,
    testFeed: jest.fn(),
    getStats: jest.fn()
  }));
});

jest.mock('./AIAnalysisService.js', () => {
  return jest.fn().mockImplementation(() => ({
    initialize: jest.fn(),
    isRunning: true,
    analyzeText: jest.fn(),
    getStats: jest.fn()
  }));
});

jest.mock('./EmailService.js', () => {
  return jest.fn().mockImplementation(() => ({
    initialize: jest.fn(),
    isRunning: true,
    sendTestEmail: jest.fn(),
    getStats: jest.fn()
  }));
});

jest.mock('../utils/logger.js', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

jest.mock('../database/queries.js', () => ({
  UserQueries: {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },
  SystemConfigQueries: {
    get: jest.fn()
  }
}));

describe('WebAdminService', () => {
  let webAdminService;
  let mockConfigService;
  let mockRSSManagerService;
  let mockAIAnalysisService;
  let mockEmailService;
  let mockUserQueries;
  let mockSystemConfigQueries;
  let mockLogger;

  const testConfig = {
    jwtSecret: 'test-jwt-secret-with-at-least-32-characters',
    monitoringEnabled: true,
    logEnabled: true,
    testToolsEnabled: true
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock instances
    mockConfigService = new ConfigService();
    mockRSSManagerService = new RSSManagerService();
    mockAIAnalysisService = new AIAnalysisService();
    mockEmailService = new EmailService();

    // Get mocked modules
    mockLogger = require('../utils/logger.js');
    mockUserQueries = require('../database/queries.js').UserQueries;
    mockSystemConfigQueries = require('../database/queries.js').SystemConfigQueries;

    // Setup mock service methods
    mockConfigService.initialize.mockResolvedValue(true);
    mockConfigService.hotReload.mockResolvedValue({
      success: true,
      configCount: 5
    });
    mockConfigService.getStats.mockReturnValue({ uptime: 100000 });

    mockRSSManagerService.initialize.mockResolvedValue(true);
    mockRSSManagerService.testFeed.mockResolvedValue({
      success: true,
      responseTime: 1500,
      feedInfo: { title: 'Test Feed', articleCount: 10 }
    });
    mockRSSManagerService.getStats.mockReturnValue({ uptime: 200000 });

    mockAIAnalysisService.initialize.mockResolvedValue(true);
    mockAIAnalysisService.analyzeText.mockResolvedValue({
      success: true,
      sentiment: 'positive',
      confidence: 0.85,
      analysis: 'Positive sentiment detected'
    });
    mockAIAnalysisService.getStats.mockReturnValue({ uptime: 300000 });

    mockEmailService.initialize.mockResolvedValue(true);
    mockEmailService.sendTestEmail.mockResolvedValue({
      success: true,
      messageId: 'test-message-id'
    });
    mockEmailService.getStats.mockReturnValue({ uptime: 400000 });

    // Create WebAdminService instance with mocked dependencies
    webAdminService = new WebAdminService({
      ...testConfig,
      configService: mockConfigService,
      rssManagerService: mockRSSManagerService,
      aiAnalysisService: mockAIAnalysisService,
      emailService: mockEmailService
    });
  });

  describe('Initialization', () => {
    it('应该成功初始化WebAdminService', async () => {
      // Setup mock user permissions
      mockSystemConfigQueries.get.mockResolvedValue({
        admin: ['*'],
        editor: ['articles:read', 'config:read'],
        viewer: ['articles:read']
      });

      // Mock admin user not existing
      mockUserQueries.findByEmail.mockResolvedValue(null);
      mockUserQueries.create.mockResolvedValue({
        id: 'admin-user-id',
        email: 'admin@example.com',
        role: 'admin'
      });

      const result = await webAdminService.initialize();

      expect(result).toBe(true);
      expect(webAdminService.isRunning).toBe(true);
      expect(mockConfigService.initialize).toHaveBeenCalled();
      expect(mockRSSManagerService.initialize).toHaveBeenCalled();
      expect(mockAIAnalysisService.initialize).toHaveBeenCalled();
      expect(mockEmailService.initialize).toHaveBeenCalled();
    });

    it('应该处理初始化失败', async () => {
      mockConfigService.initialize.mockRejectedValue(new Error('Config service failed'));

      await expect(webAdminService.initialize()).rejects.toThrow('Config service failed');
      expect(webAdminService.isRunning).toBe(false);
    });
  });

  describe('User Authentication', () => {
    beforeEach(async () => {
      // Setup successful initialization
      mockSystemConfigQueries.get.mockResolvedValue({});
      mockUserQueries.findByEmail.mockResolvedValue(null);
      mockUserQueries.create.mockResolvedValue({ id: 'admin-id' });
      await webAdminService.initialize();
    });

    describe('Login', () => {
      it('应该成功登录有效用户', async () => {
        const mockUser = {
          id: 'user-123',
          email: 'test@example.com',
          password_hash: await webAdminService.hashPassword('password123'),
          role: 'admin',
          status: 'active'
        };

        mockUserQueries.findByEmail.mockResolvedValue(mockUser);

        const result = await webAdminService.login('test@example.com', 'password123', {
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0'
        });

        expect(result.success).toBe(true);
        expect(result.data.user.email).toBe('test@example.com');
        expect(result.data.accessToken).toBeDefined();
        expect(result.data.refreshToken).toBeDefined();
        expect(webAdminService.activeSessions.size).toBe(1);
      });

      it('应该拒绝无效密码', async () => {
        const mockUser = {
          id: 'user-123',
          email: 'test@example.com',
          password_hash: await webAdminService.hashPassword('password123'),
          role: 'admin',
          status: 'active'
        };

        mockUserQueries.findByEmail.mockResolvedValue(mockUser);

        await expect(webAdminService.login('test@example.com', 'wrongpassword', {
          ipAddress: '192.168.1.1'
        })).rejects.toThrow('用户名或密码错误');

        expect(webAdminService.failedLoginAttempts.has('test@example.com')).toBe(true);
      });

      it('应该拒绝不存在的用户', async () => {
        mockUserQueries.findByEmail.mockResolvedValue(null);

        await expect(webAdminService.login('nonexistent@example.com', 'password', {
          ipAddress: '192.168.1.1'
        })).rejects.toThrow('用户名或密码错误');
      });

      it('应该锁定账户多次失败登录', async () => {
        const mockUser = {
          id: 'user-123',
          email: 'test@example.com',
          password_hash: await webAdminService.hashPassword('password123'),
          role: 'admin',
          status: 'active'
        };

        mockUserQueries.findByEmail.mockResolvedValue(mockUser);

        // 尝试失败登录超过最大次数
        for (let i = 0; i < 6; i++) {
          try {
            await webAdminService.login('test@example.com', 'wrongpassword', {
              ipAddress: '192.168.1.1'
            });
          } catch (error) {
            // Expected to fail
          }
        }

        await expect(webAdminService.login('test@example.com', 'password123', {
          ipAddress: '192.168.1.1'
        })).rejects.toThrow('账户已被锁定');
      });
    });

    describe('Logout', () => {
      it('应该成功登出用户', async () => {
        // 先登录创建会话
        const mockUser = {
          id: 'user-123',
          email: 'test@example.com',
          password_hash: await webAdminService.hashPassword('password123'),
          role: 'admin',
          status: 'active'
        };

        mockUserQueries.findByEmail.mockResolvedValue(mockUser);
        const loginResult = await webAdminService.login('test@example.com', 'password123', {
          ipAddress: '192.168.1.1'
        });

        const sessionId = loginResult.data.sessionId;

        // 登出
        const logoutResult = await webAdminService.logout(sessionId, {
          userId: 'user-123',
          ipAddress: '192.168.1.1'
        });

        expect(logoutResult.success).toBe(true);
        expect(webAdminService.activeSessions.has(sessionId)).toBe(false);
      });
    });

    describe('Token Refresh', () => {
      it('应该成功刷新访问令牌', async () => {
        const mockUser = {
          id: 'user-123',
          email: 'test@example.com',
          role: 'admin',
          status: 'active'
        };

        mockUserQueries.findById.mockResolvedValue(mockUser);

        // 创建有效的刷新令牌
        const refreshToken = webAdminService.generateRefreshToken(mockUser);

        const result = await webAdminService.refreshToken(refreshToken, {
          ipAddress: '192.168.1.1'
        });

        expect(result.success).toBe(true);
        expect(result.data.accessToken).toBeDefined();
        expect(result.data.refreshToken).toBeDefined();
      });

      it('应该拒绝无效的刷新令牌', async () => {
        await expect(webAdminService.refreshToken('invalid-token', {
          ipAddress: '192.168.1.1'
        })).rejects.toThrow('无效的刷新令牌');
      });
    });
  });

  describe('System Monitoring', () => {
    beforeEach(async () => {
      mockSystemConfigQueries.get.mockResolvedValue({});
      mockUserQueries.findByEmail.mockResolvedValue(null);
      mockUserQueries.create.mockResolvedValue({ id: 'admin-id' });
      await webAdminService.initialize();
    });

    it('应该获取系统状态仪表板', async () => {
      const result = await webAdminService.getSystemDashboard();

      expect(result.success).toBe(true);
      expect(result.data.system).toBeDefined();
      expect(result.data.services).toBeDefined();
      expect(result.data.alerts).toBeDefined();
      expect(result.data.performance).toBeDefined();
      expect(result.data.timestamp).toBeDefined();
    });

    it('应该获取服务状态', async () => {
      const result = await webAdminService.getServiceStatus();

      expect(result.success).toBe(true);
      expect(result.data.services).toBeInstanceOf(Array);
      expect(result.data.services.length).toBe(4); // config, rss, ai, email
    });

    it('应该获取性能指标', async () => {
      const result = await webAdminService.getPerformanceMetrics({
        timeRange: '1h',
        granularity: '1m'
      });

      expect(result.success).toBe(true);
      expect(result.data.metrics).toBeDefined();
      expect(result.data.timeRange).toBe('1h');
      expect(result.data.granularity).toBe('1m');
    });

    it('应该获取告警规则', async () => {
      const result = await webAdminService.getAlertRules();

      expect(result.success).toBe(true);
      expect(result.data.alertRules).toBeInstanceOf(Array);
      expect(result.data.alertRules.length).toBeGreaterThan(0);
    });

    it('应该更新告警规则', async () => {
      const newRules = [
        {
          id: 'test_rule',
          name: 'Test Rule',
          condition: 'memory.usagePercent > threshold',
          threshold: 90,
          action: 'alert',
          enabled: true
        }
      ];

      const result = await webAdminService.updateAlertRules(newRules, {
        userId: 'user-123',
        ipAddress: '192.168.1.1'
      });

      expect(result.success).toBe(true);
      expect(result.data.alertRules).toEqual(newRules);
    });

    it('应该拒绝无效的告警规则', async () => {
      const invalidRules = [
        {
          id: 'invalid_rule',
          name: 'Invalid Rule'
          // 缺少必需字段
        }
      ];

      await expect(webAdminService.updateAlertRules(invalidRules, {
        userId: 'user-123',
        ipAddress: '192.168.1.1'
      })).rejects.toThrow('无效的告警规则');
    });
  });

  describe('Log Management', () => {
    beforeEach(async () => {
      mockSystemConfigQueries.get.mockResolvedValue({});
      mockUserQueries.findByEmail.mockResolvedValue(null);
      mockUserQueries.create.mockResolvedValue({ id: 'admin-id' });
      await webAdminService.initialize();
    });

    it('应该获取系统日志', async () => {
      // 添加一些测试日志
      const testLogs = [
        {
          timestamp: Date.now(),
          level: 'info',
          service: 'test-service',
          message: 'Test log message',
          data: { test: true }
        }
      ];
      webAdminService.systemMetrics.set('logs', testLogs);

      const result = await webAdminService.getSystemLogs({
        level: 'info',
        page: 1,
        limit: 10
      });

      expect(result.success).toBe(true);
      expect(result.data.logs).toBeInstanceOf(Array);
      expect(result.data.pagination).toBeDefined();
    });

    it('应该导出JSON格式日志', async () => {
      const testLogs = [
        {
          timestamp: Date.now(),
          level: 'error',
          service: 'test-service',
          message: 'Test error message',
          data: { error: 'test error' }
        }
      ];
      webAdminService.systemMetrics.set('logs', testLogs);

      const result = await webAdminService.exportLogs({
        format: 'json',
        level: 'error'
      });

      expect(result.success).toBe(true);
      expect(result.data.exportData).toBeDefined();
      expect(result.data.contentType).toBe('application/json');
      expect(result.data.filename).toMatch(/\.json$/);
    });

    it('应该导出CSV格式日志', async () => {
      const testLogs = [
        {
          timestamp: Date.now(),
          level: 'info',
          service: 'test-service',
          message: 'Test info message',
          data: { info: 'test info' }
        }
      ];
      webAdminService.systemMetrics.set('logs', testLogs);

      const result = await webAdminService.exportLogs({
        format: 'csv'
      });

      expect(result.success).toBe(true);
      expect(result.data.exportData).toBeDefined();
      expect(result.data.contentType).toBe('text/csv');
      expect(result.data.filename).toMatch(/\.csv$/);
    });

    it('应该清理过期日志', async () => {
      const oldLogs = [
        {
          timestamp: Date.now() - 10 * 24 * 60 * 60 * 1000, // 10天前
          level: 'info',
          service: 'test-service',
          message: 'Old log message'
        },
        {
          timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000, // 1天前
          level: 'info',
          service: 'test-service',
          message: 'Recent log message'
        }
      ];
      webAdminService.systemMetrics.set('logs', oldLogs);

      const result = await webAdminService.cleanupLogs({
        userId: 'user-123',
        ipAddress: '192.168.1.1',
        retentionDays: 7
      });

      expect(result.success).toBe(true);
      expect(result.data.cleanedCount).toBe(1);
      expect(result.data.remainingCount).toBe(1);
    });
  });

  describe('Test Tools', () => {
    beforeEach(async () => {
      mockSystemConfigQueries.get.mockResolvedValue({});
      mockUserQueries.findByEmail.mockResolvedValue(null);
      mockUserQueries.create.mockResolvedValue({ id: 'admin-id' });
      await webAdminService.initialize();
    });

    it('应该测试RSS源连通性', async () => {
      const feedUrl = 'https://example.com/feed.xml';

      const result = await webAdminService.testRSSSource(feedUrl, {
        userId: 'user-123',
        ipAddress: '192.168.1.1'
      });

      expect(result.success).toBe(true);
      expect(result.data.feedUrl).toBe(feedUrl);
      expect(result.data.testResult.success).toBe(true);
      expect(mockRSSManagerService.testFeed).toHaveBeenCalledWith(feedUrl, {
        timeout: webAdminService.testToolsConfig.rssTestTimeout
      });
    });

    it('应该拒绝无效的RSS URL', async () => {
      await expect(webAdminService.testRSSSource('invalid-url', {
        userId: 'user-123',
        ipAddress: '192.168.1.1'
      })).rejects.toThrow('无效的RSS URL');
    });

    it('应该测试AI分析功能', async () => {
      const testText = '这是一条测试新闻文本';

      const result = await webAdminService.testAIAnalysis(testText, {
        userId: 'user-123',
        ipAddress: '192.168.1.1',
        analysisType: 'sentiment'
      });

      expect(result.success).toBe(true);
      expect(result.data.analysisType).toBe('sentiment');
      expect(result.data.testResult.success).toBe(true);
      expect(mockAIAnalysisService.analyzeText).toHaveBeenCalledWith(testText, {
        type: 'sentiment',
        timeout: webAdminService.testToolsConfig.aiTestTimeout
      });
    });

    it('应该拒绝空的AI分析文本', async () => {
      await expect(webAdminService.testAIAnalysis('', {
        userId: 'user-123',
        ipAddress: '192.168.1.1'
      })).rejects.toThrow('测试文本不能为空');
    });

    it('应该测试邮件发送', async () => {
      const emailConfig = {
        to: 'test@example.com',
        subject: 'Test Email',
        template: 'test-template',
        templateData: { name: 'Test User' }
      };

      const result = await webAdminService.testEmailSend(emailConfig, {
        userId: 'user-123',
        ipAddress: '192.168.1.1'
      });

      expect(result.success).toBe(true);
      expect(result.data.emailConfig).toEqual(emailConfig);
      expect(result.data.testResult.success).toBe(true);
      expect(mockEmailService.sendTestEmail).toHaveBeenCalledWith({
        ...emailConfig,
        timeout: webAdminService.testToolsConfig.emailTestTimeout
      });
    });

    it('应该拒绝无效的邮件配置', async () => {
      await expect(webAdminService.testEmailSend({
        subject: 'Test Email'
        // 缺少收件人
      }, {
        userId: 'user-123',
        ipAddress: '192.168.1.1'
      })).rejects.toThrow('收件人和主题不能为空');
    });

    it('应该获取配置状态', async () => {
      const result = await webAdminService.getConfigStatus();

      expect(result.success).toBe(true);
      expect(result.data.configStatus).toBeDefined();
      expect(result.data.configStatus.isRunning).toBe(true);
    });

    it('应该重载配置', async () => {
      const result = await webAdminService.reloadConfig({
        userId: 'user-123',
        ipAddress: '192.168.1.1'
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('配置重载成功');
      expect(mockConfigService.hotReload).toHaveBeenCalled();
    });
  });

  describe('User Management', () => {
    beforeEach(async () => {
      mockSystemConfigQueries.get.mockResolvedValue({});
      mockUserQueries.findByEmail.mockResolvedValue(null);
      mockUserQueries.create.mockResolvedValue({ id: 'admin-id' });
      await webAdminService.initialize();
    });

    it('应该获取用户信息', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'admin',
        status: 'active'
      };

      mockUserQueries.findById.mockResolvedValue(mockUser);

      const result = await webAdminService.getUserInfo('user-123');

      expect(result.success).toBe(true);
      expect(result.data.user.email).toBe('test@example.com');
      expect(result.data.permissions).toBeDefined();
    });

    it('应该更新用户信息', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        first_name: 'Old',
        last_name: 'Name'
      };

      const updateData = {
        first_name: 'New',
        last_name: 'Name',
        preferences: { language: 'zh-CN' }
      };

      mockUserQueries.findById.mockResolvedValue(mockUser);
      mockUserQueries.update.mockResolvedValue({
        ...mockUser,
        ...updateData
      });

      const result = await webAdminService.updateUserInfo('user-123', updateData, {
        ipAddress: '192.168.1.1'
      });

      expect(result.success).toBe(true);
      expect(result.data.user.first_name).toBe('New');
    });

    it('应该修改密码', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        password_hash: await webAdminService.hashPassword('oldpassword'),
        status: 'active'
      };

      mockUserQueries.findById.mockResolvedValue(mockUser);
      mockUserQueries.update.mockResolvedValue(mockUser);

      const result = await webAdminService.changePassword(
        'user-123',
        'oldpassword',
        'NewPassword123',
        { ipAddress: '192.168.1.1' }
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('密码修改成功');
    });

    it('应该拒绝弱密码', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        password_hash: await webAdminService.hashPassword('oldpassword'),
        status: 'active'
      };

      mockUserQueries.findById.mockResolvedValue(mockUser);

      await expect(webAdminService.changePassword(
        'user-123',
        'oldpassword',
        'weak',
        { ipAddress: '192.168.1.1' }
      )).rejects.toThrow('新密码强度不足');
    });
  });

  describe('Session Management', () => {
    beforeEach(async () => {
      mockSystemConfigQueries.get.mockResolvedValue({});
      mockUserQueries.findByEmail.mockResolvedValue(null);
      mockUserQueries.create.mockResolvedValue({ id: 'admin-id' });
      await webAdminService.initialize();
    });

    it('应该获取用户会话列表', async () => {
      // 创建测试会话
      const sessionId = 'test-session-id';
      webAdminService.activeSessions.set(sessionId, {
        id: sessionId,
        userId: 'user-123',
        userAgent: 'Test Browser',
        ipAddress: '192.168.1.1',
        createdAt: Date.now(),
        lastActivity: Date.now()
      });

      const result = await webAdminService.getUserSessions('user-123');

      expect(result.success).toBe(true);
      expect(result.data.sessions).toBeInstanceOf(Array);
      expect(result.data.sessions.length).toBe(1);
    });

    it('应该终止指定会话', async () => {
      const sessionId = 'test-session-id';
      webAdminService.activeSessions.set(sessionId, {
        id: sessionId,
        userId: 'user-123',
        userAgent: 'Test Browser',
        ipAddress: '192.168.1.1',
        createdAt: Date.now(),
        lastActivity: Date.now()
      });

      const result = await webAdminService.terminateSession(sessionId, 'user-123', {
        ipAddress: '192.168.1.1'
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('会话已终止');
      expect(webAdminService.activeSessions.has(sessionId)).toBe(false);
    });
  });

  describe('Audit Logging', () => {
    beforeEach(async () => {
      mockSystemConfigQueries.get.mockResolvedValue({});
      mockUserQueries.findByEmail.mockResolvedValue(null);
      mockUserQueries.create.mockResolvedValue({ id: 'admin-id' });
      await webAdminService.initialize();
    });

    it('应该获取审计日志', async () => {
      // 添加测试审计日志
      webAdminService.auditLog.push({
        id: 'test-log-id',
        action: 'LOGIN',
        userId: 'user-123',
        ipAddress: '192.168.1.1',
        timestamp: Date.now(),
        data: { sessionId: 'test-session' }
      });

      const result = await webAdminService.getAuditLogs({
        action: 'LOGIN',
        page: 1,
        limit: 10
      });

      expect(result.success).toBe(true);
      expect(result.data.logs).toBeInstanceOf(Array);
      expect(result.data.pagination).toBeDefined();
    });
  });

  describe('Utility Methods', () => {
    beforeEach(async () => {
      mockSystemConfigQueries.get.mockResolvedValue({});
      mockUserQueries.findByEmail.mockResolvedValue(null);
      mockUserQueries.create.mockResolvedValue({ id: 'admin-id' });
      await webAdminService.initialize();
    });

    it('应该正确验证密码强度', () => {
      expect(webAdminService.isPasswordStrong('Weak1234')).toBe(true);  // 8个字符，包含大小写和数字
      expect(webAdminService.isPasswordStrong('weak')).toBe(false);
      expect(webAdminService.isPasswordStrong('weakpassword')).toBe(false);
      expect(webAdminService.isPasswordStrong('WEAKPASSWORD')).toBe(false);
      expect(webAdminService.isPasswordStrong('12345678')).toBe(false);
      expect(webAdminService.isPasswordStrong('weak123')).toBe(false);
      expect(webAdminService.isPasswordStrong('WEAK123')).toBe(false);
    });

    it('应该正确验证URL', () => {
      expect(webAdminService.isValidURL('https://example.com')).toBe(true);
      expect(webAdminService.isValidURL('http://example.com/feed.xml')).toBe(true);
      expect(webAdminService.isValidURL('invalid-url')).toBe(false);
      expect(webAdminService.isValidURL('')).toBe(false);
    });

    it('应该收集系统指标', () => {
      const metrics = webAdminService.collectSystemMetrics();

      expect(metrics.memory).toBeDefined();
      expect(metrics.cpu).toBeDefined();
      expect(metrics.uptime).toBeDefined();
      expect(metrics.timestamp).toBeDefined();
      expect(metrics.nodeVersion).toBeDefined();
      expect(metrics.platform).toBeDefined();
    });

    it('应该验证告警规则', () => {
      const validRule = {
        id: 'test-rule',
        name: 'Test Rule',
        condition: 'memory.usagePercent > threshold',
        threshold: 85,
        action: 'alert'
      };

      const invalidRule = {
        id: 'invalid-rule',
        name: 'Invalid Rule'
      };

      const result = webAdminService.validateAlertRule(validRule);
      expect(result).toBe(true);
      expect(webAdminService.validateAlertRule(invalidRule)).toBe(false);
    });
  });

  describe('Service Stop', () => {
    it('应该正确停止服务', async () => {
      mockSystemConfigQueries.get.mockResolvedValue({});
      mockUserQueries.findByEmail.mockResolvedValue(null);
      mockUserQueries.create.mockResolvedValue({ id: 'admin-id' });
      await webAdminService.initialize();

      // 添加一些测试数据
      webAdminService.activeSessions.set('test-session', { id: 'test-session' });
      webAdminService.failedLoginAttempts.set('test@example.com', { count: 1 });
      webAdminService.auditLog.push({ id: 'test-log' });

      await webAdminService.stop();

      expect(webAdminService.isRunning).toBe(false);
      expect(webAdminService.activeSessions.size).toBe(0);
      expect(webAdminService.failedLoginAttempts.size).toBe(0);
      expect(webAdminService.auditLog.length).toBe(0);
    });
  });
});