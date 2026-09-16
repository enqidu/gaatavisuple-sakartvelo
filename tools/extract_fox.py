"""Key the two Edika foxes out of their source art.

The run fox (fox1.png) sits on a two-tone grey CHECKERBOARD - 216 light, 126
dark - and the fox's own tail shades through 213-222.  A colour key cannot
separate those: the mid-tail is literally the background's light grey, so a
flood that is loose enough to cross the checker seams eats a hole through the
tail.  That is what the shipped sprite was: an outline with the middle gone.

So key on STRUCTURE instead of colour.  The fox is drawn with a black outline
all the way round; the only thing between its interior and the background is a
hairline gap or two in that outline.  Close the outline by 2px, flood the
background in from the border, and everything the flood cannot reach IS the
fox - whatever colour it happens to be.  Measured: the silhouette jumps from
6955px (leaking) to 18647px (sealed) at radius 2 and is then stable out to
radius 6, which is how we know 2 is enough and not too much.
"""
from PIL import Image
import numpy as np
from collections import deque

def dilate(m, k):
    r = m.copy()
    for _ in range(k):
        n = r.copy()
        n[1:, :] |= r[:-1, :]; n[:-1, :] |= r[1:, :]
        n[:, 1:] |= r[:, :-1]; n[:, :-1] |= r[:, 1:]
        r = n
    return r

def close(m, k):
    return ~dilate(~dilate(m, k), k)

def flood_from_border(passable):
    H, W = passable.shape
    bg = np.zeros((H, W), bool); q = deque()
    for x in range(W):
        for y in (0, H - 1):
            if passable[y, x] and not bg[y, x]: bg[y, x] = True; q.append((y, x))
    for y in range(H):
        for x in (0, W - 1):
            if passable[y, x] and not bg[y, x]: bg[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and passable[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True; q.append((ny, nx))
    return bg

def components(fg):
    H, W = fg.shape
    lab = -np.ones((H, W), int); comps = []
    for sy in range(H):
        for sx in range(W):
            if fg[sy, sx] and lab[sy, sx] < 0:
                cid = len(comps); cells = []; dq = deque([(sy, sx)]); lab[sy, sx] = cid
                while dq:
                    y, x = dq.popleft(); cells.append((y, x))
                    for dy, dx in ((1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1)):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < H and 0 <= nx < W and fg[ny, nx] and lab[ny, nx] < 0:
                            lab[ny, nx] = cid; dq.append((ny, nx))
                comps.append(cells)
    return comps

def keep_main(fg, gap):
    """One fox, not the scenery behind it: keep the biggest blob and anything
    touching within `gap` px, drop the rest."""
    comps = sorted(components(fg), key=len, reverse=True)
    if not comps: return 0
    keep = np.zeros(fg.shape, bool)
    for y, x in comps[0]: keep[y, x] = True
    reach = dilate(keep, gap)
    dropped = 0
    for c in comps[1:]:
        if any(reach[y, x] for y, x in c):
            for y, x in c: keep[y, x] = True
        else:
            dropped += 1
    fg[:] = keep
    return dropped

def build(src, out, target_h, gap, key='outline', outline_below=95, seal=2, sat=26, mirror=False):
    im = Image.open(src).convert('RGB')
    a = np.asarray(im).astype(int)
    if key == 'outline':
        # checkerboard behind a grey fox: only the closed black outline separates them
        v = a.mean(axis=2)
        passable = ~close(v < outline_below, seal)
    else:
        # grass and dirt behind a grey fox: SATURATION separates them cleanly, and
        # the outline trick would fail here - the scenery has black outlines too and
        # sealing them welds the whole meadow onto the fox.
        passable = (a.max(axis=2) - a.min(axis=2)) >= sat
    fg = ~flood_from_border(passable)
    dropped = keep_main(fg, gap)

    rgba = np.zeros(a.shape[:2] + (4,), np.uint8)
    rgba[..., :3] = a
    rgba[..., 3] = np.where(fg, 255, 0)
    ys, xs = np.nonzero(fg)
    crop = Image.fromarray(rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1])
    if mirror: crop = crop.transpose(Image.FLIP_LEFT_RIGHT)   # authored facing left; every sprite here faces right

    cw, ch = crop.size
    tw = max(1, round(cw * target_h / ch))

    # Resize with the alpha PREMULTIPLIED, or LANCZOS drags the background's own
    # RGB - grass green, checker grey - into every edge pixel and the sprite
    # comes out haloed.
    c = np.asarray(crop).astype(float)
    a8 = c[..., 3:4] / 255.0
    pre = np.concatenate([c[..., :3] * a8, c[..., 3:4]], axis=2)
    small = np.asarray(Image.fromarray(pre.astype(np.uint8))
                       .resize((tw, target_h), Image.LANCZOS)).astype(float)
    al = small[..., 3:4]
    rgb = np.where(al > 0, small[..., :3] / np.maximum(al / 255.0, 1e-6), 0)
    final = np.concatenate([np.clip(rgb, 0, 255), al], axis=2).astype(np.uint8)
    edge = final[..., 3].astype(int)
    final[..., 3] = np.where(edge < 96, 0, np.where(edge > 176, 255, edge)).astype(np.uint8)
    Image.fromarray(final).save(out)
    print(f'{out}: {a.shape[1]}x{a.shape[0]} -> crop {cw}x{ch} -> {tw}x{target_h}  ({int(fg.sum())} px kept, {dropped} blobs dropped)')

build('assets/level 3 (parliament)/fox1.png',         'assets/l3_fox_run.png', 30,
      key='outline', outline_below=95, seal=2, gap=8, mirror=True)
build('assets/level 3 (parliament)/fox2-sitting.png', 'assets/l3_fox_sit.png', 30,
      key='saturation', sat=26, gap=5)
