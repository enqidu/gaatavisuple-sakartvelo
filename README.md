# Misha Mode — *Gaatavisuple Achara*

An 8-bit side-scrolling platformer built for screen recording. No dependencies,
no build step.

## Run

```bash
node mario-mode/serve.js
```

Then open <http://localhost:8123>.

It must be served over HTTP, not opened as a `file://` path — the sprite
background key-out reads canvas pixels, which browsers block on file origins.

## Controls

| Key | Action |
|---|---|
| `←` `→` / `A` `D` | Move |
| `Space` / `W` / `↑` | Jump (hold longer = higher) |
| `Shift` | Sprint |
| `R` | Restart |
| `H` | Toggle HUD — turn it off for clean footage |
| `C` | Toggle CRT scanlines |
| `M` | Mute **music** |
| `N` | Mute **sound effects** |
| `B` | Hitbox overlay |

Music and effects mute separately — the track is the loud one, and wanting it
off is not the same as wanting the coin blips off.

## Pickups

Named on-screen on two lines, because "ACHARULI KHACHAPURI" on one line is
114px wide and the whole screen is 320.

| | |
|---|---|
| **Acharuli khachapuri** | 9s invincibility: touching an enemy destroys it for 400 with the combo multiplier. Also immunity to the distraction. The boss is exempt — he is only ever damaged by a stomp in his vulnerable window. A gold HUD bar counts it down and the sprite flickers for the last 1.6s. |
| **White powder** | Double jump for 18 seconds, then it wears off (`POWDER_TIME`). Placed ahead of every boss so a death is never a walk back in without it. |
| **Rose** | Heals a heart, or 500 points at full health. |

The second jump is a flat velocity set, not an add, so hammering it mid-rise
cannot stack into an arbitrarily high launch — measured at 55px when spammed
versus 119px used properly.

**Jump apex is 70px single, 119px with powder.** It was 61.8px, and a block four
tiles up needs a 64px rise — so six surfaces in the level, including a `?` block
and the first mid boss's own platform, missed by 2.2px and simply could not be
reached.

## Music

`assets/music.m4a` (AAC, about a third the size of the original mp3), looping at
0.4 volume. It starts on the keypress that
leaves the title screen, never at load: browsers refuse audio until a real user
gesture, so a `play()` on page load just throws and leaves the track silently
dead.

## Why it looks 8-bit

The whole game renders into a **320×180 buffer** that is scaled up 4× with
nearest-neighbour sampling. Everything else follows from that:

- No gradients. Sky is flat colour bands joined with an ordered dither.
- No sprite rotation — 8-bit hardware couldn't rotate sprites, and at this
  resolution a rotated blit is mud. Motion is 1px bob plus squash/stretch.
- All draw positions are rounded to whole buffer pixels, so nothing shimmers.
- Particles are 1–3px squares with 2-step alpha, not smooth fades.
- Text is a hand-built 5×7 bitmap font, because any anti-aliased glyph turns
  to porridge when scaled 4×.
- Optional CRT scanline overlay on top of the upscale.

If you want it chunkier or finer, change `SCALE` and `VIEW_W`/`VIEW_H` at the
top of `game.js`. Keep `VIEW_W * SCALE = 1280` so it stays pixel-exact.

## Adding your art

Drop five PNGs into `assets/`:

| File | Role |
|---|---|
| `hero.png` | Player character |
| `walker.png` | Basic enemy — one stomp kills |
| `mid.png` | Mid boss — three stomps, charges when you get close |
| `boss.png` | Flying boss — stalks you, then fights in the arena |
| `death.png` | Death pose — hops up and falls off the bottom of the screen |
| `lady.png` | The distraction hazard (see below) |
| `powder.png` | Grants a double jump (see below) |
| `bg.png` | Parallax backdrop (scrolls at 0.34×, mirrored so it tiles seamlessly) |

Anything missing falls back to a generated placeholder, so the game always runs.

You do **not** need to prepare the images. On load each one is:

1. **Background-keyed.** The background colour is *sampled from the image
   border*, then flood-filled inward. Sampling rather than assuming white is
   what lets a blue-backed sprite and a white-backed one load through the same
   path. Flood fill rather than a global colour match is what preserves that
   same colour *inside* the art — a white shirt on white, a blue tie on blue.
2. **Auto-cropped** to the content bounding box, so a character floating in a
   large empty canvas still renders at full size.
3. **Downscaled once, at load**, to its final on-screen size, so the game loop
   blits 1:1 and pixels stay crisp.

A border flood fill alone isn't enough, because background walled in by artwork
is unreachable from the edge — the gap between the dog-walker and his dogs, the
triangles inside the leashes. Those survived as blue blobs welded to the sprite.
So there's a second pass over **enclosed** pockets, and it decides by size:
a large enclosed pocket is background the fill couldn't reach, a small one is
intentional detail. That distinction is what lets a white shirt on a white
background and eye whites survive while the blue between the dogs does not.

Two knobs in `keyOutAndTrim`:

- `tol` — RGB distance that counts as background. Deliberately tight (44),
  because silver hair sits only ~54 from white and a looser threshold eats it
  wherever the outline has a gap. Raise it if a background survives; lower it
  if part of a character disappears.
- `minHole` — how big an enclosed pocket must be before it's treated as
  background. Currently 0.22% of image area. Lower it if pockets survive;
  raise it if interior detail gets punched out.

## A note on animation

Every character is a **single static frame**, so there is no walk cycle. An
earlier version shifted the whole body 1px up and down while moving, which at 4×
upscale is a 4-pixel jump of the entire sprite several times a second — it read
as vibration, not walking. Real walk cycles move the legs, not the body, so it
was removed; motion now comes from travelling across the screen.

If you supply a second frame per character (`hero2.png`, etc.) a proper
two-frame cycle can go back in — that's the correct fix, not body-bobbing.

Sprite sizes live in the `SPRITES` table at the top of `game.js`. `h` is the
on-screen height in buffer pixels — the tile grid is 16, so `h: 30` is a
character just under two tiles tall. `hitW`/`hitH` set the collision box as a
fraction of the drawn sprite, so the hitbox tracks whatever art you supply.

Both khachapuri and rose are drawn from hand-placed rectangles rather than
image assets — at 320x180 a downscaled photo would be unreadable mush, whereas
14x10 of deliberate pixels reads instantly. Same for the Georgian flags, the
finish flag, the helicopter, and the rose the hero carries.

Placement is in `LEVEL.items` and `LEVEL.flags`, in tile coordinates.

## Progression is gated by kills

Every mid boss holds a full-height gate shut (`gate` in `LEVEL.enemies`), so
none of them can be run past. Killing him drops it. Aslan holds `finalGate`
(226), which is the only way to the flag — so no path to the win screen skips
the fight.

The endgame runs in clean stages, deliberately non-overlapping:

| Tile | |
|---|---|
| 200 | third mid boss |
| 206 | his gate |
| 208 | boss arena begins — Aslan starts diving |
| 210 | pipe, a step to jump from |
| 226 | final gate |
| 231 | flag |

Gates are full height (rows 0–12). A gate standing only a few tiles proud of
the floor would still lose to a 3.9-tile jump taken off a nearby platform.

Each locked gate draws a padlock, what to beat, and an arrow pointing back at
the guard. Unlabelled it is just a metal wall you cannot walk through, with no
hint that it is a lock or that the thing that opens it is behind you.

**Anything that falls out of the world counts as dead**, and a mid boss who does
still opens his gate. A charging mid boss used to ignore ledges entirely and
could run straight into a pit — he holds a gate shut, so that softlocked the run
with no way to open it. He now turns at edges unless mid-leap, and the fall-out
rule is the backstop.

## Pits cost a heart

Falling in takes one heart and puts you back three tiles short of the pit's near
lip. Only the last heart ends the run.

The spot is derived from the ground spans, not from a last-safe-footing sampler.
A sampler fires on a timer, so where it last happened to land drifts with your
speed — sometimes right on the edge, sometimes most of a screen back. Taking the
span that ends before the fall puts you in the same place every time, with room
for a run-up.

## Flags

Poles along the route fly the **old republic flag** (dark crimson, black-over-
white canton — 1918–1921 and 1990–2004). Touching one changes it to the
**five-cross flag** adopted in 2004, worth 300. `game.flagsConverted` counts
them.

## The distraction

His weakness, built as a movement hazard rather than an enemy. Inside her
radius he is dragged toward her and his top speed halves, so a stretch with one
in it has to be crossed with momentum or from above instead of just held-right.
Touching her locks him staring for ~1.1s and wipes the combo. It costs tempo
and score, never health, and a per-character cooldown stops it becoming an
inescapable loop.

Khachapuri makes him immune, which is the joke: the only thing that beats it is
lunch.

`assets/laugh.mp3` plays as you come into her radius — on the rising edge only,
and skipped if the clip is still running from the last one. It runs 5.7s, far
longer than it takes to walk past someone, so restarting it on every approach
would stutter it constantly.

`CHARM.immune` is the number that matters, not `cooldown`. Being charmed pins
him where he stands — which is inside her hitbox — so a per-character cooldown
alone did not stop a loop: it expired while he was still on top of her, and the
slow meant the free window was too short to clear the radius before it fired
again. A soak run spent 64% of its frames charmed. The immunity window runs from
the player, suspends the pull and the slow, and brought that to one charm per
encounter.

## Bumping blocks

Punching a block from underneath kills whatever is standing on it — walkers and
dogs die, the mid boss takes a hit. The enemy has to actually be resting on that
specific tile: x overlap plus a bottom edge within 3px of the tile top.

## The mid boss

Not a patroller with three hit points. A phase machine:

| Phase | |
|---|---|
| **Patrol** | slow, ignores you |
| **Wind-up** | leans back for 0.5s with a `!` overhead. That lean is the tell. |
| **Charge** | fast dash — a **leap** once he is on his last hit |
| **Stun** | 0.9s planted and flashing after a charge or a hit. Your window. |

Every hit escalates him: he gets ~30% faster per point of damage, **releases the
two dogs** on the first hit, and starts leaping on the last. Three stomps, three
different fights.

The dogs are fast, low, and procedurally drawn — the only dog art available is
fused into the mid-boss sprite.

## The boss

He *is* fightable, but only in the beat right after a dive.

1. **Stalk** — hovers above and behind you, matching your speed. Out of reach.
2. **Telegraph** — stops, rears up, flashes a `!`. This is the tell.
3. **Dive** — drops fast at where you were standing.
4. **Grounded** — 1.5s winded on the deck, pulsing gold, `STOMP HIM`. **This is
   the only window in which he takes damage.** Stomping him at any other time
   bounces off with `OUT OF REACH`.
5. **Recover** — back up to stalking.

Three stomps. On the third he runs for the helicopter; when it leaves, the final
gate drops and the flag is yours.

Two things make the window actually usable, both found by testing rather than
by reading the code:

- **He is harmless while grounded** (as is a stunned mid boss). The dive drops
  him right next to you, so with side contact still live, walking in to take
  the free stomp cost more than it gained. A bot playing the window perfectly
  lost all three hearts in eight seconds without landing a hit.
- **The stomp test is lenient against a harmless enemy.** The strict test wants
  your feet in the enemy's top half while still falling; for an enemy standing
  on the floor that band is only `h/2` above the ground, and the player's own
  ground collision runs first and zeroes `vy`. Landing on a grounded boss
  mostly registered as no stomp at all. A harmless enemy cannot punish a miss,
  so there is nothing to exploit by being generous.

Two placement rules that matter:

- **`bossTriggerX` (128)** is where he appears; **`bossArenaX` (196)** is where
  he starts diving. Without that second gate he was beatable at the trigger, and
  since beating him launches his exit — and the exit ends the level — winning
  the fight ended the run halfway through. That was the "boss flew away mid
  game" bug. Now the long stalk stays and the fight is the climax.
- His top speed (210) is deliberately **above** the player's sprint (148). At
  his original 100 he fell behind and left the screen — 468px of drift, 400 of
  480 frames off-camera — which read as him escaping the moment he showed up.

A health bar appears top-centre once he is actually fighting, never during the
stalk, since showing it early implies he is beatable when he is not. An edge
arrow pins him when he is off-screen.

## Win and lose screens

Winning prints **ASLANI GAIQTSA / ACHARA TAVISUPALIA!** — split across two lines
because at scale 2 the full sentence is 408px wide and the buffer is 320.

Reached either by beating the boss or by walking to the flag without doing so.

Dying plays `death.png`: a hop upward, then a fall clean through the level with
collision off, so it reads as leaving the stage rather than landing somewhere.
The GAME OVER overlay is deliberately held back 1.1s so it does not cover the
animation.

## The ending

Beating the boss — or reaching the flag without beating him — triggers
`game.escape()`. The helicopter descends and **lands**, he walks over on his own
feet and climbs in, then it lifts off while "HE GOT AWAY" pops. Timings are in
`updateEscape()`. The aircraft is drawn procedurally out of rectangles.

Two things here were deliberate corrections and should not be undone:

- **No rope, and he never leaves the ground while visible.** The first version
  reeled him up on a line drawn from the helicopter to the top of his sprite.
  On a human figure that silhouette reads as a hanging. Replacing the rope with
  a float still had him drifting upward through the air, so the aircraft now
  lands and he boards it. Once he reaches the door he stops being drawn.
- **The landing pad uses `groundBelow`, not `groundYAt`.** `groundYAt` returns
  the topmost surface in a column, so beside a raised platform it landed the
  helicopter at the platform's height while the player stood on the ground
  below — leaving it hovering in mid-air. `groundBelow` searches downward from
  the player's feet in the pad's own column, and falls back to the player's
  footing when the pad would sit over a pit.

## Editing the level

`LEVEL` in `game.js` is plain data in tile coordinates — no ASCII art to keep
aligned. 240 tiles wide, 15 tall, ground on rows 13–14.

- `ground` — `[from, to)` spans of solid floor. The holes between spans are the
  pits. Verified: jump apex is 62px, walking reach 87px, and the level's
  4-tile (64px) gaps and 3-tile (48px) pipes both clear with margin.
- `blocks` — `{x, y, w, t}` runs, where `t` is `T.BRICK`, `T.QUESTION`, or
  `T.PLATFORM` (one-way: jump up through it, land on top).
- `pipes`, `coinRuns`, `enemies` — same idea, all tile coordinates.
- `bossTriggerX` — tile where the flying boss appears. He never leaves.
- `finishX` — the flag, and the escape trigger.

## Tuning feel

`CFG` holds the whole game feel. The two entries that matter most are the ones
that make a platformer feel fair rather than precise: `coyote` (you can still
jump for 0.1s after walking off a ledge) and `jumpBuffer` (a jump pressed 0.12s
before landing still fires).

Jump apex is `jumpVel² / (2 × gravity)`. If you raise pipe or platform heights,
re-check that number against `(13 - pipe.y) × 16` — the ground surface is row
13, so a pipe at `y: 10` stands 48px proud, not 64.

## High scores

Top 5, with arcade-style three-letter entry after any qualifying run. Stored in
`localStorage` under `mishamode.scores.v1`, so **the board is per-browser** —
GitHub Pages serves static files and there is no server to hold a shared one.
Clearing site data clears the board.

Every storage call is wrapped in try/catch: `localStorage` throws outright in
some private-browsing modes rather than returning null, and `load()` also
filters rows with a non-numeric score so a hand-edited or half-written payload
cannot break the title screen.

To make it global you would need a backend Pages cannot provide — a free tier of
Firebase/Supabase, or a small serverless function — plus some abuse handling,
since a client-side score can be posted by anyone.
