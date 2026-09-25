"""把 202 个做菜卡牌映射成中文名。

中文页（Data:* zh.json）里有 {Label: 中文名, id: 英文卡牌id}，
所以英文 id → 中文名 是精确对应，不是模糊匹配。

同时把 data.json 现有菜名（recipe_trees 键）和维基中文名做模糊匹配，
标出 一致 / 不一致 / 找不到 三类。
"""
import json, glob, re, os
from difflib import SequenceMatcher

# 1) 英文卡牌 → 标签（含 202 个做菜卡牌）
food = json.load(open('_源数据/_菜品标签.json', encoding='utf-8'))

# 2) 中文页 → {中文名, 英文id}
zh = {}
for f in glob.glob('_源数据/_zh/p*.json'):
    for t, j in json.load(open(f, encoding='utf-8')).items():
        if j and j.get('id') and j.get('Label'):
            zh[j['id']] = j['Label']

print('中文页可用 %d 个（其中做菜卡牌能匹配到 %d / %d）'
      % (len(zh), sum(1 for k in food if k in zh), len(food)))

# 3) 现有菜名
src = json.load(open('src/data.json', encoding='utf-8'))
dishes = list(src.get('recipe_trees', {}).keys())
ingrs = [x['名称'] for x in src.get('catalog', {}).get('食材清单', [])]

# 4) 中文卡牌名集合
zh_food_names = {zh[k]: k for k in food if k in zh}


def best_match(name, pool, thr=0.5):
    """模糊匹配，返回 (最佳名, 相似度)"""
    best, bs = None, 0.0
    for p in pool:
        s = SequenceMatcher(None, name, p).ratio()
        if s > bs:
            best, bs = p, s
    return (best, round(bs, 3)) if bs >= thr else (None, round(bs, 3))


rows = []
for dish in dishes:
    # 维基里这道菜的中文名
    zhname, score = best_match(dish, list(zh_food_names.keys()))
    rows.append({
        '现有菜名': dish,
        '维基菜名': zhname,
        '相似度': score,
        '英文id': zh_food_names.get(zhname),
        '身份': food.get(zh_food_names.get(zhname), {}).get('身份'),
        '分类': food.get(zh_food_names.get(zhname), {}).get('分类'),
        '生的': food.get(zh_food_names.get(zhname), {}).get('生的'),
    })

# 5) 按置信度分档
exact = [r for r in rows if r['相似度'] >= 0.85]
mid = [r for r in rows if 0.6 <= r['相似度'] < 0.85]
low = [r for r in rows if r['相似度'] < 0.6]

json.dump(rows, open('_源数据/_菜名对照.json', 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)

print('\n现有 %d 道菜 → 维基菜名匹配' % len(dishes))
print('  高置信 (>=0.85): %d' % len(exact))
print('  中置信 (0.6~0.85): %d' % len(mid))
print('  低置信 (<0.6): %d' % len(low))

print('\n=== 高置信样例（前 12）===')
for r in sorted(exact, key=lambda x: -x['相似度'])[:12]:
    print('  %-12s ≈ %-14s %.2f  %s %s'
          % (r['现有菜名'], r['维基菜名'], r['相似度'],
             r['分类'] or '-', r['英文id']))

print('\n=== 中置信（需要你确认）===')
for r in sorted(mid, key=lambda x: -x['相似度']):
    print('  %-12s ≈ %-14s %.2f  %s %s'
          % (r['现有菜名'], r['维基菜名'], r['相似度'],
             r['分类'] or '-', r['英文id']))

print('\n=== 低置信（基本匹配不上）===')
for r in sorted(low, key=lambda x: -x['相似度'])[:20]:
    print('  %-12s → 最近 %-12s %.2f  %s'
          % (r['现有菜名'], r['维基菜名'], r['相似度'], r['英文id']))

# 6) 维基里有但项目里没有的菜
missing = [(n, k) for n, k in zh_food_names.items()
           if not best_match(n, dishes)[0] or
           SequenceMatcher(None, n, best_match(n, dishes)[0]).ratio() < 0.7]
print('\n=== 维基有但项目缺的菜（约 %d 个）===' % len(missing))
for n, k in sorted(missing)[:25]:
    print('  %-16s %s  %s' % (n, k, food[k].get('分类') or '无分类'))

print('\n写入 _源数据/_菜名对照.json')
