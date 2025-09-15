# 新闻聚合系统 Dockerfile
# 多阶段构建，优化镜像大小和安全性

# 第一阶段：构建阶段
FROM node:18-alpine AS builder

# 安装构建依赖
RUN apk add --no-cache \
    python3 \
    make \
    g++

# 设置工作目录
WORKDIR /app

# 复制package文件
COPY package*.json ./

# 安装所有依赖（包括开发依赖）
RUN npm ci

# 复制源代码
COPY . .

# 运行代码检查（如果需要）
# RUN npm run lint

# === 生产阶段 ===
FROM node:18-alpine AS production

# 创建app用户（安全考虑）
RUN addgroup -g 1001 -S nodejs && \
    adduser -S newsuser -u 1001

# 安装系统依赖
RUN apk add --no-cache \
    dumb-init \
    tzdata \
    curl \
    && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone \
    && apk del tzdata

# 设置工作目录
WORKDIR /app

# 从构建阶段复制node_modules
COPY --from=builder --chown=newsuser:nodejs /app/node_modules ./node_modules

# 复制package文件
COPY --from=builder --chown=newsuser:nodejs /app/package*.json ./

# 复制应用代码
COPY --from=builder --chown=newsuser:nodejs /app/src ./src
COPY --from=builder --chown=newsuser:nodejs /app/config ./config

# 创建必要的目录
RUN mkdir -p data/news logs temp && \
    chown -R newsuser:nodejs /app

# 创建健康检查脚本
RUN echo '#!/bin/sh' > healthcheck.sh && \
    echo 'curl -f http://localhost:3000/health || exit 1' >> healthcheck.sh && \
    chmod +x healthcheck.sh

# 切换到非root用户
USER newsuser

# 暴露端口
EXPOSE 3000

# 设置环境变量
ENV NODE_ENV=production
ENV TZ=Asia/Shanghai
ENV PORT=3000
ENV HOST=0.0.0.0

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD ./healthcheck.sh

# 启动应用
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]