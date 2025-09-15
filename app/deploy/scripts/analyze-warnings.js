import fs from 'fs';
import path from 'path';

// 分析具体的警告行
const schemaPath = path.join(process.cwd(), 'supabase', 'migrations', '001_initial_schema.sql');
const sqlContent = fs.readFileSync(schemaPath, 'utf8');
const lines = sqlContent.split('\n');

// 检查具体的行
const warningLines = [876, 882, 967];

console.log('🔍 分析警告行的详细内容:\n');

for (const lineNum of warningLines) {
  if (lineNum <= lines.length) {
    const line = lines[lineNum - 1];
    console.log(`第${lineNum}行:`);
    console.log(`内容: "${line}"`);
    console.log('上下文:');

    // 显示前后3行
    for (let i = Math.max(0, lineNum - 4); i < Math.min(lines.length, lineNum + 3); i++) {
      const marker = i === lineNum - 1 ? '>>>' : '   ';
      console.log(`${marker} ${i + 1}: ${lines[i]}`);
    }
    console.log('\n' + '='.repeat(80) + '\n');
  }
}

// 分析是否在SQL插入语句的字符串中
console.log('🔍 分析关键字出现位置:\n');

const keywords = ['Index', 'on', 'check'];
for (const keyword of keywords) {
  console.log(`关键字 "${keyword}":`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.toLowerCase().includes(keyword.toLowerCase())) {
      // 检查是否在SQL字符串中
      const inString = isInSQLString(line, keyword);
      console.log(`  第${i + 1}行: "${line.substring(0, 100)}..." ${inString ? '(字符串内容)' : '(SQL语法)'}`);
    }
  }
  console.log('');
}

function isInSQLString(line, keyword) {
  // 简单检查是否在SQL插入语句的字符串中
  const insertPattern = /INSERT.*VALUES.*'/i;
  const stringPattern = new RegExp(`'[^']*\\b${keyword}\\b[^']*'`, 'i');

  return insertPattern.test(line) && stringPattern.test(line);
}