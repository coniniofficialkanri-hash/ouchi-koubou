/* ============================================================
 *  build-blog.js — ブログ静的生成（SEO対応）
 *  スプレッドシート(GAS)の「ブログ」データから、記事ごとの
 *  HTML・ブログ一覧・sitemap.xml を生成します。
 *
 *  実行: node build-blog.js
 *  （GitHub Actions で定期自動実行 → Vercel公開）
 *
 *  ★ 公開前に SITE_URL を本番ドメインに変更してください ★
 * ============================================================ */

const fs = require('fs');
const path = require('path');

// ---- 設定 ----------------------------------------------------
const GAS_URL  = 'https://script.google.com/macros/s/AKfycbyWDymEg-5fa75qh0o-NYM8e3T667Qcugv1j27nITZHYDI3gPc1XJkZ0Bm9QdgeDOta/exec';
const SITE_URL = 'https://hygge-kumamoto.com';     // 本番ドメイン（2026-09-10 取得・末尾スラッシュなし）
const SITE_NAME = 'HYGGE（ヒュッゲ）熊本';   // GBPの店名表記に合わせる（2026-09-21・店名検索13位対策）
const OUT_DIR  = path.join(__dirname, 'blog');
const POSTS_DIR = path.join(__dirname, 'blog-posts'); // 自動生成の記事（1記事1JSON）
// -------------------------------------------------------------

function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
function attr(s){ return esc(s).replace(/'/g, '&#39;'); }

async function getData(){
  if (process.env.MOCK) return JSON.parse(fs.readFileSync(process.env.MOCK, 'utf8'));
  // GASのウェブアプリは一時的に404/500を返すことがある（実際に発生）。3回まで待って試す。
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(GAS_URL, { redirect: 'follow' });
      if (!res.ok) throw new Error('GAS fetch failed: ' + res.status);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (i < 2) await new Promise(r => setTimeout(r, 3000 * (i + 1)));
    }
  }
  throw lastErr;
}

// blog-posts/*.json を読む（_ で始まるファイルは設定用なので読み飛ばす）
function readLocalPosts(){
  if (!fs.existsSync(POSTS_DIR)) return [];
  return fs.readdirSync(POSTS_DIR)
    .filter(f => f.endsWith('.json') && !f.startsWith('_'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(POSTS_DIR, f), 'utf8')); }
      catch (e) { console.error('読み込み失敗: blog-posts/' + f + ' — ' + e.message); return null; }
    })
    .filter(b => b && b.title && b.body);
}

// 画像がサイト内の相対パス（/shop-05.webp）なら本番URLを補う
function absImage(b){
  if (b.image && b.image.startsWith('/')) b.image = SITE_URL + b.image;
  return b;
}

// 「2026/09/10」「2026.09.10」「2026-09-10」を比較できる数値にする
function dateKey(b){
  const m = String(b.date || '').replace(/[.\/]/g, '-').match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]) : 0;
}

function slugOf(b, i){
  const s = (b.slug || '').toString().trim().toLowerCase()
    .replace(/[^a-z0-9\-]+/g, '-').replace(/^-+|-+$/g, '');
  return s || ('post-' + (i + 1));
}

function toParagraphs(body){
  const text = String(body || '').replace(/\r\n/g, '\n').trim();
  if (!text) return '<p>本文は準備中です。</p>';
  return text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
    .map(p => '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>').join('\n      ');
}

function pageCSS(){
  return `
    :root{--ivory:#EFE8D7;--warm-white:#FBF7EF;--moss:#4A6741;--gold:#D4A629;
      --text-dark:#2C2C2C;--text-mid:#5A5A5A;--text-light:#9A9A9A;--line:#E0DAD0;}
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Noto Sans JP',sans-serif;background:var(--warm-white);color:var(--text-dark);line-height:1.9;}
    .a-nav{position:sticky;top:0;background:rgba(251,247,239,.95);backdrop-filter:blur(12px);
      border-bottom:1px solid var(--line);padding:12px 20px;}
    .a-nav a{display:inline-flex;align-items:center;gap:8px;text-decoration:none;color:var(--text-dark);}
    .a-nav img{height:42px;width:auto;display:block;}
    .a-wrap{max-width:720px;margin:0 auto;padding:40px 20px 80px;}
    .a-date{font-size:13px;letter-spacing:.08em;color:var(--gold);font-weight:600;}
    .a-title{font-family:'Noto Serif JP',serif;font-size:clamp(24px,4.5vw,34px);font-weight:700;
      line-height:1.5;margin:10px 0 22px;color:var(--text-dark);}
    .a-hero{width:100%;height:auto;border-radius:8px;display:block;margin-bottom:30px;}
    .a-body p{font-size:16px;color:var(--text-mid);margin-bottom:1.4em;}
    .a-back{display:inline-block;margin-top:40px;font-size:14px;color:var(--moss);text-decoration:none;font-weight:500;}
    .a-foot{border-top:1px solid var(--line);text-align:center;padding:30px 20px;color:var(--text-light);font-size:12px;}
    .bl-head{text-align:center;max-width:640px;margin:0 auto 40px;}
    .bl-label{font-size:12px;letter-spacing:.22em;color:var(--moss);font-weight:500;}
    .bl-title{font-family:'Noto Serif JP',serif;font-size:clamp(26px,4.4vw,40px);font-weight:600;margin-top:10px;}
    .bl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:24px;max-width:1100px;margin:0 auto;}
    .bl-card{display:block;text-decoration:none;color:inherit;background:var(--warm-white);
      border:1px solid var(--line);border-radius:8px;overflow:hidden;transition:transform .3s,box-shadow .3s;}
    .bl-card:hover{transform:translateY(-4px);box-shadow:0 12px 30px rgba(74,103,65,.12);}
    .bl-thumb{aspect-ratio:16/10;overflow:hidden;background:var(--ivory);}
    .bl-thumb img{width:100%;height:100%;object-fit:cover;display:block;}
    .bl-body{padding:18px 20px 22px;}
    .bl-card .d{font-size:12px;color:var(--gold);font-weight:600;letter-spacing:.08em;}
    .bl-card h3{font-family:'Noto Serif JP',serif;font-size:16px;font-weight:600;line-height:1.5;margin:7px 0 8px;}
    .bl-card p{font-size:13px;color:var(--text-mid);line-height:1.8;}`;
}

function navBar(){
  // 表示用リンクは相対パス（ドメイン未設定でも動く）。blog/配下から見たルートは ../
  return `<div class="a-nav"><a href="../index.html"><img src="../logo.png" alt="${attr(SITE_NAME)}"></a></div>`;
}

function articleHTML(b, slug){
  const url   = `${SITE_URL}/blog/${slug}.html`;
  const title = esc(b.title || '記事');
  const desc  = esc((b.excerpt || String(b.body||'').replace(/\s+/g,' ').slice(0,110)).trim());
  const img   = b.image ? esc(b.image) : `${SITE_URL}/logo.png`;
  const date  = esc(b.date || '');
  const isoDate = (String(b.date||'').replace(/[.\/]/g,'-').match(/\d{4}-\d{1,2}-\d{1,2}/)||[''])[0];
  const ld = {
    "@context":"https://schema.org","@type":"BlogPosting",
    "headline": b.title || '', "description": b.excerpt || '',
    "image": img, "datePublished": isoDate || undefined,
    "author":{"@type":"Organization","name":SITE_NAME},
    "publisher":{"@type":"Organization","name":SITE_NAME,"logo":{"@type":"ImageObject","url":`${SITE_URL}/logo.png`}},
    "mainEntityOfPage": url
  };
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}｜${esc(SITE_NAME)}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${img}">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="${esc(SITE_NAME)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;600;700&family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>${pageCSS()}</style>
</head>
<body>
${navBar()}
<article class="a-wrap">
  <div class="a-date">${date}</div>
  <h1 class="a-title">${title}</h1>
  ${b.image ? `<img class="a-hero" src="${img}" alt="${attr(b.title)}">` : ''}
  <div class="a-body">
      ${toParagraphs(b.body)}
  </div>
  <a class="a-back" href="index.html">← ブログ一覧へ</a>
</article>
<div class="a-foot">© 2026 ${esc(SITE_NAME)}</div>
</body>
</html>`;
}

function indexHTML(posts){
  const cards = posts.map(p => {
    const href = p.link ? esc(p.link) : `${SITE_URL}/blog/${p._slug}.html`;
    const thumb = p.image ? `<div class="bl-thumb"><img src="${esc(p.image)}" alt="${attr(p.title)}"></div>` : '';
    return `    <a class="bl-card" href="${href}">${thumb}
      <div class="bl-body"><span class="d">${esc(p.date||'')}</span>
        <h3>${esc(p.title)}</h3><p>${esc(p.excerpt||'')}</p></div></a>`;
  }).join('\n');
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ブログ｜${esc(SITE_NAME)}</title>
<meta name="description" content="${esc(SITE_NAME)}のブログ。植物の育て方や暮らしのヒントをお届けします。">
<link rel="canonical" href="${SITE_URL}/blog/">
<meta property="og:type" content="website">
<meta property="og:title" content="ブログ｜${esc(SITE_NAME)}">
<meta property="og:image" content="${SITE_URL}/logo.png">
<meta property="og:url" content="${SITE_URL}/blog/">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;600;700&family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
<style>${pageCSS()}</style>
</head>
<body>
${navBar()}
<main class="a-wrap" style="max-width:1140px;">
  <div class="bl-head"><p class="bl-label">ブログ</p><h1 class="bl-title">読みもの</h1></div>
  <div class="bl-grid">
${cards || '<p style="grid-column:1/-1;text-align:center;color:var(--text-light)">記事は近日公開予定です。</p>'}
  </div>
</main>
<div class="a-foot">© 2026 ${esc(SITE_NAME)}</div>
</body>
</html>`;
}

function sitemap(posts){
  const urls = [`${SITE_URL}/`, `${SITE_URL}/blog/`]
    .concat(posts.map(p => `${SITE_URL}/blog/${p._slug}.html`));
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>`;
}

// トップページ（index.html）の「読みもの」欄に最新記事のカードを静的に書き込む。
// 以前はGASからJSで描画していたため、検索エンジンにもスプレッドシート外の記事にもリンクが無かった（2026-09-21）
function writeTopLatest(posts){
  const file = path.join(__dirname, 'index.html');
  const START = '<!-- BLOG-LATEST:START（build-blog.js が自動で書き換えます） -->';
  const END = '<!-- BLOG-LATEST:END -->';
  const html = fs.readFileSync(file, 'utf8');
  const a = html.indexOf(START), z = html.indexOf(END);
  if (a < 0 || z < a) { console.log('index.html に BLOG-LATEST の目印が無いため、トップの記事欄は更新しません'); return; }
  const cards = posts.map(p => {
    const img = p.image ? `<div class="blog-thumb"><img src="${attr(p.image.replace(SITE_URL, ''))}" alt="${attr(p.title)}" loading="lazy"></div>` : '';
    const date = p.date ? `<span class="blog-date">${esc(p.date)}</span>` : '';
    return `    <a href="blog/${p._slug}.html" class="blog-card reveal visible">${img}<div class="blog-body">${date}<h3 class="blog-title">${esc(p.title)}</h3><p class="blog-excerpt">${esc(p.excerpt || '')}</p><span class="blog-more">続きを読む →</span></div></a>`;
  }).join('\n');
  const body = (cards || '    <p class="blog-empty">ブログは近日公開予定です。</p>') +
    '\n    <p class="blog-all" style="grid-column:1/-1;text-align:center;margin-top:8px;"><a href="blog/">記事の一覧を見る →</a></p>';
  const out = html.slice(0, a + START.length) + '\n' + body + '\n' + html.slice(z);
  if (out !== html) { fs.writeFileSync(file, out); console.log('トップの記事欄: ' + posts.length + ' 件を書き込み'); }
}

async function main(){
  const data = await getData();
  const fromSheet = (data.blog || []).filter(b => b && b.title);
  const fromFiles = readLocalPosts();

  // スラッグが重なったら blog-posts/ 側を採用（あとから直せるのはこちらなので）
  const bySlug = new Map();
  fromSheet.forEach((b, i) => { b._slug = slugOf(b, i); bySlug.set(b._slug, absImage(b)); });
  fromFiles.forEach((b, i) => { b._slug = slugOf(b, i); bySlug.set(b._slug, absImage(b)); });

  const posts = Array.from(bySlug.values()).sort((a, b) => dateKey(b) - dateKey(a));
  console.log(`記事の内訳: スプレッドシート ${fromSheet.length} 件 / blog-posts ${fromFiles.length} 件`);

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  posts.forEach(b => {
    fs.writeFileSync(path.join(OUT_DIR, b._slug + '.html'), articleHTML(b, b._slug));
  });
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), indexHTML(posts));
  fs.writeFileSync(path.join(__dirname, 'sitemap.xml'), sitemap(posts));
  writeTopLatest(posts.slice(0, 6));

  console.log(`生成完了: 記事 ${posts.length} 件 / blog/index.html / sitemap.xml`);
  posts.forEach(b => console.log('  - blog/' + b._slug + '.html  (' + b.title + ')'));
}

main().catch(e => { console.error(e); process.exit(1); });
