/**
 * Config.gs — 設定とスキーマ定数の一次ソース。
 *
 * ★しくみは「ふりかえりシート 他校版」と同じ。
 *   - Webアプリは「デプロイした人（アプリ管理者）として実行」。データはアプリ管理者のドライブにだけ置き、だれとも共有しない。
 *   - 本人は Session.getActiveUser() だけで決める。名簿・教職員にいない人は断る（拒否が既定）。
 *   - 先生は担当のクラスだけ、設定担当の先生は自分の学校だけ、を必ずサーバー側で確かめる。
 * ★ファイルIDやメールはコードに書かない（このリポジトリは公開されている）。Script Properties に置く。
 *   MASTER_SPREADSHEET_ID … マスタ（schools / teachers / dataFiles / schoolRosters / assignments）
 *   APP_FOLDER_ID         … アプリ管理者のマイドライブのフォルダ
 *   APP_ADMINS            … アプリ管理者のメール（カンマ区切り）。setup() を実行した人が入る
 * ★デモ⇄本番の切り替えは BUILD_TARGET の1か所だけ。
 */
var BUILD_TARGET = 'prod'; // 'demo' | 'prod'
var APP_TITLE = 'せいせきノート';
var APP_VERSION = '2.0.1';
var TZ = 'Asia/Tokyo';
var PROP = { masterId: 'MASTER_SPREADSHEET_ID', folderId: 'APP_FOLDER_ID', admins: 'APP_ADMINS' };

var MASTER_SHEETS = ['schools', 'teachers', 'dataFiles', 'schoolRosters', 'assignments'];
/** 列順はこの配列が正。ヘッダ行の並びには頼らない。 */
var SCHEMA = {
  schools: ['schoolId', 'schoolName', 'active', 'termSystem'],
  /** 設定担当の先生（アプリ管理者が登録）。role='setup'。 */
  teachers: ['schoolId', 'email', 'name', 'active', 'role'],
  dataFiles: ['schoolId', 'fiscalYear', 'spreadsheetId', 'status'],
  schoolRosters: ['schoolId', 'spreadsheetId', 'updatedAt'],
  /** 担任・担当（設定担当が割り当てる）。 */
  assignments: ['schoolId', 'classKey', 'email', 'role', 'updatedAt', 'updatedBy'],
  // ----- 取り込み用名簿シート（学校ごと・取り込みアプリが書く） -----
  schoolRoster: ['schoolId', 'email', 'name', 'grade', 'classNo', 'number', 'status', 'importedAt'],
  schoolStaff: ['schoolId', 'email', 'name', 'title', 'status', 'importedAt'],
  // ----- 年度データ（学校×年度ごとに1ファイル） -----
  /** 学年ごとの教科・観点・基準（JSON）。 */
  gradeSubjects: ['grade', 'subjects', 'updatedAt', 'updatedBy'],
  tests: ['testId', 'classKey', 'subject', 'term', 'order', 'name', 'points', 'updatedAt', 'updatedBy'],
  /** 点数（クラスごとのシート scores_<classKey>）。1行 = 1人×1テスト。 */
  scores: ['key', 'testId', 'studentEmail', 'values', 'updatedAt', 'updatedBy'],
  /** 先生が入れる値（主体的に学習に取り組む態度・手直し）。クラスごとのシート manual_<classKey>。 */
  manual: ['key', 'studentEmail', 'subject', 'term', 'field', 'value', 'updatedAt', 'updatedBy'],
  /** 所見（クラスごとのシート shoken_<classKey>）。 */
  shoken: ['key', 'studentEmail', 'term', 'text', 'updatedAt', 'updatedBy']
};
var CLASS_SHEETS = { scores: 'scores_', manual: 'manual_', shoken: 'shoken_' };

/** 学期の名前。 */
var TERM_LABELS = { '3学期制': ['1学期', '2学期', '3学期'], '2学期制': ['前期', '後期'] };
var YEAR_TERM = '1年間';

var MAX_LEN = { testName: 40, shoken: 800, subject: 20, kanten: 30, schoolName: 60 };
var MAX_TESTS_PER_TERM = 40;
var MAX_POINT = 1000;
var MAX_CHANGES = 5000;

/** 在籍とみなす名簿の「状態」。名簿マスターは active。 */
var ENROLLED_STATUS = ['在籍', 'active'];
var STAFF_ACTIVE_STATUS = ['active', '在職'];
/** この役職の人は、その学校の設定担当（学校の全クラスを見られる）。 */
var SETUP_TITLES = ['校長', '教頭', '教務主任'];
var ASSIGN_ROLE = { homeroom: 'homeroom', assistant: 'assistant' };
var MAX_ASSISTANTS = 20;
var DATA_STATUS = { open: 'open', closed: 'closed' };
var TEST_SCHOOL_PREFIX = 't-';
var SCHOOL_ROSTER_MARK = 'seiseki-note-roster';

/** 教科・観点・基準の初期値（SMILEスプレッドシートの「観点名・評価基準設定」と同じ形）。 */
var KANTEN_KNOW = '知識・技能', KANTEN_THINK = '思考・判断・表現', KANTEN_ATTITUDE = '主体的に学習に取り組む態度';
function defaultSubject_(name, opts) {
  opts = opts || {};
  var a = opts.a || 80, b = opts.b || 60;
  var kanten = [{ label: KANTEN_KNOW, gg: '知', test: true, a: a, b: b }];
  (opts.sub || []).forEach(function (s) { kanten.push({ label: s, gg: '', test: true, into: KANTEN_KNOW, a: a, b: b }); });
  kanten.push({ label: KANTEN_THINK, gg: '思', test: true, a: a, b: b });
  kanten.push({ label: KANTEN_ATTITUDE, gg: '主', test: false });
  return { name: name, kanten: kanten, total: { a: a, b: b, r3: 2.5, r2: 1.5 }, hyoteiTerm: false, hyoteiYear: !!opts.hyotei };
}
function defaultSubjectsForGrade_(grade) {
  var g = Number(grade);
  var hy = g >= 3;
  var list = [defaultSubject_('国語', { sub: ['漢字', '言葉'], hyotei: hy })];
  if (g >= 3) list.push(defaultSubject_('社会', { hyotei: hy }));
  list.push(defaultSubject_('算数', { hyotei: hy }));
  if (g >= 3) list.push(defaultSubject_('理科', { hyotei: hy }));
  if (g <= 2) list.push(defaultSubject_('生活', { hyotei: hy }));
  list.push(defaultSubject_('音楽', { hyotei: hy }), defaultSubject_('図工', { hyotei: hy }));
  if (g >= 5) list.push(defaultSubject_('家庭', { hyotei: hy }));
  list.push(defaultSubject_('体育', { hyotei: hy }));
  if (g >= 5) list.push(defaultSubject_('外国語', { hyotei: hy }));
  return list;
}

/**
 * 末尾 `_` の無い関数はこの一覧だけ（google.script.run から呼べる）。
 * tools/run-local-tests.js がグローバル関数の一覧と照らし合わせる。
 */
var PUBLIC_FUNCTIONS = ['bootstrap', 'getClassData', 'saveTests', 'copyTestsToClasses', 'saveScores', 'saveManual',
  'saveShoken', 'saveGradeSubjects', 'getSchoolSetup', 'saveAssignments', 'getAdminView', 'registerSchool', 'updateSchool'];
var ADMIN_FUNCTIONS = ['setup', 'startFiscalYear', 'closeFiscalYear'];
var ENTRY_FUNCTIONS = ['doGet'];

function isDemoMode_() { return BUILD_TARGET === 'demo'; }

function getMasterId_() {
  var id = PropertiesService.getScriptProperties().getProperty(PROP.masterId);
  if (!id) throw appError_('準備ができていません。アプリ管理者に連絡してください。');
  return id;
}
function isAppAdmin_(email) {
  var list = String(PropertiesService.getScriptProperties().getProperty(PROP.admins) || '').split(',').map(normEmail_).filter(String);
  return list.indexOf(normEmail_(email)) !== -1;
}

/** 画面にそのまま出してよい文言の例外。それ以外の例外は guard_ で固定の文言に置き換える。 */
function appError_(message) {
  var e = new Error(message);
  e.isApp = true;
  return e;
}
