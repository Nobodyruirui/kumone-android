"""去掉被 PowerShell 5.1 的 `Set-Content -Encoding UTF8` 塞进文件的 BOM。

BOM 对 .json 是致命的（JSON.parse 直接失败），对 .js/.md 是隐患。

**但 .ps1 是例外**：PowerShell 5.1 读取无 BOM 的 .ps1 会按系统 ANSI（GBK）解码，
脚本里的中文会变乱码，轻则输出乱码、重则语法解析直接失败。
所以 .ps1 必须**带** BOM，由 test/ps1-bom.py 负责加，这里跳过。

用法：python test/strip-bom.py [仓库根目录]
"""
import os
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'.git', 'node_modules', 'android', '.gradle', 'build'}
EXTS = {'.js', '.mjs', '.json', '.md', '.css', '.html'}
# .ps1 必须带 BOM（见 test/ps1-bom.py），不能在这里剥掉
KEEP_BOM = {'.ps1'}

fixed = []
for base, dirs, files in os.walk(ROOT):
    dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
    for name in files:
        if os.path.splitext(name)[1].lower() not in EXTS:
            continue
        path = os.path.join(base, name)
        ext = os.path.splitext(name)[1].lower()
        if ext in KEEP_BOM:
            continue
        try:
            with open(path, 'rb') as fh:
                head = fh.read(3)
                if head != b'\xef\xbb\xbf':
                    continue
                data = fh.read()
            with open(path, 'wb') as fh:
                fh.write(data)
            fixed.append(os.path.relpath(path, ROOT))
        except OSError as exc:
            print('SKIP %s : %s' % (path, exc))

if fixed:
    print('已去掉 BOM 的文件（%d 个）：' % len(fixed))
    for p in fixed:
        print('  ' + p)
else:
    print('没有发现 BOM。')
