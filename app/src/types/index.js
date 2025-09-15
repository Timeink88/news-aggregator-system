/**
 * 类型定义文件
 * 定义数据库模型和接口类型
 */

// RSS源类型
export class RSSSource {
  constructor(data = {}) {
    this.id = data.id;
    this.name = data.name;
    this.url = data.url;
    this.description = data.description;
    this.category = data.category;
    this.language = data.language;
    this.website_url = data.website_url;
    this.favicon_url = data.favicon_url;
    this.is_active = data.is_active;
    this.fetch_interval = data.fetch_interval;
    this.last_fetched_at = data.last_fetched_at;
    this.last_fetch_status = data.last_fetch_status;
    this.fetch_error_count = data.fetch_error_count;
    this.total_articles_fetched = data.total_articles_fetched;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }
}

// 新闻文章类型
export class NewsArticle {
  constructor(data = {}) {
    this.id = data.id;
    this.title = data.title;
    this.content = data.content;
    this.summary = data.summary;
    this.url = data.url;
    this.image_url = data.image_url;
    this.author = data.author;
    this.source_type = data.source_type;
    this.source_id = data.source_id;
    this.newsapi_source_id = data.newsapi_source_id;
    this.original_language = data.original_language;
    this.category = data.category;
    this.published_at = data.published_at;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.is_active = data.is_active;
    this.view_count = data.view_count;
    this.share_count = data.share_count;
    this.word_count = data.word_count;
    this.reading_time = data.reading_time;
    this.tags = data.tags;
    this.metadata = data.metadata;
  }
}

// NewsAPI源类型
export class NewsAPISource {
  constructor(data = {}) {
    this.id = data.id;
    this.source_id = data.source_id;
    this.name = data.name;
    this.description = data.description;
    this.category = data.category;
    this.language = data.language;
    this.country = data.country;
    this.is_active = data.is_active;
    this.api_config = data.api_config;
    this.last_fetched_at = data.last_fetched_at;
    this.total_articles_fetched = data.total_articles_fetched;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }
}

// 新闻聚合组类型
export class NewsAggregationGroup {
  constructor(data = {}) {
    this.id = data.id;
    this.group_key = data.group_key;
    this.title = data.title;
    this.summary = data.summary;
    this.category = data.category;
    this.article_count = data.article_count;
    this.confidence_score = data.confidence_score;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.metadata = data.metadata;
  }
}

// 翻译任务类型
export class TranslationTask {
  constructor(data = {}) {
    this.id = data.id;
    this.article_id = data.article_id;
    this.source_language = data.source_language;
    this.target_language = data.target_language;
    this.translation_service = data.translation_service;
    this.status = data.status;
    this.source_text = data.source_text;
    this.translated_text = data.translated_text;
    this.error_message = data.error_message;
    this.retry_count = data.retry_count;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.metadata = data.metadata;
  }
}

// AI分析任务类型
export class AIAnalysisTask {
  constructor(data = {}) {
    this.id = data.id;
    this.article_id = data.article_id;
    this.task_type = data.task_type;
    this.status = data.status;
    this.ai_service = data.ai_service;
    this.prompt = data.prompt;
    this.result = data.result;
    this.error_message = data.error_message;
    this.retry_count = data.retry_count;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.metadata = data.metadata;
  }
}

// 用户类型
export class User {
  constructor(data = {}) {
    this.id = data.id;
    this.email = data.email;
    this.name = data.name;
    this.avatar_url = data.avatar_url;
    this.preferences = data.preferences;
    this.is_active = data.is_active;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }
}

// 定时任务类型
export class ScheduledTask {
  constructor(data = {}) {
    this.id = data.id;
    this.task_name = data.task_name;
    this.task_type = data.task_type;
    this.status = data.status;
    this.schedule_config = data.schedule_config;
    this.last_run_at = data.last_run_at;
    this.next_run_at = data.next_run_at;
    this.run_count = data.run_count;
    this.error_count = data.error_count;
    this.last_error_message = data.last_error_message;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.metadata = data.metadata;
  }
}

// 分页结果类型
export class PaginatedResult {
  constructor(data = {}) {
    this.data = data.data || [];
    this.pagination = data.pagination || {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0
    };
  }
}

// 服务配置类型
export class ServiceConfig {
  constructor(data = {}) {
    this.enabled = data.enabled !== false;
    this.apiKey = data.apiKey;
    this.timeout = data.timeout || 30000;
    this.maxRetries = data.maxRetries || 3;
    this.retryDelay = data.retryDelay || 1000;
    this.maxConcurrent = data.maxConcurrent || 3;
  }
}

// API响应类型
export class APIResponse {
  constructor(data = {}) {
    this.success = data.success !== false;
    this.data = data.data;
    this.error = data.error;
    this.message = data.message;
    this.timestamp = data.timestamp || new Date().toISOString();
  }
}

// 错误类型
export class ServiceError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

