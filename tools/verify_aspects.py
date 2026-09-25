"""反推 13 种性相的英文→中文映射。

只用 data.json 里已有的「中文性相 + 数值」与维基英文 aspects 交叉对照，
不靠任何硬编码假设。输出每个英文 key 的候选中文标签及支持卡牌数。
"""
import json, glob, collections

src = json.load(open('src/data.json', encoding='utf-8'))

# 英文 aspect key 集合（有 boost．配套的就是性相）
asp = collections.Counter()
cards = {}
for f in glob.glob('_源数据/_content/p*.json'):
    for t, j in json.load(open(f, encoding='utf-8')).items():
        if not j:
            continue
        a = j.get('aspects', {}) or {}
        cards[j.get('ID')] = a
        for k in a:
            asp[k] += 1
boost = {k[len('boost．'):] for k in asp if k.startswith('boost．')}
print('性相集合 (%d): %s' % (len(boost), sorted(boost)))

# 收集 (卡牌id, {英文key:值}) 和 (卡牌id, {中文性相:值})
zh_by_card = {}
for name, v in src.get('raw_aspects', {}).items():
    cid = v.get('卡牌id')
    if cid and '中文性相' in v:
        zh_by_card[cid] = v['中文性相']

# 对每个英文性相 key，统计它最常对应的中文标签
pairs = collections.defaultdict(collections.Counter)
detail = []
for cid, en in cards.items():
    zh = zh_by_card.get(cid)
    if not zh:
        continue
    for k, val in en.items():
        if k not in boost:
            continue
        for zk, zval in zh.items():
            if zval == val:
                pairs[k][zk] += 1
                detail.append((k, zk, cid))

print('\n英文key      中文候选（按支持数）')
print('-' * 60)
resolved = {}
for k in sorted(boost):
    c = pairs[k]
    top = c.most_common(2)
    conf = '✓ 唯一' if (len(top) == 1 or (len(top) == 2 and top[0][1] > top[1][1])) else '? 冲突'
    if conf.startswith('✓'):
        resolved[k] = top[0][0]
    print('  %-10s %-28s %s' % (k, top if top else '(无样本)', conf))

print('\n唯一确定 %d / %d' % (len(resolved), len(boost)))
print('映射:', json.dumps(resolved, ensure_ascii=False))
missing = sorted(boost - set(resolved))
if missing:
    print('缺样本的:', missing, '（需抓更多卡牌才能确定）')

json.dump(resolved, open('_源数据/_性相映射.json', 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
print('\n写入 _源数据/_性相映射.json')
