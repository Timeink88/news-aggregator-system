#!/usr/bin/env node

/**
 * 生产环境部署脚本
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 开始生产环境部署...\n');

// 检查必要文件
const requiredFiles = [
  'docker-compose.prod.yml',
  'nginx.conf',
  '.env.production',
  'Dockerfile'
];

console.log('1. 检查必要文件...');
for (const file of requiredFiles) {
  if (fs.existsSync(file)) {
    console.log(`   ✅ ${file}`);
  } else {
    console.log(`   ❌ ${file} - 缺失`);
    process.exit(1);
  }
}

// 检查环境变量
console.log('\n2. 检查环境变量...');
const envFile = fs.readFileSync('.env.production', 'utf8');
const requiredEnvVars = [
  'DEEPSEEK_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_KEY',
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASS',
  'FROM_EMAIL',
  'TO_EMAIL'
];

for (const envVar of requiredEnvVars) {
  if (envFile.includes(`${envVar}=`) && !envFile.includes(`${envVar}=your-`)) {
    console.log(`   ✅ ${envVar}`);
  } else {
    console.log(`   ❌ ${envVar} - 未配置`);
  }
}

// 创建必要的目录
console.log('\n3. 创建必要目录...');
const directories = [
  'data',
  'logs',
  'config',
  'ssl',
  'monitoring/prometheus',
  'monitoring/grafana/dashboards',
  'monitoring/grafana/datasources',
  'monitoring/fluentd/conf'
];

for (const dir of directories) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`   📁 创建目录: ${dir}`);
  } else {
    console.log(`   📁 目录已存在: ${dir}`);
  }
}

// 创建SSL证书目录和自签名证书（开发环境）
console.log('\n4. 创建SSL证书...');
if (!fs.existsSync('ssl/cert.pem') || !fs.existsSync('ssl/key.pem')) {
  console.log('   📋 创建自签名SSL证书（生产环境请替换为正式证书）');

  // 创建自签名证书的命令
  const certCommand = `
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout ssl/key.pem \
    -out ssl/cert.pem \
    -subj "/C=CN/ST=Beijing/L=Beijing/O=NewsAggregator/CN=localhost"
  `;

  try {
    execSync(certCommand, { stdio: 'inherit' });
    console.log('   ✅ SSL证书创建成功');
  } catch (error) {
    console.log('   ⚠️  SSL证书创建失败，请手动安装openssl');
  }
} else {
  console.log('   ✅ SSL证书已存在');
}

// 创建Prometheus配置
console.log('\n5. 创建Prometheus配置...');
const prometheusConfig = `
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "rules/*.yml"

scrape_configs:
  - job_name: 'news-aggregator'
    static_configs:
      - targets: ['news-aggregator:3000']
    metrics_path: '/metrics'
    scrape_interval: 30s

  - job_name: 'nginx'
    static_configs:
      - targets: ['nginx:80']
    metrics_path: '/metrics'
    scrape_interval: 30s

  - job_name: 'redis'
    static_configs:
      - targets: ['redis:6379']
    scrape_interval: 30s
`;

fs.writeFileSync('monitoring/prometheus.yml', prometheusConfig);
console.log('   ✅ Prometheus配置已创建');

// 创建Grafana数据源配置
console.log('\n6. 创建Grafana配置...');
const grafanaDatasource = `
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
`;

if (!fs.existsSync('monitoring/grafana/datasources')) {
  fs.mkdirSync('monitoring/grafana/datasources', { recursive: true });
}
fs.writeFileSync('monitoring/grafana/datasources/prometheus.yml', grafanaDatasource);
console.log('   ✅ Grafana数据源配置已创建');

// 创建systemd服务文件（Linux系统）
console.log('\n7. 创建systemd服务文件...');
const systemdService = `
[Unit]
Description=News Aggregator System
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/news-aggregator
ExecStart=/usr/bin/docker-compose -f docker-compose.prod.yml up -d
ExecStop=/usr/bin/docker-compose -f docker-compose.prod.yml down
ExecReload=/usr/bin/docker-compose -f docker-compose.prod.yml restart
TimeoutStartSec=0
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
`;

fs.writeFileSync('news-aggregator.service', systemdService);
console.log('   ✅ systemd服务文件已创建');

// 创建备份脚本
console.log('\n8. 创建备份脚本...');
const backupScript = `#!/bin/bash

# 备份脚本
BACKUP_DIR="./backups"
DATE=\$(date +%Y%m%d_%H%M%S)

# 创建备份目录
mkdir -p \$BACKUP_DIR

# 备份数据库
echo "备份数据库..."
docker exec news-aggregator-prod pg_dump -U postgres -d news_aggregator > \$BACKUP_DIR/db_backup_\$DATE.sql

# 备份配置文件
echo "备份配置文件..."
tar -czf \$BACKUP_DIR/config_backup_\$DATE.tar.gz config/ .env.production

# 备份日志
echo "备份日志..."
tar -czf \$BACKUP_DIR/logs_backup_\$DATE.tar.gz logs/

# 清理30天前的备份
echo "清理旧备份..."
find \$BACKUP_DIR -name "*.sql" -mtime +30 -delete
find \$BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

echo "备份完成: \$BACKUP_DIR"
`;

fs.writeFileSync('scripts/backup.sh', backupScript);
fs.chmodSync('scripts/backup.sh', '755');
console.log('   ✅ 备份脚本已创建');

// 创建启动脚本
console.log('\n9. 创建启动脚本...');
const startScript = `#!/bin/bash

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
`;

fs.writeFileSync('scripts/start-production.sh', startScript);
fs.chmodSync('scripts/start-production.sh', '755');
console.log('   ✅ 启动脚本已创建');

// 创建停止脚本
console.log('\n10. 创建停止脚本...');
const stopScript = `#!/bin/bash

echo "🛑 停止新闻聚合系统..."

# 停止服务
docker-compose -f docker-compose.prod.yml down

echo "✅ 服务已停止"
`;

fs.writeFileSync('scripts/stop-production.sh', stopScript);
fs.chmodSync('scripts/stop-production.sh', '755');
console.log('   ✅ 停止脚本已创建');

console.log('\n🎉 生产环境部署准备完成！');
console.log('\n📋 部署步骤:');
console.log('1. 配置环境变量: cp .env.production .env');
console.log('2. 编辑 .env 文件，填入实际的配置值');
console.log('3. 运行启动脚本: ./scripts/start-production.sh');
console.log('4. 访问应用: https://localhost');
console.log('5. 检查监控: http://localhost:3001');

console.log('\n🔧 管理命令:');
console.log('启动: ./scripts/start-production.sh');
console.log('停止: ./scripts/stop-production.sh');
console.log('重启: docker-compose -f docker-compose.prod.yml restart');
console.log('日志: docker-compose -f docker-compose.prod.yml logs -f');
console.log('备份: ./scripts/backup.sh');

console.log('\n⚠️  注意事项:');
console.log('- 生产环境请使用正式的SSL证书');
console.log('- 确保所有环境变量已正确配置');
console.log('- 定期备份数据和配置');
console.log('- 监控系统资源使用情况');

console.log('\n🚀 系统已准备好进行生产部署！');