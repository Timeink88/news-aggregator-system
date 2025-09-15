/**
 * Web Admin API Routes
 * 提供Web管理界面的RESTful API端点
 */

import { Router } from 'express';
import { validateRequest, authenticateJWT, authorizeRoles } from '../middleware/auth.js';
import logger from '../utils/logger.js';

const router = Router();

// 认证相关路由
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: '邮箱和密码不能为空'
      });
    }

    const webAdminService = req.app.get('webAdminService');
    const result = await webAdminService.login(email, password);

    res.json({
      success: result.success,
      message: result.message,
      data: result.success ? {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user
      } : null
    });
  } catch (error) {
    logger.error('登录失败:', error);
    res.status(500).json({
      success: false,
      message: '登录失败',
      error: error.message
    });
  }
});

router.post('/auth/logout', authenticateJWT, async (req, res) => {
  try {
    const webAdminService = req.app.get('webAdminService');
    const result = await webAdminService.logout(req.token);

    res.json({
      success: result.success,
      message: result.message
    });
  } catch (error) {
    logger.error('登出失败:', error);
    res.status(500).json({
      success: false,
      message: '登出失败',
      error: error.message
    });
  }
});

router.post('/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: '刷新令牌不能为空'
      });
    }

    const webAdminService = req.app.get('webAdminService');
    const result = await webAdminService.refreshToken(refreshToken);

    res.json({
      success: result.success,
      message: result.message,
      data: result.success ? {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
      } : null
    });
  } catch (error) {
    logger.error('刷新令牌失败:', error);
    res.status(500).json({
      success: false,
      message: '刷新令牌失败',
      error: error.message
    });
  }
});

// 用户管理路由
router.get('/users', authenticateJWT, authorizeRoles('admin'), async (req, res) => {
  try {
    const webAdminService = req.app.get('webAdminService');
    const users = await webAdminService.getAllUsers();

    res.json({
      success: true,
      message: '获取用户列表成功',
      data: users
    });
  } catch (error) {
    logger.error('获取用户列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取用户列表失败',
      error: error.message
    });
  }
});

router.post('/users', authenticateJWT, authorizeRoles('admin'), validateRequest('createUser'), async (req, res) => {
  try {
    const webAdminService = req.app.get('webAdminService');
    const result = await webAdminService.createUser(req.body);

    res.json({
      success: result.success,
      message: result.message,
      data: result.success ? result.user : null
    });
  } catch (error) {
    logger.error('创建用户失败:', error);
    res.status(500).json({
      success: false,
      message: '创建用户失败',
      error: error.message
    });
  }
});

router.get('/users/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const webAdminService = req.app.get('webAdminService');
    const user = await webAdminService.getUserById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 只有管理员或用户本人可以查看用户详情
    if (req.user.role !== 'admin' && req.user.id !== id) {
      return res.status(403).json({
        success: false,
        message: '权限不足'
      });
    }

    res.json({
      success: true,
      message: '获取用户成功',
      data: user
    });
  } catch (error) {
    logger.error('获取用户失败:', error);
    res.status(500).json({
      success: false,
      message: '获取用户失败',
      error: error.message
    });
  }
});

router.put('/users/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;

    // 只有管理员或用户本人可以更新用户信息
    if (req.user.role !== 'admin' && req.user.id !== id) {
      return res.status(403).json({
        success: false,
        message: '权限不足'
      });
    }

    const webAdminService = req.app.get('webAdminService');
    const result = await webAdminService.updateUser(id, req.body);

    res.json({
      success: result.success,
      message: result.message,
      data: result.success ? result.user : null
    });
  } catch (error) {
    logger.error('更新用户失败:', error);
    res.status(500).json({
      success: false,
      message: '更新用户失败',
      error: error.message
    });
  }
});

router.delete('/users/:id', authenticateJWT, authorizeRoles('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const webAdminService = req.app.get('webAdminService');
    const result = await webAdminService.deleteUser(id);

    res.json({
      success: result.success,
      message: result.message
    });
  } catch (error) {
    logger.error('删除用户失败:', error);
    res.status(500).json({
      success: false,
      message: '删除用户失败',
      error: error.message
    });
  }
});

// 系统配置路由
router.get('/config', authenticateJWT, async (req, res) => {
  try {
    const configService = req.app.get('configService');
    const config = await configService.getAll();

    res.json({
      success: true,
      message: '获取配置成功',
      data: config
    });
  } catch (error) {
    logger.error('获取配置失败:', error);
    res.status(500).json({
      success: false,
      message: '获取配置失败',
      error: error.message
    });
  }
});

router.put('/config', authenticateJWT, authorizeRoles('admin'), async (req, res) => {
  try {
    const { key, value, type, description } = req.body;

    if (!key || value === undefined) {
      return res.status(400).json({
        success: false,
        message: '配置键和值不能为空'
      });
    }

    const configService = req.app.get('configService');
    configService.set(key, value, type, description);

    res.json({
      success: true,
      message: '更新配置成功'
    });
  } catch (error) {
    logger.error('更新配置失败:', error);
    res.status(500).json({
      success: false,
      message: '更新配置失败',
      error: error.message
    });
  }
});

// 系统状态路由
router.get('/status', authenticateJWT, async (req, res) => {
  try {
    const app = req.app.get('app');
    const status = app.getStatus();

    res.json({
      success: true,
      message: '获取系统状态成功',
      data: status
    });
  } catch (error) {
    logger.error('获取系统状态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取系统状态失败',
      error: error.message
    });
  }
});

// 服务健康检查路由
router.get('/health', async (req, res) => {
  try {
    const app = req.app.get('app');
    const services = app.getServices();

    const healthStatus = {};
    for (const [name, service] of Object.entries(services)) {
      healthStatus[name] = {
        isRunning: service.isRunning,
        health: service.isRunning ? 'healthy' : 'unhealthy'
      };
    }

    res.json({
      success: true,
      message: '健康检查完成',
      data: {
        overall: Object.values(healthStatus).every(s => s.isRunning) ? 'healthy' : 'unhealthy',
        services: healthStatus
      }
    });
  } catch (error) {
    logger.error('健康检查失败:', error);
    res.status(500).json({
      success: false,
      message: '健康检查失败',
      error: error.message
    });
  }
});

// RSS源管理路由
router.get('/rss/sources', authenticateJWT, async (req, res) => {
  try {
    const rssManager = req.app.get('rssManager');
    const sources = await rssManager.getAllSources();

    res.json({
      success: true,
      message: '获取RSS源列表成功',
      data: sources
    });
  } catch (error) {
    logger.error('获取RSS源列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取RSS源列表失败',
      error: error.message
    });
  }
});

router.post('/rss/sources', authenticateJWT, authorizeRoles('admin'), async (req, res) => {
  try {
    const rssManager = req.app.get('rssManager');
    const result = await rssManager.addSource(req.body);

    res.json({
      success: result.success,
      message: result.message,
      data: result.success ? result.source : null
    });
  } catch (error) {
    logger.error('添加RSS源失败:', error);
    res.status(500).json({
      success: false,
      message: '添加RSS源失败',
      error: error.message
    });
  }
});

// 新闻管理路由
router.get('/news/articles', authenticateJWT, async (req, res) => {
  try {
    const { page = 1, limit = 20, category, source } = req.query;
    const newsService = req.app.get('newsService');

    const articles = await newsService.getArticles({
      page: parseInt(page),
      limit: parseInt(limit),
      category,
      source
    });

    res.json({
      success: true,
      message: '获取新闻文章成功',
      data: articles
    });
  } catch (error) {
    logger.error('获取新闻文章失败:', error);
    res.status(500).json({
      success: false,
      message: '获取新闻文章失败',
      error: error.message
    });
  }
});

// 任务调度管理路由
router.get('/scheduler/tasks', authenticateJWT, authorizeRoles('admin'), async (req, res) => {
  try {
    const schedulerService = req.app.get('schedulerService');
    const tasks = schedulerService.getTasks();

    res.json({
      success: true,
      message: '获取任务列表成功',
      data: tasks
    });
  } catch (error) {
    logger.error('获取任务列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取任务列表失败',
      error: error.message
    });
  }
});

router.post('/scheduler/tasks/:id/execute', authenticateJWT, authorizeRoles('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const schedulerService = req.app.get('schedulerService');
    const result = await schedulerService.executeTask(id);

    res.json({
      success: result.success,
      message: result.message,
      data: result.success ? result.result : null
    });
  } catch (error) {
    logger.error('执行任务失败:', error);
    res.status(500).json({
      success: false,
      message: '执行任务失败',
      error: error.message
    });
  }
});

// 邮件管理路由
router.post('/email/send', authenticateJWT, authorizeRoles('admin'), async (req, res) => {
  try {
    const emailService = req.app.get('emailService');
    const result = await emailService.sendEmail(req.body);

    res.json({
      success: result.success,
      message: result.success ? '邮件发送成功' : '邮件发送失败',
      data: result.success ? {
        messageId: result.messageId,
        provider: result.provider
      } : {
        error: result.error
      }
    });
  } catch (error) {
    logger.error('发送邮件失败:', error);
    res.status(500).json({
      success: false,
      message: '发送邮件失败',
      error: error.message
    });
  }
});

router.get('/email/history', authenticateJWT, authorizeRoles('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const emailService = req.app.get('emailService');

    const history = await emailService.getEmailHistory({
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    res.json({
      success: true,
      message: '获取邮件历史成功',
      data: history
    });
  } catch (error) {
    logger.error('获取邮件历史失败:', error);
    res.status(500).json({
      success: false,
      message: '获取邮件历史失败',
      error: error.message
    });
  }
});

// 系统操作路由
router.post('/system/cleanup', authenticateJWT, authorizeRoles('admin'), async (req, res) => {
  try {
    const cleanupService = req.app.get('cleanupService');
    const result = await cleanupService.performFullCleanup(req.body);

    res.json({
      success: true,
      message: '系统清理完成',
      data: result
    });
  } catch (error) {
    logger.error('系统清理失败:', error);
    res.status(500).json({
      success: false,
      message: '系统清理失败',
      error: error.message
    });
  }
});

router.post('/system/restart', authenticateJWT, authorizeRoles('admin'), async (req, res) => {
  try {
    const app = req.app.get('app');

    // 停止应用
    await app.stop();

    // 等待一小段时间
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 重新启动应用
    await app.start();

    res.json({
      success: true,
      message: '系统重启成功'
    });
  } catch (error) {
    logger.error('系统重启失败:', error);
    res.status(500).json({
      success: false,
      message: '系统重启失败',
      error: error.message
    });
  }
});

export default router;