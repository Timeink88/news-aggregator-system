/**
 * Scheduler API Routes
 * 提供任务调度相关的RESTful API端点
 * 遵循REST API最佳实践：安全性、错误处理、性能优化
 */

import { Router } from 'express';
import logger from '../utils/logger.js';

const router = Router();

/**
 * 获取所有任务
 * GET /api/scheduler/tasks
 */
router.get('/tasks', async (req, res) => {
  try {
    const { includeDisabled = false, category, page = 1, limit = 20 } = req.query;

    const schedulerService = req.app.get('schedulerService');
    if (!schedulerService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '任务调度服务暂不可用'
      });
    }

    const options = {
      includeDisabled: includeDisabled === 'true',
      category,
      page: Math.max(1, parseInt(page)),
      limit: Math.min(100, Math.max(1, parseInt(limit)))
    };

    const result = await schedulerService.getTasks(options);

    res.json({
      success: true,
      message: '获取任务列表成功',
      data: {
        tasks: result.tasks || [],
        pagination: result.pagination || {
          page: options.page,
          limit: options.limit,
          total: result.total || 0
        }
      }
    });

  } catch (error) {
    logger.error('获取任务列表失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取任务列表失败'
    });
  }
});

/**
 * 获取单个任务
 * GET /api/scheduler/tasks/:id
 */
router.get('/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ID',
        message: '请提供有效的任务ID'
      });
    }

    const schedulerService = req.app.get('schedulerService');
    if (!schedulerService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '任务调度服务暂不可用'
      });
    }

    const task = await schedulerService.getTaskById(id);

    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'TASK_NOT_FOUND',
        message: '任务未找到'
      });
    }

    res.json({
      success: true,
      message: '获取任务成功',
      data: task
    });

  } catch (error) {
    logger.error('获取任务失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取任务失败'
    });
  }
});

/**
 * 注册新任务
 * POST /api/scheduler/tasks
 */
router.post('/tasks', async (req, res) => {
  try {
    const {
      id,
      name,
      description,
      schedule,
      handler,
      enabled = true,
      tags = [],
      priority = 'medium',
      concurrent = false,
      maxRetries = 3,
      timeout = 30000
    } = req.body;

    // 验证必填字段
    if (!id || !name || !schedule || !handler) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        message: '任务ID、名称、调度计划和处理器为必填字段'
      });
    }

    // 验证调度计划格式
    const cronRegex = /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|([0-6])|\*\/([0-6]))$/;
    if (!cronRegex.test(schedule)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_SCHEDULE',
        message: '请提供有效的Cron调度计划'
      });
    }

    // 验证优先级
    const validPriorities = ['low', 'medium', 'high', 'critical'];
    if (!validPriorities.includes(priority)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PRIORITY',
        message: '请选择有效的优先级'
      });
    }

    const schedulerService = req.app.get('schedulerService');
    if (!schedulerService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '任务调度服务暂不可用'
      });
    }

    const taskData = {
      id: id.trim(),
      name: name.trim(),
      description: description ? description.trim() : '',
      schedule,
      handler,
      enabled,
      tags,
      priority,
      concurrent,
      maxRetries: Math.max(0, parseInt(maxRetries)),
      timeout: Math.max(1000, parseInt(timeout))
    };

    const result = await schedulerService.registerTask(taskData);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'TASK_REGISTER_FAILED',
        message: result.message || '注册任务失败'
      });
    }

    res.status(201).json({
      success: true,
      message: '任务注册成功',
      data: result.task
    });

  } catch (error) {
    logger.error('注册任务失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '注册任务失败'
    });
  }
});

/**
 * 更新任务
 * PUT /api/scheduler/tasks/:id
 */
router.put('/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      schedule,
      enabled,
      tags,
      priority,
      concurrent,
      maxRetries,
      timeout
    } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ID',
        message: '请提供有效的任务ID'
      });
    }

    const schedulerService = req.app.get('schedulerService');
    if (!schedulerService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '任务调度服务暂不可用'
      });
    }

    // 验证任务是否存在
    const existingTask = await schedulerService.getTaskById(id);
    if (!existingTask) {
      return res.status(404).json({
        success: false,
        error: 'TASK_NOT_FOUND',
        message: '任务未找到'
      });
    }

    // 构建更新数据
    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (schedule !== undefined) {
      const cronRegex = /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|([0-6])|\*\/([0-6]))$/;
      if (!cronRegex.test(schedule)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_SCHEDULE',
          message: '请提供有效的Cron调度计划'
        });
      }
      updateData.schedule = schedule;
    }
    if (enabled !== undefined) updateData.enabled = Boolean(enabled);
    if (tags !== undefined) updateData.tags = tags;
    if (priority !== undefined) {
      const validPriorities = ['low', 'medium', 'high', 'critical'];
      if (!validPriorities.includes(priority)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_PRIORITY',
          message: '请选择有效的优先级'
        });
      }
      updateData.priority = priority;
    }
    if (concurrent !== undefined) updateData.concurrent = Boolean(concurrent);
    if (maxRetries !== undefined) updateData.maxRetries = Math.max(0, parseInt(maxRetries));
    if (timeout !== undefined) updateData.timeout = Math.max(1000, parseInt(timeout));

    const result = await schedulerService.updateTask(id, updateData);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'TASK_UPDATE_FAILED',
        message: result.message || '更新任务失败'
      });
    }

    res.json({
      success: true,
      message: '任务更新成功',
      data: result.task
    });

  } catch (error) {
    logger.error('更新任务失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '更新任务失败'
    });
  }
});

/**
 * 删除任务
 * DELETE /api/scheduler/tasks/:id
 */
router.delete('/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ID',
        message: '请提供有效的任务ID'
      });
    }

    const schedulerService = req.app.get('schedulerService');
    if (!schedulerService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '任务调度服务暂不可用'
      });
    }

    // 验证任务是否存在
    const existingTask = await schedulerService.getTaskById(id);
    if (!existingTask) {
      return res.status(404).json({
        success: false,
        error: 'TASK_NOT_FOUND',
        message: '任务未找到'
      });
    }

    const result = await schedulerService.unregisterTask(id);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'TASK_DELETE_FAILED',
        message: result.message || '删除任务失败'
      });
    }

    res.json({
      success: true,
      message: '任务删除成功'
    });

  } catch (error) {
    logger.error('删除任务失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '删除任务失败'
    });
  }
});

/**
 * 启用任务
 * POST /api/scheduler/tasks/:id/enable
 */
router.post('/tasks/:id/enable', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ID',
        message: '请提供有效的任务ID'
      });
    }

    const schedulerService = req.app.get('schedulerService');
    if (!schedulerService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '任务调度服务暂不可用'
      });
    }

    const result = await schedulerService.enableTask(id);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'TASK_ENABLE_FAILED',
        message: result.message || '启用任务失败'
      });
    }

    res.json({
      success: true,
      message: '任务启用成功',
      data: result.task
    });

  } catch (error) {
    logger.error('启用任务失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '启用任务失败'
    });
  }
});

/**
 * 禁用任务
 * POST /api/scheduler/tasks/:id/disable
 */
router.post('/tasks/:id/disable', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ID',
        message: '请提供有效的任务ID'
      });
    }

    const schedulerService = req.app.get('schedulerService');
    if (!schedulerService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '任务调度服务暂不可用'
      });
    }

    const result = await schedulerService.disableTask(id);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'TASK_DISABLE_FAILED',
        message: result.message || '禁用任务失败'
      });
    }

    res.json({
      success: true,
      message: '任务禁用成功',
      data: result.task
    });

  } catch (error) {
    logger.error('禁用任务失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '禁用任务失败'
    });
  }
});

/**
 * 执行任务
 * POST /api/scheduler/tasks/:id/execute
 */
router.post('/tasks/:id/execute', async (req, res) => {
  try {
    const { id } = req.params;
    const { parameters = {} } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ID',
        message: '请提供有效的任务ID'
      });
    }

    const schedulerService = req.app.get('schedulerService');
    if (!schedulerService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '任务调度服务暂不可用'
      });
    }

    const result = await schedulerService.executeTask(id, parameters);

    res.json({
      success: result.success,
      message: result.success ? '任务执行成功' : '任务执行失败',
      data: result.success ? {
        executionId: result.executionId,
        result: result.result,
        executionTime: result.executionTime,
        executedAt: new Date().toISOString()
      } : {
        error: result.error
      }
    });

  } catch (error) {
    logger.error('执行任务失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '执行任务失败'
    });
  }
});

/**
 * 获取任务执行历史
 * GET /api/scheduler/tasks/:id/history
 */
router.get('/tasks/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20, status, startDate, endDate } = req.query;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ID',
        message: '请提供有效的任务ID'
      });
    }

    const schedulerService = req.app.get('schedulerService');
    if (!schedulerService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '任务调度服务暂不可用'
      });
    }

    const options = {
      page: Math.max(1, parseInt(page)),
      limit: Math.min(100, Math.max(1, parseInt(limit))),
      status,
      startDate,
      endDate
    };

    const history = await schedulerService.getTaskHistory(id, options);

    res.json({
      success: true,
      message: '获取任务执行历史成功',
      data: {
        history: history.history || [],
        pagination: history.pagination || {
          page: options.page,
          limit: options.limit,
          total: history.total || 0
        }
      }
    });

  } catch (error) {
    logger.error('获取任务执行历史失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取任务执行历史失败'
    });
  }
});

/**
 * 获取任务状态
 * GET /api/scheduler/tasks/:id/status
 */
router.get('/tasks/:id/status', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ID',
        message: '请提供有效的任务ID'
      });
    }

    const schedulerService = req.app.get('schedulerService');
    if (!schedulerService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '任务调度服务暂不可用'
      });
    }

    const status = await schedulerService.getTaskStatus(id);

    if (!status) {
      return res.status(404).json({
        success: false,
        error: 'TASK_NOT_FOUND',
        message: '任务未找到'
      });
    }

    res.json({
      success: true,
      message: '获取任务状态成功',
      data: status
    });

  } catch (error) {
    logger.error('获取任务状态失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取任务状态失败'
    });
  }
});

/**
 * 获取调度器状态
 * GET /api/scheduler/status
 */
router.get('/status', async (req, res) => {
  try {
    const schedulerService = req.app.get('schedulerService');
    if (!schedulerService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '任务调度服务暂不可用'
      });
    }

    const status = await schedulerService.getStatus();

    res.json({
      success: true,
      message: '获取调度器状态成功',
      data: {
        status,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('获取调度器状态失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取调度器状态失败'
    });
  }
});

/**
 * 获取调度器统计信息
 * GET /api/scheduler/statistics
 */
router.get('/statistics', async (req, res) => {
  try {
    const { timeframe = '24h' } = req.query;

    const schedulerService = req.app.get('schedulerService');
    if (!schedulerService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '任务调度服务暂不可用'
      });
    }

    const statistics = await schedulerService.getStatistics({ timeframe });

    res.json({
      success: true,
      message: '获取调度器统计成功',
      data: {
        statistics,
        timeframe
      }
    });

  } catch (error) {
    logger.error('获取调度器统计失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取调度器统计失败'
    });
  }
});

/**
 * 启动调度器
 * POST /api/scheduler/start
 */
router.post('/start', async (req, res) => {
  try {
    const schedulerService = req.app.get('schedulerService');
    if (!schedulerService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '任务调度服务暂不可用'
      });
    }

    const result = await schedulerService.start();

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'SCHEDULER_START_FAILED',
        message: result.message || '启动调度器失败'
      });
    }

    res.json({
      success: true,
      message: '调度器启动成功',
      data: {
        startedAt: new Date().toISOString(),
        enabledTasks: result.enabledTasks || 0
      }
    });

  } catch (error) {
    logger.error('启动调度器失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '启动调度器失败'
    });
  }
});

/**
 * 停止调度器
 * POST /api/scheduler/stop
 */
router.post('/stop', async (req, res) => {
  try {
    const schedulerService = req.app.get('schedulerService');
    if (!schedulerService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '任务调度服务暂不可用'
      });
    }

    const result = await schedulerService.stop();

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'SCHEDULER_STOP_FAILED',
        message: result.message || '停止调度器失败'
      });
    }

    res.json({
      success: true,
      message: '调度器停止成功',
      data: {
        stoppedAt: new Date().toISOString(),
        runningTasks: result.runningTasks || 0
      }
    });

  } catch (error) {
    logger.error('停止调度器失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '停止调度器失败'
    });
  }
});

/**
 * 重启调度器
 * POST /api/scheduler/restart
 */
router.post('/restart', async (req, res) => {
  try {
    const schedulerService = req.app.get('schedulerService');
    if (!schedulerService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '任务调度服务暂不可用'
      });
    }

    const result = await schedulerService.restart();

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'SCHEDULER_RESTART_FAILED',
        message: result.message || '重启调度器失败'
      });
    }

    res.json({
      success: true,
      message: '调度器重启成功',
      data: {
        restartedAt: new Date().toISOString(),
        enabledTasks: result.enabledTasks || 0
      }
    });

  } catch (error) {
    logger.error('重启调度器失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '重启调度器失败'
    });
  }
});

/**
 * 获取运行中的任务
 * GET /api/scheduler/running-tasks
 */
router.get('/running-tasks', async (req, res) => {
  try {
    const schedulerService = req.app.get('schedulerService');
    if (!schedulerService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '任务调度服务暂不可用'
      });
    }

    const runningTasks = await schedulerService.getRunningTasks();

    res.json({
      success: true,
      message: '获取运行中任务成功',
      data: {
        runningTasks,
        count: runningTasks.length
      }
    });

  } catch (error) {
    logger.error('获取运行中任务失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取运行中任务失败'
    });
  }
});

/**
 * 取消运行中的任务
 * POST /api/scheduler/running-tasks/:executionId/cancel
 */
router.post('/running-tasks/:executionId/cancel', async (req, res) => {
  try {
    const { executionId } = req.params;

    if (!executionId) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_EXECUTION_ID',
        message: '请提供有效的执行ID'
      });
    }

    const schedulerService = req.app.get('schedulerService');
    if (!schedulerService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '任务调度服务暂不可用'
      });
    }

    const result = await schedulerService.cancelRunningTask(executionId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'TASK_CANCEL_FAILED',
        message: result.message || '取消任务失败'
      });
    }

    res.json({
      success: true,
      message: '任务取消成功',
      data: {
        executionId,
        cancelledAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('取消任务失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '取消任务失败'
    });
  }
});

export default router;