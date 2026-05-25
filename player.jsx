// player.jsx — Music player (playlist, file picker, drag & drop, settings drawer)

const { useState, useRef, useEffect, useCallback } = React;

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
    const edits = typeof keyOrEdits === 'object' && keyOrEdits !== null
      ? keyOrEdits : { [keyOrEdits]: val };
    setValues((prev) => ({ ...prev, ...edits }));
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
    titleWeight: 500, titleItalic: true,
    metaFont: "'JetBrains Mono', ui-monospace, monospace",
    bodyFont: "'Inter Tight', system-ui, sans-serif"
  },
  brutalist: {
    name: "Editorial",
    bg: "#ededea", panel: "rgba(255,255,255,0.0)",
    fg: "#0c0c0c", dim: "rgba(12,12,12,0.55)", faint: "rgba(12,12,12,0.15)",
    accent: "#ff3b00", barTop: "#0c0c0c", barBottom: "#0c0c0c",
    glow: "rgba(255,59,0,0.0)",
    titleFont: "'Bodoni Moda', 'Times New Roman', serif",
    titleWeight: 700, titleItalic: false,
    metaFont: "'JetBrains Mono', ui-monospace, monospace",
    bodyFont: "'Inter Tight', system-ui, sans-serif"
  },
  retro: {
    name: "Hi-Fi",
    bg: "#1a1410", panel: "rgba(40,28,18,0.5)",
    fg: "#fbe2b3", dim: "rgba(251,226,179,0.55)", faint: "rgba(251,226,179,0.18)",
    accent: "#ffaa3b", barTop: "#ffd078", barBottom: "#c25a14",
    glow: "rgba(255,170,59,0.40)",
    titleFont: "'DM Serif Display', 'Times New Roman', serif",
    titleWeight: 400, titleItalic: false,
    metaFont: "'JetBrains Mono', ui-monospace, monospace",
    bodyFont: "'Inter Tight', system-ui, sans-serif"
  }
};

const fmtTime = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, '0')}`;
};

function hexToRgba(hex, alpha) {
  if (hex.startsWith('rgba')) return hex.replace(/rgba\(([^)]+),[^,)]+\)/, `rgba($1,${alpha})`);
  if (hex.startsWith('rgb')) return hex.replace('rgb', 'rgba').replace(')', `,${alpha})`);
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.substring(0,2),16)},${parseInt(h.substring(2,4),16)},${parseInt(h.substring(4,6),16)},${alpha})`;
}

function roundRect(ctx, x, y, w, h, r) {
  if (h <= 0) return;
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ──────────────────────────────────────────────────────────────────────
// Dynamic favicon — fixed palette, theme-independent.
// • When idle/paused: static eighth-note monogram on dark ground.
// • When playing: 5 frequency bars sampled from the shared analyser,
//   throttled to ~12 fps to keep the cost negligible.
const FAVICON = {
  size: 32,             // canvas resolution (browsers display at 16, this gives HiDPI headroom)
  bg:   '#0a0907',
  fg:   '#e8c890',
  bars: 5,
  fps:  12
};

function drawFaviconMonogram(ctx, s) {
  ctx.clearRect(0, 0, s, s);
  // Rounded background tile
  ctx.fillStyle = FAVICON.bg;
  roundRect(ctx, 0, 0, s, s, s * 0.18); ctx.fill();
  // Eighth note: head + stem + flag, scaled to the canvas
  ctx.fillStyle = FAVICON.fg;
  // Stem
  const stemX = s * 0.55, stemTop = s * 0.20, stemBot = s * 0.66;
  ctx.fillRect(stemX, stemTop, s * 0.07, stemBot - stemTop);
  // Flag (a short curved sweep)
  ctx.beginPath();
  ctx.moveTo(stemX + s * 0.07, stemTop);
  ctx.quadraticCurveTo(s * 0.86, stemTop + s * 0.10, s * 0.78, stemTop + s * 0.30);
  ctx.quadraticCurveTo(s * 0.74, stemTop + s * 0.18, stemX + s * 0.07, stemTop + s * 0.16);
  ctx.closePath();
  ctx.fill();
  // Note head (filled ellipse, slightly tilted)
  ctx.save();
  ctx.translate(stemX + s * 0.02, stemBot);
  ctx.rotate(-0.35);
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.20, s * 0.15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFaviconBars(ctx, s, levels) {
  ctx.clearRect(0, 0, s, s);
  ctx.fillStyle = FAVICON.bg;
  roundRect(ctx, 0, 0, s, s, s * 0.18); ctx.fill();
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

    const loop = (ts) => {
      rafRef.current = requestAnimationFrame(loop);
      if (ts - lastDrawRef.current < frameInterval) return;
      lastDrawRef.current = ts;

      analyser.getByteFrequencyData(data);
      const N = FAVICON.bars;
      const levels = smoothRef.current;
      for (let i = 0; i < N; i++) {
        // Logarithmic frequency mapping, same shape as the main visualizer
        const idx  = Math.floor(Math.pow(i / N, 1.6) * usable);
        const idx2 = Math.min(usable - 1, Math.floor(Math.pow((i + 1) / N, 1.6) * usable));
        let v = 0, c = 0;
        for (let k = idx; k <= idx2; k++) { v += data[k]; c++; }
        v = c ? v / c : 0;
        let nv = Math.pow((v / 255) * 1.4, 0.85);
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

// Parse ID3 from a Blob → returns promise of {title, artist, album, year, cover}
function readTags(blob) {
  return new Promise((resolve) => {
    if (!window.jsmediatags) return resolve({});
    window.jsmediatags.read(blob, {
      onSuccess: (tag) => {
        const tags = tag.tags || {};
        const year = tags.year || tags.TYER || tags.TDRC || (tags.TDRL && tags.TDRL.data) || '';
        let cover = null;
        if (tags.picture) {
          const { data, format } = tags.picture;
          const bytes = new Uint8Array(data);
          let bin = '';
          for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
          cover = `data:${format};base64,${btoa(bin)}`;
        }
        resolve({
          title: tags.title || null,
          artist: tags.artist || null,
          album: tags.album || null,
          year: String(year || '').slice(0, 4),
          cover
        });
      },
      onError: () => resolve({})
    });
  });
}

// ──────────────────────────────────────────────────────────────────────
function Visualizer({ analyser, theme, barCount, sensitivity, mirror, barWidthPct }) {
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
    const ro = new ResizeObserver(resize); ro.observe(canvas);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const smooth = new Float32Array(barCount);
    const draw = () => {
      analyser.getByteFrequencyData(data);
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      const N = barCount;
      const usable = Math.floor(data.length * 0.78);
      const totalGap = W * (1 - barWidthPct / 100);
      const gap = totalGap / (N + 1);
      const barW = (W - gap * (N + 1)) / N;
      const baseY = mirror ? H / 2 : H;
      const maxBarH = mirror ? H * 0.46 : H * 0.92;
      const gradTop = ctx.createLinearGradient(0, baseY - maxBarH, 0, baseY);
      gradTop.addColorStop(0, theme.barTop); gradTop.addColorStop(1, theme.barBottom);
      for (let i = 0; i < N; i++) {
        const t = i / N;
        const idx = Math.floor(Math.pow(t, 1.6) * usable);
        const idx2 = Math.min(usable - 1, Math.floor(Math.pow((i + 1) / N, 1.6) * usable));
        let v = 0, c = 0;
        for (let k = idx; k <= idx2; k++) { v += data[k]; c++; }
        v = c ? v / c : 0;
        let nv = (v / 255) * sensitivity; nv = Math.pow(nv, 0.85); if (nv > 1) nv = 1;
        const prev = smooth[i] || 0;
        const sm = nv > prev ? prev + (nv - prev) * 0.55 : prev + (nv - prev) * 0.12;
        smooth[i] = sm;
        const h = sm * maxBarH;
        const x = gap + i * (barW + gap);
        const r = Math.min(barW / 2, 4 * dpr);
        ctx.fillStyle = gradTop;
        roundRect(ctx, x, baseY - h, barW, Math.max(2 * dpr, h), r); ctx.fill();
        if (mirror) {
          const gradBot = ctx.createLinearGradient(0, baseY, 0, baseY + maxBarH);
          gradBot.addColorStop(0, theme.barBottom);
          gradBot.addColorStop(1, hexToRgba(theme.barBottom, 0));
          ctx.fillStyle = gradBot;
          roundRect(ctx, x, baseY, barW, Math.max(2 * dpr, h * 0.85), r); ctx.fill();
        }
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, [analyser, theme, barCount, sensitivity, mirror, barWidthPct]);

  return (
    <canvas ref={canvasRef} style={{
      position: 'absolute', inset: 0, width: '100%', height: '100%',
      filter: `drop-shadow(0 0 16px ${theme.glow})`, pointerEvents: 'none'
    }}/>
  );
}

// Decorative idle waveform shape — used for the top-right corner
function MiniWave({ theme, animated }) {
  const N = 24;
  return (
    <div className="mini-wave" aria-hidden="true">
      {Array.from({ length: N }).map((_, i) => (
        <span key={i} style={{
          background: theme.accent,
          opacity: 0.35 + ((i * 53) % 100) / 200,
          height: `${20 + Math.abs(Math.sin(i * 0.55 + i * 0.2)) * 70}%`,
          animationDelay: `${(i * 0.06).toFixed(2)}s`,
          animationPlayState: animated ? 'running' : 'paused'
        }}/>
      ))}
    </div>
  );
}

const Icon = {
  Play: ({ size = 22 }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M7 5.5v13a1 1 0 0 0 1.55.83l10-6.5a1 1 0 0 0 0-1.66l-10-6.5A1 1 0 0 0 7 5.5z"/></svg>),
  Pause: ({ size = 22 }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>),
  Prev: ({ size = 18 }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h2v14H7zM20 5.5v13a1 1 0 0 1-1.55.83l-10-6.5a1 1 0 0 1 0-1.66l10-6.5A1 1 0 0 1 20 5.5z"/></svg>),
  Next: ({ size = 18 }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M15 5h2v14h-2zM4 5.5v13a1 1 0 0 0 1.55.83l10-6.5a1 1 0 0 0 0-1.66l-10-6.5A1 1 0 0 0 4 5.5z"/></svg>),
  Shuffle: ({ size = 16 }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="M4 4l5 5"/></svg>),
  Repeat: ({ size = 16 }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>),
  Volume: ({ size = 16, level = 1 }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none"/>{level > 0.05 && <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>}{level > 0.5 && <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>}</svg>),
  Gear: ({ size = 18 }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>),
  Queue: ({ size = 18 }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="14" y2="6"/><line x1="3" y1="12" x2="14" y2="12"/><line x1="3" y1="18" x2="11" y2="18"/><polygon points="17,15 22,18 17,21" fill="currentColor"/></svg>),
  Close: ({ size = 16 }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>),
  Plus: ({ size = 14 }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>),
  Trash: ({ size = 13 }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>)
};

// ──────────────────────────────────────────────────────────────────────
// Slider used inside settings drawer
function Slider({ label, value, min, max, step, unit = '', onChange, theme, format }) {
  const display = format ? format(value) : value;
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="set-row vert">
      <div className="slider-head">
        <span className="set-row-label" style={{ fontFamily: theme.metaFont, color: theme.dim }}>{label}</span>
        <span style={{ fontFamily: theme.metaFont, fontSize: 11, color: theme.fg, fontVariantNumeric: 'tabular-nums' }}>
          {display}{unit}
        </span>
      </div>
      <div className="slider-track" style={{ background: theme.faint, ['--pct']: `${pct}%`, ['--fg']: theme.fg }}>
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(Number(e.target.value))}/>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
function SettingsDrawer({ open, onClose, theme, t, setTweak }) {
  return (
    <aside className={`side-panel right ${open ? 'side-open' : ''}`} style={{
      background: theme.panel,
      backdropFilter: theme.name === 'Editorial' ? 'none' : 'blur(24px) saturate(140%)',
      WebkitBackdropFilter: theme.name === 'Editorial' ? 'none' : 'blur(24px) saturate(140%)',
      border: theme.name === 'Editorial' ? `1.5px solid ${theme.fg}` : `0.5px solid ${theme.faint}`,
      borderRadius: theme.name === 'Editorial' ? 0 : 18,
      color: theme.fg
    }}>
      <header className="sp-hd">
        <span className="sp-eyebrow" style={{ fontFamily: theme.metaFont, color: theme.dim }}>Settings</span>
        <button className="sp-x" onClick={onClose} style={{ color: theme.dim }}><Icon.Close/></button>
      </header>
      <div className="sp-body">
        <div className="set-group">
          <div className="set-label" style={{ fontFamily: theme.metaFont, color: theme.dim }}>Theme</div>
          <div className="theme-grid">
            {Object.entries(THEMES).map(([key, th]) => (
              <button key={key} className={`theme-swatch ${t.theme === key ? 'on' : ''}`}
                onClick={() => setTweak('theme', key)}
                style={{ background: th.bg, borderColor: t.theme === key ? theme.accent : theme.faint }}>
                <span className="ts-bars">
                  <span style={{ background: th.barTop, height: '40%' }}/>
                  <span style={{ background: th.barTop, height: '70%' }}/>
                  <span style={{ background: th.barBottom, height: '55%' }}/>
                  <span style={{ background: th.accent, height: '85%' }}/>
                  <span style={{ background: th.barBottom, height: '50%' }}/>
                </span>
                <span className="ts-name" style={{ color: th.fg, fontFamily: th.metaFont }}>{th.name}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="set-group">
          <div className="set-label" style={{ fontFamily: theme.metaFont, color: theme.dim }}>Visualizer</div>
          <Slider label="Bar count" value={t.barCount} min={24} max={192} step={4} onChange={(v) => setTweak('barCount', v)} theme={theme}/>
          <Slider label="Sensitivity" value={t.sensitivity} min={0.6} max={2.5} step={0.05} unit="×" onChange={(v) => setTweak('sensitivity', v)} theme={theme} format={(v)=>v.toFixed(2)}/>
          <Slider label="Smoothing" value={t.smoothing} min={0.4} max={0.95} step={0.01} onChange={(v) => setTweak('smoothing', v)} theme={theme} format={(v)=>v.toFixed(2)}/>
          <Slider label="Bar width" value={t.barWidthPct} min={20} max={90} step={1} unit="%" onChange={(v) => setTweak('barWidthPct', v)} theme={theme}/>
          <div className="set-row">
            <span className="set-row-label" style={{ fontFamily: theme.metaFont, color: theme.dim }}>Mirror bars</span>
            <button className={`mini-toggle ${t.mirror ? 'on' : ''}`}
              onClick={() => setTweak('mirror', !t.mirror)}
              style={{ background: t.mirror ? theme.accent : theme.faint }}>
              <i style={{ background: t.mirror ? theme.bg : theme.fg }}/>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ──────────────────────────────────────────────────────────────────────
function PlaylistDrawer({ open, onClose, theme, tracks, currentIndex, onPick, onRemove, onAddFiles }) {
  const fileRef = useRef(null);
  const folderRef = useRef(null);
  return (
    <aside className={`side-panel left ${open ? 'side-open' : ''}`} style={{
      background: theme.panel,
      backdropFilter: theme.name === 'Editorial' ? 'none' : 'blur(24px) saturate(140%)',
      WebkitBackdropFilter: theme.name === 'Editorial' ? 'none' : 'blur(24px) saturate(140%)',
      border: theme.name === 'Editorial' ? `1.5px solid ${theme.fg}` : `0.5px solid ${theme.faint}`,
      borderRadius: theme.name === 'Editorial' ? 0 : 18,
      color: theme.fg
    }}>
      <header className="sp-hd">
        <span className="sp-eyebrow" style={{ fontFamily: theme.metaFont, color: theme.dim }}>
          Queue · {tracks.length}
        </span>
        <button className="sp-x" onClick={onClose} style={{ color: theme.dim }}><Icon.Close/></button>
      </header>

      <div className="pl-actions">
        <button className="pl-btn" onClick={() => fileRef.current?.click()}
          style={{ borderColor: theme.faint, color: theme.fg, fontFamily: theme.metaFont }}>
          <Icon.Plus/> Files
        </button>
        <button className="pl-btn" onClick={() => folderRef.current?.click()}
          style={{ borderColor: theme.faint, color: theme.fg, fontFamily: theme.metaFont }}>
          <Icon.Plus/> Folder
        </button>
        <input ref={fileRef} type="file" accept="audio/mpeg,audio/mp3,audio/*,.mp3"
          multiple style={{ display: 'none' }}
          onChange={(e) => onAddFiles(Array.from(e.target.files || []))}/>
        <input ref={folderRef} type="file" webkitdirectory="" directory="" multiple
          style={{ display: 'none' }}
          onChange={(e) => onAddFiles(Array.from(e.target.files || []).filter(f => /\.mp3$/i.test(f.name)))}/>
      </div>

      <div className="pl-list">
        {tracks.length === 0 && (
          <div className="pl-empty" style={{ color: theme.dim, fontFamily: theme.metaFont }}>
            No tracks loaded.<br/>Drop MP3s anywhere, or use Files / Folder.
          </div>
        )}
        {tracks.map((tr, i) => (
          <div key={tr.id}
            className={`pl-item ${i === currentIndex ? 'on' : ''}`}
            onClick={() => onPick(i)}
            style={{
              background: i === currentIndex ? hexToRgba(theme.accent, 0.10) : 'transparent',
              borderColor: i === currentIndex ? hexToRgba(theme.accent, 0.30) : 'transparent'
            }}>
            <div className="pl-num" style={{ fontFamily: theme.metaFont, color: i === currentIndex ? theme.accent : theme.dim }}>
              {String(i + 1).padStart(2, '0')}
            </div>
            <div className="pl-thumb" style={{ background: theme.faint }}>
              {tr.cover ? <img src={tr.cover} alt=""/> : (
                <span style={{ color: theme.dim, fontFamily: theme.metaFont, fontSize: 9 }}>♪</span>
              )}
            </div>
            <div className="pl-info">
              <div className="pl-title" style={{ color: i === currentIndex ? theme.accent : theme.fg }}>
                {tr.title}
              </div>
              <div className="pl-sub" style={{ fontFamily: theme.metaFont, color: theme.dim }}>
                {tr.artist}{tr.year ? ` · ${tr.year}` : ''}
              </div>
            </div>
            <button className="pl-remove" onClick={(e) => { e.stopPropagation(); onRemove(i); }}
              style={{ color: theme.dim }} title="Remove">
              <Icon.Trash/>
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
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
  const [dragOver, setDragOver] = useState(false);

  const current = currentIndex >= 0 && currentIndex < tracks.length ? tracks[currentIndex] : null;

  // Dynamic tab favicon: monogram when idle, animated bars when playing.
  useFavicon(analyser, isPlaying);

  useEffect(() => { if (analyserRef.current) analyserRef.current.smoothingTimeConstant = t.smoothing; }, [t.smoothing]);
  useEffect(() => { if (audioRef.current) audioRef.current.volume = muted ? 0 : volume; }, [volume, muted]);

  // Build a track from a File/Blob
  const trackFromFile = useCallback(async (file, fallbackName) => {
    const tags = await readTags(file);
    const baseName = (file.name || fallbackName || 'Track').replace(/\.mp3$/i, '');
    const url = URL.createObjectURL(file);
    return {
      id: ++_trackId,
      url,
      title: tags.title || baseName,
      artist: tags.artist || 'Unknown Artist',
      album: tags.album || '',
      year: tags.year || '',
      cover: tags.cover || null
    };
  }, []);

  // Initial load: try Sound.mp3 in the same folder
  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch('Sound.mp3');
        if (!resp.ok) return;
        const blob = await resp.blob();
        // Give the blob a name property so trackFromFile picks it up
        const fileLike = new File([blob], 'Sound.mp3', { type: blob.type || 'audio/mpeg' });
        const tr = await trackFromFile(fileLike);
        // Try image.jpg as fallback cover
        if (!tr.cover) {
          await new Promise((res) => {
            const img = new Image();
            img.onload = () => { tr.cover = 'image.jpg'; res(); };
            img.onerror = () => res();
            img.src = 'image.jpg';
          });
        }
        setTracks((prev) => prev.length ? prev : [tr]);
        setCurrentIndex((idx) => idx === -1 ? 0 : idx);
      } catch (e) {
        // Silent — user can add via picker / drag & drop
      }
    })();
  }, [trackFromFile]);

  const addFiles = useCallback(async (files) => {
    if (!files || !files.length) return;
    const audioFiles = files.filter(f => /\.mp3$/i.test(f.name) || /audio\//.test(f.type));
    if (!audioFiles.length) return;
    const newTracks = [];
    for (const f of audioFiles) {
      try { newTracks.push(await trackFromFile(f)); }
      catch (e) { /* skip */ }
    }
    setTracks((prev) => {
      const next = [...prev, ...newTracks];
      // If nothing was loaded, start playback at first new
      if (prev.length === 0 && next.length > 0) setCurrentIndex(0);
      return next;
    });
  }, [trackFromFile]);

  const removeTrack = useCallback((i) => {
    setTracks((prev) => {
      const next = prev.filter((_, j) => j !== i);
      if (next.length === 0) {
        setCurrentIndex(-1);
        if (audioRef.current) { audioRef.current.pause(); audioRef.current.removeAttribute('src'); audioRef.current.load(); }
        setIsPlaying(false);
      } else if (i === currentIndex) {
        setCurrentIndex(Math.min(i, next.length - 1));
      } else if (i < currentIndex) {
        setCurrentIndex(currentIndex - 1);
      }
      return next;
    });
  }, [currentIndex]);

  const pickTrack = useCallback((i) => {
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
    src.connect(an); an.connect(ctx.destination);
    audioCtxRef.current = ctx; sourceRef.current = src; analyserRef.current = an;
    setAnalyser(an);
  }, [t.smoothing]);

  const togglePlay = async () => {
    const a = audioRef.current; if (!a || !current) return;
    ensureAudioGraph();
    if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume();
    if (a.paused) {
      try { await a.play(); setIsPlaying(true); }
      catch (e) { setError('Click play to start (browser autoplay policy)'); }
    } else { a.pause(); setIsPlaying(false); }
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
    const a = audioRef.current; if (!a) return;
    const onLoaded = () => setDuration(a.duration || 0);
    const onTime = () => { if (!scrubbing) setCurrentTime(a.currentTime); };
    const onEnd = () => {
      if (repeatMode === 2) { a.currentTime = 0; a.play(); return; }
      if (currentIndex < tracks.length - 1 || repeatMode === 1 || shuffle) {
        goNext();
      } else {
        setIsPlaying(false); setCurrentTime(a.duration || 0);
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    a.addEventListener('loadedmetadata', onLoaded);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('ended', onEnd);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    return () => {
      a.removeEventListener('loadedmetadata', onLoaded);
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('ended', onEnd);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
    };
  }, [scrubbing, repeatMode, currentIndex, tracks.length, shuffle, goNext]);

  // Drag & drop on stage
  useEffect(() => {
    const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
    const onDragLeave = (e) => { if (e.target === document.documentElement || !e.relatedTarget) setDragOver(false); };
    const onDrop = (e) => {
      e.preventDefault(); setDragOver(false);
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
  const beginScrub = (e) => {
    e.preventDefault(); setScrubbing(true); moveScrub(e);
    const move = (ev) => moveScrub(ev);
    const up = (ev) => { moveScrub(ev, true); setScrubbing(false);
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const moveScrub = (e, commit = false) => {
    const el = seekRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    setScrubX(pct);
    const newT = pct * (duration || 0);
    setCurrentTime(newT);
    if (commit && audioRef.current) audioRef.current.currentTime = newT;
  };

  const seekPct = duration > 0 ? (scrubbing ? scrubX : currentTime / duration) : 0;
  const volPct = (muted ? 0 : volume) * 100;

  const meta = current || { title: 'No track loaded', artist: 'Drop an .mp3 to begin', year: '', album: '', cover: null };
  const displayMeta = meta.year ? `${meta.artist} · ${meta.year}` : meta.artist;

  return (
    <div className={`stage ${dragOver ? 'dragging' : ''}`} style={{
      background: theme.bg, color: theme.fg, fontFamily: theme.bodyFont,
      ['--fg']: theme.fg, ['--dim']: theme.dim, ['--faint']: theme.faint, ['--accent']: theme.accent,
    }}>

      <audio ref={audioRef} preload="metadata" crossOrigin="anonymous" />

      <div className="ambient" aria-hidden="true" style={{
        background: theme.name === 'Editorial' ? 'none'
          : `radial-gradient(60% 50% at 50% 60%, ${hexToRgba(theme.accent, 0.10)} 0%, transparent 70%)`
      }} />

      {dragOver && (
        <div className="drop-overlay" style={{
          background: hexToRgba(theme.bg, 0.7),
          color: theme.fg,
          border: `2px dashed ${theme.accent}`
        }}>
          <span style={{ fontFamily: theme.metaFont, letterSpacing: '0.18em' }}>
            DROP MP3s TO ADD TO QUEUE
          </span>
        </div>
      )}

      <div className="layout">
        {/* Playlist drawer (left) */}
        <PlaylistDrawer
          open={queueOpen}
          onClose={() => setQueueOpen(false)}
          theme={theme}
          tracks={tracks}
          currentIndex={currentIndex}
          onPick={pickTrack}
          onRemove={removeTrack}
          onAddFiles={addFiles}
        />

        {/* Player card */}
        <main className="card" style={{
          background: theme.panel,
          backdropFilter: theme.name === 'Editorial' ? 'none' : 'blur(20px) saturate(140%)',
          WebkitBackdropFilter: theme.name === 'Editorial' ? 'none' : 'blur(20px) saturate(140%)',
          border: theme.name === 'Editorial' ? `1.5px solid ${theme.fg}` : `0.5px solid ${theme.faint}`,
          borderRadius: theme.name === 'Editorial' ? 0 : 18
        }}>
          {/* Top toggles */}
          <div className="card-toggles">
            <button className="icon-btn" onClick={() => setQueueOpen(s => !s)}
              style={{ color: queueOpen ? theme.accent : theme.dim }}
              aria-label="Queue" title="Queue">
              <Icon.Queue/>
            </button>
            <button className="icon-btn rotate" onClick={() => setSettingsOpen(s => !s)}
              style={{ color: settingsOpen ? theme.accent : theme.dim }}
              aria-label="Settings" title="Settings">
              <Icon.Gear/>
            </button>
          </div>

          <div className="card-stack">
            <div className="card-top">
              {/* Cover */}
              <div className="cover-wrap">
                <div className="cover" style={{
                  borderRadius: theme.name === 'Editorial' ? 0 : 10,
                  boxShadow: theme.name === 'Editorial' ? `8px 8px 0 ${theme.fg}`
                    : `0 30px 60px -10px rgba(0,0,0,0.6), 0 0 0 0.5px ${theme.faint} inset`
                }}>
                  {meta.cover ? (
                    <img src={meta.cover} alt="" onError={() => current && setTracks(ts => ts.map((tr, j) => j === currentIndex ? {...tr, cover: null} : tr))}/>
                  ) : (
                    <div className="cover-placeholder" style={{
                      background: `repeating-linear-gradient(135deg, ${theme.faint} 0 8px, transparent 8px 16px)`,
                      color: theme.dim
                    }}>
                      <span style={{ fontFamily: theme.metaFont, fontSize: 11, letterSpacing: '0.1em' }}>
                        [ COVER ART ]
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Center: title + meta */}
              <div className="info-top">
                <div className="np-tag" style={{ fontFamily: theme.metaFont, color: theme.dim }}>
                  <span className="np-dot" style={{ background: isPlaying ? theme.accent : theme.faint }}/>
                  {isPlaying ? 'NOW PLAYING' : current ? 'PAUSED' : 'EMPTY QUEUE'}
                </div>
                <h1 className="title" style={{
                  fontFamily: theme.titleFont, fontWeight: theme.titleWeight,
                  fontStyle: theme.titleItalic ? 'italic' : 'normal', color: theme.fg
                }}>
                  {meta.title}
                </h1>
                <div className="meta-line" style={{ fontFamily: theme.metaFont, color: theme.dim }}>
                  {displayMeta}
                </div>
                {meta.album && (
                  <div className="meta-album" style={{ fontFamily: theme.titleFont, color: theme.dim, fontStyle: 'italic' }}>
                    {meta.album}
                  </div>
                )}
              </div>

              {/* Right: track index + mini wave */}
              <div className="card-corner">
                <div className="track-index">
                  <span className="ti-num" style={{ fontFamily: theme.titleFont, color: theme.fg }}>
                    {currentIndex >= 0 ? String(currentIndex + 1).padStart(2, '0') : '—'}
                  </span>
                  <span className="ti-sep" style={{ color: theme.faint }}>/</span>
                  <span className="ti-total" style={{ fontFamily: theme.metaFont, color: theme.dim }}>
                    {String(tracks.length).padStart(2, '0')}
                  </span>
                </div>
                <MiniWave theme={theme} animated={isPlaying}/>
                <div className="ti-label" style={{ fontFamily: theme.metaFont, color: theme.dim }}>
                  {duration > 0 ? fmtTime(duration) : '0:00'}
                </div>
              </div>
            </div>

            {/* Visualizer */}
            <div className="viz-embed" style={{
              background: theme.name === 'Editorial' ? 'transparent'
                : `linear-gradient(180deg, ${hexToRgba(theme.bg, 0)} 0%, ${hexToRgba(theme.bg, 0.35)} 100%)`,
              borderTop: `0.5px solid ${theme.faint}`,
              borderBottom: `0.5px solid ${theme.faint}`,
            }}>
              {analyser ? (
                <Visualizer analyser={analyser} theme={theme}
                  barCount={t.barCount} sensitivity={t.sensitivity}
                  mirror={t.mirror} barWidthPct={t.barWidthPct}/>
              ) : (
                <div className="viz-idle">
                  {Array.from({ length: 64 }).map((_, i) => (
                    <span key={i} style={{
                      height: `${10 + Math.sin(i * 0.7) * 8 + (i % 3) * 4}%`,
                      background: theme.barBottom, opacity: 0.35
                    }} />
                  ))}
                </div>
              )}
            </div>

            <div className="card-bottom">
              {/* Seek */}
              <div className="seek-row">
                <span className="time" style={{ fontFamily: theme.metaFont, color: theme.dim }}>{fmtTime(currentTime)}</span>
                <div ref={seekRef} className="seek" onPointerDown={beginScrub} style={{ background: theme.faint }}>
                  <div className="seek-fill" style={{ width: `${seekPct * 100}%`, background: theme.accent }}/>
                  <div className="seek-knob" style={{ left: `${seekPct * 100}%`, background: theme.fg, boxShadow: `0 0 0 4px ${hexToRgba(theme.accent, 0.25)}` }}/>
                </div>
                <span className="time" style={{ fontFamily: theme.metaFont, color: theme.dim }}>{fmtTime((duration || 0) - currentTime)}</span>
              </div>

              {/* Controls */}
              <div className="controls">
                <button className={`ctrl-tertiary ${shuffle ? 'on' : ''}`} onClick={() => setShuffle(s => !s)}
                  title="Shuffle" style={{ color: shuffle ? theme.accent : theme.dim }}><Icon.Shuffle/></button>
                <button className="ctrl-secondary" onClick={goPrev} title="Previous" style={{ color: theme.dim }}><Icon.Prev/></button>
                <button className="ctrl-primary" onClick={togglePlay}
                  style={{ background: theme.fg, color: theme.bg, borderRadius: theme.name === 'Editorial' ? 0 : 999 }}
                  title={isPlaying ? 'Pause' : 'Play'}>
                  {isPlaying ? <Icon.Pause/> : <Icon.Play/>}
                </button>
                <button className="ctrl-secondary" onClick={goNext} title="Next" style={{ color: theme.dim }}><Icon.Next/></button>
                <button className={`ctrl-tertiary ${repeatMode > 0 ? 'on' : ''}`}
                  onClick={() => setRepeatMode(r => (r + 1) % 3)} title="Repeat"
                  style={{ color: repeatMode > 0 ? theme.accent : theme.dim, position: 'relative' }}>
                  <Icon.Repeat/>
                  {repeatMode === 2 && (
                    <span style={{ position: 'absolute', top: -2, right: -2, fontSize: 8, fontWeight: 700,
                      fontFamily: theme.metaFont, color: theme.accent }}>1</span>
                  )}
                </button>

                <div className="vol">
                  <button className="ctrl-secondary" onClick={() => setMuted(m => !m)} style={{ color: theme.dim }} title="Mute">
                    <Icon.Volume level={muted ? 0 : volume}/>
                  </button>
                  <div className="vol-track" style={{ background: theme.faint, ['--pct']: `${volPct}%`, ['--fg']: theme.fg }}>
                    <div className="vol-fill"/>
                    <input type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume}
                      onChange={(e) => { setVolume(Number(e.target.value)); if (muted) setMuted(false); }}/>
                  </div>
                </div>
              </div>

              {error && (
                <div className="err" style={{ fontFamily: theme.metaFont, color: theme.accent }}>⚠ {error}</div>
              )}
            </div>
          </div>
        </main>

        {/* Settings drawer (right) */}
        <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)}
          theme={theme} t={t} setTweak={setTweak}/>
      </div>

      <div className="footer-caption" style={{ fontFamily: theme.metaFont, color: theme.dim }}>
        <span className="fc-dot" style={{ background: theme.accent, opacity: isPlaying ? 1 : 0.3 }}/>
        AUDIO SPECTRUM · {t.barCount} BANDS · FFT 1024
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
