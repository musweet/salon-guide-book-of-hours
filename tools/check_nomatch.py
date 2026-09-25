"""核查食材清单里 26 个「维基无对应」，看是否为命名差异可修复"""
import json, re
from difflib import SequenceMatcher

w = json.load(open('_源数据/_菜品标签.json', encoding='utf-8'))
s = json.load(open('src/data.json', encoding='utf-8'))

zhid = {r['中文名']: r for r in w.values() if r['中文名']}
zh_keys = list(zhid.keys())

# 标准化：去括号/全角符号/空格，便于模糊匹配
def norm(t):
    t = t.replace('＆', '&').replace('（', '(').replace('）', ')')
    t = t.replace('·', '').replace('　', '')
    return re.sub(r'\s+', '', t)

norm_map = {norm(k): k for k in zh_keys}

miss = [x['名称'] for x in s['catalog']['食材清单'] if x['名称'] not in zhid]
print('无对应 %d 个，尝试标准化匹配：' % len(miss))
print()
fixed = 0
still = []
for nm in miss:
    n = norm(nm)
    if n in norm_map:
        tgt = norm_map[n]
        print('  [标准化修复] %-24s → %-24s %s'
              % (nm, tgt, zhid[tgt]['ID']))
        fixed += 1
        continue
    # 模糊匹配兜底
    best, bs = None, 0.0
    for k in zh_keys:
        sc = SequenceMatcher(None, norm(nm), norm(k)).ratio()
        if sc > bs:
            best, bs = k, sc
    if bs >= 0.75:
        print('  [模糊匹配 %.2f] %-20s ≈ %-20s %s'
              % (bs, nm, best, zhid[best]['ID']))
        fixed += 1
    else:
        print('  [仍无匹配 %0.2f] %-24s (最近=%s)' % (bs, nm, best))
        still.append(nm)

print()
print('可修复 %d，仍无 %d' % (fixed, len(still)))
print()
print('=== 26 个里真正找不到的（项目自造/命名完全不同）===')
for m in still:
    print('  %s' % m)
