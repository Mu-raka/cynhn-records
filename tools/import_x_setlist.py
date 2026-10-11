#!/usr/bin/env python3
"""X の #CYNHN_setlist 投稿を整理したデータを data/events.json に取り込む。

入力: data/raw/x_setlist_2017_2019.json
  [{date, type, title, venue, setlist[], tweets[], note, merge, hl, redate}, ...]
  setlist の "▼" で始まる行は区切り（1部・2部・アンコールなど）。
  merge  … 既存の出来事に統合する場合、その出来事のタイトルに含まれる語
  redate … 既存の出来事が月までしか分かっていないとき、投稿の日付に直す

使い方:
  python3 tools/import_x_setlist.py --dry
  python3 tools/import_x_setlist.py

出典には投稿へのリンク（https://x.com/i/status/ID）を付けます。
同じ投稿がすでに出典にある出来事は取り込み済みとして飛ばすので、何度実行しても重複しません。
"""
import json, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "x_setlist_2017_2019.json"
EVENTS = ROOT / "data" / "events.json"
DRY = "--dry" in sys.argv

def tweet_src(i):
    return {"label": "X #CYNHN_setlist", "url": f"https://x.com/i/status/{i}"}

def main():
    data = json.loads(EVENTS.read_text(encoding="utf-8"))
    events = data["events"]
    known = {s["url"] for e in events for s in e.get("src", [])}
    added = merged = skipped = 0
    for r in json.loads(RAW.read_text(encoding="utf-8")):
        srcs = [tweet_src(i) for i in r["tweets"]]
        if any(s["url"] in known for s in srcs):
            skipped += 1
            continue
        if r.get("merge"):
            cands = [e for e in events if r["merge"] in e["title"] and
                     (e["date"] == r["date"] or (r.get("redate") and e["date"] == r["date"][:len(e["date"])]))]
            if len(cands) != 1:
                print(f"!! 統合先が見つからない/複数: {r['date']} {r['merge']} → {len(cands)}件")
                continue
            e = cands[0]
            if r.get("redate"):
                e["date"] = r["date"]
            if r["setlist"]:
                e["setlist"] = r["setlist"]
            extra = r.get("note", "")
            if extra and extra not in e.get("note", ""):
                e["note"] = (e.get("note", "") + "。" + extra).lstrip("。") if e.get("note") else extra
            if r.get("hl"):
                e["hl"] = True
            e["src"].extend(srcs)
            merged += 1
        else:
            note = "。".join(x for x in [r.get("venue", ""), r.get("note", "")] if x)
            ev = {"date": r["date"], "type": r["type"], "title": r["title"], "note": note,
                  "hl": bool(r.get("hl")), "src": srcs}
            if r["setlist"]:
                ev["setlist"] = r["setlist"]
            events.append(ev)
            added += 1
        known.update(s["url"] for s in srcs)
    events.sort(key=lambda e: e["date"])
    print(f"追加 {added}件 / 既存にセトリ等を統合 {merged}件 / 取り込み済み {skipped}件")
    if not DRY:
        EVENTS.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

if __name__ == "__main__":
    main()
