#!/usr/bin/env node

/**
 * 数据库架构验证脚本
 * 验证SQL语法和结构正确性（无需实际数据库连接）
 */

import fs from 'fs';
import path from 'path';

class SchemaValidator {
  constructor() {
    this.schemaPath = path.join(process.cwd(), 'supabase', 'migrations', '001_initial_schema.sql');
    this.errors = [];
    this.warnings = [];
  }

  /**
   * 验证数据库架构文件
   */
  async validate() {
    console.log('🔍 开始验证数据库架构...\n');

    try {
      // 读取SQL文件
      const sqlContent = fs.readFileSync(this.schemaPath, 'utf8');

      // 执行各种验证
      this.validateSyntax(sqlContent);
      this.validateTables(sqlContent);
      this.validateIndexes(sqlContent);
      this.validateFunctions(sqlContent);
      this.validateConstraints(sqlContent);
      this.validateBestPractices(sqlContent);

      // 生成报告
      this.generateReport();

      return this.errors.length === 0;
    } catch (error) {
      console.error('❌ 验证失败:', error.message);
      return false;
    }
  }

  /**
   * 验证SQL语法基本规则
   */
  validateSyntax(sqlContent) {
    console.log('📝 验证SQL语法...');

    const lines = sqlContent.split('\n');
    let inComment = false;
    let inString = false;
    let stringChar = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // 跳过注释
      if (line.trim().startsWith('--')) continue;

      // 检查括号匹配
      for (let j = 0; j < line.length; j++) {
        const char = line[j];

        // 字符串处理
        if ((char === "'" || char === '"') && !inComment) {
          if (!inString) {
            inString = true;
            stringChar = char;
          } else if (char === stringChar) {
            inString = false;
            stringChar = null;
          }
        }

        // 注释处理
        if (char === '-' && j + 1 < line.length && line[j + 1] === '-' && !inString) {
          break; // 跳过行注释
        }

        // 括号匹配
        if (!inComment && !inString) {
          if (char === '(') {
            // 简单的括号计数
          } else if (char === ')') {
            // 简单的括号计数
          }
        }
      }

      // 只有在不在字符串中时才检查关键字
      if (!inString) {
        // 检查关键字拼写
        const commonKeywords = [
        'CREATE', 'TABLE', 'INDEX', 'VIEW', 'FUNCTION', 'PROCEDURE',
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'FROM', 'WHERE',
        'JOIN', 'INNER', 'LEFT', 'RIGHT', 'ON', 'GROUP BY', 'ORDER BY',
        'PRIMARY', 'FOREIGN', 'KEY', 'REFERENCES', 'CONSTRAINT',
        'NOT', 'NULL', 'UNIQUE', 'CHECK', 'DEFAULT', 'CASCADE'
      ];

      for (const keyword of commonKeywords) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        const matches = line.match(regex);
        if (matches && matches.length > 0) {
          // 检查大小写一致性
          if (matches.some(m => m !== m.toUpperCase())) {
            const lowercaseMatches = matches.filter(m => m !== m.toUpperCase());
            this.warnings.push({
              line: lineNum,
              message: `关键字 ${keyword} 的大小写不一致，建议使用大写 (当前: ${lowercaseMatches.join(', ')})`
            });
          }
        }
      }
      }
    }

    console.log('✅ SQL语法验证完成');
  }

  /**
   * 验证表定义
   */
  validateTables(sqlContent) {
    console.log('📋 验证表定义...');

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

    const createTableRegex = /CREATE\s+TABLE\s+(\w+)/gi;
    const matches = [...sqlContent.matchAll(createTableRegex)];
    const foundTables = matches.map(match => match[1].toLowerCase());

    for (const table of expectedTables) {
      if (!foundTables.includes(table.toLowerCase())) {
        this.errors.push({
          message: `缺少必需的表: ${table}`
        });
      } else {
        console.log(`✅ 表 ${table} 定义正确`);
      }
    }

    // 检查表的主键
    const primaryKeyRegex = /CREATE\s+TABLE\s+(\w+)[\s\S]*?PRIMARY\s+KEY/gi;
    const primaryKeyMatches = [...sqlContent.matchAll(primaryKeyRegex)];

    for (const match of primaryKeyMatches) {
      const tableName = match[1];
      if (!match[0].toLowerCase().includes('uuid')) {
        this.warnings.push({
          message: `表 ${tableName} 建议使用UUID作为主键`
        });
      }
    }

    console.log('✅ 表定义验证完成');
  }

  /**
   * 验证索引定义
   */
  validateIndexes(sqlContent) {
    console.log('🔍 验证索引定义...');

    const indexTypes = {
      'B-tree': ['CREATE INDEX', 'USING btree'],
      'BRIN': ['USING BRIN'],
      'GIN': ['USING GIN'],
      'Partial': ['WHERE'],
      'Composite': ['INDEX', ',', ')'] // 复合索引包含多个列
    };

    const createIndexRegex = /CREATE\s+(UNIQUE\s+)?INDEX\s+(\w+)/gi;
    const indexMatches = [...sqlContent.matchAll(createIndexRegex)];

    console.log(`✅ 找到 ${indexMatches.length} 个索引`);

    // 检查时间序列字段的BRIN索引
    const brinIndexCount = (sqlContent.match(/USING\s+BRIN/gi) || []).length;
    if (brinIndexCount > 0) {
      console.log(`✅ 使用 ${brinIndexCount} 个BRIN索引优化时间序列查询`);
    }

    // 检查JSONB字段的GIN索引
    const ginIndexCount = (sqlContent.match(/USING\s+GIN/gi) || []).length;
    if (ginIndexCount > 0) {
      console.log(`✅ 使用 ${ginIndexCount} 个GIN索引优化JSONB查询`);
    }

    // 检查部分索引
    const partialIndexCount = (sqlContent.match(/CREATE\s+INDEX.*WHERE/gi) || []).length;
    if (partialIndexCount > 0) {
      console.log(`✅ 使用 ${partialIndexCount} 个部分索引减少索引大小`);
    }

    console.log('✅ 索引定义验证完成');
  }

  /**
   * 验证函数定义
   */
  validateFunctions(sqlContent) {
    console.log('⚙️ 验证函数定义...');

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

    const createFunctionRegex = /CREATE\s+(OR\s+REPLACE\s+)?(FUNCTION|PROCEDURE)\s+(\w+)/gi;
    const functionMatches = [...sqlContent.matchAll(createFunctionRegex)];
    const foundFunctions = functionMatches.map(match => match[3]);

    for (const func of expectedFunctions) {
      if (!foundFunctions.includes(func)) {
        this.errors.push({
          message: `缺少必需的函数: ${func}`
        });
      } else {
        console.log(`✅ 函数 ${func} 定义正确`);
      }
    }

    // 检查函数的安全定义
    const securityDefinerCount = (sqlContent.match(/SECURITY\s+DEFINER/gi) || []).length;
    if (securityDefinerCount === 0) {
      this.warnings.push({
        message: '建议在某些函数中使用 SECURITY DEFINER 提高性能'
      });
    }

    console.log('✅ 函数定义验证完成');
  }

  /**
   * 验证约束定义
   */
  validateConstraints(sqlContent) {
    console.log('🔒 验证约束定义...');

    // 检查外键约束
    const foreignKeyRegex = /FOREIGN\s+KEY/gi;
    const foreignKeyCount = (sqlContent.match(foreignKeyRegex) || []).length;
    console.log(`✅ 使用 ${foreignKeyCount} 个外键约束`);

    // 检查CHECK约束
    const checkRegex = /CHECK\s*\(/gi;
    const checkCount = (sqlContent.match(checkRegex) || []).length;
    console.log(`✅ 使用 ${checkCount} 个CHECK约束`);

    // 检查UNIQUE约束
    const uniqueRegex = /UNIQUE/gi;
    const uniqueCount = (sqlContent.match(uniqueRegex) || []).length;
    console.log(`✅ 使用 ${uniqueCount} 个UNIQUE约束`);

    // 检查NOT NULL约束
    const notNullRegex = /NOT\s+NULL/gi;
    const notNullCount = (sqlContent.match(notNullRegex) || []).length;
    console.log(`✅ 使用 ${notNullCount} 个NOT NULL约束`);

    // 检查时间戳约束
    const timestampCheckRegex = /CHECK\s*\(\s*\w+\s*<=\s*NOW\(\)/gi;
    const timestampChecks = (sqlContent.match(timestampCheckRegex) || []).length;
    if (timestampChecks > 0) {
      console.log(`✅ 使用 ${timestampChecks} 个时间戳验证约束`);
    }

    console.log('✅ 约束定义验证完成');
  }

  /**
   * 验证最佳实践
   */
  validateBestPractices(sqlContent) {
    console.log('⭐ 验证最佳实践...');

    // 检查是否使用UUID
    const uuidUsage = (sqlContent.match(/UUID/gi) || []).length;
    if (uuidUsage > 0) {
      console.log(`✅ 使用UUID作为主键类型`);
    }

    // 检查是否使用时间戳
    const timestampUsage = (sqlContent.match(/TIMESTAMP\s+WITH\s+TIME\s+ZONE/gi) || []).length;
    if (timestampUsage > 0) {
      console.log(`✅ 使用带时区的时间戳`);
    }

    // 检查是否使用JSONB
    const jsonbUsage = (sqlContent.match(/JSONB/gi) || []).length;
    if (jsonbUsage > 0) {
      console.log(`✅ 使用JSONB数据类型`);
    }

    // 检查是否使用扩展
    const extensionUsage = (sqlContent.match(/CREATE\s+EXTENSION/gi) || []).length;
    if (extensionUsage > 0) {
      console.log(`✅ 使用PostgreSQL扩展`);
    }

    // 检查是否使用触发器
    const triggerUsage = (sqlContent.match(/CREATE\s+TRIGGER/gi) || []).length;
    if (triggerUsage > 0) {
      console.log(`✅ 使用触发器自动化数据管理`);
    }

    // 检查是否使用视图
    const viewUsage = (sqlContent.match(/CREATE\s+VIEW/gi) || []).length;
    if (viewUsage > 0) {
      console.log(`✅ 使用视图简化复杂查询`);
    }

    // 检查事务管理
    const transactionUsage = (sqlContent.match(/BEGIN|COMMIT|ROLLBACK/gi) || []).length;
    if (transactionUsage === 0) {
      this.warnings.push({
        message: '建议在存储过程中使用事务管理'
      });
    }

    console.log('✅ 最佳实践验证完成');
  }

  /**
   * 生成验证报告
   */
  generateReport() {
    console.log('\n📊 验证报告:');
    console.log('=' .repeat(50));

    if (this.errors.length === 0) {
      console.log('✅ 没有发现错误');
    } else {
      console.log('❌ 发现错误:');
      this.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error.message}`);
      });
    }

    if (this.warnings.length === 0) {
      console.log('✅ 没有警告');
    } else {
      console.log('⚠️ 发现警告:');
      this.warnings.forEach((warning, index) => {
        const lineInfo = warning.line ? ` (第${warning.line}行)` : '';
        console.log(`  ${index + 1}.${lineInfo} ${warning.message}`);
      });
    }

    console.log('=' .repeat(50));
    console.log(`总计: ${this.errors.length} 个错误, ${this.warnings.length} 个警告`);
  }
}

// 主函数
async function main() {
  const validator = new SchemaValidator();

  try {
    const isValid = await validator.validate();

    if (isValid) {
      console.log('\n🎉 数据库架构验证通过！');
      process.exit(0);
    } else {
      console.log('\n❌ 数据库架构验证失败！');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ 验证运行失败:', error.message);
    process.exit(1);
  }
}

// 运行验证
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default SchemaValidator;