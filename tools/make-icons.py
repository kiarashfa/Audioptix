"""tools/make-icons.py

Generates every raster brand asset from the single vector mark in tools/mark.py:

  favicon/favicon.svg            vector, ink-centred on the rounded Noir tile
  favicon/favicon.ico            16 / 32 / 48 embedded
  favicon/apple-touch-icon.png   180x180, solid ground, ~10% padding
  favicon/icon-192.png           manifest icon, ~6% padding
  favicon/icon-512.png           manifest icon, ~6% padding
  src/og.png                     1200x630 link-preview banner
  src/og-github.png              1280x640 GitHub social preview, 40px safe margin

Run with `npm run icons`. Needs Pillow; display fonts are cached in
tools/.fontcache/ (gitignored) on first run.
"""

import os
import sys
import urllib.request
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mark import mark_polygon, mark_bbox, VIEW, CORNER_R, BG, FG  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tools", ".fontcache")

# Noir palette, straight from THEMES.noir in player.jsx.
C_BG = (10, 9, 7)
C_FG = (244, 237, 224)
C_ACCENT = (232, 200, 144)
C_BAR_TOP = (244, 237, 224)
C_BAR_BOTTOM = (122, 106, 79)

SS = 4  # supersampling factor

FONTS = {
    "title": ("cormorant-garamond-500-italic.ttf",
              "https://fonts.gstatic.com/s/cormorantgaramond/v21/"
              "co3smX5slCNuHLi8bLeY9MK7whWMhyjYrGFEsdtdc62E6zd5wDD-iNM5.ttf"),
    "mono": ("jetbrains-mono-400.ttf",
             "https://fonts.gstatic.com/s/jetbrainsmono/v24/"
             "tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKxTOlOQ.ttf"),
}


def font(kind, size):
    name, url = FONTS[kind]
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req) as r, open(path, "wb") as f:
            f.write(r.read())
    return ImageFont.truetype(path, size)


# --- the mark --------------------------------------------------------

def mark_fitted(box_w, box_h, cx, cy):
    """Mark polygon scaled to fit box_w x box_h and centred on its own ink at (cx, cy)."""
    x0, y0, x1, y1 = mark_bbox()
    iw, ih = x1 - x0, y1 - y0
    s = min(box_w / iw, box_h / ih)
    return [(cx + (x - (x0 + iw / 2)) * s, cy + (y - (y0 + ih / 2)) * s)
            for x, y in mark_polygon()]


def tile(size, pad_frac, radius_frac=None, bg=C_BG, fg=C_ACCENT):
    """A square icon: rounded (or square) ground with the ink-centred mark on top."""
    n = size * SS
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if radius_frac is None:
        d.rectangle([0, 0, n - 1, n - 1], fill=bg + (255,))
    else:
        d.rounded_rectangle([0, 0, n - 1, n - 1], radius=n * radius_frac, fill=bg + (255,))
    inner = n * (1 - 2 * pad_frac)
    d.polygon(mark_fitted(inner, inner, n / 2, n / 2), fill=fg + (255,))
    return img.resize((size, size), Image.LANCZOS)


def write_favicon_svg(path):
    """Vector twin of the PNG icons: same rounded tile, same ink-centred mark."""
    from mark import MARK_PATH
    x0, y0, x1, y1 = mark_bbox()
    dx = VIEW / 2 - (x0 + x1) / 2
    dy = VIEW / 2 - (y0 + y1) / 2
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VIEW:.0f} {VIEW:.0f}" '
        f'role="img" aria-label="AudiOptix">\n'
        f'  <rect width="{VIEW:.0f}" height="{VIEW:.0f}" rx="{CORNER_R:.0f}" fill="{BG}"/>\n'
        f'  <path transform="translate({dx:.2f} {dy:.2f})" d="{MARK_PATH}" fill="{FG}"/>\n'
        f'</svg>\n'
    )
    with open(path, "w", encoding="utf-8") as f:
        f.write(svg)


# --- social images ---------------------------------------------------

def glow(w, h, cx, cy, rx, ry, colour, peak=0.13):
    """Soft radial wash, matching the .ambient radial-gradient in the app."""
    step = max(2, int(min(w, h) / 24))
    sw, sh = max(2, w // step), max(2, h // step)
    layer = Image.new("L", (sw, sh), 0)
    px = layer.load()
    for y in range(sh):
        for x in range(sw):
            nx = (x / sw * w - cx) / rx
            ny = (y / sh * h - cy) / ry
            dist = (nx * nx + ny * ny) ** 0.5
            px[x, y] = 0 if dist >= 1 else int(255 * peak * (1 - dist) ** 2)
    return Image.new("RGB", (w, h), colour), layer.resize((w, h), Image.BICUBIC)


def spaced_text(draw, xy, text, fnt, fill, tracking=0.0, anchor_centre=False):
    """PIL has no letter-spacing, so advance per character. Returns the ink width."""
    widths = [draw.textlength(ch, font=fnt) for ch in text]
    total = sum(widths) + tracking * max(0, len(text) - 1)
    x, y = xy
    if anchor_centre:
        x -= total / 2
    for ch, wch in zip(text, widths):
        draw.text((x, y), ch, font=fnt, fill=fill)
        x += wch + tracking
    return total


def bars(draw, x, y, w, h, n, seed=7):
    """A row of spectrum bars in the visualizer's own gradient."""
    gap = w * 0.35 / (n - 1)
    bw = (w - gap * (n - 1)) / n
    v = seed
    for i in range(n):
        v = (v * 1103515245 + 12345) % 2147483648
        env = 0.30 + 0.70 * max(0.0, 1 - abs(i / (n - 1) - 0.42) * 1.7) ** 2
        bh = max(h * 0.06, h * env * (0.35 + 0.65 * ((v >> 8) % 1000) / 1000))
        t = 1 - bh / h
        col = tuple(round(C_BAR_TOP[k] + (C_BAR_BOTTOM[k] - C_BAR_TOP[k]) * t) for k in range(3))
        bx = x + i * (bw + gap)
        draw.rounded_rectangle([bx, y + h - bh, bx + bw, y + h],
                               radius=min(bw / 2, 4 * SS), fill=col)


def social(w, h, layout):
    """Compose a social card. Returns (image, ink_bbox) with ink measured for real."""
    W, H = w * SS, h * SS
    base = Image.new("RGB", (W, H), C_BG)
    gcol, gmask = glow(W, H, W * 0.5, H * (0.62 if layout == "og" else 0.58),
                       W * 0.62, H * 0.80, C_ACCENT)
    base.paste(gcol, (0, 0), gmask)

    # Ink layer: everything except the background wash, so the safe margin can be measured.
    ink = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(ink)
    title = "AudiOptix"
    tagline = "EVOLVING MUSIC VISUALIZER"

    if layout == "og":
        # Stacked, centred lockup.
        mark_h = H * 0.20
        mark_w = mark_h * 0.87
        f_title = font("title", int(H * 0.155))
        f_tag = font("mono", int(H * 0.036))
        tw = d.textlength(title, font=f_title)
        gap = W * 0.030
        left = (W - (mark_w + gap + tw)) / 2
        cy = H * 0.40
        d.polygon(mark_fitted(mark_w, mark_h, left + mark_w / 2, cy), fill=C_ACCENT + (255,))
        bb = f_title.getbbox(title)
        d.text((left + mark_w + gap, cy - (bb[1] + bb[3]) / 2), title,
               font=f_title, fill=C_FG + (255,))
        spaced_text(d, (W / 2, H * 0.575), tagline, f_tag,
                    C_ACCENT + (255,), tracking=H * 0.018, anchor_centre=True)
        bars(d, W * 0.22, H * 0.72, W * 0.56, H * 0.13, 34)
    else:
        # GitHub 2:1, recomposed as a horizontal lockup: mark left, text column right.
        margin = 40 * SS
        mark_h = H * 0.42
        mark_w = mark_h * 0.87
        mx = margin + W * 0.100
        cy = H * 0.46
        d.polygon(mark_fitted(mark_w, mark_h, mx + mark_w / 2, cy), fill=C_ACCENT + (255,))
        tx = mx + mark_w + W * 0.045
        f_title = font("title", int(H * 0.165))
        f_tag = font("mono", int(H * 0.038))
        bb = f_title.getbbox(title)
        d.text((tx, cy - H * 0.10 - (bb[1] + bb[3]) / 2), title, font=f_title, fill=C_FG + (255,))
        spaced_text(d, (tx, cy + H * 0.045), tagline, f_tag,
                    C_ACCENT + (255,), tracking=H * 0.019)
        bars(d, tx, cy + H * 0.17, W * 0.512, H * 0.11, 30)

    base = base.convert("RGBA")
    base.alpha_composite(ink)
    out = base.convert("RGB").resize((w, h), Image.LANCZOS)

    bbox = ink.getbbox()
    return out, (tuple(round(v / SS) for v in bbox) if bbox else None)


# --- main ------------------------------------------------------------

def main():
    os.makedirs(os.path.join(ROOT, "favicon"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "src"), exist_ok=True)

    write_favicon_svg(os.path.join(ROOT, "favicon", "favicon.svg"))
    print("favicon/favicon.svg")

    ico_sizes = [16, 32, 48]
    frames = [tile(s, 0.13, radius_frac=CORNER_R / VIEW) for s in ico_sizes]
    frames[0].save(os.path.join(ROOT, "favicon", "favicon.ico"), format="ICO",
                   sizes=[(s, s) for s in ico_sizes], append_images=frames[1:])
    print("favicon/favicon.ico  (16/32/48)")

    # iOS masks its own corners and renders transparency as black: solid ground, 10% padding.
    tile(180, 0.10, radius_frac=None).convert("RGB").save(
        os.path.join(ROOT, "favicon", "apple-touch-icon.png"))
    print("favicon/apple-touch-icon.png  180x180, solid ground, 10% padding")

    for s in (192, 512):
        tile(s, 0.06, radius_frac=CORNER_R / VIEW).save(
            os.path.join(ROOT, "favicon", f"icon-{s}.png"))
        print(f"favicon/icon-{s}.png  ~6% padding")

    og, _ = social(1200, 630, "og")
    og.save(os.path.join(ROOT, "src", "og.png"), optimize=True)
    print("src/og.png  1200x630")

    gh, bbox = social(1280, 640, "github")
    gh.save(os.path.join(ROOT, "src", "og-github.png"), optimize=True)
    left, top, right, bottom = bbox
    insets = (left, top, 1280 - right, 640 - bottom)
    print(f"src/og-github.png  1280x640  ink bbox={bbox}")
    print(f"  measured safe margins L/T/R/B = {insets}  (need >= 40)")
    if min(insets) < 40:
        raise SystemExit(f"FAIL: og-github.png violates the 40px safe margin: {insets}")
    print("  OK: all content inside the 40px safe margin")


if __name__ == "__main__":
    main()
