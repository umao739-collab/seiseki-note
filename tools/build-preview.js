#!/usr/bin/env node
/**
 * build-preview.js — 画面の見本（preview/index.html）を作る。GAS を使わずに、ブラウザだけで画面を確かめる用。
 *
 *   node tools/build-preview.js
 *
 * google.script.run のかわりに tools/preview-server.js（作りものの名簿・点数）を入れる。
 * 入力の検査は本物の Config.gs・Rules.gs を使う。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const personas = [
  { email: 'demo.setup@example.com', label: '設定担当の先生（教務主任・3年1組と2組）' },
  { email: 'demo.t31@example.com', label: '3年1組の担任' },
  { email: 'demo.admin@example.com', label: 'アプリ管理者' }
];
const server = '<script>\n' + read('Config.gs') + '\n' + read('Rules.gs') + '\n' + fs.readFileSync(path.join(__dirname, 'preview-server.js'), 'utf8') + '\n</script>';
let html = read('index.html')
  .replace("<?!= include_('Styles'); ?>", () => read('Styles.html'))
  .replace("<?!= include_('Logic'); ?>", () => server + '\n' + read('Logic.html'))
  .replace("<?!= include_('Grid'); ?>", () => read('Grid.html'))
  .replace("<?!= include_('App'); ?>", () => read('App.html'))
  .replace('<?!= isDemoJson ?>', 'true')
  .replace('<?!= personasJson ?>', JSON.stringify(personas))
  .replace('<base target="_top">', '<meta name="viewport" content="width=device-width, initial-scale=1"><title>せいせきノート（画面の見本）</title>');
if (/<\?/.test(html)) throw new Error('テンプレートの記号が残っています');
fs.mkdirSync(path.join(ROOT, 'preview'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'preview', 'index.html'), html);
console.log('✅ preview/index.html');
