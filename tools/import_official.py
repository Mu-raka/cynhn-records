#!/usr/bin/env python3
"""公式サイトの LIVE/EVENT 一覧を data/events.json に取り込む。

入力: data/raw/official_live_event.txt
      1行1件「日付|カテゴリ|タイトル|URL」
      （https://cynhn.com/contents/information/live,event/page/N を書き写したもの）
      カテゴリを SKIP にした行は取り込まない（グッズ案内など）。

使い方:
  python3 tools/import_official.py          # 取り込んで events.json を更新
  python3 tools/import_official.py --dry    # 何が起きるかだけ表示

既存の出来事と同じ日付・同じ公演と判断したものは新規追加せず、
既存の出来事に公式ページを出典として追記します。
同じURLがすでに出典にあるものは二重に取り込みません（何度実行しても安全）。
"""
import json, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "official_live_event.txt"
EVENTS = ROOT / "data" / "events.json"
DRY = "--dry" in sys.argv
THRESHOLD = 0.35
# 自動判定では拾えない「同じ出来事」の対応（公式URL → 既存の出来事タイトルに含まれる語）
MANUAL_MERGE = {
    "https://cynhn.com/contents/289982": "新年会2020",
    "https://cynhn.com/contents/507959": "Blue Cresc. -ν-",
    "https://cynhn.com/contents/680824": "台湾の対バン",
    "https://cynhn.com/contents/1004713": "LAVILITH",
}

CANCEL = re.compile(r"中止|出演キャンセル")
POSTPONE = re.compile(r"延期")

def norm_date(s):
    m = re.match(r"(\d{4})\.(\d{2})\.(\d{2})", s)
    return f"{m[1]}-{m[2]}-{m[3]}" if m else None

def end_date(s):
    m = re.search(r"〜\s*(\d{4})\.(\d{2})\.(\d{2})", s)
    return f"{m[1]}-{m[2]}-{m[3]}" if m else None

LEAD = [
    r"^※振替※\s*",
    r"^【(NEWS|TOUR[^】]*|全国TOUR[^】]*|オフ会|RELEASE EVENT|EVENT情報|FC会員限定イベント|開催中止|中止|公演延期|延期|出演キャンセル|無期限延期|特典会開催|応募受付中|※[^】]*)】\s*",
    r"^《[^》]*》\s*", r"^\[[^\]]*\]\s*",
    r"^\d{4}年\d{1,2}月\d{1,2}日\s*(\([^)]*\))?\s*",
    r"^\d{4}[./]\d{1,2}[./]\d{1,2}\.?\s*(\([^)]*\)|（[^）]*）)?",
    r"^\d{1,2}/\d{1,2}\s*(\([^)]*\))?\s*",
    r"^(～|〜|~|＆|&|,|・)\s*\d{1,2}(\.\d{1,2})?\s*(\([^)]*\))?\s*",
    r"^\d{2}\.\d{2}\s*\([^)]*\)\s*",
    r"^\d{2}\s*\([^)]*\)\s*(開催)?\s*",
    r"^開催[、,]?\s*",
    r"^\s*(\[\d部\])?\s*\d{1,2}:\d{2}\s*([/〜~]\s*\d{1,2}:\d{2})?\s*(〜|~)?\s*",
    r"^\s*[①②]\s*\d{1,2}:\d{2}\s*(/)?",
    r"^\s*開催(の)?\s*", r"^\s*※\s*",
]
TRAIL = r"(に|へ)?(CYNHNの)?(出演|参加)(が)?(決定)?(を)?(いた|致)します[。！!]?$|(を)?開催(いた|致)します[。！!]?$|(が)?開催決定[！!。]*$|開催決定！(?= supported)|(の)?開催が決定しました。$|開催[！!。]?$|出演決定[！!]?$|が決定致しました。$|を開催致します$|配信決定！$"

def clean_title(t):
    t = t.strip()
    for _ in range(4):
        for p in LEAD:
            t = re.sub(p, "", t).strip()
    t = re.sub(r"\s*(（|\()?(※)?(チケット完売|無料チケット有|配信有)[^)）]*(）|\))?", "", t)
    for _ in range(2):
        t = re.sub(TRAIL, "", t).strip()
    t = re.sub(r"(\(|（)?FC会員限定(イベント)?(\)|）)?", "", t).strip()
    if t[:1] == "【" and t[-1:] == "】":
        t = t[1:-1].strip()
    if t.endswith("が"):
        t += "出演"
    if t[:1] in "「『" and t[-1:] in "」』" and t.count("「") + t.count("『") == 1:
        t = t[1:-1].strip()
    return t

def tidy(t):
    """会場を切り出したあとのタイトルの体裁をそろえる。"""
    t = t.strip()
    if t[:1] in "「『" and t[-1:] in "」』" and t.count("「") + t.count("『") == 1:
        t = t[1:-1].strip()
    m = re.match(r"^-?\s*CYNHN定期イベント@J-SQUARE-\s*目指せ!JOYSOUND親善大使(\(仮\)?)?\s*(.*)$", t)
    if m:
        t = "CYNHN定期イベント「目指せ!JOYSOUND親善大使」" + (" " + m[2].strip() if m[2].strip() else "")
    m = re.match(r"^w/\s*(.+?) CYNHN主催 夏の対バン企画「(.+)」$", t)
    if m:
        t = f"主催対バン「{m[2]}」 w/ {m[1]}"
    return t.strip()

def split_venue(t):
    """最後の「＠会場」をタイトルから切り出す（「」の内側は見ない）。"""
    depth, cut = 0, -1
    for i, ch in enumerate(t):
        if ch in "「『": depth += 1
        elif ch in "」』": depth = max(0, depth - 1)
        elif ch in "＠@" and depth == 0 and i > 0:
            cut = i
    if cut > 0:
        return t[:cut].strip(" 　"), t[cut + 1:].strip(" 　")
    m = re.search(r"\s(東京|大阪|愛知|神奈川|埼玉|京都|静岡|茨城|千葉|福岡|北海道)[・：:](.+)$", t)
    if m:
        return t[:m.start()].strip(), m[1] + "・" + m[2]
    return t, ""

def kind(cat, title):
    if "TOUR" in cat or re.search(r"TOUR 20\d\d|LIVE TOUR|リリースツアー|東名阪ツアー", title) and "CYNHN" in title or "BLUE LINE SWINGER" in title:
        return "tour"
    if "定期イベント@J-SQUARE" in title:
        return "event"
    if cat.startswith("EVENT") or cat.startswith("RELEASE") or re.search(
            r"リリースイベント|サイン会|特典会|チェキ|オフ会|展|1日店長|ぽやら|Tea Party|ラジオ|チャットルーム|来店|ガラポン|配信$|旅|ツアー〜|しゃべり場|SHAKE UP", title):
        if not re.search(r"生誕|バースデーライブ|フリーライブ|Release LIVE", title):
            return "event"
    return "live"

def bigrams(s):
    s = re.sub(r"[\s「」『』【】()（）・\-－—!！?？。、,＆&＠@]", "", s.lower())
    return {s[i:i + 2] for i in range(len(s) - 1)}

def similar(a, b):
    A, B = bigrams(a), bigrams(b)
    return len(A & B) / max(1, min(len(A), len(B)))

def main():
    data = json.loads(EVENTS.read_text(encoding="utf-8"))
    events = data["events"]
    known_urls = {s["url"] for e in events for s in e.get("src", [])}
    seen = set()
    added, merged, skipped = [], [], 0

    original = list(events)
    items = []
    for line in RAW.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        date_s, cat, raw_title, url = (line.split("|") + ["", "", "", ""])[:4]
        if cat == "SKIP" or not norm_date(date_s):
            skipped += 1
            continue
        if url in known_urls:
            continue
        date, end = norm_date(date_s), end_date(date_s)
        title, venue = split_venue(clean_title(raw_title))
        title = tidy(title)
        k = kind(cat, raw_title)
        status = "canceled" if CANCEL.search(raw_title) else "postponed" if POSTPONE.search(raw_title) and "振替" not in raw_title and "延期公演" not in raw_title else None
        key = (date, re.sub(r"\s", "", title))
        if key in seen:
            continue
        seen.add(key)
        best, score = None, 0.0
        for i, e in enumerate(original):
            same_day = e["date"] == date or (end and date <= e["date"] <= end)
            if not same_day:
                continue
            compatible = (k in ("live", "tour") and e["type"] in ("live", "tour", "member")) or \
                         (k == "event" and e["type"] in ("other", "event", "media"))
            if not compatible:
                continue
            sc = similar(title + venue, e["title"] + " " + e.get("note", ""))
            if sc > score:
                best, score = i, sc
        if url in MANUAL_MERGE:
            for i, e in enumerate(original):
                if MANUAL_MERGE[url] in e["title"]:
                    best, score = i, 1.0
        items.append(dict(date=date, end=end, title=title, venue=venue, kind=k,
                          status=status, url=url, best=best if score >= THRESHOLD else None, score=score))
        known_urls.add(url)

    # 1つの既存の出来事には、いちばん似ている公式項目だけを統合する
    winner = {}
    for n, it in enumerate(items):
        b = it["best"]
        if b is not None and (b not in winner or items[winner[b]]["score"] < it["score"]):
            winner[b] = n
    win_set = set(winner.values())

    for n, it in enumerate(items):
        src = {"label": "CYNHN 公式サイト", "url": it["url"]}
        if n in win_set:
            e = original[it["best"]]
            e["src"].append(src)
            if it["status"] and not e.get("status"):
                e["status"] = it["status"]
            merged.append((it["date"], it["title"], e["title"], round(it["score"], 2)))
            continue
        end = it["end"]
        ev = {"date": it["date"], "type": it["kind"], "title": it["title"],
              "note": " ".join(x for x in [it["venue"], ("〜" + end[5:].replace("-", "/")) if end and end != it["date"] else ""] if x),
              "hl": False, "src": [src]}
        if it["status"]:
            ev["status"] = it["status"]
        events.append(ev)
        added.append(ev)

    events.sort(key=lambda e: e["date"])
    print(f"追加 {len(added)}件 / 既存に出典を追記 {len(merged)}件 / 対象外 {skipped}件")
    if DRY:
        for m in merged:
            print("MERGE", *m)
        for a in added[:40]:
            print("ADD", a["date"], a["type"], a["title"], "|", a["note"], a.get("status", ""))
        return
    EVENTS.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

if __name__ == "__main__":
    main()
