// player.jsx - AudiOptix (playlist, file picker, drag & drop, settings & about drawers)

const {
  useState,
  useRef,
  useEffect,
  useCallback
} = React;

// Pinned, not derived from git: CI checkouts are shallow, so `git log --reverse`
// there returns the newest commit and yields the wrong year. The first-commit
// year is immutable anyway.
const COPYRIGHT_START_YEAR = 2026;
const COPYRIGHT_YEARS = (() => {
  const now = new Date().getFullYear();
  return now > COPYRIGHT_START_YEAR ? `${COPYRIGHT_START_YEAR}-${now}` : `${COPYRIGHT_START_YEAR}`;
})();

// Bundled tracks live here, described by music/tracks.json.
const MUSIC_DIR = 'music/';
const TWEAK_DEFAULTS = {
  theme: "noir",
  barCount: 72,
  sensitivity: 1.4,
  smoothing: 0.78,
  mirror: true,
  barWidthPct: 65
};

// Drop-in replacement for the prototyping `useTweaks` hook: same call signature
// (`setTweak('key', val)` or `setTweak({ key: val, ... })`), just plain React
// state with no host-protocol wiring.
function useTweaks(defaults) {
  const [values, setValues] = React.useState(defaults);
  const setTweak = React.useCallback((keyOrEdits, val) => {
    const edits = typeof keyOrEdits === 'object' && keyOrEdits !== null ? keyOrEdits : {
      [keyOrEdits]: val
    };
    setValues(prev => ({
      ...prev,
      ...edits
    }));
  }, []);
  return [values, setTweak];
}
const THEMES = {
  noir: {
    name: "Noir",
    bg: "#0a0907",
    panel: "rgba(20,18,15,0.55)",
    fg: "#f4ede0",
    dim: "rgba(244,237,224,0.55)",
    faint: "rgba(244,237,224,0.18)",
    accent: "#e8c890",
    barTop: "#f4ede0",
    barBottom: "#7a6a4f",
    glow: "rgba(232,200,144,0.30)",
    titleFont: "'Cormorant Garamond', 'Times New Roman', serif",
    titleWeight: 500,
    titleItalic: true,
    metaFont: "'JetBrains Mono', ui-monospace, monospace",
    bodyFont: "'Inter Tight', system-ui, sans-serif"
  },
  brutalist: {
    name: "Editorial",
    bg: "#ededea",
    panel: "rgba(255,255,255,0.0)",
    fg: "#0c0c0c",
    dim: "rgba(12,12,12,0.55)",
    faint: "rgba(12,12,12,0.15)",
    accent: "#ff3b00",
    barTop: "#0c0c0c",
    barBottom: "#0c0c0c",
    glow: "rgba(255,59,0,0.0)",
    titleFont: "'Bodoni Moda', 'Times New Roman', serif",
    titleWeight: 700,
    titleItalic: false,
    metaFont: "'JetBrains Mono', ui-monospace, monospace",
    bodyFont: "'Inter Tight', system-ui, sans-serif"
  },
  retro: {
    name: "Hi-Fi",
    bg: "#1a1410",
    panel: "rgba(40,28,18,0.5)",
    fg: "#fbe2b3",
    dim: "rgba(251,226,179,0.55)",
    faint: "rgba(251,226,179,0.18)",
    accent: "#ffaa3b",
    barTop: "#ffd078",
    barBottom: "#c25a14",
    glow: "rgba(255,170,59,0.40)",
    titleFont: "'DM Serif Display', 'Times New Roman', serif",
    titleWeight: 400,
    titleItalic: false,
    metaFont: "'JetBrains Mono', ui-monospace, monospace",
    bodyFont: "'Inter Tight', system-ui, sans-serif"
  }
};
const fmtTime = s => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, '0')}`;
};
function hexToRgba(hex, alpha) {
  if (hex.startsWith('rgba')) return hex.replace(/rgba\(([^)]+),[^,)]+\)/, `rgba($1,${alpha})`);
  if (hex.startsWith('rgb')) return hex.replace('rgb', 'rgba').replace(')', `,${alpha})`);
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.substring(0, 2), 16)},${parseInt(h.substring(2, 4), 16)},${parseInt(h.substring(4, 6), 16)},${alpha})`;
}
function roundRect(ctx, x, y, w, h, r) {
  if (h <= 0) return;
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ──────────────────────────────────────────────────────────────────────
// Dynamic favicon: fixed palette, theme-independent.
// • When idle/paused: static eighth-note monogram on dark ground.
// • When playing: 5 frequency bars sampled from the shared analyser,
//   throttled to ~12 fps to keep the cost negligible.
const FAVICON = {
  size: 32,
  // canvas resolution (browsers display at 16, this gives HiDPI headroom)
  bg: '#0a0907',
  fg: '#e8c890',
  bars: 5,
  fps: 12
};

// The AudiOptix mark, flattened to a polygon in the 32x32 icon viewport.
// Generated from tools/mark.py, so the tab icon, favicon.svg and the PNG icon
// set are all cut from the same geometry.
const MARK_POINTS = [19.0, 7.0, 19.0, 19.2, 18.9, 20.14, 18.6, 21.04, 18.12, 21.85, 17.46, 22.53, 16.68, 23.05, 15.79, 23.39, 14.86, 23.53, 13.92, 23.46, 13.01, 23.19, 12.19, 22.72, 11.49, 22.09, 10.94, 21.32, 10.58, 20.45, 10.41, 19.52, 10.45, 18.58, 10.7, 17.66, 11.14, 16.83, 11.75, 16.11, 12.5, 15.54, 13.36, 15.15, 14.29, 14.95, 15.23, 14.97, 16.15, 15.19, 17.0, 15.6, 17.0, 10.0, 11.0, 11.6, 11.0, 21.2, 10.9, 22.14, 10.6, 23.04, 10.12, 23.85, 9.46, 24.53, 8.68, 25.05, 7.79, 25.39, 6.86, 25.53, 5.92, 25.46, 5.01, 25.19, 4.19, 24.72, 3.49, 24.09, 2.94, 23.32, 2.58, 22.45, 2.41, 21.52, 2.45, 20.58, 2.7, 19.66, 3.14, 18.83, 3.75, 18.11, 4.5, 17.54, 5.36, 17.15, 6.29, 16.95, 7.23, 16.97, 8.15, 17.19, 9.0, 17.6, 9.0, 9.0, 19.0, 6.4];
const MARK_INK = {
  x: 2.41,
  y: 6.4,
  w: 16.59,
  h: 19.13
};
function drawFaviconMonogram(ctx, s) {
  ctx.clearRect(0, 0, s, s);
  // Rounded background tile
  ctx.fillStyle = FAVICON.bg;
  roundRect(ctx, 0, 0, s, s, s * 0.18);
  ctx.fill();
  // Mark, ink-centred with ~13% padding to match favicon.ico
  const pad = 0.13,
    box = s * (1 - pad * 2);
  const k = Math.min(box / MARK_INK.w, box / MARK_INK.h);
  const ox = s / 2 - (MARK_INK.x + MARK_INK.w / 2) * k;
  const oy = s / 2 - (MARK_INK.y + MARK_INK.h / 2) * k;
  ctx.fillStyle = FAVICON.fg;
  ctx.beginPath();
  for (let i = 0; i < MARK_POINTS.length; i += 2) {
    const x = MARK_POINTS[i] * k + ox,
      y = MARK_POINTS[i + 1] * k + oy;
    if (i === 0) ctx.moveTo(x, y);else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}
function drawFaviconBars(ctx, s, levels) {
  ctx.clearRect(0, 0, s, s);
  ctx.fillStyle = FAVICON.bg;
  roundRect(ctx, 0, 0, s, s, s * 0.18);
  ctx.fill();
  ctx.fillStyle = FAVICON.fg;
  const N = levels.length;
  const pad = s * 0.16;
  const inner = s - pad * 2;
  const gap = inner * 0.08 / (N - 1);
  const barW = (inner - gap * (N - 1)) / N;
  const maxH = s - pad * 2;
  const baseY = s - pad;
  for (let i = 0; i < N; i++) {
    const h = Math.max(s * 0.06, levels[i] * maxH);
    const x = pad + i * (barW + gap);
    roundRect(ctx, x, baseY - h, barW, h, Math.min(barW / 2, s * 0.06));
    ctx.fill();
  }
}
function useFavicon(analyser, isPlaying) {
  const canvasRef = React.useRef(null);
  const smoothRef = React.useRef(null);
  const rafRef = React.useRef(null);
  const lastDrawRef = React.useRef(0);

  // Set up canvas once
  if (!canvasRef.current && typeof document !== 'undefined') {
    canvasRef.current = document.createElement('canvas');
    canvasRef.current.width = FAVICON.size;
    canvasRef.current.height = FAVICON.size;
    smoothRef.current = new Float32Array(FAVICON.bars);
  }
  const pushToTab = React.useCallback(() => {
    const link = document.getElementById('favicon');
    if (!link || !canvasRef.current) return;
    // PNG keeps the rounded corners crisp and is universally supported as a favicon
    link.type = 'image/png';
    link.href = canvasRef.current.toDataURL('image/png');
  }, []);
  React.useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const s = FAVICON.size;

    // Always reset to monogram when not playing or no analyser yet
    if (!isPlaying || !analyser) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      drawFaviconMonogram(ctx, s);
      pushToTab();
      return;
    }
    const data = new Uint8Array(analyser.frequencyBinCount);
    const usable = Math.floor(data.length * 0.78);
    const frameInterval = 1000 / FAVICON.fps;
    const loop = ts => {
      rafRef.current = requestAnimationFrame(loop);
      if (ts - lastDrawRef.current < frameInterval) return;
      lastDrawRef.current = ts;
      analyser.getByteFrequencyData(data);
      const N = FAVICON.bars;
      const levels = smoothRef.current;
      for (let i = 0; i < N; i++) {
        // Logarithmic frequency mapping, same shape as the main visualizer
        const idx = Math.floor(Math.pow(i / N, 1.6) * usable);
        const idx2 = Math.min(usable - 1, Math.floor(Math.pow((i + 1) / N, 1.6) * usable));
        let v = 0,
          c = 0;
        for (let k = idx; k <= idx2; k++) {
          v += data[k];
          c++;
        }
        v = c ? v / c : 0;
        let nv = Math.pow(v / 255 * 1.4, 0.85);
        if (nv > 1) nv = 1;
        // Asymmetric smoothing: rise fast, fall slow
        const prev = levels[i];
        levels[i] = nv > prev ? prev + (nv - prev) * 0.6 : prev + (nv - prev) * 0.25;
      }
      drawFaviconBars(ctx, s, levels);
      pushToTab();
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [analyser, isPlaying, pushToTab]);
}
function pictureToDataUrl(picture) {
  if (!picture) return null;
  const {
    data,
    format
  } = picture;
  const bytes = new Uint8Array(data);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `data:${format};base64,${btoa(bin)}`;
}

// Parse ID3 from a Blob, resolving to {title, artist, album, year, cover}
function readTags(blob) {
  return new Promise(resolve => {
    if (!window.jsmediatags) return resolve({});
    window.jsmediatags.read(blob, {
      onSuccess: tag => {
        const tags = tag.tags || {};
        const year = tags.year || tags.TYER || tags.TDRC || tags.TDRL && tags.TDRL.data || '';
        resolve({
          title: tags.title || null,
          artist: tags.artist || null,
          album: tags.album || null,
          year: String(year || '').slice(0, 4),
          cover: pictureToDataUrl(tags.picture)
        });
      },
      onError: () => resolve({})
    });
  });
}

// ──────────────────────────────────────────────────────────────────────
function Visualizer({
  analyser,
  theme,
  barCount,
  sensitivity,
  mirror,
  barWidthPct
}) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  useEffect(() => {
    if (!analyser || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(r.width * dpr));
      canvas.height = Math.max(1, Math.floor(r.height * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const smooth = new Float32Array(barCount);
    const draw = () => {
      analyser.getByteFrequencyData(data);
      const W = canvas.width,
        H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      const N = barCount;
      const usable = Math.floor(data.length * 0.78);
      const totalGap = W * (1 - barWidthPct / 100);
      const gap = totalGap / (N + 1);
      const barW = (W - gap * (N + 1)) / N;
      const baseY = mirror ? H / 2 : H;
      const maxBarH = mirror ? H * 0.46 : H * 0.92;
      const gradTop = ctx.createLinearGradient(0, baseY - maxBarH, 0, baseY);
      gradTop.addColorStop(0, theme.barTop);
      gradTop.addColorStop(1, theme.barBottom);
      for (let i = 0; i < N; i++) {
        const t = i / N;
        const idx = Math.floor(Math.pow(t, 1.6) * usable);
        const idx2 = Math.min(usable - 1, Math.floor(Math.pow((i + 1) / N, 1.6) * usable));
        let v = 0,
          c = 0;
        for (let k = idx; k <= idx2; k++) {
          v += data[k];
          c++;
        }
        v = c ? v / c : 0;
        let nv = v / 255 * sensitivity;
        nv = Math.pow(nv, 0.85);
        if (nv > 1) nv = 1;
        const prev = smooth[i] || 0;
        const sm = nv > prev ? prev + (nv - prev) * 0.55 : prev + (nv - prev) * 0.12;
        smooth[i] = sm;
        const h = sm * maxBarH;
        const x = gap + i * (barW + gap);
        const r = Math.min(barW / 2, 4 * dpr);
        ctx.fillStyle = gradTop;
        roundRect(ctx, x, baseY - h, barW, Math.max(2 * dpr, h), r);
        ctx.fill();
        if (mirror) {
          const gradBot = ctx.createLinearGradient(0, baseY, 0, baseY + maxBarH);
          gradBot.addColorStop(0, theme.barBottom);
          gradBot.addColorStop(1, hexToRgba(theme.barBottom, 0));
          ctx.fillStyle = gradBot;
          roundRect(ctx, x, baseY, barW, Math.max(2 * dpr, h * 0.85), r);
          ctx.fill();
        }
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [analyser, theme, barCount, sensitivity, mirror, barWidthPct]);
  return /*#__PURE__*/React.createElement("canvas", {
    ref: canvasRef,
    style: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      filter: `drop-shadow(0 0 16px ${theme.glow})`,
      pointerEvents: 'none'
    }
  });
}

// Decorative idle waveform shape, used for the top-right corner
function MiniWave({
  theme,
  animated
}) {
  const N = 24;
  return /*#__PURE__*/React.createElement("div", {
    className: "mini-wave",
    "aria-hidden": "true"
  }, Array.from({
    length: N
  }).map((_, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      background: theme.accent,
      opacity: 0.35 + i * 53 % 100 / 200,
      height: `${20 + Math.abs(Math.sin(i * 0.55 + i * 0.2)) * 70}%`,
      animationDelay: `${(i * 0.06).toFixed(2)}s`,
      animationPlayState: animated ? 'running' : 'paused'
    }
  })));
}
const Icon = {
  Play: ({
    size = 22
  }) => /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M7 5.5v13a1 1 0 0 0 1.55.83l10-6.5a1 1 0 0 0 0-1.66l-10-6.5A1 1 0 0 0 7 5.5z"
  })),
  Pause: ({
    size = 22
  }) => /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "6",
    y: "5",
    width: "4",
    height: "14",
    rx: "1"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14",
    y: "5",
    width: "4",
    height: "14",
    rx: "1"
  })),
  Prev: ({
    size = 18
  }) => /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M7 5h2v14H7zM20 5.5v13a1 1 0 0 1-1.55.83l-10-6.5a1 1 0 0 1 0-1.66l10-6.5A1 1 0 0 1 20 5.5z"
  })),
  Next: ({
    size = 18
  }) => /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M15 5h2v14h-2zM4 5.5v13a1 1 0 0 0 1.55.83l10-6.5a1 1 0 0 0 0-1.66l-10-6.5A1 1 0 0 0 4 5.5z"
  })),
  Shuffle: ({
    size = 16
  }) => /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M16 3h5v5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M4 20 21 3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M21 16v5h-5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m15 15 6 6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M4 4l5 5"
  })),
  Repeat: ({
    size = 16
  }) => /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "m17 2 4 4-4 4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3 11v-1a4 4 0 0 1 4-4h14"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m7 22-4-4 4-4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M21 13v1a4 4 0 0 1-4 4H3"
  })),
  Volume: ({
    size = 16,
    level = 1
  }) => /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("polygon", {
    points: "11 5 6 9 2 9 2 15 6 15 11 19 11 5",
    fill: "currentColor",
    stroke: "none"
  }), level > 0.05 && /*#__PURE__*/React.createElement("path", {
    d: "M15.54 8.46a5 5 0 0 1 0 7.07"
  }), level > 0.5 && /*#__PURE__*/React.createElement("path", {
    d: "M19.07 4.93a10 10 0 0 1 0 14.14"
  })),
  Gear: ({
    size = 18
  }) => /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
  })),
  Queue: ({
    size = 18
  }) => /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("line", {
    x1: "3",
    y1: "6",
    x2: "14",
    y2: "6"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "3",
    y1: "12",
    x2: "14",
    y2: "12"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "3",
    y1: "18",
    x2: "11",
    y2: "18"
  }), /*#__PURE__*/React.createElement("polygon", {
    points: "17,15 22,18 17,21",
    fill: "currentColor"
  })),
  Info: ({
    size = 18
  }) => /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 11v5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 8h.01"
  })),
  Spinner: ({
    size = 22
  }) => /*#__PURE__*/React.createElement("svg", {
    className: "spin",
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.2",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 3.2a8.8 8.8 0 1 0 8.8 8.8"
  })),
  Close: ({
    size = 16
  }) => /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M18 6 6 18M6 6l12 12"
  })),
  Plus: ({
    size = 14
  }) => /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 5v14M5 12h14"
  })),
  Trash: ({
    size = 13
  }) => /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 6h18"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
  }))
};

// ──────────────────────────────────────────────────────────────────────
// Slider used inside settings drawer
function Slider({
  label,
  value,
  min,
  max,
  step,
  unit = '',
  onChange,
  theme,
  format
}) {
  const display = format ? format(value) : value;
  const pct = (value - min) / (max - min) * 100;
  return /*#__PURE__*/React.createElement("div", {
    className: "set-row vert"
  }, /*#__PURE__*/React.createElement("div", {
    className: "slider-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "set-row-label",
    style: {
      fontFamily: theme.metaFont,
      color: theme.dim
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: theme.metaFont,
      fontSize: 11,
      color: theme.fg,
      fontVariantNumeric: 'tabular-nums'
    }
  }, display, unit)), /*#__PURE__*/React.createElement("div", {
    className: "slider-track",
    style: {
      background: theme.faint,
      ['--pct']: `${pct}%`,
      ['--fg']: theme.fg
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "range",
    min: min,
    max: max,
    step: step,
    value: value,
    onChange: e => onChange(Number(e.target.value))
  })));
}

// ──────────────────────────────────────────────────────────────────────
function SettingsDrawer({
  open,
  onClose,
  theme,
  t,
  setTweak
}) {
  return /*#__PURE__*/React.createElement("aside", {
    className: `side-panel right ${open ? 'side-open' : ''}`,
    style: {
      background: theme.panel,
      backdropFilter: theme.name === 'Editorial' ? 'none' : 'blur(24px) saturate(140%)',
      WebkitBackdropFilter: theme.name === 'Editorial' ? 'none' : 'blur(24px) saturate(140%)',
      border: theme.name === 'Editorial' ? `1.5px solid ${theme.fg}` : `0.5px solid ${theme.faint}`,
      borderRadius: theme.name === 'Editorial' ? 0 : 18,
      color: theme.fg
    }
  }, /*#__PURE__*/React.createElement("header", {
    className: "sp-hd"
  }, /*#__PURE__*/React.createElement("span", {
    className: "sp-eyebrow",
    style: {
      fontFamily: theme.metaFont,
      color: theme.dim
    }
  }, "Settings"), /*#__PURE__*/React.createElement("button", {
    className: "sp-x",
    onClick: onClose,
    style: {
      color: theme.dim
    }
  }, /*#__PURE__*/React.createElement(Icon.Close, null))), /*#__PURE__*/React.createElement("div", {
    className: "sp-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "set-group"
  }, /*#__PURE__*/React.createElement("div", {
    className: "set-label",
    style: {
      fontFamily: theme.metaFont,
      color: theme.dim
    }
  }, "Theme"), /*#__PURE__*/React.createElement("div", {
    className: "theme-grid"
  }, Object.entries(THEMES).map(([key, th]) => /*#__PURE__*/React.createElement("button", {
    key: key,
    className: `theme-swatch ${t.theme === key ? 'on' : ''}`,
    onClick: () => setTweak('theme', key),
    style: {
      background: th.bg,
      borderColor: t.theme === key ? theme.accent : theme.faint
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "ts-bars"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      background: th.barTop,
      height: '40%'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      background: th.barTop,
      height: '70%'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      background: th.barBottom,
      height: '55%'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      background: th.accent,
      height: '85%'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      background: th.barBottom,
      height: '50%'
    }
  })), /*#__PURE__*/React.createElement("span", {
    className: "ts-name",
    style: {
      color: th.fg,
      fontFamily: th.metaFont
    }
  }, th.name))))), /*#__PURE__*/React.createElement("div", {
    className: "set-group"
  }, /*#__PURE__*/React.createElement("div", {
    className: "set-label",
    style: {
      fontFamily: theme.metaFont,
      color: theme.dim
    }
  }, "Visualizer"), /*#__PURE__*/React.createElement(Slider, {
    label: "Bar count",
    value: t.barCount,
    min: 24,
    max: 192,
    step: 4,
    onChange: v => setTweak('barCount', v),
    theme: theme
  }), /*#__PURE__*/React.createElement(Slider, {
    label: "Sensitivity",
    value: t.sensitivity,
    min: 0.6,
    max: 2.5,
    step: 0.05,
    unit: "\xD7",
    onChange: v => setTweak('sensitivity', v),
    theme: theme,
    format: v => v.toFixed(2)
  }), /*#__PURE__*/React.createElement(Slider, {
    label: "Smoothing",
    value: t.smoothing,
    min: 0.4,
    max: 0.95,
    step: 0.01,
    onChange: v => setTweak('smoothing', v),
    theme: theme,
    format: v => v.toFixed(2)
  }), /*#__PURE__*/React.createElement(Slider, {
    label: "Bar width",
    value: t.barWidthPct,
    min: 20,
    max: 90,
    step: 1,
    unit: "%",
    onChange: v => setTweak('barWidthPct', v),
    theme: theme
  }), /*#__PURE__*/React.createElement("div", {
    className: "set-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "set-row-label",
    style: {
      fontFamily: theme.metaFont,
      color: theme.dim
    }
  }, "Mirror bars"), /*#__PURE__*/React.createElement("button", {
    className: `mini-toggle ${t.mirror ? 'on' : ''}`,
    onClick: () => setTweak('mirror', !t.mirror),
    style: {
      background: t.mirror ? theme.accent : theme.faint
    }
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      background: t.mirror ? theme.bg : theme.fg
    }
  }))))));
}

// ──────────────────────────────────────────────────────────────────────
function PlaylistDrawer({
  open,
  onClose,
  theme,
  tracks,
  currentIndex,
  onPick,
  onRemove,
  onAddFiles
}) {
  const fileRef = useRef(null);
  const folderRef = useRef(null);
  return /*#__PURE__*/React.createElement("aside", {
    className: `side-panel left ${open ? 'side-open' : ''}`,
    style: {
      background: theme.panel,
      backdropFilter: theme.name === 'Editorial' ? 'none' : 'blur(24px) saturate(140%)',
      WebkitBackdropFilter: theme.name === 'Editorial' ? 'none' : 'blur(24px) saturate(140%)',
      border: theme.name === 'Editorial' ? `1.5px solid ${theme.fg}` : `0.5px solid ${theme.faint}`,
      borderRadius: theme.name === 'Editorial' ? 0 : 18,
      color: theme.fg
    }
  }, /*#__PURE__*/React.createElement("header", {
    className: "sp-hd"
  }, /*#__PURE__*/React.createElement("span", {
    className: "sp-eyebrow",
    style: {
      fontFamily: theme.metaFont,
      color: theme.dim
    }
  }, "Queue \xB7 ", tracks.length), /*#__PURE__*/React.createElement("button", {
    className: "sp-x",
    onClick: onClose,
    style: {
      color: theme.dim
    }
  }, /*#__PURE__*/React.createElement(Icon.Close, null))), /*#__PURE__*/React.createElement("div", {
    className: "pl-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "pl-btn",
    onClick: () => fileRef.current?.click(),
    style: {
      borderColor: theme.faint,
      color: theme.fg,
      fontFamily: theme.metaFont
    }
  }, /*#__PURE__*/React.createElement(Icon.Plus, null), " Files"), /*#__PURE__*/React.createElement("button", {
    className: "pl-btn",
    onClick: () => folderRef.current?.click(),
    style: {
      borderColor: theme.faint,
      color: theme.fg,
      fontFamily: theme.metaFont
    }
  }, /*#__PURE__*/React.createElement(Icon.Plus, null), " Folder"), /*#__PURE__*/React.createElement("input", {
    ref: fileRef,
    type: "file",
    accept: "audio/mpeg,audio/mp3,audio/*,.mp3",
    multiple: true,
    style: {
      display: 'none'
    },
    onChange: e => onAddFiles(Array.from(e.target.files || []))
  }), /*#__PURE__*/React.createElement("input", {
    ref: folderRef,
    type: "file",
    webkitdirectory: "",
    directory: "",
    multiple: true,
    style: {
      display: 'none'
    },
    onChange: e => onAddFiles(Array.from(e.target.files || []).filter(f => /\.mp3$/i.test(f.name)))
  })), /*#__PURE__*/React.createElement("div", {
    className: "pl-list"
  }, tracks.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "pl-empty",
    style: {
      color: theme.dim,
      fontFamily: theme.metaFont
    }
  }, "No tracks loaded.", /*#__PURE__*/React.createElement("br", null), "Drop MP3s anywhere, or use Files / Folder."), tracks.map((tr, i) => /*#__PURE__*/React.createElement("div", {
    key: tr.id,
    className: `pl-item ${i === currentIndex ? 'on' : ''}`,
    onClick: () => onPick(i),
    style: {
      background: i === currentIndex ? hexToRgba(theme.accent, 0.10) : 'transparent',
      borderColor: i === currentIndex ? hexToRgba(theme.accent, 0.30) : 'transparent'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "pl-num",
    style: {
      fontFamily: theme.metaFont,
      color: i === currentIndex ? theme.accent : theme.dim
    }
  }, String(i + 1).padStart(2, '0')), /*#__PURE__*/React.createElement("div", {
    className: "pl-thumb",
    style: {
      background: theme.faint
    }
  }, tr.cover ? /*#__PURE__*/React.createElement("img", {
    src: tr.cover,
    alt: ""
  }) : /*#__PURE__*/React.createElement("span", {
    style: {
      color: theme.dim,
      fontFamily: theme.metaFont,
      fontSize: 9
    }
  }, "\u266A")), /*#__PURE__*/React.createElement("div", {
    className: "pl-info"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pl-title",
    style: {
      color: i === currentIndex ? theme.accent : theme.fg
    }
  }, tr.title), /*#__PURE__*/React.createElement("div", {
    className: "pl-sub",
    style: {
      fontFamily: theme.metaFont,
      color: theme.dim
    }
  }, tr.artist, tr.year ? ` · ${tr.year}` : '')), /*#__PURE__*/React.createElement("button", {
    className: "pl-remove",
    onClick: e => {
      e.stopPropagation();
      onRemove(i);
    },
    style: {
      color: theme.dim
    },
    title: "Remove"
  }, /*#__PURE__*/React.createElement(Icon.Trash, null))))));
}

// ──────────────────────────────────────────────────────────────────────
function AboutDrawer({
  open,
  onClose,
  theme
}) {
  const chipStyle = {
    fontFamily: theme.metaFont,
    color: theme.fg,
    borderColor: theme.faint
  };
  const supportChipStyle = {
    fontFamily: theme.metaFont,
    color: theme.accent,
    borderColor: hexToRgba(theme.accent, 0.35)
  };
  return /*#__PURE__*/React.createElement("aside", {
    className: `top-panel ${open ? 'top-open' : ''}`,
    style: {
      background: theme.panel,
      backdropFilter: theme.name === 'Editorial' ? 'none' : 'blur(24px) saturate(140%)',
      WebkitBackdropFilter: theme.name === 'Editorial' ? 'none' : 'blur(24px) saturate(140%)',
      border: theme.name === 'Editorial' ? `1.5px solid ${theme.fg}` : `0.5px solid ${theme.faint}`,
      borderRadius: theme.name === 'Editorial' ? 0 : 18,
      color: theme.fg
    }
  }, /*#__PURE__*/React.createElement("header", {
    className: "sp-hd"
  }, /*#__PURE__*/React.createElement("span", {
    className: "sp-eyebrow",
    style: {
      fontFamily: theme.metaFont,
      color: theme.dim
    }
  }, "About"), /*#__PURE__*/React.createElement("button", {
    className: "sp-x",
    onClick: onClose,
    style: {
      color: theme.dim
    }
  }, /*#__PURE__*/React.createElement(Icon.Close, null))), /*#__PURE__*/React.createElement("div", {
    className: "about-body"
  }, /*#__PURE__*/React.createElement("p", {
    className: "about-text",
    style: {
      color: theme.dim
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: theme.fg
    }
  }, "AudiOptix"), " is an evolving music visualizer. Drop in your MP3s and watch them move: pick a theme, tune the bars, and let it run. Everything happens right here in your browser: no uploads, no accounts, and your files never leave your device."), /*#__PURE__*/React.createElement("div", {
    className: "about-links"
  }, /*#__PURE__*/React.createElement("div", {
    className: "about-group"
  }, /*#__PURE__*/React.createElement("span", {
    className: "about-group-label",
    style: {
      fontFamily: theme.metaFont,
      color: theme.dim
    }
  }, "Contact"), /*#__PURE__*/React.createElement("div", {
    className: "about-group-row"
  }, /*#__PURE__*/React.createElement("a", {
    className: "about-chip",
    style: chipStyle,
    href: "https://kiarashfa.github.io/website/",
    target: "_blank",
    rel: "noopener"
  }, "Personal site"), /*#__PURE__*/React.createElement("a", {
    className: "about-chip",
    style: chipStyle,
    href: "mailto:kiarashfa@gmail.com"
  }, "Email"), /*#__PURE__*/React.createElement("a", {
    className: "about-chip",
    style: chipStyle,
    href: "https://github.com/kiarashfa",
    target: "_blank",
    rel: "noopener"
  }, "GitHub"))), /*#__PURE__*/React.createElement("div", {
    className: "about-group"
  }, /*#__PURE__*/React.createElement("span", {
    className: "about-group-label",
    style: {
      fontFamily: theme.metaFont,
      color: theme.dim
    }
  }, "Support"), /*#__PURE__*/React.createElement("div", {
    className: "about-group-row"
  }, /*#__PURE__*/React.createElement("a", {
    className: "about-chip",
    style: supportChipStyle,
    href: "https://www.paypal.com/donate/?hosted_button_id=S3BD5XFBMMWSJ",
    target: "_blank",
    rel: "noopener"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M15.607 4.653H8.941L6.645 19.251H1.82L4.862 0h7.995c3.754 0 6.375 2.294 6.473 5.513-.648-.478-2.105-.86-3.722-.86m6.57 5.546c0 3.41-3.01 6.853-6.958 6.853h-2.493L11.595 24H6.74l1.845-11.538h3.592c4.208 0 7.346-3.634 7.153-6.949a5.24 5.24 0 0 1 2.848 4.686M9.653 5.546h6.408c.907 0 1.942.222 2.363.541-.195 2.741-2.655 5.483-6.441 5.483H8.714Z"
  })), "Donate \xB7 PayPal"), /*#__PURE__*/React.createElement("a", {
    className: "about-chip",
    style: supportChipStyle,
    href: "https://www.buymeacoffee.com/kiarashfa",
    target: "_blank",
    rel: "noopener"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20.216 6.415l-.132-.666c-.119-.598-.388-1.163-1.001-1.379-.197-.069-.42-.098-.57-.241-.152-.143-.196-.366-.231-.572-.065-.378-.125-.756-.192-1.133-.057-.325-.102-.69-.25-.987-.195-.4-.597-.634-.996-.788a5.723 5.723 0 00-.626-.194c-1-.263-2.05-.36-3.077-.416a25.834 25.834 0 00-3.7.062c-.915.083-1.88.184-2.75.5-.318.116-.646.256-.888.501-.297.302-.393.77-.177 1.146.154.267.415.456.692.58.36.162.737.284 1.123.366 1.075.238 2.189.331 3.287.37 1.218.05 2.437.01 3.65-.118.299-.033.598-.073.896-.119.352-.054.578-.513.474-.834-.124-.383-.457-.531-.834-.473-.466.074-.96.108-1.382.146-1.177.08-2.358.082-3.536.006a22.228 22.228 0 01-1.157-.107c-.086-.01-.18-.025-.258-.036-.243-.036-.484-.08-.724-.13-.111-.027-.111-.185 0-.212h.005c.277-.06.557-.108.838-.147h.002c.131-.009.263-.032.394-.048a25.076 25.076 0 013.426-.12c.674.019 1.347.067 2.017.144l.228.031c.267.04.533.088.798.145.392.085.895.113 1.07.542.055.137.08.288.111.431l.319 1.484a.237.237 0 01-.199.284h-.003c-.037.006-.075.01-.112.015a36.704 36.704 0 01-4.743.295 37.059 37.059 0 01-4.699-.304c-.14-.017-.293-.042-.417-.06-.326-.048-.649-.108-.973-.161-.393-.065-.768-.032-1.123.161-.29.16-.527.404-.675.701-.154.316-.199.66-.267 1-.069.34-.176.707-.135 1.056.087.753.613 1.365 1.37 1.502a39.69 39.69 0 0011.343.376.483.483 0 01.535.53l-.071.697-1.018 9.907c-.041.41-.047.832-.125 1.237-.122.637-.553 1.028-1.182 1.171-.577.131-1.165.2-1.756.205-.656.004-1.31-.025-1.966-.022-.699.004-1.556-.06-2.095-.58-.475-.458-.54-1.174-.605-1.793l-.731-7.013-.322-3.094c-.037-.351-.286-.695-.678-.678-.336.015-.718.3-.678.679l.228 2.185.949 9.112c.147 1.344 1.174 2.068 2.446 2.272.742.12 1.503.144 2.257.156.966.016 1.942.053 2.892-.122 1.408-.258 2.465-1.198 2.616-2.657.34-3.332.683-6.663 1.024-9.995l.215-2.087a.484.484 0 01.39-.426c.402-.078.787-.212 1.074-.518.455-.488.546-1.124.385-1.766zm-1.478.772c-.145.137-.363.201-.578.233-2.416.359-4.866.54-7.308.46-1.748-.06-3.477-.254-5.207-.498-.17-.024-.353-.055-.47-.18-.22-.236-.111-.71-.054-.995.052-.26.152-.609.463-.646.484-.057 1.046.148 1.526.22.577.088 1.156.159 1.737.212 2.48.226 5.002.19 7.472-.14.45-.06.899-.13 1.345-.21.399-.072.84-.206 1.08.206.166.281.188.657.162.974a.544.544 0 01-.169.364zm-6.159 3.9c-.862.37-1.84.788-3.109.788a5.884 5.884 0 01-1.569-.217l.877 9.004c.065.78.717 1.38 1.5 1.38 0 0 1.243.065 1.658.065.447 0 1.786-.065 1.786-.065.783 0 1.434-.6 1.499-1.38l.94-9.95a3.996 3.996 0 00-1.322-.238c-.826 0-1.491.284-2.26.613z"
  })), "Buy Me a Coffee"))), /*#__PURE__*/React.createElement("div", {
    className: "about-group"
  }, /*#__PURE__*/React.createElement("span", {
    className: "about-group-label",
    style: {
      fontFamily: theme.metaFont,
      color: theme.dim
    }
  }, "Credits"), /*#__PURE__*/React.createElement("p", {
    className: "about-note",
    style: {
      fontFamily: theme.metaFont,
      color: theme.dim
    }
  }, "The bundled demo track was written and produced by Kiarash Farajzadehahary using Suno."), /*#__PURE__*/React.createElement("p", {
    className: "about-note",
    style: {
      fontFamily: theme.metaFont,
      color: theme.dim
    }
  }, "\xA9 ", COPYRIGHT_YEARS, " Kiarash Farajzadehahary. Released under the KFA Source-Available License 1.0.")))));
}

// ──────────────────────────────────────────────────────────────────────
let _trackId = 0;
function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const theme = THEMES[t.theme] || THEMES.noir;
  const audioRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const [analyser, setAnalyser] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubX, setScrubX] = useState(0);
  const [error, setError] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const current = currentIndex >= 0 && currentIndex < tracks.length ? tracks[currentIndex] : null;

  // Dynamic tab favicon: monogram when idle, animated bars when playing.
  useFavicon(analyser, isPlaying);
  useEffect(() => {
    if (analyserRef.current) analyserRef.current.smoothingTimeConstant = t.smoothing;
  }, [t.smoothing]);
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : volume;
  }, [volume, muted]);

  // One theme-color tag, kept in step with the resolved theme. A
  // prefers-color-scheme media variant would follow the OS instead of the theme
  // the user actually picked here.
  useEffect(() => {
    const tag = document.querySelector('meta[name="theme-color"]');
    if (tag) tag.setAttribute('content', theme.bg);
  }, [theme.bg]);

  // Build a track from a File/Blob
  const trackFromFile = useCallback(async (file, fallbackName) => {
    const tags = await readTags(file);
    const baseName = (file.name || fallbackName || 'Track').replace(/\.mp3$/i, '');
    const url = URL.createObjectURL(file);
    return {
      id: ++_trackId,
      url,
      bundled: false,
      coverChecked: true,
      title: tags.title || baseName,
      artist: tags.artist || 'Unknown Artist',
      album: tags.album || '',
      year: tags.year || '',
      cover: tags.cover || null
    };
  }, []);

  // Bundled tracks: read the small manifest in music/ and queue what it lists.
  // Nothing but the JSON is downloaded here. The <audio> element is
  // preload="metadata", so a track's audio is only fetched once it is played,
  // and adding more files to music/tracks.json costs nothing on first paint.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(`${MUSIC_DIR}tracks.json`);
        if (!resp.ok) return;
        const data = await resp.json();
        const bundled = (data.tracks || []).map(entry => ({
          id: ++_trackId,
          url: MUSIC_DIR + entry.file,
          bundled: true,
          coverChecked: false,
          title: entry.title || entry.file.replace(/\.mp3$/i, ''),
          artist: entry.artist || 'Unknown Artist',
          album: entry.album || '',
          year: entry.year || '',
          cover: null
        }));
        if (cancelled || !bundled.length) return;
        setTracks(prev => prev.length ? prev : bundled);
        setCurrentIndex(idx => idx === -1 ? 0 : idx);
      } catch (e) {
        // No manifest, or it does not parse. The queue simply starts empty.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Cover art for a bundled track is pulled only once that track is selected.
  // jsmediatags reads the ID3 header over HTTP range requests, so this costs a
  // few tens of KB rather than the whole file.
  useEffect(() => {
    if (!current || !current.bundled || current.coverChecked) return;
    let cancelled = false;
    const id = current.id;
    const settle = patch => {
      if (cancelled) return;
      setTracks(ts => ts.map(tr => tr.id === id ? {
        ...tr,
        ...patch,
        coverChecked: true
      } : tr));
    };
    if (!window.jsmediatags) {
      settle({});
      return;
    }
    window.jsmediatags.read(new URL(current.url, document.baseURI).href, {
      onSuccess: tag => settle({
        cover: pictureToDataUrl(tag.tags && tag.tags.picture)
      }),
      onError: () => settle({})
    });
    return () => {
      cancelled = true;
    };
  }, [current?.id, current?.bundled, current?.coverChecked]);
  const addFiles = useCallback(async files => {
    if (!files || !files.length) return;
    const audioFiles = files.filter(f => /\.mp3$/i.test(f.name) || /audio\//.test(f.type));
    if (!audioFiles.length) return;
    const newTracks = [];
    for (const f of audioFiles) {
      try {
        newTracks.push(await trackFromFile(f));
      } catch (e) {/* skip */}
    }
    setTracks(prev => {
      const next = [...prev, ...newTracks];
      // If nothing was loaded, start playback at first new
      if (prev.length === 0 && next.length > 0) setCurrentIndex(0);
      return next;
    });
  }, [trackFromFile]);
  const removeTrack = useCallback(i => {
    setTracks(prev => {
      const gone = prev[i];
      if (gone && !gone.bundled) URL.revokeObjectURL(gone.url);
      const next = prev.filter((_, j) => j !== i);
      if (next.length === 0) {
        setCurrentIndex(-1);
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.removeAttribute('src');
          audioRef.current.load();
        }
        setIsPlaying(false);
      } else if (i === currentIndex) {
        setCurrentIndex(Math.min(i, next.length - 1));
      } else if (i < currentIndex) {
        setCurrentIndex(currentIndex - 1);
      }
      return next;
    });
  }, [currentIndex]);
  const pickTrack = useCallback(i => {
    setCurrentIndex(i);
  }, []);

  // Load src whenever currentIndex/tracks change
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (current) {
      a.src = current.url;
      a.load();
      // Auto-play if previously playing or user has interacted
      if (audioCtxRef.current) {
        a.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    }
  }, [current?.url]);
  const ensureAudioGraph = useCallback(() => {
    if (audioCtxRef.current) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const src = ctx.createMediaElementSource(audioRef.current);
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    an.smoothingTimeConstant = t.smoothing;
    src.connect(an);
    an.connect(ctx.destination);
    audioCtxRef.current = ctx;
    sourceRef.current = src;
    analyserRef.current = an;
    setAnalyser(an);
  }, [t.smoothing]);
  const togglePlay = async () => {
    const a = audioRef.current;
    if (!a || !current) return;
    ensureAudioGraph();
    if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume();
    if (a.paused) {
      // HAVE_FUTURE_DATA or better means it can start without a stall.
      if (a.readyState < 3) setBuffering(true);
      try {
        await a.play();
        setIsPlaying(true);
      } catch (e) {
        setBuffering(false);
        setError('Click play to start (browser autoplay policy)');
      }
    } else {
      a.pause();
      setIsPlaying(false);
    }
  };
  const goNext = useCallback(() => {
    if (tracks.length === 0) return;
    if (shuffle && tracks.length > 1) {
      let i = currentIndex;
      while (i === currentIndex) i = Math.floor(Math.random() * tracks.length);
      setCurrentIndex(i);
    } else {
      setCurrentIndex((currentIndex + 1) % tracks.length);
    }
  }, [tracks.length, currentIndex, shuffle]);
  const goPrev = useCallback(() => {
    if (tracks.length === 0) return;
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      return;
    }
    setCurrentIndex((currentIndex - 1 + tracks.length) % tracks.length);
  }, [tracks.length, currentIndex]);

  // Audio events
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onLoaded = () => setDuration(a.duration || 0);
    const onTime = () => {
      if (!scrubbing) setCurrentTime(a.currentTime);
    };
    const onEnd = () => {
      if (repeatMode === 2) {
        a.currentTime = 0;
        a.play();
        return;
      }
      if (currentIndex < tracks.length - 1 || repeatMode === 1 || shuffle) {
        goNext();
      } else {
        setIsPlaying(false);
        setCurrentTime(a.duration || 0);
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setBuffering(true);
    const onReady = () => setBuffering(false);
    a.addEventListener('loadedmetadata', onLoaded);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('ended', onEnd);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('waiting', onWaiting);
    a.addEventListener('stalled', onWaiting);
    a.addEventListener('playing', onReady);
    a.addEventListener('canplay', onReady);
    a.addEventListener('emptied', onReady);
    a.addEventListener('error', onReady);
    return () => {
      a.removeEventListener('loadedmetadata', onLoaded);
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('ended', onEnd);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('waiting', onWaiting);
      a.removeEventListener('stalled', onWaiting);
      a.removeEventListener('playing', onReady);
      a.removeEventListener('canplay', onReady);
      a.removeEventListener('emptied', onReady);
      a.removeEventListener('error', onReady);
    };
  }, [scrubbing, repeatMode, currentIndex, tracks.length, shuffle, goNext]);

  // Drag & drop on stage
  useEffect(() => {
    const onDragOver = e => {
      e.preventDefault();
      setDragOver(true);
    };
    const onDragLeave = e => {
      if (e.target === document.documentElement || !e.relatedTarget) setDragOver(false);
    };
    const onDrop = e => {
      e.preventDefault();
      setDragOver(false);
      const files = [];
      if (e.dataTransfer.items) {
        for (const it of e.dataTransfer.items) {
          if (it.kind === 'file') {
            const f = it.getAsFile();
            if (f) files.push(f);
          }
        }
      } else {
        for (const f of e.dataTransfer.files) files.push(f);
      }
      addFiles(files);
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [addFiles]);
  const seekRef = useRef(null);
  const beginScrub = e => {
    e.preventDefault();
    setScrubbing(true);
    moveScrub(e);
    const move = ev => moveScrub(ev);
    const up = ev => {
      moveScrub(ev, true);
      setScrubbing(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const moveScrub = (e, commit = false) => {
    const el = seekRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    setScrubX(pct);
    const newT = pct * (duration || 0);
    setCurrentTime(newT);
    if (commit && audioRef.current) audioRef.current.currentTime = newT;
  };
  const seekPct = duration > 0 ? scrubbing ? scrubX : currentTime / duration : 0;
  const volPct = (muted ? 0 : volume) * 100;
  const meta = current || {
    title: 'No track loaded',
    artist: 'Drop an .mp3 to begin',
    year: '',
    album: '',
    cover: null
  };
  const displayMeta = meta.year ? `${meta.artist} · ${meta.year}` : meta.artist;
  return /*#__PURE__*/React.createElement("div", {
    className: `stage ${dragOver ? 'dragging' : ''}`,
    style: {
      background: theme.bg,
      color: theme.fg,
      fontFamily: theme.bodyFont,
      ['--fg']: theme.fg,
      ['--dim']: theme.dim,
      ['--faint']: theme.faint,
      ['--accent']: theme.accent
    }
  }, /*#__PURE__*/React.createElement("audio", {
    ref: audioRef,
    preload: "metadata",
    crossOrigin: "anonymous"
  }), /*#__PURE__*/React.createElement("div", {
    className: "ambient",
    "aria-hidden": "true",
    style: {
      background: theme.name === 'Editorial' ? 'none' : `radial-gradient(60% 50% at 50% 60%, ${hexToRgba(theme.accent, 0.10)} 0%, transparent 70%)`
    }
  }), dragOver && /*#__PURE__*/React.createElement("div", {
    className: "drop-overlay",
    style: {
      background: hexToRgba(theme.bg, 0.7),
      color: theme.fg,
      border: `2px dashed ${theme.accent}`
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: theme.metaFont,
      letterSpacing: '0.18em'
    }
  }, "DROP MP3s TO ADD TO QUEUE")), /*#__PURE__*/React.createElement(AboutDrawer, {
    open: aboutOpen,
    onClose: () => setAboutOpen(false),
    theme: theme
  }), /*#__PURE__*/React.createElement("div", {
    className: "layout"
  }, /*#__PURE__*/React.createElement(PlaylistDrawer, {
    open: queueOpen,
    onClose: () => setQueueOpen(false),
    theme: theme,
    tracks: tracks,
    currentIndex: currentIndex,
    onPick: pickTrack,
    onRemove: removeTrack,
    onAddFiles: addFiles
  }), /*#__PURE__*/React.createElement("main", {
    className: "card",
    style: {
      background: theme.panel,
      backdropFilter: theme.name === 'Editorial' ? 'none' : 'blur(20px) saturate(140%)',
      WebkitBackdropFilter: theme.name === 'Editorial' ? 'none' : 'blur(20px) saturate(140%)',
      border: theme.name === 'Editorial' ? `1.5px solid ${theme.fg}` : `0.5px solid ${theme.faint}`,
      borderRadius: theme.name === 'Editorial' ? 0 : 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "card-toggles"
  }, /*#__PURE__*/React.createElement("button", {
    className: "icon-btn",
    onClick: () => setAboutOpen(s => !s),
    style: {
      color: aboutOpen ? theme.accent : theme.dim
    },
    "aria-label": "About",
    title: "About"
  }, /*#__PURE__*/React.createElement(Icon.Info, null)), /*#__PURE__*/React.createElement("button", {
    className: "icon-btn",
    onClick: () => setQueueOpen(s => !s),
    style: {
      color: queueOpen ? theme.accent : theme.dim
    },
    "aria-label": "Queue",
    title: "Queue"
  }, /*#__PURE__*/React.createElement(Icon.Queue, null)), /*#__PURE__*/React.createElement("button", {
    className: "icon-btn rotate",
    onClick: () => setSettingsOpen(s => !s),
    style: {
      color: settingsOpen ? theme.accent : theme.dim
    },
    "aria-label": "Settings",
    title: "Settings"
  }, /*#__PURE__*/React.createElement(Icon.Gear, null))), /*#__PURE__*/React.createElement("div", {
    className: "card-stack"
  }, /*#__PURE__*/React.createElement("div", {
    className: "card-top"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cover-wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cover",
    style: {
      borderRadius: theme.name === 'Editorial' ? 0 : 10,
      boxShadow: theme.name === 'Editorial' ? `8px 8px 0 ${theme.fg}` : `0 30px 60px -10px rgba(0,0,0,0.6), 0 0 0 0.5px ${theme.faint} inset`
    }
  }, meta.cover ? /*#__PURE__*/React.createElement("img", {
    src: meta.cover,
    alt: "",
    onError: () => current && setTracks(ts => ts.map((tr, j) => j === currentIndex ? {
      ...tr,
      cover: null
    } : tr))
  }) : /*#__PURE__*/React.createElement("div", {
    className: "cover-placeholder",
    style: {
      background: `repeating-linear-gradient(135deg, ${theme.faint} 0 8px, transparent 8px 16px)`,
      color: theme.dim
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: theme.metaFont,
      fontSize: 11,
      letterSpacing: '0.1em'
    }
  }, "[ COVER ART ]")))), /*#__PURE__*/React.createElement("div", {
    className: "info-top"
  }, /*#__PURE__*/React.createElement("div", {
    className: "np-tag",
    style: {
      fontFamily: theme.metaFont,
      color: theme.dim
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "np-dot",
    style: {
      background: isPlaying ? theme.accent : theme.faint
    }
  }), buffering ? 'LOADING' : isPlaying ? 'NOW PLAYING' : current ? 'PAUSED' : 'EMPTY QUEUE'), /*#__PURE__*/React.createElement("h1", {
    className: "title",
    style: {
      fontFamily: theme.titleFont,
      fontWeight: theme.titleWeight,
      fontStyle: theme.titleItalic ? 'italic' : 'normal',
      color: theme.fg
    }
  }, meta.title), /*#__PURE__*/React.createElement("div", {
    className: "meta-line",
    style: {
      fontFamily: theme.metaFont,
      color: theme.dim
    }
  }, displayMeta), meta.album && /*#__PURE__*/React.createElement("div", {
    className: "meta-album",
    style: {
      fontFamily: theme.titleFont,
      color: theme.dim,
      fontStyle: 'italic'
    }
  }, meta.album)), /*#__PURE__*/React.createElement("div", {
    className: "card-corner"
  }, /*#__PURE__*/React.createElement("div", {
    className: "track-index"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ti-num",
    style: {
      fontFamily: theme.titleFont,
      color: theme.fg
    }
  }, currentIndex >= 0 ? String(currentIndex + 1).padStart(2, '0') : '–'), /*#__PURE__*/React.createElement("span", {
    className: "ti-sep",
    style: {
      color: theme.faint
    }
  }, "/"), /*#__PURE__*/React.createElement("span", {
    className: "ti-total",
    style: {
      fontFamily: theme.metaFont,
      color: theme.dim
    }
  }, String(tracks.length).padStart(2, '0'))), /*#__PURE__*/React.createElement(MiniWave, {
    theme: theme,
    animated: isPlaying
  }), /*#__PURE__*/React.createElement("div", {
    className: "ti-label",
    style: {
      fontFamily: theme.metaFont,
      color: theme.dim
    }
  }, duration > 0 ? fmtTime(duration) : '0:00'))), /*#__PURE__*/React.createElement("div", {
    className: "viz-embed",
    style: {
      background: theme.name === 'Editorial' ? 'transparent' : `linear-gradient(180deg, ${hexToRgba(theme.bg, 0)} 0%, ${hexToRgba(theme.bg, 0.35)} 100%)`,
      borderTop: `0.5px solid ${theme.faint}`,
      borderBottom: `0.5px solid ${theme.faint}`
    }
  }, analyser ? /*#__PURE__*/React.createElement(Visualizer, {
    analyser: analyser,
    theme: theme,
    barCount: t.barCount,
    sensitivity: t.sensitivity,
    mirror: t.mirror,
    barWidthPct: t.barWidthPct
  }) : /*#__PURE__*/React.createElement("div", {
    className: "viz-idle"
  }, Array.from({
    length: 64
  }).map((_, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      height: `${10 + Math.sin(i * 0.7) * 8 + i % 3 * 4}%`,
      background: theme.barBottom,
      opacity: 0.35
    }
  })))), /*#__PURE__*/React.createElement("div", {
    className: "card-bottom"
  }, /*#__PURE__*/React.createElement("div", {
    className: "seek-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "time",
    style: {
      fontFamily: theme.metaFont,
      color: theme.dim
    }
  }, fmtTime(currentTime)), /*#__PURE__*/React.createElement("div", {
    ref: seekRef,
    className: `seek ${buffering ? 'buffering' : ''}`,
    onPointerDown: beginScrub,
    style: {
      background: theme.faint
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "seek-fill",
    style: {
      width: `${seekPct * 100}%`,
      background: theme.accent
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "seek-knob",
    style: {
      left: `${seekPct * 100}%`,
      background: theme.fg,
      boxShadow: `0 0 0 4px ${hexToRgba(theme.accent, 0.25)}`
    }
  })), /*#__PURE__*/React.createElement("span", {
    className: "time",
    style: {
      fontFamily: theme.metaFont,
      color: theme.dim
    }
  }, fmtTime((duration || 0) - currentTime))), /*#__PURE__*/React.createElement("div", {
    className: "controls"
  }, /*#__PURE__*/React.createElement("button", {
    className: `ctrl-tertiary ${shuffle ? 'on' : ''}`,
    onClick: () => setShuffle(s => !s),
    title: "Shuffle",
    style: {
      color: shuffle ? theme.accent : theme.dim
    }
  }, /*#__PURE__*/React.createElement(Icon.Shuffle, null)), /*#__PURE__*/React.createElement("button", {
    className: "ctrl-secondary",
    onClick: goPrev,
    title: "Previous",
    style: {
      color: theme.dim
    }
  }, /*#__PURE__*/React.createElement(Icon.Prev, null)), /*#__PURE__*/React.createElement("button", {
    className: "ctrl-primary",
    onClick: togglePlay,
    style: {
      background: theme.fg,
      color: theme.bg,
      borderRadius: theme.name === 'Editorial' ? 0 : 999
    },
    title: buffering ? 'Loading' : isPlaying ? 'Pause' : 'Play'
  }, buffering ? /*#__PURE__*/React.createElement(Icon.Spinner, null) : isPlaying ? /*#__PURE__*/React.createElement(Icon.Pause, null) : /*#__PURE__*/React.createElement(Icon.Play, null)), /*#__PURE__*/React.createElement("button", {
    className: "ctrl-secondary",
    onClick: goNext,
    title: "Next",
    style: {
      color: theme.dim
    }
  }, /*#__PURE__*/React.createElement(Icon.Next, null)), /*#__PURE__*/React.createElement("button", {
    className: `ctrl-tertiary ${repeatMode > 0 ? 'on' : ''}`,
    onClick: () => setRepeatMode(r => (r + 1) % 3),
    title: "Repeat",
    style: {
      color: repeatMode > 0 ? theme.accent : theme.dim,
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement(Icon.Repeat, null), repeatMode === 2 && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: -2,
      right: -2,
      fontSize: 8,
      fontWeight: 700,
      fontFamily: theme.metaFont,
      color: theme.accent
    }
  }, "1")), /*#__PURE__*/React.createElement("div", {
    className: "vol"
  }, /*#__PURE__*/React.createElement("button", {
    className: "ctrl-secondary",
    onClick: () => setMuted(m => !m),
    style: {
      color: theme.dim
    },
    title: "Mute"
  }, /*#__PURE__*/React.createElement(Icon.Volume, {
    level: muted ? 0 : volume
  })), /*#__PURE__*/React.createElement("div", {
    className: "vol-track",
    style: {
      background: theme.faint,
      ['--pct']: `${volPct}%`,
      ['--fg']: theme.fg
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "vol-fill"
  }), /*#__PURE__*/React.createElement("input", {
    type: "range",
    min: 0,
    max: 1,
    step: 0.01,
    value: muted ? 0 : volume,
    onChange: e => {
      setVolume(Number(e.target.value));
      if (muted) setMuted(false);
    }
  })))), error && /*#__PURE__*/React.createElement("div", {
    className: "err",
    style: {
      fontFamily: theme.metaFont,
      color: theme.accent
    }
  }, "\u26A0 ", error)))), /*#__PURE__*/React.createElement(SettingsDrawer, {
    open: settingsOpen,
    onClose: () => setSettingsOpen(false),
    theme: theme,
    t: t,
    setTweak: setTweak
  })), /*#__PURE__*/React.createElement("div", {
    className: "footer-caption",
    style: {
      fontFamily: theme.metaFont,
      color: theme.dim,
      opacity: aboutOpen ? 0 : 1,
      transition: 'opacity 0.3s'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "fc-dot",
    style: {
      background: theme.accent,
      opacity: isPlaying ? 1 : 0.3
    }
  }), "AUDIO SPECTRUM \xB7 ", t.barCount, " BANDS \xB7 FFT 1024"));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
