"""按维基原始数据反查 24 项未匹配的饮品变体。

用 _内容/ 里的英文 aspects 性相签名做精确匹配，
避免中文名表述差异（壶装 vs 半壶）。
"""
import json, glob

CONTENT = '_源数据/_content'
DOT = '\uff0e'
CN2EN = {'心': 'heart', '灯': 'lantern', '穹': 'sky', '蛾': 'moth',
         '月': 'moon', '铸': 'forge', '鳞': 'scale', '蜜': 'nectar',
         '冬': 'winter', '刃': 'edge', '引': 'rose', '启': 'knock',
         '杯': 'grail'}


def load_zh_all():
    """维基全部中文页（不限于 211 个食物）"""
    m = {}
    for f in glob.glob('_源数据/_zh/p*.json'):
        for t, j in json.load(open(f, encoding='utf-8')).items():
            if j and j.get('id') and j.get('Label'):
                m[j['id']] = j['Label']
    return m


def load_en_all():
    """维基全部英文页"""
    m = {}
    for f in glob.glob(CONTENT + '/p*.json'):
        for t, j in json.load(open(f, encoding='utf-8')).items():
            if j and j.get('ID'):
                m[j['ID']] = j
    return m


def en_sig(j):
    """英文页的 13 性相签名（排除 boost/course）"""
    asp = j.get('aspects') or {}
    if not isinstance(asp, dict):
        return ()
    out = []
    for k, v in asp.items():
        if 'boost' in k or k.startswith('course'):
            continue
        if k in ('raw', 'sustenance', 'ingredient', 'remains', 'fruit'):
            continue
        out.append((k, v))
    return tuple(sorted(out))


def cn_sig(cn_asp):
    """中文字性相 → 英文键签名"""
    return tuple(sorted((CN2EN.get(k, k), v)
                        for k, v in (cn_asp or {}).items()))


zh = load_zh_all()
en = load_en_all()
new = json.load(open('src/data.json.tmp', encoding='utf-8'))
miss = [x for x in new['catalog']['食材清单'] if not x.get('wiki_id')]

print('维基中文页 %d | 英文页 %d' % (len(zh), len(en)))
print()
print('=== 24 项按「性相签名」精确反查维基 ===')
for x in miss:
    s = cn_sig(x.get('性相'))
    if not s:
        print('%-26s 性相为空 → 非性相物品（工具/概念）' % x['名称'])
        continue
    hits = [(fid, zh.get(fid, '?')) for fid, j in en.items()
            if en_sig(j) == s]
    # 尺寸线索
    hint = ''
    for key in ('瓶装', '壶装', '包装', '近满'):
        if key in x['名称']:
            hint = '「%s」' % key
    if hits:
        print('%-26s %s 性相=%s' % (x['名称'], hint, list(s)))
        for fid, cn in sorted(hits)[:6]:
            j = en[fid]
            inh = j.get('inherits')
            asp = j.get('aspects') or {}
            course = [k.replace('course' + DOT, '') for k in asp
                      if k.startswith('course')]
            print('      → %-26s %-28s inh=%-12s %s'
                  % (fid, cn, inh, course))
    else:
        print('%-26s 性相=%s → 维基无匹配' % (x['名称'], list(s)))
