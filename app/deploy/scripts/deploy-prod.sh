#!/bin/bash
# 新闻聚合系统 - 生产环境Docker部署脚本
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

# 检查必要命令
check_requirements() {
    log_info "检查部署环境..."

    # 检查Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker未安装或不在PATH中"
        exit 1
    fi

    # 检查Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose未安装或不在PATH中"
        exit 1
    fi

    # 检查Docker是否运行
    if ! docker info &> /dev/null; then
        log_error "Docker服务未运行"
        exit 1
    fi

    log_success "环境检查通过"
}

# 创建必要目录
create_directories() {
    log_info "创建必要目录..."

    mkdir -p data/news logs temp
    mkdir -p monitoring/grafana/dashboards monitoring/grafana/datasources
    mkdir -p ssl

    log_success "目录创建完成"
}

# 检查环境变量文件
check_env_file() {
    log_info "检查环境变量文件..."

    if [ ! -f .env ]; then
        log_warning "未找到.env文件，使用默认配置"
        cp .env.example .env 2>/dev/null || {
            log_error "请创建.env文件并配置必要的环境变量"
            exit 1
        }
    fi

    # 检查关键环境变量
    local required_vars=("SUPABASE_URL" "SUPABASE_KEY" "DEEPSEEK_API_KEY" "SMTP_HOST" "SMTP_USER" "SMTP_PASS")

    for var in "${required_vars[@]}"; do
        if ! grep -q "^${var}=" .env; then
            log_warning "环境变量 ${var} 未设置"
        fi
    done

    log_success "环境变量检查完成"
}

# 构建镜像
build_images() {
    log_info "构建Docker镜像..."

    # 构建主应用镜像
    docker-compose -f docker-compose.prod.yml build --no-cache

    log_success "镜像构建完成"
}

# 停止现有服务
stop_services() {
    log_info "停止现有服务..."

    docker-compose -f docker-compose.prod.yml down --remove-orphans 2>/dev/null || true

    log_success "服务停止完成"
}

# 启动服务
start_services() {
    log_info "启动服务..."

    # 启动基础服务
    docker-compose -f docker-compose.prod.yml up -d redis

    # 等待Redis启动
    log_info "等待Redis启动..."
    sleep 10

    # 启动主应用
    docker-compose -f docker-compose.prod.yml up -d news-aggregator

    # 等待应用启动
    log_info "等待应用启动..."
    sleep 30

    # 启动其他服务
    docker-compose -f docker-compose.prod.yml up -d nginx prometheus grafana

    log_success "服务启动完成"
}

# 健康检查
health_check() {
    log_info "执行健康检查..."

    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        log_info "检查应用健康状态... (尝试 $attempt/$max_attempts)"

        # 检查应用健康状态
        if curl -f http://localhost:3000/health &>/dev/null; then
            log_success "应用健康检查通过"
            break
        fi

        if [ $attempt -eq $max_attempts ]; then
            log_error "应用健康检查失败"
            docker-compose -f docker-compose.prod.yml logs news-aggregator
            exit 1
        fi

        sleep 5
        attempt=$((attempt + 1))
    done

    # 检查其他服务
    log_info "检查其他服务状态..."

    if docker-compose -f docker-compose.prod.yml ps | grep -q "Up.*redis"; then
        log_success "Redis服务运行正常"
    else
        log_warning "Redis服务可能未正常启动"
    fi

    if docker-compose -f docker-compose.prod.yml ps | grep -q "Up.*nginx"; then
        log_success "Nginx服务运行正常"
    else
        log_warning "Nginx服务可能未正常启动"
    fi

    if docker-compose -f docker-compose.prod.yml ps | grep -q "Up.*prometheus"; then
        log_success "Prometheus服务运行正常"
    else
        log_warning "Prometheus服务可能未正常启动"
    fi
}

# 显示访问信息
show_access_info() {
    log_success "部署完成！"
    echo ""
    echo "=== 访问信息 ==="
    echo "🌐 应用地址: http://localhost"
    echo "📊 Grafana监控: http://localhost:3001 (admin/GRAFANA_PASSWORD)"
    echo "📈 Prometheus: http://localhost:9090"
    echo "🔍 健康检查: http://localhost/health"
    echo ""
    echo "=== 管理命令 ==="
    echo "📋 查看日志: docker-compose -f docker-compose.prod.yml logs -f"
    echo "🔄 重启服务: docker-compose -f docker-compose.prod.yml restart"
    echo "⏹️ 停止服务: docker-compose -f docker-compose.prod.yml down"
    echo "📊 查看状态: docker-compose -f docker-compose.prod.yml ps"
    echo ""
    echo "=== 重要提醒 ==="
    echo "🔐 请确保已正确配置SSL证书到 ssl/ 目录"
    echo "📧 请检查邮件服务配置"
    echo "🗄️ 请确保Supabase数据库连接正常"
    echo ""
}

# 主函数
main() {
    log_info "开始部署新闻聚合系统..."
    echo ""

    check_requirements
    create_directories
    check_env_file
    stop_services
    build_images
    start_services
    health_check
    show_access_info

    log_success "部署完成！系统已启动并运行。"
}

# 脚本入口
if [ "$1" = "help" ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "新闻聚合系统 - Docker部署脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  help, -h, --help    显示帮助信息"
    echo "  stop               停止服务"
    echo "  restart            重启服务"
    echo "  logs               查看日志"
    echo "  status             查看状态"
    echo ""
    exit 0
fi

# 处理其他命令
case "$1" in
    "stop")
        log_info "停止服务..."
        docker-compose -f docker-compose.prod.yml down
        log_success "服务已停止"
        ;;
    "restart")
        log_info "重启服务..."
        docker-compose -f docker-compose.prod.yml restart
        log_success "服务已重启"
        ;;
    "logs")
        docker-compose -f docker-compose.prod.yml logs -f
        ;;
    "status")
        docker-compose -f docker-compose.prod.yml ps
        ;;
    *)
        main
        ;;
esac