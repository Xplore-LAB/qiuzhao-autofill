#!/usr/bin/env node
// Read an exported log file locally. No network, model calls or source changes.
const fs = require('node:fs');
const {analyze} = require('../shared/feedback-loop.js');
const file = process.argv[2];
if (!file || process.argv.length !== 3) {
  console.error('用法：node scripts/triage-run-logs.cjs <运行日志.json>');
  process.exitCode = 1;
} else {
  try {
    if (fs.statSync(file).size > 20 * 1024 * 1024) throw Error('日志文件超过 20MB');
    const input = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!input || !Array.isArray(input.logs)) throw Error('需要插件导出的运行日志（包含 logs 数组）');
    process.stdout.write(JSON.stringify(analyze(input), null, 2) + '\n');
  } catch (error) {
    console.error(error instanceof SyntaxError ? '日志不是有效 JSON' : '无法分析日志：' + error.message);
    process.exitCode = 1;
  }
}
