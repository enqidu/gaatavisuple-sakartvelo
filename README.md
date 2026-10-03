# Gaatavisuple Sakartvelo

**▶ Play: <https://enqidu.github.io/gaatavisuple-sakartvelo/>**

An 8-bit side-scrolling platformer about moments in recent Georgian history,
rendered into a 320×180 canvas and built for screen recording. No
dependencies, no build step. The music and the laugh are recordings; the
rest of the sound effects, and the end-credits loop, are synthesised in code
with Web Audio.

| | | |
|---|---|---|
| **Act 1** | *Gaatavisuple Achara* | Batumi, 2004. Aslan, the bridge, the ultra powder. |
| **Act 2** | *Gaatavisuple Media* | The television company, November 2007. |
| **Act 3** | *Gaatavisuple Parlamenti* | Rustaveli Avenue, November 2003, ending with the tea. |

The rest of this file is the development log: what each mechanic does, and
the measurements behind the numbers.

## Run

```bash
node serve.js
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
| **Hot tea** (Act 3) | Act 2's version of the same 9s invincibility. |
| **Jump pose** | `jump.png` is drawn whenever he is airborne and not crouching. Its `hitW`/`hitH` are never read — the collision box only ever comes from `hero` and `squat` — so swapping the art mid-jump cannot change what he collides with. The rose is an overlay rather than part of any pose, so it is repositioned per pose. The hand position is **measured, not guessed**: keying out `jump.png` and finding its skin-coloured blobs puts the raised fist at 0.902 across the sprite and 0.739 of its height up from the feet. Guessing had it two pixels inboard of the fist, which at 4x is very visible. `dw`/`dh` are also measured with the squash actually passed to `drawSprite` — the pose frames draw unsquashed, and sizing them with the walk squash moved the anchor on every airborne frame. |
| **Matsoni** (Act 2) | Act 2's invincibility. A clay bowl, deliberately not the tea cup — each act's pickup should be recognisable from its silhouette alone. |
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
(286), which is the only way to the flag — so no path to the win screen skips
the fight.

The endgame runs in clean stages, deliberately non-overlapping:

| Tile | |
|---|---|
| 260 | third gate boss (Targamadze, round two) |
| 266 | his gate |
| 268 | boss arena begins — Aslan starts diving |
| 270 | pipe, a step to jump from |
| 286 | final gate |
| 291 | flag |

(Every act-1 tile from 144 on moved 60 along when the sea went in — see
**The sea** below. Older notes in this file that quote pre-sea numbers say so.)

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

For one release (Oct 1, `669ed6e`) it was replaced by a synthesised six-"ha"
burst, on the theory that the clip was third-party. That version peaked at
0.069 against the clip's 0.8 and made 0.4s of sound against 5.7s — rendered and
measured — so in play it was effectively silent. The clip is back; the rights
were confirmed.

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

- **`bossTriggerX` (128)** is where he appears; **`bossArenaX` (268)** is where
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
- An enemy spec may carry **`up: true`** — see *Enemies on the second floor*.
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


## What validateLevel checks

Run once at boot, prints to the console. Beyond the original placement rules
(charmers and items clear of pit edges, gates off pit edges) it now also
catches:

- **A brick or `?` with no headroom under it.** It needs at least the player's
  own height of clear space below to be bumped at all. Anything flat on a pipe
  cap is unbumpable, and a `?` there is a pickup nobody can reach. This was
  caught the hard way: moving the pipe back to 165 to give the ravine a run-up
  dropped it under an existing brick row, which bricked up its own `?` block.
- **Coins or items spawned inside solid tiles.** Two coin runs had been nudged
  into the masonry beside them and were silently uncollectable.
- **Card lines wider than the screen** — the font is fixed-width, so breaks are
  hand-placed.
- **Rooms** (`validateRoom`, on each room's own grid): exactly one way in and
  one way out, side walls sealed rows 0–12, an unbroken floor, the way in not
  dropping into a solid tile, and some pipe in some act warping to it.


## Deploying

`index.html` loads the script as `game.js?v=N`. **Bump that number on every push
that touches `game.js`.** GitHub Pages serves the script with a long `max-age`,
so without it a returning player keeps running the previous build and whatever
you just shipped simply is not there — which is indistinguishable from the
feature being broken. `index.html` itself is served with `max-age=600`, so the
new number reaches them within ten minutes and pulls the new script with it.


## The acts

| | | |
|---|---|---|
| 1 | GAATAVISUPLE ACHARA | Batumi, 2004. Aslan, the bridge, the ultra powder. |
| 2 | GAATAVISUPLE MEDIA | The television company, November 2007. Reporters, smashable monitors, the Anchor. |
| 3 | GAATAVISUPLE PARLAMENTI | Rustaveli, 2003. Was act 2 until act 2 was inserted ahead of it. |

**Asset prefixes follow the act number**: `l2_*` is the television company,
`l3_*` is Parliament. When Parliament moved from 2 to 3 its files and sprite
keys were renamed with it rather than left stale — the boot-time placeholder
report is what makes that rename safe to do, since any file it fails to find
shows up there immediately.


## Act 2: the television company

`l3_fox_run.png` was re-extracted from `fox1.png`. The first pass keyed the
checkerboard by colour, but the dark checker grey (126) is the same value as
the fox's own outline, so the flood leaked through gaps in the silhouette and
ate the white *inside* the legs — at 26px tall it came out hollow-legged with a
detached tail, which on Act 3's night backdrop read as no fox at all. The
working recipe is tight bands (205-234 light, 108-148 dark, 150-200 for the
antialiased seams so the flood can cross square boundaries) with the fox's
240+ white deliberately excluded, then keeping only the largest connected
blob to drop the speckle the flood could not reach. Both poses are confirmed
on screen: 998 run frames to 798 sit frames over 30s.

Reporters (`l2girl`, `l2girl2`, `l2man`) walk the building and fire **FREE
SPEECH** at head height. Same `Bullet`, same lane as Edika's shots, so the
crouch taught here is the crouch that keeps you alive against the Anchor at the
end of the act and against Edika an act later. Teaching it on ordinary walkers
first is deliberate. They telegraph with the word rather than a lane marker: at
walker density a dotted line each would be visual soup.

No flagpoles indoors. `LEVEL.smashKind = 'tv'` puts studio monitors along the
route instead — same one-touch-each contract and the same `LevelFlag` path, so
it costs a box and some artwork rather than a parallel array threaded through
reset, update, draw and validate. Live they show a shifting test pattern;
smashed they are cracked and dark, and say OFF AIR.

### Three reporters, three questions

One `Journalist` class, three styles — the walking and stomping are identical
and only the answer to *what does this one do when it sees you* differs.

| | cry | attack | answer |
|---|---|---|---|
| `l2girl` | UNSUPPORTED ACCUSATIONS | shot at head height | **duck** |
| `l2man` | FACTLESS ATTACKS | shot along the floor (`BULLET.lowRide`) | **jump** — ducking is no help |
| `l2girl2` | NO COMMENT? | no projectile: she charges you | **get out of the way** |

What they shout is the joke. You are the one raiding the newsroom, so the
reporting arrives labelled the way a government labels reporting it dislikes —
the projectile's internal kind is `smear`, because that is what the man
swinging at it has decided journalism is.

The low shot rides 9–4px above the feet, which is inside *both* a standing box
and a crouching one. That is deliberate: the same enemy family asks for
opposite inputs depending on who is holding the microphone. Measured with both
pinned: the high shot takes 0 of 4 while ducking and 3 of 3 standing; the low
shot takes 0 of 4 when jumped on cue and 3 of 3 when ducked.

Each telegraphs its own lane at the height it will arrive at, and the charger
gets an arrow instead, because there is no lane — she *is* the projectile.

### The Anchor

The arena is **vertical**, and deliberately not Act 3's. Parliament is a
symmetric three-tier staircase (`196+6@r11 / 200+14@r9 / 214+6@r11`) and this
had been built as the same shape with different art. Now the Anchor owns the
floor and never leaves it — he ignores one-way tiles like every other enemy —
while the news desk and the two lighting gantries above are yours. One camera
is down on his floor in his fire; the other two are up in the rigging, so the
fight is a climb and two descents rather than a staircase.

Heights are chosen so the climb is real: a 69px jump reaches y=139 from the
floor, which clears the desk at 176 but not the gantries. Verified hop by hop —
floor→desk lands, desk→low gantry lands, low→high lands, and floor→gantry
fails back to the floor.

**Deliberately not another timing window.** He is never stompable while he is
broadcasting: three cameras cover the studio, and while any tally light is lit,
landing on him only says ON AIR. The fight is killing the feeds. Timing a
window is the entirety of the Edika fight and would have been the entirety of
this one too.

The health bar counts cameras plus him — 4 — so cutting a feed reads as
progress immediately, and each one lost makes him quicker to answer. With the
last camera gone he loses the room: bolts at nearly triple pace, stops
shooting, and is run down and stomped once. He greets you on arrival, once:
*AND THE GUESTS HAVE ARRIVED...*

Every vulnerable window in the game — Edika's `winded` and `pant` — sets
`vx = 0` outright instead of decaying. Coasting through the one beat you can be
stomped on means asking the player to land on a moving target, which was most
of what made Edika feel uncatchable.


## Music

### Asset sizes — why loading was slow

The page was fetching **13.7MB**. It now fetches **1.6MB**, and none of it
looks different.

Nothing was wrong with the pipeline: decode + key-out + haze across every
sprite measured ~470ms warm. The whole delay was download, and the cause was
assets shipping at whatever resolution they arrived in. `squat.png` was a
1254×1254 PNG — 1.1MB — for a sprite drawn **26 pixels tall**. Two backdrops
were 2.2MB each.

The rule now:

- **`raw: true` backdrops ship at exactly their draw height** (240px, giving
  320 wide). That is native, so it is lossless — the buffer is 320×180 and
  nothing ever samples them larger.
- **Keyed sprites ship at 4× their draw height.** The key-out reads cleaner
  edges at higher resolution and the final downscale still antialiases, but
  beyond 4× every extra pixel is discarded at boot.

Originals live in `assets/_src/` and the two `assets/level N (...)` folders;
the page fetches only what `SPRITES` names.

**When adding art, downscale it first.** A 1254px PNG for a 30px sprite costs a
megabyte of load time and buys nothing.


### The soundtrack

`ChipTune` holds named loops and `LEVEL.music` picks one; anything it does not
recognise falls back to `assets/music.m4a`.

`TRACKS` holds recorded files by name and `TUNES` holds synthesised loops;
`LEVEL.music` names either, and anything unrecognised falls back to `main`.

**All three acts play `assets/music.m4a`, and it restarts with every level** —
entering an act, and restarting one after a death. `Music.cue()` does that from
`reset()`, deliberately *not* from `retune()`: retune fires on any `loadLevel`,
including the boot loop that validates all three acts, and re-cueing there
would fight itself.

**The end credits take the `chase` loop.** `Music.force('chase')` from
`game.win()` when the run is actually over — not on an act that advances — and
`cue()` clears it, so restarting hands the soundtrack straight back to the act.
That is what `forced` is for: a moment outside the levels claiming the music
without pretending to be one.

Unused but kept, in case an act wants its own again: the `dark` synth loop. It
costs nothing at runtime. Any recorded track added to `TRACKS` is served
publicly by the repo and the Pages site, so it has to be one you have the
rights to.

Nothing is fetched until the first `Music.start()`, which only fires on a real
keypress, so no track touches the boot payload. It stays ~1.6MB.

Web Audio has no pulse-width control, so the thin arpeggio pulse is faked by
detuning a second square 0.5% against the first — close enough at this size.



Older note, kept for the detail below: `LEVEL.music = 'dark'` hands over to `DarkTune`, a chiptune loop in D natural minor at
84bpm over i–VI–III–VII: a square bass on the root, a sparse triangle line that
leaves most of the bar empty, and a noise tick on the offbeat.

It rides the **same `AudioContext` as `Sfx`** (exposed as `Sfx.context`) —
browsers cap how many a page may open, and a second one would need its own
unlock gesture. Scheduled with 180ms lookahead against `actx.currentTime`
rather than `setTimeout`, which drifts tens of milliseconds under load and on a
loop this slow turns into an audible stagger.

`Music.retune()` runs on every `loadLevel`. Stopping the synth is
unconditional, so leaving act 3 always silences it — an earlier version
returned early when the file element did not exist yet and left the synth
playing underneath act 1. Nothing starts until the first `Music.start()`, which
only happens on a real keypress, so `retune` can re-pick the source on later
act changes without ever being the thing that begins audio.


## Difficulty

`D` on the title screen, remembered in `localStorage`. It only works there —
flipping it mid-run would add or remove pickups from a level already in
progress.

**Easy** is the game as tuned. **Hard** halves what keeps you alive and touches
nothing else: no change to enemy counts, boss patterns or timings.

| act | roses | invincibility | powder |
|---|---|---|---|
| 1 | 3 → 1 | 1 → 0 | 5 → 5 |
| 2 | 3 → 1 | 1 → 0 | 3 → 3 |
| 3 | 6 → 3 | 1 → 0 | 4 → 4 |

`Math.floor(n / 2)`, and the ones that go are the **earliest** — what survives
is whatever sits closest to a boss, where a heart is worth most. On hard that
leaves act 1 with the rose at 218 inside Aslan's arena, and act 3 with both
arena roses. With one invincibility per act, floor takes it to zero; that is
the intent, not an accident of rounding.

**Powders are never filtered.** They are traversal rather than power, and the
act 1 bridge cannot be crossed without the ultra — halving them would make the
level impossible, not hard.

The filter is deterministic, so a level plays the same on every attempt rather
than being a different lottery each time.


## Act endings

**Every act finishes on a flag.** Act 1 always did; acts 2 and 3 used to end
the moment their boss died. Now beating the boss opens the final gate and hands
play back, and the flag is the finish — so in act 3 he drinks the tea *and then*
walks out to the flag, rather than the drink being the end of the run. Both
paths fall through to an immediate win for any act with no `finishX`, so this
cannot strand a level that was never given one.

`LEVEL.afterLines` is an epilogue under the win title, revealed one line at a
time (`AFTER_LEAD` 1.0s, then 0.75s each) with the restart prompt held back
until the last one lands, so an ending reads as an ending rather than a
scoreboard.

The win screen lays itself out from its content rather than fixed offsets: act
1 has no epilogue and act 3 has six lines, and a hardcoded y for the score
would either collide with one or float in the middle of the other.

Every line is checked against the 320px buffer and the font's glyph table —
the widest is act 3's 257px. The apostrophe in *WE'RE* exists in `GLYPHS`.


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
| **Dardubala** | Four hits, and he changes form with every one: **man → fox → man → two foxes.** As a man he holds the top step and slams, and the waves run along the **floor**, so the fight is about climbing to him during the window after a slam. As a fox he is fast, charges and leaps, and the window is after a pounce — drawn from real art, **running** (`l2_fox_run.png`) while he hunts and **sitting** (`l2_fox_sit.png`, gold-tinted) during the open window, so the beat you can hit is readable at a glance. On the last hit a second fox joins him — only one is really him; the other is drawn as a translucent blue **phantom** with a `?` over it and pops when stomped. It used to be the same sprite under a 30% blue wash, which at this size was invisible: the two were indistinguishable and picking the real one was a coin flip. It also used to **outlive him** — the phantom went on hunting and leaping over the hero through the entire tea outro and the win screen behind it, which read as "I killed him and the thing is still after me". It now drops the instant he does. Never chases, never dives: deliberately not the Act 1 boss reskinned. Emits deadpan stage directions instead of dialogue, and **Nothing in this fight may hurt you without showing you why.** The Shockwave
box was 10px tall while only its bottom 6px were ever drawn, so four pixels of
it were invisible and a wave could land with clear air between you and anything
on screen — and the fox's pounce spawns those in what used to be near-white on
pale stone. The box is now the drawn part, the drawing overhangs it by a pixel,
and the fox's waves are blue.

Every hit also grants `DARD.grace` (1.5s) of harmlessness and knocks him away
from you. Freezing him in place was not enough: the new form stayed in the
pixel you were standing in, so the moment grace ran out it was already touching
you. **The decoy fox needed the same treatment and had none** — no `harmless`
getter at all — and it spawned two tiles from a player who had just landed a
stomp, which is what was still killing on sight. It now spawns on the far side
of Edika from you and holds still through the same grace.

He goes out shouting SAXLSHIIIIIIII - at scale 2 for 5.4s and held still, because at scale 1 for 0.9s the punchline of the whole act went by in a blink. 5.4s is the whole tea scene: it now stands through the exit, the drink and HE GOT AWAY and expires just as the flag gate opens, rather than dying before any of it. It sits at `y - 40` so the outro's own lines have room. `floatText` takes a life now, and only short-lived ones drift upward; a held line would walk off the top of the buffer. Slams also shake masonry down onto **his own step**, because once you had climbed up there nothing could reach you. The falling chunks paint their landing spot before they arrive — the first pass dropped four of them from 46px up, which is 0.3s of warning and a coin flip rather than a dodge, and a pilot that used to survive the whole fight died in six seconds without landing a hit. |

Every one of those was found broken by testing and fixed: Sleepy's hearing
range equalled the jump reach so the intended approach was impossible; Svani
only charged from close range so a retreating player deadlocked him and he
walked into pits; Dardubala's waves swept his own platform, punishing the one
surface you had to stand on. Bosses are leashed to their ground span, because
a gate holder that falls in a pit opens its gate by dying — the fight "won" by
watching it commit suicide.

`bossGrade` marks anything a khachapuri must not delete. The exemption used to
be `instanceof FlyingBoss`, so invincibility one-shot every Act 2 boss.


## Enemies on the second floor

Every act had its whole roster standing on the street. The platforms were pure
decoration — coins up there and nothing else, so there was never a reason to be
careful on one. An enemy spec can now carry **`up: true`**:

```js
{ t: 'l3guard', x: 116, up: true },   // the 114-117 ledge
```

Two things change, in `post()`:

- **`en.upper = true`**, and every walking enemy's `moveAndCollide` now passes
  `oneWay: this.upper === true`. Without that the enemy drops through the ledge
  on frame one: one-way platforms are *one way*, and every ground enemy has
  always been given `oneWay: false` deliberately so it cannot climb the level.
- **the leash becomes the ledge.** `spanAround` clamps to a `ground` span, which
  for a platform enemy is the whole avenue underneath him — no leash at all. The
  new `runAround(tx, ty)` walks row `ty` outward from `tx` and returns the
  contiguous standable run.

Nothing else is needed: every constructor already seats the enemy with
`groundYAt(tx)`, which returns the *topmost* surface in the column.

The shared stun path in `updateWorld` had to learn `upper` too — it does its own
`moveAndCollide`, so a rose in the face dropped a ledge guard through the ledge,
and a stun that kills reads as a bug. It is not only the posted guards: **Edika,
the decoy fox and the studio cameras** all stand on one-way tiles under their own
collision rules, and that path moves them while they are stunned. They set
`upper` in their constructors for exactly this line. (The cameras were the oldest
casualty: `settled` stops their own update after they land, so a rose through the
gantry dropped one to the floor *permanently*, and took the forced
floor→desk→gantry route through the studio with it.)

`post()` also narrows the leash, and `leash(this)` had to be **added** to Walker,
Guard and Journalist — none of the three classes the seventeen spawns use ever
called it, so the narrowed `home` was doing nothing at all. It matters most for
the Guard: his surge overwrites `dir` every frame it is up, so a posted guard
could charge off his ledge before the turn got a look in.

Seventeen of them across the three acts, on runs three tiles and wider (a
15px-wide enemy still gets 33px of pacing on a 48px run). The boss arenas are
left alone; so is anything at row 8 or above, which the player's 72px apex
cannot reach from the floor.

## Walls a chaser cannot get past

Act 3's Sleepy sits two tiles from the pipe at tile 44, and a playtester found
him **buzzing against it, going nowhere**. The mechanism is general and worth
naming, because three other enemies had it:

> A chaser re-targets `this.dir` at the *top* of `update` and the wall-turn
> flips it at the *bottom*. Nothing between the flip and the next re-target ever
> reads `dir`, so the flip produces **zero pixels of motion**. He snaps flush to
> the tile and stays there, frame after frame, at the same x.

`hopWall(e, vel)` is the answer, and it refuses more often than it fires:

- **It measures the stack.** The lowest solid tile his own box is pressed
  against, then the top of that column, compared to the launch velocity's apex.
  `-300` is an apex of 51.7px, which takes the two-tile pipes (32px) with 20px
  to spare and refuses anything taller. Starting the scan at his feet regardless
  would read a rise of zero off an overhang his head clipped and hop him for
  nothing.
- **A column solid all the way up has no top.** That is a **gate**, and a gate
  is meant to be a wall. Without the check the horizontal grind just becomes a
  pogo against the same tile.
- **The hop has to go somewhere.** Stand on the street one pixel past the end of
  the pipe and you are inside his 8px chase deadzone, so `dir` stops being
  re-derived and keeps pointing into the stone — he pogoed beside you, thirteen
  hops in ten seconds, having already arrived. He hops only when you are up *on*
  the stack or out beyond it.

The **wall turn is now gated on `onGround`** everywhere hopWall is used, because
the hop and the turn fight each other otherwise: `vx` is applied before the
y-move, so the frame after a hop the x-sweep re-hits the same tile and sets
`hitWall` while he is airborne, and the turn flips him back into the air he came
from. Sleepy, the decoy fox and fox-Edika survived that only because they
re-derive `dir` from the player every frame.

**The Bomber does not hop at all**, deliberately. He walks at 26px/s, so a
-300 hop holds him above a pipe cap for 0.43s — 11px of travel. He lands *on*
the two-tile pipe and then paces its 32px cap forever: a new stall in place of
the old one. He is a pacer, not a chaser, and turning at a pipe is the right
answer for him. What he needed instead was `walledIn(e, dir)`: his flee rule
points him straight away from you, and away from you at his own gate is *into*
it — at exactly the spot you have to stand in to punt a bomb back. Testing the
tile at head height before he commits keeps backing off a retreat rather than a
corner. Measured: from a permanent pin he now roams 86–448px and is wall-pressed
at most 4% of frames.

## Edika fights on all three floors

The Parliament arena is a step pyramid: the street, the 196-201 and 214-219
landings at row 11, and his stage at row 9. He used to spend the entire fight on
the street, because he fell straight through the one-way steps like every other
enemy — so you could stand on the top step and watch him pace underneath you,
harmless, forever. A playtester put it plainly: *"easy cause edika is always on
first floor"*.

He now collides with the steps and follows you between them. `tierChase()`
compares the tile row under his feet with the one under yours:

- **you are above him** — he leaps. `DARD.climb` is `-430`, an apex of 106px,
  which takes both tiers at once (64px) with room for the horizontal carry at
  `climbRun` 96px/s.
- **you are below him** — he drops *through* the step he is standing on, which
  is the same move duck+jump gives the player. The drop ends as soon as he is
  clear of the tile he let go of, **not** after a fixed time: 0.3s of free fall
  is 39px and the tiers are 32px apart, so a timed drop from his stage sailed
  straight through the middle landing every time.

He only chases a tier you are **standing** on. `floorRow` is a raw
bottom-edge-to-row conversion, so a player at the top of an ordinary jump reads
as two floors up — and he counter-leapt at every hop, which looks random rather
than like pursuit. Measured over a minute of a hopping, pacing player on his
stage: zero spurious leaps, and he was on a different grounded floor for 15
frames out of 3,600.

Measured with the player teleporting between tiers every four seconds: he is on
the player's own tier **57% of the time**, and **92–100%** when the player picks
one tier and stays on it. He visits all three rows from every starting position
and stays inside tiles 196-219. The stompable window is unchanged at 35% (man)
and 53% (fox) — he is harder to get away from, not harder to hit.

The decoy fox gets the same treatment, or it spawns on whatever step Edika was
standing on and immediately falls off it.

### The fox had the man's hitbox

He wore a 14×36 man-shaped box while drawing 38×30 of fox: a column of empty air
over his back that hurt on contact, and a tail and a snout that a stomp went
straight through. `wearForm()` now swaps the box with the form — `DARD.foxW`/
`foxH` are 20×24, measured off the sprite — anchored on his feet and his centre
so the resize never teleports him or buries him in the step he is on.

### Re-keying the foxes

`assets/l3_fox_run.png` was a holey blob. The source art
(`assets/level 3 (parliament)/fox1.png`) is a white fox on a two-tone grey
**checkerboard**, 216 light and 126 dark — and the fox's own tail shades through
213–222. No colour key can separate those: a threshold tight enough to keep the
tail cannot cross the anti-aliased seams between checker squares, and one loose
enough to cross them eats a hole straight through the tail. Which is exactly
what shipped.

`tools/extract_fox.py` keys on **structure** instead. The fox has a closed black
outline; close it by 2px, flood the background in from the border, and
everything the flood cannot reach is the fox, whatever colour it happens to be.
The 2px is measured, not guessed: the silhouette jumps from 6,955px (leaking) to
18,647px (sealed) at radius 2 and is then stable out to radius 6.

The sitting fox sits on grass and dirt instead, where the outline trick would
weld the whole meadow onto it — that one keys on **saturation**, since the fox is
neutral grey and the scenery is not. Both are resized with the alpha
premultiplied, or LANCZOS drags the background's own green and grey into every
edge pixel.

15KB and 23KB of broken sprite became 2.6KB and 2.1KB of correct one.

## The Bomber's bombs

Three complaints in one: *"it should be able to return the bomb to him, so when
you jump on the bomb and it goes its direction if it hits the villain it should
stop, and he shouldn't throw his bombs so close to him"*.

**A punt used to sail straight through him.** Nothing in this game makes an
entity collide with another entity, so the bomb you kicked back passed out the
far side and went off in empty street. The one case that matters now has its own
check: his own ordnance, punted, stops dead on him and detonates. Verified from
60px to 300px out — it lands on him every time and takes a heart.

**The throw scales with the range.** `reach = clamp(|d|, throwMin 72, throwMax
150)` and the launch speed is `reach / BOMBER.carry`, where `carry` (0.93) is the
0.40s arc plus the friction slide. A bomb that comes to rest at his feet is not
a weapon you can use — to stomp it you have to stand inside his contact box and
eat a heart for the privilege.

**And he steps away from what he just threw** (`BOMBER.backOff`), rather than
pacing straight back onto it, and will not throw a second one while the first is
still lying within `throwMin` of him. Measured bomb-to-Bomber gap over a full
fuse: 54px at 0.7s, 89px at 1.3s, 129px at 2.7s, from a throw that starts inside
him.

**Only a blast the player set off hurts him.** He was beating himself: left
alone with the player standing still and never touching a bomb, he paced back
over his own ordnance and went from three hearts to zero in **32 seconds**.
Backing off was not enough on its own — driven to the left end of his leash he
could not step away from a bomb at all, and detonated one at 19px three times in
a row. Walking him away from his own throws just marched him into that corner
faster. So `explode()` only calls `blastHit` when the bomb was punted, and a
chain off a punt inherits the flag. Punting one back into him is meant to *be*
the kill; now it is the only thing that is.

Verified: he survives two minutes at seven different player standoffs without
losing a heart, throwing on his 2.7s clock throughout; three punts from 90–300px
put him down and open his gate.


## The engine pieces under the new features

All behaviour-neutral on their own (verified with the trace harness above):

- **`populateWorld()`** builds a level's contents; `reset()` calls it, and so
  will anything that sets a level aside and comes back. One `WORLD_KEYS` list
  says what "a level's contents" means, so the two cannot drift apart.
- **`renderWorld()` / `present()`** — the world and the blit, split, so a
  scene can paint over a frozen world or skip it.
- **`camTargetX()` / `snapCamera()`** — the camera's goal, and a jump straight
  to it. A level narrower than the screen is centred instead of clamped to a
  negative edge.
- **`paintInto(ctx, fn)`** — `g` is a `let` now, and this points it at any
  canvas for one call, so every pixel-art helper (the flag, the rose, the
  crowd figure, the helicopter) can paint a newspaper photo or a share card
  without being rewritten.
- **`savePNG(canvas, name)`** — 4x pixel-crisp, through a blob URL on a
  download link. Works from GitHub Pages: everything is same-origin, so the
  canvas is never tainted.
- **Glyphs `# % " ( ) = &`** and **`validateText()`** at boot, which checks
  every boss card, chant and slogan for characters the font cannot draw and
  boxes they overflow. `drawText` skips an unknown character silently.
- **`textSprite()`** caches rendered strings: `drawText` is one `fillRect` per
  lit pixel, too slow for anything that scrolls.
- **Audio:** `Sfx.noise()` (with its own generator — sound must never move the
  game's dice, which also keeps the trace harness valid), `Sfx.hold()` for a
  held note with a `stop()`, `Sfx.stopHolds()`, and `Music.fade(to, secs)` on
  real time, reset by anything that restarts the music.
- The particle drag was the one frame-rate-dependent multiply in the file;
  it is `Math.pow(0.99, dt*60)` now.

### Slow motion

`Time.slow(id, scale, hold, out)` — anything can ask, the slowest live request
wins, it holds for `hold` real seconds and eases back over `out`. `update()`
runs menus, cards and scenes on real time and the world on `dt × scale`.
**Hit-stop stays real time, and a slow-mo hold only counts down once the
freeze is over** — so a kill reads stop, then slow, then speed back up.
Measured: `freeze 0.2` + `slow(0.25, 0.5)` holds 0.25 for 0.7s, then 0.54,
0.96, 1.00 at 1/6s steps.

### Run stats

`Stats.run` is the whole sitting (time, deaths per act, restarts, a summary of
each act won); `Stats.cur` is the attempt in progress. The newspaper, the
ticker, the timer and the share card read it.

**Kills are counted when the dead are reaped, not in `addCombo`.** `addCombo`
misses a kill bumped from below, a Bomber blown up by his own bomb and a fall
out of the world, and fires on boss hits that kill nothing. Decoys are marked
`noKill`. Verified: a stomp, a bump-kill and a decoy pop count 1, 1, 0.

The clock is in-game time: it only ticks in play, on the scaled dt, so hit-stop,
slow motion, cards, outros and scenes never cost the player.

### Scenes, interludes, and R

`Scenes` / `startScene()` / `game.state = 'scene'`, and `INTERLUDES` — the
running order after each act. For now each act still goes straight to the
next act's card; the helicopter lap and the newspaper slot in here.

**R was broken on every end screen.** `frame()` handled it before `update()`
saw it, so R on an act-clear screen replayed the act you had just *won*, R on
the final screen replayed act 3 at score 0 and skipped the high-score entry,
and R on game over dropped the score you had entered the act with. Global R
now only acts mid-act (`hotkeys()`), and restarts keeping the score you came
in with — the same deal as dying. On the end screens R continues, like Space.

## Game feel

- **Finishers.** A boss's killing blow gets slow motion and a camera punch-in
  (`Feel.finisher`): small bosses 0.3x for 0.3s, Aslan and Targamadze-on-air
  0.2x for 0.5s, Edika 0.15x for 0.6s, flowing straight into the tea. The zoom
  is a cropped blit at **5, 6 or 7 display pixels per buffer pixel** — whole
  numbers, so it stays nearest-neighbour crisp — and steps back out one level
  at a time. Hit-stop under a finisher is capped at 0.03s, or slow motion would
  stretch it five-fold. HUD and boss bar hide while zoomed.
- **Sparks** where the boots met the head, on every stomp and rose hit; a grey
  clank when a stomp does nothing (NOT NOW, ON AIR, WIDE AWAKE, USE HIS BOMBS).
- **Chained stomps climb** a whole tone per link (`Sfx.chain`, from the combo
  that already resets on landing).
- **Screen punches** — a directional kick on top of the shake: stomps (growing
  with the chain), boss hits, finishers, getting hurt (away from the hit),
  gates opening, the ultra liftoff. The biggest kick in a frame wins; they do
  not stack into a lurch. Measured on a stomp: 2px at chain 0, 3.5 at 3, 6 at 8.

## Boss intro cards

Fighting-game style: the world freezes, Misha's red panel and the boss's slide
in from either side with a white diagonal seam and speed lines, the name slams
down from scale 5 to 3 with a shake, two typed lines of billing, VS, FIGHT!.
2.3s, skippable after 0.4s. **A retry gets a 0.9s version** — dying to a boss
three times should not mean watching his card three times. Nothing ticks while
it plays: not the enemies, not the run clock (verified: the boss moved 0px and
the clock 0s over a second of card).

Triggered by the same rule that puts the boss's health bar up, plus "on
screen", so the card ends where the bar appears and the portrait is a man you
can see. Aslan and the two act finals use their own `engaged` latches.

**Act 1's dog-walker and act 2's anchor are the same man, Giorgi
Targamadze** — once walking Aslan's dogs, later a journalist. Both now carry
his name on the bar and the card, and the cards are written as a callback:
"ASLAN'S MAN / BROUGHT HIS DOGS", rounds 2 and 3, and then in act 2 "YOU
AGAIN? / NOW A HUMBLE JOURNALIST".

## The party look

United National Movement colours, keyed to the flag's own red (`UNM`
palette), so the flag and the interface always agree.

- **Title:** red-and-white pennant bunting, five-cross flags either side of the
  name, the act on a swallowtail ribbon, a ballot box with a red 5 and VOTE, a
  rose with KMARA!, a red controls strip.
- **HUD:** coins and score on a red plate, a small 5 ballot chip in the corner.
  The boss bar stays purple — purple is the enemy, red is you. MUSIC OFF moved
  under the plate.
- Cards, score entry and the won screens get bunting and a red strip.
- The crowd's flags are the five-cross flag now, at its smallest legible size:
  a 5x4 white field with a red cross.

## Chants

(Billboards, posters, and then overhead banners and bunting were tried in the
levels and taken out on playtest feedback - the red-and-white look stays on
the title, HUD, cards and end screens.)

**Chants** go a syllable at a time, each a square-wave shout and a clap:
MI-SHA!, KMA-RA!, GA-DA-DE-KI! (resign!), SA-KAR-TVE-LO!, NO-ME-RI KHU-TI!
(number five). Gates opening, every other flag raised, and the act 3 crowd
(on its own every 7–10s once it has four marchers, and on every surge).

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
it — <http://localhost:8123/?act=2>. Clamped, so a junk value is harmless. It
counts as a practice run: nothing it does is saved as a best.

`?step=manual` boots without starting the frame loop. A test drives the game
itself — `update(1/60)`, `render()`, `reset(false, {levelIndex})`, keys through
`Input.keys` / `Input.pressed`, global keys through `hotkeys()` — so nothing
advances behind its back between two measurements. Every check in this file
from here on was made that way.

**Behaviour-neutral refactors are checked against the original, frame by
frame.** A copy of the previous release is served beside the working one, and
a harness replays the same scripted input on both — `Math.random` replaced by
a seeded generator, digests of player position, score, hp and every enemy's
x every 30 frames, all three acts, at 60 and at 30 fps. The refactors below
produced identical traces.


## Edika has no drawn forelock, on purpose

The white tuft in his art is about 20px inside a 223px image, so downscaling to
a 21px sprite averages it against its own black outline and it disappears —
zero white pixels survive at render size, and only 19 even at a 64px height.
Hand-placing one was tried and removed: at this scale it read as a paper hat
sitting on his skull rather than as hair. If the forelock is wanted back, the
fix is a sprite edit that thickens it in the source, not pixels drawn on top.


## Throwing roses

Roughly every third `?` block holds five roses instead of a coin (it used to
say ROSES +3 while paying five; the text now says what it pays) — keyed off
the tile rather than randomly, so a block that paid out ammo last run still
does. `X` throws one; it arcs about 140px and **staggers** whatever it hits for
1.7s (1.2s on a boss).

The HUD shows `ROSES Xn`, and `PRESS X TO THROW` blinks under it until you
actually throw your first one, then never again. In Act 1 the same key throws
**flags** instead — see **Militia defects**.

It does not kill. That is the point: every fight in the game resolved as *wait
for the opening and land on his head*, and one ranged verb lets you **open** a
window instead of waiting for one — thin a guard cordon from range, interrupt a
charge, or buy a safe approach. Stun is handled centrally in the update loop
rather than per class, so a stunned enemy is frozen, harmless and stompable
without any boss knowing the mechanic exists.

## Crouching

`Down` / `S` on the ground. The hitbox drops from **28px to 17px**, growing and
shrinking from the feet so the box never moves out from under him, and the
crouch-walk is capped at `CFG.crouchMax` (52) — a shuffle, so you can reposition
under fire without the dodge pinning you in place.

**The crouch art is drawn at 26px, not at its own natural size.** `squat.png`
draws the whole crouching figure at a smaller scale than `hero.png` draws the
standing one — same head-to-body proportion, just a smaller man — so rendering
it at its own height shrank his *skull* when he ducked, which is the one thing
a crouch must not do. Measured on the raw files: the head is 43/93 of
`hero.png` and 34/63 of `squat.png`, so 26px is the height at which both heads
come out 14px wide. He still loses 4px off the top, which is the crouch.

`hitW`/`hitH` were pulled in from 0.62/0.78 to **0.53/0.65** at the same time,
so the box stays exactly 10×17 where it was. That is not cosmetic: `crouchH`
comes from `hitboxFor('squat')`, and `BULLET.ride` is calibrated against the
28/17 band. Rescaling the art without rescaling those ratios would have opened
the crouch box back up and made the ankle shot unduckable.

Standing back up is **refused when there is no room**. Without that check,
releasing crouch in a one-tile gap warps his head into the tile above and the
vertical sweep shoves him through the floor.

Only the height changes, never the width. A narrower box mid-crouch would let
him slide into gaps he cannot stand up out of. `fellInPit` force-stands him
before anything measures him, because `respawnSpot` places the box by its own
height and respawning mid-crouch put him 11px low.

**Duck + jump drops you through a one-way platform.** Checked before the jump
chain so it consumes the buffer — otherwise he drops and immediately jumps back
up through the same platform. It needs `oneWay: false` threaded into *both* the
collision sweep and the ground probe at the end of `moveAndCollide`; the probe
re-grabs one-way tiles independently, so honouring the flag in only one place
pins him back the frame he lets go.


## Edika's bullets

The man form fires along the surface **he** is standing on, at head height,
dead level — they never chase and never change height.

That flatness is the mechanic, not laziness. An earlier version tracked the
floor under the bullet so it stepped down with the terrain, which sounds better
and is much worse: crossing from his step to the floor it slid 60px downward and
swept straight through a crouching player on the way. A shot you cannot duck
because it is busy descending through you is not a shot.

`BULLET.ride` is the rest of it. The bullet occupies feet-25 to feet-20 — inside
a standing box (feet-28 to feet), clear of a crouching one (feet-17 to feet) by
3px. `validateLevel` asserts that band at boot, so retuning the squat hitbox
without moving `ride` fails loudly instead of silently killing the dodge.

The tell is the **lane**, not a symbol over his head: you need to know what
height it is coming at, so the wind-up flashes a dotted line along the floor he
is on for 0.5s, with DUCK over him. He aims at *you*, not along his facing, so
standing behind him is not a free ride.

| pilot | result |
|---|---|
| ducks the shots | **3/3 wins**, 4 hits, ~12s, ends on 1 heart |
| ignores them | **0/3**, dead every time |

**The slam and the shot run on separate clocks, and the slam has priority.** The
slam used to be driven off `phaseT`, and returning from a shot reset `phaseT` —
with `shootEvery` (2.1s) under `slamEvery` (2.8s) he re-armed the slam before it
could ever fire and looped pace → aim → pace forever. He never went `winded`,
which is the only beat a man-form Edika can be stomped on, so the fight was
literally unwinnable: three pilots, zero hits, dead in eight seconds. Whatever
else changes here, the stompable window must not be starvable by the shot.


## The crowd

Every flagpole you convert brings two more people out. They trail a few tiles
behind, and once four have joined they **surge** on their own every five
seconds, flooring any guard near them. Bosses are immune — the street can shift
a cordon, not a minister.

They are pressure, not units: no controls, no collision, and they never block
you. `LEVEL.crowd` means *flagpoles feed the crowd* — Act 2 only. The crowd
itself runs wherever it has people (`crowd.active`), because Act 1 now has one
of its own: the militia who change sides when you hit them with a flag (see
**Militia defects**). Its settings come from `LEVEL.crowdCfg` over the
`CROWD` defaults.

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


## The walk cycle

The hero art is already a **mid-stride pose** — legs apart, one forward, one
back. So the second frame of the cycle is the *passing* position: legs
together, body a pixel higher. That is made by pulling each leg one pixel
toward the centre and lifting the whole sprite by one. Two frames, alternating.

**`LEG_TOP` is measured, not guessed.** Scanning the keyed 20×30 sprite for the
first row containing two separate runs of pixels puts the split at row 25 of 30
— the legs are runs `[3,8]` and `[11,15]` there. A first attempt cut at 0.66,
which is up through the coat and the swinging arms, and sliding *that* sheared
the whole body sideways. Nothing above the crotch may move.

`phase` comes from **distance travelled**, not from time. An earlier walk cycle
was time-based at 18Hz and read as the character vibrating rather than walking,
which is why the animation got pulled entirely. Distance also makes the cadence
match the speed for free: sprinting steps faster.

`spriteSrc` exists because `drawSprite` scales as it tints and so cannot hand
back a native-size source to blit sub-rectangles from.


## The camera

Feeding raw `p.vx` into the lead was the instability. `vx` changes every frame
as he accelerates, brakes, lands and turns, so the point the camera aimed at
jittered constantly and the view swam — worst when tapping left and right,
where the lead flips sign. The lead is now smoothed on its own before it
reaches the target, and the target is chased more slowly.

Measured max frame-to-frame camera movement: tapping **4.38px → 1.70px**,
running **2.68px → 0.74px**.

**Vertically it holds at the floor.** It used to chase the jump arc behind a
26px dead zone, so a jump lifted it and, on the way back down, the street had
slid to a sliver at the bottom of the screen. Nothing in these levels sits
above row 4, which is on screen with the camera at the floor (y=60), so it now
stays there and only lifts when his head would leave the top of the frame — a
jump off a high ledge (13px, leaving 19px of ground) or the ultra launch.


## The bridge (Act 1)

Tiles 179–192 used to be a four-tile pit. 179–194 — **239–254 since the sea
pushed everything 60 tiles along** (pre-sea numbers below are marked) — is now a
**fifteen-tile ravine** spanned by a `T.BRIDGE` deck laid flush with the ground either side, so
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

The deck then goes **from the near end, chasing you across**, over 2.1s
(`BRIDGE_FALL`) after a 0.35s `BRIDGE_LEAD` so stepping on does not drop the
tile under your own feet. It used to sweep the other way, which made crossing
impossible by construction — the far end was always gone before you arrived, so
the only move was retreat. Now it is a race you can win: the front travels
114px/s against a 148px/s sprint. Measured: sprinting crosses in 1.68s, walking
in 2.15s (marginal, walk speed is 115), hesitating 0.6s drops you, and standing
still drops you. Falling still costs one heart and leaves the ultra on the near
lip. It drops decorative `Plank`s — deliberately kept out of
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
over. Apex is 122px; the crossing lands around tile 254 (194 pre-sea).

A pure vertical mega-jump was the wrong shape: to carry fifteen tiles on hang
time alone it would have to rise fifteen tiles, which is taller than the level.
The horizontal surge (`ultraAirMax`) is what crosses the gap; the big rise
(`ultraJumpVel`) is what sells it. `-470` is already at the camera ceiling — the
view only clamps 120px above his head — so any extra range has to come from the
speed cap, not the height.

`jumpCut` is **exempt** during an ultra flight. It is the one jump the game
requires you to make, and with the cut applied a tapped launch landed 92px short
every time.

The pipe that used to sit at 176 was moved back to 165 (236 → 225 since the
sea). At 176 it was a wall one tile short of the ravine — you cleared it, landed
on the single tile at 178 and
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
  off the 194 lip, fall out of the world, and hand you gate 206 (254 and 266
  since the sea) for free. He now
  gets `spanAround` + `leash` like every other gate holder.
- `shadowUnder` used `groundYAt`, which returns a row-13 fallback for an empty
  column — it painted a shadow in mid-air the whole way across, reading as an
  invisible floor. It uses `groundBelow` and bails on `null`. The crowd had the
  same bug and the same fix; over Act 2's four-tile pits neither was visible.

## The sea (Act 1)

The four-tile pit at 140–144 became **open water from 140 to 204**, crossed on
a **banana boat**. Everything from 144 on moved 60 tiles along (`w` 300); the
bridge, ravine, gates and arena kept their spacing exactly, so their
measurements still hold — the ravine sweep gives identical results before and
after the shift.

- The banana (`BananaBoat`, 44px) sits docked at the pier. Stand on it for
  0.4s (`SEA.boardT`) and a speedboat takes up the rope: 0 → 100px/s
  (`SEA.tow`, `accel` 85), camera leading with the boat's speed. Near the beach
  the speedboat drops the rope and peels away, and the banana coasts onto the
  sand at 204.
- Hazards spawn just off-screen right, keyed to the tile the banana's nose
  reaches (`SEA.schedule`): patrol launches coming the other way (jump them, or
  land on one and sink it, 300) and spiked mines (stomping one blows up under
  you). Aslan, already stalking from 128, floats `PATROL!`.
- **Anything in the water** — below the surface by 8px and not riding — is a
  splash and a pit: one heart, and `seaRun.fail()` sends the boat back to the
  dock and calls the patrols off. A retry is a ten-second run.
- Standing back on the pier with the boat out — beached on the far side, or
  towing on without you after you hopped off at the start — brings it home and
  calls the patrols off. An empty boat used to keep spawning them and they
  sailed on over the pier into you. Any part of you over the pier counts (by
  your centre, the last 5px of the lip read as sea), and patrol boats sink a
  tile before the pier.
- Hazards spawn clamped to the water, and whatever is left afloat is cleared
  when the banana beaches. The last two used to spawn on the sand, one mine
  right where the banana lands.
- A flag-stunned patrol boat sails on afterwards (`PatrolBoat` resets its speed
  every frame; the shared stun path zeroes `vx`).

**Rideables** are the engine piece behind it: anything in `game.rideables` with
a top you can stand on. They update before the player; `landOnRideables` lands
him from above or keeps a rider stuck through bobbing, and hands its speed over
as `carryVx`, which `moveAndCollide` adds to his own — so carrying still
respects walls, and the carry survives a jump, so you land back on a moving
boat. While airborne he keeps pace with the boat he left (`lastRide`), not
the speed it had when he jumped — hopping while the banana was still speeding
up landed him behind it. A hit while aboard, or mid-hop over the water (a mine
you came down on), pops you up, never off: knockback there was a second heart
in the sea. Measured: every hop from every spot on the banana, at every point
of the launch, lands back on it at 60 and 30fps. The banana does not bob until
it is a tile clear of the pier — a 1px dip with a rider still half over the
lip pushed him into the pier's ground and the wall test shoved him a tile
back.

The water is `LEVEL.water [{from, to, y}]`: a body drawn behind everything and a
translucent waterline drawn in front, so boats sit *in* it. The sunset is one
760px untiled panorama (`seaBg`) — a mirrored tile put two suns in the sky.

## The mayor's limousine (Act 1, gate 2)

Three Targamadzes in one act was too many; the middle gate is now held by
**Aslan's son, the mayor, in his limousine** (`Limo`, `LIMO`). It parks, revs
for 0.6s, charges across the arena at up to 150px/s, then **stops at the end
of its run so he can wave through the sunroof** — the only time its roof can be
stomped. Any other stomp is a `BULLETPROOF` clank. Each hit lets two bodyguards
out of the doors — beside the car, on the side with more street (the street
ends at his own gate, not where the ground does), on the street itself, and
harmless for as long as the car is after a hit (`LIMO.grace`).
Spawned inside the car's footprint they came up under the player still
bouncing off the roof, and a clean stomp cost a heart most times. Three hits, a
slow-motion finisher, and the gate at 221 opens. It has
its own boss card (ASLAN'S SON / THE CITY BUDGET, ON WHEELS).

## Militia defects (Act 1)

In Act 1, `X` throws **small five-cross flags** (`LEVEL.throwKind = 'flag'`).
A plain soldier hit by one **defects**: his rifle drops, he turns, hops, and
walks back to join the militia following you. +300 flat, deliberately outside
the combo chain, so throwing never out-scores stomping. Targamadze, his dogs,
the limousine and Aslan's patrol boats only get the ordinary stun.

- **Ammo** reuses the rose counter, shown as `FLAGS Xn`: three to start, three
  more at every pole you raise, five from a paying `?` block, fifteen at most
  (`AMMO`). A gain blinks the counter yellow rather than floating another
  label over the pole, which already floats +300 and starts a chant there. About 26 over the act against 21 walkers plus the limousine's
  guards, so you choose who to turn.
- **The flag flies flatter than a rose.** A walker is 17px tall, and the rose's
  lob clears his head anywhere inside ~125px — measured, it only connected
  between 130 and 160px. The flag rises at most 4px and stays at his height:
  it connects from 10 to 170px.
- A defector (`Turncoat`) is a decorative actor, not an enemy: he left the enemy
  list the moment he was hit, marked `noKill`, so he is never counted as a
  kill. He always merges within three seconds, wall or pit in the way or not,
  so nobody is ever lost or stuck on a ledge.
- **The militia** is the act's crowd (`crowdCfg`: max 10, surge every 4.5s once
  three have joined, reach 64px, `STAND DOWN!`, the MI-SHA chant). They are the
  walker sprite with a flag on a stick, trailing away from you and facing you.
  Each soldier stands on your floor, steps up onto anything up to three tiles
  high (they stand on pipes), and the line ends at a gap or a wall — nobody on
  the sea, over a pit or up the cellar wall (`militiaFooting`). The floor is
  read from your feet only while you are on them, so a jump under a brick row
  no longer stands anyone on the bricks.
  Out at sea up to three ride the back of the banana. **They stop at the
  ravine lip** and shout `WE ARE WITH YOU!` — Aslan's arena stays yours.
  Gate holders and anything afloat are exempt from the surge, as before.

## Rooms: Aslan's cellar

Hold **down** for 0.3s on the pipe at tile 48 and you sink into it. Not a tap:
ducking a bullet or a dog while standing on a pipe must never send you
underground. DOWN has to be let go between warps (`warpLatch`) — coming up out
of 48 puts you on the pipe that leads straight back down — and a warp never
overrides a death, a win or an outro that happened earlier in the same frame. A small blinking arrow marks a pipe that goes somewhere once you
are near it.

**Aslan's cellar** is a 30-tile vault under the boulevard — stone floor, walls
and ceiling, a brick back wall with alcoves full of gold bars and money sacks,
two bare bulbs. About thirty coins, two guards to turn or stomp, and a `?`
block of flags. You drop in through a pipe in the ceiling and leave by the one
on the floor at the far end, which brings you back up out of 48.

How it works (`LEVEL.rooms`, `enterRoom` / `exitRoom`):

- A room is a small LEVEL-shaped object, normalised at boot
  (`normaliseRooms`): it inherits the act's throw kind, crowd settings and
  flags style, and finish, gates, bridge, water and the boss trigger are forced
  off. Its pipes carry `hang: true` (the way in) and `exit: true` (the way out);
  the act's pipe carries `warp: 'cellar'`. Blocks gained a height `h` for walls
  and the vault, and `LEVEL.roof` makes `groundYAt` scan from under the vault so
  enemies are not seated on the roof.
- Going in sets the act aside whole: `LEVEL`, the **grid by reference** (used
  `?` blocks, broken bricks, opened gates and a cut bridge stay exactly as
  left), and every `WORLD_KEYS` list. `LEVEL` is assigned directly, never via
  `loadLevel`, which would retune the music. Coming out restores it all.
- A visited room is cached, so its coins never come back. Death and `R` go
  through `reset()`, which forgets rooms along with everything else.
- **The militia come along** — the crowd is not set aside, only moved to the
  pipe, so its numbers live in one place. A defector still walking when you
  warp joins as the warp starts, while the level he is in is still the
  current one (merged after the swap, the cellar's were cached away with it).
- The pipe animation is its own state (`pipe`): 0.45s sinking, the swap, 0.45s
  rising (or dropping out of the ceiling pipe), with the player clipped to the
  part outside the pipe. The clock runs; nothing else moves.


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
