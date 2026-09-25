"""列出食材清单里 24 项无维基对应的，含原因诊断"""
import json, re
from difflib import SequenceMatcher

w = json.load(open('_源数据/_菜品标签.json', encoding='utf-8'))
s = json.load(open('src/data.json.tmp', encoding='utf-8'))

zhid = {r['中文名']: r for r in w.values() if r['中文名']}
zh_keys = list(zhid.keys())

ALIAS = {'圣觪石圣餐': '圣觚石圣餐', '淘气蒸馏釜': '狡黠蒸馏釜'}
ingrs = s['catalog']['食材清单']

print('食材清单 %d 项，无维基对应 %d 项' % (
    len(ingrs), sum(1 for x in ingrs if x.get('wiki_id') is None
                    and x['名称'] not in zhid
                    and x['名称'] not in ALIAS)))
print()

miss = []
for x in ingrs:
    nm = x['名称']
    if nm in zhid or nm in ALIAS:
        continue
    miss.append(x)

def norm(t):
    t = t.replace('＆', '&').replace('（', '(').replace('）', ')')
    t = t.replace('·', '').replace('　', '')
    return re.sub(r'\s+', '', t)

print('| # | 项目名 | 最近维基 | 相似度 | 诊断 |')
print('|---|---|---|---|---|')
for i, x in enumerate(miss, 1):
    nm = x['名称']
    best, bs = None, 0.0
    for k in zh_keys:
        sc = SequenceMatcher(None, norm(nm), norm(k)).ratio()
        if sc > bs:
            best, bs = k, sc
    # 诊断
    if best is None:
        diag = '维基无近似'
    elif bs < 0.5:
        diag = '项目自造物品'
    elif '（' in nm or '）' in nm:
        diag = '尺寸变体（项目用"壶装/瓶装/包装"，维基用"半壶/一瓶/一杯"）'
    else:
        diag = '译名/字形差异'
    print('| %d | %s | %s | %.2f | %s |'
          % (i, nm, best, bs, diag))

print()
print('原始数据（含来源/分类等字段）：')
print()
for i, x in enumerate(miss, 1):
    print('--- %d. %s ---' % (i, x['名称']))
    for k, v in x.items():
        if k in ('wiki_id', '维基身份', '分类列表'):
            continue
        print('    %-8s = %s' % (k, v))
