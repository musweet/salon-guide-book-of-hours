"""按用户规则提取卡牌标签，分清 ingredient / sustenance / raw。

规则（用户给定）：
  1. 标签合并：aspects + inherits 派生标签
     - inherits=_sustenance 或 _beverage → 有食物标签
     - inherits=_ingredient            → 有食材标签
     - aspects 里直接出现的 sustenance / ingredient 也算
  2. 只有食材、没有食物 → 不算菜（面粉/糖/黄油这类纯材料）
  3. 有 raw → 不能上桌（生的肉菜）
  4. 有 course.* → 正式菜（有前菜/主菜/配菜/甜点分类）
  5. 食物但无 course.* → 可上桌，但仅以"可食用原材料"形式上桌（葡萄/牛奶）

数据：7843 个英文数据页 + 1331 个中文数据页（中文名）
"""
import json, glob, os

SRC = '_源数据'
DOT = '\uff0e'  # ．全角点号
COURSE = {
    'course' + DOT + 'first': '前菜',
    'course' + DOT + 'main': '主菜',
    'course' + DOT + 'side': '配菜',
    'course' + DOT + 'pudding': '甜点',
}
# 项目菜名 → 维基卡牌 ID 的人工纠正映射（用户给定）
MANUAL = {
    '浮岛蛋糕': 'floating.island',
    '苹果奶油布丁': 'apple.charlotte',
    '香梨海伦': 'pear.belle.helene',
    '西梅糕': 'whip.prune',
}


def load_pages():
    pages = {}
    for f in glob.glob(os.path.join(SRC, '_content', 'p*.json')):
        for t, j in json.load(open(f, encoding='utf-8')).items():
            if j:
                pages[t] = j
    return pages


def load_zh():
    m = {}
    for f in glob.glob(os.path.join(SRC, '_zh', 'p*.json')):
        for t, j in json.load(open(f, encoding='utf-8')).items():
            if j and j.get('id') and j.get('Label'):
                m[j['id']] = j['Label']
    return m


def classify(j):
    # 模板/下划线页（Data:Underline egg.json 等）：用小写 id，
    # 无大写 ID，是数据模板而非真实卡牌，必须排除。
    if not j.get('ID'):
        return None
    inh = j.get('inherits')
    asp = j.get('aspects') or {}
    if not isinstance(asp, dict):
        return None

    # 合并标签：inherits 派生 + aspects 直接
    has_food = ('sustenance' in asp) or inh in ('_sustenance', '_beverage')
    has_ingr = ('ingredient' in asp) or inh == '_ingredient'
    has_raw = 'raw' in asp

    if not has_food and not has_ingr:
        return None  # 既非食物也非食材，跳过

    courses = sorted(k for k in asp if k.startswith('course' + DOT))

    # 身份判定
    if has_ingr and not has_food:
        identity = '食材(不算菜)'
    elif has_food:
        if has_raw:
            identity = '生的食物(不能上桌)'
        elif courses:
            identity = '正式菜'
        else:
            identity = '可食用原材料(无分类)'
    else:
        return None

    return {
        'ID': j.get('ID'),
        'Label': j.get('Label'),
        '中文名': None,  # 稍后填
        'title': j.get('title') or '',
        'inherits': inh,
        '身份': identity,
        '食物': has_food,
        '食材': has_ingr,
        '生的': has_raw,
        '分类': [COURSE.get(c, c) for c in courses] or None,
        '分类原始': courses,
        '能上桌': has_food and not has_raw,
        '正式菜': bool(courses),
    }


def main():
    pages = load_pages()
    zhm = load_zh()
    food = {}
    for t, j in sorted(pages.items()):
        r = classify(j)
        if not r:
            continue
        r['title'] = t
        r['中文名'] = zhm.get(r['ID'])
        food[r['ID']] = r

    fp = os.path.join(SRC, '_菜品标签.json')
    json.dump(food, open(fp, 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)

    # 统计
    kinds = {}
    for v in food.values():
        kinds[v['身份']] = kinds.get(v['身份'], 0) + 1
    print('提取 %d 个食物/食材卡片 → %s' % (len(food), fp))
    print()
    print('=== 身份分布 ===')
    for k in ['正式菜', '可食用原材料(无分类)', '生的食物(不能上桌)',
              '食材(不算菜)']:
        print('  %-22s %d' % (k, kinds.get(k, 0)))
    print()
    print('分类分布:')
    cc = {}
    for v in food.values():
        for c in (v['分类'] or []):
            cc[c] = cc.get(c, 0) + 1
    for k, v in sorted(cc.items()):
        print('  %-8s %d' % (k, v))
    print()
    # 用户给的 4 个映射验证
    print('=== 人工纠正映射验证 ===')
    for cn, cid in MANUAL.items():
        v = food.get(cid)
        if v:
            print('  %-8s → %-20s %s  %s  分类=%s'
                  % (cn, cid, v['Label'], v['身份'], v['分类']))
        else:
            print('  %-8s → %-20s 【未提取】' % (cn, cid))


if __name__ == '__main__':
    main()
