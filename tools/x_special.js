/* 特設ページ用：あるライブの日（と翌日）のツイートをまとめて集める。X（x.com）のタブで実行する。
   ・A：キーワード（CYNHN など）を時間で区切って「最新」タブで検索（話題タブも1回）→ だれの投稿でも集める
   ・B：ライブの言葉（Zepp・ワンマン・セトリなど）で検索 → ファン一覧（localStorage "cyn_fanlist"）の人だけ残す
   ・C：ファン一覧の人を from: でまとめて検索（キーワードなし）→ ライブの話っぽいものは後で選ぶ
   使い方：window.__SP = { start: "2026-11-16", days: 2 }; のあとにこのファイルの中身を実行。
     話題タブを飛ばすときは skipTop: true、一部だけなら phases: "AB"。回数制限がきついときは wait: 待つ分, retries: やり直す回数, gap: 検索の間の秒数。
     1回の検索で下へ送る回数は scrolls（既定60。多いとタブが固まりやすい）
     A・B・C は進んだところを localStorage "cyn_special_apos" / "cyn_special_bpos" / "cyn_special_cpos" に残し、次はそこから続ける（最初からやるときは消す）
   進み具合は window.__sp.status / window.__sp.log。結果は localStorage "cyn_special_out"（1行1投稿：ID いいね 印 時刻 本文）
   印：f=ファン一覧の人 m=メンバー o=公式・お店など r=返信 q=引用 p=画像・動画つき
   本文はこの作業のためだけに手元で読む（リポジトリやサイトには入れない）。アカウント名は出力しない */
(function () {
  if (window.__sp && window.__sp.active) return "already";
  var CFG = window.__SP || {};
  var R = window.__sp = { active: true, status: "start", log: [], searches: 0, errors: 0, stopped: false };
  var S = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var FANS = new Set((JSON.parse(localStorage.getItem("cyn_fanlist") || "[]")).map(function (h) { return String(h).replace(/^@/, "").toLowerCase(); }));
  var MEMS = ["_shiki_ayase", "ds_toru17", "tsukumoneru", "minori_hirose"];
  var OFF = /^(cynhn_ds)$|official|staff|_info$|^info_|news|zepp|ticket|dearstage|eventernote|natalie|realsound|barks/;
  var KW = "(CYNHN OR #CYNHN OR スウィーニー OR シニフィアン OR 綾瀬志希 OR 月雲ねる OR 青柳透 OR 広瀬みのり)";
  var LIVEKW = "(Zepp OR ダイバーシティ OR DiverCity OR ダイバー OR ワンマン OR バンドセット OR バンセ OR セトリ OR 志希 OR ねるちゃん OR 透ちゃん OR みのり)";
  var start = CFG.start || "2026-11-16", days = CFG.days || 2;
  var t0 = Date.parse(start + "T00:00:00+09:00") / 1000, t1 = t0 + days * 86400;
  var ALL = JSON.parse(localStorage.getItem("cyn_special_raw") || "{}");
  var HS = {};
  function likesOf(a) {
    var g = a.querySelector('[role="group"][aria-label]'), s = g ? g.getAttribute("aria-label") : "";
    var m = s.match(/([\d,.]+)\s*(万)?\s*件のいいね/); if (m) { var n = parseFloat(m[1].replace(/,/g, "")); if (m[2]) n *= 1e4; return Math.round(n); }
    m = s.match(/([\d,.]+)\s*([KM])?\s*likes?/i); if (!m) return 0;
    n = parseFloat(m[1].replace(/,/g, "")); if (m[2] === "K") n *= 1e3; if (m[2] === "M") n *= 1e6; return Math.round(n);
  }
  var body = function () { return (document.querySelector("main") || document.body).innerText; };
  async function search(q, live, keep) {
    var TRY = CFG.retries || 3, WAIT = (CFG.wait || 15) * 60000;
    for (var t = 0; t < TRY; t++) {
      R.searches++;
      var r = await search1(q, live, keep);
      if (!r.err) return r.n;
      R.log.push("X error " + new Date().toLocaleTimeString());
      if (t < TRY - 1) { var st = R.status; R.status = st + " / waiting " + (WAIT / 60000) + "min"; await S(WAIT); R.status = st; }
    }
    R.errors++; R.stopped = true;
    return -1;
  }
  async function search1(q, live, keep) {
    history.pushState({}, "", "/search?q=" + encodeURIComponent(q) + "&src=typed_query" + (live ? "&f=live" : ""));
    window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    window.scrollTo(0, 0);
    for (var k = 0; k < 30; k++) { await S(500); if (document.querySelector('article[data-testid="tweet"] time') || (k > 8 && /検索結果はありません|No results|問題が発生/.test(body()))) break; }
    if (/問題が発生しました|Something went wrong/.test(body()) && !document.querySelector('article[data-testid="tweet"]')) return { err: true };
    var got = 0, idle = 0;
    for (var r = 0; r < (CFG.scrolls || 60) && idle < 4; r++) {
      var before = got, seen = 0;
      document.querySelectorAll('article[data-testid="tweet"]').forEach(function (a) {
        var t = a.querySelector("time"), l = t && t.closest("a"); if (!l) return;
        var m = l.href.match(/\/([^/]+)\/status\/(\d+)/); if (!m) return;
        var h = m[1].toLowerCase(), id = m[2]; seen++;
        if (ALL[id]) { ALL[id].likes = Math.max(ALL[id].likes, likesOf(a)); HS[h] = 1; return; }
        var ts = Date.parse(t.getAttribute("datetime")) / 1000; if (ts < t0 || ts >= t1) return;
        var fan = FANS.has(h), mem = MEMS.indexOf(h) >= 0;
        if (keep === "fan" && !fan && !mem) return;
        var tx = ((a.querySelector('[data-testid="tweetText"]') || {}).innerText || "").replace(/\s+/g, " ").trim();
        var fl = (fan ? "f" : "") + (mem ? "m" : "") + (OFF.test(h) && !mem ? "o" : "") + (/返信先|Replying to/.test(a.innerText) ? "r" : "") +
          (a.querySelectorAll("time").length > 1 ? "q" : "") +
          (a.querySelector('[data-testid="tweetPhoto"], [data-testid="videoPlayer"], video') ? "p" : "");
        ALL[id] = { likes: likesOf(a), fl: fl || "-", ts: ts, tx: tx };
        HS[h] = 1; got++;
      });
      R.seen = (R.seen || 0) + seen;
      window.scrollBy(0, 2500); await S(1400);
      idle = got === before ? idle + 1 : 0;
    }
    return { n: got };
  }
  function save() {
    localStorage.setItem("cyn_special_raw", JSON.stringify(ALL));
    var ids = Object.keys(ALL).sort(function (a, b) { return ALL[a].ts - ALL[b].ts; });
    localStorage.setItem("cyn_special_out", ids.map(function (id) {
      var x = ALL[id], j = new Date((x.ts + 9 * 3600) * 1000).toISOString();
      return id + " " + x.likes + " " + x.fl + " " + j.slice(5, 10).replace("-", "/") + "_" + j.slice(11, 16) + " " + x.tx.replace(/[\r\n\t]/g, " ");
    }).join("\n"));
    R.total = ids.length; R.people = Object.keys(HS).length;
  }
  (async function () {
    // 時間の区切り：夕方〜夜中は1時間ごと、ほかは3時間ごと（JST）
    var slices = [];
    for (var ts = t0; ts < t1;) {
      var hr = new Date((ts + 9 * 3600) * 1000).getUTCHours(), step = (hr >= 15 || hr < 3) ? 3600 : 10800;
      slices.push([ts, Math.min(ts + step, t1)]); ts += step;
    }
    var phases = (CFG.phases || "ABC").split("");
    if (phases.indexOf("A") >= 0) {
      if (!CFG.skipTop) { R.status = "A top"; await search(KW + " since_time:" + t0 + " until_time:" + t1, false); save(); await S(6000); }
      var GAP = (CFG.gap || 6) * 1000;
      for (var i = +(localStorage.getItem("cyn_special_apos") || 0); i < slices.length && !R.stopped; i++) {
        R.status = "A " + (i + 1) + "/" + slices.length;
        var n = await search(KW + " since_time:" + slices[i][0] + " until_time:" + slices[i][1], true); save();
        if (n >= 0) localStorage.setItem("cyn_special_apos", String(i + 1));
        R.log.push("A " + (i + 1) + " +" + n); await S(GAP);
      }
    }
    if (phases.indexOf("B") >= 0 && !R.stopped) {
      for (var b = +(localStorage.getItem("cyn_special_bpos") || 0); b < days * 2 && !R.stopped; b++) {
        var bs = t0 + b * 43200;
        R.status = "B " + (b + 1) + "/" + days * 2;
        var nb = await search(LIVEKW + " since_time:" + bs + " until_time:" + (bs + 43200), true, "fan"); save();
        if (nb >= 0) localStorage.setItem("cyn_special_bpos", String(b + 1));
        R.log.push("B " + (b + 1) + " +" + nb); await S((CFG.gap || 6) * 1000);
      }
    }
    if (phases.indexOf("C") >= 0 && !R.stopped && FANS.size) {
      var list = Array.from(FANS), CH = CFG.chunk || 22, done = +(localStorage.getItem("cyn_special_cpos") || 0);
      for (var c = done; c < list.length && !R.stopped; c += CH) {
        R.status = "C " + Math.ceil((c + 1) / CH) + "/" + Math.ceil(list.length / CH);
        var q = "(" + list.slice(c, c + CH).map(function (h) { return "from:" + h; }).join(" OR ") + ") since_time:" + t0 + " until_time:" + t1;
        var nc = await search(q, true, "fan"); save();
        if (nc >= 0) localStorage.setItem("cyn_special_cpos", String(c + CH));
        R.log.push("C " + Math.ceil((c + 1) / CH) + " +" + nc); await S(7000);
      }
    }
    save(); R.status = "finished"; R.active = false;
  })();
  return "started";
})();
