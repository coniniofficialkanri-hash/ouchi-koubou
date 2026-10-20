/* ============================================================
 *  seo-audit.js — 公開中のサイトをSEO/MEO/AIOの観点で点検する
 *
 *  実行: node tools/seo-audit.js            （本番を見る）
 *        node tools/seo-audit.js --local    （手元のファイルを見る）
 *
 *  出力: 人が読む要約（標準出力）＋ tools/seo-history.json に履歴を追記
 *  終了コード: 赤（要修正）が1つでもあれば 1
 * ============================================================ */
const fs = require('fs');
const path = require('path');

const SITE = 'https://hygge-kumamoto.com';
const ROOT = path.join(__dirname, '..');
const HISTORY = path.join(__dirname, 'seo-history.json');
const LOCAL = process.argv.includes('--local');

const results = [];
const add = (level, area, msg) => results.push({ level, area, msg });
const ok = (area, msg) => add('ok', area, msg);
const warn = (area, msg) => add('warn', area, msg);
const bad = (area, msg) => add('bad', area, msg);

async function get(urlPath){
  if (LOCAL) {
    let f = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, ''));
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    return fs.existsSync(f) ? { status: 200, text: fs.readFileSync(f, 'utf8') } : { status: 404, text: '' };
  }
  try {
    const res = await fetch(SITE + urlPath, { redirect: 'follow' });
    return { status: res.status, text: await res.text() };
  } catch (e) { return { status: 0, text: '', error: e.message }; }
}

const text = h => h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ');
const meta = (h, re) => (h.match(re) || [])[1] || '';

function jsonLd(html){
  const out = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) { try { out.push(JSON.parse(m[1])); } catch (e) { out.push({ _broken: m[1].slice(0, 80) }); } }
  return out;
}

// ---------- トップページ ----------
async function auditTop(){
  const r = await get('/');
  if (r.status !== 200) { bad('トップ', `表示できない（HTTP ${r.status}）`); return; }
  const h = r.text;

  const title = meta(h, /<title>([\s\S]*?)<\/title>/);
  const desc  = meta(h, /<meta name="description" content="([^"]*)"/);
  const canon = meta(h, /<link rel="canonical" href="([^"]*)"/);
  title.length >= 15 && title.length <= 62 ? ok('トップ', `タイトル ${title.length}字`) : warn('トップ', `タイトルが ${title.length}字（15〜62字が目安）`);
  desc.length  >= 60 && desc.length  <= 140 ? ok('トップ', `説明文 ${desc.length}字`)  : warn('トップ', `説明文が ${desc.length}字（60〜140字が目安）`);
  canon === SITE + '/' ? ok('トップ', '正規URLが正しい') : bad('トップ', `正規URLが ${canon || '未設定'}`);

  const h1 = (h.match(/<h1[\s>]/g) || []).length;
  h1 === 1 ? ok('トップ', 'h1が1つ') : bad('トップ', `h1が${h1}個（1つにする）`);

  const ld = jsonLd(h);
  const types = ld.map(x => x && x['@type']).filter(Boolean);
  const biz = ld.find(x => ['Store','LocalBusiness','GardenStore','HomeGoodsStore'].includes(x && x['@type']));
  const faq = ld.find(x => x && x['@type'] === 'FAQPage');
  const site = ld.find(x => x && x['@type'] === 'WebSite');
  site && site.name ? ok('トップ', `サイト名の構造化データあり（${site.name}）`) : warn('トップ', 'サイト名（WebSite）の構造化データが無い');
  if (biz && !/ヒュッゲ/.test(biz.name || '')) warn('MEO', `店舗の構造化データの店名「${biz.name}」がGBPの表記（HYGGE（ヒュッゲ））と違う`);
  biz ? ok('MEO', `店舗の構造化データあり（${biz['@type']}）`) : bad('MEO', '店舗の構造化データ（LocalBusiness系）が無い');
  faq ? ok('AIO', `FAQの構造化データあり（${(faq.mainEntity||[]).length}問）`) : warn('AIO', 'FAQの構造化データが無い');
  if (ld.some(x => x && x._broken)) bad('構造化データ', 'JSON-LDが壊れている');

  // 電話・住所・営業時間が本文と構造化データで食い違っていないか
  if (biz) {
    const body = text(h).replace(/\s+/g, '');
    // +81-96-285-9061 → 096-285-9061 に直してから本文と突き合わせる
    const tel = (biz.telephone || '').replace(/[^0-9]/g, '').replace(/^81/, '0');
    const telJp = tel.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');
    tel && body.includes(telJp) ? ok('MEO', `電話番号が本文と一致（${telJp}）`) : warn('MEO', `電話番号が本文と一致しない（構造化データ: ${telJp}）`);
    const spec = biz.openingHoursSpecification || [];
    const closed = ['Wednesday','Saturday'];
    const opensDays = spec.flatMap(s => [].concat(s.dayOfWeek || []));
    closed.some(d => opensDays.includes(d)) ? bad('MEO', '定休日（水・土）が営業日として入っている') : ok('MEO', '定休日の指定が正しい');
    const hoursInBody = /11:00\s*[〜~–-]\s*17:00/.test(text(h));
    hoursInBody && spec.every(s => s.opens === '11:00' && s.closes === '17:00') ? ok('MEO', '営業時間が本文と一致') : warn('MEO', '営業時間が本文と食い違う可能性');
  }
  if (types.length) ok('構造化データ', `種類: ${types.join(', ')}`);
}

// ---------- 記事 ----------
async function auditArticles(){
  const sm = await get('/sitemap.xml');
  if (sm.status !== 200) { bad('サイトマップ', `取得できない（HTTP ${sm.status}）`); return []; }
  const urls = [...sm.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  urls.some(u => u.includes('example.com')) ? bad('サイトマップ', 'example.com が残っている') : ok('サイトマップ', `${urls.length}件`);

  const blogDir = path.join(ROOT, 'blog');
  const isNoindex = f => /<meta name="robots" content="[^"]*noindex/.test(fs.readFileSync(path.join(blogDir, f), 'utf8'));
  const all = fs.readdirSync(blogDir).filter(f => f.endsWith('.html') && f !== 'index.html');
  const files = all.filter(f => !isNoindex(f));
  for (const f of ['detail.html', 'index_static_backup.html']) if (all.includes(f) && !isNoindex(f)) bad('記事', `${f}（記事ではないページ）が検索に出る設定になっている`);
  const thin = all.filter(f => isNoindex(f) && !['detail.html', 'index_static_backup.html'].includes(f));
  if (thin.length) warn('記事', `本文が薄いため noindex 中 ${thin.length}本（書き直し待ち）: ${thin.join(', ')}`);
  const noLastmod = (sm.text.match(/<url>/g) || []).length - (sm.text.match(/<lastmod>/g) || []).length;
  noLastmod ? warn('サイトマップ', `更新日(lastmod)の無いURL ${noLastmod}件`) : ok('サイトマップ', '全URLに更新日あり');
  const missing = files.filter(f => !urls.some(u => u.endsWith('/blog/' + f)));
  missing.length ? bad('サイトマップ', `未掲載の記事 ${missing.length}件: ${missing.join(', ')}`) : ok('サイトマップ', '記事がすべて載っている');

  const arts = urls.filter(u => u.includes('/blog/') && u.endsWith('.html'));
  for (const u of arts) {
    const p = u.replace(SITE, '');
    const r = await get(p);
    const name = p.split('/').pop();
    if (r.status !== 200) { bad('記事', `${name} が HTTP ${r.status}`); continue; }
    const h = r.text;
    const canon = meta(h, /<link rel="canonical" href="([^"]*)"/);
    if (canon !== u) bad('記事', `${name} の正規URLが ${canon || '未設定'}`);
    const ld = jsonLd(h)[0] || {};
    if (ld['@type'] !== 'BlogPosting') bad('記事', `${name} に記事の構造化データが無い`);
    else if (!ld.datePublished) warn('記事', `${name} に公開日が入っていない`);
    const body = text(h).replace(/\s+/g, '');
    if (/<meta name="robots" content="[^"]*noindex/.test(h)) bad('記事', `${name} がサイトマップに載っているのに noindex`);
    const main = text((h.match(/<div class="a-body">([\s\S]*?)<section class="a-(?:shop|rel)"/) || [, h])[1]).replace(/\s+/g, '');
    if (main.length < 2000) warn('記事', `${name} の本文が${main.length}字（3000字以上が目安）`);
    if (!/href="[^"]*hygge-kumamoto\.com\/?"|href="\.\.\/(?:index\.html)?(?:#[^"]*)?"/.test(h)) warn('記事', `${name} から店舗ページへのリンクが無い`);
    const imgs = [...h.matchAll(/<img [^>]*>/g)].map(m => m[0]);
    const noAlt = imgs.filter(t => !/alt="[^"]+"/.test(t)).length;
    if (noAlt) warn('記事', `${name} に説明文(alt)の無い画像 ${noAlt}枚`);
  }
  ok('記事', `${arts.length}本を点検`);
  return arts;
}

// ---------- 土台 ----------
async function auditBasics(){
  for (const [p, label] of [['/robots.txt','robots.txt'], ['/llms.txt','llms.txt（AI向け案内）'], ['/blog/','ブログ一覧']]) {
    const r = await get(p);
    if (r.status === 200) ok('土台', `${label} あり`);
    else if (p === '/llms.txt') warn('土台', `${label} が無い`);
    else bad('土台', `${label} が HTTP ${r.status}`);
  }
  const rb = await get('/robots.txt');
  if (rb.status === 200 && !/Sitemap:/i.test(rb.text)) warn('土台', 'robots.txt にサイトマップの場所が書かれていない');
  if (rb.status === 200 && /Disallow:\s*\/\s*$/m.test(rb.text)) bad('土台', 'robots.txt が全ページを拒否している');
}

(async () => {
  await auditBasics();
  await auditTop();
  await auditArticles();

  const n = l => results.filter(r => r.level === l).length;
  const icon = { ok: '○', warn: '△', bad: '×' };
  console.log(`\nHYGGE SEO/MEO/AIO 点検  ${LOCAL ? '（手元のファイル）' : SITE}`);
  console.log(`○ ${n('ok')} / △ ${n('warn')} / × ${n('bad')}\n`);
  for (const lv of ['bad','warn','ok']) {
    results.filter(r => r.level === lv).forEach(r => console.log(`${icon[lv]} [${r.area}] ${r.msg}`));
  }

  const hist = fs.existsSync(HISTORY) ? JSON.parse(fs.readFileSync(HISTORY, 'utf8')) : [];
  hist.push({
    date: new Date().toISOString().slice(0, 10),
    ok: n('ok'), warn: n('warn'), bad: n('bad'),
    issues: results.filter(r => r.level !== 'ok').map(r => `[${r.area}] ${r.msg}`)
  });
  fs.writeFileSync(HISTORY, JSON.stringify(hist.slice(-60), null, 2) + '\n');
  console.log(`\n履歴: tools/seo-history.json（${hist.length}回目）`);
  process.exit(n('bad') ? 1 : 0);
})();
