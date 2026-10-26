# 青の記録｜CYNHN 年表

CYNHN（スウィーニー）の出来事を出典付きで日付順にまとめる、非公式ファン年表サイトです。
HTML / CSS / JavaScript だけで動く静的サイトなので、GitHub Pages にそのまま置けます。

## ファイル構成

```
index.html          ページ本体
assets/style.css    デザイン
assets/app.js       年表の表示・絞り込み・検索
assets/config.js    設定（追加依頼フォームのURLなど）← 公開前にここを書き換える
assets/favicon.svg  アイコン
data/events.json    年表データ（出来事・メンバー・参照ページ）
data/raw/official_live_event.txt  公式サイト LIVE/EVENT一覧の写し（取り込み元）
data/raw/x_setlist_2017_2019.json X #CYNHN_setlist の投稿（2017〜2019年）を公演ごとに整理したもの
tools/check_data.py データの書式チェック
tools/enrich.py     重要度・種別タグ・出演メンバー・ID を付け直す（データを変えたら実行）
tools/import_official.py  公式一覧を events.json に取り込む
tools/import_x_setlist.py X のセットリスト整理データ（2017〜2019年）を events.json に取り込む
tools/add_blogs.py   CYNHNについて書かれた note・ブログ（data/raw/blogs.json）を出来事に結びつける
tools/add_articles.py ワンマン・ツアーのWeb記事（data/raw/articles.json）を出典として足す
tools/import_x_setlist2.py X のセットリスト投稿（2021年4月〜）を読み取って events.json に取り込む
.nojekyll           GitHub Pages で余計な変換をさせないための空ファイル
```

## GitHub Pages で公開する

1. GitHub で新しいリポジトリを作る（例：`cynhn-records`、Public）
2. このフォルダの中身をすべてアップロードする
   - ブラウザから：リポジトリの「Add file → Upload files」にドラッグ＆ドロップ
   - コマンドから：
     ```sh
     git init && git add . && git commit -m "first commit"
     git branch -M main
     git remote add origin https://github.com/<ユーザー名>/cynhn-records.git
     git push -u origin main
     ```
3. リポジトリの「Settings → Pages」で、Source を「Deploy from a branch」、Branch を `main` / `/ (root)` にして Save
4. 1〜2分後に `https://<ユーザー名>.github.io/cynhn-records/` で公開されます

「出来事の追加依頼」「誤りを報告する」は Googleフォームで受け付けます（`assets/config.js` の `form`）。
回答はフォームの「回答」タブ（またはスプレッドシート）で確認できます。
「誤りを報告する」から開くと、種類・日付・出来事名・年表のリンクが入った状態でフォームが開きます。

## 手元で確認する

`index.html` をダブルクリックで開くと、ブラウザの制限でデータが読み込めません。
このフォルダで次のコマンドを実行し、`http://localhost:8000` を開いてください。

```sh
python3 -m http.server 8000
```

## 出来事を追加・修正する

`data/events.json` の `events` に1件ずつ追加します（順番は自動で日付順に並びます）。

```json
{
 "date": "2026-11-16",
 "type": "live",
 "title": "Zepp DiverCityワンマンライブ2026",
 "note": "バンドセット",
 "hl": true,
 "src": [
  {"label": "CYNHN 公式サイト", "url": "https://cynhn.com/contents/1117039"}
 ]
}
```

| 項目 | 内容 |
|---|---|
| `date` | `YYYY-MM-DD`。日が不明なら `YYYY-MM`、月も不明なら `YYYY` |
| `type` | `member` メンバー / `release` リリース / `live` ライブ / `tour` ツアー / `event` リリイベ・ファンイベント / `media` メディア / `other` その他 |
| `title` | 出来事の見出し |
| `note` | 補足（会場、収録内容など）。なければ `""` |
| `hl` | 主な出来事なら `true`（太字になり「主な出来事だけ表示」に残る） |
| `src` | 出典。1件以上つける |
| `status` | 任意。`canceled`（中止）か `postponed`（延期）。タイトルに取り消し線やラベルが付く |
| `setlist` | 任意。曲名の配列。`"▼アンコール"` のように ▼ で始めた行は区切り見出しになる。曲名でも検索できる |

次の項目は `python3 tools/enrich.py` が自動で付けるので、手で書く必要はありません。

| 項目 | 内容 |
|---|---|
| `id` | 共有リンク（`#2019/123456`）用の番号 |
| `imp` | 重要度。3＝★★★（`hl:true`）、2＝★★（ワンマン・ツアー・CDリリース・主催公演・メンバーの動き）、1＝それ以外。手で決めたいときは `imp` を書いて `"imp_manual": true` |
| `tags` | 種別タグ（ワンマン・ライブ・フェス・ツアー・生誕・リリース・特典会・ファンイベント・配信・展示・メディア・メンバー・その他）。手で決めたいときは `"tags_manual": true` |
| `members` | タイトル・補足・セットリストに名前が出てくるメンバー |

今日より後の日付は自動で「予定」と表示されます。
メンバーの在籍期間は `meta.members`、「参照しているページ」は `meta.references` で編集できます。

編集したら、自動項目の付け直しとチェックを走らせます。日付の書き間違いや出典漏れも見つけられます。

```sh
python3 tools/enrich.py
python3 tools/check_data.py
```

## 画面の動き

- 上の年表は年ごとの列が横に並び、その年の主な出来事（★★★）が縦書きで入ります。列を押すとその年の一覧（`#2019`）を開きます
- 一覧は最初は空で、年を選ぶか検索・絞り込み（年・種別・出典・重要度・メンバー）を使うと表示されます。「すべて表示する」で全件（`#all`）
- 行を押すと、参考URL・セットリスト・当時のXの反応（その日の投稿検索）・誤りの報告リンクが開きます。URLが `#年/ID` に変わるので、そのまま共有できます
- `data/x_top5.json` があると、開催日ごとに「関連ツイート」（ファンリストのアカウントの投稿をいいねの多い順に）を5件ずつ、最大30件表示します。ファンリストからはメンバー・公式・レーベル・店舗・メディアなどを除いています。ファイルには投稿IDと集めた時点のいいね数だけを入れ、本文は出来事を開いたときにXの公式埋め込みで読み込みます
  ```json
  {"dates": {"2024-08-21": [{"id": "1826228858133299368", "likes": 120}]}}
  ```
- `assets/config.js` の `requestUrl` を GitHub の `…/issues/new` にしておくと、「誤りを報告する」でタイトルと対象リンクが入った状態の Issue が開きます

## 公式サイトの新しい告知を取り込む

公式サイトの「LIVE/EVENT」一覧（https://cynhn.com/contents/information/live,event ）の新しい告知を、
`data/raw/official_live_event.txt` の先頭に1行1件で書き足してから実行します。

```
2026.12.20|LIVE|2026.12.20(日)「〇〇フェス」＠〇〇に出演いたします。|https://cynhn.com/contents/1234567
```

```sh
python3 tools/import_official.py --dry   # 何が追加・統合されるか確認
python3 tools/import_official.py         # events.json を更新
python3 tools/enrich.py
```

- 既存の出来事と同じ日の同じ公演と判断したものは、新規追加せず既存の出来事に出典を足します
- 同じURLはすでに取り込み済みとして無視するので、何度実行しても重複しません
- グッズ案内など年表に載せないものは、カテゴリ欄を `SKIP` にします
- 自動判定で別物扱いになる同じ出来事は、スクリプト冒頭の `MANUAL_MERGE` に書き足します

## X のセットリストを取り込む

ファンが `#CYNHN_setlist` で投稿しているセットリストを、`data/raw/x_setlist_2017_2019.json` に公演ごとにまとめてあります。
既存の出来事に統合するもの（`merge` に統合先タイトルの語を書く）と、新しく追加するものがあり、次のコマンドで反映します。

```sh
python3 tools/import_x_setlist.py --dry
python3 tools/import_x_setlist.py
python3 tools/enrich.py
```

2021年4月以降の投稿は、本文を `data/raw/x_setlist_2021_2026_part1.tsv` のような名前で1行1投稿（投稿日・投稿ID・本文）にして置くと、
`tools/import_x_setlist2.py` が本文から公演日・公演名・会場・曲目を読み取って、同じ日の出来事と自動で照合します。
1部・2部やステージ違いの投稿は「▼1部」のような見出しでまとめます。
（投稿本文はファンの方の文章なので、このリポジトリには入れていません。年表には曲目と投稿へのリンクだけを載せています）
読み取りにくい投稿は、スクリプト冒頭の `MANUAL`（統合先）・`NEWGROUP`（まとめ方）・`SONG_FIX`（曲目）・`LABELS`（見出し）で直せます。

```sh
python3 tools/import_x_setlist2.py --dry -v   # 照合結果の一覧
python3 tools/import_x_setlist2.py
python3 tools/enrich.py
```

## Web記事を足す

ワンマンライブ・ツアーのライブレポート・インタビュー・開催発表の記事は `data/raw/articles.json` に1件ずつ書き、
`python3 tools/add_articles.py` で同じ日のワンマン・ツアー公演の参考URLに足します（付け先を指定したいときは `event_id`）。

```json
{"event_date": "2025-11-01", "outlet": "音楽ナタリー", "kind": "レポート", "title": "記事の見出し（要約）", "url": "https://natalie.mu/music/news/647328"}
```

## note・ブログを足す

ファンやスタッフが書いた note・ブログは `data/raw/blogs.json` に1件ずつ書き、`python3 tools/add_blogs.py` で
同じ日（または同じ月）の似た出来事、作品の感想ならその作品のリリースに結びつけます。
どの出来事とも結びつかない紹介・考察などは「この年表について」の参考ページに「note・ブログ（読みもの）」としてまとめます。
付け先を指定したいときは `event_id` を書きます。

## データについて

収録は2016年〜2026年12月の予定まで929件、うちセットリスト付きは391件です。

- 2017年8月〜2020年1月のライブ・リリースイベントなど（124公演）は、X の `#CYNHN_setlist` の投稿を月ごとに検索して取り込みました。
  このうち109公演は新規追加、15公演は既存の出来事にセットリストと正確な日付を足しています（例：2ndワンマン『Pray for Blue』は2019年9月23日）
- ワンマンライブ・ツアーについては、ライブレポート・インタビュー・開催発表のWeb記事（Real Sound・音楽ナタリー・OTOTOY・BARKS・Pop'n'Roll・MIKAN・Skream! など）を、実際に開いて確かめたうえで87件付けています
- ファンやレーベルの制作スタッフが書いた note・ブログ125件を、実際に開いて確かめたうえで載せています（91件は出来事に、34件は読みものとして）
- 2021年4月〜2026年10月の `#CYNHN_setlist` の投稿（449件）も月ごとに検索して取り込み、
  公式サイト由来の出来事346件にセットリストと投稿リンクを足し、公式一覧にない15件（配信ライブ・TIF各年のステージなど）を追加しました

- 2020年1月以降のライブ・フェス出演・対バン・リリースイベント・生誕祭・オフ会などは、
  CYNHN公式サイトの LIVE/EVENT 一覧（全75ページ・734件）を全件取得し、重複告知をまとめて取り込みました
- 結成〜2019年、およびリリース・メンバーの動き・ワンマンの位置づけなどは、Wikipedia・テイチクのディスコグラフィ・
  音楽ナタリー・Real Sound・OTOTOY・LiveFans・イベンターノート などから作成しました
- セットリストが画像で投稿されている公演は、文字で取り込めなかったため「セットリストは投稿の画像を参照」としています
- 一部は月までしか分かっていないもの（例：2019年9月『Pray for Blue』）があります
誤りや不足があれば Issue などで知らせてもらえると助かります。

## 注意

ファンが個人で作っている非公式サイトです。CYNHN・ディアステージ・テイチクエンタテインメントとは関係ありません。
写真・ジャケット画像などは権利の都合で載せていません。

## 週1回のメンテナンス（自動）

毎週、公式サイトの新しい告知の取り込みと、直近の開催日のツイート集めをします。

1. 公式サイトの LIVE/EVENT 一覧（1ページ目）を `日付|カテゴリ|タイトル|URL` の形で書き写し、
   `python3 tools/prepend_official.py 書き写したファイル` → `python3 tools/import_official.py` → `python3 tools/enrich.py`
   （enrich.py は、すでに付いている id・タグ・メンバーを変えません。新しい出来事には id と `added`（追加日）が付きます）
2. X のタブで `tools/x_weekly.js` を実行して、直近2週間の開催日のツイートを集める
   （ファンのアカウント一覧はブラウザの localStorage `cyn_fanlist` にだけ置き、リポジトリには入れません）
3. 集めた結果を `python3 tools/merge_x_weekly.py fan ファイル` / `python3 tools/merge_x_weekly.py mem ファイル` で足す
