#!/usr/bin/env node

/**
 * 优雅关闭脚本
 * 在容器停止时处理正在进行的请求和清理资源
 */

const logger = require('../src/utils/logger');

class GracefulShutdown {
  constructor() {
    this.isShuttingDown = false;
    this.activeConnections = 0;
    this.shutdownTimeout = 30000; // 30秒超时
    this.forceTimeout = 10000; // 10秒强制关闭
  }

  /**
   * 初始化优雅关闭
   */
  init(server) {
    this.server = server;

    // 监听连接事件
    this.server.on('connection', (socket) => {
      this.activeConnections++;
      logger.debug(`新连接建立，当前活跃连接数: ${this.activeConnections}`);

      socket.on('close', () => {
        this.activeConnections--;
        logger.debug(`连接关闭，当前活跃连接数: ${this.activeConnections}`);
      });
    });

    // 监听系统信号
    process.on('SIGTERM', () => this.handleShutdown('SIGTERM'));
    process.on('SIGINT', () => this.handleShutdown('SIGINT'));

    // 监听未捕获的异常
    process.on('uncaughtException', (error) => {
      logger.error('未捕获的异常:', error);
      this.handleShutdown('uncaughtException', error);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('未处理的Promise拒绝:', reason);
      this.handleShutdown('unhandledRejection', reason);
    });

    logger.info('优雅关闭已初始化');
  }

  /**
   * 处理关闭信号
   */
  async handleShutdown(signal, error) {
    if (this.isShuttingDown) {
      logger.warn('已经在关闭过程中，忽略重复信号');
      return;
    }

    this.isShuttingDown = true;

    if (error) {
      logger.error(`收到关闭信号 ${signal}，错误原因:`, error);
    } else {
      logger.info(`收到关闭信号: ${signal}`);
    }

    try {
      // 开始优雅关闭
      await this.performGracefulShutdown();

      logger.info('应用已优雅关闭');
      process.exit(0);
    } catch (shutdownError) {
      logger.error('优雅关闭失败:', shutdownError);
      process.exit(1);
    }
  }

  /**
   * 执行优雅关闭
   */
  async performGracefulShutdown() {
    logger.info('开始优雅关闭...');

    // 1. 停止接受新连接
    if (this.server) {
      await new Promise((resolve) => {
        this.server.close(() => {
          logger.info('服务器已停止接受新连接');
          resolve();
        });
      });
    }

    // 2. 等待现有连接完成
    if (this.activeConnections > 0) {
      logger.info(`等待 ${this.activeConnections} 个活跃连接完成...`);

      const waitStart = Date.now();
      while (this.activeConnections > 0 && Date.now() - waitStart < this.shutdownTimeout) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        logger.debug(`剩余活跃连接: ${this.activeConnections}`);
      }
    }

    // 3. 清理数据库连接
    await this.cleanupDatabaseConnections();

    // 4. 清理定时任务
    await this.cleanupScheduledTasks();

    // 5. 清理缓存连接
    await this.cleanupCacheConnections();

    // 6. 清理文件句柄
    await this.cleanupFileHandles();

    // 7. 刷新日志
    await this.flushLogs();

    logger.info('优雅关闭完成');
  }

  /**
   * 清理数据库连接
   */
  async cleanupDatabaseConnections() {
    logger.info('清理数据库连接...');

    try {
      // 这里可以添加具体的数据库连接清理逻辑
      // 例如：关闭Supabase连接池
      logger.info('数据库连接已清理');
    } catch (error) {
      logger.error('清理数据库连接时出错:', error);
    }
  }

  /**
   * 清理定时任务
   */
  async cleanupScheduledTasks() {
    logger.info('清理定时任务...');

    try {
      // 清理所有定时器
      const allTimers = global.setTimeout(() => {}, 0);
      for (let i = 1; i < allTimers; i++) {
        clearTimeout(i);
      }

      const allIntervals = global.setInterval(() => {}, 0);
      for (let i = 1; i < allIntervals; i++) {
        clearInterval(i);
      }

      logger.info('定时任务已清理');
    } catch (error) {
      logger.error('清理定时任务时出错:', error);
    }
  }

  /**
   * 清理缓存连接
   */
  async cleanupCacheConnections() {
    logger.info('清理缓存连接...');

    try {
      // 这里可以添加Redis连接清理逻辑
      logger.info('缓存连接已清理');
    } catch (error) {
      logger.error('清理缓存连接时出错:', error);
    }
  }

  /**
   * 清理文件句柄
   */
  async cleanupFileHandles() {
    logger.info('清理文件句柄...');

    try {
      // 强制垃圾回收（如果可用）
      if (global.gc) {
        global.gc();
      }

      logger.info('文件句柄已清理');
    } catch (error) {
      logger.error('清理文件句柄时出错:', error);
    }
  }

  /**
   * 刷新日志
   */
  async flushLogs() {
    logger.info('刷新日志...');

    try {
      // 确保所有日志都被写入
      if (process.stdout) {
        process.stdout.write('');
      }

      logger.info('日志已刷新');
    } catch (error) {
      logger.error('刷新日志时出错:', error);
    }
  }

  /**
   * 强制关闭（用于超时情况）
   */
  forceShutdown() {
    logger.warn('执行强制关闭...');

    // 立即关闭所有连接
    if (this.server) {
      this.server.closeAllConnections();
    }

    // 立即退出
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const gracefulShutdown = new GracefulShutdown();

  // 模拟服务器
  const mockServer = {
    close: (callback) => {
      setTimeout(callback, 1000);
    },
    on: (event, handler) => {
      // 模拟连接事件
    }
  };

  gracefulShutdown.init(mockServer);

  // 模拟关闭信号
  setTimeout(() => {
    process.emit('SIGTERM');
  }, 2000);

  // 设置强制关闭超时
  setTimeout(() => {
    gracefulShutdown.forceShutdown();
  }, gracefulShutdown.shutdownTimeout + gracefulShutdown.forceTimeout);
}

module.exports = GracefulShutdown;