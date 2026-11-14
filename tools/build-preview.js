#!/usr/bin/env node
/**
 * build-preview.js — 画面の見本（preview/index.html）を作る。GAS を使わずに、ブラウザだけで画面を確かめる用。
 *
 *   node seiseki-note/tools/build-preview.js
 *
 * google.script.run のかわりに、Demo.gs の見本のクラス（架空の名前・点数）を返すにせものを入れる。
 * 本物の成績は入らない。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'src');
const OUT = path.join(__dirname, '..', 'preview');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

const serverCode = ['Config.gs', 'Rules.gs', 'Demo.gs'].map(read).join('\n');
const mock = `
<script>
${serverCode}
(function () {
  var saved = {};
  var settings = validateSettings_({});
  var hasFile = /[?&]file=1/.test(location.search);
  var api = {
    bootstrap: function () { return { appTitle: APP_TITLE, version: APP_VERSION, settings: settings, file: hasFile ? { name: 'SMILE スプレッドシート2026_見本_3-1' } : null, fileProblem: '' }; },
    findMyFiles: function () { return [
      { id: 'demo-file-1', name: 'SMILE スプレッドシート2026_見本_3-1', updated: '2026/11/12' },
      { id: 'demo-file-2', name: 'コピー ～ SMILE スプレッドシート2026v2_アップデート', updated: '2026/11/14' }]; },
    chooseFile: function (id) { if (id === 'demo-file-2') throw new Error('SMILEスプレッドシートではないようです。別のファイルをえらんでください。'); return { name: 'x' }; },
    chooseFileByUrl: function () { throw new Error('スプレッドシートのURLではないようです。'); },
    forgetFile: function () { return { ok: true }; },
    loadMyClass: function () { var m = demoModel_(); m.source = 'file'; m.fileName = 'SMILE スプレッドシート2026_見本_3-1'; m.shoken = JSON.parse(JSON.stringify(saved)); return m; },
    loadDemoClass: function () { return demoModel_(); },
    saveShoken: function (items) { items.forEach(function (it) { saved[it.no + '|' + it.term] = { text: it.text, at: '2026-11-14 16:00' }; }); return { savedAt: '2026-11-14 16:00', count: items.length }; },
    saveSettings: function (s) { settings = validateSettings_(s); return settings; }
  };
  function runner(ok, ng) {
    var r = {};
    r.withSuccessHandler = function (f) { return runner(f, ng); };
    r.withFailureHandler = function (f) { return runner(ok, f); };
    Object.keys(api).forEach(function (k) {
      r[k] = function () {
        var args = arguments;
        setTimeout(function () {
          try { var v = JSON.parse(JSON.stringify(api[k].apply(null, args))); ok && ok(v); }
          catch (e) { ng && ng(e); }
        }, 120);
      };
    });
    return r;
  }
  window.google = { script: { run: runner(null, null) } };
})();
</script>`;

let html = read('index.html')
  .replace("<?!= include_('Styles'); ?>", read('Styles.html'))
  .replace("<?!= include_('Logic'); ?>", mock + '\n' + read('Logic.html'))
  .replace("<?!= include_('App'); ?>", read('App.html'))
  .replace('<base target="_top">', '<meta name="viewport" content="width=device-width, initial-scale=1"><title>せいせきノート（画面の見本）</title>');
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), html);
console.log('✅ ' + path.join(OUT, 'index.html'));
