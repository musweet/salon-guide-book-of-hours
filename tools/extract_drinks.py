# -*- coding: utf-8 -*-
"""从维基 Data namespace 提取饮品完整模型，写回 data.json 的 wiki_tags.饮品。

替代 hand-coded 的 catalog.饮品大杯/半壶/近满/近空/小杯/可冲泡/冲泡映射。

维基字段映射（已验证 87 张 _beverage 卡牌）：
  容器      = aspects.distributable === 1
  杯子      = inherits 为 _beverage 且无 distributable
  分装到杯  = xtriggers.dist 中 morpheffect==='spawn' 的条目（1 个）
  后继容器  = xtriggers.dist 中 morpheffect==='transform' 的条目（0~1 个）
  含酒精    = aspects.intoxicating === 1
  性相(准则) = aspects 中的中文映射性相 key
  比例      = 维基无此数据，按项目约定从 ID 后缀推导：
               bottle.* = 3；*.h = 1；*.mf = 2；*.me = 1；其余整壶 = 2
  名称      = Data:* zh.json 的 Label

饮品种类分组（维基无此字段，保留手填，但名字用维基中文名）：
  catalog.饮品类别 = [{title, names:[wiki中文名...]}]
"""
import json, glob, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
C = os.path.join(ROOT, '_源数据', '_content')
Z = os.path.join(ROOT, '_源数据', '_zh')

ASP_MAP = {
    'heart':'心','nectar':'蜜','moon':'月','lantern':'灯','scale':'鳞','forge':'铸',
    'moth':'蛾','winter':'冬','rose':'引','edge':'刃','grail':'杯','knock':'启','sky':'穹',
}

# 饮品种类分组（维基无此字段，手填；名字用维基中文名）
CATEGORIES = [
    ('饮品 · 特殊', [
        '剥皮蜜酒','本征灰酒','沉沦赤慧','蒂尔扎利口酒','黑鸽酒','接骨木利口酒',
        '圣觚石圣餐','奶','蛇乳','所罗门制剂','狡黠蒸馏釜',
    ]),
    ('饮品 · 茶', [
        'C＆H公司夏摘阿萨姆茶（一壶）','T.R.N.有限公司可可饮料（一壶）',
        '蓝冠花茶（一壶）','蜜痂茉莉茶（一壶）','面纱女神正山小种（一壶）',
        '浓甜阿萨姆茶（一壶）','浓甜正山小种（一壶）','香盏花茶（一壶）',
    ]),
    ('饮品 · 咖啡', [
        '薄暮群屿咖啡（一壶）','晨狮牌咖啡（一壶）',
    ]),
    ('饮品 · 井水', ['岛上井水（罐装）','雾吻之水（罐装）']),
    ('饮品 · 酒', [
        '布劳赛良德苹果酒（一瓶）','黑刺李杜松子酒（一瓶）','拉维林酒庄产酒（一瓶）',
        '罗斯克拉根威士忌（一瓶）','蒲公英酒（一瓶）','斯特拉思科因威士忌（一瓶）',
        '雅宁斯古堡产酒（一瓶）','伊苏产雅文邑（一瓶）',
    ]),
    ('饮品 · 涩果酒', ['涩果酒（整瓶）']),
]

# 例外：项目里没有的游戏外卡牌（不写入，保持和旧行为一致）
SKIP = {
    'pottery.scrumpy.h',   # 涩果酒（半瓶）—— 游戏未实装
    'cup.scrumpy',         # 涩果酒（一杯）—— 游戏未实装
}


def ratio_of(wid):
    if wid.endswith('.h'):   return 1   # 半壶/半罐
    if wid.endswith('.me'):  return 1   # 近空
    if wid.endswith('.mf'):  return 2   # 近满
    if wid.startswith('bottle.'): return 3
    return 2                            # packet/tea/pot/pitcher/甜饮整壶


def aspect_cn(asp):
    out = {}
    for k, v in (asp or {}).items():
        if k.startswith('boost') or k not in ASP_MAP or not v:
            continue
        if ASP_MAP[k] == '穹':        # 穹用排除法，不在此处理
            continue
        out[ASP_MAP[k]] = v
    return out


def collect():
    """收集维基饮品相关卡牌。

    两类数据源：
      1. 饮品本体：inherits 以 _beverage 开头（87 张，容器/杯子）
      2. 可冲泡原料：aspects.brewable === 1（8 张，其中 5 张是包装茶/咖啡/可可）
         它们的 inherits 是 _leaf/_material/_egg 等，不是 _beverage，
         但 xtriggers.dist[0] 指向冲泡产物（一壶），所以是「包装→整壶」的链路。
    """
    bevs = {}      # 饮品本体
    brews = {}     # 可冲泡原料
    for f in glob.glob(os.path.join(C, 'p*.json')):
        d = json.load(open(f, encoding='utf-8'))
        for t, j in d.items():
            if not j or not j.get('ID'):
                continue
            wid = j['ID']
            inherits = j.get('inherits') or ''
            asp = j.get('aspects') or {}
            if inherits.startswith('_beverage'):
                bevs[wid] = j
            if asp.get('brewable') == 1:
                brews[wid] = j
    zh = {}
    for f in glob.glob(os.path.join(Z, 'p*.json')):
        d = json.load(open(f, encoding='utf-8'))
        for t, j in d.items():
            if j and j.get('Label') and j.get('id'):
                zh[j['id']] = j['Label']
    return bevs, brews, zh


def main():
    bevs, brews, zh = collect()

    cont, cup, skipped = {}, {}, {}
    for wid, j in bevs.items():
        if wid in SKIP:
            skipped[wid] = zh.get(wid, wid); continue
        asp = j.get('aspects') or {}
        dist = (j.get('xtriggers') or {}).get('dist', []) or []
        spawn = [x['id'] for x in dist if x.get('morpheffect') == 'spawn']
        trans = [x['id'] for x in dist if x.get('morpheffect') == 'transform']
        rec = {
            'id': wid,
            'name': zh.get(wid, wid),
            '准则': aspect_cn(asp),
            '含酒精': bool(asp.get('intoxicating')),
        }
        if asp.get('distributable'):
            rec['杯'] = zh.get(spawn[0], spawn[0]) if spawn else None
            rec['后继'] = zh.get(trans[0], trans[0]) if trans else None
            rec['后继id'] = trans[0] if trans else None
            rec['比例'] = ratio_of(wid)
            cont[wid] = rec
        else:
            cup[wid] = rec

    # 校验：容器.杯 必须能对应到一个杯子
    cup_names = {r['name'] for r in cup.values()}
    bad = [w for w, r in cont.items() if r['杯'] and r['杯'] not in cup_names]
    if bad:
        print('!! 容器的「杯」指向不存在的杯子:')
        for w in bad:
            print('   %s -> %s' % (w, cont[w]['杯']))

    # 可冲泡原料 → 冲泡产物（整壶）链路
    # 维基字段：aspects.brewable===1 表示该卡牌可冲泡，
    # xtriggers.dist 中 morpheffect==='spawn' 的条目是冲泡产物。
    # 例：packet.tea.assam（包装）→ pot.tea.assam（一壶）
    # 注意：8 张 brewable 卡牌里 5 张是饮品（茶/咖啡/可可），
    # 3 张是蛋（鸡蛋类，和饮品无关）——只收录饮品相关的。
    brew = {}
    non_drink_brew = []
    for wid, j in brews.items():
        dist = (j.get('xtriggers') or {}).get('dist', []) or []
        spawn = [x['id'] for x in dist if x.get('morpheffect') == 'spawn']
        if not spawn:
            non_drink_brew.append(wid)
            continue
        product_id = spawn[0]
        # 只收录冲泡产物是饮品的情况（冲泡产物必须是 _beverage）
        pj = bevs.get(product_id)
        if not pj:
            non_drink_brew.append(wid)
            continue
        asp = j.get('aspects') or {}
        brew[wid] = {
            'id': wid,
            'name': zh.get(wid, wid),
            '准则': aspect_cn(asp),
            '冲泡产物id': product_id,
            '冲泡产物': zh.get(product_id, product_id),
            '含酒精': bool(asp.get('intoxicating')),
        }
    if non_drink_brew:
        print('!! brewable 但冲泡产物不是饮品（已排除）:')
        for w in non_drink_brew:
            print('   %s -> %s' % (w, zh.get(w, '?')))

    # 校验：冲泡产物必须是容器（带 distributable）
    bad_brew = [w for w, r in brew.items() if r['冲泡产物id'] not in cont]
    if bad_brew:
        print('!! 冲泡产物不是容器:')
        for w in bad_brew:
            print('   %s -> %s' % (w, brew[w]['冲泡产物id']))

    # 类别分组：过滤掉无 ID 的名字
    cats = []
    missing = []
    for title, names in CATEGORIES:
        good = []
        for n in names:
            hit = [w for w in cont if cont[w]['name'] == n] or [w for w in cup if cup[w]['name'] == n]
            if hit: good.append(hit[0])
            else: missing.append(n)
        if good: cats.append({'title': title, 'names': [cont.get(w) or cup.get(w) for w in good]})
    if missing:
        print('!! 类别分组里维基找不到:')
        for n in missing: print('   ', n)

    out = {
        '容器': cont,
        '杯子': cup,
        '可冲泡': brew,
        '类别': cats,
        '已跳过': skipped,
        '规则': {
            '来源': '维基 Data namespace（87 张 _beverage 卡牌 + 8 张 brewable 卡牌）',
            '容器判定': 'aspects.distributable === 1',
            '杯子判定': 'inherits 为 _beverage 且无 distributable',
            '分装到杯': "xtriggers.dist 中 morpheffect==='spawn' 的条目（维基官方分装目标）",
            '后继容器': "xtriggers.dist 中 morpheffect==='transform' 的条目（分装后容器变成什么）",
            '含酒精': 'aspects.intoxicating === 1（维基字段，替代手填「含酒精」）',
            '性相': 'aspects 中的性相 key，按 extract_food.py 的中文映射转换',
            '比例': '维基无此数据，按项目约定从 ID 后缀推导：bottle.*=3；*.h=1；*.mf=2；*.me=1；其余整壶=2',
            '可冲泡原料': 'aspects.brewable === 1 且 xtriggers.dist[0].id 指向 _beverage 容器',
            '冲泡产物': 'xtriggers.dist 中 morpheffect==\'spawn\' 的条目（包装→整壶）',
            '已排除的 brewable': '冲泡产物不是饮品的（鸡蛋类，eggs → 蛋液）不收录',
            '类别分组': '维基无此字段，保留手填 CATEGORIES；name 用维基中文名',
            '已跳过': 'SKIP 列表里的卡牌游戏未实装，不写入',
            '全角点号': '维基字段用全角 U+FF0E（．），匹配时用全角',
        },
    }

    p = os.path.join(ROOT, '_源数据', '_饮品模型.json')
    json.dump(out, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('已写 %s' % p)
    print('容器 %d / 杯子 %d / 可冲泡 %d / 已跳过 %d / 类别 %d 组' % (len(cont), len(cup), len(brew), len(skipped), len(cats)))
    return out


if __name__ == '__main__':
    main()
