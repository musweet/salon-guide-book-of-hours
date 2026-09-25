"""抓取每道菜的中文条目页，提取 {{infobox/card|<id>}} 得到卡牌 ID。

数据源：data.json 的 recipe_trees 键（87 道菜中文名）
+ catalog.食材清单 名称（146 种食材中文名）
方法：抓中文条目页 wikitext，正则提取 infobox/card 参数。
     这是精确映射（wiki 条目页自己声明的卡牌 id），不靠模糊匹配。

UA 必须精确用 'Chrome/120.0 Safari/537.36'：
   'Chrome/120.0.0.0' 或 'Mozilla/5.0' 一律被 Cloudflare 拦成挑战页。
"""
import subprocess, urllib.parse, json, re, time, os, sys, glob

API = 'https://boh.huijiwiki.com/api.php'
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      'Chrome/120.0 Safari/537.36')
OUT = '_源数据'
BATCH = 40
SLEEP = 2.0

# 中文条目页里 infobox/card 的参数
RE_INF = re.compile(r'\{\{infobox/card\|\s*([A-Za-z0-9_.\[\]\-]+)')
RE_CARD = re.compile(r'\{\{卡牌\|id=([A-Za-z0-9_.\[\]\-]+)')


def fetch(titles):
    p = {'action': 'query', 'format': 'json', 'prop': 'revisions',
         'rvprop': 'content', 'rvslots': 'main',
         'titles': '|'.join(titles), 'redirects': '1'}
    args = ['curl', '-s', '-A', UA, '--max-time', '60', '-G', API]
    for k, v in p.items():
        args += ['--data-urlencode', '%s=%s' % (k, v)]
    raw = subprocess.run(args, capture_output=True,
                         timeout=90).stdout.decode('utf-8', 'replace')
    if not raw or raw.lstrip().startswith('<'):
        return None
    try:
        return json.loads(raw, strict=False)
    except Exception:
        return None


def fetch_with_retry(titles, tries=5):
    for i in range(tries):
        d = fetch(titles)
        if d is not None:
            return d
        wait = 15 + i * 15
        print('  ! 被拦，退避 %ds (%d/%d)' % (wait, i + 1, tries), flush=True)
        time.sleep(wait)
    return None


def get_names():
    """要映射的中文名清单：菜（recipe_trees 键）+ 食材（catalog.食材清单）"""
    d = json.load(open('src/data.json', encoding='utf-8'))
    dishes = list(d.get('recipe_trees', {}).keys())
    ingrs = [x['名称'] for x in d.get('catalog', {}).get('食材清单', [])]
    return {'菜': dishes, '食材': ingrs}


def run():
    os.makedirs(OUT, exist_ok=True)
    ck = os.path.join(OUT, '_条目页.json')
    cached = json.load(open(ck, encoding='utf-8')) if os.path.exists(ck) else {}
    groups = get_names()
    todo = []
    for kind, names in groups.items():
        for n in names:
            if n not in cached:
                todo.append((kind, n))
    print('待抓 %d / %d（已缓存 %d）' % (len(todo), sum(len(v) for v in groups.values()),
                                        len(cached)), flush=True)
    if not todo:
        return

    titles = [n for _, n in todo]
    idx = 0
    while idx < len(titles):
        batch = titles[idx:idx + BATCH]
        d = fetch_with_retry(batch)
        if d is None:
            print('ABORT')
            break
        got = 0
        for pid, pg in d.get('query', {}).get('pages', {}).items():
            nm = pg.get('title')
            r = pg.get('revisions')
            w = r[0]['slots']['main']['*'] if r else None
            inf = RE_INF.findall(w or '')
            cards = sorted(set(RE_CARD.findall(w or '')))
            if inf:
                cached[nm] = {'卡牌id': inf[0], '合成卡牌': cards, '找到': True}
                got += 1
            elif w is not None:
                cached[nm] = {'卡牌id': None, '合成卡牌': cards, '找到': False}
            else:
                cached[nm] = {'卡牌id': None, '合成卡牌': [], '找到': False}
        idx += BATCH
        json.dump(cached, open(ck, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        if idx % 120 == 0 or idx >= len(titles):
            print('  批 %d/%d，本批解析出卡牌id %d' % (idx, len(titles), got), flush=True)
        time.sleep(SLEEP)
    json.dump(cached, open(ck, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('完成，共缓存 %d 个条目页 → %s' % (len(cached), ck))


if __name__ == '__main__':
    run()
