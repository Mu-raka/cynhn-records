(function () {
  "use strict";
  var cfg = window.SITE_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };
  var DATA = null, BY_ID = {}, TOP5 = {};
  var state = { year: "", all: false, q: "", tag: "", src: "", imp: "", member: "", open: null };
  var TODAY = (function () {
    var d = new Date(), p = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  })();

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function isUpcoming(d) { return d > TODAY.slice(0, d.length); }
  function md(d) {
    var p = d.split("-");
    if (p.length === 3) return (+p[1]) + "月" + (+p[2]) + "日";
    if (p.length === 2) return (+p[1]) + "月";
    return "日付不明";
  }
  function slash(d) { var p = d.split("-"); return p.length === 3 ? (+p[1]) + "/" + (+p[2]) : p.length === 2 ? (+p[1]) + "月" : ""; }

  // ---- 出典の種類（URLから判定）
  var SRC_KINDS = [
    { key: "official", long: "公式サイト", short: "公式", re: /cynhn\.com/ },
    { key: "label", long: "テイチク（レーベル）", short: "テイチク", re: /teichiku\.co\.jp/ },
    { key: "wiki", long: "Wikipedia", short: "WP", re: /wikipedia\.org/ },
    { key: "natalie", long: "音楽ナタリー", short: "ナタリー", re: /natalie\.mu/ },
    { key: "blog", long: "note・ブログ", short: "ブログ", re: /note\.com|ameblo\.jp|hatenablog|hateblo\.jp|hatenadiary|jugem\.jp|livedoor\.blog|blog\.jp|fc2\.com|seesaa|medium\.com/ },
    { key: "x", long: "X（#CYNHN_setlist）", short: "X", re: /(^|\/\/)(x|twitter)\.com/ },
    { key: "press", long: "Webメディアの記事", short: "記事", re: /realsound|ototoy|barks|pia\.jp|impress|atpress|mikan|dot-yell|skiyaki|popnroll|billboard|kyodo|esrp2|skream|rooftop1976|galpo|joysound|storywriter|mikiki|cdjournal|usen\.com|getnews/ },
    { key: "livefans", long: "LiveFans", short: "LiveFans", re: /livefans/ }
  ];
  function srcKind(url) {
    for (var i = 0; i < SRC_KINDS.length; i++) if (SRC_KINDS[i].re.test(url)) return SRC_KINDS[i];
    return { key: "other", long: "その他", short: "その他" };
  }
  function kindsOf(e) {
    if (!e._kinds) {
      var seen = {}; e._kinds = [];
      (e.src || []).forEach(function (s) { var k = srcKind(s.url); if (!seen[k.key]) { seen[k.key] = 1; e._kinds.push(k); } });
    }
    return e._kinds;
  }

  // ---- 年ごとの青（古い年ほど淡く、新しい年ほど深い）
  var STOPS = [[0xD6, 0xE6, 0xF6], [0x7F, 0xAE, 0xDD], [0x2E, 0x6B, 0xAA], [0x0F, 0x4C, 0x81], [0x0A, 0x22, 0x46]];
  function blueAt(t) {
    var seg = Math.min(STOPS.length - 2, Math.floor(t * (STOPS.length - 1)));
    var local = t * (STOPS.length - 1) - seg, a = STOPS[seg], b = STOPS[seg + 1];
    return "#" + a.map(function (v, i) { return Math.round(v + (b[i] - v) * local).toString(16).padStart(2, "0"); }).join("");
  }
  function years() {
    var ys = DATA.events.map(function (e) { return +e.date.slice(0, 4); });
    var out = []; for (var y = Math.min.apply(null, ys); y <= Math.max.apply(null, ys); y++) out.push(String(y));
    return out;
  }

  // ---- 上の年表（横スクロール・縦書き）
  function renderOverview() {
    var ys = years(), counts = {};
    DATA.events.forEach(function (e) { var y = e.date.slice(0, 4); counts[y] = (counts[y] || 0) + 1; });
    $("ov-track").innerHTML = ys.map(function (y, i) {
      var evs = DATA.events.filter(function (e) { return e.date.slice(0, 4) === y && e.imp === 3; });
      if (!evs.length) evs = DATA.events.filter(function (e) { return e.date.slice(0, 4) === y && e.imp === 2; }).slice(0, 2);
      evs = evs.slice(0, 3);
      var color = blueAt(ys.length < 2 ? 1 : i / (ys.length - 1));
      return '<li class="ov-col' + (state.year === y ? " is-current" : "") + '" data-year="' + y + '"><button type="button" aria-label="' + y + "年の出来事 " + (counts[y] || 0) + '件を表示">' +
        '<span class="ov-year">' + y + '</span><span class="ov-count">' + (counts[y] || 0) + "件</span>" +
        '<span class="ov-dot" style="background:' + color + '"></span>' +
        '<span class="ov-dates">' + evs.map(function (e) { return esc(slash(e.date)); }).join("<br>") + "</span>" +
        '<span class="ov-text">' + evs.map(function (e) { return esc(e.title); }).join("　") + "</span></button></li>";
    }).join("");
  }

  // ---- 絞り込みの選択肢
  function fillSelects() {
    var cnt = function (fn) { var c = {}; DATA.events.forEach(function (e) { fn(e).forEach(function (k) { c[k] = (c[k] || 0) + 1; }); }); return c; };
    var yc = cnt(function (e) { return [e.date.slice(0, 4)]; });
    $("f-year").innerHTML = '<option value="">すべての年</option>' + years().filter(function (y) { return yc[y]; }).map(function (y) {
      return '<option value="' + y + '">' + y + "年（" + yc[y] + "）</option>";
    }).join("");
    var tc = cnt(function (e) { return e.tags || []; });
    $("f-tag").innerHTML = '<option value="">すべての種別</option>' + (DATA.meta.tags || []).filter(function (t) { return tc[t]; }).map(function (t) {
      return '<option value="' + esc(t) + '">' + esc(t) + "（" + tc[t] + "）</option>";
    }).join("");
    var sc = cnt(function (e) { return kindsOf(e).map(function (k) { return k.key; }); });
    var kinds = SRC_KINDS.concat([{ key: "other", long: "その他" }]);
    $("f-src").innerHTML = '<option value="">すべての出典</option>' + kinds.filter(function (k) { return sc[k.key]; }).map(function (k) {
      return '<option value="' + k.key + '">' + esc(k.long) + "（" + sc[k.key] + "）</option>";
    }).join("");
    var mc = cnt(function (e) { return e.members || []; });
    $("f-member").innerHTML = '<option value="">すべてのメンバー</option>' + (DATA.meta.members || []).map(function (m) {
      return '<option value="' + esc(m.name) + '">' + esc(m.name) + (mc[m.name] ? "（" + mc[m.name] + "）" : "") + "</option>";
    }).join("");
  }
  function syncControls() {
    $("q").value = state.q; $("f-year").value = state.year; $("f-tag").value = state.tag;
    $("f-src").value = state.src; $("f-imp").value = state.imp; $("f-member").value = state.member;
  }

  function matches(e) {
    if (state.year && e.date.slice(0, 4) !== state.year) return false;
    if (state.tag && (e.tags || []).indexOf(state.tag) < 0) return false;
    if (state.src && !kindsOf(e).some(function (k) { return k.key === state.src; })) return false;
    if (state.imp && (e.imp || 1) < +state.imp) return false;
    if (state.member && (e.members || []).indexOf(state.member) < 0) return false;
    if (state.q) {
      var hay = (e.title + " " + (e.note || "") + " " + e.date + " " + (e.setlist || []).join(" ") + " " + (e.tags || []).join(" ")).toLowerCase();
      if (state.q.toLowerCase().split(/\s+/).some(function (w) { return w && hay.indexOf(w) < 0; })) return false;
    }
    return true;
  }
  function isActive() { return state.all || state.year || state.q || state.tag || state.src || state.imp || state.member; }

  // ---- 一覧
  function rowHTML(e) {
    var pills = "";
    if (e.imp === 3) pills += '<span class="pill star3" aria-label="重要度3">★★★</span>';
    else if (e.imp === 2) pills += '<span class="pill star2" aria-label="重要度2">★★</span>';
    if (e.status === "canceled") pills += '<span class="pill st">中止</span>';
    else if (e.status === "postponed") pills += '<span class="pill st">延期</span>';
    else if (isUpcoming(e.date)) pills += '<span class="pill soon">予定</span>';
    (e.tags || []).slice(0, 2).forEach(function (t) { pills += '<span class="pill tag">' + esc(t) + "</span>"; });
    kindsOf(e).slice(0, 3).forEach(function (k) { pills += '<span class="pill src">' + esc(k.short) + "</span>"; });
    var sub = [e.note, e.setlist && e.setlist.length ? "セットリストあり" : ""].filter(Boolean).join("　");
    var open = state.open === e.id;
    return '<li class="row imp' + (e.imp || 1) + (e.status ? " is-" + esc(e.status) : "") + (open ? " is-open" : "") + '" data-id="' + e.id + '">' +
      '<button type="button" class="row-main" aria-expanded="' + open + '">' +
      '<span class="r-date">' + esc(md(e.date)) + "</span>" +
      '<span class="r-body"><span class="r-title">' + esc(e.title) + "</span>" + (sub ? '<span class="r-sub">' + esc(sub) + "</span>" : "") + "</span>" +
      '<span class="r-tags">' + pills + "</span></button>" + (open ? detailHTML(e) : "") + "</li>";
  }

  function setlistHTML(list) {
    var parts = [], cur = { h: "", songs: [] };
    list.forEach(function (x) {
      if (x.charAt(0) === "▼") { if (cur.h || cur.songs.length) parts.push(cur); cur = { h: x.slice(1).trim(), songs: [] }; }
      else cur.songs.push(x);
    });
    parts.push(cur);
    return '<div class="setlist">' + parts.map(function (p) {
      return (p.h ? '<p class="sl-h">' + esc(p.h) + "</p>" : "") +
        (p.songs.length ? "<ol>" + p.songs.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ol>" : "");
    }).join("") + "</div>";
  }

  function nextDay(d) {
    var t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + 1);
    return t.toISOString().slice(0, 10);
  }
  // Googleフォーム（config.js の form）があれば、種類・対象の出来事を入れた状態で開く。なければ requestUrl（GitHub Issues など）
  function formLink(kind, e) {
    var f = cfg.form || {}, en = f.entries || {};
    if (f.url) {
      var q = [];
      var put = function (k, v) { if (en[k] && v) q.push("entry." + en[k] + "=" + encodeURIComponent(v)); };
      put("kind", kind);
      if (e) {
        put("date", e.date);
        put("title", e.title);
        put("link", location.origin + location.pathname + "#" + e.date.slice(0, 4) + "/" + e.id);
      }
      return f.url + (q.length ? (f.url.indexOf("?") < 0 ? "?" : "&") + "usp=pp_url&" + q.join("&") : "");
    }
    var u = cfg.requestUrl || "";
    if (!u || /YOUR_NAME/.test(u)) return "";
    if (e && /github\.com\/.+\/issues\/new/.test(u)) {
      return u + (u.indexOf("?") < 0 ? "?" : "&") + "title=" + encodeURIComponent("［誤り］" + e.date + " " + e.title) +
        "&body=" + encodeURIComponent("対象：" + location.origin + location.pathname + "#" + e.date.slice(0, 4) + "/" + e.id + "\n\n内容：\n");
    }
    return u;
  }
  function reportUrl(e) { return formLink((cfg.form && cfg.form.kinds && cfg.form.kinds.fix) || "誤りの報告", e); }


  function detailHTML(e) {
    // 同じ種類・同じ名前の出典（Xの複数投稿など）は1行にまとめる
    var groups = [], idx = {};
    (e.src || []).forEach(function (s) {
      var k = srcKind(s.url), key = k.key + "|" + s.label;
      if (!(key in idx)) { idx[key] = groups.length; groups.push({ k: k, label: s.label, urls: [] }); }
      groups[idx[key]].urls.push(s.url);
    });
    var srcs = groups.map(function (g) {
      var links = g.urls.length === 1
        ? '<a class="ext" href="' + esc(g.urls[0]) + '" target="_blank" rel="noopener">' + esc(g.label) + "</a>"
        : g.urls.map(function (u, i) { return '<a class="ext" href="' + esc(u) + '" target="_blank" rel="noopener">' + (g.k.key === "x" ? "投稿" : esc(g.label) + " ") + (i + 1) + "</a>"; }).join("");
      return '<li><span class="k">' + esc(g.k.long) + '</span><span class="links">' + links + "</span></li>";
    }).join("");
    var html = '<div class="r-detail">';
    html += '<h4>参考URL</h4><ul class="srcs">' + srcs + "</ul>";
    if (e.setlist && e.setlist.length) html += "<h4>セットリスト</h4>" + setlistHTML(e.setlist);
    if (/^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.date >= "2017-06-01" && !isUpcoming(e.date)) {
      var q = "CYNHN since:" + e.date + " until:" + nextDay(e.date);
      html += "<h4>当時のXの反応</h4><a class=\"chip ext\" href=\"https://x.com/search?q=" + encodeURIComponent(q) + '&f=live" target="_blank" rel="noopener">CYNHNを含む投稿（' + esc(slash(e.date)) + "）</a>";
    }
    if (TOP5[e.date] && TOP5[e.date].length) html += '<div class="fan-top" data-date="' + esc(e.date) + '">' + topBlockHTML(e.date) + "</div>";
    var r = reportUrl(e);
    if (r) html += '<div class="report">内容に誤りがありますか？<a class="chip ext" href="' + esc(r) + '" target="_blank" rel="noopener">誤りを報告する</a></div>';
    return html + "</div>";
  }

  // ---- 関連ツイート（ファンリストの投稿をいいね順に。5件ずつ、最大30件）
  // Xの埋め込み用ページ（platform.twitter.com/embed/Tweet.html）をiframeで直接はめ込む。widgets.js は使わない
  var STEP = 5, MAX = 30, SHOWN = {};
  function tweetItem(t, i) {
    var link = '<a class="tw-head ext" href="https://x.com/i/status/' + esc(t.id) + '" target="_blank" rel="noopener"><b>' + (i + 1) + '位</b><span class="likes">♥ ' + Number(t.likes).toLocaleString() + '</span><span class="open">Xで開く</span></a>';
    var fr = cfg.embedTweets !== false
      ? '<iframe class="tw-frame" title="Xの投稿 ' + (i + 1) + '位" loading="lazy" scrolling="no" frameborder="0" allowtransparency="true" ' +
        'src="https://platform.twitter.com/embed/Tweet.html?dnt=true&hideThread=true&lang=ja&theme=' + (isDark() ? "dark" : "light") + '&id=' + esc(t.id) + '"></iframe>' : "";
    return '<li class="tw">' + link + fr + "</li>";
  }
  function isDark() {
    var t = document.documentElement.getAttribute("data-theme");
    return t ? t === "dark" : !!(window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
  }
  function topBlockHTML(date) {
    var all = (TOP5[date] || []).slice(0, MAX), n = Math.min(SHOWN[date] || STEP, all.length);
    var html = '<h4>関連ツイート <small>ファンの投稿・いいねの多い順（' + n + " / " + all.length + '件）</small></h4>';
    html += '<ol class="tweets">' + all.slice(0, n).map(tweetItem).join("") + "</ol>";
    if (n < all.length) html += '<div class="top-btns"><button type="button" class="btn more-top">さらに' + Math.min(STEP, all.length - n) + "件表示する（" + (n + 1) + "〜" + Math.min(n + STEP, all.length) + "位）</button></div>";
    return html;
  }
  // 埋め込みページから届く高さの通知で iframe の高さを合わせる
  window.addEventListener("message", function (ev) {
    if (ev.origin !== "https://platform.twitter.com") return;
    var d = ev.data; if (typeof d === "string") { try { d = JSON.parse(d); } catch (e) { return; } }
    var m = d && d["twttr.embed"]; if (!m || m.method !== "twttr.private.resize" || !m.params || !m.params[0]) return;
    document.querySelectorAll("iframe.tw-frame").forEach(function (f) {
      if (f.contentWindow === ev.source) { var h = Math.ceil(+m.params[0].height); if (h > 0) { f.style.height = h + "px"; f.classList.add("is-ready"); } }
    });
  });
  function activateTops() {}
  function refreshTop(box) { box.innerHTML = topBlockHTML(box.dataset.date); }

  function renderList() {
    var list = isActive() ? DATA.events.filter(matches) : [];
    var base = state.year ? DATA.events.filter(function (e) { return e.date.slice(0, 4) === state.year; }).length : DATA.events.length;
    $("list-title").textContent = state.year ? state.year + "年の出来事" : "出来事一覧";
    $("list-help").hidden = !state.year;
    document.querySelectorAll(".ov-col").forEach(function (c) { c.classList.toggle("is-current", c.dataset.year === state.year); });

    if (!isActive()) {
      $("count").textContent = DATA.events.length + " 件";
      $("rows").innerHTML = '<div class="empty">上の年表で年を選ぶか、検索・絞り込みを使うと出来事が表示されます。<br>' +
        '<button type="button" id="show-all">すべて表示する（' + DATA.events.length + "件）</button></div>";
      $("show-all").addEventListener("click", function () { go("all"); });
      return;
    }
    $("count").textContent = list.length + " / " + base + " 件";
    if (!list.length) {
      $("rows").innerHTML = '<div class="empty">条件に合う出来事はありません。<br><button type="button" id="reset">絞り込みを解除する</button></div>';
      $("reset").addEventListener("click", function () { state.q = state.tag = state.src = state.imp = state.member = ""; syncControls(); renderList(); });
      return;
    }
    var html = '<ol class="table">', lastM = "";
    list.forEach(function (e) {
      var m = e.date.slice(0, 7);
      if (m !== lastM) {
        lastM = m;
        var label = m.length === 7 ? (state.year ? (+m.slice(5)) + "月" : m.slice(0, 4) + "年" + (+m.slice(5)) + "月") : m.slice(0, 4) + "年（月不明）";
        html += '<li class="month">' + label + "</li>";
      }
      html += rowHTML(e);
    });
    $("rows").innerHTML = html + "</ol>";
    activateTops($("rows"));
  }

  // ---- URL（#2019 / #2019/123456 / #all）と画面の対応
  function go(route) {
    if (route) location.hash = route;
    else { history.pushState(null, "", location.pathname + location.search); applyHash(); }
  }
  function applyHash(scroll) {
    var h = decodeURIComponent(location.hash.slice(1));
    if (h === "about" || h === "list" || h === "ov") return;
    var m = h.match(/^(\d{4})(?:\/(\d+))?$/);
    state.open = null;
    if (h === "all") { state.all = true; state.year = ""; }
    else if (m) { state.all = false; state.year = m[1]; if (m[2]) state.open = +m[2]; }
    else { state.all = false; state.year = ""; }
    syncControls(); renderList();
    if (scroll === false) return;
    var target = state.open && document.querySelector('.row[data-id="' + state.open + '"]');
    if (target) target.scrollIntoView({ block: "center" });
    else if (h) $("list").scrollIntoView();
  }

  function moreTop(btn) {
    var box = btn.closest(".fan-top"), date = box.dataset.date;
    SHOWN[date] = Math.min((SHOWN[date] || STEP) + STEP, MAX);
    refreshTop(box);
  }

  function onRowClick(ev) {
    var mb = ev.target.closest(".more-top"); if (mb) { moreTop(mb); return; }
    var btn = ev.target.closest(".row-main"); if (!btn) return;
    var li = btn.parentElement, id = +li.dataset.id, e = BY_ID[id];
    var wasOpen = state.open === id;
    var prev = state.open && document.querySelector('.row[data-id="' + state.open + '"]');
    if (prev) { prev.classList.remove("is-open"); prev.querySelector(".row-main").setAttribute("aria-expanded", "false"); var d = prev.querySelector(".r-detail"); if (d) d.remove(); }
    state.open = wasOpen ? null : id;
    if (!wasOpen) {
      li.classList.add("is-open"); btn.setAttribute("aria-expanded", "true");
      li.insertAdjacentHTML("beforeend", detailHTML(e));
      activateTops(li);
    }
    var newHash = state.open ? (state.year || e.date.slice(0, 4)) + "/" + id : (state.all ? "all" : state.year);
    history.replaceState(null, "", newHash ? "#" + newHash : location.pathname + location.search);
  }

  // ---- この年表について
  function renderAbout() {
    var ms = DATA.meta.members || [];
    var start = new Date("2017-01-01").getTime(), end = new Date(new Date(TODAY).getFullYear() + 1, 0, 1).getTime();
    var pct = function (d) { return ((new Date(d).getTime() - start) / (end - start)) * 100; };
    var lanes = ms.map(function (m) {
      var l = Math.max(0, pct(m.from)), r = m.to ? pct(m.to) : pct(TODAY);
      var t = m.name + "：" + m.from.replace(/-/g, ".") + "〜" + (m.to ? m.to.replace(/-/g, ".") : "現在");
      return '<div class="lane"><span class="who' + (m.to ? " former" : "") + '">' + esc(m.name) + '</span><span class="track" role="img" aria-label="' + esc(t) + '" title="' + esc(t) + '"><span class="bar' + (m.to ? "" : " current") + '" style="left:' + l + "%;width:" + Math.max(1, r - l) + '%"></span></span></div>';
    }).join("");
    var ticks = "";
    for (var y = 2017; y < new Date(end).getFullYear(); y += 2) ticks += '<span style="left:' + pct(y + "-07-01") + '%">' + y + "</span>";
    $("lanes").innerHTML = lanes + '<div class="axis" aria-hidden="true"><span></span><span class="ticks">' + ticks + "</span></div>";
    $("refs").innerHTML = (DATA.meta.references || []).map(function (g) {
      return "<h4>" + esc(g.group) + "</h4><ul>" + g.items.map(function (i) {
        return '<li><a href="' + esc(i.url) + '" target="_blank" rel="noopener">' + esc(i.label) + "</a></li>";
      }).join("") + "</ul>";
    }).join("");
    $("updated").textContent = "最終更新：" + (DATA.meta.updated || "").replace(/-/g, ".") + "（全" + DATA.events.length + "件）";
  }

  function init() {
    var addUrl = formLink((cfg.form && cfg.form.kinds && cfg.form.kinds.add) || "出来事の追加", null);
    ["request-link", "request-link-2"].forEach(function (id) { if (addUrl) $(id).href = addUrl; else $(id).hidden = true; });
    var t;
    $("q").addEventListener("input", function (ev) { clearTimeout(t); t = setTimeout(function () { state.q = ev.target.value.trim(); state.open = null; renderList(); }, 150); });
    ["tag", "src", "imp", "member"].forEach(function (k) {
      $("f-" + k).addEventListener("change", function (ev) { state[k] = ev.target.value; state.open = null; renderList(); });
    });
    $("f-year").addEventListener("change", function (ev) { var y = ev.target.value; if (y) go(y); else if (state.all) go("all"); else go(""); });
    $("ov-track").addEventListener("click", function (ev) { var c = ev.target.closest(".ov-col"); if (c) go(c.dataset.year); });
    $("rows").addEventListener("click", onRowClick);
    $("home-link").addEventListener("click", function (ev) { ev.preventDefault(); state.q = state.tag = state.src = state.imp = state.member = ""; go(""); window.scrollTo(0, 0); });
    $("nav-ov").addEventListener("click", function (ev) { ev.preventDefault(); $("ov").scrollIntoView(); });
    window.addEventListener("hashchange", function () { applyHash(); });
    window.addEventListener("popstate", function () { applyHash(false); });

    fetch(cfg.top5Url || "data/x_top5.json", { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (d) { TOP5 = (d && d.dates) || {}; }, function () {});

    fetch(cfg.dataUrl || "data/events.json", { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) {
        d.events.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
        DATA = d; d.events.forEach(function (e) { BY_ID[e.id] = e; });
        renderOverview(); fillSelects(); renderAbout();
        applyHash(!!location.hash);
        var cur = document.querySelector(".ov-col.is-current");
        if (cur) $("ov-scroll").scrollLeft = cur.offsetLeft - 40;
      })
      .catch(function () {
        $("rows").innerHTML = '<div class="empty">年表データ（data/events.json）を読み込めませんでした。ファイルを直接開いている場合は、READMEの手順でローカルサーバーから開いてください。</div>';
      });
  }
  init();
})();
