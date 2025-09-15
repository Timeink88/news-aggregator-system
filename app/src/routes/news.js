/**
 * News API Routes
 * 提供新闻相关的RESTful API端点
 * 遵循REST API最佳实践：安全性、错误处理、性能优化
 */

import { Router } from 'express';
import logger from '../utils/logger.js';

const router = Router();

/**
 * 获取新闻文章列表
 * GET /api/news/articles
 */
router.get('/articles', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      source,
      search,
      sortBy = 'published_at',
      sortOrder = 'desc',
      startDate,
      endDate
    } = req.query;

    // 验证分页参数
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    // 获取新闻服务
    const newsService = req.app.get('newsService');
    if (!newsService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '新闻服务暂不可用'
      });
    }

    // 构建查询选项
    const options = {
      page: pageNum,
      limit: limitNum,
      category,
      source,
      search,
      sortBy,
      sortOrder,
      startDate,
      endDate
    };

    // 获取文章列表
    const result = await newsService.getArticles(options);

    res.json({
      success: true,
      message: '获取新闻文章成功',
      data: {
        articles: result.articles || [],
        pagination: result.pagination || {
          page: pageNum,
          limit: limitNum,
          total: result.total || 0
        }
      }
    });

  } catch (error) {
    logger.error('获取新闻文章失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取新闻文章失败',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * 获取单篇新闻文章
 * GET /api/news/articles/:id
 */
router.get('/articles/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 验证ID格式
    if (!id || id.length < 1) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ID',
        message: '请提供有效的文章ID'
      });
    }

    const newsService = req.app.get('newsService');
    if (!newsService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '新闻服务暂不可用'
      });
    }

    const article = await newsService.getArticleById(id);

    if (!article) {
      return res.status(404).json({
        success: false,
        error: 'ARTICLE_NOT_FOUND',
        message: '文章未找到'
      });
    }

    res.json({
      success: true,
      message: '获取新闻文章成功',
      data: article
    });

  } catch (error) {
    logger.error('获取新闻文章详情失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取新闻文章详情失败'
    });
  }
});

/**
 * 获取热门新闻
 * GET /api/news/trending
 */
router.get('/trending', async (req, res) => {
  try {
    const { limit = 10, timeframe = '24h' } = req.query;

    const newsService = req.app.get('newsService');
    if (!newsService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '新闻服务暂不可用'
      });
    }

    const options = {
      limit: Math.min(50, Math.max(1, parseInt(limit))),
      timeframe
    };

    const trendingArticles = await newsService.getTrendingArticles(options);

    res.json({
      success: true,
      message: '获取热门新闻成功',
      data: {
        articles: trendingArticles,
        options
      }
    });

  } catch (error) {
    logger.error('获取热门新闻失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取热门新闻失败'
    });
  }
});

/**
 * 获取推荐新闻
 * GET /api/news/recommended
 */
router.get('/recommended', async (req, res) => {
  try {
    const { limit = 10, userId } = req.query;

    const newsService = req.app.get('newsService');
    if (!newsService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '新闻服务暂不可用'
      });
    }

    const options = {
      limit: Math.min(50, Math.max(1, parseInt(limit))),
      userId
    };

    const recommendedArticles = await newsService.getRecommendedArticles(options);

    res.json({
      success: true,
      message: '获取推荐新闻成功',
      data: {
        articles: recommendedArticles,
        options
      }
    });

  } catch (error) {
    logger.error('获取推荐新闻失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取推荐新闻失败'
    });
  }
});

/**
 * 搜索新闻
 * GET /api/news/search
 */
router.get('/search', async (req, res) => {
  try {
    const {
      q,
      page = 1,
      limit = 20,
      category,
      source,
      sortBy = 'relevance',
      sortOrder = 'desc'
    } = req.query;

    // 验证搜索查询
    if (!q || q.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_QUERY',
        message: '请提供搜索关键词'
      });
    }

    const newsService = req.app.get('newsService');
    if (!newsService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '新闻服务暂不可用'
      });
    }

    const options = {
      query: q.trim(),
      page: Math.max(1, parseInt(page)),
      limit: Math.min(100, Math.max(1, parseInt(limit))),
      category,
      source,
      sortBy,
      sortOrder
    };

    const searchResult = await newsService.searchArticles(options);

    res.json({
      success: true,
      message: '搜索新闻成功',
      data: {
        articles: searchResult.articles || [],
        pagination: searchResult.pagination || {
          page: options.page,
          limit: options.limit,
          total: searchResult.total || 0
        },
        searchInfo: {
          query: options.query,
          executionTime: searchResult.executionTime
        }
      }
    });

  } catch (error) {
    logger.error('搜索新闻失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '搜索新闻失败'
    });
  }
});

/**
 * 获取新闻分类
 * GET /api/news/categories
 */
router.get('/categories', async (req, res) => {
  try {
    const newsService = req.app.get('newsService');
    if (!newsService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '新闻服务暂不可用'
      });
    }

    const categories = await newsService.getCategories();

    res.json({
      success: true,
      message: '获取新闻分类成功',
      data: {
        categories,
        count: categories.length
      }
    });

  } catch (error) {
    logger.error('获取新闻分类失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取新闻分类失败'
    });
  }
});

/**
 * 获取新闻源列表
 * GET /api/news/sources
 */
router.get('/sources', async (req, res) => {
  try {
    const { category, activeOnly = true } = req.query;

    const newsService = req.app.get('newsService');
    if (!newsService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '新闻服务暂不可用'
      });
    }

    const options = {
      category,
      activeOnly: activeOnly === 'true' || activeOnly === true
    };

    const sources = await newsService.getSources(options);

    res.json({
      success: true,
      message: '获取新闻源成功',
      data: {
        sources,
        count: sources.length,
        options
      }
    });

  } catch (error) {
    logger.error('获取新闻源失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取新闻源失败'
    });
  }
});

/**
 * 获取新闻统计
 * GET /api/news/statistics
 */
router.get('/statistics', async (req, res) => {
  try {
    const { timeframe = '24h' } = req.query;

    const newsService = req.app.get('newsService');
    if (!newsService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '新闻服务暂不可用'
      });
    }

    const statistics = await newsService.getStatistics({ timeframe });

    res.json({
      success: true,
      message: '获取新闻统计成功',
      data: {
        statistics,
        timeframe
      }
    });

  } catch (error) {
    logger.error('获取新闻统计失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取新闻统计失败'
    });
  }
});

/**
 * 分享文章
 * POST /api/news/articles/:id/share
 */
router.post('/articles/:id/share', async (req, res) => {
  try {
    const { id } = req.params;
    const { platform, message } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ID',
        message: '请提供有效的文章ID'
      });
    }

    if (!platform || !['twitter', 'facebook', 'linkedin', 'email'].includes(platform)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PLATFORM',
        message: '请提供有效的分享平台'
      });
    }

    const newsService = req.app.get('newsService');
    if (!newsService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '新闻服务暂不可用'
      });
    }

    const shareResult = await newsService.shareArticle(id, { platform, message });

    res.json({
      success: shareResult.success,
      message: shareResult.success ? '文章分享成功' : '文章分享失败',
      data: shareResult.success ? {
        shareUrl: shareResult.shareUrl,
        platform,
        sharedAt: new Date().toISOString()
      } : null
    });

  } catch (error) {
    logger.error('分享文章失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '分享文章失败'
    });
  }
});

export default router;