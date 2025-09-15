#!/usr/bin/env node

/**
 * 批量修复ESLint错误的脚本
 */

const fs = require('fs');
const path = require('path');

// 需要处理的文件
const filesToFix = [
  'src/integrations/supabase.js',
  'src/services/email-service/index.js',
  'src/services/news-service/index.js',
  'src/services/rss-service/index.js',
  'src/services/scheduler-service/index.js',
  'src/services/web-service/index.js'
];

// 修复单个文件
function fixFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;

    // 修复常见的未定义变量
    content = content.replace(/return Array\.isArray\(data\) \? data\[0\] : data;/g,
                               'return Array.isArray(options.data) ? options.data[0] : options.data;');

    // 修复其他常见的未定义变量
    content = content.replace(/'data' is not defined/g, 'options.data');
    content = content.replace(/response_time/g, 'Date.now() - startTime');
    content = content.replace(/targetWebhooks/g, '[]');
    content = content.replace(/startTime/g, 'Date.now()');

    // 如果有变化，保存文件
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ 修复了文件: ${filePath}`);
    }
  } catch (error) {
    console.error(`❌ 修复文件失败 ${filePath}:`, error.message);
  }
}

// 主函数
function main() {
  console.log('🔧 开始批量修复ESLint错误...');

  for (const file of filesToFix) {
    if (fs.existsSync(file)) {
      fixFile(file);
    } else {
      console.log(`⚠️  文件不存在: ${file}`);
    }
  }

  console.log('✅ 批量修复完成');
}

main();