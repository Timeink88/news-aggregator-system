/**
 * Email API Routes
 * 提供邮件相关的RESTful API端点
 * 遵循REST API最佳实践：安全性、错误处理、性能优化
 */

import { Router } from 'express';
import logger from '../utils/logger.js';

const router = Router();

/**
 * 发送邮件
 * POST /api/email/send
 */
router.post('/send', async (req, res) => {
  try {
    const { to, subject, content, type = 'notification', templateId, variables } = req.body;

    // 验证必填字段
    if (!to || !subject || !content) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        message: '收件人、主题和内容为必填字段'
      });
    }

    // 验证邮件地址格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_EMAIL',
        message: '请提供有效的邮件地址'
      });
    }

    const emailService = req.app.get('emailService');
    if (!emailService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '邮件服务暂不可用'
      });
    }

    const emailData = {
      to,
      subject,
      content,
      type,
      templateId,
      variables: variables || {}
    };

    const result = await emailService.sendEmail(emailData);

    res.json({
      success: result.success,
      message: result.success ? '邮件发送成功' : '邮件发送失败',
      data: result.success ? {
        messageId: result.messageId,
        provider: result.provider,
        sentAt: new Date().toISOString(),
        type
      } : {
        error: result.error
      }
    });

  } catch (error) {
    logger.error('发送邮件失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '发送邮件失败'
    });
  }
});

/**
 * 批量发送邮件
 * POST /api/email/send/batch
 */
router.post('/send/batch', async (req, res) => {
  try {
    const { emails } = req.body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_EMAILS',
        message: '请提供有效的邮件数组'
      });
    }

    if (emails.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'TOO_MANY_EMAILS',
        message: '批量发送的邮件数量不能超过100封'
      });
    }

    // 验证邮件数据
    for (const email of emails) {
      if (!email.to || !email.subject || !email.content) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_REQUIRED_FIELDS',
          message: '每封邮件都必须包含收件人、主题和内容'
        });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.to)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_EMAIL',
          message: `无效的邮件地址: ${email.to}`
        });
      }
    }

    const emailService = req.app.get('emailService');
    if (!emailService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '邮件服务暂不可用'
      });
    }

    const results = await emailService.sendBatchEmails(emails);

    res.json({
      success: true,
      message: '批量邮件发送完成',
      data: {
        totalEmails: emails.length,
        successfulSends: results.filter(r => r.success).length,
        failedSends: results.filter(r => !r.success).length,
        results,
        executionTime: results.reduce((sum, r) => sum + (r.executionTime || 0), 0)
      }
    });

  } catch (error) {
    logger.error('批量发送邮件失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '批量发送邮件失败'
    });
  }
});

/**
 * 创建邮件模板
 * POST /api/email/templates
 */
router.post('/templates', async (req, res) => {
  try {
    const { name, subject, content, description, category = 'general' } = req.body;

    // 验证必填字段
    if (!name || !subject || !content) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        message: '模板名称、主题和内容为必填字段'
      });
    }

    const emailService = req.app.get('emailService');
    if (!emailService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '邮件服务暂不可用'
      });
    }

    const templateData = {
      name: name.trim(),
      subject: subject.trim(),
      content: content.trim(),
      description: description ? description.trim() : '',
      category
    };

    const result = await emailService.createTemplate(templateData);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'TEMPLATE_CREATE_FAILED',
        message: result.message || '创建邮件模板失败'
      });
    }

    res.status(201).json({
      success: true,
      message: '邮件模板创建成功',
      data: result.template
    });

  } catch (error) {
    logger.error('创建邮件模板失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '创建邮件模板失败'
    });
  }
});

/**
 * 获取邮件模板列表
 * GET /api/email/templates
 */
router.get('/templates', async (req, res) => {
  try {
    const { category, page = 1, limit = 20 } = req.query;

    const emailService = req.app.get('emailService');
    if (!emailService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '邮件服务暂不可用'
      });
    }

    const options = {
      category,
      page: Math.max(1, parseInt(page)),
      limit: Math.min(100, Math.max(1, parseInt(limit)))
    };

    const result = await emailService.getTemplates(options);

    res.json({
      success: true,
      message: '获取邮件模板列表成功',
      data: {
        templates: result.templates || [],
        pagination: result.pagination || {
          page: options.page,
          limit: options.limit,
          total: result.total || 0
        }
      }
    });

  } catch (error) {
    logger.error('获取邮件模板列表失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取邮件模板列表失败'
    });
  }
});

/**
 * 获取单个邮件模板
 * GET /api/email/templates/:id
 */
router.get('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ID',
        message: '请提供有效的模板ID'
      });
    }

    const emailService = req.app.get('emailService');
    if (!emailService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '邮件服务暂不可用'
      });
    }

    const template = await emailService.getTemplateById(id);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'TEMPLATE_NOT_FOUND',
        message: '邮件模板未找到'
      });
    }

    res.json({
      success: true,
      message: '获取邮件模板成功',
      data: template
    });

  } catch (error) {
    logger.error('获取邮件模板失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取邮件模板失败'
    });
  }
});

/**
 * 更新邮件模板
 * PUT /api/email/templates/:id
 */
router.put('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, subject, content, description, category, isActive } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ID',
        message: '请提供有效的模板ID'
      });
    }

    const emailService = req.app.get('emailService');
    if (!emailService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '邮件服务暂不可用'
      });
    }

    // 构建更新数据
    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (subject !== undefined) updateData.subject = subject.trim();
    if (content !== undefined) updateData.content = content.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (category !== undefined) updateData.category = category;
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    const result = await emailService.updateTemplate(id, updateData);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'TEMPLATE_UPDATE_FAILED',
        message: result.message || '更新邮件模板失败'
      });
    }

    res.json({
      success: true,
      message: '邮件模板更新成功',
      data: result.template
    });

  } catch (error) {
    logger.error('更新邮件模板失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '更新邮件模板失败'
    });
  }
});

/**
 * 删除邮件模板
 * DELETE /api/email/templates/:id
 */
router.delete('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ID',
        message: '请提供有效的模板ID'
      });
    }

    const emailService = req.app.get('emailService');
    if (!emailService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '邮件服务暂不可用'
      });
    }

    const result = await emailService.deleteTemplate(id);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'TEMPLATE_DELETE_FAILED',
        message: result.message || '删除邮件模板失败'
      });
    }

    res.json({
      success: true,
      message: '邮件模板删除成功'
    });

  } catch (error) {
    logger.error('删除邮件模板失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '删除邮件模板失败'
    });
  }
});

/**
 * 渲染邮件模板
 * POST /api/email/templates/:id/render
 */
router.post('/templates/:id/render', async (req, res) => {
  try {
    const { id } = req.params;
    const { variables = {} } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ID',
        message: '请提供有效的模板ID'
      });
    }

    const emailService = req.app.get('emailService');
    if (!emailService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '邮件服务暂不可用'
      });
    }

    const result = await emailService.renderTemplate(id, variables);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'TEMPLATE_RENDER_FAILED',
        message: result.message || '渲染邮件模板失败'
      });
    }

    res.json({
      success: true,
      message: '邮件模板渲染成功',
      data: {
        subject: result.subject,
        content: result.content,
        variables
      }
    });

  } catch (error) {
    logger.error('渲染邮件模板失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '渲染邮件模板失败'
    });
  }
});

/**
 * 获取邮件发送历史
 * GET /api/email/history
 */
router.get('/history', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      type,
      status,
      startDate,
      endDate,
      to
    } = req.query;

    const emailService = req.app.get('emailService');
    if (!emailService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '邮件服务暂不可用'
      });
    }

    const options = {
      page: Math.max(1, parseInt(page)),
      limit: Math.min(100, Math.max(1, parseInt(limit))),
      type,
      status,
      startDate,
      endDate,
      to
    };

    const history = await emailService.getEmailHistory(options);

    res.json({
      success: true,
      message: '获取邮件历史成功',
      data: {
        emails: history.emails || [],
        pagination: history.pagination || {
          page: options.page,
          limit: options.limit,
          total: history.total || 0
        }
      }
    });

  } catch (error) {
    logger.error('获取邮件历史失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取邮件历史失败'
    });
  }
});

/**
 * 获取邮件统计信息
 * GET /api/email/statistics
 */
router.get('/statistics', async (req, res) => {
  try {
    const { timeframe = '24h' } = req.query;

    const emailService = req.app.get('emailService');
    if (!emailService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '邮件服务暂不可用'
      });
    }

    const statistics = await emailService.getStatistics({ timeframe });

    res.json({
      success: true,
      message: '获取邮件统计成功',
      data: {
        statistics,
        timeframe
      }
    });

  } catch (error) {
    logger.error('获取邮件统计失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取邮件统计失败'
    });
  }
});

/**
 * 发送每日摘要
 * POST /api/email/daily-digest
 */
router.post('/daily-digest', async (req, res) => {
  try {
    const { recipients, categories, maxArticles = 10 } = req.body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_RECIPIENTS',
        message: '请提供有效的收件人列表'
      });
    }

    // 验证邮件地址
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const recipient of recipients) {
      if (!emailRegex.test(recipient)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_EMAIL',
          message: `无效的邮件地址: ${recipient}`
        });
      }
    }

    const emailService = req.app.get('emailService');
    if (!emailService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '邮件服务暂不可用'
      });
    }

    const result = await emailService.sendDailyDigest({
      recipients,
      categories,
      maxArticles
    });

    res.json({
      success: result.success,
      message: result.success ? '每日摘要发送成功' : '每日摘要发送失败',
      data: result.success ? {
        digestId: result.digestId,
        recipientsCount: recipients.length,
        articlesIncluded: result.articlesCount,
        sentAt: new Date().toISOString()
      } : {
        error: result.error
      }
    });

  } catch (error) {
    logger.error('发送每日摘要失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '发送每日摘要失败'
    });
  }
});

/**
 * 获取邮件队列状态
 * GET /api/email/queue/status
 */
router.get('/queue/status', async (req, res) => {
  try {
    const emailService = req.app.get('emailService');
    if (!emailService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '邮件服务暂不可用'
      });
    }

    const queueStatus = await emailService.getQueueStatus();

    res.json({
      success: true,
      message: '获取邮件队列状态成功',
      data: queueStatus
    });

  } catch (error) {
    logger.error('获取邮件队列状态失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '获取邮件队列状态失败'
    });
  }
});

/**
 * 测试邮件配置
 * POST /api/email/test
 */
router.post('/test', async (req, res) => {
  try {
    const { to } = req.body;

    if (!to) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_EMAIL',
        message: '请提供测试邮件地址'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_EMAIL',
        message: '请提供有效的邮件地址'
      });
    }

    const emailService = req.app.get('emailService');
    if (!emailService) {
      return res.status(503).json({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: '邮件服务暂不可用'
      });
    }

    const result = await emailService.testConnection(to);

    res.json({
      success: result.success,
      message: result.success ? '邮件配置测试成功' : '邮件配置测试失败',
      data: result.success ? {
        testEmail: to,
        sentAt: new Date().toISOString(),
        provider: result.provider
      } : {
        error: result.error
      }
    });

  } catch (error) {
    logger.error('测试邮件配置失败:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '测试邮件配置失败'
    });
  }
});

export default router;