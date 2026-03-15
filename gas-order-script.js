// Google Apps Script - 鋼材発注メール送信
// デプロイ手順:
//   1. Google Apps Script (https://script.google.com) で新規プロジェクトを作成
//   2. このコードをエディタに貼り付けて保存
//   3. 「デプロイ」→「新しいデプロイ」→ 種類: Webアプリ
//      - 実行するユーザー: 自分
//      - アクセスできるユーザー: 全員（匿名ユーザーを含む）
//   4. デプロイ後に発行される URL を、ポータルの「発注管理 > GAS設定」に貼り付ける

const SENDER_NAME = '日建フレメックス株式会社 生産管理課';
const ALLOWED_ORIGIN = '*'; // 必要に応じて GitHub Pages の URL に変更

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const { to, subject, body } = data;

    if (!to || !subject || !body) {
      throw new Error('必須パラメータが不足しています');
    }

    GmailApp.sendEmail(to, subject, body, {
      name: SENDER_NAME,
      replyTo: Session.getActiveUser().getEmail()
    });

    return buildResponse({ success: true, message: 'メール送信完了' });
  } catch (err) {
    return buildResponse({ success: false, error: err.message });
  }
}

function doGet(e) {
  return buildResponse({ status: 'GAS Order API is running' });
}

function buildResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
