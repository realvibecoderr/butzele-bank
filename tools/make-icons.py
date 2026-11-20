"""Baut die App-Icons aus dem Pixel-Kopf (tools/icon-head.json, exportiert aus tools/dog-lab.html).
Aufruf: python3 tools/make-icons.py"""
import json, os, struct, zlib

HERE = os.path.dirname(os.path.abspath(__file__))
SPRITE = json.load(open(os.path.join(HERE, 'icon-head.json')))
PAL = {k: tuple(map(int, v.split(','))) for k, v in SPRITE['pal'].items()}
TOP, BOTTOM = (0xFF, 0xD9, 0x8A), (0xF6, 0xA9, 0x6B)

def png(path, w, h, rows):
    raw = b''.join(b'\x00' + bytes(r) for r in rows)
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) \
        + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    open(path, 'wb').write(data)

def icon(size, out):
    scale = int(size * 0.86 // 32)
    dw = 32 * scale
    x0 = (size - dw) // 2
    y0 = size - dw + 2 * scale
    rows = []
    for y in range(size):
        t = y / (size - 1)
        bg = [round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3)]
        row = []
        sy = (y - y0) // scale if y >= y0 else -1
        for x in range(size):
            sx = (x - x0) // scale if x >= x0 else -1
            c = bg
            if 0 <= sx < 32 and 0 <= sy < 32:
                ch = SPRITE['rows'][sy][sx]
                if ch != '.':
                    c = PAL[ch]
            row.extend(c)
        rows.append(row)
    png(out, size, size, rows)

root = os.path.join(HERE, '..', 'icons')
for size, name in [(180, 'apple-touch-icon.png'), (192, 'icon-192.png'), (512, 'icon-512.png')]:
    icon(size, os.path.join(root, name))
print('ok')
