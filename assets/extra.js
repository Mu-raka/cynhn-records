/* 青の記録：トップの「今日は何の日」「思い出をひとつ」「最近追加」と、特集ページ（曲・メンバー・年の振り返り・参戦記録）
   app.js がデータを読み込んだあと（cyn:ready）に動く。ページは #songs / #song/曲名 / #members / #member/名前 / #recap/2023 / #mylog */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var C = null, SONGS = null;

  function pad(n) { return String(n).padStart(2, "0"); }
  function ymd(d) { var p = d.split("-"); return p[0] + "年" + (p[1] ? (+p[1]) + "月" : "") + (p[2] ? (+p[2]) + "日" : ""); }
  function link(e, label) { return '<a href="#' + e.date.slice(0, 4) + "/" + e.id + '">' + C.esc(label || e.title) + "</a>"; }
  function evItem(e, extra) {
    return '<li class="ev"><span class="ev-d">' + C.esc(ymd(e.date)) + "</span>" + link(e) + (extra ? '<span class="ev-x">' + extra + "</span>" : "") + "</li>";
  }
  function past(e) { return /^\d{4}-\d{2}-\d{2}$/.test(e.date) && !C.isUpcoming(e.date); }

  // ---- 曲名をそろえる（「（綾瀬志希）」などの注記や「※コラボ」を外す）
  function songName(s) { return s.replace(/(※.*|／.*|[（(].*)$/, "").replace(/[、,]\s*$/, "").trim(); }
  function buildSongs() {
    if (SONGS) return SONGS;
    var map = {};
    C.DATA.events.forEach(function (e) {
      if (!e.setlist || !e.setlist.length || !past(e)) return;
      var seen = {};
      e.setlist.forEach(function (raw) {
        if (raw.charAt(0) === "▼") return;
        var n = songName(raw); if (!n || seen[n]) return; seen[n] = 1;
        var s = map[n] || (map[n] = { name: n, events: [] });
        s.events.push(e);
      });
    });
    SONGS = Object.keys(map).map(function (k) { var s = map[k]; s.first = s.events[0]; s.last = s.events[s.events.length - 1]; return s; });
    SONGS.sort(function (a, b) { return b.events.length - a.events.length || (a.first.date < b.first.date ? -1 : 1); });
    return SONGS;
  }
  function daysSince(d) { return Math.round((new Date(C.TODAY) - new Date(d)) / 864e5); }

  // ---- トップ：今日は何の日
  function renderToday() {
    var mmdd = C.TODAY.slice(5), y0 = +C.TODAY.slice(0, 4);
    var hits = C.DATA.events.filter(function (e) { return e.date.length === 10 && e.date.slice(5) === mmdd && e.date < C.TODAY; });
    var head = "今日は何の日", sub = (+mmdd.slice(0, 2)) + "月" + (+mmdd.slice(3)) + "日";
    if (!hits.length) {
      // その日に何もなければ前後3日から
      var near = [];
      for (var k = 1; k <= 3 && !near.length; k++) {
        [-k, k].forEach(function (off) {
          var t = new Date(C.TODAY + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + off);
          var md = t.toISOString().slice(5, 10);
          C.DATA.events.forEach(function (e) { if (e.date.length === 10 && e.date.slice(5) === md && e.date < C.TODAY) near.push(e); });
        });
      }
      hits = near; if (near.length) head = "この時期のCYNHN";
    }
    hits.sort(function (a, b) { return (b.imp || 1) - (a.imp || 1) || (a.date < b.date ? 1 : -1); });
    var tw = C.top5(), mb = C.members();
    var html = '<h2 id="today-title">' + head + ' <small>' + sub + "</small></h2>";
    if (!hits.length) html += '<p class="muted">この日の出来事はまだ登録されていません。<br>「思い出をひとつ」で別の日をのぞいてみてください。</p>';
    else html += '<ul class="today-list">' + hits.slice(0, 5).map(function (e) {
      var ago = y0 - +e.date.slice(0, 4);
      var badges = (e.setlist && e.setlist.length ? '<span class="pill tag">セトリ</span>' : "") + ((tw[e.date] || mb[e.date]) ? '<span class="pill tag">ツイート</span>' : "");
      return '<li><a href="#' + e.date.slice(0, 4) + "/" + e.id + '"><span class="ago">' + (ago ? ago + "年前" : "今年") + "</span>" +
        '<span class="t">' + C.esc(e.title) + "</span><span class=\"d\">" + C.esc(ymd(e.date)) + " " + badges + "</span></a></li>";
    }).join("") + "</ul>" + (hits.length > 5 ? '<p class="muted">ほか ' + (hits.length - 5) + " 件</p>" : "");
    $("today").innerHTML = html;
  }

  // ---- トップ：思い出をひとつ（セトリやツイートがある出来事を少し選ばれやすく）
  function randomMemory() {
    var tw = C.top5(), mb = C.members(), pool = [];
    C.DATA.events.forEach(function (e) {
      if (!past(e)) return;
      var w = 1 + (e.setlist && e.setlist.length ? 2 : 0) + (tw[e.date] ? 1 : 0) + (mb[e.date] ? 1 : 0) + ((e.imp || 1) - 1);
      for (var i = 0; i < w; i++) pool.push(e);
    });
    var e = pool[Math.floor(Math.random() * pool.length)];
    if (e) C.go(e.date.slice(0, 4) + "/" + e.id);
  }

  // ---- トップ：最近追加した出来事
  function renderRecent() {
    var list = C.DATA.events.filter(function (e) { return e.added; }).sort(function (a, b) { return a.added < b.added ? 1 : a.added > b.added ? -1 : (a.date < b.date ? 1 : -1); }).slice(0, 6);
    if (!list.length) { $("recent").hidden = true; return; }
    $("recent").innerHTML = '<h2 id="recent-title">最近追加した出来事</h2><ul class="evs">' +
      list.map(function (e) { return evItem(e, '<span class="added">' + C.esc(e.added.slice(5).replace("-", "/")) + " 追加</span>"); }).join("") + "</ul>";
  }

  // ---- ページ共通
  function page(title, body, back) {
    $("page").innerHTML = '<div class="pg"><p class="crumb"><a href="#">年表</a>' + (back ? " › " + back : "") + '</p><h1 class="pg-title">' + title + "</h1>" + body + "</div>";
    document.title = title.replace(/<[^>]+>/g, "") + "｜青の記録";
  }
  function stat(n, label) { return '<div class="stat"><b>' + n + "</b><span>" + label + "</span></div>"; }

  // ---- 曲一覧
  function renderSongs() {
    var songs = buildSongs(), withSl = C.DATA.events.filter(function (e) { return e.setlist && e.setlist.length && past(e); }).length;
    var showAll = location.hash.indexOf("all") > 0;
    var body = '<p class="lead">セットリストが分かっている ' + withSl + " 公演から集計しました（カバー曲や企画の曲も含みます）。曲名を押すと、歌われた公演の一覧が開きます。</p>" +
      '<label class="song-filter"><span class="visually-hidden">曲名で探す</span><input type="search" id="song-q" placeholder="曲名で探す" autocomplete="off"></label>' +
      '<ol class="songs" id="song-list">' + songs.map(function (s, i) {
        var d = daysSince(s.last.date);
        return '<li data-n="' + C.esc(s.name.toLowerCase()) + '"' + (s.events.length < 2 ? ' class="minor"' : "") + '><a href="#song/' + encodeURIComponent(s.name) + '">' +
          '<span class="rk">' + (i + 1) + '</span><span class="nm">' + C.esc(s.name) + '</span><span class="ct">' + s.events.length + "回</span>" +
          '<span class="meta">初 ' + C.esc(s.first.date.replace(/-/g, ".")) + "　最後 " + C.esc(s.last.date.replace(/-/g, ".")) + (d > 365 ? ' <em>' + Math.floor(d / 365) + "年以上歌われていません</em>" : "") + "</span></a></li>";
      }).join("") + "</ol>" +
      '<button type="button" class="btn" id="song-more">1回だけ歌われた曲も表示する</button>';
    page("曲", body);
    var list = $("song-list");
    if (!showAll) list.classList.add("hide-minor");
    $("song-more").addEventListener("click", function () { list.classList.toggle("hide-minor"); this.textContent = list.classList.contains("hide-minor") ? "1回だけ歌われた曲も表示する" : "2回以上の曲だけにする"; });
    $("song-q").addEventListener("input", function () {
      var q = this.value.trim().toLowerCase();
      list.querySelectorAll("li").forEach(function (li) { li.hidden = q && li.dataset.n.indexOf(q) < 0; });
      if (q) list.classList.remove("hide-minor");
    });
  }

  // ---- 曲の詳細
  function renderSong(name) {
    var s = buildSongs().filter(function (x) { return x.name === name; })[0];
    if (!s) { page(C.esc(name), '<p class="muted">この曲が入ったセットリストは見つかりませんでした。</p>', '<a href="#songs">曲</a>'); return; }
    var years = {}; s.events.forEach(function (e) { var y = e.date.slice(0, 4); years[y] = (years[y] || 0) + 1; });
    var ys = Object.keys(years).sort(), mx = Math.max.apply(null, ys.map(function (y) { return years[y]; }));
    var gap = 0, gapFrom = null;
    for (var i = 1; i < s.events.length; i++) { var g = (new Date(s.events[i].date) - new Date(s.events[i - 1].date)) / 864e5; if (g > gap) { gap = g; gapFrom = [s.events[i - 1], s.events[i]]; } }
    var body = '<div class="stats">' + stat(s.events.length + "回", "セトリに登場") + stat(C.esc(s.first.date.replace(/-/g, ".")), "初めて確認できた日") + stat(C.esc(s.last.date.replace(/-/g, ".")), "最後に歌われた日") + stat(daysSince(s.last.date) + "日", "最後に歌われてから") + "</div>";
    body += '<h2 class="pg-h">年ごとの回数</h2><div class="bars">' + ys.map(function (y) {
      return '<div class="bar-row"><span class="by">' + y + '</span><span class="bt"><span class="bf" style="width:' + (years[y] / mx * 100) + '%"></span></span><span class="bn">' + years[y] + "</span></div>";
    }).join("") + "</div>";
    if (gapFrom && gap > 180) body += '<p class="note">いちばん間が空いたのは ' + C.esc(gapFrom[0].date.replace(/-/g, ".")) + " → " + C.esc(gapFrom[1].date.replace(/-/g, ".")) + "（" + Math.round(gap) + "日ぶり）です。</p>";
    body += '<h2 class="pg-h">歌われた公演</h2><ul class="evs">' + s.events.slice().reverse().map(function (e) { return evItem(e, C.went()[e.id] ? '<span class="pill went">✓ 行った</span>' : ""); }).join("") + "</ul>";
    page(C.esc(s.name), body, '<a href="#songs">曲</a>');
  }

  // ---- メンバー一覧・詳細
  function memberEvents(name) { return C.DATA.events.filter(function (e) { return (e.members || []).indexOf(name) >= 0; }); }
  function renderMembers() {
    var ms = C.DATA.meta.members || [];
    var body = '<ul class="mem-cards">' + ms.map(function (m) {
      var n = memberEvents(m.name).length;
      return '<li><a href="#member/' + encodeURIComponent(m.name) + '" class="card mem' + (m.to ? " former" : "") + '"><b>' + C.esc(m.name) + "</b><span>" + C.esc(m.kana || "") + "</span>" +
        '<span class="per">' + C.esc(m.from.replace(/-/g, ".")) + "〜" + (m.to ? C.esc(m.to.replace(/-/g, ".")) : "現在") + "</span><span class=\"cnt\">個人の出来事 " + n + "件</span></a></li>";
    }).join("") + "</ul>";
    page("メンバー", body);
  }
  function renderMember(name) {
    var m = (C.DATA.meta.members || []).filter(function (x) { return x.name === name; })[0];
    if (!m) { renderMembers(); return; }
    var evs = memberEvents(name), to = m.to || C.TODAY;
    var inPeriod = C.DATA.events.filter(function (e) { return e.date >= m.from && e.date <= to && past(e); });
    var lives = inPeriod.filter(function (e) { return e.type === "live" || e.type === "tour"; }).length;
    var days = Math.round((new Date(to) - new Date(m.from)) / 864e5);
    var bd = evs.filter(function (e) { return (e.tags || []).indexOf("生誕") >= 0 || /生誕|バースデー|誕生/.test(e.title); });
    var body = '<div class="stats">' + stat(C.esc(m.from.replace(/-/g, ".")), "加入") + stat(m.to ? C.esc(m.to.replace(/-/g, ".")) : "在籍中", m.to ? "卒業・脱退" : "") +
      stat(days.toLocaleString() + "日", "在籍日数") + stat(lives, "在籍中のライブ（年表上）") + stat(evs.length, "個人の出来事") + "</div>";
    if (bd.length) body += '<h2 class="pg-h">生誕・バースデー</h2><ul class="evs">' + bd.slice().reverse().map(function (e) { return evItem(e); }).join("") + "</ul>";
    var rest = evs.filter(function (e) { return bd.indexOf(e) < 0; });
    body += '<h2 class="pg-h">個人の出来事</h2>' + (rest.length ? '<ul class="evs">' + rest.slice().reverse().map(function (e) { return evItem(e); }).join("") + "</ul>" : '<p class="muted">まだ登録されていません。</p>');
    body += '<p class="note"><a href="#all" id="mem-filter">一覧でこのメンバーの出来事を絞り込む</a></p>';
    page(C.esc(m.name), body, '<a href="#members">メンバー</a>');
    $("mem-filter").addEventListener("click", function (ev) { ev.preventDefault(); var sel = $("f-member"); sel.value = name; sel.dispatchEvent(new Event("change")); C.go("all"); });
  }

  // ---- 年の振り返り
  function renderRecap(y) {
    var ys = {}; C.DATA.events.forEach(function (e) { ys[e.date.slice(0, 4)] = 1; });
    var all = Object.keys(ys).sort();
    if (!y || !ys[y]) y = all.filter(function (x) { return x <= C.TODAY.slice(0, 4); }).pop();
    var evs = C.DATA.events.filter(function (e) { return e.date.slice(0, 4) === y && !C.isUpcoming(e.date); });
    var cnt = function (f) { return evs.filter(f).length; };
    var lives = cnt(function (e) { return e.type === "live" || e.type === "tour"; });
    var oneman = cnt(function (e) { return (e.tags || []).indexOf("ワンマン") >= 0; });
    var rel = evs.filter(function (e) { return e.type === "release"; });
    var songC = {};
    evs.forEach(function (e) { var seen = {}; (e.setlist || []).forEach(function (r) { if (r.charAt(0) === "▼") return; var n = songName(r); if (n && !seen[n]) { seen[n] = 1; songC[n] = (songC[n] || 0) + 1; } }); });
    var topSongs = Object.keys(songC).sort(function (a, b) { return songC[b] - songC[a]; }).slice(0, 5);
    var newSongs = buildSongs().filter(function (s) { return s.first.date.slice(0, 4) === y; });
    var tw = C.top5(), mb = C.members(), best = null, bestM = null;
    evs.forEach(function (e) {
      (tw[e.date] || []).forEach(function (t) { if (!best || t.likes > best.t.likes) best = { t: t, e: e }; });
      (mb[e.date] || []).forEach(function (t) { if (!bestM || t.likes > bestM.t.likes) bestM = { t: t, e: e }; });
    });
    var nav = '<div class="yr-nav">' + all.map(function (x) { return '<a href="#recap/' + x + '"' + (x === y ? ' class="is-cur" aria-current="page"' : "") + ">" + x + "</a>"; }).join("") + "</div>";
    var body = nav + '<div class="stats">' + stat(evs.length, "出来事") + stat(lives, "ライブ・ツアー") + stat(oneman, "ワンマン") + stat(rel.length, "リリース") + stat(Object.keys(songC).length, "セトリに出た曲") + "</div>";
    var big = evs.filter(function (e) { return (e.imp || 1) >= 2; });
    if (big.length) body += '<h2 class="pg-h">この年の大きな出来事</h2><ul class="evs">' + big.map(function (e) { return evItem(e, e.imp === 3 ? '<span class="pill star3">★★★</span>' : ""); }).join("") + "</ul>";
    if (topSongs.length) body += '<h2 class="pg-h">よく歌われた曲</h2><ol class="mini-rank">' + topSongs.map(function (n) { return '<li><a href="#song/' + encodeURIComponent(n) + '">' + C.esc(n) + "</a><span>" + songC[n] + "回</span></li>"; }).join("") + "</ol>";
    if (newSongs.length) body += '<h2 class="pg-h">この年に初めてセトリに登場した曲</h2><p class="chips">' + newSongs.map(function (s) { return '<a class="chip" href="#song/' + encodeURIComponent(s.name) + '">' + C.esc(s.name) + "</a>"; }).join("") + "</p>";
    if (bestM) body += '<h2 class="pg-h">いちばんいいねされたメンバーのツイート <small>' + C.esc(ymd(bestM.e.date)) + " " + link(bestM.e) + '</small></h2><ol class="tweets">' + C.tweetItem(bestM.t, 0, true) + "</ol>";
    if (best) body += '<h2 class="pg-h">いちばんいいねされたファンのツイート <small>' + C.esc(ymd(best.e.date)) + " " + link(best.e) + '</small></h2><ol class="tweets">' + C.tweetItem(best.t, 0, false) + "</ol>";
    body += '<p class="note"><a href="#' + y + '">' + y + "年の出来事をすべて見る</a></p>";
    page(y + "年の振り返り", body);
  }

  // ---- わたしの参戦記録
  function renderMylog() {
    var W = C.went(), evs = C.DATA.events.filter(function (e) { return W[e.id]; });
    var body = '<p class="lead">出来事を開いて「＋ 行った！」を押すと、ここに記録されます。記録はこのブラウザの中だけに保存され、ほかの人には見えません（ブラウザのデータを消すと消えます）。</p>';
    if (!evs.length) { page("わたしの参戦記録", body + '<p class="muted">まだ記録がありません。<a href="#all">出来事一覧</a>から、行ったライブやイベントを開いて「＋ 行った！」を押してみてください。</p>'); return; }
    var years = {}; evs.forEach(function (e) { var y = e.date.slice(0, 4); years[y] = (years[y] || 0) + 1; });
    var songC = {};
    evs.forEach(function (e) { var seen = {}; (e.setlist || []).forEach(function (r) { if (r.charAt(0) === "▼") return; var n = songName(r); if (n && !seen[n]) { seen[n] = 1; songC[n] = (songC[n] || 0) + 1; } }); });
    var topSongs = Object.keys(songC).sort(function (a, b) { return songC[b] - songC[a]; });
    var allSongs = buildSongs().filter(function (s) { return s.events.length >= 5; });
    var notYet = allSongs.filter(function (s) { return !songC[s.name]; }).slice(0, 12);
    body += '<div class="stats">' + stat(evs.length, "参戦") + stat(C.esc(evs[0].date.replace(/-/g, ".")), "はじめて") + stat(C.esc(evs[evs.length - 1].date.replace(/-/g, ".")), "いちばん最近") + stat(topSongs.length, "生で聴いた曲") + "</div>";
    body += '<h2 class="pg-h">年ごとの参戦数</h2><div class="bars">' + Object.keys(years).sort().map(function (y) {
      var mx = Math.max.apply(null, Object.keys(years).map(function (k) { return years[k]; }));
      return '<div class="bar-row"><span class="by">' + y + '</span><span class="bt"><span class="bf" style="width:' + (years[y] / mx * 100) + '%"></span></span><span class="bn">' + years[y] + "</span></div>";
    }).join("") + "</div>";
    if (topSongs.length) body += '<h2 class="pg-h">いちばん聴いた曲</h2><ol class="mini-rank">' + topSongs.slice(0, 10).map(function (n) { return '<li><a href="#song/' + encodeURIComponent(n) + '">' + C.esc(n) + "</a><span>" + songC[n] + "回</span></li>"; }).join("") + "</ol>";
    if (notYet.length) body += '<h2 class="pg-h">まだ生で聴けていない定番曲</h2><p class="chips">' + notYet.map(function (s) { return '<a class="chip" href="#song/' + encodeURIComponent(s.name) + '">' + C.esc(s.name) + "</a>"; }).join("") + "</p>";
    body += '<h2 class="pg-h">参戦した出来事</h2><ul class="evs">' + evs.slice().reverse().map(function (e) { return evItem(e, e.setlist && e.setlist.length ? '<span class="pill tag">セトリ</span>' : ""); }).join("") + "</ul>";
    var text = "CYNHNの参戦記録：" + evs.length + "回（" + evs[0].date.slice(0, 4) + "〜）\n生で聴いた曲 " + topSongs.length + "曲" + (topSongs[0] ? "、いちばん聴いたのは「" + topSongs[0] + "」" : "") + "\n";
    body += '<p class="note"><a class="chip ext" target="_blank" rel="noopener" href="https://x.com/intent/post?text=' + encodeURIComponent(text) + "&url=" + encodeURIComponent(location.origin + location.pathname) + '&hashtags=CYNHN,青の記録">参戦記録をXでシェア</a></p>';
    page("わたしの参戦記録", body);
  }

  function route(h) {
    if (!C) return;
    var m;
    if (h === "songs") renderSongs();
    else if ((m = h.match(/^song\/(.+)$/))) renderSong(m[1]);
    else if (h === "members") renderMembers();
    else if ((m = h.match(/^member\/(.+)$/))) renderMember(m[1]);
    else if ((m = h.match(/^recap(?:\/(\d{4}))?$/))) renderRecap(m && m[1]);
    else if (h === "mylog") renderMylog();
  }
  window.CYN_ROUTE = route;

  document.addEventListener("cyn:ready", function () {
    C = window.CYN;
    renderToday(); renderRecent();
    $("memory-btn").addEventListener("click", randomMemory);
    var y = C.TODAY.slice(0, 4); $("recap-link").href = "#recap/" + y;
    // ツイートデータは後から届くので、少し待って「今日」をもう一度描く
    setTimeout(renderToday, 1500);
    var h = decodeURIComponent(location.hash.slice(1));
    if (document.body.classList.contains("is-page")) route(h);
    window.addEventListener("hashchange", function () { if (!document.body.classList.contains("is-page")) document.title = "青の記録｜CYNHN 年表"; });
  });
  document.addEventListener("cyn:went", function () { if (location.hash === "#mylog") renderMylog(); });
})();
