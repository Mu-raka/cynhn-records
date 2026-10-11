"""data/raw/member_events.json の内容を data/events.json に反映する（メンバー・公式の投稿から拾った出来事）"""
import json, hashlib, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
D = json.load(open(root / "data/events.json"))
M = json.load(open(root / "data/raw/member_events.json"))
ev = D["events"]; by = {e["id"]: e for e in ev}; ids = set(by)
LABEL = "X（メンバー・公式の投稿）"
def tw_src(ids_):
    return [{"label": LABEL, "url": "https://x.com/i/status/" + t} for t in ids_]
def add_src(e, srcs):
    have = {s["url"] for s in e.get("src", [])}
    e.setdefault("src", []).extend(s for s in srcs if s["url"] not in have)
added = updated = 0
for a in M["add"]:
    key = a["date"] + a["title"]
    if any(e["date"] == a["date"] and e["title"] == a["title"] for e in ev):
        continue
    n = int(hashlib.md5(key.encode()).hexdigest(), 16) % 900000 + 100000
    while n in ids: n += 1
    ids.add(n)
    e = {"date": a["date"], "type": a["type"], "title": a["title"], "note": a.get("note", ""), "hl": False,
         "src": ([{"label": "CYNHN 公式サイト", "url": a["url"]}] if a.get("url") else []) + tw_src(a["tw"]),
         "tags": a["tags"], "imp": 1, "members": a["members"], "id": n}
    pos = max([i + 1 for i, x in enumerate(ev) if x['date'][:10] <= a['date']] or [0])
    ev.insert(pos, e); added += 1
for u in M["update"]:
    e = by.get(u["id"])
    if not e: print("missing", u["id"]); continue
    if u.get("title"): e["title"] = u["title"]
    if u.get("note"): e["note"] = u["note"]
    add_src(e, tw_src(u["tw"])); updated += 1
json.dump(D, open(root / "data/events.json", "w"), ensure_ascii=False, indent=1)
print("added", added, "updated", updated, "total", len(ev))
