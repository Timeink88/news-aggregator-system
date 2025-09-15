/**
 * 新闻聚合系统类型定义
 * 遵循TypeScript最佳实践：严格类型检查、接口定义、类型安全
 */

// === 基础类型定义 ===

/**
 * UUID类型
 */
export type UUID = string;

/**
 * 时间戳类型
 */
export type Timestamp = string;

/**
 * 通用状态枚举
 */
export enum Status {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DELETED = 'deleted'
}

/**
 * 分页参数接口
 */
export interface PaginationParams {
  page: number;
  limit: number;
  offset?: number;
}

/**
 * 分页结果接口
 */
export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * 排序参数接口
 */
export interface SortParams {
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

/**
 * 查询过滤器接口
 */
export interface QueryFilter {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in' | 'nin';
  value: any;
}

/**
 * 查询参数接口
 */
export interface QueryParams {
  pagination?: PaginationParams;
  sort?: SortParams;
  filters?: QueryFilter[];
  search?: string;
}

// === RSS源相关类型 ===

/**
 * RSS源类型枚举
 */
export enum RSSSourceType {
  NEWS = 'news',
  BLOG = 'blog',
  PODCAST = 'podcast',
  VIDEO = 'video',
  FORUM = 'forum',
  OTHER = 'other'
}

/**
 * RSS源获取频率枚举
 */
export enum RSSFetchFrequency {
  REALTIME = 'realtime',
  EVERY_5_MINUTES = 'every_5_minutes',
  EVERY_15_MINUTES = 'every_15_minutes',
  EVERY_30_MINUTES = 'every_30_minutes',
  HOURLY = 'hourly',
  DAILY = 'daily'
}

/**
 * RSS源接口
 */
export interface RSSSource {
  id: UUID;
  name: string;
  url: string;
  description?: string;
  type: RSSSourceType;
  category: string;
  language: string;
  country: string;
  fetch_frequency: RSSFetchFrequency;
  last_fetched_at?: Timestamp;
  last_fetch_status?: Status;
  fetch_error_count: number;
  is_active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
  metadata?: {
    favicon?: string;
    logo?: string;
    feed_title?: string;
    feed_description?: string;
    author?: string;
    tags?: string[];
  };
}

/**
 * 创建RSS源参数接口
 */
export interface CreateRSSSourceParams {
  name: string;
  url: string;
  description?: string;
  type: RSSSourceType;
  category: string;
  language: string;
  country: string;
  fetch_frequency: RSSFetchFrequency;
  metadata?: RSSSource['metadata'];
}

/**
 * 更新RSS源参数接口
 */
export interface UpdateRSSSourceParams {
  name?: string;
  url?: string;
  description?: string;
  type?: RSSSourceType;
  category?: string;
  language?: string;
  country?: string;
  fetch_frequency?: RSSFetchFrequency;
  is_active?: boolean;
  metadata?: RSSSource['metadata'];
}

// === 新闻文章相关类型 ===

/**
 * 文章状态枚举
 */
export enum ArticleStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
  DELETED = 'deleted'
}

/**
 * 文章来源类型枚举
 */
export enum ArticleSourceType {
  RSS = 'rss',
  WEB_SCRAPING = 'web_scraping',
  API = 'api',
  MANUAL = 'manual'
}

/**
 * 新闻文章接口
 */
export interface NewsArticle {
  id: UUID;
  title: string;
  content: string;
  summary: string;
  url: string;
  author?: string;
  source_id: UUID;
  source_name: string;
  source_type: ArticleSourceType;
  category: string;
  tags: string[];
  publish_date: Timestamp;
  fetched_at: Timestamp;
  status: ArticleStatus;
  language: string;
  country: string;
  reading_time?: number;
  word_count: number;
  image_url?: string;
  metadata?: {
    keywords?: string[];
    entities?: any[];
    sentiment?: {
      score: number;
      label: 'positive' | 'negative' | 'neutral';
      confidence: number;
    };
    categories?: {
      primary: string;
      secondary: string[];
      confidence: number;
    };
  };
  created_at: Timestamp;
  updated_at: Timestamp;
}

/**
 * 创建新闻文章参数接口
 */
export interface CreateNewsArticleParams {
  title: string;
  content: string;
  summary: string;
  url: string;
  author?: string;
  source_id: UUID;
  source_name: string;
  source_type: ArticleSourceType;
  category: string;
  tags: string[];
  publish_date: Timestamp;
  language: string;
  country: string;
  image_url?: string;
  metadata?: NewsArticle['metadata'];
}

/**
 * 更新新闻文章参数接口
 */
export interface UpdateNewsArticleParams {
  title?: string;
  content?: string;
  summary?: string;
  author?: string;
  category?: string;
  tags?: string[];
  status?: ArticleStatus;
  image_url?: string;
  metadata?: NewsArticle['metadata'];
}

// === 股票实体相关类型 ===

/**
 * 股票实体类型枚举
 */
export enum StockEntityType {
  COMPANY = 'company',
  STOCK = 'stock',
  INDUSTRY = 'industry',
  MARKET = 'market'
}

/**
 * 股票实体接口
 */
export interface StockEntity {
  id: UUID;
  name: string;
  symbol: string;
  type: StockEntityType;
  industry?: string;
  sector?: string;
  country: string;
  currency: string;
  market_cap?: number;
  current_price?: number;
  price_change?: number;
  price_change_percent?: number;
  is_active: boolean;
  metadata?: {
    description?: string;
    website?: string;
    logo?: string;
    employees?: number;
    founded?: number;
    ceo?: string;
    exchange?: string;
    isin?: string;
    cusip?: string;
  };
  created_at: Timestamp;
  updated_at: Timestamp;
}

/**
 * 创建股票实体参数接口
 */
export interface CreateStockEntityParams {
  name: string;
  symbol: string;
  type: StockEntityType;
  industry?: string;
  sector?: string;
  country: string;
  currency: string;
  metadata?: StockEntity['metadata'];
}

/**
 * 更新股票实体参数接口
 */
export interface UpdateStockEntityParams {
  name?: string;
  symbol?: string;
  type?: StockEntityType;
  industry?: string;
  sector?: string;
  country?: string;
  currency: string;
  is_active?: boolean;
  metadata?: StockEntity['metadata'];
}

// === 用户相关类型 ===

/**
 * 用户角色枚举
 */
export enum UserRole {
  ADMIN = 'admin',
  EDITOR = 'editor',
  USER = 'user',
  GUEST = 'guest'
}

/**
 * 用户状态枚举
 */
export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING = 'pending'
}

/**
 * 用户偏好设置接口
 */
export interface UserPreferences {
  language: string;
  timezone: string;
  categories: string[];
  sources: string[];
  countries: string[];
  keywords: string[];
  notification_settings: {
    email: boolean;
    push: boolean;
    digest: boolean;
    alerts: boolean;
  };
  display_settings: {
    theme: 'light' | 'dark' | 'auto';
    articles_per_page: number;
    summary_length: 'short' | 'medium' | 'long';
  };
}

/**
 * 用户接口
 */
export interface User {
  id: UUID;
  email: string;
  username: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  role: UserRole;
  status: UserStatus;
  preferences: UserPreferences;
  last_login_at?: Timestamp;
  email_verified_at?: Timestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
  metadata?: {
    provider?: string;
    social_id?: string;
    bio?: string;
    website?: string;
    location?: string;
  };
}

/**
 * 创建用户参数接口
 */
export interface CreateUserParams {
  email: string;
  username: string;
  password: string;
  first_name?: string;
  last_name?: string;
  role?: UserRole;
  preferences?: Partial<UserPreferences>;
  metadata?: User['metadata'];
}

/**
 * 更新用户参数接口
 */
export interface UpdateUserParams {
  email?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  role?: UserRole;
  status?: UserStatus;
  preferences?: Partial<UserPreferences>;
  metadata?: User['metadata'];
}

// === 系统配置相关类型 ===

/**
 * 配置类型枚举
 */
export enum ConfigType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  JSON = 'json',
  ARRAY = 'array'
}

/**
 * 系统配置接口
 */
export interface SystemConfig {
  id: UUID;
  key: string;
  value: any;
  type: ConfigType;
  description: string;
  is_sensitive: boolean;
  environment: string;
  created_at: Timestamp;
  updated_at: Timestamp;
  metadata?: {
    category?: string;
    validation?: {
      type: string;
      constraints: any;
    };
  };
}

/**
 * 创建系统配置参数接口
 */
export interface CreateSystemConfigParams {
  key: string;
  value: any;
  type: ConfigType;
  description: string;
  is_sensitive: boolean;
  environment: string;
  metadata?: SystemConfig['metadata'];
}

/**
 * 更新系统配置参数接口
 */
export interface UpdateSystemConfigParams {
  value?: any;
  type?: ConfigType;
  description?: string;
  is_sensitive?: boolean;
  environment?: string;
  metadata?: SystemConfig['metadata'];
}

// === AI分析相关类型 ===

/**
 * 情感分析结果接口
 */
export interface SentimentAnalysis {
  score: number;
  label: 'positive' | 'negative' | 'neutral';
  confidence: number;
}

/**
 * 实体识别结果接口
 */
export interface EntityRecognition {
  text: string;
  type: string;
  start_pos: number;
  end_pos: number;
  confidence: number;
  metadata?: any;
}

/**
 * AI分析结果接口
 */
export interface AIAnalysis {
  id: UUID;
  article_id: UUID;
  sentiment_score: number;
  sentiment_label: string;
  entities: EntityRecognition[];
  summary: string;
  summary_word_count: number;
  categories: {
    primary: string;
    secondary: string[];
    confidence: number;
  };
  keywords: string[];
  analysis_timestamp: Timestamp;
  model_used: string;
  cost_estimate: number;
  created_at: Timestamp;
}

// === 邮件相关类型 ===

/**
 * 邮件类型枚举
 */
export enum EmailType {
  NEWSLETTER = 'newsletter',
  NOTIFICATION = 'notification',
  DIGEST = 'digest',
  ALERT = 'alert'
}

/**
 * 邮件状态枚举
 */
export enum EmailStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
  DELIVERED = 'delivered',
  OPENED = 'opened',
  CLICKED = 'clicked'
}

/**
 * 邮件日志接口
 */
export interface EmailLog {
  id: UUID;
  to: string;
  subject: string;
  content: string;
  type: EmailType;
  status: EmailStatus;
  message_id?: string;
  error_message?: string;
  created_at: Timestamp;
  sent_at?: Timestamp;
  metadata?: {
    template?: string;
    template_data?: any;
    user_id?: UUID;
    article_ids?: UUID[];
  };
}

// === 任务相关类型 ===

/**
 * 任务类型枚举
 */
export enum TaskType {
  RSS_FETCH = 'rss_fetch',
  ARTICLE_PROCESS = 'article_process',
  AI_ANALYSIS = 'ai_analysis',
  EMAIL_SEND = 'email_send',
  CLEANUP = 'cleanup',
  BACKUP = 'backup'
}

/**
 * 任务状态枚举
 */
export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

/**
 * 任务接口
 */
export interface Task {
  id: UUID;
  type: TaskType;
  status: TaskStatus;
  payload: any;
  result?: any;
  error?: string;
  scheduled_at: Timestamp;
  started_at?: Timestamp;
  completed_at?: Timestamp;
  retry_count: number;
  max_retries: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// === 错误类型 ===

/**
 * API错误接口
 */
export interface APIError {
  code: string;
  message: string;
  details?: any;
  timestamp: Timestamp;
}

/**
 * 验证错误接口
 */
export interface ValidationError {
  field: string;
  message: string;
  value: any;
}

// === 服务状态相关类型 ===

/**
 * 服务健康状态枚举
 */
export enum ServiceHealthStatus {
  HEALTHY = 'healthy',
  UNHEALTHY = 'unhealthy',
  DEGRADED = 'degraded',
  UNKNOWN = 'unknown'
}

/**
 * 服务健康检查接口
 */
export interface ServiceHealth {
  name: string;
  status: ServiceHealthStatus;
  timestamp: Timestamp;
  details?: any;
  metrics?: {
    uptime: number;
    memory_usage: number;
    cpu_usage: number;
    response_time: number;
  };
}

/**
 * 系统健康状态接口
 */
export interface SystemHealth {
  overall: ServiceHealthStatus;
  services: Record<string, ServiceHealth>;
  last_check: Timestamp;
  version: string;
  environment: string;
}

// === 导出所有类型 ===
export type * from './database.js';