/**
 * Store.gs — スプレッドシート（マスタ・年度データ）を読み書きする唯一の層。（ふりかえりシート他校版の Store.gs と同じ作り）
 *
 *  - シートが無ければ作り、全列をテキスト書式（@）にする
 *  - 書き込みは LockService の中で setValues だけを使う（appendRow は使わない）
 *  - 書く値はすべて escapeFormula_ を通す（先頭が = + - @ ' の文字列を数式にしない）
 *  - 読み込みは getDisplayValues（文字列）。同じ実行の中ではメモを使い、書いたら捨てる
 *  - fileId は呼び出し側が Directory から引いたものだけを渡す（画面からは受け取らない）
 */
var Store = (function () {
  var _memo = {};
  var GROW_ROWS = 200;
  function _schemaOf(sheetName) {
    var keys = Object.keys(CLASS_SHEETS);
    for (var i = 0; i < keys.length; i++) {
      if (sheetName.indexOf(CLASS_SHEETS[keys[i]]) === 0) return SCHEMA[keys[i]];
    }
    return SCHEMA[sheetName];
  }
  function classSheet(kind, classKey) { return CLASS_SHEETS[kind] + classKey; }
  function _ss(fileId) { return SpreadsheetApp.openById(fileId); }
  function _ensureSheet(ss, name) {
    var cols = _schemaOf(name);
    var sh = ss.getSheetByName(name);
    if (sh) return sh;
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, cols.length).setValues([cols]);
    sh.setFrozenRows(1);
    return sh;
  }
  function _read(fileId, name) {
    var key = fileId + '|' + name;
    if (_memo[key]) return _memo[key];
    var cols = _schemaOf(name);
    var sh = _ss(fileId).getSheetByName(name);
    var out = [];
    if (sh && sh.getLastRow() >= 2) {
      var values = sh.getRange(2, 1, sh.getLastRow() - 1, cols.length).getDisplayValues();
      for (var r = 0; r < values.length; r++) {
        if (values[r].join('') === '') continue;
        var obj = {};
        for (var c = 0; c < cols.length; c++) obj[cols[c]] = values[r][c];
        out.push({ obj: obj, row: r + 2 });
      }
    }
    _memo[key] = out;
    return out;
  }
  function list(fileId, name, filterFn) {
    return _read(fileId, name).map(function (x) { return x.obj; }).filter(filterFn || function () { return true; });
  }
  function _toRow(cols, obj) {
    return cols.map(function (k) { return escapeFormula_(obj[k] === null || obj[k] === undefined ? '' : String(obj[k])); });
  }
  function withLock(fn) {
    var lock = LockService.getScriptLock();
    try { lock.waitLock(20000); } catch (e) { throw appError_('混み合っています。少し待ってから、もう一度ためしてください。'); }
    try { return fn(); } finally { lock.releaseLock(); }
  }
  function _grow(sh, need, width) {
    var max = sh.getMaxRows();
    if (need <= max) return;
    var add = Math.max(GROW_ROWS, need - max);
    sh.insertRowsAfter(max, add);
    sh.getRange(max + 1, 1, add, width).setNumberFormat('@');
  }
  function _writeRows(sh, writes, width) {
    writes.sort(function (a, b) { return a.row - b.row; });
    var i = 0;
    while (i < writes.length) {
      var j = i;
      while (j + 1 < writes.length && writes[j + 1].row === writes[j].row + 1) j++;
      var block = writes.slice(i, j + 1).map(function (w) { return w.values; });
      sh.getRange(writes[i].row, 1, block.length, width).setNumberFormat('@').setValues(block);
      i = j + 1;
    }
  }
  /**
   * keyOf(obj) が同じ行は書き換え、無ければ末尾に足す。ロックの中で読み直してから書く。
   * merge(old, next) を渡すと、既にある行と合わせた行を書く（old は無ければ null）。
   */
  function upsert(fileId, name, keyOf, items, merge) {
    if (!items.length) return [];
    return withLock(function () {
      var cols = _schemaOf(name);
      var sh = _ensureSheet(_ss(fileId), name);
      delete _memo[fileId + '|' + name];
      var byKey = {};
      _read(fileId, name).forEach(function (x) { byKey[keyOf(x.obj)] = x; });
      var next = sh.getLastRow() + 1;
      var writes = [];
      var saved = items.map(function (it) {
        var hit = byKey[keyOf(it)];
        var obj = merge ? merge(hit ? hit.obj : null, it) : it;
        var row = hit ? hit.row : next++;
        if (hit) hit.obj = obj; else byKey[keyOf(it)] = { obj: obj, row: row };
        writes.push({ row: row, values: _toRow(cols, obj) });
        return obj;
      });
      _grow(sh, next - 1, cols.length);
      _writeRows(sh, writes, cols.length);
      delete _memo[fileId + '|' + name];
      return saved;
    });
  }
  /** dropFn に合う行を消し、items を足す。シートの中身をまるごと書き直す。 */
  function replaceWhere(fileId, name, dropFn, items) {
    return withLock(function () {
      var cols = _schemaOf(name);
      var sh = _ensureSheet(_ss(fileId), name);
      delete _memo[fileId + '|' + name];
      var keep = _read(fileId, name).map(function (x) { return x.obj; }).filter(function (o) { return !dropFn(o); });
      var all = keep.concat(items);
      var last = sh.getLastRow();
      if (last >= 2) sh.getRange(2, 1, last - 1, cols.length).clearContent();
      if (all.length) {
        _grow(sh, all.length + 1, cols.length);
        sh.getRange(2, 1, all.length, cols.length).setNumberFormat('@').setValues(all.map(function (o) { return _toRow(cols, o); }));
      }
      delete _memo[fileId + '|' + name];
      return items;
    });
  }
  function forget() { _memo = {}; }
  return { classSheet: classSheet, list: list, upsert: upsert, replaceWhere: replaceWhere, forget: forget, withLock: withLock, ensureSheet: _ensureSheet };
})();

/** シートが無ければ作り、全列テキスト書式＋ヘッダ。列が足りなければ右に書き足す。 */
function ensureSheetWithHeader_(ss, name, schema) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, sh.getMaxRows(), schema.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, schema.length).setValues([schema]);
    sh.setFrozenRows(1);
    return sh;
  }
  var header = sh.getRange(1, 1, 1, schema.length).getDisplayValues()[0];
  var have = 0;
  while (have < schema.length && header[have] === schema[have]) have++;
  if (have < schema.length && header.slice(have).every(function (v) { return v === ''; })) {
    sh.getRange(1, have + 1, sh.getMaxRows(), schema.length - have).setNumberFormat('@');
    sh.getRange(1, have + 1, 1, schema.length - have).setValues([schema.slice(have)]);
  }
  return sh;
}
function writeRows_(sh, rows) {
  if (!rows.length) return;
  var start = sh.getLastRow() + 1;
  var need = start + rows.length - 1;
  if (need > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
  sh.getRange(start, 1, rows.length, rows[0].length).setNumberFormat('@').setValues(rows.map(function (r) { return r.map(escapeFormula_); }));
}
function upsertRow_(sh, matchFn, row) {
  var values = sh.getDataRange().getDisplayValues();
  for (var r = 1; r < values.length; r++) {
    if (!matchFn(values[r])) continue;
    sh.getRange(r + 1, 1, 1, row.length).setNumberFormat('@').setValues([row.map(escapeFormula_)]);
    return;
  }
  writeRows_(sh, [row]);
}
