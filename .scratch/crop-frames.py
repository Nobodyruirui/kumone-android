# 把转场附近的帧裁出「左上一带」并缩小，方便肉眼看白块。
import cv2, os

SRC = r".scratch/screen.mp4"
OUT = r".scratch/frames2"
os.makedirs(OUT, exist_ok=True)

cap = cv2.VideoCapture(SRC)
fps = cap.get(cv2.CAP_PROP_FPS)
h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))

# 只看左半边的上半部分（白块出现的地方），缩小到 430 宽
x0, y0, x1, y1 = 0, 0, int(w * 0.62), int(h * 0.46)
for want in [0.60, 0.75, 0.85, 0.95, 1.00, 1.05, 1.10, 1.20, 1.35, 1.60, 1.90]:
    idx = int(want * fps)
    cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
    ok, frame = cap.read()
    if not ok:
        continue
    crop = frame[y0:y1, x0:x1]
    scale = 430.0 / crop.shape[1]
    crop = cv2.resize(crop, (430, int(crop.shape[0] * scale)))
    cv2.imwrite(os.path.join(OUT, "t%05.2f.png" % want), crop)
cap.release()
print("裁好 ->", OUT)
