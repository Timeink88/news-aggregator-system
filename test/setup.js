// Jest测试环境设置
import { jest } from '@jest/globals';

// 模拟环境变量
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.EMAIL_USER = 'test@email.com';
process.env.EMAIL_PASSWORD = 'test-password';

// 全局测试超时
jest.setTimeout(30000);

// 模拟浏览器环境
global.fetch = jest.fn();

// 清理每个测试后的状态
beforeEach(() => {
  jest.clearAllMocks();
});