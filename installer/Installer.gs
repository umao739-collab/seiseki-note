/**
 * せいせきノート インストーラー
 *
 * 使い方: 関数「install」をえらんで「実行」をおすだけ。
 *  1回目: 「せいせきノート」の Apps Script プロジェクトを新しく作り、コードを入れて、Webアプリとして公開する。
 *  2回目から: 同じプロジェクトのコードを新しくし、同じURLのまま公開しなおす。
 *
 * コードは、決めたフォルダの中にある「せいせきノート_コード.json」（いちばん新しいもの）から読む。
 * ★このプロジェクトの Google Cloud プロジェクトは、Apps Script API が有効なもの（gas-code-export）に変えておく。
 * ★スクリプト プロパティ BUNDLE_FOLDER_ID に、コードを置くフォルダの ID を入れておく（共有ドライブのフォルダでもよい）。
 *   フォルダの ID は、そのフォルダを開いたときの URL の「folders/」のうしろの文字。
 *   ドライブ全体は探さない（ほかの人が同じ名前のファイルを置いても、それを読まないように）。
 */
var BUNDLE_NAME = 'せいせきノート_コード.json';
var BUNDLE_MARK = 'seiseki-note-bundle';
var PROJECT_TITLE = 'せいせきノート';
var API = 'https://script.googleapis.com/v1';

function install() {
  var props = PropertiesService.getScriptProperties();
  var bundle = latestBundle_();
  var token = ScriptApp.getOAuthToken();
  var scriptId = props.getProperty('TARGET_SCRIPT_ID');
  if (!scriptId) {
    scriptId = api_('post', '/projects', { title: PROJECT_TITLE }, token).scriptId;
    props.setProperty('TARGET_SCRIPT_ID', scriptId);
    console.log('📁 新しいプロジェクトを作りました: https://script.google.com/d/' + scriptId + '/edit');
  }
  api_('put', '/projects/' + scriptId + '/content', { files: bundle.files }, token);
  console.log('📝 コードを入れました（ver.' + bundle.version + '・' + bundle.files.length + 'ファイル）');
  var v = api_('post', '/projects/' + scriptId + '/versions', { description: 'ver.' + bundle.version }, token);
  var cfg = { versionNumber: v.versionNumber, manifestFileName: 'appsscript', description: PROJECT_TITLE + ' ver.' + bundle.version };
  var depId = props.getProperty('DEPLOYMENT_ID');
  var dep;
  if (depId) {
    dep = api_('put', '/projects/' + scriptId + '/deployments/' + depId, { deploymentConfig: cfg }, token);
  } else {
    dep = api_('post', '/projects/' + scriptId + '/deployments', cfg, token);
    props.setProperty('DEPLOYMENT_ID', dep.deploymentId);
  }
  var url = (dep.entryPoints || []).filter(function (e) { return e.entryPointType === 'WEB_APP'; })
    .map(function (e) { return e.webApp && e.webApp.url; })[0] || '';
  console.log('🎉 公開しました（版 ' + v.versionNumber + '）');
  console.log('👉 アプリのURL: ' + (url || '（デプロイの画面で確かめてください）'));
  console.log('👉 プロジェクト: https://script.google.com/d/' + scriptId + '/edit');
}

/** BUNDLE_FOLDER_ID のフォルダの中にある「せいせきノート_コード.json」のうち、いちばん新しいものを読む。 */
function latestBundle_() {
  var folderId = String(PropertiesService.getScriptProperties().getProperty('BUNDLE_FOLDER_ID') || '').trim();
  if (!folderId) throw new Error('スクリプト プロパティ「BUNDLE_FOLDER_ID」に、コードを置くフォルダの ID を入れてください。');
  var folder;
  try { folder = DriveApp.getFolderById(folderId); } catch (e) {
    throw new Error('BUNDLE_FOLDER_ID のフォルダを開けませんでした。ID が正しいか、このアカウントで開けるフォルダか、確かめてください。');
  }
  var it = folder.getFilesByName(BUNDLE_NAME);
  var best = null, count = 0;
  while (it.hasNext()) {
    var f = it.next();
    if (f.isTrashed()) continue;
    count++;
    if (!best || f.getDateCreated() > best.getDateCreated()) best = f;
  }
  if (!best) throw new Error('フォルダ「' + folder.getName() + '」に「' + BUNDLE_NAME + '」が見つかりません。');
  if (count > 1) console.log('ℹ️ フォルダに「' + BUNDLE_NAME + '」が ' + count + ' 個あります。いちばん新しいものを使います。');
  var b = JSON.parse(best.getBlob().getDataAsString('UTF-8'));
  if (!b || b.mark !== BUNDLE_MARK || !Array.isArray(b.files) || !b.files.length) throw new Error('「' + BUNDLE_NAME + '」の中身が正しくありません。');
  b.files.forEach(function (f) {
    if (!/^[A-Za-z]+$/.test(f.name) || ['SERVER_JS', 'HTML', 'JSON'].indexOf(f.type) === -1 || typeof f.source !== 'string') {
      throw new Error('「' + BUNDLE_NAME + '」の中身が正しくありません。');
    }
  });
  console.log('📦 ' + folder.getName() + ' ／ ' + best.getName() + '（ver.' + b.version + '・' + Utilities.formatDate(best.getDateCreated(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm') + ' に作成）を使います');
  return b;
}

function api_(method, path, body, token) {
  var res = UrlFetchApp.fetch(API + path, {
    method: method, contentType: 'application/json', payload: JSON.stringify(body),
    headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code >= 300) throw new Error('Apps Script API でエラー（' + code + '）: ' + text.slice(0, 1500));
  return JSON.parse(text || '{}');
}
