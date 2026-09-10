# blog-posts

HYGGEブログの記事データ。1記事1ファイル（JSON）。

- `build-blog.js` がここと GAS（スプレッドシート）の両方を読み、`blog/` に静的HTMLを生成する
- スラッグが重なった場合はこのフォルダ側が優先される
- `_plan.json` は次に書く記事のネタ帳（`_` 始まりのファイルは記事として読まれない）

## 記事ファイルの形

```json
{
  "date": "2026/09/10",
  "title": "記事タイトル",
  "excerpt": "一覧と検索結果に出る2行程度の説明",
  "image": "/shop-01.webp",
  "body": "本文。段落は空行で区切る。",
  "slug": "kumamoto-kanyoshokubutsu-shop"
}
```

`image` はサイト内の相対パス。生成時に本番URLが自動で補われる。

## 更新の流れ（自動）

火・金の巡回（`cockpit-pc-requests`）が `_plan.json` の先頭を1本書く →
`node build-blog.js` → commit & push → Vercelが公開 → GBPにも記事リンク付きで投稿。
