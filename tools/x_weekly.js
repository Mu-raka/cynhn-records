/* 週1回のメンテナンス用：X（x.com）のタブで実行して、指定した日付のツイートを集める。
   ・ファンの投稿：ブラウザの localStorage "cyn_fanlist"（ファンのアカウント名の配列。リポジトリには置かない）にある人だけ
   ・メンバーの投稿：サンクス・感想など関連ツイートだけ（日付ごとに上位3件）
   使い方：window.__WK_DATES = ["2026-10-04", ...]; のあとにこのファイルの中身を実行。
   進み具合は window.__wk.status、結果は localStorage "cyn_weekly_fan" / "cyn_weekly_mem"（1行1日付「件数 日付 チェックサム id:いいね,...」）
   出力にはツイートIDといいね数だけを入れる（本文は出さない） */
(function () {
  if (window.__wk && window.__wk.active) return "already";
  var R = window.__wk = { active: true, status: "start", log: [] };
  var S = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var FANS = new Set((JSON.parse(localStorage.getItem("cyn_fanlist") || "[]")).map(function (h) { return String(h).toLowerCase(); }));
  var MEMS = ["_shiki_ayase", "ds_toru17", "tsukumoneru", "minori_hirose"];
  var KW = "(CYNHN OR #CYNHN OR スウィーニー OR 綾瀬志希 OR 月雲ねる OR 青柳透 OR 広瀬みのり)";
  var EV = /ライブ|公演|ワンマン|ツアー|リリイベ|リリース|イベント|対バン|フェス|ステージ|特典会|配信|現場|会場|千秋楽|ファイナル|本番|来てくれ|会いに|ふぁんず|フロア|お客さん|みんな|今日|本日|ありがとうございました/;
  var POS = /ありがとうございました|ありがとうございます|ありがとう[！!〜~♡❤]|ありがとうね|楽しかった|たのしかった|嬉しかった|うれしかった|幸せ(な|だった|でした)|感動|お疲れ様でした|最高(だった|でした|の(ライブ|時間|一日|1日))/;
  var NG = /^おはよう|今日の青|待ってます|待ってるね|お待ちしてます|チケット(発売|予約)/;
  var P = 1000000007n;
  function plus(d, n) { var t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
  function jst(iso) { return new Date(Date.parse(iso) + 9 * 3600e3).toISOString(); }
  // 夜中0〜6時の投稿は前の日のイベントの感想として扱う
  function eventDay(iso) { var j = jst(iso), d = j.slice(0, 10); return +j.slice(11, 13) < 6 ? plus(d, -1) : d; }
  function likesOf(a) {
    var g = a.querySelector('[role="group"][aria-label]'), s = g ? g.getAttribute("aria-label") : "";
    var m = s.match(/([\d,.]+)\s*(万)?\s*件のいいね/); if (m) { var n = parseFloat(m[1].replace(/,/g, "")); if (m[2]) n *= 1e4; return Math.round(n); }
    m = s.match(/([\d,.]+)\s*([KM])?\s*likes?/i); if (!m) return 0;
    n = parseFloat(m[1].replace(/,/g, "")); if (m[2] === "K") n *= 1e3; if (m[2] === "M") n *= 1e6; return Math.round(n);
  }
  var body = function () { return (document.querySelector("main") || document.body).innerText; };
  async function search(q, live) {
    history.pushState({}, "", "/search?q=" + encodeURIComponent(q) + "&src=typed_query" + (live ? "&f=live" : ""));
    window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    for (var k = 0; k < 24; k++) { await S(500); if (document.querySelector('article[data-testid="tweet"] time') || (k > 8 && /検索結果はありません|No results|問題が発生/.test(body()))) break; }
    var out = {}, idle = 0;
    for (var r = 0; r < 30 && idle < 3; r++) {
      var n = Object.keys(out).length;
      document.querySelectorAll('article[data-testid="tweet"]').forEach(function (a) {
        var t = a.querySelector("time"), l = t && t.closest("a"); if (!l) return;
        var m = l.href.match(/\/([^/]+)\/status\/(\d+)/); if (!m) return;
        out[m[2]] = { h: m[1].toLowerCase(), day: eventDay(t.getAttribute("datetime")), likes: likesOf(a), reply: /返信先/.test(a.innerText),
          tx: ((a.querySelector('[data-testid="tweetText"]') || {}).innerText || "").replace(/\s+/g, " ") };
      });
      window.scrollBy(0, 2500); await S(1500);
      idle = Object.keys(out).length === n ? idle + 1 : 0;
    }
    return out;
  }
  function line(d, items) {
    var s = items.reduce(function (a, x) { return (a + BigInt(x[0]) + BigInt(x[1])) % P; }, 0n);
    return items.length + " " + d + " " + s + " " + items.map(function (x) { return x[0] + ":" + x[1]; }).join(",");
  }
  (async function () {
    var dates = (window.__WK_DATES || []).slice(), fanOut = [], memOut = [];
    if (!FANS.size) R.log.push("cyn_fanlist が空です（ファンの投稿は集めません）");
    for (var i = 0; i < dates.length; i++) {
      var d = dates[i], range = " since:" + d + " until:" + plus(d, 2);
      R.status = (i + 1) + "/" + dates.length + " " + d + " fans";
      var got = {};
      var a1 = await search(KW + range, false); await S(8000);
      var a2 = await search(KW + range, true); await S(8000);
      [a1, a2].forEach(function (o) { Object.keys(o).forEach(function (id) { got[id] = o[id]; }); });
      var fans = Object.keys(got).filter(function (id) { var t = got[id]; return t.day === d && FANS.has(t.h); })
        .map(function (id) { return [id, got[id].likes]; }).sort(function (x, y) { return y[1] - x[1]; }).slice(0, 30);
      if (fans.length) fanOut.push(line(d, fans));
      R.status = (i + 1) + "/" + dates.length + " " + d + " members";
      var m = await search("(" + MEMS.map(function (h) { return "from:" + h; }).join(" OR ") + ") -filter:replies" + range, true); await S(8000);
      var mem = Object.keys(m).filter(function (id) { var t = m[id]; return t.day === d && MEMS.indexOf(t.h) >= 0 && t.tx.length >= 30 && EV.test(t.tx) && POS.test(t.tx) && !NG.test(t.tx); })
        .map(function (id) { return [id, m[id].likes]; }).sort(function (x, y) { return y[1] - x[1]; }).slice(0, 3);
      if (mem.length) memOut.push(line(d, mem));
      R.log.push(d + " fans " + fans.length + " / members " + mem.length);
      localStorage.setItem("cyn_weekly_fan", fanOut.join("\n")); localStorage.setItem("cyn_weekly_mem", memOut.join("\n"));
    }
    R.status = "finished"; R.active = false;
  })();
  return "started";
})();
