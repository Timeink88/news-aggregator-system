/**
 * Email服务模块 - 邮件通知和发送
 * 遵循Node.js最佳实践：模块化、错误处理、日志记录
 */

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import nodemailer from 'nodemailer';
import Handlebars from 'handlebars';
import fs from 'node:fs/promises';
import path from 'node:path';
import logger from '../../utils/logger.js';
import { validateEmail, validateUUID } from '../../utils/validators.js';
import { CircuitBreaker } from '../../utils/circuit-breaker.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Email服务配置
const EMAIL_CONFIG = {
  maxRetries: 3,
  batchSize: 50,
  timeout: 30000,
  rateLimit: {
    windowMs: 60000, // 1分钟
    maxRequests: 100
  },
  templates: {
    newsletter: 'newsletter',
    notification: 'notification',
    digest: 'digest',
    alert: 'alert'
  },
  defaults: {
    from: process.env.EMAIL_FROM || 'noreply@newsaggregator.com',
    replyTo: process.env.EMAIL_REPLY_TO || 'support@newsaggregator.com'
  }
};

/**
 * Email服务类
 */
class EmailService {
  constructor() {
    this.transporter = this.createTransporter();
    this.circuitBreaker = new CircuitBreaker({
      timeout: EMAIL_CONFIG.timeout,
      errorThresholdPercentage: 50,
      resetTimeout: 60000
    });
    this.rateLimiter = new Map();
    this.templateCache = new Map();
    this.sendingQueue = [];
    this.isProcessing = false;
  }

  /**
   * 创建邮件传输器
   */
  createTransporter() {
    if (process.env.EMAIL_SERVICE === 'resend') {
      return nodemailer.createTransport({
        host: 'smtp.resend.com',
        port: 465,
        secure: true,
        auth: {
          user: 'resend',
          pass: process.env.RESEND_API_KEY
        }
      });
    }

    if (process.env.EMAIL_SERVICE === 'sendgrid') {
      return nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        secure: false,
        auth: {
          user: 'apikey',
          pass: process.env.SENDGRID_API_KEY
        }
      });
    }

    // 默认使用 Gmail
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
  }

  /**
   * 发送邮件
   */
  async sendEmail(options) {
    try {
      logger.info(`正在发送邮件: ${options.subject}`);

      // 验证参数
      this.validateEmailOptions(options);

      // 检查发送频率限制
      if (!this.checkRateLimit(options.to)) {
        throw new Error('发送频率超过限制');
      }

      // 准备邮件数据
      const emailData = {
        id: uuidv4(),
        ...EMAIL_CONFIG.defaults,
        ...options,
        status: 'pending',
        created_at: new Date().toISOString(),
        attempts: 0
      };

      // 使用断路器保护
      const result = await this.circuitBreaker.execute(async () => {
        return await this.transporter.sendMail({
          from: emailData.from,
          to: emailData.to,
          replyTo: emailData.replyTo,
          subject: emailData.subject,
          html: emailData.html,
          text: emailData.text,
          attachments: emailData.attachments
        });
      });

      // 更新邮件状态
      await this.updateEmailStatus(emailData.id, 'sent', result.messageId);

      logger.info(`邮件发送成功: ${emailData.subject}`, {
        messageId: result.messageId,
        to: emailData.to
      });

      return {
        success: true,
        messageId: result.messageId,
        emailId: emailData.id
      };

    } catch (error) {
      logger.error(`邮件发送失败: ${options.subject}`, {
        to: options.to,
        error: error.message
      });

      // 更新邮件状态为失败
      if (options.id) {
        await this.updateEmailStatus(options.id, 'failed', null, error.message);
      }

      return {
        success: false,
        error: error.message,
        emailId: options.id
      };
    }
  }

  /**
   * 发送模板邮件
   */
  async sendTemplateEmail(templateName, to, data) {
    try {
      // 获取模板
      const template = await this.getTemplate(templateName);
      if (!template) {
        throw new Error(`模板不存在: ${templateName}`);
      }

      // 编译模板
      const compiledTemplate = Handlebars.compile(template);
      const html = compiledTemplate(data);
      const text = this.generateTextFromHtml(html);

      // 生成主题
      const subject = this.generateSubject(templateName, data);

      // 发送邮件
      return await this.sendEmail({
        to,
        subject,
        html,
        text,
        template: templateName,
        template_data: data
      });

    } catch (error) {
      logger.error(`模板邮件发送失败: ${templateName}`, {
        to,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 发送新闻摘要
   */
  async sendNewsletter(userId, articles, preferences) {
    try {
      logger.info(`正在发送新闻摘要给用户: ${userId}`);

      // 获取用户信息
      const user = await this.getUser(userId);
      if (!user) {
        throw new Error('用户不存在');
      }

      // 准备邮件数据
      const emailData = {
        user: {
          name: user.name || user.email,
          email: user.email
        },
        articles: articles.map(article => ({
          id: article.id,
          title: article.title,
          summary: article.summary,
          url: article.url,
          source: article.source_name,
          publish_date: article.publish_date,
          categories: article.categories || []
        })),
        preferences: preferences || {},
        generated_at: new Date().toISOString()
      };

      // 发送邮件
      const result = await this.sendTemplateEmail('newsletter', user.email, emailData);

      if (result.success) {
        // 记录发送历史
        await this.recordEmailSent(userId, 'newsletter', result.emailId);
      }

      return result;

    } catch (error) {
      logger.error(`发送新闻摘要失败: ${userId}`, { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 发送通知邮件
   */
  async sendNotification(userId, type, title, message, data = {}) {
    try {
      logger.info(`正在发送通知邮件给用户: ${userId}`);

      // 获取用户信息
      const user = await this.getUser(userId);
      if (!user) {
        throw new Error('用户不存在');
      }

      const emailData = {
        user: {
          name: user.name || user.email,
          email: user.email
        },
        type,
        title,
        message,
        data,
        generated_at: new Date().toISOString()
      };

      const result = await this.sendTemplateEmail('notification', user.email, emailData);

      if (result.success) {
        await this.recordEmailSent(userId, 'notification', result.emailId);
      }

      return result;

    } catch (error) {
      logger.error(`发送通知邮件失败: ${userId}`, { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 发送每日摘要
   */
  async sendDailyDigest(userId, date, summary) {
    try {
      logger.info(`正在发送每日摘要给用户: ${userId}`);

      const user = await this.getUser(userId);
      if (!user) {
        throw new Error('用户不存在');
      }

      const emailData = {
        user: {
          name: user.name || user.email,
          email: user.email
        },
        date,
        summary,
        generated_at: new Date().toISOString()
      };

      const result = await this.sendTemplateEmail('digest', user.email, emailData);

      if (result.success) {
        await this.recordEmailSent(userId, 'daily_digest', result.emailId);
      }

      return result;

    } catch (error) {
      logger.error(`发送每日摘要失败: ${userId}`, { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 发送警报邮件
   */
  async sendAlert(userId, alertType, severity, title, description, actions = []) {
    try {
      logger.info(`正在发送警报邮件给用户: ${userId}`);

      const user = await this.getUser(userId);
      if (!user) {
        throw new Error('用户不存在');
      }

      const emailData = {
        user: {
          name: user.name || user.email,
          email: user.email
        },
        alert: {
          type: alertType,
          severity,
          title,
          description,
          actions
        },
        generated_at: new Date().toISOString()
      };

      const result = await this.sendTemplateEmail('alert', user.email, emailData);

      if (result.success) {
        await this.recordEmailSent(userId, 'alert', result.emailId);
      }

      return result;

    } catch (error) {
      logger.error(`发送警报邮件失败: ${userId}`, { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 批量发送邮件
   */
  async sendBulkEmails(emails) {
    try {
      logger.info(`开始批量发送 ${emails.length} 封邮件`);

      const results = [];
      const errors = [];

      for (let i = 0; i < emails.length; i += EMAIL_CONFIG.batchSize) {
        const batch = emails.slice(i, i + EMAIL_CONFIG.batchSize);

        try {
          const batchResults = await Promise.allSettled(
            batch.map(email => this.sendEmail(email))
          );

          batchResults.forEach((result, index) => {
            if (result.status === 'fulfilled') {
              results.push(result.value);
            } else {
              errors.push({
                email: batch[index],
                error: result.reason.message
              });
            }
          });

          // 批次间延迟
          if (i + EMAIL_CONFIG.batchSize < emails.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (error) {
          logger.error(`批量发送失败: ${error.message}`);
          errors.push({
            error: error.message
          });
        }
      }

      logger.info(`批量发送完成: 成功 ${results.length} 封, 失败 ${errors.length} 封`);

      return {
        success: true,
        results,
        errors,
        totalSent: results.length,
        totalFailed: errors.length
      };

    } catch (error) {
      logger.error('批量发送失败', { error: error.message });
      return {
        success: false,
        results: [],
        errors: [error],
        totalSent: 0,
        totalFailed: emails.length
      };
    }
  }

  /**
   * 获取模板
   */
  async getTemplate(templateName) {
    try {
      // 检查缓存
      const cached = this.templateCache.get(templateName);
      if (cached) {
        return cached;
      }

      // 读取模板文件
      const templatePath = path.join(process.cwd(), 'src', 'templates', 'email', `${templateName}.hbs`);
      const templateContent = await fs.readFile(templatePath, 'utf-8');

      // 缓存模板
      this.templateCache.set(templateName, templateContent);

      return templateContent;

    } catch (error) {
      logger.error(`获取模板失败: ${templateName}`, { error: error.message });
      return null;
    }
  }

  /**
   * 生成纯文本内容
   */
  generateTextFromHtml(html) {
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * 生成邮件主题
   */
  generateSubject(templateName, data) {
    const subjects = {
      newsletter: `📰 新闻摘要 - ${data.user.name}`,
      notification: `🔔 ${data.title}`,
      digest: `📊 每日新闻摘要 - ${data.date}`,
      alert: `⚠️ ${data.alert.title}`
    };

    return subjects[templateName] || '新闻聚合系统通知';
  }

  /**
   * 验证邮件选项
   */
  validateEmailOptions(options) {
    const required = ['to', 'subject'];
    const missing = required.filter(field => !options[field]);

    if (missing.length > 0) {
      throw new Error(`缺少必要字段: ${missing.join(', ')}`);
    }

    if (!validateEmail(options.to)) {
      throw new Error('无效的收件人邮箱地址');
    }

    if (!options.html && !options.text) {
      throw new Error('邮件内容不能为空');
    }
  }

  /**
   * 检查发送频率限制
   */
  checkRateLimit(email) {
    const now = Date.now();
    const key = typeof email === 'string' ? email : email;

    if (!this.rateLimiter.has(key)) {
      this.rateLimiter.set(key, []);
    }

    const requests = this.rateLimiter.get(key);
    const validRequests = requests.filter(time => now - time < EMAIL_CONFIG.rateLimit.windowMs);

    if (validRequests.length >= EMAIL_CONFIG.rateLimit.maxRequests) {
      return false;
    }

    validRequests.push(now);
    this.rateLimiter.set(key, validRequests);

    return true;
  }

  /**
   * 获取用户信息
   */
  async getUser(userId) {
    try {
      const { error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        throw error;
      }

      return data;

    } catch (error) {
      logger.error(`获取用户信息失败: ${userId}`, { error: error.message });
      return null;
    }
  }

  /**
   * 更新邮件状态
   */
  async updateEmailStatus(emailId, status, messageId, errorMessage = null) {
    try {
      const { error } = await supabase
        .from('email_logs')
        .update({
          status,
          message_id: messageId,
          error_message: errorMessage,
          updated_at: new Date().toISOString()
        })
        .eq('id', emailId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;

    } catch (error) {
      logger.error(`更新邮件状态失败: ${emailId}`, { error: error.message });
      throw error;
    }
  }

  /**
   * 记录邮件发送
   */
  async recordEmailSent(userId, emailType, emailId) {
    try {
      const { error } = await supabase
        .from('user_email_history')
        .insert([{
          id: uuidv4(),
          user_id: userId,
          email_type: emailType,
          email_id: emailId,
          sent_at: new Date().toISOString()
        }]);

      if (error) {
        throw error;
      }

    } catch (error) {
      logger.error('记录邮件发送失败', { error: error.message });
    }
  }

  /**
   * 获取邮件发送统计
   */
  async getStatistics() {
    try {
      const [
        { count: totalEmails },
        { count: todayEmails },
        { count: successfulEmails },
        { count: failedEmails },
        { data: typeStats }
      ] = await Promise.all([
        supabase.from('email_logs').select('*', { count: 'exact', head: true }),
        supabase.from('email_logs').select('*', { count: 'exact', head: true }).gte('created_at', new Date().toISOString().split('T')[0]),
        supabase.from('email_logs').select('*', { count: 'exact', head: true }).eq('status', 'sent'),
        supabase.from('email_logs').select('*', { count: 'exact', head: true }).eq('status', 'failed'),
        supabase.rpc('get_email_type_statistics')
      ]);

      return {
        totalEmails: totalEmails || 0,
        todayEmails: todayEmails || 0,
        successfulEmails: successfulEmails || 0,
        failedEmails: failedEmails || 0,
        successRate: totalEmails ? (successfulEmails / totalEmails) * 100 : 0,
        typeStats: typeStats || []
      };

    } catch (error) {
      logger.error('获取邮件统计失败', { error: error.message });
      return {
        totalEmails: 0,
        todayEmails: 0,
        successfulEmails: 0,
        failedEmails: 0,
        successRate: 0,
        typeStats: []
      };
    }
  }

  /**
   * 清理缓存
   */
  clearCache() {
    this.templateCache.clear();
    this.rateLimiter.clear();
    logger.info('Email服务缓存已清理');
  }

  /**
   * 测试邮件配置
   */
  async testConfiguration(testEmail) {
    try {
      if (!validateEmail(testEmail)) {
        throw new Error('无效的测试邮箱地址');
      }

      const result = await this.sendEmail({
        to: testEmail,
        subject: '🧪 邮件服务测试',
        html: '<h1>邮件服务测试</h1><p>如果您收到此邮件，说明邮件服务配置正常。</p>',
        text: '邮件服务测试\n\n如果您收到此邮件，说明邮件服务配置正常。'
      });

      return {
        success: result.success,
        message: result.success ? '邮件服务配置正常' : '邮件服务配置失败',
        error: result.error
      };

    } catch (error) {
      logger.error('邮件配置测试失败', { error: error.message });
      return {
        success: false,
        message: '邮件配置测试失败',
        error: error.message
      };
    }
  }
}

// 导出服务实例
export const emailService = new EmailService();
export default EmailService;