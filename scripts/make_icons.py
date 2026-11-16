"""Generate the app icons (graphite background, book spines on a white ledge).
No dependencies. Run: python3 scripts/make_icons.py

Everything sits inside the central ~80% so Android's maskable crop and iOS's rounded corners never clip it.
"""
import math, os, struct, zlib

BG_TOP, BG_BOTTOM = (64, 64, 68), (30, 30, 32)          # --dark → --dark-2
LEDGE = (246, 246, 247)
LEDGE_SHADOW = (18, 18, 20)
BOTTOM = 0.700                                          # spines stand on this line
SPINES = [  # x0, x1, top, color  (unit square)
    (0.235, 0.330, 0.300, (232, 98, 58)),    # accent orange
    (0.343, 0.418, 0.372, (242, 242, 243)),  # paper white
    (0.431, 0.545, 0.262, (226, 166, 74)),   # amber
    (0.558, 0.628, 0.338, (79, 162, 122)),   # green
]
LEAN = dict(w=0.080, h=0.345, color=(138, 120, 216), pivot=(0.765, BOTTOM), angle=14)  # lavender, leaning left


def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def in_rrect(u, v, x0, y0, x1, y1, r):
    if not (x0 <= u <= x1 and y0 <= v <= y1):
        return False
    cx = min(max(u, x0 + r), x1 - r)
    cy = min(max(v, y0 + r), y1 - r)
    return (u - cx) ** 2 + (v - cy) ** 2 <= r * r


def spine_color(u, v, x0, x1, top, c):
    """Spine body with a light label band near the top and soft edge shading."""
    band = top + 0.045 <= v <= top + 0.062
    if band:
        return lerp(c, (30, 30, 32), 0.55) if sum(c) > 600 else lerp(c, (255, 255, 255), 0.55)
    t = (u - x0) / (x1 - x0)
    shade = 0.10 * (1 - t / 0.3) if t < 0.3 else (-0.12 * (t - 0.75) / 0.25 if t > 0.75 else 0)
    return lerp(c, (255, 255, 255), shade) if shade > 0 else lerp(c, (0, 0, 0), -shade)


def pixel(u, v):
    # ledge + its shadow line
    if in_rrect(u, v, 0.195, BOTTOM, 0.805, BOTTOM + 0.036, 0.012):
        return LEDGE
    if 0.205 <= u <= 0.795 and BOTTOM + 0.036 < v <= BOTTOM + 0.046:
        return lerp(lerp(BG_TOP, BG_BOTTOM, v), LEDGE_SHADOW, 0.6)
    for x0, x1, top, c in SPINES:
        if in_rrect(u, v, x0, top, x1, BOTTOM + 0.01, 0.014) and v <= BOTTOM:
            return spine_color(u, v, x0, x1, top, c)
    # leaning book: rotate the point into the book's own frame (pivot = its bottom-right corner)
    px, py = LEAN['pivot']
    a = math.radians(LEAN['angle'])
    du, dv = u - px, v - py
    lu = du * math.cos(a) - dv * math.sin(a)
    lv = du * math.sin(a) + dv * math.cos(a)
    if in_rrect(lu, lv, -LEAN['w'], -LEAN['h'], 0, 0.01, 0.014) and v <= BOTTOM:
        return spine_color(lu, lv, -LEAN['w'], 0, -LEAN['h'], LEAN['color'])
    return lerp(BG_TOP, BG_BOTTOM, v)


def png(size, path, ss=3):
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            acc = [0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    c = pixel((x + (sx + .5) / ss) / size, (y + (sy + .5) / ss) / size)
                    acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]
            raw.extend(int(round(ch / (ss * ss))) for ch in acc)

    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)) \
        + chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(data)


here = os.path.join(os.path.dirname(__file__), '..', 'icons')
for s, n in [(192, 'icon-192.png'), (512, 'icon-512.png'), (180, 'apple-touch-icon.png')]:
    png(s, os.path.join(here, n))
print('icons written')
