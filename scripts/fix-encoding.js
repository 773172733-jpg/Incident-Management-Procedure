/**
 * 事件树 - 编码修复脚本
 * 将源码文件统一为 UTF-8 without BOM
 */
const fs = require('fs');
const path = require('path');
const EXT = new Set(['.wxss','.wxml','.js','.json','.md']);
const EX = new Set(['node_modules','miniprogram_npm','.git']);
function ok(fp) {
  if (!EXT.has(path.extname(fp).toLowerCase())) return false;
  return !fp.split(path.sep).some(p => EX.has(p));
}
const fixed = [];
function scan(dir) {
  let e; try { e = fs.readdirSync(dir, {withFileTypes:true}); } catch(e) { return; }
  for (const x of e) {
    const fp = path.join(dir, x.name);
    if (x.isDirectory()) { if (!EX.has(x.name)) scan(fp); }
    else if (x.isFile() && ok(fp)) fix(fp);
  }
}
function fix(fp) {
  let buf; try { buf = fs.readFileSync(fp); } catch(e) { return; }
  if (buf.length === 0) return;
  let changed = false;
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
    const t = buf.toString('utf16le');
    buf = Buffer.from(t, 'utf8');
    changed = true;
    console.log('  [UTF-16 LE] ' + fp);
  } else if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
    const t = buf.toString('utf16be');
    buf = Buffer.from(t, 'utf8');
    changed = true;
    console.log('  [UTF-16 BE] ' + fp);
  }
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    buf = buf.slice(3);
    changed = true;
    console.log('  [UTF-8 BOM] ' + fp);
  }
  if (changed) { fs.writeFileSync(fp, buf); fixed.push(fp); }
}
console.log('=== 编码修复 ===');
scan(process.cwd());
if (fixed.length === 0) { console.log('All files clean'); }
else { console.log('Fixed ' + fixed.length + ' files'); }
