/**
 * Setup.gs — エディタから実行する管理関数と、学校ごとの取り込み用名簿シート。（ふりかえりシート他校版の Setup.gs・SchoolRoster.gs と同じ考え方）
 *
 * ★GAS エディタで選べるのは末尾 `_` の無い関数だけなので、これらは公開関数になってしまう。
 *   そのため先頭で必ず requireOwner_() を呼ぶ（Webアプリ経由で先生が呼ぶと弾かれる）。
 */

/** マスタ・フォルダ・今年度データを作る（何度実行しても同じ結果）。実行した人をアプリ管理者にする。 */
function setup() {
  requireOwner_();
  var props = PropertiesService.getScriptProperties();
  var me = normEmail_(Session.getEffectiveUser().getEmail());
  var admins = String(props.getProperty(PROP.admins) || '').split(',').map(normEmail_).filter(String);
  if (admins.indexOf(me) === -1) { admins.push(me); props.setProperty(PROP.admins, admins.join(',')); }
  var folder = ensureFolder_();
  var masterId = props.getProperty(PROP.masterId);
  var master;
  if (masterId) master = SpreadsheetApp.openById(masterId);
  else {
    master = SpreadsheetApp.create(APP_TITLE + '_マスタ' + (isDemoMode_() ? '（デモ）' : ''));
    DriveApp.getFileById(master.getId()).moveTo(folder);
    props.setProperty(PROP.masterId, master.getId());
  }
  MASTER_SHEETS.forEach(function (name) { ensureSheetWithHeader_(master, name, SCHEMA[name]); });
  master.getSheets().forEach(function (s) {
    if (MASTER_SHEETS.indexOf(s.getName()) === -1 && master.getSheets().length > 1 && s.getLastRow() === 0) master.deleteSheet(s);
  });
  Directory.clear();
  var n = startFiscalYear_(fiscalYearOf_(today_()));
  var msg = '✅ setup 完了: マスタ「' + master.getName() + '」/ 今年度データ ' + n + ' 件を新規作成 / アプリ管理者: ' + admins.join(', ');
  console.log(msg);
  return msg;
}

/** 指定年度のデータファイルを学校ごとに作る。 */
function startFiscalYear(fiscalYear) {
  requireOwner_();
  var n = startFiscalYear_(fiscalYear);
  console.log('✅ ' + fiscalYear + '年度: ' + n + ' 件を新規作成');
}
/** 指定年度を closed にし、画面から読めなくする（ファイルは消さない）。今年度は指定できない。 */
function closeFiscalYear(fiscalYear) {
  requireOwner_();
  var fy = String(fiscalYear);
  if (!/^\d{4}$/.test(fy)) throw new Error('年度は 2026 のように4桁で指定してください。');
  if (fy === fiscalYearOf_(today_())) throw new Error('今年度は終了にできません。');
  var sh = SpreadsheetApp.openById(getMasterId_()).getSheetByName('dataFiles');
  var values = sh.getDataRange().getDisplayValues();
  var col = SCHEMA.dataFiles.indexOf('status') + 1;
  var n = 0;
  for (var r = 1; r < values.length; r++) {
    if (values[r][1] !== fy) continue;
    sh.getRange(r + 1, col).setValue(DATA_STATUS.closed);
    n++;
  }
  Directory.clear();
  console.log('✅ ' + fy + '年度: ' + n + ' 件を closed にしました');
}

function ensureFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP.folderId);
  if (id) return DriveApp.getFolderById(id);
  var folder = DriveApp.createFolder(APP_TITLE + (isDemoMode_() ? '（デモ）' : '（本番）'));
  props.setProperty(PROP.folderId, folder.getId());
  return folder;
}

function startFiscalYear_(fiscalYear) {
  var fy = String(fiscalYear);
  if (!/^\d{4}$/.test(fy)) throw appError_('年度は 2026 のように4桁で指定してください。');
  var master = SpreadsheetApp.openById(getMasterId_());
  var sh = ensureSheetWithHeader_(master, 'dataFiles', SCHEMA.dataFiles);
  var existing = Directory.listDataFiles();
  var folder = ensureFolder_();
  var added = [];
  Directory.listSchools().forEach(function (s) {
    if (!Directory.isActive(s.active)) return;
    if (existing.some(function (x) { return x.schoolId === s.schoolId && x.fiscalYear === fy; })) return;
    var ss = SpreadsheetApp.create(APP_TITLE + '_' + s.schoolId + '_' + fy + '年度' + (isDemoMode_() ? '（デモ）' : ''));
    DriveApp.getFileById(ss.getId()).moveTo(folder);
    var info = ss.getSheets()[0];
    info.setName('info');
    info.getRange(1, 1, 2, 1).setNumberFormat('@').setValues([[APP_TITLE + ' 年度データ（' + s.schoolId + ' / ' + fy + '年度）'],
      ['成績が入っています。このファイルは誰とも共有しないでください。']]);
    added.push([s.schoolId, fy, ss.getId(), DATA_STATUS.open]);
  });
  writeRows_(sh, added);
  Directory.clear();
  return added.length;
}

/**
 * 学校ごとの「取り込み用名簿シート」。アプリ管理者が持ち、その学校の設定担当の先生にだけ編集共有する。
 * 取り込みアプリ（importer/・設定担当の先生の権限で動く）が、名簿マスターから必要な列だけを書きこむ。
 */
var SchoolRoster = (function () {
  function ensure(schoolId) {
    var id = Directory.getSchoolRosterId(schoolId);
    if (id) return id;
    return Store.withLock(function () {
      Directory.clear();
      var again = Directory.getSchoolRosterId(schoolId);
      if (again) return again;
      var school = Directory.getSchool(schoolId);
      var ss = SpreadsheetApp.create(APP_TITLE + '_取り込み名簿_' + schoolId);
      DriveApp.getFileById(ss.getId()).moveTo(ensureFolder_());
      var info = ss.getSheets()[0];
      info.setName('info');
      info.getRange(1, 1, 3, 3).setNumberFormat('@').setValues([
        [SCHOOL_ROSTER_MARK, schoolId, school ? school.schoolName : ''],
        ['このファイルは「' + APP_TITLE + '」の取り込みアプリが書き込みます。', '', ''],
        ['学校の設定担当の先生だけに共有されています。ほかの人と共有しないでください。', '', '']
      ]);
      ensureSheetWithHeader_(ss, 'roster', SCHEMA.schoolRoster);
      ensureSheetWithHeader_(ss, 'staff', SCHEMA.schoolStaff);
      writeRows_(ensureSheetWithHeader_(SpreadsheetApp.openById(getMasterId_()), 'schoolRosters', SCHEMA.schoolRosters), [[schoolId, ss.getId(), now_()]]);
      Directory.clear();
      return ss.getId();
    });
  }
  /** 共有を「その学校の設定担当だけ」にそろえる（持ち主は除く）。 */
  function syncEditors(id, schoolId) {
    var allowed = Directory.listSetupTeacherEmails(schoolId);
    var file = DriveApp.getFileById(id);
    var owner = normEmail_(file.getOwner() ? file.getOwner().getEmail() : '');
    var editors = file.getEditors().map(function (u) { return normEmail_(u.getEmail()); });
    var viewers = file.getViewers().map(function (u) { return normEmail_(u.getEmail()); });
    editors.concat(viewers).forEach(function (e) {
      if (e && e !== owner && allowed.indexOf(e) === -1) {
        if (editors.indexOf(e) !== -1) file.removeEditor(e); else file.removeViewer(e);
      }
    });
    allowed.forEach(function (e) { if (editors.indexOf(e) === -1 && !(isDemoMode_() && /@example\.com$/.test(e))) file.addEditor(e); });
  }
  return { ensure: ensure, syncEditors: syncEditors };
})();

/** デモのペルソナ（実在の人は使わない）。 */
function demoPersonas_() {
  return [
    { email: 'demo.setup@example.com', label: '設定担当の先生（教務主任）' },
    { email: 'demo.t31@example.com', label: '3年1組の担任' },
    { email: 'demo.admin@example.com', label: 'アプリ管理者' }
  ];
}
