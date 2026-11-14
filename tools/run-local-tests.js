#!/usr/bin/env node
/**
 * run-local-tests.js — Node で試せる部分（読み取り・検査・分析・所見）と、安全のきまりを確かめる。
 *
 *   node seiseki-note/tools/run-local-tests.js
 *
 * 確かめること:
 *  1. 公開関数（末尾 _ の無いグローバル関数）が Config.gs の PUBLIC_FUNCTIONS / ENTRY_FUNCTIONS と一致する
 *  2. 画面のコードに innerHTML / outerHTML / insertAdjacentHTML / document.write / eval / new Function が無い
 *  3. 成績を外に出す口（UrlFetchApp・CacheService・ScriptProperties への成績の書き込み・console.log）が無い
 *  4. 検査（Rules.gs）・SMILE の読み取り（SmileReader.gs）・分析と所見（Logic.html）が正しく動く
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const gsFiles = fs.readdirSync(SRC).filter((f) => f.endsWith('.gs'));
const htmlFiles = fs.readdirSync(SRC).filter((f) => f.endsWith('.html'));

let pass = 0, fail = 0;
function run(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  NG  ' + name + '\n      ' + (e && e.message)); }
}
function ok(cond, msg) { if (!cond) throw new Error(msg || 'failed'); }
function throws(fn, re) {
  try { fn(); } catch (e) { if (re && !re.test(e.message)) throw new Error('違う例外: ' + e.message); return; }
  throw new Error('例外になりませんでした');
}

// ---------- GAS の .gs を1つの文脈に読み込む ----------
const ctx = vm.createContext({ console, Math, JSON, Date, String, Number, Object, Array, RegExp, isFinite, Error });
gsFiles.forEach((f) => vm.runInContext(read(f), ctx, { filename: f }));
function scriptOf(html) {
  const m = /<script>([\s\S]*?)<\/script>/.exec(html);
  return m ? m[1] : '';
}
vm.runInContext(scriptOf(read('Logic.html')), ctx, { filename: 'Logic.html' });
const SL = ctx.SL;

console.log('\n■ 安全のきまり');
run('S01 公開関数は PUBLIC_FUNCTIONS と ENTRY_FUNCTIONS だけ', () => {
  const globals = [];
  gsFiles.forEach((f) => {
    const re = /^function\s+([A-Za-z0-9_$]+)\s*\(/gm;
    let m;
    while ((m = re.exec(read(f)))) globals.push(m[1]);
  });
  const pub = globals.filter((n) => !n.endsWith('_')).sort();
  const want = ctx.PUBLIC_FUNCTIONS.concat(ctx.ENTRY_FUNCTIONS).slice().sort();
  ok(JSON.stringify(pub) === JSON.stringify(want), '公開: ' + pub.join(',') + ' / 一覧: ' + want.join(','));
});
run('S02 公開関数はすべて guard_ と getMe_ を通る', () => {
  const code = read('Code.gs');
  ctx.PUBLIC_FUNCTIONS.forEach((n) => {
    const m = new RegExp('function ' + n + '\\([^)]*\\) \\{\\n  return guard_\\(function \\(\\) \\{\\n    getMe_\\(\\);').exec(code);
    ok(m, n + ' が guard_ → getMe_ の順で始まっていません');
  });
});
run('S03 画面のコードに HTML を文字列で差しこむ書き方が無い', () => {
  htmlFiles.forEach((f) => {
    const s = read(f);
    ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function', 'srcdoc'].forEach((w) => {
      ok(s.indexOf(w) === -1, f + ' に ' + w + ' があります');
    });
  });
});
run('S04 成績を外に出す口が無い（UrlFetchApp・CacheService・ScriptProperties・console.log）', () => {
  gsFiles.forEach((f) => {
    const s = read(f);
    ['UrlFetchApp', 'CacheService', 'getScriptProperties', 'console.log', 'MailApp', 'GmailApp'].forEach((w) => {
      ok(s.indexOf(w) === -1, f + ' に ' + w + ' があります');
    });
  });
});
run('S05 Webアプリは「アクセスしたユーザーとして実行」・学校のドメインの中だけ', () => {
  const j = JSON.parse(read('appsscript.json'));
  ok(j.webapp.executeAs === 'USER_ACCESSING' && j.webapp.access === 'DOMAIN', JSON.stringify(j.webapp));
  ok(j.oauthScopes.indexOf('https://www.googleapis.com/auth/drive') === -1, 'ドライブ全体の書きこみ権限は使わない');
});
run('S06 外から読みこむのは Google Fonts だけ', () => {
  htmlFiles.forEach((f) => {
    const s = read(f);
    const urls = s.match(/https?:\/\/[^\s"')]+/g) || [];
    urls.filter((u) => u !== 'http://www.w3.org/2000/svg').forEach((u) => ok(/^https:\/\/fonts\.(googleapis|gstatic)\.com(\/|$)/.test(u) || /^https:\/\/docs\.google\.com\/spreadsheets\/d\/…/.test(u), f + ': ' + u));
  });
});

console.log('\n■ 検査（Rules.gs）');
run('R01 escapeFormula_', () => {
  ok(ctx.escapeFormula_('=1') === "'=1" && ctx.escapeFormula_('+a') === "'+a" && ctx.escapeFormula_('a=1') === 'a=1' && ctx.escapeFormula_("'a") === "''a");
});
run('R02 toScore_: 半角・全角の数だけ読む', () => {
  ok(ctx.toScore_('85') === 85 && ctx.toScore_('８５') === 85 && ctx.toScore_(' 7.5 ') === 7.5);
  ok(ctx.toScore_('') === null && ctx.toScore_('欠') === null && ctx.toScore_('#REF!') === null && ctx.toScore_('-3') === null);
});
run('R03 isAllowedEmail_: ドメインの完全一致だけ', () => {
  ok(ctx.isAllowedEmail_('a@e-net.nara.jp', ['e-net.nara.jp']));
  ok(!ctx.isAllowedEmail_('a@evil-e-net.nara.jp', ['e-net.nara.jp']));
  ok(!ctx.isAllowedEmail_('a@e-net.nara.jp.evil.com', ['e-net.nara.jp']));
  ok(!ctx.isAllowedEmail_('e-net.nara.jp', ['e-net.nara.jp']));
  ok(!ctx.isAllowedEmail_('a@e-net.nara.jp', []));
});
run('R04 fileIdFromUrl_: スプレッドシートのURLだけ', () => {
  const id = '1xX5jbFeRYMtLw5Bv-pO4Rq5Tw1VzV54TtP0aGovFhoc';
  ok(ctx.fileIdFromUrl_('https://docs.google.com/spreadsheets/d/' + id + '/edit?gid=0#gid=0') === id);
  ok(ctx.fileIdFromUrl_('https://docs.google.com/spreadsheets/u/0/d/' + id) === id);
  ok(ctx.fileIdFromUrl_('https://evil.com/spreadsheets/d/' + id) === '');
  ok(ctx.fileIdFromUrl_('https://docs.google.com.evil.com/spreadsheets/d/' + id) === '');
  ok(ctx.fileIdFromUrl_('javascript:alert(1)') === '');
});
run('R05 validateSettings_', () => {
  const s = ctx.validateSettings_({ strongRate: 90, weakRate: 60, shokenLength: 'long', showClassAvg: false, other: 'x' });
  ok(s.strongRate === 90 && s.weakRate === 60 && s.shokenLength === 'long' && s.showClassAvg === false && s.other === undefined);
  throws(() => ctx.validateSettings_({ strongRate: 70, weakRate: 80 }), /小さく/);
  throws(() => ctx.validateSettings_({ strongRate: 101 }), /範囲/);
  throws(() => ctx.validateSettings_({ shokenLength: 'huge' }), /長さ/);
  throws(() => ctx.validateSettings_({ showClassAvg: 'yes' }), /形/);
  throws(() => ctx.validateSettings_(null), /形/);
  ok(ctx.parseSettings_('こわれた').strongRate === 85);
});
run('R06 validateShokenItems_', () => {
  const v = ctx.validateShokenItems_([{ no: 1, term: '2学期', text: 'よく\r\nできた' }], [1, 2]);
  ok(v[0].no === 1 && v[0].text === 'よく\nできた');
  throws(() => ctx.validateShokenItems_([{ no: 3, term: '2学期', text: '' }], [1, 2]), /名簿/);
  throws(() => ctx.validateShokenItems_([{ no: 1, term: '4学期', text: '' }], [1]), /時期/);
  throws(() => ctx.validateShokenItems_([{ no: 1, term: '2学期', text: 'あ'.repeat(801) }], [1]), /800/);
  throws(() => ctx.validateShokenItems_([{ no: 1, term: '2学期', text: '' }, { no: 1, term: '2学期', text: '' }], [1]), /2回/);
  throws(() => ctx.validateShokenItems_([], [1]), /形/);
});

console.log('\n■ SMILE の読み取り（SmileReader.gs）');
// 本物のSMILEの見出しの並びをまねた小さなシート（名前と点数は架空）
function fakeSubjectSheet() {
  const W = 30;
  const blank = () => Array(W).fill('');
  const rows = [];
  for (let i = 0; i < 70; i++) rows.push(blank());
  const set = (r, c, v) => { rows[r][c] = v; };
  // 1学期: 見出し 4〜9行目（0始まりで3〜8）、児童 10行目〜
  set(3, 1, '【1学期】'); set(3, 7, 'A='); set(3, 8, '95'); set(3, 9, '%以上');
  set(4, 7, 'B='); set(4, 8, '60'); set(4, 9, '%以上');
  set(5, 1, '単元名／観点'); set(5, 3, 'つぼみ'); set(5, 10, 'おおきな　かぶ'); set(5, 17, '（あき）');
  ['思考・判断・表現', '知識・技能', '漢字', '言葉', '単元合計', '単元到達率', '単元評価'].forEach((h, i) => { set(6, 3 + i, h); set(6, 10 + i, h); set(6, 17 + i, h); });
  set(7, 1, '配点'); set(7, 3, '100'); set(7, 4, '100'); set(7, 6, '100'); set(7, 7, '300');
  set(7, 10, '100'); set(7, 11, '100'); set(7, 12, '50'); set(7, 13, '50');
  set(8, 1, '学級平均');
  set(5, 25, '単元名／観点'); set(6, 26, '思考・判断・表現'); set(7, 26, '100');
  // 児童1: 全部、児童2: 1つめだけ、児童3: 何もなし
  set(9, 3, '90'); set(9, 4, '８０'); set(9, 6, '70'); set(9, 9, 'A');
  set(9, 10, '100'); set(9, 11, '90'); set(9, 12, '50'); set(9, 13, '40'); set(9, 16, 'A');
  set(10, 3, '40'); set(10, 4, '50'); set(10, 6, '欠'); set(10, 9, 'C');
  // 2学期: 57行あと
  set(60, 1, '【2学期】'); set(60, 7, 'A='); set(60, 8, '80');
  set(61, 7, 'B='); set(61, 8, '50');
  set(62, 1, '単元名／観点'); set(62, 3, 'やくそく');
  ['思考・判断・表現', '知識・技能', '単元合計', '単元到達率', '単元評価'].forEach((h, i) => set(63, 3 + i, h));
  set(64, 3, '100'); set(64, 4, '100');
  set(65, 1, '学級平均');
  set(66, 3, '50'); set(66, 4, '60');
  return rows;
}
run('P01 parseSubject_: 単元・観点・配点・点数・評価を見出しから読む', () => {
  const s = ctx.parseSubject_('国語', fakeSubjectSheet(), 3);
  ok(s.units.length === 3, '単元の数 ' + s.units.length);
  const u = s.units[0];
  ok(u.term === '1学期' && u.name === 'つぼみ', u.term + u.name);
  ok(JSON.stringify(u.kanten.map((k) => k.label)) === JSON.stringify(['思考・判断・表現', '知識・技能', '言葉']), '配点の無い観点（漢字）は入れない');
  ok(JSON.stringify(u.scores[0]) === '[90,80,70]' && JSON.stringify(u.scores[1]) === '[40,50,null]' && JSON.stringify(u.scores[2]) === '[null,null,null]');
  ok(u.evals[0] === 'A' && u.evals[1] === 'C' && u.evals[2] === '');
  ok(s.units[1].kanten.length === 4 && s.units[1].scores[0][3] === 40);
  ok(s.units[2].term === '2学期' && s.units[2].name === 'やくそく' && s.units[2].scores[0][1] === 60);
  ok(s.thresholds['1学期'].a === 95 && s.thresholds['1学期'].b === 60 && s.thresholds['2学期'].a === 80);
  ok(!s.units.some((x) => x.name === '（あき）'), '配点の無い単元は入れない');
});
run('P02 parseMenu_: クラスの情報と名簿（空の行・#REF! は入れない）', () => {
  const rows = [];
  for (let i = 0; i < 60; i++) rows.push(Array(11).fill(''));
  rows[0][1] = 'SMILE スプレッドシート版'; rows[0][3] = '奈良県奈良市'; rows[0][4] = '3学期制'; rows[0][5] = '3年'; rows[0][7] = '２';
  rows[1][7] = '見本';
  rows[13][1] = '№'; rows[13][2] = '名前'; rows[13][3] = '校務連携CD';
  rows[14][1] = '1'; rows[14][2] = 'みほん いち'; rows[14][3] = '9999';
  rows[16][1] = '3'; rows[16][2] = 'みほん さん';
  rows[17][1] = '4'; rows[17][2] = '#REF!';
  const m = ctx.parseMenu_(rows);
  ok(m.meta.grade === '3年' && m.meta.className === '2' && m.meta.termSystem === '3学期制');
  ok(m.students.length === 2 && m.students[1].idx === 2 && m.students[1].no === 3);
  ok(JSON.stringify(m.students[0]).indexOf('9999') === -1, '校務連携CDは返さない');
});

console.log('\n■ 分析と所見（Logic.html）');
const settings = ctx.validateSettings_({});
const model = ctx.demoModel_();
SL.analyze(model);
run('L01 見本のクラスが読める', () => {
  ok(model.students.length === 28 && model.subjects.length === 4);
});
run('L02 入れわすれチェック: わざと空けた4か所を見つける', () => {
  const m = SL.missingCheck(model);
  const n = m.reduce((a, x) => a + x.missing.length, 0);
  ok(n === 4, '見つけた数 ' + n);
  ok(m.some((x) => x.unit === '円と球' && x.missing.length === 2));
});
run('L03 プロフィール: 観点ごとの到達率と学級平均', () => {
  const p = SL.profile(model, 0, '1学期', settings);
  ok(p.subjects.length === 4 && p.subjects[0].kanten.length === 4);
  p.subjects.forEach((s) => ok(s.rate > 0 && s.rate <= 100 && s.classRate > 0));
});
run('L04 2学期にぐんと伸ばした子は「のび」が出る', () => {
  const grown = [3, 11, 19].filter((i) => SL.profile(model, i, '2学期', settings).growth.length > 0);
  ok(grown.length >= 2, '伸びが出た子 ' + grown.length);
});
run('L05 学級のようす: 単元の平均・ABC・一覧表・ヒント', () => {
  const c = SL.classView(model, '算数', '1学期', settings);
  ok(c.units.length === 5 && c.rows.length === 28 && c.rows[0].cells.length === 5);
  const abc = c.units[0].abc;
  ok(abc.A + abc.B + abc.C === c.units[0].entered);
  ok(c.hint && c.hint.text.length > 0);
});
run('L06 所見: 全員分が作れて、名前・数字・%が入らず、目安の字数におさまる', () => {
  ['short', 'normal', 'long'].forEach((len) => {
    model.students.forEach((s) => {
      const p = SL.profile(model, s.idx, '2学期', settings);
      const t = SL.shoken(p, { seed: 0, length: len, includeChallenge: true });
      ok(t.length >= 40, s.no + '番 ' + len + ' が短すぎ: ' + t);
      ok(t.length <= SL.SHOKEN_TARGET[len] * 1.6, s.no + '番 ' + len + ' が長すぎ(' + t.length + '): ' + t);
      ok(t.indexOf(s.name) === -1 && t.indexOf(s.name.split(' ')[1]) === -1, '名前が入っている');
      ok(!/[0-9０-９%％]/.test(t.replace(/[①-⑳]/g, '').replace(/[123]学期/g, '')), '数字が入っている: ' + t);
      ok(t.indexOf('{') === -1 && t.indexOf('undefined') === -1, 'うめこみ忘れ: ' + t);
      ok(!/(国語|社会|算数|理科)の\1/.test(t), '教科名がかさなっている: ' + t);
    });
  });
});
run('L07 所見: seed を変えると別の言い方になる', () => {
  const p = SL.profile(model, 2, '2学期', settings);
  const set = new Set([0, 1, 2].map((sd) => SL.shoken(p, { seed: sd })));
  ok(set.size >= 2);
});
run('L08 所見: 課題を入れない設定', () => {
  model.students.forEach((s) => {
    const t = SL.shoken(SL.profile(model, s.idx, '1年間', settings), { includeChallenge: false, length: 'long' });
    ok(!/さらに伸ばしていきたい|今後の目標/.test(t), t);
  });
});
run('L09 AIに頼む文: 名前・番号・点数を入れない', () => {
  model.students.forEach((s) => {
    const p = SL.profile(model, s.idx, '2学期', settings);
    const t = SL.aiPrompt(p, { length: 'normal', grade: '3年' });
    ok(t.indexOf(s.name) === -1 && t.indexOf(s.name.split(' ')[0]) === -1, '名前が入っている');
    const body = t.split('【テストの結果のまとめ】')[1].replace('3年', '').replace(/[①-⑳]/g, '').replace(/[123]学期/g, '');
    ok(!/[0-9０-９%％]/.test(body), '数字が入っている: ' + body);
  });
});

console.log('\n' + (fail ? '✖ ' : '✔ ') + pass + ' 件 OK / ' + fail + ' 件 NG\n');
process.exit(fail ? 1 : 0);
