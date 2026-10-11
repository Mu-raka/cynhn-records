#!/usr/bin/env python3
"""CYNHNについて書かれた note・ブログ記事を出来事に結びつける。

入力: data/raw/blogs.json
  [{event_date（YYYY-MM-DD / YYYY-MM / YYYY / null）, event_hint, platform, author_type, kind, title, url, published, event_id?}, ...]

- 日付が分かる記事は、その日の出来事のうち event_hint と一番よく似たものに付ける
- 月や年までしか分からない記事は、その期間の出来事から似たものを探す
- 作品の感想は、ヒントに出てくる曲名・作品名を含むリリースの出来事に付ける
- どの出来事とも結びつかない記事は「この年表について」の参考ページに
  「note・ブログ（読みもの）」としてまとめる

使い方:
  python3 tools/add_blogs.py --dry -v
  python3 tools/add_blogs.py
"""
import json, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "blogs.json"
EVENTS = ROOT / "data" / "events.json"
DRY, VERBOSE = "--dry" in sys.argv, "-v" in sys.argv
READ_GROUP = "note・ブログ（出来事に結びつかない読みもの）"
PLATFORM = {"note": "note", "ameblo": "Amebaブログ", "はてなブログ": "はてなブログ"}
AUTHOR = {"スタッフ": "（制作スタッフ）", "メンバー": "（メンバー）", "ライター": "（ライター）"}
MIN_SIM = 0.25

def grams(s):
    s = re.sub(r"[\s「」『』【】（）()・/／\-–—〜~!！?？.,、。:：#＃@＠|]", "", s.lower()).replace("cynhn", "")
    return {s[i:i + 2] for i in range(len(s) - 1)}

def sim(a, b):
    A, B = grams(a), grams(b)
    return len(A & B) / min(len(A), len(B)) if A and B else 0.0

def names(s):
    return [m for m in re.findall(r"[「『]([^」』]{2,30})[」』]", s)]

def main():
    data = json.loads(EVENTS.read_text(encoding="utf-8"))
    events = data["events"]
    by_id = {e.get("id"): e for e in events}
    known = {s["url"] for e in events for s in e.get("src", [])}
    refs = data["meta"].setdefault("references", [])
    group = next((g for g in refs if g["group"] == READ_GROUP), None)
    if group is None:
        group = {"group": READ_GROUP, "items": []}
        refs.append(group)
    known |= {i["url"] for i in group["items"]}
    linked = reading = skipped = 0
    for b in json.loads(RAW.read_text(encoding="utf-8")):
        if b["url"] in known:
            skipped += 1
            continue
        label = f"{PLATFORM.get(b['platform'], 'ブログ')}{AUTHOR.get(b['author_type'], '')}「{b['title']}」"
        hint = b["event_hint"] + " " + b["title"]
        target = by_id.get(b.get("event_id")) if b.get("event_id") else None
        d = b.get("event_date")
        if not target and b["kind"] == "作品の感想":
            ns = names(hint)
            rel = [e for e in events if e["type"] == "release" and any(n in e["title"] for n in ns)]
            if rel:
                target = rel[0]
        if not target and d:
            if len(d) == 10:
                cands = [e for e in events if e["date"] == d and e["type"] != "release"]
                if b["kind"] == "作品の感想":
                    cands += [e for e in events if e["date"] == d and e["type"] == "release"]
                best = max(cands, key=lambda e: sim(hint, e["title"] + " " + e.get("note", "")), default=None)
                if best and (len(cands) == 1 or sim(hint, best["title"] + " " + best.get("note", "")) >= 0.1):
                    target = best
            else:
                cands = [e for e in events if e["date"].startswith(d)]
                best = max(cands, key=lambda e: sim(hint, e["title"] + " " + e.get("note", "")), default=None)
                if best and sim(hint, best["title"] + " " + best.get("note", "")) >= MIN_SIM:
                    target = best
        if target:
            target["src"].append({"label": label, "url": b["url"]})
            linked += 1
            if VERBOSE:
                print(f"= {target['date']} {target['title'][:32]} ← {label[:46]}")
        else:
            group["items"].append({"label": label + (f"（{b['published'][:7].replace('-', '.')}）" if b.get("published") else ""), "url": b["url"]})
            reading += 1
            if VERBOSE:
                print(f"□ 読みもの ← {label[:60]}  [{d}]")
        known.add(b["url"])
    print(f"出来事に結びつけた {linked}件 / 読みものとしてまとめた {reading}件 / 取り込み済み {skipped}件")
    if not DRY:
        EVENTS.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

if __name__ == "__main__":
    main()
