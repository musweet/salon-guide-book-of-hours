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
