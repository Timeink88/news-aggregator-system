/**
 * Email服务测试用例
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { emailService } from '../index.js';
import { validateEmail } from '../../../utils/validators.js';

// Mock依赖
jest.mock('nodemailer');
jest.mock('@supabase/supabase-js');
jest.mock('node:fs/promises');
jest.mock('../../../utils/logger.js');

const mockNodemailer = require('nodemailer');
const mockSupabase = require('@supabase/supabase-js');
const mockFs = require('node:fs/promises');

describe('Email Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    emailService.clearCache();
  });

  describe('sendEmail', () => {
    it('should send email successfully', async () => {
      const emailOptions = {
        to: 'test@example.com',
        subject: 'Test Email',
        html: '<h1>Test Content</h1>',
        text: 'Test Content'
      };

      mockNodemailer.createTransporter.mockReturnValue({
        sendMail: jest.fn().mockResolvedValue({
          messageId: 'test-message-id'
        })
      });

      mockSupabase.createClient().from().update().eq().select().single.mockResolvedValue({
        data: { id: 'email-log-id' },
        error: null
      });

      const result = await emailService.sendEmail(emailOptions);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('test-message-id');
      expect(result.emailId).toBeDefined();
    });

    it('should handle missing required fields', async () => {
      const invalidOptions = {
        to: 'test@example.com'
        // 缺少 subject 和内容
      };

      await expect(emailService.sendEmail(invalidOptions))
        .rejects.toThrow('缺少必要字段');
    });

    it('should handle invalid email address', async () => {
      const invalidOptions = {
        to: 'invalid-email',
        subject: 'Test',
        html: '<h1>Test</h1>'
      };

      await expect(emailService.sendEmail(invalidOptions))
        .rejects.toThrow('无效的收件人邮箱地址');
    });

    it('should handle empty content', async () => {
      const invalidOptions = {
        to: 'test@example.com',
        subject: 'Test'
        // 缺少内容
      };

      await expect(emailService.sendEmail(invalidOptions))
        .rejects.toThrow('邮件内容不能为空');
    });

    it('should handle rate limiting', async () => {
      const emailOptions = {
        to: 'test@example.com',
        subject: 'Test Email',
        html: '<h1>Test Content</h1>',
        text: 'Test Content'
      };

      // 模拟达到频率限制
      emailService.rateLimiter.set('test@example.com', Array(100).fill(Date.now()));

      await expect(emailService.sendEmail(emailOptions))
        .rejects.toThrow('发送频率超过限制');
    });

    it('should handle API errors', async () => {
      const emailOptions = {
        to: 'test@example.com',
        subject: 'Test Email',
        html: '<h1>Test Content</h1>',
        text: 'Test Content'
      };

      mockNodemailer.createTransporter.mockReturnValue({
        sendMail: jest.fn().mockRejectedValue(new Error('API Error'))
      });

      const result = await emailService.sendEmail(emailOptions);

      expect(result.success).toBe(false);
      expect(result.error).toBe('API Error');
    });
  });

  describe('sendTemplateEmail', () => {
    it('should send template email successfully', async () => {
      const templateName = 'newsletter';
      const to = 'test@example.com';
      const data = { user: { name: 'Test User' } };

      // Mock template
      mockFs.readFile.mockResolvedValue('<h1>Hello {{user.name}}</h1>');

      // Mock email sending
      mockNodemailer.createTransporter.mockReturnValue({
        sendMail: jest.fn().mockResolvedValue({
          messageId: 'test-message-id'
        })
      });

      mockSupabase.createClient().from().update().eq().select().single.mockResolvedValue({
        data: { id: 'email-log-id' },
        error: null
      });

      const result = await emailService.sendTemplateEmail(templateName, to, data);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('test-message-id');
    });

    it('should handle missing template', async () => {
      mockFs.readFile.mockRejectedValue(new Error('Template not found'));

      const result = await emailService.sendTemplateEmail('nonexistent', 'test@example.com', {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('模板不存在: nonexistent');
    });

    it('should use cached template', async () => {
      const templateName = 'newsletter';
      const to = 'test@example.com';
      const data = { user: { name: 'Test User' } };

      // Mock template
      mockFs.readFile.mockResolvedValue('<h1>Hello {{user.name}}</h1>');

      // Mock email sending
      mockNodemailer.createTransporter.mockReturnValue({
        sendMail: jest.fn().mockResolvedValue({
          messageId: 'test-message-id'
        })
      });

      mockSupabase.createClient().from().update().eq().select().single.mockResolvedValue({
        data: { id: 'email-log-id' },
        error: null
      });

      // 第一次调用
      const result1 = await emailService.sendTemplateEmail(templateName, to, data);
      expect(result1.success).toBe(true);

      // 第二次调用应该使用缓存
      const result2 = await emailService.sendTemplateEmail(templateName, to, data);
      expect(result2.success).toBe(true);

      // 文件系统应该只调用一次
      expect(mockFs.readFile).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendNewsletter', () => {
    it('should send newsletter successfully', async () => {
      const userId = 'user-1';
      const articles = [
        { id: 'article-1', title: 'Article 1', summary: 'Summary 1', url: 'https://example.com/1' }
      ];

      // Mock user
      mockSupabase.createClient().from().select().single.mockResolvedValue({
        data: { id: userId, name: 'Test User', email: 'test@example.com' },
        error: null
      });

      // Mock template
      mockFs.readFile.mockResolvedValue('<h1>Newsletter</h1>');

      // Mock email sending
      mockNodemailer.createTransporter.mockReturnValue({
        sendMail: jest.fn().mockResolvedValue({
          messageId: 'test-message-id'
        })
      });

      mockSupabase.createClient().from().update().eq().select().single.mockResolvedValue({
        data: { id: 'email-log-id' },
        error: null
      });

      const result = await emailService.sendNewsletter(userId, articles);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('test-message-id');
    });

    it('should handle non-existent user', async () => {
      const userId = 'non-existent-user';

      mockSupabase.createClient().from().select().single.mockResolvedValue({
        data: null,
        error: { message: 'User not found' }
      });

      const result = await emailService.sendNewsletter(userId, []);

      expect(result.success).toBe(false);
      expect(result.error).toBe('用户不存在');
    });
  });

  describe('sendNotification', () => {
    it('should send notification successfully', async () => {
      const userId = 'user-1';
      const type = 'test';
      const title = 'Test Notification';
      const message = 'This is a test notification';

      // Mock user
      mockSupabase.createClient().from().select().single.mockResolvedValue({
        data: { id: userId, name: 'Test User', email: 'test@example.com' },
        error: null
      });

      // Mock template
      mockFs.readFile.mockResolvedValue('<h1>Notification</h1>');

      // Mock email sending
      mockNodemailer.createTransporter.mockReturnValue({
        sendMail: jest.fn().mockResolvedValue({
          messageId: 'test-message-id'
        })
      });

      mockSupabase.createClient().from().update().eq().select().single.mockResolvedValue({
        data: { id: 'email-log-id' },
        error: null
      });

      const result = await emailService.sendNotification(userId, type, title, message);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('test-message-id');
    });
  });

  describe('sendDailyDigest', () => {
    it('should send daily digest successfully', async () => {
      const userId = 'user-1';
      const date = '2024-01-01';
      const summary = { totalArticles: 10, categories: { technology: 5 } };

      // Mock user
      mockSupabase.createClient().from().select().single.mockResolvedValue({
        data: { id: userId, name: 'Test User', email: 'test@example.com' },
        error: null
      });

      // Mock template
      mockFs.readFile.mockResolvedValue('<h1>Daily Digest</h1>');

      // Mock email sending
      mockNodemailer.createTransporter.mockReturnValue({
        sendMail: jest.fn().mockResolvedValue({
          messageId: 'test-message-id'
        })
      });

      mockSupabase.createClient().from().update().eq().select().single.mockResolvedValue({
        data: { id: 'email-log-id' },
        error: null
      });

      const result = await emailService.sendDailyDigest(userId, date, summary);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('test-message-id');
    });
  });

  describe('sendAlert', () => {
    it('should send alert successfully', async () => {
      const userId = 'user-1';
      const alertType = 'system';
      const severity = 'high';
      const title = 'System Alert';
      const description = 'This is a system alert';
      const actions = ['Restart service', 'Check logs'];

      // Mock user
      mockSupabase.createClient().from().select().single.mockResolvedValue({
        data: { id: userId, name: 'Test User', email: 'test@example.com' },
        error: null
      });

      // Mock template
      mockFs.readFile.mockResolvedValue('<h1>Alert</h1>');

      // Mock email sending
      mockNodemailer.createTransporter.mockReturnValue({
        sendMail: jest.fn().mockResolvedValue({
          messageId: 'test-message-id'
        })
      });

      mockSupabase.createClient().from().update().eq().select().single.mockResolvedValue({
        data: { id: 'email-log-id' },
        error: null
      });

      const result = await emailService.sendAlert(userId, alertType, severity, title, description, actions);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('test-message-id');
    });
  });

  describe('sendBulkEmails', () => {
    it('should send bulk emails successfully', async () => {
      const emails = [
        { to: 'test1@example.com', subject: 'Test 1', html: '<h1>Test 1</h1>' },
        { to: 'test2@example.com', subject: 'Test 2', html: '<h1>Test 2</h1>' }
      ];

      mockNodemailer.createTransporter.mockReturnValue({
        sendMail: jest.fn().mockResolvedValue({
          messageId: 'test-message-id'
        })
      });

      mockSupabase.createClient().from().update().eq().select().single.mockResolvedValue({
        data: { id: 'email-log-id' },
        error: null
      });

      const result = await emailService.sendBulkEmails(emails);

      expect(result.success).toBe(true);
      expect(result.totalSent).toBe(2);
      expect(result.totalFailed).toBe(0);
      expect(result.results).toHaveLength(2);
    });

    it('should handle empty emails array', async () => {
      const result = await emailService.sendBulkEmails([]);

      expect(result.success).toBe(true);
      expect(result.totalSent).toBe(0);
      expect(result.totalFailed).toBe(0);
    });

    it('should handle partial failures', async () => {
      const emails = [
        { to: 'test1@example.com', subject: 'Test 1', html: '<h1>Test 1</h1>' },
        { to: 'test2@example.com', subject: 'Test 2', html: '<h1>Test 2</h1>' }
      ];

      // Mock first email success, second email failure
      mockNodemailer.createTransporter.mockReturnValue({
        sendMail: jest.fn()
          .mockResolvedValueOnce({ messageId: 'success-id' })
          .mockRejectedValueOnce(new Error('Failed to send'))
      });

      mockSupabase.createClient().from().update().eq().select().single.mockResolvedValue({
        data: { id: 'email-log-id' },
        error: null
      });

      const result = await emailService.sendBulkEmails(emails);

      expect(result.success).toBe(true);
      expect(result.totalSent).toBe(1);
      expect(result.totalFailed).toBe(1);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('getTemplate', () => {
    it('should get template successfully', async () => {
      const templateName = 'newsletter';
      const templateContent = '<h1>Newsletter Template</h1>';

      mockFs.readFile.mockResolvedValue(templateContent);

      const result = await emailService.getTemplate(templateName);

      expect(result).toBe(templateContent);
    });

    it('should handle template not found', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      const result = await emailService.getTemplate('nonexistent');

      expect(result).toBeNull();
    });

    it('should use cached template', async () => {
      const templateName = 'newsletter';
      const templateContent = '<h1>Newsletter Template</h1>';

      mockFs.readFile.mockResolvedValue(templateContent);

      // 第一次调用
      const result1 = await emailService.getTemplate(templateName);
      expect(result1).toBe(templateContent);

      // 第二次调用应该使用缓存
      const result2 = await emailService.getTemplate(templateName);
      expect(result2).toBe(templateContent);

      // 文件系统应该只调用一次
      expect(mockFs.readFile).toHaveBeenCalledTimes(1);
    });
  });

  describe('generateTextFromHtml', () => {
    it('should generate text from HTML', () => {
      const html = '<h1>Title</h1><p>Paragraph with <strong>bold</strong> text.</p>';
      const text = emailService.generateTextFromHtml(html);

      expect(text).toBe('Title Paragraph with bold text .');
    });

    it('should handle empty HTML', () => {
      const text = emailService.generateTextFromHtml('');
      expect(text).toBe('');
    });
  });

  describe('generateSubject', () => {
    it('should generate subject for newsletter', () => {
      const data = { user: { name: 'Test User' } };
      const subject = emailService.generateSubject('newsletter', data);

      expect(subject).toBe('📰 新闻摘要 - Test User');
    });

    it('should generate subject for notification', () => {
      const data = { title: 'Test Notification' };
      const subject = emailService.generateSubject('notification', data);

      expect(subject).toBe('🔔 Test Notification');
    });

    it('should handle unknown template type', () => {
      const subject = emailService.generateSubject('unknown', {});
      expect(subject).toBe('新闻聚合系统通知');
    });
  });

  describe('checkRateLimit', () => {
    it('should allow first request', () => {
      const result = emailService.checkRateLimit('test@example.com');
      expect(result).toBe(true);
    });

    it('should block request when rate limit exceeded', () => {
      // Fill rate limiter
      emailService.rateLimiter.set('test@example.com', Array(100).fill(Date.now()));

      const result = emailService.checkRateLimit('test@example.com');
      expect(result).toBe(false);
    });

    it('should clean up old requests', () => {
      const oldTime = Date.now() - 70000; // 70 seconds ago
      emailService.rateLimiter.set('test@example.com', [oldTime]);

      const result = emailService.checkRateLimit('test@example.com');
      expect(result).toBe(true);
    });
  });

  describe('getUser', () => {
    it('should get user successfully', async () => {
      const userId = 'user-1';
      const mockUser = { id: userId, name: 'Test User', email: 'test@example.com' };

      mockSupabase.createClient().from().select().single.mockResolvedValue({
        data: mockUser,
        error: null
      });

      const result = await emailService.getUser(userId);

      expect(result).toEqual(mockUser);
    });

    it('should handle user not found', async () => {
      mockSupabase.createClient().from().select().single.mockResolvedValue({
        data: null,
        error: { message: 'User not found' }
      });

      const result = await emailService.getUser('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('updateEmailStatus', () => {
    it('should update email status successfully', async () => {
      const emailId = 'email-1';
      const mockEmail = { id: emailId, status: 'sent' };

      mockSupabase.createClient().from().update().eq().select().single.mockResolvedValue({
        data: mockEmail,
        error: null
      });

      const result = await emailService.updateEmailStatus(emailId, 'sent', 'test-message-id');

      expect(result).toEqual(mockEmail);
    });

    it('should handle database error', async () => {
      mockSupabase.createClient().from().update().eq().select().single.mockResolvedValue({
        data: null,
        error: { message: 'Database error' }
      });

      await expect(emailService.updateEmailStatus('email-1', 'sent', 'test-message-id'))
        .rejects.toThrow('Database error');
    });
  });

  describe('recordEmailSent', () => {
    it('should record email sent successfully', async () => {
      const userId = 'user-1';
      const emailType = 'newsletter';
      const emailId = 'email-1';

      mockSupabase.createClient().from().insert.mockResolvedValue({
        error: null
      });

      await expect(emailService.recordEmailSent(userId, emailType, emailId))
        .resolves.not.toThrow();
    });

    it('should handle database error', async () => {
      const userId = 'user-1';
      const emailType = 'newsletter';
      const emailId = 'email-1';

      mockSupabase.createClient().from().insert.mockResolvedValue({
        error: { message: 'Database error' }
      });

      await expect(emailService.recordEmailSent(userId, emailType, emailId))
        .resolves.not.toThrow(); // Should not throw, just log error
    });
  });

  describe('getStatistics', () => {
    it('should get statistics successfully', async () => {
      mockSupabase.createClient().from().select.mockReturnValue({
        count: jest.fn().mockReturnValue({
          head: jest.fn().mockReturnValue({
            gte: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ count: 100 })
            })
          })
        })
      });

      mockSupabase.createClient().rpc.mockResolvedValue({
        data: [],
        error: null
      });

      const result = await emailService.getStatistics();

      expect(result.totalEmails).toBe(100);
      expect(result.todayEmails).toBe(100);
      expect(result.successfulEmails).toBe(100);
      expect(result.failedEmails).toBe(100);
      expect(result.successRate).toBe(100);
    });
  });

  describe('clearCache', () => {
    it('should clear cache', () => {
      emailService.templateCache.set('test', 'template');
      emailService.rateLimiter.set('test@example.com', [Date.now()]);

      expect(emailService.templateCache.size).toBe(1);
      expect(emailService.rateLimiter.size).toBe(1);

      emailService.clearCache();

      expect(emailService.templateCache.size).toBe(0);
      expect(emailService.rateLimiter.size).toBe(0);
    });
  });

  describe('testConfiguration', () => {
    it('should test configuration successfully', async () => {
      const testEmail = 'test@example.com';

      mockNodemailer.createTransporter.mockReturnValue({
        sendMail: jest.fn().mockResolvedValue({
          messageId: 'test-message-id'
        })
      });

      mockSupabase.createClient().from().update().eq().select().single.mockResolvedValue({
        data: { id: 'email-log-id' },
        error: null
      });

      const result = await emailService.testConfiguration(testEmail);

      expect(result.success).toBe(true);
      expect(result.message).toBe('邮件服务配置正常');
    });

    it('should handle invalid test email', async () => {
      const result = await emailService.testConfiguration('invalid-email');

      expect(result.success).toBe(false);
      expect(result.message).toBe('邮件配置测试失败');
      expect(result.error).toBe('无效的测试邮箱地址');
    });
  });

  describe('Circuit Breaker', () => {
    it('should handle circuit breaker open state', async () => {
      // 强制开启断路器
      emailService.circuitBreaker.forceOpen();

      await expect(emailService.sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        html: '<h1>Test</h1>'
      })).rejects.toThrow('Circuit breaker is OPEN');
    });

    it('should recover from circuit breaker', async () => {
      // 强制开启断路器
      emailService.circuitBreaker.forceOpen();

      // 设置下一次尝试时间为过去
      emailService.circuitBreaker.nextAttemptTime = Date.now() - 1000;

      mockNodemailer.createTransporter.mockReturnValue({
        sendMail: jest.fn().mockResolvedValue({
          messageId: 'test-message-id'
        })
      });

      mockSupabase.createClient().from().update().eq().select().single.mockResolvedValue({
        data: { id: 'email-log-id' },
        error: null
      });

      const result = await emailService.sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        html: '<h1>Test</h1>'
      });

      expect(result.success).toBe(true);
      expect(emailService.circuitBreaker.state).toBe('CLOSED');
    });
  });
});