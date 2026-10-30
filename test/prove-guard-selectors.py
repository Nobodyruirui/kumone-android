"""反向自证：往仓库里注入几种违规写法，确认守卫会失败；然后还原。

用法：python test/prove-guard-selectors.py
"""
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GUARD = os.path.join(ROOT, 'test', 'guard-design.mjs')
TARGET = os.path.join(ROOT, 'www', 'mobile', 'core', 'snapshot.js')

VIOLATIONS = [
    ("把 CSS 选择器当 ref 调用 act",
     "    M.act('.m-tab', 'click');\n"),
    ("给 act 传 css 字段",
     "    M.act(ref, 'click', { css: '#m-nav' });\n"),
    ("给 act 传坐标",
     "    M.act(ref, 'click', { x: 12, y: 44 });\n"),
]


def read(path):
    with open(path, 'r', encoding='utf-8') as fh:
        return fh.read()


def write(path, text):
    with open(path, 'w', encoding='utf-8', newline='') as fh:
        fh.write(text)


def run_guard():
    # node 输出是 UTF-8；Windows 默认编码是 GBK，必须显式指定，
    # 否则子进程输出解码失败 → 抓到的是空字符串 → 反向自证假失败。
    proc = subprocess.run(
        ['node', GUARD],
        capture_output=True,
        text=True,
        encoding='utf-8',
        errors='replace'
    )
    return proc.returncode, (proc.stdout or '') + (proc.stderr or '')


def main():
    # 控制台是 GBK，中文输出会花；强制 UTF-8 输出
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
    original = read(TARGET)
    failures = []
    try:
        for label, snippet in VIOLATIONS:
            write(TARGET, original + '\n' + snippet)
            code, out = run_guard()
            caught = code != 0 and '定位入口形态' in out
            print(('PASS' if caught else 'FAIL') + ' - 反向自证：' + label)
            if not caught:
                failures.append(label)
                print(out[-600:])
    finally:
        write(TARGET, original)

    code, out = run_guard()
    ok = code == 0
    print(('PASS' if ok else 'FAIL') + ' - 还原后守卫恢复通过')
    if not ok:
        failures.append('还原后守卫未通过')
        print(out[-600:])

    print('\n反向自证%s' % ('全部通过 ✔' if not failures else '失败：' + '、'.join(failures)))
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
