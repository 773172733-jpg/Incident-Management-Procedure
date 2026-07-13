/**
 * 事件树 - 编码检查脚本
 * 检测UTF-8 BOM、UTF-16、空字节、替换字符等编码问题
 */
const fs = require('fs');
const path = require('path');

const EXTENSIONS = new Set(['.wxss', '.wxml', '.js', '.json', '.md']);
const EXCLUDE_DIRS = new Set(['node_modules', 'miniprogram_npm', '.git']);

function shouldScan(fp) {
  if (!EXTENSIONS.has(path.extname(fp).toLowerCase())) return false;
  return !fp.split(path.sep).some(p => EXCLUDE_DIRS.has(p));
}

function detectEncoding(buf) {
  if (buf.length < 2) return { encoding: 'utf8', hasBom: false };
  if (buf[0] === 0xFF && buf[1] === 0xFE) return { encoding: 'utf16le', hasBom: true };
  if (buf[0] === 0xFE && buf[1] === 0xFF) return { encoding: 'utf16be', hasBom: true };
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return { encoding: 'utf8', hasBom: true };
  return { encoding: 'utf8', hasBom: false };
}

const results = [];
let totalScanned = 0;

function scanDir(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of entries) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) { if (!EXCLUDE_DIRS.has(e.name)) scanDir(fp); }
    else if (e.isFile() && shouldScan(fp)) checkFile(fp);
  }
}

function checkFile(fp) {
  totalScanned++;
  let buf;
  try { buf = fs.readFileSync(fp); } catch (e) { return; }

  const issues = [];
  const ext = path.extname(fp).toLowerCase();
  const enc = detectEncoding(buf);

  if (enc.encoding === 'utf16le') issues.push('UTF-16 LE BOM');
  else if (enc.encoding === 'utf16be') issues.push('UTF-16 BE BOM');
  if (enc.hasBom) issues.push('UTF-8 BOM');

  if (buf.includes(0)) issues.push('包含空字节');

  let str;
  try {
    if (enc.encoding === 'utf16le') str = Buffer.from(buf.toString('utf16le')).toString('utf8');
    else if (enc.encoding === 'utf16be') str = Buffer.from(buf.toString('utf16be')).toString('utf8');
    else str = buf.slice(enc.hasBom ? 3 : 0).toString('utf8');
  } catch (e) { issues.push('解码失败'); results.push({ file: fp, issues }); return; }

  if (str.includes(String.fromCharCode(0xFFFD))) issues.push('包含替换字符 U+FFFD');

  if (ext === '.json') {
    try { JSON.parse(str); } catch (e) { issues.push('JSON解析失败'); }
  }

  if (ext === '.wxss' || ext === '.wxml' || ext === '.js' || ext === '.json' || ext === '.md') {
    const first = str.charCodeAt(0);
    if (first === 0xFEFF) issues.push('首字符为U+FEFF(BOM未移除)');
    else if (first === 0xFFFD) issues.push('首字符为U+FFFD替换字符');
    else if (first < 0x20 && first !== 0x09 && first !== 0x0A && first !== 0x0D) issues.push('首字符为不可见控制字符U+' + first.toString(16));
    if (ext === '.wxml' && str[0] !== '<') issues.push('WXML首字符不是<');
  }

  const lines = str.split('\n');
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    if (lines[i].length > 0 && lines[i].charCodeAt(0) === 0xFEFF) {
      issues.push('第' + (i + 1) + '行存在残余U+FEFF');
      break;
    }
  }

  if (issues.length > 0) results.push({ file: fp, issues });
}

const root = process.cwd();
console.log('=== 编码检查 ===');
scanDir(root);
console.log('共扫描: ' + totalScanned + ' 个文件');
console.log('异常文件: ' + results.length);
for (const r of results) {
  console.log('\\n' + r.file);
  for (const issue of r.issues) console.log('  -> ' + issue);
}
process.exit(results.length > 0 ? 1 : 0);
