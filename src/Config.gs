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
var APP_VERSION = '2.17.0';
var TZ = 'Asia/Tokyo';
var PROP = { masterId: 'MASTER_SPREADSHEET_ID', folderId: 'APP_FOLDER_ID', admins: 'APP_ADMINS' };

var MASTER_SHEETS = ['schools', 'teachers', 'dataFiles', 'schoolRosters', 'assignments'];
/** 列順はこの配列が正。ヘッダ行の並びには頼らない。 */
var SCHEMA = {
  schools: ['schoolId', 'schoolName', 'active', 'termSystem'],
  /** 設定担当の先生（アプリ管理者が登録）。role='setup'。 */
  teachers: ['schoolId', 'email', 'name', 'active', 'role'],
  dataFiles: ['schoolId', 'fiscalYear', 'spreadsheetId', 'status'],
  /** 学校ごとの取り込み用名簿シートと、取り込み元の名簿マスター（ID は画面に返さない）。 */
  schoolRosters: ['schoolId', 'spreadsheetId', 'updatedAt', 'sourceId', 'importedAt'],
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
  /** 評価の基準（クラス×教科×学期）と評定の表（クラス×教科・term は「評定」）。value は JSON。 */
  criteria: ['key', 'classKey', 'subject', 'term', 'value', 'updatedAt', 'updatedBy'],
  /** 消したテストと、その点数の控え（まちがえて消したときに戻せるように残す）。test・scores は JSON。 */
  trash: ['key', 'classKey', 'subject', 'term', 'test', 'scores', 'deletedAt', 'deletedBy'],
  /**
   * 変更の記録（クラスごとのシート history_<classKey>）。保存のたびに、どのマスを何から何に変えたかを残す。
   * kind: score（点数・target=testId|メール・field=観点）／manual（手で入れた値・target=メール|教科|時期・field=観点か評定）／test（消したテスト・target=trash の key）。
   * note: 'undo:<key>' は、その記録を「もとにもどす」で戻したしるし。
   */
  history: ['key', 'kind', 'target', 'field', 'before', 'after', 'at', 'by', 'note']
};
var CLASS_SHEETS = { scores: 'scores_', manual: 'manual_', history: 'history_' };

/** 学期の名前。 */
var TERM_LABELS = { '3学期制': ['1学期', '2学期', '3学期'], '2学期制': ['前期', '後期'] };
var YEAR_TERM = '1年間';
/** criteria シートで、評定の表の行に使う term。 */
var HYOTEI_RULE_TERM = '評定';

var MAX_LEN = { testName: 40, subject: 20, kanten: 30, schoolName: 60 };
var MAX_TESTS_PER_TERM = 40;
var MAX_POINT = 1000;
var MAX_CHANGES = 5000;

/** 在籍とみなす名簿の「状態」。名簿マスターは active。 */
var ENROLLED_STATUS = ['在籍', 'active'];
var STAFF_ACTIVE_STATUS = ['active', '在職'];  // 名簿マスターは「active,multi」のようにカンマで続くことがある
/** この役職の人は、その学校の設定担当（学校の全クラスを見られる）。 */
var SETUP_TITLES = ['校長', '教頭', '教務主任'];
var ASSIGN_ROLE = { homeroom: 'homeroom', assistant: 'assistant' };
var MAX_ASSISTANTS = 20;
var DATA_STATUS = { open: 'open', closed: 'closed' };
var TEST_SCHOOL_PREFIX = 't-';
var SCHOOL_ROSTER_MARK = 'seiseki-note-roster';

/** 奈良市の学校コードと学校名（学校の登録のドロップダウン）。公開されている情報。 */
var SCHOOL_LIST = [
  ['401', '奈良市立椿井小学校'], ['402', '奈良市立飛鳥小学校'], ['403', '奈良市立鼓阪小学校'], ['404', '奈良市立済美小学校'], ['405', '奈良市立佐保小学校'],
  ['406', '奈良市立大宮小学校'], ['407', '奈良市立都跡小学校'], ['408', '奈良市立大安寺小学校'], ['409', '奈良市立東市小学校'], ['410', '奈良市立平城小学校'],
  ['411', '奈良市立辰市小学校'], ['412', '奈良市立明治小学校'], ['413', '奈良市立帯解小学校'], ['415', '奈良市立伏見小学校'], ['416', '奈良市立富雄南小学校'],
  ['417', '奈良市立富雄北小学校'], ['418', '奈良市田原小学校'], ['420', '奈良市立柳生小学校'], ['422', '奈良市立興東小学校'], ['423', '奈良市立あやめ池小学校'],
  ['424', '奈良市立鶴舞小学校'], ['425', '奈良市立鳥見小学校'], ['426', '奈良市立登美ヶ丘小学校'], ['427', '奈良市立六条小学校'], ['428', '奈良市立青和小学校'],
  ['430', '奈良市立東登美ケ丘小'], ['431', '奈良市立二名小学校'], ['432', '奈良市立西大寺北小学校'], ['433', '奈良市立富雄第三小学校'], ['434', '奈良市立平城西小学校'],
  ['435', '奈良市立大安寺西小学校'], ['436', '奈良市立三碓小学校'], ['437', '奈良市立ならやま小学校'], ['438', '奈良市立朱雀小学校'], ['439', '奈良市立済美南小学校'],
  ['440', '奈良市立鼓阪北小学校'], ['441', '奈良市立伏見南小学校'], ['442', '奈良市立佐保台小学校'], ['443', '奈良市立佐保川小学校'], ['444', '奈良市立左京小学校'],
  ['445', '奈良市立月ヶ瀬小学校'], ['447', '奈良市立都祁小学校'],
  ['501', '奈良市立春日中学校'], ['502', '奈良市立三笠中学校'], ['503', '奈良市立若草中学校'], ['504', '奈良市立伏見中学校'], ['505', '奈良市立富雄中学校'],
  ['506', '奈良市立都南中学校'], ['507', '奈良市田原中学校'], ['509', '奈良市立興東館柳生中学校'], ['510', '奈良市立登美ヶ丘中学校'], ['511', '奈良市立ならやま中学校'],
  ['512', '奈良市立二名中学校'], ['513', '奈良市立京西中学校'], ['514', '奈良市立富雄南中学校'], ['515', '奈良市立平城中学校'], ['516', '奈良市立飛鳥中学校'],
  ['517', '奈良市立登美ヶ丘北中学校'], ['518', '奈良市立都跡中学校'], ['519', '奈良市立平城東中学校'], ['520', '奈良市立月ヶ瀬中学校'], ['521', '奈良市立都祁中学校'],
  ['522', '奈良市立富雄第三中学校'], ['523', '奈良市立一条高等学校附属中学校']
];
/** 名簿マスターの見出し（この名前の列だけを読む。住所・保護者などの列は読まない）。 */
var MASTER_STUDENT_COLS = { status: '状態', school: '学校', family: '姓', given: '名', email: 'Googleアカウント', grade: '年', classNo: '組', number: '番' };
var MASTER_STAFF_COLS = { status: '状態', school: '学校', family: '姓', given: '名', email: 'Googleアカウント', title: '役職' };

/** 教科・観点・基準の初期値。評価の基準と評定の表は、担任がクラスごとに画面で決める。 */
var KANTEN_KNOW = '知識・技能', KANTEN_THINK = '思考・判断・表現', KANTEN_ATTITUDE = '主体的に学習に取り組む態度';
function defaultSubject_(name, opts) {
  opts = opts || {};
  var a = opts.a || 80, b = opts.b || 60;
  var kanten = [{ label: KANTEN_KNOW, gg: '知', test: true, a: a, b: b }];
  (opts.sub || []).forEach(function (s) { kanten.push({ label: s, gg: '', test: true, into: KANTEN_KNOW, a: a, b: b }); });
  kanten.push({ label: KANTEN_THINK, gg: '思', test: true, a: a, b: b });
  // GG の「教科等」の並び（知・思・主・評定）と同じ順にする。主体的はテストでは測れないので先生が入れる
  kanten.push({ label: KANTEN_ATTITUDE, gg: '主', test: false });
  return { name: name, kanten: kanten, total: { a: a, b: b }, hyoteiTerm: false, hyoteiYear: !!opts.hyotei };
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
var PUBLIC_FUNCTIONS = ['bootstrap', 'getClassData', 'getPeers', 'getHistory', 'undoHistory', 'saveTests', 'copyTestsToClasses', 'saveScores', 'saveManual',
  'saveCriteria', 'saveHyoteiRule', 'copyCriteriaToClasses', 'previewSmileImport', 'importSmile',
  'getSchoolSetup', 'saveAssignments', 'importRoster', 'getAdminView', 'registerSchool', 'updateSchool'];
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
