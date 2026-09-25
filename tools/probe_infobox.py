"""试探：中文条目页 wikitext 里是否带 infobox/card|<id>，能否直接拿卡牌 ID"""
import subprocess, urllib.parse, json, time, sys

API = 'https://boh.huijiwiki.com/api.php'
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      'Chrome/120.0 Safari/537.36')   # 必须精确，多 .0.0 会被拦


def fetch(titles):
    p = {'action': 'query', 'format': 'json', 'prop': 'revisions',
         'rvprop': 'content', 'rvslots': 'main',
         'titles': '|'.join(titles), 'redirects': '1'}
    args = ['curl', '-s', '-A', UA, '--max-time', '40', '-G', API]
    for k, v in p.items():
        args += ['--data-urlencode', '%s=%s' % (k, v)]
    raw = subprocess.run(args, capture_output=True,
                         timeout=60).stdout.decode('utf-8', 'replace')
    if not raw or raw.lstrip().startswith('<'):
        return None
    try:
        return json.loads(raw, strict=False)
    except Exception:
        return None


if __name__ == '__main__':
    test = sys.argv[1:] or ['仰望星空派', '农舍派', '腌蘑菇', '葡萄沙拉', '仰望派']
    d = fetch(test)
    if not d:
        print('被拦'); sys.exit(1)
    for pid, pg in d.get('query', {}).get('pages', {}).items():
        t = pg.get('title')
        r = pg.get('revisions')
        if not r:
            print('  %s → 无页面' % t); continue
        w = r[0]['slots']['main']['*']
        # 抓 infobox/card|xxx 和 {{卡牌|id=xxx}}
        import re
        ib = re.findall(r'\{\{infobox/card\|([A-Za-z0-9_.\[\]\-]+)', w)
        cards = sorted(set(re.findall(r'\{\{卡牌\|id=([A-Za-z0-9_.\[\]\-]+)', w)))
        print('  %-10s infobox=%-22s 合成配方卡牌=%s'
              % (t, ib[:1], cards[:6]))
