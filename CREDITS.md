# Fire Rush — Credits & Licenses

Fan-made game themed on Chicago Fire FC club colors. Not affiliated with or endorsed by Chicago Fire FC or MLS. No official crest, logos, or real player likenesses are used; the flame shield emblem is drawn procedurally in code (main.js `drawEmblem`).

| Asset | File | Author | License | Source |
|---|---|---|---|---|
| Hero/rival body (Superhero_Male base character, textures downscaled to 1024px JPG) | assets/hero.glb | Quaternius — Universal Base Characters [Standard] | CC0 1.0 | https://quaternius.itch.io/universal-base-characters |
| Hairstyle (Hair_SimpleParted) | assets/hair.glb | Quaternius — Universal Base Characters [Standard] | CC0 1.0 | https://quaternius.itch.io/universal-base-characters |
| Animations (Idle, Jog, Jump Start/Loop/Land, Roll, Death, Dance; same humanoid rig, finger/scale tracks stripped) | assets/anims.glb | Quaternius — Universal Animation Library [Standard] | CC0 1.0 (assets/UAL-LICENSE.txt) | https://quaternius.itch.io/universal-animation-library |
| three.js r187 + GLTFLoader, SkeletonUtils, BufferGeometryUtils | vendor/ | three.js authors | MIT (vendor/THREE-LICENSE) | https://github.com/mrdoob/three.js |

Kit (red shirt, white collar/sleeve trim, white "10", navy shorts, red/white socks, dark boots) is painted at runtime by a shader in main.js — no third-party art.

The jog's cadence, stride, and planted foot are adjusted in code so the foot stays with the grass. Transitions use a dead blend (the new clip plays immediately and the previous pose fades) instead of a crossfade. No Epic Games or Game Animation Sample assets are used.

## Lane change

Every lane change is the sole roll-over. The upper body is the retargeted clip already in `assets/rollover.glb` (in the repo since v10). The seven skill moves and their clips (chop, step-over, roulette, elastico, croqueta, heel-to-heel, rainbow) are not used. The run stays the CC0 Quaternius jog.

The penalty strike (`assets/penalty.glb`) and the goalkeeper set (`assets/keeper.glb`: idle, dive left, dive right, catch, scoop, plus an unused fist-pump) are Mixamo clips — Penalty Kick, Goalkeeper Idle, Goalkeeper Diving Save Left/Right, Goalkeeper Catch, Goalkeeper Scoop, Fist Pump — retargeted onto this UAL rig in Blender the same way as the roll-over (bone-direction swing, pelvis root motion kept). The raw FBX files are not in the repo. Mixamo animations are used here at the project owner's request; Adobe's terms restrict redistribution of the unmodified files.

Free motion sources reviewed (Nov 2026) and not used:
- CMU Graphics Lab Motion Capture Database (free, no restrictions; http://mocap.cs.cmu.edu, BVH by cgspeed) — only soccer *kicks* (subjects 10/11), no dribbling skill moves.
- Anderson Rohr "Free mocap pack 05: Soccer" (gumroad; free incl. commercial, no redistribution as standalone pack) — dribbles/juggles/kicks only, no skill moves; Rokoko/UE5 skeleton.
- Quaternius Universal Animation Library — no kick/soccer clips.
- Mixamo — requires Adobe login (not usable headless); no recognized skill-move clips, and Adobe terms restrict redistribution of raw files.
- Wikimedia Commons "Elastico soccer.theora.ogv" (public domain video) — reference only (video, not mocap).
