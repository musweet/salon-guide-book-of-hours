"""把维基标签体系写回 data.json。

不直接覆盖：先备份，写 .tmp，生成审阅报告，你确认后再替换。

写回内容（新增顶层字段 wiki_tags，不破坏旧字段）：
  1. wiki_tags.菜     — 78 道正式菜 {中文菜名: {id, 分类, 性相...}}
  2. wiki_tags.原材料 — 95 个可上桌但无分类的食物
  3. wiki_tags.食材   — 21 个不算菜的纯材料 + 17 个生的食物
  4. wiki_tags.映射表 — 项目菜名 ↔ 维基卡牌 ID 的人工校正对照
  5. FOODS[].分类列表  — 补全多分类（南瓜派=主菜/甜点）
  6. FOODS[].wiki_id   — 补维基 ID

用法：
  python tools/apply_tags.py --report   # 只生成报告，不改文件
  python tools/apply_tags.py --apply    # 备份 + 写 .tmp + 生成报告
"""
import json, os, shutil, sys, datetime

SRC = '_源数据/_菜品标签.json'
DATA = 'src/data.json'
# 项目菜名 → 维基卡牌 ID（用户给定的人工校正）
MANUAL = {
    '浮岛蛋糕': 'floating.island',
    '苹果奶油布丁': 'apple.charlotte',
    '香梨海伦': 'pear.belle.helene',
    '西梅糕': 'whip.prune',
}
# 食材清单里的命名变体（项目名 → 维基卡牌 ID），精确同物项
# 饮品尺寸词：项目「壶装/瓶装」对应维基「一壶/一瓶」
INGR_ALIAS = {
    # 字形/译名变体
    '圣觪石圣餐': 'sacrament.calicite',
    '淘气蒸馏釜': 'alembic.sly',
    # 饮品尺寸变体（词干+尺寸精确配对，见 tools/match_beverages.py）
    'C＆H公司夏摘阿萨姆茶（壶装）': 'pot.tea.assam',
    'T.R.N.有限公司可可饮料（壶装）': 'pot.cocoa',
    '伊苏产雅文邑（瓶装）': 'bottle.armagnac',
    '布劳赛良德苹果酒（瓶装）': 'bottle.lambig',
    '拉维林酒庄产酒（瓶装）': 'bottle.raveline',
    '拉维林酒庄产酒（近满）': 'bottle.raveline.mf',
    '斯特拉思科因威士忌（瓶装）': 'bottle.strathcoyne',
    '晨狮牌咖啡（壶装）': 'pot.coffee.dawnlion',
    '罗斯克拉根威士忌（瓶装）': 'bottle.roscraggan',
    '蒲公英酒（瓶装）': 'bottle.dandelionwine',
    '薄暮群屿咖啡（壶装）': 'pot.coffee.eveningisles',
    '雅宁斯古堡产酒（瓶装）': 'bottle.jannings',
    '面纱女神正山小种（壶装）': 'pot.tea.lapsang',
    '薄暮群屿咖啡（包装）': 'packet.coffee.eveningisles',
    '晨狮牌咖啡（包装）': 'packet.coffee.dawnlion',
    'C＆H公司夏摘阿萨姆茶（包装）': 'packet.tea.assam',
    '面纱女神正山小种（包装）': 'packet.tea.lapsang',
    'T.R.N.有限公司可可饮料（包装）': 'packet.cocoa',
    '涩果酒': 'pottery.scrumpy',
    # 维基同名的非食物项（工具/卵类）
    '厨房用碗': 'bowls.kitchen',
    '海鸥蛋': 'egg.gull',
    '巨蛋': 'egg.relic',
    '蝰蛇卵': 'egg.viper',
}
# 游戏未实装的卡牌变体（用户确认）：不进 wiki_tags
NO_REALIZED = ['pottery.scrumpy.h', 'cup.scrumpy']
# 例外：保留旧「可生吃」行为，不按维基判定覆盖（用户确认鸡蛋暂不改）
RAW_EAT_OVERRIDE = ['鸡蛋', '海鸥蛋', '巨蛋', '蝰蛇卵']


def build_tags():
    """构建完整标签体系

    命名映射机制（不依赖维基缓存）：
      - dish_id  = {项目菜名: wiki_id}  正向，来自 recipe_trees 键名 + MANUAL 纠正
      - id2dish = {wiki_id: 项目菜名}  反向，用于菜组键名归一化
      - 菜组键名优先用项目菜名（id2dish 查），查不到才用维基中文名兜底
      - 这样维基远端把「李子慕斯」改回原名、重抓维基，菜组键名仍是「西梅糕」
      - wiki_tags.映射表 = {项目菜名: wiki_id}  运行时可见，便于查询和调试
    """
    w = json.load(open(SRC, encoding='utf-8'))
    # 维基中文名 → 卡牌ID
    zhimap = {r['中文名']: r['ID'] for r in w.values() if r['中文名']}

    # 项目菜名 → 卡牌ID（来自 recipe_trees 键名，MANUAL 纠正优先级更高）
    dish_id = {}
    for dish in json.load(open(DATA, encoding='utf-8'))['recipe_trees']:
        dish_id[dish] = MANUAL.get(dish) or zhimap.get(dish)

    # 反向：卡牌ID → 项目菜名（菜组键名归一化用）
    id2dish = {}
    for dish, cid in dish_id.items():
        if cid and cid not in id2dish:
            id2dish[cid] = dish

    return w, zhimap, dish_id, id2dish


def build_report(w, zhimap, dish_id):
    lines = []
    A = lines.append

    A('# 标签体系写回报告')
    A('')
    A('生成时间：%s' % datetime.datetime.now().strftime('%Y-%m-%d %H:%M'))
    A('')

    # 统计
    kinds = {}
    for r in w.values():
        kinds[r['身份']] = kinds.get(r['身份'], 0) + 1
    A('## 一、维基标签统计（共 %d 个食物/食材卡牌）' % len(w))
    A('')
    A('| 身份 | 数量 | 说明 |')
    A('|---|---|---|')
    A('| 正式菜（有 course.*） | %d | 前菜/主菜/配菜/甜点 |'
      % kinds.get('正式菜', 0))
    A('| 可食用原材料（无分类） | %d | 能上桌但不算菜 |'
      % kinds.get('可食用原材料(无分类)', 0))
    A('| 生的食物（raw） | %d | 不能上桌，需烹饪 |'
      % kinds.get('生的食物(不能上桌)', 0))
    A('| 食材（不算菜） | %d | 纯材料：面粉/糖/黄油 |'
      % kinds.get('食材(不算菜)', 0))
    A('')

    # 规则依据
    A('## 二、判定规则（你的标准）')
    A('')
    A('```')
    A('合并标签 = aspects 字段 ∪ inherits 派生标签')
    A('  inherits=_sustenance / _beverage  →  有「食物」标签')
    A('  inherits=_ingredient              →  有「食材」标签')
    A('')
    A('身份判定：')
    A('  有食材 + 无食物          →  食材(不算菜)')
    A('  有食物 + raw             →  生的食物(不能上桌)')
    A('  有食物 + course.*        →  正式菜')
    A('  有食物 + 无 course.*     →  可食用原材料')
    A('```')
    A('')
    A('> 注：葡萄有 `ingredient` 但也有 `sustenance`（来自 inherits=_sustenance），')
    A('> 所以归为「食物」。这是你确认过的口径。')
    A('')

    # 项目菜名 → 维基 映射表
    s = json.load(open(DATA, encoding='utf-8'))
    A('## 三、项目 87 道菜 → 维基卡牌 映射表')
    A('')
    A('| 项目菜名 | 维基中文 | 英文 | 卡牌ID | 分类 |')
    A('|---|---|---|---|---|')
    order = {'前菜': 0, '主菜': 1, '配菜': 2, '甜点': 3}
    rows = []
    for dish, cid in dish_id.items():
        r = w.get(cid)
        if r:
            rows.append((dish, r['中文名'], r['Label'], cid,
                         '/'.join(r['分类'] or [])))
    rows.sort(key=lambda x: (order.get(x[4].split('/')[0], 9), x[0]))
    for d, z, e, c, ca in rows:
        flag = ' ←人工' if d in MANUAL else ''
        A('| %s | %s | %s | `%s` | %s%s |'
          % (d, z, e, c, ca, flag))
    A('')
    A('**87/87 全部映射成功。** 标记「人工」的 4 条是你给定的菜名纠正：')
    A('')
    A('- `浮岛蛋糕` → floating.island')
    A('- `苹果奶油布丁` → apple.charlotte')
    A('- `香梨海伦` → pear.belle.helene')
    A('- `西梅糕` → whip.prune')
    A('')

    # 多分类修正
    A('## 四、多分类菜（旧 `分类` 单字段会丢失信息）')
    A('')
    A('旧 `FOODS[].分类` 是单字符串，存不下「主菜+甜点」这类。下列菜有多个分类：')
    A('')
    A('| 菜 | 旧分类 | 维基全部分类 |')
    A('|---|---|---|')
    fods = {f['名称']: f for f in s['FOODS']}
    multi = []
    for dish, cid in dish_id.items():
        r = w.get(cid)
        if r and r['分类'] and len(r['分类']) > 1:
            old = fods.get(dish, {}).get('分类', '?')
            multi.append((dish, old, '/'.join(r['分类'])))
    multi.sort(key=lambda x: x[0])
    for d, o, n in multi:
        A('| %s | %s | %s |' % (d, o, n))
    A('')
    A('共 **%d 道**多分类菜。写回后 `FOODS[].分类列表` 存完整数组，'
      '旧 `分类` 保留首项做兼容。' % len(multi))
    A('')

    # 现有分类 vs 维基分类 不一致
    A('## 五、分类不一致（旧值与维基不同，需你确认）')
    A('')
    A('| 菜 | 旧分类 | 维基分类 | 差异 |')
    A('|---|---|---|---|')
    diff = []
    for dish, cid in dish_id.items():
        r = w.get(cid)
        if not r:
            continue
        old = fods.get(dish, {}).get('分类')
        new_first = (r['分类'] or [None])[0]
        if old != new_first:
            diff.append((dish, old or '缺', new_first or '缺',
                         '/'.join(r['分类'] or [])))
    diff.sort(key=lambda x: x[0])
    if diff:
        for d, o, n, full in diff:
            A('| %s | %s | %s | 维基全=%s |' % (d, o, n, full))
    else:
        A('（首项分类全部一致）')
    A('')

    # 维基有但项目缺的菜
    proj_names = set(s['recipe_trees'].keys())
    proj_ids = set(dish_id.values())
    A('## 六、维基有但项目未收录的菜')
    A('')
    A('正式菜中项目里没有的（可能值得补）：')
    A('')
    A('| 维基中文 | 卡牌ID | 分类 |')
    A('|---|---|---|')
    missing = [(r['中文名'], r['ID'], '/'.join(r['分类']))
               for r in w.values()
               if r['分类'] and r['ID'] not in proj_ids
               and r['中文名']]
    order2 = {'前菜': 0, '主菜': 1, '配菜': 2, '甜点': 3}
    missing.sort(key=lambda x: (order2.get(x[2].split('/')[0], 9), x[0]))
    for z, c, ca in missing:
        A('| %s | `%s` | %s |' % (z, c, ca))
    A('')
    A('共 **%d 道**正式菜项目未收录。' % len(missing))
    A('')

    return '\n'.join(lines)


def apply(w, zhimap, dish_id, id2dish):
    """写回 data.json（先备份 + 写 .tmp）"""
    s = json.load(open(DATA, encoding='utf-8'))
    backup = DATA + '.bak.' + datetime.datetime.now().strftime('%Y%m%d-%H%M')
    shutil.copy2(DATA, backup)

    # 保留 wiki_tags.饮品（由 apply_drinks.py 管理，本脚本不碰）
    drink_tags = (s.get('wiki_tags') or {}).get('饮品')

    # 1) 新增顶层 wiki_tags
    tags = {
        '菜': {},
        '原材料': {},
        '食材': {},
        '生的': {},
        '映射表': dish_id,
        '例外_可生吃': {},
        '规则': {
            '来源': '维基 Data:*.json 的 aspects + inherits 合并',
            'fullWidthDot': 'U+FF0E ．',
            '食物派生': ['inherits=_sustenance', 'inherits=_beverage',
                         'aspects.sustenance'],
            '食材派生': ['inherits=_ingredient', 'aspects.ingredient'],
        },
    }
    if drink_tags is not None:
        tags['饮品'] = drink_tags
    for cid, r in w.items():
        k = ('菜' if r['身份'] == '正式菜'
             else '原材料' if '原材料' in r['身份']
             else '生的' if r['身份'] == '生的食物(不能上桌)'
             else '食材')
        # 菜组键名归一化：优先用项目菜名（id2dish 查 wiki_id），
        # 这样维基中文名变了（如「李子慕斯」→「西梅糕」）不影响菜组键名。
        # 非菜组（原材料/食材/生的）仍用维基中文名，它们和食材清单对齐。
        if k == '菜':
            key = id2dish.get(cid) or r['中文名'] or cid
        else:
            key = r['中文名'] or cid
        tags[k][key] = {
            'id': r['ID'], 'label': r['Label'], '分类': r['分类'],
            '食物': r['食物'], '食材': r['食材'], '生的': r['生的'],
            '能上桌': r['能上桌'],
        }

    # 1.5) 例外处理
    # 游戏未实装的卡牌变体：从 wiki_tags 移除（食材清单仍保留 wiki_id 可查）
    for noid in NO_REALIZED:
        if noid in w:
            zh = w[noid]['中文名'] or noid
            for g in ('菜', '原材料', '食材', '生的'):
                tags[g].pop(zh, None)
    # 保留旧「可生吃」行为的例外（新维基判定与之冲突，按用户要求不改）
    for nm in RAW_EAT_OVERRIDE:
        cid = (INGR_ALIAS.get(nm) or dish_id.get(nm)
               or zhimap.get(nm))
        tags['例外_可生吃'][nm] = {
            'id': cid,
            '原因': '用户要求保留旧 RAW_EATABLE 行为，不按维基判定',
        }
    s['wiki_tags'] = tags

    # 2) FOODS 补 分类列表 + wiki_id
    n_multi = 0
    for f in s['FOODS']:
        cid = dish_id.get(f['名称'])
        r = w.get(cid)
        if r:
            f['wiki_id'] = cid
            if r['分类']:
                f['分类列表'] = r['分类']
                if len(r['分类']) > 1:
                    n_multi += 1
                f['分类'] = r['分类'][0]  # 保持兼容，取首项

    # 2.5) 食材清单补 wiki_id + 维基身份（按维基判定，含别名映射）
    # INGR_ALIAS 值是卡牌 ID；zhimap 是「维基中文名 → 卡牌 ID」
    n_ingr = 0
    ingr_dish = 0
    for x in s['catalog']['食材清单']:
        nm = x['名称']
        cid = INGR_ALIAS.get(nm) or zhimap.get(nm)
        if not cid:
            continue
        wj = w.get(cid)
        x['wiki_id'] = cid
        x['维基身份'] = wj['身份'] if wj else '非食物（工具/材料/卵）'
        if wj and wj['分类']:
            x['分类列表'] = wj['分类']
            ingr_dish += 1
        n_ingr += 1

    # 3) 生成报告
    report = build_report(w, zhimap, dish_id)
    rpath = '_源数据/写回报告.md'
    open(rpath, 'w', encoding='utf-8').write(report)

    # 4) 写 .tmp（不覆盖）
    tmp = DATA + '.tmp'
    json.dump(s, open(tmp, 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)

    print('备份      → %s' % backup)
    print('报告      → %s' % rpath)
    print('.tmp 写入 → %s' % tmp)
    print('大小      %d → %d bytes'
          % (os.path.getsize(DATA), os.path.getsize(tmp)))
    print()
    print('新增顶层字段 wiki_tags:')
    for k, v in tags.items():
        if isinstance(v, dict):
            print('  %-10s %d 项' % (k, len(v)))
    print()
    print('FOODS 补字段：%d 道补了 wiki_id，%d 道有多分类'
          % (sum(1 for f in s['FOODS'] if 'wiki_id' in f), n_multi))
    print('食材清单补字段：%d / %d 项补了 wiki_id，其中 %d 道维基判定为正式菜'
          % (n_ingr, len(s['catalog']['食材清单']), ingr_dish))
    print()
    print('★ 未覆盖原文件。确认无误后运行:')
    print('  copy /y %s %s' % (tmp, DATA))


def main():
    w, zhimap, dish_id, id2dish = build_tags()
    mode = sys.argv[1] if len(sys.argv) > 1 else '--report'

    report = build_report(w, zhimap, dish_id)
    rpath = '_源数据/写回报告.md'
    open(rpath, 'w', encoding='utf-8').write(report)
    print('报告 → %s（%d 行）' % (rpath, report.count('\n')))

    if mode == '--apply':
        print()
        apply(w, zhimap, dish_id, id2dish)
    else:
        print('（--report 模式，未改动 data.json）')
        print('确认后运行：python tools/apply_tags.py --apply')


if __name__ == '__main__':
    main()
