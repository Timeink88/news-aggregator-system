/**
 * 新闻聚合系统命令行工具
 * 提供应用启动、停止、状态查询等功能
 */

import { program } from 'commander';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ES模块环境下的路径处理
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../.env') });

import logger from './utils/logger.js';

// 延迟导入应用，避免环境变量问题
let app = null;

async function getApp() {
  if (!app) {
    const { default: App } = await import('./app.js');
    app = new App();
  }
  return app;
}

// CLI程序配置
program
  .name('news-aggregator')
  .description('个性化新闻聚合与智能分析系统')
  .version(process.env.APP_VERSION || '1.0.0');

// 启动命令
program
  .command('start')
  .description('启动新闻聚合系统')
  .option('-d, --daemon', '以守护进程模式运行')
  .option('--env <env>', '指定运行环境', 'development')
  .action(async (options) => {
    try {
      logger.info('启动新闻聚合系统...', { daemon: options.daemon, env: options.env });

      const app = await getApp();
      await app.start();

      logger.info('新闻聚合系统启动成功');

      if (!options.daemon) {
        // 非守护进程模式，保持运行
        logger.info('按 Ctrl+C 停止服务');

        // 保持进程运行
        process.stdin.resume();
      }

    } catch (error) {
      logger.error('启动失败', { error: error.message });
      process.exit(1);
    }
  });

// 停止命令
program
  .command('stop')
  .description('停止新闻聚合系统')
  .action(async () => {
    try {
      logger.info('停止新闻聚合系统...');

      const app = await getApp();
      await app.stop();

      logger.info('新闻聚合系统已停止');

    } catch (error) {
      logger.error('停止失败', { error: error.message });
      process.exit(1);
    }
  });

// 重启命令
program
  .command('restart')
  .description('重启新闻聚合系统')
  .action(async () => {
    try {
      logger.info('重启新闻聚合系统...');

      const app = await getApp();
      await app.stop();
      await app.start();

      logger.info('新闻聚合系统重启成功');

    } catch (error) {
      logger.error('重启失败', { error: error.message });
      process.exit(1);
    }
  });

// 状态命令
program
  .command('status')
  .description('查看系统状态')
  .action(async () => {
    try {
      const app = await getApp();
      const status = app.getStatus();

      console.log('=== 新闻聚合系统状态 ===');
      console.log(`运行状态: ${status.isRunning ? '运行中' : '已停止'}`);
      console.log(`启动时间: ${status.startTime || 'N/A'}`);
      console.log(`运行时间: ${status.uptime ? `${status.uptime}ms` : 'N/A'}`);
      console.log(`系统版本: ${status.version}`);
      console.log(`运行环境: ${status.environment}`);
      console.log(`健康状态: ${status.healthStatus.overall}`);

      console.log('\n=== 服务状态 ===');
      for (const [serviceName, serviceStatus] of Object.entries(status.healthStatus.services)) {
        const statusIcon = serviceStatus === 'healthy' ? '✓' :
          serviceStatus === 'unhealthy' ? '✗' : '?';
        console.log(`${statusIcon} ${serviceName}: ${serviceStatus}`);
      }

      console.log('\n=== 已注册服务 ===');
      status.services.forEach(serviceName => {
        console.log(`- ${serviceName}`);
      });

    } catch (error) {
      logger.error('获取状态失败', { error: error.message });
      process.exit(1);
    }
  });

// 健康检查命令
program
  .command('health')
  .description('执行系统健康检查')
  .action(async () => {
    try {
      logger.info('执行系统健康检查...');

      const app = await getApp();
      await app.performHealthCheck();

      const status = app.getStatus();

      console.log('=== 健康检查结果 ===');
      console.log(`总体状态: ${status.healthStatus.overall}`);
      console.log(`检查时间: ${status.healthStatus.lastCheck}`);

      console.log('\n=== 服务健康状态 ===');
      for (const [serviceName, serviceStatus] of Object.entries(status.healthStatus.services)) {
        const statusIcon = serviceStatus === 'healthy' ? '✓' :
          serviceStatus === 'unhealthy' ? '✗' : '?';
        console.log(`${statusIcon} ${serviceName}: ${serviceStatus}`);
      }

      if (status.healthStatus.overall === 'healthy') {
        console.log('\n✅ 系统健康状态良好');
        process.exit(0);
      } else {
        console.log('\n❌ 系统存在健康问题');
        process.exit(1);
      }

    } catch (error) {
      logger.error('健康检查失败', { error: error.message });
      process.exit(1);
    }
  });

// 配置命令
program
  .command('config')
  .description('显示系统配置')
  .option('--show-secrets', '显示敏感配置信息')
  .action((options) => {
    console.log('=== 系统配置 ===');
    console.log(`应用名称: ${process.env.APP_NAME}`);
    console.log(`应用版本: ${process.env.APP_VERSION}`);
    console.log(`运行环境: ${process.env.NODE_ENV}`);
    console.log(`调试模式: ${process.env.DEBUG === 'true' ? '启用' : '禁用'}`);
    console.log(`服务器端口: ${process.env.PORT}`);
    console.log(`Supabase URL: ${process.env.SUPABASE_URL}`);
    console.log(`AI服务URL: ${process.env.AI_BASE_URL}`);

    if (options.showSecrets) {
      console.log(`AI API密钥: ${process.env.AI_API_KEY ? '已配置' : '未配置'}`);
      console.log(`Supabase服务密钥: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '已配置' : '未配置'}`);
      console.log(`邮件服务密钥: ${process.env.RESEND_API_KEY ? '已配置' : '未配置'}`);
    }
  });

// 日志命令
program
  .command('logs')
  .description('查看系统日志')
  .option('-f, --follow', '实时跟踪日志')
  .option('-n, --lines <number>', '显示最近N行日志', '50')
  .action((options) => {
    console.log('日志功能开发中...');
    console.log('参数:', options);
  });

// 测试命令
program
  .command('test')
  .description('运行系统测试')
  .option('--unit', '仅运行单元测试')
  .option('--integration', '仅运行集成测试')
  .option('--e2e', '仅运行端到端测试')
  .action(async (options) => {
    try {
      const { spawn } = await import('child_process');

      let testCommand = 'npm test';

      if (options.unit) {
        testCommand = 'npm run test:unit';
      } else if (options.integration) {
        testCommand = 'npm run test:integration';
      } else if (options.e2e) {
        testCommand = 'npm run test:e2e';
      }

      logger.info(`运行测试: ${testCommand}`);

      const child = spawn(testCommand, [], {
        shell: true,
        stdio: 'inherit'
      });

      child.on('close', (code) => {
        process.exit(code || 0);
      });

    } catch (error) {
      logger.error('测试运行失败', { error: error.message });
      process.exit(1);
    }
  });

// 重置命令
program
  .command('reset')
  .description('重置系统数据（危险操作）')
  .option('--confirm', '确认重置操作')
  .action(async (options) => {
    if (!options.confirm) {
      console.error('⚠️ 危险操作检测喵～');
      console.error('操作类型：系统数据重置');
      console.error('影响范围：清除所有数据库数据、缓存、日志文件');
      console.error('风险评估：数据丢失风险极高，不可恢复');
      console.error('(有点紧张呢，请确认是否继续？) 需要使用 --confirm 参数确认');
      process.exit(1);
    }

    try {
      logger.warn('执行系统重置操作...');

      const app = await getApp();

      // 停止服务
      await app.stop();

      // 调用清理服务执行深度清理
      const cleanupService = app.getService('cleanup');
      if (cleanupService) {
        await cleanupService.resetAllData();
      }

      console.log('✅ 系统重置完成');

    } catch (error) {
      logger.error('系统重置失败', { error: error.message });
      process.exit(1);
    }
  });

// 错误报告命令
program
  .command('error-report')
  .description('显示系统错误报告')
  .option('-j, --json', '以JSON格式输出')
  .action(async (options) => {
    try {
      const app = await getApp();

      if (!app) {
        console.log('❌ 无法连接到应用实例');
        process.exit(1);
      }

      const report = app.getErrorReport();

      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log('=== 系统错误报告 ===');
        console.log(`📊 生成时间: ${report.generatedAt}`);
        console.log(`🔥 总错误数: ${report.summary.totalErrors}`);
        console.log(`🏷️ 错误类型数: ${report.summary.uniqueTypes}`);
        console.log(`🚨 严重错误: ${report.summary.criticalErrors}`);
        console.log('');

        if (report.recommendations.length > 0) {
          console.log('💡 改进建议:');
          report.recommendations.forEach((rec, index) => {
            console.log(`   ${index + 1}. ${rec}`);
          });
          console.log('');
        }

        if (report.recentErrors.length > 0) {
          console.log('🕐 最近错误:');
          report.recentErrors.forEach((error, index) => {
            console.log(`   ${index + 1}. [${error.severity}] ${error.message}`);
          });
        }
      }

      process.exit(0);
    } catch (error) {
      console.error('❌ 获取错误报告失败:', error.message);
      process.exit(1);
    }
  });

// 开发服务器命令
program
  .command('dev')
  .description('启动开发服务器')
  .option('-p, --port <port>', '指定端口号', '3000')
  .option('--hot', '启用热重载')
  .action(async (options) => {
    try {
      logger.info('启动开发服务器...', { port: options.port, hot: options.hot });

      // 设置开发环境
      process.env.NODE_ENV = 'development';
      process.env.PORT = options.port;

      // 启动应用
      const app = await getApp();
      await app.start();

      logger.info(`开发服务器启动成功，端口: ${options.port}`);

    } catch (error) {
      logger.error('开发服务器启动失败', { error: error.message });
      process.exit(1);
    }
  });

// 解析命令行参数
program.parse();

// 如果没有提供命令，显示帮助
if (!process.argv.slice(2).length) {
  program.outputHelp();
}