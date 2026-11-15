/**
 * Auth.gs — 本人の確認と、できることの確認。（ふりかえりシート他校版の Auth.gs と同じ考え方）
 *
 * ★本人は getMe_ だけで決める。本番は Session.getActiveUser() だけを見て、画面から来た actingAs を見ない。
 *   デモは actingAs が名簿・教職員に実在するペルソナの時だけ通す。
 * ★公開関数は先頭で getContext_ を呼ぶ。名簿・教職員にいない人・学校が休止中の人は断る（拒否が既定）。
 * ★クラスは「その先生の担当のクラス」だけ。画面から来た classKey は、担当の一覧と照らし合わせてから使う。
 */
var DENY_MESSAGE_ = '利用できません。教職員の名簿に登録がないか、利用できる状態ではありません。';

function getMe_(actingAs) {
  if (!isDemoMode_()) {
    var email = normEmail_(Session.getActiveUser().getEmail());
    if (!email) throw appError_('ログイン情報を取得できませんでした。学校のGoogleアカウントで開いてください。');
    return email;
  }
  var e = normEmail_(actingAs);
  if (!e) throw appError_('デモ: 体験する人を選んでください。');
  return e;
}

/**
 * 本人・役割・学校を決める。
 * アプリ管理者が先生でもあるときは、先生として動き（担当クラスだけ）、isAdmin で管理の関数も使える。
 */
function getContext_(actingAs) {
  var me = getMe_(actingAs);
  var isAdmin = isAppAdmin_(me);
  var actor = Directory.resolveActor(me);
  if (!actor && isAdmin) actor = { role: 'admin', email: me, name: 'アプリ管理者', schoolId: '', classes: [] };
  if (!actor) throw appError_(DENY_MESSAGE_);
  return { me: me, actor: actor, isAdmin: isAdmin };
}

function requireTeacher_(ctx) {
  if (ctx.actor.role !== 'teacher') throw appError_('この操作はできません。');
}
function requireSetup_(ctx) {
  requireTeacher_(ctx);
  if (!ctx.actor.isSetup) throw appError_('この操作は、学校の設定担当の先生だけができます。');
}
function requireAdmin_(ctx) {
  if (!ctx.isAdmin) throw appError_('この操作は、アプリ管理者だけができます。');
}
/** そのクラスの担当か。担当でなければ断る。正しいクラスの書き方を返す。 */
function requireClass_(ctx, classKey) {
  requireTeacher_(ctx);
  var c = normClassKey_(classKey);
  if (!c || ctx.actor.classes.indexOf(c) === -1) throw appError_('このクラスは担当していません。');
  return c;
}

/**
 * エディタから実行する管理関数の先頭で必ず呼ぶ。
 * Webアプリ経由では active=利用者 / effective=デプロイした人 になるので弾ける。
 */
function requireOwner_() {
  var active = normEmail_(Session.getActiveUser().getEmail());
  var effective = normEmail_(Session.getEffectiveUser().getEmail());
  if (!active || active !== effective) throw new Error('この関数は、アプリ管理者がスクリプトエディタから実行してください。');
}
