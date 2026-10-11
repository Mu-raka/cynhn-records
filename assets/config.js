// サイトの設定。公開前にここだけ書き換えればOKです。
window.SITE_CONFIG = {
  // 「出来事の追加依頼」「誤りを報告する」の受付フォーム（Googleフォーム）
  //   url     … フォームの「送信」→リンクで出るURL（https://docs.google.com/forms/d/e/…/viewform）
  //   entries … 事前入力に使う各質問の番号（「事前入力したURLを取得」で出るURLの entry.数字 の数字）
  //   kinds   … 「依頼の種類」の選択肢の文言（フォームの選択肢と完全に同じにする）
  form: {
    url: "https://docs.google.com/forms/d/e/1FAIpQLSe39N2m1EwdOotzjnEIlMTIZbbW9tjsH2gbwFND_nXAubpF5A/viewform",
    entries: { kind: "504806977", date: "765369491", title: "1215122266", link: "1681344706" },
    kinds: { add: "出来事の追加", fix: "誤りの報告" }
  },
  // フォームを使わない場合の受付先（GitHub Issues の …/issues/new など）。form.url があればそちらを優先
  requestUrl: "",
  // 年表データの場所
  dataUrl: "data/events.json",
  // 開催日ごとの関連ツイート（ファンリストの投稿をいいね順に最大30件。画面には5件ずつ出す）。ファイルがなければ表示しない
  top5Url: "data/x_top5.json",
  // true: 出来事を開いたときにXの埋め込み表示で投稿の中身を出す（false にするとリンクだけ）
  embedTweets: true
};
