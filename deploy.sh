#!/bin/bash

# 新闻聚合系统 - 快速部署脚本
# 作者: timink
# 版本: 1.0.0
# 基于 Nginx Proxy Manager 最佳实践

set -e

echo "🚀 开始部署新闻聚合系统..."

# 检查 Docker 是否运行
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker 未运行，请启动 Docker"
    exit 1
fi

# 检查 Docker Compose
if ! docker-compose --version > /dev/null 2>&1; then
    echo "❌ Docker Compose 未安装"
    exit 1
fi

# 创建外部网络（如果不存在）
if ! docker network inspect proxy_network > /dev/null 2>&1; then
    echo "🌐 创建 proxy_network 网络..."
    docker network create proxy_network
fi

# 停止现有服务
echo "🛑 停止现有服务..."
docker-compose down

# 构建并启动服务
echo "🏗️ 构建并启动服务..."
docker-compose up -d --build

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 30

# 健康检查
echo "🔍 执行健康检查..."
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ 部署成功！"
    echo ""
    echo "📊 服务状态："
    docker-compose ps
    echo ""
    echo "🌐 应用地址: http://localhost:3000"
    echo "🔍 健康检查: http://localhost:3000/health"
    echo "📝 查看日志: docker-compose logs -f"
else
    echo "❌ 部署失败，请检查日志"
    docker-compose logs app
    exit 1
fi