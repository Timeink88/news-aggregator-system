# RSS Manager Service 使用指南

RSS Manager Service 是新闻聚合系统的核心组件，负责RSS源的管理、新闻抓取和内容处理。该服务集成了newspaper3k库用于高级内容提取，提供了强大的错误处理、重试机制和性能优化功能。

## 功能特性

- **RSS源管理**: 添加、更新、删除RSS源
- **新闻抓取**: 从RSS源自动抓取新闻文章
- **内容处理**: 清理、验证和格式化文章内容
- **错误处理**: 完善的重试机制和错误恢复
- **性能优化**: 并发控制、批量处理、缓存机制
- **监控统计**: 详细的执行日志和性能指标

## 快速开始

### 1. 初始化

```javascript
import RSSManager from './services/RSSManager.js';

// 创建实例
const rssManager = new RSSManager();

// 初始化
await rssManager.initialize();
```

### 2. 添加RSS源

```javascript
const sourceData = {
  name: '36氪',
  url: 'https://36kr.com/feed',
  description: '36氪是专注创投的科技媒体',
  category: 'tech',
  language: 'zh',
  fetch_interval: 600
};

const source = await rssManager.addSource(sourceData);
console.log('RSS源添加成功:', source);
```

### 3. 抓取RSS源

```javascript
// 抓取单个RSS源
const result = await rssManager.fetchSource(sourceId);
console.log('抓取结果:', result);

// 批量抓取RSS源
const sourceIds = ['source1', 'source2', 'source3'];
const batchResult = await rssManager.fetchMultipleSources(sourceIds, {
  batchSize: 3,
  batchDelay: 1000
});
console.log('批量抓取结果:', batchResult);

// 抓取所有活跃RSS源
const allResult = await rssManager.fetchAllActiveSources();
console.log('所有活跃源抓取结果:', allResult);
```

### 4. 获取RSS源列表

```javascript
// 获取所有RSS源
const sources = await rssManager.getSources({
  pagination: { page: 1, limit: 20 },
  filters: [{ column: 'is_active', operator: 'eq', value: true }],
  sort: { sortBy: 'created_at', sortOrder: 'desc' }
});

// 获取活跃RSS源
const activeSources = await rssManager.getActiveSources();
```

### 5. 验证和测试RSS源

```javascript
// 验证RSS源
const validationResult = await rssManager.validateSource('https://example.com/feed.xml');
console.log('验证结果:', validationResult);

// 测试连接
const connectionTest = await rssManager.testConnection('https://example.com/feed.xml');
console.log('连接测试:', connectionTest);
```

## 配置选项

### 基础配置

```javascript
const config = {
  timeout: 30000,        // 请求超时时间（毫秒）
  maxRetries: 3,         // 最大重试次数
  retryDelay: 1000,      // 重试延迟（毫秒）
  userAgent: 'NewsAggregator/1.0',
  maxContentLength: 50000, // 最大内容长度
  defaultLanguage: 'zh'   // 默认语言
};
```

### 并发控制

```javascript
const concurrentConfig = {
  maxConcurrentFetches: 5,  // 最大并发抓取数
  batchSize: 10,            // 批量处理大小
  batchDelay: 1000          // 批次间延迟（毫秒）
};
```

### 监控配置

```javascript
const monitoringConfig = {
  enabled: true,
  metrics: {
    fetchCount: true,
    fetchDuration: true,
    errorCount: true,
    successRate: true
  },
  alerts: {
    highErrorRate: {
      enabled: true,
      threshold: 0.1
    }
  }
};
```

## API 参考

### RSSManager 类

#### 构造函数

```javascript
new RSSManager()
```

创建新的RSS Manager实例。

#### 方法

##### `initialize()`

初始化RSS Manager服务。

**返回值:** `Promise<boolean>` - 初始化是否成功

**示例:**
```javascript
const success = await rssManager.initialize();
```

##### `addSource(sourceData)`

添加新的RSS源。

**参数:**
- `sourceData` (Object): RSS源数据
  - `name` (string): RSS源名称
  - `url` (string): RSS源URL
  - `description` (string, 可选): RSS源描述
  - `category` (string): 文章类别
  - `language` (string, 可选): 语言代码，默认为 'zh'
  - `fetch_interval` (number, 可选): 抓取间隔（秒）

**返回值:** `Promise<Object>` - 创建的RSS源对象

**示例:**
```javascript
const source = await rssManager.addSource({
  name: 'TechCrunch',
  url: 'https://techcrunch.com/feed/',
  category: 'tech',
  language: 'en'
});
```

##### `updateSource(id, updateData)`

更新RSS源。

**参数:**
- `id` (string): RSS源ID
- `updateData` (Object): 更新数据

**返回值:** `Promise<Object>` - 更新后的RSS源对象

**示例:**
```javascript
const updatedSource = await rssManager.updateSource(sourceId, {
  name: 'Updated RSS Source',
  fetch_interval: 1200
});
```

##### `deleteSource(id)`

删除RSS源。

**参数:**
- `id` (string): RSS源ID

**返回值:** `Promise<boolean>` - 是否成功删除

**示例:**
```javascript
const success = await rssManager.deleteSource(sourceId);
```

##### `fetchSource(sourceId, options)`

抓取单个RSS源。

**参数:**
- `sourceId` (string): RSS源ID
- `options` (Object, 可选): 抓取选项

**返回值:** `Promise<Object>` - 抓取结果

**示例:**
```javascript
const result = await rssManager.fetchSource(sourceId, {
  timeout: 60000,
  maxArticles: 50
});
```

##### `fetchMultipleSources(sourceIds, options)`

批量抓取RSS源。

**参数:**
- `sourceIds` (Array<string>): RSS源ID数组
- `options` (Object, 可选): 批量抓取选项
  - `batchSize` (number): 批次大小
  - `batchDelay` (number): 批次间延迟（毫秒）

**返回值:** `Promise<Object>` - 批量抓取结果

**示例:**
```javascript
const result = await rssManager.fetchMultipleSources(['id1', 'id2'], {
  batchSize: 2,
  batchDelay: 1000
});
```

##### `getSources(params)`

获取RSS源列表。

**参数:**
- `params` (Object, 可选): 查询参数
  - `pagination` (Object): 分页参数
  - `filters` (Array): 过滤条件
  - `sort` (Object): 排序参数

**返回值:** `Promise<PaginatedResult>` - 分页结果

**示例:**
```javascript
const sources = await rssManager.getSources({
  pagination: { page: 1, limit: 10 },
  filters: [{ column: 'category', operator: 'eq', value: 'tech' }]
});
```

##### `validateSource(url)`

验证RSS源。

**参数:**
- `url` (string): RSS源URL

**返回值:** `Promise<Object>` - 验证结果

**示例:**
```javascript
const validation = await rssManager.validateSource('https://example.com/feed.xml');
```

##### `testConnection(url)`

测试RSS源连接。

**参数:**
- `url` (string): RSS源URL

**返回值:** `Promise<Object>` - 连接测试结果

**示例:**
```javascript
const test = await rssManager.testConnection('https://example.com/feed.xml');
```

## 错误处理

### 常见错误类型

1. **RSS源验证错误**
   ```javascript
   try {
     await rssManager.addSource({ name: 'Test', url: 'invalid-url' });
   } catch (error) {
     console.error('RSS源验证失败:', error.message);
   }
   ```

2. **网络错误**
   ```javascript
   try {
     await rssManager.fetchSource(sourceId);
   } catch (error) {
     if (error.code === 'ETIMEDOUT') {
       console.error('网络超时:', error.message);
     }
   }
   ```

3. **数据库错误**
   ```javascript
   try {
     await rssManager.getSources();
   } catch (error) {
     console.error('数据库错误:', error.message);
   }
   ```

### 重试机制

RSS Manager内置了重试机制，自动处理以下错误：

- 网络超时 (`ETIMEDOUT`)
- 连接重置 (`ECONNRESET`)
- 连接拒绝 (`ECONNREFUSED`)
- DNS解析失败 (`ENOTFOUND`)

## 性能优化

### 1. 并发控制

```javascript
// 设置合适的并发数
const result = await rssManager.fetchMultipleSources(sourceIds, {
  maxConcurrentFetches: 5,
  batchSize: 10
});
```

### 2. 批量处理

```javascript
// 批量处理RSS源，减少网络开销
const batchResult = await rssManager.fetchMultipleSources(sourceIds, {
  batchSize: 10,
  batchDelay: 1000
});
```

### 3. 错误处理优化

```javascript
// 快速失败模式
const results = await Promise.allSettled(
  sourceIds.map(id => rssManager.fetchSource(id))
);

const successful = results.filter(r => r.status === 'fulfilled');
const failed = results.filter(r => r.status === 'rejected');
```

## 监控和日志

### 1. 性能指标

RSS Manager提供详细的性能指标：

```javascript
// 获取执行统计
const stats = await rssManager.getSourceStats(sourceId);
console.log('统计信息:', stats);

// 监控执行时间
const result = await rssManager.fetchSource(sourceId);
console.log('执行时间:', result.executionTime);
```

### 2. 错误监控

```javascript
// 监控错误率
const errorRate = failed.length / sourceIds.length;
if (errorRate > 0.1) {
  console.warn('错误率过高:', errorRate);
}
```

## 最佳实践

### 1. RSS源选择

- 选择可靠的RSS源
- 避免频繁变化的RSS源
- 定期验证RSS源的有效性

### 2. 抓取策略

- 避免过于频繁的抓取
- 使用合适的并发控制
- 实现智能重试机制

### 3. 内容处理

- 清理HTML标签
- 验证内容质量
- 处理编码问题

### 4. 错误处理

- 实现完善的错误处理
- 记录详细的错误日志
- 提供友好的错误信息

## 测试

### 运行测试

```bash
npm test -- --testPathPattern=RSSManager
```

### 测试覆盖率

```bash
npm test -- --coverage --testPathPattern=RSSManager
```

## 故障排除

### 常见问题

1. **RSS源无法解析**
   - 检查RSS源URL是否正确
   - 验证RSS源是否在线
   - 检查网络连接

2. **抓取速度慢**
   - 调整并发数
   - 增加重试延迟
   - 优化RSS源选择

3. **内存占用高**
   - 减少批量处理大小
   - 增加清理频率
   - 监控内存使用

### 调试模式

```javascript
// 启用调试模式
const rssManager = new RSSManager({
  debug: true,
  logging: {
    level: 'debug',
    enablePerformance: true,
    enableNetwork: true
  }
});
```

## 贡献指南

1. 创建功能分支
2. 编写测试用例
3. 确保代码质量
4. 提交Pull Request

## 许可证

MIT License