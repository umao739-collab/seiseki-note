/**
 * SmileReader.gs — SMILEスプレッドシート（青葉出版）を読む層。
 *
 * ★SMILEファイルの中身は書きかえない。読むのは「メニュー」と教科のシートだけ。
 *   書くのは、所見を保存するときの「所見メモ（せいせきノート）」シートだけ（ほかのシートには触らない）。
 * ★セルの位置は決め打ちしない。見出しの文字（「単元名／観点」「学級平均」「単元合計」「単元評価」）を探して読む。
 *   SMILE がバージョンアップで列を足しても、見出しが同じなら読める。
 * ★画面に返すのは、番号・名前・点数・配点・評価だけ（校務連携CDなどは返さない）。
 */

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
    for (var i = 0; i < MAX_STUDENTS; i++) {
      var name = cell_(values, head + 1 + i, 2);
      if (!name || name.charAt(0) === '#') continue;
      var no = toScore_(cell_(values, head + 1 + i, 1));
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
      var n = toScore_(row[d]);
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
        var max = toScore_(cell_(values, r + 2, j));
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
          scores.push(kanten.map(function (kt) { return toScore_(cell_(values, start + i, kt.col)); }));
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
function sortTerms_(labels) {
  var order = ['1学期', '2学期', '3学期', '前期', '後期'];
  return labels.slice().sort(function (x, y) {
    var a = order.indexOf(x), b = order.indexOf(y);
    return (a === -1 ? 99 : a) - (b === -1 ? 99 : b);
  });
}

/** 開いたSMILEファイルを読んで、画面に渡す形にする。 */
function readSmile_(ss) {
  var menuSheet = ss.getSheetByName(MENU_SHEET);
  var menu = parseMenu_(menuSheet.getRange(1, 1, Math.min(60, menuSheet.getMaxRows()), Math.min(11, menuSheet.getMaxColumns())).getDisplayValues());
  var nRows = menu.students.reduce(function (m, s) { return Math.max(m, s.idx + 1); }, 0);
  var subjects = [];
  var termSet = {};
  SUBJECTS.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 10) return;
    var values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getDisplayValues();
    var s = parseSubject_(name, values, nRows);
    if (!s.units.length) return;
    s.units.forEach(function (u) { termSet[u.term] = true; });
    subjects.push(s);
  });
  return {
    source: 'file',
    fileName: ss.getName(),
    meta: menu.meta,
    termLabels: sortTerms_(Object.keys(termSet)),
    students: menu.students,
    subjects: subjects,
    shoken: readShoken_(ss)
  };
}

/** 保存してある所見を { '番号|時期': { text, at } } で返す。 */
function readShoken_(ss) {
  var sh = ss.getSheetByName(SHOKEN_SHEET);
  var out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, SHOKEN_HEADER.length).getDisplayValues().forEach(function (r) {
    var no = toScore_(r[0]);
    if (no === null || !TERM_RE.test(r[2])) return;
    out[no + '|' + r[2]] = { text: String(r[3] || ''), at: String(r[4] || '') };
  });
  return out;
}

/**
 * 所見を先生のSMILEファイルの「所見メモ」シートに書く（同じ番号・時期の行は書きかえる）。
 * 名前は画面から受け取らず、メニューの名簿から引く。
 */
function writeShoken_(ss, items, students, now) {
  var nameOf = {};
  students.forEach(function (s) { nameOf[s.no] = s.name; });
  var lock = LockService.getUserLock();
  try { lock.waitLock(15000); } catch (e) { throw appError_('保存が混み合っています。少し待ってから、もう一度ためしてください。'); }
  try {
    var sh = ss.getSheetByName(SHOKEN_SHEET);
    if (!sh) {
      sh = ss.insertSheet(SHOKEN_SHEET, ss.getSheets().length);
      sh.getRange(1, 1, sh.getMaxRows(), SHOKEN_HEADER.length).setNumberFormat('@');
      sh.getRange(1, 1, 1, SHOKEN_HEADER.length).setValues([SHOKEN_HEADER]).setFontWeight('bold').setBackground('#FFE8D6');
      sh.setFrozenRows(1);
      sh.setColumnWidth(4, 520);
      sh.getRange(1, 4, sh.getMaxRows(), 1).setWrap(true);
    }
    var rows = sh.getLastRow() >= 2 ? sh.getRange(2, 1, sh.getLastRow() - 1, SHOKEN_HEADER.length).getDisplayValues() : [];
    var at = {};
    rows.forEach(function (r, i) { at[toScore_(r[0]) + '|' + r[2]] = i; });
    items.forEach(function (it) {
      var row = [String(it.no), nameOf[it.no] || '', it.term, it.text, now];
      var i = at[it.no + '|' + it.term];
      if (i === undefined) { at[it.no + '|' + it.term] = rows.length; rows.push(row); } else rows[i] = row;
    });
    rows.sort(function (x, y) { return Number(x[0]) - Number(y[0]) || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0); });
    if (rows.length) {
      if (rows.length + 1 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), rows.length + 1 - sh.getMaxRows());
      sh.getRange(2, 1, rows.length, SHOKEN_HEADER.length).setNumberFormat('@')
        .setValues(rows.map(function (r) { return r.map(escapeFormula_); }));
    }
  } finally {
    lock.releaseLock();
  }
}
