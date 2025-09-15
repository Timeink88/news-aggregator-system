# 新闻聚合系统 (News Aggregator System)

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/docker-24.0%2B-blue)](https://www.docker.com/)
[![Author](https://img.shields.io/badge/author-timink-orange)](https://github.com/timink)

一个基于 AI 的现代化新闻聚合系统，支持多源新闻抓取、智能摘要和实时推送功能。

## 🚀 功能特性

- **多源新闻聚合**: 支持 RSS、NewsAPI 等多种新闻源
- **AI 智能摘要**: 使用 DeepSeek-V3.1 模型生成新闻摘要
- **实时推送**: 支持邮件和实时消息推送
- **Web 管理界面**: 现代化的管理后台
- **Docker 部署**: 完整的容器化部署方案
- **Redis 缓存**: 高性能缓存系统
- **Supabase 存储**: 可靠的云端数据存储

## 🏗️ 系统架构

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Client    │    │   Admin Panel   │    │   Mobile App    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Nginx Proxy   │
                    │    Manager      │
                    └─────────────────┘
                                 │
                    ┌─────────────────┐
                    │  News Aggregator│
                    │     (Node.js)   │
                    └─────────────────┘
                                 │
                    ┌─────────────────┐    ┌─────────────────┐
                    │     Redis       │    │    Supabase    │
                    │     Cache       │    │    Database    │
                    └─────────────────┘    └─────────────────┘
```

## 📁 目录结构

```
news-aggregator-system/
├── app/                          # 应用程序主目录
│   ├── src/                      # 源代码
│   │   ├── controllers/          # 控制器
│   │   ├── models/              # 数据模型
│   │   ├── routes/              # 路由
│   │   ├── services/            # 业务服务
│   │   ├── utils/               # 工具函数
│   │   └── server.js            # 服务器入口
│   ├── config/                  # 配置文件
│   │   ├── database.js          # 数据库配置
│   │   └── services.js          # 服务配置
│   └── deploy/                  # 部署相关
│       ├── Dockerfile           # Docker 镜像配置
│       └── docker/              # Docker 配置文件
├── docker-compose.yml           # Docker Compose 配置
├── .env                         # 环境变量配置
├── .env.production              # 生产环境配置
├── package.json                 # Node.js 依赖
└── README.md                    # 项目文档
```

## 🛠️ 快速开始

### 前置要求

- Node.js >= 18.0
- Docker >= 24.0
- Docker Compose >= 2.0
- Nginx Proxy Manager (可选，用于反向代理)

### 1. 克隆项目

```bash
git clone <your-repo-url>
cd news-aggregator-system
```

### 2. 环境配置

复制环境变量模板并修改：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入您的配置：

```env
# 基础配置
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
TZ=Asia/Shanghai

# 数据库配置
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key

# AI 服务配置
DEEPSEEK_BASE_URL=your_deepseek_url
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_MODEL=DeepSeek-V3.1

# 邮件服务配置
SMTP_HOST=smtp.your-domain.com
SMTP_PORT=465
SMTP_USER=your_smtp_user@domain.com
SMTP_PASS=your_email_password
FROM_EMAIL=your_smtp_user@domain.com
TO_EMAIL=recipient@domain.com

# Redis 配置
REDIS_PASSWORD=your_redis_password
```

### 3. 启动服务

使用 Docker Compose 启动所有服务：

```bash
# 启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f app
```

### 4. 健康检查

访问健康检查端点确认服务运行正常：

```bash
curl http://localhost:3000/health
```

## 🔧 配置说明

### 环境变量详解

| 变量名 | 描述 | 默认值 | 必填 |
|--------|------|--------|------|
| `NODE_ENV` | 运行环境 | `production` | ✅ |
| `PORT` | 应用端口 | `3000` | ✅ |
| `SUPABASE_URL` | Supabase 数据库 URL | - | ✅ |
| `SUPABASE_KEY` | Supabase API 密钥 | - | ✅ |
| `DEEPSEEK_BASE_URL` | DeepSeek API 地址 | - | ✅ |
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 | - | ✅ |
| `SMTP_HOST` | SMTP 服务器地址 | - | ✅ |
| `SMTP_PORT` | SMTP 端口 | `465` | ✅ |
| `REDIS_PASSWORD` | Redis 密码 | - | ✅ |

### Nginx Proxy Manager 配置

如果您使用 Nginx Proxy Manager，请按以下配置：

1. **创建代理主机**
   - 域名：`news.your-domain.com`
   - 目标：`http://news-aggregator-app:3000`
   - 网络：`proxy_network`

2. **SSL 证书**
   - 启用 SSL
   - 选择 Let's Encrypt 证书

3. **安全设置**
   - 启用 Websocket 支持
   - 开启 HTTP/2

## 📊 监控和维护

### 健康检查

系统提供多个健康检查端点：

```bash
# 应用健康状态
curl http://localhost:3000/health

# 数据库连接状态
curl http://localhost:3000/health/database

# Redis 连接状态
curl http://localhost:3000/health/redis

# 外部服务状态
curl http://localhost:3000/health/services
```

### 日志管理

```bash
# 查看实时日志
docker-compose logs -f app

# 查看特定服务日志
docker-compose logs -f redis

# 查看最近 100 行日志
docker-compose logs --tail=100 app
```

### 数据备份

```bash
# 备份数据目录
tar -czf backup-$(date +%Y%m%d).tar.gz data/

# 备份配置文件
tar -czf config-backup-$(date +%Y%m%d).tar.gz .env .env.production
```

## 🚀 部署指南

### 生产环境部署

1. **服务器准备**
   ```bash
   # 更新系统
   sudo apt update && sudo apt upgrade -y

   # 安装 Docker
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh

   # 安装 Docker Compose
   sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
   sudo chmod +x /usr/local/bin/docker-compose
   ```

2. **创建网络**
   ```bash
   docker network create proxy_network
   ```

3. **部署应用**
   ```bash
   git clone <your-repo-url>
   cd news-aggregator-system
   cp .env.example .env
   # 编辑 .env 文件
   docker-compose up -d
   ```

### 自动化部署

创建 `deploy.sh` 脚本：

```bash
#!/bin/bash
# deploy.sh - 自动化部署脚本

set -e

echo "🚀 开始部署新闻聚合系统..."

# 停止现有服务
docker-compose down

# 拉取最新代码
git pull origin main

# 重新构建服务
docker-compose build

# 启动服务
docker-compose up -d

# 等待服务启动
sleep 30

# 健康检查
if curl -f http://localhost:3000/health; then
    echo "✅ 部署成功！"
else
    echo "❌ 部署失败，请检查日志"
    docker-compose logs app
    exit 1
fi
```

## 🛡️ 安全配置

### 网络安全

- 使用 `proxy_network` 进行容器间通信
- 禁用不必要的端口暴露
- 配置防火墙规则

### 数据安全

- 使用强密码和 API 密钥
- 定期轮换密钥
- 启用 SSL 证书

### 访问控制

- 配置 Nginx 基本认证
- 限制 API 访问频率
- 监控异常请求

## 🔧 故障排除

### 常见问题

1. **服务启动失败**
   ```bash
   # 检查端口占用
   netstat -tulpn | grep :3000

   # 检查 Docker 服务状态
   docker system info

   # 查看详细日志
   docker-compose logs app
   ```

2. **数据库连接失败**
   ```bash
   # 检查 Supabase 连接
   curl -I $SUPABASE_URL

   # 验证 API 密钥
   echo $SUPABASE_KEY
   ```

3. **Redis 连接失败**
   ```bash
   # 检查 Redis 容器状态
   docker-compose ps redis

   # 测试 Redis 连接
   docker-compose exec redis redis-cli ping
   ```

### 性能优化

1. **调整缓存配置**
   ```env
   REDIS_TTL=7200
   CACHE_TIMEOUT=7200000
   ```

2. **优化数据库连接**
   ```env
   SUPABASE_POOL_MAX=20
   SUPABASE_POOL_MIN=5
   ```

3. **监控资源使用**
   ```bash
   # 查看 CPU 使用率
   docker stats

   # 查看内存使用
   docker-compose exec app node -e "console.log(process.memoryUsage())"
   ```

## 📝 API 文档

### 主要端点

- `GET /health` - 健康检查
- `GET /api/news` - 获取新闻列表
- `GET /api/news/:id` - 获取新闻详情
- `POST /api/news/refresh` - 刷新新闻源
- `GET /api/admin/stats` - 管理统计

### 认证方式

使用 Bearer Token 进行 API 认证：

```bash
curl -H "Authorization: Bearer your_token" http://localhost:3000/api/news
```

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 📞 支持

- **作者**: Timeink88
- **GitHub**: [Timeink88](https://github.com/Timeink88)
- **GitHub Issues**: [提交问题](https://github.com/Timeink88/news-aggregator-system/issues)

---

**⭐ 如果这个项目对您有帮助，请给我们一个 Star！**