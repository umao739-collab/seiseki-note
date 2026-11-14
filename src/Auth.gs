/**
 * Auth.gs — 本人の確認。
 *
 * ★本人は getMe_ だけで決める。Session.getActiveUser() だけを見て、画面から来たメールは見ない。
 * ★公開関数は先頭で getMe_ を呼ぶ。学校のアカウントでなければ、何も読まずに断る（拒否が既定）。
 * ★どのファイルを読むかは、本人の UserProperties に入っている ID だけで決める（画面から ID を受け取らない）。
 *   ファイルを開けるかどうかは Google ドライブの共有のとおり（開いた先生の権限で動くため）。
 */
var DENY_MESSAGE_ = '利用できません。学校のGoogleアカウントで開いてください。';

function getMe_() {
  var email = normEmail_(Session.getActiveUser().getEmail());
  if (!email) throw appError_('ログイン情報を取得できませんでした。学校のGoogleアカウントで開いてください。');
  if (!isAllowedEmail_(email, ALLOWED_DOMAINS)) throw appError_(DENY_MESSAGE_);
  return email;
}

/** メールのドメインが一覧にあるか（完全一致）。一覧が空なら誰も通さない。 */
function isAllowedEmail_(email, domains) {
  var e = normEmail_(email);
  var at = e.lastIndexOf('@');
  if (at <= 0 || at === e.length - 1) return false;
  var d = e.slice(at + 1);
  return (domains || []).some(function (x) { return normEmail_(x) === d; });
}

/** 本人がえらんだSMILEファイルを開く。えらんでいない・開けない・SMILEでない時は断る。 */
function openMyFile_() {
  var id = PropertiesService.getUserProperties().getProperty(USER_PROP.fileId);
  if (!id) throw appError_('まだSMILEファイルがえらばれていません。');
  return openSmile_(id);
}

/** ID のファイルを開き、SMILEファイルであることを確かめる。 */
function openSmile_(id) {
  if (!isFileId_(id)) throw appError_('ファイルが見つかりませんでした。');
  var ss;
  try {
    ss = SpreadsheetApp.openById(id);
  } catch (e) {
    throw appError_('このファイルは開けませんでした。共有されているか確かめてください。');
  }
  if (!isSmileFile_(ss)) throw appError_('SMILEスプレッドシートではないようです。別のファイルをえらんでください。');
  return ss;
}

function isSmileFile_(ss) {
  var menu = ss.getSheetByName(MENU_SHEET);
  if (!menu) return false;
  var mark = String(menu.getRange(1, 2).getDisplayValue() || '');
  return mark.indexOf(SMILE_MARK) !== -1;
}
