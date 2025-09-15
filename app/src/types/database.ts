/**
 * 数据库类型定义
 * 遵循TypeScript最佳实践：数据库类型安全、查询参数、结果映射
 */

import type {
  UUID,
  Timestamp,
  Status,
  QueryParams,
  PaginatedResult,
  RSSSource,
  NewsArticle,
  StockEntity,
  User,
  SystemConfig,
  AIAnalysis,
  EmailLog,
  Task
} from './index.js';

// === 数据库表名常量 ===

export const TABLES = {
  RSS_SOURCES: 'rss_sources',
  NEWS_ARTICLES: 'news_articles',
  STOCK_ENTITIES: 'stock_entities',
  USERS: 'users',
  SYSTEM_CONFIGS: 'system_configs',
  AI_ANALYSIS_RESULTS: 'ai_analysis_results',
  EMAIL_LOGS: 'email_logs',
  USER_EMAIL_HISTORY: 'user_email_history',
  TASKS: 'tasks',
  CLEANUP_LOGS: 'cleanup_logs'
} as const;

// === 数据库字段类型 ===

/**
 * 数据库基础字段接口
 */
export interface DatabaseBaseFields {
  id: UUID;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/**
 * 软删除字段接口
 */
export interface SoftDeleteFields {
  deleted_at: Timestamp | null;
}

// === RSS源表类型 ===

/**
 * RSS源表行接口
 */
export interface RSSSourceRow extends DatabaseBaseFields, Omit<RSSSource, 'id' | 'created_at' | 'updated_at'> {
  // 从RSSSource接口继承所有字段，但排除基础字段
}

/**
 * RSS源创建参数接口
 */
export interface CreateRSSSourceRow extends Omit<RSSSourceRow, 'id' | 'created_at' | 'updated_at' | 'last_fetched_at' | 'last_fetch_status' | 'fetch_error_count'> {
  // 创建时需要的基本字段
}

/**
 * RSS源更新参数接口
 */
export interface UpdateRSSSourceRow extends Partial<Omit<RSSSourceRow, 'id' | 'created_at' | 'updated_at'>> {
  // 更新时的可选字段
}

/**
 * RSS源查询结果接口
 */
export interface RSSSourceQueryResult extends RSSSource {}

// === 新闻文章表类型 ===

/**
 * 新闻文章表行接口
 */
export interface NewsArticleRow extends DatabaseBaseFields, Omit<NewsArticle, 'id' | 'created_at' | 'updated_at'> {
  // 从NewsArticle接口继承所有字段，但排除基础字段
}

/**
 * 新闻文章创建参数接口
 */
export interface CreateNewsArticleRow extends Omit<NewsArticleRow, 'id' | 'created_at' | 'updated_at' | 'fetched_at' | 'status' | 'reading_time' | 'word_count'> {
  // 创建时需要的基本字段
}

/**
 * 新闻文章更新参数接口
 */
export interface UpdateNewsArticleRow extends Partial<Omit<NewsArticleRow, 'id' | 'created_at' | 'updated_at'>> {
  // 更新时的可选字段
}

/**
 * 新闻文章查询结果接口
 */
export interface NewsArticleQueryResult extends NewsArticle {}

// === 股票实体表类型 ===

/**
 * 股票实体表行接口
 */
export interface StockEntityRow extends DatabaseBaseFields, Omit<StockEntity, 'id' | 'created_at' | 'updated_at'> {
  // 从StockEntity接口继承所有字段，但排除基础字段
}

/**
 * 股票实体创建参数接口
 */
export interface CreateStockEntityRow extends Omit<StockEntityRow, 'id' | 'created_at' | 'updated_at' | 'market_cap' | 'current_price' | 'price_change' | 'price_change_percent'> {
  // 创建时需要的基本字段
}

/**
 * 股票实体更新参数接口
 */
export interface UpdateStockEntityRow extends Partial<Omit<StockEntityRow, 'id' | 'created_at' | 'updated_at'>> {
  // 更新时的可选字段
}

/**
 * 股票实体查询结果接口
 */
export interface StockEntityQueryResult extends StockEntity {}

// === 用户表类型 ===

/**
 * 用户表行接口
 */
export interface UserRow extends DatabaseBaseFields, Omit<User, 'id' | 'created_at' | 'updated_at'> {
  password_hash: string;
  email_verified_at: Timestamp | null;
  last_login_at: Timestamp | null;
}

/**
 * 用户创建参数接口
 */
export interface CreateUserRow extends Omit<UserRow, 'id' | 'created_at' | 'updated_at' | 'email_verified_at' | 'last_login_at'> {
  // 创建时需要的基本字段
  password: string; // 明文密码，将被哈希
}

/**
 * 用户更新参数接口
 */
export interface UpdateUserRow extends Partial<Omit<UserRow, 'id' | 'created_at' | 'updated_at' | 'password_hash' | 'email_verified_at' | 'last_login_at'>> {
  // 更新时的可选字段
  password?: string; // 可选密码更新
}

/**
 * 用户查询结果接口
 */
export interface UserQueryResult extends Omit<User, 'id' | 'created_at' | 'updated_at'> {
  id: UUID;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// === 系统配置表类型 ===

/**
 * 系统配置表行接口
 */
export interface SystemConfigRow extends DatabaseBaseFields, Omit<SystemConfig, 'id' | 'created_at' | 'updated_at'> {
  // 从SystemConfig接口继承所有字段，但排除基础字段
}

/**
 * 系统配置创建参数接口
 */
export interface CreateSystemConfigRow extends Omit<SystemConfigRow, 'id' | 'created_at' | 'updated_at'> {
  // 创建时需要的基本字段
}

/**
 * 系统配置更新参数接口
 */
export interface UpdateSystemConfigRow extends Partial<Omit<SystemConfigRow, 'id' | 'created_at' | 'updated_at'>> {
  // 更新时的可选字段
}

/**
 * 系统配置查询结果接口
 */
export interface SystemConfigQueryResult extends SystemConfig {}

// === AI分析结果表类型 ===

/**
 * AI分析结果表行接口
 */
export interface AIAnalysisRow extends DatabaseBaseFields, Omit<AIAnalysis, 'id' | 'created_at'> {
  // 从AIAnalysis接口继承所有字段，但排除基础字段
}

/**
 * AI分析结果创建参数接口
 */
export interface CreateAIAnalysisRow extends Omit<AIAnalysisRow, 'id' | 'created_at' | 'analysis_timestamp'> {
  // 创建时需要的基本字段
}

/**
 * AI分析结果更新参数接口
 */
export interface UpdateAIAnalysisRow extends Partial<Omit<AIAnalysisRow, 'id' | 'created_at' | 'analysis_timestamp'>> {
  // 更新时的可选字段
}

/**
 * AI分析结果查询结果接口
 */
export interface AIAnalysisQueryResult extends AIAnalysis {}

// === 邮件日志表类型 ===

/**
 * 邮件日志表行接口
 */
export interface EmailLogRow extends DatabaseBaseFields, Omit<EmailLog, 'id' | 'created_at' | 'sent_at'> {
  // 从EmailLog接口继承所有字段，但排除基础字段
}

/**
 * 邮件日志创建参数接口
 */
export interface CreateEmailLogRow extends Omit<EmailLogRow, 'id' | 'created_at' | 'sent_at' | 'status' | 'message_id' | 'error_message'> {
  // 创建时需要的基本字段
}

/**
 * 邮件日志更新参数接口
 */
export interface UpdateEmailLogRow extends Partial<Omit<EmailLogRow, 'id' | 'created_at' | 'sent_at'>> {
  // 更新时的可选字段
}

/**
 * 邮件日志查询结果接口
 */
export interface EmailLogQueryResult extends EmailLog {}

// === 用户邮件历史表类型 ===

/**
 * 用户邮件历史表行接口
 */
export interface UserEmailHistoryRow extends DatabaseBaseFields {
  id: UUID;
  user_id: UUID;
  email_type: string;
  email_id: UUID;
  sent_at: Timestamp;
  opened_at?: Timestamp;
  clicked_at?: Timestamp;
}

/**
 * 用户邮件历史创建参数接口
 */
export interface CreateUserEmailHistoryRow extends Omit<UserEmailHistoryRow, 'id' | 'created_at' | 'updated_at' | 'opened_at' | 'clicked_at'> {
  // 创建时需要的基本字段
}

/**
 * 用户邮件历史查询结果接口
 */
export interface UserEmailHistoryQueryResult extends Omit<UserEmailHistoryRow, 'created_at' | 'updated_at'> {}

// === 任务表类型 ===

/**
 * 任务表行接口
 */
export interface TaskRow extends DatabaseBaseFields, Omit<Task, 'id' | 'created_at' | 'updated_at'> {
  // 从Task接口继承所有字段，但排除基础字段
}

/**
 * 任务创建参数接口
 */
export interface CreateTaskRow extends Omit<TaskRow, 'id' | 'created_at' | 'updated_at' | 'started_at' | 'completed_at' | 'result' | 'error' | 'retry_count'> {
  // 创建时需要的基本字段
}

/**
 * 任务更新参数接口
 */
export interface UpdateTaskRow extends Partial<Omit<TaskRow, 'id' | 'created_at' | 'updated_at'>> {
  // 更新时的可选字段
}

/**
 * 任务查询结果接口
 */
export interface TaskQueryResult extends Task {}

// === 清理日志表类型 ===

/**
 * 清理日志表行接口
 */
export interface CleanupLogRow extends DatabaseBaseFields {
  id: UUID;
  operation: string;
  table_name: string;
  cleaned_count: number;
  details: any;
  performed_by: string;
  duration_ms: number;
}

/**
 * 清理日志创建参数接口
 */
export interface CreateCleanupLogRow extends Omit<CleanupLogRow, 'id' | 'created_at' | 'updated_at'> {
  // 创建时需要的基本字段
}

/**
 * 清理日志查询结果接口
 */
export interface CleanupLogQueryResult extends Omit<CleanupLogRow, 'created_at' | 'updated_at'> {
  id: UUID;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// === 数据库查询相关类型 ===

/**
 * Supabase查询过滤器接口
 */
export interface SupabaseFilter {
  column: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in' | 'cs' | 'cd';
  value: any;
}

/**
 * Supabase查询选项接口
 */
export interface SupabaseQueryOptions {
  select?: string;
  filters?: SupabaseFilter[];
  order?: {
    column: string;
    ascending?: boolean;
  };
  range?: {
    from: number;
    to: number;
  };
  limit?: number;
  offset?: number;
}

/**
 * Supabase插入参数接口
 */
export interface SupabaseInsertParams<T> {
  table: string;
  data: T | T[];
  returning?: string;
}

/**
 * Supabase更新参数接口
 */
export interface SupabaseUpdateParams<T> {
  table: string;
  data: Partial<T>;
  filters: SupabaseFilter[];
  returning?: string;
}

/**
 * Supabase删除参数接口
 */
export interface SupabaseDeleteParams {
  table: string;
  filters: SupabaseFilter[];
  returning?: string;
}

/**
 * SupabaseRPC调用参数接口
 */
export interface SupabaseRPCParams {
  function: string;
  params?: Record<string, any>;
}

/**
 * 数据库错误接口
 */
export interface DatabaseError {
  code: string;
  message: string;
  details?: any;
  hint?: string;
  table?: string;
  constraint?: string;
}

// === 数据库事务相关类型 ===

/**
 * 事务操作接口
 */
export interface TransactionOperation {
  type: 'insert' | 'update' | 'delete' | 'rpc';
  table?: string;
  data?: any;
  filters?: SupabaseFilter[];
  function?: string;
  params?: Record<string, any>;
}

/**
 * 事务结果接口
 */
export interface TransactionResult {
  success: boolean;
  data?: any;
  error?: DatabaseError;
}

// === 统计相关类型 ===

/**
 * 统计查询结果接口
 */
export interface StatisticsResult {
  total: number;
  count: number;
  sum?: number;
  avg?: number;
  min?: number;
  max?: number;
  group_by?: Record<string, any>;
}

/**
 * 时间范围统计接口
 */
export interface TimeRangeStatistics {
  date: string;
  count: number;
  total?: number;
  average?: number;
}

// === 导出所有数据库类型 ===
export type {
  RSSSourceRow,
  CreateRSSSourceRow,
  UpdateRSSSourceRow,
  RSSSourceQueryResult,
  NewsArticleRow,
  CreateNewsArticleRow,
  UpdateNewsArticleRow,
  NewsArticleQueryResult,
  StockEntityRow,
  CreateStockEntityRow,
  UpdateStockEntityRow,
  StockEntityQueryResult,
  UserRow,
  CreateUserRow,
  UpdateUserRow,
  UserQueryResult,
  SystemConfigRow,
  CreateSystemConfigRow,
  UpdateSystemConfigRow,
  SystemConfigQueryResult,
  AIAnalysisRow,
  CreateAIAnalysisRow,
  UpdateAIAnalysisRow,
  AIAnalysisQueryResult,
  EmailLogRow,
  CreateEmailLogRow,
  UpdateEmailLogRow,
  EmailLogQueryResult,
  UserEmailHistoryRow,
  CreateUserEmailHistoryRow,
  UserEmailHistoryQueryResult,
  TaskRow,
  CreateTaskRow,
  UpdateTaskRow,
  TaskQueryResult,
  CleanupLogRow,
  CreateCleanupLogRow,
  CleanupLogQueryResult,
  SupabaseFilter,
  SupabaseQueryOptions,
  SupabaseInsertParams,
  SupabaseUpdateParams,
  SupabaseDeleteParams,
  SupabaseRPCParams,
  DatabaseError,
  TransactionOperation,
  TransactionResult,
  StatisticsResult,
  TimeRangeStatistics
};