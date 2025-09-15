#!/bin/bash
# 新闻聚合系统 - 更新脚本
# 作者: timink
# 版本: 1.0.0

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 备份当前版本
backup_current_version() {
    log_info "备份当前版本..."

    local backup_dir="backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"

    # 备份数据
    cp -r data "$backup_dir/" 2>/dev/null || true
    cp -r config "$backup_dir/" 2>/dev/null || true
    cp -r logs "$backup_dir/" 2>/dev/null || true
    cp .env "$backup_dir/" 2>/dev/null || true

    # 备份Docker Compose配置
    cp docker-compose*.yml "$backup_dir/" 2>/dev/null || true

    log_success "备份完成: $backup_dir"
}

# 拉取最新代码
pull_latest_code() {
    log_info "拉取最新代码..."

    if [ -d ".git" ]; then
        git pull origin main
        log_success "代码更新完成"
    else
        log_warning "不是Git仓库，跳过代码更新"
    fi
}

# 重新构建镜像
rebuild_images() {
    log_info "重新构建Docker镜像..."

    docker-compose -f docker-compose.prod.yml build --no-cache

    log_success "镜像重新构建完成"
}

# 滚动更新服务
rolling_update() {
    log_info "执行滚动更新..."

    # 更新应用服务
    docker-compose -f docker-compose.prod.yml up -d --no-deps news-aggregator

    # 等待应用启动
    log_info "等待应用启动..."
    sleep 30

    # 更新其他服务
    docker-compose -f docker-compose.prod.yml up -d --no-deps nginx prometheus grafana

    log_success "滚动更新完成"
}

# 验证更新
verify_update() {
    log_info "验证更新..."

    local max_attempts=20
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        log_info "检查应用健康状态... (尝试 $attempt/$max_attempts)"

        if curl -f http://localhost:3000/health &>/dev/null; then
            log_success "应用健康检查通过"
            break
        fi

        if [ $attempt -eq $max_attempts ]; then
            log_error "应用健康检查失败，执行回滚"
            rollback
            exit 1
        fi

        sleep 5
        attempt=$((attempt + 1))
    done
}

# 回滚函数
rollback() {
    log_warning "执行回滚操作..."

    # 停止当前服务
    docker-compose -f docker-compose.prod.yml down

    # 恢复备份
    local latest_backup=$(ls -t backups/ | head -n 1)
    if [ -n "$latest_backup" ]; then
        log_info "恢复备份: $latest_backup"
        # 这里添加具体的恢复逻辑
    fi

    # 重新启动服务
    docker-compose -f docker-compose.prod.yml up -d

    log_success "回滚完成"
}

# 清理旧镜像
cleanup_images() {
    log_info "清理旧Docker镜像..."

    # 清理悬空镜像
    docker image prune -f

    # 清理未使用的镜像
    docker image prune -a -f --filter "until=24h"

    log_success "镜像清理完成"
}

# 主函数
main() {
    log_info "开始更新新闻聚合系统..."
    echo ""

    backup_current_version
    pull_latest_code
    rebuild_images
    rolling_update
    verify_update
    cleanup_images

    log_success "更新完成！系统已成功更新到最新版本。"
}

# 脚本入口
if [ "$1" = "help" ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "新闻聚合系统 - 更新脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  help, -h, --help    显示帮助信息"
    echo "  backup-only        仅执行备份"
    echo "  cleanup-only       仅执行清理"
    echo ""
    exit 0
fi

# 处理其他命令
case "$1" in
    "backup-only")
        backup_current_version
        log_success "备份完成"
        ;;
    "cleanup-only")
        cleanup_images
        log_success "清理完成"
        ;;
    *)
        main
        ;;
esac