#!/usr/bin/env node
/**
 * build-bundle.js — src/ の11ファイルを、インストーラー（installer/）が読む1つの JSON にまとめる。
 *
 *   node seiseki-note/tools/build-bundle.js
 *
 * できた dist/せいせきノート_コード.json を Google ドライブに置くと、インストーラーがそれを読んで
 * Apps Script のプロジェクトに入れる。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'src');
const OUT = path.join(__dirname, '..', 'dist');
const version = /APP_VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(SRC, 'Config.gs'), 'utf8'))[1];
const list = [
  ['appsscript', 'JSON', 'appsscript.json'],
  ['Config', 'SERVER_JS', 'Config.gs'], ['Auth', 'SERVER_JS', 'Auth.gs'], ['Rules', 'SERVER_JS', 'Rules.gs'],
  ['SmileReader', 'SERVER_JS', 'SmileReader.gs'], ['Code', 'SERVER_JS', 'Code.gs'], ['Demo', 'SERVER_JS', 'Demo.gs'],
  ['index', 'HTML', 'index.html'], ['Styles', 'HTML', 'Styles.html'], ['Logic', 'HTML', 'Logic.html'], ['App', 'HTML', 'App.html']
];
const bundle = {
  mark: 'seiseki-note-bundle',
  version: version,
  builtAt: new Date().toISOString(),
  files: list.map(([name, type, f]) => ({ name, type, source: fs.readFileSync(path.join(SRC, f), 'utf8') }))
};
fs.mkdirSync(OUT, { recursive: true });
const out = path.join(OUT, 'せいせきノート_コード.json');
fs.writeFileSync(out, JSON.stringify(bundle));
console.log('✅ ' + out + '（ver.' + version + '・' + bundle.files.length + 'ファイル）');
