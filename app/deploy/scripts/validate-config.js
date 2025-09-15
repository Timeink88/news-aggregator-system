#!/usr/bin/env node

/**
 * 配置验证脚本
 * 验证环境变量配置和系统初始化状态
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// 获取当前文件目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// 导入配置模块
import configService from '../src/services/config-service.js';
import databaseConfig from '../config/database.js';
import supabaseConfig from '../config/supabase.js';

class ConfigValidator {
  constructor() {
    this.results = {
      environment: {},
      configService: {},
      database: {},
      supabase: {},
      overall: {
        valid: true,
        warnings: [],
        errors: []
      }
    };
  }

  /**
   * 执行完整的配置验证
   */
  async validateAll() {
    console.log('🔍 开始配置验证...\n');

    try {
      // 验证环境变量
      await this.validateEnvironmentVariables();

      // 验证配置服务
      await this.validateConfigService();

      // 验证数据库配置
      await this.validateDatabaseConfig();

      // 验证Supabase配置
      await this.validateSupabaseConfig();

      // 输出验证结果
      this.outputResults();

      // 根据验证结果设置退出代码
      process.exit(this.results.overall.valid ? 0 : 1);

    } catch (error) {
      console.error('❌ 配置验证失败:', error);
      process.exit(1);
    }
  }

  /**
   * 验证环境变量
   */
  async validateEnvironmentVariables() {
    console.log('📋 验证环境变量...');

    const requiredVars = [
      'NODE_ENV',
      'SUPABASE_URL',
      'SUPABASE_KEY',
      'PORT'
    ];

    const optionalVars = [
      'SUPABASE_SERVICE_ROLE_KEY',
      'AI_API_KEY',
      'RESEND_API_KEY',
      'REDIS_HOST'
    ];

    const missing = requiredVars.filter(key => !process.env[key]);
    const present = requiredVars.filter(key => process.env[key]);

    this.results.environment = {
      required: {
        missing,
        present,
        valid: missing.length === 0
      },
      optional: {
        present: optionalVars.filter(key => process.env[key]),
        missing: optionalVars.filter(key => !process.env[key])
      },
      all: { ...process.env }
    };

    if (missing.length > 0) {
      this.results.overall.errors.push(`缺少必需的环境变量: ${missing.join(', ')}`);
      this.results.overall.valid = false;
    }

    console.log(`  ✅ 必需变量: ${present.length}/${requiredVars.length}`);
    console.log(`  ⚠️  可选变量: ${this.results.environment.optional.present.length}/${optionalVars.length}`);

    if (missing.length > 0) {
      console.log(`  ❌ 缺失变量: ${missing.join(', ')}`);
    }
  }

  /**
   * 验证配置服务
   */
  async validateConfigService() {
    console.log('\n⚙️  验证配置服务...');

    try {
      // 测试配置服务初始化
      await configService.initialize();

      // 获取配置
      const config = configService.getAllConfig();

      this.results.configService = {
        initialized: true,
        config: config,
        health: await configService.healthCheck()
      };

      console.log('  ✅ 配置服务初始化成功');
      console.log(`  📊 配置项数量: ${Object.keys(config).length}`);

      if (this.results.configService.health.status === 'healthy') {
        console.log('  ✅ 配置服务健康检查通过');
      } else {
        console.log('  ⚠️  配置服务健康检查异常');
      }

    } catch (error) {
      this.results.configService = {
        initialized: false,
        error: error.message
      };

      this.results.overall.errors.push(`配置服务验证失败: ${error.message}`);
      this.results.overall.valid = false;

      console.log(`  ❌ 配置服务验证失败: ${error.message}`);
    }
  }

  /**
   * 验证数据库配置
   */
  async validateDatabaseConfig() {
    console.log('\n🗄️  验证数据库配置...');

    try {
      // 测试数据库配置初始化
      await databaseConfig.initialize();

      // 获取配置
      const config = await databaseConfig.getPoolConfig();

      this.results.database = {
        initialized: databaseConfig.isInitialized(),
        config: config,
        health: await databaseConfig.healthCheck()
      };

      console.log('  ✅ 数据库配置初始化成功');
      console.log(`  🌐 数据库主机: ${config.host}:${config.port}`);
      console.log(`  📊 数据库名称: ${config.database}`);

      if (this.results.database.health.status === 'healthy') {
        console.log('  ✅ 数据库健康检查通过');
      } else {
        console.log(`  ⚠️  数据库健康检查: ${this.results.database.health.status}`);
      }

    } catch (error) {
      this.results.database = {
        initialized: false,
        error: error.message
      };

      this.results.overall.warnings.push(`数据库配置验证失败: ${error.message}`);
      console.log(`  ⚠️  数据库配置验证失败: ${error.message}`);
    }
  }

  /**
   * 验证Supabase配置
   */
  async validateSupabaseConfig() {
    console.log('\n🔷 验证Supabase配置...');

    try {
      // 测试Supabase配置初始化
      await supabaseConfig.initialize();

      // 获取配置
      const config = supabaseConfig.getConfig();

      this.results.supabase = {
        initialized: supabaseConfig.initialized,
        config: config,
        health: await supabaseConfig.healthCheck(),
        envValidation: supabaseConfig.validateEnvironmentVariables()
      };

      console.log('  ✅ Supabase配置初始化成功');
      console.log(`  🌐 项目URL: ${config.projectUrl}`);
      console.log(`  💾 最大存储: ${config.maxStorageMB}MB`);

      if (this.results.supabase.health.status === 'healthy') {
        console.log('  ✅ Supabase健康检查通过');
      } else {
        console.log(`  ⚠️  Supabase健康检查: ${this.results.supabase.health.status}`);
      }

      if (this.results.supabase.envValidation.valid) {
        console.log('  ✅ 环境变量验证通过');
      } else {
        console.log('  ⚠️  环境变量验证发现问题');
        this.results.supabase.envValidation.required.missing.forEach(varName => {
          console.log(`    - 缺失: ${varName}`);
        });
      }

    } catch (error) {
      this.results.supabase = {
        initialized: false,
        error: error.message
      };

      this.results.overall.errors.push(`Supabase配置验证失败: ${error.message}`);
      this.results.overall.valid = false;

      console.log(`  ❌ Supabase配置验证失败: ${error.message}`);
    }
  }

  /**
   * 输出验证结果
   */
  outputResults() {
    console.log('\n' + '='.repeat(50));
    console.log('📋 配置验证结果');
    console.log('='.repeat(50));

    // 总体状态
    const status = this.results.overall.valid ? '✅ 通过' : '❌ 失败';
    const statusColor = this.results.overall.valid ? '\x1b[32m' : '\x1b[31m';
    console.log(`${statusColor}总体状态: ${status}\x1b[0m`);

    // 错误和警告
    if (this.results.overall.errors.length > 0) {
      console.log('\n❌ 错误:');
      this.results.overall.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }

    if (this.results.overall.warnings.length > 0) {
      console.log('\n⚠️  警告:');
      this.results.overall.warnings.forEach((warning, index) => {
        console.log(`  ${index + 1}. ${warning}`);
      });
    }

    // 详细结果
    console.log('\n📊 详细结果:');
    console.log(`  环境变量: ${this.results.environment.required.present.length}/${this.results.environment.required.present.length + this.results.environment.required.missing.length} 必需变量`);
    console.log(`  配置服务: ${this.results.configService.initialized ? '✅' : '❌'}`);
    console.log(`  数据库配置: ${this.results.database.initialized ? '✅' : '⚠️'}`);
    console.log(`  Supabase配置: ${this.results.supabase.initialized ? '✅' : '❌'}`);

    // 建议操作
    console.log('\n💡 建议操作:');
    if (this.results.overall.errors.length > 0) {
      console.log('  1. 修复所有错误项');
    }
    if (this.results.overall.warnings.length > 0) {
      console.log('  2. 检查警告项');
    }
    console.log('  3. 确保 .env 文件包含所有必需的环境变量');
    console.log('  4. 检查网络连接和数据库访问权限');

    // 输出JSON格式结果（用于CI/CD）
    if (process.env.NODE_ENV === 'test' || process.env.OUTPUT_JSON === 'true') {
      console.log('\nJSON Results:');
      console.log(JSON.stringify(this.results, null, 2));
    }
  }

  /**
   * 生成配置报告
   */
  generateReport() {
    return {
      timestamp: new Date().toISOString(),
      results: this.results,
      summary: {
        valid: this.results.overall.valid,
        errorCount: this.results.overall.errors.length,
        warningCount: this.results.overall.warnings.length,
        components: {
          environment: this.results.environment.required.valid,
          configService: this.results.configService.initialized,
          database: this.results.database.initialized,
          supabase: this.results.supabase.initialized
        }
      }
    };
  }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new ConfigValidator();
  validator.validateAll().catch(console.error);
}

export default ConfigValidator;