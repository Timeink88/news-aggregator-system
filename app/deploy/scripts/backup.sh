#!/bin/bash

# 备份脚本
BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)

# 创建备份目录
mkdir -p $BACKUP_DIR

# 备份数据库
echo "备份数据库..."
docker exec news-aggregator-prod pg_dump -U postgres -d news_aggregator > $BACKUP_DIR/db_backup_$DATE.sql

# 备份配置文件
echo "备份配置文件..."
tar -czf $BACKUP_DIR/config_backup_$DATE.tar.gz config/ .env.production

# 备份日志
echo "备份日志..."
tar -czf $BACKUP_DIR/logs_backup_$DATE.tar.gz logs/

# 清理30天前的备份
echo "清理旧备份..."
find $BACKUP_DIR -name "*.sql" -mtime +30 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

echo "备份完成: $BACKUP_DIR"
