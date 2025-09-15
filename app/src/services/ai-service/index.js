/**
 * AI服务模块 - AI分析和实体识别
 * 遵循Node.js最佳实践：模块化、错误处理、日志记录
 */

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import logger from '../../utils/logger.js';
import { validateUUID } from '../../utils/validators.js';
import { CircuitBreaker } from '../../utils/circuit-breaker.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 支持多种AI API密钥配置
const apiKey = process.env.OPENAI_API_KEY || process.env.AI_API_KEY;
if (!apiKey) {
  logger.warn('AI服务密钥未配置，AI功能将不可用');
}

const openai = new OpenAI({
  apiKey: apiKey || 'dummy-key-for-initialization',
  maxRetries: 2,
  timeout: 30000
});

// AI服务配置
const AI_CONFIG = {
  maxRetries: 3,
  batchSize: 10,
  temperature: 0.1,
  maxTokens: 1000,
  model: 'gpt-4o-mini',
  embeddingModel: 'text-embedding-3-small',
  entityRecognitionModel: 'gpt-4o-mini',
  sentimentAnalysisModel: 'gpt-4o-mini',
  summarizationModel: 'gpt-4o-mini',
  categoryModel: 'gpt-4o-mini',
  costLimit: 10.00, // 每日费用限制
  cacheTimeout: 3600000 // 1小时缓存
};

// 实体类型定义
const ENTITY_TYPES = {
  PERSON: 'PERSON',
  ORGANIZATION: 'ORGANIZATION',
  LOCATION: 'LOCATION',
  PRODUCT: 'PRODUCT',
  EVENT: 'EVENT',
  DATE: 'DATE',
  MONEY: 'MONEY',
  PERCENT: 'PERCENT',
  TIME: 'TIME',
  STOCK: 'STOCK',
  TECHNOLOGY: 'TECHNOLOGY',
  COMPANY: 'COMPANY',
  INDUSTRY: 'INDUSTRY'
};

/**
 * AI服务类
 */
class AIService {
  constructor() {
    this.circuitBreaker = new CircuitBreaker({
      timeout: 45000,
      errorThresholdPercentage: 50,
      resetTimeout: 60000
    });

    this.analysisCache = new Map();
    this.dailyCost = 0;
    this.lastCostReset = Date.now();
    this.processingQueue = [];
    this.isProcessing = false;
  }

  /**
   * 分析文章内容
   */
  async analyzeArticle(articleId, content) {
    try {
      logger.info(`正在分析文章: ${articleId}`);

      // 检查费用限制
      if (this.dailyCost >= AI_CONFIG.costLimit) {
        throw new Error('已达到每日AI费用限制');
      }

      // 检查缓存
      const cached = this.analysisCache.get(articleId);
      if (cached && Date.now() - cached.timestamp < AI_CONFIG.cacheTimeout) {
        return cached.result;
      }

      // 并行执行多个分析任务
      const [sentiment, entities, summary, categories, keywords] = await Promise.all([
        this.analyzeSentiment(content),
        this.extractEntities(content),
        this.generateSummary(content),
        this.classifyCategories(content),
        this.extractKeywords(content)
      ]);

      const analysis = {
        id: uuidv4(),
        article_id: articleId,
        sentiment_score: sentiment.score,
        sentiment_label: sentiment.label,
        entities,
        summary: summary.text,
        summary_word_count: summary.wordCount,
        categories,
        keywords,
        analysis_timestamp: new Date().toISOString(),
        model_used: AI_CONFIG.model,
        cost_estimate: this.estimateAnalysisCost(content)
      };

      // 保存分析结果
      await this.saveAnalysisResult(analysis);

      // 缓存结果
      this.analysisCache.set(articleId, {
        result: analysis,
        timestamp: Date.now()
      });

      // 更新费用
      this.dailyCost += analysis.cost_estimate;

      logger.info(`文章分析完成: ${articleId}`, {
        sentiment: analysis.sentiment_label,
        entityCount: analysis.entities.length,
        categoryCount: analysis.categories.length
      });

      return analysis;

    } catch (error) {
      logger.error(`文章分析失败: ${articleId}`, { error: error.message });
      throw error;
    }
  }

  /**
   * 批量分析文章
   */
  async analyzeArticles(articles) {
    try {
      logger.info(`开始批量分析 ${articles.length} 篇文章`);

      const results = [];
      const errors = [];

      for (let i = 0; i < articles.length; i += AI_CONFIG.batchSize) {
        const batch = articles.slice(i, i + AI_CONFIG.batchSize);

        try {
          const batchResults = await Promise.all(
            batch.map(article => this.analyzeArticle(article.id, article.content))
          );
          results.push(...batchResults);
        } catch (error) {
          logger.error(`批量分析失败: ${error.message}`);
          errors.push(error);
        }
      }

      logger.info(`批量分析完成: 成功 ${results.length} 篇, 失败 ${errors.length} 篇`);

      return {
        success: true,
        results,
        errors,
        totalCost: results.reduce((sum, r) => sum + r.cost_estimate, 0)
      };

    } catch (error) {
      logger.error('批量分析失败', { error: error.message });
      return {
        success: false,
        results: [],
        errors: [error],
        totalCost: 0
      };
    }
  }

  /**
   * 情感分析
   */
  async analyzeSentiment(text) {
    try {
      const prompt = `
请分析以下文本的情感倾向，并返回JSON格式的结果：

文本：${text}

请分析：
1. 情感分数（-1到1，-1表示极度负面，1表示极度正面，0表示中性）
2. 情感标签（positive/neutral/negative）
3. 置信度（0到1）

返回格式：
{
  "score": 0.5,
  "label": "positive",
  "confidence": 0.9
}
`;

      const response = await this.circuitBreaker.execute(async () => {
        return await openai.chat.completions.create({
          model: AI_CONFIG.sentimentAnalysisModel,
          messages: [
            {
              role: 'system',
              content: '你是一个专业的情感分析专家，请准确分析文本的情感倾向。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: AI_CONFIG.temperature,
          max_tokens: AI_CONFIG.maxTokens,
          response_format: { type: 'json_object' }
        });
      });

      const result = JSON.parse(response.choices[0].message.content);

      return {
        score: Math.max(-1, Math.min(1, result.score || 0)),
        label: result.label || 'neutral',
        confidence: Math.max(0, Math.min(1, result.confidence || 0))
      };

    } catch (error) {
      logger.error('情感分析失败', { error: error.message });
      return {
        score: 0,
        label: 'neutral',
        confidence: 0
      };
    }
  }

  /**
   * 实体识别
   */
  async extractEntities(text) {
    try {
      const prompt = `
请从以下文本中提取命名实体，并返回JSON格式的结果：

文本：${text}

请识别以下类型的实体：
- PERSON: 人名
- ORGANIZATION: 组织机构名
- LOCATION: 地理位置名
- COMPANY: 公司名称
- STOCK: 股票代码
- TECHNOLOGY: 技术术语
- INDUSTRY: 行业名称
- MONEY: 金额
- DATE: 日期
- EVENT: 事件

返回格式：
{
  "entities": [
    {
      "text": "实体文本",
      "type": "实体类型",
      "start_pos": 起始位置,
      "end_pos": 结束位置,
      "confidence": 置信度
    }
  ]
}
`;

      const response = await this.circuitBreaker.execute(async () => {
        return await openai.chat.completions.create({
          model: AI_CONFIG.entityRecognitionModel,
          messages: [
            {
              role: 'system',
              content: '你是一个专业的实体识别专家，请准确识别文本中的各种命名实体。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: AI_CONFIG.temperature,
          max_tokens: AI_CONFIG.maxTokens,
          response_format: { type: 'json_object' }
        });
      });

      const result = JSON.parse(response.choices[0].message.content);

      return (result.entities || []).map(entity => ({
        ...entity,
        id: uuidv4(),
        type: entity.type || 'UNKNOWN'
      }));

    } catch (error) {
      logger.error('实体识别失败', { error: error.message });
      return [];
    }
  }

  /**
   * 生成摘要
   */
  async generateSummary(text) {
    try {
      const prompt = `
请为以下文本生成一个简洁的摘要（100-200字）：

文本：${text}

要求：
1. 概括主要内容和关键信息
2. 语言简洁明了
3. 保持客观中立
4. 突出重要事实和结论

请直接返回摘要文本，不要添加其他说明。
`;

      const response = await this.circuitBreaker.execute(async () => {
        return await openai.chat.completions.create({
          model: AI_CONFIG.summarizationModel,
          messages: [
            {
              role: 'system',
              content: '你是一个专业的文本摘要专家，请生成简洁准确的摘要。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: AI_CONFIG.temperature,
          max_tokens: AI_CONFIG.maxTokens
        });
      });

      const summary = response.choices[0].message.content.trim();

      return {
        text: summary,
        wordCount: summary.split(/\s+/).length
      };

    } catch (error) {
      logger.error('生成摘要失败', { error: error.message });
      return {
        text: '',
        wordCount: 0
      };
    }
  }

  /**
   * 分类文章
   */
  async classifyCategories(text) {
    try {
      const prompt = `
请为以下文本分类到最适合的类别中：

文本：${text}

可选类别：
- technology: 科技
- finance: 财经
- politics: 政治
- business: 商业
- sports: 体育
- entertainment: 娱乐
- health: 健康
- education: 教育
- science: 科学
- environment: 环境
- other: 其他

请返回JSON格式的结果：
{
  "primary_category": "主要类别",
  "secondary_categories": ["次要类别1", "次要类别2"],
  "confidence": 置信度
}
`;

      const response = await this.circuitBreaker.execute(async () => {
        return await openai.chat.completions.create({
          model: AI_CONFIG.categoryModel,
          messages: [
            {
              role: 'system',
              content: '你是一个专业的文本分类专家，请准确分类文本内容。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: AI_CONFIG.temperature,
          max_tokens: AI_CONFIG.maxTokens,
          response_format: { type: 'json_object' }
        });
      });

      const result = JSON.parse(response.choices[0].message.content);

      return {
        primary: result.primary_category || 'other',
        secondary: result.secondary_categories || [],
        confidence: Math.max(0, Math.min(1, result.confidence || 0))
      };

    } catch (error) {
      logger.error('分类失败', { error: error.message });
      return {
        primary: 'other',
        secondary: [],
        confidence: 0
      };
    }
  }

  /**
   * 提取关键词
   */
  async extractKeywords(text) {
    try {
      const prompt = `
请从以下文本中提取5-10个最重要的关键词：

文本：${text}

要求：
1. 选择最具代表性的词汇
2. 避免通用词汇
3. 考虑词频和重要性
4. 优先选择名词和专业术语

请返回JSON格式的结果：
{
  "keywords": ["关键词1", "关键词2", "关键词3"]
}
`;

      const response = await this.circuitBreaker.execute(async () => {
        return await openai.chat.completions.create({
          model: AI_CONFIG.model,
          messages: [
            {
              role: 'system',
              content: '你是一个专业的关键词提取专家，请提取文本中的重要关键词。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: AI_CONFIG.temperature,
          max_tokens: AI_CONFIG.maxTokens,
          response_format: { type: 'json_object' }
        });
      });

      const result = JSON.parse(response.choices[0].message.content);

      return result.keywords || [];

    } catch (error) {
      logger.error('关键词提取失败', { error: error.message });
      return [];
    }
  }

  /**
   * 生成文本嵌入
   */
  async generateEmbedding(text) {
    try {
      const response = await this.circuitBreaker.execute(async () => {
        return await openai.embeddings.create({
          model: AI_CONFIG.embeddingModel,
          input: text
        });
      });

      return response.data[0].embedding;

    } catch (error) {
      logger.error('生成嵌入失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 保存分析结果
   */
  async saveAnalysisResult(analysis) {
    try {
      const { error } = await supabase
        .from('ai_analysis_results')
        .insert([analysis])
        .select()
        .single();

      if (error) {
        throw error;
      }

      logger.info(`分析结果保存成功: ${analysis.id}`);

      return data;

    } catch (error) {
      logger.error('保存分析结果失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 获取分析结果
   */
  async getAnalysisResult(articleId) {
    try {
      const { error } = await supabase
        .from('ai_analysis_results')
        .select('*')
        .eq('article_id', articleId)
        .single();

      if (error) {
        throw error;
      }

      return data;

    } catch (error) {
      logger.error(`获取分析结果失败: ${articleId}`, { error: error.message });
      return null;
    }
  }

  /**
   * 搜索相似文章
   */
  async findSimilarArticles(articleId, embedding, limit = 5) {
    try {
      const { error } = await supabase.rpc('find_similar_articles', {
        query_embedding: embedding,
        match_limit: limit,
        article_id: articleId
      });

      if (error) {
        throw error;
      }

      return data || [];

    } catch (error) {
      logger.error(`搜索相似文章失败: ${articleId}`, { error: error.message });
      return [];
    }
  }

  /**
   * 估计分析成本
   */
  estimateAnalysisCost(text) {
    // 简化的成本计算，实际应该根据OpenAI定价计算
    const tokenCount = Math.ceil(text.length / 4); // 估算token数
    const costPerToken = 0.0001; // 每token成本
    return tokenCount * costPerToken;
  }

  /**
   * 获取AI服务统计信息
   */
  async getStatistics() {
    try {
      const [
        { count: totalAnalyses },
        { count: todayAnalyses },
        { data: costStats },
        { data: sentimentStats },
        { data: categoryStats }
      ] = await Promise.all([
        supabase.from('ai_analysis_results').select('*', { count: 'exact', head: true }),
        supabase.from('ai_analysis_results').select('*', { count: 'exact', head: true }).gte('analysis_timestamp', new Date().toISOString().split('T')[0]),
        supabase.rpc('get_ai_cost_statistics'),
        supabase.rpc('get_sentiment_statistics'),
        supabase.rpc('get_category_statistics')
      ]);

      return {
        totalAnalyses: totalAnalyses || 0,
        todayAnalyses: todayAnalyses || 0,
        dailyCost: this.dailyCost,
        dailyLimit: AI_CONFIG.costLimit,
        costUtilization: (this.dailyCost / AI_CONFIG.costLimit) * 100,
        sentimentStats: sentimentStats || [],
        categoryStats: categoryStats || []
      };

    } catch (error) {
      logger.error('获取AI统计信息失败', { error: error.message });
      return {
        totalAnalyses: 0,
        todayAnalyses: 0,
        dailyCost: 0,
        dailyLimit: AI_CONFIG.costLimit,
        costUtilization: 0,
        sentimentStats: [],
        categoryStats: []
      };
    }
  }

  /**
   * 重置每日费用
   */
  resetDailyCost() {
    this.dailyCost = 0;
    this.lastCostReset = Date.now();
    logger.info('AI服务每日费用已重置');
  }

  /**
   * 清理缓存
   */
  clearCache() {
    this.analysisCache.clear();
    logger.info('AI服务缓存已清理');
  }

  /**
   * 检查费用限制
   */
  checkCostLimit() {
    return {
      withinLimit: this.dailyCost < AI_CONFIG.costLimit,
      currentCost: this.dailyCost,
      limit: AI_CONFIG.costLimit,
      remaining: AI_CONFIG.costLimit - this.dailyCost
    };
  }
}

// 导出服务实例和常量
export const aiService = new AIService();
export { ENTITY_TYPES };
export default AIService;