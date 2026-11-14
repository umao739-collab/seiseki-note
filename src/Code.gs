/**
 * Code.gs — doGet と公開関数（Config.gs の PUBLIC_FUNCTIONS の9個）。
 *
 * ★google.script.run から呼べるのは末尾 `_` の無い関数すべて。ここに置く公開関数は PUBLIC_FUNCTIONS だけ。
 * 各公開関数の順序: getMe_（本人・学校のアカウントか）→ 本人のファイルを開く → 検査 → 処理。
 * ★成績はどこにも写さない・ログに書かない。返すのは、開いた先生が自分で開けるファイルの中身だけ。
 */
function doGet() {
  var t = HtmlService.createTemplateFromFile('index');
  return t.evaluate()
    .setTitle(APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** テンプレート内 <?!= include_('Styles') ?> 用。 */
function include_(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'); }

/**
 * 公開関数の本体を包む。アプリの例外（appError_）の文言だけを画面に返し、
 * それ以外（Sheets の例外など、IDや中身を含みうるもの）は固定の文言に置き換える。
 * ログには例外の種類と場所だけを残す（成績や名前を含みうる message は残さない）。
 */
function guard_(fn) {
  try {
    return fn();
  } catch (e) {
    if (e && e.isApp) throw new Error(e.message);
    console.error((e && e.name) || 'Error', e && e.stack ? String(e.stack).split('\n').slice(1, 4).join(' / ') : '');
    throw new Error('うまくいきませんでした。時間をおいて、もう一度ためしてください。');
  }
}

function mySettings_() {
  return parseSettings_(PropertiesService.getUserProperties().getProperty(USER_PROP.settings));
}

// ================= 公開関数 =================

/** 最初の表示。設定と、えらんであるファイルの名前を返す。 */
function bootstrap() {
  return guard_(function () {
    getMe_();
    var out = { appTitle: APP_TITLE, version: APP_VERSION, settings: mySettings_(), file: null, fileProblem: '' };
    var id = PropertiesService.getUserProperties().getProperty(USER_PROP.fileId);
    if (id) {
      try {
        out.file = { name: openSmile_(id).getName() };
      } catch (e) {
        out.fileProblem = e && e.isApp ? e.message : '前にえらんだファイルが開けませんでした。';
      }
    }
    return out;
  });
}

/** 本人が開けるスプレッドシートのうち、名前に「SMILE」が入っているものの一覧（新しい順）。 */
function findMyFiles() {
  return guard_(function () {
    getMe_();
    var it = DriveApp.searchFiles("mimeType = 'application/vnd.google-apps.spreadsheet' and title contains '" + SMILE_MARK + "' and trashed = false");
    var files = [];
    while (it.hasNext() && files.length < MAX_FILES * 2) {
      var f = it.next();
      files.push({ id: f.getId(), name: f.getName(), updated: f.getLastUpdated().getTime() });
    }
    files.sort(function (a, b) { return b.updated - a.updated; });
    return files.slice(0, MAX_FILES).map(function (f) {
      return { id: f.id, name: f.name, updated: Utilities.formatDate(new Date(f.updated), TZ, 'yyyy/MM/dd') };
    });
  });
}

function chooseFile_(id) {
  var ss = openSmile_(id);
  PropertiesService.getUserProperties().setProperty(USER_PROP.fileId, id);
  return { name: ss.getName() };
}

/** 一覧からファイルをえらぶ。SMILEファイルであることを確かめてから、本人の設定に覚える。 */
function chooseFile(id) {
  return guard_(function () {
    getMe_();
    return chooseFile_(String(id || ''));
  });
}

/** URL をはりつけてファイルをえらぶ。 */
function chooseFileByUrl(url) {
  return guard_(function () {
    getMe_();
    var id = fileIdFromUrl_(url);
    if (!id) throw appError_('スプレッドシートのURLではないようです。「https://docs.google.com/spreadsheets/d/…」の形をはりつけてください。');
    return chooseFile_(id);
  });
}

/** えらんだファイルを忘れる（ファイルそのものは何も変わらない）。 */
function forgetFile() {
  return guard_(function () {
    getMe_();
    PropertiesService.getUserProperties().deleteProperty(USER_PROP.fileId);
    return { ok: true };
  });
}

/** えらんであるSMILEファイルを読む。 */
function loadMyClass() {
  return guard_(function () {
    getMe_();
    return readSmile_(openMyFile_());
  });
}

/** 見本のクラス（架空の名前と点数）。ファイルを読まないので、だれでも安心して試せる。 */
function loadDemoClass() {
  return guard_(function () {
    getMe_();
    return demoModel_();
  });
}

/**
 * 所見を保存する。items = [{ no, term, text }]。
 * 番号はファイルの名簿にあるものだけ。名前は画面から受け取らず、名簿から引く。
 */
function saveShoken(items) {
  return guard_(function () {
    getMe_();
    var ss = openMyFile_();
    var menuSheet = ss.getSheetByName(MENU_SHEET);
    var students = parseMenu_(menuSheet.getRange(1, 1, Math.min(60, menuSheet.getMaxRows()), Math.min(11, menuSheet.getMaxColumns())).getDisplayValues()).students;
    var list = validateShokenItems_(items, students.map(function (s) { return s.no; }));
    var now = now_();
    writeShoken_(ss, list, students, now);
    return { savedAt: now, count: list.length };
  });
}

/** 表示の設定を保存する（本人の UserProperties だけ）。 */
function saveSettings(input) {
  return guard_(function () {
    getMe_();
    var s = validateSettings_(input);
    PropertiesService.getUserProperties().setProperty(USER_PROP.settings, JSON.stringify(s));
    return s;
  });
}
