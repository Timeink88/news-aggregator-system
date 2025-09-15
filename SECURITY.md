# 安全提醒 (Security Notice)

## 🔐 重要安全提醒

**在部署到生产环境之前，请务必注意以下安全事项：**

### 1. 立即轮换密钥和凭证

由于项目历史中可能包含真实的API密钥，强烈建议您立即轮换以下凭证：

- **Supabase 项目**：生成新的 API 密钥
- **DeepSeek API**：生成新的 API 密钥
- **邮箱账户**：更改邮箱密码
- **Redis 密码**：设置新的 Redis 密码
- **JWT 密钥**：生成新的 JWT 密钥

### 2. 环境变量管理

- 使用 `cp .env.template .env` 创建环境变量文件
- 填入您的真实配置信息
- 确保 `.env` 文件已添加到 `.gitignore` 中
- 在生产环境中使用环境变量或密钥管理服务

### 3. GitHub Secrets

对于 CI/CD 流程，请使用 GitHub Secrets：

```bash
# GitHub Secrets 示例
SUPABASE_URL=your_real_supabase_url
SUPABASE_KEY=your_real_supabase_key
DEEPSEEK_API_KEY=your_real_deepseek_key
NEWSAPI_KEY=your_real_newsapi_key
SMTP_USER=your_smtp_user@domain.com
SMTP_PASS=your_email_password
REDIS_PASSWORD=your_redis_password
JWT_SECRET=your_jwt_secret
```

### 4. 生产环境安全最佳实践

- **网络访问限制**：限制数据库和服务的网络访问
- **定期备份**：设置定期数据备份策略
- **监控日志**：实施日志监控和异常检测
- **SSL/TLS**：确保所有通信都使用 HTTPS
- **定期更新**：定期更新依赖包和安全补丁

### 5. 隐私保护

- 不要在代码中硬编码敏感信息
- 使用环境变量或密钥管理服务
- 定期审查代码中的潜在信息泄露
- 测试完成后清理测试数据和日志

### 6. 密钥生成建议

```bash
# 生成安全的 JWT 密钥
openssl rand -base64 64

# 生成 Redis 密码
openssl rand -base64 32

# 生成 API 密钥
openssl rand -hex 32
```

## 🚨 风险提醒

如果您曾经在公共仓库或任何地方提交过包含真实密钥的代码，请立即：

1. **撤销并重新生成所有受影响的 API 密钥**
2. **检查是否有未授权的使用**
3. **更新所有相关的配置文件**
4. **通知相关的服务提供商**

## 📞 安全问题报告

如果您发现任何安全问题，请立即通过以下方式联系：

- **作者**: timink
- **GitHub Issues**: [提交安全问题报告](https://github.com/your-repo/security)

---

**⚠️ 请在部署前务必完成以上安全检查！**