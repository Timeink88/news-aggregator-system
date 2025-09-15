/**
 * Cleanup API Routes
 * 提供系统清理相关的RESTful API端点
 * 遵循REST API最佳实践：安全性、错误处理、性能优化
 */

import { Router } from 'express';
import logger from '../utils/logger.js';

const router = Router();

/**
 * 执行完整清理
 * POST /api/cleanup/full
 */
router.post('/full', async (req, res) => {
  try {
    const {
      dryRun = false,
      confirm = false,
      cleanupTypes = []
    } = req.body;

    // 安全确认
    if (!dryRun && !confirm) {
      return res.status(400).json({
        success: false,
        error: 'CONFIRMATION_REQUIRED',
        message: '执行实际清理需要确认参数。设置 confirm: true 或使用 dryRun: true 进行预览'
      });
    }

    const cleanupService = req.app.get('cleanupService');
    if (!cleanupService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '清理服务暂不可用'
      });
    }

    const options = {
      dryRun,
      confirm,
      cleanupTypes
    };

    const result = await cleanupService.performFullCleanup(options);

    res.json({
      success: true,
      message: dryRun ? '清理预览完成' : '系统清理完成',
      data: {
        summary: result.summary,
        executionTime: result.executionTime,
        dryRun,
        cleanedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('执行系统清理失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '执行系统清理失败'
    });
  }
});

/**
 * 清理过期会话
 * POST /api/cleanup/sessions
 */
router.post('/sessions', async (req, res) => {
  try {
    const {
      maxAge = 7 * 24 * 60 * 60 * 1000, // 7天
      dryRun = false,
      confirm = false
    } = req.body;

    if (!dryRun && !confirm) {
      return res.status(400).json({
        success: false,
        error: 'CONFIRMATION_REQUIRED',
        message: '执行实际清理需要确认参数'
      });
    }

    const cleanupService = req.app.get('cleanupService');
    if (!cleanupService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '清理服务暂不可用'
      });
    }

    const result = await cleanupService.cleanupExpiredSessions({
      maxAge,
      dryRun,
      confirm
    });

    res.json({
      success: true,
      message: dryRun ? '会话清理预览完成' : '会话清理完成',
      data: {
        cleanedSessions: result.cleanedSessions,
        affectedUsers: result.affectedUsers,
        executionTime: result.executionTime,
        dryRun,
        cleanedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('清理过期会话失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '清理过期会话失败'
    });
  }
});

/**
 * 清理失败任务
 * POST /api/cleanup/failed-tasks
 */
router.post('/failed-tasks', async (req, res) => {
  try {
    const {
      maxAge = 3 * 24 * 60 * 60 * 1000, // 3天
      dryRun = false,
      confirm = false
    } = req.body;

    if (!dryRun && !confirm) {
      return res.status(400).json({
        success: false,
        error: 'CONFIRMATION_REQUIRED',
        message: '执行实际清理需要确认参数'
      });
    }

    const cleanupService = req.app.get('cleanupService');
    if (!cleanupService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '清理服务暂不可用'
      });
    }

    const result = await cleanupService.cleanupFailedTasks({
      maxAge,
      dryRun,
      confirm
    });

    res.json({
      success: true,
      message: dryRun ? '失败任务清理预览完成' : '失败任务清理完成',
      data: {
        cleanedTasks: result.cleanedTasks,
        executionTime: result.executionTime,
        dryRun,
        cleanedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('清理失败任务失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '清理失败任务失败'
    });
  }
});

/**
 * 清理旧文章
 * POST /api/cleanup/old-articles
 */
router.post('/old-articles', async (req, res) => {
  try {
    const {
      maxAge = 30 * 24 * 60 * 60 * 1000, // 30天
      keepArticlesPerSource = 100,
      dryRun = false,
      confirm = false
    } = req.body;

    if (!dryRun && !confirm) {
      return res.status(400).json({
        success: false,
        error: 'CONFIRMATION_REQUIRED',
        message: '执行实际清理需要确认参数'
      });
    }

    const cleanupService = req.app.get('cleanupService');
    if (!cleanupService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '清理服务暂不可用'
      });
    }

    const result = await cleanupService.cleanupOldArticles({
      maxAge,
      keepArticlesPerSource,
      dryRun,
      confirm
    });

    res.json({
      success: true,
      message: dryRun ? '旧文章清理预览完成' : '旧文章清理完成',
      data: {
        cleanedArticles: result.cleanedArticles,
        affectedSources: result.affectedSources,
        freedSpace: result.freedSpace,
        executionTime: result.executionTime,
        dryRun,
        cleanedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('清理旧文章失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '清理旧文章失败'
    });
  }
});

/**
 * 清理日志文件
 * POST /api/cleanup/logs
 */
router.post('/logs', async (req, res) => {
  try {
    const {
      maxAge = 7 * 24 * 60 * 60 * 1000, // 7天
      maxSize = 100 * 1024 * 1024, // 100MB
      dryRun = false,
      confirm = false
    } = req.body;

    if (!dryRun && !confirm) {
      return res.status(400).json({
        success: false,
        error: 'CONFIRMATION_REQUIRED',
        message: '执行实际清理需要确认参数'
      });
    }

    const cleanupService = req.app.get('cleanupService');
    if (!cleanupService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '清理服务暂不可用'
      });
    }

    const result = await cleanupService.cleanupLogs({
      maxAge,
      maxSize,
      dryRun,
      confirm
    });

    res.json({
      success: true,
      message: dryRun ? '日志清理预览完成' : '日志清理完成',
      data: {
        cleanedFiles: result.cleanedFiles,
        freedSpace: result.freedSpace,
        executionTime: result.executionTime,
        dryRun,
        cleanedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('清理日志文件失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '清理日志文件失败'
    });
  }
});

/**
 * 清理缓存
 * POST /api/cleanup/cache
 */
router.post('/cache', async (req, res) => {
  try {
    const {
      cacheTypes = ['memory', 'disk'],
      dryRun = false,
      confirm = false
    } = req.body;

    if (!dryRun && !confirm) {
      return res.status(400).json({
        success: false,
        error: 'CONFIRMATION_REQUIRED',
        message: '执行实际清理需要确认参数'
      });
    }

    const cleanupService = req.app.get('cleanupService');
    if (!cleanupService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '清理服务暂不可用'
      });
    }

    const result = await cleanupService.cleanupCache({
      cacheTypes,
      dryRun,
      confirm
    });

    res.json({
      success: true,
      message: dryRun ? '缓存清理预览完成' : '缓存清理完成',
      data: {
        cleanedCacheTypes: result.cleanedCacheTypes,
        freedMemory: result.freedMemory,
        freedDiskSpace: result.freedDiskSpace,
        executionTime: result.executionTime,
        dryRun,
        cleanedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('清理缓存失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '清理缓存失败'
    });
  }
});

/**
 * 清理临时文件
 * POST /api/cleanup/temp-files
 */
router.post('/temp-files', async (req, res) => {
  try {
    const {
      maxAge = 24 * 60 * 60 * 1000, // 24小时
      directories = [],
      dryRun = false,
      confirm = false
    } = req.body;

    if (!dryRun && !confirm) {
      return res.status(400).json({
        success: false,
        error: 'CONFIRMATION_REQUIRED',
        message: '执行实际清理需要确认参数'
      });
    }

    const cleanupService = req.app.get('cleanupService');
    if (!cleanupService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '清理服务暂不可用'
      });
    }

    const result = await cleanupService.cleanupTempFiles({
      maxAge,
      directories,
      dryRun,
      confirm
    });

    res.json({
      success: true,
      message: dryRun ? '临时文件清理预览完成' : '临时文件清理完成',
      data: {
        cleanedFiles: result.cleanedFiles,
        freedSpace: result.freedSpace,
        directories: result.directories,
        executionTime: result.executionTime,
        dryRun,
        cleanedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('清理临时文件失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '清理临时文件失败'
    });
  }
});

/**
 * 优化数据库
 * POST /api/cleanup/database/optimize
 */
router.post('/database/optimize', async (req, res) => {
  try {
    const {
      analyze = true,
      vacuum = true,
      reindex = false,
      dryRun = false,
      confirm = false
    } = req.body;

    if (!dryRun && !confirm) {
      return res.status(400).json({
        success: false,
        error: 'CONFIRMATION_REQUIRED',
        message: '执行数据库优化需要确认参数'
      });
    }

    const cleanupService = req.app.get('cleanupService');
    if (!cleanupService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '清理服务暂不可用'
      });
    }

    const result = await cleanupService.optimizeDatabase({
      analyze,
      vacuum,
      reindex,
      dryRun,
      confirm
    });

    res.json({
      success: true,
      message: dryRun ? '数据库优化预览完成' : '数据库优化完成',
      data: {
        operations: result.operations,
        performanceImprovement: result.performanceImprovement,
        executionTime: result.executionTime,
        dryRun,
        optimizedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('优化数据库失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '优化数据库失败'
    });
  }
});

/**
 * 获取磁盘使用情况
 * GET /api/cleanup/disk-usage
 */
router.get('/disk-usage', async (req, res) => {
  try {
    const { path } = req.query;

    const cleanupService = req.app.get('cleanupService');
    if (!cleanupService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '清理服务暂不可用'
      });
    }

    const diskUsage = await cleanupService.getDiskUsage(path);

    res.json({
      success: true,
      message: '获取磁盘使用情况成功',
      data: {
        diskUsage,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('获取磁盘使用情况失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取磁盘使用情况失败'
    });
  }
});

/**
 * 获取清理统计信息
 * GET /api/cleanup/statistics
 */
router.get('/statistics', async (req, res) => {
  try {
    const { timeframe = '24h' } = req.query;

    const cleanupService = req.app.get('cleanupService');
    if (!cleanupService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '清理服务暂不可用'
      });
    }

    const statistics = await cleanupService.getStatistics({ timeframe });

    res.json({
      success: true,
      message: '获取清理统计成功',
      data: {
        statistics,
        timeframe
      }
    });

  } catch (error) {
    logger.error('获取清理统计失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取清理统计失败'
    });
  }
});

/**
 * 获取清理历史
 * GET /api/cleanup/history
 */
router.get('/history', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      type,
      status,
      startDate,
      endDate
    } = req.query;

    const cleanupService = req.app.get('cleanupService');
    if (!cleanupService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '清理服务暂不可用'
      });
    }

    const options = {
      page: Math.max(1, parseInt(page)),
      limit: Math.min(100, Math.max(1, parseInt(limit))),
      type,
      status,
      startDate,
      endDate
    };

    const history = await cleanupService.getCleanupHistory(options);

    res.json({
      success: true,
      message: '获取清理历史成功',
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
    logger.error('获取清理历史失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取清理历史失败'
    });
  }
});

/**
 * 获取清理建议
 * GET /api/cleanup/recommendations
 */
router.get('/recommendations', async (req, res) => {
  try {
    const cleanupService = req.app.get('cleanupService');
    if (!cleanupService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '清理服务暂不可用'
      });
    }

    const recommendations = await cleanupService.getCleanupRecommendations();

    res.json({
      success: true,
      message: '获取清理建议成功',
      data: {
        recommendations,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('获取清理建议失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取清理建议失败'
    });
  }
});

/**
 * 配置清理计划
 * PUT /api/cleanup/schedule
 */
router.put('/schedule', async (req, res) => {
  try {
    const {
      enabled,
      schedule, // cron表达式
      cleanupTypes,
      maxAge,
      autoConfirm = false
    } = req.body;

    const cleanupService = req.app.get('cleanupService');
    if (!cleanupService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '清理服务暂不可用'
      });
    }

    const result = await cleanupService.configureSchedule({
      enabled,
      schedule,
      cleanupTypes,
      maxAge,
      autoConfirm
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'SCHEDULE_CONFIG_FAILED',
        message: result.message || '配置清理计划失败'
      });
    }

    res.json({
      success: true,
      message: '清理计划配置成功',
      data: {
        schedule: result.schedule,
        configuredAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('配置清理计划失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '配置清理计划失败'
    });
  }
});

/**
 * 获取清理计划状态
 * GET /api/cleanup/schedule/status
 */
router.get('/schedule/status', async (req, res) => {
  try {
    const cleanupService = req.app.get('cleanupService');
    if (!cleanupService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '清理服务暂不可用'
      });
    }

    const scheduleStatus = await cleanupService.getScheduleStatus();

    res.json({
      success: true,
      message: '获取清理计划状态成功',
      data: scheduleStatus
    });

  } catch (error) {
    logger.error('获取清理计划状态失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取清理计划状态失败'
    });
  }
});

/**
 * 立即执行计划清理
 * POST /api/cleanup/schedule/run-now
 */
router.post('/schedule/run-now', async (req, res) => {
  try {
    const cleanupService = req.app.get('cleanupService');
    if (!cleanupService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '清理服务暂不可用'
      });
    }

    const result = await cleanupService.runScheduledCleanup();

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'SCHEDULED_CLEANUP_FAILED',
        message: result.message || '执行计划清理失败'
      });
    }

    res.json({
      success: true,
      message: '计划清理执行成功',
      data: {
        executionId: result.executionId,
        summary: result.summary,
        executedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('执行计划清理失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '执行计划清理失败'
    });
  }
});

export default router;