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
const SITE_URL = 'https://example.com';            // ★本番URLに変更（末尾スラッシュなし）
const SITE_NAME = 'HYGGE PLANTS & ZAKKA';
const OUT_DIR  = path.join(__dirname, 'blog');
// -------------------------------------------------------------

function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
function attr(s){ return esc(s).replace(/'/g, '&#39;'); }

async function getData(){
  if (process.env.MOCK) return JSON.parse(fs.readFileSync(process.env.MOCK, 'utf8'));
  const res = await fetch(GAS_URL);
  if (!res.ok) throw new Error('GAS fetch failed: ' + res.status);
  return await res.json();
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
  return `<div class="a-nav"><a href="${SITE_URL}/"><img src="${SITE_URL}/logo.png" alt="${attr(SITE_NAME)}"></a></div>`;
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
  <a class="a-back" href="${SITE_URL}/blog/">← ブログ一覧へ</a>
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
<urlset xmlns="http://www.sitemap.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>`;
}

async function main(){
  const data = await getData();
  const posts = (data.blog || []).filter(b => b && b.title);
  posts.forEach((b, i) => { b._slug = slugOf(b, i); });

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  posts.forEach(b => {
    fs.writeFileSync(path.join(OUT_DIR, b._slug + '.html'), articleHTML(b, b._slug));
  });
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), indexHTML(posts));
  fs.writeFileSync(path.join(__dirname, 'sitemap.xml'), sitemap(posts));

  console.log(`生成完了: 記事 ${posts.length} 件 / blog/index.html / sitemap.xml`);
  posts.forEach(b => console.log('  - blog/' + b._slug + '.html  (' + b.title + ')'));
}

main().catch(e => { console.error(e); process.exit(1); });
