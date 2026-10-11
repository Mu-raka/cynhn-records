#!/usr/bin/env python3
"""X の #CYNHN_setlist 投稿（2021年4月〜）を data/events.json に取り込む。

入力: data/raw/x_setlist_2021_2026_part*.tsv
      1行1投稿「投稿日(JST)<TAB>投稿ID<TAB>本文（改行を / にしたもの）」

やること
  1. 本文から公演日・公演名・会場・1部/2部・曲目を読み取る
  2. 同じ日の既存の出来事と公演名・会場の似ている度合いで照合し、
     見つかればセットリストと投稿リンクを足す（すでにセットリストがあれば上書きしない）
  3. 見つからなければ新しい出来事として追加する
  4. 同じ公演の複数投稿（1部・2部、ステージ違い）は「▼1部」のような見出しでまとめる

使い方:
  python3 tools/import_x_setlist2.py --dry      # 照合結果を表示するだけ
  python3 tools/import_x_setlist2.py
投稿リンクがすでに出典にある投稿は飛ばすので、何度実行しても重複しません。
"""
import json, re, sys, pathlib, datetime, collections

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAWS = sorted((ROOT / "data" / "raw").glob("x_setlist_2021_2026_part*.tsv"))
EVENTS = ROOT / "data" / "events.json"
DRY = "--dry" in sys.argv
VERBOSE = "-v" in sys.argv
THRESHOLD = 0.12

# 自動照合を上書きする対応（投稿ID → 既存の出来事タイトルに含まれる語、または "new"）
MANUAL = {
    "1654766665081704450": "歌舞伎町 UP GATE",   # 同じ公演の2つ目の投稿
}
# 既存の出来事がない複数日・複数ステージの公演を1件にまとめる
# 投稿ID → (まとめ先の日付, タイトル, 補足, この投稿の見出し)
NEWGROUP = {
    "1687353242647408641": ("2023-08-04", "TOKYO IDOL FESTIVAL 2023", "お台場・青海周辺エリア 〜08/06", "HEAT GARAGE"),
    "1687408753283620864": ("2023-08-04", "TOKYO IDOL FESTIVAL 2023", "お台場・青海周辺エリア 〜08/06", "SKY STAGE"),
    "1687340463345594368": ("2023-08-04", "TOKYO IDOL FESTIVAL 2023", "お台場・青海周辺エリア 〜08/06", "SMILE GARDEN「Juice=Juice大好きステージ」"),
    "1687761823590952960": ("2023-08-04", "TOKYO IDOL FESTIVAL 2023", "お台場・青海周辺エリア 〜08/06", "FESTIVAL STAGE（トリ）"),
    "1687689528268787712": ("2023-08-04", "TOKYO IDOL FESTIVAL 2023", "お台場・青海周辺エリア 〜08/06", "SMILE GARDEN"),
    "1951496558496960561": ("2025-08-02", "TOKYO IDOL FESTIVAL 2025", "お台場・青海周辺エリア 〜08/03", "浮島ステージ"),
    "1951974709387813046": ("2025-08-02", "TOKYO IDOL FESTIVAL 2025", "お台場・青海周辺エリア 〜08/03", "SKY STAGE"),
    "1951934076069581016": ("2025-08-02", "TOKYO IDOL FESTIVAL 2025", "お台場・青海周辺エリア 〜08/03", "TOROCCO PARK"),
}

def src(i):
    return {"label": "X #CYNHN_setlist", "url": f"https://x.com/i/status/{i}"}

# ---------- 本文の読み取り ----------
DATE_PATS = [
    (re.compile(r"(20\d\d)\s*[./年]\s*(\d{1,2})\s*[./月]\s*(\d{1,2})"), "ymd"),
    (re.compile(r"(?<![\d/.])(\d{1,2})\s*[/月]\s*(\d{1,2})\s*日?\s*[\(（]"), "md"),
    (re.compile(r"^(\d{1,2})/(\d{1,2})(?!\d)"), "md"),
    (re.compile(r"^(\d{1,2})月(\d{1,2})日"), "md"),
]

def event_date(text, posted):
    p = datetime.date.fromisoformat(posted)
    head = text[:60]
    for pat, kind in DATE_PATS:
        m = pat.search(head)
        if not m:
            continue
        try:
            if kind == "ymd":
                d = datetime.date(int(m[1]), int(m[2]), int(m[3]))
            else:
                mo, da = int(m[1]), int(m[2])
                y = p.year - 1 if (mo == 12 and p.month == 1) else p.year
                d = datetime.date(y, mo, da)
        except ValueError:
            continue
        if 0 <= (p - d).days <= 4:
            return d.isoformat()
        if abs((p - d).days) <= 1:
            return d.isoformat()
    return posted

NUM = re.compile(r"^\s*(\d{1,2})\s*[.、．,)]\s*(.+)$|^\s*(\d{1,2})\s+(\D.+)$")
BUL = re.compile(r"^\s*[・･]\s*(.+)$")
JUNK2 = re.compile(r"セットリスト|セトリ$|^ツアーファイナル$|^全編(バンドセット|アコースティック)$|^[\s〜~\-ー－]*(MC|ＭＣ|mc)|^[〜~].*[〜~]$|ゲスト|^\d+$")
JUNK = re.compile(r"^[\s〜~\-ー－]*(MC\d?|mc|ＭＣ|SE\.?|Short MC|ショートMC|EN|encore|アンコール)[\s〜~\-ー－]*$|"
                  r"^(CYNHN\s*)?(セトリ|セットリスト)$|^CYNHN(（スウィーニー）)?(セトリ|セットリスト)?$|^CYNHN セトリ$|^CYNHN セットリスト$|^綾瀬志希 セトリ$")
NOTE = re.compile(r"来て|きてね|発売|公開|決定|あります|初披露予定|見てね|開催|ラスト|加入|遠征|振付け|収録|体調不良|トークパート|伴奏|編成|出演：|※|^\(|^（|^「.*」$|！$|!$")
SECTION = re.compile(r"コーナー|^【.+】$|^［.+］$|^《.+》$|^〈.+〉$|^＜.+＞$|ステージ$|STAGE$|セット$|コラボ$|^コラボ|^\d部$|部$|限定ステージ|パート$")
PART = re.compile(r"([1-4一二三四])\s*部|(昼|夜)の部|Day\s*\d|DAY\s*\d|day\s*\d")
VENUE = re.compile(r"^\s*[@＠]\s*(.+)$|[＠@]\s*([^/＠@]+)$")

def balance(segs):
    """括弧の途中で / が入って割れた行をつなぎ直す。"""
    out = []
    for s in segs:
        if out and (out[-1].count("(") > out[-1].count(")") or out[-1].count("（") > out[-1].count("）")):
            out[-1] += "/" + s
        else:
            out.append(s)
    return out

def parse(posted, tid, text):
    # 先頭の日付の「/」で行が割れないように置き換えておく
    body_text = re.sub(r"^(20\d\d)/(\d{1,2})/(\d{1,2})", r"\1.\2.\3", text.strip())
    body_text = re.sub(r"^(\d{1,2})/(\d{1,2})(?!\d)", r"\1月\2日", body_text)
    body_text = re.sub(r"(?<!\d)(\d{1,2})/(\d{1,2})(?=\s*[\(（日〜～]|発売|の)", r"\1／\2", body_text)
    segs = [s.strip() for s in balance(body_text.split("/")) if s.strip()]
    rec = {"posted": posted, "id": tid, "date": event_date(text, posted), "title": "", "venue": "",
           "part": "", "songs": [], "raw": text}
    numbered = sum(1 for s in segs if NUM.match(s))
    bullets = sum(1 for s in segs if BUL.match(s))
    head, body, started = [], [], False
    for s in segs:
        if NUM.match(s) or BUL.match(s):
            started = True
        if started:
            body.append(s)
        else:
            head.append(s)
    # 番号も・もない投稿は、会場（@〜）の後ろを曲目とみなす
    if not numbered and not bullets:
        vi = max((i for i, s in enumerate(segs) if "@" in s or "＠" in s), default=-1)
        if vi >= 0:
            head, body = segs[:vi + 1], segs[vi + 1:]
        else:
            head, body = segs, []
    # 見出し側：公演名・会場・部
    titles = []
    for s in head:
        pm = PART.search(s)
        if pm and not rec["part"]:
            rec["part"] = pm[0].replace(" ", "")
        vm = VENUE.search(s)
        if vm:
            v = (vm[1] or vm[2] or "").strip()
            before = s[:vm.start()].strip()
            if v and not rec["venue"]:
                rec["venue"] = v
            if before:
                titles.append(before)
            continue
        if JUNK.match(s) or re.fullmatch(r"(CYNHN.*セ(トリ|ットリスト)|セットリスト|CYNHN)", s):
            continue
        titles.append(s)
    t = " ".join(titles)
    t = re.sub(r"^《[^》]*》", "", t)
    t = re.sub(r"^(20\d\d\s*[./年]\s*\d{1,2}\s*[./月]\s*\d{1,2}日?|\d{1,2}\s*[/月]\s*\d{1,2}日?)\s*[\(（][^)）]*[\)）]?\s*", "", t)
    t = re.sub(r"^(20\d\d\s*[./]\s*\d{1,2}\s*[./]\s*\d{1,2}|\d{1,2}/\d{1,2}|\d{1,2}月\d{1,2}日)\s*", "", t)
    t = re.sub(r"\s*(CYNHN\s*)?(（スウィーニー）|\(スウィーニー\))?\s*(セットリスト|セトリ)\s*$", "", t)
    t = re.sub(r"\s+", " ", t).strip(" 　/")
    rec["title"] = t
    # 曲目
    songs = []
    for s in body:
        m = NUM.match(s)
        b = BUL.match(s)
        if m:
            name = (m[2] or m[4]).strip()
        elif b:
            name = b[1].strip()
        else:
            name = s.strip()
            if JUNK.match(name) or JUNK2.search(name):
                continue
            if (numbered or bullets) and songs and not SECTION.search(name) and not NOTE.search(name) and not VENUE.search(name):
                # 番号付きの曲の後ろの番号なし行は、歌唱者や原曲アーティストの補足
                songs[-1] += "（" + name + "）"
                continue
            if SECTION.search(name) and not NOTE.search(name):
                songs.append("▼" + name.strip("【】［］《》〈〉＜＞ "))
                continue
            if NOTE.search(name) or VENUE.search(name) or len(name) > 40:
                continue
        name = re.sub(r"\s*[\(（](撮影可能曲|short ver|short|新振付け|\d+[/／]\d+発売)[\)）]", "", name).strip()
        name = re.sub(r"\s+", " ", name)
        if not name or JUNK.match(name) or JUNK2.search(name):
            continue
        songs.append(name)
    while songs and songs[-1].startswith("▼"):
        songs.pop()
    rec["songs"] = SONG_FIX.get(tid, songs)
    rec["bare"] = not numbered and not bullets
    return rec

# ---------- 照合 ----------
def grams(s):
    s = re.sub(r"[\s「」『』【】（）()・/／\-–—〜~!！?？.,、。:：#＃@＠]", "", s.lower())
    s = s.replace("cynhn", "")
    return {s[i:i + 2] for i in range(len(s) - 1)}

def sim(a, b):
    A, B = grams(a), grams(b)
    if not A or not B:
        return 0.0
    return len(A & B) / min(len(A), len(B))

# 自動では読み取りにくい投稿の曲目（投稿ID → 曲目）
SONG_FIX = {
    "1832734576466375153": ["アンサンぶる", "水生", "飴玉", "いいおくり"],
    "1710923895245877464": ["水生", "アンサンぶる", "ジンテーゼ", "キリグニア", "楽の上塗り"],
    "1711234080124395533": ["ラルゴ", "水生", "サファイア", "はりぼて", "ジンテーゼ"],
    "1748940043316789590": ["キャットフード（Doriko）", "Smile Runway（月雲ねる）"],
    "1789242146547195955": ["▼青柳透", "くちづけキボンヌ（でんぱ組.inc）", "▼綾瀬志希", "ジンテーゼ", "▼チーム恥知らず", "水生"],
    "2052721713897717877": ["#夢の続き（強がりセンセーション）", "メロンジュース（HKT48）", "真昼の花火（Fullfull Pocket）",
                            "辛夷の花（こぶしファクトリー）", "Funny Bunny（the pillows）", "楽の上塗り"],
}

LABELS = {
    "1731204044075737341": "Corner House 角落文創",
    "1731278572588072989": "Jack studio mini",
    "2083433230401929324": "HEAT GARAGE（TIF ASIA TOUR 2026 スペシャルライブステージ）",
    "2083748358427152418": "HEAT GARAGE（Tシャツ購入者限定ステージ）",
    "2091110685136859279": "Night",
    "2091089658377883979": "Day",
    "1830228261970022492": "Villa Stage（アコースティックコラボ）",
    "1830169053874569516": "Villa Stage（全編アコースティック）",
    "1830091518151192942": "Lodge Stage",
}

def section_label(r, all_recs):
    if r.get("label"):
        return r["label"]
    if r["id"] in LABELS:
        return LABELS[r["id"]]
    lab = r["part"]
    if lab and sum(1 for x in all_recs if x["part"] == lab) > 1 and r["venue"]:
        lab = lab + " " + r["venue"]
    if not lab and r["venue"]:
        venues = {x["venue"] for x in all_recs}
        if len(venues) > 1:
            lab = r["venue"]
    return lab

def build_setlist(recs):
    # 同じ曲目の重複投稿は1つにまとめる
    uniq, seen = [], set()
    for r in recs:
        key = tuple(r["songs"])
        if not key or key in seen:
            continue
        seen.add(key)
        uniq.append(r)
    if not uniq:
        return []
    if len(uniq) == 1:
        return uniq[0]["songs"]
    order = {"1部": 1, "一部": 1, "昼の部": 1, "2部": 2, "二部": 2, "夜の部": 2, "3部": 3}
    uniq.sort(key=lambda r: (order.get(r["part"], 5), int(r["id"])))
    out = []
    multi_day = len({r["date"] for r in uniq}) > 1
    if multi_day:
        uniq.sort(key=lambda r: (r["date"], order.get(r["part"], 5), int(r["id"])))
    for n, r in enumerate(uniq, 1):
        lab = section_label(r, uniq) or ("" if multi_day else f"投稿{n}")
        if multi_day:
            lab = (f"{int(r['date'][5:7])}/{int(r['date'][8:10])} " + lab).strip()
        out.append("▼" + lab)
        out.extend(r["songs"])
    return out

KIND_RULES = [
    (re.compile(r"リリースイベント|リリイベ|発売記念|リリース記念|特典会|プレミアムイベント"), "event"),
    (re.compile(r"ツアー|TOUR"), "tour"),
    (re.compile(r"生誕|バースデー|ファンミーティング|来店|クリスマスパーティ|ハロウィン|定期イベント|親善大使|オフ会|ぽやら|ラジオ|れいチャット|周年"), "event"),
    (re.compile(r"配信|YouTube|LINELIVE|zaiko|ZAIKO|Twitch|TikTok"), "media"),
]

def tidy_title(t):
    t = re.sub(r"【?[1-4一二]部】?|(昼|夜)の部", "", t)
    t = re.sub(r"^CYNHN\s*(?=[「『A-Za-z0-9ぁ-んァ-ヶ一-龠#])(?!\s*[&＆／/×])", "", t).strip()
    t = re.sub(r"\s*CYNHN\s*(?=青柳透|綾瀬志希|月雲ねる|広瀬みのり)", " ", t)
    t = t.replace("# ", "#").replace(" TikTok", "")
    t = re.sub(r"\s+", " ", t).strip()
    if t[:1] in "「『" and t[-1:] in "」』" and t.count("「") + t.count("『") == 1:
        t = t[1:-1]
    return t.strip()

def kind(r):
    t = r["title"] + " " + r["venue"]
    for p, k in KIND_RULES:
        if p.search(t):
            return k
    return "live"

def main():
    data = json.loads(EVENTS.read_text(encoding="utf-8"))
    events = data["events"]
    known = {s["url"] for e in events for s in e.get("src", [])}
    recs = []
    for f in RAWS:
        for line in f.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            posted, tid, text = (line.split("\t") + ["", ""])[:3]
            if not text.strip() or src(tid)["url"] in known:
                continue
            recs.append(parse(posted, tid, text))
    # 番号なしの投稿は、ほかの投稿で曲名と分かっている行が出てくるまでを公演名などとみなして外す
    known_songs = {x for r in recs if not r["bare"] for x in r["songs"] if not x.startswith("▼")}
    for r in recs:
        if r["bare"] and r["id"] not in SONG_FIX:
            while r["songs"] and r["songs"][0] not in known_songs:
                r["songs"].pop(0)
    by_date = collections.defaultdict(list)
    for e in events:
        by_date[e["date"]].append(e)

    targets = collections.defaultdict(list)   # id(event) -> recs
    newgroups = collections.defaultdict(list)
    ev_by_id = {}
    def span(e):
        """「〜08/06」「8/1・8/2」のような複数日開催の最終日を返す。"""
        m = re.search(r"〜\s*(\d{1,2})/(\d{1,2})", e.get("note", "")) or \
            re.search(r"[・〜~]\s*(\d{1,2})/(\d{1,2})\s*$", e.get("note", ""))
        if not m:
            return e["date"]
        y = e["date"][:4]
        return f"{y}-{int(m[1]):02d}-{int(m[2]):02d}"
    multi = [e for e in events if len(e["date"]) == 10 and span(e) > e["date"]]

    def candidates(r):
        d = r["date"]
        out = [(e, 0.0) for e in by_date.get(d, []) if e["type"] != "release"]
        out += [(e, 0.0) for e in multi if e["date"] < d <= span(e)]
        dd = datetime.date.fromisoformat(d)
        for off in (-1, 1):
            o = (dd + datetime.timedelta(days=off)).isoformat()
            out += [(e, 0.25) for e in by_date.get(o, []) if e["type"] != "release"]
        return out

    for r in recs:
        q = r["title"] + " " + r["venue"]
        if r["id"] in NEWGROUP:
            g = NEWGROUP[r["id"]]
            r["label"] = g[3]
            newgroups[(g[0], g[1], g[2])].append(r)
            r["_match"] = None
            continue
        man = MANUAL.get(r["id"])
        cands = [] if man == "new" else candidates(r)
        if man and man != "new":
            cands = [(e, 0.0) for e in events if man in e["title"] and abs((datetime.date.fromisoformat(e["date"][:10] if len(e["date"]) == 10 else r["date"]) - datetime.date.fromisoformat(r["date"])).days) <= 4]
        best, score = None, 0.0
        if man and man != "new" and cands:
            best, score = cands[0][0], 1.0
            cands = []
        for e, pen in cands:
            s = max(sim(q, e["title"] + " " + e.get("note", "")), sim(r["venue"], e.get("note", "")) if r["venue"] else 0)
            need = THRESHOLD + pen + (0.2 if e["type"] == "member" else 0)
            if s >= need and s - need > score - (0 if best is None else 0):
                if best is None or s > score:
                    best, score = e, s
        if best is not None:
            targets[id(best)].append(r)
            ev_by_id[id(best)] = best
            r["_match"] = (best["title"], round(score, 2))
        else:
            key = (r["date"], re.sub(PART, "", r["title"]).strip()[:18] or r["venue"])
            newgroups[key].append(r)
            r["_match"] = None

    merged = added = 0
    for k, rs in targets.items():
        e = ev_by_id[k]
        sl = build_setlist(rs)
        if sl and not e.get("setlist"):
            e["setlist"] = sl
        elif not sl and not e.get("setlist") and "画像を参照" not in e.get("note", ""):
            e["note"] = (e["note"] + "。" if e.get("note") else "") + "セットリストは投稿の画像を参照"
        for r in sorted(rs, key=lambda r: int(r["id"])):
            e["src"].append(src(r["id"]))
        merged += 1
        if VERBOSE:
            print(f"= {e['date']} {e['title'][:40]}  ←{len(rs)}投稿 曲{len(sl)}")
    for key, rs in sorted(newgroups.items()):
        d = key[0]
        r0 = max(rs, key=lambda r: len(r["title"]))
        title = key[1] if len(key) == 3 else tidy_title(r0["title"] or r0["venue"] or "ライブ出演")
        note = key[2] if len(key) == 3 else r0["venue"]
        sl = build_setlist(rs)
        ev = {"date": d, "type": kind(r0) if len(key) == 2 else "live", "title": title, "note": note, "hl": False,
              "src": [src(r["id"]) for r in sorted(rs, key=lambda r: int(r["id"]))]}
        if sl:
            ev["setlist"] = sl
        else:
            ev["note"] = (ev["note"] + "。" if ev["note"] else "") + "セットリストは投稿の画像を参照"
        events.append(ev)
        added += 1
        if VERBOSE:
            print(f"+ {d} [{ev['type']}] {title[:50]} @ {r0['venue'][:30]}  曲{len(sl)}")
    events.sort(key=lambda e: e["date"])
    print(f"投稿 {len(recs)}件 → 既存の出来事に統合 {merged}件 / 新規追加 {added}件")
    if not DRY:
        EVENTS.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

if __name__ == "__main__":
    main()
