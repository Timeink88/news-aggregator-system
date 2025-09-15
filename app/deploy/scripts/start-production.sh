#!/bin/bash

echo "🚀 启动新闻聚合系统..."

# 检查环境变量
if [ ! -f ".env.production" ]; then
    echo "❌ .env.production 文件不存在"
    exit 1
fi

# 检查Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose 未安装"
    exit 1
fi

# 启动服务
echo "🔧 启动服务..."
docker-compose -f docker-compose.prod.yml up -d

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 30

# 检查健康状态
echo "🔍 检查服务健康状态..."
if curl -f http://localhost/health > /dev/null 2>&1; then
    echo "✅ 服务启动成功"
    echo "🌐 访问地址: https://localhost"
    echo "📊 监控面板: http://localhost:3001"
    echo "📈 Prometheus: http://localhost:9090"
else
    echo "❌ 服务启动失败"
    docker-compose -f docker-compose.prod.yml logs
    exit 1
fi
