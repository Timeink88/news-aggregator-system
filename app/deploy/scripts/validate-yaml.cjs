#!/usr/bin/env node

/**
 * YAML配置文件验证器
 */

const fs = require('fs');
const path = require('path');

// 需要验证的YAML文件列表
const yamlFiles = [
    'k8s/values.yaml',
    'k8s/Chart.yaml',
    'docker-compose.dev.yml',
    'docker-compose.yml'
];

/**
 * 简单的YAML语法验证
 */
function validateYamlSyntax(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        const indentStack = [];
        let inMultilineString = false;
        let multilineStringIndent = 0;

        console.log(`🔍 验证文件: ${filePath}`);

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNumber = i + 1;
            const trimmed = line.trim();

            // 跳过空行和注释
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            // 处理多行字符串
            if (trimmed.includes('|') || trimmed.includes('>')) {
                inMultilineString = true;
                multilineStringIndent = line.length - line.trimStart().length;
                continue;
            }

            if (inMultilineString) {
                const currentIndent = line.length - line.trimStart().length;
                if (currentIndent <= multilineStringIndent) {
                    inMultilineString = false;
                } else {
                    continue; // 跳过多行字符串的内容
                }
            }

            const indent = line.length - line.trimStart().length;

            // 验证列表项
            if (trimmed.startsWith('- ')) {
                if (indentStack.length > 0 && indent > indentStack[indentStack.length - 1]) {
                    const expectedIndent = indentStack[indentStack.length - 1] + 2;
                    if (indent !== expectedIndent) {
                        console.warn(`⚠️  第${lineNumber}行: 列表项缩进不一致，期望 ${expectedIndent}，实际 ${indent}`);
                    }
                }
            }
            // 验证键值对
            else if (trimmed.includes(':') && !trimmed.startsWith('"')) {
                const keyPart = trimmed.split(':')[0];
                if (keyPart.trim()) {
                    // 更新缩进栈
                    while (indentStack.length > 0 && indent <= indentStack[indentStack.length - 1]) {
                        indentStack.pop();
                    }
                    indentStack.push(indent);
                }
            }

            // 检查缩进是否为2的倍数
            if (indent > 0 && indent % 2 !== 0) {
                console.warn(`⚠️  第${lineNumber}行: 缩进应该是2的倍数，当前为 ${indent}`);
            }

            // 检查Tab字符（YAML不允许使用Tab）
            if (line.includes('\t')) {
                console.error(`❌ 第${lineNumber}行: 不能使用Tab字符，请使用空格`);
                return false;
            }
        }

        console.log(`✅ ${filePath} 语法验证通过`);
        return true;

    } catch (error) {
        console.error(`❌ 验证 ${filePath} 时出错:`, error.message);
        return false;
    }
}

/**
 * 验证文件是否存在
 */
function validateFileExists(filePath) {
    if (!fs.existsSync(filePath)) {
        console.error(`❌ 文件不存在: ${filePath}`);
        return false;
    }
    return true;
}

/**
 * 主验证函数
 */
function main() {
    console.log('🚀 开始验证YAML配置文件...\n');

    let allValid = true;
    const results = [];

    for (const filePath of yamlFiles) {
        console.log(`\n📋 检查文件: ${filePath}`);

        // 检查文件是否存在
        if (!validateFileExists(filePath)) {
            allValid = false;
            results.push({ file: filePath, status: 'missing' });
            continue;
        }

        // 验证语法
        const isValid = validateYamlSyntax(filePath);
        results.push({ file: filePath, status: isValid ? 'valid' : 'invalid' });

        if (!isValid) {
            allValid = false;
        }
    }

    // 输出总结
    console.log('\n📊 验证结果总结:');
    console.log('=' .repeat(50));

    results.forEach(result => {
        const status = result.status === 'valid' ? '✅' :
                      result.status === 'invalid' ? '❌' : '📁';
        console.log(`${status} ${result.file} (${result.status})`);
    });

    console.log('\n' + '='.repeat(50));

    if (allValid) {
        console.log('🎉 所有YAML文件验证通过！');
        process.exit(0);
    } else {
        console.log('❌ 部分YAML文件存在问题，请修复后重试');
        process.exit(1);
    }
}

// 运行验证
if (require.main === module) {
    main();
}

module.exports = { validateYamlSyntax, validateFileExists };