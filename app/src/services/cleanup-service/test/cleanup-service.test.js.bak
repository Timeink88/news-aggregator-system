/**
 * Cleanup服务测试 - 数据清理功能测试
 * 遵循Jest最佳实践：模块化、覆盖率、边界测试
 */

// Mock logger模块
jest.mock('../../../utils/logger.js', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

// Mock Supabase客户端
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      delete: jest.fn(() => ({
        lt: jest.fn(() => ({ data: null, error: null, count: 5 })),
        gte: jest.fn(() => ({ data: null, error: null, count: 3 }))
      })),
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => ({ data: null, error: null }))
        })),
        gte: jest.fn(() => ({
          lte: jest.fn(() => ({ data: null, error: null }))
        }))
      })),
      update: jest.fn(() => ({
        eq: jest.fn(() => ({ data: null, error: null }))
      })),
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(() => ({ data: { id: 'test-id' }, error: null }))
        }))
      }))
    })),
    rpc: jest.fn(() => ({ data: null, error: null }))
  }))
}));

// Mock文件系统
jest.mock('fs', () => ({
  existsSync: jest.fn(() => true),
  unlinkSync: jest.fn(),
  readdirSync: jest.fn(() => ['temp1.txt', 'temp2.txt']),
  statSync: jest.fn(() => ({ size: 1024, mtime: new Date() }))
}));

// Mock文件系统promises
jest.mock('fs/promises', () => ({
  unlink: jest.fn(),
  readdir: jest.fn(() => Promise.resolve(['file1.log', 'file2.log'])),
  stat: jest.fn(() => Promise.resolve({ size: 2048, mtime: new Date() }))
}));

// 动态导入ES模块
let CleanupService;

describe('CleanupService', () => {
  let cleanupService;
  let mockSupabase;

  beforeAll(async () => {
    // 动态导入ES模块
    const module = await import('../index.js');
    CleanupService = module.default;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    const { createClient } = require('@supabase/supabase-js');
    mockSupabase = createClient();
    cleanupService = new CleanupService();
  });

  describe('构造函数', () => {
    test('应该正确初始化清理服务', () => {
      expect(cleanupService.config).toBeDefined();
      expect(cleanupService.circuitBreaker).toBeDefined();
      expect(cleanupService.cleanupHistory).toEqual([]);
      expect(cleanupService.isRunning).toBe(false);
      expect(cleanupService.activeTasks).toBeInstanceOf(Map);
    });

    test('应该包含正确的配置', () => {
      expect(cleanupService.config.retentionPeriods).toBeDefined();
      expect(cleanupService.config.batchSizes).toBeDefined();
      expect(cleanupService.config.thresholds).toBeDefined();
      expect(cleanupService.config.schedules).toBeDefined();
    });
  });

  describe('服务生命周期', () => {
    test('应该能够启动清理服务', async () => {
      const result = await cleanupService.start();

      expect(result.success).toBe(true);
      expect(cleanupService.isRunning).toBe(true);
    });

    test('应该能够停止清理服务', async () => {
      cleanupService.isRunning = true;
      const result = await cleanupService.stop();

      expect(result.success).toBe(true);
      expect(cleanupService.isRunning).toBe(false);
    });

    test('不应该重复启动已运行的服务', async () => {
      cleanupService.isRunning = true;
      const result = await cleanupService.start();

      expect(result.success).toBe(true);
    });
  });

  describe('会话清理', () => {
    test('应该能够清理过期会话', async () => {
      const result = await cleanupService.cleanupExpiredSessions();

      expect(result.success).toBe(true);
      expect(result.cleanedCount).toBe(5);
      expect(cleanupService.cleanupHistory.length).toBe(1);
    });

    test('应该处理会话清理错误', async () => {
      mockSupabase.from.mockReturnValue({
        delete: jest.fn(() => ({
          lt: jest.fn(() => ({
            data: null,
            error: { message: '数据库错误' },
            count: null
          }))
        }))
      });

      const result = await cleanupService.cleanupExpiredSessions();

      expect(result.success).toBe(false);
      expect(result.error).toBe('数据库错误');
    });
  });

  describe('日志清理', () => {
    test('应该能够清理旧日志', async () => {
      // Mock文件系统
      const { promises: fsPromises } = require('fs/promises');
      fsPromises.readdir.mockResolvedValue(['old.log', 'new.log']);
      fsPromises.stat.mockResolvedValue({ size: 1024, mtime: new Date('2023-01-01') });

      const result = await cleanupService.cleanupOldLogs();

      expect(result.success).toBe(true);
      expect(result.cleanedFiles).toBe(2);
      expect(result.freedSpace).toBe(2048);
    });

    test('应该跳过不存在的日志文件', async () => {
      const { existsSync } = require('fs');
      existsSync.mockReturnValue(false);

      const result = await cleanupService.cleanupOldLogs();

      expect(result.success).toBe(true);
      expect(result.cleanedFiles).toBe(0);
      expect(result.skippedFiles).toBeGreaterThan(0);
    });
  });

  describe('失败任务清理', () => {
    test('应该能够清理失败任务', async () => {
      const result = await cleanupService.cleanupFailedJobs();

      expect(result.success).toBe(true);
      expect(result.cleanedCount).toBe(3);
      expect(cleanupService.cleanupHistory.length).toBe(1);
    });
  });

  describe('存储优化', () => {
    test('应该能够执行存储优化', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: null, error: null });

      const result = await cleanupService.optimizeStorage();

      expect(result.success).toBe(true);
      expect(result.optimized).toBe(true);
    });

    test('应该处理存储优化错误', async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: { message: '优化失败' }
      });

      const result = await cleanupService.optimizeStorage();

      expect(result.success).toBe(false);
      expect(result.error).toBe('优化失败');
    });
  });

  describe('错误处理', () => {
    test('应该处理网络错误', async () => {
      // Mock circuit breaker来模拟网络错误
      cleanupService.circuitBreaker.execute = jest.fn()
        .mockRejectedValue(new Error('网络连接失败'));

      const result = await cleanupService.cleanupExpiredSessions();

      expect(result.success).toBe(false);
      expect(result.error).toBe('网络连接失败');
    });

    test('应该处理配置错误', async () => {
      // 临时修改配置以测试错误处理
      const originalConfig = cleanupService.config;
      cleanupService.config = null;

      const result = await cleanupService.cleanupExpiredSessions();

      expect(result.success).toBe(false);
      expect(result.error).toContain('config');

      // 恢复配置
      cleanupService.config = originalConfig;
    });
  });

  describe('清理历史', () => {
    test('应该正确记录清理历史', async () => {
      await cleanupService.cleanupExpiredSessions();
      await cleanupService.cleanupFailedJobs();

      expect(cleanupService.cleanupHistory.length).toBe(2);
      expect(cleanupService.cleanupHistory[0].operation).toBe('cleanupExpiredSessions');
      expect(cleanupService.cleanupHistory[1].operation).toBe('cleanupFailedJobs');
    });

    test('应该能够获取清理历史', () => {
      const history = cleanupService.getCleanupHistory();
      expect(Array.isArray(history)).toBe(true);
    });
  });

  describe('统计信息', () => {
    test('应该能够获取清理统计信息', () => {
      const stats = cleanupService.getCleanupStats();

      expect(stats).toBeDefined();
      expect(stats.totalCleaned).toBeDefined();
      expect(stats.successRate).toBeDefined();
      expect(stats.lastCleanup).toBeDefined();
    });

    test('应该正确计算统计信息', async () => {
      await cleanupService.cleanupExpiredSessions();
      await cleanupService.cleanupFailedJobs();

      const stats = cleanupService.getCleanupStats();

      expect(stats.totalOperations).toBe(2);
      expect(stats.successfulOperations).toBe(2);
      expect(stats.successRate).toBe(100);
    });
  });

  describe('配置验证', () => {
    test('应该验证配置参数', () => {
      const config = cleanupService.config;

      expect(config.retentionPeriods.sessions).toBeGreaterThan(0);
      expect(config.retentionPeriods.failedJobs).toBeGreaterThan(0);
      expect(config.batchSizes.expiredSessions).toBeGreaterThan(0);
      expect(config.thresholds.storageUsage).toBeGreaterThan(0);
      expect(config.thresholds.storageUsage).toBeLessThan(100);
    });
  });
});