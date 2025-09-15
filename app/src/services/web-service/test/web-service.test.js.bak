/**
 * Web服务测试用例
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { webService } from '../index.js';
import { validateUrl } from '../../../utils/validators.js';

// Mock依赖
jest.mock('@supabase/supabase-js');
jest.mock('../../../utils/logger.js');

const mockSupabase = require('@supabase/supabase-js');

// Mock global fetch
global.fetch = jest.fn();

describe('Web Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    webService.clearCache();
    global.fetch.mockClear();
  });

  describe('registerWebhook', () => {
    it('should register webhook successfully', async () => {
      const webhookOptions = {
        url: 'https://example.com/webhook',
        events: ['article.created', 'article.updated']
      };

      mockSupabase.createClient().from().insert().select().single.mockResolvedValue({
        data: {
          id: 'webhook-id',
          url: webhookOptions.url,
          events: webhookOptions.events,
          secret: 'generated-secret',
          is_active: true
        },
        error: null
      });

      const result = await webService.registerWebhook(webhookOptions);

      expect(result.success).toBe(true);
      expect(result.webhook).toBeDefined();
      expect(result.secret).toBeDefined();
      expect(webService.webhooks.has('webhook-id')).toBe(true);
    });

    it('should handle invalid URL', async () => {
      const invalidOptions = {
        url: 'invalid-url',
        events: ['article.created']
      };

      await expect(webService.registerWebhook(invalidOptions))
        .rejects.toThrow('无效的Webhook URL');
    });

    it('should handle missing required fields', async () => {
      const invalidOptions = {
        events: ['article.created']
        // 缺少 url
      };

      await expect(webService.registerWebhook(invalidOptions))
        .rejects.toThrow('缺少必要字段: url');
    });

    it('should handle invalid events array', async () => {
      const invalidOptions = {
        url: 'https://example.com/webhook',
        events: 'article.created' // 不是数组
      };

      await expect(webService.registerWebhook(invalidOptions))
        .rejects.toThrow('events必须是数组');
    });

    it('should handle database errors', async () => {
      const webhookOptions = {
        url: 'https://example.com/webhook',
        events: ['article.created']
      };

      mockSupabase.createClient().from().insert().select().single.mockResolvedValue({
        data: null,
        error: { message: 'Database error' }
      });

      const result = await webService.registerWebhook(webhookOptions);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });
  });

  describe('updateWebhook', () => {
    it('should update webhook successfully', async () => {
      const webhookId = 'webhook-id';
      const updates = {
        is_active: false,
        events: ['article.created']
      };

      mockSupabase.createClient().from().update().eq().select().single.mockResolvedValue({
        data: {
          id: webhookId,
          ...updates
        },
        error: null
      });

      const result = await webService.updateWebhook(webhookId, updates);

      expect(result.success).toBe(true);
      expect(result.webhook).toBeDefined();
      expect(result.webhook.is_active).toBe(false);
    });

    it('should handle database errors', async () => {
      const webhookId = 'nonexistent-id';

      mockSupabase.createClient().from().update().eq().select().single.mockResolvedValue({
        data: null,
        error: { message: 'Webhook not found' }
      });

      const result = await webService.updateWebhook(webhookId, { is_active: false });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Webhook not found');
    });
  });

  describe('deleteWebhook', () => {
    it('should delete webhook successfully', async () => {
      const webhookId = 'webhook-id';

      // 先缓存一个webhook
      webService.webhooks.set(webhookId, { id: webhookId });

      mockSupabase.createClient().from().delete().eq().mockResolvedValue({
        error: null
      });

      const result = await webService.deleteWebhook(webhookId);

      expect(result.success).toBe(true);
      expect(result.webhookId).toBe(webhookId);
      expect(webService.webhooks.has(webhookId)).toBe(false);
    });

    it('should handle database errors', async () => {
      const webhookId = 'webhook-id';

      mockSupabase.createClient().from().delete().eq().mockResolvedValue({
        error: { message: 'Database error' }
      });

      const result = await webService.deleteWebhook(webhookId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });
  });

  describe('getWebhook', () => {
    it('should get webhook from cache', async () => {
      const webhookId = 'webhook-id';
      const mockWebhook = { id: webhookId, url: 'https://example.com/webhook' };

      webService.webhooks.set(webhookId, mockWebhook);

      const result = await webService.getWebhook(webhookId);

      expect(result).toEqual(mockWebhook);
    });

    it('should get webhook from database', async () => {
      const webhookId = 'webhook-id';
      const mockWebhook = { id: webhookId, url: 'https://example.com/webhook' };

      mockSupabase.createClient().from().select().single.mockResolvedValue({
        data: mockWebhook,
        error: null
      });

      const result = await webService.getWebhook(webhookId);

      expect(result).toEqual(mockWebhook);
      expect(webService.webhooks.has(webhookId)).toBe(true);
    });

    it('should handle webhook not found', async () => {
      mockSupabase.createClient().from().select().single.mockResolvedValue({
        data: null,
        error: { message: 'Webhook not found' }
      });

      const result = await webService.getWebhook('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getAllWebhooks', () => {
    it('should get all active webhooks', async () => {
      const mockWebhooks = [
        { id: 'webhook-1', url: 'https://example.com/1', is_active: true },
        { id: 'webhook-2', url: 'https://example.com/2', is_active: true }
      ];

      mockSupabase.createClient().from().select().eq().mockResolvedValue({
        data: mockWebhooks,
        error: null
      });

      const result = await webService.getAllWebhooks();

      expect(result).toEqual(mockWebhooks);
      expect(webService.webhooks.size).toBe(2);
    });

    it('should handle database errors', async () => {
      mockSupabase.createClient().from().select().eq().mockResolvedValue({
        data: null,
        error: { message: 'Database error' }
      });

      const result = await webService.getAllWebhooks();

      expect(result).toEqual([]);
    });
  });

  describe('sendWebhook', () => {
    it('should send webhook successfully', async () => {
      const webhookId = 'webhook-id';
      const event = 'article.created';
      const payload = { articleId: 'article-1' };

      const mockWebhook = {
        id: webhookId,
        url: 'https://example.com/webhook',
        events: ['article.created'],
        secret: 'test-secret',
        is_active: true
      };

      // Mock getWebhook
      jest.spyOn(webService, 'getWebhook').mockResolvedValue(mockWebhook);

      // Mock fetch
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map(),
        json: () => Promise.resolve({ success: true })
      });

      mockSupabase.createClient().from().insert().mockResolvedValue({
        error: null
      });

      const result = await webService.sendWebhook(webhookId, event, payload);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    it('should handle webhook not found', async () => {
      const webhookId = 'nonexistent-id';

      jest.spyOn(webService, 'getWebhook').mockResolvedValue(null);

      const result = await webService.sendWebhook(webhookId, 'article.created', {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Webhook不存在');
    });

    it('should skip webhook not listening to event', async () => {
      const webhookId = 'webhook-id';
      const event = 'article.created';

      const mockWebhook = {
        id: webhookId,
        url: 'https://example.com/webhook',
        events: ['article.updated'], // 不监听 article.created
        is_active: true
      };

      jest.spyOn(webService, 'getWebhook').mockResolvedValue(mockWebhook);

      const result = await webService.sendWebhook(webhookId, event, {});

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
    });

    it('should handle rate limiting', async () => {
      const webhookId = 'webhook-id';

      const mockWebhook = {
        id: webhookId,
        url: 'https://example.com/webhook',
        events: ['*'],
        is_active: true
      };

      jest.spyOn(webService, 'getWebhook').mockResolvedValue(mockWebhook);

      // 填充频率限制器
      webService.rateLimiter.set(webhookId, Array(1000).fill(Date.now()));

      const result = await webService.sendWebhook(webhookId, 'article.created', {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('发送频率超过限制');
    });

    it('should handle fetch errors', async () => {
      const webhookId = 'webhook-id';
      const event = 'article.created';

      const mockWebhook = {
        id: webhookId,
        url: 'https://example.com/webhook',
        events: ['*'],
        secret: 'test-secret',
        is_active: true
      };

      jest.spyOn(webService, 'getWebhook').mockResolvedValue(mockWebhook);

      global.fetch.mockRejectedValue(new Error('Network error'));

      mockSupabase.createClient().from().insert().mockResolvedValue({
        error: null
      });

      const result = await webService.sendWebhook(webhookId, event, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('broadcastEvent', () => {
    it('should broadcast event to all listening webhooks', async () => {
      const event = 'article.created';
      const payload = { articleId: 'article-1' };

      const mockWebhooks = [
        { id: 'webhook-1', url: 'https://example.com/1', events: ['*'], is_active: true },
        { id: 'webhook-2', url: 'https://example.com/2', events: ['article.created'], is_active: true }
      ];

      jest.spyOn(webService, 'getAllWebhooks').mockResolvedValue(mockWebhooks);
      jest.spyOn(webService, 'sendWebhook').mockResolvedValue({ success: true });

      const result = await webService.broadcastEvent(event, payload);

      expect(result.success).toBe(true);
      expect(result.sentCount).toBe(2);
      expect(webService.sendWebhook).toHaveBeenCalledTimes(2);
    });

    it('should handle no listening webhooks', async () => {
      jest.spyOn(webService, 'getAllWebhooks').mockResolvedValue([]);

      const result = await webService.broadcastEvent('article.created', {});

      expect(result.success).toBe(true);
      expect(result.sentCount).toBe(0);
    });
  });

  describe('verifySignature', () => {
    it('should verify correct signature', () => {
      const payload = { test: 'data' };
      const secret = 'test-secret';
      const signature = webService.generateSignature(payload, secret);

      const isValid = webService.verifySignature(payload, signature, secret);

      expect(isValid).toBe(true);
    });

    it('should reject incorrect signature', () => {
      const payload = { test: 'data' };
      const secret = 'test-secret';
      const wrongSignature = 'wrong-signature';

      const isValid = webService.verifySignature(payload, wrongSignature, secret);

      expect(isValid).toBe(false);
    });
  });

  describe('generateSignature', () => {
    it('should generate consistent signature', () => {
      const payload = { test: 'data' };
      const secret = 'test-secret';

      const signature1 = webService.generateSignature(payload, secret);
      const signature2 = webService.generateSignature(payload, secret);

      expect(signature1).toBe(signature2);
    });
  });

  describe('generateSecret', () => {
    it('should generate secret of correct length', () => {
      const secret = webService.generateSecret();

      expect(secret).toMatch(/^[a-f0-9]{64}$/); // 32 bytes = 64 hex characters
    });

    it('should generate unique secrets', () => {
      const secret1 = webService.generateSecret();
      const secret2 = webService.generateSecret();

      expect(secret1).not.toBe(secret2);
    });
  });

  describe('checkRateLimit', () => {
    it('should allow first request', () => {
      const result = webService.checkRateLimit('webhook-id');
      expect(result).toBe(true);
    });

    it('should block request when rate limit exceeded', () => {
      // 填充频率限制器
      webService.rateLimiter.set('webhook-id', Array(1000).fill(Date.now()));

      const result = webService.checkRateLimit('webhook-id');
      expect(result).toBe(false);
    });

    it('should clean up old requests', () => {
      const oldTime = Date.now() - 70000; // 70 seconds ago
      webService.rateLimiter.set('webhook-id', [oldTime]);

      const result = webService.checkRateLimit('webhook-id');
      expect(result).toBe(true);
    });
  });

  describe('subscribe and unsubscribe', () => {
    it('should subscribe to event', () => {
      const handler = jest.fn();
      const event = 'test.event';

      webService.subscribe(event, handler);

      expect(webService.subscribers.has(event)).toBe(true);
      expect(webService.subscribers.get(event)).toContain(handler);
    });

    it('should unsubscribe from event', () => {
      const handler = jest.fn();
      const event = 'test.event';

      webService.subscribe(event, handler);
      webService.unsubscribe(event, handler);

      expect(webService.subscribers.get(event)).not.toContain(handler);
    });

    it('should handle unsubscribe from non-existent handler', () => {
      const handler = jest.fn();
      const event = 'test.event';

      webService.subscribe(event, handler);
      webService.unsubscribe(event, jest.fn()); // 不同的handler

      expect(webService.subscribers.get(event)).toContain(handler);
    });
  });

  describe('triggerEventHandlers', () => {
    it('should trigger event handlers', () => {
      const handler = jest.fn();
      const event = 'test.event';
      const payload = { data: 'test' };

      webService.subscribe(event, handler);
      webService.triggerEventHandlers(event, payload);

      expect(handler).toHaveBeenCalledWith(payload);
    });

    it('should handle handler errors gracefully', () => {
      const handler = jest.fn().mockImplementation(() => {
        throw new Error('Handler error');
      });
      const event = 'test.event';
      const payload = { data: 'test' };

      webService.subscribe(event, handler);

      expect(() => {
        webService.triggerEventHandlers(event, payload);
      }).not.toThrow();
    });
  });

  describe('scheduleRetry and processRetryQueue', () => {
    it('should schedule retry with exponential backoff', async () => {
      const webhook = { id: 'webhook-id', is_active: true };
      const webhookData = { id: 'data-id', attempts: 0 };

      jest.spyOn(webService, 'getWebhook').mockResolvedValue(webhook);
      jest.spyOn(webService, 'executeWebhook').mockResolvedValue({ success: true });

      await webService.scheduleRetry(webhook, webhookData);

      expect(webService.retryQueue.has('webhook-id')).toBe(true);
      expect(webService.retryQueue.get('webhook-id')[0].attempts).toBe(1);
      expect(webService.retryQueue.get('webhook-id')[0].retryTime).toBeGreaterThan(Date.now());
    });

    it('should not retry if max attempts reached', async () => {
      const webhook = { id: 'webhook-id', is_active: true };
      const webhookData = { id: 'data-id', attempts: 3 }; // 达到最大重试次数

      await webService.scheduleRetry(webhook, webhookData);

      expect(webService.retryQueue.has('webhook-id')).toBe(false);
    });
  });

  describe('getStatistics', () => {
    it('should get statistics successfully', async () => {
      mockSupabase.createClient().from().select.mockReturnValue({
        count: jest.fn().mockReturnValue({
          head: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ count: 100 })
          })
        })
      });

      mockSupabase.createClient().rpc.mockResolvedValue({
        data: [],
        error: null
      });

      const stats = await webService.getStatistics();

      expect(stats.totalWebhooks).toBe(100);
      expect(stats.activeWebhooks).toBe(100);
      expect(stats.todayEvents).toBe(100);
      expect(stats.successfulEvents).toBe(100);
      expect(stats.failedEvents).toBe(100);
      expect(stats.successRate).toBe(100);
    });
  });

  describe('testWebhook', () => {
    it('should test webhook successfully', async () => {
      const webhookId = 'webhook-id';
      const mockWebhook = {
        id: webhookId,
        url: 'https://example.com/webhook',
        events: ['*'],
        is_active: true
      };

      jest.spyOn(webService, 'getWebhook').mockResolvedValue(mockWebhook);
      jest.spyOn(webService, 'sendWebhook').mockResolvedValue({ success: true });

      const result = await webService.testWebhook(webhookId);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Webhook测试成功');
    });

    it('should handle webhook not found', async () => {
      jest.spyOn(webService, 'getWebhook').mockResolvedValue(null);

      const result = await webService.testWebhook('nonexistent');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Webhook测试失败');
      expect(result.error).toBe('Webhook不存在');
    });
  });

  describe('clearCache', () => {
    it('should clear all cache', () => {
      webService.webhooks.set('test', 'webhook');
      webService.rateLimiter.set('test', [Date.now()]);
      webService.retryQueue.set('test', []);

      expect(webService.webhooks.size).toBe(1);
      expect(webService.rateLimiter.size).toBe(1);
      expect(webService.retryQueue.size).toBe(1);

      webService.clearCache();

      expect(webService.webhooks.size).toBe(0);
      expect(webService.rateLimiter.size).toBe(0);
      expect(webService.retryQueue.size).toBe(0);
    });
  });

  describe('Circuit Breaker', () => {
    it('should handle circuit breaker open state', async () => {
      const webhookId = 'webhook-id';
      const event = 'article.created';

      const mockWebhook = {
        id: webhookId,
        url: 'https://example.com/webhook',
        events: ['*'],
        secret: 'test-secret',
        is_active: true
      };

      jest.spyOn(webService, 'getWebhook').mockResolvedValue(mockWebhook);

      // 强制开启断路器
      webService.circuitBreaker.forceOpen();

      const result = await webService.sendWebhook(webhookId, event, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Circuit breaker is OPEN');
    });

    it('should recover from circuit breaker', async () => {
      const webhookId = 'webhook-id';
      const event = 'article.created';

      const mockWebhook = {
        id: webhookId,
        url: 'https://example.com/webhook',
        events: ['*'],
        secret: 'test-secret',
        is_active: true
      };

      jest.spyOn(webService, 'getWebhook').mockResolvedValue(mockWebhook);

      // 强制开启断路器
      webService.circuitBreaker.forceOpen();

      // 设置下一次尝试时间为过去
      webService.circuitBreaker.nextAttemptTime = Date.now() - 1000;

      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map()
      });

      mockSupabase.createClient().from().insert().mockResolvedValue({
        error: null
      });

      const result = await webService.sendWebhook(webhookId, event, {});

      expect(result.success).toBe(true);
      expect(webService.circuitBreaker.state).toBe('CLOSED');
    });
  });
});