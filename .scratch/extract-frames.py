# 抽帧：把录屏在转场附近逐帧拆出来，方便定位「白色方块」。
import cv2, os

SRC = r".scratch/screen.mp4"
OUT = r".scratch/frames"
os.makedirs(OUT, exist_ok=True)

cap = cv2.VideoCapture(SRC)
fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
print("fps=%.3f frames=%d size=%dx%d dur=%.2fs" % (fps, total, w, h, total / fps))

start = int(0.55 * fps)
end = int(1.85 * fps)
rows = []
i = start
while i < end:
    cap.set(cv2.CAP_PROP_POS_FRAMES, i)
    ok, frame = cap.read()
    if not ok:
        break
    top = frame[: int(h * 0.55), :, :]
    gray = cv2.cvtColor(top, cv2.COLOR_BGR2GRAY)
    white = ((gray > 248) & (top.max(axis=2) - top.min(axis=2) < 8)).sum()
    frac = white / float(top.shape[0] * top.shape[1])
    rows.append((frac, i, i / fps, frame))
    i += 1

rows.sort(key=lambda r: -r[0])
print("纯白像素占比最高的帧：")
for frac, idx, t, frame in rows[:10]:
    print("  t=%.3fs frame=%d white=%.2f%%" % (t, idx, frac * 100))
    cv2.imwrite(os.path.join(OUT, "f%04d_%.2f.png" % (idx, t)), frame)

# 另存一张转场中段的帧，方便肉眼看
for want in (0.90, 1.00, 1.10, 1.20, 1.30):
    idx = int(want * fps)
    cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
    ok, frame = cap.read()
    if ok:
        cv2.imwrite(os.path.join(OUT, "at_%.2f.png" % want), frame)

cap.release()
print("已存到", OUT)
