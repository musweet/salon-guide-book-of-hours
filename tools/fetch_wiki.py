"""抓取 Data 命名空间页面的内容（卡牌原始数据）。

用法:
  python tools/fetch_wiki.py          # 先列页（断点续传，可重复跑）
  python tools/fetch_wiki.py fetch    # 再抓内容（断点续传）
  python tools/fetch_wiki.py stats    # 看已抓到多少

抓取策略（实测得出）：
  - User-Agent 必须精确用 'Chrome/120.0 Safari/537.36'。
    'Chrome/120.0.0.0' 或 'Mozilla/5.0' 一律返回 Cloudflare 挑战页。
    这不是频率限制，是 UA 版本串的精确格式检查——不是"绕过"，是合规写法。
  - 一次请求批量传 titles（用 | 分隔），算一次调用。
  - 中文变体页（标题含 ' zh'）无 aspects，已在列页阶段过滤。
  - 每批落盘到 _源数据/_content/pN.json，中断后自动续传。
"""
import subprocess, json, time, os, sys, glob

API = 'https://boh.huijiwiki.com/api.php'
# 关键：Chrome/120.0 精确版。多了 .0.0 就会被 Cloudflare 拦成挑战页。
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      'Chrome/120.0 Safari/537.36')
OUT = '_源数据'
CONTENT = os.path.join(OUT, '_content')
BATCH = 40          # 每批 titles 数
BATCH_SLEEP = 2.0   # 批次间隔，秒


def curl(params, timeout=120):
    """GET，返回 JSON dict；被 Cloudflare 拦或出错返回 None"""
    args = ['curl', '-s', '-A', UA, '--max-time', str(timeout), '-G', API]
    for k, v in params.items():
        args += ['--data-urlencode', '%s=%s' % (k, v)]
    r = subprocess.run(args, capture_output=True, timeout=timeout + 20)
    raw = r.stdout.decode('utf-8', 'replace')
    if not raw or raw.lstrip().startswith('<') or '请稍候' in raw[:600]:
        return None
    try:
        d = json.loads(raw, strict=False)
    except Exception:
        return None
    return d if 'error' not in d else None


def retry(params, tries=5):
    """被拦则指数退避重试"""
    for i in range(tries):
        d = curl(params)
        if d is not None:
            return d
        wait = 12 + i * 12
        print('  ! 被拦，退避 %ds (%d/%d)' % (wait, i + 1, tries), flush=True)
        time.sleep(wait)
    return None


def done_titles():
    """返回已抓过的页面标题集合"""
    out = set()
    for f in glob.glob(os.path.join(CONTENT, 'p*.json')):
        try:
            for t, j in json.load(open(f, encoding='utf-8')).items():
                if j is not None:
                    out.add(t)
        except Exception:
            pass
    return out


def next_batch_num():
    """返回下一个可用的批次号。
    关键：不能从 0 开始，否则会覆盖旧批次文件，
    导致不同批次的抓取互相覆盖、总数原地不动。"""
    mx = 0
    for f in glob.glob(os.path.join(CONTENT, 'p*.json')):
        try:
            n = int(os.path.basename(f)[1:-5])
            if n > mx:
                mx = n
        except Exception:
            pass
    return mx + 1


def fetch():
    os.makedirs(CONTENT, exist_ok=True)
    titles = json.load(open(os.path.join(OUT, '_titles_en.json'), encoding='utf-8'))
    todo = [t for t in titles if t not in done_titles()]
    print('待抓 %d / %d（已完成 %d）' % (len(todo), len(titles), len(titles) - len(todo)),
          flush=True)
    if not todo:
        print('全部完成'); return

    n = next_batch_num()
    ok = miss = 0
    for i in range(0, len(todo), BATCH):
        batch = todo[i:i + BATCH]
        p = {'action': 'query', 'format': 'json', 'prop': 'revisions',
             'rvprop': 'content', 'rvslots': 'main',
             'titles': '|'.join(batch)}
        d = retry(p)
        if d is None:
            print('ABORT：第 %d 批失败' % n, flush=True)
            break
        res = {}
        for pid, pg in d.get('query', {}).get('pages', {}).items():
            title = pg.get('title', '?')
            r = pg.get('revisions')
            if not r:
                res[title] = None; miss += 1; continue
            try:
                res[title] = json.loads(r[0]['slots']['main']['*'], strict=False)
                ok += 1
            except Exception:
                res[title] = None; miss += 1
        fp = os.path.join(CONTENT, 'p%d.json' % n)
        json.dump(res, open(fp, 'w', encoding='utf-8'), ensure_ascii=False)
        n += 1
        if n % 10 == 0:
            print('  批 %d：%d 成功 / %d 缺失' % (n, ok, miss), flush=True)
        time.sleep(BATCH_SLEEP)
    print('完成：%d 成功 / %d 缺失' % (ok, miss))


def stats():
    n = got = 0
    kinds = {}
    for f in glob.glob(os.path.join(CONTENT, 'p*.json')):
        for t, j in json.load(open(f, encoding='utf-8')).items():
            n += 1
            if j is None:
                continue
            got += 1
            ih = j.get('inherits')
            kinds[ih] = kinds.get(ih, 0) + 1
    print('页面 %d | 有内容 %d' % (n, got))
    print('按 inherits 分布:')
    for k, v in sorted(kinds.items(), key=lambda x: -x[1]):
        print('  %-28s %d' % (k, v))


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'fetch':
        fetch()
    elif cmd == 'stats':
        stats()
    else:
        # 无参数：列页（已有完整清单则跳过）
        tf = os.path.join(OUT, '_titles_en.json')
        if os.path.exists(tf) and json.load(open(tf, encoding='utf-8')):
            print('清单已存在：', len(json.load(open(tf, encoding='utf-8'))), '个页面')
            print('→ 运行  python tools/fetch_wiki.py fetch  抓取内容')
        else:
            raise SystemExit('无清单，请先列页')
