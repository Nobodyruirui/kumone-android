# 全屏缩小版：看整帧在转场时是什么样子。
import cv2, os

SRC = r".scratch/screen.mp4"
OUT = r".scratch/frames3"
os.makedirs(OUT, exist_ok=True)

cap = cv2.VideoCapture(SRC)
fps = cap.get(cv2.CAP_PROP_FPS)
h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))

for want in [0.55, 0.70, 0.85, 0.95, 1.00, 1.05, 1.10, 1.15, 1.25, 1.40, 1.70, 2.00]:
    idx = int(want * fps)
    cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
    ok, frame = cap.read()
    if not ok:
        continue
    scale = 360.0 / frame.shape[1]
    small = cv2.resize(frame, (360, int(frame.shape[0] * scale)))
    cv2.imwrite(os.path.join(OUT, "f%05.2f.png" % want), small)
cap.release()
print("全帧 ->", OUT)
