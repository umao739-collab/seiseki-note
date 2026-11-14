/**
 * Config.gs — 設定と定数の一次ソース。
 *
 * ★このアプリは「成績を先生の手元から出さない」作り。
 *   - Webアプリは「アクセスしたユーザーとして実行」（appsscript.json の executeAs: USER_ACCESSING）。
 *     開いた先生の権限で、その先生が開けるSMILEファイルだけを読む。
 *   - 成績をどこにも写さない（マスタ・年度データ・キャッシュに入れない）。ログにも書かない。
 *   - 先生ごとの設定（えらんだファイル・表示の好み）は UserProperties（その先生だけの場所）に置く。
 *   - 所見を保存するときだけ、先生自身のSMILEファイルに「所見メモ」シートを足して書く。
 *
 * ★他校に配るときに書きかえるのは ALLOWED_DOMAINS の1か所だけ。
 */
var APP_TITLE = 'せいせきノート';
var APP_VERSION = '1.0.0';
var TZ = 'Asia/Tokyo';

/**
 * 使ってよい Google アカウントのドメイン（@ のうしろ）。
 * ここにないドメインのアカウントは、ファイルを開く前に断る（拒否が既定）。
 * コードに書くのは「画面や他の先生から書きかえられないように」するため（Script Properties は使わない）。
 */
var ALLOWED_DOMAINS = ['e-net.nara.jp'];

/** 先生ごとの保存場所（UserProperties）のキー。 */
var USER_PROP = { fileId: 'SMILE_FILE_ID', settings: 'SETTINGS' };

/** SMILEファイルの目じるし。メニューシートの B1 にこの文字が入っている。 */
var SMILE_MARK = 'SMILE';
var MENU_SHEET = 'メニュー';
/** 教科のシート名（あるものだけ読む）。 */
var SUBJECTS = ['国語', '社会', '算数', '理科', '生活', '音楽', '図工', '家庭', '体育', '外国語'];
/** 所見を保存するシート（先生自身のSMILEファイルの中に作る）。 */
var SHOKEN_SHEET = '所見メモ（せいせきノート）';
var SHOKEN_HEADER = ['番号', '名前', '時期', '所見', '更新日時'];

var MAX_STUDENTS = 45;
var MAX_FILES = 30;
var MAX_LEN = { shoken: 800, url: 500 };
/** 所見を一度に保存できる人数。 */
var MAX_SHOKEN_BATCH = MAX_STUDENTS * 4;
/** 時期の書き方（画面から来る値はこの形だけ受けつける）。 */
var TERM_RE = /^(1学期|2学期|3学期|前期|後期|1年間)$/;

/** 先生が変えられる設定と、その初期値・範囲。 */
var SETTINGS_DEFAULT = { strongRate: 85, weakRate: 70, shokenLength: 'normal', showClassAvg: true, includeChallenge: true };
var SETTINGS_RANGE = { strongRate: [60, 100], weakRate: [30, 90] };
var SHOKEN_LENGTHS = ['short', 'normal', 'long'];

/**
 * google.script.run から呼べるのは末尾 `_` の無い関数すべて。ここに置く公開関数はこの一覧だけ。
 * tools/run-local-tests.js が、グローバル関数とこの一覧を照らし合わせる。
 */
var PUBLIC_FUNCTIONS = ['bootstrap', 'findMyFiles', 'chooseFile', 'chooseFileByUrl', 'forgetFile',
  'loadMyClass', 'loadDemoClass', 'saveShoken', 'saveSettings'];
var ENTRY_FUNCTIONS = ['doGet'];

/** 画面にそのまま出してよい文言の例外。それ以外の例外は guard_ で固定の文言に置き換える。 */
function appError_(message) {
  var e = new Error(message);
  e.isApp = true;
  return e;
}
