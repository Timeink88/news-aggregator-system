/**
 * Scheduler服务测试 - 任务调度功能测试
 * 遵循Jest最佳实践：模块化、覆盖率、边界测试
 */

// Mock Supabase客户端
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn()
        }))
      })),
      update: jest.fn(() => ({
        eq: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn()
          }))
        }))
      })),
      delete: jest.fn(() => ({
        eq: jest.fn()
      })),
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn()
        })),
        gte: jest.fn(() => ({
          lte: jest.fn(() => ({
            head: jest.fn(() => ({
              count: 'exact'
            }))
          }))
        })),
        head: jest.fn(() => ({
          count: 'exact'
        }))
      })),
      rpc: jest.fn()
    }))
  }))
}));

// Mock node-cron
jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({
    start: jest.fn(),
    stop: jest.fn()
  }))
}));

// 动态导入ES模块
let SchedulerService, JOB_STATUS, JOB_PRIORITY;

describe('SchedulerService', () => {
  let scheduler;
  let mockSupabase;

  beforeAll(async () => {
    // 动态导入ES模块
    const module = await import('../index.js');
    SchedulerService = module.default;
    JOB_STATUS = module.JOB_STATUS;
    JOB_PRIORITY = module.JOB_PRIORITY;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    const { createClient } = require('@supabase/supabase-js');
    mockSupabase = createClient();
    scheduler = new SchedulerService();
  });

  describe('构造函数', () => {
    test('应该正确初始化调度器', () => {
      expect(scheduler.jobs).toBeInstanceOf(Map);
      expect(scheduler.runningJobs).toBeInstanceOf(Set);
      expect(scheduler.scheduledJobs).toBeInstanceOf(Map);
      expect(scheduler.taskHandlers).toBeInstanceOf(Map);
      expect(scheduler.cronJobs).toBeInstanceOf(Map);
      expect(scheduler.isRunning).toBe(false);
      expect(scheduler.jobQueue).toEqual([]);
      expect(scheduler.concurrency).toBe(0);
    });
  });

  describe('任务管理', () => {
    test('应该能够添加任务到队列', async () => {
      const jobOptions = {
        name: '测试任务',
        type: 'test_job',
        priority: JOB_PRIORITY.HIGH,
        payload: { test: 'data' }
      };

      mockSupabase.from.mockReturnValue({
        insert: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn(() => ({
              data: { id: 'test-job-id', ...jobOptions },
              error: null
            }))
          }))
        }))
      });

      const result = await scheduler.addJob(jobOptions);

      expect(result.success).toBe(true);
      expect(result.job.id).toBe('test-job-id');
      expect(scheduler.jobs.has('test-job-id')).toBe(true);
      expect(scheduler.jobQueue.length).toBe(1);
    });

    test('应该能够取消任务', async () => {
      const jobId = 'test-job-id';
      const job = {
        id: jobId,
        name: '测试任务',
        type: 'test_job',
        status: JOB_STATUS.PENDING,
        cancel: jest.fn()
      };

      scheduler.jobs.set(jobId, job);
      scheduler.runningJobs.add(jobId);

      mockSupabase.from.mockReturnValue({
        update: jest.fn(() => ({ eq: jest.fn() }))
      });

      const result = await scheduler.cancelJob(jobId);

      expect(result.success).toBe(true);
      expect(job.cancel).toHaveBeenCalled();
      expect(scheduler.runningJobs.has(jobId)).toBe(false);
    });

    test('应该能够获取任务状态', async () => {
      const jobId = 'test-job-id';
      const jobData = {
        id: jobId,
        name: '测试任务',
        status: JOB_STATUS.RUNNING
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => ({
              data: jobData,
              error: null
            }))
          }))
        }))
      });

      const result = await scheduler.getJobStatus(jobId);

      expect(result).toEqual(jobData);
    });
  });

  describe('任务队列管理', () => {
    test('应该按优先级插入任务', () => {
      const lowPriorityJob = {
        id: 'low-priority',
        name: '低优先级任务',
        priority: JOB_PRIORITY.LOW
      };

      const highPriorityJob = {
        id: 'high-priority',
        name: '高优先级任务',
        priority: JOB_PRIORITY.HIGH
      };

      // 先添加低优先级任务
      scheduler.addToQueue(lowPriorityJob);
      expect(scheduler.jobQueue[0]).toBe(lowPriorityJob);

      // 再添加高优先级任务，应该插入到队列前面
      scheduler.addToQueue(highPriorityJob);
      expect(scheduler.jobQueue[0]).toBe(highPriorityJob);
      expect(scheduler.jobQueue[1]).toBe(lowPriorityJob);
    });

    test('应该能够获取队列状态', () => {
      scheduler.jobQueue = [
        { id: 'job1', priority: JOB_PRIORITY.HIGH },
        { id: 'job2', priority: JOB_PRIORITY.NORMAL }
      ];
      scheduler.runningJobs.add('job1');
      scheduler.isRunning = true;

      const status = scheduler.getQueueStatus();

      expect(status.queueLength).toBe(2);
      expect(status.runningJobs).toBe(1);
      expect(status.isRunning).toBe(true);
    });
  });

  describe('任务执行', () => {
    test('应该能够执行任务', async () => {
      const job = {
        id: 'test-job',
        name: '测试任务',
        type: 'test_job',
        priority: JOB_PRIORITY.NORMAL,
        payload: { test: 'data' },
        start: jest.fn(),
        complete: jest.fn(),
        fail: jest.fn(),
        canRetry: jest.fn(() => false),
        timeout: 30000
      };

      // 注册任务处理器
      const mockHandler = jest.fn().mockResolvedValue({ success: true });
      scheduler.taskHandlers.set('test_job', mockHandler);

      // Mock数据库更新
      mockSupabase.from.mockReturnValue({
        update: jest.fn(() => ({ eq: jest.fn() }))
      });

      await scheduler.executeJob(job);

      expect(job.start).toHaveBeenCalled();
      expect(mockHandler).toHaveBeenCalledWith(job);
      expect(job.complete).toHaveBeenCalledWith({ success: true });
    });

    test('应该处理任务执行失败', async () => {
      const job = {
        id: 'test-job',
        name: '测试任务',
        type: 'test_job',
        priority: JOB_PRIORITY.NORMAL,
        payload: { test: 'data' },
        start: jest.fn(),
        fail: jest.fn(),
        canRetry: jest.fn(() => false),
        timeout: 30000
      };

      // 注册失败的任务处理器
      const mockHandler = jest.fn().mockRejectedValue(new Error('执行失败'));
      scheduler.taskHandlers.set('test_job', mockHandler);

      // Mock数据库更新
      mockSupabase.from.mockReturnValue({
        update: jest.fn(() => ({ eq: jest.fn() }))
      });

      await scheduler.executeJob(job);

      expect(job.start).toHaveBeenCalled();
      expect(mockHandler).toHaveBeenCalledWith(job);
      expect(job.fail).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('调度器生命周期', () => {
    test('应该能够启动调度器', async () => {
      // Mock定时任务注册
      const mockCronJob = {
        start: jest.fn(),
        stop: jest.fn()
      };

      const mockCron = require('node-cron');
      mockCron.schedule.mockReturnValue(mockCronJob);

      const result = await scheduler.start();

      expect(result.success).toBe(true);
      expect(scheduler.isRunning).toBe(true);
      expect(mockCronJob.start).toHaveBeenCalled();
    });

    test('应该能够停止调度器', async () => {
      // 设置一个运行中的定时任务
      const mockCronJob = {
        start: jest.fn(),
        stop: jest.fn()
      };
      scheduler.cronJobs.set('test-job', mockCronJob);
      scheduler.isRunning = true;

      const result = await scheduler.stop();

      expect(result.success).toBe(true);
      expect(scheduler.isRunning).toBe(false);
      expect(mockCronJob.stop).toHaveBeenCalled();
    });
  });

  describe('错误处理', () => {
    test('应该处理添加任务失败', async () => {
      const jobOptions = {
        name: '测试任务',
        type: 'test_job'
      };

      mockSupabase.from.mockReturnValue({
        insert: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn(() => ({
              data: null,
              error: { message: '数据库错误' }
            }))
          }))
        }))
      });

      const result = await scheduler.addJob(jobOptions);

      expect(result.success).toBe(false);
      expect(result.error).toBe('数据库错误');
    });
  });

  describe('任务处理器注册', () => {
    test('应该注册所有任务处理器', () => {
      scheduler.registerTaskHandlers();

      expect(scheduler.taskHandlers.has('rss_check')).toBe(true);
      expect(scheduler.taskHandlers.has('ai_analysis')).toBe(true);
      expect(scheduler.taskHandlers.has('email_send')).toBe(true);
      expect(scheduler.taskHandlers.has('cleanup')).toBe(true);
      expect(scheduler.taskHandlers.has('health_check')).toBe(true);
      expect(scheduler.taskHandlers.has('statistics_report')).toBe(true);
      expect(scheduler.taskHandlers.has('index_optimization')).toBe(true);
      expect(scheduler.taskHandlers.has('backup')).toBe(true);
    });
  });
});