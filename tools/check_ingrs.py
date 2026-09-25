"""食材清单里的菜判定情况核查"""
import json

w = json.load(open('_源数据/_菜品标签.json', encoding='utf-8'))
s = json.load(open('src/data.json', encoding='utf-8'))

# 维基中文名 → 卡牌
zhid = {}
for r in w.values():
    if r['中文名']:
        zhid[r['中文名']] = r

ingrs = s['catalog']['食材清单']
print('食材清单共 %d 项' % len(ingrs))
print()

cats = {}
for x in ingrs:
    nm = x['名称']
    wj = zhid.get(nm)
    cid = wj['ID'] if wj else None
    # 分类
    if wj and wj['分类']:
        c = '正式菜:%s' % '/'.join(wj['分类'])
    elif wj and wj['生的']:
        c = '生的(不能上桌)'
    elif wj and wj['身份'] == '食材(不算菜)':
        c = '食材(不算菜)'
    elif wj:
        c = '可食用原材料'
    else:
        c = '维基无此物品'
    cats[c] = cats.get(c, 0) + 1

print('=== 按维基身份分布 ===')
for k, v in sorted(cats.items(), key=lambda x: -x[1]):
    print('  %-18s %d' % (k, v))

print()
print('=== 食材清单里维基判定为「正式菜」的 9 个 ===')
for x in ingrs:
    nm = x['名称']
    wj = zhid.get(nm)
    if wj and wj['分类']:
        print('  %-10s %-10s %s  项目分类=%s'
              % (nm, wj['ID'], wj['分类'], x.get('分类', '?')))

print()
print('=== 食材清单里没有维基对应的（前 15）===')
n = 0
for x in ingrs:
    if x['名称'] not in zhid:
        print('  %s' % x['名称'])
        n += 1
        if n >= 15:
            break
print('  （共 %d 个无对应）'
      % sum(1 for x in ingrs if x['名称'] not in zhid))
