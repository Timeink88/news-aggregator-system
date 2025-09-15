/**
 * Email Service
 * 提供邮件发送功能，包括每日摘要、实时通知和邮件模板管理
 */

import { EventEmitter } from 'events';
import dbClient from '../database/client.js';
import logger from '../utils/logger.js';

export class EmailService extends EventEmitter {
  constructor(config = {}) {
    super();
    this.isRunning = false;
    this.emailQueue = [];
    this.processingQueue = false;
    this.notificationCooldowns = new Map();
    this.activeSends = new Map();

    // 性能统计
    this.stats = {
      emailsSent: 0,
      emailsFailed: 0,
      digestSent: 0,
      notificationsSent: 0,
      totalProcessingTime: 0,
      averageProcessingTime: 0,
      lastSentTime: null,
      queueSize: 0
    };

    this.config = {
      // Resend配置
      resend: {
        enabled: config.resend?.enabled !== false,
        apiKey: config.resend?.apiKey || process.env.RESEND_API_KEY,
        baseUrl: config.resend?.baseUrl || 'https://api.resend.com',
        fromEmail: config.resend?.fromEmail || process.env.FROM_EMAIL || 'noreply@news-aggregator.com',
        replyTo: config.resend?.replyTo || process.env.REPLY_TO_EMAIL
      },

      // 默认设置
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 5000,
      timeout: config.timeout || 30000,
      batchSize: config.batchSize || 50,
      queueProcessingInterval: config.queueProcessingInterval || 30000,
      maxConcurrentSends: config.maxConcurrentSends || 3,

      // 每日摘要配置
      dailyDigest: {
        enabled: config.dailyDigest?.enabled !== false,
        sendTime: config.dailyDigest?.sendTime || '09:00',
        timezone: config.dailyDigest?.timezone || 'UTC',
        maxArticles: config.dailyDigest?.maxArticles || 20,
        includeSentiment: config.dailyDigest?.includeSentiment !== false,
        includeStocks: config.dailyDigest?.includeStocks !== false,
        template: config.dailyDigest?.template || 'daily-digest'
      },

      // 实时通知配置
      realTimeNotifications: {
        enabled: config.realTimeNotifications?.enabled !== false,
        triggers: config.realTimeNotifications?.triggers || ['high_importance', 'breaking_news', 'user_preferences'],
        cooldownPeriod: config.realTimeNotifications?.cooldownPeriod || 300000, // 5分钟
        maxNotificationsPerHour: config.realTimeNotifications?.maxNotificationsPerHour || 10,
        template: config.realTimeNotifications?.template || 'realtime-notification'
      },

      // 邮件模板配置
      templates: {
        basePath: config.templates?.basePath || './src/templates',
        defaultTemplate: config.templates?.defaultTemplate || 'default',
        customTemplates: config.templates?.customTemplates || {}
      },

      // 用户偏好配置
      userPreferences: {
        defaultFrequency: config.userPreferences?.defaultFrequency || 'daily',
        allowedCategories: config.userPreferences?.allowedCategories || ['all'],
        maxEmailsPerDay: config.userPreferences?.maxEmailsPerDay || 5
      }
    };
  }

  async initialize() {
    try {
      logger.info('初始化Email Service...');

      // 验证邮件服务配置
      await this.validateConfiguration();

      // 加载邮件模板
      await this.loadEmailTemplates();

      // 启动队列处理器
      this.startQueueProcessor();

      // 启动每日摘要调度器
      this.startDailyDigestScheduler();

      this.isRunning = true;
      logger.info('Email Service 初始化完成');
      return true;

    } catch (error) {
      logger.error('Email Service 初始化失败:', error);
      throw error;
    }
  }

  async validateConfiguration() {
    if (!this.config.resend.enabled) {
      logger.warn('Email Service已禁用');
      return;
    }

    if (!this.config.resend.apiKey) {
      logger.warn('缺少Resend API密钥，邮件服务将无法正常工作');
      return;
    }

    if (!this.config.resend.fromEmail) {
      throw new Error('缺少发件人邮箱地址');
    }

    // 测试Resend API连接
    try {
      const isValid = await this.testResendConnection();
      if (!isValid) {
        throw new Error('Resend API连接测试失败');
      }
    } catch (error) {
      throw new Error(`Resend API验证失败: ${error.message}`);
    }
  }

  async testResendConnection() {
    try {
      const response = await fetch(`${this.config.resend.baseUrl}/domains`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.resend.apiKey}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      });

      return response.ok;
    } catch (error) {
      logger.error('Resend连接测试失败:', error);
      return false;
    }
  }

  async loadEmailTemplates() {
    try {
      // 这里可以加载预定义的邮件模板
      // 目前使用内置模板
      this.emailTemplates = {
        'daily-digest': this.getDailyDigestTemplate(),
        'realtime-notification': this.getRealtimeNotificationTemplate(),
        'breaking-news': this.getBreakingNewsTemplate(),
        'weekly-summary': this.getWeeklySummaryTemplate()
      };

      logger.info(`已加载 ${Object.keys(this.emailTemplates).length} 个邮件模板`);
    } catch (error) {
      logger.error('加载邮件模板失败:', error);
      throw error;
    }
  }

  // 发送邮件的核心方法
  async sendEmail(options) {
    try {
      const {
        to,
        subject,
        html,
        text,
        templateId,
        templateData,
        attachments = [],
        priority = 'normal'
      } = options;

      if (!this.config.resend.enabled) {
        logger.warn('Email Service已禁用，跳过邮件发送');
        return { success: false, reason: 'service_disabled' };
      }

      // 验证收件人
      if (!this.validateEmail(to)) {
        throw new Error(`无效的收件人邮箱: ${to}`);
      }

      // 准备邮件内容
      let emailContent = { html, text };
      if (templateId && this.emailTemplates[templateId]) {
        emailContent = this.renderTemplate(templateId, templateData || {});
      }

      // 如果只有HTML，自动生成纯文本版本
      if (emailContent.html && !emailContent.text) {
        emailContent.text = this.htmlToText(emailContent.html);
      }

      const emailData = {
        from: this.config.resend.fromEmail,
        to: Array.isArray(to) ? to : [to],
        subject,
        ...emailContent,
        attachments: attachments.length > 0 ? attachments : undefined,
        reply_to: this.config.resend.replyTo || undefined
      };

      // 添加到队列或立即发送
      if (priority === 'high') {
        return await this.sendEmailImmediately(emailData);
      } else {
        return await this.queueEmail(emailData);
      }

    } catch (error) {
      logger.error('发送邮件失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async sendEmailImmediately(emailData) {
    const startTime = Date.now();

    try {
      const response = await fetch(`${this.config.resend.baseUrl}/emails`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.resend.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailData),
        signal: AbortSignal.timeout(this.config.timeout)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || 'Resend API错误');
      }

      const processingTime = Date.now() - startTime;

      // 更新统计
      this.updateStats({
        emailsSent: this.stats.emailsSent + 1,
        totalProcessingTime: this.stats.totalProcessingTime + processingTime,
        lastSentTime: new Date()
      });

      logger.info(`邮件发送成功: ${emailData.to} - ${emailData.subject}`);

      // 发送事件
      this.emit('emailSent', {
        emailId: result.id,
        to: emailData.to,
        subject: emailData.subject,
        processingTime
      });

      return {
        success: true,
        emailId: result.id,
        processingTime
      };

    } catch (error) {
      // 更新失败统计
      this.stats.emailsFailed += 1;

      logger.error('邮件发送失败:', error);

      this.emit('emailFailed', {
        to: emailData.to,
        subject: emailData.subject,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  async queueEmail(emailData) {
    const queuedEmail = {
      id: this.generateEmailId(),
      ...emailData,
      priority: emailData.priority || 'normal',
      attempt: 0,
      createdAt: new Date(),
      status: 'queued'
    };

    this.emailQueue.push(queuedEmail);
    this.stats.queueSize = this.emailQueue.length;

    logger.info(`邮件已加入队列: ${emailData.to} - ${emailData.subject} (队列长度: ${this.emailQueue.length})`);

    return {
      success: true,
      queued: true,
      emailId: queuedEmail.id
    };
  }

  // 队列处理器
  startQueueProcessor() {
    this.queueProcessor = setInterval(async () => {
      if (!this.processingQueue && this.emailQueue.length > 0) {
        await this.processQueue();
      }
    }, this.config.queueProcessingInterval);

    logger.info('邮件队列处理器已启动');
  }

  async processQueue() {
    if (this.processingQueue) {
      return;
    }

    this.processingQueue = true;

    try {
      const batchSize = Math.min(this.config.batchSize, this.emailQueue.length);
      const batch = this.emailQueue.splice(0, batchSize);

      const promises = batch.map(email => this.processQueuedEmail(email));
      const results = await Promise.allSettled(promises);

      // 处理结果
      results.forEach((result, index) => {
        const email = batch[index];
        if (result.status === 'rejected') {
          logger.error(`处理队列邮件失败: ${email.to} - ${email.subject}`, result.reason);

          // 重试逻辑
          if (email.attempt < this.config.maxRetries) {
            email.attempt += 1;
            email.nextAttempt = new Date(Date.now() + this.config.retryDelay * Math.pow(2, email.attempt - 1));
            this.emailQueue.unshift(email); // 重新加入队列头部
          }
        }
      });

      this.stats.queueSize = this.emailQueue.length;

    } catch (error) {
      logger.error('处理邮件队列失败:', error);
    } finally {
      this.processingQueue = false;
    }
  }

  async processQueuedEmail(email) {
    try {
      // 检查重试延迟
      if (email.nextAttempt && new Date() < email.nextAttempt) {
        this.emailQueue.unshift(email); // 重新加入队列
        return;
      }

      email.status = 'processing';
      email.processingStartedAt = new Date();

      const result = await this.sendEmailImmediately(email);

      if (result.success) {
        email.status = 'sent';
        email.sentAt = new Date();
        email.emailId = result.emailId;
      } else {
        email.status = 'failed';
        email.error = result.error;
        email.failedAt = new Date();
      }

      return result;

    } catch (error) {
      email.status = 'failed';
      email.error = error.message;
      email.failedAt = new Date();

      throw error;
    }
  }

  // 每日摘要功能
  async sendDailyDigest(userId, options = {}) {
    try {
      if (!this.config.dailyDigest.enabled) {
        return { success: false, reason: 'daily_digest_disabled' };
      }

      // 获取用户邮件偏好
      const userPrefs = await this.getUserEmailPreferences(userId);
      if (!userPrefs || !userPrefs.enabled) {
        return { success: false, reason: 'user_disabled_emails' };
      }

      // 检查发送频率
      if (!this.shouldSendDigest(userPrefs, 'daily')) {
        return { success: false, reason: 'frequency_limit' };
      }

      // 获取摘要内容
      const digestContent = await this.generateDailyDigest(userId, userPrefs, options);

      // 发送摘要邮件
      const result = await this.sendEmail({
        to: userPrefs.email,
        subject: `每日新闻摘要 - ${new Date().toLocaleDateString('zh-CN')}`,
        templateId: 'daily-digest',
        templateData: digestContent,
        priority: 'normal'
      });

      if (result.success) {
        this.stats.digestSent += 1;
        await this.recordEmailSent(userId, 'daily_digest', result.emailId);
      }

      return result;

    } catch (error) {
      logger.error(`发送每日摘要失败: ${userId}`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async generateDailyDigest(userId, userPrefs, options = {}) {
    const maxArticles = options.maxArticles || this.config.dailyDigest.maxArticles;
    const categories = userPrefs.preferredCategories || ['all'];

    // 获取用户的文章
    let articlesQuery = dbClient
      .from('news_articles')
      .select('*')
      .gte('published_at', this.getStartDateForPeriod('daily'))
      .order('importance_score', { ascending: false })
      .limit(maxArticles);

    if (categories.length > 0 && !categories.includes('all')) {
      articlesQuery = articlesQuery.in('category', categories);
    }

    const { error } = await articlesQuery;

    if (error) {
      throw error;
    }

    const articles = data || [];

    // 获取用户偏好分析
    const userAnalysis = await this.getUserAnalysis(userId, articles);

    return {
      date: new Date().toLocaleDateString('zh-CN'),
      user: {
        name: userPrefs.name || '用户',
        preferences: userPrefs
      },
      summary: {
        totalArticles: articles.length,
        topCategories: this.getTopCategories(articles),
        sentimentSummary: userAnalysis.sentimentSummary
      },
      articles: articles.map(article => ({
        title: article.title,
        summary: article.summary || `${article.content?.substring(0, 200)  }...`,
        category: article.category,
        url: article.url,
        importance: article.importance_score,
        sentiment: article.sentiment,
        publishedAt: new Date(article.published_at).toLocaleString('zh-CN')
      })),
      stocks: this.config.dailyDigest.includeStocks ? await this.getStockSummary(articles) : null,
      recommendations: userAnalysis.recommendations || []
    };
  }

  // 实时通知功能
  async sendRealTimeNotification(userId, article, triggerType) {
    try {
      if (!this.config.realTimeNotifications.enabled) {
        return { success: false, reason: 'notifications_disabled' };
      }

      // 检查用户是否接收实时通知
      const userPrefs = await this.getUserEmailPreferences(userId);
      if (!userPrefs?.realTimeNotifications) {
        return { success: false, reason: 'user_disabled_notifications' };
      }

      // 检查冷却期
      if (!this.shouldSendNotification(userId, triggerType)) {
        return { success: false, reason: 'cooldown_period' };
      }

      // 检查频率限制
      if (await this.hasExceededNotificationLimit(userId)) {
        return { success: false, reason: 'rate_limit' };
      }

      // 发送通知
      const result = await this.sendEmail({
        to: userPrefs.email,
        subject: `新闻通知: ${article.title}`,
        templateId: 'realtime-notification',
        templateData: {
          article,
          triggerType,
          user: { name: userPrefs.name || '用户' },
          timestamp: new Date().toLocaleString('zh-CN')
        },
        priority: 'high'
      });

      if (result.success) {
        this.stats.notificationsSent += 1;
        await this.recordNotificationSent(userId, article.id, triggerType, result.emailId);
      }

      return result;

    } catch (error) {
      logger.error(`发送实时通知失败: ${userId} - ${article.id}`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 模板渲染方法
  renderTemplate(templateId, data) {
    const template = this.emailTemplates[templateId];
    if (!template) {
      throw new Error(`模板 ${templateId} 不存在`);
    }

    let content = template.html || template.text || '';

    // 简单的模板变量替换
    content = content.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = this.getNestedValue(data, key);
      return value !== undefined ? value : match;
    });

    // 支持条件语句
    content = content.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, condition, contentIfTrue) => {
      const value = this.getNestedValue(data, condition);
      return value ? contentIfTrue : '';
    });

    // 支持循环
    content = content.replace(/\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, arrayKey, itemTemplate) => {
      const array = this.getNestedValue(data, arrayKey);
      if (!Array.isArray(array)) return '';
      return array.map(item => {
        return itemTemplate.replace(/\{\{this\.(\w+)\}\}/g, (match, prop) => {
          return item[prop] !== undefined ? item[prop] : match;
        });
      }).join('');
    });

    return {
      html: template.html ? content : undefined,
      text: template.text ? this.htmlToText(content) : undefined
    };
  }

  getNestedValue(obj, key) {
    return key.split('.').reduce((o, i) => o && o[i], obj);
  }

  htmlToText(html) {
    return html
      .replace(/<[^>]*>/g, '') // 移除HTML标签
      .replace(/&nbsp;/g, ' ') // 替换HTML实体
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ') // 压缩空白字符
      .trim();
  }

  // 每日摘要调度器
  startDailyDigestScheduler() {
    // 计算下次发送时间
    const nextSendTime = this.calculateNextDigestTime();
    const delay = nextSendTime.getTime() - Date.now();

    setTimeout(() => {
      this.sendDailyDigestToAllUsers();
      // 设置每日循环
      this.digestScheduler = setInterval(() => this.sendDailyDigestToAllUsers(), 24 * 60 * 60 * 1000);
    }, delay);

    logger.info(`每日摘要调度器已启动，首次发送时间: ${nextSendTime.toLocaleString('zh-CN')}`);
  }

  calculateNextDigestTime() {
    const now = new Date();
    const [hours, minutes] = this.config.dailyDigest.sendTime.split(':').map(Number);

    const nextSend = new Date(now);
    nextSend.setHours(hours, minutes, 0, 0);

    // 如果今天的时间已过，设置为明天
    if (nextSend <= now) {
      nextSend.setDate(nextSend.getDate() + 1);
    }

    return nextSend;
  }

  async sendDailyDigestToAllUsers() {
    try {
      // 获取所有启用了每日摘要的用户
      const { data: users, error } = await dbClient
        .from('user_email_preferences')
        .select('*')
        .eq('daily_digest_enabled', true);

      if (error) {
        throw error;
      }

      logger.info(`开始发送每日摘要给 ${users?.length || 0} 个用户`);

      // 并发发送给所有用户
      const promises = users.map(user => this.sendDailyDigest(user.user_id));
      const results = await Promise.allSettled(promises);

      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const failed = results.length - successful;

      logger.info(`每日摘要发送完成: 成功 ${successful}, 失败 ${failed}`);

    } catch (error) {
      logger.error('发送每日摘要给所有用户失败:', error);
    }
  }

  async validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // 邮件模板定义
  getDailyDigestTemplate() {
    return {
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>每日新闻摘要</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .header { background: #2c3e50; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .article { margin-bottom: 20px; padding: 15px; border: 1px solid #eee; border-radius: 5px; }
            .article h3 { margin: 0 0 10px 0; color: #2c3e50; }
            .article .meta { color: #666; font-size: 0.9em; margin-bottom: 10px; }
            .category { background: #3498db; color: white; padding: 2px 8px; border-radius: 3px; font-size: 0.8em; }
            .sentiment { margin-left: 10px; font-size: 0.8em; }
            .sentiment.positive { color: #27ae60; }
            .sentiment.negative { color: #e74c3c; }
            .sentiment.neutral { color: #f39c12; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 0.9em; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>每日新闻摘要</h1>
            <p>{{date}}</p>
          </div>

          <div class="content">
            <h2>您好，{{user.name}}！</h2>
            <p>以下是今日为您精选的 {{summary.totalArticles}} 篇新闻：</p>

            {{#each articles}}
            <div class="article">
              <h3><a href="{{this.url}}" style="color: #2c3e50; text-decoration: none;">{{this.title}}</a></h3>
              <div class="meta">
                <span class="category">{{this.category}}</span>
                <span class="sentiment {{this.sentiment}}">{{this.sentiment}}</span>
                <span>{{this.publishedAt}}</span>
              </div>
              <p>{{this.summary}}</p>
            </div>
            {{/each}}

            {{#if stocks}}
            <div class="stocks">
              <h3>今日股票动态</h3>
              {{#each stocks}}
              <p><strong>{{this.symbol}}</strong>: {{this.name}} - {{this.change}}</p>
              {{/each}}
            </div>
            {{/if}}
          </div>

          <div class="footer">
            <p>感谢您使用我们的新闻聚合服务</p>
            <p>如需调整订阅设置，请访问您的账户页面</p>
          </div>
        </body>
        </html>
      `,
      text: `
        每日新闻摘要 - {{date}}

        您好，{{user.name}}！

        以下是今日为您精选的 {{summary.totalArticles}} 篇新闻：

        {{#each articles}}

        {{this.title}}
        分类: {{this.category}} | 情感: {{this.sentiment}} | {{this.publishedAt}}
        {{this.summary}}
        阅读全文: {{this.url}}

        {{/each}}

        {{#if stocks}}
        今日股票动态:
        {{#each stocks}}
        {{this.symbol}}: {{this.name}} - {{this.change}}
        {{/each}}
        {{/if}}

        感谢您使用我们的新闻聚合服务
        如需调整订阅设置，请访问您的账户页面
      `
    };
  }

  getRealtimeNotificationTemplate() {
    return {
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>新闻通知</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .header { background: #e74c3c; color: white; padding: 15px; text-align: center; }
            .content { padding: 20px; }
            .article { padding: 15px; border: 1px solid #eee; border-radius: 5px; }
            .article h3 { margin: 0 0 10px 0; color: #2c3e50; }
            .meta { color: #666; font-size: 0.9em; margin-bottom: 10px; }
            .trigger { background: #f39c12; color: white; padding: 2px 8px; border-radius: 3px; font-size: 0.8em; }
            .footer { text-align: center; padding: 15px; color: #666; font-size: 0.9em; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>📰 新闻通知</h1>
            <p>{{timestamp}}</p>
          </div>

          <div class="content">
            <p>您好，{{user.name}}！</p>

            <div class="article">
              <h3><a href="{{article.url}}" style="color: #2c3e50; text-decoration: none;">{{article.title}}</a></h3>
              <div class="meta">
                <span class="trigger">{{triggerType}}</span>
                <span>{{article.category}}</span>
                <span>{{article.publishedAt}}</span>
              </div>
              <p>{{article.summary}}</p>
            </div>
          </div>

          <div class="footer">
            <p>这是基于您的偏好设置的实时通知</p>
            <p>如需调整通知设置，请访问您的账户页面</p>
          </div>
        </body>
        </html>
      `,
      text: `
        新闻通知 - {{timestamp}}

        您好，{{user.name}}！

        {{article.title}}

        触发类型: {{triggerType}} | 分类: {{article.category}} | {{article.publishedAt}}

        {{article.summary}}

        阅读全文: {{article.url}}

        这是基于您的偏好设置的实时通知
        如需调整通知设置，请访问您的账户页面
      `
    };
  }

  getBreakingNewsTemplate() {
    return {
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>🚨 突发新闻</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .header { background: #e74c3c; color: white; padding: 15px; text-align: center; }
            .content { padding: 20px; }
            .breaking-news { border: 2px solid #e74c3c; padding: 20px; border-radius: 5px; background: #fff5f5; }
            .breaking-news h2 { color: #e74c3c; margin-top: 0; }
            .meta { color: #666; font-size: 0.9em; margin-bottom: 15px; }
            .footer { text-align: center; padding: 15px; color: #666; font-size: 0.9em; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>🚨 突发新闻</h1>
          </div>

          <div class="content">
            <div class="breaking-news">
              <h2>{{title}}</h2>
              <div class="meta">
                <span>{{category}}</span>
                <span>{{publishedAt}}</span>
              </div>
              <p>{{summary}}</p>
              <p><a href="{{url}}" style="color: #e74c3c; font-weight: bold;">阅读全文 →</a></p>
            </div>
          </div>

          <div class="footer">
            <p>这是重要的突发新闻通知</p>
          </div>
        </body>
        </html>
      `,
      text: `
        🚨 突发新闻

        {{title}}

        分类: {{category}} | {{publishedAt}}

        {{summary}}

        阅读全文: {{url}}

        这是重要的突发新闻通知
      `
    };
  }

  getWeeklySummaryTemplate() {
    return {
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>每周新闻汇总</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .header { background: #8e44ad; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .summary { background: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
            .category-section { margin-bottom: 30px; }
            .category-section h3 { color: #8e44ad; border-bottom: 2px solid #8e44ad; padding-bottom: 5px; }
            .article { margin-bottom: 15px; padding: 10px; border-left: 3px solid #8e44ad; background: #f8f9fa; }
            .article h4 { margin: 0 0 5px 0; }
            .article .meta { color: #666; font-size: 0.9em; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 0.9em; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>每周新闻汇总</h1>
            <p>{{weekRange}}</p>
          </div>

          <div class="content">
            <div class="summary">
              <h2>本周概览</h2>
              <p>总文章数: {{totalArticles}}</p>
              <p>主要分类: {{topCategories}}</p>
              <p>情感倾向: {{sentimentSummary}}</p>
            </div>

            {{#each categorySummaries}}
            <div class="category-section">
              <h3>{{this.category}}</h3>
              {{#each this.articles}}
              <div class="article">
                <h4><a href="{{this.url}}" style="color: #8e44ad; text-decoration: none;">{{this.title}}</a></h4>
                <div class="meta">{{this.publishedAt}} | {{this.sentiment}}</div>
                <p>{{this.summary}}</p>
              </div>
              {{/each}}
            </div>
            {{/each}}
          </div>

          <div class="footer">
            <p>感谢您使用我们的新闻聚合服务</p>
          </div>
        </body>
        </html>
      `,
      text: `
        每周新闻汇总 - {{weekRange}}

        本周概览:
        总文章数: {{totalArticles}}
        主要分类: {{topCategories}}
        情感倾向: {{sentimentSummary}}

        {{#each categorySummaries}}
        {{this.category}}:
        {{#each this.articles}}
        {{this.title}}
        {{this.publishedAt}} | {{this.sentiment}}
        {{this.summary}}
        阅读全文: {{this.url}}
        {{/each}}
        {{/each}}

        感谢您使用我们的新闻聚合服务
      `
    };
  }

  // 辅助方法
  generateEmailId() {
    return `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  validateEmailList(emails) {
    const invalidEmails = [];
    const validEmails = [];

    for (const email of emails) {
      if (this.validateEmail(email)) {
        validEmails.push(email);
      } else {
        invalidEmails.push(email);
      }
    }

    return {
      validEmails,
      invalidEmails,
      allValid: invalidEmails.length === 0
    };
  }

  updateStats(newStats) {
    this.stats = { ...this.stats, ...newStats };

    // 计算平均处理时间
    if (this.stats.emailsSent > 0) {
      this.stats.averageProcessingTime = this.stats.totalProcessingTime / this.stats.emailsSent;
    }
  }

  // 用户偏好和数据获取方法
  async getUserEmailPreferences(userId) {
    try {
      const { data, error } = await dbClient
        .from('user_email_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        logger.warn(`获取用户邮件偏好失败: ${userId}`, error);
        return null;
      }

      return data;
    } catch (error) {
      logger.error(`获取用户邮件偏好异常: ${userId}`, error);
      return null;
    }
  }

  shouldSendDigest(userPrefs, frequency) {
    if (frequency === 'daily') {
      return true; // 每日摘要调度器已经处理了频率
    }
    return userPrefs.frequency === frequency;
  }

  getStartDateForPeriod(period) {
    const now = new Date();
    switch (period) {
    case 'daily':
      return new Date(now.setDate(now.getDate() - 1)).toISOString();
    case 'weekly':
      return new Date(now.setDate(now.getDate() - 7)).toISOString();
    case 'monthly':
      return new Date(now.setMonth(now.getMonth() - 1)).toISOString();
    default:
      return new Date(now.setDate(now.getDate() - 1)).toISOString();
    }
  }

  getTopCategories(articles) {
    const categoryCount = {};
    articles.forEach(article => {
      categoryCount[article.category] = (categoryCount[article.category] || 0) + 1;
    });

    return Object.entries(categoryCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([category]) => category);
  }

  async getUserAnalysis(userId, articles) {
    // 简单的用户分析，实际项目中可以更复杂
    const sentimentCounts = { positive: 0, negative: 0, neutral: 0 };
    articles.forEach(article => {
      if (article.sentiment) {
        sentimentCounts[article.sentiment]++;
      }
    });

    const total = articles.length;
    const sentimentSummary = total > 0
      ? Object.entries(sentimentCounts)
        .sort(([,a], [,b]) => b - a)
        .map(([sentiment, count]) => `${sentiment} (${Math.round(count/total*100)}%)`)
        .join(', ')
      : '无数据';

    return {
      sentimentSummary,
      recommendations: articles.slice(0, 3).map(article => ({
        title: article.title,
        category: article.category,
        importance: article.importance_score
      }))
    };
  }

  async getStockSummary(articles) {
    // 提取文章中的股票信息
    const stocks = [];
    articles.forEach(article => {
      if (article.entities && article.entities.stocks) {
        stocks.push(...article.entities.stocks);
      }
    });

    // 去重并返回前5个
    const uniqueStocks = [...new Map(stocks.map(stock => [stock.symbol, stock])).values()];
    return uniqueStocks.slice(0, 5);
  }

  // 通知管理方法
  shouldSendNotification(userId, triggerType) {
    const key = `${userId}_${triggerType}`;
    const lastSent = this.notificationCooldowns.get(key);

    if (!lastSent) {
      return true;
    }

    return (Date.now() - lastSent) > this.config.realTimeNotifications.cooldownPeriod;
  }

  async hasExceededNotificationLimit(userId) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const { count, error } = await dbClient
      .from('email_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', oneHourAgo.toISOString());

    if (error) {
      logger.error(`检查通知频率限制失败: ${userId}`, error);
      return false;
    }

    return count >= this.config.realTimeNotifications.maxNotificationsPerHour;
  }

  // 记录发送历史
  async recordEmailSent(userId, emailType, emailId) {
    try {
      const record = {
        user_id: userId,
        email_type: emailType,
        email_id: emailId,
        created_at: new Date().toISOString()
      };

      const { error } = await dbClient
        .from('email_sent_history')
        .insert([record]);

      if (error) {
        logger.error('记录邮件发送历史失败:', error);
      }
    } catch (error) {
      logger.error('记录邮件发送历史异常:', error);
    }
  }

  async recordNotificationSent(userId, articleId, triggerType, emailId) {
    try {
      const record = {
        user_id: userId,
        article_id: articleId,
        trigger_type: triggerType,
        email_id: emailId,
        created_at: new Date().toISOString()
      };

      const { error } = await dbClient
        .from('email_notifications')
        .insert([record]);

      if (error) {
        logger.error('记录通知发送历史失败:', error);
      } else {
        // 更新冷却时间
        const key = `${userId}_${triggerType}`;
        this.notificationCooldowns.set(key, Date.now());
      }
    } catch (error) {
      logger.error('记录通知发送历史异常:', error);
    }
  }

  // 统计和信息获取方法
  async getStats() {
    try {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // 获取邮件发送统计
      const { data: emailStats } = await dbClient
        .from('email_sent_history')
        .select('email_type, created_at')
        .gte('created_at', oneDayAgo.toISOString());

      const stats = {
        isRunning: this.isRunning,
        config: this.config,
        processing: this.stats,
        daily: {
          totalEmails: emailStats?.length || 0,
          digests: emailStats?.filter(e => e.email_type === 'daily_digest').length || 0,
          notifications: emailStats?.filter(e => e.email_type === 'notification').length || 0
        },
        queue: {
          size: this.emailQueue.length,
          processing: this.processingQueue
        },
        uptime: process.uptime()
      };

      return stats;
    } catch (error) {
      logger.error('获取邮件服务统计失败:', error);
      return {
        isRunning: this.isRunning,
        error: error.message
      };
    }
  }

  async getEmailHistory(params = {}) {
    try {
      let query = dbClient
        .from('email_sent_history')
        .select(`
          *,
          user_email_preferences (
            email,
            name
          )
        `)
        .order('created_at', { ascending: false });

      if (params.limit) {
        query = query.limit(params.limit);
      }

      if (params.offset) {
        query = query.range(params.offset, params.offset + (params.limit || 50) - 1);
      }

      if (params.userId) {
        query = query.eq('user_id', params.userId);
      }

      if (params.emailType) {
        query = query.eq('email_type', params.emailType);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error('获取邮件历史失败:', error);
      throw error;
    }
  }

  // 服务控制方法
  async shutdown() {
    try {
      logger.info('正在关闭 Email Service...');

      this.isRunning = false;

      // 处理剩余队列
      if (this.emailQueue.length > 0) {
        logger.info(`处理剩余 ${this.emailQueue.length} 封邮件...`);
        await this.processQueue();
      }

      // 清理定时器
      if (this.queueProcessor) {
        clearInterval(this.queueProcessor);
      }

      if (this.digestScheduler) {
        clearInterval(this.digestScheduler);
      }

      logger.info('Email Service 已关闭');
    } catch (error) {
      logger.error('关闭 Email Service 失败:', error);
    }
  }
}

export default EmailService;