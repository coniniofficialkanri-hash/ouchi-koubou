# tools

HYGGEサイトの点検と改善の道具。

| ファイル | 中身 |
|---|---|
| `seo-audit.js` | 公開中のサイトをSEO/MEO/AIOの観点で点検する。`node tools/seo-audit.js`（本番）/ `--local`（手元）|
| `seo-history.json` | 点検結果の履歴（○△×の数と指摘）。直近60回分 |
| `search-log.json` | Search Consoleの数字（週次・クリック/表示/順位/上位クエリ） |
| `gbp-log.json` | Googleビジネスプロフィールの数字（週次・表示/通話/ルート/サイトクリック） |
| `pdca.md` | 毎週の判断と打ち手の記録。数字→仮説→やったこと→次に見る指標 |

点検は毎週月曜の巡回（`cockpit-pc-requests`）が自動で回す。
× が出たら、その場で直せるものは直して push する。
