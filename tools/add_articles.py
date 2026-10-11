#!/usr/bin/env python3
"""ワンマンライブ・ツアーに関するWeb記事（ライブレポート・インタビュー・開催発表）を出典として足す。

入力: data/raw/articles.json
  [{event_date, outlet, kind（レポート/インタビュー/ニュース/コラム）, title, url, event_id?}, ...]
  event_id があればその出来事に、なければ同じ日付のワンマン・ツアー公演に付ける。

使い方:
  python3 tools/add_articles.py --dry
  python3 tools/add_articles.py
同じURLがすでに出典にある記事は飛ばすので、何度実行しても重複しません。
"""
import json, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "articles.json"
EVENTS = ROOT / "data" / "events.json"
DRY = "--dry" in sys.argv
KIND = {"レポート": "ライブレポート", "インタビュー": "インタビュー", "ニュース": "ニュース", "コラム": "コラム"}

def score(e):
    s = 0
    if "ワンマン" in e.get("tags", []): s += 4
    if e["type"] == "tour" or "ツアー" in e.get("tags", []): s += 3
    if e["type"] == "live": s += 1
    if e["type"] in ("release", "member"): s -= 5
    return s

def main():
    data = json.loads(EVENTS.read_text(encoding="utf-8"))
    events = data["events"]
    by_id = {e.get("id"): e for e in events}
    known = {s["url"] for e in events for s in e.get("src", [])}
    added = skipped = 0
    for a in json.loads(RAW.read_text(encoding="utf-8")):
        if a["url"] in known:
            skipped += 1
            continue
        if a.get("event_id"):
            e = by_id.get(a["event_id"])
        else:
            cands = sorted((e for e in events if e["date"] == a["event_date"]), key=score, reverse=True)
            e = cands[0] if cands and score(cands[0]) > 0 else None
        if not e:
            print(f"!! 付け先が見つからない: {a['event_date']} {a['outlet']} {a['title']}")
            continue
        label = f"{a['outlet']} {KIND.get(a['kind'], a['kind'])}「{a['title']}」"
        # 記事は公式サイトの後ろ、X投稿の前に入れる
        pos = next((i for i, s in enumerate(e["src"]) if "x.com/" in s["url"]), len(e["src"]))
        e["src"].insert(pos, {"label": label, "url": a["url"]})
        known.add(a["url"])
        added += 1
        if "-v" in sys.argv:
            print(f"+ {e['date']} {e['title'][:30]} ← {label[:50]}")
    print(f"記事 {added}件を追加 / 取り込み済み {skipped}件")
    if not DRY:
        EVENTS.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

if __name__ == "__main__":
    main()
