// ============================================================
//  HYGGE PLANTS & ZAKKA — イベント / ブログ 配信API（GAS WebApp）
//  オーナーがスプレッドシートを更新するだけでHPに反映されます。
//
//  スプレッドシート構成（1行目は見出し、2行目からデータ）
//  ┌─ シート名「イベント」
//  │   A:日付  B:タイトル  C:詳細  D:画像  E:タグ  F:表示
//  └─ シート名「ブログ」
//      A:日付  B:タイトル  C:抜粋  D:画像  E:リンク  F:表示
//
//  ・画像 … 画像の直リンクURL、またはGoogleドライブの共有リンクでOK
//           （ドライブ共有リンクは自動で表示用URLに変換します）
//  ・タグ … イベントの「NEW OPEN」「コラボ」などの小さなラベル（任意）
//  ・リンク … ブログ詳細ページのURL（任意。空なら # ）
//  ・表示 … FALSE と入れるとそのカードを非表示。空 or TRUE で表示
// ============================================================

var EVENTS_SHEET = 'イベント';
var BLOG_SHEET   = 'ブログ';

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var payload = {
    events: readSheet(ss, EVENTS_SHEET, ['date', 'title', 'desc',    'image', 'tag',  'show']),
    blog:   readSheet(ss, BLOG_SHEET,   ['date', 'title', 'excerpt', 'image', 'link', 'show'])
  };
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function readSheet(ss, name, keys) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var data = sheet.getRange(2, 1, lastRow - 1, keys.length).getValues();
  var out = [];

  data.forEach(function(row) {
    var obj = {};
    keys.forEach(function(k, i) {
      var v = row[i];
      if (k === 'date' && v instanceof Date) v = formatDate(v);
      if (k === 'image') v = toImageUrl(v);
      obj[k] = (v === null || v === undefined) ? '' : String(v).trim();
    });
    if (!obj.title) return;                                   // タイトル空はスキップ
    if (obj.show && obj.show.toUpperCase() === 'FALSE') return; // 非表示
    out.push(obj);
  });

  return out;
}

function formatDate(d) {
  var y = d.getFullYear();
  var m = ('0' + (d.getMonth() + 1)).slice(-2);
  var day = ('0' + d.getDate()).slice(-2);
  return y + '.' + m + '.' + day;
}

// Googleドライブの共有リンクを <img> で表示できる直リンクに変換
function toImageUrl(v) {
  if (!v) return '';
  v = String(v).trim();
  var m = v.match(/\/d\/([A-Za-z0-9_-]+)/) || v.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (m) return 'https://lh3.googleusercontent.com/d/' + m[1];
  return v; // すでに直リンクURLならそのまま
}
