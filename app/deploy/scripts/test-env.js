#!/usr/bin/env node

/**
 * 简单的环境变量测试脚本
 */

import { config } from 'dotenv';

// 加载环境变量
const result = config({ path: '.env' });

console.log('🔍 环境变量测试结果:');
console.log('='.repeat(40));

if (result.error) {
  console.log('❌ 环境变量加载失败:', result.error);
  process.exit(1);
}

console.log('✅ 环境变量加载成功');
console.log('='.repeat(40));

// 检查关键环境变量
const requiredVars = [
  'NODE_ENV',
  'SUPABASE_URL',
  'SUPABASE_KEY',
  'PORT'
];

const optionalVars = [
  'AI_API_KEY',
  'RESEND_API_KEY',
  'DEBUG'
];

console.log('📋 必需环境变量:');
let allRequiredPresent = true;
for (const varName of requiredVars) {
  const value = process.env[varName];
  const status = value ? '✅' : '❌';
  console.log(`  ${status} ${varName}: ${value || '未设置'}`);
  if (!value) allRequiredPresent = false;
}

console.log('\n📋 可选环境变量:');
for (const varName of optionalVars) {
  const value = process.env[varName];
  const status = value ? '✅' : '⚪';
  console.log(`  ${status} ${varName}: ${value || '未设置'}`);
}

console.log('\n📊 总结:');
console.log(`必需变量: ${requiredVars.filter(v => process.env[v]).length}/${requiredVars.length}`);
console.log(`可选变量: ${optionalVars.filter(v => process.env[v]).length}/${optionalVars.length}`);

if (allRequiredPresent) {
  console.log('\n🎉 所有必要的环境变量都已设置!');
} else {
  console.log('\n⚠️  缺少必需的环境变量，请检查 .env 文件');
  process.exit(1);
}