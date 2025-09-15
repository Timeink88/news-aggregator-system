/**
 * AI Analysis API Routes
 * 提供AI分析相关的RESTful API端点
 * 遵循REST API最佳实践：安全性、错误处理、性能优化
 */

import { Router } from 'express';
import logger from '../utils/logger.js';

const router = Router();

/**
 * 分析单篇文章
 * POST /api/ai/analyze
 */
router.post('/analyze', async (req, res) => {
  try {
    const { articleId, analysisTypes = ['sentiment', 'keywords', 'entities'] } = req.body;

    if (!articleId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_ARTICLE_ID',
        message: '请提供文章ID'
      });
    }

    const aiService = req.app.get('aiService');
    if (!aiService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: 'AI分析服务暂不可用'
      });
    }

    // 验证分析类型
    const validAnalysisTypes = ['sentiment', 'keywords', 'entities', 'topics', 'summary', 'categories', 'stockEntities'];
    const invalidTypes = analysisTypes.filter(type => !validAnalysisTypes.includes(type));

    if (invalidTypes.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ANALYSIS_TYPES',
        message: `无效的分析类型: ${invalidTypes.join(', ')}`
      });
    }

    const result = await aiService.analyzeArticle(articleId, { analysisTypes });

    res.json({
      success: result.success,
      message: result.success ? '文章分析成功' : '文章分析失败',
      data: result.success ? {
        analysisId: result.analysisId,
        articleId,
        analysisTypes,
        results: result.results,
        executionTime: result.executionTime,
        cost: result.cost
      } : {
        error: result.error
      }
    });

  } catch (error) {
    logger.error('分析文章失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '分析文章失败'
    });
  }
});

/**
 * 批量分析文章
 * POST /api/ai/analyze/batch
 */
router.post('/analyze/batch', async (req, res) => {
  try {
    const { articleIds, analysisTypes = ['sentiment', 'keywords'] } = req.body;

    if (!articleIds || !Array.isArray(articleIds) || articleIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ARTICLE_IDS',
        message: '请提供有效的文章ID数组'
      });
    }

    if (articleIds.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'TOO_MANY_ARTICLES',
        message: '批量分析的文章数量不能超过50篇'
      });
    }

    const aiService = req.app.get('aiService');
    if (!aiService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: 'AI分析服务暂不可用'
      });
    }

    const result = await aiService.analyzeBatchArticles(articleIds, { analysisTypes });

    res.json({
      success: true,
      message: '批量分析完成',
      data: {
        batchId: result.batchId,
        totalArticles: articleIds.length,
        successfulAnalyses: result.successfulAnalyses,
        failedAnalyses: result.failedAnalyses,
        results: result.results,
        executionTime: result.executionTime,
        totalCost: result.totalCost
      }
    });

  } catch (error) {
    logger.error('批量分析文章失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '批量分析文章失败'
    });
  }
});

/**
 * 获取分析结果
 * GET /api/ai/analysis/:analysisId
 */
router.get('/analysis/:analysisId', async (req, res) => {
  try {
    const { analysisId } = req.params;

    if (!analysisId) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ANALYSIS_ID',
        message: '请提供有效的分析ID'
      });
    }

    const aiService = req.app.get('aiService');
    if (!aiService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: 'AI分析服务暂不可用'
      });
    }

    const analysis = await aiService.getAnalysisResult(analysisId);

    if (!analysis) {
      return res.status(404).json({
        success: false,
        error: 'ANALYSIS_NOT_FOUND',
        message: '分析结果未找到'
      });
    }

    res.json({
      success: true,
      message: '获取分析结果成功',
      data: analysis
    });

  } catch (error) {
    logger.error('获取分析结果失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取分析结果失败'
    });
  }
});

/**
 * 获取文章的分析历史
 * GET /api/ai/articles/:articleId/analyses
 */
router.get('/articles/:articleId/analyses', async (req, res) => {
  try {
    const { articleId } = req.params;
    const { limit = 10, offset = 0 } = req.query;

    if (!articleId) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ARTICLE_ID',
        message: '请提供有效的文章ID'
      });
    }

    const aiService = req.app.get('aiService');
    if (!aiService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: 'AI分析服务暂不可用'
      });
    }

    const analyses = await aiService.getArticleAnalyses(articleId, {
      limit: Math.min(100, Math.max(1, parseInt(limit))),
      offset: Math.max(0, parseInt(offset))
    });

    res.json({
      success: true,
      message: '获取文章分析历史成功',
      data: {
        articleId,
        analyses,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: analyses.length
        }
      }
    });

  } catch (error) {
    logger.error('获取文章分析历史失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取文章分析历史失败'
    });
  }
});

/**
 * 生成摘要
 * POST /api/ai/summarize
 */
router.post('/summarize', async (req, res) => {
  try {
    const { articleId, maxLength = 200, style = 'neutral' } = req.body;

    if (!articleId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_ARTICLE_ID',
        message: '请提供文章ID'
      });
    }

    const aiService = req.app.get('aiService');
    if (!aiService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: 'AI分析服务暂不可用'
      });
    }

    const result = await aiService.generateSummary(articleId, { maxLength, style });

    res.json({
      success: result.success,
      message: result.success ? '摘要生成成功' : '摘要生成失败',
      data: result.success ? {
        articleId,
        summary: result.summary,
        style,
        maxLength,
        executionTime: result.executionTime,
        cost: result.cost
      } : {
        error: result.error
      }
    });

  } catch (error) {
    logger.error('生成摘要失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '生成摘要失败'
    });
  }
});

/**
 * 提取关键词
 * POST /api/ai/keywords
 */
router.post('/keywords', async (req, res) => {
  try {
    const { articleId, maxKeywords = 10 } = req.body;

    if (!articleId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_ARTICLE_ID',
        message: '请提供文章ID'
      });
    }

    const aiService = req.app.get('aiService');
    if (!aiService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: 'AI分析服务暂不可用'
      });
    }

    const result = await aiService.extractKeywords(articleId, { maxKeywords });

    res.json({
      success: result.success,
      message: result.success ? '关键词提取成功' : '关键词提取失败',
      data: result.success ? {
        articleId,
        keywords: result.keywords,
        maxKeywords,
        executionTime: result.executionTime,
        cost: result.cost
      } : {
        error: result.error
      }
    });

  } catch (error) {
    logger.error('提取关键词失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '提取关键词失败'
    });
  }
});

/**
 * 情感分析
 * POST /api/ai/sentiment
 */
router.post('/sentiment', async (req, res) => {
  try {
    const { articleId } = req.body;

    if (!articleId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_ARTICLE_ID',
        message: '请提供文章ID'
      });
    }

    const aiService = req.app.get('aiService');
    if (!aiService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: 'AI分析服务暂不可用'
      });
    }

    const result = await aiService.analyzeSentiment(articleId);

    res.json({
      success: result.success,
      message: result.success ? '情感分析成功' : '情感分析失败',
      data: result.success ? {
        articleId,
        sentiment: result.sentiment,
        confidence: result.confidence,
        details: result.details,
        executionTime: result.executionTime,
        cost: result.cost
      } : {
        error: result.error
      }
    });

  } catch (error) {
    logger.error('情感分析失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '情感分析失败'
    });
  }
});

/**
 * 获取AI分析统计
 * GET /api/ai/statistics
 */
router.get('/statistics', async (req, res) => {
  try {
    const { timeframe = '24h' } = req.query;

    const aiService = req.app.get('aiService');
    if (!aiService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: 'AI分析服务暂不可用'
      });
    }

    const statistics = await aiService.getStatistics({ timeframe });

    res.json({
      success: true,
      message: '获取AI分析统计成功',
      data: {
        statistics,
        timeframe
      }
    });

  } catch (error) {
    logger.error('获取AI分析统计失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取AI分析统计失败'
    });
  }
});

/**
 * 获取AI分析配置
 * GET /api/ai/config
 */
router.get('/config', async (req, res) => {
  try {
    const aiService = req.app.get('aiService');
    if (!aiService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: 'AI分析服务暂不可用'
      });
    }

    const config = await aiService.getConfig();

    res.json({
      success: true,
      message: '获取AI分析配置成功',
      data: config
    });

  } catch (error) {
    logger.error('获取AI分析配置失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取AI分析配置失败'
    });
  }
});

/**
 * 更新AI分析配置
 * PUT /api/ai/config
 */
router.put('/config', async (req, res) => {
  try {
    const { model, costControl, recommendations, enabledAnalysisTypes } = req.body;

    const aiService = req.app.get('aiService');
    if (!aiService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: 'AI分析服务暂不可用'
      });
    }

    const result = await aiService.updateConfig({
      model,
      costControl,
      recommendations,
      enabledAnalysisTypes
    });

    res.json({
      success: result.success,
      message: result.success ? 'AI分析配置更新成功' : 'AI分析配置更新失败',
      data: result.success ? result.config : {
        error: result.error
      }
    });

  } catch (error) {
    logger.error('更新AI分析配置失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '更新AI分析配置失败'
    });
  }
});

/**
 * 获取成本控制状态
 * GET /api/ai/cost/status
 */
router.get('/cost/status', async (req, res) => {
  try {
    const aiService = req.app.get('aiService');
    if (!aiService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: 'AI分析服务暂不可用'
      });
    }

    const costStatus = await aiService.getCostStatus();

    res.json({
      success: true,
      message: '获取成本控制状态成功',
      data: costStatus
    });

  } catch (error) {
    logger.error('获取成本控制状态失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取成本控制状态失败'
    });
  }
});

/**
 * 重置成本统计
 * POST /api/ai/cost/reset
 */
router.post('/cost/reset', async (req, res) => {
  try {
    const { period } = req.body;

    const aiService = req.app.get('aiService');
    if (!aiService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: 'AI分析服务暂不可用'
      });
    }

    const result = await aiService.resetCostStatistics(period);

    res.json({
      success: result.success,
      message: result.success ? '成本统计重置成功' : '成本统计重置失败'
    });

  } catch (error) {
    logger.error('重置成本统计失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '重置成本统计失败'
    });
  }
});

export default router;