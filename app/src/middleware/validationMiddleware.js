/**
 * 验证中间件
 * 提供请求数据验证和清理功能
 * 遵循Node.js最佳实践：安全性、错误处理、性能优化
 */

import { body, param, query, validationResult } from 'express-validator';
import { ServiceError } from '../types/index.js';
import logger from '../utils/logger.js';

/**
 * 验证中间件类
 */
class ValidationMiddleware {
  constructor(config = {}) {
    this.config = {
      strictMode: config.strictMode !== false,
      stripUnknown: config.stripUnknown !== false,
      abortEarly: config.abortEarly !== false,
      enableSanitization: config.enableSanitization !== false,
      customValidators: config.customValidators || {}
    };

    // 预定义验证规则
    this.validationRules = {
      // 用户相关
      user: {
        register: [
          body('email').isEmail().withMessage('请提供有效的邮箱地址'),
          body('password').isLength({ min: 8 }).withMessage('密码至少需要8个字符'),
          body('password').matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('密码必须包含大小写字母和数字'),
          body('username').isLength({ min: 3, max: 20 }).withMessage('用户名长度必须在3-20个字符之间'),
          body('username').matches(/^[a-zA-Z0-9_]+$/).withMessage('用户名只能包含字母、数字和下划线')
        ],
        login: [
          body('email').isEmail().withMessage('请提供有效的邮箱地址'),
          body('password').notEmpty().withMessage('密码不能为空')
        ],
        update: [
          body('email').optional().isEmail().withMessage('请提供有效的邮箱地址'),
          body('username').optional().isLength({ min: 3, max: 20 }).withMessage('用户名长度必须在3-20个字符之间'),
          body('username').optional().matches(/^[a-zA-Z0-9_]+$/).withMessage('用户名只能包含字母、数字和下划线')
        ]
      },

      // RSS源相关
      rss: {
        create: [
          body('name').notEmpty().withMessage('RSS源名称不能为空'),
          body('name').isLength({ max: 100 }).withMessage('RSS源名称不能超过100个字符'),
          body('url').isURL().withMessage('请提供有效的URL'),
          body('category').isIn(['tech', 'finance', 'politics', 'sports', 'entertainment', 'health', 'science']).withMessage('请选择有效的分类'),
          body('language').optional().isIn(['zh', 'en', 'ja', 'ko']).withMessage('请选择有效的语言'),
          body('updateFrequency').optional().isInt({ min: 1, max: 1440 }).withMessage('更新频率必须在1-1440分钟之间')
        ],
        update: [
          param('id').isUUID().withMessage('请提供有效的RSS源ID'),
          body('name').optional().notEmpty().withMessage('RSS源名称不能为空'),
          body('name').optional().isLength({ max: 100 }).withMessage('RSS源名称不能超过100个字符'),
          body('url').optional().isURL().withMessage('请提供有效的URL'),
          body('category').optional().isIn(['tech', 'finance', 'politics', 'sports', 'entertainment', 'health', 'science']).withMessage('请选择有效的分类')
        ]
      },

      // 新闻相关
      news: {
        query: [
          query('page').optional().isInt({ min: 1 }).withMessage('页码必须大于0'),
          query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('每页数量必须在1-100之间'),
          query('category').optional().isIn(['tech', 'finance', 'politics', 'sports', 'entertainment', 'health', 'science']).withMessage('请选择有效的分类'),
          query('sortBy').optional().isIn(['published_at', 'created_at', 'updated_at']).withMessage('请选择有效的排序字段'),
          query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('请选择有效的排序方式'),
          query('search').optional().isLength({ max: 200 }).withMessage('搜索关键词不能超过200个字符')
        ]
      },

      // 配置相关
      config: {
        update: [
          body('key').notEmpty().withMessage('配置键不能为空'),
          body('key').matches(/^[a-zA-Z0-9_.-]+$/).withMessage('配置键只能包含字母、数字、下划线、点和连字符'),
          body('value').notEmpty().withMessage('配置值不能为空'),
          body('type').optional().isIn(['string', 'number', 'boolean', 'object']).withMessage('请选择有效的配置类型')
        ]
      },

      // 管理员相关
      admin: {
        userAction: [
          param('userId').isUUID().withMessage('请提供有效的用户ID'),
          body('action').isIn(['activate', 'deactivate', 'delete', 'promote', 'demote']).withMessage('请选择有效的操作')
        ]
      }
    };

    // 自定义验证器
    this.customValidators = {
      // 检查字符串是否只包含安全字符
      isSafeString: (value) => {
        return typeof value === 'string' && !/[<>\"'&]/.test(value);
      },

      // 检查密码强度
      isStrongPassword: (value) => {
        if (typeof value !== 'string') return false;
        const hasUpperCase = /[A-Z]/.test(value);
        const hasLowerCase = /[a-z]/.test(value);
        const hasNumbers = /\d/.test(value);
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(value);
        return hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChar;
      },

      // 检查日期格式
      isValidDate: (value) => {
        return !isNaN(Date.parse(value));
      },

      // 检查URL是否安全
      isSafeUrl: (value) => {
        try {
          const url = new URL(value);
          return ['http:', 'https:'].includes(url.protocol);
        } catch {
          return false;
        }
      }
    };

    // 添加自定义验证器
    this.addCustomValidators();
  }

  /**
   * 添加自定义验证器
   */
  addCustomValidators() {
    // 为express-validator添加自定义验证器
    // 注意：新版本的express-validator有不同的API
    try {
      Object.keys(this.customValidators).forEach(key => {
        if (body && body.prototype) {
          body.prototype[key] = function() {
            return this.custom(key, (value) => {
              const result = this.customValidators[key](value);
              if (!result) {
                throw new Error(`Invalid ${key}`);
              }
              return true;
            });
          };
        }
      });
    } catch (error) {
      logger.warn('无法添加自定义验证器:', error.message);
    }
  }

  /**
   * 验证中间件生成器
   */
  validate = (rules = []) => {
    return async (req, res, next) => {
      try {
        // 运行验证规则
        await Promise.all(rules.map(rule => rule.run(req)));

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          const formattedErrors = this.formatValidationErrors(errors.array());

          logger.warn('请求数据验证失败', {
            path: req.path,
            method: req.method,
            errors: formattedErrors
          });

          return res.status(400).json({
            success: false,
            error: 'VALIDATION_ERROR',
            message: '请求数据验证失败',
            errors: formattedErrors
          });
        }

        // 数据清理
        if (this.config.enableSanitization) {
          this.sanitizeRequest(req);
        }

        logger.debug('请求数据验证通过', { path: req.path, method: req.method });
        next();

      } catch (error) {
        logger.error('验证过程中发生错误:', error);
        res.status(500).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: '验证过程发生错误'
        });
      }
    };
  };

  /**
   * 获取预定义验证规则
   */
  getRules(group, type) {
    if (this.validationRules[group] && this.validationRules[group][type]) {
      return this.validationRules[group][type];
    }
    return [];
  }

  /**
   * 用户注册验证
   */
  userRegistration() {
    return this.validate(this.getRules('user', 'register'));
  }

  /**
   * 用户登录验证
   */
  userLogin() {
    return this.validate(this.getRules('user', 'login'));
  }

  /**
   * 用户更新验证
   */
  userUpdate() {
    return this.validate(this.getRules('user', 'update'));
  }

  /**
   * RSS源创建验证
   */
  rssSourceCreate() {
    return this.validate(this.getRules('rss', 'create'));
  }

  /**
   * RSS源更新验证
   */
  rssSourceUpdate() {
    return this.validate(this.getRules('rss', 'update'));
  }

  /**
   * 新闻查询验证
   */
  newsQuery() {
    return this.validate(this.getRules('news', 'query'));
  }

  /**
   * 配置更新验证
   */
  configUpdate() {
    return this.validate(this.getRules('config', 'update'));
  }

  /**
   * 管理员用户操作验证
   */
  adminUserAction() {
    return this.validate(this.getRules('admin', 'userAction'));
  }

  /**
   * 文件上传验证
   */
  fileUpload(options = {}) {
    const config = {
      maxSize: options.maxSize || 10 * 1024 * 1024, // 10MB
      allowedTypes: options.allowedTypes || ['image/jpeg', 'image/png', 'image/gif'],
      maxFiles: options.maxFiles || 1
    };

    return (req, res, next) => {
      if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).json({
          success: false,
          error: 'NO_FILE_UPLOADED',
          message: '没有上传文件'
        });
      }

      const files = Array.isArray(req.files.files) ? req.files.files : [req.files.files];

      if (files.length > config.maxFiles) {
        return res.status(400).json({
          success: false,
          error: 'TOO_MANY_FILES',
          message: `最多只能上传 ${config.maxFiles} 个文件`
        });
      }

      for (const file of files) {
        if (file.size > config.maxSize) {
          return res.status(400).json({
            success: false,
            error: 'FILE_TOO_LARGE',
            message: `文件大小不能超过 ${config.maxSize / 1024 / 1024}MB`
          });
        }

        if (!config.allowedTypes.includes(file.mimetype)) {
          return res.status(400).json({
            success: false,
            error: 'INVALID_FILE_TYPE',
            message: '不支持的文件类型'
          });
        }
      }

      next();
    };
  }

  /**
   * 分页验证
   */
  pagination() {
    return this.validate([
      query('page').optional().isInt({ min: 1 }).withMessage('页码必须大于0'),
      query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('每页数量必须在1-100之间')
    ]);
  }

  /**
   * ID参数验证
   */
  idParam(paramName = 'id') {
    return this.validate([
      param(paramName).isUUID().withMessage('请提供有效的ID')
    ]);
  }

  /**
   * 搜索查询验证
   */
  searchQuery() {
    return this.validate([
      query('q').optional().isLength({ max: 200 }).withMessage('搜索关键词不能超过200个字符'),
      query('page').optional().isInt({ min: 1 }).withMessage('页码必须大于0'),
      query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('每页数量必须在1-100之间')
    ]);
  }

  /**
   * 日期范围验证
   */
  dateRange(startDateParam = 'startDate', endDateParam = 'endDate') {
    return this.validate([
      query(startDateParam).optional().isISO8601().withMessage('开始日期格式无效'),
      query(endDateParam).optional().isISO8601().withMessage('结束日期格式无效')
    ]);
  }

  /**
   * 格式化验证错误
   */
  formatValidationErrors(errors) {
    return errors.map(error => ({
      field: error.path.join('.'),
      message: error.msg,
      value: error.value,
      type: error.type
    }));
  }

  /**
   * 清理请求数据
   */
  sanitizeRequest(req) {
    // 清理body数据
    if (req.body) {
      this.sanitizeObject(req.body);
    }

    // 清理query参数
    if (req.query) {
      this.sanitizeObject(req.query);
    }

    // 清理params参数
    if (req.params) {
      this.sanitizeObject(req.params);
    }
  }

  /**
   * 清理对象
   */
  sanitizeObject(obj) {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        // 移除危险字符
        obj[key] = obj[key].replace(/[<>\"'&]/g, '');

        // 移除前后空格
        obj[key] = obj[key].trim();
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        this.sanitizeObject(obj[key]);
      }
    }
  }

  /**
   * 自定义验证规则
   */
  addCustomRule(name, validator, errorMessage) {
    this.customValidators[name] = validator;

    body.prototype[name] = function() {
      return this.custom(name, (value) => {
        const result = validator(value);
        if (!result) {
          throw new Error(errorMessage || `Invalid ${name}`);
        }
        return true;
      });
    };
  }

  /**
   * 批量验证
   */
  validateMultiple(validators) {
    return async (req, res, next) => {
      for (const validator of validators) {
        try {
          await new Promise((resolve, reject) => {
            validator(req, res, (err) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          });
        } catch (error) {
          return next(error);
        }
      }
      next();
    };
  }

  /**
   * 条件验证
   */
  conditional(condition, validator) {
    return async (req, res, next) => {
      try {
        const shouldValidate = await condition(req);
        if (shouldValidate) {
          return validator(req, res, next);
        }
        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * 获取验证统计
   */
  getStats() {
    return {
      strictMode: this.config.strictMode,
      stripUnknown: this.config.stripUnknown,
      enableSanitization: this.config.enableSanitization,
      customValidators: Object.keys(this.customValidators).length,
      predefinedRules: Object.keys(this.validationRules).reduce((total, group) => {
        return total + Object.keys(this.validationRules[group]).length;
      }, 0)
    };
  }
}

export default ValidationMiddleware;