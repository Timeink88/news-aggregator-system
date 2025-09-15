/**
 * Email Service 测试文件
 * 测试邮件发送、队列处理、模板渲染等功能
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EmailService } from './EmailService.js';
import { EventEmitter } from 'events';

// Mock dependencies
jest.mock('../database/client.js');
jest.mock('../utils/logger.js');

describe('EmailService', () => {
  let emailService;
  let mockDbClient;
  let mockLogger;

  // Mock configuration
  const mockConfig = {
    resend: {
      enabled: true,
      apiKey: 'test_resend_api_key',
      baseUrl: 'https://api.resend.com',
      fromEmail: 'test@example.com',
      replyTo: 'reply@example.com'
    },
    maxRetries: 3,
    retryDelay: 1000,
    timeout: 5000,
    batchSize: 10,
    queueProcessingInterval: 1000,
    dailyDigest: {
      enabled: true,
      sendTime: '09:00',
      timezone: 'UTC',
      maxArticles: 20,
      includeSentiment: true,
      includeStocks: true,
      template: 'daily-digest'
    },
    realTimeNotifications: {
      enabled: true,
      triggers: ['high_importance', 'breaking_news'],
      cooldownPeriod: 300000,
      maxNotificationsPerHour: 10,
      template: 'realtime-notification'
    },
    templates: {
      basePath: './src/templates',
      defaultTemplate: 'default'
    }
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock instances
    mockDbClient = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockResolvedValue({ data: [], error: null }),
      update: jest.fn().mockResolvedValue({ data: [], error: null }),
      delete: jest.fn().mockResolvedValue({ data: [], error: null }),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null })
    };

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    // Mock global fetch
    global.fetch = jest.fn();

    // Mock module imports
    jest.doMock('../database/client.js', () => mockDbClient);
    jest.doMock('../utils/logger.js', () => mockLogger);

    // Create service instance
    emailService = new EmailService(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should create instance with default configuration', () => {
      expect(emailService).toBeInstanceOf(EventEmitter);
      expect(emailService.isRunning).toBe(false);
      expect(emailService.emailQueue).toEqual([]);
      expect(emailService.stats.emailsSent).toBe(0);
      expect(emailService.notificationCooldowns).toBeInstanceOf(Map);
    });

    it('should create instance with custom configuration', () => {
      const customConfig = {
        ...mockConfig,
        maxConcurrentSends: 5,
        dailyDigest: {
          sendTime: '10:00',
          maxArticles: 50
        }
      };

      const customService = new EmailService(customConfig);
      expect(customService.config.maxConcurrentSends).toBe(5);
      expect(customService.config.dailyDigest.sendTime).toBe('10:00');
      expect(customService.config.dailyDigest.maxArticles).toBe(50);
    });
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      // Mock successful validation
      emailService.validateConfiguration = jest.fn().mockResolvedValue(true);
      emailService.loadEmailTemplates = jest.fn().mockResolvedValue(true);
      emailService.startQueueProcessor = jest.fn();
      emailService.startDailyDigestScheduler = jest.fn();

      const result = await emailService.initialize();

      expect(result).toBe(true);
      expect(emailService.isRunning).toBe(true);
      expect(emailService.validateConfiguration).toHaveBeenCalled();
      expect(emailService.loadEmailTemplates).toHaveBeenCalled();
      expect(emailService.startQueueProcessor).toHaveBeenCalled();
      expect(emailService.startDailyDigestScheduler).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Email Service 初始化完成');
    });

    it('should handle initialization errors', async () => {
      const error = new Error('Validation failed');
      emailService.validateConfiguration = jest.fn().mockRejectedValue(error);

      await expect(emailService.initialize()).rejects.toThrow('Validation failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Email Service 初始化失败:', error);
    });
  });

  describe('validateConfiguration', () => {
    it('should pass validation with valid configuration', async () => {
      emailService.testResendConnection = jest.fn().mockResolvedValue(true);

      await expect(emailService.validateConfiguration()).resolves.not.toThrow();
      expect(emailService.testResendConnection).toHaveBeenCalled();
    });

    it('should warn when service is disabled', async () => {
      emailService.config.resend.enabled = false;

      await emailService.validateConfiguration();

      expect(mockLogger.warn).toHaveBeenCalledWith('Email Service已禁用');
    });

    it('should throw error for missing API key', async () => {
      emailService.config.resend.apiKey = null;

      await expect(emailService.validateConfiguration()).rejects.toThrow('缺少Resend API密钥');
    });

    it('should throw error for missing from email', async () => {
      emailService.config.resend.fromEmail = null;

      await expect(emailService.validateConfiguration()).rejects.toThrow('缺少发件人邮箱地址');
    });

    it('should throw error for connection test failure', async () => {
      emailService.testResendConnection = jest.fn().mockResolvedValue(false);

      await expect(emailService.validateConfiguration()).rejects.toThrow('Resend API连接测试失败');
    });
  });

  describe('testResendConnection', () => {
    it('should return true for successful connection', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200
      });

      const result = await emailService.testResendConnection();

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.resend.com/domains',
        {
          method: 'GET',
          headers: {
            'Authorization': 'Bearer test_resend_api_key',
            'Content-Type': 'application/json'
          },
          signal: expect.any(AbortSignal)
        }
      );
    });

    it('should return false for failed connection', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 401
      });

      const result = await emailService.testResendConnection();

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith('Resend连接测试失败:', expect.any(Error));
    });

    it('should handle network errors', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));

      const result = await emailService.testResendConnection();

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith('Resend连接测试失败:', expect.any(Error));
    });
  });

  describe('loadEmailTemplates', () => {
    it('should load all email templates successfully', async () => {
      await emailService.loadEmailTemplates();

      expect(emailService.emailTemplates).toBeDefined();
      expect(emailService.emailTemplates['daily-digest']).toBeDefined();
      expect(emailService.emailTemplates['realtime-notification']).toBeDefined();
      expect(emailService.emailTemplates['breaking-news']).toBeDefined();
      expect(emailService.emailTemplates['weekly-summary']).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith('已加载 4 个邮件模板');
    });
  });

  describe('sendEmail', () => {
    beforeEach(async () => {
      await emailService.initialize();
    });

    it('should send email successfully with HTML and text', async () => {
      const emailOptions = {
        to: 'test@example.com',
        subject: 'Test Email',
        html: '<h1>Test Content</h1>',
        text: 'Test Content'
      };

      emailService.sendEmailImmediately = jest.fn().mockResolvedValue({
        success: true,
        emailId: 'test_email_id'
      });

      const result = await emailService.sendEmail(emailOptions);

      expect(result.success).toBe(true);
      expect(result.emailId).toBe('test_email_id');
      expect(emailService.sendEmailImmediately).toHaveBeenCalledWith({
        from: 'test@example.com',
        to: ['test@example.com'],
        subject: 'Test Email',
        html: '<h1>Test Content</h1>',
        text: 'Test Content',
        reply_to: 'reply@example.com'
      });
    });

    it('should send email with template', async () => {
      const emailOptions = {
        to: 'test@example.com',
        subject: 'Template Email',
        templateId: 'daily-digest',
        templateData: { date: '2024-01-01', articles: [] }
      };

      emailService.renderTemplate = jest.fn().mockReturnValue({
        html: '<p>Rendered template</p>',
        text: 'Rendered template'
      });

      emailService.sendEmailImmediately = jest.fn().mockResolvedValue({
        success: true,
        emailId: 'template_email_id'
      });

      const result = await emailService.sendEmail(emailOptions);

      expect(result.success).toBe(true);
      expect(emailService.renderTemplate).toHaveBeenCalledWith('daily-digest', { date: '2024-01-01', articles: [] });
    });

    it('should generate text from HTML when text is not provided', async () => {
      const emailOptions = {
        to: 'test@example.com',
        subject: 'HTML Only Email',
        html: '<h1>HTML Content</h1>'
      };

      emailService.sendEmailImmediately = jest.fn().mockResolvedValue({
        success: true,
        emailId: 'html_email_id'
      });

      await emailService.sendEmail(emailOptions);

      expect(emailService.sendEmailImmediately).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'HTML Content'
        })
      );
    });

    it('should queue email with normal priority', async () => {
      const emailOptions = {
        to: 'test@example.com',
        subject: 'Queued Email',
        html: '<p>Queued content</p>',
        priority: 'normal'
      };

      emailService.queueEmail = jest.fn().mockResolvedValue({
        success: true,
        emailId: 'queued_email_id'
      });

      const result = await emailService.sendEmail(emailOptions);

      expect(result.success).toBe(true);
      expect(result.queued).toBe(true);
      expect(emailService.queueEmail).toHaveBeenCalled();
    });

    it('should send immediately with high priority', async () => {
      const emailOptions = {
        to: 'test@example.com',
        subject: 'High Priority Email',
        html: '<p>Urgent content</p>',
        priority: 'high'
      };

      emailService.sendEmailImmediately = jest.fn().mockResolvedValue({
        success: true,
        emailId: 'high_priority_email_id'
      });

      const result = await emailService.sendEmail(emailOptions);

      expect(result.success).toBe(true);
      expect(emailService.sendEmailImmediately).toHaveBeenCalled();
    });

    it('should handle disabled service', async () => {
      emailService.config.resend.enabled = false;

      const result = await emailService.sendEmail({
        to: 'test@example.com',
        subject: 'Test'
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('service_disabled');
    });

    it('should validate email address', async () => {
      const result = await emailService.sendEmail({
        to: 'invalid-email',
        subject: 'Test'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('无效的收件人邮箱: invalid-email');
    });
  });

  describe('sendEmailImmediately', () => {
    beforeEach(async () => {
      await emailService.initialize();
    });

    it('should send email via Resend API successfully', async () => {
      const emailData = {
        from: 'test@example.com',
        to: ['recipient@example.com'],
        subject: 'Test Subject',
        html: '<p>Test Content</p>',
        text: 'Test Content'
      };

      global.fetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ id: 'resend_email_id' })
      });

      const result = await emailService.sendEmailImmediately(emailData);

      expect(result.success).toBe(true);
      expect(result.emailId).toBe('resend_email_id');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer test_resend_api_key',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(emailData),
          signal: expect.any(AbortSignal)
        }
      );

      expect(emailService.stats.emailsSent).toBe(1);
      expect(mockLogger.info).toHaveBeenCalledWith('邮件发送成功: recipient@example.com - Test Subject');
    });

    it('should handle Resend API errors', async () => {
      const emailData = {
        from: 'test@example.com',
        to: ['recipient@example.com'],
        subject: 'Test Subject',
        html: '<p>Test Content</p>'
      };

      global.fetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: jest.fn().mockResolvedValue({ error: { message: 'Invalid recipient' } })
      });

      const result = await emailService.sendEmailImmediately(emailData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid recipient');
      expect(emailService.stats.emailsFailed).toBe(1);
      expect(mockLogger.error).toHaveBeenCalledWith('邮件发送失败:', expect.any(Error));
    });

    it('should handle network timeouts', async () => {
      const emailData = {
        from: 'test@example.com',
        to: ['recipient@example.com'],
        subject: 'Test Subject',
        html: '<p>Test Content</p>'
      };

      global.fetch.mockRejectedValue(new Error('Request timeout'));

      const result = await emailService.sendEmailImmediately(emailData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Request timeout');
      expect(emailService.stats.emailsFailed).toBe(1);
    });

    it('should emit events on successful send', async () => {
      const emailData = {
        from: 'test@example.com',
        to: ['recipient@example.com'],
        subject: 'Test Subject',
        html: '<p>Test Content</p>'
      };

      global.fetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ id: 'resend_email_id' })
      });

      const eventSpy = jest.fn();
      emailService.on('emailSent', eventSpy);

      await emailService.sendEmailImmediately(emailData);

      expect(eventSpy).toHaveBeenCalledWith({
        emailId: 'resend_email_id',
        to: ['recipient@example.com'],
        subject: 'Test Subject',
        processingTime: expect.any(Number)
      });
    });

    it('should emit error events on failed send', async () => {
      const emailData = {
        from: 'test@example.com',
        to: ['recipient@example.com'],
        subject: 'Test Subject',
        html: '<p>Test Content</p>'
      };

      global.fetch.mockResolvedValue({
        ok: false,
        json: jest.fn().mockResolvedValue({ error: { message: 'API Error' } })
      });

      const eventSpy = jest.fn();
      emailService.on('emailFailed', eventSpy);

      await emailService.sendEmailImmediately(emailData);

      expect(eventSpy).toHaveBeenCalledWith({
        to: ['recipient@example.com'],
        subject: 'Test Subject',
        error: 'API Error'
      });
    });
  });

  describe('queueEmail', () => {
    it('should add email to queue successfully', async () => {
      const emailData = {
        from: 'test@example.com',
        to: ['recipient@example.com'],
        subject: 'Queued Email',
        html: '<p>Queued content</p>'
      };

      const result = await emailService.queueEmail(emailData);

      expect(result.success).toBe(true);
      expect(result.queued).toBe(true);
      expect(result.emailId).toBeDefined();
      expect(emailService.emailQueue.length).toBe(1);
      expect(emailService.stats.queueSize).toBe(1);

      const queuedEmail = emailService.emailQueue[0];
      expect(queuedEmail.to).toEqual(['recipient@example.com']);
      expect(queuedEmail.subject).toBe('Queued Email');
      expect(queuedEmail.status).toBe('queued');
      expect(queuedEmail.attempt).toBe(0);
    });

    it('should handle priority setting', async () => {
      const emailData = {
        from: 'test@example.com',
        to: ['recipient@example.com'],
        subject: 'High Priority Email',
        html: '<p>Urgent content</p>',
        priority: 'high'
      };

      await emailService.queueEmail(emailData);

      expect(emailService.emailQueue[0].priority).toBe('high');
    });
  });

  describe('processQueue', () => {
    beforeEach(async () => {
      await emailService.initialize();
    });

    it('should process queued emails in batches', async () => {
      // Add test emails to queue
      for (let i = 0; i < 5; i++) {
        await emailService.queueEmail({
          from: 'test@example.com',
          to: [`recipient${i}@example.com`],
          subject: `Email ${i}`,
          html: `<p>Content ${i}</p>`
        });
      }

      emailService.processQueuedEmail = jest.fn()
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false, error: 'Failed' })
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: true });

      await emailService.processQueue();

      expect(emailService.processQueuedEmail).toHaveBeenCalledTimes(5);
      expect(emailService.emailQueue.length).toBe(0);
      expect(emailService.processingQueue).toBe(false);
    });

    it('should not process queue when already processing', async () => {
      emailService.processingQueue = true;

      await emailService.queueEmail({
        from: 'test@example.com',
        to: ['recipient@example.com'],
        subject: 'Test Email',
        html: '<p>Test</p>'
      });

      emailService.processQueuedEmail = jest.fn();

      await emailService.processQueue();

      expect(emailService.processQueuedEmail).not.toHaveBeenCalled();
    });

    it('should handle processing errors gracefully', async () => {
      await emailService.queueEmail({
        from: 'test@example.com',
        to: ['recipient@example.com'],
        subject: 'Test Email',
        html: '<p>Test</p>'
      });

      emailService.processQueuedEmail = jest.fn().mockRejectedValue(new Error('Processing error'));

      await emailService.processQueue();

      expect(emailService.processingQueue).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith('处理邮件队列失败:', expect.any(Error));
    });
  });

  describe('sendDailyDigest', () => {
    beforeEach(async () => {
      await emailService.initialize();
    });

    it('should send daily digest successfully', async () => {
      const userId = 'user123';
      const userPrefs = {
        user_id: userId,
        email: 'user@example.com',
        name: 'Test User',
        daily_digest_enabled: true,
        preferredCategories: ['tech', 'finance']
      };

      mockDbClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          gte: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: [
                  {
                    id: 'article1',
                    title: 'Tech News',
                    category: 'tech',
                    importance_score: 0.8,
                    sentiment: 'positive',
                    published_at: '2024-01-01T10:00:00Z'
                  }
                ],
                error: null
              })
            })
          })
        })
      });

      emailService.getUserEmailPreferences = jest.fn().mockResolvedValue(userPrefs);
      emailService.generateDailyDigest = jest.fn().mockResolvedValue({
        date: '2024-01-01',
        articles: [],
        summary: { totalArticles: 1 }
      });
      emailService.sendEmail = jest.fn().mockResolvedValue({
        success: true,
        emailId: 'digest_email_id'
      });
      emailService.recordEmailSent = jest.fn();

      const result = await emailService.sendDailyDigest(userId);

      expect(result.success).toBe(true);
      expect(emailService.sendEmail).toHaveBeenCalledWith({
        to: 'user@example.com',
        subject: '每日新闻摘要 - 2024/1/1',
        templateId: 'daily-digest',
        templateData: expect.any(Object),
        priority: 'normal'
      });
      expect(emailService.stats.digestSent).toBe(1);
      expect(emailService.recordEmailSent).toHaveBeenCalledWith(userId, 'daily_digest', 'digest_email_id');
    });

    it('should not send when daily digest is disabled', async () => {
      emailService.config.dailyDigest.enabled = false;

      const result = await emailService.sendDailyDigest('user123');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('daily_digest_disabled');
    });

    it('should not send when user has disabled emails', async () => {
      emailService.getUserEmailPreferences = jest.fn().mockResolvedValue({
        enabled: false
      });

      const result = await emailService.sendDailyDigest('user123');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('user_disabled_emails');
    });
  });

  describe('sendRealTimeNotification', () => {
    beforeEach(async () => {
      await emailService.initialize();
    });

    it('should send real-time notification successfully', async () => {
      const userId = 'user123';
      const article = {
        id: 'article1',
        title: 'Breaking News',
        category: 'breaking',
        published_at: '2024-01-01T10:00:00Z'
      };
      const triggerType = 'breaking_news';

      const userPrefs = {
        user_id: userId,
        email: 'user@example.com',
        name: 'Test User',
        realTimeNotifications: true
      };

      emailService.getUserEmailPreferences = jest.fn().mockResolvedValue(userPrefs);
      emailService.shouldSendNotification = jest.fn().mockReturnValue(true);
      emailService.hasExceededNotificationLimit = jest.fn().mockResolvedValue(false);
      emailService.sendEmail = jest.fn().mockResolvedValue({
        success: true,
        emailId: 'notification_email_id'
      });
      emailService.recordNotificationSent = jest.fn();

      const result = await emailService.sendRealTimeNotification(userId, article, triggerType);

      expect(result.success).toBe(true);
      expect(emailService.sendEmail).toHaveBeenCalledWith({
        to: 'user@example.com',
        subject: '新闻通知: Breaking News',
        templateId: 'realtime-notification',
        templateData: {
          article,
          triggerType,
          user: { name: 'Test User' },
          timestamp: expect.any(String)
        },
        priority: 'high'
      });
      expect(emailService.stats.notificationsSent).toBe(1);
      expect(emailService.recordNotificationSent).toHaveBeenCalledWith(userId, article.id, triggerType, 'notification_email_id');
    });

    it('should not send when notifications are disabled', async () => {
      emailService.config.realTimeNotifications.enabled = false;

      const result = await emailService.sendRealTimeNotification('user123', {}, 'breaking_news');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('notifications_disabled');
    });

    it('should not send during cooldown period', async () => {
      const userId = 'user123';
      const userPrefs = {
        user_id: userId,
        email: 'user@example.com',
        realTimeNotifications: true
      };

      emailService.getUserEmailPreferences = jest.fn().mockResolvedValue(userPrefs);
      emailService.shouldSendNotification = jest.fn().mockReturnValue(false);

      const result = await emailService.sendRealTimeNotification(userId, {}, 'breaking_news');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('cooldown_period');
    });

    it('should not send when rate limit exceeded', async () => {
      const userId = 'user123';
      const userPrefs = {
        user_id: userId,
        email: 'user@example.com',
        realTimeNotifications: true
      };

      emailService.getUserEmailPreferences = jest.fn().mockResolvedValue(userPrefs);
      emailService.shouldSendNotification = jest.fn().mockReturnValue(true);
      emailService.hasExceededNotificationLimit = jest.fn().mockResolvedValue(true);

      const result = await emailService.sendRealTimeNotification(userId, {}, 'breaking_news');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('rate_limit');
    });
  });

  describe('renderTemplate', () => {
    beforeEach(() => {
      emailService.emailTemplates = {
        'test-template': {
          html: '<h1>{{title}}</h1><p>{{content}}</p>',
          text: '{{title}}\n{{content}}'
        }
      };
    });

    it('should render template with simple variables', () => {
      const data = {
        title: 'Test Title',
        content: 'Test Content'
      };

      const result = emailService.renderTemplate('test-template', data);

      expect(result.html).toBe('<h1>Test Title</h1><p>Test Content</p>');
      expect(result.text).toBe('Test Title\nTest Content');
    });

    it('should handle missing variables', () => {
      const data = {
        title: 'Test Title'
        // content is missing
      };

      const result = emailService.renderTemplate('test-template', data);

      expect(result.html).toBe('<h1>Test Title</h1><p>{{content}}</p>');
      expect(result.text).toBe('Test Title\n{{content}}');
    });

    it('should handle conditional blocks', () => {
      emailService.emailTemplates = {
        'conditional-template': {
          html: '{{#if showTitle}}<h1>{{title}}</h1>{{/if}}<p>Content</p>',
          text: '{{#if showTitle}}{{title}}\n{{/if}}Content'
        }
      };

      const dataWithTitle = {
        showTitle: true,
        title: 'Visible Title'
      };

      const resultWith = emailService.renderTemplate('conditional-template', dataWithTitle);
      expect(resultWith.html).toBe('<h1>Visible Title</h1><p>Content</p>');

      const dataWithoutTitle = {
        showTitle: false,
        title: 'Hidden Title'
      };

      const resultWithout = emailService.renderTemplate('conditional-template', dataWithoutTitle);
      expect(resultWithout.html).toBe('<p>Content</p>');
    });

    it('should handle loops', () => {
      emailService.emailTemplates = {
        'loop-template': {
          html: '{{#each items}}<div>{{this.name}}: {{this.value}}</div>{{/each}}',
          text: '{{#each items}}{{this.name}}: {{this.value}}\n{{/each}}'
        }
      };

      const data = {
        items: [
          { name: 'Item 1', value: 'Value 1' },
          { name: 'Item 2', value: 'Value 2' }
        ]
      };

      const result = emailService.renderTemplate('loop-template', data);

      expect(result.html).toBe('<div>Item 1: Value 1</div><div>Item 2: Value 2</div>');
      expect(result.text).toBe('Item 1: Value 1\nItem 2: Value 2\n');
    });

    it('should throw error for missing template', () => {
      expect(() => {
        emailService.renderTemplate('missing-template', {});
      }).toThrow('模板 missing-template 不存在');
    });
  });

  describe('Validation', () => {
    describe('validateEmail', () => {
      it('should validate correct email addresses', () => {
        expect(emailService.validateEmail('test@example.com')).toBe(true);
        expect(emailService.validateEmail('user.name+tag@domain.co.uk')).toBe(true);
        expect(emailService.validateEmail('user_name@sub.domain.com')).toBe(true);
      });

      it('should reject invalid email addresses', () => {
        expect(emailService.validateEmail('invalid-email')).toBe(false);
        expect(emailService.validateEmail('test@')).toBe(false);
        expect(emailService.validateEmail('@domain.com')).toBe(false);
        expect(emailService.validateEmail('test.domain.com')).toBe(false);
        expect(emailService.validateEmail('')).toBe(false);
      });
    });

    describe('validateEmailList', () => {
      it('should validate list of email addresses', () => {
        const emails = ['valid1@example.com', 'valid2@example.com', 'invalid-email', 'valid3@example.com'];

        const result = emailService.validateEmailList(emails);

        expect(result.validEmails).toEqual(['valid1@example.com', 'valid2@example.com', 'valid3@example.com']);
        expect(result.invalidEmails).toEqual(['invalid-email']);
        expect(result.allValid).toBe(false);
      });

      it('should return all valid when all emails are valid', () => {
        const emails = ['valid1@example.com', 'valid2@example.com'];

        const result = emailService.validateEmailList(emails);

        expect(result.validEmails).toEqual(emails);
        expect(result.invalidEmails).toEqual([]);
        expect(result.allValid).toBe(true);
      });

      it('should handle empty list', () => {
        const result = emailService.validateEmailList([]);

        expect(result.validEmails).toEqual([]);
        expect(result.invalidEmails).toEqual([]);
        expect(result.allValid).toBe(true);
      });
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      await emailService.initialize();
    });

    it('should update statistics correctly', () => {
      emailService.updateStats({
        emailsSent: 10,
        totalProcessingTime: 5000
      });

      expect(emailService.stats.emailsSent).toBe(10);
      expect(emailService.stats.totalProcessingTime).toBe(5000);
      expect(emailService.stats.averageProcessingTime).toBe(500); // 5000 / 10
    });

    it('should get comprehensive statistics', async () => {
      mockDbClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          gte: jest.fn().mockResolvedValue({
            data: [
              { email_type: 'daily_digest', created_at: '2024-01-01T10:00:00Z' },
              { email_type: 'notification', created_at: '2024-01-01T11:00:00Z' }
            ],
            error: null
          })
        })
      });

      const stats = await emailService.getStats();

      expect(stats.isRunning).toBe(true);
      expect(stats.config).toBeDefined();
      expect(stats.processing).toBeDefined();
      expect(stats.daily).toBeDefined();
      expect(stats.queue).toBeDefined();
      expect(stats.uptime).toBeDefined();
    });
  });

  describe('Template Methods', () => {
    it('should generate email ID correctly', () => {
      const id1 = emailService.generateEmailId();
      const id2 = emailService.generateEmailId();

      expect(id1).toMatch(/^email_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^email_\d+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    it('should convert HTML to text', () => {
      const html = '<h1>Title</h1><p>This is a paragraph with <strong>bold</strong> text.</p>';
      const text = emailService.htmlToText(html);

      expect(text).toBe('TitleThis is a paragraph with bold text.');
    });

    it('should get nested values from object', () => {
      const obj = {
        user: {
          profile: {
            name: 'John Doe',
            age: 30
          }
        }
      };

      expect(emailService.getNestedValue(obj, 'user.profile.name')).toBe('John Doe');
      expect(emailService.getNestedValue(obj, 'user.profile.age')).toBe(30);
      expect(emailService.getNestedValue(obj, 'user.nonexistent')).toBeUndefined();
      expect(emailService.getNestedValue(obj, 'nonexistent.key')).toBeUndefined();
    });

    it('should get top categories from articles', () => {
      const articles = [
        { category: 'tech' },
        { category: 'tech' },
        { category: 'finance' },
        { category: 'finance' },
        { category: 'finance' },
        { category: 'politics' }
      ];

      const topCategories = emailService.getTopCategories(articles);

      expect(topCategories).toEqual(['finance', 'tech', 'politics']);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await emailService.initialize();
    });

    it('should handle database errors gracefully', async () => {
      mockDbClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          gte: jest.fn().mockRejectedValue(new Error('Database connection failed'))
        })
      });

      const stats = await emailService.getStats();

      expect(stats.error).toBe('Database connection failed');
      expect(mockLogger.error).toHaveBeenCalledWith('获取邮件服务统计失败:', expect.any(Error));
    });

    it('should handle template rendering errors', () => {
      emailService.emailTemplates = {
        'broken-template': {
          html: '{{invalid syntax}}',
          text: 'Simple text'
        }
      };

      // Should handle malformed template gracefully
      const result = emailService.renderTemplate('broken-template', {});
      expect(result.html).toBeDefined();
      expect(result.text).toBeDefined();
    });

    it('should handle queue processing errors', async () => {
      await emailService.queueEmail({
        from: 'test@example.com',
        to: ['recipient@example.com'],
        subject: 'Test Email',
        html: '<p>Test</p>'
      });

      emailService.processQueuedEmail = jest.fn().mockRejectedValue(new Error('Processing failed'));

      await emailService.processQueue();

      expect(mockLogger.error).toHaveBeenCalledWith('处理邮件队列失败:', expect.any(Error));
      expect(emailService.processingQueue).toBe(false);
    });
  });

  describe('Service Lifecycle', () => {
    beforeEach(async () => {
      await emailService.initialize();
    });

    it('should shutdown service gracefully', async () => {
      // Add some emails to queue
      await emailService.queueEmail({
        from: 'test@example.com',
        to: ['recipient@example.com'],
        subject: 'Test Email',
        html: '<p>Test</p>'
      });

      emailService.processQueue = jest.fn().mockResolvedValue();

      await emailService.shutdown();

      expect(emailService.isRunning).toBe(false);
      expect(emailService.processQueue).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('正在关闭 Email Service...');
      expect(mockLogger.info).toHaveBeenCalledWith('Email Service 已关闭');
    });

    it('should handle shutdown errors', async () => {
      emailService.processQueue = jest.fn().mockRejectedValue(new Error('Shutdown failed'));

      await emailService.shutdown();

      expect(emailService.isRunning).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith('关闭 Email Service 失败:', expect.any(Error));
    });
  });

  describe('Event Emission', () => {
    beforeEach(async () => {
      await emailService.initialize();
    });

    it('should emit emailSent event', async () => {
      const emailData = {
        from: 'test@example.com',
        to: ['recipient@example.com'],
        subject: 'Test Email',
        html: '<p>Test</p>'
      };

      global.fetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ id: 'test_email_id' })
      });

      const eventSpy = jest.fn();
      emailService.on('emailSent', eventSpy);

      await emailService.sendEmailImmediately(emailData);

      expect(eventSpy).toHaveBeenCalledWith({
        emailId: 'test_email_id',
        to: ['recipient@example.com'],
        subject: 'Test Email',
        processingTime: expect.any(Number)
      });
    });

    it('should emit emailFailed event', async () => {
      const emailData = {
        from: 'test@example.com',
        to: ['recipient@example.com'],
        subject: 'Test Email',
        html: '<p>Test</p>'
      };

      global.fetch.mockResolvedValue({
        ok: false,
        json: jest.fn().mockResolvedValue({ error: { message: 'API Error' } })
      });

      const eventSpy = jest.fn();
      emailService.on('emailFailed', eventSpy);

      await emailService.sendEmailImmediately(emailData);

      expect(eventSpy).toHaveBeenCalledWith({
        to: ['recipient@example.com'],
        subject: 'Test Email',
        error: 'API Error'
      });
    });

    it('should emit error events for various failures', async () => {
      const eventSpy = jest.fn();
      emailService.on('error', eventSpy);

      // Test configuration validation error
      await expect(emailService.validateConfiguration()).rejects.toThrow();
      expect(eventSpy).not.toHaveBeenCalled(); // validateConfiguration doesn't emit errors

      // Test processing error
      emailService.processQueuedEmail = jest.fn().mockRejectedValue(new Error('Processing error'));
      await emailService.processQueue();

      expect(eventSpy).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});