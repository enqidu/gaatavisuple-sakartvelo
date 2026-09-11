/* ============================================================
   MARIO MODE — 8-bit side-scrolling platformer

   Everything renders into a 320x180 buffer that gets scaled 4x with
   nearest-neighbour sampling. That low internal resolution is what makes
   it read as 90s console rather than "smooth HTML5 canvas": no gradients,
   no sprite rotation, no sub-pixel positions, chunky particles.
   ============================================================ */

'use strict';

/* ---------------------------------------------------------- constants */

const TILE    = 16;
const VIEW_W  = 320;
const VIEW_H  = 180;
const SCALE   = 4;                    // 320x180 * 4 = 1280x720 exactly
const LEVEL_H = 15;                   // tiles
const LEVEL_H_PX = LEVEL_H * TILE;

const CFG = {
  gravity:     870,
  maxFall:     420,
  runAccel:    870,
  airAccel:    570,
  friction:    970,
  runMax:      115,
  sprintMax:   148,
  /* Apex ≈ 72px ≈ 4.5 tiles.

     Was -328, giving 61.8px. A block four tiles up needs a 64px rise, so six
     surfaces in the level — including a `?` block and the first mid boss's own
     platform — missed by 2.2px and simply could not be reached. */
  jumpVel:    -355,
  airJumpVel: -300,     // the powder's second jump, deliberately weaker
  /* The ultra powder's one-shot launch. A purely vertical monster is the wrong
     shape here: to carry thirteen tiles of ravine on hang time alone it would
     have to rise thirteen tiles, which is taller than the level. The horizontal
     surge is what actually crosses the gap; the big rise is what sells it.
     Both last only until he lands. */
  ultraJumpVel: -470,
  ultraAirMax:  235,
  crouchMax:     52,    // crouch-shuffle: enough to reposition, not to travel
  jumpCut:     0.42,
  coyote:      0.10,
  jumpBuffer:  0.12,
  stompBounce: -208,
  hurtInvuln:  1.4,
  // The death pop runs on its own, lighter gravity so it hangs and reads as a
  // beat rather than a blink. Roughly 1.9s from hit to off-screen.
  deathVel:    -215,
  deathGravity: 300,
  deathMaxFall: 250,
};

/* Sprite manifest.
   h       — on-screen height in buffer pixels (TILE is 16, for scale)
   hitW/H  — hitbox as a fraction of the drawn sprite, so the collision
             box tracks whatever art actually gets dropped in
   raw     — skip background key-out (for the backdrop image)          */
// Night backdrops recede by getting darker, not paler.
const NIGHT_HAZE = { amount: 0.36, tint: [26, 34, 66], desat: 0.30 };

const SPRITES = {
  hero:   { src: 'assets/hero.png',   h: 30, hitW: 0.55, hitH: 0.92, color: '#2b3a5e' },
  /* hitH is deliberately mean. The crouch only earns its keep if the box
     shrinks far enough to open a band a bullet can pass through, and 0.78 of
     22px gives 17 against the standing 28 - an 11px window. See BULLET.ride. */
  squat:  { src: 'assets/squat.png',  h: 22, hitW: 0.62, hitH: 0.78, color: '#2b3a5e' },
  /* Airborne pose. Its hitW/hitH are never read - the collision box only ever
     comes from 'hero' and 'squat', so swapping the art mid-jump cannot change
     what he collides with. */
  jump:   { src: 'assets/jump.png',   h: 30, hitW: 0.55, hitH: 0.92, color: '#2b3a5e' },
  walker: { src: 'assets/walker.png', h: 19, hitW: 0.70, hitH: 0.90, color: '#4a7a2f' },
  mid:    { src: 'assets/mid.png',    h: 30, hitW: 0.80, hitH: 0.82, color: '#2d4a7a' },
  boss:   { src: 'assets/boss.png',   h: 34, hitW: 0.55, hitH: 0.90, color: '#1a1a1a' },
  death:  { src: 'assets/death.png',  h: 32, hitW: 0.55, hitH: 0.90, color: '#5a2b2b' },
  lady:   { src: 'assets/lady.png',   h: 29, hitW: 0.50, hitH: 0.90, color: '#c2456f' },
  powder: { src: 'assets/powder.png', h: 14, hitW: 1.00, hitH: 1.00, color: '#e8e8f4' },
  bg:     { src: 'assets/bg.png',     h: LEVEL_H_PX, raw: true, haze: 0.42 },

  /* Level 2. NIGHT_HAZE darkens toward navy instead of lightening toward sky:
     the level-1 pale preset flattens a night scene into daylight grey.
     l3bomb needs the pocket pass off - his white vest and cream trousers are
     large enclosed regions and the trousers sit only ~34 from the white
     background, so the pass deleted his clothes. */
  l3guard: { src: 'assets/l3_guard.png',     h: 28, hitW: 0.55, hitH: 0.90, color: '#4a4ab0' },
  l3sleepy:{ src: 'assets/l3_sleepy.png',    h: 30, hitW: 0.60, hitH: 0.90, color: '#d8d8e0' },
  l3svani: { src: 'assets/l3_svani.png',     h: 32, hitW: 0.62, hitH: 0.88, color: '#a03040' },
  l3bomb:  { src: 'assets/l3_bomb.png',      h: 31, hitW: 0.55, hitH: 0.90, color: '#e0e0d0',
             key: { minHolePct: Infinity } },
  l3dard:  { src: 'assets/l3_dardubala.png', h: 40, hitW: 0.55, hitH: 0.90, color: '#c03030' },
  /* 28, not 26, and the art itself now carries a baked dark outline plus a
     contrast lift. The extraction had eaten its outline - the checkerboard's
     dark grey and the fox's own were the same value - and next to the sitting
     pose it read as a pale flat slab rather than the same animal. */
  l3foxrun:{ src: 'assets/l3_fox_run.png',   h: 28, hitW: 0.80, hitH: 0.80, color: '#dde3ec' },
  l3foxsit:{ src: 'assets/l3_fox_sit.png',   h: 30, hitW: 0.60, hitH: 0.85, color: '#dde3ec' },
  /* Act 2, the television company. Both backdrops are already dark interiors,
     so the haze is gentle - NIGHT_HAZE on top of them turned the screens to
     mud. Both tile: at LEVEL_H_PX they come out 320 wide, exactly VIEW_W, so
     an anchored zone would have nothing left to drift into. */
  l2hall:   { src: 'assets/l2_hall.png',   h: LEVEL_H_PX, raw: true,
              haze: { amount: 0.20, tint: [18, 24, 52], desat: 0.16 } },
  l2studio: { src: 'assets/l2_studio.png', h: LEVEL_H_PX, raw: true,
              haze: { amount: 0.14, tint: [18, 24, 52], desat: 0.10 } },
  l2girl:   { src: 'assets/l2_girl.png',   h: 27, hitW: 0.46, hitH: 0.90, color: '#7fb0d8' },
  l2girl2:  { src: 'assets/l2_girl2.png',  h: 27, hitW: 0.46, hitH: 0.90, color: '#9a94a8' },
  l2man:    { src: 'assets/l2_man.png',    h: 28, hitW: 0.50, hitH: 0.90, color: '#2b3a5e' },
  l2anchor: { src: 'assets/l2_anchor.png', h: 34, hitW: 0.50, hitH: 0.90, color: '#1c2436' },

  l3bg:    { src: 'assets/l3_bg.png',    h: LEVEL_H_PX, raw: true, haze: NIGHT_HAZE },
  l3bg2:   { src: 'assets/l3_bg2.png',   h: LEVEL_H_PX, raw: true, haze: NIGHT_HAZE },
  l3arena: { src: 'assets/l3_arena.png', h: LEVEL_H_PX, raw: true, haze: NIGHT_HAZE },
};

/* ---------------------------------------------------------- utils */

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp  = (a, b, t) => a + (b - a) * t;
const rand  = (a, b) => a + Math.random() * (b - a);
const pick  = arr => arr[Math.floor(Math.random() * arr.length)];
const aabb  = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x &&
                        a.y < b.y + b.h && a.y + a.h > b.y;

/* ---------------------------------------------------------- bitmap font

   A real 5x7 pixel font rather than the browser's text rasteriser — at this
   resolution any anti-aliased glyph turns to mush when scaled up.          */

const GLYPHS = {
  A:[0x0E,0x11,0x11,0x1F,0x11,0x11,0x11], B:[0x1E,0x11,0x11,0x1E,0x11,0x11,0x1E],
  C:[0x0E,0x11,0x10,0x10,0x10,0x11,0x0E], D:[0x1E,0x11,0x11,0x11,0x11,0x11,0x1E],
  E:[0x1F,0x10,0x10,0x1E,0x10,0x10,0x1F], F:[0x1F,0x10,0x10,0x1E,0x10,0x10,0x10],
  G:[0x0E,0x11,0x10,0x17,0x11,0x11,0x0F], H:[0x11,0x11,0x11,0x1F,0x11,0x11,0x11],
  I:[0x0E,0x04,0x04,0x04,0x04,0x04,0x0E], J:[0x07,0x02,0x02,0x02,0x02,0x12,0x0C],
  K:[0x11,0x12,0x14,0x18,0x14,0x12,0x11], L:[0x10,0x10,0x10,0x10,0x10,0x10,0x1F],
  M:[0x11,0x1B,0x15,0x15,0x11,0x11,0x11], N:[0x11,0x19,0x15,0x13,0x11,0x11,0x11],
  O:[0x0E,0x11,0x11,0x11,0x11,0x11,0x0E], P:[0x1E,0x11,0x11,0x1E,0x10,0x10,0x10],
  Q:[0x0E,0x11,0x11,0x11,0x15,0x12,0x0D], R:[0x1E,0x11,0x11,0x1E,0x14,0x12,0x11],
  S:[0x0F,0x10,0x10,0x0E,0x01,0x01,0x1E], T:[0x1F,0x04,0x04,0x04,0x04,0x04,0x04],
  U:[0x11,0x11,0x11,0x11,0x11,0x11,0x0E], V:[0x11,0x11,0x11,0x11,0x11,0x0A,0x04],
  W:[0x11,0x11,0x11,0x15,0x15,0x1B,0x11], X:[0x11,0x11,0x0A,0x04,0x0A,0x11,0x11],
  Y:[0x11,0x11,0x0A,0x04,0x04,0x04,0x04], Z:[0x1F,0x01,0x02,0x04,0x08,0x10,0x1F],
  0:[0x0E,0x11,0x13,0x15,0x19,0x11,0x0E], 1:[0x04,0x0C,0x04,0x04,0x04,0x04,0x0E],
  2:[0x0E,0x11,0x01,0x02,0x04,0x08,0x1F], 3:[0x1F,0x02,0x04,0x02,0x01,0x11,0x0E],
  4:[0x02,0x06,0x0A,0x12,0x1F,0x02,0x02], 5:[0x1F,0x10,0x1E,0x01,0x01,0x11,0x0E],
  6:[0x06,0x08,0x10,0x1E,0x11,0x11,0x0E], 7:[0x1F,0x01,0x02,0x04,0x08,0x08,0x08],
  8:[0x0E,0x11,0x11,0x0E,0x11,0x11,0x0E], 9:[0x0E,0x11,0x11,0x0F,0x01,0x02,0x0C],
  ' ':[0,0,0,0,0,0,0],
  '.':[0,0,0,0,0,0x0C,0x0C],      ':':[0,0x0C,0x0C,0,0x0C,0x0C,0],
  '-':[0,0,0,0x0E,0,0,0],         '!':[0x04,0x04,0x04,0x04,0x04,0,0x04],
  '?':[0x0E,0x11,0x01,0x02,0x04,0,0x04], '+':[0,0x04,0x04,0x1F,0x04,0x04,0],
  '/':[0x01,0x02,0x02,0x04,0x08,0x08,0x10], '*':[0,0x0A,0x04,0x1F,0x04,0x0A,0],
  '<':[0x02,0x04,0x08,0x10,0x08,0x04,0x02], '>':[0x08,0x04,0x02,0x01,0x02,0x04,0x08],
  "'":[0x04,0x04,0,0,0,0,0],      ',':[0,0,0,0,0x04,0x04,0x08],
};

function textWidth(str, s = 1) { return str.length * 6 * s - s; }

function drawText(g, str, x, y, color = '#fff', s = 1, shadow = '#000') {
  str = String(str).toUpperCase();
  x = Math.round(x); y = Math.round(y);
  for (const pass of shadow ? [0, 1] : [1]) {
    g.fillStyle = pass === 0 ? shadow : color;
    const ox = pass === 0 ? s : 0, oy = pass === 0 ? s : 0;
    let cx = x;
    for (const ch of str) {
      const gl = GLYPHS[ch];
      if (!gl) { cx += 6 * s; continue; }
      for (let r = 0; r < 7; r++) {
        const bits = gl[r];
        if (!bits) continue;
        for (let c = 0; c < 5; c++)
          if (bits & (1 << (4 - c)))
            g.fillRect(cx + c * s + ox, y + r * s + oy, s, s);
      }
      cx += 6 * s;
    }
  }
}

function drawTextCentered(g, str, cx, y, color, s = 1, shadow = '#000') {
  drawText(g, str, cx - textWidth(str, s) / 2, y, color, s, shadow);
}

/* ---------------------------------------------------------- sprite loading

   Each source image is:
     1. keyed  — the background colour is sampled from the image border and
                 flood-filled inward. Sampling rather than assuming white is
                 what lets a blue-backed sprite and a white-backed one load
                 through the same path. Flood fill rather than a global colour
                 match is what preserves that same colour *inside* the art —
                 a white shirt on a white background, a blue tie on blue.
     2. cropped to the content bounding box.
     3. downscaled once, at load, to its final on-screen size — so the game
        loop can blit it 1:1 with smoothing off and get stable, crisp pixels.
*/

function bgColorOf(d, w, h) {
  // Median-ish of border samples: robust to one odd corner.
  const samples = [];
  const at = (x, y) => { const i = (y * w + x) * 4; return [d[i], d[i+1], d[i+2], d[i+3]]; };
  for (let i = 0; i < 12; i++) {
    const t = i / 11;
    samples.push(at(Math.round(t * (w - 1)), 0));
    samples.push(at(Math.round(t * (w - 1)), h - 1));
    samples.push(at(0, Math.round(t * (h - 1))));
    samples.push(at(w - 1, Math.round(t * (h - 1))));
  }
  const opaque = samples.filter(s => s[3] > 24);
  if (!opaque.length) return null;                  // already transparent
  const med = ch => {
    const v = opaque.map(s => s[ch]).sort((a, b) => a - b);
    return v[v.length >> 1];
  };
  return [med(0), med(1), med(2)];
}

/* tol is RGB euclidean distance from the sampled background colour.
   Kept deliberately tight: silver hair sits only ~54 away from white, so a
   looser threshold eats it wherever the character outline has a gap. The
   halo pass below is what cleans up anti-aliased edges instead. */
function keyOutAndTrim(img, { tol = 44, minHolePct = 0.0022 } = {}) {
  const w = img.naturalWidth, h = img.naturalHeight;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0);

  let id;
  try { id = cx.getImageData(0, 0, w, h); }
  catch (e) {
    console.warn('sprite: pixels unreadable — serve over http:// for key-out');
    return { canvas: cv, w, h };
  }
  const d = id.data;

  const bg = bgColorOf(d, w, h);
  if (!bg) return cropTo(cv, d, w, h);

  const tol2 = tol * tol;
  const matches = i => {
    if (d[i + 3] < 24) return true;
    const dr = d[i] - bg[0], dg = d[i + 1] - bg[1], db = d[i + 2] - bg[2];
    return dr * dr + dg * dg + db * db < tol2;
  };

  // flood fill inward from every border pixel
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, 0, x, h - 1);
  for (let y = 0; y < h; y++) stack.push(0, y, w - 1, y);

  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const p = y * w + x;
    if (seen[p]) continue;
    const i = p * 4;
    if (!matches(i)) continue;
    seen[p] = 1;
    d[i + 3] = 0;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }

  /* Enclosed background pockets.

     The border flood fill above cannot reach background that is walled in by
     artwork — the gap between the man and his dogs, the triangles inside the
     leashes. Those survive as solid blue blobs stuck to the sprite.

     Clearing every background-coloured pixel instead would fix it and break
     something worse: a white shirt on a white background, or eye whites, would
     be punched out. So the rule is by size. A large enclosed pocket is
     background the fill couldn't reach; a small one is intentional detail. */
  /* minHolePct = Infinity disables the enclosed-pocket pass entirely, for art
     whose own colours sit inside `tol` of the background. bomb.png is the case:
     a white vest and cream trousers on a white field, the trousers only ~34
     away. Both are large enclosed regions, so the pass deleted his clothes. */
  const minHole = minHolePct === Infinity ? Infinity
                : Math.max(24, Math.round(w * h * minHolePct));
  const visited = new Uint8Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || visited[s]) continue;
    visited[s] = 1;
    if (!matches(s * 4)) continue;
    const cells = [s], q = [s];
    while (q.length) {
      const cur = q.pop();
      const cxp = cur % w, cyp = (cur / w) | 0;
      const nbs = [];
      if (cxp > 0)     nbs.push(cur - 1);
      if (cxp < w - 1) nbs.push(cur + 1);
      if (cyp > 0)     nbs.push(cur - w);
      if (cyp < h - 1) nbs.push(cur + w);
      for (const n of nbs) {
        if (visited[n] || seen[n]) continue;
        visited[n] = 1;
        if (!matches(n * 4)) continue;
        cells.push(n); q.push(n);
      }
    }
    if (cells.length >= minHole)
      for (const c of cells) { d[c * 4 + 3] = 0; seen[c] = 1; }
  }

  // soften the halo the key-out leaves along anti-aliased edges
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x, i = p * 4;
      if (d[i + 3] < 250 || seen[p]) continue;
      if (!(seen[p - 1] || seen[p + 1] || seen[p - w] || seen[p + w])) continue;
      const dr = d[i] - bg[0], dg = d[i + 1] - bg[1], db = d[i + 2] - bg[2];
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist < tol * 2) d[i + 3] = Math.round(255 * (dist / (tol * 2)));
    }
  }

  cx.putImageData(id, 0, 0);
  return cropTo(cv, d, w, h);
}

function cropTo(cv, d, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (d[(y * w + x) * 4 + 3] > 12) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
  if (x1 < 0) return { canvas: cv, w, h };
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const out = document.createElement('canvas');
  out.width = cw; out.height = ch;
  out.getContext('2d').drawImage(cv, x0, y0, cw, ch, 0, 0, cw, ch);
  return { canvas: out, w: cw, h: ch };
}

// Downscale to final size once, with smoothing on for quality, so the game
// loop never resamples. Two-step halving avoids the mush a single huge
// downscale produces.
function resizeTo(src, targetH) {
  let cur = src.canvas, cw = src.w, ch = src.h;
  const scale = targetH / ch;
  const tw = Math.max(1, Math.round(cw * scale)), th = Math.max(1, Math.round(targetH));

  while (ch > th * 2) {
    const nw = Math.max(th, Math.round(cw / 2)), nh = Math.max(th, Math.round(ch / 2));
    const tmp = document.createElement('canvas');
    tmp.width = nw; tmp.height = nh;
    const t = tmp.getContext('2d');
    t.imageSmoothingEnabled = true; t.imageSmoothingQuality = 'high';
    t.drawImage(cur, 0, 0, nw, nh);
    cur = tmp; cw = nw; ch = nh;
  }
  const out = document.createElement('canvas');
  out.width = tw; out.height = th;
  const o = out.getContext('2d');
  o.imageSmoothingEnabled = true; o.imageSmoothingQuality = 'high';
  o.drawImage(cur, 0, 0, tw, th);
  return { canvas: out, w: tw, h: th };
}

/* Aerial perspective for the backdrop: desaturate, then blend toward a pale
   sky tint. Without this the scenery has the same contrast and saturation as
   the characters standing in front of it, and the sprites disappear into it.
   Doing it once at load costs nothing per frame. */
function haze(src, amount, tint = [150, 190, 240], desat = 0.34) {
  const c = src.canvas;
  const x = c.getContext('2d', { willReadFrequently: true });
  let id;
  try { id = x.getImageData(0, 0, c.width, c.height); } catch (e) { return src; }
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    for (let k = 0; k < 3; k++) {
      const flat = d[i + k] + (lum - d[i + k]) * desat;
      d[i + k] = flat + (tint[k] - flat) * amount;
    }
  }
  x.putImageData(id, 0, 0);
  return src;
}

function placeholder(color, h) {
  const w = Math.round(h * 0.6);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  c.fillStyle = color;
  c.fillRect(1, Math.round(h * 0.32), w - 2, Math.round(h * 0.68));
  c.fillStyle = '#e8c39a';
  c.fillRect(Math.round(w * 0.22), Math.round(h * 0.06), Math.round(w * 0.56), Math.round(h * 0.28));
  c.fillStyle = 'rgba(0,0,0,.35)';
  c.fillRect(1, Math.round(h * 0.32), w - 2, 2);
  return { canvas: cv, w, h };
}

function loadSprite(key) {
  const def = SPRITES[key];
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const processed = def.raw
        ? { canvas: (() => {
              const c = document.createElement('canvas');
              c.width = img.naturalWidth; c.height = img.naturalHeight;
              c.getContext('2d').drawImage(img, 0, 0);
              return c;
            })(), w: img.naturalWidth, h: img.naturalHeight }
        : keyOutAndTrim(img, def.key || {});
      const sized = resizeTo(processed, def.h);
      /* def.haze is either a number (amount, level-1 pale-sky default) or
         {amount, tint, desat}. Level 2's backdrops are night scenes: pushing
         them back means darkening toward navy, not lightening toward sky —
         the pale preset flattens them into daylight grey. */
      if (!def.haze) return resolve(sized);
      const hz = typeof def.haze === 'number' ? { amount: def.haze } : def.haze;
      resolve(haze(sized, hz.amount, hz.tint, hz.desat));
    };
    img.onerror = () => {
      const s = placeholder(def.color || '#444', def.h);
      s.isPlaceholder = true;
      resolve(s);
    };
    img.src = def.src;
  });
}

const ART = {};
async function loadAll() {
  const keys = Object.keys(SPRITES);
  const out = await Promise.all(keys.map(loadSprite));
  keys.forEach((k, i) => ART[k] = out[i]);
}

/* ---------------------------------------------------------- audio */

const Sfx = (() => {
  let actx = null, muted = false;
  const ensure = () => (actx ||= new (window.AudioContext || window.webkitAudioContext)());

  function tone(freq, dur, type = 'square', gain = 0.05, slideTo = null) {
    if (muted) return;
    try {
      const a = ensure();
      const o = a.createOscillator(), g = a.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, a.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + dur);
      g.gain.setValueAtTime(gain, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      o.connect(g).connect(a.destination);
      o.start(); o.stop(a.currentTime + dur);
    } catch (e) { /* no audio device */ }
  }
  const seq = (notes, step = 90, type = 'square', gain = 0.05) =>
    notes.forEach(([f, d], i) => setTimeout(() => tone(f, d, type, gain), i * step));

  return {
    jump:  () => tone(300, 0.14, 'square', 0.045, 680),
    stomp: () => tone(220, 0.10, 'square', 0.06, 60),
    coin:  () => seq([[988, 0.06], [1319, 0.11]], 60),
    bump:  () => tone(150, 0.07, 'square', 0.05, 95),
    brick: () => tone(90, 0.14, 'sawtooth', 0.05, 40),
    hurt:  () => tone(300, 0.32, 'sawtooth', 0.055, 70),
    deny:  () => seq([[170, 0.10], [130, 0.10], [95, 0.22]], 85, 'sawtooth', 0.06),
    combo: n => tone(520 + n * 110, 0.10, 'square', 0.05),
    heli:  () => tone(60, 0.09, 'sawtooth', 0.035),
    gate:  () => seq([[220, .12], [330, .12], [494, .22]], 100, 'square', 0.05),
    charm: () => seq([[660, .10], [880, .16]], 95, 'triangle', 0.05),
    pit:   () => tone(260, 0.45, 'sawtooth', 0.06, 55),
    win:   () => seq([[523, .14], [659, .14], [784, .14], [1047, .30]], 130, 'triangle', 0.05),
    lose:  () => seq([[392, .18], [330, .18], [262, .40]], 170, 'triangle', 0.05),
    start: () => seq([[523, .09], [784, .09], [1047, .20]], 90, 'square', 0.05),
    toggle: () => (muted = !muted),
    get muted() { return muted; },
  };
})();

/* ---------------------------------------------------------- music

   Started from the keypress that leaves the title screen, never at load:
   browsers refuse audio until a real user gesture, and a play() call on page
   load just throws and leaves the track silently dead. */

const Music = (() => {
  let el = null, failed = false, muted = false;
  const ensure = () => {
    if (el || failed) return el;
    el = new Audio('assets/music.m4a');   // AAC: about a third the size of the mp3
    el.loop = true;
    el.volume = 0.4;
    el.addEventListener('error', () => { failed = true; console.warn('music: assets/music.m4a failed to load'); });
    return el;
  };
  return {
    start() {
      const a = ensure();
      if (!a) return;
      a.muted = muted;
      a.play().catch(e => console.warn('music: autoplay blocked —', e.name));
    },
    // Independent of the effects mute: the track is the loud one, and wanting
    // it off is not the same as wanting the coin blips off.
    toggle() { muted = !muted; if (el) el.muted = muted; return muted; },
    get muted() { return muted; },
    get playing() { return !!el && !el.paused; },
    get element() { return el; },
  };
})();

/* One-shot sample for the end of a run. Counts as an effect, not music, so it
   follows the effects mute (N) rather than the music mute (M). */
const Stinger = (() => {
  let el = null, failed = false;
  const ensure = () => {
    if (el || failed) return el;
    el = new Audio('assets/laugh.mp3');
    el.volume = 0.8;
    el.addEventListener('error', () => { failed = true; console.warn('laugh: assets/laugh.mp3 failed to load'); });
    return el;
  };
  return {
    /* onlyIfIdle matters for the proximity trigger: the clip runs 5.7s, far
       longer than it takes to walk past someone, so restarting it on every
       approach would stutter it constantly. Let it finish instead. */
    laugh({ onlyIfIdle = false } = {}) {
      if (Sfx.muted) return;
      const a = ensure();
      if (!a) return;
      if (onlyIfIdle && !a.paused && !a.ended) return;
      try { a.currentTime = 0; } catch (e) { /* not seekable yet */ }
      a.play().catch(() => { /* no gesture yet */ });
    },
    get playing() { return !!el && !el.paused && !el.ended; },
    get element() { return el; },
  };
})();

/* ---------------------------------------------------------- input */

const Input = {
  keys: new Set(), pressed: new Set(),
  down(c) { return this.keys.has(c); },
  justDown(c) { return this.pressed.has(c); },
  clearFrame() { this.pressed.clear(); },
  left()  { return this.down('ArrowLeft')  || this.down('KeyA'); },
  right() { return this.down('ArrowRight') || this.down('KeyD'); },
  sprint(){ return this.down('ShiftLeft')  || this.down('ShiftRight'); },
  crouch(){ return this.down('ArrowDown')  || this.down('KeyS'); },
  jumpHeld() { return this.down('Space') || this.down('ArrowUp') || this.down('KeyW') || this.down('KeyZ'); },
  jumpTap()  { return this.justDown('Space') || this.justDown('ArrowUp') || this.justDown('KeyW') || this.justDown('KeyZ'); },
  throwTap() { return this.justDown('KeyX') || this.justDown('KeyF'); },
  anyTap()   { return this.pressed.size > 0; },
};

addEventListener('keydown', e => {
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
  if (!Input.keys.has(e.code)) Input.pressed.add(e.code);
  Input.keys.add(e.code);
});
addEventListener('keyup', e => Input.keys.delete(e.code));

/* ---------------------------------------------------------- level */

const T = { AIR: 0, GROUND: 1, BRICK: 2, QUESTION: 3, USED: 4, PLATFORM: 5, PIPE: 6, GATE: 7, BRIDGE: 8 };

const LEVEL_1 = {
  w: 240, h: LEVEL_H,
  backdrops: [{ art: 'bg', fromX: 0, par: 0.34, tile: true }],
  subtitle: 'GAATAVISUPLE ACHARA',
  invincibleLabel: 'ACHARULI',
  card: [
    { t: 0.0, s: 'ADJARA WAS USURPED', c: '#e8e0d0', sc: 1 },
    { t: 0.5, s: 'BY SEPARATISTS',     c: '#e8e0d0', sc: 1 },
    { t: 1.8, s: '2004:',              c: '#ffd85e', sc: 2 },
  ],
  winLines: [['ASLANI GAIQTSA', '#ffd85e'], ['ACHARA TAVISUPALIA!', '#7ae07a']],
  start: { x: 3, y: 11 },
  finishX: 231,
  /* Endgame runs in clean stages so nothing overlaps:
       200  third mid boss
       206  his gate — opens when he dies
       210  pipe (a step to jump from during the fight)
       208+ boss arena: Aslan starts diving
       226  final gate — opens when Aslan is beaten
       231  flag                                                            */
  bossTriggerX: 128,   // he appears here and stalks you, out of reach
  bossArenaX: 208,     // only past here does he commit to dives you can punish

  /* 179-192 was a four-tile pit. It is now a FIFTEEN-tile ravine spanned by a
     bridge that gets blown as he steps on it, and the ultra powder that drops
     when it goes is the only way over.

     Fifteen, not thirteen. Thirteen looked right at 60fps - the powder double
     jump peaked one pixel short of the far lip - but dt is capped at 1/30, and
     at 30fps that same jump lands cleanly on the lip and skips the whole set
     piece. Measured at 60/50/30fps, sweeping every launch frame: at fifteen the
     powder fails at all three and the ultra crosses at all three, held or
     tapped. Seventeen is where the ultra itself starts falling short. */
  ground: [[0, 58], [62, 90], [94, 140], [144, 179], [194, 240]],
  bridge: { from: 179, to: 194, row: 13 },
  oldFlag: 'achara',       // act 1 flies Achara's flag, not the 1918 one

  blocks: [
    { x: 14, y: 9,  w: 1, t: T.QUESTION },
    { x: 18, y: 9,  w: 4, t: T.BRICK },
    { x: 20, y: 5,  w: 1, t: T.QUESTION },
    { x: 27, y: 9,  w: 3, t: T.BRICK },
    { x: 28, y: 9,  w: 1, t: T.QUESTION },
    { x: 36, y: 10, w: 4, t: T.PLATFORM },
    { x: 44, y: 8,  w: 3, t: T.PLATFORM },
    { x: 52, y: 9,  w: 2, t: T.QUESTION },

    { x: 66, y: 10, w: 3, t: T.PLATFORM },
    { x: 72, y: 8,  w: 3, t: T.PLATFORM },
    { x: 78, y: 6,  w: 3, t: T.PLATFORM },
    { x: 84, y: 9,  w: 4, t: T.BRICK },

    { x: 98,  y: 9,  w: 2, t: T.QUESTION },
    { x: 104, y: 10, w: 5, t: T.PLATFORM },
    { x: 113, y: 7,  w: 4, t: T.BRICK },
    { x: 122, y: 9,  w: 3, t: T.PLATFORM },
    { x: 131, y: 10, w: 4, t: T.PLATFORM },

    { x: 150, y: 9,  w: 3, t: T.PLATFORM },
    { x: 157, y: 7,  w: 3, t: T.PLATFORM },
    /* Split around the pipe at 165-166. The run used to span 164-167, which
       put two of its tiles flat on the pipe cap with zero headroom under
       them - unbumpable, and the ? among them was uncollectable. Moving that
       pipe back to 165 for the ravine run-up is what put it there. */
    { x: 164, y: 9,  w: 1, t: T.BRICK },
    { x: 167, y: 9,  w: 3, t: T.BRICK },
    { x: 169, y: 9,  w: 1, t: T.QUESTION },
    { x: 173, y: 10, w: 3, t: T.PLATFORM },

    { x: 196, y: 10, w: 4, t: T.PLATFORM },
    { x: 204, y: 8,  w: 2, t: T.BRICK },   // trimmed to keep column 206 clear for the gate
    { x: 214, y: 10, w: 3, t: T.PLATFORM },
    { x: 221, y: 9,  w: 3, t: T.PLATFORM },
  ],

  pipes: [
    { x: 31,  y: 11, h: 2 },
    { x: 48,  y: 11, h: 2 },
    { x: 110, y: 11, h: 2 },
    /* Was at 176. That put a wall one tile short of the ravine: he cleared the
       pipe, landed on the single tile at 178 and was already over the edge,
       with no ground to build up the speed the crossing needs. */
    { x: 165, y: 10, h: 3 },
    { x: 210, y: 11, h: 2 },
  ],

  coinRuns: [
    { x: 8,   y: 10, n: 4 }, { x: 19,  y: 7,  n: 3 },
    { x: 37,  y: 8,  n: 3 }, { x: 44,  y: 6,  n: 3 },
    { x: 58,  y: 9,  n: 4 }, { x: 73,  y: 6,  n: 3 },
    { x: 79,  y: 4,  n: 3 }, { x: 90,  y: 9,  n: 4 },
    { x: 105, y: 8,  n: 5 }, { x: 114, y: 5,  n: 4 },
    { x: 132, y: 8,  n: 4 }, { x: 140, y: 9,  n: 4 },
    // 170 not 166, and 200 not 201: both used to run into the masonry beside
    // them and spawn coins inside solid tiles, where they cannot be collected
    { x: 158, y: 5,  n: 3 }, { x: 170, y: 9,  n: 4 },
    { x: 195, y: 9,  n: 4 }, { x: 200, y: 8,  n: 4 },
    { x: 215, y: 8,  n: 3 },
  ],

  // khachapuri = temporary invincibility, rose = heal one heart.
  // Placed just before the hard sections rather than inside them.
  /* Powder sits ahead of every boss so a death is never a walk back in
     without it, and ahead of the tall stretches it exists to open up. */
  items: [
    { x: 40,  y: 8,  t: 'rose' },
    { x: 50,  y: 10, t: 'powder' },      // before the first mid boss
    { x: 70,  y: 9,  t: 'khachapuri' },
    { x: 100, y: 10, t: 'rose' },
    { x: 118, y: 10, t: 'powder' },      // before the boss trigger
    { x: 154, y: 10, t: 'powder' },      // before the second mid boss
    { x: 158, y: 6,  t: 'rose' },
    /* Past the landing, not on it. At 195 it sat one tile off the far lip and
       handed the double jump straight back, so any later fall was re-crossed
       with powder+ultra rather than the ultra alone. */
    { x: 199, y: 9,  t: 'powder' },      // before the third mid boss
    { x: 202, y: 9,  t: 'khachapuri' },
    { x: 212, y: 10, t: 'powder' },      // inside the arena, before Aslan
    { x: 218, y: 9,  t: 'rose' },
  ],

  // Flagpoles flying the old republic flag; touching one changes it over.
  flags: [12, 45, 76, 108, 145, 171, 218],   // 171 not 186: 186 is over the ravine now

  // Placed to make a stretch awkward rather than to pad it out: on the run-up
  // to a gap, beside a gate, and in the boss arena.
  /* Keep these well clear of pit edges. One at 56 sat two tiles from the gap
     at 58-62 and her pull dragged the player over the edge — then the respawn
     put him back inside her radius, so she pulled him straight in again. An
     unbreakable loop that drained a heart per cycle. See validateLevel(). */
  /* 203 not 198: the ultra crossing lands him around 195 and her pull radius
     is 62px, so at 198 she caught him the instant he completed the one jump
     the act forces him to make. */
  charmers: [30, 42, 106, 168, 203],   // 106 not 102: clear of the gate at 101

  /* Each mid boss holds a gate shut. `gate` is the tile column that stays
     solid until he dies, so the level cannot be run past — every mid boss is
     a required fight, not scenery. Gate columns are checked to be clear of
     other geometry; each is full height so it cannot be jumped or platformed
     over (a gate 5 tiles proud of the floor would still lose to a 3.9-tile
     jump off a nearby platform). */
  enemies: [
    { t: 'walker', x: 22 },  { t: 'walker', x: 34 },
    { t: 'walker', x: 46 },  { t: 'walker', x: 54 },
    { t: 'walker', x: 70 },  { t: 'walker', x: 80 },
    { t: 'mid',    x: 86,  gate: 101 },   // clear of the pit at 90-94; landing room first
    { t: 'walker', x: 100 }, { t: 'walker', x: 118 },
    { t: 'walker', x: 126 }, { t: 'walker', x: 134 },
    { t: 'mid',    x: 152, gate: 161 },
    { t: 'walker', x: 162 }, { t: 'walker', x: 170 },
    { t: 'walker', x: 172 },
    { t: 'mid',    x: 200, gate: 206 },
    { t: 'walker', x: 208 },
  ],

  // Opens only when Aslan is beaten, so the flag cannot be reached by walking
  // past the fight.
  finalGate: 226,
};


/* ---------------------------------------------------------- level 2

   The television company. A long interior: corridors and newsroom floor, then
   the studio itself for the fight. Both backdrops tile - at LEVEL_H_PX they
   come out exactly 320 wide, which is VIEW_W, so an anchored zone would have
   no width left to drift into and would tear at the right edge.

   No flagpoles indoors: LEVEL.smashKind puts studio monitors along the route
   instead, same one-touch-each contract. */
const LEVEL_2 = {
  w: 196, h: LEVEL_H,
  start: { x: 3, y: 11 },
  finishX: null,            // beating the Anchor ends the act
  finalGate: null,
  voidColor: '#080a12',
  subtitle: 'GAATAVISUPLE MEDIA',
  card: [
    { t: 0.0, s: 'THEN THEY CAME',   c: '#e8e0d0', sc: 1 },
    { t: 0.5, s: 'FOR THE NEWSROOM', c: '#e8e0d0', sc: 1 },
    { t: 1.8, s: '2007 NOVEMBER:',   c: '#ffd85e', sc: 2 },
  ],
  invincibleLabel: 'MATSONI',
  smashKind: 'tv',
  heroRose: false,          // no rose in hand on the newsroom raid
  arenaX: 158,              // past here the Anchor commits
  winLines: [['BROADCAST', '#ffd85e'], ['INTERRUPTED', '#7ae07a']],
  afterLines: [
    ['FREEING TV WAS ONE OF THE KEY MOMENTS', '#cfd8e8'],
    ['FOR RESTORING DEMOCRACY',              '#cfd8e8'],
  ],

  backdrops: [
    { art: 'l2hall',   fromX: 0,   par: 0.34, tile: true },
    { art: 'l2studio', fromX: 152, par: 0.22, tile: true },
  ],

  ground: [[0, 46], [50, 92], [96, 140], [144, 196]],

  blocks: [
    { x: 10, y: 9,  w: 1, t: T.QUESTION },
    { x: 16, y: 10, w: 3, t: T.PLATFORM },
    { x: 24, y: 9,  w: 3, t: T.BRICK },
    { x: 32, y: 10, w: 4, t: T.PLATFORM },
    { x: 40, y: 9,  w: 1, t: T.QUESTION },

    { x: 54, y: 10, w: 4, t: T.PLATFORM },
    { x: 62, y: 9,  w: 3, t: T.BRICK },
    { x: 64, y: 9,  w: 1, t: T.QUESTION },
    { x: 72, y: 10, w: 3, t: T.PLATFORM },
    { x: 80, y: 8,  w: 3, t: T.PLATFORM },

    { x: 100, y: 10, w: 4, t: T.PLATFORM },
    { x: 108, y: 9,  w: 3, t: T.BRICK },
    { x: 118, y: 10, w: 3, t: T.PLATFORM },
    { x: 126, y: 9,  w: 2, t: T.QUESTION },
    { x: 133, y: 8,  w: 3, t: T.PLATFORM },

    { x: 148, y: 10, w: 3, t: T.PLATFORM },
    /* The studio is VERTICAL, and deliberately not act 3's arena.

       Parliament is a symmetric three-tier staircase you climb to reach the
       man standing on top of it, and act 2 had been built as the same shape
       with different art: low riser, wide middle, low riser. Here the Anchor
       owns the FLOOR and never leaves it - he ignores one-way tiles like every
       other enemy - while the desk and the lighting gantries above are yours.
       One camera is down on his floor, in his fire; the other two are up in
       the rigging. So the fight is a climb and two descents rather than a
       staircase.

       Heights are chosen so the route is forced: a 69px jump reaches y=139
       from the floor, which clears the desk at 176 but NOT gantry A at 128.
       You have to go floor -> desk -> gantry. */
    { x: 170, y: 11, w: 5, t: T.PLATFORM },   // the news desk
    { x: 176, y: 9,  w: 4, t: T.PLATFORM },   // lighting gantry, low
    { x: 181, y: 7,  w: 4, t: T.PLATFORM },   // lighting gantry, high
  ],

  pipes: [
    { x: 28, y: 11, h: 2 },
    { x: 88, y: 11, h: 2 },
    { x: 130, y: 11, h: 2 },
  ],

  coinRuns: [
    { x: 6,   y: 10, n: 4 }, { x: 17,  y: 8,  n: 3 },
    { x: 33,  y: 8,  n: 4 }, { x: 46,  y: 9,  n: 4 },
    { x: 55,  y: 8,  n: 4 }, { x: 73,  y: 8,  n: 3 },
    { x: 92,  y: 9,  n: 4 }, { x: 101, y: 8,  n: 4 },
    { x: 119, y: 8,  n: 3 }, { x: 140, y: 9,  n: 4 },
    { x: 149, y: 8,  n: 3 }, { x: 170, y: 8,  n: 6 },
  ],

  enemies: [
    { t: 'l2girl',  x: 14 }, { t: 'l2man',   x: 22 },
    { t: 'l2girl2', x: 34 }, { t: 'l2girl',  x: 42 },
    { t: 'l2man',   x: 58 }, { t: 'l2girl2', x: 66 },
    { t: 'l2girl',  x: 76 }, { t: 'l2man',   x: 84 },
    { t: 'l2girl2', x: 102 }, { t: 'l2girl', x: 110 },
    { t: 'l2man',   x: 120 }, { t: 'l2girl2', x: 128 },
    { t: 'l2girl',  x: 146 }, { t: 'l2man',  x: 154 },
    /* One feed per level of the room: his floor, the desk, the high gantry.
       Each is a different traversal problem, which is the point of the space. */
    { t: 'l2camera', x: 159 },    // on the floor, in his fire
    { t: 'l2camera', x: 172 },    // on the news desk
    { t: 'l2camera', x: 182 },    // up in the rigging
    { t: 'l2anchor', x: 174 },
  ],

  items: [
    { x: 20,  y: 8,  t: 'rose' },
    { x: 36,  y: 8,  t: 'matsoni' },
    { x: 56,  y: 8,  t: 'powder' },
    { x: 74,  y: 8,  t: 'rose' },
    { x: 102, y: 8,  t: 'powder' },
    { x: 120, y: 8,  t: 'rose' },
    { x: 134, y: 7,  t: 'matsoni' },
    { x: 150, y: 8,  t: 'powder' },
    { x: 156, y: 10, t: 'rose' },
  ],

  flags: [8, 30, 60, 86, 112, 138, 160],   // televisions, see smashKind
  charmers: [26, 70, 116],
};


/* ---------------------------------------------------------- level 3

   Rustaveli Avenue, November 2003. Three backdrop zones: two stretches of the
   avenue, then the Parliament for the final fight. Each intermediate boss
   holds a gate, same contract as level 1.

   Arena drift check (the untiled zone's hard constraint): camMax is
   232*16-320 = 3392, the camera on arena entry is about 2816, so the far
   layer drifts (3392-2816)*0.15 = 86px. The art must cover VIEW_W + drift =
   406px and l2_arena is 525 wide. At level 1's 0.34 it would need 516 and
   very nearly run off the right edge.                                     */
const LEVEL_3 = {
  w: 232, h: LEVEL_H,
  start: { x: 3, y: 11 },
  finishX: null,           // no flag: beating Dardubala is the finish
  finalGate: null,
  voidColor: '#0a0c16',
  subtitle: 'GAATAVISUPLE PARLAMENTI',
  card: [
    { t: 0.0, s: 'BUT EVERYTHING STARTED', c: '#e8e0d0', sc: 1 },
    { t: 0.5, s: 'WITH ROSES....',         c: '#e8e0d0', sc: 1 },
    { t: 1.8, s: '2003 NOVEMBER:',         c: '#ffd85e', sc: 2 },
  ],
  invincibleLabel: 'HOT TEA',
  crowd: true,             // act 2 only: the street turns out behind you
  winLines: [['REVOLUTSIA!', '#7ae07a']],
  /* The last act, so this is the run's ending rather than an interlude. It
     gets room to breathe: one line at a time, and the restart prompt waits
     until the last of them has landed. */
  afterLines: [
    ['THIS IS HOW ALL STARTED. THE GREATNESS.',    '#e8e0d0'],
    ['', null],
    ['SOMETIMES ITS SUN AND GOOD WEATHER..',       '#cfd8e8'],
    ["SOMETIMES WE STRUGGLE SOMETIMES WE'RE HAPPY", '#cfd8e8'],
    ['GOOD WEATHER OR NOT..',                      '#cfd8e8'],
    ['...',                                        '#8890a4'],
  ],

  backdrops: [
    { art: 'l3bg',    fromX: 0,   par: 0.34, tile: true },
    { art: 'l3bg2',   fromX: 84,  par: 0.34, tile: true },
    { art: 'l3arena', fromX: 186, par: 0.15, tile: false, anchorX: 176 },
  ],

  ground: [[0, 58], [62, 104], [108, 152], [156, 232]],

  blocks: [
    { x: 12, y: 9,  w: 1, t: T.QUESTION },
    { x: 18, y: 10, w: 3, t: T.PLATFORM },
    { x: 26, y: 9,  w: 3, t: T.BRICK },
    { x: 33, y: 10, w: 3, t: T.PLATFORM },
    { x: 52, y: 9,  w: 2, t: T.QUESTION },

    { x: 66, y: 10, w: 4, t: T.PLATFORM },
    { x: 74, y: 9,  w: 3, t: T.BRICK },
    { x: 88, y: 10, w: 3, t: T.PLATFORM },
    { x: 96, y: 9,  w: 1, t: T.QUESTION },

    { x: 114, y: 10, w: 4, t: T.PLATFORM },
    { x: 122, y: 9,  w: 3, t: T.BRICK },
    { x: 130, y: 10, w: 3, t: T.PLATFORM },
    { x: 142, y: 9,  w: 2, t: T.QUESTION },

    { x: 160, y: 10, w: 4, t: T.PLATFORM },
    { x: 168, y: 9,  w: 3, t: T.BRICK },
    { x: 176, y: 10, w: 3, t: T.PLATFORM },
    // the Parliament steps: three tiers the fight climbs
    { x: 196, y: 11, w: 6, t: T.PLATFORM },
    { x: 200, y: 9,  w: 14, t: T.PLATFORM },   // his stage: 8 tiles was too cramped to fight on
    { x: 214, y: 11, w: 6, t: T.PLATFORM },
  ],

  pipes: [
    { x: 44, y: 11, h: 2 },
    { x: 110, y: 11, h: 2 },
    { x: 164, y: 11, h: 2 },
  ],

  coinRuns: [
    { x: 7,   y: 10, n: 4 }, { x: 19,  y: 8,  n: 3 },
    { x: 34,  y: 8,  n: 3 }, { x: 58,  y: 9,  n: 4 },
    { x: 67,  y: 8,  n: 4 }, { x: 78,  y: 7,  n: 3 },
    { x: 104, y: 9,  n: 4 }, { x: 115, y: 8,  n: 4 },
    { x: 131, y: 8,  n: 3 }, { x: 152, y: 9,  n: 4 },
    { x: 161, y: 8,  n: 4 }, { x: 177, y: 8,  n: 3 },
    { x: 197, y: 9,  n: 5 }, { x: 215, y: 9,  n: 5 },
  ],

  enemies: [
    { t: 'l3guard', x: 16 }, { t: 'l3guard', x: 24 }, { t: 'l3guard', x: 31 },
    { t: 'l3sleepy', x: 40, gate: 48 },
    { t: 'l3guard', x: 54 }, { t: 'l3guard', x: 68 }, { t: 'l3guard', x: 76 },
    { t: 'l3guard', x: 82 },
    { t: 'l3svani', x: 92, gate: 98 },
    { t: 'l3guard', x: 112 }, { t: 'l3guard', x: 120 }, { t: 'l3guard', x: 128 },
    { t: 'l3guard', x: 134 },
    { t: 'l3bomber', x: 140, gate: 146 },
    { t: 'l3guard', x: 158 }, { t: 'l3guard', x: 170 }, { t: 'l3guard', x: 180 },
    { t: 'l3dard', x: 207 },
  ],

  items: [
    { x: 22,  y: 8,  t: 'rose' },
    { x: 36,  y: 10, t: 'powder' },
    { x: 38,  y: 8,  t: 'tea' },
    { x: 70,  y: 8,  t: 'rose' },
    { x: 89,  y: 8,  t: 'powder' },
    { x: 118, y: 8,  t: 'rose' },
    { x: 136, y: 10, t: 'powder' },
    { x: 172, y: 8,  t: 'rose' },
    { x: 190, y: 10, t: 'powder' },
    { x: 193, y: 10, t: 'tea' },
  ],

  flags: [10, 50, 80, 126, 175, 200],
  // cut to a third on playtest feedback: four of them along one avenue was
  // more interruption than hazard
  charmers: [124],
};

/* `LEVEL` is read from ~40 places and written from none, so two levels costs
   one keyword: a `let` plus a selector. Everything downstream keeps reading
   LEVEL.* and does not care which act it is in. */
const LEVELS = [LEVEL_1, LEVEL_2, LEVEL_3];
let LEVEL = LEVEL_1;

/* Which class each `t` in LEVEL.enemies builds. Was a hardcoded ternary on
   'mid'; level 2 has a different roster and no MidBoss at all.

   A function, not a const object: the classes are declared several hundred
   lines below this point, and a module-level object literal would evaluate
   here and hit the temporal dead zone. The body only runs at spawn time. */
function enemyKind(t) {
  return ({
    walker: Walker, mid: MidBoss,
    l2girl: PressGirl, l2girl2: PressGirl2, l2man: PressMan,
    l2anchor: Anchor, l2camera: StudioCamera,
    l3guard: Guard, l3sleepy: Sleepy, l3svani: Svani,
    l3bomber: Bomber, l3dard: Dardubala,
  })[t] || Walker;
}

function loadLevel(i) {
  game.levelIndex = clamp(i, 0, LEVELS.length - 1);
  LEVEL = LEVELS[game.levelIndex];
}

let grid;

function buildGrid() {
  grid = new Uint8Array(LEVEL.w * LEVEL.h);
  const set = (x, y, t) => {
    if (x < 0 || y < 0 || x >= LEVEL.w || y >= LEVEL.h) return;
    grid[y * LEVEL.w + x] = t;
  };
  for (const [a, b] of LEVEL.ground)
    for (let x = a; x < b; x++) { set(x, 13, T.GROUND); set(x, 14, T.GROUND); }
  for (const b of LEVEL.blocks)
    for (let i = 0; i < b.w; i++) set(b.x + i, b.y, b.t);
  for (const p of LEVEL.pipes)
    for (let i = 0; i < p.h; i++) { set(p.x, p.y + i, T.PIPE); set(p.x + 1, p.y + i, T.PIPE); }
  // Laid flush with the ground either side, so it reads as a road and not as a
  // platform to climb. Taking it away is what opens the ravine.
  if (LEVEL.bridge)
    for (let x = LEVEL.bridge.from; x < LEVEL.bridge.to; x++) set(x, LEVEL.bridge.row, T.BRIDGE);

  for (const e of LEVEL.enemies) if (e.gate != null) raiseGate(e.gate);
  if (LEVEL.finalGate != null) raiseGate(LEVEL.finalGate);
}

// Full-height barrier: rows 0..12, floor is 13.
function raiseGate(gx) {
  for (let ty = 0; ty <= 12; ty++) grid[ty * LEVEL.w + gx] = T.GATE;
}

function openGate(gx, label = 'THE WAY IS OPEN') {
  let opened = false;
  for (let ty = 0; ty <= 12; ty++) {
    const i = ty * LEVEL.w + gx;
    if (grid[i] !== T.GATE) continue;
    grid[i] = T.AIR;
    opened = true;
    burst(gx * TILE + 8, ty * TILE + 8, 3,
          { colors: ['#b9c2d0', '#6d7688', '#fff'], speed: 90, life: 0.7, size: 2 });
  }
  if (!opened) return;
  shake = 6; flash = 0.35;
  floatText(gx * TILE + 8, 8 * TILE, label, '#7ae07a');
  Sfx.gate();
}

/* Placement sanity check, run once at boot.

   Anything that holds or pulls the player near a gap is a trap: a charmer two
   tiles from an edge dragged him in, and the respawn dropped him back inside
   her radius to be dragged in again. Cheap to check, so check it rather than
   rely on remembering while editing the level by hand. */
function validateLevel() {
  const pits = [];
  const sorted = [...LEVEL.ground].sort((a, b) => a[0] - b[0]);
  for (let i = 0; i + 1 < sorted.length; i++) pits.push([sorted[i][1], sorted[i + 1][0]]);

  const nearPit = (tx, pad) =>
    pits.some(([a, b]) => tx >= a - pad && tx <= b + pad);

  const warn = [];
  for (const tx of LEVEL.charmers)
    if (nearPit(tx, 4)) warn.push(`charmer at ${tx} is within 4 tiles of a pit`);
  for (const it of LEVEL.items)
    if (nearPit(it.x, 2)) warn.push(`item '${it.t}' at ${it.x} is within 2 tiles of a pit`);
  for (const e of LEVEL.enemies)
    if (e.gate != null && nearPit(e.gate, 1)) warn.push(`gate at ${e.gate} is on a pit edge`);
  if (LEVEL.finalGate != null && nearPit(LEVEL.finalGate, 1))
    warn.push(`final gate at ${LEVEL.finalGate} is on a pit edge`);

  /* A brick or ? needs room underneath for the player to stand and jump into
     it. Anything flat on a pipe cap or on the ground can never be bumped, and
     a ? there is a pickup nobody can reach. Caught after a pipe was moved
     under an existing brick row and quietly bricked up its own ? block. */
  const HEAD = hitboxFor('hero').h;
  for (let ty = 0; ty < LEVEL.h; ty++)
    for (let tx = 0; tx < LEVEL.w; tx++) {
      const t = grid[ty * LEVEL.w + tx];
      if (t !== T.BRICK && t !== T.QUESTION) continue;
      let air = 0;
      for (let k = ty + 1; k < LEVEL.h; k++) {
        const u = grid[k * LEVEL.w + tx];
        if (isSolid(u) || isOneWay(u)) break;
        air++;
      }
      if (air * TILE < HEAD)
        warn.push(`${t === T.BRICK ? 'brick' : '?'} at ${tx},${ty} has ${air * TILE}px under it — cannot be bumped`);
    }

  // ...and nothing collectable should be spawned inside a solid tile
  for (const r of LEVEL.coinRuns || [])
    for (let k = 0; k < r.n; k++)
      if (isSolid(grid[r.y * LEVEL.w + (r.x + k)]))
        warn.push(`coin at ${r.x + k},${r.y} is inside a solid tile`);
  for (const it of LEVEL.items)
    if (isSolid(grid[it.y * LEVEL.w + it.x]))
      warn.push(`item '${it.t}' at ${it.x},${it.y} is inside a solid tile`);

  /* The crouch has to open a gap a bullet fits through. If the squat hitbox
     is ever retuned without moving BULLET.ride, the dodge silently stops
     working - so it is checked rather than assumed. */
  if (ART.squat && ART.hero) {
    const stand = hitboxFor('hero').h, crouch = hitboxFor('squat').h;
    const top = BULLET.ride, bot = BULLET.ride - BULLET.h;
    if (top >= stand) warn.push(`bullet rides at ${top}px, above a ${stand}px standing box — unhittable`);
    if (bot <= crouch) warn.push(`bullet bottom at ${bot}px is inside a ${crouch}px crouch box — cannot be ducked`);
  }

  for (const L of (LEVEL.card || [])) {
    const w = textWidth(L.s, L.sc);
    if (w > VIEW_W - 16) warn.push(`card line "${L.s}" is ${w}px, wider than the screen`);
  }

  if (warn.length) console.warn('level placement:\n  ' + warn.join('\n  '));
  return warn;
}

const tileAt = (tx, ty) =>
  (tx < 0 || ty < 0 || tx >= LEVEL.w || ty >= LEVEL.h) ? T.AIR : grid[ty * LEVEL.w + tx];
const isSolid  = t => t === T.GROUND || t === T.BRICK || t === T.QUESTION || t === T.USED || t === T.PIPE || t === T.GATE || t === T.BRIDGE;
const isOneWay = t => t === T.PLATFORM;

function groundYAt(tx) {
  for (let ty = 0; ty < LEVEL.h; ty++) {
    const t = tileAt(tx, ty);
    if (isSolid(t) || isOneWay(t)) return ty * TILE;
  }
  return (LEVEL.h - 2) * TILE;
}

/* First surface at or below a given height in one column.

   groundYAt returns the TOPMOST surface in the column, which is wrong for
   anything that needs the floor an entity is actually standing on: near a
   raised platform it reports the platform even when you are on the ground
   beneath it. Returns null when the column is a pit. */
function groundBelow(px, fromY) {
  const tx = Math.floor(px / TILE);
  if (tx < 0 || tx >= LEVEL.w) return null;
  for (let ty = Math.max(0, Math.floor(fromY / TILE)); ty < LEVEL.h; ty++) {
    const t = tileAt(tx, ty);
    if (isSolid(t) || isOneWay(t)) return ty * TILE;
  }
  return null;
}

/* ---------------------------------------------------------- effects */

let particles = [], floats = [], bumps = [];
let shake = 0, freeze = 0, flash = 0;

function burst(x, y, n, opts = {}) {
  const { colors = ['#ffd85e', '#e8434f', '#fff'], speed = 90, life = 0.55,
          size = 2, grav = 470, spread = Math.PI * 2, dir = 0 } = opts;
  for (let i = 0; i < n; i++) {
    const a = dir + rand(-spread / 2, spread / 2);
    const s = rand(speed * 0.35, speed);
    particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: rand(life * 0.6, life), max: life,
      size: Math.max(1, Math.round(rand(size * 0.6, size))),
      color: pick(colors), grav,
    });
  }
}

function floatText(x, y, text, color = '#fff', s = 1, life = 0.9) {
  floats.push({ x, y, text, color, s, life, max: life });
}

function updateEffects(dt) {
  for (const p of particles) {
    p.vy += p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.99; p.life -= dt;
  }
  particles = particles.filter(p => p.life > 0);
  // the slow drift is for +100s; a held line like SAXLSHIIIIIIII would walk
  // right off the top of the buffer over two and a half seconds
  for (const f of floats) { if (f.max <= 1.2) f.y -= 16 * dt; f.life -= dt; }
  floats = floats.filter(f => f.life > 0);
  shake = Math.max(0, shake - dt * 14);
  flash = Math.max(0, flash - dt * 3.4);
}

/* ---------------------------------------------------------- entities */

class Entity {
  constructor(x, y, w, h) {
    Object.assign(this, { x, y, w, h, vx: 0, vy: 0, onGround: false, dead: false, face: 1 });
  }
  get cx() { return this.x + this.w / 2; }
  get bottom() { return this.y + this.h; }
}

/* Punching a block from underneath kills whatever is standing on it. The
   classic rule: the enemy has to actually be resting on that specific tile,
   so overlap in x plus a bottom edge within a few pixels of the tile top. */
function bumpEnemiesOn(tx, ty) {
  const top = ty * TILE, x0 = tx * TILE, x1 = x0 + TILE;
  // Snapshot: damaging the mid boss spawns dogs mid-loop, and they would
  // otherwise be tested against the same bump and die on release.
  for (const e of [...game.enemies]) {
    if (e.dead || !e.onBumped) continue;
    if (e.x + e.w < x0 - 1 || e.x > x1 + 1) continue;
    if (Math.abs(e.bottom - top) > 3) continue;
    e.onBumped();
  }
}

/* Would a box of this size overlap anything solid? Used to refuse to stand up
   under a ceiling - without it, releasing crouch in a one-tile gap warps the
   hero's head into the tile above and the vertical sweep shoves him through
   the floor. */
function boxHitsSolid(x, y, w, h) {
  const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 1) / TILE);
  const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 1) / TILE);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++)
      if (isSolid(tileAt(tx, ty))) return true;
  return false;
}

/* Standing on a one-way platform and nothing else - the only place dropping
   through means anything. */
function onOneWayOnly(e) {
  const by = Math.round(e.bottom);
  const ty = Math.floor((by + 0.5) / TILE);
  if (Math.abs(by - ty * TILE) > 1.6) return false;
  let found = false;
  for (let tx = Math.floor(e.x / TILE); tx <= Math.floor((e.x + e.w - 1) / TILE); tx++) {
    const t = tileAt(tx, ty);
    if (isSolid(t)) return false;      // real floor under him too: nothing to drop through
    if (isOneWay(t)) found = true;
  }
  return found;
}

function hitboxFor(key) {
  const a = ART[key], d = SPRITES[key];
  return { w: Math.max(4, Math.round(a.w * d.hitW)), h: Math.max(4, Math.round(a.h * d.hitH)) };
}

function moveAndCollide(e, dt, { oneWay = true } = {}) {
  const prevBottom = e.bottom;

  e.x += e.vx * dt;
  let x0 = Math.floor(e.x / TILE), x1 = Math.floor((e.x + e.w - 1) / TILE);
  let y0 = Math.floor(e.y / TILE), y1 = Math.floor((e.y + e.h - 1) / TILE);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) {
      if (!isSolid(tileAt(tx, ty))) continue;
      if (e.vx > 0)      { e.x = tx * TILE - e.w; e.vx = 0; e.hitWall = true; }
      else if (e.vx < 0) { e.x = (tx + 1) * TILE; e.vx = 0; e.hitWall = true; }
    }

  e.y += e.vy * dt;
  e.onGround = false;
  x0 = Math.floor(e.x / TILE); x1 = Math.floor((e.x + e.w - 1) / TILE);
  y0 = Math.floor(e.y / TILE); y1 = Math.floor((e.y + e.h - 1) / TILE);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) {
      const t = tileAt(tx, ty);
      if (isOneWay(t)) {
        if (!oneWay || e.vy < 0) continue;
        const top = ty * TILE;
        if (prevBottom > top + 1) continue;
        e.y = top - e.h; e.vy = 0; e.onGround = true;
        continue;
      }
      if (!isSolid(t)) continue;
      if (e.vy > 0) { e.y = ty * TILE - e.h; e.vy = 0; e.onGround = true; }
      else if (e.vy < 0) {
        e.y = (ty + 1) * TILE; e.vy = 0;
        if (e.onBumpTile) e.onBumpTile(tx, ty, t);
      }
    }

  /* Ground probe.

     The sweep above tests the row containing y + h - 1. A resting entity has
     its bottom exactly on a tile boundary, so that row is the one ABOVE the
     floor and the floor is never seen — the entity has to sink a full pixel
     before it collides. That makes onGround flicker false/true every few
     frames, which re-fires landing effects continuously and, because the
     landing squash rescales the sprite, shows up as the character vibrating.
     Probing the boundary directly is what keeps a standing entity standing. */
  if (!e.onGround && e.vy >= 0) {
    const by = e.y + e.h;
    const ty = Math.floor((by + 0.5) / TILE);
    if (Math.abs(by - ty * TILE) < 1.6) {
      const x0 = Math.floor(e.x / TILE), x1 = Math.floor((e.x + e.w - 1) / TILE);
      for (let tx = x0; tx <= x1; tx++) {
        const t = tileAt(tx, ty);
        // the probe re-grabs one-way tiles too, so a drop-through has to be
        // honoured here as well or he is pinned back the frame he lets go
        if (!oneWay && isOneWay(t) && !isSolid(t)) continue;
        if (isSolid(t) || isOneWay(t)) {
          e.onGround = true;
          // Pin it. Flagging alone was not enough: gravity still accumulates
          // each frame, so a "resting" entity sinks ~1.4px over three frames
          // before the sweep above catches it and snaps it back. That sawtooth
          // is sub-pixel, but Math.round() on the draw position turns it into a
          // 1px flicker — every character bobbing up and down continuously.
          e.y = ty * TILE - e.h;
          e.vy = 0;
          break;
        }
      }
    }
  }
}

class Player extends Entity {
  constructor(x, y) {
    const hb = hitboxFor('hero');
    super(x, y, hb.w, hb.h);
    this.hp = 3; this.maxHp = 3; this.coins = 0;
    this.invuln = 0; this.invincible = 0; this.coyote = 0; this.buffer = 0;
    this.runT = 0; this.combo = 0;
    this.charmed = 0; this.charmPull = 0; this.charmSlow = false; this.charmImmune = 0;
    this.doubleJumpT = 0; this.airJumps = 0;
    // A charge, not a timer: it is there to clear one specific gap once.
    this.ultra = 0; this.ultraFlight = false;
    /* Crouching swaps the hitbox height only - never the width. A narrower box
       mid-crouch would let him slide into gaps he cannot stand up out of. */
    this.crouching = false; this.dropT = 0;
    this.standH = hb.h;
    this.crouchH = hitboxFor('squat').h;
    this.extra = 0; this.extraT = 0;
    this.roses = 0; this.throwCd = 0; this.throwHint = 0; this.hasThrown = false;
    // Squash/stretch are short discrete timers, not a continuous lerp. A lerp
    // rescales the sprite every frame, and at 4x upscale each 1px change in
    // the rounded draw size is a visible 4px jolt — it reads as vibration.
    this.squashT = 0; this.stretchT = 0;
  }

  /* Every path that costs health goes through this, so a rose heart is
     always the thing that breaks first. It used to live inline in hurt(),
     which meant fellInPit() - a second, separate damage path - took a real
     heart straight off the top while rose hearts sat there untouched. */
  spendHeart() {
    if (this.extra > 0) {
      this.extra--;
      if (this.extra === 0) this.extraT = 0;
      floatText(this.cx, this.y - 12, '-1 ROSE', '#ff8fd0');
      burst(this.cx, this.y + this.h / 2, 12, { colors: ['#ff8fd0', '#fff'], speed: 100 });
      return 'rose';
    }
    this.hp--;
    return 'heart';
  }

  hurt(fromX) {
    if (this.invuln > 0 || this.invincible > 0 || game.state !== 'play') return;
    if (this.spendHeart() === 'rose') {
      this.invuln = CFG.hurtInvuln;
      this.vy = -150;
      this.vx = (this.cx < fromX ? -1 : 1) * 110;
      shake = 4; flash = 0.4; Sfx.hurt();
      return;
    }
    this.invuln = CFG.hurtInvuln;
    this.vy = -150;
    this.vx = (this.cx < fromX ? -1 : 1) * 110;
    shake = 4; flash = 0.55; Sfx.hurt();
    burst(this.cx, this.y + this.h / 2, 14, { colors: ['#e8434f', '#fff'], speed: 100 });
    if (this.hp <= 0) game.lose();
  }

  /* Put him back on the near lip of the pit he just went into.

     Derived from the ground spans rather than from the last-safe-footing
     sampler: the sampler fires on a timer, so where it last happened to land
     drifts with your speed — sometimes right on the edge, sometimes most of a
     screen back. Taking the span that ends before the fall and standing him
     three tiles short of its edge puts him in the same place every time, with
     room for a run-up. */
  respawnSpot() {
    const tx = Math.floor(this.cx / TILE);
    let span = null;
    for (const [a, b] of LEVEL.ground)
      if (b <= tx + 1 && (!span || b > span[1])) span = [a, b];
    if (!span) return { x: LEVEL.start.x * TILE, y: LEVEL.start.y * TILE };

    const landTx = Math.max(span[0], span[1] - 4);   // 4 tiles back: room to stop
    const gy = groundBelow(landTx * TILE + TILE / 2, 12 * TILE) ?? 13 * TILE;
    return { x: landTx * TILE, y: gy - this.h };
  }

  get doubleJump() { return this.doubleJumpT > 0; }

  /* Grows and shrinks from the FEET, so the box never moves out from under
     him. Standing back up is refused when there is no room, which is what
     stops him being pushed through the floor under a low ceiling. */
  setCrouch(on) {
    if (on === this.crouching) return;
    const b = this.bottom;
    if (on) {
      this.h = this.crouchH; this.y = b - this.h;
      this.crouching = true;
    } else {
      const y = b - this.standH;
      if (boxHitsSolid(this.x, y, this.w, this.standH)) return;   // stay down
      this.h = this.standH; this.y = y;
      this.crouching = false;
    }
  }

  fellInPit() {
    /* Stand him up before anything measures him. respawnSpot places the box by
       its own height, so respawning mid-crouch put him 11px low and he stood up
       into whatever was above. */
    this.h = this.standH; this.crouching = false; this.dropT = 0;
    const lost = this.spendHeart();
    this.combo = 0;
    shake = 6; flash = 0.5; Sfx.pit();
    if (this.hp <= 0) { game.lose(); return; }
    // a pit still puts you back on the ledge even if a rose absorbed the cost
    const spot = this.respawnSpot();
    this.x = spot.x; this.y = spot.y;
    this.vx = 0; this.vy = 0;
    this.invuln = Math.max(this.invuln, 1.2);
    this.charmed = 0;
    if (lost === 'heart') floatText(this.cx, this.y - 12, '-1 HEART', '#ff8f9c');
    burst(this.cx, this.bottom, 14, { colors: ['#fff', '#8890a4'], speed: 80, life: 0.6, size: 2 });
  }

  onBumpTile(tx, ty, t) {
    bumpEnemiesOn(tx, ty);
    if (t === T.QUESTION) {
      grid[ty * LEVEL.w + tx] = T.USED;
      /* Roughly every third block holds roses instead of a coin. Keyed off
         the tile rather than Math.random so a given block is always the same
         one - a block that paid out ammo last run still does. */
      if ((tx * 7 + ty * 13) % 3 === 0) {
        this.roses = Math.min(this.roses + 3, 9);
        if (!this.hasThrown) this.throwHint = 6;   // prompt until they use one
        bumps.push({ tx, ty, t: 0 });
        floatText(tx * TILE + 8, ty * TILE - 6, 'ROSES +3', '#ff8fd0');
        burst(tx * TILE + 8, ty * TILE, 14,
              { colors: ['#d6263c', '#f05a6a', '#3fae4a'], speed: 90, grav: 260, life: .8, size: 2 });
        Sfx.coin();
        return;
      }
      this.coins++; game.score += 100;
      bumps.push({ tx, ty, t: 0 });
      burst(tx * TILE + 8, ty * TILE, 8, { colors: ['#ffd85e', '#fff'], speed: 70, grav: 300 });
      floatText(tx * TILE + 8, ty * TILE - 6, '+100', '#ffd85e');
      Sfx.coin();
    } else if (t === T.BRICK) {
      grid[ty * LEVEL.w + tx] = T.AIR;
      burst(tx * TILE + 8, ty * TILE + 8, 10,
            { colors: ['#c2703a', '#8a4a12', '#e0a068'], speed: 105, size: 3, life: 0.7 });
      shake = 2; Sfx.brick();
    } else Sfx.bump();
  }

  update(dt) {
    this.charmed = Math.max(0, this.charmed - dt);
    this.charmImmune = Math.max(0, this.charmImmune - dt);
    // rose hearts wither one at a time rather than all at once
    if (this.extra > 0) {
      this.extraT -= dt;
      if (this.extraT <= 0) {
        this.extra--;
        this.extraT = this.extra > 0 ? EXTRA_HEART_TIME : 0;
        floatText(this.cx, this.y - 12, 'WILTED', '#8890a4');
      }
    }
    const hadDJ = this.doubleJumpT > 0;
    this.doubleJumpT = Math.max(0, this.doubleJumpT - dt);
    if (hadDJ && this.doubleJumpT === 0) {
      this.airJumps = 0;
      floatText(this.cx, this.y - 12, 'WORN OFF', '#8890a4');
    }
    const stuck = this.charmed > 0;

    this.dropT = Math.max(0, this.dropT - dt);
    // only on the ground, and never while a charmer has him
    this.setCrouch(!stuck && Input.crouch() && this.onGround && this.dropT <= 0);

    const wantL = !stuck && Input.left(), wantR = !stuck && Input.right();
    let max = Input.sprint() ? CFG.sprintMax : CFG.runMax;
    // A shuffle, not a stop: you have to be able to crouch and still reposition
    // under Edika's fire, or holding the dodge would pin you in place.
    if (this.crouching) max = CFG.crouchMax;
    // The surge only exists while that one launch is still in the air.
    if (this.ultraFlight) max = CFG.ultraAirMax;
    if (this.charmSlow) max *= CHARM.slowTo;
    const accel = this.onGround ? CFG.runAccel : CFG.airAccel;

    if (wantL && !wantR)      { this.vx -= accel * dt; this.face = -1; }
    else if (wantR && !wantL) { this.vx += accel * dt; this.face = 1; }
    else if (this.onGround) {
      const f = CFG.friction * dt;
      this.vx = Math.abs(this.vx) <= f ? 0 : this.vx - Math.sign(this.vx) * f;
    }
    // Drag toward her, applied after input so it fights what you are holding.
    if (this.charmPull) { this.vx += this.charmPull * dt; this.charmPull = 0; }
    if (stuck) this.vx *= Math.pow(0.02, dt);
    this.vx = clamp(this.vx, -max, max);
    this.charmSlow = false;

    this.coyote = this.onGround ? CFG.coyote : Math.max(0, this.coyote - dt);
    this.buffer = (!stuck && Input.jumpTap()) ? CFG.jumpBuffer : Math.max(0, this.buffer - dt);
    /* Crouch + jump on a one-way platform drops you through it. Checked
       before the jump chain so it consumes the buffer - otherwise he drops
       and immediately jumps back up through the same platform. */
    if (this.crouching && this.buffer > 0 && this.onGround && onOneWayOnly(this)) {
      this.buffer = 0; this.dropT = 0.20;
      this.setCrouch(false);
      this.y += 2; this.vy = 60;
      Sfx.bump();
      burst(this.cx, this.bottom, 8,
            { colors: ['#d08a48', '#f0c088', '#fff'], speed: 55, grav: 200, life: .4, size: 1 });
    } else if (this.buffer > 0 && this.coyote > 0) {
      /* Spent on the next jump off the ground, whenever that is. Deliberately
         not automatic on pickup: he should choose the moment, and he should be
         able to walk back to the lip and line it up. */
      if (this.ultra > 0) {
        this.ultra--; this.ultraFlight = true;
        this.vy = CFG.ultraJumpVel;
        shake = 6; flash = 0.3;
        floatText(this.cx, this.y - 14, 'LIFTOFF', '#ffd85e');
        burst(this.cx, this.bottom, 26,
              { colors: ['#ffd85e', '#fff', '#ffb03a'], speed: 150, grav: 220, life: 0.7, size: 2, spread: Math.PI });
      } else this.vy = CFG.jumpVel;
      this.buffer = 0; this.coyote = 0; this.stretchT = 0.10;
      this.airJumps = this.doubleJump ? 1 : 0;
      Sfx.jump();
      burst(this.cx, this.bottom, 5, { colors: ['#fff', '#cfd8e8'], speed: 45, grav: 180, life: 0.3, size: 1 });
    } else if (this.buffer > 0 && this.doubleJump && this.airJumps > 0 && !this.onGround) {
      // Second jump: a flat set, not an add, so spamming it mid-rise cannot
      // stack into an arbitrarily high launch.
      this.vy = CFG.airJumpVel;
      this.airJumps--;
      this.buffer = 0; this.stretchT = 0.10;
      Sfx.jump();
      burst(this.cx, this.bottom, 12,
            { colors: ['#9ee8ff', '#fff', '#c8d8f0'], speed: 70, grav: 120, life: 0.45, size: 1, spread: Math.PI, dir: 0 });
    }
    /* The ultra launch is exempt. It is the one jump in the game you are
       *required* to make, and with the cut applied a tapped launch landed 92px
       short of the far lip - the crossing punished a short press with a heart
       every time. */
    if (this.vy < 0 && !Input.jumpHeld() && !this.ultraFlight)
      this.vy *= Math.pow(CFG.jumpCut, dt * 60);
    this.vy = Math.min(this.vy + CFG.gravity * dt, CFG.maxFall);

    const wasAir = !this.onGround;
    moveAndCollide(this, dt, { oneWay: this.dropT <= 0 });

    if (this.ultraFlight && Math.random() < dt * 40)
      burst(this.cx + rand(-4, 4), this.y + rand(4, 20), 1,
            { colors: ['#ffd85e', '#fff'], speed: 12, grav: -30, life: 0.5, size: 1 });

    if (wasAir && this.onGround) {
      this.ultraFlight = false;
      this.squashT = 0.10;
      this.combo = 0;
      this.airJumps = this.doubleJump ? 1 : 0;   // recharge on landing
      burst(this.cx, this.bottom, 6, { colors: ['#fff', '#cfd8e8'], speed: 58, grav: 240, life: 0.3, size: 1, spread: Math.PI });
    }
    this.throwCd = Math.max(0, this.throwCd - dt);
    this.throwHint = Math.max(0, this.throwHint - dt);
    if (!stuck && this.roses > 0 && this.throwCd <= 0 && Input.throwTap()) {
      this.roses--;
      this.hasThrown = true; this.throwHint = 0;
      this.throwCd = 0.28;
      game.shots.push(new ThrownRose(this.cx, this.y + this.h * 0.42, this.face || 1));
      Sfx.jump();
    }
    this.squashT  = Math.max(0, this.squashT - dt);
    this.stretchT = Math.max(0, this.stretchT - dt);
    // ~7 steps/sec at full speed. The old rate was triple this, which is
    // above the frequency the eye reads as walking — it just looked like a jitter.
    this.runT += Math.abs(this.vx) * dt / 16;
    this.invuln = Math.max(0, this.invuln - dt);

    const wasInv = this.invincible;
    this.invincible = Math.max(0, this.invincible - dt);
    if (wasInv > 0) {
      if (Math.random() < dt * 30)
        burst(this.cx + rand(-6, 6), this.y + rand(0, this.h), 1,
              { colors: ['#ffd85e', '#ff5ec4', '#7ec8f0', '#7ae07a'], speed: 25, grav: -20, life: .5, size: 1 });
      if (this.invincible === 0) floatText(this.cx, this.y - 10, 'WORN OFF', '#8890a4');
    }

    // A pit costs a heart, not the run.
    if (this.y > LEVEL_H_PX + 60) this.fellInPit();
  }
}

/* Patrol direction lives in `dir`, not in the sign of vx.

   Deriving it from vx is what wedged walkers in corners: a wall collision sets
   vx to 0, so Math.sign(vx) loses the direction entirely and defaults to 1.
   Against a left-hand wall that means turn right, move, hit wall, vx zeroed,
   default right again — flipping every frame, going nowhere, visibly buzzing.
   A cooldown on top stops the same flip-flop on platforms too narrow to turn
   around on. */
const TURN_CD = 0.35;

class Walker extends Entity {
  constructor(tx) {
    const hb = hitboxFor('walker');
    super(tx * TILE, 0, hb.w, hb.h);
    this.y = groundYAt(tx) - this.h;
    this.dir = -1; this.speed = 24; this.turnCd = 0; this.t = rand(0, 4);
  }
  update(dt) {
    this.t += dt;
    this.turnCd = Math.max(0, this.turnCd - dt);
    this.hitWall = false;
    this.vx = this.dir * this.speed;
    this.vy = Math.min(this.vy + CFG.gravity * dt, CFG.maxFall);
    moveAndCollide(this, dt, { oneWay: false });

    const ahead = Math.floor((this.dir > 0 ? this.x + this.w + 2 : this.x - 2) / TILE);
    const below = Math.floor((this.bottom + 3) / TILE);
    const ledge = this.onGround && !isSolid(tileAt(ahead, below)) && !isOneWay(tileAt(ahead, below));
    if ((this.hitWall || ledge) && this.turnCd <= 0) { this.dir *= -1; this.turnCd = TURN_CD; }
    this.face = this.dir;
  }
  onStomp(p) {
    this.dead = true;
    game.addCombo(p, this.cx, this.y, 200);
    burst(this.cx, this.y + this.h / 2, 12, { colors: ['#8ec63f', '#4a6b2f', '#fff'], speed: 100 });
    shake = 2; freeze = 0.05; Sfx.stomp();
  }
  onBumped() {
    this.dead = true;
    game.score += 200;
    floatText(this.cx, this.y, '+200', '#ffd85e');
    burst(this.cx, this.y + this.h / 2, 14, { colors: ['#8ec63f', '#fff'], speed: 120, grav: 300 });
    shake = 3; Sfx.stomp();
  }
}

/* Released by the mid boss when he first takes damage. Fast, low, and they
   come in a pair — they change what the fight asks of you rather than just
   adding another slow patroller. */
class Dog extends Entity {
  constructor(x, y, dir) {
    super(x, y, 12, 9);
    this.dir = dir; this.speed = 82; this.turnCd = 0; this.t = rand(0, 3);
  }
  update(dt) {
    this.t += dt;
    this.turnCd = Math.max(0, this.turnCd - dt);
    this.hitWall = false;
    this.vx = this.dir * this.speed;
    this.vy = Math.min(this.vy + CFG.gravity * dt, CFG.maxFall);
    moveAndCollide(this, dt, { oneWay: false });
    const ahead = Math.floor((this.dir > 0 ? this.x + this.w + 2 : this.x - 2) / TILE);
    const below = Math.floor((this.bottom + 3) / TILE);
    const ledge = this.onGround && !isSolid(tileAt(ahead, below)) && !isOneWay(tileAt(ahead, below));
    if ((this.hitWall || ledge) && this.turnCd <= 0) { this.dir *= -1; this.turnCd = TURN_CD; }
    this.face = this.dir;
  }
  die(p) {
    this.dead = true;
    if (p) game.addCombo(p, this.cx, this.y, 150); else { game.score += 150; floatText(this.cx, this.y, '+150', '#ffd85e'); }
    burst(this.cx, this.y + 4, 10, { colors: ['#b07840', '#e0b070', '#fff'], speed: 95 });
    shake = 2; Sfx.stomp();
  }
  onStomp(p) { freeze = 0.04; this.die(p); }
  onBumped()  { this.die(null); }
}

class MidBoss extends Entity {
  get bossName() { return 'THE WALKER'; }
  get maxHp() { return 3; }
  constructor(tx, gate = null) {
    const hb = hitboxFor('mid');
    super(tx * TILE, 0, hb.w, hb.h);
    this.gate = gate;
    this.y = groundYAt(tx) - this.h;
    /* He was the one gate holder without a leash. His last-hit leap carries
       5.3 tiles and the ledge turn is suppressed mid-leap, so once the pit at
       179 became a thirteen-tile ravine he could jump off the 192 lip, fall
       out of the world, and hand you gate 206 for free. */
    this.home = spanAround(tx);
    this.dir = -1; this.turnCd = 0;
    this.hp = 3; this.hitFlash = 0; this.t = 0;
    this.phase = 'patrol'; this.phaseT = 0;
    this.leaping = false; this.dogsOut = false;
  }

  /* Phase machine instead of "walks at you constantly".

       PATROL — slow, ignores you
       WINDUP — leans back for 0.5s. That lean is the tell.
       CHARGE — fast dash, or a LEAP once he is on his last hit
       STUN   — 0.9s planted and flashing after a charge or a hit. This is the
                window: he cannot reach you and you can get on top of him.

     Each hit escalates him — he speeds up, he lets the dogs go, then he starts
     leaping — so the three stomps are three different fights instead of the
     same one three times. */
  update(dt) {
    this.t += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.turnCd = Math.max(0, this.turnCd - dt);
    this.phaseT += dt;
    this.hitWall = false;

    const p = game.player;
    const d = p.cx - this.cx;
    const level = Math.abs(p.bottom - this.bottom) < 52;
    const rage = 1 + (3 - this.hp) * 0.3;

    switch (this.phase) {
      case 'patrol':
        this.vx = this.dir * 20;
        if (Math.abs(d) < 130 && level && Math.abs(d) > 10 && this.phaseT > 0.6) {
          this.phase = 'windup'; this.phaseT = 0;
          this.dir = Math.sign(d);
          Sfx.bump();
        }
        break;

      case 'windup':
        this.vx = -this.dir * 14;
        if (this.phaseT > 0.5) {
          this.phase = 'charge'; this.phaseT = 0;
          if (this.hp <= 1 && this.onGround) { this.vy = -250; this.leaping = true; }
          shake = 2;
        }
        break;

      case 'charge':
        this.vx = this.dir * 92 * rage;
        if (Math.random() < dt * 26)
          burst(this.cx - this.dir * 6, this.bottom - 3, 1,
                { colors: ['#ff8a5c', '#ffd85e'], speed: 34, grav: -40, life: 0.45, size: 1 });
        if (this.leaping && this.onGround && this.phaseT > 0.25) {
          this.leaping = false;
          this.phase = 'stun'; this.phaseT = 0;
          shake = 5;
          burst(this.cx, this.bottom, 16,
                { colors: ['#c9a06a', '#fff'], speed: 90, grav: 320, life: .5, size: 2, spread: Math.PI });
        } else if (!this.leaping && (this.phaseT > 0.95 || this.hitWall)) {
          this.phase = 'stun'; this.phaseT = 0;
        }
        break;

      case 'stun':
        this.vx *= Math.pow(0.02, dt);
        if (this.phaseT > 0.9) { this.phase = 'patrol'; this.phaseT = 0; }
        break;
    }

    this.vy = Math.min(this.vy + CFG.gravity * dt, CFG.maxFall);
    moveAndCollide(this, dt, { oneWay: false });

    const ahead = Math.floor((this.dir > 0 ? this.x + this.w + 2 : this.x - 2) / TILE);
    const below = Math.floor((this.bottom + 3) / TILE);
    const ledge = this.onGround && !isSolid(tileAt(ahead, below)) && !isOneWay(tileAt(ahead, below));
    /* A charging mid boss used to ignore ledges entirely, so he could run
       straight off the ground into a pit and fall out of the world. He holds a
       gate shut, so that softlocked the level with no way to open it. He now
       turns at edges unless he is mid-leap; `enemies that fall out` in the
       update loop is the backstop. */
    if ((this.hitWall || ledge) && this.turnCd <= 0 && !this.leaping) {
      this.dir *= -1; this.turnCd = TURN_CD;
    }
    leash(this);
    this.face = this.dir;
  }

  releaseDogs() {
    for (const dir of [-1, 1]) {
      const dg = new Dog(this.cx + dir * 12, this.bottom - 9, dir);
      game.enemies.push(dg);
      burst(dg.cx, dg.y + 4, 8, { colors: ['#b07840', '#fff'], speed: 70 });
    }
    floatText(this.cx, this.y - 12, 'RELEASE!', '#ff8a5c');
    shake = 4;
  }

  damage(p) {
    this.hp--;
    this.hitFlash = 0.35;
    this.phase = 'stun'; this.phaseT = 0; this.leaping = false;
    if (p) this.vx = Math.sign(this.cx - p.cx) * 70;
    shake = 3; freeze = 0.07; Sfx.stomp();

    if (this.hp <= 0) {
      this.dead = true;
      if (p) game.addCombo(p, this.cx, this.y, 800);
      else { game.score += 800; floatText(this.cx, this.y - 4, '+800', '#ffd85e'); }
      burst(this.cx, this.y + this.h / 2, 28, { colors: ['#e8434f', '#ffd85e', '#fff'], speed: 155, life: 0.8, size: 3 });
      shake = 6; freeze = 0.12; flash = 0.45;
      if (this.gate != null) openGate(this.gate);
      return;
    }
    burst(this.cx, this.y + 4, 10, { colors: ['#e8434f', '#fff'], speed: 90 });
    if (this.hp === 2 && !this.dogsOut) { this.dogsOut = true; this.releaseDogs(); }
    else if (this.hp === 1) floatText(this.cx, this.y - 4, 'ENRAGED', '#ff5ec4');
    else floatText(this.cx, this.y - 4, `${this.hp} LEFT`, '#ffd85e');
  }

  // Same rule as the boss: the stun is advertised as your opening, so it must
  // not cost a heart to take it.
  get harmless() { return this.phase === 'stun'; }

  onStomp(p) { this.damage(p); }
  onBumped() { this.damage(null); }
}


/* ============================================================ level 2 cast

   Every one of these obeys the same contracts the level-1 enemies do, and the
   ones that matter are easy to get wrong:
     - `harmless` is not decoration. resolveEnemies ends an overlap with
       `else if (!e.harmless) p.hurt(e.cx)`, so anything without it damages on
       contact in every phase. It ALSO switches the stomp test to the lenient
       band, which is what makes a boss standing on the floor stompable at all.
     - anything holding a gate must expose `.gate`, or reconcileGates cannot
       find its guard and the gate never opens.
     - falling out of the world must kill, or a gate softlocks.            */

/* A boss that holds a gate must never be able to walk into a pit: the
   fall-out-of-world rule marks it dead and opens the gate, so the fight is
   "won" by watching it commit suicide. The ledge check alone is not enough -
   it looks 2px ahead and then refuses to turn again for TURN_CD, which a
   hunting boss at 160px/s clears easily. This is a hard clamp to the ground
   span the boss spawned in. */
function spanAround(tx) {
  const sp = LEVEL.ground.find(([a, b]) => tx >= a && tx < b);
  return sp ? { lo: sp[0] * TILE + 2, hi: sp[1] * TILE - 2 } : null;
}

function leash(e) {
  if (!e.home) return;
  if (e.x < e.home.lo) { e.x = e.home.lo; if (e.dir < 0) e.dir = 1; e.vx = Math.abs(e.vx); }
  else if (e.x + e.w > e.home.hi) { e.x = e.home.hi - e.w; if (e.dir > 0) e.dir = -1; e.vx = -Math.abs(e.vx); }
}

const GUARD = { speed: 26, surgeMul: 2.4, surgeT: 1.0, surgeCd: 2.4, alert: 58, link: 46 };

/* A cordon, not a Goomba. Walking into one guard's eyeline breaks the whole
   nearby line into a short charge, so a row of them has to be broken up
   rather than walked into. Still one stomp each. */
class Guard extends Entity {
  constructor(tx) {
    const hb = hitboxFor('l3guard');
    super(tx * TILE, 0, hb.w, hb.h);
    this.y = groundYAt(tx) - this.h;
    this.dir = -1; this.turnCd = 0; this.surge = 0; this.cd = 0; this.t = rand(0, 4);
  }
  alert() {
    if (this.cd > 0 || this.dead) return;
    this.surge = GUARD.surgeT; this.cd = GUARD.surgeCd;
  }
  update(dt) {
    this.t += dt;
    this.turnCd = Math.max(0, this.turnCd - dt);
    this.cd = Math.max(0, this.cd - dt);
    this.surge = Math.max(0, this.surge - dt);
    this.hitWall = false;

    const p = game.player;
    const d = p.cx - this.cx;
    if (this.cd <= 0 && Math.abs(d) < GUARD.alert && Math.abs(p.bottom - this.bottom) < 40) {
      this.alert();
      for (const o of game.enemies)
        if (o !== this && o instanceof Guard && Math.abs(o.cx - this.cx) < GUARD.link) o.alert();
    }
    // deadzone: without it the sign flips every frame when he reaches you
    if (this.surge > 0 && Math.abs(d) > 8) this.dir = Math.sign(d);

    this.vx = this.dir * GUARD.speed * (this.surge > 0 ? GUARD.surgeMul : 1);
    this.vy = Math.min(this.vy + CFG.gravity * dt, CFG.maxFall);
    moveAndCollide(this, dt, { oneWay: false });

    const ahead = Math.floor((this.dir > 0 ? this.x + this.w + 2 : this.x - 2) / TILE);
    const below = Math.floor((this.bottom + 3) / TILE);
    const ledge = this.onGround && !isSolid(tileAt(ahead, below)) && !isOneWay(tileAt(ahead, below));
    if ((this.hitWall || ledge) && this.turnCd <= 0) { this.dir *= -1; this.turnCd = TURN_CD; }
    this.face = this.dir;
  }
  die(p) {
    this.dead = true;
    if (p) game.addCombo(p, this.cx, this.y, 200);
    else { game.score += 200; floatText(this.cx, this.y, '+200', '#ffd85e'); }
    burst(this.cx, this.y + this.h / 2, 12, { colors: ['#6a6ad0', '#2a2a70', '#fff'], speed: 100 });
    shake = 2; Sfx.stomp();
  }
  onStomp(p) { freeze = 0.05; this.die(p); }
  onBumped() { this.die(null); }
}

/* `range` must sit well inside the jump reach (98px at run speed) or the
   mechanic is impossible: at 96 you could not clear his hearing airborne AND
   still land on him, and any ground step inside it woke him in 0.67s. A
   scripted player using the intended approach landed zero hits in a minute.
   At 58 a single jump covers the whole range, and the slower noise gain also
   leaves a careful walk-in viable as a second answer. */
const SLEEP = { range: 58, wake: 1.0, gain: 1.0, decay: 0.9, awake: 2.2, chase: 70, hp: 3 };

/* Asleep on his feet until you make noise. Noise only accrues while you are
   ON THE GROUND and actually moving near him - walking him down slowly, or
   coming in off a jump, keeps him under. Asleep he is harmless and freely
   stompable; awake he is faster than you and cannot be touched. */
class Sleepy extends Entity {
  constructor(tx, gate = null) {
    const hb = hitboxFor('l3sleepy');
    super(tx * TILE, 0, hb.w, hb.h);
    this.y = groundYAt(tx) - this.h;
    this.gate = gate;
    this.hp = SLEEP.hp; this.dir = -1; this.turnCd = 0;
    this.noise = 0; this.phase = 'doze'; this.phaseT = 0; this.hitFlash = 0; this.t = 0;
    this.home = spanAround(tx);
  }
  get bossGrade() { return true; }
  get bossName() { return 'SLEEPY'; }
  chip(p) { this.damage(p); }
  get maxHp() { return SLEEP.hp; }
  get harmless() { return this.phase === 'doze' || this.phase === 'reel'; }
  update(dt) {
    this.t += dt; this.phaseT += dt;
    this.turnCd = Math.max(0, this.turnCd - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.hitWall = false;

    const p = game.player;
    const near = Math.abs(p.cx - this.cx) < SLEEP.range;
    const loud = near && p.onGround && Math.abs(p.vx) > 40;
    this.noise = clamp(this.noise + (loud ? SLEEP.gain : -SLEEP.decay) * dt, 0, 1.4);

    if (this.phase === 'reel') {
      // brief stagger after a hit: still harmless, so the stomp bounce has
      // time to carry you clear before he comes up swinging
      this.vx *= Math.pow(0.02, dt);
      if (this.phaseT > 0.55) { this.phase = 'awake'; this.phaseT = 0; }
    } else if (this.phase === 'doze') {
      this.vx = 0;
      if (this.noise >= SLEEP.wake) {
        this.phase = 'awake'; this.phaseT = 0; this.noise = 0;
        floatText(this.cx, this.y - 12, 'WHO IS THERE', '#ffd85e');
        shake = 3; Sfx.deny();
      }
    } else {
      const d = p.cx - this.cx;
      if (Math.abs(d) > 8) this.dir = Math.sign(d);
      this.vx = this.dir * SLEEP.chase;
      if (this.phaseT > SLEEP.awake) {
        this.phase = 'doze'; this.phaseT = 0; this.noise = 0;
        floatText(this.cx, this.y - 12, 'ZZZ', '#9ee8ff');
      }
    }

    this.vy = Math.min(this.vy + CFG.gravity * dt, CFG.maxFall);
    moveAndCollide(this, dt, { oneWay: false });
    const ahead = Math.floor((this.dir > 0 ? this.x + this.w + 2 : this.x - 2) / TILE);
    const below = Math.floor((this.bottom + 3) / TILE);
    const ledge = this.onGround && !isSolid(tileAt(ahead, below)) && !isOneWay(tileAt(ahead, below));
    if ((this.hitWall || ledge) && this.turnCd <= 0) { this.dir *= -1; this.turnCd = TURN_CD; }
    leash(this);
    this.face = this.dir;

    if (this.phase === 'doze' && Math.random() < dt * 2.2)
      burst(this.cx + this.face * 5, this.y + 6, 1,
            { colors: ['#9ee8ff', '#fff'], speed: 8, grav: -14, life: 1.2, size: 1 });
  }
  damage(p) {
    this.hp--; this.hitFlash = 0.35;
    /* Wakes up. Sending him back to 'doze' let you stand on his head and
       stomp three times in a row with no risk - the whole sleep mechanic
       never engaged and the fight was over in two seconds. */
    this.phase = 'reel'; this.phaseT = 0; this.noise = 0;
    if (p) this.vx = Math.sign(this.cx - p.cx) * 50;
    shake = 3; freeze = 0.07; Sfx.stomp();
    if (this.hp <= 0) {
      this.dead = true;
      if (p) game.addCombo(p, this.cx, this.y, 700);
      else { game.score += 700; floatText(this.cx, this.y - 4, '+700', '#ffd85e'); }
      burst(this.cx, this.y + this.h / 2, 26, { colors: ['#e8e8f0', '#9ee8ff', '#fff'], speed: 150, size: 3 });
      shake = 6; flash = 0.4;
      if (this.gate != null) openGate(this.gate);
      return;
    }
    burst(this.cx, this.y + 4, 10, { colors: ['#fff', '#9ee8ff'], speed: 90 });
    floatText(this.cx, this.y - 4, `${this.hp} LEFT`, '#ffd85e');
  }
  onStomp(p) {
    // 'reel' is harmless but NOT open, or you chain all three hits inside a
    // single stagger and the sleep mechanic never matters
    if (this.phase === 'reel') { p.vy = CFG.stompBounce * 0.8; return; }
    if (this.harmless) { this.damage(p); return; }
    p.vy = CFG.stompBounce * 0.8;                 // awake: bounces off
    floatText(this.cx, this.y - 8, 'WIDE AWAKE', '#ff8f9c');
    shake = 4; Sfx.deny();
  }
  onBumped() { this.damage(null); }
}

const SVANI = { hp: 5, walk: 24, charge: 96, windup: 0.55, chargeT: 0.9, stun: 1.6, range: 132, hunt: 240 };

/* Big health that does not mean a damage sponge: three stages that play
   differently. Stage 2 adds a ground slam whose wave you must jump; stage 3
   chains straight from stun back into windup with no patrol in between. */
class Svani extends Entity {
  constructor(tx, gate = null) {
    const hb = hitboxFor('l3svani');
    super(tx * TILE, 0, hb.w, hb.h);
    this.y = groundYAt(tx) - this.h;
    this.gate = gate;
    this.hp = SVANI.hp; this.dir = -1; this.turnCd = 0;
    this.phase = 'patrol'; this.phaseT = 0; this.hitFlash = 0; this.t = 0;
    this.home = spanAround(tx);
  }
  get bossGrade() { return true; }
  get bossName() { return 'SVANI EDIKA'; }
  chip(p) { this.damage(p); }
  get maxHp() { return SVANI.hp; }
  get stage() { return this.hp > 3 ? 1 : this.hp > 1 ? 2 : 3; }
  get harmless() { return this.phase === 'stun'; }
  update(dt) {
    this.t += dt; this.phaseT += dt;
    this.turnCd = Math.max(0, this.turnCd - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.hitWall = false;

    const p = game.player;
    const d = p.cx - this.cx;
    const st = this.stage;
    const rage = 1 + (st - 1) * 0.35;

    switch (this.phase) {
      case 'patrol':
        /* He closes. Patrolling blind meant a player who simply walked
           backwards was never charged at, never produced a stun, and the
           fight stalled out indefinitely - 90s with no hit landed. */
        if (Math.abs(d) < SVANI.hunt && Math.abs(d) > 12) this.dir = Math.sign(d);
        this.vx = this.dir * SVANI.walk * (Math.abs(d) < SVANI.hunt ? 1.7 : 1);
        if (Math.abs(d) < SVANI.range && Math.abs(d) > 10 && this.phaseT > 0.5) {
          this.phase = 'windup'; this.phaseT = 0; this.dir = Math.sign(d); Sfx.bump();
        }
        break;
      case 'windup':
        this.vx = -this.dir * 12;
        if (this.phaseT > SVANI.windup / rage) { this.phase = 'charge'; this.phaseT = 0; shake = 2; }
        break;
      case 'charge':
        this.vx = this.dir * SVANI.charge * rage;
        if (this.phaseT > SVANI.chargeT || this.hitWall) {
          if (st >= 2) { this.slam(); }
          this.phase = 'stun'; this.phaseT = 0;
        }
        break;
      case 'stun':
        this.vx *= Math.pow(0.02, dt);
        if (this.phaseT > SVANI.stun / rage) {
          // stage 3 never rests: straight back into the next windup
          if (st >= 3 && Math.abs(d) < SVANI.range) { this.phase = 'windup'; this.dir = Math.sign(d) || this.dir; }
          else this.phase = 'patrol';
          this.phaseT = 0;
        }
        break;
    }

    this.vy = Math.min(this.vy + CFG.gravity * dt, CFG.maxFall);
    moveAndCollide(this, dt, { oneWay: false });
    const ahead = Math.floor((this.dir > 0 ? this.x + this.w + 2 : this.x - 2) / TILE);
    const below = Math.floor((this.bottom + 3) / TILE);
    const ledge = this.onGround && !isSolid(tileAt(ahead, below)) && !isOneWay(tileAt(ahead, below));
    if ((this.hitWall || ledge) && this.turnCd <= 0) { this.dir *= -1; this.turnCd = TURN_CD; }
    leash(this);
    this.face = this.dir;
  }
  slam() {
    if (!this.onGround) return;
    shake = 6; Sfx.brick();
    burst(this.cx, this.bottom, 16,
          { colors: ['#c9a06a', '#fff'], speed: 100, grav: 320, life: .5, size: 2, spread: Math.PI });
    for (const dir of [-1, 1]) game.hazards.push(new Shockwave(this.cx, this.bottom, dir, '#e8a020'));
  }
  damage(p) {
    const before = this.stage;
    this.hp--; this.hitFlash = 0.35;
    this.phase = 'stun'; this.phaseT = 0;
    if (p) this.vx = Math.sign(this.cx - p.cx) * 60;
    shake = 3; freeze = 0.07; Sfx.stomp();
    if (this.hp <= 0) {
      this.dead = true;
      if (p) game.addCombo(p, this.cx, this.y, 1200);
      else { game.score += 1200; floatText(this.cx, this.y - 4, '+1200', '#ffd85e'); }
      burst(this.cx, this.y + this.h / 2, 32, { colors: ['#e8434f', '#ffd85e', '#fff'], speed: 180, size: 3 });
      shake = 8; flash = 0.5;
      if (this.gate != null) openGate(this.gate);
      return;
    }
    burst(this.cx, this.y + 4, 12, { colors: ['#e8434f', '#fff'], speed: 100 });
    if (this.stage !== before) {
      floatText(this.cx, this.y - 12, this.stage === 2 ? 'ANGRY' : 'FURIOUS',
                this.stage === 2 ? '#ff8a5c' : '#ff2d55');
      shake = 7; flash = 0.35;
    } else floatText(this.cx, this.y - 4, `${this.hp} LEFT`, '#ffd85e');
  }
  onStomp(p) { this.damage(p); }
  onBumped() { this.damage(null); }
}

/* Travels along the floor and must be jumped. Kept out of game.enemies on
   purpose: it is not stompable, and every entity in that array has to satisfy
   the stomp contract. */
class Shockwave {
  constructor(x, y, dir, color) {
    this.x = x; this.y = y - 10; this.w = 8; this.h = 10;
    this.dir = dir; this.color = color; this.life = 2.2; this.dead = false; this.t = 0;
  }
  get cx() { return this.x + this.w / 2; }
  get bottom() { return this.y + this.h; }
  update(dt) {
    this.t += dt;
    this.life -= dt;
    this.x += this.dir * 132 * dt;
    const tx = Math.floor(this.cx / TILE), ty = Math.floor((this.bottom + 3) / TILE);
    // dies at a wall or a ledge; it is a wave along the ground, not a projectile
    if (this.life <= 0 || isSolid(tileAt(tx, ty - 1)) ||
        (!isSolid(tileAt(tx, ty)) && !isOneWay(tileAt(tx, ty)))) this.dead = true;
    if (Math.random() < dt * 22)
      burst(this.cx, this.bottom - 2, 1, { colors: [this.color, '#fff'], speed: 30, grav: 120, life: .4, size: 1 });
  }
  draw() {
    const x = Math.round(this.x), y = Math.round(this.y);
    const k = Math.floor(this.t * 14) % 2;
    g.fillStyle = this.color;
    g.fillRect(x, y + 4 + k, this.w, 6 - k);
    g.fillStyle = '#fff';
    g.fillRect(x + 1, y + 5 + k, this.w - 2, 1);
  }
}

/* Retuned after the fight proved unkillable in play. The loop asks a lot -
   reach a live bomb, stomp it, and have the blast catch him - so every number
   in it has to be forgiving: a longer fuse to reach the bomb, a harder punt,
   a blast wide enough to actually clip him, and one less hit. */
/* Shaken loose by a slam. The fight used to be trivially safe once you were
   up on his step - the floor waves could not reach you there, so you could
   simply stand next to him and wait. This makes the platform cost something
   too, and it is jumped or side-stepped like anything else. */
class Debris {
  constructor(x, y) {
    this.x = x - 3; this.y = y; this.w = 6; this.h = 6;
    this.vy = 0; this.dead = false; this.t = 0;
  }
  get cx() { return this.x + this.w / 2; }
  get bottom() { return this.y + this.h; }
  update(dt) {
    this.t += dt;
    this.vy = Math.min(this.vy + CFG.gravity * 0.5 * dt, 260);
    this.y += this.vy * dt;
    const tx = Math.floor(this.cx / TILE), ty = Math.floor((this.bottom) / TILE);
    const t = tileAt(tx, ty);
    if (isSolid(t) || isOneWay(t) || this.y > LEVEL_H_PX) {
      this.dead = true;
      burst(this.cx, this.bottom, 8,
            { colors: ['#c9a06a', '#8a7250', '#fff'], speed: 80, grav: 300, life: .5, size: 2 });
    }
  }
  draw() {
    // where it is going to land, painted before it arrives
    const landY = groundBelow(this.cx, this.bottom + 1);
    if (landY != null && Math.floor(this.t * 12) % 2 === 0) {
      const lx = Math.round(this.cx) - 5, ly = Math.round(landY) - 3;
      g.fillStyle = 'rgba(255,138,92,.75)';
      g.fillRect(lx, ly, 2, 2); g.fillRect(lx + 8, ly, 2, 2);
      g.fillRect(lx, ly + 1, 10, 1);
    }
    const x = Math.round(this.x), y = Math.round(this.y);
    g.fillStyle = '#a8916a'; g.fillRect(x, y, 6, 6);
    g.fillStyle = '#7a684a'; g.fillRect(x, y + 4, 6, 2);
    g.fillStyle = '#d8c8a8'; g.fillRect(x + 1, y + 1, 2, 1);
  }
}

/* Edika's shots. Fired at head height over the surface HE is standing on, and
   they fly dead level from there - they never chase and never change height.

   That flatness is the whole mechanic. An earlier version tracked the floor
   beneath it so it would step down with the terrain, which sounds better and
   is much worse: crossing from his step to the floor it slid 60px downward and
   swept straight through a crouching player on the way. A shot you cannot duck
   because it is busy descending through you is not a shot, it is a bug. Level
   flight, bursting on anything solid.

   `ride` is the rest of it. The bullet occupies feet-25 to feet-20, inside a
   standing hitbox (feet-28 to feet) and clear of a crouching one (feet-17 to
   feet) by 3px. Retune the squat hitbox and this has to move with it - which
   is asserted at boot, see the crouch-band check in validateLevel. */
const BULLET = { speed: 96, ride: 25, w: 7, h: 5, life: 5.0,
                 /* A shot at ankle height. 9 down to 4 above the feet sits
                    inside BOTH a standing box and a crouching one, so ducking
                    is no answer to it - you have to leave the ground. That is
                    the point: the same enemy family asks for opposite inputs
                    depending on who is holding the microphone. */
                 lowRide: 9 };

class Bullet {
  constructor(x, y, dir, kind = 'shot', speed = BULLET.speed) {
    this.x = x; this.y = y; this.w = BULLET.w; this.h = BULLET.h;
    this.dir = dir; this.t = 0; this.dead = false; this.kind = kind; this.speed = speed;
  }
  get cx() { return this.x + this.w / 2; }
  get bottom() { return this.y + this.h; }
  update(dt) {
    this.t += dt;
    this.x += this.dir * this.speed * dt;            // level, always
    if (this.t > BULLET.life) this.dead = true;
    if (this.cx < cam.x - 80 || this.cx > cam.x + VIEW_W + 80) this.dead = true;
    if (isSolid(tileAt(Math.floor(this.cx / TILE), Math.floor((this.y + this.h / 2) / TILE)))) {
      this.dead = true;
      burst(this.cx, this.y + 2, 8,
            { colors: ['#ffd85e', '#ff8a5c', '#fff'], speed: 70, grav: 120, life: .4, size: 1 });
    }
    if (Math.random() < dt * 30)
      burst(this.cx, this.y + 2, 1,
            { colors: this.kind === 'smear' ? ['#f4f4f4', '#c8d8f0'] : ['#ff8a5c', '#ffd85e'],
              speed: 10, grav: -8, life: .35, size: 1 });
  }
  draw() {
    const x = Math.round(this.x), y = Math.round(this.y);
    if (this.kind === 'smear') {
      // a little speech bubble - what the press actually shoot with
      g.fillStyle = '#f4f4f4'; g.fillRect(x, y, BULLET.w, BULLET.h - 1);
      g.fillStyle = '#f4f4f4'; g.fillRect(x + 1, y + BULLET.h - 1, 2, 1);   // the tail
      g.fillStyle = '#2b3a5e';
      g.fillRect(x + 1, y + 1, 1, 1); g.fillRect(x + 3, y + 1, 1, 1); g.fillRect(x + 5, y + 1, 1, 1);
      g.fillStyle = 'rgba(244,244,244,.40)';
      g.fillRect(this.dir > 0 ? x - 5 : x + BULLET.w, y + 1, 5, 2);
      return;
    }
    g.fillStyle = '#ffd85e'; g.fillRect(x, y, BULLET.w, BULLET.h);
    g.fillStyle = '#ff8a5c'; g.fillRect(x, y + 1, BULLET.w, 1);
    g.fillStyle = '#fff';    g.fillRect(this.dir > 0 ? x + BULLET.w - 2 : x, y + 1, 2, 2);
    // a short tail so it reads as travelling at this size
    g.fillStyle = 'rgba(255,138,92,.45)';
    g.fillRect(this.dir > 0 ? x - 5 : x + BULLET.w, y + 1, 5, 3);
  }
}

/* ---------------------------------------------------------- act 2: the press

   Three reporters who walk the building and fire FREE SPEECH at you. Same
   Bullet, same head-height lane, so the crouch you learn here is the crouch
   that keeps you alive against the Anchor at the end of the act - and against
   Edika two acts later. Teaching it on ordinary walkers first is deliberate.

   They telegraph with the word rather than a lane marker: at walker density a
   dotted line per reporter would be visual soup, and one reporter's shot is
   survivable in a way a boss volley is not. */
/* Three reporters, three different questions.

     high   - a shot at head height.  DUCK it.
     low    - a shot along the floor.  JUMP it; crouching is no help.
     charge - no projectile at all: she shoulders the microphone and runs you
              down. Get out of the way or get on top of her.

   One class, because the walking, ledge-turning and stomping are identical and
   only the answer to "what does this one do when it sees you" differs. */
/* What they shout is the joke. You are the one raiding the newsroom, so the
   reporting comes at you labelled the way a government labels reporting it
   does not like - the projectile is literally called a smear because that is
   what the man swinging at it has decided journalism is. */
const PRESS = {
  walk: 20, sight: 120,
  high:   { fireEvery: 3.4, aim: 0.55, cry: 'UNSUPPORTED ACCUSATIONS' },
  low:    { fireEvery: 3.8, aim: 0.70, cry: 'FACTLESS ATTACKS' },
  charge: { fireEvery: 3.0, aim: 0.50, cry: 'NO COMMENT?', dash: 132, dashT: 0.85 },
};

class Journalist extends Entity {
  constructor(tx, art, style) {
    const hb = hitboxFor(art);
    super(tx * TILE, 0, hb.w, hb.h);
    this.art = art; this.style = style;
    this.cfg = PRESS[style];
    this.y = groundYAt(tx) - this.h;
    this.dir = -1; this.turnCd = 0; this.t = rand(0, 4);
    this.fire = this.cfg.fireEvery * rand(0.4, 1.2);
    this.phase = 'walk'; this.phaseT = 0;
  }
  // safe to brush past while lining up, same as every other tell in the game.
  // NOT safe once a charger is actually moving - that is the whole attack.
  get harmless() { return this.phase === 'aim'; }
  update(dt) {
    this.t += dt; this.phaseT += dt;
    this.turnCd = Math.max(0, this.turnCd - dt);
    this.hitWall = false;
    const p = game.player;
    const d = p.cx - this.cx;

    if (this.phase === 'aim') {
      this.vx *= Math.pow(0.02, dt);
      if (this.phaseT > this.cfg.aim) {
        if (this.style === 'charge') {
          this.phase = 'dash'; this.phaseT = 0;
        } else {
          const ride = this.style === 'low' ? BULLET.lowRide : BULLET.ride;
          game.hazards.push(new Bullet(this.cx + this.aimDir * 7,
                                       this.bottom - ride, this.aimDir, 'smear'));
          Sfx.bump();
          this.fire = this.cfg.fireEvery * rand(0.8, 1.4);
          this.phase = 'walk'; this.phaseT = 0;
        }
      }
    } else if (this.phase === 'dash') {
      this.vx = this.aimDir * this.cfg.dash;
      this.dir = this.aimDir;
      if (this.phaseT > this.cfg.dashT || this.hitWall) {
        this.fire = this.cfg.fireEvery * rand(0.8, 1.4);
        this.phase = 'walk'; this.phaseT = 0;
      }
    } else {
      this.vx = this.dir * PRESS.walk;
      this.fire -= dt;
      // only when you are in front of them and close enough to have been seen
      if (this.fire <= 0 && Math.abs(d) < PRESS.sight && Math.abs(p.bottom - this.bottom) < 24) {
        this.phase = 'aim'; this.phaseT = 0;
        this.aimDir = Math.sign(d) || this.dir;
        this.dir = this.aimDir;
        floatText(this.cx, this.y - 10, this.cfg.cry, '#f4f4f4');
      }
    }

    this.vy = Math.min(this.vy + CFG.gravity * dt, CFG.maxFall);
    moveAndCollide(this, dt, { oneWay: false });
    const ahead = Math.floor((this.dir > 0 ? this.x + this.w + 2 : this.x - 2) / TILE);
    const below = Math.floor((this.bottom + 3) / TILE);
    const ledge = this.onGround && !isSolid(tileAt(ahead, below)) && !isOneWay(tileAt(ahead, below));
    // a charger commits: it will run off a ledge rather than politely turn
    const turn = this.hitWall || (ledge && this.phase !== 'dash');
    if (turn && this.turnCd <= 0) { this.dir *= -1; this.turnCd = TURN_CD; }
    this.face = this.dir;
  }
  onStomp(p) {
    this.dead = true;
    game.addCombo(p, this.cx, this.y, 250);
    p.vy = CFG.stompBounce;
    burst(this.cx, this.y + this.h / 2, 14,
          { colors: ['#f4f4f4', '#7fb0d8', '#2b3a5e'], speed: 110, size: 2 });
    shake = 2; freeze = 0.05; Sfx.stomp();
  }
  onBumped() {
    this.dead = true;
    game.score += 250;
    floatText(this.cx, this.y, '+250', '#ffd85e');
    burst(this.cx, this.y + this.h / 2, 12, { colors: ['#f4f4f4', '#7fb0d8'], speed: 90 });
    Sfx.stomp();
  }
}

/* A camera on a tripod. Three cover the studio, and while any one is still
   live the Anchor cannot be touched. They are the fight. */
class StudioCamera extends Entity {
  constructor(tx) {
    super(tx * TILE + 2, 0, 12, 20);
    this.y = groundYAt(tx) - this.h;
    this.t = rand(0, 4); this.settled = false;
  }
  get harmless() { return true; }           // it films you, it does not hit you
  update(dt) {
    this.t += dt;
    if (this.settled) return;
    this.vy = Math.min(this.vy + CFG.gravity * dt, CFG.maxFall);
    // oneWay TRUE, unlike every other enemy: a camera is set down on the
    // gantry it is meant to film from, and must not drop through it
    moveAndCollide(this, dt, { oneWay: true });
    if (this.onGround) { this.settled = true; this.vx = 0; this.vy = 0; }
  }
  onStomp(p) { p.vy = CFG.stompBounce; this.smash(p); }
  onBumped() { this.smash(null); }
  smash(p) {
    if (this.dead) return;
    this.dead = true;
    if (p) game.addCombo(p, this.cx, this.y, 400);
    else { game.score += 400; floatText(this.cx, this.y, '+400', '#ffd85e'); }
    floatText(this.cx, this.y - 12, 'FEED CUT', '#7ec8f0');
    burst(this.cx, this.y + 8, 22,
          { colors: ['#9fd8ff', '#f4f4f4', '#3a4658', '#e8434f'], speed: 140, life: .9, size: 2 });
    shake = 6; flash = 0.25; Sfx.brick();
    const a = game.enemies.find(e => e instanceof Anchor && !e.dead);
    if (a) a.feedCut();
  }
  draw() {
    const x = Math.round(this.x), y = Math.round(this.y);
    g.fillStyle = '#2b3442'; g.fillRect(x + 5, y + 8, 2, 12);           // column
    g.fillStyle = '#1a212c';
    g.fillRect(x + 1, y + 18, 4, 2); g.fillRect(x + 7, y + 18, 4, 2);   // legs
    g.fillStyle = '#3a4658'; g.fillRect(x, y, 12, 9);                   // body
    g.fillStyle = '#242c3a'; g.fillRect(x, y, 12, 1); g.fillRect(x, y + 8, 12, 1);
    g.fillStyle = '#11151e'; g.fillRect(x + 9, y + 2, 3, 5);            // lens
    g.fillStyle = '#7ec8f0'; g.fillRect(x + 10, y + 3, 1, 2);
    if (Math.floor(this.t * 4) % 2 === 0) {                             // tally light
      g.fillStyle = '#e8434f'; g.fillRect(x + 1, y + 2, 3, 3);
    }
  }
}

/* The man whose building it is, and a different fight from Edika on purpose.

   He is never stompable while he is broadcasting. Three cameras cover the
   studio; while any tally light is lit, landing on him only says ON AIR. This
   fight is about killing the feeds, not about timing a window - timing a
   window is the entirety of the Edika fight and would have been the entirety
   of this one too.

   With the last camera gone he loses the room: bolts back and forth at nearly
   triple pace, stops shooting, and can be run down and stomped once. The
   health bar counts cameras plus him, so smashing one reads as progress. */
const ANCHOR = { pace: 36, cycle: 2.4, aim: 0.6, volley: 3, gap: 0.30,
                 speed: 150, panic: 96, cameras: 3 };

class Anchor extends Entity {
  constructor(tx, gate = null) {
    const hb = hitboxFor('l2anchor');
    super(tx * TILE, 0, hb.w, hb.h);
    this.gate = gate;
    this.y = groundYAt(tx) - this.h;
    this.dir = -1; this.turnCd = 0; this.hitFlash = 0; this.t = 0;
    // cameras + himself: the bar counts feeds, so cutting one reads as progress
    this.hp = ANCHOR.cameras + 1;
    this.phase = 'pace'; this.phaseT = 0; this.left = 0;
    this.home = spanAround(tx);
    this.greeted = false;
  }
  get bossGrade() { return true; }
  get bossName() { return 'THE ANCHOR'; }
  get maxHp() { return ANCHOR.cameras + 1; }
  get onAir() { return game.enemies.some(e => e instanceof StudioCamera && !e.dead); }
  get harmless() { return this.phase === 'aim' || this.phase === 'offair'; }
  feedCut() {
    this.hp = Math.max(1, this.hp - 1);
    this.hitFlash = 0.3;
    if (!this.onAir) {
      this.phase = 'offair'; this.phaseT = 0;
      floatText(this.cx, this.y - 18, 'WE HAVE LOST THE FEED', '#ff8a5c');
      shake = 9; flash = 0.4;
    } else {
      floatText(this.cx, this.y - 16, `${this.hp - 1} CAMERAS LEFT`, '#7ec8f0');
    }
  }
  get engaged() {
    if (game.player.cx > (LEVEL.arenaX ?? 0) * TILE &&
        Math.abs(game.player.cx - this.cx) < 210) this.woke = true;
    return this.woke === true;
  }
  update(dt) {
    this.t += dt; this.phaseT += dt;
    this.turnCd = Math.max(0, this.turnCd - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.hitWall = false;
    if (this.scriptedOut) { this.vx = 0; return; }

    if (this.engaged && !this.greeted) {
      this.greeted = true;
      floatText(this.cx, this.y - 18, 'AND THE GUESTS HAVE ARRIVED...', '#ffd85e');
      shake = 3; Sfx.deny();
    }

    switch (this.phase) {
      case 'pace': {
        this.vx = this.dir * ANCHOR.pace;
        // each feed he loses makes him quicker to answer
        const urgency = 1 - (ANCHOR.cameras + 1 - this.hp) * 0.22;
        if (this.engaged && this.phaseT > ANCHOR.cycle * urgency) {
          this.phase = 'aim'; this.phaseT = 0;
          this.aimDir = Math.sign(game.player.cx - this.cx) || this.dir;
          this.dir = this.aimDir;
          Sfx.deny();
        }
        break;
      }
      case 'offair':
        // no more shooting: he just wants out of the room
        this.vx = this.dir * ANCHOR.panic;
        if (this.onGround && Math.random() < dt * 1.6) this.vy = -180;
        break;
      case 'aim':
        this.vx *= Math.pow(0.02, dt);
        if (this.phaseT > ANCHOR.aim) {
          this.phase = 'volley'; this.phaseT = 0; this.left = ANCHOR.volley; this.gap = 0;
        }
        break;
      case 'volley':
        this.vx *= Math.pow(0.05, dt);
        this.gap -= dt;
        if (this.gap <= 0 && this.left > 0) {
          game.hazards.push(new Bullet(this.cx + this.aimDir * 9,
                                       this.bottom - BULLET.ride, this.aimDir,
                                       'smear', ANCHOR.speed));
          this.left--; this.gap = ANCHOR.gap;
          shake = Math.max(shake, 2); Sfx.bump();
        }
        if (this.left <= 0 && this.gap <= 0) { this.phase = 'pace'; this.phaseT = 0; }
        break;
    }

    this.vy = Math.min(this.vy + CFG.gravity * dt, CFG.maxFall);
    moveAndCollide(this, dt, { oneWay: false });
    const ahead = Math.floor((this.dir > 0 ? this.x + this.w + 2 : this.x - 2) / TILE);
    const below = Math.floor((this.bottom + 3) / TILE);
    const ledge = this.onGround && !isSolid(tileAt(ahead, below)) && !isOneWay(tileAt(ahead, below));
    if ((this.hitWall || ledge) && this.turnCd <= 0) { this.dir *= -1; this.turnCd = TURN_CD; }
    leash(this);
    this.face = this.dir;
  }
  onStomp(p) {
    p.vy = CFG.stompBounce * 0.85;
    /* Not a timing window. While one camera is still rolling he is simply not
       a target, and the game says why rather than "NOT NOW" - the player needs
       to be told where to look. */
    if (this.onAir) {
      floatText(this.cx, this.y - 8, 'ON AIR', '#e8434f');
      shake = 4; Sfx.deny();
      return;
    }
    this.takeHit(p);
  }
  // the khachapuri/matsoni one-shot still has to go through the cameras
  chip(p) { if (!this.onAir) this.takeHit(p); }
  takeHit(p) {
    if (this.hp <= 0 || this.scriptedOut || this.onAir) return;
    this.hp = 0; this.hitFlash = 0.4;
    this.scriptedOut = true; this.dead = true;
    game.addCombo(p, this.cx, this.y, 2500);
    floatText(this.cx, this.y - 18, 'WE GO TO A BREAK', '#ffd85e');
    shake = 14; flash = 0.8; freeze = 0.2; Sfx.stomp();
    burst(this.cx, this.y + this.h / 2, 30,
          { colors: ['#f4f4f4', '#ffd85e', '#2b3a5e'], speed: 190, size: 3 });
    if (this.gate != null) openGate(this.gate);
    game.win();
  }
}

/* Only the artwork differs. Named classes rather than a factory because
   reset() builds enemies with `new (enemyKind(t))(...)`. */
class PressGirl  extends Journalist { constructor(tx) { super(tx, 'l2girl',  'high');   } }
class PressGirl2 extends Journalist { constructor(tx) { super(tx, 'l2girl2', 'charge'); } }
class PressMan   extends Journalist { constructor(tx) { super(tx, 'l2man',   'low');    } }

const BOMBER = { hp: 3, walk: 26, throwEvery: 2.7, range: 165,
                 blast: 44,        // radius that catches HIM
                 blastP: 26,       // ...and the smaller one that catches YOU
                 fuse: 2.9, puntFuse: 1.15, puntVel: 245, flee: 38 };

/* Armoured: stomping him does nothing. The only thing that hurts him is his
   own ordnance, so the fight is about the bombs, not about him. Stomp a live
   bomb to punt it back the way you are facing and cut its fuse. */
class Bomber extends Entity {
  constructor(tx, gate = null) {
    const hb = hitboxFor('l3bomb');
    super(tx * TILE, 0, hb.w, hb.h);
    this.y = groundYAt(tx) - this.h;
    this.gate = gate;
    this.hp = BOMBER.hp; this.dir = -1; this.turnCd = 0;
    this.cool = 1.2; this.hitFlash = 0; this.t = 0; this.taunt = 0;
    this.home = spanAround(tx);
  }
  update(dt) {
    this.t += dt;
    this.turnCd = Math.max(0, this.turnCd - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.taunt = Math.max(0, this.taunt - dt);
    this.cool -= dt;
    this.hitWall = false;

    const p = game.player;
    const d = p.cx - this.cx;
    if (Math.abs(d) > 10) this.face = Math.sign(d);

    // backs away from you so you cannot simply corner him
    // backs off less than he used to, or he simply outranges you forever
    if (Math.abs(d) < BOMBER.flee) this.dir = -Math.sign(d) || this.dir;
    this.vx = this.dir * BOMBER.walk;

    if (this.cool <= 0 && Math.abs(d) < BOMBER.range) {
      this.cool = BOMBER.throwEvery;
      game.enemies.push(new Bomb(this.cx, this.y + 6, Math.sign(d) || 1, this));
      Sfx.bump();
    }

    this.vy = Math.min(this.vy + CFG.gravity * dt, CFG.maxFall);
    moveAndCollide(this, dt, { oneWay: false });
    const ahead = Math.floor((this.dir > 0 ? this.x + this.w + 2 : this.x - 2) / TILE);
    const below = Math.floor((this.bottom + 3) / TILE);
    const ledge = this.onGround && !isSolid(tileAt(ahead, below)) && !isOneWay(tileAt(ahead, below));
    if ((this.hitWall || ledge) && this.turnCd <= 0) { this.dir *= -1; this.turnCd = TURN_CD; }
    leash(this);
  }
  get bossGrade() { return true; }
  get bossName() { return 'BOMBER'; }
  chip(p) { this.blastHit(p); }
  get maxHp() { return BOMBER.hp; }
  blastHit(p) {
    this.hp--; this.hitFlash = 0.4;
    shake = 7; freeze = 0.09; flash = 0.3;
    burst(this.cx, this.y + this.h / 2, 24, { colors: ['#ff8a5c', '#ffd85e', '#fff'], speed: 160, size: 3 });
    if (this.hp <= 0) {
      this.dead = true;
      game.score += 1000;
      floatText(this.cx, this.y - 4, '+1000', '#ffd85e');
      burst(this.cx, this.y + this.h / 2, 34, { colors: ['#ff8a5c', '#e8434f', '#fff'], speed: 200, size: 3 });
      shake = 10; flash = 0.55;
      if (this.gate != null) openGate(this.gate);
    } else floatText(this.cx, this.y - 8, `${this.hp} LEFT`, '#ffd85e');
  }
  onStomp(p) {
    p.vy = CFG.stompBounce * 0.8;
    this.taunt = 0.7;
    floatText(this.cx, this.y - 8, 'USE HIS BOMBS', '#ff8a5c');
    Sfx.deny();
  }
}

/* Lives in game.enemies so the existing stomp path can punt it. `harmless`
   so touching it costs nothing - the blast is the danger, not the casing. */
class Bomb extends Entity {
  constructor(x, y, dir, owner) {
    super(x - 6, y, 12, 12);      // a bigger target: you have to land on it
    this.vx = dir * 74; this.vy = -150;
    this.owner = owner; this.fuse = BOMBER.fuse; this.t = 0;
  }
  get bossGrade() { return true; }   // never vaporised: punting is the mechanic
  get harmless() { return true; }
  update(dt) {
    this.t += dt;
    this.fuse -= dt;
    this.hitWall = false;
    this.vy = Math.min(this.vy + CFG.gravity * dt, CFG.maxFall);
    moveAndCollide(this, dt, { oneWay: false });
    /* A thrown bomb rolls to a stop; a PUNTED one skids. Without the
       exemption friction killed a punt after 87px while he was still backing
       away, so the return shot never reached him and the fight was
       unwinnable. */
    if (this.onGround && !this.punted) this.vx *= Math.pow(0.15, dt);
    if (this.fuse <= 0) this.explode();
    if (Math.random() < dt * 26)
      burst(this.cx, this.y, 1, { colors: ['#ffd85e', '#ff8a5c'], speed: 14, grav: -40, life: .4, size: 1 });
  }
  explode() {
    if (this.dead) return;
    this.dead = true;
    shake = 6; Sfx.brick();
    burst(this.cx, this.cy2, 26, { colors: ['#ffd85e', '#ff8a5c', '#e8434f', '#fff'], speed: 190, size: 3, life: .7 });
    const ring = r => ({ x: this.cx - r, y: this.y + 4 - r, w: r * 2, h: r * 2 });
    const box = ring(BOMBER.blast);
    const p = game.player;
    // the player gets the smaller radius, so escaping your own punt is fair
    if (aabb(ring(BOMBER.blastP), p) && p.invincible <= 0) p.hurt(this.cx);
    for (const e of game.enemies) {
      if (e.dead || e === this) continue;
      if (!aabb(box, e)) continue;
      if (e instanceof Bomber) e.blastHit(p);
      else if (e instanceof Bomb) e.fuse = Math.min(e.fuse, 0.2);   // chains
      else if (e.onBumped) e.onBumped();
    }
  }
  get cy2() { return this.y + this.h / 2; }
  onStomp(p) {
    // punted: goes where you are facing, with a short fuse
    this.vx = (p.face || 1) * BOMBER.puntVel;
    this.vy = -110;
    this.punted = true;
    this.fuse = Math.min(this.fuse, BOMBER.puntFuse);
    p.vy = CFG.stompBounce * 0.85;
    floatText(this.cx, this.y - 8, 'KICK!', '#ffd85e');
    shake = 3; Sfx.stomp();
  }
}

/* Six hits: more than any intermediate. He had four while Svani had five,
   so the final boss was mechanically weaker than a mid boss and read as one.
   He also gets a named health bar, which is what actually sells "this is the
   last one" - Aslan has had one since act 1. */
/* Four hits, alternating form: man, fox, man, two foxes. Each hit flips him,
   so the fight never repeats a beat.
     hp 4  MAN  - paces his step and slams; waves run along the floor
     hp 3  FOX  - fast, charges and leaps; the window is after a pounce
     hp 2  MAN  - as above but quicker off the mark
     hp 1  FOX  + a second fox. Only one of them is really him; the other
                  pops when stomped.                                        */
/* The second fox at the last stage. Behaves like him and hurts on contact,
   but stomping it only pops it - the real one still owes you a hit. */
class DecoyFox extends Entity {
  constructor(x, y, dir) {
    super(x, y, 14, 12);
    this.dir = dir; this.turnCd = 0; this.t = rand(0, 3); this.phase = 'prowl'; this.phaseT = 0;
  }
  get bossGrade() { return true; }
  update(dt) {
    this.t += dt; this.phaseT += dt;
    this.turnCd = Math.max(0, this.turnCd - dt);
    this.hitWall = false;
    const p = game.player;
    const d = p.cx - this.cx;
    if (Math.abs(d) > 12) this.dir = Math.sign(d);
    this.vx = this.dir * DARD.foxRun * 0.85;
    if (this.onGround && Math.random() < dt * 2.0) this.vy = -180;
    this.vy = Math.min(this.vy + CFG.gravity * dt, CFG.maxFall);
    moveAndCollide(this, dt, { oneWay: false });
    if (this.hitWall && this.turnCd <= 0) { this.dir *= -1; this.turnCd = TURN_CD; }
    leash(this);
    this.face = this.dir;
  }
  onStomp(p) {
    this.dead = true;
    p.vy = CFG.stompBounce * 0.85;
    game.score += 300;
    floatText(this.cx, this.y - 8, 'NOT HIM', '#8890a4');
    burst(this.cx, this.y + 6, 18, { colors: ['#dde3ec', '#fff'], speed: 120, life: .7, size: 2 });
    shake = 3; Sfx.deny();
  }
}

/* Tightened after the fight played as too easy. The openings were 2.5s and
   1.6s long and arrived every few seconds, and once you climbed onto his step
   nothing could reach you there - you could stand beside him and wait. Now the
   slam shakes masonry down onto his own platform, the fox pounces in a real
   leap and sometimes twice, and both windows are roughly a third shorter. */
/* Hard but reactable. The first tightening went too far: four chunks falling
   from 46px up gave about 0.3s of warning, which is not a dodge, it is a coin
   flip - a pilot that used to survive the whole fight died in six seconds
   without landing a hit. Fewer chunks, dropped from higher, falling slower,
   and each one paints where it will land before it gets there. */
/* Loosened after playtest feedback that the fox was uncatchable - "jumps
   around so much and is impossible to catch him vulnerable". That is the
   version my own pilots scored 4/5 on, which says more about the pilots than
   the fight: a bot reads e.phase directly and pounces on the exact frame the
   window opens, so a 1.35s opening on a target moving at 150px/s looked fine
   to it and was not fine for a person.

   The fox is where the changes land. `pant` - the only beat he can be stomped
   on - is now the longest window in the fight, he runs slower, and the chance
   of a second pounce that carries him out of reach is roughly halved. The
   man's window is nudged up to match. */
const DARD = { hp: 4, pace: 30, slamEvery: 2.8, windup: 0.62, winded: 2.2, quipEvery: 3.1,
               foxRun: 118, foxLeap: -330, prowl: 1.15, pounce: 0.95, pant: 2.2,
               debris: 3, doublePounce: 0.20,
               /* Only the man shoots. It keeps the two forms asking for
                  different things: duck the man, jump the fox. */
               shootEvery: 2.1, aim: 0.5 };

/* He never actually says anything. The stage direction IS the joke. */
const DARD_QUIPS = ['IRONIC REMARK', 'SMIRK', 'IRONIC REMARK', 'DRY CHUCKLE'];

/* The final fight, and deliberately not the level-1 boss reskinned: he never
   chases and never dives. He holds the top step and slams, and the waves run
   along the floor - so the fight is about climbing to him during the window
   after a slam, not about dodging him in the open. */
class Dardubala extends Entity {
  constructor(tx) {
    const hb = hitboxFor('l3dard');
    super(tx * TILE, 0, hb.w, hb.h);
    this.y = groundYAt(tx) - this.h;
    this.hp = DARD.hp; this.dir = -1; this.turnCd = 0;
    this.phase = 'pace'; this.phaseT = 0; this.hitFlash = 0; this.t = 0;
    this.home = spanAround(tx);
    this.quip = 1.4; this.quipN = 0;
    this.shoot = DARD.shootEvery; this.slam = DARD.slamEvery;
  }
  get bossGrade() { return true; }
  get bossName() { return 'EDIKA'; }
  get maxHp() { return DARD.hp; }
  // man on even hp, fox on odd - he flips with every hit he takes
  get isFox() { return this.hp % 2 === 1; }
  /* Safe to touch while rearing back, as well as while winded. He shares his
     step with you and damages on contact, so with only the 2.5s window safe a
     handful of unavoidable brushes ended the run before a stomp ever landed.
     Telegraphing and striking should not both be lethal. Note onStomp still
     only accepts a hit during 'winded' - windup is safe, not open. */
  get harmless() {
    return this.phase === 'winded' || this.phase === 'windup' ||
           this.phase === 'pant'   || this.phase === 'aim';
  }
  /* Latches. Without it, retreating back past the arena line switched his
     slams off, so he never opened a window and the fight deadlocked - a bot
     playing it correctly landed zero hits in two minutes. */
  /* Engages when you are past the arena line AND close enough to actually
     see him. The line alone is at tile 186 and he stands at 207, so the fight
     used to start 336px away - the bar appeared and he began slamming while
     still off screen, which is why it kicked off out of nowhere. Latched once
     lit, so retreating cannot switch it back off. */
  get engaged() {
    if (game.player.cx > (LEVEL.arenaX ?? 186) * TILE &&
        Math.abs(game.player.cx - this.cx) < 210) this.woke = true;
    return this.woke === true;
  }
  update(dt) {
    this.t += dt; this.phaseT += dt;
    this.turnCd = Math.max(0, this.turnCd - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.hitWall = false;
    if (this.scriptedOut) { this.vx = 0; return; }

    this.quip -= dt;
    if (this.quip <= 0 && this.engaged) {
      this.quip = DARD.quipEvery + (this.quipN % 2) * 0.9;
      floatText(this.cx, this.y - 14, `*${DARD_QUIPS[this.quipN++ % DARD_QUIPS.length]}*`, '#c9a0ff');
      Sfx.bump();
    }

    // ---- fox form: prowl, pounce, pant. Nothing like the man's rhythm.
    if (this.isFox) {
      const p = game.player;
      const d = p.cx - this.cx;
      if (this.phase !== 'prowl' && this.phase !== 'pounce' && this.phase !== 'pant') {
        this.phase = 'prowl'; this.phaseT = 0;
      }
      switch (this.phase) {
        case 'prowl':
          if (Math.abs(d) > 12) this.dir = Math.sign(d);
          this.vx = this.dir * DARD.foxRun;
          if (this.onGround && Math.random() < dt * 2.2) this.vy = -190;   // skittish hops
          if (this.phaseT > DARD.prowl && this.engaged) {
            this.phase = 'pounce'; this.phaseT = 0;
            if (this.onGround) this.vy = DARD.foxLeap;
            this.dir = Math.sign(d) || this.dir;
            Sfx.deny();
          }
          break;
        case 'pounce':
          this.vx = this.dir * DARD.foxRun * 1.5;
          if (this.phaseT > DARD.pounce || (this.onGround && this.phaseT > 0.35)) {
            burst(this.cx, this.bottom, 14,
                  { colors: ['#dde3ec', '#fff'], speed: 90, grav: 300, life: .5, size: 2, spread: Math.PI });
            // a second leap often follows, so standing behind him is not an answer
            if (!this.chained && Math.random() < DARD.doublePounce) {
              this.chained = true;
              this.phaseT = 0;
              this.dir = Math.sign(p.cx - this.cx) || this.dir;
              if (this.onGround) this.vy = DARD.foxLeap * 0.85;
              shake = 3;
            } else {
              this.chained = false;
              this.phase = 'pant'; this.phaseT = 0;
              const fy = groundBelow(this.cx, this.bottom + 2) ?? (13 * TILE);
              for (const d of [-1, 1]) game.hazards.push(new Shockwave(this.cx, fy, d, '#e8eef8'));
            }
          }
          break;
        case 'pant':
          /* Dead stop, not a decay. Coasting through the one window he can be
             stomped on meant lining up a landing on a moving target - which is
             most of what "impossible to catch him vulnerable" was. */
          this.vx = 0;
          if (this.phaseT > DARD.pant) { this.phase = 'prowl'; this.phaseT = 0; }
          break;
      }
      this.vy = Math.min(this.vy + CFG.gravity * dt, CFG.maxFall);
      moveAndCollide(this, dt, { oneWay: false });
      const fa = Math.floor((this.dir > 0 ? this.x + this.w + 2 : this.x - 2) / TILE);
      const fb = Math.floor((this.bottom + 3) / TILE);
      if (this.hitWall && this.turnCd <= 0) { this.dir *= -1; this.turnCd = TURN_CD; }
      leash(this);
      this.face = this.dir;
      return;
    }

    switch (this.phase) {
      case 'pace':
        this.vx = this.dir * DARD.pace;
        if (!this.engaged) break;
        /* Two independent clocks, and the SLAM has priority.

           The slam used to be driven off phaseT, and returning from a shot
           reset phaseT - with shootEvery (2.1s) under slamEvery (2.8s) he
           re-armed the slam before it could ever fire and looped
           pace -> aim -> pace forever. He never went winded, which is the only
           beat a man-form Edika can be stomped on, so the fight became
           literally unwinnable: three pilots, zero hits, dead in eight
           seconds. Whatever else changes here, the stompable window must not
           be starvable by the shot. */
        this.shoot -= dt; this.slam -= dt;
        if (this.slam <= 0) {
          this.phase = 'windup'; this.phaseT = 0;
          this.slam = DARD.slamEvery; Sfx.deny();
          break;
        }
        if (this.shoot <= 0) {
          this.phase = 'aim'; this.phaseT = 0;
          // he aims at YOU, not along his facing: standing behind him is not free
          this.aimDir = Math.sign(game.player.cx - this.cx) || this.dir;
          this.dir = this.aimDir;
          Sfx.deny();
        }
        break;
      case 'aim':
        this.vx *= Math.pow(0.02, dt);
        if (this.phaseT > DARD.aim) {
          // his own feet are the reference: a groundBelow search from here
          // found the floor four tiles under his step and fired into the air
          const fy = this.bottom;
          game.hazards.push(new Bullet(this.cx + this.aimDir * 8,
                                       fy - BULLET.ride, this.aimDir));
          shake = 3; Sfx.bump();
          burst(this.cx + this.aimDir * 10, fy - BULLET.ride + 2, 10,
                { colors: ['#ffd85e', '#ff8a5c', '#fff'], speed: 90, grav: 60, life: .4, size: 1 });
          this.shoot = DARD.shootEvery + rand(-0.3, 0.5);
          this.phase = 'pace'; this.phaseT = 0;
        }
        break;
      case 'windup':
        this.vx *= Math.pow(0.02, dt);
        if (this.phaseT > DARD.windup) {
          this.phase = 'winded'; this.phaseT = 0;
          shake = 8; Sfx.brick();
          burst(this.cx, this.bottom, 20,
                { colors: ['#c9a06a', '#fff'], speed: 120, grav: 340, life: .6, size: 2, spread: Math.PI });
          /* The waves run along the FLOOR, not along his own step. Spawning
             them at his feet swept the one surface you have to stand on to
             reach him, so the fight punished exactly the thing it was asking
             for - a player parked on his platform lost a heart to a wave he
             could not have avoided. On the floor they threaten the approach
             instead, which is what makes the climb the point. */
          // + TILE, not + 4: groundBelow starts scanning at the row his feet
          // are already in, so a smaller offset just finds his own platform
          /* The real floor, not merely the first surface below him. Standing
             over the 196-201 step, groundBelow returned that step, so the wave
             spawned on a six-tile ledge and died two tiles later - it looked
             like it dropped at his feet and went nowhere. */
          const tx = Math.floor(this.cx / TILE);
          const onGroundSpan = LEVEL.ground.some(([a, b]) => tx >= a && tx < b);
          const floorY = onGroundSpan ? 13 * TILE
                       : (groundBelow(this.cx, this.bottom + TILE) ?? 13 * TILE);
          for (const dir of [-1, 1]) game.hazards.push(new Shockwave(this.cx, floorY, dir, '#c9a0ff'));
          // and shake the ceiling down onto his own step, so up here is not free
          const n = DARD.debris + (this.hp <= 2 ? 1 : 0);
          for (let i = 0; i < n; i++)
            game.hazards.push(new Debris(this.cx + (i - (n - 1) / 2) * 34 + rand(-5, 5),
                                         this.y - 92 - i * 14));
        }
        break;
      case 'winded':
        this.vx = 0;                       // see 'pant': the open beat holds still
        if (this.phaseT > DARD.winded) { this.phase = 'pace'; this.phaseT = 0; }
        break;
    }

    this.vy = Math.min(this.vy + CFG.gravity * dt, CFG.maxFall);
    moveAndCollide(this, dt, { oneWay: false });
    const ahead = Math.floor((this.dir > 0 ? this.x + this.w + 2 : this.x - 2) / TILE);
    const below = Math.floor((this.bottom + 3) / TILE);
    const ledge = this.onGround && !isSolid(tileAt(ahead, below)) && !isOneWay(tileAt(ahead, below));
    if ((this.hitWall || ledge) && this.turnCd <= 0) { this.dir *= -1; this.turnCd = TURN_CD; }
    leash(this);
    this.face = this.dir;
  }
  onStomp(p) {
    p.vy = CFG.stompBounce * 0.85;
    /* The open beat differs by form: 'winded' as a man, 'pant' as a fox.
       Checking only 'winded' left the fox untouchable, so the fight stuck at
       3 hp forever no matter how cleanly you landed on him. */
    const open = this.isFox ? this.phase === 'pant' : this.phase === 'winded';
    if (!open) {
      floatText(this.cx, this.y - 8, 'NOT NOW', '#c9a0ff');
      shake = 4; Sfx.deny();
      return;
    }
    this.takeHit(p);
  }

  chip(p) { this.takeHit(p); }

  takeHit(p) {
    /* He is never marked dead - his defeat hands off to the tea outro - so
       without this guard the invincible-contact path kept chipping him past
       zero and drove his health bar negative. */
    if (this.hp <= 0 || this.scriptedOut) return;
    this.hp--; this.hitFlash = 0.4;
    this.phase = this.isFox ? 'prowl' : 'pace'; this.phaseT = 0;
    shake = 7; freeze = 0.1; flash = 0.35; Sfx.stomp();
    burst(this.cx, this.y + this.h / 2, 26,
          { colors: this.isFox ? ['#dde3ec', '#fff', '#c9a0ff'] : ['#c9a0ff', '#ffd85e', '#fff'],
            speed: 180, size: 3 });
    if (this.hp <= 0) {
      game.addCombo(p, this.cx, this.y, 3000);
      /* His last word, and the punchline of the whole act - at scale 1 for
         0.9s it went by in a blink. Scale 2 for 2.6s, held still, and kept
         clear of the top of the buffer. 166px wide at that scale, so it
         fits. */
      floatText(this.cx, this.y - 26, 'SAXLSHIIIIIIII', '#ffd85e', 2, 2.6);
      shake = 14; flash = 0.8; freeze = 0.2;
      game.teaOutro();
    } else {
      // the transformation itself, announced
      floatText(this.cx, this.y - 20, this.isFox ? '*BECOMES A FOX*' : '*BACK AGAIN*',
                this.isFox ? '#dde3ec' : '#c9a0ff');
      if (this.hp === 1 && !this.split) {      // last stage: a second fox
        this.split = true;
        const dec = new DecoyFox(this.cx + (this.face > 0 ? -26 : 26), this.y, -this.face || 1);
        dec.home = this.home;
        game.enemies.push(dec);
        floatText(this.cx, this.y - 30, 'TWO OF THEM', '#ff5ec4');
      }
      game.addCombo(p, this.cx, this.y, 600);
      // not on the split: 'TWO OF THEM' and the combo already land here, and a
      // fourth line on the same spot came out as unreadable overlap
      if (!(this.hp === 1 && this.split))
        floatText(this.cx, this.y - 10, `${this.hp} LEFT`, '#ffd85e');
    }
  }
}

/* Flies, stalks the player forever, cannot be killed. At the flag he leaves by
   helicopter rather than being fought — see game.escape().

   He runs a readable three-beat loop rather than just drifting, because an
   invulnerable enemy with no pattern isn't a fight, it's just an annoyance you
   can't read:
     STALK     — hovers above and behind you, matching your speed
     TELEGRAPH — stops, rises, flashes with a "!" over his head
     DIVE      — drops fast at where you were standing
   then recovers back up to stalking. The telegraph is the whole point: it's
   the window where you know to move.

   Top speed is deliberately above the player's sprint. At 100 (below sprint's
   148) he simply fell behind and left the screen, which read as him escaping
   at the start of the encounter instead of hunting you. */
const BOSS = {
  stalkSpeed: 210, diveSpeed: 275, hoverGap: 72,
  cycle: 2.2, telegraph: 0.95, dive: 0.85,
  grounded: 2.1,        // the vulnerable window after a dive
  /* Three hits, not four. A scripted player landing its stomps cleanly still
     died one hit short at four, and it had the pipe and the khachapuri going
     unused — the margin was thinner than a boss you are forced to beat should
     have. Longer telegraph and a slower dive on top, since the dive is the
     only thing in the fight that damages you. */
  maxHp: 3,
};

class FlyingBoss extends Entity {
  constructor(x, y) {
    const hb = hitboxFor('boss');
    super(x, y, hb.w, hb.h);
    this.t = rand(0, 10); this.denyFlash = 0; this.baseY = y;
    this.scripted = false;
    this.phase = 'stalk'; this.phaseT = 0; this.diveX = 0; this.diveY = 0;
    this.hp = BOSS.maxHp; this.hitFlash = 0; this.side = 1;
  }

  // Only reachable, and only damageable, in the beat right after a dive.
  get vulnerable() { return this.phase === 'grounded'; }

  /* Winded, so he cannot hurt you either.

     Without this the window was unusable: the dive drops him right next to
     you, and side contact still cost a heart, so walking in to take the free
     stomp cost more than it gained. A test bot playing the window perfectly
     lost all three hearts in eight seconds without landing a single hit. */
  get harmless() { return this.vulnerable; }

  /* He stalks from tile 128 but only fights from tile 196.

     Without this gate, beating him triggers his helicopter exit — and the exit
     ends the level. Winning the fight at the trigger point therefore ended the
     run halfway through, which is the "boss flew away mid game" behaviour.
     Holding the dives until the final stretch keeps the long stalk and makes
     the fight the climax it should be. */
  get engaged() { return game.player.cx > LEVEL.bossArenaX * TILE; }

  update(dt) {
    this.t += dt;
    this.denyFlash = Math.max(0, this.denyFlash - dt);
    if (this.scripted) return;

    const p = game.player;
    this.phaseT += dt;

    if (this.phase === 'stalk') {
      /* Stalking, he trails behind you. Fighting, he takes up station off to
         one side and swaps sides between dives.

         Not directly overhead: from overhead the dive is vertical, and a drop
         from ~50px at 300px/s gives about 0.15s to react — roughly 17px of
         movement, far less than his width. It was literally undodgeable, and
         a stationary player took a hit every single cycle. Off to the side the
         dive is diagonal, so the telegraph is worth something.

         Safe to lure you sideways here because the arena floor is solid from
         192 to 240 and fenced by gates at both ends — there is nothing to be
         backed off. */
      const targetX = this.engaged
        ? p.cx + BOSS.hoverGap * this.side
        : p.cx - BOSS.hoverGap * (p.face || 1);
      const targetY = clamp(p.y - 52, 10, LEVEL_H_PX - 130);
      this.vx = clamp((targetX - this.cx) * 3.2, -BOSS.stalkSpeed, BOSS.stalkSpeed);
      this.x += this.vx * dt;
      this.baseY = lerp(this.baseY, targetY, 1 - Math.pow(0.12, dt));
      this.y = this.baseY + Math.sin(this.t * 1.9) * 12;
      if (this.phaseT > BOSS.cycle && this.engaged) {
        this.phase = 'telegraph'; this.phaseT = 0; Sfx.deny();
      }

    } else if (this.phase === 'telegraph') {
      this.vx *= Math.pow(0.02, dt);
      this.x += this.vx * dt;
      this.baseY -= 26 * dt;                                  // rears up
      this.y = this.baseY;
      if (this.phaseT > BOSS.telegraph) {
        this.phase = 'dive'; this.phaseT = 0;
        this.diveX = p.cx; this.diveY = p.bottom - this.h;    // commits to where you ARE
        shake = 3;
      }

    } else if (this.phase === 'dive') {
      const dx = this.diveX - this.cx, dy = this.diveY - this.y;
      const len = Math.hypot(dx, dy) || 1;
      this.x += (dx / len) * BOSS.diveSpeed * dt;
      this.y += (dy / len) * BOSS.diveSpeed * dt;
      this.baseY = this.y;
      burst(this.cx, this.y + this.h / 2, 1,
            { colors: ['#a06bd0', '#6b3fa0'], speed: 20, grav: 40, life: 0.4, size: 2 });
      if (this.phaseT > BOSS.dive || len < 8) {
        this.phase = 'grounded'; this.phaseT = 0;
        shake = 4;
        burst(this.cx, this.bottom, 14,
              { colors: ['#c9a0ff', '#6b3fa0', '#fff'], speed: 80, grav: 300, life: .5, size: 2, spread: Math.PI });
      }

    } else if (this.phase === 'grounded') {
      // Winded and within reach. Drifts a little, cannot chase.
      this.vx *= Math.pow(0.06, dt);
      this.x += this.vx * dt;
      this.vy = Math.min(this.vy + CFG.gravity * dt, CFG.maxFall);
      moveAndCollide(this, dt, { oneWay: false });
      this.baseY = this.y;
      if (Math.random() < dt * 14)
        burst(this.cx + rand(-8, 8), this.y, 1,
              { colors: ['#ffd85e', '#fff'], speed: 18, grav: -30, life: .6, size: 1 });
      if (this.phaseT > BOSS.grounded) { this.phase = 'recover'; this.phaseT = 0; }

    } else {                                                   // recover
      this.baseY = lerp(this.baseY, clamp(p.y - 62, 10, LEVEL_H_PX - 130), 1 - Math.pow(0.06, dt));
      this.y = this.baseY;
      if (this.phaseT > 0.9) {
        this.phase = 'stalk'; this.phaseT = 0;
        this.side *= -1;                 // come at you from the other side next
      }
    }

    if (Math.abs(p.cx - this.cx) > 6) this.face = Math.sign(p.cx - this.cx);

    if (Math.random() < dt * 22)
      burst(this.cx + rand(-10, 10), this.y + rand(4, this.h), 1,
            { colors: ['#6b3fa0', '#39304a', '#a06bd0'], speed: 14, grav: -30, life: 1.1, size: 1 });
  }

  onStomp(p) {
    p.vy = CFG.stompBounce * 0.85;

    // Airborne and untouchable: the stomp just bounces off.
    if (!this.vulnerable) {
      this.denyFlash = 0.5;
      floatText(this.cx, this.y - 8, 'OUT OF REACH', '#c9a0ff');
      shake = 5; flash = 0.4; freeze = 0.08; Sfx.deny();
      burst(this.cx, this.y + this.h / 2, 18, { colors: ['#6b3fa0', '#c9a0ff', '#fff'], speed: 115 });
      return;
    }

    this.takeHit(p);
  }

  chip(p) { this.takeHit(p); }

  takeHit(p) {
    this.hp--;
    this.hitFlash = 0.4;
    this.phase = 'recover'; this.phaseT = 0;      // knocked straight out of the window
    shake = 6; freeze = 0.1; flash = 0.35; Sfx.stomp();
    burst(this.cx, this.y + this.h / 2, 22, { colors: ['#e8434f', '#ffd85e', '#fff'], speed: 150, size: 3 });

    if (this.hp <= 0) {
      game.addCombo(p, this.cx, this.y, 2000);
      floatText(this.cx, this.y - 18, 'HE IS BEATEN', '#7ae07a');
      shake = 12; flash = 0.8; freeze = 0.18;
      burst(this.cx, this.y + this.h / 2, 44,
            { colors: ['#ffd85e', '#e8434f', '#7ae07a', '#fff'], speed: 210, life: 1, size: 3 });
      game.escape();                               // beaten, so he runs for the helicopter
    } else {
      game.addCombo(p, this.cx, this.y, 500);
      floatText(this.cx, this.y - 10, `${this.hp} LEFT`, '#ffd85e');
    }
  }
}

/* The hero's weakness, as a movement hazard rather than an enemy.

   Inside her radius he is dragged toward her and his top speed drops, so a
   section with one in it has to be crossed with momentum or from above instead
   of just held-right. Touching her locks him staring for a beat and wipes the
   combo — it costs tempo and score, never health. A cooldown after each catch
   is what stops it becoming an inescapable loop. Khachapuri makes him immune,
   which is the joke: the only thing that beats it is lunch. */
/* `immune` is the important number, not `cooldown`.

   Being charmed pins him where he stands — which is inside her hitbox. So the
   per-character cooldown alone did not stop a loop: it expired while he was
   still standing on top of her, and the slow meant the free window was not
   long enough to walk clear of the radius before it fired again. A soak run
   spent 64% of its frames charmed. The immunity window runs from the player,
   not the character, and suspends the pull and the slow too, so he always gets
   a clean walk away. */
const CHARM = { radius: 62, pull: 340, slowTo: 0.5, hold: 1.1, cooldown: 2.4, immune: 2.0 };

class Admirer extends Entity {
  constructor(tx) {
    const hb = hitboxFor('lady');
    super(tx * TILE, 0, hb.w, hb.h);
    this.y = groundYAt(tx) - this.h;
    this.t = rand(0, 6); this.cd = 0; this.active = false;
  }
  update(dt) {
    this.t += dt;
    this.cd = Math.max(0, this.cd - dt);
    const p = game.player;
    this.face = Math.sign(p.cx - this.cx) || 1;

    const d = p.cx - this.cx;
    const inRange = Math.abs(d) < CHARM.radius && Math.abs(p.bottom - this.bottom) < 44;
    const wasActive = this.active;
    this.active = inRange && this.cd <= 0 && p.invincible <= 0 && p.charmImmune <= 0;
    // Laughs as you come into range, on the rising edge only.
    if (this.active && !wasActive) Stinger.laugh({ onlyIfIdle: true });

    if (this.active && p.charmed <= 0) {
      p.charmPull -= Math.sign(d) * CHARM.pull;
      p.charmSlow = true;
    }
    if (Math.random() < dt * (this.active ? 16 : 3))
      burst(this.cx + rand(-7, 7), this.y + rand(0, 10), 1,
            { colors: ['#ff7aa8', '#ffd0e0', '#fff'], speed: 12, grav: -24, life: 1.1, size: 1 });
  }
}

/* A gate is open if its guard is gone. Checked every frame rather than fired
   from the kill.

   There are four ways a mid boss can die — stomped, block-bumped, vaporised by
   khachapuri, or fallen out of the world — and only two of them ran the death
   path that called openGate. The invincible kill sets `dead` directly, so
   eating the khachapuri sitting at tile 64 and running the guard down with it
   left his gate shut forever with nothing left alive to open it. Reconciling
   against the guard's state cannot miss a path. openGate is idempotent. */
function reconcileGates() {
  for (const gt of game.gates) {
    if (gt.kind === 'final') {
      if (game.bossBeaten) openGate(gt.x, 'RUN FOR THE FLAG');
    } else if (!gt.guard || gt.guard.dead) {
      openGate(gt.x);
    }
  }
}

function resolveCharmers(dt) {
  const p = game.player;
  for (const a of game.charmers) {
    a.update(dt);
    if (a.cd > 0 || p.invincible > 0 || p.charmed > 0 || p.charmImmune > 0) continue;
    if (!aabb(p, a)) continue;
    p.charmed = CHARM.hold;
    p.charmImmune = CHARM.hold + CHARM.immune;   // guarantees a clean walk away
    p.combo = 0;
    a.cd = CHARM.cooldown;
    floatText(p.cx, p.y - 12, "CAN'T LOOK AWAY", '#ff7aa8');
    burst(p.cx, p.y + 6, 16,
          { colors: ['#ff7aa8', '#ff3d7f', '#fff'], speed: 70, grav: -50, life: 0.9, size: 2 });
    Sfx.charm();
  }
}

// Little heart, for the charmed state and her idle sparkle.
function drawHeartIcon(x, y, color) {
  x = Math.round(x); y = Math.round(y);
  g.fillStyle = color;
  g.fillRect(x + 1, y, 2, 1); g.fillRect(x + 4, y, 2, 1);
  g.fillRect(x, y + 1, 7, 2);
  g.fillRect(x + 1, y + 3, 5, 1);
  g.fillRect(x + 2, y + 4, 3, 1);
  g.fillRect(x + 3, y + 5, 1, 1);
}

/* A thrown rose. Does not kill - it staggers, which is the point: it opens a
   window instead of replacing one. Every fight in the game was "wait for the
   opening and land on his head", and one ranged verb changes all of them at
   once without touching a single boss. */
const ROSE_STUN = 1.7;

class ThrownRose extends Entity {
  constructor(x, y, dir) {
    super(x - 3, y, 6, 6);
    this.vx = dir * 215; this.vy = -115; this.dir = dir; this.t = 0; this.life = 2.2;
  }
  update(dt) {
    this.t += dt; this.life -= dt;
    this.hitWall = false;
    this.vy = Math.min(this.vy + CFG.gravity * 0.45 * dt, CFG.maxFall);
    moveAndCollide(this, dt, { oneWay: false });
    if (this.hitWall || this.onGround || this.life <= 0) {
      this.dead = true;
      burst(this.cx, this.cy2, 6, { colors: ['#d6263c', '#3fae4a'], speed: 50, life: .4, size: 1 });
    }
    if (Math.random() < dt * 26)
      burst(this.cx, this.cy2, 1, { colors: ['#f05a6a', '#d6263c'], speed: 12, grav: 40, life: .35, size: 1 });
  }
  get cy2() { return this.y + this.h / 2; }
  draw() { drawMiniRose(Math.round(this.x - 1), Math.round(this.y - 2)); }
}

function resolveShots() {
  for (const r of game.shots) {
    if (r.dead) continue;
    for (const e of game.enemies) {
      if (e.dead || e instanceof Bomb || !aabb(r, e)) continue;
      r.dead = true;
      // bosses shrug it off faster than the rank and file, but it still opens them
      e.stun = e.bossGrade ? ROSE_STUN * 0.7 : ROSE_STUN;
      floatText(e.cx, e.y - 10, 'STUNNED', '#ff8fd0');
      burst(e.cx, e.y + e.h / 2, 12, { colors: ['#d6263c', '#f05a6a', '#fff'], speed: 90 });
      shake = 2; Sfx.coin();
      break;
    }
  }
  game.shots = game.shots.filter(r => !r.dead);
}

class Coin extends Entity {
  constructor(tx, ty) { super(tx * TILE + 4, ty * TILE + 4, 8, 10); this.t = rand(0, 6); }
  update(dt) { this.t += dt * 7; }
}

const ITEM_SIZE = { khachapuri: [14, 10], rose: [9, 12], powder: [12, 12], ultra: [12, 12],
                    tea: [13, 10], matsoni: [13, 11] };

// [line 1, line 2, colour] — drawn above the pickup so it names itself.
const ITEM_LABEL = {
  khachapuri: ['ACHARULI', 'KHACHAPURI', '#ffd85e'],
  tea:        ['HOT', 'TEA', '#e8c07a'],
  matsoni:    ['COLD', 'MATSONI', '#dff0f6'],
  powder:     ['WHITE', 'POWDER', '#9ee8ff'],
  ultra:      ['ULTRA WHITE', 'POWDER', '#ffd85e'],
};

class Item extends Entity {
  constructor(tx, ty, kind) {
    const [w, h] = ITEM_SIZE[kind];
    super(tx * TILE + (TILE - w) / 2, ty * TILE, w, h);
    this.kind = kind; this.t = rand(0, 6); this.baseY = this.y;
  }
  update(dt) {
    this.t += dt;
    this.y = this.baseY + Math.round(Math.sin(this.t * 2.4) * 2);   // whole pixels only
    if (this.kind === 'khachapuri' && Math.random() < dt * 6)
      burst(this.cx + rand(-6, 6), this.y + 2, 1,
            { colors: ['#ffd85e', '#fff2c0'], speed: 10, grav: -25, life: 0.7, size: 1 });
    if (this.kind === 'matsoni' && Math.random() < dt * 4)
      burst(this.cx + rand(-5, 5), this.y + 2, 1,
            { colors: ['#fff', '#dff0f6'], speed: 8, grav: -14, life: .8, size: 1 });
    if (this.kind === 'tea' && Math.random() < dt * 5)
      burst(this.cx, this.y, 1, { colors: ['#fff', '#e8c07a'], speed: 7, grav: -18, life: .9, size: 1 });
    if (this.kind === 'powder' && Math.random() < dt * 7)
      burst(this.cx + rand(-6, 6), this.y + rand(0, 10), 1,
            { colors: ['#9ee8ff', '#fff'], speed: 9, grav: -20, life: 0.8, size: 1 });
    if (this.kind === 'ultra' && Math.random() < dt * 16)
      burst(this.cx + rand(-7, 7), this.y + rand(0, 12), 1,
            { colors: ['#ffd85e', '#fff', '#ffb03a'], speed: 14, grav: -34, life: 0.9, size: 1 });
  }
}

/* ---------------------------------------------------------- high scores

   Local to the browser. GitHub Pages serves static files only, so there is no
   server to hold a shared board — see the README for what a global one would
   need. Every localStorage call is wrapped: it throws outright in some private
   modes rather than just returning null. */

const ENTRY_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ.- ';

const Scores = {
  KEY: 'mishamode.scores.v1',
  MAX: 5,
  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.KEY));
      if (!Array.isArray(raw)) return [];
      return raw
        .filter(r => r && typeof r.score === 'number' && isFinite(r.score))
        .map(r => ({ name: String(r.name || '---').slice(0, 3), score: Math.max(0, Math.floor(r.score)) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, this.MAX);
    } catch (e) { return []; }
  },
  save(list) {
    try { localStorage.setItem(this.KEY, JSON.stringify(list.slice(0, this.MAX))); }
    catch (e) { /* storage unavailable — board is just not persisted */ }
  },
  qualifies(score) {
    if (!(score > 0)) return false;
    const l = this.load();
    return l.length < this.MAX || score > l[l.length - 1].score;
  },
  add(name, score) {
    const l = this.load();
    l.push({ name, score: Math.max(0, Math.floor(score)) });
    l.sort((a, b) => b.score - a.score);
    const top = l.slice(0, this.MAX);
    this.save(top);
    return top;
  },
};

/* One of the crowd.

   Silhouette first: narrow head, a neck, shoulders wider than the torso, and
   legs with daylight between them. The previous pass was a 5x9 rectangle with
   a 3x4 rectangle on top, which reads as a bollard no matter what colour it
   is - at this size the outline is doing all the work, not the detail. */
const CROWD_SKIN = ['#e8c39a', '#c98f62', '#f2dcc0', '#a9714a'];
const CROWD_HAIR = ['#241c22', '#33231a', '#171419', '#3d3128'];   // all well below any skin tone
const CROWD_COAT = ['#8f3b46', '#39557f', '#57457a', '#7a6a34', '#3f6b55', '#8a5a2e'];
const CROWD_LEGS = ['#2b3040', '#37303f', '#232733', '#3d3a30'];

function drawPerson(cx, groundY, seed, back, step, prop) {
  const H = back ? 22 : 26;
  const x = Math.round(cx) - 4, y = Math.round(groundY) - H;
  const dim = back ? 0.66 : 1;
  const mix = hex => {
    if (dim === 1) return hex;
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * dim + 20 * (1 - dim));
    const gg = Math.round(((n >> 8) & 255) * dim + 26 * (1 - dim));
    const b = Math.round((n & 255) * dim + 44 * (1 - dim));
    return `rgb(${r},${gg},${b})`;
  };
  const skin = CROWD_SKIN[seed % CROWD_SKIN.length];
  const hair = CROWD_HAIR[(seed * 3) % CROWD_HAIR.length];
  const coat = CROWD_COAT[(seed * 5) % CROWD_COAT.length];
  const legs = CROWD_LEGS[(seed * 7) % CROWD_LEGS.length];
  const sh = back ? 4 : 5;                       // shoulder half-width

  // legs, one forward: a gap between them is what stops it reading as a post
  const legTop = y + H - 8;
  g.fillStyle = mix(legs);
  g.fillRect(x + 2, legTop, 2, 8 - step);
  g.fillRect(x + 5, legTop, 2, 8 - (1 - step));
  g.fillStyle = mix('#1a1a20');                  // shoes
  g.fillRect(x + 1, y + H - 1, 3, 1);
  g.fillRect(x + 5, y + H - 1, 3, 1);

  // torso, narrower than the shoulders
  g.fillStyle = mix(coat);
  g.fillRect(x + 2, y + 10, 5, legTop - (y + 10));
  g.fillRect(x + 9 - sh - 4, y + 8, sh + 3, 3);  // shoulder line
  g.fillStyle = mix('#00000030');
  g.fillRect(x + 2, legTop - 1, 5, 1);

  // arms
  g.fillStyle = mix(coat);
  if (prop === 'flag') {
    /* Held out to the right, above head height. The crowd is drawn right to
       left at 9px spacing, so a flag on this side is never painted over by
       the neighbour behind. */
    g.fillRect(x + 7, y + 5, 1, 5);              // one raised
    g.fillStyle = mix(skin); g.fillRect(x + 7, y + 3, 1, 2);
    g.fillStyle = mix('#6b7280'); g.fillRect(x + 8, y - 5, 1, 9);   // stick
    const flap = (seed + Math.floor(game.time * 6)) % 2;            // it flutters
    g.fillStyle = mix('#c0242c');
    g.fillRect(x + 9, y - 5 + flap, 5, 4);
    g.fillStyle = mix('#8f1526');
    g.fillRect(x + 9, y - 2 + flap, 5, 1);
    g.fillStyle = mix(coat); g.fillRect(x + 1, y + 10, 1, 5);
  } else if (prop === 'rose') {
    g.fillRect(x + 7, y + 5, 1, 5);              // one raised
    g.fillStyle = mix(skin); g.fillRect(x + 7, y + 3, 1, 2);
    g.fillStyle = mix('#8f1526'); g.fillRect(x + 6, y, 3, 3);
    g.fillStyle = mix('#c0303f'); g.fillRect(x + 7, y + 1, 1, 1);
    g.fillStyle = mix('#2f8a3a'); g.fillRect(x + 7, y + 3, 1, 1);
    g.fillStyle = mix(coat); g.fillRect(x + 1, y + 10, 1, 5);
  } else {
    g.fillRect(x + 1, y + 10, 1, 5);
    g.fillRect(x + 7, y + 10, 1, 5);
  }

  // neck, then head: narrow, with hair over the crown and down one side
  g.fillStyle = mix(skin);
  g.fillRect(x + 4, y + 7, 2, 2);
  g.fillRect(x + 3, y + 3, 4, 5);
  g.fillStyle = mix('#00000028');                // cheek shadow
  g.fillRect(x + 6, y + 4, 1, 4);
  g.fillStyle = mix(hair);
  g.fillRect(x + 3, y + 2, 4, 2);
  // rim down the leading edge: without it neighbours merge into one mass
  g.fillStyle = 'rgba(8,10,18,.55)';
  g.fillRect(x + 1, y + 8, 1, 8);
  g.fillRect(seed % 2 ? x + 2 : x + 6, y + 3, 1, 3);
}

/* ---------------------------------------------------------- the crowd

   It is a revolution and he was walking it alone. Every flag he converts
   brings people out; they trail a few tiles back, and once there are enough
   of them they surge forward on their own and put the nearest cordon on the
   floor. Deliberately not a party of controllable units - they are pressure,
   not pawns, and they never collide with the player. */
const CROWD = { joinPerFlag: 2, max: 12, gap: 34, surgeEvery: 5.0, surgeReach: 74, minToSurge: 4 };

// What each marcher is holding, by draw index. Eight entries for the eight
// that get drawn: three flags, three roses, two empty-handed.
const CROWD_PROPS = ['flag', 'rose', null, 'rose', 'flag', null, 'flag', 'rose'];

const crowd = {
  n: 0, x: 0, t: 0, surge: 0, flash: 0,
  reset(px) { this.n = 0; this.x = px; this.t = 0; this.surge = 0; this.flash = 0; },
  join(px) {
    if (this.n === 0) this.x = px;
    this.n = Math.min(CROWD.max, this.n + CROWD.joinPerFlag);
    this.flash = 0.8;
  },
  update(dt) {
    if (this.n <= 0) return;
    this.t += dt; this.flash = Math.max(0, this.flash - dt);
    const p = game.player;
    const want = p.cx - CROWD.gap * (p.face || 1);
    this.x = lerp(this.x, want, 1 - Math.pow(0.06, dt));

    this.surge -= dt;
    if (this.surge <= 0 && this.n >= CROWD.minToSurge) {
      this.surge = CROWD.surgeEvery;
      let hit = 0;
      for (const e of game.enemies) {
        /* Gate holders are exempt as well as bosses: the street can shift a
           cordon, not a minister, and it must never be able to walk you past
           a required fight. Act 2's gate holders all carry bossGrade anyway,
           but MidBoss does not - and must not be given one, it would halve his
           thrown-rose stun and make him immune to the khachapuri one-shot - so
           the filter keys off the thing that actually matters. */
        if (e.dead || e.bossGrade || e.gate != null ||
            Math.abs(e.cx - this.x) > CROWD.surgeReach) continue;
        e.stun = Math.max(e.stun || 0, 1.4);
        hit++;
      }
      if (hit) {
        this.flash = 0.6; shake = 3; Sfx.gate();
        floatText(this.x, p.y - 22, 'THE STREET!', '#ffd85e');
        burst(this.x, p.bottom - 4, 16,
              { colors: ['#d6263c', '#ffd85e', '#fff'], speed: 100, grav: 200, life: .8, size: 2 });
      }
    }
  },
  draw() {
    if (this.n <= 0) return;
    // No fallback. Act 2's pits are 4 tiles wide so a stale row-13 default was
    // never visible; over Act 1's ravine the whole march stood on nothing.
    const gy = groundBelow(this.x, game.player.bottom - 2);
    if (gy == null) return;
    const shown = Math.min(this.n, 8);
    for (let i = 0; i < shown; i++) {
      // deterministic scatter and depth: no jitter frame to frame
      const ox = ((i * 37) % 9) - 4 - i * 9;
      const back = i % 3 === 2;                       // a row standing further off
      const step = Math.floor(this.t * 5 + i * 1.7) % 2;
      // A mixed march: some red flags, some roses, some with their hands
      // free. Keyed off the index so it is scattered but never re-rolls
      // between frames - a prop that flickered in and out would read as noise.
      drawPerson(this.x + ox, gy, i, back, step, CROWD_PROPS[i % CROWD_PROPS.length]);
    }
    if (this.flash > 0 && Math.floor(game.time * 10) % 2 === 0)
      drawTextCentered(g, `${this.n} WITH YOU`, this.x, gy - 34, '#ffd85e', 1);
  },
};

/* ---------------------------------------------------------- the bridge

   Purely decorative rubble. Kept out of game.hazards on purpose: the collapse
   is a thing he is made to watch, not a thing that hits him, and the whole
   point is that he retreats from it unharmed. */
class Plank {
  constructor(x, y) {
    this.x = x; this.y = y; this.w = TILE; this.h = 7;
    this.vy = rand(-40, 10); this.vx = rand(-14, 14);
    this.spin = rand(-3, 3); this.tilt = 0; this.dead = false;
  }
  get cx() { return this.x + this.w / 2; }
  update(dt) {
    this.vy = Math.min(this.vy + CFG.gravity * 0.8 * dt, 340);
    this.y += this.vy * dt; this.x += this.vx * dt;
    this.tilt += this.spin * dt;
    if (this.y > LEVEL_H_PX + 20) this.dead = true;
  }
  draw() {
    const x = Math.round(this.x), y = Math.round(this.y);
    const lean = Math.round(Math.sin(this.tilt) * 2);
    g.fillStyle = '#8a5a2a'; g.fillRect(x, y + lean, TILE, 4);
    g.fillStyle = '#5a3a18'; g.fillRect(x, y + lean + 3, TILE, 1);
    g.fillStyle = '#b07c42'; g.fillRect(x, y + lean, TILE, 1);
  }
}

/* Intact until he sets foot on it, then it goes from the far end back toward
   him - he has to walk out of it, and it takes long enough (0.85s over 13
   tiles = 245px/s) that sprinting across ahead of the collapse is not on.
   Afterwards the ultra powder sits on the near lip, and comes back if he ever
   ends up over there without a charge, so a bad jump can strand him a heart
   but never the run. */
const BRIDGE_FALL = 0.85;

const bridgeRun = {
  state: 'none', t: 0, cut: 0,
  reset() { this.state = LEVEL.bridge ? 'intact' : 'none'; this.t = 0; this.cut = 0; },
  drop(tx) {
    grid[LEVEL.bridge.row * LEVEL.w + tx] = T.AIR;
    game.planks.push(new Plank(tx * TILE, LEVEL.bridge.row * TILE));
    burst(tx * TILE + 8, LEVEL.bridge.row * TILE + 4, 5,
          { colors: ['#8a5a2a', '#c9a06a', '#5a3a18'], speed: 70, grav: 260, life: 0.7, size: 2 });
  },
  dropUltra(paid) {
    const b = LEVEL.bridge;
    const it = new Item(b.from - 1, 11, 'ultra');
    /* Only the first one is worth anything. The safety net re-drops on the lip
       the player is already standing on, and bridgeRun.update runs before
       resolveItems, so it is collected the frame it spawns - scoring every
       re-drop turned "jump in place" into 475 points a second on the board. */
    it.noScore = !paid;
    game.items.push(it);
  },
  update(dt) {
    const b = LEVEL.bridge;
    if (!b || this.state === 'none' || game.state !== 'play') return;
    const p = game.player;

    if (this.state === 'intact') {
      /* Set off by standing on the deck, not by crossing an x line. A line can
         be tripped in mid-air by a jump that clears the whole span, which drops
         the bridge under nobody and strands the pickup on the far side of it. */
      if (p.onGround && tileAt(Math.floor(p.cx / TILE), b.row) === T.BRIDGE) {
        this.state = 'falling'; this.t = 0; this.cut = 0;
        shake = 11; flash = 0.5; freeze = 0.08; Sfx.brick();
        floatText(p.cx, p.y - 28, 'THEY BLEW THE BRIDGE', '#ff8a5c');
      }
      return;
    }

    if (this.state === 'falling') {
      this.t += dt;
      const span = b.to - b.from;
      const want = Math.min(span, Math.ceil(this.t / BRIDGE_FALL * span));
      /* The front stops at his feet. It eats the deck right to left and never
         takes the plank he is on or anything left of it, so the way back is
         always still there and the collapse follows him out rather than racing
         him. Walk right instead, into the part that has already gone, and that
         is a fall he chose.

         Sparing only the single tile under him was not enough: the front then
         cut the tile he was about to step onto, so a 0.6s reaction - an
         ordinary human beat - still cost a heart with nothing he could have
         done. Capping the front at his column is what makes a retreat always
         work. It cannot be abused in the other direction either, because the
         far end goes first: there is never any deck left to run across. */
      const standing = p.onGround ? Math.floor(p.cx / TILE) : null;
      const onDeck = standing != null && standing >= b.from && standing < b.to;
      const capped = onDeck ? Math.min(want, b.to - 1 - standing) : want;
      while (this.cut < capped) this.drop(b.to - 1 - this.cut++);
      shake = Math.max(shake, 4);
      if (this.cut >= span) { this.state = 'down'; this.dropUltra(true); Sfx.pit(); }
      return;
    }

    // down: never leave him on the near side with no way over
    if (p.onGround && p.cx < b.from * TILE && p.ultra <= 0 && !p.ultraFlight &&
        !game.items.some(i => i.kind === 'ultra' && !i.dead))
      this.dropUltra(false);
  },
};

/* ---------------------------------------------------------- game state */

const game = {
  player: null, enemies: [], coins: [], items: [], boss: null, heli: null,
  hazards: [], planks: [], shots: [], script: null, tea: null, levelIndex: 0, advance: false, actScore: 0,
  score: 0, state: 'title', endT: 0, time: 0, best: 0,
};

/* Invincibility can wear a boss down by contact, but slowly: one point every
   INV_BOSS_CD seconds, so a full pickup is worth about three hits rather than
   a whole health bar. Stomping his own open window is still the fast way. */
const KHACHAPURI_TIME = 7;   // seconds of invincibility
const INV_BOSS_CD = 3.0;     // ...between contact hits on a boss (~2 per pickup)
const EXTRA_HEART_TIME = 22; // how long a rose-granted 4th heart lasts
const EXTRA_HEART_MAX = 2;   // ...and how many can stack above the normal 3
const POWDER_TIME = 18;      // seconds of double jump

function reset(toTitle = false, opts = {}) {
  if (opts.levelIndex != null) loadLevel(opts.levelIndex);
  else if (toTitle) loadLevel(0);          // the title screen is always act one
  const carried = opts.score != null ? opts.score : (opts.keepScore ? game.score : 0);
  buildGrid();
  particles = []; floats = []; bumps = [];
  shake = 0; freeze = 0; flash = 0;

  game.player = new Player(LEVEL.start.x * TILE, LEVEL.start.y * TILE);
  game.enemies = LEVEL.enemies.map(e => new (enemyKind(e.t))(e.x, e.gate));
  game.coins = [];
  for (const r of LEVEL.coinRuns)
    for (let i = 0; i < r.n; i++) game.coins.push(new Coin(r.x + i, r.y));
  game.items = LEVEL.items.map(i => new Item(i.x, i.y, i.t));
  game.flags = LEVEL.flags.map(tx => new LevelFlag(tx));
  game.charmers = LEVEL.charmers.map(tx => new Admirer(tx));
  game.gates = [
    ...LEVEL.enemies.filter(e => e.gate != null).map(e => ({
      x: e.gate, kind: 'mid',
      guard: game.enemies.find(g => g.gate === e.gate) || null,
    })),
    ...(LEVEL.finalGate != null ? [{ x: LEVEL.finalGate, kind: 'final', guard: null }] : []),
  ];
  game.flagsConverted = 0;
  game.boss = null; game.heli = null; game.death = null; game.bossBeaten = false;
  game.hazards = []; game.planks = []; game.script = null; game.tea = null; game.shots = [];
  crowd.reset(LEVEL.start.x * TILE);
  bridgeRun.reset();
  game.entry = null;
  game.score = carried; game.actScore = carried; game.endT = 0; game.time = 0;
  game.advance = false;
  game.state = toTitle ? 'title' : 'play';
  cam.x = 0; cam.y = clamp(LEVEL_H_PX - VIEW_H, 0, 1e9);
}

game.addCombo = function (p, x, y, base) {
  p.combo++;
  const mult = Math.min(p.combo, 8);
  const pts = base * mult;
  this.score += pts;
  if (p.combo > 1) {
    floatText(x, y - 10, `X${mult}`, '#ff5ec4', 1);
    Sfx.combo(p.combo);
  }
  floatText(x, y, `+${pts}`, '#ffd85e');
};

game.lose = function () {
  if (this.state !== 'play') return;
  this.state = 'lost'; this.endT = 0;
  shake = 7; flash = 0.7; Sfx.lose();
  burst(this.player.cx, this.player.y + 8, 30, { colors: ['#e8434f', '#fff'], speed: 160, life: 1 });
  // Death pop: hop up, then fall clean through the level. No collision, so it
  // reads as leaving the stage rather than landing somewhere.
  const p = this.player;
  this.death = Object.assign(new Entity(p.x, p.y, p.w, p.h), { face: p.face, vy: CFG.deathVel });
};

// The boss is never fought. Reaching the flag triggers his exit instead.
game.escape = function () {
  if (this.state !== 'play') return;
  this.state = 'escape'; this.endT = 0;
  if (!this.boss) this.boss = new FlyingBoss(this.player.cx + 60, 60);
  this.boss.scripted = true;
  this.heli = { x: cam.x + VIEW_W + 60, y: 28, vx: 0, vy: 0, t: 0 };
  this.player.vx = 0;
};

game.win = function () {
  this.state = 'won'; this.endT = 0;
  this.best = Math.max(this.best, this.score);
  // more acts to come? then this is an interlude, not the end of the run
  this.advance = this.levelIndex < LEVELS.length - 1;
  Sfx.win();
  if (!this.advance) Stinger.laugh();
  for (let i = 0; i < 70; i++)
    burst(this.player.cx + rand(-70, 70), this.player.y - rand(0, 90), 1,
          { colors: ['#ffd85e', '#e8434f', '#3ad47a', '#41a6f0', '#fff'], speed: 80, life: 1.8, size: 2, grav: 170 });
};

/* ---------------------------------------------------------- act card

   Loads the act first so the card sits over that act's own backdrop, then
   types its lines out. Each act supplies its own `card` - it used to be one
   global tuned to act 2, with the act number hard-coded into the footer.

   Uppercase-only 5x7 font on a 320px screen, so the prose breaks across two
   lines and the date lands alone at scale 2. "BUT EVERYTHING STARTED WITH
   ROSES...." is 234px at scale 2 on one line, which does not fit with any
   margin - see cardFits() in validateLevel. */
function cardOf() { return LEVEL.card || []; }
function cardEnd() {
  const c = cardOf();
  return c.length ? c[c.length - 1].t + 1.2 : 0;
}

function startCard(i) {
  reset(false, { levelIndex: i, keepScore: true });
  if (!LEVEL.card) { game.state = 'play'; return; }   // an act without one just starts
  game.state = 'card';
  game.card = { t: 0 };
}

function updateCard(dt) {
  game.card.t += dt;
  game.time += dt;
  if (game.card.t > cardEnd() && (Input.jumpTap() || Input.justDown('Enter'))) {
    game.card = null;
    game.state = 'play';
    Sfx.start();
  }
}

function drawCard() {
  const t = game.card.t;
  g.fillStyle = 'rgba(6,8,16,.78)';
  g.fillRect(0, 0, VIEW_W, VIEW_H);
  let y = 52;
  for (const L of cardOf()) {
    if (t < L.t) { y += L.sc === 2 ? 30 : 14; continue; }
    // typewriter: one character every 45ms
    const n = Math.min(L.s.length, Math.floor((t - L.t) / 0.045));
    drawTextCentered(g, L.s.slice(0, n), VIEW_W / 2, y, L.c, L.sc);
    y += L.sc === 2 ? 30 : 14;
  }
  if (t > 2.6)
    drawTextCentered(g, `ACT ${game.levelIndex + 1} - ${LEVEL.subtitle}`,
                     VIEW_W / 2, 124, '#7ec8f0', 1);
  if (t > cardEnd() && Math.floor(t * 2) % 2 === 0)
    drawTextCentered(g, 'PRESS SPACE', VIEW_W / 2, 150, '#8890a4', 1);
}

/* Arcade-style three-letter entry: no HTML input, so it stays inside the
   320x180 buffer and the pixel font. */
function startEntry(score) {
  game.entry = { idx: [0, 0, 0], slot: 0, score, t: 0 };
  game.state = 'entry';
}

function updateEntry(dt) {
  const e = game.entry;
  e.t += dt;
  const n = ENTRY_CHARS.length;
  if (Input.justDown('ArrowUp'))    e.idx[e.slot] = (e.idx[e.slot] + 1) % n;
  if (Input.justDown('ArrowDown'))  e.idx[e.slot] = (e.idx[e.slot] + n - 1) % n;
  if (Input.justDown('ArrowRight')) e.slot = Math.min(2, e.slot + 1);
  if (Input.justDown('ArrowLeft'))  e.slot = Math.max(0, e.slot - 1);
  // Guard: the same Space that dismissed the results screen would otherwise
  // confirm a blank name on the very next frame.
  if (e.t > 0.3 && (Input.justDown('Space') || Input.justDown('Enter'))) {
    Scores.add(e.idx.map(i => ENTRY_CHARS[i]).join(''), e.score);
    game.entry = null;
    Sfx.win();
    reset(true);
  }
}


/* ---------------------------------------------------------- the tea

   He storms the chamber, the old man leaves by air, and he sits down and
   drinks the tea that was left on the podium. Same rule as level 1's
   helicopter: the fleeing figure is never drawn hanging from anything - he
   rises under his own power and is simply gone. */

/* The Silver Fox, which is what he was always called. Drawn from rects like
   the helicopter and the teacup - at this size a downscaled photo would be
   mush, and there is no fox asset anyway. */
function foxTo(ctx, x, y, face, t) {
  x = Math.round(x); y = Math.round(y);
  const o = '#dde3ec', d = '#9aa6b8', w = '#ffffff', k = '#232a34';
  const step = Math.floor(t * 9) % 2;
  ctx.save();
  if (face < 0) { ctx.translate(x + 22, y); ctx.scale(-1, 1); ctx.translate(-x, -y); }
  ctx.fillStyle = o; ctx.fillRect(x, y + 3, 6, 5);            // tail
  ctx.fillStyle = w; ctx.fillRect(x, y + 3, 3, 3);
  ctx.fillStyle = o; ctx.fillRect(x + 5, y + 4, 11, 6);       // body
  ctx.fillStyle = d; ctx.fillRect(x + 5, y + 9, 11, 1);
  ctx.fillStyle = w; ctx.fillRect(x + 12, y + 7, 5, 3);       // chest
  ctx.fillStyle = o; ctx.fillRect(x + 14, y, 7, 6);           // head
  ctx.fillStyle = d; ctx.fillRect(x + 14, y - 2, 2, 2); ctx.fillRect(x + 19, y - 2, 2, 2);
  ctx.fillStyle = w; ctx.fillRect(x + 19, y + 3, 3, 2);       // snout
  ctx.fillStyle = k; ctx.fillRect(x + 21, y + 3, 1, 1);
  ctx.fillStyle = k; ctx.fillRect(x + 17, y + 2, 1, 1);       // eye
  ctx.fillStyle = k;                                           // legs
  ctx.fillRect(x + 6, y + 10, 2, 3 - step);
  ctx.fillRect(x + 13, y + 10, 2, 2 + step);
  ctx.restore();
}

const foxCv = document.createElement('canvas');
foxCv.width = 26; foxCv.height = 18;
const foxCx = foxCv.getContext('2d');

/* Scaled by rendering at 1x into a scratch and blitting, so every edge stays
   on a whole pixel instead of the rect coordinates smearing. */
function drawFox(x, y, face, t, sc = 1) {
  if (sc === 1) { foxTo(g, x, y, face, t); return; }
  foxCx.clearRect(0, 0, foxCv.width, foxCv.height);
  foxTo(foxCx, 0, 3, 1, t);
  const w = Math.round(26 * sc), h = Math.round(18 * sc);
  g.save();
  g.imageSmoothingEnabled = false;
  if (face < 0) { g.translate(Math.round(x) + w, Math.round(y)); g.scale(-1, 1); g.drawImage(foxCv, 0, 0, w, h); }
  else g.drawImage(foxCv, Math.round(x), Math.round(y), w, h);
  g.restore();
}


function drawCup(x, y, steamT) {
  x = Math.round(x); y = Math.round(y);
  g.fillStyle = '#e8e4dc'; g.fillRect(x, y, 9, 6);          // cup
  g.fillStyle = '#c8c2b6'; g.fillRect(x, y + 5, 9, 1);
  g.fillStyle = '#8a5a2a'; g.fillRect(x + 1, y + 1, 7, 2);  // tea
  g.fillStyle = '#e8e4dc'; g.fillRect(x + 9, y + 1, 2, 1);  // handle
  g.fillRect(x + 10, y + 2, 1, 2); g.fillRect(x + 9, y + 4, 2, 1);
  g.fillStyle = '#d8d2c6'; g.fillRect(x - 2, y + 6, 13, 2); // saucer
  for (let i = 0; i < 3; i++) {                              // steam
    const t = steamT * 1.6 + i * 0.9;
    const sy = y - 3 - ((t * 7) % 12);
    const sx = x + 3 + Math.round(Math.sin(t * 2.4) * 2);
    g.globalAlpha = 0.5;
    g.fillStyle = '#fff'; g.fillRect(sx, Math.round(sy), 1, 2);
    g.globalAlpha = 1;
  }
}

function drawTeaScene() {
  const t = game.tea;
  g.fillStyle = '#6a5a3a'; g.fillRect(Math.round(t.podX), Math.round(t.podY), 14, 10);
  g.fillStyle = '#8a7a52'; g.fillRect(Math.round(t.podX), Math.round(t.podY), 14, 2);
  if (!t.drunk) drawCup(t.podX + 2, t.podY - 8, game.time);
}

game.teaOutro = function () {
  if (this.state !== 'play') return;
  const p = this.player;
  const d = this.enemies.find(e => e instanceof Dardubala);
  if (d) d.scriptedOut = true;
  /* The phantom has no source any more, so it drops with him. It used to
     survive: the second fox went on hunting and leaping over the hero through
     the entire tea scene and the win screen behind it, which read as "I killed
     him and the thing is still after me". */
  for (const e of this.enemies) {
    if (!(e instanceof DecoyFox) || e.dead) continue;
    e.dead = true;
    burst(e.cx, e.y + 6, 20,
          { colors: ['#7ec8f0', '#dde3ec', '#fff'], speed: 110, grav: -30, life: .8, size: 2 });
  }
  this.enemies = this.enemies.filter(e => !e.dead);
  this.state = 'escape';
  this.endT = 0;
  this.script = updateTea;
  this.hazards = [];
  // podium on the step he was standing on, just ahead of the player
  const gy = groundBelow(p.cx + 30, p.bottom - 2) ?? (13 * TILE);
  this.tea = { podX: p.cx + 24, podY: gy - 10, drunk: false, boss: d || null };
  Sfx.win();
};

function updateTea(dt) {
  const t = game.tea, p = game.player, b = t.boss, T0 = game.endT;

  // the old man goes up and out under his own power - no rope, no dangling
  if (b) {
    if (T0 > 0.6) {
      b.y -= (26 + Math.min(70, (T0 - 0.6) * 55)) * dt;
      b.x += 34 * dt;
      if (Math.random() < dt * 16)
        burst(b.cx + rand(-6, 6), b.bottom, 1,
              { colors: ['#c9a0ff', '#fff'], speed: 22, grav: 40, life: .6, size: 1 });
    }
    /* Transform while he is still ON SCREEN. The camera sits at y=60 with a
       180px view, so anything above y=60 is already out of frame - at the
       literal halfway point of his exit (y~25) the whole gag happened where
       nobody could see it. */
    if (!b.foxed && b.y < 96) {
      b.foxed = true;
      burst(b.cx, b.y + 8, 22,
            { colors: ['#dde3ec', '#ffffff', '#9aa6b8'], speed: 90, grav: -20, life: .9, size: 2 });
      floatText(b.cx, b.y - 10, '*WHITE FOX*', '#dde3ec');
      Sfx.deny();
    }
    if (b.y < -60) t.boss = null;
  }

  // he walks to the podium at a real walking speed, then drinks
  const target = t.podX - p.w - 2;
  if (T0 < 3.4) {
    const dx = target - p.x;
    if (Math.abs(dx) > 1.5) { p.x += Math.sign(dx) * Math.min(Math.abs(dx), CFG.runMax * 0.62 * dt); p.face = Math.sign(dx); }
    else p.face = 1;
  }
  if (!t.drunk && T0 > 3.4) {
    t.drunk = true;
    floatText(p.cx, p.y - 16, 'AH.', '#ffd85e');
    burst(t.podX + 6, t.podY - 6, 12, { colors: ['#e8e4dc', '#8a5a2a', '#fff'], speed: 40, grav: -30, life: 1, size: 1 });
    Sfx.coin();
  }
  if (T0 > 3.6 && T0 < 3.6 + dt) floatText(p.cx, p.y - 28, 'HE GOT AWAY', '#c9a0ff');
  if (T0 > 5.6) game.win();
}

/* ---------------------------------------------------------- camera */

const cam = { x: 0, y: 0 };

function updateCamera(dt) {
  const p = game.player;
  const lead = clamp(p.vx * 0.42, -60, 60);
  const tx = clamp(p.cx + lead - VIEW_W / 2, 0, LEVEL.w * TILE - VIEW_W);
  const ty = clamp(p.y - VIEW_H * 0.55, 0, LEVEL_H_PX - VIEW_H);
  cam.x = lerp(cam.x, tx, 1 - Math.pow(0.0006, dt));
  cam.y = lerp(cam.y, ty, 1 - Math.pow(0.02, dt));
}

/* ---------------------------------------------------------- update */

function resolveEnemies(dt) {
  const p = game.player;
  const all = game.boss ? [...game.enemies, game.boss] : game.enemies;
  for (const e of all) {
    if (e.dead || !aabb(p, e)) continue;
    /* `bossGrade` marks anything that must not be deleted by a khachapuri.
       The exemption used to be `instanceof FlyingBoss`, which was the only
       boss when it was written — every level-2 boss fell through to the
       one-shot branch instead, so walking into Sleepy with 9 seconds of
       invincibility erased a 3-hit fight in a single frame. Bombs are marked
       too: vaporising them would silently remove the only way to hurt the
       Bomber. */
    const isBoss = e instanceof FlyingBoss || e.bossGrade === true;

    // Khachapuri: touching anything destroys it. Bosses are exempt — they are
    // only ever damaged by a stomp in their own vulnerable window.
    if (p.invincible > 0 && !isBoss) {
      /* Anything with its own death routine runs it rather than being
         silently flagged dead. A studio camera has to tell the Anchor its
         feed is gone; killing it this way left his health bar reading four
         with every camera already smashed. */
      if (e.smash) { e.smash(p); continue; }
      e.hp = 0; e.dead = true;
      game.addCombo(p, e.cx, e.y, 400);
      burst(e.cx, e.y + e.h / 2, 20, { colors: ['#ffd85e', '#ff5ec4', '#fff'], speed: 150, size: 3 });
      shake = 3; freeze = 0.04; Sfx.stomp();
      continue;
    }
    // Invincible: a boss can't touch you, but you can still cash in his
    // vulnerable window with a stomp. Same lenient band as the normal path,
    // or a grounded boss is effectively unhittable here.
    if (p.invincible > 0 && isBoss) {
      const open = e.vulnerable ?? e.harmless ?? false;
      const falling = open ? p.vy >= 0 : p.vy > 15;
      const band = open ? e.h * 0.9 : e.h * 0.5;
      if (falling && p.bottom - p.vy * dt <= e.y + band && open) { e.onStomp(p); continue; }
      // otherwise the contact itself wears him down, on a cooldown
      if (!(e.invCd > 0) && e.chip && !e.scriptedOut && e.hp > 0) {
        e.invCd = INV_BOSS_CD;
        flash = 0.3; shake = 4;
        floatText(e.cx, e.y - 14, 'BURNED', '#ffd85e');
        burst(e.cx, e.y + e.h / 2, 16, { colors: ['#ffd85e', '#ff5ec4', '#fff'], speed: 130, size: 2 });
        e.chip(p);
      }
      continue;
    }

    /* Generous stomp test against a harmless enemy.

       The strict test needs the feet inside the enemy's top half while still
       falling. For an enemy standing ON THE GROUND that band is only h/2 above
       the floor, and the player's own ground collision runs first and zeroes
       vy — so landing on a grounded boss usually registered as no stomp at
       all, which is why his advertised window could not actually be cashed in.
       Harmless enemies cannot punish a miss, so there is nothing to exploit by
       being lenient here. */
    const open     = e.harmless || e.stun > 0;
    const falling  = open ? p.vy >= 0 : p.vy > 15;
    const band     = open ? e.h * 0.9 : e.h * 0.5;
    const feetAbove = p.bottom - p.vy * dt <= e.y + band;
    if (falling && feetAbove) {
      e.onStomp(p);
      if (!isBoss) p.vy = CFG.stompBounce;
    } else if (!e.harmless && !(e.stun > 0)) p.hurt(e.cx);
  }
  game.enemies = game.enemies.filter(e => !e.dead);
}

function resolveItems() {
  const p = game.player;
  for (const it of game.items) {
    if (it.dead || !aabb(p, it)) continue;
    it.dead = true;
    if (it.kind === 'tea' || it.kind === 'matsoni') {
      const mats = it.kind === 'matsoni';
      // same effect as the khachapuri; each act has its own flavour of it
      p.invincible = KHACHAPURI_TIME;
      game.score += 500;
      floatText(p.cx, p.y - 14, mats ? 'MATSONI!' : 'HOT TEA!', mats ? '#dff0f6' : '#e8c07a');
      floatText(p.cx, p.y - 26, 'INVINCIBLE', '#ff5ec4');
      shake = 4; flash = 0.5; Sfx.win();
      burst(it.cx, it.y + 5, 26, { colors: mats ? ['#ffffff', '#dff0f6', '#b8cdd8']
                                              : ['#e8e4dc', '#8a5a2a', '#ffd85e'], speed: 130, size: 3 });
    } else if (it.kind === 'powder') {
      // Lasts for the rest of the life, not on a timer: it exists so you can
      // reach places, and a countdown would just mean rushing the platforming.
      p.doubleJumpT = POWDER_TIME;
      p.airJumps = 1;
      game.score += 500;
      floatText(p.cx, p.y - 14, 'DOUBLE JUMP', '#9ee8ff');
      shake = 3; flash = 0.4; Sfx.start();
      burst(it.cx, it.y + 5, 26, { colors: ['#9ee8ff', '#fff', '#c8d8f0'], speed: 120, grav: -40, size: 2, life: 1 });
    } else if (it.kind === 'ultra') {
      // One charge, no clock. See CFG.ultraJumpVel for why it is a leap and
      // not just a very tall hop.
      p.ultra = 1;
      if (!it.noScore) game.score += 500;
      floatText(p.cx, p.y - 14, 'ULTRA POWDER', '#ffd85e');
      floatText(p.cx, p.y - 26, 'ONE BIG JUMP', '#fff');
      shake = 5; flash = 0.5; Sfx.start();
      burst(it.cx, it.y + 5, 34,
            { colors: ['#ffd85e', '#fff', '#ffb03a'], speed: 150, grav: -50, size: 3, life: 1.1 });
    } else if (it.kind === 'khachapuri') {
      p.invincible = KHACHAPURI_TIME;
      game.score += 500;
      floatText(p.cx, p.y - 14, 'ACHARULI!', '#ffd85e');
      floatText(p.cx, p.y - 26, 'INVINCIBLE', '#ff5ec4');
      shake = 4; flash = 0.5; Sfx.win();
      burst(it.cx, it.cy || it.y + 5, 26, { colors: ['#ffd85e', '#f7e6a8', '#f2a233'], speed: 130, size: 3 });
    } else {
      if (p.hp < p.maxHp) {
        p.hp++;
        floatText(p.cx, p.y - 14, '+1 HEART', '#ff8f9c');
      } else if (p.extra < EXTRA_HEART_MAX) {
        // already full: the rose becomes a temporary heart on top of the three
        p.extra++;
        p.extraT = EXTRA_HEART_TIME;
        floatText(p.cx, p.y - 14, '+ROSE HEART', '#ff8fd0');
        burst(p.cx, p.y + 6, 16, { colors: ['#ff8fd0', '#d6263c', '#fff'], speed: 90, grav: -30, life: .9 });
      } else {
        game.score += 500;
        floatText(p.cx, p.y - 14, '+500', '#ffd85e');
      }
      Sfx.coin();
      burst(it.cx, it.y + 4, 14, { colors: ['#d6263c', '#f05a6a', '#3fae4a'], speed: 90, size: 2 });
    }
  }
  game.items = game.items.filter(i => !i.dead);
}

/* Shockwaves only ever hurt - they are jumped, not stomped, so they are kept
   out of game.enemies where everything must satisfy the stomp contract. */
function resolveHazards() {
  const p = game.player;
  if (p.invincible > 0 || p.invuln > 0) return;
  for (const h of game.hazards) {
    if (h.dead || !aabb(p, h)) continue;
    p.hurt(h.cx);
    h.dead = true;
    return;
  }
}

function resolveCoins() {
  const p = game.player;
  for (const c of game.coins) {
    if (c.dead || !aabb(p, c)) continue;
    c.dead = true;
    p.coins++; game.score += 100;
    burst(c.cx, c.y + 5, 6, { colors: ['#ffd85e', '#fff8dc'], speed: 65, grav: 240, life: 0.45, size: 1 });
    floatText(c.cx, c.y, '+100', '#ffd85e');
    Sfx.coin();
  }
  game.coins = game.coins.filter(c => !c.dead);
}

// Scripted exit: heli flies in, boss rides up to it, both leave.
function updateEscape(dt) {
  const t = game.endT, h = game.heli, b = game.boss;
  h.t += dt;
  if (h.t % 0.1 < dt) Sfx.heli();

  /* He boards the aircraft — he does not dangle beneath it.

     The first version reeled him up on a rope drawn from the helicopter down
     to the top of his sprite. On a human figure that silhouette reads as a
     hanging, which is not the image this is going for. He now climbs level
     with the cabin door and steps inside; there is no line between him and
     the aircraft at any point. */
  /* Landing pad. Measured from the player's feet downward at the pad's own
     column — not groundYAt, which reports the topmost surface and would land
     the aircraft at the height of a nearby platform, leaving it hovering in
     mid-air next to one. Falls back to the player's own footing over a pit. */
  const feet = game.player.bottom - 2;
  let padX = game.player.cx + 52;
  let ground = groundBelow(padX, feet);
  if (ground === null) {
    padX = game.player.cx;
    ground = groundBelow(padX, feet) ?? (LEVEL.h - 2) * TILE;
  }
  const landY = ground - 19;                       // skids on the deck

  if (t < 1.8) {                                   // helicopter comes down and lands
    h.x = lerp(h.x, padX, 1 - Math.pow(0.14, dt));
    h.y = lerp(h.y, landY, 1 - Math.pow(0.25, dt));
    b.y = lerp(b.y, ground - b.h, 1 - Math.pow(0.1, dt));   // he stands, on his feet
    if (Math.random() < dt * 20)
      burst(h.x + rand(0, 26), ground - 2, 1,
            { colors: ['#cbb89a', '#fff'], speed: 55, grav: 90, life: .5, size: 1 });

  } else if (t < 3.1) {                            // he walks over and gets in
    h.x = padX; h.y = landY;
    b.y = ground - b.h;
    b.x = lerp(b.x, h.x + 6, 1 - Math.pow(0.14, dt));
    if (!b.boarded && Math.abs(b.x - (h.x + 6)) < 3) {
      b.boarded = true;
      burst(h.x + 12, h.y + 10, 10,
            { colors: ['#c9a0ff', '#fff'], speed: 35, grav: 70, life: .5, size: 1 });
    }

  } else {                                         // lifts off and goes
    b.boarded = true;
    const lift = Math.min(1, (t - 3.1) / 1.1);
    h.y -= (24 + lift * 46) * dt;
    h.x += lift * 118 * dt;
    b.x = h.x + 6; b.y = h.y + 5;
    if (Math.random() < dt * 14)
      burst(h.x + rand(0, 26), ground - 2, 1,
            { colors: ['#cbb89a', '#fff'], speed: 45, grav: 80, life: .5, size: 1 });
  }
  b.face = -1;

  if (t > 3.2 && t < 3.2 + dt) {
    floatText(game.player.cx, game.player.y - 26, 'HE GOT AWAY', '#c9a0ff', 1);
    shake = 3;
  }
  /* His exit is the middle of the story, not the end. Play returns, the last
     gate drops, and the flag is the finish — so the win screen lands after
     "Aslan fled" has actually happened. */
  if (t > 5.4) {
    game.state = 'play';
    game.heli = null;
    game.boss = null;
    game.bossBeaten = true;
    if (LEVEL.finalGate != null) openGate(LEVEL.finalGate, 'RUN FOR THE FLAG');
  }
}

function update(dt) {
  if (game.state === 'title') {
    game.time += dt;
    updateEffects(dt);
    if (Input.jumpTap() || Input.justDown('Enter')) {
      Sfx.start();
      Music.start();          // this keypress is the gesture that unblocks audio
      // act 1 has a card of its own now; startCard falls through to play for
      // any act that does not
      if (LEVELS[0].card) startCard(0);
      else game.state = 'play';
    }
    return;
  }

  if (game.state === 'card')  { updateCard(dt); return; }
  if (game.state === 'entry') { game.time += dt; updateEntry(dt); return; }

  if (freeze > 0) { freeze -= dt; updateEffects(dt * 0.25); return; }

  if (game.state === 'escape') {
    game.endT += dt; game.time += dt;
    /* Player.update does not run here, so anything it ticks has to be ticked
       by hand. invuln matters most: drawEntities blinks the whole player off
       while it is non-zero, so entering an outro still invulnerable left the
       hero flickering — or absent — through his own ending. */
    const po = game.player;
    po.vx = 0;
    po.invuln = Math.max(0, po.invuln - dt);
    po.invincible = Math.max(0, po.invincible - dt);
    po.squashT = Math.max(0, po.squashT - dt);
    po.stretchT = Math.max(0, po.stretchT - dt);
    po.charmed = 0; po.charmImmune = 0; po.charmSlow = false;
    po.vy = Math.min(po.vy + CFG.gravity * dt, CFG.maxFall);
    moveAndCollide(po, dt);
    for (const e of game.enemies) e.update(dt);
    if (game.boss) game.boss.update(dt);
    // 'escape' is the generic scripted-outro state; the level supplies the script
    (game.script || updateEscape)(dt);
    for (const h of game.hazards) h.update(dt);
    game.hazards = game.hazards.filter(h => !h.dead);
    for (const pl of game.planks) pl.update(dt);
    game.planks = game.planks.filter(pl => !pl.dead);
    if (LEVEL.crowd) crowd.update(dt);
    updateEffects(dt);
    updateCamera(dt);
    return;
  }

  if (game.state === 'won' || game.state === 'lost') {
    game.endT += dt;
    if (game.death) {
      game.death.vy = Math.min(game.death.vy + CFG.deathGravity * dt, CFG.deathMaxFall);
      game.death.y += game.death.vy * dt;
      if (game.death.y > LEVEL_H_PX + 80) game.death = null;
    }
    updateEffects(dt);
    updateCamera(dt);
    if (Input.justDown('KeyR') || (game.endT > 1.4 && Input.jumpTap())) {
      if (game.state === 'won' && game.advance) startCard(game.levelIndex + 1);
      /* Dying restarts the act you died in, holding the score you entered it
         with. Sending a player back to act 1 for failing in act 2 makes them
         replay ten minutes they had already cleared. */
      else if (game.state === 'lost')
        reset(false, { levelIndex: game.levelIndex, score: game.actScore });
      else if (Scores.qualifies(game.score)) startEntry(game.score);
      else reset(true);            // run finished: title, board visible
    }
    return;
  }

  game.time += dt;
  game.player.update(dt);

  /* `!game.bossBeaten` matters: his exit sets game.boss to null, and the
     player is still standing well past the trigger line when it does, so
     without it he was immediately respawned at full health the frame after
     escaping. */
  if (!game.boss && !game.bossBeaten && game.player.cx > LEVEL.bossTriggerX * TILE) {
    game.boss = new FlyingBoss(game.player.cx + 200, 60);
    floatText(game.player.cx, game.player.y - 24, 'HE IS HERE', '#c9a0ff');
    shake = 4; flash = 0.45; Sfx.deny();
  }

  for (const e of game.enemies) {
    /* Stunned enemies are frozen and harmless for the duration. Handled here
       rather than in each class so a new enemy gets it for free. */
    if (e.invCd > 0) e.invCd -= dt;
    if (e.stun > 0) {
      e.stun -= dt;
      e.vx = 0;
      e.vy = Math.min((e.vy || 0) + CFG.gravity * dt, CFG.maxFall);
      moveAndCollide(e, dt, { oneWay: false });
      if (Math.random() < dt * 12)
        burst(e.cx + rand(-6, 6), e.y, 1, { colors: ['#ff8fd0', '#fff'], speed: 14, grav: -20, life: .6, size: 1 });
    } else e.update(dt);
    // Anything that leaves the world is dead. Without this a mid boss who
    // ended up in a pit stayed alive forever off-screen and his gate could
    // never be opened — an unrecoverable softlock.
    if (!e.dead && e.y > LEVEL_H_PX + 60) {
      e.dead = true;
      if (e.gate != null) openGate(e.gate);
    }
  }
  if (game.boss) game.boss.update(dt);
  for (const h of game.hazards) h.update(dt);
  game.hazards = game.hazards.filter(h => !h.dead);
  for (const pl of game.planks) pl.update(dt);
  game.planks = game.planks.filter(pl => !pl.dead);
  bridgeRun.update(dt);
  if (LEVEL.crowd) crowd.update(dt);
  for (const r of game.shots) r.update(dt);
  game.shots = game.shots.filter(r => !r.dead);
  for (const c of game.coins) c.update(dt);
  for (const it of game.items) it.update(dt);

  resolveEnemies(dt);
  resolveShots();
  resolveHazards();
  resolveCoins();
  resolveFlags(dt);
  resolveCharmers(dt);
  reconcileGates();
  resolveItems();

  for (const b of bumps) b.t += dt * 7;
  bumps = bumps.filter(b => b.t < 1);

  // The flag is only reachable once the final gate is down, which only happens
  // after Aslan is beaten — so no path to the win screen skips the fight.
  if (LEVEL.finishX != null && game.player.cx > LEVEL.finishX * TILE) game.win();

  updateEffects(dt);
  updateCamera(dt);
}

/* ---------------------------------------------------------- rendering */

const display = document.getElementById('game');
const dctx = display.getContext('2d');
const buf = document.createElement('canvas');
buf.width = VIEW_W; buf.height = VIEW_H;
const g = buf.getContext('2d');
g.imageSmoothingEnabled = false;
dctx.imageSmoothingEnabled = false;

let showHud = true, debug = false, crt = true;

const PAL = {
  sky1: '#5c94fc', sky2: '#8ab8fc', sky3: '#b8d8fc',
  dirt: '#a05a20', dirtDark: '#7a3d10', grass: '#3ac13a', grassLite: '#7ae07a',
  brick: '#c2703a', brickDark: '#7a3d10',
  qBlock: '#e8a020', qLite: '#ffd85e', qDark: '#8a5a00',
  /* Deepened off pure green. #28b028 is almost fully saturated and it shouted
     over the photographic backdrop instead of sitting on it. */
  pipe: '#2f9e34', pipeLite: '#6ed06a', pipeDark: '#14691c', pipeEdge: '#0a3d10',
  stone: '#9098a8', stoneDark: '#585e6c',
};

// 2-value ordered dither, used where a gradient would otherwise appear.
function ditherBand(y0, y1, cA, cB) {
  for (let y = y0; y < y1; y++) {
    const t = (y - y0) / Math.max(1, y1 - y0);
    g.fillStyle = cA;
    g.fillRect(0, y, VIEW_W, 1);
    if (t > 0.25) {
      g.fillStyle = cB;
      const step = t > 0.75 ? 1 : t > 0.5 ? 2 : 4;
      for (let x = (y % 2) * (step >> 1); x < VIEW_W; x += step) g.fillRect(x, y, 1, 1);
    }
  }
}

/* Backdrop zones.

   A level declares one or more zones, each owning the world from its `fromX`
   tile onward. Each is clipped to its own span projected into screen space, so
   the change happens at a fixed world column rather than snapping across the
   whole screen on some frame. Zone boundaries are placed just past a gate, so
   in practice the join is off-camera by the time the gate opens.

   `tile: true` mirror-tiles the art (a street repeats fine). The arena does
   not tile - the Parliament is a building, not wallpaper - so it is anchored
   to its own world column and drawn once. An untiled zone needs
   artW >= VIEW_W + drift, where drift is (camMax - camAtEntry) * par; a low
   par is what keeps that satisfiable, and it also reads as planted. */
/* Backdrop zones.

   A level declares one or more zones, each owning the world from its `fromX`
   tile onward. Zones do NOT butt up against each other at a hard edge - a
   vertical cut through a street elevation slices buildings in half and is
   very obvious. Instead each zone is drawn full-width and the incoming one
   dissolves in through an ordered-dither mask across a band of travel, which
   is both invisible in motion and the period-correct way to do a transition.

   `tile: true` mirror-tiles the art (a street repeats fine). The arena does
   not tile - the Parliament is a building, not wallpaper - so it is anchored
   to its own world column and drawn once. An untiled zone needs
   artW >= VIEW_W + drift, where drift is (camMax - camAtEntry) * par. */

const DISSOLVE_TILES = 12;          // how far the crossfade takes to complete
const DISSOLVE_STEPS = 8;
let dissolveMasks = null, dissolveScratch = null;

function buildDissolve() {
  const BAYER = [0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5];
  dissolveMasks = [];
  for (let step = 1; step < DISSOLVE_STEPS; step++) {
    const thresh = step * 16 / DISSOLVE_STEPS;
    const c = document.createElement('canvas');
    c.width = VIEW_W; c.height = VIEW_H;
    const cx = c.getContext('2d');
    const id = cx.createImageData(VIEW_W, VIEW_H);
    const d = id.data;
    for (let y = 0; y < VIEW_H; y++)
      for (let x = 0; x < VIEW_W; x++) {
        if (BAYER[((y & 3) << 2) | (x & 3)] < thresh) {
          const o = (y * VIEW_W + x) * 4;
          d[o] = d[o+1] = d[o+2] = 255; d[o+3] = 255;
        }
      }
    cx.putImageData(id, 0, 0);
    dissolveMasks.push(c);
  }
  dissolveScratch = document.createElement('canvas');
  dissolveScratch.width = VIEW_W; dissolveScratch.height = VIEW_H;
}

function paintZone(ctx, art, z) {
  const oy = -Math.round(cam.y * 0.55);
  if (z.tile) {
    const bw = art.w;
    const off = Math.round(cam.x * z.par);
    let i = Math.floor(off / bw);
    for (let n = 0; n <= Math.ceil(VIEW_W / bw) + 1; n++, i++) {
      const x = i * bw - off;
      if (i % 2 === 0) ctx.drawImage(art.canvas, x, oy);
      else {                                    // mirror alternates: no hard seam
        ctx.save(); ctx.translate(x + bw, oy); ctx.scale(-1, 1);
        ctx.drawImage(art.canvas, 0, 0); ctx.restore();
      }
    }
  } else {
    /* (anchor - cam.x) * par, NOT anchor - cam.x * par. The anchor is a world
       coordinate and has to be mapped into the parallax layer's own space
       before the camera is subtracted, or the art lands hundreds of pixels
       off screen and the zone renders as flat void. */
    const anchor = (z.anchorX ?? z.fromX) * TILE;
    ctx.drawImage(art.canvas, Math.round((anchor - cam.x) * z.par), oy);
  }
}

function drawBackdrop() {
  const zones = (LEVEL.backdrops || []).filter(z => ART[z.art] && !ART[z.art].isPlaceholder);
  if (zones.length) {
    g.fillStyle = LEVEL.voidColor || '#0a0c16';
    g.fillRect(0, 0, VIEW_W, VIEW_H);

    /* The CURRENT zone is simply the last one whose fromX we have passed, and
       the next dissolves in over the tiles immediately BEFORE its boundary,
       reaching 100% exactly at it. That ordering matters: the base layer has
       to be the zone that already covers the screen. Selecting the incoming
       zone as current the moment the band opened painted the anchored arena
       alone, and an anchored zone does not reach the left edge until you
       arrive at it - which showed as void down the side of the screen. */
    const midTile = (cam.x + VIEW_W / 2) / TILE;
    let k = 0;
    for (let n = 0; n < zones.length; n++) if (midTile >= zones[n].fromX) k = n;
    const next = zones[k + 1];
    let f = 0;
    if (next) f = clamp((midTile - (next.fromX - DISSOLVE_TILES)) / DISSOLVE_TILES, 0, 1);

    if (!next || f <= 0) { paintZone(g, ART[zones[k].art], zones[k]); return; }
    if (f >= 1)          { paintZone(g, ART[next.art], next); return; }

    if (!dissolveMasks) buildDissolve();
    paintZone(g, ART[zones[k].art], zones[k]);
    const sc = dissolveScratch.getContext('2d');
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.clearRect(0, 0, VIEW_W, VIEW_H);
    paintZone(sc, ART[next.art], next);
    sc.globalCompositeOperation = 'destination-in';
    sc.drawImage(dissolveMasks[clamp(Math.floor(f * DISSOLVE_STEPS), 0, DISSOLVE_STEPS - 2)], 0, 0);
    sc.globalCompositeOperation = 'source-over';
    g.drawImage(dissolveScratch, 0, 0);
    return;
  }

  // procedural fallback: flat bands + dithered joins, NES-style
  g.fillStyle = PAL.sky1; g.fillRect(0, 0, VIEW_W, VIEW_H);
  ditherBand(60, 110, PAL.sky1, PAL.sky2);
  ditherBand(110, 150, PAL.sky2, PAL.sky3);

  g.fillStyle = '#fff';
  const co = -Math.round(cam.x * 0.3) % 180;
  for (let i = -1; i < 4; i++) {
    const bx = co + i * 180, by = 22 + (i % 2) * 26;
    for (const [dx, dy, w2, h2] of [[0,4,10,5],[8,0,14,6],[20,4,10,5],[6,8,18,4]])
      g.fillRect(bx + dx, by + dy, w2, h2);
  }
  g.fillStyle = '#3a7a3a';
  const ho = -Math.round(cam.x * 0.55) % 128;
  for (let i = -1; i < 5; i++) {
    const bx = ho + i * 128;
    for (let k = 0; k < 26; k++)
      g.fillRect(bx + k * 2, 150 - Math.round(Math.sin(k / 26 * Math.PI) * 30), 2,
                 Math.round(Math.sin(k / 26 * Math.PI) * 30) + 40);
  }
}

function drawTile(t, px, py, tx, ty) {
  switch (t) {
    case T.GROUND: {
      const top = !isSolid(tileAt(tx, ty - 1));
      g.fillStyle = PAL.dirt; g.fillRect(px, py, TILE, TILE);
      g.fillStyle = PAL.dirtDark;
      g.fillRect(px, py + TILE - 3, TILE, 3);
      g.fillRect(px + ((tx * 7) % 10), py + 6, 3, 2);
      g.fillRect(px + ((tx * 5) % 9) + 4, py + 11, 2, 2);
      if (top) {
        g.fillStyle = PAL.grass;     g.fillRect(px, py, TILE, 5);
        g.fillStyle = PAL.grassLite; g.fillRect(px, py, TILE, 2);
        g.fillStyle = PAL.grass;
        for (let k = 0; k < TILE; k += 4) g.fillRect(px + k, py + 5, 2, 1);
      }
      break;
    }
    case T.BRICK: {
      g.fillStyle = PAL.brick; g.fillRect(px, py, TILE, TILE);
      g.fillStyle = PAL.brickDark;
      g.fillRect(px, py, TILE, 1); g.fillRect(px, py + 7, TILE, 1);
      g.fillRect(px + 7, py + 1, 1, 6); g.fillRect(px + 3, py + 8, 1, 8);
      g.fillRect(px + 11, py + 8, 1, 8);
      g.fillStyle = 'rgba(255,255,255,.16)';
      g.fillRect(px, py + 1, TILE, 1); g.fillRect(px, py + 8, TILE, 1);
      /* A dark rim on the outside of a run. Without it the masonry dissolved
         into the photographic backdrop and the platform stopped reading as an
         object you could stand on. Only on the outer faces, so a run of bricks
         still looks like one wall. */
      g.fillStyle = 'rgba(38,18,4,.55)';
      if (tileAt(tx - 1, ty) !== T.BRICK) g.fillRect(px, py, 1, TILE);
      if (tileAt(tx + 1, ty) !== T.BRICK) g.fillRect(px + TILE - 1, py, 1, TILE);
      if (!isSolid(tileAt(tx, ty + 1))) g.fillRect(px, py + TILE - 1, TILE, 1);
      break;
    }
    case T.QUESTION: {
      /* The pulse is a glint travelling across the face, not a full recolour.
         Swapping the whole block to qLite washed it out to a pale cream square
         once a second and the glyph went with it - caught mid-blink it read as
         a blank tile with a smudge on it. */
      const blink = Math.floor(game.time * 6 + tx) % 6 === 0;
      g.fillStyle = PAL.qBlock; g.fillRect(px, py, TILE, TILE);
      g.fillStyle = PAL.qLite;  g.fillRect(px + 1, py + 1, TILE - 2, 2);   // bevel
      if (blink) { g.fillStyle = PAL.qLite; g.fillRect(px + 1, py + 3, TILE - 2, 3); }
      g.fillStyle = PAL.qDark;
      g.fillRect(px, py, TILE, 1); g.fillRect(px, py + TILE - 1, TILE, 1);
      g.fillRect(px, py, 1, TILE); g.fillRect(px + TILE - 1, py, 1, TILE);
      g.fillRect(px + 1, py + 1, 1, 1); g.fillRect(px + TILE - 2, py + 1, 1, 1);
      g.fillRect(px + 1, py + TILE - 2, 1, 1); g.fillRect(px + TILE - 2, py + TILE - 2, 1, 1);
      // embossed: a light offset under the glyph so it reads at 5x7
      drawText(g, '?', px + 6, py + 6, PAL.qLite, 1, null);
      drawText(g, '?', px + 6, py + 5, PAL.qDark, 1, null);
      break;
    }
    case T.USED: {
      g.fillStyle = '#8a6a42'; g.fillRect(px, py, TILE, TILE);
      g.fillStyle = '#5a4020';
      g.fillRect(px, py, TILE, 1); g.fillRect(px, py + TILE - 1, TILE, 1);
      g.fillRect(px, py, 1, TILE); g.fillRect(px + TILE - 1, py, 1, TILE);
      break;
    }
    case T.PLATFORM: {
      g.fillStyle = '#d08a48'; g.fillRect(px, py, TILE, 6);
      g.fillStyle = '#f0c088'; g.fillRect(px, py, TILE, 2);
      g.fillStyle = '#7a3d10'; g.fillRect(px, py + 5, TILE, 1);
      for (let k = 0; k < TILE; k += 5) { g.fillStyle = '#a05a20'; g.fillRect(px + k, py + 2, 1, 3); }
      break;
    }
    case T.BRIDGE: {
      // deck plus the trestle under it; the ravine below is empty, so the
      // supports have the whole tile to themselves
      g.fillStyle = '#8a5a2a'; g.fillRect(px, py, TILE, 6);
      g.fillStyle = '#b07c42'; g.fillRect(px, py, TILE, 2);
      g.fillStyle = '#5a3a18'; g.fillRect(px, py + 5, TILE, 1);
      for (let k = 0; k < TILE; k += 4) { g.fillStyle = '#6b4520'; g.fillRect(px + k, py + 2, 1, 3); }
      g.fillStyle = '#4a2f14';
      g.fillRect(px + 2, py + 6, 2, 10); g.fillRect(px + 12, py + 6, 2, 10);
      g.fillRect(px, py + 9, TILE, 1);
      break;
    }
    case T.GATE: {
      g.fillStyle = '#4a5262'; g.fillRect(px + 2, py, 12, TILE);
      g.fillStyle = '#6d7688';
      g.fillRect(px + 3, py, 2, TILE); g.fillRect(px + 8, py, 2, TILE);
      g.fillStyle = '#2b3140';
      g.fillRect(px + 6, py, 1, TILE); g.fillRect(px + 11, py, 1, TILE);
      if (ty % 3 === 0) { g.fillStyle = '#8c95a8'; g.fillRect(px + 2, py + 2, 12, 2); }
      break;
    }
    case T.PIPE: {
      /* Shaded across the WHOLE pipe, not per tile. Every tile used to draw its
         own highlight at +2 and its own shadow at +13, so a two-tile pipe came
         out as light|dark|light|dark - it read as two thin pipes shoved
         together rather than one round one. Which half we are is read off the
         neighbours. */
      const top = !isSolid(tileAt(tx, ty - 1));
      const L = tileAt(tx - 1, ty) !== T.PIPE;      // left edge of this pipe
      const R = tileAt(tx + 1, ty) !== T.PIPE;      // right edge

      g.fillStyle = PAL.pipe; g.fillRect(px, py, TILE, TILE);
      if (L) {
        g.fillStyle = PAL.pipeLite; g.fillRect(px + 2, py, 4, TILE);
        g.fillStyle = PAL.pipeEdge; g.fillRect(px, py, 1, TILE);
      }
      if (R) {
        g.fillStyle = PAL.pipeDark; g.fillRect(px + TILE - 4, py, 3, TILE);
        g.fillStyle = PAL.pipeEdge; g.fillRect(px + TILE - 1, py, 1, TILE);
      }

      if (top) {
        // the lip only overhangs on the pipe's actual outer edges
        const x0 = px - (L ? 2 : 0);
        const w  = TILE + (L ? 2 : 0) + (R ? 2 : 0);
        g.fillStyle = PAL.pipe; g.fillRect(x0, py, w, 6);
        if (L) g.fillStyle = PAL.pipeLite, g.fillRect(x0 + 1, py + 1, 4, 4);
        if (R) g.fillStyle = PAL.pipeDark, g.fillRect(x0 + w - 4, py + 1, 3, 4);
        g.fillStyle = PAL.pipeEdge;
        g.fillRect(x0, py, w, 1);                   // top edge
        g.fillRect(x0, py + 5, w, 1);               // underside of the lip
        if (L) g.fillRect(x0, py, 1, 6);
        if (R) g.fillRect(x0 + w - 1, py, 1, 6);
      }
      break;
    }
  }
}

function drawTiles() {
  const x0 = Math.max(0, Math.floor(cam.x / TILE) - 1);
  const x1 = Math.min(LEVEL.w - 1, Math.ceil((cam.x + VIEW_W) / TILE) + 1);
  const y0 = Math.max(0, Math.floor(cam.y / TILE) - 1);
  const y1 = Math.min(LEVEL.h - 1, Math.ceil((cam.y + VIEW_H) / TILE) + 1);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) {
      const t = tileAt(tx, ty);
      if (t === T.AIR) continue;
      const b = bumps.find(v => v.tx === tx && v.ty === ty);
      const dy = b ? -Math.round(Math.sin(b.t * Math.PI) * 5) : 0;
      drawTile(t, tx * TILE, ty * TILE + dy, tx, ty);
    }
}

/* No rotation anywhere: 8-bit hardware couldn't rotate sprites, and at this
   resolution a rotated blit just looks like mud. Motion is bob + squash. */
/* Scratch canvas for tinting. A tint has to be composited against the SPRITE
   alone, never against the frame: 'source-atop' paints every opaque pixel it
   covers, and the backdrop is opaque, so filling the sprite's rect directly on
   the buffer tinted the scenery behind it too. That shipped in level 1 — the
   boss's vulnerable pulse and the mid-boss hit flash were drawing coloured
   rectangles over the street, not flashing the character. */
const tintCv = document.createElement('canvas');
const tintCx = tintCv.getContext('2d');

function drawSprite(art, e, { bob = 0, squash = 1, tint = null } = {}) {
  // squash > 1 is taller and correspondingly narrower — volume preserving,
  // so the character doesn't appear to gain mass mid-animation.
  const dw = Math.max(1, Math.round(art.w / squash));
  const dh = Math.max(1, Math.round(art.h * squash));
  const x = Math.round(e.cx - dw / 2);
  const y = Math.round(e.bottom + bob - dh);

  let src = art.canvas, sw = dw, sh = dh;
  if (tint) {
    if (tintCv.width < dw || tintCv.height < dh) {
      tintCv.width = Math.max(dw, tintCv.width, 64);
      tintCv.height = Math.max(dh, tintCv.height, 64);
    }
    tintCx.imageSmoothingEnabled = false;
    tintCx.clearRect(0, 0, tintCv.width, tintCv.height);
    tintCx.drawImage(art.canvas, 0, 0, dw, dh);
    tintCx.save();
    tintCx.globalCompositeOperation = 'source-atop';
    tintCx.fillStyle = tint;
    tintCx.fillRect(0, 0, dw, dh);
    tintCx.restore();
    src = tintCv;
  }

  g.save();
  if (e.face < 0) { g.translate(x + dw, y); g.scale(-1, 1); g.drawImage(src, 0, 0, sw, sh, 0, 0, dw, dh); }
  else g.drawImage(src, 0, 0, sw, sh, x, y, dw, dh);
  g.restore();
}

function shadowUnder(e) {
  // groundBelow, not groundYAt: the latter returns a row-13 fallback for an
  // empty column, which drew a shadow in mid-air the whole way over the ravine.
  const gy = groundBelow(e.cx, e.bottom);
  if (gy == null) return;
  const d = gy - e.bottom;
  if (d < 0 || d > 130) return;
  const w = Math.max(3, Math.round(e.w * (1 - d / 200)));
  g.fillStyle = 'rgba(0,0,0,.25)';
  g.fillRect(Math.round(e.cx - w / 2), gy - 2, w, 2);
}

function drawCoin(c) {
  const f = Math.floor(c.t) % 4;
  const w = [6, 3, 1, 3][f];
  const x = Math.round(c.cx - w / 2), y = Math.round(c.y);
  g.fillStyle = '#ffd85e'; g.fillRect(x, y, w, 10);
  g.fillStyle = '#e8a020'; g.fillRect(x, y, w, 1); g.fillRect(x, y + 9, w, 1);
  if (w > 2) { g.fillStyle = '#fff8dc'; g.fillRect(x + 1, y + 2, 1, 4); }
}

/* Acharuli khachapuri: boat-shaped bread, cheese pool, egg yolk, butter.
   14x10, drawn from rects — at this resolution hand-placed pixels beat any
   downscaled photo. */
/* A clay bowl of matsoni: act 2's invincibility. Deliberately not the tea cup
   - each act's pickup should be recognisable from its silhouette alone. */
function drawMatsoni(x, y) {
  x = Math.round(x); y = Math.round(y);
  g.fillStyle = '#ffffff'; g.fillRect(x + 2, y + 1, 9, 4);        // the surface
  g.fillStyle = '#dff0f6'; g.fillRect(x + 3, y + 2, 7, 2);
  g.fillStyle = '#9a6a44'; g.fillRect(x + 1, y + 4, 11, 5);       // bowl
  g.fillStyle = '#7d5433'; g.fillRect(x + 1, y + 8, 11, 2);
  g.fillStyle = '#b98457'; g.fillRect(x + 2, y + 5, 2, 3);        // highlight
  g.fillStyle = '#5f3f26'; g.fillRect(x, y + 4, 1, 4); g.fillRect(x + 12, y + 4, 1, 4);
}

function drawKhachapuri(x, y) {
  x = Math.round(x); y = Math.round(y);
  const crust = '#8a5418', bread = '#d19340', cheese = '#f7e6a8',
        yolk = '#f2a233', butter = '#ffe066';
  g.fillStyle = crust;
  g.fillRect(x + 2, y + 1, 10, 1);
  g.fillRect(x + 1, y + 2, 1, 6);  g.fillRect(x + 12, y + 2, 1, 6);
  g.fillRect(x + 2, y + 8, 10, 1);
  g.fillRect(x, y + 4, 1, 2);      g.fillRect(x + 13, y + 4, 1, 2);   // pointed ends
  g.fillStyle = bread;  g.fillRect(x + 2, y + 2, 10, 6);
  g.fillStyle = cheese; g.fillRect(x + 3, y + 3, 8, 4);
  g.fillStyle = yolk;   g.fillRect(x + 6, y + 4, 3, 2);
  g.fillStyle = '#c47a15'; g.fillRect(x + 6, y + 4, 1, 1);
  g.fillStyle = butter; g.fillRect(x + 4, y + 4, 1, 1);
  g.fillStyle = '#fff2c0'; g.fillRect(x + 3, y + 3, 2, 1);
}

// 9x12 rose: bloom, stem, two leaves.
function drawRose(x, y) {
  x = Math.round(x); y = Math.round(y);
  const dark = '#8f1526', red = '#d6263c', lite = '#f05a6a',
        stem = '#2f8a3a', leaf = '#3fae4a';
  g.fillStyle = dark; g.fillRect(x + 2, y, 5, 5);
  g.fillStyle = red;  g.fillRect(x + 3, y + 1, 3, 3);
  g.fillStyle = lite; g.fillRect(x + 3, y + 1, 1, 1);
  g.fillStyle = dark; g.fillRect(x + 3, y + 5, 3, 1);
  g.fillStyle = stem; g.fillRect(x + 4, y + 6, 1, 6);
  g.fillStyle = leaf; g.fillRect(x + 1, y + 8, 3, 1); g.fillRect(x + 5, y + 9, 3, 1);
}

// 12x9 dog, two-frame leg cycle. Procedural because the only dog art I have
// is fused into the mid-boss sprite.
function drawDog(x, y, face, t) {
  x = Math.round(x); y = Math.round(y);
  const body = '#a9702f', dark = '#6f4415', light = '#d8a05c';
  const step = Math.floor(t * 9) % 2;
  g.save();
  if (face < 0) { g.translate(x + 12, y); g.scale(-1, 1); g.translate(-x, -y); }
  g.fillStyle = body;  g.fillRect(x + 1, y + 2, 9, 4);        // torso
  g.fillStyle = light; g.fillRect(x + 1, y + 2, 9, 1);
  g.fillStyle = body;  g.fillRect(x + 8, y, 4, 4);            // head
  g.fillStyle = dark;  g.fillRect(x + 8, y, 2, 1);            // ear
  g.fillStyle = '#111'; g.fillRect(x + 10, y + 1, 1, 1);      // eye
  g.fillStyle = dark;  g.fillRect(x + 11, y + 3, 1, 1);       // snout
  g.fillStyle = '#c0392b'; g.fillRect(x + 7, y + 2, 1, 2);    // collar
  g.fillStyle = dark;                                          // legs
  g.fillRect(x + 2, y + 6, 2, 3 - step);
  g.fillRect(x + 7, y + 6, 2, 2 + step);
  g.fillStyle = body;  g.fillRect(x, y + (step ? 0 : 1), 2, 2); // tail
  g.restore();
}

// 5x7 rose for the hero's hand.
function drawMiniRose(x, y) {
  x = Math.round(x); y = Math.round(y);
  g.fillStyle = '#8f1526'; g.fillRect(x, y, 4, 3);
  g.fillStyle = '#d6263c'; g.fillRect(x + 1, y + 1, 2, 2);
  g.fillStyle = '#f05a6a'; g.fillRect(x + 1, y + 1, 1, 1);
  g.fillStyle = '#2f8a3a'; g.fillRect(x + 1, y + 3, 1, 4);
  g.fillStyle = '#3fae4a'; g.fillRect(x + 2, y + 5, 2, 1);
}

/* Five-cross flag, adopted 2004: white field, large red St George's cross, and
   a small Bolnisi cross in each quadrant. 15x10 is the smallest that fits all
   five crosses legibly. */
function drawFlagNew(x, y, wave) {
  x = Math.round(x); y = Math.round(y);
  const red = '#d6263c';
  g.fillStyle = '#f4f4f4'; g.fillRect(x, y, 15, 10);
  g.fillStyle = red;
  g.fillRect(x + 6, y, 3, 10);          // vertical bar
  g.fillRect(x, y + 4, 15, 2);          // horizontal bar
  for (const [qx, qy] of [[2, 1], [12, 1], [2, 8], [12, 8]]) {
    g.fillRect(x + qx, y + qy - 1, 1, 3);
    g.fillRect(x + qx - 1, y + qy, 3, 1);
  }
  g.fillStyle = 'rgba(0,0,0,.18)';      // fold shading, sold by the wave offset
  g.fillRect(x + 11 + wave, y, 4, 10);
}

/* The flag it replaced: dark crimson field with a black-over-white canton in
   the upper hoist. Used 1918-1921 and again 1990-2004. */
function drawFlagOld(x, y, wave) {
  x = Math.round(x); y = Math.round(y);
  g.fillStyle = '#7b1b2d'; g.fillRect(x, y, 15, 10);      // crimson field
  g.fillStyle = '#141414'; g.fillRect(x, y, 6, 3);        // canton, black band
  g.fillStyle = '#ececec'; g.fillRect(x, y + 3, 6, 2);    // canton, white band
  g.fillStyle = 'rgba(0,0,0,.22)';
  g.fillRect(x + 11 + wave, y, 4, 10);
}

/* Adjara's own flag, flown until 2004: navy field, seven yellow seven-pointed
   stars in the upper hoist, three over four. Hand-drawn rather than sampled
   from assets/flag-achara.png because the stars are 0.6% of that image's
   pixels - area-averaged down to 15x10 they vanish and it comes out a plain
   navy rectangle. Star centres and the 3-over-4 lattice are taken from the
   real thing; only the spacing is opened up from 1px to 2px, because at 1px
   the two rows merge into a pair of solid bars. */
function drawFlagAchara(x, y, wave) {
  x = Math.round(x); y = Math.round(y);
  g.fillStyle = '#18185a'; g.fillRect(x, y, 15, 10);
  g.fillStyle = '#fef652';
  for (const sx of [3, 5, 7])       g.fillRect(x + sx, y + 2, 1, 1);   // three over...
  for (const sx of [2, 4, 6, 8])    g.fillRect(x + sx, y + 4, 1, 1);   // ...four
  g.fillStyle = 'rgba(0,0,0,.22)';
  g.fillRect(x + 11 + wave, y, 4, 10);
}

/* Planted along the route flying the old flag. Touch one and it changes over
   to the five-cross — the 2004 swap, done one pole at a time. */
class LevelFlag extends Entity {
  constructor(tx) {
    const base = groundYAt(tx);
    /* Act 2 puts televisions along the route instead of flagpoles. Same
       contract - one per column, touch it once, worth 300 - so it reuses this
       whole path rather than growing a parallel array through reset, update,
       draw and validate. Only the box and the artwork differ. */
    const tv = (LEVEL.smashKind === 'tv');
    super(tx * TILE, base - (tv ? 21 : 46), tv ? 20 : 18, tv ? 21 : 46);
    this.tx = tx; this.base = base; this.converted = false; this.pop = 0;
    this.tv = tv;
  }
  convert() {
    this.converted = true;
    this.pop = 0.5;
    game.score += 300;
    game.flagsConverted++;
    if (LEVEL.crowd) crowd.join(this.x);
    floatText(this.x + 9, this.y - 6, '+300', '#ffd85e');
    if (this.tv) {
      floatText(this.x + 9, this.y - 18, 'OFF AIR', '#7ec8f0');
      burst(this.x + 10, this.y + 10, 26,
            { colors: ['#9fd8ff', '#f4f4f4', '#3a4658', '#1c2436'], speed: 140, life: 0.9, size: 2 });
      shake = 5; Sfx.brick();
    } else {
      burst(this.x + 9, this.y + 6, 18,
            { colors: ['#d6263c', '#f4f4f4', '#ffd85e'], speed: 95, life: 0.8, size: 2 });
      shake = 3; Sfx.gate();
    }
  }
}

/* A studio monitor on a stand. Live it shows a shifting test pattern; smashed
   it is a cracked dead screen with the glass gone. */
function drawTv(x, base, smashed, t, lift) {
  const y = base - 21 + lift;
  g.fillStyle = '#171c28'; g.fillRect(x + 7, y + 17, 6, 4);          // stand
  g.fillStyle = '#0f131c'; g.fillRect(x + 4, y + 20, 12, 1);
  g.fillStyle = '#3a4658'; g.fillRect(x, y, 20, 18);                 // casing
  g.fillStyle = '#242c3a'; g.fillRect(x, y, 20, 1); g.fillRect(x, y + 17, 20, 1);
  g.fillStyle = '#11151e'; g.fillRect(x + 2, y + 2, 16, 13);         // bezel
  if (!smashed) {
    const bar = Math.floor(t * 6) % 4;
    const cols = ['#e8434f', '#ffd85e', '#3ad47a', '#41a6f0'];
    for (let i = 0; i < 4; i++) {
      g.fillStyle = cols[(i + bar) % 4];
      g.fillRect(x + 3 + i * 4, y + 3, 4, 11);
    }
    g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(x + 3, y + 3, 14, 2);
    if (Math.floor(t * 3) % 2 === 0) { g.fillStyle = '#e8434f'; g.fillRect(x + 15, y + 16, 2, 1); }
  } else {
    g.fillStyle = '#0a0d14'; g.fillRect(x + 3, y + 3, 14, 11);
    g.fillStyle = '#2a3444';                                          // the crack
    g.fillRect(x + 6, y + 4, 1, 4); g.fillRect(x + 7, y + 8, 1, 3);
    g.fillRect(x + 8, y + 6, 4, 1); g.fillRect(x + 11, y + 9, 1, 4);
    g.fillStyle = '#161c26'; g.fillRect(x + 4, y + 12, 3, 2);
  }
}

function drawLevelFlags() {
  for (const f of game.flags) {
    const px = f.tx * TILE;
    const wave = Math.round(Math.sin(game.time * 2.5 + f.tx) * 1);
    // Brief upward kick as it changes over.
    const lift = f.pop > 0 ? -Math.round(Math.sin((0.5 - f.pop) / 0.5 * Math.PI) * 4) : 0;
    if (f.tv) { drawTv(px, f.base, f.converted, game.time + f.tx, lift); continue; }
    g.fillStyle = '#9aa0ad'; g.fillRect(px, f.base - 46, 2, 46);    // pole
    g.fillStyle = '#ffd85e'; g.fillRect(px - 1, f.base - 49, 4, 3); // finial
    const fy = f.base - 45 + wave + lift;
    if (f.converted) drawFlagNew(px + 2, fy, wave);
    else if (LEVEL.oldFlag === 'achara') drawFlagAchara(px + 2, fy, wave);
    else             drawFlagOld(px + 2, fy, wave);
  }
}

function resolveFlags(dt) {
  const p = game.player;
  for (const f of game.flags) {
    f.pop = Math.max(0, f.pop - dt);
    if (!f.converted && aabb(p, f)) f.convert();
  }
}

// Chunky pixel helicopter, drawn as rects — no asset needed and it matches
// the tile art better than a scaled photo would.
function drawHeli(x, y, t) {
  x = Math.round(x); y = Math.round(y);
  const body = '#23262e', dark = '#12141a', glass = '#7ec8f0', accent = '#c0242c';
  g.fillStyle = body;  g.fillRect(x, y + 4, 26, 11);
  g.fillStyle = dark;  g.fillRect(x, y + 12, 26, 3);
  g.fillStyle = glass; g.fillRect(x + 18, y + 6, 7, 5);
  g.fillStyle = accent;g.fillRect(x + 4, y + 8, 9, 2);
  g.fillStyle = body;  g.fillRect(x + 25, y + 6, 15, 4);        // tail boom
  g.fillStyle = dark;  g.fillRect(x + 37, y + 1, 3, 7);         // fin
  g.fillStyle = body;  g.fillRect(x + 11, y + 1, 3, 4);         // mast
  g.fillStyle = dark;                                            // skids
  g.fillRect(x + 2, y + 17, 22, 2);
  g.fillRect(x + 6, y + 15, 2, 2); g.fillRect(x + 19, y + 15, 2, 2);

  const spin = Math.abs(Math.sin(t * 26));                       // main rotor
  const half = Math.round(6 + spin * 22);
  g.fillStyle = spin > 0.45 ? '#4a4f5c' : dark;
  g.fillRect(x + 12 - half, y, half * 2, 1);
  const tspin = Math.round(2 + Math.abs(Math.cos(t * 30)) * 5);  // tail rotor
  g.fillStyle = dark;
  g.fillRect(x + 40, y + 4 - tspin / 2, 1, tspin);
}

const INV_TINTS = ['rgba(255,214,60,.42)', 'rgba(255,94,196,.42)',
                   'rgba(126,200,240,.42)', 'rgba(122,224,122,.42)'];

function drawEntities() {
  for (const c of game.coins) drawCoin(c);
  for (const it of game.items) {
    if (it.kind === 'khachapuri') drawKhachapuri(it.x, it.y);
    else if (it.kind === 'tea') drawCup(it.x + 2, it.y, game.time);
    else if (it.kind === 'matsoni') drawMatsoni(it.x, it.y);
    else if (it.kind === 'powder') drawSprite(ART.powder, it);
    else if (it.kind === 'ultra')
      drawSprite(ART.powder, it, { tint: `rgba(255,196,60,${0.42 + Math.sin(game.time * 6) * 0.16})` });
    else drawRose(it.x, it.y);

    // Named on two lines: "ACHARULI KHACHAPURI" on one line is 114px wide and
    // the whole screen is only 320.
    const label = ITEM_LABEL[it.kind];
    if (label) {
      drawTextCentered(g, label[0], it.cx, it.y - 17, label[2], 1);
      drawTextCentered(g, label[1], it.cx, it.y - 9,  label[2], 1);
    }
  }

  /* No walk bob.

     Every character here is a single static frame, so the only "animation"
     available was shifting the whole body 1px up and down. At 4x upscale that
     is a 4-pixel jump of the entire sprite several times a second — it reads
     as the character vibrating, not walking, which is exactly what it looked
     like. Real walk cycles move the legs, not the body. Motion now comes from
     travelling across the screen. A second frame per character would let a
     proper two-frame cycle go back in. */
  for (const e of game.enemies) {
    shadowUnder(e);
    if (e instanceof Dog) {
      drawDog(e.x, e.y, e.face, e.t);
    } else if (e instanceof Bomb) {
      if (e.fuse < 0.5) {                       // show the radius before it goes
        const r = BOMBER.blast, k = Math.floor(e.t * 16) % 2;
        g.fillStyle = k ? 'rgba(255,138,92,.16)' : 'rgba(255,216,94,.10)';
        g.fillRect(Math.round(e.cx - r), Math.round(e.y + 4 - r), r * 2, r * 2);
      }
      const flashing = e.fuse < 0.6 && Math.floor(e.t * 16) % 2 === 0;
      const x = Math.round(e.x), y = Math.round(e.y);
      g.fillStyle = flashing ? '#ff5a4a' : '#1c1c22'; g.fillRect(x, y + 1, 8, 7);
      g.fillStyle = '#3a3a46'; g.fillRect(x + 1, y + 2, 2, 2);
      g.fillStyle = '#8a6a3a'; g.fillRect(x + 5, y - 2, 1, 3);
      g.fillStyle = Math.floor(e.t * 20) % 2 ? '#ffd85e' : '#ff8a5c'; g.fillRect(x + 5, y - 3, 1, 1);
    } else if (e instanceof Guard) {
      drawSprite(ART.l3guard, e, { tint: e.surge > 0 && Math.floor(game.time * 12) % 2 === 0 ? 'rgba(255,90,90,.45)' : null });
    } else if (e instanceof Sleepy) {
      const flashing = e.hitFlash > 0 && Math.floor(e.hitFlash * 24) % 2 === 0;
      drawSprite(ART.l3sleepy, e, {
        tint: flashing ? 'rgba(255,255,255,.85)'
            : e.harmless ? 'rgba(90,120,200,.35)' : null,
      });
      if (e.harmless && Math.floor(game.time * 2) % 2 === 0)
        drawTextCentered(g, 'ZZZ', e.cx, e.y - 11, '#9ee8ff', 1);
      else if (!e.harmless)
        drawTextCentered(g, '!', e.cx, e.y - 11, '#ff8f9c', 2);
      // noise meter: the thing the player is actually managing
      if (e.noise > 0.05 && e.harmless) {
        const w = 20, bx = Math.round(e.cx - w / 2), by = Math.round(e.y - 4);
        g.fillStyle = '#2a2f3a'; g.fillRect(bx, by, w, 2);
        g.fillStyle = e.noise > 0.7 ? '#ff5a4a' : '#ffd85e';
        g.fillRect(bx, by, Math.round(w * clamp(e.noise, 0, 1)), 2);
      }
    } else if (e instanceof Svani) {
      const flashing = e.hitFlash > 0 && Math.floor(e.hitFlash * 24) % 2 === 0;
      const rage = e.stage === 3 ? 'rgba(255,45,85,.35)' : e.stage === 2 ? 'rgba(255,138,92,.25)' : null;
      drawSprite(ART.l3svani, e, { tint: flashing ? 'rgba(255,255,255,.85)' : rage });
      if (e.phase === 'windup' && Math.floor(game.time * 14) % 2 === 0)
        drawTextCentered(g, '!', e.cx, e.y - 11, '#ff8a5c', 2);
      if (e.harmless && Math.floor(game.time * 8) % 2 === 0)
        drawTextCentered(g, 'HIT HIM', e.cx, e.y - 10, '#7ae07a', 1);
    } else if (e instanceof Journalist) {
      const aiming = e.phase === 'aim';
      const flash = aiming && Math.floor(game.time * 14) % 2 === 0;
      drawSprite(ART[e.art], e, {
        tint: flash ? 'rgba(255,255,255,.65)'
            : e.phase === 'dash' ? 'rgba(255,138,92,.40)' : null,
      });
      /* The three read apart at a glance: the lane the shot will take is drawn
         at the height it will come at, and the charger gets an arrow instead
         because there is no lane - she is the projectile. */
      if (aiming && Math.floor(game.time * 14) % 2 === 0) {
        const d = e.aimDir || 1;
        if (e.style === 'charge') {
          g.fillStyle = 'rgba(255,138,92,.75)';
          for (let k = 1; k < 6; k++)
            g.fillRect(Math.round(e.cx + d * (8 + k * 7)), Math.round(e.y + e.h * 0.5), 3, 2);
        } else {
          const ride = e.style === 'low' ? BULLET.lowRide : BULLET.ride;
          const fy = Math.round(e.bottom - ride) + 2;
          g.fillStyle = e.style === 'low' ? 'rgba(126,200,240,.60)' : 'rgba(244,244,244,.55)';
          for (let k = 1; k < 11; k++) g.fillRect(Math.round(e.cx + d * (7 + k * 9)), fy, 4, 1);
        }
      }
      if (aiming && Math.floor(game.time * 8) % 2 === 0) {
        const say = e.style === 'low' ? 'JUMP' : e.style === 'charge' ? 'MOVE' : 'DUCK';
        drawTextCentered(g, say, e.cx, e.y - 10, '#ff8a5c', 1);
      }
    } else if (e instanceof StudioCamera) {
      e.draw();
    } else if (e instanceof Anchor) {
      const flash = e.hitFlash > 0 && Math.floor(e.hitFlash * 24) % 2 === 0;
      const open = e.phase === 'offair' && Math.floor(game.time * 10) % 2 === 0;
      drawSprite(ART.l2anchor, e, {
        tint: flash ? 'rgba(255,255,255,.9)' : open ? 'rgba(255,216,94,.45)' : null,
      });
      if (e.phase === 'offair' && Math.floor(game.time * 8) % 2 === 0)
        drawTextCentered(g, 'OFF AIR - STOMP HIM', e.cx, e.y - 12, '#7ae07a', 1);
      else if (e.onAir && Math.floor(game.time * 3) % 2 === 0)
        drawTextCentered(g, 'ON AIR', e.cx, e.y - 12, '#e8434f', 1);
      /* Same lane tell as Edika: the height is the point, so it is drawn along
         the floor he is on rather than as a symbol over his head. */
      if (e.phase === 'aim' || e.phase === 'volley') {
        const fy = e.bottom - BULLET.ride;
        const d = e.aimDir || 1;
        if (Math.floor(game.time * 14) % 2 === 0) {
          g.fillStyle = 'rgba(244,244,244,.55)';
          for (let k = 1; k < 14; k++)
            g.fillRect(Math.round(e.cx + d * (9 + k * 9)), Math.round(fy) + 2, 4, 1);
        }
        if (e.phase === 'aim') drawTextCentered(g, 'DUCK', e.cx, e.y - 12, '#ff8a5c', 1);
      }
    } else if (e instanceof Bomber) {
      const flashing = e.hitFlash > 0 && Math.floor(e.hitFlash * 24) % 2 === 0;
      drawSprite(ART.l3bomb, e, { tint: flashing ? 'rgba(255,255,255,.9)' : null });
      if (e.taunt > 0) drawTextCentered(g, 'ARMOURED', e.cx, e.y - 11, '#ff8a5c', 1);
    } else if (e instanceof DecoyFox) {
      /* Drawn as a phantom, not as a second fox. A 30% blue wash over the same
         sprite was invisible at this size - the two were indistinguishable, so
         picking the real one was a coin flip rather than a read. Translucent
         and cold, with a shimmer, it is still something you have to look at,
         but you can tell. */
      const shimmer = 0.42 + Math.sin(game.time * 9 + e.t * 3) * 0.12;
      g.save();
      g.globalAlpha = shimmer + 0.16;
      drawSprite(ART.l3foxrun, e, { tint: 'rgba(90,170,235,.55)' });
      g.restore();
      if (Math.floor(game.time * 6) % 2 === 0)
        drawTextCentered(g, '?', e.cx, e.y - 12, '#7ec8f0', 1);
    } else if (e instanceof Dardubala) {
      if (e.foxed) { drawFox(e.cx - 11, e.y + 8, -1, game.time); continue; }
      /* The tell for a shot is the LANE, not a symbol over his head - you need
         to know what height it is coming at, which is the whole point of it.
         Drawn along the floor he is standing on, flashing, for the 0.5s of
         wind-up. */
      if (e.phase === 'aim' && !e.scriptedOut) {
        const fy = e.bottom - BULLET.ride;
        const d = e.aimDir || 1;
        if (Math.floor(game.time * 14) % 2 === 0) {
          g.fillStyle = 'rgba(255,138,92,.60)';
          for (let k = 1; k < 14; k++)
            g.fillRect(Math.round(e.cx + d * (8 + k * 9)), Math.round(fy) + 2, 4, 1);
        }
        drawTextCentered(g, 'DUCK', e.cx, e.y - 12, '#ff8a5c', 1);
      }
      if (e.isFox && !e.scriptedOut) {
        // real art now: running while he hunts, sitting while he is open
        const sitting = e.phase === 'pant';
        const art = sitting ? ART.l3foxsit : ART.l3foxrun;
        const flash = e.hitFlash > 0 && Math.floor(e.hitFlash * 24) % 2 === 0;
        const open = sitting && Math.floor(game.time * 10) % 2 === 0;
        drawSprite(art, e, {
          tint: flash ? 'rgba(255,255,255,.9)' : open ? 'rgba(255,216,94,.45)' : null,
        });
        if (sitting && Math.floor(game.time * 8) % 2 === 0)
          drawTextCentered(g, 'STOMP HIM', e.cx, e.y - 12, '#7ae07a', 1);
        if (e.phase === 'pounce' && Math.floor(game.time * 14) % 2 === 0)
          drawTextCentered(g, '!', e.cx, e.y - 12, '#ff5ec4', 2);
        continue;
      }
      const flashing = e.hitFlash > 0 && Math.floor(e.hitFlash * 24) % 2 === 0;
      const open = e.harmless && Math.floor(game.time * 10) % 2 === 0;
      drawSprite(ART.l3dard, e, {
        tint: flashing ? 'rgba(255,255,255,.9)' : open ? 'rgba(255,216,94,.5)' : null,
      });
      if (e.phase === 'windup' && Math.floor(game.time * 14) % 2 === 0)
        drawTextCentered(g, '!', e.cx, e.y - 12, '#c9a0ff', 2);
      if (e.harmless && Math.floor(game.time * 8) % 2 === 0)
        drawTextCentered(g, 'STOMP HIM', e.cx, e.y - 11, '#7ae07a', 1);
    } else if (e instanceof MidBoss) {
      const flashing = e.hitFlash > 0 && Math.floor(e.hitFlash * 24) % 2 === 0;
      drawSprite(ART.mid, e, { tint: flashing ? 'rgba(255,255,255,.85)' : null });
      // Wind-up tell, matching the boss's telegraph language.
      if (e.phase === 'windup' && Math.floor(game.time * 14) % 2 === 0)
        drawTextCentered(g, '!', e.cx, e.y - 11, '#ff8a5c', 2);
      if (e.phase === 'stun' && Math.floor(game.time * 8) % 2 === 0)
        drawTextCentered(g, 'HIT HIM', e.cx, e.y - 10, '#7ae07a', 1);
    } else drawSprite(ART.walker, e);
  }

  for (const a of game.charmers) {
    shadowUnder(a);
    // Pulse ring while she has hold of you, so the drag is visibly her doing.
    if (a.active) {
      const r = CHARM.radius, step = Math.floor(game.time * 6) % 2;
      g.fillStyle = 'rgba(255,122,168,.13)';
      g.fillRect(Math.round(a.cx - r), Math.round(a.bottom - 10), r * 2, 10);
      if (step) drawHeartIcon(a.cx - 3, a.y - 10, '#ff7aa8');
    }
    drawSprite(ART.lady, a, { bob: -(Math.floor(a.t * 2) % 2) });
  }

  // Once he reaches the cabin he is inside the aircraft, so he stops being
  // drawn. There is deliberately no line between him and the helicopter.
  if (game.boss && !game.boss.boarded) {
    const b = game.boss;
    for (let r = 3; r > 0; r--) {                     // stepped aura, not a gradient
      g.fillStyle = `rgba(120,70,180,${0.05 * r})`;
      const rad = 14 + r * 9 + Math.round(Math.sin(b.t * 2) * 2);
      g.fillRect(Math.round(b.cx - rad), Math.round(b.y + b.h / 2 - rad), rad * 2, rad * 2);
    }
    const denying = b.denyFlash > 0 && Math.floor(b.denyFlash * 26) % 2 === 0;
    const hurt    = b.hitFlash > 0 && Math.floor(b.hitFlash * 24) % 2 === 0;
    // Gold pulse while he is reachable — the visual cue that now is the moment.
    const open = b.vulnerable && Math.floor(game.time * 10) % 2 === 0;
    drawSprite(ART.boss, b, {
      bob: b.vulnerable ? 0 : Math.round(Math.sin(b.t * 3) * 2),
      tint: hurt ? 'rgba(255,255,255,.9)'
          : denying ? 'rgba(255,110,110,.8)'
          : open ? 'rgba(255,216,94,.5)' : null,
    });
  }

  for (const h of game.hazards) h.draw();
  for (const pl of game.planks) pl.draw();
  for (const r of game.shots) r.draw();
  if (LEVEL.crowd) crowd.draw();
  if (game.tea) drawTeaScene();
  if (game.heli) drawHeli(game.heli.x, game.heli.y, game.heli.t);

  const p = game.player;
  if (game.death) drawSprite(ART.death, game.death);
  const blink = game.death || (p.invuln > 0 && Math.floor(p.invuln * 20) % 2 === 0);
  if (!blink) {
    shadowUnder(p);
    // Landing compresses, takeoff extends. This was inverted before — he
    // stretched on impact and squatted on launch, which read as a twitch.
    let sq = 1;
    if (p.squashT > 0)       sq = 0.86;
    else if (p.stretchT > 0) sq = 1.12;
    else if (!p.onGround)    sq = p.vy < 0 ? 1.07 : 0.96;

    const inv = p.invincible > 0;
    const expiring = inv && p.invincible < 1.6;   // flicker out as it runs down
    const tint = inv && (!expiring || Math.floor(p.invincible * 12) % 2 === 0)
      ? INV_TINTS[Math.floor(game.time * 14) % INV_TINTS.length] : null;
    const airborne = !p.onGround && !p.crouching;
    const art = p.crouching ? ART.squat : airborne ? ART.jump : ART.hero;
    // the jump art is a pose, not a stretch: squashing it too reads as rubber
    const sqUsed = (p.crouching || airborne) ? 1 : sq;
    drawSprite(art, p, { squash: sqUsed, tint });

    // sqUsed, not sq: the pose frames are drawn unsquashed, and measuring them
    // with sq put the rose a couple of pixels off on every airborne frame
    const dw = Math.round(art.w / sqUsed), dh = Math.round(art.h * sqUsed);

    /* The rose is an overlay rather than part of any pose, so it has to be put
       back into whichever hand that pose is holding it in.

       HAND_X is measured, not guessed: keying out jump.png and finding the
       skin-coloured blobs puts the raised fist at 0.902 across the sprite and
       0.739 of its height up from the feet. Guessing 0.30/0.76 left it short
       of his fist by about two pixels, which at 4x is very visible. The offset
       from centre is therefore (0.902 - 0.5). */
    /* Not in every act. The rose he carries is the Rose Revolution's, so he
       does not walk into a newsroom raid holding one - LEVEL.heroRose turns
       the overlay off for act 2 in all three poses. The throwable roses from
       `?` blocks are a separate thing and still work there; only what is
       drawn in his hand changes. */
    if (LEVEL.heroRose !== false) {
      const HAND = airborne ? { x: 0.902 - 0.5, y: 0.739 } : { x: 0.26, y: 0.54 };
      // the fist grips the stem near its base, and drawMiniRose's stem runs
      // from y+3 to y+7 with a 4-wide bloom on top, so back off by half a
      // bloom and most of a stem to land the grip on the hand not the flower
      const rx = p.face > 0 ? p.cx + dw * HAND.x - (airborne ? 2 : 0)
                            : p.cx - dw * HAND.x - (airborne ? 2 : 4);
      drawMiniRose(rx, p.bottom - dh * HAND.y - (airborne ? 5 : 0));
    }

    // Hearts orbiting his head while he is stuck staring.
    if (p.charmed > 0)
      for (let i = 0; i < 3; i++) {
        const a = game.time * 3 + i * 2.1;
        drawHeartIcon(p.cx + Math.cos(a) * 9 - 3, p.y - 10 + Math.sin(a) * 3, '#ff7aa8');
      }
  }

  // finish line: Georgian flag on the pole
  if (LEVEL.finishX == null) return;
  const fx = LEVEL.finishX * TILE, fy = groundYAt(LEVEL.finishX);
  g.fillStyle = '#d8d8d8'; g.fillRect(fx, fy - 96, 2, 96);
  g.fillStyle = '#ffd85e'; g.fillRect(fx - 1, fy - 99, 4, 3);
  drawFlagNew(fx + 2, fy - 96, Math.round(Math.sin(game.time * 3) * 1));
}

function drawBossIndicator() {
  const b = game.boss;
  if (!b || game.state === 'escape') return;
  const sx = b.cx - cam.x, sy = b.y - cam.y;

  // Health bar appears only once he actually fights back — showing it during
  // the stalk would imply he is beatable there, and he is not.
  if (!b.engaged) {
    if (sx < 0 || sx > VIEW_W) drawBossArrow(sx, sy, b);
    return;
  }

  const bw = 120, bx = Math.round((VIEW_W - bw) / 2), by = 14;
  drawTextCentered(g, 'ASLAN', VIEW_W / 2, by - 9, '#c9a0ff', 1);
  g.fillStyle = '#1a1420'; g.fillRect(bx - 1, by - 1, bw + 2, 7);
  g.fillStyle = '#3a2f4a'; g.fillRect(bx, by, bw, 5);
  const hpw = Math.round(bw * clamp(b.hp / BOSS.maxHp, 0, 1));
  g.fillStyle = b.vulnerable ? '#ffd85e' : '#a04bd0'; g.fillRect(bx, by, hpw, 5);
  g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(bx, by, hpw, 1);
  for (let i = 1; i < BOSS.maxHp; i++) {
    g.fillStyle = '#1a1420';
    g.fillRect(bx + Math.round(bw * i / BOSS.maxHp), by, 1, 5);
  }

  if (sx >= 0 && sx <= VIEW_W) {
    const lx = clamp(sx, 34, VIEW_W - 34);
    const ly = clamp(sy - 11, 24, VIEW_H - 24);
    // Telegraph marker: this is the tell that a dive is coming.
    if (b.phase === 'telegraph' && Math.floor(game.time * 14) % 2 === 0)
      drawTextCentered(g, '!', lx, ly - 10, '#ff5ec4', 2);
    if (b.vulnerable) {
      if (Math.floor(game.time * 8) % 2 === 0)
        drawTextCentered(g, 'STOMP HIM', lx, ly, '#7ae07a', 1);
    } else {
      drawTextCentered(g, 'OUT OF REACH', lx, ly, '#c9a0ff', 1);
    }
  } else drawBossArrow(sx, sy, b);
}

/* A locked gate has to say what it is.

   Unlabelled it is just a metal wall you cannot walk through, with no hint
   that it is a lock, that something opens it, or that the thing that opens it
   is behind you. Padlock, what to beat, and an arrow back toward the guard. */
function drawGatePrompts() {
  const p = game.player;
  for (const gt of game.gates) {
    if (!isSolid(tileAt(gt.x, 10))) continue;              // already open
    const gx = gt.x * TILE + TILE / 2;
    if (Math.abs(p.cx - gx) > 96) continue;
    const y = 8 * TILE;

    g.fillStyle = '#ffd85e';                                // padlock
    g.fillRect(gx - 4, y + 5, 9, 7);
    g.fillRect(gx - 2, y, 5, 2);
    g.fillRect(gx - 3, y + 1, 2, 5); g.fillRect(gx + 2, y + 1, 2, 5);
    g.fillStyle = '#8a6a10'; g.fillRect(gx - 1, y + 7, 3, 3);

    const guardAlive = gt.guard && !gt.guard.dead;
    drawTextCentered(g, gt.kind === 'final' ? 'BEAT ASLAN' : 'BEAT THE GUARD',
                     gx, y - 12, '#ffd85e', 1);
    if (gt.kind !== 'final' && guardAlive && Math.floor(game.time * 3) % 2 === 0)
      drawTextCentered(g, '<<< HE IS BACK THERE', gx, y - 22, '#7ec8f0', 1);
  }
}

// Off-screen marker at the edge so you always know where he is.
function drawBossArrow(sx, sy, b) {
  const right = sx > VIEW_W;
  const ay = clamp(sy + b.h / 2, 22, VIEW_H - 22);
  g.fillStyle = '#c9a0ff';
  for (let i = 0; i < 6; i++) {
    const hgt = (6 - i) * 2;
    g.fillRect(right ? VIEW_W - 2 - i : 2 + i, Math.round(ay - hgt / 2), 1, hgt);
  }
  drawText(g, 'BOSS', right ? VIEW_W - 34 : 10, ay + 10, '#c9a0ff', 1);
}

function drawParticles() {
  for (const p of particles) {
    g.globalAlpha = p.life / p.max > 0.35 ? 1 : 0.5;   // 2-step alpha, not a fade
    g.fillStyle = p.color;
    g.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  }
  g.globalAlpha = 1;
  for (const f of floats) {
    if (f.life < 0.25 && Math.floor(f.life * 20) % 2 === 0) continue;
    drawTextCentered(g, f.text, f.x, f.y, f.color, f.s);
  }
}

function drawHeart(x, y, full, col = '#e8434f', hi = '#ff8f9c') {
  g.fillStyle = full ? col : '#3a3f4a';
  g.fillRect(x + 1, y, 2, 1); g.fillRect(x + 5, y, 2, 1);
  g.fillRect(x, y + 1, 8, 3);
  g.fillRect(x + 1, y + 4, 6, 1);
  g.fillRect(x + 2, y + 5, 4, 1);
  g.fillRect(x + 3, y + 6, 2, 1);
  if (full) { g.fillStyle = hi; g.fillRect(x + 1, y + 1, 2, 1); }
}

function drawHud() {
  if (!showHud) return;
  for (let i = 0; i < 3; i++) drawHeart(8 + i * 11, 8, i < game.player.hp);
  // rose hearts sit after the three, pink, and blink as they are about to go
  for (let i = 0; i < game.player.extra; i++) {
    const last = i === game.player.extra - 1;
    const fading = last && game.player.extraT < 4 && Math.floor(game.time * 6) % 2 === 0;
    if (!fading) drawHeart(8 + (3 + i) * 11, 8, true, '#ff8fd0', '#ffd0e8');
  }
  drawCoinIcon(9, 20);
  drawText(g, `*${String(game.player.coins).padStart(2, '0')}`, 18, 19, '#ffd85e', 1);
  drawText(g, String(game.score).padStart(6, '0'), 52, 19, '#fff', 1);
  if (game.player.combo > 1)
    drawText(g, `COMBO X${Math.min(game.player.combo, 8)}`, 8, 30, '#ff5ec4', 1);
  if (Music.muted) drawText(g, 'MUSIC OFF', VIEW_W - 62, 8, '#8890a4', 1);
  if (game.player.roses > 0) {
    drawMiniRose(8, 29);
    drawText(g, `ROSES X${game.player.roses}`, 15, 30, '#ff8fd0', 1);
    // shown until they actually throw one, then never again
    if (game.player.throwHint > 0 && Math.floor(game.time * 3) % 2 === 0)
      drawText(g, 'PRESS X TO THROW', 15, 40, '#ffd85e', 1);
  }

  /* One bar for whichever boss you are currently up against. Previously only
     Dardubala had one, so Svani's five hits and Sleepy's three were tracked by
     nothing but a floating "N LEFT" that vanished in half a second. */
  const near = game.enemies
    .filter(e => !e.dead && e.bossName && !e.scriptedOut &&
                 Math.abs(e.cx - game.player.cx) < 190 &&
                 (!(e instanceof Dardubala) || e.engaged))
    .sort((a, b) => Math.abs(a.cx - game.player.cx) - Math.abs(b.cx - game.player.cx))[0];
  if (near) {
    const mx = near.maxHp || 1;
    const bw = 120, bx = Math.round((VIEW_W - bw) / 2), by = 14;
    drawTextCentered(g, near.bossName, VIEW_W / 2, by - 9, '#c9a0ff', 1);
    g.fillStyle = '#1a1420'; g.fillRect(bx - 1, by - 1, bw + 2, 7);
    g.fillStyle = '#3a2f4a'; g.fillRect(bx, by, bw, 5);
    const w = Math.round(bw * clamp(near.hp / mx, 0, 1));
    g.fillStyle = near.harmless ? '#ffd85e' : '#a04bd0'; g.fillRect(bx, by, w, 5);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(bx, by, w, 1);
    for (let i = 1; i < mx; i++) {
      g.fillStyle = '#1a1420';
      g.fillRect(bx + Math.round(bw * i / mx), by, 1, 5);
    }
  }
  /* Stacked, not overlaid. Both timers used to draw a label at y=40/41, so
     holding powder and khachapuri at once printed them on top of each other. */
  // the throw prompt occupies y=40, so the timers start below it while it shows
  let ty = (game.player.roses > 0 && game.player.throwHint > 0) ? 50 : 40;
  const timerBar = (label, frac, col, hi, dim) => {
    drawText(g, label, 8, ty, frac > 0.28 || Math.floor(game.time * 6) % 2 === 0 ? col : dim, 1);
    g.fillStyle = '#2a2f3a'; g.fillRect(8, ty + 9, 62, 4);
    g.fillStyle = col;       g.fillRect(8, ty + 9, Math.round(62 * frac), 4);
    g.fillStyle = hi;        g.fillRect(8, ty + 9, Math.round(62 * frac), 1);
    ty += 18;
  };
  if (game.player.doubleJumpT > 0)
    timerBar(game.player.airJumps > 0 ? '2X JUMP' : '2X USED',
             game.player.doubleJumpT / POWDER_TIME, '#9ee8ff', '#e8f8ff', '#4a5866');
  // A charge, so it gets a full bar rather than a draining one.
  if (game.player.ultra > 0)
    timerBar('ULTRA READY', 1, '#ffd85e', '#fff2c0', '#6a5a20');
  if (game.player.invincible > 0)
    timerBar(LEVEL.invincibleLabel || 'ACHARULI',
             game.player.invincible / KHACHAPURI_TIME, '#ffd85e', '#fff2c0', '#6a5a20');
}

function drawCoinIcon(x, y) {
  g.fillStyle = '#ffd85e'; g.fillRect(x, y, 5, 7);
  g.fillStyle = '#e8a020'; g.fillRect(x, y, 5, 1); g.fillRect(x, y + 6, 5, 1);
}

function drawScoreboard(cx, y) {
  const list = Scores.load();
  drawTextCentered(g, 'TOP 5', cx, y, '#ffd85e', 1);
  if (!list.length) {
    drawTextCentered(g, 'NO SCORES YET', cx, y + 12, '#8890a4', 1);
    return;
  }
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    drawTextCentered(g, `${i + 1} ${r.name} ${String(r.score).padStart(6, '0')}`,
                     cx, y + 12 + i * 8, i === 0 ? '#fff' : '#9aa4b8', 1);
  }
}

/* A phone can render this fine but cannot play it: every control is a key and
   there is not a single touch handler in the file, so a tap does nothing and
   the title screen is where it ends. Say so rather than leaving people poking
   at "PRESS SPACE TO START".

   Coarse pointer AND no fine pointer anywhere - a touchscreen laptop has a
   trackpad, so it reports `any-pointer: fine` and is correctly left alone.
   Evaluated once: matchMedia is cheap but this runs every frame. A keyboard
   paired later still works, because nothing here gates input. */
const noKeyboard = (() => {
  try {
    return matchMedia('(pointer: coarse)').matches &&
           !matchMedia('(any-pointer: fine)').matches;
  } catch (e) { return false; }
})();

function drawTitle() {
  g.fillStyle = 'rgba(8,10,20,.62)'; g.fillRect(0, 0, VIEW_W, VIEW_H);
  const bounce = Math.round(Math.sin(game.time * 2.4) * 2);
  // two lines at scale 3: the whole name on one line is 411px against a 320 buffer
  drawTextCentered(g, 'GAATAVISUPLE', VIEW_W / 2, 14 + bounce, '#ffd85e', 3);
  drawTextCentered(g, 'SAKARTVELO', VIEW_W / 2, 38 + bounce, '#ffd85e', 3);
  drawTextCentered(g, `ACT 1 - ${LEVELS[0].subtitle}`, VIEW_W / 2, 62, '#7ec8f0', 1);
  drawScoreboard(VIEW_W / 2, 76);
  if (noKeyboard) {
    if (Math.floor(game.time * 2) % 2 === 0)
      drawTextCentered(g, 'THIS ONE NEEDS A KEYBOARD', VIEW_W / 2, 132, '#ffd85e', 1);
    drawTextCentered(g, 'OPEN IT ON A COMPUTER TO PLAY', VIEW_W / 2, 150, '#fff', 1);
    drawTextCentered(g, 'NO TOUCH CONTROLS YET - SORRY', VIEW_W / 2, 162, '#8890a4', 1);
    return;
  }
  if (Math.floor(game.time * 2) % 2 === 0)
    drawTextCentered(g, 'PRESS SPACE TO START', VIEW_W / 2, 132, '#fff', 1);
  drawTextCentered(g, 'ARROWS MOVE  DOWN DUCK  SHIFT RUN  X ROSE', VIEW_W / 2, 150, '#8890a4', 1);
  drawTextCentered(g, 'DUCK+JUMP DROPS THROUGH A PLATFORM', VIEW_W / 2, 162, '#8890a4', 1);
}

function drawEntry() {
  const e = game.entry;
  if (!e) return;
  g.fillStyle = 'rgba(8,10,20,.80)'; g.fillRect(0, 0, VIEW_W, VIEW_H);
  drawTextCentered(g, 'NEW HIGH SCORE', VIEW_W / 2, 30, '#ffd85e', 2);
  drawTextCentered(g, `SCORE ${e.score}`, VIEW_W / 2, 58, '#fff', 1);

  const gap = 26;
  let x = VIEW_W / 2 - gap;
  for (let i = 0; i < 3; i++) {
    const ch = ENTRY_CHARS[e.idx[i]];
    const sel = i === e.slot;
    const blink = sel && Math.floor(game.time * 4) % 2 === 0;
    drawTextCentered(g, ch === ' ' ? '-' : ch, x, 80,
                     blink ? '#fff' : sel ? '#ffd85e' : '#9aa4b8', 3);
    if (sel) { g.fillStyle = '#ffd85e'; g.fillRect(Math.round(x - 8), 106, 16, 2); }
    x += gap;
  }
  drawTextCentered(g, 'UP DOWN LETTER   LEFT RIGHT SLOT', VIEW_W / 2, 130, '#8890a4', 1);
  drawTextCentered(g, 'SPACE TO CONFIRM', VIEW_W / 2, 144, '#8890a4', 1);
}

function drawOverlay() {
  if (game.state === 'won') {
    g.fillStyle = 'rgba(6,18,10,.58)';
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    // Split across two lines: at scale 2 the full sentence is 408px wide and
    // the buffer is only 320.
    const lines = LEVEL.winLines || [['LEVEL CLEAR', '#7ae07a']];
    const after = LEVEL.afterLines || [];

    /* Laid out from the content rather than from fixed offsets: act 3's
       epilogue is six lines and act 1 has none, and a hardcoded y for the
       score would either collide with one or float in the middle of the
       other. */
    const AFTER_GAP = 11, AFTER_LEAD = 1.0, AFTER_STEP = 0.75;
    const hTitle = lines.length * 24;
    const hAfter = after.length ? 12 + after.length * AFTER_GAP : 0;
    const total = hTitle + hAfter + 22 + 22;
    let y = Math.max(24, Math.round((VIEW_H - total) / 2));

    lines.forEach(([txt, col], i) => drawTextCentered(g, txt, VIEW_W / 2, y + i * 24, col, 2));
    y += hTitle + (after.length ? 12 : 0);

    // one line at a time, so an ending reads as an ending
    after.forEach(([txt, col], i) => {
      if (txt && game.endT > AFTER_LEAD + i * AFTER_STEP)
        drawTextCentered(g, txt, VIEW_W / 2, y + i * AFTER_GAP, col, 1);
    });
    y += hAfter;

    drawTextCentered(g, `SCORE ${game.score}`, VIEW_W / 2, y + 6, '#fff', 1);
    // the prompt waits for the last line rather than talking over it
    const settled = AFTER_LEAD + Math.max(0, after.length - 1) * AFTER_STEP + 0.8;
    if (game.endT > Math.max(1.4, settled) && Math.floor(game.endT * 2) % 2 === 0)
      drawTextCentered(g, game.advance ? 'PRESS SPACE TO CONTINUE' : 'PRESS R TO RESTART',
                       VIEW_W / 2, y + 26, '#8890a4', 1);
  }

  if (game.state === 'lost') {
    // Held back so the death animation is not covered by the overlay.
    if (game.endT < 1.9) return;
    g.fillStyle = 'rgba(22,6,10,.62)';
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    drawTextCentered(g, 'GAME OVER', VIEW_W / 2, 58, '#ff8f9c', 2);
    drawTextCentered(g, `SCORE ${game.score}`, VIEW_W / 2, 90, '#fff', 1);
    if (game.endT > 2.6 && Math.floor(game.endT * 2) % 2 === 0)
      drawTextCentered(g, 'PRESS R TO RESTART', VIEW_W / 2, 114, '#8890a4', 1);
  }
}

function drawDebug() {
  if (!debug) return;
  g.strokeStyle = '#0ff'; g.lineWidth = 1;
  for (const e of [game.player, ...game.enemies, ...game.coins, game.boss].filter(Boolean))
    g.strokeRect(e.x + 0.5, e.y + 0.5, e.w - 1, e.h - 1);
}

let scanPattern = null;
function buildScanlines() {
  const c = document.createElement('canvas');
  c.width = 1; c.height = SCALE;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(0,0,0,.16)';
  x.fillRect(0, SCALE - 1, 1, 1);
  scanPattern = dctx.createPattern(c, 'repeat');
}

function render() {
  drawBackdrop();

  const sx = shake > 0 ? Math.round(rand(-shake, shake)) : 0;
  const sy = shake > 0 ? Math.round(rand(-shake, shake)) : 0;

  g.save();
  g.translate(-Math.round(cam.x) + sx, -Math.round(cam.y) + sy);
  drawTiles();
  drawLevelFlags();
  drawEntities();
  drawGatePrompts();
  drawParticles();
  drawDebug();
  g.restore();

  if (game.state === 'play') drawBossIndicator();

  if (flash > 0) {
    g.fillStyle = `rgba(255,255,255,${clamp(flash, 0, 1) * 0.45})`;
    g.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  if (game.state === 'title') drawTitle();
  else if (game.state === 'card') drawCard();
  else if (game.state === 'entry') drawEntry();
  else { drawHud(); drawOverlay(); }

  dctx.imageSmoothingEnabled = false;
  dctx.drawImage(buf, 0, 0, VIEW_W * SCALE, VIEW_H * SCALE);

  if (crt) {
    if (!scanPattern) buildScanlines();
    dctx.fillStyle = scanPattern;
    dctx.fillRect(0, 0, VIEW_W * SCALE, VIEW_H * SCALE);
  }
}

/* ---------------------------------------------------------- loop */

function fitCanvas() {
  const s = Math.min(innerWidth / (VIEW_W * SCALE), innerHeight / (VIEW_H * SCALE));
  display.style.width  = `${Math.floor(VIEW_W * SCALE * s)}px`;
  display.style.height = `${Math.floor(VIEW_H * SCALE * s)}px`;
}
addEventListener('resize', fitCanvas);

let last = 0;
function frame(now) {
  const dt = Math.min((now - last) / 1000 || 0, 1 / 30);
  last = now;

  if (Input.justDown('KeyR') && game.state !== 'title' && game.state !== 'card')
    reset(false, { levelIndex: game.levelIndex });
  if (Input.justDown('KeyH')) showHud = !showHud;
  if (Input.justDown('KeyM')) Music.toggle();
  if (Input.justDown('KeyN')) Sfx.toggle();
  if (Input.justDown('KeyC')) crt = !crt;
  if (Input.justDown('KeyB')) debug = !debug;

  update(dt);
  render();
  Input.clearFrame();
  requestAnimationFrame(frame);
}

(async function boot() {
  display.width = VIEW_W * SCALE;
  display.height = VIEW_H * SCALE;
  fitCanvas();
  await loadAll();
  /* Every act, each against its own grid.

     validateLevel reads `grid` for the bump-headroom and buried-pickup checks,
     and `grid` is built by reset() - which runs AFTER this. So the checks were
     dereferencing undefined and boot died on the spot: the game shipped stuck
     on LOADING. Local testing never caught it because every test called
     validateLevel() from the console, always after a reset.

     Doing it per level also closes the older gap where only act 1 was ever
     checked, because LEVEL was still bound to LEVEL_1 at this point. */
  for (let i = 0; i < LEVELS.length; i++) { loadLevel(i); buildGrid(); validateLevel(); }
  loadLevel(0);
  const missing = Object.keys(SPRITES).filter(k => ART[k].isPlaceholder);
  if (missing.length) console.info('placeholders in use:', missing.join(', '));
  /* ?act=2 drops you straight into an act, for playtesting without
     replaying everything before it. Clamped, so a junk value is harmless. */
  const wanted = parseInt(new URLSearchParams(location.search).get('act') || '1', 10);
  const act = Number.isFinite(wanted) ? clamp(wanted - 1, 0, LEVELS.length - 1) : 0;
  if (act > 0) { reset(false, { levelIndex: act }); Music.start(); }
  else reset(true);
  document.getElementById('boot').classList.add('hidden');
  requestAnimationFrame(frame);
})();
