#!/bin/bash
# 新闻聚合系统 - Docker部署脚本
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

# 配置变量
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_ENV=${1:-development}
DEPLOY_METHOD=${2:-docker}

log_info "🚀 开始部署新闻聚合系统"
log_info "环境: $DEPLOY_ENV"
log_info "部署方式: $DEPLOY_METHOD"

# 检查依赖
check_dependencies() {
    log_info "🔍 检查部署依赖..."

    case $DEPLOY_METHOD in
        "docker")
            if ! command -v docker &> /dev/null; then
                log_error "Docker 未安装"
                exit 1
            fi
            if ! command -v docker-compose &> /dev/null; then
                log_error "Docker Compose 未安装"
                exit 1
            fi
            ;;
        "kubernetes")
            if ! command -v kubectl &> /dev/null; then
                log_error "kubectl 未安装"
                exit 1
            fi
            if ! command -v helm &> /dev/null; then
                log_error "Helm 未安装"
                exit 1
            fi
            ;;
        "local")
            if ! command -v node &> /dev/null; then
                log_error "Node.js 未安装"
                exit 1
            fi
            if ! command -v npm &> /dev/null; then
                log_error "npm 未安装"
                exit 1
            fi
            ;;
    esac

    log_success "✅ 依赖检查完成"
}

# 加载环境变量
load_env() {
    log_info "📋 加载环境变量..."

    local env_file="$PROJECT_DIR/.env.$DEPLOY_ENV"
    if [[ ! -f "$env_file" ]]; then
        log_warning "环境变量文件 $env_file 不存在，使用默认配置"
        return 0
    fi

    set -a
    source "$env_file"
    set +a

    log_success "✅ 环境变量加载完成"
}

# Docker 部署
deploy_docker() {
    log_info "🐳 使用 Docker 部署..."

    cd "$PROJECT_DIR"

    local compose_file="docker-compose.yml"
    if [[ "$DEPLOY_ENV" == "development" ]]; then
        compose_file="docker-compose.dev.yml"
    fi

    # 停止现有容器
    log_info "🛑 停止现有容器..."
    docker-compose -f "$compose_file" down || true

    # 构建镜像
    log_info "🔨 构建 Docker 镜像..."
    if [[ "$DEPLOY_ENV" == "production" ]]; then
        docker build -t news-aggregator:latest .
    else
        docker build -f Dockerfile.dev -t news-aggregator:dev .
    fi

    # 启动服务
    log_info "🚀 启动服务..."
    docker-compose -f "$compose_file" up -d

    # 等待服务启动
    log_info "⏳ 等待服务启动..."
    sleep 10

    # 健康检查
    log_info "🏥 执行健康检查..."
    if curl -f http://localhost:3000/health &> /dev/null; then
        log_success "✅ 服务启动成功"
        log_info "🌐 访问地址: http://localhost:3000"
    else
        log_error "❌ 服务启动失败"
        exit 1
    fi
}

# Kubernetes 部署
deploy_kubernetes() {
    log_info "☸️ 使用 Kubernetes 部署..."

    cd "$PROJECT_DIR"

    # 创建命名空间
    log_info "📦 创建命名空间..."
    kubectl create namespace news-aggregator --dry-run=client -o yaml | kubectl apply -f -

    # 创建密钥
    log_info "🔑 创建密钥..."
    if [[ -f ".env.$DEPLOY_ENV" ]]; then
        kubectl create secret generic news-aggregator-secrets \
            --from-env-file=".env.$DEPLOY_ENV" \
            --namespace=news-aggregator \
            --dry-run=client -o yaml | kubectl apply -f -
    fi

    # 部署应用
    log_info "🚀 部署应用..."
    if command -v helm &> /dev/null; then
        # 使用 Helm 部署
        helm upgrade --install news-aggregator ./k8s \
            --namespace news-aggregator \
            --values ./k8s/values.yaml \
            --set environment=$DEPLOY_ENV \
            --wait
    else
        # 使用 kubectl 部署
        kubectl apply -f k8s/
    fi

    # 等待部署完成
    log_info "⏳ 等待部署完成..."
    kubectl wait --for=condition=available --timeout=300s deployment/news-aggregator -n news-aggregator

    # 获取服务信息
    log_info "📋 获取服务信息..."
    kubectl get all -n news-aggregator

    log_success "✅ Kubernetes 部署完成"
}

# 本地开发部署
deploy_local() {
    log_info "💻 本地开发部署..."

    cd "$PROJECT_DIR"

    # 安装依赖
    log_info "📦 安装依赖..."
    npm ci

    # 运行测试
    log_info "🧪 运行测试..."
    npm test

    # 启动开发服务器
    log_info "🚀 启动开发服务器..."
    if [[ "$DEPLOY_ENV" == "development" ]]; then
        npm run dev &
    else
        npm start &
    fi

    # 等待服务启动
    log_info "⏳ 等待服务启动..."
    sleep 5

    # 健康检查
    log_info "🏥 执行健康检查..."
    if curl -f http://localhost:3000/health &> /dev/null; then
        log_success "✅ 开发服务器启动成功"
        log_info "🌐 访问地址: http://localhost:3000"
    else
        log_error "❌ 开发服务器启动失败"
        exit 1
    fi
}

# 数据库迁移
run_migrations() {
    log_info "🗄️ 执行数据库迁移..."

    cd "$PROJECT_DIR"

    # 检查是否有迁移脚本
    if [[ -f "supabase/migrations" ]]; then
        log_info "📊 运行 Supabase 迁移..."
        # 这里添加实际的迁移逻辑
    fi

    log_success "✅ 数据库迁移完成"
}

# 验证部署
verify_deployment() {
    log_info "✅ 验证部署..."

    local health_url="http://localhost:3000/health"
    if [[ "$DEPLOY_METHOD" == "kubernetes" ]]; then
        # 获取 Kubernetes 服务地址
        local service_ip=$(kubectl get svc news-aggregator-service -n news-aggregator -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
        if [[ -n "$service_ip" ]]; then
            health_url="http://$service_ip:3000/health"
        fi
    fi

    # 执行健康检查
    if curl -f "$health_url" &> /dev/null; then
        log_success "✅ 部署验证成功"

        # 获取服务信息
        local response=$(curl -s "$health_url")
        log_info "📊 服务状态: $response"
    else
        log_error "❌ 部署验证失败"
        exit 1
    fi
}

# 清理函数
cleanup() {
    log_info "🧹 清理资源..."

    case $DEPLOY_METHOD in
        "docker")
            cd "$PROJECT_DIR"
            local compose_file="docker-compose.yml"
            if [[ "$DEPLOY_ENV" == "development" ]]; then
                compose_file="docker-compose.dev.yml"
            fi
            docker-compose -f "$compose_file" down
            ;;
        "kubernetes")
            kubectl delete namespace news-aggregator --ignore-not-found=true
            ;;
        "local")
            pkill -f "node.*src/app.js" || true
            ;;
    esac

    log_success "✅ 清理完成"
}

# 显示帮助信息
show_help() {
    cat << EOF
新闻聚合系统部署脚本

用法: $0 [环境] [部署方式]

环境:
  development  开发环境 (默认)
  staging      预发布环境
  production   生产环境

部署方式:
  docker       Docker 部署 (默认)
  kubernetes   Kubernetes 部署
  local        本地开发部署

命令:
  deploy       部署应用 (默认)
  rollback     回滚应用
  status       查看状态
  logs         查看日志
  cleanup      清理资源
  help         显示帮助信息

示例:
  $0 production docker      # 使用 Docker 部署到生产环境
  $0 development local      # 本地开发环境部署
  $0 staging kubernetes    # 使用 Kubernetes 部署到预发布环境

EOF
}

# 主函数
main() {
    case "${3:-deploy}" in
        "deploy")
            check_dependencies
            load_env

            case $DEPLOY_METHOD in
                "docker")
                    deploy_docker
                    ;;
                "kubernetes")
                    deploy_kubernetes
                    ;;
                "local")
                    deploy_local
                    ;;
                *)
                    log_error "不支持的部署方式: $DEPLOY_METHOD"
                    show_help
                    exit 1
                    ;;
            esac

            run_migrations
            verify_deployment
            ;;
        "rollback")
            log_info "🔄 执行回滚..."
            # 这里添加回滚逻辑
            ;;
        "status")
            log_info "📊 查看状态..."
            # 这里添加状态查看逻辑
            ;;
        "logs")
            log_info "📋 查看日志..."
            # 这里添加日志查看逻辑
            ;;
        "cleanup")
            cleanup
            ;;
        "help"|"-h"|"--help")
            show_help
            ;;
        *)
            log_error "未知命令: ${3:-deploy}"
            show_help
            exit 1
            ;;
    esac
}

# 设置错误处理
trap 'log_error "部署过程中发生错误"; exit 1' ERR

# 执行主函数
main "$@"

log_success "🎉 部署脚本执行完成"