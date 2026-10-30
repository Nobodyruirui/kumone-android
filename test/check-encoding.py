"""编码体检：确认每个文件的 BOM 状态是对的。

规则（本机 Windows + PowerShell 5.1）：
  · .json / .js / .mjs / .md / .css / .html —— **不能有 BOM**
    （JSON.parse 遇到 BOM 直接失败；JS 里多一个看不见的字符）
  · .ps1 —— **必须有 BOM**
    （PowerShell 5.1 读无 BOM 的 .ps1 会按 GBK 解码，中文乱码 → 语法解析失败）

用法：python test/check-encoding.py
退出码：0 全部合规；1 有不合规文件。
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'.git', 'node_modules', 'android', '.gradle', 'build'}
NO_BOM = {'.js', '.mjs', '.json', '.md', '.css', '.html'}
NEED_BOM = {'.ps1'}
BOM = b'\xef\xbb\xbf'


def main():
    problems = []
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in files:
            ext = os.path.splitext(name)[1].lower()
            if ext not in NO_BOM and ext not in NEED_BOM:
                continue
            path = os.path.join(base, name)
            rel = os.path.relpath(path, ROOT).replace(os.sep, '/')
            with open(path, 'rb') as fh:
                head = fh.read(3)
            has_bom = head == BOM
            if ext in NEED_BOM and not has_bom:
                problems.append('%s 缺 BOM（PS 5.1 会把中文读成乱码）' % rel)
            if ext in NO_BOM and has_bom:
                problems.append('%s 有 BOM（JSON 会解析失败 / JS 多一个隐藏字符）' % rel)

    if problems:
        print('编码体检发现问题：')
        for p in problems:
            print('  x ' + p)
        sys.exit(1)
    print('编码体检通过：%s 必须无 BOM，%s 必须有 BOM。' % (
        '/'.join(sorted(NO_BOM)), '/'.join(sorted(NEED_BOM))))


if __name__ == '__main__':
    main()
