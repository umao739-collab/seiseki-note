/**
 * Directory.gs — マスタと、学校ごとの取り込み用名簿シートを読む層（読むだけ）。
 *
 * だれが「先生」か:
 *  - 取り込み用名簿シートの staff（教職員）に在職で入っている人、または teachers に登録された設定担当
 * だれが「設定担当」か（学校の全クラスを見られる・教科の設定や担任の割り当てができる）:
 *  - teachers に role=setup で登録された人（アプリ管理者が登録）
 *  - staff の役職が 校長・教頭・教務主任 の人
 * 先生が見られるクラス:
 *  - assignments で担任・担当に割り当てられたクラス（設定担当は学校の全クラス）
 * 児童はこのアプリにログインしない。名簿は「どの子の成績か」を決めるためだけに使う。
 */
var Directory = (function () {
  var _cache = null;
  function clear() { _cache = null; }
  function _rows(ss, name) {
    var sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return [];
    var cols = SCHEMA[name];
    return sh.getRange(2, 1, sh.getLastRow() - 1, cols.length).getDisplayValues()
      .filter(function (r) { return r.join('') !== ''; })
      .map(function (r) { var o = {}; cols.forEach(function (k, i) { o[k] = String(r[i]).trim(); }); return o; });
  }
  function _load() {
    if (_cache) return _cache;
    var master = SpreadsheetApp.openById(getMasterId_());
    var c = {};
    MASTER_SHEETS.forEach(function (n) { c[n] = _rows(master, n); });
    c.roster = {}; c.staff = {};
    c.schoolRosters.forEach(function (x) {
      try {
        var ss = SpreadsheetApp.openById(x.spreadsheetId);
        var r = ss.getSheetByName('roster'), s = ss.getSheetByName('staff');
        c.roster[x.schoolId] = r ? _sheetRows(r, SCHEMA.schoolRoster).filter(function (o) { return o.schoolId === x.schoolId; }) : [];
        c.staff[x.schoolId] = s ? _sheetRows(s, SCHEMA.schoolStaff).filter(function (o) { return o.schoolId === x.schoolId; }) : [];
      } catch (e) {
        console.error('取り込み用名簿シートを開けませんでした: ' + x.schoolId);
        c.roster[x.schoolId] = []; c.staff[x.schoolId] = [];
      }
    });
    _cache = c;
    return c;
  }
  function _sheetRows(sh, cols) {
    if (sh.getLastRow() < 2) return [];
    return sh.getRange(2, 1, sh.getLastRow() - 1, cols.length).getDisplayValues()
      .filter(function (r) { return r.join('') !== ''; })
      .map(function (r) { var o = {}; cols.forEach(function (k, i) { o[k] = String(r[i]).trim(); }); return o; });
  }
  function isActive(v) { return String(v).toUpperCase() !== 'FALSE'; }
  function listSchools() { return _load().schools; }
  function getSchool(schoolId) {
    var s = _load().schools.filter(function (x) { return x.schoolId === schoolId; })[0];
    if (!s) return null;
    return { schoolId: s.schoolId, schoolName: s.schoolName, active: isActive(s.active), termSystem: TERM_LABELS[s.termSystem] ? s.termSystem : '3学期制' };
  }
  function _enrolled(o) { return ENROLLED_STATUS.indexOf(o.status) !== -1; }
  /** その学校の在籍の児童（クラス・番号順）。 */
  function listStudents(schoolId) {
    return (_load().roster[schoolId] || []).filter(_enrolled).map(function (o) {
      return { email: normEmail_(o.email), name: o.name, grade: toHalf_(o.grade), classNo: toHalf_(o.classNo), number: Number(toHalf_(o.number)) || 0,
        classKey: normClassKey_(toHalf_(o.grade) + '-' + toHalf_(o.classNo)) };
    }).filter(function (s) { return s.email && s.classKey; });
  }
  function listClassStudents(schoolId, classKey) {
    return listStudents(schoolId).filter(function (s) { return s.classKey === classKey; })
      .sort(function (a, b) { return a.number - b.number; });
  }
  /** 名簿にあるクラスの一覧（学年・組の順）。 */
  function listSchoolClasses(schoolId) {
    var seen = {};
    listStudents(schoolId).forEach(function (s) { seen[s.classKey] = (seen[s.classKey] || 0) + 1; });
    return Object.keys(seen).sort(function (a, b) {
      return (gradeOf_(a) - gradeOf_(b)) || (a < b ? -1 : a > b ? 1 : 0);
    }).map(function (k) { return { classKey: k, count: seen[k] }; });
  }
  function listStaff(schoolId) {
    return (_load().staff[schoolId] || []).filter(function (o) { return STAFF_ACTIVE_STATUS.indexOf(o.status) !== -1; })
      .map(function (o) { return { email: normEmail_(o.email), name: o.name, title: o.title }; });
  }
  function _setupRows(email) {
    return _load().teachers.filter(function (t) { return normEmail_(t.email) === email && isActive(t.active) && t.role === 'setup'; });
  }
  /** メールから先生を決める。決められない・2校にまたがる時は null（拒否）。 */
  function resolveActor(email) {
    var e = normEmail_(email);
    if (!e) return null;
    var c = _load();
    var schools = {};
    _setupRows(e).forEach(function (t) { schools[t.schoolId] = true; });
    Object.keys(c.staff).forEach(function (sid) {
      if (listStaff(sid).some(function (x) { return x.email === e; })) schools[sid] = true;
    });
    var ids = Object.keys(schools).filter(function (sid) { var s = getSchool(sid); return s && s.active; });
    if (ids.length !== 1) return null;
    var sid = ids[0];
    // 児童の名簿にあるメールは先生にしない（とりちがえ防止）
    if (listStudents(sid).some(function (s) { return s.email === e; })) return null;
    var staff = listStaff(sid).filter(function (x) { return x.email === e; })[0];
    var isSetup = _setupRows(e).some(function (t) { return t.schoolId === sid; }) || !!(staff && SETUP_TITLES.indexOf(staff.title) !== -1);
    var name = staff ? staff.name : (_setupRows(e)[0] || {}).name || e;
    var classes = isSetup ? listSchoolClasses(sid).map(function (x) { return x.classKey; })
      : c.assignments.filter(function (a) { return a.schoolId === sid && normEmail_(a.email) === e; }).map(function (a) { return a.classKey; });
    var have = listSchoolClasses(sid).map(function (x) { return x.classKey; });
    classes = classes.filter(function (k, i) { return have.indexOf(k) !== -1 && classes.indexOf(k) === i; })
      .sort(function (a, b) { return have.indexOf(a) - have.indexOf(b); });
    return { role: 'teacher', email: e, name: name, schoolId: sid, isSetup: isSetup, classes: classes };
  }
  function listAssignments(schoolId) { return _load().assignments.filter(function (a) { return a.schoolId === schoolId; }); }
  function getOpenDataFileId(schoolId, fy) {
    var r = _load().dataFiles.filter(function (x) { return x.schoolId === schoolId && x.fiscalYear === String(fy) && x.status === DATA_STATUS.open; })[0];
    return r ? r.spreadsheetId : '';
  }
  function listDataFiles() { return _load().dataFiles; }
  function getSchoolRosterId(schoolId) {
    var r = _load().schoolRosters.filter(function (x) { return x.schoolId === schoolId; })[0];
    return r ? r.spreadsheetId : '';
  }
  function listSetupTeacherEmails(schoolId) {
    var out = _load().teachers.filter(function (t) { return t.schoolId === schoolId && t.role === 'setup' && isActive(t.active); }).map(function (t) { return normEmail_(t.email); });
    listStaff(schoolId).forEach(function (x) { if (SETUP_TITLES.indexOf(x.title) !== -1 && out.indexOf(x.email) === -1) out.push(x.email); });
    return out;
  }
  function isRosterEmail(email) {
    var e = normEmail_(email);
    return Object.keys(_load().roster).some(function (sid) { return listStudents(sid).some(function (s) { return s.email === e; }); });
  }
  return {
    clear: clear, listSchools: listSchools, getSchool: getSchool, isActive: isActive,
    listStudents: listStudents, listClassStudents: listClassStudents, listSchoolClasses: listSchoolClasses,
    listStaff: listStaff, resolveActor: resolveActor, listAssignments: listAssignments,
    getOpenDataFileId: getOpenDataFileId, listDataFiles: listDataFiles, getSchoolRosterId: getSchoolRosterId,
    listSetupTeacherEmails: listSetupTeacherEmails, isRosterEmail: isRosterEmail
  };
})();
