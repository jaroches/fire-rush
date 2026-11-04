import bpy, numpy as np, sys
from mathutils import Vector, Matrix, Quaternion
P=np.load('/workspace/mocap/pose3d.npy')   # (n,33,3)
F0,F1,N,FPS=12,34,17,50
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='/workspace/fire-rush/assets/anims.glb')
for o in list(bpy.data.objects):
  if o.type!='EMPTY': bpy.data.objects.remove(o)
for o in bpy.data.objects: o.animation_data_clear()
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
O=bpy.data.objects; vl=bpy.context.view_layer
for o in O: o.rotation_mode='QUATERNION'
REST={o.name:o.rotation_quaternion.copy() for o in O}
RESTLOC={o.name:o.location.copy() for o in O}
def reset():
  for o in O: o.rotation_quaternion=REST[o.name]; o.location=RESTLOC[o.name]
  vl.update()
reset()
W=lambda n:O[n].matrix_world.translation.copy()
# character rest frame
cl=(W('thigh_l')-W('thigh_r')).normalized(); cup=(W('neck_01')-W('pelvis')).normalized()
cf=((W('ball_l')+W('ball_r'))/2-(W('foot_l')+W('foot_r'))/2); cf=(cf-cf.dot(cup)*cup).normalized()
def frame(l,u,f=None):
  l=l.normalized(); f=u.cross(l).normalized() if f is None else f; u2=l.cross(f).normalized()
  return Matrix((l,f,u2)).transposed()
Rc=frame(cl,cup); 
# ensure forward sign agrees with toes
if (Rc.col[1]).dot(cf)<0: print('flip-forward-check')
def v(a): return Vector(a.tolist())
def mpframe(p):
  l=v(p[23]-p[24]); u=v((p[11]+p[12])/2-(p[23]+p[24])/2).normalized(); return frame(l,u)
def resample(P):
  ts=np.linspace(F0,F1,N); out=[]
  for t in ts:
    i=int(np.floor(t)); u=t-i; j=min(i+1,len(P)-1); out.append(P[i]*(1-u)+P[j]*u)
  return np.array(out)
S=resample(P)
# align: mean pelvis frame over window -> character rest frame (removes camera yaw)
M=sum((np.array(mpframe(p)) for p in S[:4]),np.zeros((3,3)))
U,_,Vt=np.linalg.svd(M); Rm=Matrix((U@Vt).tolist())
Ralign=np.array(Rc@Rm.transposed())
S=np.einsum('ij,nkj->nki',Ralign,S)
# de-yaw: remove most of the heading change (runner keeps facing down the lane), keep 25% hip lead + the shoulder counter-twist
upv=np.array(cup); lv=np.array(cl); fv=np.cross(upv,lv)
for i in range(len(S)):
  h=S[i,23]-S[i,24]; yaw=np.arctan2(h@fv,h@lv)*0.75; c,s_=np.cos(-yaw),np.sin(-yaw)
  K=np.array([[0,-upv[2],upv[1]],[upv[2],0,-upv[0]],[-upv[1],upv[0],0]]); R=np.eye(3)+s_*K+(1-c)*K@K
  ctr=(S[i,23]+S[i,24])/2; S[i]=(S[i]-ctr)@R.T+ctr
def mirror(S):
  L=np.array(cl); R=np.eye(3)-2*np.outer(L,L); X=np.einsum('ij,nkj->nki',R,S)
  sw=list(range(33))
  for a,b in [(1,4),(2,5),(3,6),(7,8),(9,10)]+[(i,i+1) for i in range(11,33,2)]: sw[a],sw[b]=b,a
  return X[:,sw]
LIMBS=[('upperarm_l',11,13),('lowerarm_l',13,15),('upperarm_r',12,14),('lowerarm_r',14,16),
       ('thigh_l',23,25),('calf_l',25,27),('foot_l',29,31),('thigh_r',24,26),('calf_r',26,28),('foot_r',30,32)]
CHILD={'upperarm_l':'lowerarm_l','lowerarm_l':'hand_l','upperarm_r':'lowerarm_r','lowerarm_r':'hand_r','thigh_l':'calf_l','calf_l':'foot_l','thigh_r':'calf_r','calf_r':'foot_r','foot_l':'ball_l','foot_r':'ball_r'}
def setworldrot(o,q):  # rotate object so world rotation becomes q
  pw=o.parent.matrix_world.to_quaternion() if o.parent else Quaternion()
  o.rotation_quaternion=pw.inverted()@q; vl.update()
def swing(o,child,tgt):
  d=(W(child)-o.matrix_world.translation).normalized(); q=d.rotation_difference(tgt.normalized())
  setworldrot(o,q@o.matrix_world.to_quaternion())
def pose(p):
  reset()
  hip=mpframe(p); chest=frame(v(p[11]-p[12]),v((p[11]+p[12])/2-(p[23]+p[24])/2))
  qh=(hip@Rc.transposed()).to_quaternion(); qc=(chest@Rc.transposed()).to_quaternion()
  qp0=O['pelvis'].matrix_world.to_quaternion(); setworldrot(O['pelvis'],qh@qp0)
  for k,n in enumerate(['spine_01','spine_02','spine_03']):
    q=qh.slerp(qc,(k+1)/3); setworldrot(O[n],q@qh.inverted()@O[n].matrix_world.to_quaternion()@Quaternion() if False else q@(qh.inverted()@O[n].matrix_world.to_quaternion()))
  # head: chest-relative look from ears->nose
  hl=v(p[7]-p[8]); hf=v(p[0]-(p[7]+p[8])/2); hu=hl.cross(hf); qhd=(frame(hl,hu)@Rc.transposed()).to_quaternion()
  rel=qc.inverted()@qhd; ang=rel.angle
  if ang>0.6: rel=Quaternion(rel.axis,0.6)
  setworldrot(O['neck_01'],qc.slerp(qc@rel,0.5)@(qc.inverted()@O['neck_01'].matrix_world.to_quaternion()))
  setworldrot(O['Head'],(qc@rel)@((qc.slerp(qc@rel,0.5)).inverted()@O['Head'].matrix_world.to_quaternion()))
  for n,a,b in LIMBS: swing(O[n],CHILD[n],v(p[b]-p[a]))
  # pelvis height: hip height above lowest ankle, scaled to char leg length
  leg_c=(W('thigh_l')-W('calf_l')).length+(W('calf_l')-W('foot_l')).length
  leg_m=np.linalg.norm(p[23]-p[25])+np.linalg.norm(p[25]-p[27])
  return leg_c/leg_m
def bake(S,name):
  frames=[]
  for i,p in enumerate(S):
    pose(p)
    for o in O:
      o.keyframe_insert('rotation_quaternion',frame=i)
  tr=None
  for o in O:
    ad=o.animation_data; act=ad.action; act.name=name+'_'+o.name
    t=ad.nla_tracks.new(); t.name=name; t.strips.new(name,0,act); ad.action=None
bake(S,'Rollover_L')   # source: moving LEFT, right sole
bake(mirror(S),'Rollover_R')
reset()
sc=bpy.context.scene; sc.render.fps=FPS; sc.frame_start=0; sc.frame_end=N-1
bpy.ops.export_scene.gltf(filepath='/workspace/mocap/rollover.glb',export_format='GLB',export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_frame_range=False,export_def_bones=False)
print('DONE')
