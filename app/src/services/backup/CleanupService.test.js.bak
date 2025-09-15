/**
 * Cleanup Service Test Suite
 * 测试Cleanup Service的所有功能
 */

import CleanupService from '../CleanupService.js';
import { jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';

// Mock dependencies
jest.mock('fs/promises');
jest.mock('glob');
jest.mock('../utils/logger.js');
jest.mock('../database/client.js');

describe('CleanupService', () => {
  let cleanupService;
  let mockDbClient;
  let mockLogger;

  beforeEach(() => {
    // 重置所有mock
    jest.clearAllMocks();

    // 创建mock对象
    mockDbClient = {
      from: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      rpc: jest.fn()
    };

    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    // 设置模块mock
    require('../database/client.js').default = mockDbClient;
    require('../utils/logger.js').default = mockLogger;

    // 创建CleanupService实例
    cleanupService = new CleanupService({
      logsEnabled: true,
      cacheEnabled: true,
      databaseEnabled: true,
      tempFilesEnabled: true,
      scheduleEnabled: false
    });
  });

  describe('Constructor', () => {
    test('应该正确初始化CleanupService', () => {
      expect(cleanupService).toBeInstanceOf(CleanupService);
      expect(cleanupService.isRunning).toBe(false);
      expect(cleanupService.cleanupStats).toEqual({
        totalCleanups: 0,
        filesCleaned: 0,
        recordsCleaned: 0,
        cacheCleared: 0,
        errors: 0
      });
      expect(cleanupService.cleanupRules.size).toBe(5);
    });

    test('应该使用自定义配置', () => {
      const service = new CleanupService({
        logMaxAge: 86400000, // 1天
        cacheMaxAge: 3600000, // 1小时
        databaseEnabled: false
      });

      expect(service.cleanupConfig.logs.maxAge).toBe(86400000);
      expect(service.cleanupConfig.cache.maxAge).toBe(3600000);
      expect(service.cleanupConfig.database.enabled).toBe(false);
    });
  });

  describe('initialize', () => {
    test('应该成功初始化CleanupService', async () => {
      fs.mkdir.mockResolvedValue();

      const result = await cleanupService.initialize();

      expect(result).toBe(true);
      expect(cleanupService.isRunning).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Cleanup Service初始化成功');
    });

    test('应该在配置验证失败时抛出错误', () => {
      const service = new CleanupService({
        logMaxAge: -1 // 无效配置
      });

      expect(service.initialize()).rejects.toThrow('日志最大年龄必须大于0');
    });
  });

  describe('performFullCleanup', () => {
    beforeEach(async () => {
      await cleanupService.initialize();

      // Mock cleanup方法
      cleanupService.cleanupLogs = jest.fn().mockResolvedValue({ filesCleaned: 5 });
      cleanupService.cleanupCache = jest.fn().mockResolvedValue({ cacheCleared: 10 });
      cleanupService.cleanupDatabase = jest.fn().mockResolvedValue({ recordsCleaned: 3 });
      cleanupService.cleanupTempFiles = jest.fn().mockResolvedValue({ filesCleaned: 2 });
    });

    test('应该成功执行完整清理', async () => {
      const result = await cleanupService.performFullCleanup();

      expect(result.success).toBe(true);
      expect(result.data.summary.totalFilesCleaned).toBe(7);
      expect(result.data.summary.totalRecordsCleaned).toBe(3);
      expect(result.data.summary.totalCacheCleared).toBe(10);
      expect(result.data.summary.errors).toBe(0);
    });

    test('应该在干运行模式下不执行实际清理', async () => {
      const result = await cleanupService.performFullCleanup({ dryRun: true });

      expect(result.success).toBe(true);
      expect(result.data.summary.dryRun).toBe(true);
      expect(cleanupService.cleanupLogs).not.toHaveBeenCalled();
    });

    test('应该处理清理过程中的错误', async () => {
      cleanupService.cleanupDatabase.mockRejectedValue(new Error('Database error'));

      const result = await cleanupService.performFullCleanup();

      expect(result.success).toBe(true);
      expect(result.data.summary.errors).toBe(1);
      expect(result.data.results.database.status).toBe('error');
    });
  });

  describe('cleanupLogs', () => {
    test('应该成功清理日志文件', async () => {
      const mockFiles = ['logs/app.log', 'logs/error.log'];
      const mockStats = {
        mtime: { getTime: () => Date.now() - 10 * 24 * 60 * 60 * 1000 }, // 10天前
        size: 200 * 1024 * 1024 // 200MB
      };

      jest.mocked(fs).stat.mockResolvedValue(mockStats);
      jest.mocked(fs).unlink.mockResolvedValue();
      jest.mocked(fs).readFile.mockResolvedValue('log content\n'.repeat(10000));
      jest.mocked(fs).writeFile.mockResolvedValue();

      const glob = require('glob');
      glob.mockResolvedValue(mockFiles);

      const result = await cleanupService.cleanupLogs();

      expect(result.filesCleaned).toBe(2);
      expect(fs.unlink).toHaveBeenCalledTimes(2);
    });

    test('应该在日志清理禁用时跳过', async () => {
      cleanupService.cleanupConfig.logs.enabled = false;

      const result = await cleanupService.cleanupLogs();

      expect(result.filesCleaned).toBe(0);
      expect(result.message).toBe('日志清理已禁用');
    });
  });

  describe('cleanupDatabase', () => {
    beforeEach(() => {
      // Mock数据库清理方法
      cleanupService.cleanupExpiredSessions = jest.fn().mockResolvedValue(5);
      cleanupService.cleanupFailedTasks = jest.fn().mockResolvedValue(3);
      cleanupService.cleanupOldArticles = jest.fn().mockResolvedValue(10);
      cleanupService.cleanupAuditLogs = jest.fn().mockResolvedValue(2);
    });

    test('应该成功清理数据库', async () => {
      const result = await cleanupService.cleanupDatabase();

      expect(result.recordsCleaned).toBe(20);
      expect(cleanupService.cleanupExpiredSessions).toHaveBeenCalled();
      expect(cleanupService.cleanupFailedTasks).toHaveBeenCalled();
      expect(cleanupService.cleanupOldArticles).toHaveBeenCalled();
      expect(cleanupService.cleanupAuditLogs).toHaveBeenCalled();
    });

    test('应该在数据库清理禁用时跳过', async () => {
      cleanupService.cleanupConfig.database.enabled = false;

      const result = await cleanupService.cleanupDatabase();

      expect(result.recordsCleaned).toBe(0);
      expect(result.message).toBe('数据库清理已禁用');
    });
  });

  describe('cleanupExpiredSessions', () => {
    test('应该成功清理过期会话', async () => {
      const mockData = [{ id: 1 }, { id: 2 }];
      mockDbClient.delete.mockReturnValue({ count: 5 });
      mockDbClient.select.mockResolvedValue({ data: mockData, error: null, count: 5 });

      const result = await cleanupService.cleanupExpiredSessions();

      expect(result).toBe(5);
      expect(mockDbClient.from).toHaveBeenCalledWith('sessions');
      expect(mockLogger.info).toHaveBeenCalledWith('清理了 5 个过期会话');
    });

    test('应该处理数据库错误', async () => {
      mockDbClient.select.mockResolvedValue({ data: null, error: 'Database error', count: 0 });

      const result = await cleanupService.cleanupExpiredSessions();

      expect(result).toBe(0);
      expect(mockLogger.error).toHaveBeenCalledWith('删除过期会话失败:', 'Database error');
    });
  });

  describe('cleanupOldArticles', () => {
    test('应该成功清理旧文章', async () => {
      // Mock获取文章总数
      mockDbClient.select.mockResolvedValueOnce({ count: 15000, error: null });

      // Mock删除文章
      mockDbClient.delete.mockReturnValue({ count: 5000 });
      mockDbClient.select.mockResolvedValueOnce({ data: [], error: null, count: 5000 });

      const result = await cleanupService.cleanupOldArticles();

      expect(result).toBe(5000);
      expect(mockLogger.info).toHaveBeenCalledWith('清理了 5000 篇旧文章，保留最新 10000 篇');
    });

    test('应该在文章数量未超过限制时跳过清理', async () => {
      mockDbClient.select.mockResolvedValue({ count: 5000, error: null });

      const result = await cleanupService.cleanupOldArticles();

      expect(result).toBe(0);
      expect(mockLogger.info).toHaveBeenCalledWith('文章数量未超过保留限制，无需清理');
    });
  });

  describe('cleanupTempFiles', () => {
    test('应该成功清理临时文件', async () => {
      const mockFiles = ['temp/file1.tmp', 'temp/file2.tmp'];
      const mockStats = {
        isFile: () => true,
        mtime: { getTime: () => Date.now() - 2 * 24 * 60 * 60 * 1000 } // 2天前
      };

      jest.mocked(fs).stat.mockResolvedValue(mockStats);
      jest.mocked(fs).unlink.mockResolvedValue();

      const glob = require('glob');
      glob.mockResolvedValue(mockFiles);

      const result = await cleanupService.cleanupTempFiles();

      expect(result.filesCleaned).toBe(2);
      expect(fs.unlink).toHaveBeenCalledTimes(2);
    });

    test('应该在临时文件清理禁用时跳过', async () => {
      cleanupService.cleanupConfig.tempFiles.enabled = false;

      const result = await cleanupService.cleanupTempFiles();

      expect(result.filesCleaned).toBe(0);
      expect(result.message).toBe('临时文件清理已禁用');
    });
  });

  describe('optimizeSystem', () => {
    test('应该成功执行系统优化', async () => {
      cleanupService.optimizeDatabase = jest.fn().mockResolvedValue(true);
      cleanupService.optimizeFileSystem = jest.fn().mockResolvedValue(true);
      cleanupService.optimizeMemory = jest.fn().mockResolvedValue(true);

      const result = await cleanupService.optimizeSystem();

      expect(result.message).toBe('系统优化完成');
      expect(cleanupService.optimizeDatabase).toHaveBeenCalled();
      expect(cleanupService.optimizeFileSystem).toHaveBeenCalled();
      expect(cleanupService.optimizeMemory).toHaveBeenCalled();
    });
  });

  describe('optimizeDatabase', () => {
    test('应该成功执行数据库优化', async () => {
      mockDbClient.rpc.mockImplementation((funcName) => {
        if (funcName === 'get_database_size') {
          return Promise.resolve({ data: { size: 150 }, error: null });
        } else if (funcName === 'get_table_sizes') {
          return Promise.resolve({
            data: [
              { table_name: 'articles', size: 50 },
              { table_name: 'rss_sources', size: 10 }
            ],
            error: null
          });
        } else {
          return Promise.resolve({ error: null });
        }
      });

      const result = await cleanupService.optimizeDatabase();

      expect(result).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('数据库优化完成');
    });

    test('应该处理数据库优化错误', async () => {
      mockDbClient.rpc.mockRejectedValue(new Error('Optimization failed'));

      const result = await cleanupService.optimizeDatabase();

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith('数据库优化失败:', expect.any(Error));
    });
  });

  describe('getStats', () => {
    test('应该返回正确的统计信息', () => {
      const stats = cleanupService.getStats();

      expect(stats).toHaveProperty('isRunning');
      expect(stats).toHaveProperty('config');
      expect(stats).toHaveProperty('rules');
      expect(stats.rules).toHaveLength(5);
    });
  });

  describe('getRules', () => {
    test('应该返回所有清理规则', () => {
      const rules = cleanupService.getRules();

      expect(rules).toHaveLength(5);
      expect(rules[0]).toHaveProperty('name');
      expect(rules[0]).toHaveProperty('description');
      expect(rules[0]).toHaveProperty('priority');
      expect(rules[0]).toHaveProperty('schedule');
    });
  });

  describe('executeRule', () => {
    test('应该成功执行指定规则', async () => {
      const mockResult = { filesCleaned: 5 };
      cleanupService.cleanupLogs = jest.fn().mockResolvedValue(mockResult);

      const result = await cleanupService.executeRule('logs');

      expect(result.success).toBe(true);
      expect(result.data.rule).toBe('logs');
      expect(result.data.result).toBe(mockResult);
    });

    test('应该在规则不存在时抛出错误', async () => {
      await expect(cleanupService.executeRule('nonexistent'))
        .rejects.toThrow('未找到清理规则: nonexistent');
    });
  });

  describe('stop', () => {
    test('应该成功停止服务', async () => {
      await cleanupService.initialize();
      await cleanupService.stop();

      expect(cleanupService.isRunning).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('Cleanup Service已停止');
    });
  });

  describe('事件发射', () => {
    test('应该在清理完成时发射事件', async () => {
      const mockListener = jest.fn();
      cleanupService.on('cleanupCompleted', mockListener);

      await cleanupService.initialize();
      cleanupService.cleanupLogs = jest.fn().mockResolvedValue({ filesCleaned: 5 });

      await cleanupService.performFullCleanup();

      expect(mockListener).toHaveBeenCalledWith({
        operation: 'logs',
        result: { filesCleaned: 5 },
        cleanedCount: 5,
        timestamp: expect.any(String)
      });
    });

    test('应该在清理错误时发射事件', async () => {
      const mockListener = jest.fn();
      cleanupService.on('cleanupError', mockListener);

      await cleanupService.initialize();
      cleanupService.cleanupLogs = jest.fn().mockRejectedValue(new Error('Cleanup failed'));

      await cleanupService.performFullCleanup();

      expect(mockListener).toHaveBeenCalledWith({
        rule: 'logs',
        error: 'Cleanup failed',
        timestamp: expect.any(Number)
      });
    });
  });
});

describe('CleanupService 错误处理', () => {
  let cleanupService;

  beforeEach(() => {
    cleanupService = new CleanupService();
  });

  test('应该处理文件系统错误', async () => {
    const glob = require('glob');
    glob.mockRejectedValue(new Error('File system error'));

    await expect(cleanupService.cleanupLogs()).rejects.toThrow('File system error');
  });

  test('应该处理glob模块错误', async () => {
    const glob = require('glob');
    glob.mockImplementation(() => {
      throw new Error('Glob error');
    });

    await expect(cleanupService.cleanupTempFiles()).rejects.toThrow('Glob error');
  });

  test('应该处理配置验证错误', () => {
    const service = new CleanupService({
      logMaxAge: 0 // 无效值
    });

    expect(() => service.validateConfig()).toThrow('日志最大年龄必须大于0');
  });
});

describe('CleanupService 性能测试', () => {
  let cleanupService;

  beforeEach(() => {
    cleanupService = new CleanupService();
  });

  test('应该高效处理大量文件', async () => {
    // 创建大量模拟文件
    const mockFiles = Array.from({ length: 1000 }, (_, i) => `logs/file_${i}.log`);
    const mockStats = {
      isFile: () => true,
      mtime: { getTime: () => Date.now() - 10 * 24 * 60 * 60 * 1000 },
      size: 1024
    };

    jest.mocked(fs).stat.mockResolvedValue(mockStats);
    jest.mocked(fs).unlink.mockResolvedValue();

    const glob = require('glob');
    glob.mockResolvedValue(mockFiles);

    const startTime = Date.now();
    const result = await cleanupService.cleanupLogs();
    const endTime = Date.now();

    expect(result.filesCleaned).toBe(1000);
    expect(endTime - startTime).toBeLessThan(1000); // 应该在1秒内完成
  });

  test('应该正确处理内存限制', async () => {
    // 测试内存优化功能
    const originalGlobalGC = global.gc;
    global.gc = jest.fn();

    await cleanupService.optimizeMemory();

    expect(global.gc).toHaveBeenCalled();

    // 恢复原始global.gc
    global.gc = originalGlobalGC;
  });
});