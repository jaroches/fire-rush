# Fire Rush — Credits & Licenses

Fan-made game themed on Chicago Fire FC club colors. Not affiliated with or endorsed by Chicago Fire FC or MLS. No official crest, logos, or real player likenesses are used; the flame shield emblem is drawn procedurally in code (main.js `drawEmblem`).

| Asset | File | Author | License | Source |
|---|---|---|---|---|
| Hero/rival body (Superhero_Male base character, textures downscaled to 1024px JPG) | assets/hero.glb | Quaternius — Universal Base Characters [Standard] | CC0 1.0 | https://quaternius.itch.io/universal-base-characters |
| Hairstyle (Hair_SimpleParted) | assets/hair.glb | Quaternius — Universal Base Characters [Standard] | CC0 1.0 | https://quaternius.itch.io/universal-base-characters |
| Animations (Idle, Jog, Jump Start/Loop/Land, Roll, Death, Dance; same humanoid rig, finger/scale tracks stripped) | assets/anims.glb | Quaternius — Universal Animation Library [Standard] | CC0 1.0 (assets/UAL-LICENSE.txt) | https://quaternius.itch.io/universal-animation-library |
| three.js r187 + GLTFLoader, SkeletonUtils, BufferGeometryUtils | vendor/ | three.js authors | MIT (vendor/THREE-LICENSE) | https://github.com/mrdoob/three.js |

Kit (red shirt, white collar/sleeve trim, white "10", navy shorts, red/white socks, dark boots) is painted at runtime by a shader in main.js — no third-party art.

## Skill-move animations (lane changes)

All seven skill moves (Roulette, Ronaldo Chop, Elastico, Step-over/Half Scissor, La Croqueta, Rainbow Flick, Heel-to-Heel) are **hand-authored keyframes in main.js** (`MOVES`), layered over the CC0 Quaternius jog cycle at runtime. No third-party motion data is used.

Free motion sources reviewed (Nov 2026) and not used:
- CMU Graphics Lab Motion Capture Database (free, no restrictions; http://mocap.cs.cmu.edu, BVH by cgspeed) — only soccer *kicks* (subjects 10/11), no dribbling skill moves.
- Anderson Rohr "Free mocap pack 05: Soccer" (gumroad; free incl. commercial, no redistribution as standalone pack) — dribbles/juggles/kicks only, no skill moves; Rokoko/UE5 skeleton.
- Quaternius Universal Animation Library — no kick/soccer clips.
- Mixamo — requires Adobe login (not usable headless); no recognized skill-move clips, and Adobe terms restrict redistribution of raw files.
- Wikimedia Commons "Elastico soccer.theora.ogv" (public domain video) — reference only (video, not mocap).
