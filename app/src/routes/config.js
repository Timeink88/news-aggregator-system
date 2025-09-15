/**
 * Config API Routes
 * 提供配置管理相关的RESTful API端点
 * 遵循REST API最佳实践：安全性、错误处理、性能优化
 */

import { Router } from 'express';
import logger from '../utils/logger.js';

const router = Router();

/**
 * 获取所有配置
 * GET /api/config
 */
router.get('/', async (req, res) => {
  try {
    const { includeSensitive = false } = req.query;

    const configService = req.app.get('configService');
    if (!configService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '配置服务暂不可用'
      });
    }

    const config = await configService.getAll({ includeSensitive: includeSensitive === 'true' });

    res.json({
      success: true,
      message: '获取配置成功',
      data: {
        config,
        includeSensitive: includeSensitive === 'true',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('获取配置失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取配置失败'
    });
  }
});

/**
 * 获取特定配置
 * GET /api/config/:key
 */
router.get('/:key', async (req, res) => {
  try {
    const { key } = req.params;

    if (!key) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_KEY',
        message: '请提供有效的配置键'
      });
    }

    const configService = req.app.get('configService');
    if (!configService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '配置服务暂不可用'
      });
    }

    const value = await configService.get(key);

    res.json({
      success: true,
      message: '获取配置成功',
      data: {
        key,
        value,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('获取配置失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取配置失败'
    });
  }
});

/**
 * 设置配置
 * PUT /api/config/:key
 */
router.put('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { value, type, description } = req.body;

    if (!key || value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PARAMETERS',
        message: '配置键和值不能为空'
      });
    }

    const configService = req.app.get('configService');
    if (!configService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '配置服务暂不可用'
      });
    }

    const result = await configService.set(key, value, type, description);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'CONFIG_SET_FAILED',
        message: result.message || '设置配置失败'
      });
    }

    res.json({
      success: true,
      message: '配置设置成功',
      data: {
        key,
        value: result.value,
        type: result.type,
        description: result.description,
        updatedAt: result.updatedAt
      }
    });

  } catch (error) {
    logger.error('设置配置失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '设置配置失败'
    });
  }
});

/**
 * 批量设置配置
 * PUT /api/config
 */
router.put('/', async (req, res) => {
  try {
    const { configs } = req.body;

    if (!configs || !Array.isArray(configs) || configs.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_CONFIGS',
        message: '请提供有效的配置数组'
      });
    }

    if (configs.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'TOO_MANY_CONFIGS',
        message: '批量设置的配置数量不能超过50个'
      });
    }

    // 验证配置数据
    for (const config of configs) {
      if (!config.key || config.value === undefined) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_CONFIG',
          message: '每个配置都必须包含键和值'
        });
      }
    }

    const configService = req.app.get('configService');
    if (!configService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '配置服务暂不可用'
      });
    }

    const results = await configService.setMultiple(configs);

    res.json({
      success: true,
      message: '批量设置配置完成',
      data: {
        totalConfigs: configs.length,
        successfulSets: results.filter(r => r.success).length,
        failedSets: results.filter(r => !r.success).length,
        results,
        executionTime: results.reduce((sum, r) => sum + (r.executionTime || 0), 0)
      }
    });

  } catch (error) {
    logger.error('批量设置配置失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '批量设置配置失败'
    });
  }
});

/**
 * 删除配置
 * DELETE /api/config/:key
 */
router.delete('/:key', async (req, res) => {
  try {
    const { key } = req.params;

    if (!key) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_KEY',
        message: '请提供有效的配置键'
      });
    }

    const configService = req.app.get('configService');
    if (!configService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '配置服务暂不可用'
      });
    }

    const result = await configService.delete(key);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'CONFIG_DELETE_FAILED',
        message: result.message || '删除配置失败'
      });
    }

    res.json({
      success: true,
      message: '配置删除成功',
      data: {
        key,
        deletedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('删除配置失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '删除配置失败'
    });
  }
});

/**
 * 验证配置
 * POST /api/config/validate
 */
router.post('/validate', async (req, res) => {
  try {
    const { key, value, schema } = req.body;

    if (!key || value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PARAMETERS',
        message: '配置键和值不能为空'
      });
    }

    const configService = req.app.get('configService');
    if (!configService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '配置服务暂不可用'
      });
    }

    const result = await configService.validate(key, value, schema);

    res.json({
      success: true,
      message: '配置验证完成',
      data: {
        key,
        value,
        isValid: result.isValid,
        errors: result.errors || [],
        warnings: result.warnings || [],
        schema: result.schema
      }
    });

  } catch (error) {
    logger.error('验证配置失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '验证配置失败'
    });
  }
});

/**
 * 批量验证配置
 * POST /api/config/validate/batch
 */
router.post('/validate/batch', async (req, res) => {
  try {
    const { configs } = req.body;

    if (!configs || !Array.isArray(configs) || configs.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_CONFIGS',
        message: '请提供有效的配置数组'
      });
    }

    if (configs.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'TOO_MANY_CONFIGS',
        message: '批量验证的配置数量不能超过50个'
      });
    }

    const configService = req.app.get('configService');
    if (!configService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '配置服务暂不可用'
      });
    }

    const results = await configService.validateMultiple(configs);

    res.json({
      success: true,
      message: '批量验证配置完成',
      data: {
        totalConfigs: configs.length,
        validConfigs: results.filter(r => r.isValid).length,
        invalidConfigs: results.filter(r => !r.isValid).length,
        results,
        executionTime: results.reduce((sum, r) => sum + (r.executionTime || 0), 0)
      }
    });

  } catch (error) {
    logger.error('批量验证配置失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '批量验证配置失败'
    });
  }
});

/**
 * 获取配置模式
 * GET /api/config/schemas
 */
router.get('/schemas', async (req, res) => {
  try {
    const { category } = req.query;

    const configService = req.app.get('configService');
    if (!configService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '配置服务暂不可用'
      });
    }

    const schemas = await configService.getSchemas(category);

    res.json({
      success: true,
      message: '获取配置模式成功',
      data: {
        schemas,
        category,
        count: Object.keys(schemas).length
      }
    });

  } catch (error) {
    logger.error('获取配置模式失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取配置模式失败'
    });
  }
});

/**
 * 重载配置
 * POST /api/config/reload
 */
router.post('/reload', async (req, res) => {
  try {
    const { force = false } = req.body;

    const configService = req.app.get('configService');
    if (!configService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '配置服务暂不可用'
      });
    }

    const result = await configService.reload({ force });

    res.json({
      success: result.success,
      message: result.success ? '配置重载成功' : '配置重载失败',
      data: result.success ? {
        reloadedAt: new Date().toISOString(),
        reloadedConfigs: result.reloadedConfigs || [],
        executionTime: result.executionTime
      } : {
        error: result.error
      }
    });

  } catch (error) {
    logger.error('重载配置失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '重载配置失败'
    });
  }
});

/**
 * 获取配置历史
 * GET /api/config/history
 */
router.get('/history', async (req, res) => {
  try {
    const { key, page = 1, limit = 20, action, startDate, endDate } = req.query;

    const configService = req.app.get('configService');
    if (!configService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '配置服务暂不可用'
      });
    }

    const options = {
      key,
      page: Math.max(1, parseInt(page)),
      limit: Math.min(100, Math.max(1, parseInt(limit))),
      action,
      startDate,
      endDate
    };

    const history = await configService.getHistory(options);

    res.json({
      success: true,
      message: '获取配置历史成功',
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
    logger.error('获取配置历史失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取配置历史失败'
    });
  }
});

/**
 * 备份配置
 * POST /api/config/backup
 */
router.post('/backup', async (req, res) => {
  try {
    const { description } = req.body;

    const configService = req.app.get('configService');
    if (!configService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '配置服务暂不可用'
      });
    }

    const result = await configService.backup({ description });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'BACKUP_FAILED',
        message: result.message || '备份配置失败'
      });
    }

    res.json({
      success: true,
      message: '配置备份成功',
      data: {
        backupId: result.backupId,
        backupPath: result.backupPath,
        description: result.description,
        createdAt: result.createdAt
      }
    });

  } catch (error) {
    logger.error('备份配置失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '备份配置失败'
    });
  }
});

/**
 * 恢复配置
 * POST /api/config/restore
 */
router.post('/restore', async (req, res) => {
  try {
    const { backupId } = req.body;

    if (!backupId) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_BACKUP_ID',
        message: '请提供有效的备份ID'
      });
    }

    const configService = req.app.get('configService');
    if (!configService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '配置服务暂不可用'
      });
    }

    const result = await configService.restore(backupId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'RESTORE_FAILED',
        message: result.message || '恢复配置失败'
      });
    }

    res.json({
      success: true,
      message: '配置恢复成功',
      data: {
        backupId,
        restoredAt: new Date().toISOString(),
        restoredConfigs: result.restoredConfigs || []
      }
    });

  } catch (error) {
    logger.error('恢复配置失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '恢复配置失败'
    });
  }
});

/**
 * 获取配置备份列表
 * GET /api/config/backups
 */
router.get('/backups', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const configService = req.app.get('configService');
    if (!configService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '配置服务暂不可用'
      });
    }

    const options = {
      page: Math.max(1, parseInt(page)),
      limit: Math.min(100, Math.max(1, parseInt(limit)))
    };

    const backups = await configService.getBackups(options);

    res.json({
      success: true,
      message: '获取配置备份列表成功',
      data: {
        backups: backups.backups || [],
        pagination: backups.pagination || {
          page: options.page,
          limit: options.limit,
          total: backups.total || 0
        }
      }
    });

  } catch (error) {
    logger.error('获取配置备份列表失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取配置备份列表失败'
    });
  }
});

/**
 * 删除配置备份
 * DELETE /api/config/backups/:backupId
 */
router.delete('/backups/:backupId', async (req, res) => {
  try {
    const { backupId } = req.params;

    if (!backupId) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_BACKUP_ID',
        message: '请提供有效的备份ID'
      });
    }

    const configService = req.app.get('configService');
    if (!configService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '配置服务暂不可用'
      });
    }

    const result = await configService.deleteBackup(backupId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'BACKUP_DELETE_FAILED',
        message: result.message || '删除配置备份失败'
      });
    }

    res.json({
      success: true,
      message: '配置备份删除成功',
      data: {
        backupId,
        deletedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('删除配置备份失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '删除配置备份失败'
    });
  }
});

/**
 * 获取配置状态
 * GET /api/config/status
 */
router.get('/status', async (req, res) => {
  try {
    const configService = req.app.get('configService');
    if (!configService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '配置服务暂不可用'
      });
    }

    const status = await configService.getStatus();

    res.json({
      success: true,
      message: '获取配置状态成功',
      data: {
        status,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('获取配置状态失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取配置状态失败'
    });
  }
});

export default router;