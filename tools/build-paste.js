#!/usr/bin/env node
/**
 * build-paste.js — 手で貼る人向けに、src/ の11ファイルを3ファイルにまとめる（dist/paste/）。
 *
 *   node seiseki-note/tools/build-paste.js
 *
 *  appsscript.json … そのまま
 *  コード.gs       … .gs の6ファイルをつなげたもの
 *  index.html      … index.html に Styles・Logic・App を入れこんだもの
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'src');
const OUT = path.join(__dirname, '..', 'dist', 'paste');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const version = /APP_VERSION = '([^']+)'/.exec(read('Config.gs'))[1];
const gs = ['Config.gs', 'Auth.gs', 'Rules.gs', 'SmileReader.gs', 'Code.gs', 'Demo.gs']
  .map((f) => '// ===================== ' + f + ' =====================\n' + read(f)).join('\n');
const html = read('index.html')
  .replace("<?!= include_('Styles'); ?>", () => read('Styles.html'))
  .replace("<?!= include_('Logic'); ?>", () => read('Logic.html'))
  .replace("<?!= include_('App'); ?>", () => read('App.html'));
if (/<\?/.test(html)) throw new Error('index.html にテンプレートの記号が残っています');
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'appsscript.json'), read('appsscript.json'));
fs.writeFileSync(path.join(OUT, 'コード.gs'), '// せいせきノート ver.' + version + '（このファイルは tools/build-paste.js で作ったもの）\n' + gs);
fs.writeFileSync(path.join(OUT, 'index.html'), html);
console.log('✅ ' + OUT + '（ver.' + version + '）');
