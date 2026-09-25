"""按「中文词干 + 尺寸」精确配对 24 项未匹配的饮品变体。

关键发现：维基的中文尺寸词与项目名**完全一致**（都有「（一壶）（一杯）
（包装）（半壶）（近满）（近空）」），不需要任何映射转换。
只需按「词干 + 同尺寸」精确配对。

注意：尺寸词本身已带括号，拼接匹配串时不要重复加括号。
"""
import json, glob, re

new = json.load(open('src/data.json.tmp', encoding='utf-8'))
miss = [x for x in new['catalog']['食材清单'] if not x.get('wiki_id')]

# 维基全部中文标签 → id（同名取第一个）
zh = {}
for f in glob.glob('_源数据/_zh/p*.json'):
    for t, j in json.load(open(f, encoding='utf-8')).items():
        if j and j.get('id') and j.get('Label'):
            zh.setdefault(j['Label'], []).append(j['id'])

print('=== 词干+尺寸 配对结果 ===')
print()
out = {}
for x in miss:
    nm = x['名称']
    # 拆出尺寸后缀：主体（尺寸）
    m = re.match(r'^(.+?)[（(]([^）)]+)[)）]$', nm)
    if not m:
        if nm in zh:
            out[nm] = zh[nm][0]
            print('  ✓ %-26s → 维基同名          %s' % (nm, zh[nm][0]))
        else:
            print('  ✗ %-26s 无尺寸后缀且无维基同名' % nm)
        continue

    core = m.group(1)
    size = m.group(2)                      # 如 壶装 / 瓶装 / 包装
    # 尺寸词映射：项目名 → 维基名（包装同词，无需转换）
    SIZE = {'壶装': '一壶', '瓶装': '一瓶', '包装': '包装',
            '近满': '近满', '半壶': '半壶', '近空': '近空',
            '一杯': '一杯'}
    for sz, tgt in SIZE.items():
        if size == sz:
            cand = core + '（' + tgt + '）'
            break
    else:
        cand = None
    if cand and cand in zh:
        out[nm] = zh[cand][0]
        print('  ✓ %-24s → %-28s %s' % (nm, cand, zh[cand][0]))
        continue

    # 尺寸词不同，列出维基同词干的全部变体供人工判断
    same = sorted(z for z in zh if z.startswith(core))
    print('  ? %-24s 词干=%s' % (nm, core))
    for s in same:
        mark = ' ←同尺寸' if s.endswith(size + '）') else ''
        print('      · %-28s %s%s'
              % (s, zh[s][0], mark))

print()
print('精确配对 %d / %d' % (len(out), len(miss)))
json.dump(out, open('_源数据/_饮品变体映射.json', 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
print('→ _源数据/_饮品变体映射.json')
