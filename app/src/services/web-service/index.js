/**
 * Web服务模块 - Webhook处理
 * 遵循Node.js最佳实践：模块化、错误处理、日志记录
 */

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'node:crypto';
import logger from '../../utils/logger.js';
import { validateUrl, validateUUID } from '../../utils/validators.js';
import { CircuitBreaker } from '../../utils/circuit-breaker.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Web服务配置
const WEB_CONFIG = {
  maxRetries: 3,
  timeout: 30000,
  batchSize: 10,
  rateLimit: {
    windowMs: 60000, // 1分钟
    maxRequests: 1000
  },
  retryDelay: {
    initial: 1000,
    max: 30000,
    multiplier: 2
  },
  signature: {
    algorithm: 'sha256',
    header: 'X-Webhook-Signature'
  },
  events: {
    ARTICLE_CREATED: 'article.created',
    ARTICLE_UPDATED: 'article.updated',
    ARTICLE_DELETED: 'article.deleted',
    SOURCE_ADDED: 'source.added',
    SOURCE_UPDATED: 'source.updated',
    SOURCE_DELETED: 'source.deleted',
    USER_REGISTERED: 'user.registered',
    USER_UPDATED: 'user.updated',
    ANALYSIS_COMPLETED: 'analysis.completed',
    ERROR_OCCURRED: 'error.occurred'
  }
};

/**
 * Web服务类
 */
class WebService {
  constructor() {
    this.webhooks = new Map();
    this.subscribers = new Map();
    this.rateLimiter = new Map();
    this.retryQueue = new Map();
    this.circuitBreaker = new CircuitBreaker({
      timeout: WEB_CONFIG.timeout,
      errorThresholdPercentage: 50,
      resetTimeout: 60000
    });
    this.eventQueue = [];
    this.isProcessing = false;
  }

  /**
   * 注册Webhook
   */
  async registerWebhook(options) {
    try {
      logger.info(`正在注册Webhook: ${options.url}`);

      // 验证参数
      this.validateWebhookOptions(options);

      // 生成密钥
      const secret = options.secret || this.generateSecret();

      const webhook = {
        id: uuidv4(),
        url: options.url,
        events: options.events || [],
        secret,
        is_active: options.is_active ?? true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: options.metadata || {}
      };

      // 保存到数据库
      const { error } = await supabase
        .from('webhooks')
        .insert([webhook])
        .select()
        .single();

      if (error) {
        throw error;
      }

      // 缓存Webhook
      this.webhooks.set(webhook.id, webhook);

      logger.info(`Webhook注册成功: ${webhook.id}`, { url: webhook.url });

      return {
        success: true,
        webhook: data,
        secret
      };

    } catch (error) {
      logger.error('Webhook注册失败', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 更新Webhook
   */
  async updateWebhook(webhookId, updates) {
    try {
      logger.info(`正在更新Webhook: ${webhookId}`);

      const { error } = await supabase
        .from('webhooks')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', webhookId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      // 更新缓存
      this.webhooks.set(webhookId, data);

      logger.info(`Webhook更新成功: ${webhookId}`);

      return {
        success: true,
        webhook: data
      };

    } catch (error) {
      logger.error(`Webhook更新失败: ${webhookId}`, { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 删除Webhook
   */
  async deleteWebhook(webhookId) {
    try {
      logger.info(`正在删除Webhook: ${webhookId}`);

      const { error } = await supabase
        .from('webhooks')
        .delete()
        .eq('id', webhookId);

      if (error) {
        throw error;
      }

      // 从缓存中移除
      this.webhooks.delete(webhookId);

      logger.info(`Webhook删除成功: ${webhookId}`);

      return {
        success: true,
        webhookId
      };

    } catch (error) {
      logger.error(`Webhook删除失败: ${webhookId}`, { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取Webhook
   */
  async getWebhook(webhookId) {
    try {
      // 检查缓存
      if (this.webhooks.has(webhookId)) {
        return this.webhooks.get(webhookId);
      }

      // 从数据库获取
      const { error } = await supabase
        .from('webhooks')
        .select('*')
        .eq('id', webhookId)
        .single();

      if (error) {
        throw error;
      }

      // 缓存结果
      this.webhooks.set(webhookId, data);

      return data;

    } catch (error) {
      logger.error(`获取Webhook失败: ${webhookId}`, { error: error.message });
      return null;
    }
  }

  /**
   * 获取所有Webhook
   */
  async getAllWebhooks() {
    try {
      const { error } = await supabase
        .from('webhooks')
        .select('*')
        .eq('is_active', true);

      if (error) {
        throw error;
      }

      // 更新缓存
      data.forEach(webhook => {
        this.webhooks.set(webhook.id, webhook);
      });

      return data;

    } catch (error) {
      logger.error('获取所有Webhook失败', { error: error.message });
      return [];
    }
  }

  /**
   * 发送Webhook
   */
  async sendWebhook(webhookId, event, payload) {
    try {
      logger.info(`正在发送Webhook: ${webhookId} - ${event}`);

      // 获取Webhook配置
      const webhook = await this.getWebhook(webhookId);
      if (!webhook) {
        throw new Error('Webhook不存在');
      }

      // 检查是否监听该事件
      if (!webhook.events.includes('*') && !webhook.events.includes(event)) {
        logger.info(`Webhook不监听该事件: ${webhookId} - ${event}`);
        return { success: true, skipped: true };
      }

      // 检查频率限制
      if (!this.checkRateLimit(webhookId)) {
        throw new Error('发送频率超过限制');
      }

      // 准备Webhook数据
      const webhookData = {
        id: uuidv4(),
        webhook_id: webhookId,
        event,
        payload,
        created_at: new Date().toISOString(),
        attempts: 0,
        status: 'pending'
      };

      // 发送Webhook
      const result = await this.executeWebhook(webhook, webhookData);

      return result;

    } catch (error) {
      logger.error(`发送Webhook失败: ${webhookId} - ${event}`, { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 执行Webhook发送
   */
  async executeWebhook(webhook, webhookData) {
    try {
      const Date.now() = Date.now();

      // 准备请求体
      const body = {
        id: webhookData.id,
        event: webhookData.event,
        timestamp: webhookData.created_at,
        payload: webhookData.payload
      };

      // 生成签名
      const signature = this.generateSignature(body, webhook.secret);

      // 使用断路器保护
      const response = await this.circuitBreaker.execute(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), WEB_CONFIG.timeout);

        try {
          const result = await fetch(webhook.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'NewsAggregator-Webhook/1.0',
              [WEB_CONFIG.signature.header]: `t=${Date.now()},s=${signature}`,
              'X-Webhook-ID': webhook.id,
              'X-Webhook-Event': webhookData.event
            },
            body: JSON.stringify(body),
            signal: controller.signal
          });

          clearTimeout(timeoutId);
          return result;

        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      });

      const responseTime = Date.now() - Date.now();

      // 处理响应
      if (response.ok) {
        await this.updateWebhookStatus(webhookData.id, 'success', {
          status_code: response.status,
          Date.now() - Date.now(),
          response_headers: Object.fromEntries(response.headers.entries())
        });

        logger.info(`Webhook发送成功: ${webhook.id} - ${webhookData.event}`, {
          responseTime,
          statusCode: response.status
        });

        return {
          success: true,
          responseTime,
          statusCode: response.status
        };
      } else {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

    } catch (error) {
      // 更新Webhook状态为失败
      await this.updateWebhookStatus(webhookData.id, 'failed', {
        error_message: error.message,
        attempts: webhookData.attempts + 1
      });

      // 如果未达到最大重试次数，加入重试队列
      if (webhookData.attempts < WEB_CONFIG.maxRetries) {
        await this.scheduleRetry(webhook, webhookData);
      }

      logger.error(`Webhook执行失败: ${webhook.id} - ${webhookData.event}`, {
        error: error.message,
        attempts: webhookData.attempts
      });

      return {
        success: false,
        error: error.message,
        attempts: webhookData.attempts
      };
    }
  }

  /**
   * 广播事件
   */
  async broadcastEvent(event, payload) {
    try {
      logger.info(`广播事件: ${event}`);

      // 获取所有活跃的Webhook
      const webhooks = await this.getAllWebhooks();

      // 过滤监听该事件的Webhook
      const [] = webhooks.filter(webhook =>
        webhook.events.includes('*') || webhook.events.includes(event)
      );

      if ([].length === 0) {
        logger.info(`没有Webhook监听该事件: ${event}`);
        return { success: true, sentCount: 0 };
      }

      // 发送给所有目标Webhook
      const results = await Promise.allSettled(
        [].map(webhook => this.sendWebhook(webhook.id, event, payload))
      );

      const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const failureCount = results.length - successCount;

      logger.info(`事件广播完成: ${event}`, {
        total: results.length,
        success: successCount,
        failures: failureCount
      });

      return {
        success: true,
        sentCount: successCount,
        failureCount,
        results
      };

    } catch (error) {
      logger.error(`事件广播失败: ${event}`, { error: error.message });
      return {
        success: false,
        error: error.message,
        sentCount: 0,
        failureCount: []?.length || 0
      };
    }
  }

  /**
   * 验证Webhook签名
   */
  verifySignature(payload, signature, secret) {
    try {
      const expectedSignature = this.generateSignature(payload, secret);
      return signature === expectedSignature;
    } catch (error) {
      logger.error('Webhook签名验证失败', { error: error.message });
      return false;
    }
  }

  /**
   * 处理收到的Webhook
   */
  async handleIncomingWebhook(req, res) {
    try {
      const signature = req.headers[WEB_CONFIG.signature.header];
      const eventId = req.headers['x-webhook-id'];
      const event = req.headers['x-webhook-event'];

      if (!signature || !eventId || !event) {
        return res.status(400).json({
          error: 'Missing required headers'
        });
      }

      // 获取Webhook配置
      const webhook = await this.getWebhook(eventId);
      if (!webhook) {
        return res.status(404).json({
          error: 'Webhook not found'
        });
      }

      // 验证签名
      const isValid = this.verifySignature(req.body, signature, webhook.secret);
      if (!isValid) {
        return res.status(401).json({
          error: 'Invalid signature'
        });
      }

      // 处理事件
      await this.processIncomingEvent(webhook, event, req.body);

      res.status(200).json({
        success: true,
        message: 'Webhook processed successfully'
      });

    } catch (error) {
      logger.error('处理收到的Webhook失败', { error: error.message });
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  /**
   * 处理收到的Webhook事件
   */
  async processIncomingEvent(webhook, event, payload) {
    try {
      logger.info(`处理收到的Webhook事件: ${event}`, { webhookId: webhook.id });

      // 记录事件
      const { error } = await supabase
        .from('webhook_events')
        .insert([{
          id: uuidv4(),
          webhook_id: webhook.id,
          event,
          payload: JSON.stringify(payload),
          direction: 'incoming',
          created_at: new Date().toISOString()
        }]);

      if (error) {
        throw error;
      }

      // 触发内部事件处理器
      this.triggerEventHandlers(event, payload);

    } catch (error) {
      logger.error(`处理Webhook事件失败: ${event}`, { error: error.message });
      throw error;
    }
  }

  /**
   * 触发事件处理器
   */
  triggerEventHandlers(event, payload) {
    // 这里可以注册特定的事件处理器
    const handlers = this.subscribers.get(event) || [];
    handlers.forEach(handler => {
      try {
        handler(payload);
      } catch (error) {
        logger.error(`事件处理器执行失败: ${event}`, { error: error.message });
      }
    });
  }

  /**
   * 订阅事件
   */
  subscribe(event, handler) {
    if (!this.subscribers.has(event)) {
      this.subscribers.set(event, []);
    }
    this.subscribers.get(event).push(handler);
  }

  /**
   * 取消订阅事件
   */
  unsubscribe(event, handler) {
    const handlers = this.subscribers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * 生成签名
   */
  generateSignature(payload, secret) {
    const hmac = crypto.createHmac(WEB_CONFIG.signature.algorithm, secret);
    hmac.update(JSON.stringify(payload));
    return hmac.digest('hex');
  }

  /**
   * 生成密钥
   */
  generateSecret() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * 检查频率限制
   */
  checkRateLimit(webhookId) {
    const now = Date.now();

    if (!this.rateLimiter.has(webhookId)) {
      this.rateLimiter.set(webhookId, []);
    }

    const requests = this.rateLimiter.get(webhookId);
    const validRequests = requests.filter(time => now - time < WEB_CONFIG.rateLimit.windowMs);

    if (validRequests.length >= WEB_CONFIG.rateLimit.maxRequests) {
      return false;
    }

    validRequests.push(now);
    this.rateLimiter.set(webhookId, validRequests);

    return true;
  }

  /**
   * 安排重试
   */
  async scheduleRetry(webhook, webhookData) {
    const delay = Math.min(
      WEB_CONFIG.retryDelay.initial * Math.pow(WEB_CONFIG.retryDelay.multiplier, webhookData.attempts),
      WEB_CONFIG.retryDelay.max
    );

    const retryTime = Date.now() + delay;

    if (!this.retryQueue.has(webhook.id)) {
      this.retryQueue.set(webhook.id, []);
    }

    this.retryQueue.get(webhook.id).push({
      ...webhookData,
      attempts: webhookData.attempts + 1,
      retryTime
    });

    logger.info(`安排重试: ${webhook.id}`, {
      attempts: webhookData.attempts + 1,
      delay
    });
  }

  /**
   * 处理重试队列
   */
  async processRetryQueue() {
    const now = Date.now();

    for (const [webhookId, retries] of this.retryQueue.entries()) {
      const pendingRetries = retries.filter(retry => retry.retryTime <= now);

      if (pendingRetries.length > 0) {
        const webhook = await this.getWebhook(webhookId);
        if (webhook && webhook.is_active) {
          for (const retry of pendingRetries) {
            try {
              await this.executeWebhook(webhook, retry);
            } catch (error) {
              logger.error(`重试失败: ${webhookId}`, { error: error.message });
            }
          }
        }

        // 从队列中移除已处理的重试
        this.retryQueue.set(webhookId, retries.filter(retry => retry.retryTime > now));
      }
    }
  }

  /**
   * 更新Webhook状态
   */
  async updateWebhookStatus(webhookDataId, status, additionalData = {}) {
    try {
      const { error } = await supabase
        .from('webhook_logs')
        .insert([{
          id: webhookDataId,
          status,
          ...additionalData,
          updated_at: new Date().toISOString()
        }]);

      if (error) {
        throw error;
      }

    } catch (error) {
      logger.error(`更新Webhook状态失败: ${webhookDataId}`, { error: error.message });
    }
  }

  /**
   * 验证Webhook选项
   */
  validateWebhookOptions(options) {
    const required = ['url'];
    const missing = required.filter(field => !options[field]);

    if (missing.length > 0) {
      throw new Error(`缺少必要字段: ${missing.join(', ')}`);
    }

    if (!validateUrl(options.url)) {
      throw new Error('无效的Webhook URL');
    }

    if (options.events && !Array.isArray(options.events)) {
      throw new Error('events必须是数组');
    }
  }

  /**
   * 获取Webhook统计信息
   */
  async getStatistics() {
    try {
      const [
        { count: totalWebhooks },
        { count: activeWebhooks },
        { count: todayEvents },
        { count: successfulEvents },
        { count: failedEvents },
        { data: eventStats }
      ] = await Promise.all([
        supabase.from('webhooks').select('*', { count: 'exact', head: true }),
        supabase.from('webhooks').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('webhook_logs').select('*', { count: 'exact', head: true }).gte('created_at', new Date().toISOString().split('T')[0]),
        supabase.from('webhook_logs').select('*', { count: 'exact', head: true }).eq('status', 'success'),
        supabase.from('webhook_logs').select('*', { count: 'exact', head: true }).eq('status', 'failed'),
        supabase.rpc('get_webhook_event_statistics')
      ]);

      return {
        totalWebhooks: totalWebhooks || 0,
        activeWebhooks: activeWebhooks || 0,
        todayEvents: todayEvents || 0,
        successfulEvents: successfulEvents || 0,
        failedEvents: failedEvents || 0,
        successRate: todayEvents ? (successfulEvents / todayEvents) * 100 : 0,
        eventStats: eventStats || []
      };

    } catch (error) {
      logger.error('获取Webhook统计失败', { error: error.message });
      return {
        totalWebhooks: 0,
        activeWebhooks: 0,
        todayEvents: 0,
        successfulEvents: 0,
        failedEvents: 0,
        successRate: 0,
        eventStats: []
      };
    }
  }

  /**
   * 测试Webhook
   */
  async testWebhook(webhookId, testEvent = 'test') {
    try {
      const webhook = await this.getWebhook(webhookId);
      if (!webhook) {
        throw new Error('Webhook不存在');
      }

      const testPayload = {
        type: 'test',
        message: 'This is a test webhook event',
        timestamp: new Date().toISOString(),
        webhook_id: webhookId
      };

      const result = await this.sendWebhook(webhookId, testEvent, testPayload);

      return {
        success: result.success,
        message: result.success ? 'Webhook测试成功' : 'Webhook测试失败',
        error: result.error
      };

    } catch (error) {
      logger.error(`Webhook测试失败: ${webhookId}`, { error: error.message });
      return {
        success: false,
        message: 'Webhook测试失败',
        error: error.message
      };
    }
  }

  /**
   * 清理缓存
   */
  clearCache() {
    this.webhooks.clear();
    this.rateLimiter.clear();
    this.retryQueue.clear();
    logger.info('Web服务缓存已清理');
  }
}

// 导出服务实例
export const webService = new WebService();
export default WebService;