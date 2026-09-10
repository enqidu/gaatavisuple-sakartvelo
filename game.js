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
  walker: { src: 'assets/walker.png', h: 19, hitW: 0.70, hitH: 0.90, color: '#4a7a2f' },
  mid:    { src: 'assets/mid.png',    h: 30, hitW: 0.80, hitH: 0.82, color: '#2d4a7a' },
  boss:   { src: 'assets/boss.png',   h: 34, hitW: 0.55, hitH: 0.90, color: '#1a1a1a' },
  death:  { src: 'assets/death.png',  h: 32, hitW: 0.55, hitH: 0.90, color: '#5a2b2b' },
  lady:   { src: 'assets/lady.png',   h: 29, hitW: 0.50, hitH: 0.90, color: '#c2456f' },
  powder: { src: 'assets/powder.png', h: 14, hitW: 1.00, hitH: 1.00, color: '#e8e8f4' },
  bg:     { src: 'assets/bg.png',     h: LEVEL_H_PX, raw: true, haze: 0.42 },

  /* Level 2. NIGHT_HAZE darkens toward navy instead of lightening toward sky:
     the level-1 pale preset flattens a night scene into daylight grey.
     l2bomb needs the pocket pass off - his white vest and cream trousers are
     large enclosed regions and the trousers sit only ~34 from the white
     background, so the pass deleted his clothes. */
  l2guard: { src: 'assets/l2_guard.png',     h: 28, hitW: 0.55, hitH: 0.90, color: '#4a4ab0' },
  l2sleepy:{ src: 'assets/l2_sleepy.png',    h: 30, hitW: 0.60, hitH: 0.90, color: '#d8d8e0' },
  l2svani: { src: 'assets/l2_svani.png',     h: 32, hitW: 0.62, hitH: 0.88, color: '#a03040' },
  l2bomb:  { src: 'assets/l2_bomb.png',      h: 31, hitW: 0.55, hitH: 0.90, color: '#e0e0d0',
             key: { minHolePct: Infinity } },
  l2dard:  { src: 'assets/l2_dardubala.png', h: 34, hitW: 0.55, hitH: 0.90, color: '#c03030' },
  l2bg:    { src: 'assets/l2_bg.png',    h: LEVEL_H_PX, raw: true, haze: NIGHT_HAZE },
  l2bg2:   { src: 'assets/l2_bg2.png',   h: LEVEL_H_PX, raw: true, haze: NIGHT_HAZE },
  l2arena: { src: 'assets/l2_arena.png', h: LEVEL_H_PX, raw: true, haze: NIGHT_HAZE },
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
  jumpHeld() { return this.down('Space') || this.down('ArrowUp') || this.down('KeyW') || this.down('KeyZ'); },
  jumpTap()  { return this.justDown('Space') || this.justDown('ArrowUp') || this.justDown('KeyW') || this.justDown('KeyZ'); },
  anyTap()   { return this.pressed.size > 0; },
};

addEventListener('keydown', e => {
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
  if (!Input.keys.has(e.code)) Input.pressed.add(e.code);
  Input.keys.add(e.code);
});
addEventListener('keyup', e => Input.keys.delete(e.code));

/* ---------------------------------------------------------- level */

const T = { AIR: 0, GROUND: 1, BRICK: 2, QUESTION: 3, USED: 4, PLATFORM: 5, PIPE: 6, GATE: 7 };

const LEVEL_1 = {
  w: 240, h: LEVEL_H,
  backdrops: [{ art: 'bg', fromX: 0, par: 0.34, tile: true }],
  subtitle: 'GAATAVISUPLE ACHARA',
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

  ground: [[0, 58], [62, 90], [94, 140], [144, 188], [192, 240]],

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
    { x: 164, y: 9,  w: 4, t: T.BRICK },
    { x: 166, y: 9,  w: 1, t: T.QUESTION },
    { x: 173, y: 10, w: 3, t: T.PLATFORM },
    { x: 180, y: 8,  w: 4, t: T.PLATFORM },

    { x: 196, y: 10, w: 4, t: T.PLATFORM },
    { x: 204, y: 8,  w: 2, t: T.BRICK },   // trimmed to keep column 206 clear for the gate
    { x: 214, y: 10, w: 3, t: T.PLATFORM },
    { x: 221, y: 9,  w: 3, t: T.PLATFORM },
  ],

  pipes: [
    { x: 31,  y: 11, h: 2 },
    { x: 48,  y: 11, h: 2 },
    { x: 110, y: 11, h: 2 },
    { x: 176, y: 10, h: 3 },
    { x: 210, y: 11, h: 2 },
  ],

  coinRuns: [
    { x: 8,   y: 10, n: 4 }, { x: 19,  y: 7,  n: 3 },
    { x: 37,  y: 8,  n: 3 }, { x: 44,  y: 6,  n: 3 },
    { x: 58,  y: 9,  n: 4 }, { x: 73,  y: 6,  n: 3 },
    { x: 79,  y: 4,  n: 3 }, { x: 90,  y: 9,  n: 4 },
    { x: 105, y: 8,  n: 5 }, { x: 114, y: 5,  n: 4 },
    { x: 132, y: 8,  n: 4 }, { x: 140, y: 9,  n: 4 },
    { x: 158, y: 5,  n: 3 }, { x: 181, y: 6,  n: 4 },
    { x: 188, y: 9,  n: 4 }, { x: 197, y: 8,  n: 4 },
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
    { x: 126, y: 6,  t: 'khachapuri' },
    { x: 154, y: 10, t: 'powder' },      // before the second mid boss
    { x: 158, y: 6,  t: 'rose' },
    { x: 195, y: 10, t: 'powder' },      // before the third mid boss
    { x: 202, y: 9,  t: 'khachapuri' },
    { x: 212, y: 10, t: 'powder' },      // inside the arena, before Aslan
    { x: 218, y: 9,  t: 'rose' },
    { x: 222, y: 7,  t: 'khachapuri' },
  ],

  // Flagpoles flying the old republic flag; touching one changes it over.
  flags: [12, 45, 76, 108, 145, 186, 218],

  // Placed to make a stretch awkward rather than to pad it out: on the run-up
  // to a gap, beside a gate, and in the boss arena.
  /* Keep these well clear of pit edges. One at 56 sat two tiles from the gap
     at 58-62 and her pull dragged the player over the edge — then the respawn
     put him back inside her radius, so she pulled him straight in again. An
     unbreakable loop that drained a heart per cycle. See validateLevel(). */
  charmers: [30, 42, 106, 168, 198],   // 106 not 102: clear of the gate at 101

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
    { t: 'walker', x: 184 },
    { t: 'mid',    x: 200, gate: 206 },
    { t: 'walker', x: 208 },
  ],

  // Opens only when Aslan is beaten, so the flag cannot be reached by walking
  // past the fight.
  finalGate: 226,
};


/* ---------------------------------------------------------- level 2

   Rustaveli Avenue, November 2003. Three backdrop zones: two stretches of the
   avenue, then the Parliament for the final fight. Each intermediate boss
   holds a gate, same contract as level 1.

   Arena drift check (the untiled zone's hard constraint): camMax is
   232*16-320 = 3392, the camera on arena entry is about 2816, so the far
   layer drifts (3392-2816)*0.15 = 86px. The art must cover VIEW_W + drift =
   406px and l2_arena is 525 wide. At level 1's 0.34 it would need 516 and
   very nearly run off the right edge.                                     */
const LEVEL_2 = {
  w: 232, h: LEVEL_H,
  start: { x: 3, y: 11 },
  finishX: null,           // no flag: beating Dardubala is the finish
  finalGate: null,
  voidColor: '#0a0c16',
  subtitle: 'GAATAVISUPLE PARLAMENTI',
  winLines: [['VARDEBIS', '#ffd85e'], ['REVOLUTSIA!', '#7ae07a']],

  backdrops: [
    { art: 'l2bg',    fromX: 0,   par: 0.34, tile: true },
    { art: 'l2bg2',   fromX: 84,  par: 0.34, tile: true },
    { art: 'l2arena', fromX: 186, par: 0.15, tile: false, anchorX: 176 },
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
    { t: 'l2guard', x: 16 }, { t: 'l2guard', x: 24 }, { t: 'l2guard', x: 31 },
    { t: 'l2sleepy', x: 40, gate: 48 },
    { t: 'l2guard', x: 54 }, { t: 'l2guard', x: 68 }, { t: 'l2guard', x: 76 },
    { t: 'l2guard', x: 82 },
    { t: 'l2svani', x: 92, gate: 98 },
    { t: 'l2guard', x: 112 }, { t: 'l2guard', x: 120 }, { t: 'l2guard', x: 128 },
    { t: 'l2guard', x: 134 },
    { t: 'l2bomber', x: 140, gate: 146 },
    { t: 'l2guard', x: 158 }, { t: 'l2guard', x: 170 }, { t: 'l2guard', x: 180 },
    { t: 'l2dard', x: 207 },
  ],

  items: [
    { x: 22,  y: 8,  t: 'rose' },
    { x: 36,  y: 10, t: 'powder' },
    { x: 38,  y: 8,  t: 'khachapuri' },
    { x: 70,  y: 8,  t: 'rose' },
    { x: 89,  y: 8,  t: 'powder' },
    { x: 91,  y: 6,  t: 'khachapuri' },
    { x: 118, y: 8,  t: 'rose' },
    { x: 136, y: 10, t: 'powder' },
    { x: 138, y: 8,  t: 'khachapuri' },
    { x: 172, y: 8,  t: 'rose' },
    { x: 190, y: 10, t: 'powder' },
    { x: 193, y: 10, t: 'khachapuri' },
  ],

  flags: [10, 50, 80, 126, 175, 200],
  charmers: [28, 72, 124, 178],
};

/* `LEVEL` is read from ~40 places and written from none, so two levels costs
   one keyword: a `let` plus a selector. Everything downstream keeps reading
   LEVEL.* and does not care which act it is in. */
const LEVELS = [LEVEL_1, LEVEL_2];
let LEVEL = LEVEL_1;

/* Which class each `t` in LEVEL.enemies builds. Was a hardcoded ternary on
   'mid'; level 2 has a different roster and no MidBoss at all.

   A function, not a const object: the classes are declared several hundred
   lines below this point, and a module-level object literal would evaluate
   here and hit the temporal dead zone. The body only runs at spawn time. */
function enemyKind(t) {
  return ({
    walker: Walker, mid: MidBoss,
    l2guard: Guard, l2sleepy: Sleepy, l2svani: Svani,
    l2bomber: Bomber, l2dard: Dardubala,
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

  if (warn.length) console.warn('level placement:\n  ' + warn.join('\n  '));
  return warn;
}

const tileAt = (tx, ty) =>
  (tx < 0 || ty < 0 || tx >= LEVEL.w || ty >= LEVEL.h) ? T.AIR : grid[ty * LEVEL.w + tx];
const isSolid  = t => t === T.GROUND || t === T.BRICK || t === T.QUESTION || t === T.USED || t === T.PIPE || t === T.GATE;
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

function floatText(x, y, text, color = '#fff', s = 1) {
  floats.push({ x, y, text, color, s, life: 0.9, max: 0.9 });
}

function updateEffects(dt) {
  for (const p of particles) {
    p.vy += p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.99; p.life -= dt;
  }
  particles = particles.filter(p => p.life > 0);
  for (const f of floats) { f.y -= 16 * dt; f.life -= dt; }
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
    // Squash/stretch are short discrete timers, not a continuous lerp. A lerp
    // rescales the sprite every frame, and at 4x upscale each 1px change in
    // the rounded draw size is a visible 4px jolt — it reads as vibration.
    this.squashT = 0; this.stretchT = 0;
  }

  hurt(fromX) {
    if (this.invuln > 0 || this.invincible > 0 || game.state !== 'play') return;
    this.hp--;
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

  fellInPit() {
    this.hp--;
    this.combo = 0;
    shake = 6; flash = 0.5; Sfx.pit();
    if (this.hp <= 0) { game.lose(); return; }
    const spot = this.respawnSpot();
    this.x = spot.x; this.y = spot.y;
    this.vx = 0; this.vy = 0;
    this.invuln = Math.max(this.invuln, 1.2);
    this.charmed = 0;
    floatText(this.cx, this.y - 12, '-1 HEART', '#ff8f9c');
    burst(this.cx, this.bottom, 14, { colors: ['#fff', '#8890a4'], speed: 80, life: 0.6, size: 2 });
  }

  onBumpTile(tx, ty, t) {
    bumpEnemiesOn(tx, ty);
    if (t === T.QUESTION) {
      grid[ty * LEVEL.w + tx] = T.USED;
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
    const hadDJ = this.doubleJumpT > 0;
    this.doubleJumpT = Math.max(0, this.doubleJumpT - dt);
    if (hadDJ && this.doubleJumpT === 0) {
      this.airJumps = 0;
      floatText(this.cx, this.y - 12, 'WORN OFF', '#8890a4');
    }
    const stuck = this.charmed > 0;

    const wantL = !stuck && Input.left(), wantR = !stuck && Input.right();
    let max = Input.sprint() ? CFG.sprintMax : CFG.runMax;
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
    if (this.buffer > 0 && this.coyote > 0) {
      this.vy = CFG.jumpVel;
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
    if (this.vy < 0 && !Input.jumpHeld()) this.vy *= Math.pow(CFG.jumpCut, dt * 60);
    this.vy = Math.min(this.vy + CFG.gravity * dt, CFG.maxFall);

    const wasAir = !this.onGround;
    moveAndCollide(this, dt);

    if (wasAir && this.onGround) {
      this.squashT = 0.10;
      this.combo = 0;
      this.airJumps = this.doubleJump ? 1 : 0;   // recharge on landing
      burst(this.cx, this.bottom, 6, { colors: ['#fff', '#cfd8e8'], speed: 58, grav: 240, life: 0.3, size: 1, spread: Math.PI });
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
  constructor(tx, gate = null) {
    const hb = hitboxFor('mid');
    super(tx * TILE, 0, hb.w, hb.h);
    this.gate = gate;
    this.y = groundYAt(tx) - this.h;
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
    const hb = hitboxFor('l2guard');
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
    const hb = hitboxFor('l2sleepy');
    super(tx * TILE, 0, hb.w, hb.h);
    this.y = groundYAt(tx) - this.h;
    this.gate = gate;
    this.hp = SLEEP.hp; this.dir = -1; this.turnCd = 0;
    this.noise = 0; this.phase = 'doze'; this.phaseT = 0; this.hitFlash = 0; this.t = 0;
    this.home = spanAround(tx);
  }
  get bossGrade() { return true; }
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
    const hb = hitboxFor('l2svani');
    super(tx * TILE, 0, hb.w, hb.h);
    this.y = groundYAt(tx) - this.h;
    this.gate = gate;
    this.hp = SVANI.hp; this.dir = -1; this.turnCd = 0;
    this.phase = 'patrol'; this.phaseT = 0; this.hitFlash = 0; this.t = 0;
    this.home = spanAround(tx);
  }
  get bossGrade() { return true; }
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

const BOMBER = { hp: 3, walk: 30, throwEvery: 2.3, range: 150, blast: 30, fuse: 2.1, puntFuse: 0.75 };

/* Armoured: stomping him does nothing. The only thing that hurts him is his
   own ordnance, so the fight is about the bombs, not about him. Stomp a live
   bomb to punt it back the way you are facing and cut its fuse. */
class Bomber extends Entity {
  constructor(tx, gate = null) {
    const hb = hitboxFor('l2bomb');
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
    const flee = Math.abs(d) < 56 ? -Math.sign(d) : this.dir;
    this.dir = Math.abs(d) < 56 ? flee : this.dir;
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
    super(x - 4, y, 8, 8);
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
    if (this.onGround) this.vx *= Math.pow(0.15, dt);   // rolls to a stop
    if (this.fuse <= 0) this.explode();
    if (Math.random() < dt * 26)
      burst(this.cx, this.y, 1, { colors: ['#ffd85e', '#ff8a5c'], speed: 14, grav: -40, life: .4, size: 1 });
  }
  explode() {
    if (this.dead) return;
    this.dead = true;
    shake = 6; Sfx.brick();
    burst(this.cx, this.cy2, 26, { colors: ['#ffd85e', '#ff8a5c', '#e8434f', '#fff'], speed: 190, size: 3, life: .7 });
    const box = { x: this.cx - BOMBER.blast, y: this.y + 4 - BOMBER.blast, w: BOMBER.blast * 2, h: BOMBER.blast * 2 };
    const p = game.player;
    if (aabb(box, p) && p.invincible <= 0) p.hurt(this.cx);
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
    this.vx = (p.face || 1) * 150;
    this.vy = -120;
    this.fuse = Math.min(this.fuse, BOMBER.puntFuse);
    p.vy = CFG.stompBounce * 0.85;
    floatText(this.cx, this.y - 8, 'KICK!', '#ffd85e');
    shake = 3; Sfx.stomp();
  }
}

const DARD = { hp: 4, pace: 26, slamEvery: 3.0, windup: 0.8, winded: 2.5, quipEvery: 3.1 };

/* He never actually says anything. The stage direction IS the joke. */
const DARD_QUIPS = ['IRONIC REMARK', 'SMIRK', 'IRONIC REMARK', 'DRY CHUCKLE'];

/* The final fight, and deliberately not the level-1 boss reskinned: he never
   chases and never dives. He holds the top step and slams, and the waves run
   along the floor - so the fight is about climbing to him during the window
   after a slam, not about dodging him in the open. */
class Dardubala extends Entity {
  constructor(tx) {
    const hb = hitboxFor('l2dard');
    super(tx * TILE, 0, hb.w, hb.h);
    this.y = groundYAt(tx) - this.h;
    this.hp = DARD.hp; this.dir = -1; this.turnCd = 0;
    this.phase = 'pace'; this.phaseT = 0; this.hitFlash = 0; this.t = 0;
    this.home = spanAround(tx);
    this.quip = 1.4; this.quipN = 0;
  }
  get bossGrade() { return true; }
  /* Safe to touch while rearing back, as well as while winded. He shares his
     step with you and damages on contact, so with only the 2.5s window safe a
     handful of unavoidable brushes ended the run before a stomp ever landed.
     Telegraphing and striking should not both be lethal. Note onStomp still
     only accepts a hit during 'winded' - windup is safe, not open. */
  get harmless() { return this.phase === 'winded' || this.phase === 'windup'; }
  /* Latches. Without it, retreating back past the arena line switched his
     slams off, so he never opened a window and the fight deadlocked - a bot
     playing it correctly landed zero hits in two minutes. */
  get engaged() {
    if (game.player.cx > (LEVEL.arenaX ?? 186) * TILE) this.woke = true;
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

    switch (this.phase) {
      case 'pace':
        this.vx = this.dir * DARD.pace;
        if (this.engaged && this.phaseT > DARD.slamEvery) { this.phase = 'windup'; this.phaseT = 0; Sfx.deny(); }
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
          const floorY = groundBelow(this.cx, this.bottom + TILE) ?? (13 * TILE);
          for (const dir of [-1, 1]) game.hazards.push(new Shockwave(this.cx, floorY, dir, '#c9a0ff'));
        }
        break;
      case 'winded':
        this.vx *= Math.pow(0.05, dt);
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
    if (this.phase !== 'winded') {
      floatText(this.cx, this.y - 8, 'NOT NOW', '#c9a0ff');
      shake = 4; Sfx.deny();
      return;
    }
    this.hp--; this.hitFlash = 0.4;
    this.phase = 'pace'; this.phaseT = 0;
    shake = 7; freeze = 0.1; flash = 0.35; Sfx.stomp();
    burst(this.cx, this.y + this.h / 2, 24, { colors: ['#c9a0ff', '#ffd85e', '#fff'], speed: 170, size: 3 });
    if (this.hp <= 0) {
      game.addCombo(p, this.cx, this.y, 3000);
      floatText(this.cx, this.y - 18, 'HE IS FINISHED', '#7ae07a');
      shake = 14; flash = 0.8; freeze = 0.2;
      game.teaOutro();
    } else {
      game.addCombo(p, this.cx, this.y, 600);
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

class Coin extends Entity {
  constructor(tx, ty) { super(tx * TILE + 4, ty * TILE + 4, 8, 10); this.t = rand(0, 6); }
  update(dt) { this.t += dt * 7; }
}

const ITEM_SIZE = { khachapuri: [14, 10], rose: [9, 12], powder: [12, 12] };

// [line 1, line 2, colour] — drawn above the pickup so it names itself.
const ITEM_LABEL = {
  khachapuri: ['ACHARULI', 'KHACHAPURI', '#ffd85e'],
  powder:     ['WHITE', 'POWDER', '#9ee8ff'],
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
    if (this.kind === 'powder' && Math.random() < dt * 7)
      burst(this.cx + rand(-6, 6), this.y + rand(0, 10), 1,
            { colors: ['#9ee8ff', '#fff'], speed: 9, grav: -20, life: 0.8, size: 1 });
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

/* ---------------------------------------------------------- game state */

const game = {
  player: null, enemies: [], coins: [], items: [], boss: null, heli: null,
  hazards: [], script: null, tea: null, levelIndex: 0, advance: false,
  score: 0, state: 'title', endT: 0, time: 0, best: 0,
};

const KHACHAPURI_TIME = 9;   // seconds of invincibility
const POWDER_TIME = 18;      // seconds of double jump

function reset(toTitle = false, opts = {}) {
  if (opts.levelIndex != null) loadLevel(opts.levelIndex);
  else if (toTitle) loadLevel(0);          // the title screen is always act one
  const carried = opts.keepScore ? game.score : 0;
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
  game.hazards = []; game.script = null; game.tea = null;
  game.entry = null;
  game.score = carried; game.endT = 0; game.time = 0;
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

   Loads the next level first so the card sits over that level's own backdrop,
   then types its lines out. Uppercase-only 5x7 font and a 320px screen, so
   the first line has to break in two: "BUT EVERYTHING STARTED WITH ROSES...."
   is 234px at scale 2 on one line, which does not fit with any margin. */
const CARD_LINES = [
  { t: 0.0, s: 'BUT EVERYTHING STARTED', c: '#e8e0d0', sc: 1 },
  { t: 0.5, s: 'WITH ROSES....',         c: '#e8e0d0', sc: 1 },
  { t: 1.8, s: '2003 NOVEMBER:',         c: '#ffd85e', sc: 2 },
];

function startCard(i) {
  reset(false, { levelIndex: i, keepScore: true });
  game.state = 'card';
  game.card = { t: 0 };
}

function updateCard(dt) {
  game.card.t += dt;
  game.time += dt;
  const done = game.card.t > CARD_LINES[CARD_LINES.length - 1].t + 1.2;
  if (done && (Input.jumpTap() || Input.justDown('Enter'))) {
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
  for (const L of CARD_LINES) {
    if (t < L.t) { y += L.sc === 2 ? 30 : 14; continue; }
    // typewriter: one character every 45ms
    const n = Math.min(L.s.length, Math.floor((t - L.t) / 0.045));
    drawTextCentered(g, L.s.slice(0, n), VIEW_W / 2, y, L.c, L.sc);
    y += L.sc === 2 ? 30 : 14;
  }
  const done = t > CARD_LINES[CARD_LINES.length - 1].t + 1.2;
  if (t > 2.6) drawTextCentered(g, `ACT 2 - ${LEVEL.subtitle}`, VIEW_W / 2, 124, '#7ec8f0', 1);
  if (done && Math.floor(t * 2) % 2 === 0)
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
function drawFox(x, y, face, t) {
  x = Math.round(x); y = Math.round(y);
  // silver, not red - the nickname was the point
  const o = '#dde3ec', d = '#9aa6b8', w = '#ffffff', k = '#232a34';
  const step = Math.floor(t * 9) % 2;
  g.save();
  if (face < 0) { g.translate(x + 22, y); g.scale(-1, 1); g.translate(-x, -y); }
  g.fillStyle = o; g.fillRect(x, y + 3, 6, 5);            // tail
  g.fillStyle = w; g.fillRect(x, y + 3, 3, 3);
  g.fillStyle = o; g.fillRect(x + 5, y + 4, 11, 6);       // body
  g.fillStyle = d; g.fillRect(x + 5, y + 9, 11, 1);
  g.fillStyle = w; g.fillRect(x + 12, y + 7, 5, 3);       // chest
  g.fillStyle = o; g.fillRect(x + 14, y, 7, 6);           // head
  g.fillStyle = d; g.fillRect(x + 14, y - 2, 2, 2); g.fillRect(x + 19, y - 2, 2, 2);
  g.fillStyle = w; g.fillRect(x + 19, y + 3, 3, 2);       // snout
  g.fillStyle = k; g.fillRect(x + 21, y + 3, 1, 1);
  g.fillStyle = k; g.fillRect(x + 17, y + 2, 1, 1);       // eye
  g.fillStyle = k;                                         // legs
  g.fillRect(x + 6, y + 10, 2, 3 - step);
  g.fillRect(x + 13, y + 10, 2, 2 + step);
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
      floatText(b.cx, b.y - 10, '*SILVER FOX*', '#dde3ec');
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
      if (falling && p.bottom - p.vy * dt <= e.y + band && open) e.onStomp(p);
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
    const falling  = e.harmless ? p.vy >= 0 : p.vy > 15;
    const band     = e.harmless ? e.h * 0.9 : e.h * 0.5;
    const feetAbove = p.bottom - p.vy * dt <= e.y + band;
    if (falling && feetAbove) {
      e.onStomp(p);
      if (!isBoss) p.vy = CFG.stompBounce;
    } else if (!e.harmless) p.hurt(e.cx);
  }
  game.enemies = game.enemies.filter(e => !e.dead);
}

function resolveItems() {
  const p = game.player;
  for (const it of game.items) {
    if (it.dead || !aabb(p, it)) continue;
    it.dead = true;
    if (it.kind === 'powder') {
      // Lasts for the rest of the life, not on a timer: it exists so you can
      // reach places, and a countdown would just mean rushing the platforming.
      p.doubleJumpT = POWDER_TIME;
      p.airJumps = 1;
      game.score += 500;
      floatText(p.cx, p.y - 14, 'DOUBLE JUMP', '#9ee8ff');
      shake = 3; flash = 0.4; Sfx.start();
      burst(it.cx, it.y + 5, 26, { colors: ['#9ee8ff', '#fff', '#c8d8f0'], speed: 120, grav: -40, size: 2, life: 1 });
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
      game.state = 'play';
      Sfx.start();
      Music.start();          // this keypress is the gesture that unblocks audio
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
      else if (Scores.qualifies(game.score)) startEntry(game.score);
      else reset(true);            // back to the title so the board is visible
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
    e.update(dt);
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
  for (const c of game.coins) c.update(dt);
  for (const it of game.items) it.update(dt);

  resolveEnemies(dt);
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
  pipe: '#28b028', pipeLite: '#68e068', pipeDark: '#106810',
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
function drawZone(art, z, clipL, clipR) {
  const oy = -Math.round(cam.y * 0.55);
  g.save();
  g.beginPath();
  g.rect(clipL, 0, clipR - clipL, VIEW_H);
  g.clip();

  if (z.tile) {
    const bw = art.w;
    const off = Math.round(cam.x * z.par);
    let i = Math.floor(off / bw);
    for (let n = 0; n <= Math.ceil(VIEW_W / bw) + 1; n++, i++) {
      const x = i * bw - off;
      if (i % 2 === 0) g.drawImage(art.canvas, x, oy);
      else {                                    // mirror alternates: no hard seam
        g.save(); g.translate(x + bw, oy); g.scale(-1, 1);
        g.drawImage(art.canvas, 0, 0); g.restore();
      }
    }
  } else {
    /* (anchor - cam.x) * par, NOT anchor - cam.x * par. The anchor is a world
       coordinate; it has to be mapped into the parallax layer's own space
       before the camera is subtracted, or the art lands hundreds of pixels
       off screen and the zone renders as flat void. */
    const anchor = (z.anchorX ?? z.fromX) * TILE;
    g.drawImage(art.canvas, Math.round((anchor - cam.x) * z.par), oy);
  }
  g.restore();
}

function drawBackdrop() {
  const zones = (LEVEL.backdrops || []).filter(z => ART[z.art] && !ART[z.art].isPlaceholder);
  if (zones.length) {
    // fill first: an untiled zone may not cover the full height on every frame
    g.fillStyle = LEVEL.voidColor || '#0a0c16';
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    for (let k = 0; k < zones.length; k++) {
      const z = zones[k], next = zones[k + 1];
      const l = k === 0 ? 0 : Math.round(z.fromX * TILE - cam.x);
      const r = next ? Math.round(next.fromX * TILE - cam.x) : VIEW_W;
      if (r <= 0 || l >= VIEW_W) continue;      // wholly off-camera
      drawZone(ART[z.art], z, Math.max(0, l), Math.min(VIEW_W, r));
    }
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
      break;
    }
    case T.QUESTION: {
      const blink = Math.floor(game.time * 6 + tx) % 6 === 0;
      g.fillStyle = blink ? PAL.qLite : PAL.qBlock; g.fillRect(px, py, TILE, TILE);
      g.fillStyle = PAL.qDark;
      g.fillRect(px, py, TILE, 1); g.fillRect(px, py + TILE - 1, TILE, 1);
      g.fillRect(px, py, 1, TILE); g.fillRect(px + TILE - 1, py, 1, TILE);
      g.fillRect(px + 1, py + 1, 1, 1); g.fillRect(px + TILE - 2, py + 1, 1, 1);
      g.fillRect(px + 1, py + TILE - 2, 1, 1); g.fillRect(px + TILE - 2, py + TILE - 2, 1, 1);
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
      const top = !isSolid(tileAt(tx, ty - 1));
      g.fillStyle = PAL.pipe;     g.fillRect(px, py, TILE, TILE);
      g.fillStyle = PAL.pipeLite; g.fillRect(px + 2, py, 3, TILE);
      g.fillStyle = PAL.pipeDark; g.fillRect(px + TILE - 3, py, 2, TILE);
      if (top) {
        g.fillStyle = PAL.pipe;     g.fillRect(px - 2, py, TILE + 4, 6);
        g.fillStyle = PAL.pipeLite; g.fillRect(px, py + 1, 3, 4);
        g.fillStyle = PAL.pipeDark; g.fillRect(px - 2, py + 5, TILE + 4, 1);
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
  const gy = groundYAt(Math.floor(e.cx / TILE));
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

/* Planted along the route flying the old flag. Touch one and it changes over
   to the five-cross — the 2004 swap, done one pole at a time. */
class LevelFlag extends Entity {
  constructor(tx) {
    const base = groundYAt(tx);
    super(tx * TILE, base - 46, 18, 46);
    this.tx = tx; this.base = base; this.converted = false; this.pop = 0;
  }
  convert() {
    this.converted = true;
    this.pop = 0.5;
    game.score += 300;
    game.flagsConverted++;
    floatText(this.x + 9, this.y - 6, '+300', '#ffd85e');
    burst(this.x + 9, this.y + 6, 18,
          { colors: ['#d6263c', '#f4f4f4', '#ffd85e'], speed: 95, life: 0.8, size: 2 });
    shake = 3; Sfx.gate();
  }
}

function drawLevelFlags() {
  for (const f of game.flags) {
    const px = f.tx * TILE;
    const wave = Math.round(Math.sin(game.time * 2.5 + f.tx) * 1);
    // Brief upward kick as it changes over.
    const lift = f.pop > 0 ? -Math.round(Math.sin((0.5 - f.pop) / 0.5 * Math.PI) * 4) : 0;
    g.fillStyle = '#9aa0ad'; g.fillRect(px, f.base - 46, 2, 46);    // pole
    g.fillStyle = '#ffd85e'; g.fillRect(px - 1, f.base - 49, 4, 3); // finial
    const fy = f.base - 45 + wave + lift;
    if (f.converted) drawFlagNew(px + 2, fy, wave);
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
    else if (it.kind === 'powder') drawSprite(ART.powder, it);
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
      const flashing = e.fuse < 0.6 && Math.floor(e.t * 16) % 2 === 0;
      const x = Math.round(e.x), y = Math.round(e.y);
      g.fillStyle = flashing ? '#ff5a4a' : '#1c1c22'; g.fillRect(x, y + 1, 8, 7);
      g.fillStyle = '#3a3a46'; g.fillRect(x + 1, y + 2, 2, 2);
      g.fillStyle = '#8a6a3a'; g.fillRect(x + 5, y - 2, 1, 3);
      g.fillStyle = Math.floor(e.t * 20) % 2 ? '#ffd85e' : '#ff8a5c'; g.fillRect(x + 5, y - 3, 1, 1);
    } else if (e instanceof Guard) {
      drawSprite(ART.l2guard, e, { tint: e.surge > 0 && Math.floor(game.time * 12) % 2 === 0 ? 'rgba(255,90,90,.45)' : null });
    } else if (e instanceof Sleepy) {
      const flashing = e.hitFlash > 0 && Math.floor(e.hitFlash * 24) % 2 === 0;
      drawSprite(ART.l2sleepy, e, {
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
      drawSprite(ART.l2svani, e, { tint: flashing ? 'rgba(255,255,255,.85)' : rage });
      if (e.phase === 'windup' && Math.floor(game.time * 14) % 2 === 0)
        drawTextCentered(g, '!', e.cx, e.y - 11, '#ff8a5c', 2);
      if (e.harmless && Math.floor(game.time * 8) % 2 === 0)
        drawTextCentered(g, 'HIT HIM', e.cx, e.y - 10, '#7ae07a', 1);
    } else if (e instanceof Bomber) {
      const flashing = e.hitFlash > 0 && Math.floor(e.hitFlash * 24) % 2 === 0;
      drawSprite(ART.l2bomb, e, { tint: flashing ? 'rgba(255,255,255,.9)' : null });
      if (e.taunt > 0) drawTextCentered(g, 'ARMOURED', e.cx, e.y - 11, '#ff8a5c', 1);
    } else if (e instanceof Dardubala) {
      if (e.foxed) { drawFox(e.cx - 11, e.y + 8, -1, game.time); continue; }
      const flashing = e.hitFlash > 0 && Math.floor(e.hitFlash * 24) % 2 === 0;
      const open = e.harmless && Math.floor(game.time * 10) % 2 === 0;
      drawSprite(ART.l2dard, e, {
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
    drawSprite(ART.hero, p, { squash: sq, tint });

    const dw = Math.round(ART.hero.w / sq), dh = Math.round(ART.hero.h * sq);
    drawMiniRose(p.face > 0 ? p.cx + dw * 0.26 : p.cx - dw * 0.26 - 4,
                 p.bottom - dh * 0.54);

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

function drawHeart(x, y, full) {
  g.fillStyle = full ? '#e8434f' : '#3a3f4a';
  g.fillRect(x + 1, y, 2, 1); g.fillRect(x + 5, y, 2, 1);
  g.fillRect(x, y + 1, 8, 3);
  g.fillRect(x + 1, y + 4, 6, 1);
  g.fillRect(x + 2, y + 5, 4, 1);
  g.fillRect(x + 3, y + 6, 2, 1);
  if (full) { g.fillStyle = '#ff8f9c'; g.fillRect(x + 1, y + 1, 2, 1); }
}

function drawHud() {
  if (!showHud) return;
  for (let i = 0; i < 3; i++) drawHeart(8 + i * 11, 8, i < game.player.hp);
  drawCoinIcon(9, 20);
  drawText(g, `*${String(game.player.coins).padStart(2, '0')}`, 18, 19, '#ffd85e', 1);
  drawText(g, String(game.score).padStart(6, '0'), 52, 19, '#fff', 1);
  if (game.player.combo > 1)
    drawText(g, `COMBO X${Math.min(game.player.combo, 8)}`, 8, 30, '#ff5ec4', 1);
  if (Music.muted) drawText(g, 'MUSIC OFF', VIEW_W - 62, 8, '#8890a4', 1);
  /* Stacked, not overlaid. Both timers used to draw a label at y=40/41, so
     holding powder and khachapuri at once printed them on top of each other. */
  let ty = 40;
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
  if (game.player.invincible > 0)
    timerBar('ACHARULI', game.player.invincible / KHACHAPURI_TIME, '#ffd85e', '#fff2c0', '#6a5a20');
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

function drawTitle() {
  g.fillStyle = 'rgba(8,10,20,.62)'; g.fillRect(0, 0, VIEW_W, VIEW_H);
  const bounce = Math.round(Math.sin(game.time * 2.4) * 2);
  // two lines at scale 3: the whole name on one line is 411px against a 320 buffer
  drawTextCentered(g, 'GAATAVISUPLE', VIEW_W / 2, 14 + bounce, '#ffd85e', 3);
  drawTextCentered(g, 'SAKARTVELO', VIEW_W / 2, 38 + bounce, '#ffd85e', 3);
  drawTextCentered(g, `ACT 1 - ${LEVELS[0].subtitle}`, VIEW_W / 2, 62, '#7ec8f0', 1);
  drawScoreboard(VIEW_W / 2, 76);
  if (Math.floor(game.time * 2) % 2 === 0)
    drawTextCentered(g, 'PRESS SPACE TO START', VIEW_W / 2, 132, '#fff', 1);
  drawTextCentered(g, 'ARROWS MOVE   SHIFT RUN   H HUD   C CRT', VIEW_W / 2, 150, '#8890a4', 1);
  drawTextCentered(g, 'M MUSIC   N SOUND   R RESTART', VIEW_W / 2, 162, '#8890a4', 1);
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
    lines.forEach(([txt, col], i) => drawTextCentered(g, txt, VIEW_W / 2, 44 + i * 24, col, 2));
    drawTextCentered(g, `SCORE ${game.score}`, VIEW_W / 2, 104, '#fff', 1);
    if (game.endT > 1.4 && Math.floor(game.endT * 2) % 2 === 0)
      drawTextCentered(g, game.advance ? 'PRESS SPACE TO CONTINUE' : 'PRESS R TO RESTART',
                       VIEW_W / 2, 128, '#8890a4', 1);
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
  validateLevel();
  const missing = Object.keys(SPRITES).filter(k => ART[k].isPlaceholder);
  if (missing.length) console.info('placeholders in use:', missing.join(', '));
  reset(true);
  document.getElementById('boot').classList.add('hidden');
  requestAnimationFrame(frame);
})();
