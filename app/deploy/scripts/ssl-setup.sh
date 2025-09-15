#!/bin/bash
# 新闻聚合系统 - SSL证书设置脚本
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

# 检查域名
check_domain() {
    if [ -z "$1" ]; then
        log_error "请提供域名参数"
        echo "用法: $0 <域名> [邮箱]"
        exit 1
    fi

    DOMAIN="$1"
    EMAIL="${2:-admin@$DOMAIN}"

    log_info "设置SSL证书 - 域名: $DOMAIN"
}

# 检查依赖
check_dependencies() {
    log_info "检查依赖..."

    # 检查certbot
    if ! command -v certbot &> /dev/null; then
        log_warning "certbot未安装，正在安装..."

        # 检测系统类型
        if command -v apt-get &> /dev/null; then
            sudo apt-get update
            sudo apt-get install -y certbot
        elif command -v yum &> /dev/null; then
            sudo yum install -y certbot
        else
            log_error "不支持的系统，请手动安装certbot"
            exit 1
        fi
    fi

    log_success "依赖检查完成"
}

# 创建自签名证书（开发环境）
create_self_signed_cert() {
    log_info "创建自签名SSL证书..."

    mkdir -p ssl

    # 生成私钥
    openssl genrsa -out ssl/key.pem 2048

    # 生成证书
    openssl req -new -x509 -key ssl/key.pem -out ssl/cert.pem -days 365 -subj "/C=CN/ST=Beijing/L=Beijing/O=NewsAggregator/CN=$DOMAIN"

    # 设置权限
    chmod 600 ssl/key.pem
    chmod 644 ssl/cert.pem

    log_success "自签名证书创建完成"
    log_warning "注意：自签名证书仅用于开发环境"
}

# 申请Let's Encrypt证书（生产环境）
request_letsencrypt_cert() {
    log_info "申请Let's EncryptSSL证书..."

    # 停止nginx（如果正在运行）
    if docker ps | grep -q "nginx"; then
        log_info "停止nginx服务..."
        docker-compose -f docker-compose.prod.yml stop nginx
    fi

    # 申请证书
    sudo certbot certonly --standalone -d "$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive

    # 复制证书
    sudo cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ssl/cert.pem
    sudo cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" ssl/key.pem

    # 设置权限
    sudo chown -R $USER:$USER ssl/
    chmod 600 ssl/key.pem
    chmod 644 ssl/cert.pem

    log_success "Let's Encrypt证书申请完成"
}

# 设置自动续期
setup_auto_renewal() {
    log_info "设置证书自动续期..."

    # 创建续期脚本
    cat > ssl-renew.sh << EOF
#!/bin/bash
# SSL证书自动续期脚本

echo "Renewing SSL certificate..."

# 续期证书
sudo certbot renew --quiet

# 复制新证书
sudo cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ssl/cert.pem
sudo cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" ssl/key.pem
sudo chown -R $USER:$USER ssl/

# 重启nginx
cd /path/to/news-aggregator-system
docker-compose -f docker-compose.prod.yml restart nginx

echo "SSL certificate renewed successfully"
EOF

    chmod +x ssl-renew.sh

    # 添加到crontab
    (crontab -l 2>/dev/null; echo "0 3 * * 1 $(pwd)/ssl-renew.sh") | crontab -

    log_success "自动续期设置完成"
}

# 验证证书
verify_certificate() {
    log_info "验证SSL证书..."

    if [ -f "ssl/cert.pem" ] && [ -f "ssl/key.pem" ]; then
        # 检查证书有效期
        openssl x509 -in ssl/cert.pem -text -noout | grep "Not After"

        # 检查私钥
        openssl rsa -in ssl/key.pem -check -noout

        log_success "SSL证书验证通过"
    else
        log_error "SSL证书文件不存在"
        exit 1
    fi
}

# 显示证书信息
show_certificate_info() {
    log_info "SSL证书信息："
    echo ""
    echo "证书文件: ssl/cert.pem"
    echo "私钥文件: ssl/key.pem"
    echo "域名: $DOMAIN"
    echo ""

    if [ -f "ssl/cert.pem" ]; then
        echo "证书详情:"
        openssl x509 -in ssl/cert.pem -text -noout | grep -E "(Subject:|Issuer:|Not Before|Not After)"
    fi
}

# 主函数
main() {
    check_domain "$1" "$2"
    check_dependencies

    # 选择证书类型
    echo "选择证书类型:"
    echo "1. Let's Encrypt证书 (推荐生产环境)"
    echo "2. 自签名证书 (仅开发环境)"
    echo "3. 我已有证书文件"
    echo ""
    read -p "请选择 (1-3): " choice

    case $choice in
        1)
            request_letsencrypt_cert
            setup_auto_renewal
            ;;
        2)
            create_self_signed_cert
            ;;
        3)
            log_info "请将您的证书文件复制到 ssl/ 目录："
            echo "  - 证书文件: ssl/cert.pem"
            echo "  - 私钥文件: ssl/key.pem"
            read -p "完成后按回车继续..."
            ;;
        *)
            log_error "无效选择"
            exit 1
            ;;
    esac

    verify_certificate
    show_certificate_info

    log_success "SSL证书设置完成！"
    echo ""
    echo "下一步："
    echo "1. 运行 ./scripts/deploy-prod.sh 启动服务"
    echo "2. 访问 https://$DOMAIN 验证HTTPS"
    echo ""
}

# 脚本入口
if [ "$1" = "help" ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "新闻聚合系统 - SSL证书设置脚本"
    echo ""
    echo "用法: $0 <域名> [邮箱]"
    echo ""
    echo "示例:"
    echo "  $0 example.com"
    echo "  $0 example.com admin@example.com"
    echo ""
    exit 0
fi

main "$@"