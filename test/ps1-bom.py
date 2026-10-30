"""给 .ps1 脚本加 UTF-8 BOM。

PowerShell 5.1 读取无 BOM 的 .ps1 时按系统 ANSI（中文机器上是 GBK）解码，
脚本里的中文会变成乱码 —— 轻则输出乱码，重则语法解析直接失败
（"The Try statement is missing its Catch or Finally block"）。

用法：python test/ps1-bom.py
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOM = b'\xef\xbb\xbf'

fixed = []
for base, dirs, files in os.walk(ROOT):
    dirs[:] = [d for d in dirs if d not in {'.git', 'node_modules', 'android', 'build'}]
    for name in files:
        if not name.lower().endswith('.ps1'):
            continue
        path = os.path.join(base, name)
        with open(path, 'rb') as fh:
            data = fh.read()
        if data.startswith(BOM):
            continue
        with open(path, 'wb') as fh:
            fh.write(BOM + data)
        fixed.append(os.path.relpath(path, ROOT))

if fixed:
    print('已加 BOM 的脚本（%d 个）：' % len(fixed))
    for p in fixed:
        print('  ' + p)
else:
    print('所有 .ps1 都已有 BOM。')
