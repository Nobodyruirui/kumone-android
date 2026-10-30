# 反向自证：故意让知识包 manifest 的动作白名单与实现漂移，校验器必须失败；然后自动还原。
# 用相对路径（脚本从仓库根目录跑），避开 Windows 上中文绝对路径的坑。
import io, os, subprocess, sys, shutil

MANIFEST = os.path.join("www", "mobile", "learnings", "netease", "manifest.json")
VALIDATOR = os.path.join("test", "validate-learnings.mjs")

with io.open(MANIFEST, "r", encoding="utf-8") as f:
    original = f.read()

backup = MANIFEST + ".bak-proof"
shutil.copy2(MANIFEST, backup)

caught = False
try:
    mutated = original.replace('"focus",\n      "fill"', '"focus"')
    if mutated == original:
        mutated = original.replace('"focus",\r\n      "fill"', '"focus"')
    if mutated == original:
        print("PROVE: 没找到可改的地方（manifest 结构变了？）")
        sys.exit(1)
    with io.open(MANIFEST, "w", encoding="utf-8", newline="") as f:
        f.write(mutated)

    r = subprocess.run(["node", VALIDATOR], capture_output=True, text=True, encoding="utf-8")
    caught = r.returncode != 0 and ("动作白名单漂移" in (r.stderr or "") + (r.stdout or ""))
    print("PROVE: 漂移后校验器是否报错 =", "是（符合预期）" if caught else "否（闸失效了！）")
    if not caught:
        print((r.stdout or "")[:400])
        print((r.stderr or "")[:400])
finally:
    shutil.move(backup, MANIFEST)

r2 = subprocess.run(["node", VALIDATOR], capture_output=True, text=True, encoding="utf-8")
print("PROVE: 还原后校验器是否通过 =", "是" if r2.returncode == 0 else "否")
sys.exit(0 if (caught and r2.returncode == 0) else 1)
