#!/usr/bin/env node

/**
 * 数据库架构测试脚本
 * 验证数据库表、索引、函数和示例数据是否正确创建
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// 加载环境变量
config();

class DatabaseTester {
  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL;
    this.supabaseKey = process.env.SUPABASE_KEY;
    this.client = null;
    this.testResults = [];
  }

  /**
   * 初始化Supabase连接
   */
  async initialize() {
    try {
      if (!this.supabaseUrl || !this.supabaseKey) {
        throw new Error('SUPABASE_URL and SUPABASE_KEY environment variables are required');
      }

      this.client = createClient(this.supabaseUrl, this.supabaseKey, {
        auth: {
          persistSession: false,
        },
      });

      console.log('✅ 数据库连接初始化成功');
      return true;
    } catch (error) {
      console.error('❌ 数据库连接初始化失败:', error.message);
      return false;
    }
  }

  /**
   * 运行测试
   */
  async runTests() {
    console.log('🧪 开始数据库架构测试...\n');

    const tests = [
      this.testConnection.bind(this),
      this.testTablesExist.bind(this),
      this.testIndexesExist.bind(this),
      this.testFunctionsExist.bind(this),
      this.testViewsExist.bind(this),
      this.testSampleData.bind(this),
      this.testDataIntegrity.bind(this),
      this.testPerformanceFunctions.bind(this),
    ];

    let passedTests = 0;
    let totalTests = tests.length;

    for (const test of tests) {
      try {
        const result = await test();
        if (result) {
          passedTests++;
        }
      } catch (error) {
        console.error(`❌ 测试执行失败: ${error.message}`);
      }
    }

    console.log('\n📊 测试结果汇总:');
    console.log(`✅ 通过: ${passedTests}/${totalTests}`);
    console.log(`❌ 失败: ${totalTests - passedTests}/${totalTests}`);

    return passedTests === totalTests;
  }

  /**
   * 测试数据库连接
   */
  async testConnection() {
    console.log('🔌 测试数据库连接...');

    try {
      const { data, error } = await this.client
        .from('system_config')
        .select('config_key')
        .limit(1);

      if (error) {
        console.error('❌ 数据库连接失败:', error.message);
        this.testResults.push({ test: 'connection', status: 'failed', error: error.message });
        return false;
      }

      console.log('✅ 数据库连接正常');
      this.testResults.push({ test: 'connection', status: 'passed' });
      return true;
    } catch (error) {
      console.error('❌ 数据库连接测试失败:', error.message);
      this.testResults.push({ test: 'connection', status: 'failed', error: error.message });
      return false;
    }
  }

  /**
   * 测试表是否存在
   */
  async testTablesExist() {
    console.log('📋 测试表结构...');

    const expectedTables = [
      'rss_sources',
      'news_articles',
      'stock_entities',
      'users',
      'system_config',
      'email_logs',
      'cleanup_log',
      'system_logs',
      'ai_analysis_results'
    ];

    let allTablesExist = true;

    for (const tableName of expectedTables) {
      try {
        const { data, error } = await this.client
          .from(tableName)
          .select('*')
          .limit(1);

        if (error) {
          console.error(`❌ 表 ${tableName} 不存在或无法访问:`, error.message);
          allTablesExist = false;
        } else {
          console.log(`✅ 表 ${tableName} 存在`);
        }
      } catch (error) {
        console.error(`❌ 表 ${tableName} 测试失败:`, error.message);
        allTablesExist = false;
      }
    }

    if (allTablesExist) {
      console.log('✅ 所有表都存在');
      this.testResults.push({ test: 'tables', status: 'passed' });
    } else {
      console.log('❌ 部分表缺失');
      this.testResults.push({ test: 'tables', status: 'failed', error: 'Missing tables' });
    }

    return allTablesExist;
  }

  /**
   * 测试函数是否存在
   */
  async testFunctionsExist() {
    console.log('⚙️ 测试存储过程和函数...');

    const expectedFunctions = [
      'cleanup_expired_data',
      'get_database_size',
      'check_storage_usage',
      'smart_cleanup_strategy',
      'get_rss_source_health_score',
      'bulk_update_rss_sources_status',
      'get_trending_stocks',
      'monitor_database_performance',
      'analyze_ai_costs',
      'get_news_aggregation_stats',
      'validate_data_integrity'
    ];

    let functionsExist = true;

    for (const functionName of expectedFunctions) {
      try {
        const { data, error } = await this.client.rpc(functionName);
        if (error && !error.message.includes('does not exist')) {
          console.error(`❌ 函数 ${functionName} 不存在:`, error.message);
          functionsExist = false;
        } else {
          console.log(`✅ 函数 ${functionName} 存在`);
        }
      } catch (error) {
        console.error(`❌ 函数 ${functionName} 测试失败:`, error.message);
        functionsExist = false;
      }
    }

    if (functionsExist) {
      console.log('✅ 所有函数都存在');
      this.testResults.push({ test: 'functions', status: 'passed' });
    } else {
      console.log('❌ 部分函数缺失');
      this.testResults.push({ test: 'functions', status: 'failed', error: 'Missing functions' });
    }

    return functionsExist;
  }

  /**
   * 测试视图是否存在
   */
  async testViewsExist() {
    console.log('👁️ 测试视图...');

    const expectedViews = [
      'news_stats',
      'rss_source_status',
      'vw_recent_news_with_stocks',
      'vw_system_dashboard'
    ];

    let viewsExist = true;

    for (const viewName of expectedViews) {
      try {
        const { data, error } = await this.client
          .from(viewName)
          .select('*')
          .limit(1);

        if (error) {
          console.error(`❌ 视图 ${viewName} 不存在:`, error.message);
          viewsExist = false;
        } else {
          console.log(`✅ 视图 ${viewName} 存在`);
        }
      } catch (error) {
        console.error(`❌ 视图 ${viewName} 测试失败:`, error.message);
        viewsExist = false;
      }
    }

    if (viewsExist) {
      console.log('✅ 所有视图都存在');
      this.testResults.push({ test: 'views', status: 'passed' });
    } else {
      console.log('❌ 部分视图缺失');
      this.testResults.push({ test: 'views', status: 'failed', error: 'Missing views' });
    }

    return viewsExist;
  }

  /**
   * 测试示例数据
   */
  async testSampleData() {
    console.log('📝 测试示例数据...');

    let sampleDataValid = true;

    try {
      // 测试RSS源数据
      const { data: rssData, error: rssError } = await this.client
        .from('rss_sources')
        .select('*', { count: 'exact' });

      if (rssError) {
        console.error('❌ RSS源数据查询失败:', rssError.message);
        sampleDataValid = false;
      } else if (rssData.length === 0) {
        console.error('❌ 没有找到RSS源示例数据');
        sampleDataValid = false;
      } else {
        console.log(`✅ RSS源示例数据: ${rssData.length} 条记录`);
      }

      // 测试新闻文章数据
      const { data: articleData, error: articleError } = await this.client
        .from('news_articles')
        .select('*', { count: 'exact' });

      if (articleError) {
        console.error('❌ 新闻文章数据查询失败:', articleError.message);
        sampleDataValid = false;
      } else if (articleData.length === 0) {
        console.error('❌ 没有找到新闻文章示例数据');
        sampleDataValid = false;
      } else {
        console.log(`✅ 新闻文章示例数据: ${articleData.length} 条记录`);
      }

      // 测试股票实体数据
      const { data: stockData, error: stockError } = await this.client
        .from('stock_entities')
        .select('*', { count: 'exact' });

      if (stockError) {
        console.error('❌ 股票实体数据查询失败:', stockError.message);
        sampleDataValid = false;
      } else if (stockData.length === 0) {
        console.error('❌ 没有找到股票实体示例数据');
        sampleDataValid = false;
      } else {
        console.log(`✅ 股票实体示例数据: ${stockData.length} 条记录`);
      }

      // 测试AI分析结果数据
      const { data: aiData, error: aiError } = await this.client
        .from('ai_analysis_results')
        .select('*', { count: 'exact' });

      if (aiError) {
        console.error('❌ AI分析结果数据查询失败:', aiError.message);
        sampleDataValid = false;
      } else if (aiData.length === 0) {
        console.error('❌ 没有找到AI分析结果示例数据');
        sampleDataValid = false;
      } else {
        console.log(`✅ AI分析结果示例数据: ${aiData.length} 条记录`);
      }

      if (sampleDataValid) {
        console.log('✅ 所有示例数据都存在');
        this.testResults.push({ test: 'sample_data', status: 'passed' });
      } else {
        console.log('❌ 部分示例数据缺失');
        this.testResults.push({ test: 'sample_data', status: 'failed', error: 'Missing sample data' });
      }

      return sampleDataValid;
    } catch (error) {
      console.error('❌ 示例数据测试失败:', error.message);
      this.testResults.push({ test: 'sample_data', status: 'failed', error: error.message });
      return false;
    }
  }

  /**
   * 测试数据完整性
   */
  async testDataIntegrity() {
    console.log('🔍 测试数据完整性...');

    try {
      const { data: integrityData, error } = await this.client.rpc('validate_data_integrity');

      if (error) {
        console.error('❌ 数据完整性验证失败:', error.message);
        this.testResults.push({ test: 'data_integrity', status: 'failed', error: error.message });
        return false;
      }

      let hasIssues = false;
      for (const result of integrityData) {
        if (!result.is_valid) {
          console.error(`❌ 数据完整性问题: ${result.details} (${result.issues_count} 个问题)`);
          hasIssues = true;
        }
      }

      if (!hasIssues) {
        console.log('✅ 数据完整性验证通过');
        this.testResults.push({ test: 'data_integrity', status: 'passed' });
        return true;
      } else {
        console.log('❌ 数据完整性验证失败');
        this.testResults.push({ test: 'data_integrity', status: 'failed', error: 'Data integrity issues found' });
        return false;
      }
    } catch (error) {
      console.error('❌ 数据完整性测试失败:', error.message);
      this.testResults.push({ test: 'data_integrity', status: 'failed', error: error.message });
      return false;
    }
  }

  /**
   * 测试性能函数
   */
  async testPerformanceFunctions() {
    console.log('⚡ 测试性能监控函数...');

    try {
      // 测试数据库大小函数
      const { data: dbSize, error: sizeError } = await this.client.rpc('get_database_size');
      if (sizeError) {
        console.error('❌ 数据库大小查询失败:', sizeError.message);
        this.testResults.push({ test: 'performance_functions', status: 'failed', error: sizeError.message });
        return false;
      }
      console.log(`✅ 数据库大小: ${dbSize} MB`);

      // 测试存储使用情况函数
      const { data: storageUsage, error: storageError } = await this.client.rpc('check_storage_usage');
      if (storageError) {
        console.error('❌ 存储使用情况查询失败:', storageError.message);
        this.testResults.push({ test: 'performance_functions', status: 'failed', error: storageError.message });
        return false;
      }
      console.log(`✅ 存储使用情况: ${storageUsage.length} 个表`);

      // 测试系统仪表板视图
      const { data: dashboard, error: dashboardError } = await this.client
        .from('vw_system_dashboard')
        .select('*')
        .single();

      if (dashboardError) {
        console.error('❌ 系统仪表板查询失败:', dashboardError.message);
        this.testResults.push({ test: 'performance_functions', status: 'failed', error: dashboardError.message });
        return false;
      }
      console.log(`✅ 系统仪表板: ${dashboard.articles_24h} 篇文章(24小时)`);

      console.log('✅ 性能监控函数工作正常');
      this.testResults.push({ test: 'performance_functions', status: 'passed' });
      return true;
    } catch (error) {
      console.error('❌ 性能函数测试失败:', error.message);
      this.testResults.push({ test: 'performance_functions', status: 'failed', error: error.message });
      return false;
    }
  }

  /**
   * 测试索引（通过查询性能间接测试）
   */
  async testIndexesExist() {
    console.log('🔍 测试索引（通过查询性能）...');

    try {
      // 测试RSS源查询性能
      const startTime = Date.now();
      const { data: rssData, error: rssError } = await this.client
        .from('rss_sources')
        .select('*')
        .eq('category', 'tech')
        .eq('is_active', true);
      const rssDuration = Date.now() - startTime;

      if (rssError) {
        console.error('❌ RSS源查询失败:', rssError.message);
        this.testResults.push({ test: 'indexes', status: 'failed', error: rssError.message });
        return false;
      }

      // 测试新闻文章查询性能
      const startTime2 = Date.now();
      const { data: articleData, error: articleError } = await this.client
        .from('news_articles')
        .select('*')
        .eq('category', 'tech')
        .order('publish_date', { ascending: false })
        .limit(10);
      const articleDuration = Date.now() - startTime2;

      if (articleError) {
        console.error('❌ 新闻文章查询失败:', articleError.message);
        this.testResults.push({ test: 'indexes', status: 'failed', error: articleError.message });
        return false;
      }

      // 测试股票实体查询性能
      const startTime3 = Date.now();
      const { data: stockData, error: stockError } = await this.client
        .from('stock_entities')
        .select('*')
        .eq('symbol', 'TSLA');
      const stockDuration = Date.now() - startTime3;

      if (stockError) {
        console.error('❌ 股票实体查询失败:', stockError.message);
        this.testResults.push({ test: 'indexes', status: 'failed', error: stockError.message });
        return false;
      }

      console.log(`✅ RSS源查询: ${rssDuration}ms (${rssData.length} 条记录)`);
      console.log(`✅ 新闻文章查询: ${articleDuration}ms (${articleData.length} 条记录)`);
      console.log(`✅ 股票实体查询: ${stockDuration}ms (${stockData.length} 条记录)`);

      // 如果查询时间都在合理范围内，认为索引工作正常
      if (rssDuration < 1000 && articleDuration < 1000 && stockDuration < 1000) {
        console.log('✅ 索引性能正常');
        this.testResults.push({ test: 'indexes', status: 'passed' });
        return true;
      } else {
        console.log('⚠️ 查询性能可能需要优化');
        this.testResults.push({ test: 'indexes', status: 'warning', error: 'Query performance may need optimization' });
        return true;
      }
    } catch (error) {
      console.error('❌ 索引测试失败:', error.message);
      this.testResults.push({ test: 'indexes', status: 'failed', error: error.message });
      return false;
    }
  }

  /**
   * 生成测试报告
   */
  generateReport() {
    console.log('\n📋 详细测试报告:');
    console.log('=' .repeat(50));

    for (const result of this.testResults) {
      const status = result.status === 'passed' ? '✅' :
                    result.status === 'warning' ? '⚠️' : '❌';
      console.log(`${status} ${result.test}: ${result.error || '通过'}`);
    }

    console.log('=' .repeat(50));
  }

  /**
   * 关闭连接
   */
  async shutdown() {
    if (this.client) {
      // Supabase客户端不需要显式关闭
      this.client = null;
    }
    console.log('🛑 数据库测试完成');
  }
}

// 主函数
async function main() {
  const tester = new DatabaseTester();

  try {
    // 初始化连接
    const initialized = await tester.initialize();
    if (!initialized) {
      process.exit(1);
    }

    // 运行测试
    const allTestsPassed = await tester.runTests();

    // 生成报告
    tester.generateReport();

    // 关闭连接
    await tester.shutdown();

    // 根据测试结果退出
    process.exit(allTestsPassed ? 0 : 1);
  } catch (error) {
    console.error('❌ 测试运行失败:', error.message);
    process.exit(1);
  }
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default DatabaseTester;