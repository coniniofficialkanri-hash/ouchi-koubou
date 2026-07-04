/**
 * ============================================================
 *  自動ブログ生成システム（HYGGE PLANTS & ZAKKA）
 *  Claude API（記事・キーワード生成）＋ 実写真ライブラリ／GPT Image
 *  ＋ スプレッドシート ＋ LINE Messaging API push ＋ 管理画面(HtmlService)
 * ------------------------------------------------------------
 *  ▼ 新規クライアント展開時に変更する箇所は3つだけ ▼
 *   (1) スクリプトプロパティ（APIキー・トークン・各種ID・フォルダID）
 *       └ プロジェクトの設定 > スクリプト プロパティ で設定。コードにベタ書きしない。
 *       └ 必要キー一覧は listRequiredProps() を実行するとログに出ます。
 *   (2) 下の CLIENT オブジェクト（店名・テーマ・カテゴリ定義・ローテーション）
 *   (3) blog/index.html・blog/detail.html の GAS_API_URL（デプロイURL）
 *  関数本体（下部）はクライアントを問わず共通。書き換え不要。
 * ============================================================
 */

// ============================================================
// (2) クライアント固有設定 ── ここだけ触ればOK
// ============================================================
const CLIENT = {
  SITE_NAME: 'HYGGE PLANTS & ZAKKA',
  SITE_THEME: '観葉植物・多肉植物・雑貨・DIYの店（熊本）。初心者にもやさしい植物の育て方や飾り方を発信',
  AREA: '熊本県内',
  // カテゴリ4種
  CATEGORIES: ['育て方', '飾り方', 'DIY', '雑貨'],
  // 生成ローテーション（育て方が主力＝2周に1回は育て方になる重み付け）
  ROTATION: ['育て方', '飾り方', '育て方', 'DIY', '育て方', '雑貨'],
  // カテゴリ → 実写真Driveフォルダを指すスクリプトプロパティ名
  PHOTO_FOLDER_PROP: {
    '育て方': 'PHOTO_FOLDER_SODATEKATA',
    '飾り方': 'PHOTO_FOLDER_KAZARIKATA',
    'DIY':   'PHOTO_FOLDER_DIY',
    '雑貨':   'PHOTO_FOLDER_ZAKKA',
  },
};

// クライアントを問わない共通定数
const SHEET_NAME    = 'ブログ記事';
const USERID_SHEET  = '_userid';
const CLAUDE_MODEL  = 'claude-sonnet-4-6';
const IMAGE_MODEL   = 'gpt-image-1';

const COL = {
  KEYWORD:   1, // A
  TITLE:     2, // B
  BODY:      3, // C
  DATE:      4, // D
  PUBLISHED: 5, // E
  IMAGE_URL: 6, // F
  STATUS:    7, // G
  CATEGORY:  8, // H
};

// ============================================================
// (1) スクリプトプロパティ ヘルパー
// ============================================================
function getProp(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}
function setProp(key, val) {
  PropertiesService.getScriptProperties().setProperty(key, String(val));
}
function getBoolProp(key, def) {
  const v = getProp(key);
  if (v === '') return !!def;
  return String(v).toLowerCase() === 'true';
}

// CONFIG：シークレットは常にプロパティから読む
const CONFIG = {
  get SPREADSHEET_ID()            { return getProp('SPREADSHEET_ID'); },
  get CLAUDE_API_KEY()            { return getProp('CLAUDE_API_KEY'); },
  get OPENAI_API_KEY()            { return getProp('OPENAI_API_KEY'); },
  get GENERATED_FOLDER_ID()       { return getProp('GENERATED_FOLDER_ID'); },
  get LINE_CHANNEL_ACCESS_TOKEN() { return getProp('LINE_CHANNEL_ACCESS_TOKEN'); },
  get NOTIFY_USER_ID()            { return getProp('NOTIFY_USER_ID'); },
  get ADMIN_KEY()                 { return getProp('ADMIN_KEY'); },
  get WEBAPP_URL()                { return getProp('WEBAPP_URL'); }, // デプロイ後に設定（管理画面URL生成用）
  get AUTO_PUBLISH()              { return getBoolProp('AUTO_PUBLISH', false); },
};

/** 必要なスクリプトプロパティ一覧をログ表示（セットアップ確認用） */
function listRequiredProps() {
  const required = [
    'SPREADSHEET_ID', 'CLAUDE_API_KEY', 'OPENAI_API_KEY', 'GENERATED_FOLDER_ID',
    'LINE_CHANNEL_ACCESS_TOKEN', 'NOTIFY_USER_ID', 'ADMIN_KEY', 'WEBAPP_URL', 'AUTO_PUBLISH',
    'PHOTO_FOLDER_SODATEKATA', 'PHOTO_FOLDER_KAZARIKATA', 'PHOTO_FOLDER_DIY', 'PHOTO_FOLDER_ZAKKA',
  ];
  required.forEach(function (k) {
    const v = getProp(k);
    Logger.log((v ? '✅' : '⛔ 未設定') + '  ' + k + (v ? ' = ' + (k.indexOf('KEY') >= 0 || k.indexOf('TOKEN') >= 0 ? '（設定済み・非表示）' : v) : ''));
  });
}

// ============================================================
// メイン：記事1本を生成
// ============================================================
function dailyBlogGeneration() {
  const sheet = getSheet();
  let row = getNextKeywordRow(sheet);
  let keyword, category;

  if (!row) {
    category = getNextCategory();
    keyword  = generateKeyword(category);
    row = sheet.getLastRow() + 1;
    sheet.getRange(row, COL.KEYWORD).setValue(keyword);
    sheet.getRange(row, COL.CATEGORY).setValue(category);
  } else {
    keyword  = sheet.getRange(row, COL.KEYWORD).getValue();
    category = sheet.getRange(row, COL.CATEGORY).getValue();
    if (!category) { category = getNextCategory(); sheet.getRange(row, COL.CATEGORY).setValue(category); }
  }

  sheet.getRange(row, COL.STATUS).setValue('生成中');

  try {
    const article  = generateArticle(keyword, category);
    const imageUrl = pickImage(category, article.title, article.imagePrompt, sheet);
    const publish  = CONFIG.AUTO_PUBLISH;

    sheet.getRange(row, COL.TITLE).setValue(article.title);
    sheet.getRange(row, COL.BODY).setValue(article.body);
    sheet.getRange(row, COL.DATE).setValue(new Date());
    sheet.getRange(row, COL.PUBLISHED).setValue(publish);
    sheet.getRange(row, COL.IMAGE_URL).setValue(imageUrl);
    sheet.getRange(row, COL.CATEGORY).setValue(category);
    sheet.getRange(row, COL.STATUS).setValue(publish ? '公開済み' : '完了（未公開）');

    notifyMasuda(article.title, getAdminUrl(), publish);
    Logger.log('完了：' + article.title);
  } catch (e) {
    sheet.getRange(row, COL.STATUS).setValue('エラー: ' + e.message);
    Logger.log('エラー: ' + e.message);
  }
}

// ============================================================
// 改修②：カテゴリ・ローテーション（重み付け）
// ============================================================
function getNextCategory() {
  const idx = parseInt(getProp('ROTATION_INDEX') || '0', 10);
  const cat = CLIENT.ROTATION[idx % CLIENT.ROTATION.length];
  setProp('ROTATION_INDEX', idx + 1);
  return cat;
}

// ============================================================
// 改修③：キーワード生成（季節性＋重複回避＋HYGGE特化）
// ============================================================
function generateKeyword(category) {
  const month  = new Date().getMonth() + 1;
  const recent = getRecentKeywords(30);
  const recentText = recent.length ? recent.join(' / ') : '（まだありません）';

  const prompt =
    'あなたは' + CLIENT.SITE_THEME + 'のSEOに詳しいブログ編集者です。\n\n'
    + 'いまは' + month + '月です。「' + category + '」カテゴリの記事にする、'
    + '読者が実際に検索しそうな日本語キーワードを1つだけ考えてください。\n\n'
    + '【読者像】植物初心者〜中級者の一般のお客様（' + CLIENT.AREA + '中心）。\n'
    + '【条件】\n'
    + '・' + month + '月の季節感を反映（例：夏なら葉焼け・水やり頻度、冬なら寒さ・室内管理 など）\n'
    + '・専門用語を避けた、検索しやすい自然な言葉\n'
    + '・「' + category + '」に沿った内容\n'
    + '・下記の直近キーワードと重複・類似しないもの：\n  ' + recentText + '\n\n'
    + 'キーワードのみを1行で出力してください。説明・記号・カテゴリ名は不要です。';

  const text = callClaude(prompt, 120);
  return text.trim().replace(/^["「]|["」]$/g, '');
}

function getRecentKeywords(n) {
  const sheet = getSheet();
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const rows = sheet.getRange(2, COL.KEYWORD, last - 1, 1).getValues()
    .map(function (r) { return String(r[0] || '').trim(); })
    .filter(function (v) { return v; });
  return rows.slice(-n);
}

// ============================================================
// 記事本文生成
// ============================================================
function generateArticle(keyword, category) {
  const prompt =
    'あなたは' + CLIENT.SITE_THEME + 'のブログライターです。\n\n'
    + 'カテゴリ：' + category + '\n'
    + 'キーワード：' + keyword + '\n\n'
    + '以下のJSON形式のみで出力してください（前後に文章を付けない）。\n\n'
    + '{\n'
    + '  "title": "記事タイトル（30〜40文字・キーワードを自然に含む）",\n'
    + '  "body": "記事本文（Markdown形式、1500〜2000文字。見出しは##と###を使う）",\n'
    + '  "imagePrompt": "アイキャッチ用の英語プロンプト（photorealistic, no text）"\n'
    + '}\n\n'
    + '【執筆条件】\n'
    + '・ターゲットは植物初心者〜中級者。やさしいですます調。\n'
    + '・誇張表現や「必ず・絶対」といった断定はしない。\n'
    + '・医学的・安全性に関わる断定的な助言（食べられる/毒性が無い等）は書かない。心配な場合は専門家や病院へ、と添える。\n'
    + '・最後は「' + CLIENT.SITE_NAME + '」の店舗紹介につながる自然なCTAで締める（来店・LINE・Instagramへの誘導）。\n'
    + '・本文中に不要な絵文字を多用しない。';

  const text = callClaude(prompt, 3000);
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('JSONを抽出できませんでした');
  return JSON.parse(jsonMatch[0]);
}

/** Claude API 共通呼び出し */
function callClaude(prompt, maxTokens) {
  const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CONFIG.CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    payload: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
    muteHttpExceptions: true,
  });
  const json = JSON.parse(response.getContentText());
  if (!json.content || !json.content[0]) {
    throw new Error('Claude応答エラー: ' + response.getContentText().slice(0, 300));
  }
  return json.content[0].text;
}

// ============================================================
// 改修④：アイキャッチ ── 実写真優先・生成はフォールバック
// ============================================================
function pickImage(category, title, imagePrompt, sheet) {
  const fromLibrary = pickLibraryPhoto(category, sheet);
  if (fromLibrary) return fromLibrary;
  return generateAndSaveImage(title, imagePrompt);
}

function pickLibraryPhoto(category, sheet) {
  try {
    const propName = CLIENT.PHOTO_FOLDER_PROP[category];
    const folderId = propName ? getProp(propName) : '';
    if (!folderId) return null;

    const folder = DriveApp.getFolderById(folderId);
    const files = [];
    const it = folder.getFiles();
    while (it.hasNext()) {
      const f = it.next();
      const type = f.getMimeType();
      if (type && type.indexOf('image/') === 0) files.push(f);
    }
    if (files.length === 0) return null;

    // 使用済みファイルID（F列の既存URLから抽出）を避ける
    const usedIds = getUsedImageIds(sheet);
    let candidates = files.filter(function (f) { return usedIds.indexOf(f.getId()) === -1; });
    if (candidates.length === 0) candidates = files; // 使い切ったら再利用OK

    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    chosen.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return 'https://drive.google.com/uc?export=view&id=' + chosen.getId();
  } catch (e) {
    Logger.log('pickLibraryPhoto失敗（生成にフォールバック）: ' + e.message);
    return null;
  }
}

function getUsedImageIds(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const urls = sheet.getRange(2, COL.IMAGE_URL, last - 1, 1).getValues();
  const ids = [];
  urls.forEach(function (r) {
    const u = String(r[0] || '');
    let m = u.match(/[?&]id=([a-zA-Z0-9_-]+)/) || u.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (m) ids.push(m[1]);
  });
  return ids;
}

function generateAndSaveImage(title, imagePrompt) {
  const styled = (imagePrompt || 'houseplants interior') +
    ', natural warm interior with houseplants, soft window light, cozy hygge atmosphere, muted earth tones, photorealistic, no text, no people';

  const response = UrlFetchApp.fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + CONFIG.OPENAI_API_KEY,
    },
    payload: JSON.stringify({
      model: IMAGE_MODEL,
      prompt: styled + ', professional blog header image, 16:9, no text overlay',
      n: 1,
      size: '1536x1024',
    }),
    muteHttpExceptions: true,
  });

  const result = JSON.parse(response.getContentText());
  if (!result.data || !result.data[0]) throw new Error('画像生成失敗: ' + response.getContentText().slice(0, 300));

  const b64 = result.data[0].b64_json;
  const blob = Utilities.newBlob(Utilities.base64Decode(b64), 'image/png', 'blog_' + new Date().getTime() + '.png');
  const folder = DriveApp.getFolderById(CONFIG.GENERATED_FOLDER_ID);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://drive.google.com/uc?export=view&id=' + file.getId();
}

// ============================================================
// 改修⑤：LINE通知（Messaging API push）※LINE Notifyは使わない（2025/3終了）
// ============================================================
function notifyMasuda(title, adminUrl, published) {
  const token  = CONFIG.LINE_CHANNEL_ACCESS_TOKEN;
  const userId = CONFIG.NOTIFY_USER_ID;
  if (!token || !userId) { Logger.log('LINE通知スキップ（token/userId未設定）'); return; }

  const text = published
    ? '🌿 新しいブログ記事を公開しました\n\n「' + title + '」\n\nサイトでご確認ください👇\n' + adminUrl
    : '📝 新しいブログ記事ができました\n\n「' + title + '」\n\n内容を確認して公開ボタンを押してください👇\n' + adminUrl;

  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
    },
    payload: JSON.stringify({
      to: userId,
      messages: [{ type: 'text', text: text }],
    }),
    muteHttpExceptions: true,
  });
}

// ============================================================
// 改修⑤（続き）：userId取得ヘルパー（webhook）
//  セットアップ時だけ webhook をこのWebAppに向け、増田さんに一言送ってもらう。
//  受信したuserIdを _userid シートに記録 → NOTIFY_USER_ID に控える。
// ============================================================
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const sheet = getUserIdSheet();
    (body.events || []).forEach(function (ev) {
      const uid  = ev.source && ev.source.userId ? ev.source.userId : '';
      const type = ev.type || '';
      const msg  = (ev.message && ev.message.text) ? ev.message.text : '';
      if (uid) sheet.appendRow([new Date(), uid, type, msg]);
    });
  } catch (err) {
    Logger.log('doPostエラー: ' + err.message);
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}

function getUserIdSheet() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = ss.getSheetByName(USERID_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(USERID_SHEET);
    sheet.getRange(1, 1, 1, 4).setValues([['受信日時', 'userId', 'type', 'メッセージ']]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** _userid シートの最新userIdをログ表示（控え用） */
function showLatestUserId() {
  const sheet = getUserIdSheet();
  const last = sheet.getLastRow();
  if (last < 2) { Logger.log('まだuserIdを受信していません。増田さんにLINEで一言送ってもらってください。'); return; }
  Logger.log('最新userId： ' + sheet.getRange(last, 2).getValue());
}

// ============================================================
// 改修⑥：doGet ルーティング（JSON API ＋ 管理画面）
// ============================================================
function doGet(e) {
  const p = e && e.parameter ? e.parameter : {};

  // 管理画面
  if (p.page === 'admin') return serveAdmin(p);

  // JSON API
  const action = p.action || 'list';
  let data;
  if (action === 'list')        data = getBlogList();
  else if (action === 'detail') data = getBlogDetail(parseInt(p.id, 10));
  else                          data = { error: 'Invalid action' };

  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function serveAdmin(p) {
  if (p.key !== CONFIG.ADMIN_KEY || !CONFIG.ADMIN_KEY) {
    return HtmlService.createHtmlOutput(
      '<div style="font-family:sans-serif;text-align:center;padding:60px 20px;color:#5A5A5A;">'
      + '<p style="font-size:16px;">アクセスできません</p>'
      + '<p style="font-size:13px;margin-top:10px;">URLをご確認ください。</p></div>'
    ).setTitle('HYGGE ブログ管理');
  }
  return HtmlService.createHtmlOutputFromFile('admin')
    .setTitle('HYGGE ブログ管理')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ============================================================
// 公開データ取得（フロント用）
// ============================================================
function getBlogList() {
  const sheet = getSheet();
  const last = sheet.getLastRow();
  const articles = [];
  for (let i = 2; i <= last; i++) {
    if (!sheet.getRange(i, COL.PUBLISHED).getValue()) continue;
    if (!sheet.getRange(i, COL.TITLE).getValue()) continue;
    articles.push({
      id: i,
      title: sheet.getRange(i, COL.TITLE).getValue(),
      excerpt: getExcerpt(sheet.getRange(i, COL.BODY).getValue()),
      date: formatDate(sheet.getRange(i, COL.DATE).getValue()),
      imageUrl: sheet.getRange(i, COL.IMAGE_URL).getValue(),
      category: sheet.getRange(i, COL.CATEGORY).getValue(),
    });
  }
  return articles.reverse();
}

function getBlogDetail(rowId) {
  const sheet = getSheet();
  if (!rowId || !sheet.getRange(rowId, COL.PUBLISHED).getValue()) return { error: '記事が見つかりません' };
  return {
    id: rowId,
    title: sheet.getRange(rowId, COL.TITLE).getValue(),
    body: sheet.getRange(rowId, COL.BODY).getValue(),
    date: formatDate(sheet.getRange(rowId, COL.DATE).getValue()),
    imageUrl: sheet.getRange(rowId, COL.IMAGE_URL).getValue(),
    category: sheet.getRange(rowId, COL.CATEGORY).getValue(),
  };
}

// ============================================================
// 改修⑥：管理画面サーバー側（未公開含む全件 ＋ 公開切替）
// ============================================================
function getAdminList() {
  const sheet = getSheet();
  const last = sheet.getLastRow();
  const rows = [];
  let pub = 0, unpub = 0;
  for (let i = 2; i <= last; i++) {
    const title = sheet.getRange(i, COL.TITLE).getValue();
    if (!title) continue; // 未生成のキーワード行は除外
    const published = !!sheet.getRange(i, COL.PUBLISHED).getValue();
    published ? pub++ : unpub++;
    rows.push({
      id: i,
      title: title,
      excerpt: getExcerpt(sheet.getRange(i, COL.BODY).getValue()),
      body: sheet.getRange(i, COL.BODY).getValue(),
      date: formatDate(sheet.getRange(i, COL.DATE).getValue()),
      imageUrl: sheet.getRange(i, COL.IMAGE_URL).getValue(),
      category: sheet.getRange(i, COL.CATEGORY).getValue(),
      status: sheet.getRange(i, COL.STATUS).getValue(),
      published: published,
    });
  }
  rows.reverse();
  return { published: pub, unpublished: unpub, articles: rows };
}

function setPublished(rowId, flag) {
  const sheet = getSheet();
  sheet.getRange(rowId, COL.PUBLISHED).setValue(!!flag);
  sheet.getRange(rowId, COL.STATUS).setValue(flag ? '公開済み' : '完了（未公開）');
  return getAdminList();
}

// ============================================================
// ユーティリティ
// ============================================================
function getSheet() {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(SHEET_NAME);
}

function getNextKeywordRow(sheet) {
  const last = sheet.getLastRow();
  for (let i = 2; i <= last; i++) {
    const keyword = sheet.getRange(i, COL.KEYWORD).getValue();
    const title   = sheet.getRange(i, COL.TITLE).getValue();
    const status  = sheet.getRange(i, COL.STATUS).getValue();
    if (keyword && !title && status !== '生成中') return i;
  }
  return null;
}

function getExcerpt(body) {
  const plain = String(body || '')
    .replace(/#{1,6}\s/g, '')
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
    .replace(/\n+/g, ' ')
    .trim();
  return plain.length > 120 ? plain.substring(0, 120) + '…' : plain;
}

function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.getFullYear() + '.' +
    String(d.getMonth() + 1).padStart(2, '0') + '.' +
    String(d.getDate()).padStart(2, '0');
}

function getAdminUrl() {
  const base = CONFIG.WEBAPP_URL || ScriptApp.getService().getUrl();
  return base + '?page=admin&key=' + encodeURIComponent(CONFIG.ADMIN_KEY);
}

// ============================================================
// セットアップ・トリガー
// ============================================================
function setupSpreadsheet() {
  const sheet = getSheet();
  const headers = ['キーワード', 'タイトル', '本文（Markdown）', '生成日', '公開フラグ', '画像URL', 'ステータス', 'カテゴリ'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.setFrozenRows(1);
  Logger.log('ヘッダー（8列）を設定しました');
}

// 改修⑦：週2回（火・金 9:00）のトリガー
function setWeeklyTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyBlogGeneration') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyBlogGeneration').timeBased().onWeekDay(ScriptApp.WeekDay.TUESDAY).atHour(9).create();
  ScriptApp.newTrigger('dailyBlogGeneration').timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(9).create();
  Logger.log('火・金 9:00 のトリガーを2本設定しました');
}
