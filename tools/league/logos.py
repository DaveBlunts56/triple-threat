"""Cuts the league's twelve logos out of the logo grid picture (four across, three down, in the teams file's order)
and writes each to assets/logos/<team key>.png: its white background made clear, working in from the edges only (so
white inside a logo stays), trimmed, and centred on a square. Usage:
    python3 -I tools/league/logos.py ["<grid picture>"]
"""
import os, sys
from collections import deque
from PIL import Image

KEYS = ['nye', 'bsh', 'phi', 'mia', 'det', 'orl', 'lar', 'okc', 'gsg', 'sas', 'den', 'dal']
SIZE, MARGIN, NEAR = 512, 0.04, 34   # the square's pixels; clear room round the logo; how near white counts as background
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'assets', 'logos')


def background(img):
    """The picture with the white reached from its edges made clear (a flood fill through near-white pixels)."""
    w, h = img.size
    px = img.load()
    whiteish = lambda c: c[0] >= 255 - NEAR and c[1] >= 255 - NEAR and c[2] >= 255 - NEAR
    seen = bytearray(w * h)
    todo = deque()
    for x in range(w):
        todo.append((x, 0)); todo.append((x, h - 1))
    for y in range(h):
        todo.append((0, y)); todo.append((w - 1, y))
    while todo:
        x, y = todo.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y * w + x]:
            continue
        seen[y * w + x] = 1
        c = px[x, y]
        if not whiteish(c):
            continue
        px[x, y] = (c[0], c[1], c[2], 0)
        todo.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return img


def slivers(img):
    """The picture without the small pieces at its edges: bits of the neighbouring logos the cut caught."""
    w, h = img.size
    px = img.load()
    seen = bytearray(w * h)
    pieces = []
    for sy in range(h):
        for sx in range(w):
            if seen[sy * w + sx] or px[sx, sy][3] == 0:
                continue
            piece, edge, todo = [], False, deque([(sx, sy)])
            seen[sy * w + sx] = 1
            while todo:
                x, y = todo.popleft()
                piece.append((x, y))
                edge = edge or x in (0, w - 1) or y in (0, h - 1)
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and px[nx, ny][3] > 0:
                        seen[ny * w + nx] = 1
                        todo.append((nx, ny))
            pieces.append((piece, edge))
    total = sum(len(p) for p, _ in pieces)
    for piece, edge in pieces:
        if edge and len(piece) < 0.03 * total:
            for x, y in piece:
                c = px[x, y]
                px[x, y] = (c[0], c[1], c[2], 0)
    return img


def main(grid):
    sheet = Image.open(grid).convert('RGBA')
    cw, ch = sheet.width / 4, sheet.height / 3
    os.makedirs(OUT, exist_ok=True)
    for i, key in enumerate(KEYS):
        col, row = i % 4, i // 4
        cell = sheet.crop((round(col * cw), round(row * ch), round((col + 1) * cw), round((row + 1) * ch)))
        cell = slivers(background(cell))
        box = cell.getbbox()
        logo = cell.crop(box)
        side = round(max(logo.size) * (1 + 2 * MARGIN))
        square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        square.paste(logo, ((side - logo.width) // 2, (side - logo.height) // 2), logo)
        square.resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(OUT, f'{key}.png'), optimize=True)
        print(key, logo.size)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/Documents/Triple-Threat_expansion-teams/NBA-Inspired Team Logo Grid.png'))
