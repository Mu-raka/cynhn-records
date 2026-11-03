/* 週1回のメンテナンス用：決まったファンの「感想ツイート」をピックアップする。X（x.com）のタブで実行する。
   ・対象のアカウントはブラウザの localStorage "cyn_pick_handles"（アカウント名の配列）にだけ置く（リポジトリには書かない）
   ・年表の出来事の日ごとに、検索ワードは付けず「from:アカウント since:出来事の日 until:出来事の日+2」
     （＝出来事の日とその翌日）で検索し、出てきた投稿を全部見る
   ・ピックアップの条件：いいねが1以上／返信ではない／イベントの感想らしい（感想の言葉＋ライブ・CYNHN・メンバーの言葉）
   ・選んだ投稿は出来事の日のものとして記録する（翌日の投稿は前の日の感想として扱う。
     ただし翌日も出来事の日なら、翌日の投稿はその日の検索のほうで扱う）
   ・Xの検索は回数制限がきついので、1回の実行で開く検索ページは window.__PK_BUDGET 回まで（既定30回）。
     残りの日付は "cyn_pick_progress"（まだ調べていない日付の配列）に残し、window.__PK_RESUME = true で続きから
   ・回数制限（「問題が発生しました」）が出たら10分待って1回だけやり直し、だめならそこで止める（window.__pk.stopped）。
     window.__PK_RETRIES を2以上にすると、その回数まで15分ずつ待ってやり直す
   使い方：
     週1：window.__PK_DATES = [14日前〜昨日の出来事の日付]; のあとにこのファイルの中身を実行
     過去分をまとめて：window.__PK_DATES = [全部の出来事の日付]; window.__PK_BUDGET = 2000; window.__PK_RETRIES = 30;
       を実行してから中身を実行。途中で止まったら window.__PK_RESUME = true; を付けてもう一度（集めた分は "cyn_pick_found" にためてある）
   進み具合は window.__pk.status / window.__pk.log、結果は localStorage "cyn_pick_out"
   （x_weekly.js と同じ「件数 日付 チェックサム id:いいね,...」）
   → python3 tools/merge_x_weekly.py fan ファイル --event-days --pick で取り込む。
   出力にはツイートIDといいね数だけを入れる（本文は出さない） */
(function () {
  if (window.__pk && window.__pk.active) return "already";
  var R = window.__pk = { active: true, status: "start", log: [], stopped: false, picked: 0, seen: 0, done: 0 };
  var S = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var low = function (h) { return String(h).replace(/^@/, "").toLowerCase(); };
  var HANDLES = (JSON.parse(localStorage.getItem("cyn_pick_handles") || "[]")).map(low);
  if (!HANDLES.length) { R.status = "finished"; R.active = false; R.log.push("cyn_pick_handles が空です"); return "no handles"; }
  function plus(d, n) { var t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
  function jst(iso) { return new Date(Date.parse(iso) + 9 * 3600e3).toISOString(); }
  // 夜中0〜6時の投稿は前の日のイベントの感想として扱う（x_weekly.js と同じ）
  function eventDay(iso) { var j = jst(iso), d = j.slice(0, 10); return +j.slice(11, 13) < 6 ? plus(d, -1) : d; }
  var RESUME = !!window.__PK_RESUME;
  var ALL = (window.__PK_DATES || []).slice().sort().reverse();   // 新しい日から
  var EVENT = new Set(ALL);
  var budget = window.__PK_BUDGET || 30;
  // 感想らしさ：感想の言葉（POS）と、ライブ・CYNHN・メンバーの言葉（CTX）が両方あること。告知・移動中・チケットなどは除く（NG）
  var POS = /楽しかった|嬉し|うれし|たのしかった|楽しすぎ|最高|よかった|良かった|ありがと|感動|泣い|泣け|涙|エモ|尊|かわいかった|可愛かった|かわいすぎ|可愛すぎ|かっこよかった|カッコよかった|素敵|すてき|幸せ|しあわせ|満足|優勝|良すぎ|よすぎ|やばかった|ヤバかった|沁み|染み|刺さ|お疲れ|おつかれ|楽しめ|堪能|凄かった|すごかった|美しかった|綺麗だった|きれいだった|大好き|好きすぎ|忘れられない|最強|神ライブ|神セトリ/;
  var CTX = /CYNHN|cynhn|スウィーニー|綾瀬|志希|月雲|ねるちゃん|ねるさん|青柳|透ちゃん|透さん|とおるちゃん|百瀬|怜ちゃん|崎乃|奏音|桜坂|真愛|広瀬|みのり|ライブ|ワンマン|公演|現場|イベント|特典会|チェキ|リリイベ|フェス|対バン|セトリ|ツアー|千秋楽|ステージ|フロア|アコースティック|アコライ|生誕|定期|配信|歌|曲/;
  var NG = /^おはよう|チケット|予約|発売|当選|落選|整理番号|待ってる|向かって|向かいます|開演前|物販列|RT希望|拡散希望/;
  var body = function () { return (document.querySelector("main") || document.body).innerText; };
  function likesOf(a) {
    var g = a.querySelector('[role="group"][aria-label]'), s = g ? g.getAttribute("aria-label") : "";
    var m = s.match(/([\d,.]+)\s*(万)?\s*件のいいね/); if (m) { var n = parseFloat(m[1].replace(/,/g, "")); if (m[2]) n *= 1e4; return Math.round(n); }
    m = s.match(/([\d,.]+)\s*([KM])?\s*likes?/i); if (!m) return 0;
    n = parseFloat(m[1].replace(/,/g, "")); if (m[2] === "K") n *= 1e3; if (m[2] === "M") n *= 1e6; return Math.round(n);
  }
  var RETRIES = window.__PK_RETRIES || 1, WAIT = RETRIES > 1 ? 900000 : 600000;
  async function open1(q) {
    for (var t = 0; t <= RETRIES; t++) {
      budget--;
      history.pushState({}, "", "/search?q=" + encodeURIComponent(q) + "&src=typed_query&f=live");
      window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
      for (var k = 0; k < 24; k++) { await S(500); if (document.querySelector('article[data-testid="tweet"] time') || (k > 8 && /検索結果はありません|No results|問題が発生/.test(body()))) break; }
      if (!(/問題が発生しました|Something went wrong/.test(body()) && !document.querySelector('article[data-testid="tweet"]'))) return true;
      R.log.push("X error (" + (t + 1) + ") " + new Date().toLocaleTimeString());
      if (t < RETRIES) { R.status = R.status.replace(/ \/ waiting.*$/, "") + " / waiting " + (WAIT / 60000) + "min (" + (t + 1) + ")"; await S(WAIT); }
    }
    return false;
  }
  // 開いている検索結果をスクロールで集める（同じ検索を前に開いているとスクロール位置ごと復元されるので先頭に戻してから）
  async function collect(h, out) {
    window.scrollTo(0, 0); await S(1500);
    var idle = 0;
    for (var r = 0; r < 30 && idle < 3; r++) {
      var n = Object.keys(out).length;
      document.querySelectorAll('article[data-testid="tweet"]').forEach(function (a) {
        var tm = a.querySelector("time"), l = tm && tm.closest("a"); if (!l) return;
        var m = l.href.match(/\/([^/]+)\/status\/(\d+)/); if (!m || m[1].toLowerCase() !== h) return;
        out[m[2]] = { day: eventDay(tm.getAttribute("datetime")), likes: likesOf(a), reply: /返信先|Replying to/.test(a.innerText),
          tx: ((a.querySelector('[data-testid="tweetText"]') || {}).innerText || "").replace(/\s+/g, " ") };
      });
      window.scrollBy(0, 2500); await S(1500);
      idle = Object.keys(out).length === n ? idle + 1 : 0;
    }
  }
  var P = 1000000007n;
  function line(d, items) {
    var s = items.reduce(function (a, x) { return (a + BigInt(x[0]) + BigInt(x[1])) % P; }, 0n);
    return items.length + " " + d + " " + s + " " + items.map(function (x) { return x[0] + ":" + x[1]; }).join(",");
  }
  var TODO = RESUME ? JSON.parse(localStorage.getItem("cyn_pick_progress") || "null") || ALL : ALL;
  var FOUND = RESUME ? JSON.parse(localStorage.getItem("cyn_pick_found") || "{}") : {};
  function save() {
    localStorage.setItem("cyn_pick_progress", JSON.stringify(TODO));
    localStorage.setItem("cyn_pick_found", JSON.stringify(FOUND));
    var lines = Object.keys(FOUND).sort().map(function (d) {
      var items = Object.keys(FOUND[d]).map(function (id) { return [id, FOUND[d][id]]; }).sort(function (x, y) { return y[1] - x[1]; });
      return line(d, items);
    });
    localStorage.setItem("cyn_pick_out", lines.join("\n"));
  }
  save();
  var total = TODO.length;
  (async function () {
    outer:
    while (TODO.length && budget > 0) {
      var d = TODO[0];
      for (var i = 0; i < HANDLES.length; i++) {
        var h = HANDLES[i];
        R.status = (total - TODO.length + 1) + "/" + total + " " + d;
        var out = {};
        if (!(await open1("from:" + h + " since:" + d + " until:" + plus(d, 2)))) { R.stopped = true; R.log.push("回数制限のため止めました（次は __PK_RESUME = true で " + d + " から）"); break outer; }
        await collect(h, out);
        var ids = Object.keys(out), fresh = 0;
        ids.forEach(function (id) {
          var t = out[id];
          // 出来事の日か翌日の投稿だけ。翌日も出来事の日なら、翌日の投稿はその日の検索で扱う
          if (t.day !== d && !(t.day === plus(d, 1) && !EVENT.has(t.day))) return;
          if (t.likes < 1 || t.reply || !POS.test(t.tx) || !CTX.test(t.tx) || NG.test(t.tx)) return;
          var b = FOUND[d] = FOUND[d] || {};
          if (!(id in b)) { fresh++; R.picked++; }
          b[id] = t.likes;
        });
        R.seen += ids.length;
        if (fresh) R.log.push(d + " tweets " + ids.length + " picked " + fresh);
        await S(4000);
      }
      TODO.shift(); R.done++; save();
    }
    save();
    R.remaining = TODO.length; R.days = Object.keys(FOUND).length;
    R.status = "finished"; R.active = false;
  })();
  return "started: dates " + total + ", budget " + budget + (RESUME ? " (resume)" : "");
})();
