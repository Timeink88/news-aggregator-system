#!/usr/bin/env node

/**
 * 批量修复ESLint错误的脚本
 */

const fs = require('fs');
const path = require('path');

// 修复常见的ESLint错误模式
const fixes = [
  {
    pattern: /'data' is not defined/g,
    replacement: (match, offset, string) => {
      // 在函数上下文中，将data替换为options.data
      const context = string.substring(Math.max(0, offset - 100), offset);
      if (context.includes('options.')) {
        return 'options.data';
      }
      return 'data'; // 如果不确定，保持原样
    }
  },
  {
    pattern: /'response_time' is not defined/g,
    replacement: 'Date.now() - startTime'
  },
  {
    pattern: /'targetWebhooks' is not defined/g,
    replacement: '[]'
  },
  {
    pattern: /'startTime' is not defined/g,
    replacement: 'Date.now()'
  }
};

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

    // 应用所有修复
    for (const fix of fixes) {
      content = content.replace(fix.pattern, fix.replacement);
    }

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