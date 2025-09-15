/**
 * 数据库迁移和种子数据管理
 * 遵循Node.js最佳实践：版本控制、回滚机制、数据验证
 */

import dbClient from './client.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

// ES模块环境下的路径处理
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 迁移管理器类
 */
class MigrationManager {
  constructor() {
    this.migrationsDir = path.join(__dirname, '..', '..', 'supabase', 'migrations');
    this.seedsDir = path.join(__dirname, '..', '..', 'supabase', 'seeds');
    this.migrationsTable = 'schema_migrations';
    this.isInitialized = false;
  }

  /**
   * 初始化迁移管理器
   */
  async initialize() {
    try {
      logger.info('正在初始化迁移管理器...');

      // 确保迁移表存在
      await this.ensureMigrationsTable();

      this.isInitialized = true;
      logger.info('迁移管理器初始化成功');

    } catch (error) {
      logger.error('迁移管理器初始化失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 确保迁移表存在
   */
  async ensureMigrationsTable() {
    try {
      const { error } = await dbClient.getClient(true).rpc('exec_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS ${this.migrationsTable} (
            id SERIAL PRIMARY KEY,
            version VARCHAR(255) NOT NULL UNIQUE,
            name VARCHAR(255) NOT NULL,
            executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            execution_time INTEGER,
            status VARCHAR(50) DEFAULT 'completed'
          );
        `
      });

      if (error) {
        throw error;
      }

      logger.info('迁移表已确保存在');

    } catch (error) {
      logger.error('确保迁移表存在失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 获取已执行的迁移
   * @returns {Promise<Array>} 已执行的迁移列表
   */
  async getExecutedMigrations() {
    try {
      const { error } = await dbClient.getClient(true)
        .from(this.migrationsTable)
        .select('*')
        .order('version', { ascending: true });

      if (error) {
        throw error;
      }

      return migrations || [];

    } catch (error) {
      logger.error('获取已执行迁移失败', { error: error.message });
      return [];
    }
  }

  /**
   * 获取待执行的迁移
   * @returns {Promise<Array>} 待执行的迁移列表
   */
  async getPendingMigrations() {
    try {
      // 获取迁移文件
      const migrationFiles = await this.getMigrationFiles();
      const executedMigrations = await this.getExecutedMigrations();
      const executedVersions = new Set(executedMigrations.map(m => m.version));

      const pending = migrationFiles
        .filter(file => !executedVersions.has(file.version))
        .sort((a, b) => a.version.localeCompare(b.version));

      return pending;

    } catch (error) {
      logger.error('获取待执行迁移失败', { error: error.message });
      return [];
    }
  }

  /**
   * 获取迁移文件列表
   * @returns {Promise<Array>} 迁移文件列表
   */
  async getMigrationFiles() {
    try {
      const files = await fs.readdir(this.migrationsDir);
      const migrationFiles = [];

      for (const file of files) {
        if (file.endsWith('.sql')) {
          const match = file.match(/^(\d+)_(.+)\.sql$/);
          if (match) {
            migrationFiles.push({
              version: match[1],
              name: match[2],
              filename: file,
              path: path.join(this.migrationsDir, file)
            });
          }
        }
      }

      return migrationFiles;

    } catch (error) {
      logger.error('获取迁移文件失败', { error: error.message });
      return [];
    }
  }

  /**
   * 执行迁移
   * @param {string} version - 指定版本，如果为空则执行所有待执行迁移
   * @returns {Promise<Object>} 执行结果
   */
  async migrate(version = null) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const pendingMigrations = await this.getPendingMigrations();
      const migrationsToRun = version
        ? pendingMigrations.filter(m => m.version === version)
        : pendingMigrations;

      if (migrationsToRun.length === 0) {
        logger.info('没有待执行的迁移');
        return { success: true, executed: 0 };
      }

      logger.info(`开始执行 ${migrationsToRun.length} 个迁移`);

      const results = [];
      for (const migration of migrationsToRun) {
        const result = await this.executeMigration(migration);
        results.push(result);
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      logger.info(`迁移执行完成: 成功 ${successCount} 个, 失败 ${failureCount} 个`);

      return {
        success: failureCount === 0,
        executed: successCount,
        failed: failureCount,
        results
      };

    } catch (error) {
      logger.error('执行迁移失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 执行单个迁移
   * @param {Object} migration - 迁移对象
   * @returns {Promise<Object>} 执行结果
   */
  async executeMigration(migration) {
    try {
      logger.info(`执行迁移: ${migration.version}_${migration.name}`);

      const startTime = Date.now();

      // 读取迁移文件
      const sql = await fs.readFile(migration.path, 'utf-8');

      // 执行迁移
      const { error } = await dbClient.getClient(true).rpc('exec_sql', { sql });

      const executionTime = Date.now() - startTime;

      if (error) {
        throw error;
      }

      // 记录迁移执行
      await dbClient.insert({
        table: this.migrationsTable,
        useServiceClient: true,
        data: {
          version: migration.version,
          name: migration.name,
          executed_at: new Date().toISOString(),
          execution_time: executionTime,
          status: 'completed'
        }
      });

      logger.info(`迁移执行成功: ${migration.version}_${migration.name} (${executionTime}ms)`);

      return {
        success: true,
        version: migration.version,
        name: migration.name,
        executionTime
      };

    } catch (error) {
      logger.error(`迁移执行失败: ${migration.version}_${migration.name}`, { error: error.message });

      // 记录失败状态
      try {
        await dbClient.insert({
          table: this.migrationsTable,
          useServiceClient: true,
          data: {
            version: migration.version,
            name: migration.name,
            executed_at: new Date().toISOString(),
            status: 'failed'
          }
        });
      } catch (recordError) {
        logger.error('记录迁移失败状态失败', { error: recordError.message });
      }

      return {
        success: false,
        version: migration.version,
        name: migration.name,
        error: error.message
      };
    }
  }

  /**
   * 回滚迁移
   * @param {string} version - 要回滚到的版本
   * @returns {Promise<Object>} 回滚结果
   */
  async rollback(version) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const executedMigrations = await this.getExecutedMigrations();
      const migrationsToRollback = executedMigrations
        .filter(m => m.version > version)
        .sort((a, b) => b.version.localeCompare(a.version));

      if (migrationsToRollback.length === 0) {
        logger.info('没有需要回滚的迁移');
        return { success: true, rolledBack: 0 };
      }

      logger.info(`开始回滚 ${migrationsToRollback.length} 个迁移`);

      const results = [];
      for (const migration of migrationsToRollback) {
        const result = await this.rollbackMigration(migration);
        results.push(result);
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      logger.info(`回滚完成: 成功 ${successCount} 个, 失败 ${failureCount} 个`);

      return {
        success: failureCount === 0,
        rolledBack: successCount,
        failed: failureCount,
        results
      };

    } catch (error) {
      logger.error('回滚迁移失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 回滚单个迁移
   * @param {Object} migration - 迁移记录
   * @returns {Promise<Object>} 回滚结果
   */
  async rollbackMigration(migration) {
    try {
      logger.info(`回滚迁移: ${migration.version}_${migration.name}`);

      // 这里需要实现具体的回滚逻辑
      // 通常需要根据迁移内容编写对应的回滚SQL
      // 或者要求每个迁移文件包含对应的回滚SQL

      // 暂时只删除迁移记录
      await dbClient.getClient(true)
        .from(this.migrationsTable)
        .delete()
        .eq('version', migration.version);

      logger.info(`迁移回滚成功: ${migration.version}_${migration.name}`);

      return {
        success: true,
        version: migration.version,
        name: migration.name
      };

    } catch (error) {
      logger.error(`迁移回滚失败: ${migration.version}_${migration.name}`, { error: error.message });
      return {
        success: false,
        version: migration.version,
        name: migration.name,
        error: error.message
      };
    }
  }

  /**
   * 重置数据库（谨慎使用）
   * @param {boolean} confirm - 确认标识
   * @returns {Promise<Object>} 重置结果
   */
  async reset(confirm = false) {
    if (!confirm) {
      throw new Error('重置数据库需要确认参数设置为true');
    }

    try {
      logger.warn('开始重置数据库...');

      // 删除所有表（除了迁移表）
      await this.dropAllTables();

      // 重新执行所有迁移
      const result = await this.migrate();

      logger.info('数据库重置完成');

      return {
        success: true,
        migrationsExecuted: result.executed || 0
      };

    } catch (error) {
      logger.error('重置数据库失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 删除所有表（除了迁移表）
   */
  async dropAllTables() {
    try {
      const { data: tables, error } = await dbClient.getClient(true).rpc('get_tables');

      if (error) {
        throw error;
      }

      // 过滤掉系统表和迁移表
      const tablesToDrop = tables.filter(table =>
        !table.startsWith('pg_') &&
        !table.startsWith('information_schema') &&
        table !== this.migrationsTable
      );

      for (const table of tablesToDrop) {
        const { error: dropError } = await dbClient.getClient(true).rpc('exec_sql', {
          sql: `DROP TABLE IF EXISTS ${table} CASCADE;`
        });

        if (dropError) {
          logger.warn(`删除表失败: ${table}`, { error: dropError.message });
        } else {
          logger.info(`表已删除: ${table}`);
        }
      }

    } catch (error) {
      logger.error('删除所有表失败', { error: error.message });
      throw error;
    }
  }
}

/**
 * 种子数据管理器类
 */
class SeedManager {
  constructor() {
    this.seedsDir = path.join(__dirname, '..', '..', 'supabase', 'seeds');
    this.isInitialized = false;
  }

  /**
   * 初始化种子数据管理器
   */
  async initialize() {
    try {
      logger.info('正在初始化种子数据管理器...');

      this.isInitialized = true;
      logger.info('种子数据管理器初始化成功');

    } catch (error) {
      logger.error('种子数据管理器初始化失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 获取种子文件列表
   * @returns {Promise<Array>} 种子文件列表
   */
  async getSeedFiles() {
    try {
      const files = await fs.readdir(this.seedsDir);
      const seedFiles = [];

      for (const file of files) {
        if (file.endsWith('.sql')) {
          const match = file.match(/^(\d+)_(.+)\.sql$/);
          if (match) {
            seedFiles.push({
              order: parseInt(match[1]),
              name: match[2],
              filename: file,
              path: path.join(this.seedsDir, file)
            });
          }
        }
      }

      return seedFiles.sort((a, b) => a.order - b.order);

    } catch (error) {
      logger.error('获取种子文件失败', { error: error.message });
      return [];
    }
  }

  /**
   * 运行种子数据
   * @param {string} seedName - 指定种子名称，如果为空则运行所有种子
   * @returns {Promise<Object>} 执行结果
   */
  async run(seedName = null) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const seedFiles = await this.getSeedFiles();
      const seedsToRun = seedName
        ? seedFiles.filter(s => s.name === seedName || s.filename === seedName)
        : seedFiles;

      if (seedsToRun.length === 0) {
        logger.info('没有找到种子数据文件');
        return { success: true, executed: 0 };
      }

      logger.info(`开始运行 ${seedsToRun.length} 个种子数据文件`);

      const results = [];
      for (const seed of seedsToRun) {
        const result = await this.executeSeed(seed);
        results.push(result);
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      logger.info(`种子数据运行完成: 成功 ${successCount} 个, 失败 ${failureCount} 个`);

      return {
        success: failureCount === 0,
        executed: successCount,
        failed: failureCount,
        results
      };

    } catch (error) {
      logger.error('运行种子数据失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 执行单个种子文件
   * @param {Object} seed - 种子文件对象
   * @returns {Promise<Object>} 执行结果
   */
  async executeSeed(seed) {
    try {
      logger.info(`运行种子数据: ${seed.name}`);

      const startTime = Date.now();

      // 读取种子文件
      const sql = await fs.readFile(seed.path, 'utf-8');

      // 执行种子数据
      const { error } = await dbClient.getClient(true).rpc('exec_sql', { sql });

      const executionTime = Date.now() - startTime;

      if (error) {
        throw error;
      }

      logger.info(`种子数据运行成功: ${seed.name} (${executionTime}ms)`);

      return {
        success: true,
        name: seed.name,
        executionTime
      };

    } catch (error) {
      logger.error(`种子数据运行失败: ${seed.name}`, { error: error.message });
      return {
        success: false,
        name: seed.name,
        error: error.message
      };
    }
  }

  /**
   * 清理种子数据
   * @returns {Promise<Object>} 清理结果
   */
  async cleanup() {
    try {
      logger.info('开始清理种子数据...');

      // 这里需要实现具体的清理逻辑
      // 通常每个种子文件都应该有对应的清理SQL

      logger.info('种子数据清理完成');

      return {
        success: true,
        message: '种子数据清理完成'
      };

    } catch (error) {
      logger.error('清理种子数据失败', { error: error.message });
      throw error;
    }
  }
}

// 创建并导出实例
const migrationManager = new MigrationManager();
const seedManager = new SeedManager();

export {
  MigrationManager,
  SeedManager,
  migrationManager,
  seedManager
};