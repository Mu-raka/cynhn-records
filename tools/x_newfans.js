/* 週1回のメンテナンス用：ファン一覧に新しく加わった人の「過去の」ツイートを集める。X（x.com）のタブで実行する。
   ・ブラウザの localStorage "cyn_fanlist"（ファンのアカウント名の配列）と "cyn_fanlist_checked"（確認済みのアカウント名の配列）を比べ、
     まだ確認していないアカウントを1人ずつ「from:アカウント (CYNHN OR ...)」で新しい順に検索し、
     いちばん古い投稿の日付を until: にして検索し直しながら、さかのぼれなくなるまで集める
   ・Xの検索は回数制限がきついので、1回の実行で開く検索ページは window.__NF_BUDGET 回まで（既定15回）。
     途中のアカウントは "cyn_newfan_progress"（{アカウント: 次の until 日付}）に記録し、次回そこから続ける
   ・回数制限（「問題が発生しました」）が出たら10分待って1回だけやり直し、だめならそこで止めて次回に回す
   ・"cyn_fanlist_checked" が無いとき（初回）は、いまの一覧をそのまま確認済みとして記録するだけで検索はしない
   ・投稿は日付ごと（夜中0〜6時は前の日）にいいね順で最大30件にまとめる。年表の開催日だけに絞るのは
     取り込むとき（merge_x_weekly.py の --event-days）に行う
   使い方：このファイルの中身を実行（回数を変えるときは先に window.__NF_BUDGET = 数; を実行）。x_weekly.js が終わってから実行する。
   進み具合は window.__nf.status / window.__nf.log、結果は localStorage "cyn_newfan_out"（x_weekly.js と同じ「件数 日付 チェックサム id:いいね,...」）
   → python3 tools/merge_x_weekly.py fan ファイル --event-days で取り込む。
   アカウント一覧・確認済み一覧はブラウザにだけ置き、リポジトリには入れない。出力にはツイートIDといいね数だけを入れる */
(function () {
  if (window.__nf && window.__nf.active) return "already";
  var R = window.__nf = { active: true, status: "start", log: [], done: [], stopped: false };
  var S = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var low = function (h) { return String(h).replace(/^@/, "").toLowerCase(); };
  var FANS = (JSON.parse(localStorage.getItem("cyn_fanlist") || "[]")).map(low);
  var raw = localStorage.getItem("cyn_fanlist_checked");
  if (!FANS.length) { R.status = "finished"; R.active = false; R.log.push("cyn_fanlist が空です"); return "no fanlist"; }
  if (raw === null) {
    localStorage.setItem("cyn_fanlist_checked", JSON.stringify(FANS));
    localStorage.setItem("cyn_newfan_out", "");
    R.status = "finished"; R.active = false; R.log.push("初回：いまのファン一覧 " + FANS.length + " 人を確認済みとして記録しました（検索はしていません）");
    return "baseline " + FANS.length;
  }
  var CHECKED = new Set(JSON.parse(raw).map(low));
  var PROG = JSON.parse(localStorage.getItem("cyn_newfan_progress") || "{}");
  var todo = FANS.filter(function (h) { return !CHECKED.has(h); });
  // 途中まで進んだ人を先に
  todo.sort(function (a, b) { return (PROG[b] ? 1 : 0) - (PROG[a] ? 1 : 0); });
  R.newCount = todo.length;
  var budget = window.__NF_BUDGET || 15;
  var KW = "(CYNHN OR #CYNHN OR スウィーニー OR 綾瀬志希 OR 月雲ねる OR 青柳透 OR 広瀬みのり OR 百瀬怜 OR 崎乃奏音 OR 桜坂真愛)";
  var P = 1000000007n;
  function plus(d, n) { var t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
  function jst(iso) { return new Date(Date.parse(iso) + 9 * 3600e3).toISOString(); }
  // 夜中0〜6時の投稿は前の日のイベントの感想として扱う（x_weekly.js と同じ）
  function eventDay(iso) { var j = jst(iso), d = j.slice(0, 10); return +j.slice(11, 13) < 6 ? plus(d, -1) : d; }
  function likesOf(a) {
    var g = a.querySelector('[role="group"][aria-label]'), s = g ? g.getAttribute("aria-label") : "";
    var m = s.match(/([\d,.]+)\s*(万)?\s*件のいいね/); if (m) { var n = parseFloat(m[1].replace(/,/g, "")); if (m[2]) n *= 1e4; return Math.round(n); }
    m = s.match(/([\d,.]+)\s*([KM])?\s*likes?/i); if (!m) return 0;
    n = parseFloat(m[1].replace(/,/g, "")); if (m[2] === "K") n *= 1e3; if (m[2] === "M") n *= 1e6; return Math.round(n);
  }
  var body = function () { return (document.querySelector("main") || document.body).innerText; };
  // 検索ページを1つ開く。回数制限なら10分待って1回だけやり直し、だめなら false
  async function open1(q) {
    for (var t = 0; t < 2; t++) {
      budget--;
      history.pushState({}, "", "/search?q=" + encodeURIComponent(q) + "&src=typed_query&f=live");
      window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
      for (var k = 0; k < 24; k++) { await S(500); if (document.querySelector('article[data-testid="tweet"] time') || (k > 8 && /検索結果はありません|No results|問題が発生/.test(body()))) break; }
      if (!(/問題が発生しました|Something went wrong/.test(body()) && !document.querySelector('article[data-testid="tweet"]'))) return true;
      R.log.push("X error (" + (t + 1) + ") " + new Date().toLocaleTimeString());
      if (t === 0) { R.status += " / waiting 10min"; await S(600000); }
    }
    return false;
  }
  // 開いている検索結果をスクロールで集める。同じ検索を前に開いていると、Xがスクロール位置ごと復元するので先頭に戻してから
  async function collect(h, out) {
    window.scrollTo(0, 0); await S(2000);
    var idle = 0, oldest = "";
    for (var r = 0; r < 60 && idle < 5; r++) {
      var n = Object.keys(out).length;
      document.querySelectorAll('article[data-testid="tweet"]').forEach(function (a) {
        var tm = a.querySelector("time"), l = tm && tm.closest("a"); if (!l) return;
        var m = l.href.match(/\/([^/]+)\/status\/(\d+)/); if (!m || m[1].toLowerCase() !== h) return;
        var iso = tm.getAttribute("datetime");
        if (!oldest || iso < oldest) oldest = iso;
        out[m[2]] = { day: eventDay(iso), likes: likesOf(a) };
      });
      window.scrollBy(0, 2500); await S(2000);
      idle = Object.keys(out).length === n ? idle + 1 : 0;
    }
    return oldest;
  }
  function line(d, items) {
    var s = items.reduce(function (a, x) { return (a + BigInt(x[0]) + BigInt(x[1])) % P; }, 0n);
    return items.length + " " + d + " " + s + " " + items.map(function (x) { return x[0] + ":" + x[1]; }).join(",");
  }
  var byDay = {};
  function save() {
    localStorage.setItem("cyn_fanlist_checked", JSON.stringify(Array.from(CHECKED)));
    localStorage.setItem("cyn_newfan_progress", JSON.stringify(PROG));
    var lines = Object.keys(byDay).sort().map(function (d) {
      var items = Object.keys(byDay[d]).map(function (id) { return [id, byDay[d][id]]; }).sort(function (x, y) { return y[1] - x[1]; }).slice(0, 30);
      return line(d, items);
    });
    localStorage.setItem("cyn_newfan_out", lines.join("\n"));
  }
  localStorage.setItem("cyn_newfan_out", "");
  (async function () {
    outer:
    for (var i = 0; i < todo.length && budget > 0; i++) {
      var h = todo[i], until = PROG[h] || "", pg = 0, finished = false, retried = false;
      while (budget > 0) {
        pg++;
        R.status = (i + 1) + "/" + todo.length + " " + h + " p" + pg + (until ? " until:" + until : "");
        var out = {};
        if (!(await open1("from:" + h + " " + KW + (until ? " until:" + until : "")))) { R.stopped = true; R.log.push("回数制限のため止めました（次回 " + h + " から続けます）"); break outer; }
        var oldest = await collect(h, out);
        var ids = Object.keys(out), fresh = 0;
        ids.forEach(function (id) { var t = out[id], b = byDay[t.day] = byDay[t.day] || {}; if (!(id in b)) fresh++; b[id] = t.likes; });
        R.log.push(h + " p" + pg + " until:" + (until || "-") + " tweets " + ids.length + " oldest " + oldest.slice(0, 10));
        // until: はその日を含まないので、ふだんはいちばん古い日の翌日を次の until にする（同じ日の残りを拾うため）。
        // 新しい投稿が1件も無かったときは、いちばん古い日そのものを until にしてもう1回だけ試し、それでも無ければ終わり
        if (!ids.length || !oldest) { finished = true; break; }
        var next = fresh ? plus(oldest.slice(0, 10), 1) : oldest.slice(0, 10);
        if (!fresh && (retried || next >= until)) { finished = true; break; }
        retried = !fresh;
        if (next === until) next = oldest.slice(0, 10);
        until = next; PROG[h] = until; save();
        await S(6000);
      }
      if (finished) { CHECKED.add(h); delete PROG[h]; R.done.push(h); }
      save();
      await S(6000);
    }
    save();
    R.remaining = FANS.filter(function (h) { return !CHECKED.has(h); }).length;
    R.status = "finished"; R.active = false;
  })();
  return "started: new fans " + todo.length + ", budget " + budget;
})();
