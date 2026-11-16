/**
 * Rules.gs — 入力の検査と、文字・数のそろえ方（純粋関数）。
 *
 * シートや Session に触らない。tools/run-local-tests.js が Node から試す。
 * 画面から来る値は「どれを変えたいか」の指定にすぎない。ここで形・範囲・名簿にあるかを確かめてから使う。
 */
function normEmail_(s) { return String(s === null || s === undefined ? '' : s).trim().toLowerCase(); }

/** 先頭が = + - @ ' の文字列は、シートで数式にならないように ' を付ける。 */
function escapeFormula_(s) {
  s = String(s === null || s === undefined ? '' : s);
  return /^[=+\-@']/.test(s) ? "'" + s : s;
}

/** 全角の数字・英字・記号（－ ．）を半角にし、前後の空白を取る。 */
function toHalf_(v) {
  return String(v === null || v === undefined ? '' : v).trim()
    .replace(/[０-９Ａ-Ｚａ-ｚ．－]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
}

/** クラスの書き方をそろえる（３－１ → 3-1）。正しくなければ ''。 */
function normClassKey_(v) {
  var s = toHalf_(v).replace(/[ー―‐]/g, '-');
  var m = /^([1-6])-([0-9A-Za-z぀-ヿ一-鿿]{1,6})$/.exec(s);
  if (!m) return '';
  return m[1] + '-' + m[2].replace(/^0+(?=\d)/, '');
}
function gradeOf_(classKey) { return Number(String(classKey).split('-')[0]); }
function classLabel_(classKey) { var p = String(classKey).split('-'); return p[0] + '年' + p[1] + '組'; }

/** 4月はじまりの年度。 */
function fiscalYearOf_(yyyymmdd) {
  var m = /^(\d{4})-(\d{2})/.exec(String(yyyymmdd));
  var y = Number(m[1]), mo = Number(m[2]);
  return String(mo >= 4 ? y : y - 1);
}

function termsOf_(termSystem) { return TERM_LABELS[termSystem] || TERM_LABELS['3学期制']; }

function checkText_(v, max, what, allowEmpty) {
  var s = String(v === null || v === undefined ? '' : v).replace(/\r\n?/g, '\n').trim();
  if (!allowEmpty && !s) throw appError_(what + 'を入れてください。');
  if (s.length > max) throw appError_(what + 'は' + max + '字までです。');
  return s;
}
function checkInt_(v, min, max, what) {
  var n = Number(toHalf_(v));
  if (!isFinite(n) || Math.round(n) !== n || n < min || n > max) throw appError_(what + 'は' + min + '〜' + max + 'の数にしてください。');
  return n;
}
function checkArray_(v, max) {
  if (!Array.isArray(v) || v.length > max) throw appError_('入力の形が正しくありません。');
  return v;
}
function checkObject_(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw appError_('入力の形が正しくありません。');
  return v;
}

// ================= 教科・観点・基準 =================

/** 学年の教科の設定を検査する。subjects = [{name, kanten:[{label, gg, test, into, a, b}], total:{a,b}, hyoteiTerm, hyoteiYear}] */
function validateGradeSubjects_(subjects) {
  checkArray_(subjects, 20);
  if (!subjects.length) throw appError_('教科を1つ以上入れてください。');
  var names = {};
  return subjects.map(function (s) {
    checkObject_(s);
    var name = checkText_(s.name, MAX_LEN.subject, '教科の名前');
    if (names[name]) throw appError_('「' + name + '」が2回入っています。');
    names[name] = true;
    checkArray_(s.kanten, 10);
    var labels = {};
    var kanten = s.kanten.map(function (k) {
      checkObject_(k);
      var label = checkText_(k.label, MAX_LEN.kanten, '観点の名前');
      if (labels[label]) throw appError_(name + 'の観点「' + label + '」が2回入っています。');
      labels[label] = true;
      var gg = String(k.gg || '');
      if (['', '知', '思', '主'].indexOf(gg) === -1) throw appError_('GGの列は「知・思・主」のどれかにしてください。');
      var out = { label: label, gg: gg, test: k.test === true };
      if (out.test) {
        out.a = checkInt_(k.a, 1, 100, 'Aの基準');
        out.b = checkInt_(k.b, 0, 100, 'Cの基準');
        if (out.b >= out.a) throw appError_(name + '「' + label + '」の「C になる %」は、「A になる %」より小さくしてください。');
      }
      if (k.into) out.into = String(k.into);
      return out;
    });
    kanten.forEach(function (k) {
      if (k.into && (!labels[k.into] || kanten.some(function (x) { return x.label === k.into && (x.into || !x.test); }))) {
        throw appError_(name + '「' + k.label + '」のまとめ先が正しくありません。');
      }
      if (k.into && k.gg) throw appError_(name + '「' + k.label + '」は、まとめ先があるのでGGの列はいりません。');
    });
    if (!kanten.some(function (k) { return !k.into; })) throw appError_(name + 'に観点を入れてください。');
    checkObject_(s.total);
    var total = { a: checkInt_(s.total.a, 1, 100, 'Aの基準'), b: checkInt_(s.total.b, 0, 100, 'Cの基準') };
    return { name: name, kanten: kanten, total: total, hyoteiTerm: s.hyoteiTerm === true, hyoteiYear: s.hyoteiYear === true };
  });
}

// ================= テスト =================

/** テストの登録の検査。tests = [{testId?, name, points:{観点: 配点}}]。並び順は配列の順。 */
function validateTests_(tests, subjectConf) {
  checkArray_(tests, MAX_TESTS_PER_TERM);
  var allowed = subjectConf.kanten.filter(function (k) { return k.test; }).map(function (k) { return k.label; });
  var names = {};
  return tests.map(function (t, i) {
    checkObject_(t);
    var name = checkText_(t.name, MAX_LEN.testName, 'テストの名前');
    if (names[name]) throw appError_('テスト「' + name + '」が2回入っています。');
    names[name] = true;
    checkObject_(t.points);
    var points = {};
    Object.keys(t.points).forEach(function (label) {
      if (allowed.indexOf(label) === -1) throw appError_('「' + label + '」は、この教科のテストの観点ではありません。');
      var raw = t.points[label];
      if (raw === '' || raw === null || raw === undefined) return;
      points[label] = checkInt_(raw, 1, MAX_POINT, '「' + name + '」の配点');
    });
    if (!Object.keys(points).length) throw appError_('「' + name + '」に配点を1つ以上入れてください。');
    var id = t.testId === undefined || t.testId === '' ? '' : String(t.testId);
    if (id && !/^[A-Za-z0-9-]{8,64}$/.test(id)) throw appError_('入力の形が正しくありません。');
    return { testId: id, name: name, order: i + 1, points: points };
  });
}

// ================= 点数・手で入れる値・所見 =================

/**
 * 点数の変更の検査。changes = [{studentEmail, testId, kanten, value}]。
 * students: そのクラスの児童のメール、tests: そのクラスのテスト（testId → test）。
 */
function validateScoreChanges_(changes, students, testsById) {
  checkArray_(changes, MAX_CHANGES);
  return changes.map(function (c) {
    checkObject_(c);
    var e = normEmail_(c.studentEmail);
    if (students.indexOf(e) === -1) throw appError_('名簿にない児童です。');
    var t = testsById[String(c.testId)];
    if (!t) throw appError_('このクラスのテストではありません。');
    var label = String(c.kanten);
    if (!(label in t.points)) throw appError_('このテストの観点ではありません。');
    var v = toHalf_(c.value);
    var value = '';
    if (v !== '') {
      if (!/^\d+(\.\d+)?$/.test(v) || Number(v) > t.points[label]) throw appError_('「' + t.name + '」' + label + 'の点は0〜' + t.points[label] + 'にしてください。');
      value = Number(v);
    }
    // base = 画面で読みこんだときの値（同時に編集されていないかを確かめる）。無ければ確かめない
    var out = { studentEmail: e, testId: t.testId, kanten: label, value: value };
    if (c.base !== undefined && c.base !== null) out.base = String(c.base).slice(0, 20);
    return out;
  });
}

/** 先生が入れる値（主体的・手直し）の検査。field は評価の観点か「評定」。 */
function validateManualChanges_(changes, students, subjects, terms) {
  checkArray_(changes, MAX_CHANGES);
  var termsOk = terms.concat([YEAR_TERM]);
  return changes.map(function (c) {
    checkObject_(c);
    var e = normEmail_(c.studentEmail);
    if (students.indexOf(e) === -1) throw appError_('名簿にない児童です。');
    var sub = subjects.filter(function (s) { return s.name === c.subject; })[0];
    if (!sub) throw appError_('この学年の教科ではありません。');
    var term = String(c.term);
    if (termsOk.indexOf(term) === -1) throw appError_('時期が正しくありません。');
    var field = String(c.field);
    var isHy = field === '評定';
    if (!isHy && !sub.kanten.some(function (k) { return k.label === field && !k.into; })) throw appError_('この教科の観点ではありません。');
    var v = toHalf_(c.value).toUpperCase();
    if (v === '◎') v = 'A'; else if (v === '○' || v === '〇') v = 'B'; else if (v === '△') v = 'C';
    else if (['／', '-', '－', '‐', 'ー', '―', '−', '–', '—'].indexOf(v) !== -1) v = '/';
    var ok = isHy ? /^([1-3]|\/)?$/.test(v) : /^([ABC]|\/)?$/.test(v);
    if (!ok) throw appError_(isHy ? '評定は 1・2・3 か ‐（評価できない）にしてください。' : '評価は A・B・C か ‐（評価できない）にしてください。');
    var out = { studentEmail: e, subject: sub.name, term: term, field: field, value: v };
    if (c.base !== undefined && c.base !== null) out.base = String(c.base).slice(0, 4);
    return out;
  });
}

function validateShokenItems_(items, students, terms) {
  checkArray_(items, MAX_CHANGES);
  var termsOk = terms.concat([YEAR_TERM]);
  return items.map(function (it) {
    checkObject_(it);
    var e = normEmail_(it.studentEmail);
    if (students.indexOf(e) === -1) throw appError_('名簿にない児童です。');
    var term = String(it.term);
    if (termsOk.indexOf(term) === -1) throw appError_('時期が正しくありません。');
    return { studentEmail: e, term: term, text: checkText_(it.text, MAX_LEN.shoken, '所見', true) };
  });
}

/** 担任・担当の割り当ての検査。classes = [{classKey, homeroom, assistants:[]}]。 */
function normalizeAssignments_(classes, schoolClasses, staff) {
  checkArray_(classes, 100);
  var rows = [];
  classes.forEach(function (c) {
    checkObject_(c);
    var key = normClassKey_(c.classKey);
    if (schoolClasses.indexOf(key) === -1) throw appError_('名簿にないクラスです。');
    var hr = normEmail_(c.homeroom);
    if (hr) {
      if (staff.indexOf(hr) === -1) throw appError_('教職員の名簿にない先生です。');
      rows.push({ classKey: key, email: hr, role: ASSIGN_ROLE.homeroom });
    }
    checkArray_(c.assistants || [], MAX_ASSISTANTS).forEach(function (a) {
      var e = normEmail_(a);
      if (!e) return;
      if (staff.indexOf(e) === -1) throw appError_('教職員の名簿にない先生です。');
      if (e !== hr && !rows.some(function (r) { return r.classKey === key && r.email === e; })) rows.push({ classKey: key, email: e, role: ASSIGN_ROLE.assistant });
    });
  });
  return rows;
}

function newId_() { return Utilities.getUuid(); }

// ================= 名簿マスター =================

/** スプレッドシートの URL から ID を取り出す。取り出せなければ ''。 */
function sheetIdFromUrl_(url) {
  var u = String(url || '').trim();
  if (u.length > 500) return '';
  var m = /^https:\/\/docs\.google\.com\/spreadsheets\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{20,128})(?:[\/?#]|$)/.exec(u);
  return m ? m[1] : '';
}

/** 「学校」の列の値が、その学校のものか。「nr-435_大安寺西小学校」のような値は学校コードで、そうでなければ学校名で見る。 */
function schoolMatches_(cell, schoolId, schoolName) {
  var v = String(cell || '').trim();
  if (!v) return false;
  var m = /^[a-z]*-?(\d{3,})_/.exec(v);
  if (m && /^\d+$/.test(String(schoolId))) return m[1] === String(schoolId);
  var bare = function (x) { return String(x || '').replace(/^.*_/, '').replace(/^奈良市立?/, '').trim(); };
  return bare(v) !== '' && bare(v) === bare(schoolName);
}

/** 「状態」の値が在籍・在職か（「active,multi」のようにカンマで続くことがある）。 */
function isActiveStatus_(v, list) {
  return String(v || '').split(/[,、]/).some(function (x) { return list.indexOf(x.trim()) !== -1; });
}

/**
 * 名簿マスターの「児童生徒」「教職員」シート（表示値の2次元配列、1行目が見出し）から、
 * その学校の行の、決まった列だけを抜き出す。見出しが足りなければ断る。
 */
function parseRosterMaster_(stuValues, staffValues, schoolId, schoolName, at) {
  function cols(values, want, what) {
    var head = (values[0] || []).map(function (h) { return String(h).trim(); });
    var idx = {};
    Object.keys(want).forEach(function (k) {
      var i = head.indexOf(want[k]);
      if (i === -1) throw appError_('名簿マスターの「' + what + '」シートに「' + want[k] + '」の列が見つかりません。');
      idx[k] = i;
    });
    return idx;
  }
  var si = cols(stuValues, MASTER_STUDENT_COLS, '児童生徒');
  var ti = cols(staffValues, MASTER_STAFF_COLS, '教職員');
  var roster = [], staff = [];
  stuValues.slice(1).forEach(function (r) {
    if (!schoolMatches_(r[si.school], schoolId, schoolName)) return;
    var email = normEmail_(r[si.email]);
    if (!/^[^@\s]+@[^@\s]+$/.test(email)) return;
    var name = (String(r[si.family] || '').trim() + ' ' + String(r[si.given] || '').trim()).trim();
    roster.push({ schoolId: String(schoolId), email: email, name: name, grade: toHalf_(r[si.grade]), classNo: toHalf_(r[si.classNo]),
      number: toHalf_(r[si.number]), status: isActiveStatus_(r[si.status], ENROLLED_STATUS) ? 'active' : String(r[si.status] || '').trim(), importedAt: at });
  });
  staffValues.slice(1).forEach(function (r) {
    if (!schoolMatches_(r[ti.school], schoolId, schoolName)) return;
    var email = normEmail_(r[ti.email]);
    if (!/^[^@\s]+@[^@\s]+$/.test(email)) return;
    var name = (String(r[ti.family] || '').trim() + ' ' + String(r[ti.given] || '').trim()).trim();
    staff.push({ schoolId: String(schoolId), email: email, name: name, title: String(r[ti.title] || '').trim(),
      status: isActiveStatus_(r[ti.status], STAFF_ACTIVE_STATUS) ? 'active' : String(r[ti.status] || '').trim(), importedAt: at });
  });
  return { roster: roster, staff: staff };
}

// ================= 評価の基準・評定の表 =================

/** 評価の基準の検査。input = { kanten: { 観点: {a, b} }, unit: {a, b} }。a = A になる %（以上）、b = C になる %（未満）。 */
function validateCriteria_(input, subjectConf) {
  checkObject_(input);
  function pair(v, what) {
    checkObject_(v);
    var a = checkInt_(v.a, 1, 100, what + 'のA'), b = checkInt_(v.b, 0, 100, what + 'のC');
    if (b >= a) throw appError_(what + 'の「C になる %」は、「A になる %」より小さくしてください。');
    return { a: a, b: b };
  }
  var allowed = subjectConf.kanten.filter(function (k) { return k.test && !k.into; }).map(function (k) { return k.label; });
  var kanten = {};
  Object.keys(checkObject_(input.kanten || {}) || {}).forEach(function (l) {
    if (allowed.indexOf(l) === -1) throw appError_('「' + l + '」は、この教科でテストの点をつける観点ではありません。');
    kanten[l] = pair(input.kanten[l], l);
  });
  return { kanten: kanten, unit: pair(input.unit, 'テストの評価') };
}

/** 観点が n 個のときの組み合わせ（並びは関係なし）。Logic.html の SL.combosOf と同じ。 */
function combosOf_(n) {
  var out = [], abc = ['A', 'B', 'C'];
  (function walk(prefix, from) {
    if (prefix.length === n) { out.push(prefix); return; }
    for (var i = from; i < 3; i++) walk(prefix + abc[i], i);
  })('', 0);
  return out;
}

/** 評定の表の検査。rule = { AAA: '3', AAB: '2', ... }（その教科の観点の数の組み合わせが全部そろっていること）。 */
function validateHyoteiRule_(rule, subjectConf) {
  checkObject_(rule);
  var n = subjectConf.kanten.filter(function (k) { return !k.into; }).length;
  var out = {};
  combosOf_(n).forEach(function (k) {
    var v = toHalf_(rule[k]);
    if (!/^[1-3]$/.test(v)) throw appError_('評定の表の「' + k + '」に 1・2・3 のどれかを入れてください。');
    out[k] = v;
  });
  if (Object.keys(rule).some(function (k) { return !(k in out); })) throw appError_('評定の表の形が正しくありません。');
  return out;
}
