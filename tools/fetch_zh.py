"""抓取中文数据页（Data:* zh.json），它们包含 {中文Label, 英文id} 的对应关系。

这是精确映射，不是模糊匹配：
  Data:Pie.pilchards zh.json → {"Label":"仰望星空派","id":"pie.pilchards"}
  Data:Beef zh.json         → {"Label":"牛肉","id":"beef"}

所以 202 个做菜卡牌的中文 Label 直接来自维基翻译，不需要猜。

UA 必须精确用 'Chrome/120.0 Safari/537.36'（多 .0.0 会被 Cloudflare 拦成挑战页）。
"""
import subprocess, urllib.parse, json, time, os, sys, glob

API = 'https://boh.huijiwiki.com/api.php'
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      'Chrome/120.0 Safari/537.36')
OUT = '_源数据'
ZHDIR = os.path.join(OUT, '_zh')
BATCH = 40
SLEEP = 2.0


def fetch(titles, timeout=90):
    p = {'action': 'query', 'format': 'json', 'prop': 'revisions',
         'rvprop': 'content', 'rvslots': 'main', 'titles': '|'.join(titles)}
    args = ['curl', '-s', '-A', UA, '--max-time', str(timeout), '-G', API]
    for k, v in p.items():
        args += ['--data-urlencode', '%s=%s' % (k, v)]
    raw = subprocess.run(args, capture_output=True,
                         timeout=timeout + 20).stdout.decode('utf-8', 'replace')
    if not raw or raw.lstrip().startswith('<'):
        return None
    try:
        return json.loads(raw, strict=False)
    except Exception:
        return None


def retry(titles, tries=5):
    for i in range(tries):
        d = fetch(titles)
        if d is not None:
            return d
        wait = 15 + i * 15
        print('  ! 被拦，退避 %ds (%d/%d)' % (wait, i + 1, tries), flush=True)
        time.sleep(wait)
    return None


def done():
    out = set()
    for f in glob.glob(os.path.join(ZHDIR, 'p*.json')):
        try:
            out |= set(json.load(open(f, encoding='utf-8')).keys())
        except Exception:
            pass
    return out


def next_num():
    mx = 0
    for f in glob.glob(os.path.join(ZHDIR, 'p*.json')):
        try:
            n = int(os.path.basename(f)[1:-5])
            if n > mx:
                mx = n
        except Exception:
            pass
    return mx + 1


def run():
    os.makedirs(ZHDIR, exist_ok=True)
    # 只抓食物相关的中文页：英文部分匹配 Pie/Mushroom/Beef 等菜系词
    titles = []
    for f in glob.glob(os.path.join(OUT, '_list_p*.json')):
        for t in json.load(open(f, encoding='utf-8')):
            if ' zh' in t:
                titles.append(t)
    have = done()
    todo = [t for t in titles if t not in have]
    print('中文页 %d | 待抓 %d（已抓 %d）' % (len(titles), len(todo), len(have)),
          flush=True)
    if not todo:
        return

    n = next_num()
    ok = 0
    for i in range(0, len(todo), BATCH):
        batch = todo[i:i + BATCH]
        d = retry(batch)
        if d is None:
            print('ABORT 批 %d' % n, flush=True)
            break
        res = {}
        for pid, pg in d.get('query', {}).get('pages', {}).items():
            r = pg.get('revisions')
            try:
                res[pg['title']] = json.loads(
                    r[0]['slots']['main']['*'], strict=False) if r else None
            except Exception:
                res[pg['title']] = None
        json.dump(res, open(os.path.join(ZHDIR, 'p%d.json' % n), 'w',
                            encoding='utf-8'), ensure_ascii=False)
        ok += sum(1 for v in res.values() if v)
        n += 1
        if n % 15 == 0 or i + BATCH >= len(todo):
            print('  批 %d，累计解析 %d' % (n, ok), flush=True)
        time.sleep(SLEEP)
    print('完成，累计 %d 个中文页' % ok)


if __name__ == '__main__':
    run()
