import cv2, numpy as np, mediapipe as mp, json
from mediapipe.tasks.python import vision, BaseOptions
opt=vision.PoseLandmarkerOptions(base_options=BaseOptions(model_asset_path='pose_heavy.task'),running_mode=vision.RunningMode.VIDEO,min_pose_detection_confidence=0.3,min_tracking_confidence=0.3)
lm=vision.PoseLandmarker.create_from_options(opt)
cap=cv2.VideoCapture('ref_trim.mp4'); fps=cap.get(5); W=[];I=[];i=0
while True:
  ok,f=cap.read()
  if not ok: break
  r=lm.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB,data=cv2.cvtColor(f,cv2.COLOR_BGR2RGB)),int(i*1000/fps))
  if r.pose_world_landmarks:
    W.append([[p.x,p.y,p.z,p.visibility] for p in r.pose_world_landmarks[0]]); I.append([[p.x,p.y] for p in r.pose_landmarks[0]])
  else: W.append(None); I.append(None)
  i+=1
print(i,sum(w is None for w in W),fps)
json.dump({'fps':fps,'world':W,'img':I},open('pose_raw.json','w'))
