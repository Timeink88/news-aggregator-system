/**
 * RSS Manager配置文件
 * 定义RSS抓取的默认配置、源配置和验证规则
 */

/**
 * 默认RSS配置
 */
export const DEFAULT_RSS_CONFIG = {
  // 基础配置
  timeout: 30000, // 请求超时时间（毫秒）
  maxRetries: 3, // 最大重试次数
  retryDelay: 1000, // 重试延迟（毫秒）

  // 请求配置
  userAgent: 'NewsAggregator/1.0',
  headers: {
    'Accept': 'application/rss+xml, application/rdf+xml, application/atom+xml, application/xml, text/xml',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br'
  },

  // 内容处理配置
  maxContentLength: 50000, // 最大内容长度（字符）
  maxTitleLength: 200, // 最大标题长度（字符）
  defaultLanguage: 'zh', // 默认语言

  // 抓取配置
  maxArticlesPerSource: 100, // 每个源最大文章数
  maxAgeDays: 7, // 最大文章年龄（天）
  skipOlderThan: 30, // 跳过超过N天的文章

  // 并发配置
  maxConcurrentFetches: 5, // 最大并发抓取数
  batchSize: 10, // 批量处理大小
  batchDelay: 1000, // 批次间延迟（毫秒）

  // 清理配置
  cleanupInterval: 6 * 60 * 60 * 1000, // 清理间隔（毫秒）
  staleFetchTimeout: 30 * 60 * 1000, // 过期抓取超时（毫秒）

  // 验证配置
  validation: {
    requiredFields: ['title', 'link'],
    minLength: {
      title: 5,
      content: 50
    },
    allowedContentTypes: [
      'application/rss+xml',
      'application/rdf+xml',
      'application/atom+xml',
      'application/xml',
      'text/xml',
      'text/html'
    ]
  }
};

/**
 * RSS源类别配置
 */
export const RSS_CATEGORIES = {
  tech: {
    name: '科技',
    description: '科技新闻和技术资讯',
    priority: 1,
    defaultSources: [
      '36kr',
      'huxiu',
      'techcrunch',
      'the-verge',
      'wired',
      'ars-technica'
    ]
  },
  finance: {
    name: '财经',
    description: '财经新闻和市场资讯',
    priority: 2,
    defaultSources: [
      'caixin',
      'yicai',
      'bloomberg',
      'reuters',
      'financial-times',
      'wall-street-journal'
    ]
  },
  politics: {
    name: '政治',
    description: '政治新闻和时事分析',
    priority: 3,
    defaultSources: [
      'xinhua',
      'people',
      'bbc-news',
      'cnn',
      'associated-press',
      'reuters'
    ]
  }
};

/**
 * 语言配置
 */
export const LANGUAGE_CONFIGS = {
  zh: {
    name: '中文',
    direction: 'ltr',
    sentenceSplitter: /[。！？.!?]/,
    wordSplitter: /\s+/,
    dateFormat: 'YYYY-MM-DD',
    timeFormat: 'HH:mm:ss'
  },
  en: {
    name: 'English',
    direction: 'ltr',
    sentenceSplitter: /[.!?]/,
    wordSplitter: /\s+/,
    dateFormat: 'YYYY-MM-DD',
    timeFormat: 'HH:mm:ss'
  }
};

/**
 * 错误配置
 */
export const ERROR_CONFIG = {
  // 重试错误类型
  retryableErrors: [
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'ENOTFOUND',
    'EAI_AGAIN'
  ],

  // 最大重试次数（按错误类型）
  maxRetries: {
    network: 3,
    timeout: 2,
    server: 1,
    validation: 0
  },

  // 重试延迟（毫秒）
  retryDelays: {
    network: 1000,
    timeout: 2000,
    server: 5000
  }
};

/**
 * 缓存配置
 */
export const CACHE_CONFIG = {
  enabled: true,
  ttl: 3600, // 缓存时间（秒）
  maxSize: 1000, // 最大缓存条目数
  cleanupInterval: 60 * 60 * 1000, // 清理间隔（毫秒）

  // 缓存键前缀
  keyPrefixes: {
    feed: 'rss:feed',
    article: 'rss:article',
    validation: 'rss:validation'
  }
};

/**
 * 监控配置
 */
export const MONITORING_CONFIG = {
  enabled: true,

  // 指标收集
  metrics: {
    fetchCount: true,
    fetchDuration: true,
    errorCount: true,
    successRate: true,
    articleCount: true
  },

  // 警报阈值
  alerts: {
    highErrorRate: {
      enabled: true,
      threshold: 0.1, // 10%
      windowSize: 600 // 10分钟
    },
    slowResponse: {
      enabled: true,
      threshold: 30000, // 30秒
      windowSize: 300 // 5分钟
    },
    lowSuccessRate: {
      enabled: true,
      threshold: 0.8, // 80%
      windowSize: 1800 // 30分钟
    }
  },

  // 报告间隔
  reporting: {
    interval: 60 * 1000, // 1分钟
    historySize: 1440 // 24小时
  }
};

/**
 * 安全配置
 */
export const SECURITY_CONFIG = {
  // URL验证
  urlValidation: {
    allowedProtocols: ['http:', 'https:'],
    allowedPorts: [80, 443, 8080, 8443],
    maxUrlLength: 2048,
    blockedDomains: [],
    allowedDomains: []
  },

  // 内容过滤
  contentFiltering: {
    enabled: true,
    blockedWords: [
      'spam',
      'scam',
      'fake news',
      'clickbait'
    ],
    maxLinks: 10,
    maxImages: 20,
    allowedImageFormats: ['jpg', 'jpeg', 'png', 'gif', 'webp']
  },

  // 请求限制
  rateLimiting: {
    enabled: true,
    maxRequestsPerMinute: 60,
    maxRequestsPerHour: 1000,
    maxConcurrentRequests: 5
  }
};

/**
 * 开发环境配置
 */
export const DEVELOPMENT_CONFIG = {
  ...DEFAULT_RSS_CONFIG,

  // 调试模式
  debug: true,

  // 更宽松的限制
  timeout: 60000,
  maxRetries: 1,
  maxConcurrentFetches: 2,

  // 详细日志
  logging: {
    level: 'debug',
    enablePerformance: true,
    enableErrors: true,
    enableNetwork: true
  }
};

/**
 * 生产环境配置
 */
export const PRODUCTION_CONFIG = {
  ...DEFAULT_RSS_CONFIG,

  // 严格的限制
  timeout: 30000,
  maxRetries: 3,
  maxConcurrentFetches: 10,

  // 简化的日志
  logging: {
    level: 'info',
    enablePerformance: true,
    enableErrors: true,
    enableNetwork: false
  },

  // 启用所有安全功能
  security: {
    ...SECURITY_CONFIG,
    rateLimiting: {
      enabled: true,
      maxRequestsPerMinute: 120,
      maxRequestsPerHour: 2000,
      maxConcurrentRequests: 10
    }
  }
};

/**
 * 测试环境配置
 */
export const TEST_CONFIG = {
  ...DEFAULT_RSS_CONFIG,

  // 测试特定配置
  timeout: 5000,
  maxRetries: 1,
  maxConcurrentFetches: 1,

  // 模拟数据
  mockData: true,

  // 快速失败
  failFast: true
};

/**
 * 根据环境获取配置
 * @param {string} environment - 环境名称
 * @returns {Object} 配置对象
 */
export function getConfig(environment = 'development') {
  switch (environment) {
  case 'production':
    return PRODUCTION_CONFIG;
  case 'test':
    return TEST_CONFIG;
  case 'development':
  default:
    return DEVELOPMENT_CONFIG;
  }
}

/**
 * 验证RSS源配置
 * @param {Object} source - RSS源配置
 * @returns {Object} 验证结果
 */
export function validateSourceConfig(source) {
  const errors = [];

  // 基础字段验证
  if (!source.name || source.name.trim().length === 0) {
    errors.push('RSS源名称不能为空');
  }

  if (!source.url || source.url.trim().length === 0) {
    errors.push('RSS源URL不能为空');
  }

  // URL格式验证
  try {
    new URL(source.url);
  } catch {
    errors.push('RSS源URL格式无效');
  }

  // 类别验证
  if (!source.category || !RSS_CATEGORIES[source.category]) {
    errors.push('RSS源类别无效');
  }

  // 语言验证
  if (source.language && !LANGUAGE_CONFIGS[source.language]) {
    errors.push('RSS源语言无效');
  }

  // 抓取间隔验证
  if (source.fetch_interval && (source.fetch_interval < 60 || source.fetch_interval > 86400)) {
    errors.push('抓取间隔必须在60-86400秒之间');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 合并用户配置与默认配置
 * @param {Object} userConfig - 用户配置
 * @param {string} environment - 环境名称
 * @returns {Object} 合并后的配置
 */
export function mergeConfig(userConfig = {}, environment = 'development') {
  const baseConfig = getConfig(environment);

  return {
    ...baseConfig,
    ...userConfig,
    // 深度合并嵌套对象
    headers: {
      ...baseConfig.headers,
      ...userConfig.headers
    },
    validation: {
      ...baseConfig.validation,
      ...userConfig.validation
    },
    monitoring: {
      ...baseConfig.monitoring,
      ...userConfig.monitoring
    },
    security: {
      ...baseConfig.security,
      ...userConfig.security
    }
  };
}

// 导出默认配置
export default DEFAULT_RSS_CONFIG;