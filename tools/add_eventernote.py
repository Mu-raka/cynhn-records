"""data/raw/eventernote.json の内容を data/events.json に反映する（イベンターノートから拾ったイベント）

- add    : 既存の年表に無かったイベントを追加（1部・2部はまとめて1件）
- update : 既存イベントの日付・タイトル・メモの補正
- link   : 既存イベントにイベンターノートのページを出典として追加
"""
import json, hashlib, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
D = json.load(open(root / "data/events.json"))
E = json.load(open(root / "data/raw/eventernote.json"))
ev = D["events"]; ids = {e["id"] for e in ev}
LABEL = "イベンターノート"
def en_src(en):
    return [{"label": LABEL, "url": f"https://www.eventernote.com/events/{i}"} for i in en[:3]]
def add_src(e, srcs):
    have = {s["url"] for s in e.get("src", [])}
    e.setdefault("src", []).extend(s for s in srcs if s["url"] not in have)
def insert_sorted(e):
    pos = max([i + 1 for i, x in enumerate(ev) if x["date"][:10] <= e["date"]] or [0])
    ev.insert(pos, e)
by = {e["id"]: e for e in ev}
added = updated = linked = 0
for u in E["update"]:
    e = by.get(u["id"])
    if not e: print("missing", u["id"]); continue
    for k in ("title", "note"):
        if u.get(k): e[k] = u[k]
    add_src(e, en_src(u["en"]))
    if u.get("date") and e["date"] != u["date"]:
        ev.remove(e); e["date"] = u["date"]; insert_sorted(e)
    updated += 1
for l in E["link"]:
    e = by.get(l["id"])
    if e: add_src(e, en_src(l["en"])); linked += 1
for a in E["add"]:
    if any(e["date"] == a["date"] and e["title"] == a["title"] for e in ev):
        continue
    n = int(hashlib.md5((a["date"] + a["title"]).encode()).hexdigest(), 16) % 900000 + 100000
    while n in ids: n += 1
    ids.add(n)
    insert_sorted({"date": a["date"], "type": a["type"], "title": a["title"], "note": a["note"], "hl": False,
                   "src": en_src(a["en"]), "tags": a["tags"], "imp": 1, "members": a["members"], "id": n})
    added += 1
json.dump(D, open(root / "data/events.json", "w"), ensure_ascii=False, indent=1)
print("added", added, "updated", updated, "linked", linked, "total", len(ev))
