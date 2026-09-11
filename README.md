# Gaatavisuple Sakartvelo

Two acts:

| | |
|---|---|
| **Act 1** | *Gaatavisuple Achara* — the coast, ending with Aslan's helicopter |
| **Act 2** | *Gaatavisuple Parlamenti* — Rustaveli Avenue, November 2003, ending with the tea |


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
| `X` / `F` | Throw a rose |
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
| **Acharuli khachapuri** (Act 1) | 7s invincibility: touching an enemy destroys it for 400 with the combo multiplier. Also immunity to the distraction. The boss is exempt — he is only ever damaged by a stomp in his vulnerable window. A gold HUD bar counts it down and the sprite flickers for the last 1.6s. |
| **White powder** | Double jump for 18 seconds, then it wears off (`POWDER_TIME`). Placed ahead of every boss so a death is never a walk back in without it. |
| **Ultra white powder** (Act 1) | **One** charge, no clock. The next jump off the ground launches at `ultraJumpVel` and raises the air speed cap to `ultraAirMax` until he lands, and `jumpCut` does not apply. It only exists to cross the blown bridge — see *The bridge*. Only the first one scores. |
| **Hot tea** (Act 2) | Act 2's version of the same 9s invincibility. |
| **Rose** | Heals a heart. At full health it grants a **temporary 4th heart** instead (22s, up to 2 stacked, pink in the HUD). Temporary hearts are spent before real ones and wither one at a time. |

The second jump is a flat velocity set, not an add, so hammering it mid-rise
cannot stack into an arbitrarily high launch — measured at 55px when spammed
versus 119px used properly.

**Jump apex is 70px single, 119px with powder, 122px with the ultra.** It was 61.8px, and a block four
tiles up needs a 64px rise — so six surfaces in the level, including a `?` block
and the first mid boss's own platform, missed by 2.2px and simply could not be
reached.

## Music

`assets/music.m4a` (AAC, about a third the size of the original mp3), looping at
0.4 volume. It starts on the keypress that
leaves the title screen, never at load: browsers refuse audio until a real user
gesture, so a `play()` on page load just throws and leaves the track silently
dead.

## Tile art

Three things were rebuilt after the brick/`?`/pipe cluster read badly against
the photographic backdrops:

- **Pipes are shaded across the whole pipe, not per tile.** Every tile used to
  draw its own highlight at `+2` and its own shadow at `+13`, so a two-tile pipe
  came out `light|dark|light|dark` — it read as two thin pipes shoved together
  rather than one round one. Which half a tile is gets read off its neighbours,
  and the cap only overhangs on the pipe's actual outer edges. Note this merges
  two pipes placed in adjacent columns into one wide one; nothing in either act
  does that, and the check is in the test sweep.
- **The `?` block pulses with a glint, not a full recolour.** Swapping the whole
  face to `qLite` washed it out to a pale cream square once a second and took
  the glyph with it — caught mid-blink it read as a blank tile with a smudge.
  The glyph is now embossed with a light offset underneath.
- **Bricks get a dark rim on the outside of a run.** Without it the masonry
  dissolved into the backdrop and a platform stopped reading as something you
  could stand on. Outer faces only, so a run still looks like one wall.

The pipe green also came down off pure saturation (`#28b028` → `#2f9e34`). At
full saturation it shouted over the photographic backdrop instead of sitting
on it.


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

Touching a pole changes it to the **five-cross flag** adopted in 2004, worth
300. `game.flagsConverted` counts them. What it changes *from* is per-act, via
`LEVEL.oldFlag`:

- **Act 1** (`oldFlag: 'achara'`) flies **Adjara's own flag** — navy field,
  seven yellow seven-pointed stars in the upper hoist, three over four.
- **Act 2** (no `oldFlag`) flies the **old republic flag** (dark crimson,
  black-over-white canton — 1918–1921 and 1990–2004).

The Achara flag is hand-drawn rather than sampled from `assets/flag-achara.png`.
The stars are 0.6% of that image's pixels, so area-averaging it down to the
15×10 the flags are drawn at makes them vanish entirely and it comes out a plain
navy rectangle. The star centres and the 3-over-4 lattice are taken from the
real thing; only the spacing is opened from 1px to 2px, because at 1px the two
rows merge into a pair of solid bars.

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
  pits. Verified: jump apex is 69.5px, walking reach 87px, and the level's
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

Jump apex is **69.5px measured**, not the 72.4px that `jumpVel² / (2 × gravity)`
predicts — the integrator is semi-implicit Euler, so the closed form overshoots.
On a stuttering frame (dt clamped to 1/30) it drops to 66.6px, leaving only
2.6px over a 4-tile 64px rise. Measure, don't compute. If you raise pipe or
platform heights,
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


## Act cards

Each act opens on a typed card over its own backdrop — the act is loaded first,
so the text sits on the scenery you are about to play. `LEVEL.card` supplies the
lines; an act without one falls straight through to play.

| Act | |
|---|---|
| 1 | ADJARA WAS USURPED / BY SEPARATISTS / **2004:** |
| 2 | BUT EVERYTHING STARTED / WITH ROSES.... / **2003 NOVEMBER:** |

Prose at scale 1, the date alone at scale 2. The font is fixed-width uppercase
5x7 on a 320px screen, so lines have to be broken by hand — "BUT EVERYTHING
STARTED WITH ROSES...." is 234px at scale 2 and does not fit with any margin.
`validateLevel` measures every card line and warns if one is wider than the
screen.

This used to be one global `CARD_LINES` tuned to Act 2, with the act number
hard-coded into the footer.


## Act 2

Opens on a typed card — "BUT EVERYTHING STARTED / WITH ROSES...." then
"2003 NOVEMBER:" — over Act 2's own backdrop, which is loaded before the card
draws. Score carries across acts; hearts reset.

Three backdrop zones (`LEVEL.backdrops`), each clipped to its own world span so
the change happens at a fixed column rather than snapping across the screen.
Two tile-and-mirror; the Parliament does not, because a building is not
wallpaper. An untiled zone must satisfy `artW >= VIEW_W + drift`, where drift is
`(camMax - camAtEntry) * par` — at level 1's 0.34 the arena would need 516px of
its 525 and skate the edge, so it runs at 0.15 and reads as planted.

| Boss | |
|---|---|
| **Guard** | Cordon, not a Goomba. Walking into one breaks the nearby line into a short charge. One stomp. |
| **Sleepy** | Asleep on his feet. Noise only accrues while you are on the ground AND moving near him, so the answer is to jump the whole approach. Asleep he is harmless and stompable; awake he cannot be touched. A hit wakes him. |
| **Svani Edika** | Five hits across three stages. Stage 2 adds a floor slam whose wave you jump; stage 3 chains stun straight back into wind-up. He hunts, so backing away does not stall the fight. |
| **Bomber** | Armoured — stomping him does nothing. His own bombs are the only thing that hurt him, and you punt a live one back by stomping it. |
| **Dardubala** | Four hits, and he changes form with every one: **man → fox → man → two foxes.** As a man he holds the top step and slams, and the waves run along the **floor**, so the fight is about climbing to him during the window after a slam. As a fox he is fast, charges and leaps, and the window is after a pounce — drawn from real art, **running** (`l2_fox_run.png`) while he hunts and **sitting** (`l2_fox_sit.png`, gold-tinted) during the open window, so the beat you can hit is readable at a glance. On the last hit a second fox joins him — only one is really him; the other is drawn as a translucent blue **phantom** with a `?` over it and pops when stomped. It used to be the same sprite under a 30% blue wash, which at this size was invisible: the two were indistinguishable and picking the real one was a coin flip. It also used to **outlive him** — the phantom went on hunting and leaping over the hero through the entire tea outro and the win screen behind it, which read as "I killed him and the thing is still after me". It now drops the instant he does. Never chases, never dives: deliberately not the Act 1 boss reskinned. Emits deadpan stage directions instead of dialogue, and goes out shouting SAXLSHIIIIIIII. Slams also shake masonry down onto **his own step**, because once you had climbed up there nothing could reach you. The falling chunks paint their landing spot before they arrive — the first pass dropped four of them from 46px up, which is 0.3s of warning and a coin flip rather than a dodge, and a pilot that used to survive the whole fight died in six seconds without landing a hit. |

Every one of those was found broken by testing and fixed: Sleepy's hearing
range equalled the jump reach so the intended approach was impossible; Svani
only charged from close range so a retreating player deadlocked him and he
walked into pits; Dardubala's waves swept his own platform, punishing the one
surface you had to stand on. Bosses are leashed to their ground span, because
a gate holder that falls in a pit opens its gate by dying — the fight "won" by
watching it commit suicide.

`bossGrade` marks anything a khachapuri must not delete. The exemption used to
be `instanceof FlyingBoss`, so invincibility one-shot every Act 2 boss.


## Dying

Restarts the act you died in, holding the score you entered it with. Sending a
player back to Act 1 for failing in Act 2 makes them replay ten minutes they
had already cleared.

## Backdrop handovers

Zones do not butt against each other at a hard edge — a vertical cut through a
street elevation slices buildings in half and is glaring. Each zone is drawn
full width and the incoming one dissolves in through an ordered-dither mask
over 12 tiles of travel (`DISSOLVE_TILES`), which is invisible in motion and
the period-correct way to do it. Masks are built once and composited with
`destination-in`, so a handover costs two canvas ops per frame and only while
it is happening.


## Testing an act directly

`?act=2` boots straight into that act instead of replaying everything before
it — <http://localhost:8123/?act=2>. Clamped, so a junk value is harmless.


## Edika has no drawn forelock, on purpose

The white tuft in his art is about 20px inside a 223px image, so downscaling to
a 21px sprite averages it against its own black outline and it disappears —
zero white pixels survive at render size, and only 19 even at a 64px height.
Hand-placing one was tried and removed: at this scale it read as a paper hat
sitting on his skull rather than as hair. If the forelock is wanted back, the
fix is a sprite edit that thickens it in the source, not pixels drawn on top.


## Throwing roses

Roughly every third `?` block holds three roses instead of a coin — keyed off
the tile rather than randomly, so a block that paid out ammo last run still
does. `X` throws one; it arcs about 140px and **staggers** whatever it hits for
1.7s (1.2s on a boss).

The HUD shows `ROSES Xn`, and `PRESS X TO THROW` blinks under it until you
actually throw your first one, then never again.

It does not kill. That is the point: every fight in the game resolved as *wait
for the opening and land on his head*, and one ranged verb lets you **open** a
window instead of waiting for one — thin a guard cordon from range, interrupt a
charge, or buy a safe approach. Stun is handled centrally in the update loop
rather than per class, so a stunned enemy is frozen, harmless and stompable
without any boss knowing the mechanic exists.

## The crowd

Every flagpole you convert brings two more people out. They trail a few tiles
behind, and once four have joined they **surge** on their own every five
seconds, flooring any guard near them. Bosses are immune — the street can shift
a cordon, not a minister.

They are pressure, not units: no controls, no collision, and they never block
you. `LEVEL.crowd` turns them on — **Act 2 only**. Act 1 walks it alone, which
is the point of Act 1: the street has not come out yet.

`CROWD_PROPS` says what each marcher is holding, by draw index — three **little
red flags** on sticks, three **roses**, two pairs of empty hands, across the
eight that get drawn. It is keyed off the index rather than rolled, so a prop
never flickers in and out between frames. Props are drawn out to the right of
the head, and the crowd is painted right to left at 9px spacing, so a raised
flag is never overpainted by the neighbour standing behind it.

**Gate holders are exempt from the surge**, alongside bosses: it must never be
able to walk you past a required fight. Act 2's gate holders all carry
`bossGrade` anyway, but `MidBoss` does not — and must not be given one, it would
halve his thrown-rose stun and make him immune to the khachapuri one-shot — so
the filter keys off `e.gate != null`, the thing that actually matters. This was
found the hard way: with the crowd briefly enabled in Act 1 it froze all three
of them for 1.4s every 5s and made the act nearly free.


## Phones

It renders on a phone and cannot be played on one: every control is a key and
there is not a single touch handler in the file, so a tap does nothing and the
title screen is where it ends. Rather than leave people poking at "PRESS SPACE
TO START", the title detects the case and says so.

The check is `(pointer: coarse)` **and not** `(any-pointer: fine)` — a
touchscreen laptop has a trackpad, reports a fine pointer, and is correctly left
alone. It is evaluated once at load, because the title draws every frame.
Nothing is gated on it: pair a Bluetooth keyboard and the game plays normally.

`index.html` also carries a `viewport` meta. Without it a phone lays the page
out at a fake 980px desktop width and zooms out, which made even the notice
unreadable. With it, landscape fills 82% of the screen at ~2 real pixels per
game pixel; portrait is a 26% letterboxed strip.

Adding real touch controls would be small — input is already abstracted behind
`Input.down(code)` / `Input.justDown(code)` reading a `Set` of key codes, so
buttons could push the same codes with no change to any game logic. The reason
it has not been done is playability, not plumbing: the hard beats want three
fingers at once (hold right, hold sprint, time the jump), and the tight windows
— the fifteen-tile crossing, Edika's 1.05–1.9s openings — are exactly what a
touch d-pad is worst at.


## The bridge (Act 1)

Tiles 179–192 used to be a four-tile pit. 179–194 is now a **fifteen-tile
ravine** spanned by a `T.BRIDGE` deck laid flush with the ground either side, so
it reads as a road rather than a platform to climb.

**Why fifteen and not thirteen.** Thirteen looked correct at 60fps — the powder
double jump peaked one pixel short of the far lip. But `dt` is capped at 1/30,
and at 30fps that same jump lands cleanly on the lip and skips the entire set
piece. Sweeping every launch frame at 60/50/30fps:

| gap | plain | powder | ultra (held) | ultra (tapped) |
|---|---|---|---|---|
| 13 tiles | no | **yes at 30fps** | yes | yes |
| **15 tiles** | **no** | **no** | **yes** | **yes** |
| 17 tiles | no | no | no | no |

Fifteen is the only width where the powder fails and the ultra succeeds at every
frame rate, and it sits two tiles clear of both edges.

Stepping onto the deck sets it off — the trigger is *contact* (`p.onGround` and
the tile under him is `T.BRIDGE`), not an x line. An x line could be tripped in
mid-air by a jump that cleared the whole span, dropping the bridge under nobody
and stranding the pickup behind you.

The deck then goes **from the far end back toward you** over 0.9s
(`BRIDGE_FALL`), dropping decorative `Plank`s — deliberately kept out of
`game.hazards`, because the collapse is a thing you are made to watch, not a
thing that hits you.

**The front stops at your feet.** It never takes the plank you are standing on
or anything to the left of it, so the way back is always still there and the
collapse follows you out instead of racing you. Stand perfectly still and it
halts one tile short and waits, forever. Measured: releasing forward when it
blows and backing off survives at every reaction time from 0s to 2s. Keep
*holding* right and you walk into the part that has already gone — that is a
fall you chose, and it costs one heart.

Sparing only the single tile underfoot was not enough: the front then ate the
tile you were about to step onto, so a 0.6s reaction — an ordinary human beat —
still cost a heart with nothing you could have done.

Then the **ultra white powder** drops on the near lip, and it is the only way
over. Apex is 122px; the crossing lands around tile 194.

A pure vertical mega-jump was the wrong shape: to carry fifteen tiles on hang
time alone it would have to rise fifteen tiles, which is taller than the level.
The horizontal surge (`ultraAirMax`) is what crosses the gap; the big rise
(`ultraJumpVel`) is what sells it. `-470` is already at the camera ceiling — the
view only clamps 120px above his head — so any extra range has to come from the
speed cap, not the height.

`jumpCut` is **exempt** during an ultra flight. It is the one jump the game
requires you to make, and with the cut applied a tapped launch landed 92px short
every time.

The pipe that used to sit at 176 was moved back to 165. At 176 it was a wall one
tile short of the ravine — you cleared it, landed on the single tile at 178 and
were already over the edge, with no ground to build up the speed the crossing
needs.

**No softlock.** While the bridge is down, if you are on the near side, on the
ground, with no charge and no ultra powder in the level, another one drops.
`respawnSpot` always resolves a ravine fall to the near span, so there is no
far-side stranding case. A bad jump costs a heart, never the run.

**The re-drop is not worth points.** `bridgeRun.update` runs before
`resolveItems`, so a respawned pickup is collected the frame it appears on the
lip you are already standing on — scoring every one turned "jump in place" into
475 points a second on the leaderboard. Only the first drop pays.

Two things the widened ravine broke, and how they are fixed:

- `MidBoss` was the **only gate holder never leashed**. His last-hit leap
  carries 5.3 tiles and the ledge turn is suppressed mid-leap, so he could jump
  off the 194 lip, fall out of the world, and hand you gate 206 for free. He now
  gets `spanAround` + `leash` like every other gate holder.
- `shadowUnder` used `groundYAt`, which returns a row-13 fallback for an empty
  column — it painted a shadow in mid-air the whole way across, reading as an
  invisible floor. It uses `groundBelow` and bails on `null`. The crowd had the
  same bug and the same fix; over Act 2's four-tile pits neither was visible.


## Damage order

Every path that costs health goes through `Player.spendHeart()`, so a
**temporary rose heart is always what breaks first**. That used to live inline
in `hurt()`, which meant `fellInPit()` — a second, separate damage path — took
a real heart straight off the top while rose hearts sat there untouched.
Verified against contact, pit falls, bomb blasts and shockwaves.

## Invincibility versus bosses

Stomping a boss's own open window is still the fast way to hurt him, but while
invincible the **contact itself wears him down** — one point every
`INV_BOSS_CD` (3s), so a 7s pickup is worth about three hits rather than a
health bar. Svani goes 5→2, Edika 4→1. There are only two pickups per act now,
down from four.

`takeHit` refuses to run at zero: Edika is never flagged dead — his defeat
hands off to the tea outro — so without that guard the contact path kept
chipping him and drove his bar negative.
