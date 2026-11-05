# Fire Rush — Credits & Licenses

Fan-made game themed on Chicago Fire FC club colors. Not affiliated with or endorsed by Chicago Fire FC or MLS. No official crest, logos, or real player likenesses are used; the flame shield emblem is drawn procedurally in code (main.js `drawEmblem`).

| Asset | File | Author | License | Source |
|---|---|---|---|---|
| Hero/rival body (Superhero_Male base character, textures downscaled to 1024px JPG) | assets/hero.glb | Quaternius — Universal Base Characters [Standard] | CC0 1.0 | https://quaternius.itch.io/universal-base-characters |
| Hairstyle (Hair_SimpleParted) | assets/hair.glb | Quaternius — Universal Base Characters [Standard] | CC0 1.0 | https://quaternius.itch.io/universal-base-characters |
| Animations (Idle, Jog, Jump Start/Loop/Land, Roll, Death, Dance; same humanoid rig, finger/scale tracks stripped) | assets/anims.glb | Quaternius — Universal Animation Library [Standard] | CC0 1.0 (assets/UAL-LICENSE.txt) | https://quaternius.itch.io/universal-animation-library |
| Dribble run, retargeted onto the Quaternius rig (takes 01–03; the base run is 01). Original FBX pack is not included. | assets/dribble.glb | Anderson Rohr — Free Soccer Mocap Pack 05 | Free for personal and commercial use. Attribution optional. Do not redistribute the original pack. | https://andersonrohr.gumroad.com/l/mocap_pack5 |
| three.js r187 + GLTFLoader, SkeletonUtils, BufferGeometryUtils | vendor/ | three.js authors | MIT (vendor/THREE-LICENSE) | https://github.com/mrdoob/three.js |

Kit (red shirt, white collar/sleeve trim, white "10", navy shorts, red/white socks, dark boots) is painted at runtime by a shader in main.js — no third-party art.

Game audio (ball thud, dodge whoosh, rating stings, Fire) is synthesized in `main.js` with the Web Audio API. No samples, no third-party audio. A mute control is always available. Playback starts from the tap that begins a run, because iOS Safari will not start audio without a user gesture.

Skill-body curves in `fc27-body.js` are a scaled reading of monocular pose estimates from public tutorial footage. They are not EA animation, not a player likeness, and no footage or club art is included. Low-confidence frames are dropped. The ball stays on the game's own contact solver.

## Skill-move animations (lane changes)

All seven skill moves (Roulette, Ronaldo Chop, Elastico, Step-over/Half Scissor, La Croqueta, Rainbow Flick, Heel-to-Heel) are **hand-authored keyframes in main.js** (`MOVES`). The working foot is pulled toward curves in `fc27-body.js` during the contact. The upper body still comes from the hand-authored clips. No EA animation and no footage are included.

The straight-line dribble is Anderson Rohr's Free Soccer Mocap Pack 05, retargeted onto this rig (`tools-mocap/retarget_rohr.py`) and shipped only as `assets/dribble.glb`. Take 01 is the base run (a close repeating dribble). Take 02 is a longer lunge and take 03 is a wide stance; both stay in the file as `?run=d2` and `?run=d3`. `?run=jog` is the stock Quaternius jog. `?run=proc` is the earlier procedural stride.

Free motion sources reviewed (Nov 2026) and not used for the skill moves:
- CMU Graphics Lab Motion Capture Database (free, no restrictions; http://mocap.cs.cmu.edu, BVH by cgspeed) — only soccer *kicks* (subjects 10/11), no dribbling skill moves.
- Quaternius Universal Animation Library — no kick/soccer clips.
- Mixamo — requires Adobe login (not usable headless); no recognized skill-move clips, and Adobe terms restrict redistribution of raw files.
- Wikimedia Commons "Elastico soccer.theora.ogv" (public domain video) — reference only (video, not mocap).
