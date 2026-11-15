#!/usr/bin/env node
/**
 * run-local-tests.js — 安全のきまり・入力の検査・成績の計算を、Node だけで確かめる。
 *
 *   node tools/run-local-tests.js
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
function ok(c, m) { if (!c) throw new Error(m || 'failed'); }
function eq(a, b, m) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ' got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); }
function throws(fn, re) {
  try { fn(); } catch (e) { if (re && !re.test(e.message)) throw new Error('違う例外: ' + e.message); return; }
  throw new Error('例外になりませんでした');
}
const ctx = vm.createContext({ console, Utilities: { getUuid: () => 'uuid-' + Math.random().toString(36).slice(2) } });
gsFiles.forEach((f) => vm.runInContext(read(f), ctx, { filename: f }));
const scriptOf = (html) => /<script>([\s\S]*?)<\/script>/.exec(html)[1];
vm.runInContext(scriptOf(read('Logic.html')), ctx, { filename: 'Logic.html' });
const SL = ctx.SL;

console.log('\n■ 安全のきまり');
run('S01 公開関数（末尾 _ なし）は PUBLIC / ADMIN / ENTRY の一覧だけ', () => {
  const names = [];
  gsFiles.forEach((f) => { const re = /^function\s+([A-Za-z0-9_$]+)\s*\(/gm; let m; while ((m = re.exec(read(f)))) names.push(m[1]); });
  const pub = names.filter((n) => !n.endsWith('_')).sort();
  eq(pub, ctx.PUBLIC_FUNCTIONS.concat(ctx.ADMIN_FUNCTIONS, ctx.ENTRY_FUNCTIONS).sort());
});
run('S02 公開関数は guard_ → getContext_ の順で始まる', () => {
  const code = gsFiles.map(read).join('\n');
  ctx.PUBLIC_FUNCTIONS.forEach((n) => {
    ok(new RegExp('function ' + n + '\\([^)]*\\) \\{\\n  return guard_\\(function \\(\\) \\{\\n    (var ctx = getContext_\\(actingAs\\);|requireAdmin_\\(getContext_\\(actingAs\\)\\);)').test(code), n);
  });
});
run('S03 管理関数は requireOwner_ で始まる', () => {
  const code = read('Setup.gs');
  ctx.ADMIN_FUNCTIONS.forEach((n) => ok(new RegExp('function ' + n + '\\([^)]*\\) \\{\\n  requireOwner_\\(\\);').test(code), n));
});
run('S04 画面に HTML を文字列で差しこまない', () => {
  htmlFiles.forEach((f) => ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function', 'srcdoc']
    .forEach((w) => ok(read(f).indexOf(w) === -1, f + ' に ' + w)));
});
run('S05 公開リポジトリなので、実在のメール・ファイルIDをコードに書かない', () => {
  fs.readdirSync(SRC).concat(['../tools/preview-server.js', '../tools/build-preview.js']).forEach((f) => {
    const s = fs.readFileSync(path.join(SRC, f), 'utf8');
    (s.match(/[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/g) || []).forEach((m) => ok(/@example\.com$/.test(m), f + ': ' + m));
    ok(!/[A-Za-z0-9_-]{40,}/.test(s.replace(/data:image[^)]*\)/g, '')), f + ' にファイルIDのような文字');
  });
});
run('S06 Webアプリは「デプロイした人として実行」・学校のドメインの中だけ', () => {
  const j = JSON.parse(read('appsscript.json'));
  eq([j.webapp.executeAs, j.webapp.access], ['USER_DEPLOYING', 'DOMAIN']);
});
run('S07 外から読みこむのは Google Fonts だけ', () => {
  htmlFiles.forEach((f) => (read(f).match(/https?:\/\/[^\s"')]+/g) || []).forEach((u) => {
    ok(u === 'http://www.w3.org/2000/svg' || /^https:\/\/fonts\.(googleapis|gstatic)\.com(\/|$)/.test(u) || /^https:\/\/docs\.google\.com\/spreadsheets\/d\/('|…)/.test(u), f + ': ' + u);
  }));
});
run('S08 成績を外に出す口がない（UrlFetchApp・メール・console.log）', () => {
  gsFiles.forEach((f) => ['UrlFetchApp', 'MailApp', 'GmailApp', 'console.log(e', 'console.log(r'].forEach((w) => ok(read(f).indexOf(w) === -1, f + ' に ' + w)));
});
run('S09 BUILD_TARGET は prod', () => ok(/var BUILD_TARGET = 'prod';/.test(read('Config.gs'))));

console.log('\n■ 入力の検査（Rules.gs）');
const g3 = ctx.defaultSubjectsForGrade_(3);
const koku = g3.filter((s) => s.name === '国語')[0];
run('R01 クラスの書き方', () => {
  eq(['３－１', '3-01', '6-あ', '7-1', '3_1', ''].map(ctx.normClassKey_), ['3-1', '3-1', '6-あ', '', '', '']);
});
run('R02 escapeFormula_', () => eq(['=1', '+a', '@x', "'a", 'a=1'].map(ctx.escapeFormula_), ["'=1", "'+a", "'@x", "''a", 'a=1']));
run('R03 テストの登録の検査', () => {
  const v = ctx.validateTests_([{ name: ' わり算 ', points: { '知識・技能': '100', '思考・判断・表現': '' } }], koku);
  eq(v[0].name, 'わり算'); eq(v[0].points, { '知識・技能': 100 }); eq(v[0].order, 1);
  throws(() => ctx.validateTests_([{ name: 'a', points: { '主体的に学習に取り組む態度': 10 } }], koku), /観点ではありません/);
  throws(() => ctx.validateTests_([{ name: 'a', points: {} }], koku), /配点/);
  throws(() => ctx.validateTests_([{ name: 'a', points: { '知識・技能': 0 } }], koku), /配点/);
  throws(() => ctx.validateTests_([{ name: 'a', points: { '知識・技能': 1 } }, { name: 'a', points: { '知識・技能': 1 } }], koku), /2回/);
  throws(() => ctx.validateTests_([{ name: 'a', testId: '<script>', points: { '知識・技能': 1 } }], koku), /形/);
});
run('R04 点数の検査（名簿・テスト・観点・配点の範囲）', () => {
  const t = { testId: 'test-0001', name: 'わり算', points: { '知識・技能': 50 } };
  const by = { 'test-0001': t };
  const v = ctx.validateScoreChanges_([{ studentEmail: 'A@example.com', testId: 'test-0001', kanten: '知識・技能', value: '４５' }], ['a@example.com'], by);
  eq(v[0].value, 45); eq(v[0].studentEmail, 'a@example.com');
  eq(ctx.validateScoreChanges_([{ studentEmail: 'a@example.com', testId: 'test-0001', kanten: '知識・技能', value: '' }], ['a@example.com'], by)[0].value, '');
  throws(() => ctx.validateScoreChanges_([{ studentEmail: 'x@example.com', testId: 'test-0001', kanten: '知識・技能', value: 1 }], ['a@example.com'], by), /名簿/);
  throws(() => ctx.validateScoreChanges_([{ studentEmail: 'a@example.com', testId: 'other', kanten: '知識・技能', value: 1 }], ['a@example.com'], by), /このクラス/);
  throws(() => ctx.validateScoreChanges_([{ studentEmail: 'a@example.com', testId: 'test-0001', kanten: '思考・判断・表現', value: 1 }], ['a@example.com'], by), /観点/);
  throws(() => ctx.validateScoreChanges_([{ studentEmail: 'a@example.com', testId: 'test-0001', kanten: '知識・技能', value: 51 }], ['a@example.com'], by), /0〜50/);
  throws(() => ctx.validateScoreChanges_([{ studentEmail: 'a@example.com', testId: 'test-0001', kanten: '知識・技能', value: '=1+1' }], ['a@example.com'], by), /0〜50/);
});
run('R05 先生が入れる値の検査', () => {
  const v = ctx.validateManualChanges_([{ studentEmail: 'a@example.com', subject: '国語', term: '1学期', field: '主体的に学習に取り組む態度', value: 'ａ' },
    { studentEmail: 'a@example.com', subject: '国語', term: '1年間', field: '評定', value: '３' }, { studentEmail: 'a@example.com', subject: '国語', term: '2学期', field: '知識・技能', value: '◎' }],
  ['a@example.com'], g3, ['1学期', '2学期', '3学期']);
  eq(v.map((x) => x.value), ['A', '3', 'A']);
  throws(() => ctx.validateManualChanges_([{ studentEmail: 'a@example.com', subject: '国語', term: '1学期', field: '漢字', value: 'A' }], ['a@example.com'], g3, ['1学期']), /観点/);
  throws(() => ctx.validateManualChanges_([{ studentEmail: 'a@example.com', subject: '国語', term: '1学期', field: '評定', value: '4' }], ['a@example.com'], g3, ['1学期']), /評定/);
  throws(() => ctx.validateManualChanges_([{ studentEmail: 'a@example.com', subject: '国語', term: '4学期', field: '評定', value: '1' }], ['a@example.com'], g3, ['1学期']), /時期/);
  throws(() => ctx.validateManualChanges_([{ studentEmail: 'a@example.com', subject: '道徳', term: '1学期', field: '評定', value: '1' }], ['a@example.com'], g3, ['1学期']), /教科/);
});
run('R06 教科・観点・基準の検査', () => {
  const v = ctx.validateGradeSubjects_(JSON.parse(JSON.stringify(g3)));
  eq(v.length, g3.length);
  const bad = JSON.parse(JSON.stringify(g3)); bad[0].kanten[0].b = 90;
  throws(() => ctx.validateGradeSubjects_(bad), /C になる/);
  const bad2 = JSON.parse(JSON.stringify(g3)); bad2[0].kanten[1].into = 'ないもの';
  throws(() => ctx.validateGradeSubjects_(bad2), /まとめ先/);
  const bad3 = JSON.parse(JSON.stringify(g3)); bad3[0].total.r3 = 1.2;
  throws(() => ctx.validateGradeSubjects_(bad3), /評定の基準/);
});
run('R07 担任の割り当ての検査', () => {
  const r = ctx.normalizeAssignments_([{ classKey: '3-1', homeroom: 'T@example.com', assistants: ['u@example.com', 't@example.com'] }], ['3-1'], ['t@example.com', 'u@example.com']);
  eq(r.map((x) => x.role), ['homeroom', 'assistant']);
  throws(() => ctx.normalizeAssignments_([{ classKey: '3-9', homeroom: '' }], ['3-1'], []), /クラス/);
  throws(() => ctx.normalizeAssignments_([{ classKey: '3-1', homeroom: 'z@example.com' }], ['3-1'], ['t@example.com']), /教職員/);
});

run('R11 評価の基準・評定の表の検査', () => {
  const v = ctx.validateCriteria_({ kanten: { '知識・技能': { a: '95', b: 60 } }, unit: { a: 90, b: 50 } }, koku);
  eq(v, { kanten: { '知識・技能': { a: 95, b: 60 } }, unit: { a: 90, b: 50 } });
  throws(() => ctx.validateCriteria_({ kanten: {}, unit: { a: 60, b: 60 } }, koku), /小さく/);
  throws(() => ctx.validateCriteria_({ kanten: { '漢字': { a: 90, b: 50 } }, unit: { a: 90, b: 50 } }, koku), /観点ではありません/);
  throws(() => ctx.validateCriteria_({ kanten: {}, unit: { a: 101, b: 50 } }, koku), /1〜100/);
  const r = ctx.validateHyoteiRule_(Object.assign(SL.defaultHyotei(3), { AAB: '３' }), koku);
  eq(r.AAB, '3');
  throws(() => ctx.validateHyoteiRule_(Object.assign(SL.defaultHyotei(3), { AAB: '4' }), koku), /1・2・3/);
  throws(() => ctx.validateHyoteiRule_(Object.assign(SL.defaultHyotei(3), { XYZ: '1' }), koku), /形/);
  const less = SL.defaultHyotei(3); delete less.CCC;
  throws(() => ctx.validateHyoteiRule_(less, koku), /CCC/);
});
run('R08 名簿マスター: 学校コードで見分け、決まった列だけを取り込む', () => {
  ok(ctx.schoolMatches_('nr-435_大安寺西小学校', '435', '奈良市立大安寺西小学校'));
  ok(!ctx.schoolMatches_('nr-408_大安寺小学校', '435', '奈良市立大安寺西小学校'));
  ok(!ctx.schoolMatches_('nr-4350_どこか', '435', 'x'));
  ok(ctx.schoolMatches_('大安寺西小学校', 'abc', '奈良市立大安寺西小学校'), 'コードの無い書き方は名前で');
  ok(!ctx.schoolMatches_('', '435', 'x'));
  ok(ctx.isActiveStatus_('active,multi', ['active']) && !ctx.isActiveStatus_('inactive', ['active']));
  const stu = [['状態', '学校', '姓', '名', 'Googleアカウント', '年', '組', '番'],
    ['active', 'nr-435_大安寺西小学校', 'みほん', 'いち', 'S1@example.com', '３', '1', '2'],
    ['active', 'nr-408_大安寺小学校', 'よそ', 'の子', 's2@example.com', '3', '1', '1'],
    ['転出', 'nr-435_大安寺西小学校', 'てん', 'しゅつ', 's3@example.com', '3', '1', '3'],
    ['active', 'nr-435_大安寺西小学校', 'メール', 'なし', '', '3', '1', '4']];
  const stf = [['状態', '学校', '姓', '名', 'Googleアカウント', '役職'],
    ['active,multi', 'nr-435_大安寺西小学校', 'みほん', '先生', 't1@example.com', '教務主任'],
    ['active', 'nr-408_大安寺小学校', 'よそ', '先生', 't2@example.com', '教諭']];
  const p = ctx.parseRosterMaster_(stu, stf, '435', '奈良市立大安寺西小学校', 'now');
  eq(p.roster.map((x) => [x.email, x.name, x.grade, x.classNo, x.number, x.status]),
    [['s1@example.com', 'みほん いち', '3', '1', '2', 'active'], ['s3@example.com', 'てん しゅつ', '3', '1', '3', '転出']]);
  eq(p.staff.map((x) => [x.email, x.title, x.status]), [['t1@example.com', '教務主任', 'active']]);
  throws(() => ctx.parseRosterMaster_([['状態', '学校']], stf, '435', 'x', 'now'), /姓/);
});
run('R09 名簿マスターのリンク', () => {
  const id = '13DsCYgI0HgsxOiB0iX7-YOmXyb5O6VrxtPFf_S5G4_w'.replace(/./g, 'a');
  eq(ctx.sheetIdFromUrl_('https://docs.google.com/spreadsheets/d/' + id + '/edit?gid=1#gid=1'), id);
  eq(ctx.sheetIdFromUrl_('https://evil.example.com/spreadsheets/d/' + id), '');
  eq(ctx.sheetIdFromUrl_('javascript:alert(1)'), '');
});
run('R10 学校の一覧（コードは3けたの数・重なりなし）', () => {
  const codes = ctx.SCHOOL_LIST.map((x) => x[0]);
  ok(codes.every((c) => /^\d{3}$/.test(c)) && new Set(codes).size === codes.length);
  ok(ctx.SCHOOL_LIST.some((x) => x[0] === '435' && x[1] === '奈良市立大安寺西小学校'));
});

console.log('\n■ 成績の計算（Logic.html）');
run('L01 組み合わせ表（SMILE の「通知表評価の読込設定」と同じ）', () => {
  const want = { AAA: 'A', AAB: 'A', AAC: 'B', ABC: 'B', BAA: 'A', BCC: 'C', CAA: 'B', CBC: 'C', CCA: 'B', CCB: 'C', CCC: 'C' };
  Object.keys(want).forEach((k) => eq(SL.combine(k.split(''), 3), want[k], k));
  eq(['AB', 'BA', 'AC', 'CC'].map((k) => SL.combine(k.split(''), 2)), ['A', 'A', 'B', 'C']);
  eq(SL.combine(['A', '', 'A'], 3), '', 'そろっていなければ出さない');
  eq(SL.combine(['A', '/', 'A'], 3), '');
  eq(Object.keys(SL.COMBO[3]).length, 27);
});
function cdOf() {
  return {
    terms: ['1学期', '2学期', '3学期'],
    students: [{ key: 'a', no: 1, name: 'あ' }, { key: 'b', no: 2, name: 'い' }],
    subjects: [koku],
    tests: [
      { testId: 't1', subject: '国語', term: '1学期', order: 1, name: 'A', points: { '知識・技能': 50, '漢字': 50, '思考・判断・表現': 100 } },
      { testId: 't2', subject: '国語', term: '2学期', order: 1, name: 'B', points: { '知識・技能': 100, '思考・判断・表現': 100 } },
      { testId: 't3', subject: '国語', term: '3学期', order: 1, name: 'C', points: { '知識・技能': 100, '思考・判断・表現': 100 } }
    ],
    scores: { t1: { a: { '知識・技能': 40, '漢字': 50, '思考・判断・表現': 70 } }, t2: { a: { '知識・技能': 85, '思考・判断・表現': 40 } }, t3: { a: { '知識・技能': 50, '思考・判断・表現': 90 } } },
    manual: {}
  };
}
run('L02 学期の観点: 漢字は知識・技能にまとめて計算、基準 80/60', () => {
  const cd = cdOf();
  const te = SL.termEval(cd, koku, 'a', '1学期');
  const k = te.kanten.filter((x) => x.label === '知識・技能')[0];
  eq([k.sum, k.max, k.rate, k.auto], [90, 100, 90, 'A']);
  eq(te.kanten.filter((x) => x.label === '思考・判断・表現')[0].auto, 'B');
  eq(te.kanten.map((x) => x.label), ['知識・技能', '思考・判断・表現', '主体的に学習に取り組む態度'], '漢字・言葉は評価の列に出さない');
  eq(te.kanten[2].final, '', '主体的は先生が入れるまで空');
});
run('L03 手直しは計算より優先、評定は組み合わせの表', () => {
  const cd = cdOf();
  cd.manual['a|国語|1学期|主体的に学習に取り組む態度'] = 'A';
  let te = SL.termEval(cd, koku, 'a', '1学期');
  eq(te.hyotei.auto, '2', 'A,B,A → AAB → 2');
  cd.manual['a|国語|1学期|知識・技能'] = 'C';
  te = SL.termEval(cd, koku, 'a', '1学期');
  eq([te.kanten[0].auto, te.kanten[0].final, te.hyotei.auto], ['A', 'C', '2'], 'C,B,A → ABC → 2');
  cd.hyoteiRules = { '国語': Object.assign(SL.defaultHyotei(3), { ABC: '1' }) };
  eq(SL.termEval(cd, koku, 'a', '1学期').hyotei.auto, '1', '先生が決めた表を使う');
});
run('L09 評定の表の初期値（3=AAA だけ・1=C が2つ以上）', () => {
  eq(SL.combosOf(3), ['AAA', 'AAB', 'AAC', 'ABB', 'ABC', 'ACC', 'BBB', 'BBC', 'BCC', 'CCC']);
  eq(SL.defaultHyotei(3), { AAA: '3', AAB: '2', AAC: '2', ABB: '2', ABC: '2', ACC: '1', BBB: '2', BBC: '2', BCC: '1', CCC: '1' });
  eq(SL.comboKey(['B', 'A', 'A']), 'AAB'); eq(SL.comboKey(['A', '', 'A']), ''); eq(SL.comboKey(['A', '/', 'A']), '');
  eq(ctx.combosOf_(3), SL.combosOf(3), 'サーバーと画面で同じ組み合わせ');
});
run('L10 評価の基準（A は ○%以上・C は ○%未満）をクラス×学期で変えると、その場で変わる', () => {
  const cd = cdOf();
  eq(SL.termEval(cd, koku, 'a', '1学期').kanten[0].auto, 'A', '90% は 80 以上で A');
  cd.criteria = { '国語|1学期': { kanten: { '知識・技能': { a: 95, b: 60 } }, unit: { a: 95, b: 60 } } };
  eq(SL.termEval(cd, koku, 'a', '1学期').kanten[0].auto, 'B', '95 以上でないので B');
  eq(SL.testResult(cd, koku, cd.tests[0], 'a').eval, 'B', 'テストの評価も単元の基準で');
  eq(SL.termEval(cd, koku, 'a', '2学期').kanten[0].auto, 'A', 'ほかの学期は変わらない');
});
run('L11 学年のほかのクラスの人数（名前なしの点数から）', () => {
  const peer = { label: '3年2組', n: 3, tests: [
    { subject: '国語', term: '1学期', name: 'A', points: { '知識・技能': 50, '漢字': 50, '思考・判断・表現': 100 }, rows: [{ '知識・技能': 50, '漢字': 50, '思考・判断・表現': 100 }, { '知識・技能': 30, '漢字': 30, '思考・判断・表現': 50 }, null] }] };
  const crit = SL.criteriaFor(cdOf(), koku, '1学期');
  const c = SL.peerCounts(peer, koku, '1学期', crit);
  eq(c.kanten['知識・技能'], { A: 1, B: 1, C: 0 }); eq(c.kanten['思考・判断・表現'], { A: 1, B: 0, C: 1 }); eq(c.tests.A, { A: 1, B: 0, C: 1 });
});
run('L04 1年間（要録）: 3学期そろった観点だけ、組み合わせ表で出す', () => {
  const cd = cdOf();
  ['1学期', '2学期'].forEach((t) => { cd.manual['a|国語|' + t + '|主体的に学習に取り組む態度'] = 'B'; });
  let y = SL.yearEval(cd, koku, 'a');
  eq(y.kanten[0].terms, ['A', 'A', 'C']); eq(y.kanten[0].auto, 'B');
  eq(y.kanten[1].terms, ['B', 'C', 'A']); eq(y.kanten[1].auto, 'B');
  eq(y.kanten[2].auto, '', '3学期の主体的が空');
  eq(y.hyotei.auto, '');
  cd.manual['a|国語|3学期|主体的に学習に取り組む態度'] = 'A';
  y = SL.yearEval(cd, koku, 'a');
  eq([y.kanten[2].auto, y.hyotei.auto], ['B', '2']);
});
run('L05 GG の列と行（知・思・主・評定）、TSV', () => {
  const cd = cdOf();
  eq(SL.ggColumns(cd, koku, '1学期').map((c) => c.label), ['知', '思', '主']);
  eq(['‐', '-', 'ー', '/'].map(SL.normAbc), ['/', '/', '/', '/']);
  eq(SL.ggColumns(cd, koku, '1年間').map((c) => c.label), ['知', '思', '主', '評定']);
  const rows = SL.ggRows(cd, koku, '1学期');
  eq(rows.map((r) => r.cells), [['A', 'B', ''], ['', '', '']]);
  eq(SL.toTsv(rows.map((r) => r.cells)), 'A\tB\t\n\t\t');
  eq(SL.fromTsv('1\t2\r\n3\t4\r\n'), [['1', '2'], ['3', '4']]);
});
run('L06 入力の書き方をそろえる', () => {
  eq(['a', 'Ａ', '◎', '○', '△', '/', 'x', ''].map(SL.normAbc), ['A', 'A', 'A', 'B', 'C', '/', null, '']);
  eq(['３', '1', '4', '/'].map(SL.normHyotei), ['3', '1', null, '/']);
  eq([SL.normScore('４５', 50), SL.normScore('51', 50), SL.normScore('', 50), SL.normScore('a', 50)], [45, null, '', null]);
});
run('L07 入れわすれ: 何人かだけ入っているテスト', () => {
  const cd = cdOf();
  eq(SL.missing(cd).map((m) => [m.test.testId, m.missing.map((s) => s.key)]), [['t1', ['b']], ['t2', ['b']], ['t3', ['b']]]);
});
run('L08 初期値の教科（学年ごと）', () => {
  eq(ctx.defaultSubjectsForGrade_(1).map((s) => s.name), ['国語', '算数', '生活', '音楽', '図工', '体育']);
  eq(ctx.defaultSubjectsForGrade_(5).map((s) => s.name), ['国語', '社会', '算数', '理科', '音楽', '図工', '家庭', '体育', '外国語']);
  ok(!ctx.defaultSubjectsForGrade_(2)[0].hyoteiYear && ctx.defaultSubjectsForGrade_(3)[0].hyoteiYear, '評定は3年から');
});

run('L12 個票のプロフィールと所見の下書き（名前・数字が入らない）', () => {
  const cd = cdOf();
  cd.students.push({ key: 'c', no: 3, name: 'う' });
  cd.scores.t1.b = { '知識・技能': 20, '漢字': 20, '思考・判断・表現': 40 };
  cd.scores.t1.c = { '知識・技能': 30, '漢字': 30, '思考・判断・表現': 60 };
  const p = SL.profile(cd, 'a', '1学期');
  eq(p.subjects.length, 1); eq(p.subjects[0].name, '国語');
  ok(p.subjects[0].rate > p.subjects[0].classRate, 'a は学級より高い');
  ok(p.strengths.length >= 1, 'とくいが出る');
  const y = SL.profile(cd, 'a', '1年間');
  eq(y.subjects[0].units.length, 3);
  ['short', 'normal', 'long'].forEach((len) => {
    const t = SL.shoken(p, { seed: 1, length: len, includeChallenge: true });
    ok(t.length > 30 && t.indexOf('{') === -1 && t.indexOf('undefined') === -1, t);
    ok(!/[0-9０-９%％]/.test(t.replace(/[123]学期/g, '')), '数字: ' + t);
    ok(t.indexOf('あ') === -1 || !/あさん/.test(t));
  });
  const ai = SL.aiPrompt(p, { grade: '3年' });
  ok(ai.indexOf('名前は書かないで') !== -1 && !/\d+%/.test(ai));
  const pb = SL.profile(cd, 'b', '1学期');
  ok(pb.challenges.length >= 1, 'のびしろが出る');
});

run('L13 学級全員分の AI の文（名前・番号・点数なし）と返事の振り分け', () => {
  const cd = cdOf();
  cd.students.forEach((x, i) => { x.name = 'みほん' + i; });
  const ps = cd.students.map((x) => SL.profile(cd, x.key, '1学期'));
  const t = SL.aiPromptClass(ps, { grade: '3年' });
  ok(t.indexOf('【児童01】') !== -1 && t.indexOf('【児童02】') !== -1);
  ok(t.indexOf('みほん') === -1, '名前が入っている');
  ok(!/\d+(\.\d+)?%/.test(t), '% が入っている');
  const got = SL.parseAiReply('はい、書きます。\n\n**【児童01】**\n国語ではよく理解しています。\n\n［児童０２］：算数もがんばっています。\n【児童9】\n');
  eq(got, { 0: '国語ではよく理解しています。', 1: '算数もがんばっています。' });
});

run('P01 SMILE から取りこむ: 見出しから読み、番号と名前で子どもを合わせる', () => {
  const W = 30, blank = () => Array(W).fill('');
  const rows = []; for (let i = 0; i < 70; i++) rows.push(blank());
  const set = (r, c, v) => { rows[r][c] = v; };
  set(3, 1, '【1学期】'); set(3, 7, 'A='); set(3, 8, '95'); set(4, 7, 'B='); set(4, 8, '60');
  set(5, 1, '単元名／観点'); set(5, 3, 'つぼみ'); set(5, 10, 'たしかめよう');
  ['思考・判断・表現', '知識・技能', '漢字', '言葉', '単元合計', '単元到達率', '単元評価'].forEach((h, i) => { set(6, 3 + i, h); set(6, 10 + i, h); });
  set(7, 3, '100'); set(7, 4, '100'); set(7, 6, '100'); set(7, 11, '50');
  set(8, 1, '学級平均');
  set(9, 3, '90'); set(9, 4, '８０'); set(9, 6, '70'); set(9, 11, '40');
  set(10, 3, '40'); set(10, 4, '50');
  set(11, 3, '30'); set(11, 4, '30');
  const subj = ctx.parseSubject_('国語', rows, 3);
  const mrows = []; for (let i = 0; i < 60; i++) mrows.push(Array(11).fill(''));
  mrows[0][1] = 'SMILE スプレッドシート版'; mrows[0][4] = '3学期制'; mrows[0][5] = '3年'; mrows[0][7] = '１';
  mrows[13][1] = '№'; mrows[13][2] = '名前';
  mrows[14][1] = '1'; mrows[14][2] = 'みほん　いち'; mrows[15][1] = '2'; mrows[15][2] = 'みほん に'; mrows[16][1] = '3'; mrows[16][2] = 'ちがう なまえ';
  const menu = ctx.parseMenu_(mrows);
  const roster = [{ email: 'a@example.com', number: 1, name: 'みほん いち' }, { email: 'b@example.com', number: 2, name: 'みほん に' }, { email: 'c@example.com', number: 3, name: 'ほんとう の名前' }];
  const plan = ctx.smilePlan_(menu, [subj], '3-1', roster, g3, ['1学期', '2学期', '3学期']);
  eq(plan.tests.map((t) => [t.term, t.name, t.points]), [['1学期', 'つぼみ', { '思考・判断・表現': 100, '知識・技能': 100, '言葉': 100 }], ['1学期', 'たしかめよう', { '知識・技能': 50 }]]);
  eq(plan.tests[0].scores, { 'a@example.com': { '思考・判断・表現': 90, '知識・技能': 80, '言葉': 70 }, 'b@example.com': { '思考・判断・表現': 40, '知識・技能': 50 } });
  eq(plan.students.matched, 2); eq(plan.students.mismatch.map((x) => x.no), [3], '名前が合わない子には入れない');
  eq(plan.thresholds['国語|1学期'], { a: 95, b: 60 });
  throws(() => ctx.smilePlan_(menu, [subj], '3-2', roster, g3, ['1学期']), /3年1組/);
});

run('P02 SMILE 取りこみ: 転校で番号がずれても名前で合わせる・字の形のちがいも同じ', () => {
  const mrows = []; for (let i = 0; i < 60; i++) mrows.push(Array(11).fill(''));
  mrows[0][5] = '3年'; mrows[0][7] = '1'; mrows[13][1] = '№'; mrows[13][2] = '名前';
  [['1', 'あお いち'], ['2', 'てんこう した'], ['3', '髙﨑　さん'], ['4', 'ＡＢ　よん'], ['5', 'おなじ なまえ'], ['6', 'おなじ なまえ']].forEach((x, i) => { mrows[14 + i][1] = x[0]; mrows[14 + i][2] = x[1]; });
  const menu = ctx.parseMenu_(mrows);
  const roster = [{ email: 'a@x', number: 1, name: 'あお いち' }, { email: 'c@x', number: 2, name: '高崎 さん' }, { email: 'd@x', number: 3, name: 'AB よん' },
    { email: 'e@x', number: 4, name: 'おなじ なまえ' }, { email: 'f@x', number: 5, name: 'おなじ なまえ' }];
  const plan = ctx.smilePlan_(menu, [], '3-1', roster, g3, ['1学期']);
  eq(plan.students.matched, 5);
  eq(plan.students.mismatch, []);
  eq(plan.students.missing.map((x) => x.smileName), ['てんこう した'], '転校した子だけ入れない');
  eq(plan.students.moved.map((x) => [x.no, x.rosterNo]), [[3, 2], [4, 3], [5, 4], [6, 5]]);
});

run('P03 SMILE 取りこみ: 見えない字（異体字セレクタ・ゼロ幅）がついていても同じ名前', () => {
  eq(ctx.bareName_('杉\uDB40\uDD03山 はな'), ctx.bareName_('杉山 はな'));
  eq(ctx.bareName_('葛\uFE00西\u200B たろう'), ctx.bareName_('葛西たろう'));
});

run('P04 SMILE 取りこみ: 異体字（原と𠩤）・1字だけちがう子は合わせて知らせる', () => {
  eq(ctx.bareName_('小𠩤 たろう'), ctx.bareName_('小原　たろう'));
  const mrows = []; for (let i = 0; i < 60; i++) mrows.push(Array(11).fill(''));
  mrows[0][5] = '3年'; mrows[0][7] = '1'; mrows[13][1] = '№'; mrows[13][2] = '名前';
  [['1', '小原 たろう'], ['2', '山田 はなこ'], ['3', '鈴木 いち']].forEach((x, i) => { mrows[14 + i][1] = x[0]; mrows[14 + i][2] = x[1]; });
  const menu = ctx.parseMenu_(mrows);
  const roster = [{ email: 'a@x', number: 1, name: '小𠩤 たろう' }, { email: 'b@x', number: 2, name: '山⽥ はなこ' }, { email: 'c@x', number: 3, name: '佐藤 じろう' }];
  const plan = ctx.smilePlan_(menu, [], '3-1', roster, g3, ['1学期']);
  eq(plan.students.matched, 2);
  eq(plan.students.fuzzy, []);
  eq(plan.students.mismatch.map((x) => x.no), [3], 'まるでちがう名前は合わせない');
  const roster2 = [{ email: 'b@x', number: 2, name: '山囲 はなこ' }];
  const p2 = ctx.smilePlan_(menu, [], '3-1', roster2, g3, ['1学期']);
  eq(p2.students.fuzzy.map((x) => x.rosterNo), [2], '1字ちがいは合わせて知らせる');
});

run('G02 GG に全教科をまとめて貼る: 教科ごとに 知・思・主・評定 の4列、GG の並び', () => {
  const cd = cdOf();
  cd.subjects = JSON.parse(JSON.stringify(ctx.defaultSubjectsForGrade_(6))).reverse();
  const t = SL.ggAll(cd, cd.terms[0]);
  eq(t.subjects, ['国語', '社会', '算数', '理科', '音楽', '図画工作', '家庭', '体育', '外国語']);
  eq(t.header.slice(0, 4), ['国語_知', '国語_思', '国語_主', '国語_評定']);
  ok(t.header.length === t.subjects.length * 4, '4列ずつでない');
  ok(t.subjects.indexOf('図画工作') !== -1, '図工が図画工作になっていない');
  ok(t.subjects.indexOf('社会') === 1 && t.subjects.indexOf('算数') === 2, 'GG の並びでない: ' + t.subjects.join(','));
  ok(t.rows.length === cd.students.length);
  ok(t.rows.every((r) => r.cells.length === t.header.length && r.cells[3] === ''), '学期の評定が空でない');
  const y = SL.ggAll(cd, '1年間');
  ok(y.rows.every((r) => r.cells.length === y.header.length));
});

run('G03 GG の学年ごとの教科の並び（1〜6年の GG の見出しと同じ）', () => {
  const want = {
    1: ['国語', '算数', '生活', '音楽', '図画工作', '体育'],
    2: ['国語', '算数', '生活', '音楽', '図画工作', '体育'],
    3: ['国語', '社会', '算数', '理科', '音楽', '図画工作', '体育'],
    4: ['国語', '社会', '算数', '理科', '音楽', '図画工作', '体育'],
    5: ['国語', '社会', '算数', '理科', '音楽', '図画工作', '家庭', '体育', '外国語'],
    6: ['国語', '社会', '算数', '理科', '音楽', '図画工作', '家庭', '体育', '外国語']
  };
  Object.keys(want).forEach((g) => {
    const cd = cdOf();
    cd.subjects = JSON.parse(JSON.stringify(ctx.defaultSubjectsForGrade_(Number(g))));
    eq(SL.ggAll(cd, '1学期').subjects, want[g], g + '年');
  });
});

console.log('\n' + (fail ? '✖ ' : '✔ ') + pass + ' 件 OK / ' + fail + ' 件 NG\n');
process.exit(fail ? 1 : 0);
