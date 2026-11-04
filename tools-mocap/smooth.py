import json, numpy as np
from scipy.signal import butter, filtfilt
d=json.load(open('pose_raw.json')); W=d['world']; fps=d['fps']
n=len(W); idx=[i for i in range(n) if W[i]]
A=np.full((n,33,3),np.nan); I=np.full((n,33,2),np.nan)
for i in idx: A[i]=np.array(W[i])[:,:3]; I[i]=np.array(d['img'][i])
for arr in (A,I):
  for j in range(33):
    for k in range(arr.shape[2]):
      v=arr[:,j,k]; m=~np.isnan(v); arr[:,j,k]=np.interp(np.arange(n),np.where(m)[0],v[m])
b,a=butter(2,5.0/(fps/2)); A=filtfilt(b,a,A,axis=0); I=filtfilt(b,a,I,axis=0)
B=np.stack([A[...,0],A[...,2],-A[...,1]],-1)  # -> Blender X,Y,Z (char faces camera = -Y)
np.save('pose3d.npy',B); np.save('pose2d.npy',I)
print(n, 'hipx(img):',np.round(I[:, [23,24],0].mean(1)[::4],3))
print('ankle z L/R:',np.round(B[::4,27,2],2),np.round(B[::4,28,2],2))
