# -*- coding: utf-8 -*-
"""把维基饮品模型写回 data.json 的 wiki_tags.饮品。

用法:
  python tools/apply_drinks.py            # 只写 .tmp
  python tools/apply_drinks.py --apply    # 写 .tmp 并替换正式文件
"""
import json, os, sys, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src', 'data.json')
MODEL = os.path.join(ROOT, '_源数据', '_饮品模型.json')

# 旧名 -> 维基新名（项目菜名沿用，维基条目页/数据页已改名）
NAME_FIX = {
    '圣觪石圣餐': '圣觪石圣餐',      # 项目用字，维基用「觚」，项目保持自己的写法
    '淘气蒸馏釜': '狡黠蒸馏釜',       # 维基已改名
    '黑刺李琴酒（一瓶）': '黑刺李杜松子酒（一瓶）',  # 维基已改名
}

# 图片键别名（维基名 → images 字典里已有的旧名）
# 原因：wiki 驱动的类别表用维基中文名"（一壶）"，
# 但项目早期生成的图片键是"（壶装）"。加别名让 thumb() 能匹配。
# 2026-09-25 用户反馈：三个"（一壶）"饮品在③订货面板没有图片。
IMAGE_ALIASES = [
    ('T.R.N.有限公司可可饮料（壶装）', 'T.R.N.有限公司可可饮料（一壶）'),
    ('薄暮群屿咖啡（壶装）', '薄暮群屿咖啡（一壶）'),
    ('晨狮牌咖啡（壶装）', '晨狮牌咖啡（一壶）'),
]


def main():
    m = json.load(open(MODEL, encoding='utf-8'))
    d = json.load(open(SRC, encoding='utf-8'))

    wt = d.setdefault('wiki_tags', {})
    wt['饮品'] = {
        '容器': m['容器'],
        '杯子': m['杯子'],
        '可冲泡': m.get('可冲泡', {}),
        '类别': m['类别'],
        '已跳过': m['已跳过'],
        '规则': m['规则'],
    }

    # 图片别名持久化（幂等：目标键已存在则跳过）
    imgs = d.setdefault('images', {})
    added = 0
    for src, dst in IMAGE_ALIASES:
        if src in imgs and dst not in imgs:
            imgs[dst] = imgs[src]
            added += 1
    if added:
        print('图片别名 +{} 条'.format(added))

    out = SRC + '.tmp'
    json.dump(d, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('已写 %s' % out)
    print('容器 %d / 杯子 %d / 可冲泡 %d / 类别 %d 组'
          % (len(m['容器']), len(m['杯子']),
             len(m.get('可冲泡', {})), len(m['类别'])))

    if '--apply' in sys.argv:
        bak = SRC + '.bak.20260925-drink'
        if not os.path.exists(bak):
            shutil.copy2(SRC, bak)
            print('备份 -> %s' % os.path.basename(bak))
        shutil.copy2(out, SRC)
        os.remove(out)
        print('已替换正式 data.json')


if __name__ == '__main__':
    main()
