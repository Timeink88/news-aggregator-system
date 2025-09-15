/**
 * API Routes Index
 * 统一导出所有API路由模块
 */

import newsRoutes from './news.js';
import rssRoutes from './rss.js';
import aiRoutes from './ai.js';
import emailRoutes from './email.js';
import configRoutes from './config.js';
import schedulerRoutes from './scheduler.js';
import cleanupRoutes from './cleanup.js';
import adminRoutes from './admin.js';
import healthRoutes from './health.js';
import monitoringRoutes from './monitoring.js';

/**
 * 路由配置对象
 * 包含所有API路由的基本信息和路径前缀
 */
export const routeConfig = {
  // 新闻相关路由
  news: {
    path: '/api/news',
    description: '新闻文章管理API',
    version: '1.0.0',
    routes: newsRoutes
  },

  // RSS源管理路由
  rss: {
    path: '/api/rss',
    description: 'RSS源管理API',
    version: '1.0.0',
    routes: rssRoutes
  },

  // AI分析路由
  ai: {
    path: '/api/ai',
    description: 'AI分析服务API',
    version: '1.0.0',
    routes: aiRoutes
  },

  // 邮件服务路由
  email: {
    path: '/api/email',
    description: '邮件服务API',
    version: '1.0.0',
    routes: emailRoutes
  },

  // 配置管理路由
  config: {
    path: '/api/config',
    description: '配置管理API',
    version: '1.0.0',
    routes: configRoutes
  },

  // 任务调度路由
  scheduler: {
    path: '/api/scheduler',
    description: '任务调度API',
    version: '1.0.0',
    routes: schedulerRoutes
  },

  // 系统清理路由
  cleanup: {
    path: '/api/cleanup',
    description: '系统清理API',
    version: '1.0.0',
    routes: cleanupRoutes
  },

  // 管理后台路由
  admin: {
    path: '/api/admin',
    description: 'Web管理后台API',
    version: '1.0.0',
    routes: adminRoutes
  },

  // 健康检查路由
  health: {
    path: '/api/health',
    description: '系统健康检查API',
    version: '1.0.0',
    routes: healthRoutes
  },

  // 监控指标路由
  monitoring: {
    path: '/api/monitoring',
    description: '系统监控指标API',
    version: '1.0.0',
    routes: monitoringRoutes
  }
};

/**
 * 注册所有路由到Express应用
 * @param {Express} app - Express应用实例
 */
export function registerRoutes(app) {
  // 注册新闻路由
  app.use(routeConfig.news.path, routeConfig.news.routes);

  // 注册RSS路由
  app.use(routeConfig.rss.path, routeConfig.rss.routes);

  // 注册AI分析路由
  app.use(routeConfig.ai.path, routeConfig.ai.routes);

  // 注册邮件路由
  app.use(routeConfig.email.path, routeConfig.email.routes);

  // 注册配置路由
  app.use(routeConfig.config.path, routeConfig.config.routes);

  // 注册调度路由
  app.use(routeConfig.scheduler.path, routeConfig.scheduler.routes);

  // 注册清理路由
  app.use(routeConfig.cleanup.path, routeConfig.cleanup.routes);

  // 注册管理后台路由
  app.use(routeConfig.admin.path, routeConfig.admin.routes);

  // 注册健康检查路由
  app.use(routeConfig.health.path, routeConfig.health.routes);

  // 注册监控指标路由
  app.use(routeConfig.monitoring.path, routeConfig.monitoring.routes);

  // API信息路由
  app.get('/api', (req, res) => {
    const apiInfo = {
      name: 'News Aggregator System API',
      version: '1.0.0',
      description: '新闻聚合系统API接口',
      endpoints: Object.keys(routeConfig).map(key => ({
        name: key,
        path: routeConfig[key].path,
        description: routeConfig[key].description,
        version: routeConfig[key].version
      })),
      documentation: '/api/docs',
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      message: 'API信息获取成功',
      data: apiInfo
    });
  });

  // 健康检查路由
  app.get('/api/health', (req, res) => {
    res.json({
      success: true,
      message: '系统健康状态正常',
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: '1.0.0'
      }
    });
  });
}

/**
 * 获取路由信息
 * @returns {Object} 路由配置信息
 */
export function getRouteInfo() {
  return routeConfig;
}

/**
 * 根据路径前缀获取路由
 * @param {string} pathPrefix - 路径前缀
 * @returns {Object|null} 路由配置
 */
export function getRouteByPath(pathPrefix) {
  for (const [key, config] of Object.entries(routeConfig)) {
    if (config.path === pathPrefix) {
      return {
        name: key,
        ...config
      };
    }
  }
  return null;
}

// 默认导出路由配置
export default routeConfig;