# Retarget Anderson Rohr's Free Soccer Mocap Pack 05 (Rokoko Default, 60 fps)
# onto the Quaternius empties in assets/anims.glb and write assets/dribble.glb.
# The original FBX pack is not shipped. Point ROHR_DIR at the Rokoko_Default folder.
#
#   ROHR_DIR=/path/to/Rokoko_Default blender --background --python tools-mocap/retarget_rohr.py
#
# Hip heading is removed so the runner keeps facing down the lane. Limb directions
# are taken from the clip in that hip frame. A short seam blend closes the loop.
import bpy, os, math
from mathutils import Vector, Matrix, Quaternion

OUT = os.environ.get('OUT', '/workspace/assets/dribble.glb')
SRC = os.environ.get('ROHR_DIR', '/tmp/rohr/anderson-rohr/mocap/Rokoko_Default')
CLIPS = ['01_Dribble_01', '02_Dribble_02', '03_Dribble_03']

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='/workspace/assets/anims.glb')
for o in list(bpy.data.objects):
    if o.type != 'EMPTY':
        bpy.data.objects.remove(o)
for o in bpy.data.objects:
    o.animation_data_clear()
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)
O = bpy.data.objects
vl = bpy.context.view_layer
for o in O:
    o.rotation_mode = 'QUATERNION'
REST = {o.name: o.rotation_quaternion.copy() for o in O}
RESTLOC = {o.name: o.location.copy() for o in O}

def reset():
    for o in O:
        o.rotation_quaternion = REST[o.name]
        o.location = RESTLOC[o.name]
        if o.animation_data:
            o.animation_data.use_nla = False
    vl.update()

reset()
W = lambda n: O[n].matrix_world.translation.copy()

def frame(l, u):
    l = l.normalized()
    f = u.cross(l)
    if f.length < 1e-8:
        f = Vector((0, -1, 0))
    f = f.normalized()
    u2 = l.cross(f).normalized()
    return Matrix((l, f, u2)).transposed()

cl = (W('thigh_l') - W('thigh_r'))
cup = (W('neck_01') - W('pelvis'))
Rc = frame(cl, cup)
up = cup.normalized()
print('Rc cols', [[round(x, 2) for x in Rc.col[i]] for i in range(3)], 'toeRest', [round(x, 2) for x in ((W('ball_l') - W('foot_l')).normalized())])

def setworldrot(o, q):
    pw = o.parent.matrix_world.to_quaternion() if o.parent else Quaternion()
    o.rotation_quaternion = pw.inverted() @ q
    vl.update()

def swing(o, child, tgt):
    d = W(child) - o.matrix_world.translation
    if d.length < 1e-6 or tgt.length < 1e-6:
        return
    q = d.normalized().rotation_difference(tgt.normalized())
    setworldrot(o, q @ o.matrix_world.to_quaternion())

def swing_twist(q, axis):
    axis = axis.normalized()
    dot = q.x * axis.x + q.y * axis.y + q.z * axis.z
    tw = Quaternion((q.w, axis.x * dot, axis.y * dot, axis.z * dot))
    if tw.magnitude < 1e-8:
        return q, Quaternion((1, 0, 0, 0))
    tw.normalize()
    # keep the short way
    if tw.w < 0:
        tw = Quaternion((-tw.w, -tw.x, -tw.y, -tw.z))
    sw = q @ tw.inverted()
    return sw, tw

# bone -> child empty. Terminal bones swing toward a synthetic child stored per frame.
CHAIN = [
    ('spine_01', 'spine_02', 'Spine1', 'Spine2'),
    ('spine_02', 'spine_03', 'Spine2', 'Spine4'),
    ('spine_03', 'neck_01', 'Spine4', 'Neck'),
    ('neck_01', 'Head', 'Neck', 'Head'),
    ('clavicle_l', 'upperarm_l', 'LeftShoulder', 'LeftArm'),
    ('upperarm_l', 'lowerarm_l', 'LeftArm', 'LeftForeArm'),
    ('lowerarm_l', 'hand_l', 'LeftForeArm', 'LeftHand'),
    ('hand_l', 'middle_01_l', 'LeftHand', 'LeftHandTip'),
    ('clavicle_r', 'upperarm_r', 'RightShoulder', 'RightArm'),
    ('upperarm_r', 'lowerarm_r', 'RightArm', 'RightForeArm'),
    ('lowerarm_r', 'hand_r', 'RightForeArm', 'RightHand'),
    ('hand_r', 'middle_01_r', 'RightHand', 'RightHandTip'),
    ('thigh_l', 'calf_l', 'LeftThigh', 'LeftShin'),
    ('calf_l', 'foot_l', 'LeftShin', 'LeftFoot'),
    ('foot_l', 'ball_l', 'LeftFoot', 'LeftToe'),
    ('ball_l', 'ball_leaf_l', 'LeftToe', 'LeftToeTip'),
    ('thigh_r', 'calf_r', 'RightThigh', 'RightShin'),
    ('calf_r', 'foot_r', 'RightShin', 'RightFoot'),
    ('foot_r', 'ball_r', 'RightFoot', 'RightToe'),
    ('ball_r', 'ball_leaf_r', 'RightToe', 'RightToeTip'),
]
SRC_JOINTS = ['Hips','Spine1','Spine2','Spine4','Neck','Head','LeftShoulder','LeftArm','LeftForeArm','LeftHand',
              'RightShoulder','RightArm','RightForeArm','RightHand','LeftThigh','LeftShin','LeftFoot','LeftToe',
              'RightThigh','RightShin','RightFoot','RightToe']

def import_fbx(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == 'ARMATURE')
    return arm, new

def sample_clip(path):
    arm, new = import_fbx(path)
    sc = bpy.context.scene
    fs, fe = sc.frame_start, sc.frame_end
    frames = []
    for f in range(fs, fe + 1):
        sc.frame_set(f)
        vl.update()
        P = {}
        for n in SRC_JOINTS:
            P[n] = (arm.matrix_world @ arm.pose.bones[n].head).copy()
        # bone tails for terminal aim
        for n, key in (('Head','HeadTip'), ('LeftHand','LeftHandTip'), ('RightHand','RightHandTip'),
                       ('LeftToe','LeftToeTip'), ('RightToe','RightToeTip')):
            P[key] = (arm.matrix_world @ arm.pose.bones[n].tail).copy()
        frames.append(P)
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)
    return frames

def src_frame(P):
    l = P['LeftThigh'] - P['RightThigh']
    u = P['Neck'] - P['Hips']
    return frame(l, u)

def pose_frame(P, Rs0, hip_z0, yaw_keep=0.0):
    reset()
    Rs = src_frame(P)
    Rmap = Rc @ Rs0.inverted()
    H_full = Rmap @ Rs
    q = (H_full @ Rc.inverted()).to_quaternion()
    sw, tw = swing_twist(q, up)
    ang = tw.angle
    if ang > math.pi:
        ang -= 2 * math.pi
    # axis may flip with the angle; reconstruct a short twist
    tw_k = Quaternion(up, ang * yaw_keep)
    H = tw_k.to_matrix().to_3x3() @ sw.to_matrix().to_3x3() @ Rc
    # pelvis orientation: H should replace Rc
    qp0 = O['pelvis'].matrix_world.to_quaternion()
    qh = (H @ Rc.inverted()).to_quaternion()
    setworldrot(O['pelvis'], qh @ qp0)
    # vertical bob only, in the empty's local up (local -Y maps to world +Z)
    dz = (P['Hips'].z - hip_z0)
    dz = max(-0.06, min(0.08, dz))
    O['pelvis'].location = RESTLOC['pelvis'].copy()
    O['pelvis'].location.y -= dz
    vl.update()
    for bone, child, a, b in CHAIN:
        d = H @ Rs.inverted() @ (P[b] - P[a])
        if os.environ.get('DEBUG') and bone in ('foot_l', 'thigh_l', 'spine_01'):
            print('  tgt', bone, [round(x, 2) for x in d.normalized()], 'Hcols', [[round(x, 2) for x in H.col[i]] for i in range(3)])
        swing(O[bone], child, d)
    return H

def hip_local(P):
    h = P['Hips']
    return {k: P[k] - h for k in P}

def blend_pose(A, B, u):
    La, Lb = hip_local(A), hip_local(B)
    hz = A['Hips'].z * (1 - u) + B['Hips'].z * u
    P = {}
    for k in A:
        P[k] = La[k].lerp(Lb[k], u) + Vector((0, 0, hz))
    return P

def sig(P):
    Rs = src_frame(P)
    acc = []
    for bone, child, a, b in CHAIN:
        d = Rs.inverted() @ (P[b] - P[a])
        if d.length > 1e-6:
            acc.append(d.normalized())
    return acc

def pose_err(A, B):
    a, b = sig(A), sig(B)
    return sum((x - y).length for x, y in zip(a, b)) / len(a)

def bake(frames, name, Rs0, hip_z0):
    # longest slice whose ends match, so the cycle can loop. Prefer ~1.2–3.2s.
    def activity(sl):
        lz = [P['LeftFoot'].z for P in sl]
        rz = [P['RightFoot'].z for P in sl]
        return (max(lz) - min(lz)) + (max(rz) - min(rz))
    best = None
    for i in range(0, len(frames) - 70, 2):
        for j in range(i + 70, len(frames), 2):
            dur = (j - i) / 60
            if dur < 1.3 or dur > 3.2:
                continue
            err = pose_err(frames[i], frames[j])
            act = activity(frames[i:j + 1])
            # closed pose first, then foot clearance. Drop only a badly open seam.
            if err > 0.4:
                continue
            score = err * 1.6 - act * 0.45
            if best is None or score < best[0]:
                best = (score, err, i, j, act)
    if best is None:
        # no closed window: take the closest seam that still has some lift
        for i in range(0, len(frames) - 70, 4):
            for j in range(i + 80, len(frames), 4):
                err = pose_err(frames[i], frames[j])
                act = activity(frames[i:j + 1])
                score = err * 1.6 - act * 0.45
                if best is None or score < best[0]:
                    best = (score, err, i, j, act)
    score, err, i0, i1, act = best
    use = frames[i0:i1 + 1]
    print(name, 'slice', i0, i1, 'loop_err', round(err, 4), 'dur', round((i1 - i0) / 60, 3), 'footTravelZ', round(act, 3))
    # foot spread in the slice, hip-local, to tell a straight dribble from a crossover
    xs_l, xs_r, zs = [], [], []
    for P in use:
        L, R = hip_local(P), None
        xs_l.append(L['LeftFoot'].x)
        xs_r.append(L['RightFoot'].x)
        zs.append(max(P['LeftFoot'].z, P['RightFoot'].z) - min(P['LeftFoot'].z, P['RightFoot'].z))
    print(name, 'footX L', round(min(xs_l), 2), round(max(xs_l), 2), 'R', round(min(xs_r), 2), round(max(xs_r), 2), 'lift', round(max(zs), 2))
    N = len(use)
    blend = 8
    for i in range(N):
        P = use[i]
        if i >= N - blend:
            u = (i - (N - blend) + 1) / blend
            P = blend_pose(use[i], use[0], u * u)
        pose_frame(P, Rs0, hip_z0)
        for o in O:
            o.keyframe_insert('rotation_quaternion', frame=i)
        O['pelvis'].keyframe_insert('location', frame=i)
    for o in O:
        ad = o.animation_data
        if not ad or not ad.action:
            continue
        act = ad.action
        act.name = name + '_' + o.name
        # linear keys
        for fc in act.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = 'LINEAR'
        tr = ad.nla_tracks.new()
        tr.name = name
        tr.strips.new(name, 0, act)
        ad.action = None
        ad.use_nla = False
    return N

scores = []
baked = []
for clip in CLIPS:
    frames = sample_clip(os.path.join(SRC, clip + '.fbx'))
    Rs0 = src_frame(frames[0])
    # hip height reference: median of the clip so bob is around the rig's rest, not the actor's absolute height
    zs = sorted(P['Hips'].z for P in frames)
    hip_z0 = zs[len(zs) // 2]
    # quick pose check at a high-knee frame
    best_f, best_z = 0, -1
    for i, P in enumerate(frames):
        z = max(P['LeftFoot'].z, P['RightFoot'].z)
        if z > best_z:
            best_z, best_f = z, i
    # rest facing: toes point along -Y. Capture bone axes before the pose.
    reset()
    def axes(n):
        M = O[n].matrix_world.to_3x3()
        return [Vector(c).normalized() for c in M.col]
    rest_axes = {n: axes(n) for n in ('pelvis', 'spine_02', 'thigh_l', 'Head')}
    rest_toe = (W('ball_l') - W('foot_l')).normalized()
    pose_frame(frames[best_f], Rs0, hip_z0)
    fl, fr = W('foot_l'), W('foot_r')
    hl = W('hand_l')
    toe = (W('ball_l') - W('foot_l'))
    print(clip, 'check footL', [round(x, 3) for x in fl], 'footR', [round(x, 3) for x in fr], 'handL', [round(x, 3) for x in hl], 'pelvis', [round(x, 3) for x in W('pelvis')], 'headZ', round(W('Head').z, 3))
    print('  toe', [round(x, 2) for x in toe], 'dot restToe', round(toe.normalized().dot(rest_toe), 2))
    for n in rest_axes:
        A = axes(n)
        dots = [round(A[i].dot(rest_axes[n][i]), 2) for i in range(3)]
        print('  axisdot', n, dots, 'posedX', [round(x, 2) for x in A[0]], 'posedY', [round(x, 2) for x in A[1]], 'posedZ', [round(x, 2) for x in A[2]])
    reset()
    n = bake(frames, 'Dribble_' + clip[:2], Rs0, hip_z0)
    baked.append((clip, n))

reset()
sc = bpy.context.scene
sc.render.fps = 60
sc.frame_start = 0
sc.frame_end = max(n for _, n in baked) - 1
for o in O:
    if o.animation_data:
        o.animation_data.use_nla = True
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    export_animation_mode='NLA_TRACKS',
    export_force_sampling=True,
    export_frame_range=False,
    export_def_bones=False,
    export_skins=False,
    export_morph=False,
)
print('EXPORT', OUT, os.path.getsize(OUT))
