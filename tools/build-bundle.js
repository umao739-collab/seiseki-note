#!/usr/bin/env node
/**
 * build-bundle.js — src/ のファイルを、インストーラー（installer/Installer.gs）が読む1つの JSON にまとめる。
 *
 *   node tools/build-bundle.js
 *
 * できた dist/せいせきノート_コード.json を Google ドライブに置くと、インストーラーが読んで Apps Script に入れる。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'src');
const OUT = path.join(__dirname, '..', 'dist');
const version = /APP_VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(SRC, 'Config.gs'), 'utf8'))[1];
const files = fs.readdirSync(SRC).sort().map((f) => {
  const ext = path.extname(f);
  const type = f === 'appsscript.json' ? 'JSON' : ext === '.gs' ? 'SERVER_JS' : ext === '.html' ? 'HTML' : null;
  if (!type) throw new Error('知らない種類のファイル: ' + f);
  return { name: path.basename(f, ext), type, source: fs.readFileSync(path.join(SRC, f), 'utf8') };
});
if (!/var BUILD_TARGET = 'prod';/.test(files.find((f) => f.name === 'Config').source)) throw new Error('BUILD_TARGET が prod ではありません');
const bundle = { mark: 'seiseki-note-bundle', version, builtAt: new Date().toISOString(), files };
fs.mkdirSync(OUT, { recursive: true });
const out = path.join(OUT, 'せいせきノート_コード.json');
fs.writeFileSync(out, JSON.stringify(bundle));
console.log('✅ ' + out + '（ver.' + version + '・' + files.length + 'ファイル: ' + files.map((f) => f.name).join(', ') + '）');
