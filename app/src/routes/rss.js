/**
 * RSS API Routes
 * 提供RSS源相关的RESTful API端点
 * 遵循REST API最佳实践：安全性、错误处理、性能优化
 */

import { Router } from 'express';
import logger from '../utils/logger.js';

const router = Router();

/**
 * 获取RSS源列表
 * GET /api/rss/sources
 */
router.get('/sources', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      activeOnly = true,
      search
    } = req.query;

    const rssManager = req.app.get('rssManager');
    if (!rssManager) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: 'RSS管理服务暂不可用'
      });
    }

    const options = {
      page: Math.max(1, parseInt(page)),
      limit: Math.min(100, Math.max(1, parseInt(limit))),
      category,
      activeOnly: activeOnly === 'true' || activeOnly === true,
      search
    };

    const result = await rssManager.getAllSources(options);

    res.json({
      success: true,
      message: '获取RSS源列表成功',
      data: {
        sources: result.sources || [],
        pagination: result.pagination || {
          page: options.page,
          limit: options.limit,
          total: result.total || 0
        }
      }
    });

  } catch (error) {
    logger.error('获取RSS源列表失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取RSS源列表失败'
    });
  }
});

/**
 * 获取单个RSS源
 * GET /api/rss/sources/:id
 */
router.get('/sources/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ID',
        message: '请提供有效的RSS源ID'
      });
    }

    const rssManager = req.app.get('rssManager');
    if (!rssManager) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: 'RSS管理服务暂不可用'
      });
    }

    const source = await rssManager.getSourceById(id);

    if (!source) {
      return res.status(404).json({
        success: false,
        error: 'SOURCE_NOT_FOUND',
        message: 'RSS源未找到'
      });
    }

    res.json({
      success: true,
      message: '获取RSS源成功',
      data: source
    });

  } catch (error) {
    logger.error('获取RSS源失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取RSS源失败'
    });
  }
});

/**
 * 添加RSS源
 * POST /api/rss/sources
 */
router.post('/sources', async (req, res) => {
  try {
    const { name, url, category, description, language, updateFrequency } = req.body;

    // 验证必填字段
    if (!name || !url || !category) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        message: '名称、URL和分类为必填字段'
      });
    }

    // 验证URL格式
    try {
      new URL(url);
    } catch {
      return res.status(400).json({
        success: false,
        error: 'INVALID_URL',
        message: '请提供有效的URL'
      });
    }

    // 验证分类
    const validCategories = ['tech', 'finance', 'politics', 'sports', 'entertainment', 'health', 'science'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_CATEGORY',
        message: '请选择有效的分类'
      });
    }

    const rssManager = req.app.get('rssManager');
    if (!rssManager) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: 'RSS管理服务暂不可用'
      });
    }

    const sourceData = {
      name: name.trim(),
      url: url.trim(),
      category,
      description: description ? description.trim() : '',
      language: language || 'zh',
      updateFrequency: updateFrequency || 60
    };

    const result = await rssManager.addSource(sourceData);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'SOURCE_ADD_FAILED',
        message: result.message || '添加RSS源失败'
      });
    }

    res.status(201).json({
      success: true,
      message: 'RSS源添加成功',
      data: result.source
    });

  } catch (error) {
    logger.error('添加RSS源失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '添加RSS源失败'
    });
  }
});

/**
 * 更新RSS源
 * PUT /api/rss/sources/:id
 */
router.put('/sources/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, url, category, description, language, updateFrequency, isActive } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ID',
        message: '请提供有效的RSS源ID'
      });
    }

    const rssManager = req.app.get('rssManager');
    if (!rssManager) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: 'RSS管理服务暂不可用'
      });
    }

    // 验证RSS源是否存在
    const existingSource = await rssManager.getSourceById(id);
    if (!existingSource) {
      return res.status(404).json({
        success: false,
        error: 'SOURCE_NOT_FOUND',
        message: 'RSS源未找到'
      });
    }

    // 构建更新数据
    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (url !== undefined) {
      try {
        new URL(url);
        updateData.url = url.trim();
      } catch {
        return res.status(400).json({
          success: false,
          error: 'INVALID_URL',
          message: '请提供有效的URL'
        });
      }
    }
    if (category !== undefined) {
      const validCategories = ['tech', 'finance', 'politics', 'sports', 'entertainment', 'health', 'science'];
      if (!validCategories.includes(category)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_CATEGORY',
          message: '请选择有效的分类'
        });
      }
      updateData.category = category;
    }
    if (description !== undefined) updateData.description = description.trim();
    if (language !== undefined) updateData.language = language;
    if (updateFrequency !== undefined) updateData.updateFrequency = parseInt(updateFrequency);
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    const result = await rssManager.updateSource(id, updateData);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'SOURCE_UPDATE_FAILED',
        message: result.message || '更新RSS源失败'
      });
    }

    res.json({
      success: true,
      message: 'RSS源更新成功',
      data: result.source
    });

  } catch (error) {
    logger.error('更新RSS源失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '更新RSS源失败'
    });
  }
});

/**
 * 删除RSS源
 * DELETE /api/rss/sources/:id
 */
router.delete('/sources/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ID',
        message: '请提供有效的RSS源ID'
      });
    }

    const rssManager = req.app.get('rssManager');
    if (!rssManager) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: 'RSS管理服务暂不可用'
      });
    }

    // 验证RSS源是否存在
    const existingSource = await rssManager.getSourceById(id);
    if (!existingSource) {
      return res.status(404).json({
        success: false,
        error: 'SOURCE_NOT_FOUND',
        message: 'RSS源未找到'
      });
    }

    const result = await rssManager.removeSource(id);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'SOURCE_DELETE_FAILED',
        message: result.message || '删除RSS源失败'
      });
    }

    res.json({
      success: true,
      message: 'RSS源删除成功'
    });

  } catch (error) {
    logger.error('删除RSS源失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '删除RSS源失败'
    });
  }
});

/**
 * 手动刷新RSS源
 * POST /api/rss/sources/:id/refresh
 */
router.post('/sources/:id/refresh', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ID',
        message: '请提供有效的RSS源ID'
      });
    }

    const rssManager = req.app.get('rssManager');
    if (!rssManager) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: 'RSS管理服务暂不可用'
      });
    }

    const result = await rssManager.refreshSource(id);

    res.json({
      success: result.success,
      message: result.success ? 'RSS源刷新成功' : 'RSS源刷新失败',
      data: result.success ? {
        articlesFetched: result.articlesFetched,
        executionTime: result.executionTime
      } : {
        error: result.error
      }
    });

  } catch (error) {
    logger.error('刷新RSS源失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '刷新RSS源失败'
    });
  }
});

/**
 * 获取RSS源状态
 * GET /api/rss/sources/:id/status
 */
router.get('/sources/:id/status', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ID',
        message: '请提供有效的RSS源ID'
      });
    }

    const rssManager = req.app.get('rssManager');
    if (!rssManager) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: 'RSS管理服务暂不可用'
      });
    }

    const status = await rssManager.getSourceStatus(id);

    if (!status) {
      return res.status(404).json({
        success: false,
        error: 'SOURCE_NOT_FOUND',
        message: 'RSS源未找到'
      });
    }

    res.json({
      success: true,
      message: '获取RSS源状态成功',
      data: status
    });

  } catch (error) {
    logger.error('获取RSS源状态失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取RSS源状态失败'
    });
  }
});

/**
 * 批量刷新RSS源
 * POST /api/rss/refresh
 */
router.post('/refresh', async (req, res) => {
  try {
    const { sourceIds, force = false } = req.body;

    const rssManager = req.app.get('rssManager');
    if (!rssManager) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: 'RSS管理服务暂不可用'
      });
    }

    const result = await rssManager.refreshMultipleSources({
      sourceIds,
      force
    });

    res.json({
      success: true,
      message: '批量刷新RSS源完成',
      data: {
        totalSources: result.totalSources,
        successfulSources: result.successfulSources,
        failedSources: result.failedSources,
        articlesFetched: result.articlesFetched,
        executionTime: result.executionTime,
        errors: result.errors
      }
    });

  } catch (error) {
    logger.error('批量刷新RSS源失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '批量刷新RSS源失败'
    });
  }
});

/**
 * 获取RSS统计信息
 * GET /api/rss/statistics
 */
router.get('/statistics', async (req, res) => {
  try {
    const { timeframe = '24h' } = req.query;

    const rssManager = req.app.get('rssManager');
    if (!rssManager) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: 'RSS管理服务暂不可用'
      });
    }

    const statistics = await rssManager.getStatistics({ timeframe });

    res.json({
      success: true,
      message: '获取RSS统计信息成功',
      data: {
        statistics,
        timeframe
      }
    });

  } catch (error) {
    logger.error('获取RSS统计信息失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取RSS统计信息失败'
    });
  }
});

/**
 * 验证RSS源URL
 * POST /api/rss/validate
 */
router.post('/validate', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_URL',
        message: '请提供RSS源URL'
      });
    }

    // 验证URL格式
    try {
      new URL(url);
    } catch {
      return res.status(400).json({
        success: false,
        error: 'INVALID_URL',
        message: '请提供有效的URL'
      });
    }

    const rssManager = req.app.get('rssManager');
    if (!rssManager) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: 'RSS管理服务暂不可用'
      });
    }

    const validationResult = await rssManager.validateSource(url);

    res.json({
      success: true,
      message: 'RSS源验证完成',
      data: validationResult
    });

  } catch (error) {
    logger.error('验证RSS源失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '验证RSS源失败'
    });
  }
});

export default router;