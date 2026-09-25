"""核查分类冲突：项目分类 vs 维基 course.* 分类"""
import json

w = json.load(open('_源数据/_菜品标签.json', encoding='utf-8'))
s = json.load(open('src/data.json', encoding='utf-8'))

zhid = {}
for r in w.values():
    if r['中文名']:
        zhid[r['中文名']] = r

man = {'浮岛蛋糕': 'floating.island',
       '苹果奶油布丁': 'apple.charlotte',
       '香梨海伦': 'pear.belle.helene',
       '西梅糕': 'whip.prune'}

print('=== A. 项目 FOODS 标「食材/饮品」但维基有 course 分类 ===')
n = 0
for f in s['FOODS']:
    old = f['分类']
    if old not in ('食材', '饮品'):
        continue
    cid = man.get(f['名称']) or zhid.get(f['名称'])
    if not isinstance(cid, str) or not cid:
        continue
    wj = w.get(cid)
    if wj and wj['分类']:
        print('  %-16s 项目=%-4s 维基=%-12s %s'
              % (f['名称'], old, wj['分类'], cid))
        n += 1
print('  共 %d 处' % n)

print()
print('=== B. 项目食材清单里，维基判定为「正式菜」的 ===')
n2 = 0
for x in s['catalog']['食材清单']:
    nm = x['名称']
    wj = zhid.get(nm)
    if wj and wj['分类']:
        print('  %-12s 项目=%-6s 维基=%-10s %s'
              % (nm, x.get('分类', '?'), wj['分类'], wj['ID']))
        n2 += 1
print('  共 %d 处' % n2)

print()
print('=== C. 项目把菜当成「食材/饮品」，其实是能上桌的正式菜 ===')
for f in s['FOODS']:
    if f['分类'] in ('食材', '饮品'):
        cid = man.get(f['名称']) or zhid.get(f['名称'])
        if isinstance(cid, str):
            wj = w.get(cid)
            if wj:
                print('  %-16s FOODS分类=%-4s | 维基身份=%-14s 食物=%-5s '
                      '食材=%-5s 生的=%-5s 分类=%s'
                      % (f['名称'], f['分类'], wj['身份'],
                         wj['食物'], wj['食材'], wj['生的'], wj['分类']))
