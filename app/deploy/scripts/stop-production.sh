#!/bin/bash

echo "🛑 停止新闻聚合系统..."

# 停止服务
docker-compose -f docker-compose.prod.yml down

echo "✅ 服务已停止"
