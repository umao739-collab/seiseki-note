/**
 * Rules.gs — 入力の検査と、文字・数のそろえ方（純粋関数）。
 *
 * シートや Session に触らない。tools/run-local-tests.js で Node からも試せる。
 */

function normEmail_(s) { return String(s === null || s === undefined ? '' : s).trim().toLowerCase(); }

/** 先頭が = + - @ ' の文字列は、シートで数式にならないように ' を付ける。 */
function escapeFormula_(s) {
  s = String(s === null || s === undefined ? '' : s);
  return /^[=+\-@']/.test(s) ? "'" + s : s;
}

/** 全角の数字・記号を半角にし、前後の空白を取る。 */
function toHalf_(v) {
  return String(v === null || v === undefined ? '' : v).trim()
    .replace(/[０-９．－]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
}

/** 点数として読めれば数、読めなければ null（空・「欠」・#REF! など）。 */
function toScore_(v) {
  var s = toHalf_(v);
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  var n = Number(s);
  return isFinite(n) && n >= 0 ? n : null;
}

/** Drive のファイル ID の形か。 */
function isFileId_(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{20,128}$/.test(id);
}

/** スプレッドシートの URL から ID を取り出す。取り出せなければ ''。 */
function fileIdFromUrl_(url) {
  var s = String(url || '').trim();
  if (s.length > MAX_LEN.url) return '';
  var m = /^https:\/\/docs\.google\.com\/spreadsheets\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{20,128})(?:[\/?#]|$)/.exec(s);
  return m ? m[1] : '';
}

/** 設定の検査。知らない項目は捨て、範囲の外は断る。 */
function validateSettings_(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw appError_('設定の形が正しくありません。');
  var out = {};
  Object.keys(SETTINGS_DEFAULT).forEach(function (k) { out[k] = SETTINGS_DEFAULT[k]; });
  ['strongRate', 'weakRate'].forEach(function (k) {
    if (input[k] === undefined) return;
    var n = Number(input[k]);
    var r = SETTINGS_RANGE[k];
    if (!isFinite(n) || Math.round(n) !== n || n < r[0] || n > r[1]) throw appError_('数の設定が範囲の外です。');
    out[k] = n;
  });
  if (out.weakRate >= out.strongRate) throw appError_('「のびしろ」の基準は、「とくい」の基準より小さくしてください。');
  if (input.shokenLength !== undefined) {
    if (SHOKEN_LENGTHS.indexOf(input.shokenLength) === -1) throw appError_('所見の長さの設定が正しくありません。');
    out.shokenLength = input.shokenLength;
  }
  ['showClassAvg', 'includeChallenge'].forEach(function (k) {
    if (input[k] === undefined) return;
    if (typeof input[k] !== 'boolean') throw appError_('設定の形が正しくありません。');
    out[k] = input[k];
  });
  return out;
}

/** 保存してある設定を読む（こわれていたら初期値）。 */
function parseSettings_(json) {
  try {
    return validateSettings_(JSON.parse(json || '{}'));
  } catch (e) {
    return validateSettings_({});
  }
}

/**
 * 所見の保存の検査。items = [{ no, term, text }]。
 * no は名簿にある番号だけ（validNos）、term は決まった書き方だけ、text は字数の上限まで。
 */
function validateShokenItems_(items, validNos) {
  if (!Array.isArray(items) || !items.length || items.length > MAX_SHOKEN_BATCH) throw appError_('保存する所見の形が正しくありません。');
  var seen = {};
  return items.map(function (it) {
    if (!it || typeof it !== 'object') throw appError_('保存する所見の形が正しくありません。');
    var no = Number(it.no);
    if (!isFinite(no) || Math.round(no) !== no || validNos.indexOf(no) === -1) throw appError_('名簿にない番号です。');
    var term = String(it.term || '');
    if (!TERM_RE.test(term)) throw appError_('時期の書き方が正しくありません。');
    var text = String(it.text === null || it.text === undefined ? '' : it.text).replace(/\r\n?/g, '\n');
    if (text.length > MAX_LEN.shoken) throw appError_('所見は' + MAX_LEN.shoken + '字までです。');
    var key = no + '|' + term;
    if (seen[key]) throw appError_('同じ子の同じ時期が2回入っています。');
    seen[key] = true;
    return { no: no, term: term, text: text };
  });
}
