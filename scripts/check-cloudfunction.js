#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const apiRoot = path.join(root, 'cloudfunctions', 'api');
const errors = [];
const checks = [];

function pass(message) {
  checks.push(message);
}

function fail(message) {
  errors.push(message);
}

function readJson(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    fail(`${path.relative(root, file)} 含 UTF-8 BOM`);
  }
  return JSON.parse(buffer.toString('utf8'));
}

function walk(dir, extension) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(target, extension);
    return target.endsWith(extension) ? [target] : [];
  });
}

function resolveRelativeRequire(fromFile, request) {
  const base = path.resolve(path.dirname(fromFile), request);
  const candidates = [base, `${base}.js`, `${base}.json`, path.join(base, 'index.js')];
  return candidates.find(candidate => fs.existsSync(candidate));
}

const requiredPaths = [
  'index.js',
  'package.json',
  'router.js',
  'common',
  'modules'
];
for (const item of requiredPaths) {
  const target = path.join(apiRoot, item);
  fs.existsSync(target) ? pass(`存在 cloudfunctions/api/${item}`) : fail(`缺少 cloudfunctions/api/${item}`);
}

let packageJson;
try {
  packageJson = readJson(path.join(apiRoot, 'package.json'));
  pass('cloudfunctions/api/package.json JSON 合法且无 BOM');
  if (packageJson.main !== 'index.js') fail('cloudfunctions/api/package.json main 必须为 index.js');
  if (!packageJson.dependencies || !packageJson.dependencies['wx-server-sdk']) fail('缺少 wx-server-sdk 依赖');
  for (const hook of ['preinstall', 'install', 'postinstall']) {
    if (packageJson.scripts && packageJson.scripts[hook]) fail(`package.json 不允许 ${hook} 脚本`);
  }
  for (const [name, version] of Object.entries(packageJson.dependencies || {})) {
    if (/^(file:|link:)/.test(version)) fail(`依赖 ${name} 使用了本地路径`);
  }
} catch (error) {
  fail(`cloudfunctions/api/package.json 无法解析：${error.message}`);
}

let projectConfig;
try {
  projectConfig = readJson(path.join(root, 'project.config.json'));
  if (projectConfig.miniprogramRoot !== 'miniprogram/') fail('project.config.json miniprogramRoot 必须为 miniprogram/');
  if (projectConfig.cloudfunctionRoot !== 'cloudfunctions/') fail('project.config.json cloudfunctionRoot 必须为 cloudfunctions/');
  pass('project.config.json 小程序与云函数根目录正确');
} catch (error) {
  fail(`project.config.json 无法解析：${error.message}`);
}

const jsFiles = fs.existsSync(apiRoot) ? walk(apiRoot, '.js') : [];
const graph = new Map();
for (const file of jsFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (syntax.status === 0) {
    pass(`JS 可解析：${path.relative(root, file)}`);
  } else {
    fail(`JS 语法失败：${path.relative(root, file)}：${(syntax.stderr || syntax.stdout).trim()}`);
  }

  const dependencies = [];
  for (const match of source.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const request = match[1];
    if (!request.startsWith('.')) continue;
    const resolved = resolveRelativeRequire(file, request);
    if (!resolved) fail(`相对 require 不存在：${path.relative(root, file)} -> ${request}`);
    else if (resolved.endsWith('.js')) dependencies.push(path.resolve(resolved));
  }
  graph.set(path.resolve(file), dependencies);
}

const visiting = new Set();
const visited = new Set();
function detectCycle(file, stack = []) {
  if (visiting.has(file)) {
    fail(`检测到循环依赖：${[...stack, file].map(item => path.relative(apiRoot, item)).join(' -> ')}`);
    return;
  }
  if (visited.has(file)) return;
  visiting.add(file);
  for (const dependency of graph.get(file) || []) detectCycle(dependency, [...stack, file]);
  visiting.delete(file);
  visited.add(file);
}
for (const file of graph.keys()) detectCycle(file);

const indexSource = fs.readFileSync(path.join(apiRoot, 'index.js'), 'utf8');
if (!/exports\.main\s*=\s*async/.test(indexSource)) fail('cloudfunctions/api/index.js 未导出 async exports.main');
else pass('云函数入口导出 exports.main');

const serviceSource = fs.readFileSync(path.join(root, 'miniprogram', 'services', 'api.js'), 'utf8');
const configSource = fs.readFileSync(path.join(root, 'miniprogram', 'constants', 'config.js'), 'utf8');
if (!/API:\s*['"]api['"]/.test(configSource) || !/name:\s*CLOUD_FUNCTIONS\.API/.test(serviceSource)) {
  fail('前端未统一调用云函数 api');
} else {
  pass('前端统一调用云函数 api');
}

const directCalls = walk(path.join(root, 'miniprogram'), '.js').filter(file => {
  if (file.endsWith(path.join('services', 'api.js'))) return false;
  return /wx\.cloud\.callFunction\s*\(/.test(fs.readFileSync(file, 'utf8'));
});
if (directCalls.length) fail(`发现页面或模块直接调用云函数：${directCalls.map(file => path.relative(root, file)).join(', ')}`);
else pass('没有散落的 wx.cloud.callFunction 调用');

console.log(checks.map(item => `PASS ${item}`).join('\n'));
if (errors.length) {
  console.error(errors.map(item => `FAIL ${item}`).join('\n'));
  process.exit(1);
}
console.log(`\nCloudBase api 部署前自检通过（${checks.length} 项）`);
