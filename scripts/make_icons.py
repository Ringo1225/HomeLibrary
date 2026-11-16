"""Generate simple book-spine PNG icons with no dependencies. Run: python3 scripts/make_icons.py"""
import struct, zlib, os

BG = (246, 241, 231)
SPINES = [  # (x0, x1, top, color) in a 0..1 unit square
    (0.20, 0.31, 0.24, (138, 59, 42)),
    (0.33, 0.42, 0.30, (63, 107, 69)),
    (0.44, 0.57, 0.20, (42, 37, 31)),
    (0.59, 0.67, 0.34, (154, 106, 18)),
]
SHELF = (0.16, 0.84, 0.76, 0.80, (122, 111, 98))
BOTTOM = 0.76

def pixel(u, v):
    x0, x1, y0, y1, c = SHELF
    if x0 <= u <= x1 and y0 <= v <= y1:
        return c
    for a, b, top, c in SPINES:
        if a <= u <= b and top <= v < BOTTOM:
            # a pale band near the top of each spine, like a label
            if top + 0.08 <= v <= top + 0.12:
                return tuple(min(255, int(ch + (255 - ch) * 0.55)) for ch in c)
            return c
    # leaning book
    if 0.69 <= v < BOTTOM:
        pass
    lu = u - (BOTTOM - v) * 0.28
    if 0.69 <= lu <= 0.78 and 0.30 <= v < BOTTOM:
        return (90, 120, 150)
    return BG

def png(size, path):
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            raw.extend(pixel((x + .5) / size, (y + .5) / size))
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
