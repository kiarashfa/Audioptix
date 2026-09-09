"""tools/mark.py

The AudiOptix mark: the beamed eighth-note pair already used as the site's
inline SVG favicon. Kept in one place so favicon.svg, the PNG icon set and the
social images are all cut from the same geometry.

The source of truth is the SVG path below, taken verbatim from index.html.
`mark_polygon()` flattens it (including the two arcs that form the note heads)
into a point list any rasteriser can fill.
"""

import math

# Viewport is 32x32; the path is filled with FG on a BG tile with corner radius 6.
VIEW = 32.0
CORNER_R = 6.0
BG = "#0a0907"   # THEMES.noir.bg
FG = "#e8c890"   # THEMES.noir.accent

MARK_PATH = ("M19 7v12.2a4.3 4.3 0 1 1-2-3.6V10l-6 1.6v9.6"
             "a4.3 4.3 0 1 1-2-3.6V9l10-2.6z")


def _arc_points(p1, p2, rx, ry, large_arc, sweep, steps=96):
    """SVG endpoint-parameterised elliptical arc, flattened to points.

    Implements the F.6.5 / F.6.6 conversion from the SVG spec (x-rotation is
    always 0 here, so the rotation terms drop out)."""
    x1, y1 = p1
    x2, y2 = p2
    if rx == 0 or ry == 0:
        return [p2]

    dx2, dy2 = (x1 - x2) / 2.0, (y1 - y2) / 2.0

    # Scale the radii up if they are too small to span the two endpoints.
    lam = dx2 * dx2 / (rx * rx) + dy2 * dy2 / (ry * ry)
    if lam > 1:
        s = math.sqrt(lam)
        rx, ry = rx * s, ry * s

    num = rx * rx * ry * ry - rx * rx * dy2 * dy2 - ry * ry * dx2 * dx2
    den = rx * rx * dy2 * dy2 + ry * ry * dx2 * dx2
    coef = math.sqrt(max(0.0, num / den))
    if large_arc == sweep:
        coef = -coef
    cxp = coef * rx * dy2 / ry
    cyp = -coef * ry * dx2 / rx
    cx = cxp + (x1 + x2) / 2.0
    cy = cyp + (y1 + y2) / 2.0

    def angle(ux, uy, vx, vy):
        dot = ux * vx + uy * vy
        n = math.hypot(ux, uy) * math.hypot(vx, vy)
        a = math.acos(max(-1.0, min(1.0, dot / n)))
        return -a if (ux * vy - uy * vx) < 0 else a

    ux, uy = (dx2 - cxp) / rx, (dy2 - cyp) / ry
    vx, vy = (-dx2 - cxp) / rx, (-dy2 - cyp) / ry
    theta1 = angle(1.0, 0.0, ux, uy)
    dtheta = angle(ux, uy, vx, vy)
    if not sweep and dtheta > 0:
        dtheta -= 2 * math.pi
    elif sweep and dtheta < 0:
        dtheta += 2 * math.pi

    return [(cx + rx * math.cos(theta1 + dtheta * i / steps),
             cy + ry * math.sin(theta1 + dtheta * i / steps))
            for i in range(1, steps + 1)]


def mark_polygon(scale=1.0, offset=(0.0, 0.0), arc_steps=96):
    """The mark as a single filled polygon, in the 32x32 viewport scaled/offset."""
    ox, oy = offset
    # Transcribed from MARK_PATH. Absolute coordinates in the 32x32 viewport.
    pts = [(19.0, 7.0), (19.0, 19.2)]
    pts += _arc_points((19.0, 19.2), (17.0, 15.6), 4.3, 4.3, 1, 1, arc_steps)
    pts += [(17.0, 10.0), (11.0, 11.6), (11.0, 21.2)]
    pts += _arc_points((11.0, 21.2), (9.0, 17.6), 4.3, 4.3, 1, 1, arc_steps)
    pts += [(9.0, 9.0), (19.0, 6.4)]
    return [(x * scale + ox, y * scale + oy) for x, y in pts]


def mark_bbox():
    """Ink bounds of the mark inside the 32x32 viewport."""
    pts = mark_polygon()
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def mark_points_js(arc_steps=24):
    """The flattened polygon as a compact JS array, for MARK_POINTS in player.jsx.

    The runtime canvas favicon draws the same mark as favicon.svg and the PNG
    icons; this is how that point list is regenerated if the mark ever changes."""
    pts = [(19.0, 7.0), (19.0, 19.2)]
    pts += _arc_points((19.0, 19.2), (17.0, 15.6), 4.3, 4.3, 1, 1, arc_steps)
    pts += [(17.0, 10.0), (11.0, 11.6), (11.0, 21.2)]
    pts += _arc_points((11.0, 21.2), (9.0, 17.6), 4.3, 4.3, 1, 1, arc_steps)
    pts += [(9.0, 9.0), (19.0, 6.4)]
    flat = [round(v, 2) for xy in pts for v in xy]
    return "[" + ",".join(repr(v) for v in flat) + "]"


if __name__ == "__main__":
    import sys
    if "--points" in sys.argv:
        print(mark_points_js())
    else:
        x0, y0, x1, y1 = mark_bbox()
        print("mark ink bbox in 32x32 viewport:", tuple(round(v, 3) for v in (x0, y0, x1, y1)))
        print("MARK_INK for player.jsx: { x: %.2f, y: %.2f, w: %.2f, h: %.2f }"
              % (x0, y0, x1 - x0, y1 - y0))
