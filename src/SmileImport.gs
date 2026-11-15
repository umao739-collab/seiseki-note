/**
 * SmileImport.gs — 青葉出版「SMILEスプレッドシート」から、テスト（単元名・配点）と点数を取りこむ（移しかえ用）。
 *
 * ★SMILE ファイルは読むだけ。書きかえない。読むのは「メニュー」と教科のシートの見出し・点数のセルだけ。
 * ★セルの位置は決め打ちせず、見出しの文字（「単元名／観点」「学級平均」「単元合計」「単元評価」）を探して読む。
 * ★子どもは、SMILE の名簿（番号・名前）とアプリの名簿（名簿マスター）を番号と名前で照らし合わせる。
 *   名前が合わない子・アプリの名簿にいない子には、何も入れない（まちがった子に点数が入らないように）。
 * ★SMILE の「メニュー」の学年・組が、取りこみ先のクラスとちがうときは断る。
 * ★アプリはアプリ管理者の権限で動くので、アプリ管理者のアカウントで見られる SMILE ファイルだけが読める。
 */
var SMILE_MAX_STUDENTS_ = 45;
var SMILE_SUBJECTS_ = ['国語', '社会', '算数', '理科', '生活', '音楽', '図工', '家庭', '体育', '外国語'];

/** 点数として読めれば数、読めなければ null（空・「欠」・#REF! など）。 */
function smileScore_(v) {
  var s = toHalf_(v);
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  var n = Number(s);
  return isFinite(n) && n >= 0 ? n : null;
}
var UNIT_HEAD_ = '単元名／観点';
var AVG_HEAD_ = '学級平均';
var TOTAL_HEAD_ = '単元合計';
var EVAL_HEAD_ = '単元評価';
var DEFAULT_TH_ = { a: 80, b: 50 };

function cell_(values, r, c) {
  var row = values[r];
  if (!row || c >= row.length) return '';
  return String(row[c] === null || row[c] === undefined ? '' : row[c]).trim();
}

/** メニューシート（A1:K60 の表示値）から、クラスの情報と名簿を読む。 */
function parseMenu_(values) {
  var meta = {
    region: cell_(values, 0, 3),
    termSystem: cell_(values, 0, 4),
    grade: toHalf_(cell_(values, 0, 5)),
    className: toHalf_(cell_(values, 0, 7)),
    teacher: cell_(values, 1, 7)
  };
  var head = -1;
  for (var r = 0; r < values.length; r++) {
    if (cell_(values, r, 1) === '№' && cell_(values, r, 2) === '名前') { head = r; break; }
  }
  var students = [];
  if (head !== -1) {
    for (var i = 0; i < SMILE_MAX_STUDENTS_; i++) {
      var name = cell_(values, head + 1 + i, 2);
      if (!name || name.charAt(0) === '#') continue;
      var no = smileScore_(cell_(values, head + 1 + i, 1));
      students.push({ idx: i, no: no === null ? i + 1 : no, name: name });
    }
  }
  return { meta: meta, students: students };
}

/** 「【1学期】」の行を上に探して、時期の名前を返す（見つからなければ n番目）。 */
function termLabelAbove_(values, r, n) {
  for (var k = 1; k <= 4 && r - k >= 0; k++) {
    var m = /【(.+?)】/.exec(toHalf_(cell_(values, r - k, 1)));
    if (m) return m[1];
  }
  return (n + 1) + '学期';
}

/** 行の中の「A=」「B=」のすぐ右の数を読む（limit の列より左だけ）。 */
function thresholdIn_(values, r, key, limit) {
  var row = values[r] || [];
  for (var c = 0; c < Math.min(row.length, limit); c++) {
    if (toHalf_(row[c]).replace(/\s/g, '') !== key + '=') continue;
    for (var d = c + 1; d < Math.min(row.length, c + 4); d++) {
      var n = smileScore_(row[d]);
      if (n !== null) return n;
    }
  }
  return null;
}

/**
 * 教科のシート（表示値の2次元配列）から、学期ごとの単元・観点・配点・点数を読む。
 * nStudents 人ぶんの行を読む（メニューの名簿の行と同じ並び）。
 */
function parseSubject_(name, values, nStudents) {
  var units = [];
  var thresholds = {};
  var termNo = 0;
  for (var r = 0; r < values.length; r++) {
    if (cell_(values, r, 1) !== UNIT_HEAD_) continue;
    var term = termLabelAbove_(values, r, termNo++);
    var row = values[r];
    // 右側の「得点集計表」は2つめの「単元名／観点」から始まる。そこから右は読まない
    var limit = row.length;
    for (var c2 = 2; c2 < row.length; c2++) {
      if (cell_(values, r, c2) === UNIT_HEAD_) { limit = c2; break; }
    }
    var a = thresholdIn_(values, r - 2, 'A', limit), b = thresholdIn_(values, r - 1, 'B', limit);
    thresholds[term] = { a: a === null ? DEFAULT_TH_.a : a, b: b === null ? DEFAULT_TH_.b : b };
    var avgRow = -1;
    for (var k = 1; k <= 6; k++) {
      if (cell_(values, r + k, 1) === AVG_HEAD_) { avgRow = r + k; break; }
    }
    if (avgRow === -1) continue;
    var start = avgRow + 1;
    var c = 3;
    while (c < limit) {
      var kanten = [];
      var j = c;
      while (j < limit && cell_(values, r + 1, j) !== TOTAL_HEAD_) {
        var label = cell_(values, r + 1, j);
        var max = smileScore_(cell_(values, r + 2, j));
        if (label && max !== null && max > 0) kanten.push({ label: label, max: max, col: j });
        j++;
      }
      if (j >= limit) break;
      var evalCol = -1;
      for (var e = j; e < Math.min(limit, j + 4); e++) {
        if (cell_(values, r + 1, e) === EVAL_HEAD_) { evalCol = e; break; }
      }
      var unitName = cell_(values, r, c);
      if (unitName && kanten.length) {
        var scores = [], evals = [];
        for (var i = 0; i < nStudents; i++) {
          scores.push(kanten.map(function (kt) { return smileScore_(cell_(values, start + i, kt.col)); }));
          var ev = evalCol === -1 ? '' : toHalf_(cell_(values, start + i, evalCol)).toUpperCase();
          evals.push(/^[ABC]$/.test(ev) ? ev : '');
        }
        units.push({
          term: term, name: unitName,
          kanten: kanten.map(function (kt) { return { label: kt.label, max: kt.max }; }),
          scores: scores, evals: evals
        });
      }
      c = (evalCol === -1 ? j + 2 : evalCol) + 1;
    }
  }
  return { name: name, thresholds: thresholds, units: units };
}

/** 時期の並び（1学期→2学期→3学期／前期→後期）。 */

/** 名前の空白をのぞいてくらべる。 */
var NAME_VARIANTS_ = { '髙': '高', '﨑': '崎', '嵜': '崎', '𠮷': '吉', '德': '徳', '濵': '浜', '濱': '浜', '邊': '辺', '邉': '辺', '齋': '斉', '齊': '斉', '斎': '斉', '櫻': '桜', '澤': '沢', '廣': '広', '國': '国', '龍': '竜', '眞': '真', '瀨': '瀬', '惠': '恵', '槇': '槙', '冨': '富', '條': '条', '藪': '薮', '﨔': '欅' };
function bareName_(s) {
  var t = String(s || '');
  if (t.normalize) t = t.normalize('NFKC');
  // 見えない字（異体字セレクタ・ゼロ幅の字）をのぞく。名簿の書き出しでよく付いてくる。
  t = t.replace(/[\uFE00-\uFE0F\u200B-\u200D\u2060\uFEFF]|\uDB40[\uDD00-\uDDEF]/g, '');
  t = t.replace(/[\s　・･]/g, '');
  return Array.from ? Array.from(t).map(function (ch) { return NAME_VARIANTS_[ch] || ch; }).join('') : t;
}

/**
 * 読んだ SMILE の中身から、取りこむ計画を作る（純粋関数）。
 * menu = parseMenu_ の結果、parsed = parseSubject_ の結果の配列。
 * roster = [{email, number, name}]（そのクラスのアプリの名簿）、subjects = 学年の教科、terms = 学校の学期。
 */
function smilePlan_(menu, parsed, classKey, roster, subjects, terms) {
  var g = Number(toHalf_(menu.meta.grade).replace(/[^0-9]/g, ''));
  var c = toHalf_(menu.meta.className).replace(/組/g, '').trim();
  var key = normClassKey_(g + '-' + c);
  if (!key) throw appError_('SMILE ファイルの「メニュー」に、学年・組が見つかりませんでした。');
  if (key !== classKey) throw appError_('この SMILE ファイルは「' + classLabel_(key) + '」のものです。' + classLabel_(classKey) + 'には取りこめません。');
  // 名前で照らし合わせる（転校などで番号がずれても合うように）。同じ名前が2人いるときだけ番号で決める。
  // 同じ名前が何人かいるときは、どちらも番号の小さい順に1人ずつ合わせる（番号がずれても順番は変わらないため）。
  var byName = {}, smileCount = {}, smileSeen = {}, used = {};
  roster.slice().sort(function (a, b) { return Number(a.number) - Number(b.number); })
    .forEach(function (r) { var k = bareName_(r.name); (byName[k] = byName[k] || []).push(r); });
  menu.students.forEach(function (st) { var k = bareName_(st.name); smileCount[k] = (smileCount[k] || 0) + 1; });
  var map = {}, mismatch = [], missing = [], moved = [], left = [], matched = 0;
  menu.students.forEach(function (st) {
    var k = bareName_(st.name), cands = byName[k] || [], r = null;
    var nth = smileSeen[k] = (smileSeen[k] || 0) + 1;
    if (cands.length === 1 && smileCount[k] === 1) r = cands[0];
    else if (cands.length > 0 && cands.length === smileCount[k]) r = cands[nth - 1];
    else if (cands.length > 0) r = cands.filter(function (x) { return Number(x.number) === Number(st.no); })[0] || null;
    if (r && used[r.email]) r = null;
    if (!r) { left.push(st); return; }
    used[r.email] = true;
    if (Number(r.number) !== Number(st.no)) moved.push({ no: st.no, smileName: st.name, rosterNo: r.number });
    map[st.idx] = r.email;
    matched++;
  });
  // 名前で合わなかった子：同じ番号の名簿の子もまだ合っていなければ「名前が合わない」、それ以外は「名簿にいない」（転校など）。
  left.forEach(function (st) {
    var same = roster.filter(function (x) { return Number(x.number) === Number(st.no) && !used[x.email]; })[0];
    if (same) mismatch.push({ no: st.no, smileName: st.name, rosterName: same.name });
    else missing.push({ no: st.no, smileName: st.name });
  });
  var tests = [], skipped = [], thresholds = {};
  parsed.forEach(function (ps) {
    var sub = subjects.filter(function (x) { return x.name === ps.name; })[0];
    if (!sub) { if (ps.units.length) skipped.push(ps.name + '（この学年の教科にありません）'); return; }
    var allowed = sub.kanten.filter(function (k) { return k.test; }).map(function (k) { return k.label; });
    ps.units.forEach(function (u) {
      if (terms.indexOf(u.term) === -1) { skipped.push(ps.name + '「' + u.name + '」（' + u.term + 'はこの学校の学期にありません）'); return; }
      var points = {};
      u.kanten.forEach(function (k) {
        if (allowed.indexOf(k.label) !== -1 && k.max >= 1 && k.max <= MAX_POINT) points[k.label] = Math.round(k.max);
        else if (allowed.indexOf(k.label) === -1) skipped.push(ps.name + '「' + u.name + '」の観点「' + k.label + '」（この教科の観点にありません）');
      });
      if (!Object.keys(points).length) return;
      var scores = {};
      u.scores.forEach(function (row, i) {
        var e = map[i];
        if (!e) return;
        var v = {};
        u.kanten.forEach(function (k, ki) {
          if (points[k.label] === undefined || row[ki] === null || row[ki] === undefined) return;
          v[k.label] = Math.min(row[ki], points[k.label]);
        });
        if (Object.keys(v).length) scores[e] = v;
      });
      tests.push({ subject: sub.name, term: u.term, name: String(u.name).trim().slice(0, MAX_LEN.testName), points: points, scores: scores });
    });
    Object.keys(ps.thresholds).forEach(function (t) {
      var th = ps.thresholds[t];
      if (terms.indexOf(t) !== -1 && th.a > th.b) thresholds[sub.name + '|' + t] = { a: Math.round(th.a), b: Math.round(th.b) };
    });
  });
  // 同じ教科・学期に同じ名前のテストがあれば、あとのほうに番号をつける
  var seen = {};
  tests.forEach(function (t) {
    var k = t.subject + '|' + t.term + '|' + t.name;
    if (seen[k]) { seen[k]++; t.name = (t.name + '（' + seen[k] + '）').slice(0, MAX_LEN.testName); } else seen[k] = 1;
  });
  return {
    label: classLabel_(key), tests: tests, thresholds: thresholds,
    students: { smile: menu.students.length, matched: matched, mismatch: mismatch, missing: missing, moved: moved },
    skipped: skipped
  };
}

/** SMILE ファイルを開いて読む（メニューと教科のシート）。 */
function readSmileFile_(url) {
  var id = sheetIdFromUrl_(url);
  if (!id) throw appError_('スプレッドシートのURLではないようです。SMILE ファイルのリンクをそのまま貼ってください。');
  var ss;
  try { ss = SpreadsheetApp.openById(id); } catch (e) {
    throw appError_('この SMILE ファイルを開けませんでした。アプリ管理者のアカウントで見られるファイルか、確かめてください。');
  }
  var menuSheet = ss.getSheetByName('メニュー');
  if (!menuSheet || String(menuSheet.getRange(1, 2).getDisplayValue()).indexOf('SMILE') === -1) throw appError_('SMILE スプレッドシートではないようです。');
  var menu = parseMenu_(menuSheet.getRange(1, 1, Math.min(60, menuSheet.getMaxRows()), Math.min(11, menuSheet.getMaxColumns())).getDisplayValues());
  var n = menu.students.reduce(function (m, s) { return Math.max(m, s.idx + 1); }, 0);
  var parsed = [];
  SMILE_SUBJECTS_.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 10) return;
    parsed.push(parseSubject_(name, sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getDisplayValues(), n));
  });
  return { menu: menu, parsed: parsed };
}

function smilePlanFor_(cc, url) {
  var r = readSmileFile_(url);
  var roster = cc.students.map(function (s) { return { email: s.email, number: s.number, name: s.name }; });
  return smilePlan_(r.menu, r.parsed, cc.classKey, roster, cc.subjects, cc.terms);
}

/** 取りこむ前に、何が入るかを見せる（名前・点数は返さない。合わない子の番号と名前だけ）。 */
function previewSmileImport(classKey, url, actingAs) {
  return guard_(function () {
    var ctx = getContext_(actingAs);
    var cc = classContext_(ctx, classKey);
    var plan = smilePlanFor_(cc, url);
    var groups = {};
    plan.tests.forEach(function (t) {
      var g = groups[t.subject] = groups[t.subject] || {};
      g[t.term] = (g[t.term] || 0) + 1;
    });
    return {
      label: plan.label,
      subjects: Object.keys(groups).map(function (s) { return { name: s, terms: cc.terms.filter(function (t) { return groups[s][t]; }).map(function (t) { return { term: t, tests: groups[s][t] }; }) }; }),
      tests: plan.tests.length,
      scores: plan.tests.reduce(function (a, t) { return a + Object.keys(t.scores).length; }, 0),
      students: plan.students, skipped: plan.skipped.slice(0, 30),
      thresholds: Object.keys(plan.thresholds).length
    };
  });
}

/**
 * SMILE から取りこむ。同じ教科・学期に同じ名前のテストがあれば配点を合わせて点数を上書きし、無ければ足す。
 * アプリにしかないテストと点数は消さない。withCriteria なら、SMILE の A・B の基準も評価の基準に入れる。
 */
function importSmile(classKey, url, withCriteria, actingAs) {
  return guard_(function () {
    var ctx = getContext_(actingAs);
    var cc = classContext_(ctx, classKey);
    var plan = smilePlanFor_(cc, url);
    if (!plan.tests.length) throw appError_('取りこめるテストがありませんでした。');
    var now = now_();
    var groups = {};
    plan.tests.forEach(function (t) { (groups[t.subject + '|' + t.term] = groups[t.subject + '|' + t.term] || []).push(t); });
    var scoreItems = [];
    Object.keys(groups).forEach(function (k) {
      var subject = k.split('|')[0], term = k.split('|')[1];
      var sub = cc.subjects.filter(function (x) { return x.name === subject; })[0];
      var have = testsOfClass_(cc.fileId, cc.classKey).filter(function (t) { return t.subject === subject && t.term === term; })
        .sort(function (a, b) { return a.order - b.order; });
      var list = have.map(function (t) { return { testId: t.testId, name: t.name, points: t.points }; });
      groups[k].forEach(function (t) {
        var same = list.filter(function (x) { return x.name === t.name; })[0];
        if (same) same.points = t.points; else list.push({ testId: '', name: t.name, points: t.points });
      });
      var v = validateTests_(list, sub);
      writeTests_(cc.fileId, cc.classKey, subject, term, v, ctx.me);
      groups[k].forEach(function (t) {
        var id = v.filter(function (x) { return x.name === t.name; })[0].testId;
        Object.keys(t.scores).forEach(function (e) { scoreItems.push({ key: id + '|' + e, testId: id, studentEmail: e, set: t.scores[e] }); });
      });
      if (withCriteria && plan.thresholds[k]) {
        var th = plan.thresholds[k], kanten = {};
        sub.kanten.forEach(function (x) { if (x.test && !x.into) kanten[x.label] = { a: th.a, b: th.b }; });
        writeCriteria_(cc.fileId, cc.classKey, subject, term, validateCriteria_({ kanten: kanten, unit: th }, sub), ctx.me);
      }
    });
    Store.upsert(cc.fileId, Store.classSheet('scores', cc.classKey), function (o) { return o.key; }, scoreItems, function (old, next) {
      var v = {};
      if (old) { try { v = JSON.parse(old.values); } catch (e) { v = {}; } }
      Object.keys(next.set).forEach(function (l) { v[l] = next.set[l]; });
      return { key: next.key, testId: next.testId, studentEmail: next.studentEmail, values: JSON.stringify(v), updatedAt: now, updatedBy: ctx.me };
    });
    return { tests: plan.tests.length, scores: scoreItems.length, students: plan.students.matched };
  });
}
