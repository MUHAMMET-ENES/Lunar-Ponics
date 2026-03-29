import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  ComposedChart, RadarChart, PieChart,
  Line, Area, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';

/* ════════════════════════════════════════════════════════════════════
   §1  SEEDED PRNG — Mulberry32 (deterministic, reproducible)
════════════════════════════════════════════════════════════════════ */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ════════════════════════════════════════════════════════════════════
   §2  CROP MANIFEST  (7 species, distinct bio-parameters)
════════════════════════════════════════════════════════════════════ */
const CROPS = [
  { id: 'sweetPotato', name: 'Sweet Potato', color: '#ff8c42', kcal100: 86,  maxB: 420, wB: 1.80, optPH: 6.0, optEC: 1.8, icon: '🍠', r: 0.09, seed: 1001 },
  { id: 'peanut',      name: 'Peanut',       color: '#daa520', kcal100: 567, maxB: 280, wB: 1.20, optPH: 6.2, optEC: 1.6, icon: '🥜', r: 0.07, seed: 2002 },
  { id: 'sorghum',     name: 'Sorghum',      color: '#00cfff', kcal100: 329, maxB: 390, wB: 0.90, optPH: 6.5, optEC: 1.4, icon: '🌾', r: 0.10, seed: 3003 },
  { id: 'lettuce',     name: 'Lettuce',      color: '#00ff9d', kcal100: 15,  maxB: 180, wB: 2.20, optPH: 6.0, optEC: 1.0, icon: '🥬', r: 0.12, seed: 4004 },
  { id: 'microTomato', name: 'Micro-Tomato', color: '#ff2d78', kcal100: 18,  maxB: 230, wB: 1.60, optPH: 6.3, optEC: 2.2, icon: '🍅', r: 0.08, seed: 5005 },
  { id: 'quinoa',      name: 'Quinoa',       color: '#c77dff', kcal100: 368, maxB: 310, wB: 0.85, optPH: 6.5, optEC: 1.5, icon: '🌱', r: 0.08, seed: 6006 },
  { id: 'strawberry',  name: 'Strawberry',   color: '#ff6b9d', kcal100: 32,  maxB: 165, wB: 1.40, optPH: 5.8, optEC: 1.2, icon: '🍓', r: 0.11, seed: 7007 },
];

/* ════════════════════════════════════════════════════════════════════
   §3  PHYSICS ENGINE — deterministic 90-day data generator
════════════════════════════════════════════════════════════════════ */
function generateData(disasterDay, disasterType) {
  const DAYS   = 90;
  const envRng = mulberry32(42000);

  // Pre-compute per-crop fixed inflection point (x0) from its own seed
  const meta = {};
  CROPS.forEach(crop => {
    const initR = mulberry32(crop.seed);
    meta[crop.id] = {
      x0:  28 + initR() * 18,             // logistic inflection day 28–46
      rng: mulberry32(crop.seed + 500),    // independent daily-noise RNG
    };
  });

  const rows = [];

  for (let d = 1; d <= DAYS; d++) {
    /* ── Disaster multiplier & environmental shifts ── */
    let dMult = 1, radBoost = 0, tempShift = 0, humShift = 0;
    if (disasterDay !== null && d >= disasterDay) {
      const e     = d - disasterDay;
      const decay = (type) => type === 'solar_flare'
        ? Math.max(0, 1 - e * 0.038)
        : Math.max(0, 1 - e * 0.032);
      if (disasterType === 'solar_flare') {
        const dc = decay('solar_flare');
        dMult     = Math.max(0.07, 1 - e * 0.055);
        radBoost  = 11.5 * dc;
        tempShift = 15   * dc;
      } else if (disasterType === 'hull_leak') {
        const dc = decay('hull_leak');
        dMult     = Math.max(0.05, 1 - e * 0.065);
        tempShift = -18 * dc;
        humShift  = -38 * dc;
      }
    }

    /* ── Environmental telemetry ── */
    const PAR       = +(400 + Math.sin(d / 9  * Math.PI) * 60 + envRng() * 40 - 20).toFixed(1);
    const temp      = +(22  + Math.sin(d / 14 * Math.PI) * 1.5 + (envRng() * 2 - 1) + tempShift).toFixed(1);
    const humidity  = +Math.max(10, Math.min(95, 67 + Math.sin(d / 12 * Math.PI) * 5 + (envRng() * 6 - 3) + humShift)).toFixed(1);
    const radiation = +Math.max(0, 0.18 + envRng() * 0.12 + radBoost).toFixed(3);

    const row = { day: d, temp, humidity, PAR, radiation };

    /* ── Per-crop biophysical metrics ── */
    CROPS.forEach(crop => {
      const { x0, rng } = meta[crop.id];

      // Logistic (S-curve) growth + multiplicative noise
      const logistic = crop.maxB / (1 + Math.exp(-crop.r * (d - x0)));
      const biomass   = +Math.max(0, logistic * (0.93 + rng() * 0.14) * dMult).toFixed(1);
      const gf        = biomass / crop.maxB;   // growth fraction 0→1

      const water = +Math.max(0.05, crop.wB * (0.35 + gf * 0.95) * (0.90 + rng() * 0.20)).toFixed(2);
      const WUE   = +(water > 0 ? biomass / (water * 100) : 0).toFixed(4);
      const kcal  = +(biomass * crop.kcal100 / 100 * (0.94 + rng() * 0.12)).toFixed(1);

      // pH drifts under stress
      const stressDrift = dMult < 0.70 ? rng() * 0.80 - 0.40 : 0;
      const pH    = +Math.max(4.5, Math.min(8.5, crop.optPH  + (rng() * 0.50 - 0.25) + stressDrift)).toFixed(2);
      const EC    = +Math.max(0.3, Math.min(4.5, crop.optEC  + (rng() * 0.40 - 0.20))).toFixed(2);
      const NDVI  = +Math.max(0,   Math.min(0.98, 0.18 + gf * 0.72 * dMult + rng() * 0.06 - 0.03)).toFixed(3);

      row[`${crop.id}_biomass`] = biomass;
      row[`${crop.id}_kcal`]    = kcal;
      row[`${crop.id}_water`]   = water;
      row[`${crop.id}_WUE`]     = WUE;
      row[`${crop.id}_pH`]      = pH;
      row[`${crop.id}_EC`]      = EC;
      row[`${crop.id}_NDVI`]    = NDVI;
    });

    rows.push(row);
  }
  return rows;
}

/* ════════════════════════════════════════════════════════════════════
   §4  SHARED CHART TOOLTIP
════════════════════════════════════════════════════════════════════ */
function ChartTip({ active, payload, label, unit = '' }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#0a1628', border: '1px solid #1e3a5f', borderRadius: 8,
      padding: '9px 13px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
      boxShadow: '0 8px 32px rgba(0,207,255,0.18)',
    }}>
      <div style={{ color: '#4a6fa5', marginBottom: 7, letterSpacing: 1.5, fontSize: 10 }}>
        MISSION DAY {label}
      </div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', gap: 18, justifyContent: 'space-between', marginTop: 3 }}>
          <span style={{ color: p.color, opacity: 0.9 }}>{p.name}</span>
          <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
            {typeof p.value === 'number' ? p.value.toFixed(3) : p.value}{unit}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   §5  CHART CARD WRAPPER
════════════════════════════════════════════════════════════════════ */
function Card({ title, sub, children, style = {} }) {
  return (
    <div style={{
      background: '#0c1322', border: '1px solid #162844',
      borderRadius: 12, padding: '18px 22px',
      boxShadow: '0 4px 24px rgba(0,0,0,0.4)', ...style,
    }}>
      {title && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: '#4a6fa5', letterSpacing: 2.5,
            fontFamily: "'IBM Plex Mono', monospace", marginBottom: 3 }}>
            {title}
          </div>
          {sub && <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', letterSpacing: 0.3 }}>{sub}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   §6  SHARED RECHARTS STYLE PROPS
════════════════════════════════════════════════════════════════════ */
const AXIS = {
  stroke: '#162844',
  tick: { fill: '#4a6fa5', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10 },
};
const GRID = { stroke: '#162844', strokeDasharray: '3 3' };
const LEGEND_STYLE = { fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, paddingTop: 8 };
const TIP_STYLE = {
  contentStyle: {
    background: '#0a1628', border: '1px solid #1e3a5f',
    borderRadius: 8, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
  },
};

/* ════════════════════════════════════════════════════════════════════
   §7  MAIN APPLICATION
════════════════════════════════════════════════════════════════════ */
export default function App() {
  /* ── State ── */
  const [activeTab,     setActiveTab]     = useState('command');
  const [selectedCrops, setSelectedCrops] = useState(new Set(CROPS.map(c => c.id)));
  const [disaster,      setDisaster]      = useState({ day: null, type: null });
  const [showModal,     setShowModal]     = useState(false);
  const [currentDay,    setCurrentDay]    = useState(90);

  /* ── Inject Google Fonts ── */
  useEffect(() => {
    if (document.getElementById('lp-fonts')) return;
    const link = document.createElement('link');
    link.id   = 'lp-fonts';
    link.rel  = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;600&family=Orbitron:wght@700;900&display=swap';
    document.head.appendChild(link);
  }, []);

  /* ── Data ── */
  const allData     = useMemo(() => generateData(disaster.day, disaster.type), [disaster]);
  const visibleData = useMemo(() => allData.slice(0, currentDay), [allData, currentDay]);

  /* ── Aggregate stats (all 90 days, all 7 crops) ── */
  const stats = useMemo(() => {
    let tBio = 0, tWater = 0, tKcal = 0;
    const wueSum = Object.fromEntries(CROPS.map(c => [c.id, 0]));
    allData.forEach(row => {
      CROPS.forEach(c => {
        tBio   += row[`${c.id}_biomass`] || 0;
        tWater += row[`${c.id}_water`]   || 0;
        tKcal  += row[`${c.id}_kcal`]    || 0;
        wueSum[c.id] += row[`${c.id}_WUE`] || 0;
      });
    });
    const tBioKg  = tBio / 1000;
    const payloadM = (tBioKg * 1.2).toFixed(2);
    const bestWUE  = CROPS.reduce((b, c) => wueSum[c.id] > wueSum[b.id] ? c : b, CROPS[0]);
    return {
      tBioKg:   tBioKg.toFixed(2),
      tWater:   tWater.toFixed(1),
      tKcal:    Math.round(tKcal).toLocaleString(),
      payloadM,
      bestWUE,
    };
  }, [allData]);

  /* ── Radar data: normalized 0-100 per metric at current day ── */
  const radarData = useMemo(() => {
    const snap = allData[Math.min(currentDay, allData.length) - 1];
    if (!snap) return [];
    const maxB = Math.max(1, ...CROPS.map(c => snap[`${c.id}_biomass`] || 0));
    const maxK = Math.max(1, ...CROPS.map(c => snap[`${c.id}_kcal`]    || 0));
    const maxW = Math.max(1e-9, ...CROPS.map(c => snap[`${c.id}_WUE`]  || 0));
    const entry = (key, fn) => ({ m: key, ...Object.fromEntries(CROPS.map(c => [c.id, fn(c, snap)])) });
    return [
      entry('Biomass',    (c, s) => +((s[`${c.id}_biomass`] || 0) / maxB * 100).toFixed(1)),
      entry('Kcal',       (c, s) => +((s[`${c.id}_kcal`]    || 0) / maxK * 100).toFixed(1)),
      entry('WUE',        (c, s) => +((s[`${c.id}_WUE`]     || 0) / maxW * 100).toFixed(1)),
      entry('NDVI',       (c, s) => +((s[`${c.id}_NDVI`]    || 0)       * 100).toFixed(1)),
      entry('pH Stab.',   (c, s) => {
        const dev = Math.abs((s[`${c.id}_pH`] || c.optPH) - c.optPH);
        return +Math.max(0, (1 - dev / 2) * 100).toFixed(1);
      }),
    ];
  }, [allData, currentDay]);

  /* ── Pie data: water share at current day ── */
  const pieData = useMemo(() => {
    const snap = allData[Math.min(currentDay, allData.length) - 1];
    if (!snap) return [];
    return CROPS.filter(c => selectedCrops.has(c.id)).map(c => ({
      name: c.name, value: +(snap[`${c.id}_water`] || 0).toFixed(2), color: c.color,
    }));
  }, [allData, currentDay, selectedCrops]);

  /* ── QR report URL ── */
  const qrURL = useMemo(() => {
    const raw = `LUNAR-PONICS MISSION REPORT | PAYLOAD SAVED $${stats.payloadM}M | BEST WUE: ${stats.bestWUE.name} | TOTAL KCAL: ${stats.tKcal} | WATER USED: ${stats.tWater}L | TOTAL BIOMASS: ${stats.tBioKg}kg`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&color=00cfff&bgcolor=050911&data=${encodeURIComponent(raw)}`;
  }, [stats]);

  /* ── Handlers ── */
  const toggleCrop = useCallback((id) => {
    setSelectedCrops(prev => {
      const next = new Set(prev);
      if (next.has(id)) { if (next.size > 1) next.delete(id); }
      else next.add(id);
      return next;
    });
  }, []);

  const triggerDisaster = useCallback((type) => {
    setDisaster({ day: Math.min(30, Math.max(5, currentDay - 20)), type });
  }, [currentDay]);

  const activeCrops    = CROPS.filter(c => selectedCrops.has(c.id));
  const disasterActive = disaster.day !== null;

  const TABS = [
    { id: 'command',    label: '🌍 Command Center' },
    { id: 'nutrients',  label: '🧪 Root & Nutrient' },
    { id: 'atmosphere', label: '🌡️ Atmosphere' },
    { id: 'sensors',    label: '📡 Sensors & NDVI' },
  ];

  /* ════════════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ background: '#050911', minHeight: '100vh', color: '#e2e8f0',
      fontFamily: "'Rajdhani', 'Segoe UI', sans-serif", lineHeight: 1.4 }}>

      {/* ─── Global CSS ─── */}
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #050911; overflow-x: hidden; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: #050911; }
        ::-webkit-scrollbar-thumb { background: #1e3a5f; border-radius: 3px; }

        .crop-pill {
          cursor: pointer; border: 1px solid; border-radius: 20px;
          padding: 5px 13px; font-size: 12px; font-weight: 600;
          font-family: 'Rajdhani', sans-serif; letter-spacing: 0.6px;
          transition: all 0.18s ease; background: transparent;
        }
        .crop-pill:hover { transform: translateY(-1px); }

        .tab-btn {
          background: none; border: none; cursor: pointer;
          font-family: 'Rajdhani', sans-serif; font-size: 14px;
          font-weight: 600; letter-spacing: 0.6px;
          padding: 11px 22px; color: #4a6fa5;
          border-bottom: 2px solid transparent;
          transition: all 0.18s ease;
        }
        .tab-btn:hover { color: #00cfff; }
        .tab-btn.active { color: #00cfff; border-bottom-color: #00cfff; }

        .dis-btn {
          border: 1px solid; border-radius: 7px; padding: 9px 17px;
          cursor: pointer; font-weight: 700; letter-spacing: 0.5px;
          font-family: 'Rajdhani', sans-serif; font-size: 13px;
          transition: all 0.18s ease; background: transparent;
        }
        .dis-btn:hover { transform: translateY(-1px); filter: brightness(1.2); }

        .modal-overlay {
          position: fixed; inset: 0; background: rgba(5,9,17,0.88);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000; backdrop-filter: blur(5px);
        }
        @keyframes pulse-badge {
          0%,100% { box-shadow: 0 0 6px rgba(255,45,120,0.4); }
          50%      { box-shadow: 0 0 20px rgba(255,45,120,0.8), 0 0 40px rgba(255,45,120,0.3); }
        }
        .disaster-badge { animation: pulse-badge 1.8s infinite; }
        @keyframes fade-in { from { opacity:0; transform: translateY(6px); } to { opacity:1; transform:none; } }
        .fade-in { animation: fade-in 0.3s ease both; }
        @keyframes scan {
          0%   { background-position: 0 0; }
          100% { background-position: 0 100vh; }
        }
        .scanlines {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background: repeating-linear-gradient(
            0deg, transparent, transparent 2px, rgba(0,207,255,0.012) 2px, rgba(0,207,255,0.012) 4px
          );
        }
      `}</style>

      {/* Scanline overlay */}
      <div className="scanlines" />

      {/* ════════════════════════════════════════════════════════════
          MODAL — QR Mission Report
      ════════════════════════════════════════════════════════════ */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div
            className="fade-in"
            onClick={e => e.stopPropagation()}
            style={{
              background: '#0c1322', border: '1px solid #00cfff', borderRadius: 14,
              padding: 32, width: 480, position: 'relative',
              boxShadow: '0 0 60px rgba(0,207,255,0.2), 0 0 120px rgba(0,207,255,0.08)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 10, color: '#4a6fa5', letterSpacing: 3,
                  fontFamily: "'IBM Plex Mono', monospace", marginBottom: 4 }}>
                  CLASSIFIED MISSION REPORT
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, color: '#00cfff',
                  fontFamily: "'Orbitron', monospace", letterSpacing: 1.5 }}>
                  LUNAR-PONICS α-1
                </div>
              </div>
              <button onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', color: '#4a6fa5',
                  cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: '2px 6px' }}>✕
              </button>
            </div>

            {/* QR + Stats row */}
            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
              <div style={{ flexShrink: 0 }}>
                <img src={qrURL} alt="QR Mission Report" width={160} height={160}
                  style={{ borderRadius: 10, border: '2px solid #00cfff', display: 'block' }} />
                <div style={{ fontSize: 9, color: '#4a6fa5', textAlign: 'center', marginTop: 6,
                  fontFamily: "'IBM Plex Mono', monospace", letterSpacing: 1 }}>
                  SCAN FOR ENCODED DATA
                </div>
              </div>
              <div style={{ flex: 1 }}>
                {[
                  { label: 'BEST WUE CROP',   value: `${stats.bestWUE.icon} ${stats.bestWUE.name}`, color: stats.bestWUE.color },
                  { label: 'PAYLOAD SAVED',    value: `$${stats.payloadM} M`,                       color: '#00cfff' },
                  { label: 'TOTAL KCAL',       value: stats.tKcal,                                  color: '#00ff9d' },
                  { label: 'WATER CONSUMED',   value: `${stats.tWater} L`,                          color: '#c77dff' },
                  { label: 'TOTAL BIOMASS',    value: `${stats.tBioKg} kg`,                         color: '#ff8c42' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ marginBottom: 13 }}>
                    <div style={{ fontSize: 9, color: '#4a6fa5', letterSpacing: 2.5,
                      fontFamily: "'IBM Plex Mono', monospace", marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 17, fontWeight: 700, color,
                      fontFamily: "'IBM Plex Mono', monospace" }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Status footer */}
            <div style={{ marginTop: 20, padding: '11px 14px', background: '#050911',
              borderRadius: 7, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
              color: disasterActive ? '#ff2d78' : '#00ff9d',
              borderLeft: `3px solid ${disasterActive ? '#ff2d78' : '#00ff9d'}` }}>
              {disasterActive
                ? `⚠️  CATASTROPHIC EVENT: ${disaster.type === 'solar_flare' ? 'SOLAR FLARE' : 'HULL LEAK'} TRIGGERED AT MISSION DAY ${disaster.day}`
                : '✅  MISSION NOMINAL — NO CATASTROPHIC EVENTS RECORDED'}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          HEADER
      ════════════════════════════════════════════════════════════ */}
      <header style={{
        background: 'rgba(12,19,34,0.96)', borderBottom: '1px solid #162844',
        padding: '10px 28px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 200,
        backdropFilter: 'blur(10px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <span style={{ fontSize: 28 }}>🌙</span>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 3, color: '#00cfff',
              fontFamily: "'Orbitron', monospace", lineHeight: 1 }}>LUNAR-PONICS</div>
            <div style={{ fontSize: 9.5, color: '#4a6fa5',
              fontFamily: "'IBM Plex Mono', monospace", letterSpacing: 1.5, marginTop: 2 }}>
              MISSION CONTROL · 90-DAY POLYCULTURE SIMULATION
            </div>
          </div>
          {disasterActive && (
            <div className="disaster-badge" style={{
              background: 'rgba(255,45,120,0.12)', border: '1px solid #ff2d78',
              borderRadius: 5, padding: '5px 13px', color: '#ff2d78',
              fontSize: 12, fontWeight: 700, letterSpacing: 1,
              fontFamily: "'IBM Plex Mono', monospace",
            }}>
              ⚠️ {disaster.type === 'solar_flare' ? 'SOLAR FLARE' : 'HULL BREACH'} · DAY {disaster.day}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Live telemetry ticker */}
          {(() => {
            const snap = allData[Math.min(currentDay, allData.length) - 1];
            return snap ? (
              <div style={{ display: 'flex', gap: 16, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10 }}>
                {[
                  { k: 'TEMP', v: `${snap.temp}°C`,  c: '#ff8c42' },
                  { k: 'RH',   v: `${snap.humidity}%`,c: '#c77dff' },
                  { k: 'RAD',  v: `${snap.radiation}`, c: disasterActive && disaster.day <= currentDay ? '#ff2d78' : '#64748b' },
                ].map(({ k, v, c }) => (
                  <div key={k} style={{ textAlign: 'center' }}>
                    <div style={{ color: '#4a6fa5', letterSpacing: 1.5 }}>{k}</div>
                    <div style={{ color: c, fontWeight: 600, fontSize: 13 }}>{v}</div>
                  </div>
                ))}
              </div>
            ) : null;
          })()}

          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
            color: '#4a6fa5', textAlign: 'right', borderLeft: '1px solid #162844', paddingLeft: 16 }}>
            <div style={{ letterSpacing: 1.5 }}>MISSION DAY</div>
            <div style={{ fontSize: 22, color: '#00cfff', fontWeight: 600 }}>{String(currentDay).padStart(3, '0')}</div>
          </div>

          <button
            onClick={() => setShowModal(true)}
            style={{
              background: 'transparent', border: '1px solid #00cfff', borderRadius: 7,
              color: '#00cfff', padding: '9px 20px', cursor: 'pointer',
              fontFamily: "'Rajdhani', sans-serif", fontWeight: 700,
              fontSize: 13, letterSpacing: 1,
              transition: 'all 0.18s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,207,255,0.1)'; e.currentTarget.style.boxShadow = '0 0 20px rgba(0,207,255,0.2)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            📋 GENERATE REPORT
          </button>
        </div>
      </header>

      {/* ════════════════════════════════════════════════════════════
          MAIN CONTENT
      ════════════════════════════════════════════════════════════ */}
      <div style={{ padding: '18px 28px', maxWidth: 1440, margin: '0 auto', position: 'relative', zIndex: 1 }}>

        {/* ── NASA Payload Economics Widget ── */}
        <div style={{
          background: 'linear-gradient(135deg, #0c1a30 0%, #0f2040 40%, #0c1a30 100%)',
          border: '1px solid #00cfff', borderRadius: 14, padding: '22px 30px',
          marginBottom: 16, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 24, flexWrap: 'wrap',
          boxShadow: '0 0 40px rgba(0,207,255,0.12), inset 0 1px 0 rgba(0,207,255,0.08)',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Radial glow */}
          <div style={{ position: 'absolute', right: '5%', top: '50%', transform: 'translateY(-50%)',
            width: 320, height: 320, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(0,207,255,0.06) 0%, transparent 70%)',
            pointerEvents: 'none' }} />

          <div>
            <div style={{ fontSize: 9.5, color: '#4a6fa5', letterSpacing: 3,
              fontFamily: "'IBM Plex Mono', monospace", marginBottom: 8 }}>
              NASA PAYLOAD ECONOMICS ANALYSIS · LUNAR GATEWAY PROTOCOL
            </div>
            <div style={{
              fontSize: 52, fontWeight: 700, color: '#00cfff',
              fontFamily: "'IBM Plex Mono', monospace", letterSpacing: -1, lineHeight: 1,
            }}>
              ${stats.payloadM}M
            </div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 6, letterSpacing: 0.4 }}>
              saved via in-situ resource production over 90-day cycle
            </div>
          </div>

          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
            {[
              { label: 'TOTAL BIOMASS',  value: `${stats.tBioKg} kg`,         color: '#ff8c42' },
              { label: 'CALORIC OUTPUT', value: stats.tKcal,                   color: '#00ff9d' },
              { label: 'H₂O CONSUMED',  value: `${stats.tWater} L`,           color: '#c77dff' },
              { label: 'BEST WUE CROP', value: `${stats.bestWUE.icon} ${stats.bestWUE.name}`, color: stats.bestWUE.color },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: '#4a6fa5', letterSpacing: 2.5,
                  fontFamily: "'IBM Plex Mono', monospace", marginBottom: 5 }}>{label}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color,
                  fontFamily: "'IBM Plex Mono', monospace" }}>{value}</div>
              </div>
            ))}
          </div>

          <div style={{ borderLeft: '1px solid #1e3a5f', paddingLeft: 22, textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: 9, color: '#4a6fa5', letterSpacing: 2,
              fontFamily: "'IBM Plex Mono', monospace", marginBottom: 6 }}>COST BASIS</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#64748b',
              fontFamily: "'IBM Plex Mono', monospace" }}>$1.2M</div>
            <div style={{ fontSize: 9.5, color: '#4a6fa5',
              fontFamily: "'IBM Plex Mono', monospace", letterSpacing: 1 }}>per kg to LEO</div>
          </div>
        </div>

        {/* ── Controls row: crop selector + day slider + disaster buttons ── */}
        <div style={{
          background: '#0c1322', border: '1px solid #162844', borderRadius: 11,
          padding: '13px 20px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          {/* Crop toggle pills */}
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', flex: 1 }}>
            {CROPS.map(crop => {
              const on = selectedCrops.has(crop.id);
              return (
                <button
                  key={crop.id}
                  className="crop-pill"
                  onClick={() => toggleCrop(crop.id)}
                  style={{
                    borderColor: on ? crop.color : '#1e3a5f',
                    color:       on ? crop.color : '#4a6fa5',
                    background:  on ? `${crop.color}1a` : 'transparent',
                    boxShadow:   on ? `0 0 12px ${crop.color}30` : 'none',
                  }}
                >
                  {crop.icon} {crop.name}
                </button>
              );
            })}
          </div>

          {/* Day scrubber */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <span style={{ fontSize: 10, color: '#4a6fa5',
              fontFamily: "'IBM Plex Mono', monospace", letterSpacing: 1.5 }}>DAY</span>
            <input type="range" min={1} max={90} value={currentDay}
              onChange={e => setCurrentDay(+e.target.value)}
              style={{ width: 130, accentColor: '#00cfff', cursor: 'pointer' }} />
            <span style={{ fontSize: 15, color: '#00cfff',
              fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, minWidth: 28 }}>
              {currentDay}
            </span>
          </div>

          {/* Disaster buttons */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="dis-btn"
              onClick={() => triggerDisaster('solar_flare')}
              style={{
                borderColor: '#ffb300', color: '#ffb300',
                background: disasterActive && disaster.type === 'solar_flare'
                  ? 'rgba(255,179,0,0.13)' : 'transparent',
                boxShadow: disasterActive && disaster.type === 'solar_flare'
                  ? '0 0 16px rgba(255,179,0,0.3)' : 'none',
              }}>☀️ Solar Flare
            </button>
            <button className="dis-btn"
              onClick={() => triggerDisaster('hull_leak')}
              style={{
                borderColor: '#94a3b8', color: '#94a3b8',
                background: disasterActive && disaster.type === 'hull_leak'
                  ? 'rgba(148,163,184,0.1)' : 'transparent',
                boxShadow: disasterActive && disaster.type === 'hull_leak'
                  ? '0 0 16px rgba(148,163,184,0.2)' : 'none',
              }}>☄️ Hull Leak
            </button>
            <button className="dis-btn"
              onClick={() => setDisaster({ day: null, type: null })}
              style={{ borderColor: '#00ff9d', color: '#00ff9d' }}>
              🛡️ Reset System
            </button>
          </div>
        </div>

        {/* ── Tab navigation ── */}
        <div style={{ borderBottom: '1px solid #162844', marginBottom: 18, display: 'flex' }}>
          {TABS.map(tab => (
            <button key={tab.id} className={`tab-btn${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════
            TAB CONTENT
        ════════════════════════════════════════════════════════ */}

        {/* ─── TAB 1: COMMAND CENTER ─── */}
        {activeTab === 'command' && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Biomass growth curves (full width) */}
            <Card title="BIOMASS ACCUMULATION · LOGISTIC GROWTH MODEL"
              sub={`Crop Growth Curves — Day 1–${currentDay} (grams)`}>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={visibleData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <defs>
                    {activeCrops.map(c => (
                      <linearGradient key={c.id} id={`bg-${c.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={c.color} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={c.color} stopOpacity={0.01} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="day" {...AXIS}
                    label={{ value: 'Mission Day', position: 'insideBottomRight', offset: -8, fill: '#4a6fa5', fontSize: 10 }} />
                  <YAxis {...AXIS}
                    label={{ value: 'Biomass (g)', angle: -90, position: 'insideLeft', offset: 10, fill: '#4a6fa5', fontSize: 10 }} />
                  <Tooltip content={<ChartTip unit=" g" />} />
                  <Legend wrapperStyle={LEGEND_STYLE} />
                  {disasterActive && (
                    <ReferenceLine x={disaster.day} stroke="#ff2d78" strokeDasharray="5 3" strokeWidth={1.5}
                      label={{ value: `⚠ D${disaster.day}`, position: 'insideTopRight', fill: '#ff2d78', fontSize: 10, fontFamily: "'IBM Plex Mono', monospace" }} />
                  )}
                  {activeCrops.map(c => (
                    <Area key={c.id} type="monotone"
                      dataKey={`${c.id}_biomass`} name={`${c.icon} ${c.name}`}
                      stroke={c.color} fill={`url(#bg-${c.id})`}
                      strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </Card>

            {/* Radar + Pie side by side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Card title="PERFORMANCE RADAR · MULTI-METRIC"
                sub={`Day ${currentDay} Normalized Score (0–100)`}>
                <ResponsiveContainer width="100%" height={320}>
                  <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                    <PolarGrid stroke="#162844" />
                    <PolarAngleAxis dataKey="m"
                      tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: "'IBM Plex Mono', monospace" }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                    {activeCrops.map(c => (
                      <Radar key={c.id} dataKey={c.id} name={`${c.icon} ${c.name}`}
                        stroke={c.color} fill={c.color} fillOpacity={0.08} strokeWidth={1.8} />
                    ))}
                    <Legend wrapperStyle={LEGEND_STYLE} />
                    <Tooltip {...TIP_STYLE} />
                  </RadarChart>
                </ResponsiveContainer>
              </Card>

              <Card title="WATER DISTRIBUTION · CONSUMPTION SHARE"
                sub={`Day ${currentDay} H₂O Allocation (L/day)`}>
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name"
                      cx="50%" cy="50%" innerRadius={72} outerRadius={116}
                      stroke="#050911" strokeWidth={2} paddingAngle={2}>
                      {pieData.map((e, i) => <Cell key={i} fill={e.color} fillOpacity={0.88} />)}
                    </Pie>
                    <Tooltip {...TIP_STYLE}
                      formatter={(v) => [`${Number(v).toFixed(2)} L/day`, 'Water']} />
                    <Legend wrapperStyle={LEGEND_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
            </div>
          </div>
        )}

        {/* ─── TAB 2: ROOT & NUTRIENT ─── */}
        {activeTab === 'nutrients' && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <Card title="NUTRIENT SOLUTION · ACIDITY" sub="Root Zone pH — 90-Day Monitoring">
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={visibleData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="day" {...AXIS} />
                  <YAxis domain={[4.5, 8.5]} {...AXIS}
                    label={{ value: 'pH', angle: -90, position: 'insideLeft', offset: 10, fill: '#4a6fa5', fontSize: 10 }} />
                  <Tooltip content={<ChartTip />} />
                  <Legend wrapperStyle={LEGEND_STYLE} />
                  <ReferenceLine y={5.5} stroke="#1e3a5f" strokeDasharray="6 4"
                    label={{ value: '5.5 LOW', position: 'insideLeft', fill: '#4a6fa5', fontSize: 9 }} />
                  <ReferenceLine y={7.0} stroke="#1e3a5f" strokeDasharray="6 4"
                    label={{ value: '7.0 HIGH', position: 'insideLeft', fill: '#4a6fa5', fontSize: 9 }} />
                  {disasterActive && <ReferenceLine x={disaster.day} stroke="#ff2d78" strokeDasharray="4 3" strokeWidth={1.5} />}
                  {activeCrops.map(c => (
                    <Line key={c.id} type="monotone" dataKey={`${c.id}_pH`}
                      name={`${c.icon} ${c.name}`} stroke={c.color} strokeWidth={2} dot={false} />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </Card>

            <Card title="ELECTRICAL CONDUCTIVITY" sub="Nutrient Concentration (EC) — mS/cm">
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={visibleData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="day" {...AXIS} />
                  <YAxis domain={[0, 5]} {...AXIS}
                    label={{ value: 'mS/cm', angle: -90, position: 'insideLeft', offset: 10, fill: '#4a6fa5', fontSize: 10 }} />
                  <Tooltip content={<ChartTip unit=" mS/cm" />} />
                  <Legend wrapperStyle={LEGEND_STYLE} />
                  {disasterActive && <ReferenceLine x={disaster.day} stroke="#ff2d78" strokeDasharray="4 3" strokeWidth={1.5} />}
                  {activeCrops.map(c => (
                    <Line key={c.id} type="monotone" dataKey={`${c.id}_EC`}
                      name={`${c.icon} ${c.name}`} stroke={c.color} strokeWidth={2} dot={false} />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </Card>

            <Card title="WATER USE EFFICIENCY" sub="WUE — g biomass per 100 g water">
              <ResponsiveContainer width="100%" height={250}>
                <ComposedChart data={visibleData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <defs>
                    {activeCrops.map(c => (
                      <linearGradient key={c.id} id={`wue-${c.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={c.color} stopOpacity={0.20} />
                        <stop offset="95%" stopColor={c.color} stopOpacity={0.01} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="day" {...AXIS} />
                  <YAxis {...AXIS} />
                  <Tooltip content={<ChartTip />} />
                  <Legend wrapperStyle={LEGEND_STYLE} />
                  {disasterActive && <ReferenceLine x={disaster.day} stroke="#ff2d78" strokeDasharray="4 3" strokeWidth={1.5} />}
                  {activeCrops.map(c => (
                    <Area key={c.id} type="monotone" dataKey={`${c.id}_WUE`}
                      name={`${c.icon} ${c.name}`} stroke={c.color}
                      fill={`url(#wue-${c.id})`} strokeWidth={1.8} dot={false} />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
          </div>
        )}

        {/* ─── TAB 3: ATMOSPHERE ─── */}
        {activeTab === 'atmosphere' && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <Card title="THERMAL & HYGROSCOPIC CONDITIONS"
              sub="Habitat Temperature (°C) & Relative Humidity (%)">
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={visibleData} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ff8c42" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#ff8c42" stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id="humGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#c77dff" stopOpacity={0.20} />
                      <stop offset="95%" stopColor="#c77dff" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="day" {...AXIS} />
                  <YAxis yAxisId="T" domain={[-15, 50]} {...AXIS}
                    label={{ value: '°C', angle: -90, position: 'insideLeft', offset: 10, fill: '#4a6fa5', fontSize: 10 }} />
                  <YAxis yAxisId="H" orientation="right" domain={[0, 100]} {...AXIS}
                    label={{ value: '% RH', angle: 90, position: 'insideRight', offset: 10, fill: '#4a6fa5', fontSize: 10 }} />
                  <Tooltip {...TIP_STYLE} />
                  <Legend wrapperStyle={LEGEND_STYLE} />
                  {disasterActive && (
                    <ReferenceLine yAxisId="T" x={disaster.day} stroke="#ff2d78" strokeDasharray="4 3" strokeWidth={1.5}
                      label={{ value: `⚠ DAY ${disaster.day}`, position: 'insideTopRight', fill: '#ff2d78', fontSize: 10 }} />
                  )}
                  <Area yAxisId="T" type="monotone" dataKey="temp"
                    name="Temperature (°C)" stroke="#ff8c42" fill="url(#tempGrad)" strokeWidth={2.2} dot={false} />
                  <Area yAxisId="H" type="monotone" dataKey="humidity"
                    name="Humidity (%)" stroke="#c77dff" fill="url(#humGrad)" strokeWidth={2.2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>

            <Card title="PHOTOSYNTHETICALLY ACTIVE RADIATION"
              sub="PAR Light Intensity — μmol/m²/s (16-hr photoperiod)">
              <ResponsiveContainer width="100%" height={250}>
                <ComposedChart data={visibleData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="parGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ffeb3b" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#ffeb3b" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="day" {...AXIS} />
                  <YAxis domain={[300, 560]} {...AXIS} />
                  <Tooltip {...TIP_STYLE} />
                  <Area type="monotone" dataKey="PAR" name="PAR (μmol/m²/s)"
                    stroke="#ffeb3b" fill="url(#parGrad)" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
          </div>
        )}

        {/* ─── TAB 4: SENSORS & NDVI ─── */}
        {activeTab === 'sensors' && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <Card title="IONIZING RADIATION TELEMETRY"
              sub="Galactic Cosmic Ray & Solar Particle Flux (mSv/day)">
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={visibleData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="radGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"  stopColor={disasterActive ? '#ff2d78' : '#64748b'} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={disasterActive ? '#ff2d78' : '#64748b'} stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="day" {...AXIS} />
                  <YAxis {...AXIS}
                    label={{ value: 'mSv/day', angle: -90, position: 'insideLeft', offset: 10, fill: '#4a6fa5', fontSize: 10 }} />
                  <Tooltip {...TIP_STYLE} />
                  {disasterActive && (
                    <ReferenceLine x={disaster.day} stroke="#ff2d78" strokeDasharray="4 3" strokeWidth={2}
                      label={{ value: `☢ ${disaster.type === 'solar_flare' ? 'FLARE EVENT' : 'HULL BREACH'}`, position: 'insideTopRight', fill: '#ff2d78', fontSize: 10, fontFamily: "'IBM Plex Mono', monospace" }} />
                  )}
                  <Area type="monotone" dataKey="radiation" name="Radiation (mSv/day)"
                    stroke={disasterActive ? '#ff2d78' : '#64748b'}
                    fill="url(#radGrad)" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>

            <Card title="NDVI · NORMALIZED DIFFERENCE VEGETATION INDEX"
              sub="Crop Health Score (0.0 = dead → 1.0 = peak vigor)">
              <ResponsiveContainer width="100%" height={290}>
                <ComposedChart data={visibleData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="day" {...AXIS} />
                  <YAxis domain={[0, 1]} {...AXIS} tickCount={6} />
                  <Tooltip content={<ChartTip />} />
                  <Legend wrapperStyle={LEGEND_STYLE} />
                  <ReferenceLine y={0.4} stroke="#1e3a5f" strokeDasharray="5 4"
                    label={{ value: 'STRESS THRESHOLD', position: 'insideTopRight', fill: '#4a6fa5', fontSize: 9 }} />
                  {disasterActive && (
                    <ReferenceLine x={disaster.day} stroke="#ff2d78" strokeDasharray="4 3" strokeWidth={1.5}
                      label={{ value: `⚠ D${disaster.day}`, position: 'insideTopRight', fill: '#ff2d78', fontSize: 10 }} />
                  )}
                  {activeCrops.map(c => (
                    <Line key={c.id} type="monotone" dataKey={`${c.id}_NDVI`}
                      name={`${c.icon} ${c.name}`} stroke={c.color} strokeWidth={2.2} dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }} />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </Card>

            <Card title="CALORIC OUTPUT · DAILY PRODUCTION"
              sub="Kilocalories Generated per Crop (kcal/day)">
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={visibleData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <defs>
                    {activeCrops.map(c => (
                      <linearGradient key={c.id} id={`kc-${c.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={c.color} stopOpacity={0.18} />
                        <stop offset="95%" stopColor={c.color} stopOpacity={0.01} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="day" {...AXIS} />
                  <YAxis {...AXIS} />
                  <Tooltip content={<ChartTip unit=" kcal" />} />
                  <Legend wrapperStyle={LEGEND_STYLE} />
                  {disasterActive && <ReferenceLine x={disaster.day} stroke="#ff2d78" strokeDasharray="4 3" strokeWidth={1.5} />}
                  {activeCrops.map(c => (
                    <Area key={c.id} type="monotone" dataKey={`${c.id}_kcal`}
                      name={`${c.icon} ${c.name}`} stroke={c.color}
                      fill={`url(#kc-${c.id})`} strokeWidth={2} dot={false} />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{
          marginTop: 28, paddingTop: 16, borderTop: '1px solid #162844',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 8,
        }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, color: '#2a4a7f', letterSpacing: 1.5 }}>
            LUNAR-PONICS MISSION CONTROL · ALPHA-1 · POLYCULTURE CLOSED-LOOP GROWTH SYSTEM
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, color: '#2a4a7f', letterSpacing: 1.5 }}>
            PRNG SEED: 42 · {CROPS.length} SPECIES · 90-DAY DETERMINISTIC SIMULATION
          </div>
        </div>

      </div>
    </div>
  );
}