#!/bin/bash
# 新闻聚合系统 - Nginx Proxy Manager 部署脚本
# 作者: timink
# 版本: 1.0.0
# 基于 Nginx Proxy Manager 最佳实践

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
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

log_step() {
    echo -e "${PURPLE}[STEP]${NC} $1"
}

# 检查是否以 root 用户运行
check_root() {
    if [[ $EUID -eq 0 ]]; then
        log_warning "检测到 root 用户权限，建议使用普通用户运行"
        read -p "是否继续？(y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# 显示欢迎信息
show_welcome() {
    echo ""
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║                    新闻聚合系统 - NPM 部署脚本                     ║"
    echo "║                   News Aggregator - NPM Deploy                   ║"
    echo "║                     作者: timink                      ║"
    echo "║                          版本: 1.0.0                              ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""
}

# 检查依赖
check_dependencies() {
    log_step "检查系统依赖..."

    # 检查 Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装，请先安装 Docker"
        echo "安装命令: curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh"
        exit 1
    fi

    # 检查 Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose 未安装，请先安装 Docker Compose"
        exit 1
    fi

    # 检查 Docker 服务
    if ! docker info &> /dev/null; then
        log_error "Docker 服务未运行，请启动 Docker 服务"
        echo "启动命令: sudo systemctl start docker"
        exit 1
    fi

    log_success "依赖检查通过"
}

# 检查 NPM 环境
check_npm_environment() {
    log_step "检查 Nginx Proxy Manager 环境..."

    # 检查 proxy_network 网络
    if ! docker network ls | grep -q "proxy_network"; then
        log_warning "未找到 proxy_network 网络"
        read -p "是否创建 proxy_network 网络？(Y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
            docker network create proxy_network
            log_success "proxy_network 网络创建成功"
        else
            log_error "需要 proxy_network 网络才能继续部署"
            exit 1
        fi
    fi

    # 检查 NPM 容器
    if ! docker ps | grep -q "npm"; then
        log_warning "未找到运行中的 NPM 容器"
        read -p "是否已有 NPM 容器？容器名称: " npm_container
        if [[ -n "$npm_container" ]]; then
            # 尝试连接用户指定的 NPM 容器
            if docker ps | grep -q "$npm_container"; then
                docker network connect proxy_network "$npm_container"
                log_success "已将 $npm_container 连接到 proxy_network"
            else
                log_error "未找到指定的 NPM 容器"
                exit 1
            fi
        else
            log_error "请确保 NPM 容器正在运行并已连接到 proxy_network"
            echo "连接命令: docker network connect proxy_network <npm_container_name>"
            exit 1
        fi
    else
        # 自动连接 NPM 容器
        if ! docker network inspect proxy_network | grep -q "npm"; then
            docker network connect proxy_network npm
            log_success "已将 npm 容器连接到 proxy_network"
        else
            log_success "NPM 容器已连接到 proxy_network"
        fi
    fi
}

# 创建目录结构
create_directories() {
    log_step "创建必要目录..."

    mkdir -p data/news logs temp config/backups
    mkdir -p monitoring/grafana/dashboards monitoring/grafana/datasources

    log_success "目录创建完成"
}

# 检查环境变量
check_environment() {
    log_step "检查环境变量..."

    if [[ ! -f ".env" ]]; then
        if [[ -f ".env.production" ]]; then
            log_info "复制生产环境配置..."
            cp .env.production .env
        else
            log_error "未找到 .env 文件，请先配置环境变量"
            exit 1
        fi
    fi

    # 检查关键环境变量
    local required_vars=("SUPABASE_URL" "SUPABASE_KEY" "DEEPSEEK_API_KEY" "SMTP_HOST" "SMTP_USER" "SMTP_PASS" "REDIS_PASSWORD")

    for var in "${required_vars[@]}"; do
        if ! grep -q "^${var}=" .env; then
            log_warning "环境变量 ${var} 未设置"
        fi
    done

    log_success "环境变量检查完成"
}

# 停止现有服务
stop_services() {
    log_step "停止现有服务..."

    if docker-compose ps -q &> /dev/null; then
        docker-compose down --remove-orphans
    fi

    log_success "服务停止完成"
}

# 构建镜像
build_images() {
    log_step "构建 Docker 镜像..."

    docker-compose build --no-cache

    log_success "镜像构建完成"
}

# 启动服务
start_services() {
    log_step "启动服务..."

    # 启动基础服务
    docker-compose up -d

    # 等待服务启动
    log_info "等待服务启动..."
    sleep 20

    log_success "服务启动完成"
}

# 健康检查
health_check() {
    log_step "执行健康检查..."

    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        log_info "检查应用健康状态... (尝试 $attempt/$max_attempts)"

        if docker-compose exec -T news-aggregator curl -f http://localhost:3000/health &> /dev/null; then
            log_success "应用健康检查通过"
            break
        fi

        if [ $attempt -eq $max_attempts ]; then
            log_error "应用健康检查失败"
            docker-compose logs news-aggregator --tail=20
            exit 1
        fi

        sleep 5
        attempt=$((attempt + 1))
    done

    # 检查 Redis
    if docker-compose exec -T redis redis-cli ping &> /dev/null; then
        log_success "Redis 服务健康检查通过"
    else
        log_warning "Redis 服务可能存在问题"
    fi
}

# 显示部署信息
show_deployment_info() {
    log_success "🎉 部署完成！"
    echo ""
    echo -e "${CYAN}=== 访问信息 ===${NC}"
    echo "📱 应用地址: http://news.your-domain.com"
    echo "🔍 健康检查: http://news.your-domain.com/health"
    echo ""
    echo -e "${CYAN}=== 下一步操作 ===${NC}"
    echo "1. 配置 Nginx Proxy Manager 代理:"
    echo "   - 访问: http://YOUR_SERVER_IP:81"
    echo "   - 域名: news.your-domain.com"
    echo "   - 容器名: news-aggregator-app"
    echo "   - 端口: 3000"
    echo ""
    echo "2. 启用监控服务 (可选):"
    echo "   docker-compose --profile monitoring up -d"
    echo ""
    echo -e "${CYAN}=== 管理命令 ===${NC}"
    echo "📋 查看日志: docker-compose logs -f"
    echo "🔄 重启服务: docker-compose restart"
    echo "⏹️ 停止服务: docker-compose down"
    echo "📊 查看状态: docker-compose ps"
    echo ""
    echo -e "${CYAN}=== 重要提醒 ===${NC}"
    echo "🔐 请及时在 NPM 中配置 SSL 证书"
    echo "📧 请验证邮件服务配置"
    echo "🗄️ 请确认数据库连接正常"
    echo ""
}

# 主函数
main() {
    show_welcome
    check_root
    check_dependencies
    check_npm_environment
    create_directories
    check_environment
    stop_services
    build_images
    start_services
    health_check
    show_deployment_info
}

# 脚本入口
if [ "$1" = "help" ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "新闻聚合系统 - NPM 部署脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  help, -h, --help    显示帮助信息"
    echo "  check               检查环境依赖"
    echo "  status              查看服务状态"
    echo "  logs                查看服务日志"
    echo "  stop                停止服务"
    echo "  restart             重启服务"
    echo "  npm-info            显示 NPM 配置信息"
    echo ""
    exit 0
fi

# 处理命令
case "$1" in
    "check")
        check_dependencies
        check_npm_environment
        ;;
    "status")
        docker-compose ps
        ;;
    "logs")
        docker-compose logs -f "${2:-news-aggregator}"
        ;;
    "stop")
        docker-compose down
        log_success "服务已停止"
        ;;
    "restart")
        docker-compose restart
        log_success "服务已重启"
        ;;
    "npm-info")
        echo -e "${CYAN}=== Nginx Proxy Manager 配置信息 ===${NC}"
        echo ""
        echo "容器名称: news-aggregator-app"
        echo "容器端口: 3000"
        echo "建议域名: news.your-domain.com"
        echo ""
        echo "NPM 配置步骤:"
        echo "1. 访问 http://YOUR_SERVER_IP:81"
        echo "2. 添加 Proxy Host"
        echo "3. 填写以下信息:"
        echo "   - Domain: news.your-domain.com"
        echo "   - Scheme: http"
        echo "   - Forward Hostname: news-aggregator-app"
        echo "   - Forward Port: 3000"
        echo "4. 启用 SSL 证书"
        echo ""
        ;;
    *)
        main
        ;;
esac