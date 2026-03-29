/**
 * App.jsx — Lunar-Ponics Alpha-1 Mission Control
 * ═══════════════════════════════════════════════════════════════════
 * ARCHITECTURE NOTE:
 *   Heavy math → src/utils/simulationEngine.js
 *   QR Component → src/components/PlantPassportQR.jsx
 *   This file: UI orchestration only.
 * ═══════════════════════════════════════════════════════════════════
 */
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  ComposedChart, RadarChart, PieChart, BarChart, Bar,
  Line, Area, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import QRCode from 'qrcode';
import './App.css';

// ── Hard Engineering imports ──────────────────────────────────────
import {
  calculateMeshCompensation,
  calculateScarcityPriority,
  runMetabolicPID,
  detectEarlyStress,
  estimateYield,
  buildVitalityRadar,
} from './utils/simulationEngine';
import PlantPassportQR from './components/PlantPassportQR';

/* ════════════════════════════════════════════════════════════════════
   §1  SEEDED PRNG — Mulberry32
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
   §2  CROP MANIFEST (7 species)
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
  const meta   = {};
  CROPS.forEach(crop => {
    const initR = mulberry32(crop.seed);
    meta[crop.id] = { x0: 28 + initR() * 18, rng: mulberry32(crop.seed + 500) };
  });
  const rows = [];
  for (let d = 1; d <= DAYS; d++) {
    let dMult = 1, radBoost = 0, tempShift = 0, humShift = 0;
    if (disasterDay !== null && d >= disasterDay) {
      const e     = d - disasterDay;
      const decay = (type) => type === 'solar_flare' ? Math.max(0, 1 - e * 0.038) : Math.max(0, 1 - e * 0.032);
      if (disasterType === 'solar_flare') {
        const dc = decay('solar_flare');
        dMult = Math.max(0.07, 1 - e * 0.055); radBoost = 11.5 * dc; tempShift = 15 * dc;
      } else if (disasterType === 'hull_leak') {
        const dc = decay('hull_leak');
        dMult = Math.max(0.05, 1 - e * 0.065); tempShift = -18 * dc; humShift = -38 * dc;
      }
    }
    const PAR      = +(400 + Math.sin(d / 9  * Math.PI) * 60 + envRng() * 40 - 20).toFixed(1);
    const temp     = +(22  + Math.sin(d / 14 * Math.PI) * 1.5 + (envRng() * 2 - 1) + tempShift).toFixed(1);
    const humidity = +Math.max(10, Math.min(95, 67 + Math.sin(d / 12 * Math.PI) * 5 + (envRng() * 6 - 3) + humShift)).toFixed(1);
    const radiation = +Math.max(0, 0.18 + envRng() * 0.12 + radBoost).toFixed(3);
    const row = { day: d, temp, humidity, PAR, radiation };
    CROPS.forEach(crop => {
      const { x0, rng } = meta[crop.id];
      const logistic    = crop.maxB / (1 + Math.exp(-crop.r * (d - x0)));
      const biomass     = +Math.max(0, logistic * (0.93 + rng() * 0.14) * dMult).toFixed(1);
      const gf          = biomass / crop.maxB;
      const water       = +Math.max(0.05, crop.wB * (0.35 + gf * 0.95) * (0.90 + rng() * 0.20)).toFixed(2);
      const WUE         = +(water > 0 ? biomass / (water * 100) : 0).toFixed(4);
      const kcal        = +(biomass * crop.kcal100 / 100 * (0.94 + rng() * 0.12)).toFixed(1);
      const stressDrift = dMult < 0.70 ? rng() * 0.80 - 0.40 : 0;
      const pH          = +Math.max(4.5, Math.min(8.5, crop.optPH + (rng() * 0.50 - 0.25) + stressDrift)).toFixed(2);
      const EC          = +Math.max(0.3, Math.min(4.5, crop.optEC + (rng() * 0.40 - 0.20))).toFixed(2);
      const NDVI        = +Math.max(0,   Math.min(0.98, 0.18 + gf * 0.72 * dMult + rng() * 0.06 - 0.03)).toFixed(3);
      row[`${crop.id}_biomass`] = biomass;
      row[`${crop.id}_kcal`]   = kcal;
      row[`${crop.id}_water`]  = water;
      row[`${crop.id}_WUE`]    = WUE;
      row[`${crop.id}_pH`]     = pH;
      row[`${crop.id}_EC`]     = EC;
      row[`${crop.id}_NDVI`]   = NDVI;
    });
    rows.push(row);
  }
  return rows;
}

/* ════════════════════════════════════════════════════════════════════
   §4  SENSOR SLIDER CONFIGURATION
════════════════════════════════════════════════════════════════════ */
const SENSOR_CONFIG = [
  { key: 'temp',        label: 'TEMPERATURE',    unit: '°C',         min: 15,  max: 40,   step: 0.5, color: '#ff8c42', icon: '🌡️' },
  { key: 'co2',         label: 'CO₂',            unit: 'ppm',        min: 400, max: 2000, step: 10,  color: '#00cfff', icon: '💨' },
  { key: 'humidity',    label: 'HUMIDITY',       unit: '%',          min: 20,  max: 95,   step: 1,   color: '#c77dff', icon: '💧' },
  { key: 'ethylene',    label: 'ETHYLENE',       unit: 'ppb',        min: 0,   max: 100,  step: 1,   color: '#ff2d78', icon: '⚗️' },
  { key: 'ph',          label: 'pH',             unit: '',           min: 4.5, max: 8.5,  step: 0.1, color: '#00ff9d', icon: '🧪' },
  { key: 'ec',          label: 'ELEC. CONDUCT.', unit: 'mS/cm',      min: 0.5, max: 4.5,  step: 0.1, color: '#daa520', icon: '⚡' },
  { key: 'dissolvedO2', label: 'DISSOLVED O₂',  unit: 'mg/L',       min: 2,   max: 12,   step: 0.5, color: '#64b5f6', icon: '🌊' },
  { key: 'ppfd',        label: 'PPFD (LIGHT)',   unit: 'μmol/m²/s', min: 200, max: 800,  step: 5,   color: '#ffeb3b', icon: '☀️' },
];

const SENSOR_DEFAULTS = {
  temp: 22, co2: 800, humidity: 67, ethylene: 10,
  ph: 6.2,  ec: 1.8,  dissolvedO2: 8, ppfd: 400,
};

/* ════════════════════════════════════════════════════════════════════
   §5  SHARED CHART HELPERS
════════════════════════════════════════════════════════════════════ */
function ChartTip({ active, payload, label, unit = '' }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#0a1628', border: '1px solid #1e3a5f', borderRadius: 8,
      padding: '9px 13px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
      boxShadow: '0 8px 32px rgba(0,207,255,0.18)' }}>
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

function Card({ title, sub, children, style = {}, accent = '#162844' }) {
  return (
    <div style={{ background: '#0c1322', border: `1px solid ${accent}`,
      borderRadius: 12, padding: '18px 22px',
      boxShadow: '0 4px 24px rgba(0,0,0,0.4)', ...style }}>
      {title && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: '#4a6fa5', letterSpacing: 2.5,
            fontFamily: "'IBM Plex Mono', monospace", marginBottom: 3 }}>{title}</div>
          {sub && <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', letterSpacing: 0.3 }}>{sub}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

const AXIS         = { stroke: '#162844', tick: { fill: '#4a6fa5', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10 } };
const GRID         = { stroke: '#162844', strokeDasharray: '3 3' };
const LEGEND_STYLE = { fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, paddingTop: 8 };
const TIP_STYLE    = { contentStyle: { background: '#0a1628', border: '1px solid #1e3a5f', borderRadius: 8, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 } };

/* ════════════════════════════════════════════════════════════════════
   §6  SUB-COMPONENTS: Engineering Tab Panels
════════════════════════════════════════════════════════════════════ */

/** Left panel: 8 sensor sliders + Node A fail + Scarcity toggle */
function SensorPanel({ sensors, setSensors, nodeAFailed, setNodeAFailed, scarcityMode, setScarcityMode, engineData }) {
  const { mesh, scarcity, pid } = engineData;

  const handleSlider = useCallback((key, val) => {
    setSensors(prev => ({ ...prev, [key]: +val }));
  }, [setSensors]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* ── Node A + Scarcity toggles ── */}
      <Card title="NETWORK & RESOURCE CONTROL" accent="#1e3a5f" style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* FAIL NODE ALPHA */}
          <button
            onClick={() => setNodeAFailed(p => !p)}
            className={`eng-toggle ${nodeAFailed ? 'active' : ''}`}
            style={{
              borderColor: nodeAFailed ? '#ff2d78' : '#1e3a5f',
              color:       nodeAFailed ? '#ff2d78' : '#4a6fa5',
            }}
          >
            <span style={{ fontSize: 14 }}>{nodeAFailed ? '🔴' : '🟢'}</span>
            FAIL NODE ALPHA
            {nodeAFailed && (
              <span style={{ marginLeft: 'auto', fontSize: 8, letterSpacing: 1,
                background: 'rgba(255,45,120,0.15)', padding: '1px 5px', borderRadius: 3 }}>
                OFFLINE
              </span>
            )}
          </button>

          {/* Mesh compensation readout */}
          {nodeAFailed && (
            <div className="mesh-active" style={{ padding: '8px 12px', borderRadius: 7, border: '1px solid rgba(0,207,255,0.4)',
              background: 'rgba(0,207,255,0.06)', fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#00cfff', letterSpacing: 1 }}>
              ↗ MESH COMPENSATION: PPFD ×{mesh.ppfdMultiplier.toFixed(2)} · CO₂ ×{mesh.co2Multiplier.toFixed(2)}
              <br />ACTIVE NODES: {mesh.activeNodes}/3
            </div>
          )}

          {/* SCARCITY MODE */}
          <button
            onClick={() => setScarcityMode(p => !p)}
            className={`eng-toggle ${scarcityMode ? 'active' : ''}`}
            style={{
              borderColor: scarcityMode ? '#ffb300' : '#1e3a5f',
              color:       scarcityMode ? '#ffb300' : '#4a6fa5',
            }}
          >
            <span style={{ fontSize: 14 }}>{scarcityMode ? '⚠️' : '🌿'}</span>
            SCARCITY MODE
            {scarcityMode && (
              <span style={{ marginLeft: 'auto', fontSize: 8, letterSpacing: 1,
                background: 'rgba(255,179,0,0.15)', padding: '1px 5px', borderRadius: 3 }}>
                ACTIVE
              </span>
            )}
          </button>

          {/* Scarcity ranking readout */}
          {scarcityMode && (
            <div style={{ padding: '8px 12px', borderRadius: 7, border: '1px solid rgba(255,179,0,0.3)',
              background: 'rgba(255,179,0,0.05)' }}>
              {scarcity.ranked.map((c, i) => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, marginBottom: i < 2 ? 5 : 0,
                  color: c.dormant ? '#ff2d78' : '#94a3b8' }}>
                  <span>#{c.priority} {c.icon} {c.name}</span>
                  <span style={{ color: c.dormant ? '#ff2d78' : '#ffb300' }}>
                    {c.dormant ? 'DORMANT' : `${c.sharePercent}%`}
                  </span>
                </div>
              ))}
              {scarcity.lettuceDormancy && (
                <div style={{ marginTop: 7, padding: '4px 8px', borderRadius: 4,
                  background: 'rgba(255,45,120,0.10)', border: '1px solid rgba(255,45,120,0.3)',
                  fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, color: '#ff2d78', letterSpacing: 0.8 }}>
                  {scarcity.alert}
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* ── 8 Sensor sliders ── */}
      <Card title="SENSOR TELEMETRY — LIVE INPUT" accent="#1e3a5f" style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {SENSOR_CONFIG.map(cfg => {
            const val = sensors[cfg.key];
            const pct = ((val - cfg.min) / (cfg.max - cfg.min)) * 100;
            return (
              <div key={cfg.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: 1.5, color: '#4a6fa5' }}>
                    {cfg.icon} {cfg.label}
                  </span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 700, color: cfg.color }}>
                    {val}{cfg.unit}
                  </span>
                </div>
                <div style={{ position: 'relative', height: 4, borderRadius: 2, background: '#0f1e35', cursor: 'pointer' }}>
                  {/* filled track */}
                  <div style={{ position: 'absolute', left: 0, top: 0, height: '100%',
                    width: `${pct}%`, borderRadius: 2, background: cfg.color,
                    boxShadow: `0 0 6px ${cfg.color}88`, transition: 'width 0.15s' }} />
                  <input
                    type="range"
                    min={cfg.min} max={cfg.max} step={cfg.step}
                    value={val}
                    onChange={e => handleSlider(cfg.key, e.target.value)}
                    style={{
                      position: 'absolute', inset: '-5px 0',
                      width: '100%', opacity: 0, cursor: 'pointer', zIndex: 2,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Reset button */}
        <button
          onClick={() => setSensors(SENSOR_DEFAULTS)}
          style={{ marginTop: 14, width: '100%', padding: '7px 0', borderRadius: 6,
            border: '1px solid #1e3a5f', background: 'transparent', color: '#4a6fa5',
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: 1.5, cursor: 'pointer',
            transition: 'all 0.18s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#2a4a7f'; e.currentTarget.style.color = '#6a8fbd'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e3a5f'; e.currentTarget.style.color = '#4a6fa5'; }}
        >
          ↺ RESET TO DEFAULTS
        </button>
      </Card>

      {/* ── PID Status readout ── */}
      <Card title="METABOLIC PID · LIVE STATUS" accent={pid.isUnderStress ? 'rgba(255,45,120,0.45)' : '#1e3a5f'}
        style={{ padding: '14px 18px' }} >
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: pid.isUnderStress ? '#ff2d78' : '#00ff9d',
          letterSpacing: 1, marginBottom: 10, padding: '5px 8px', borderRadius: 4,
          background: pid.isUnderStress ? 'rgba(255,45,120,0.08)' : 'rgba(0,255,157,0.06)',
          border: `1px solid ${pid.isUnderStress ? 'rgba(255,45,120,0.3)' : 'rgba(0,255,157,0.2)'}` }}>
          {pid.status}
        </div>
        {[
          { label: 'NDVI', value: pid.currentNDVI, color: pid.currentNDVI < 0.4 ? '#ff2d78' : '#00ff9d', suffix: '' },
          { label: 'ERROR', value: pid.error, color: '#00cfff', suffix: '' },
        ].map(({ label, value, color, suffix }) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 9, color: '#4a6fa5', letterSpacing: 1.5 }}>{label}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color, fontFamily: "'IBM Plex Mono', monospace" }}>
              {value}{suffix}
            </span>
          </div>
        ))}
        {[
          { label: 'LIGHT OUTPUT', val: pid.lightOutput,    color: '#ffeb3b' },
          { label: 'NUTRIENT OUT', val: pid.nutrientOutput, color: '#00ff9d' },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontSize: 8, color: '#4a6fa5', letterSpacing: 1.2, fontFamily: "'IBM Plex Mono', monospace" }}>{label}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color, fontFamily: "'IBM Plex Mono', monospace" }}>{val}%</span>
            </div>
            <div className="pid-bar-track">
              <div className="pid-bar-fill" style={{ width: `${val}%`, background: color, boxShadow: `0 0 6px ${color}88` }} />
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

/** Right panel: Yield BarChart + System Vitality RadarChart */
function EngineeringCharts({ engineData }) {
  const { yieldData, vitalityRadar, stress } = engineData;

  // BarChart data
  const barData = yieldData.map(c => ({
    name:    `${c.icon} ${c.name.split(' ')[0]}`,
    yield:   c.yield,
    color:   c.color,
    dormant: c.dormant,
  }));

  // Radar for system vitality (single polygon)
  const radarChartData = vitalityRadar;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Yield BarChart ── */}
      <Card title="REAL-TIME YIELD ESTIMATE" sub="Sensor-driven biomass output per crop (g/cycle)"
        accent={stress.anomalyDetected ? 'rgba(255,45,120,0.35)' : '#162844'}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={barData} margin={{ top: 8, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="name" {...AXIS} tick={{ ...AXIS.tick, fontSize: 9 }} interval={0} />
            <YAxis {...AXIS} label={{ value: 'g', angle: -90, position: 'insideLeft', offset: 12, fill: '#4a6fa5', fontSize: 10 }} />
            <Tooltip
              contentStyle={{ ...TIP_STYLE.contentStyle }}
              formatter={(v, n, props) => [
                props.payload.dormant ? '— DORMANT' : `${v} g`,
                'Yield'
              ]}
            />
            <Bar dataKey="yield" radius={[4, 4, 0, 0]}>
              {barData.map((entry, idx) => (
                <Cell
                  key={idx}
                  fill={entry.dormant ? '#1e3a5f' : entry.color}
                  opacity={entry.dormant ? 0.4 : 0.85}
                  style={{ filter: entry.dormant ? 'none' : `drop-shadow(0 0 4px ${entry.color}66)` }}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {/* Dormancy note */}
        {yieldData.some(c => c.dormant) && (
          <div style={{ marginTop: 8, fontFamily: "'IBM Plex Mono', monospace", fontSize: 8.5, color: '#ff2d78',
            letterSpacing: 1, padding: '4px 8px', borderRadius: 4,
            background: 'rgba(255,45,120,0.07)', border: '1px solid rgba(255,45,120,0.2)' }}>
            🥬 DORMANT CROPS EXCLUDED FROM YIELD (SCARCITY PROTOCOL ACTIVE)
          </div>
        )}
      </Card>

      {/* ── System Vitality RadarChart ── */}
      <Card title="SYSTEM VITALITY RADAR" sub="Sensor proximity to biological optimum (0 → 100)">
        <ResponsiveContainer width="100%" height={300}>
          <RadarChart data={radarChartData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
            <PolarGrid stroke="#162844" />
            <PolarAngleAxis dataKey="axis"
              tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: "'IBM Plex Mono', monospace" }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar name="System Vitality" dataKey="value"
              stroke="#00FF41" fill="#00FF41" fillOpacity={0.10} strokeWidth={2}
              dot={{ fill: '#00FF41', r: 3 }} />
            <Tooltip contentStyle={TIP_STYLE.contentStyle}
              formatter={(v) => [`${v}`, 'Score']} />
          </RadarChart>
        </ResponsiveContainer>
      </Card>

      {/* ── Prophet Transpiration Alert ── */}
      <Card
        title="PROPHET MODULE · TRANSPIRATION RATIO"
        accent={stress.anomalyDetected ? 'rgba(255,45,120,0.45)' : '#162844'}
        style={{ padding: '14px 22px' }}
      >
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#4a6fa5', letterSpacing: 2, marginBottom: 4 }}>
              TRANSPIRATION RATIO
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 32, fontWeight: 700,
              color: stress.anomalyDetected ? '#ff2d78' : '#00ff9d', lineHeight: 1 }}>
              {stress.ratio}
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8.5, color: '#4a6fa5',
              letterSpacing: 1, marginTop: 4 }}>
              THRESHOLD: 0.9800
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#4a6fa5', letterSpacing: 2, marginBottom: 6 }}>
              ANOMALY STATUS
            </div>
            <div
              className={stress.anomalyDetected ? 'anomaly-alert' : ''}
              style={{ padding: '8px 14px', borderRadius: 7, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace",
                fontWeight: 700, letterSpacing: 0.8,
                color:      stress.anomalyDetected ? '#ff2d78' : '#00ff9d',
                background: stress.anomalyDetected ? 'rgba(255,45,120,0.10)' : 'rgba(0,255,157,0.08)',
                border:    `1px solid ${stress.anomalyDetected ? 'rgba(255,45,120,0.4)' : 'rgba(0,255,157,0.25)'}` }}>
              {stress.anomalyDetected ? `⚠️ ANOMALY DETECTED (${stress.stressConfidence}% confidence)` : '✅ TRANSPIRATION NOMINAL'}
            </div>
            {stress.alert && (
              <div style={{ marginTop: 6, fontFamily: "'IBM Plex Mono', monospace", fontSize: 8.5, color: '#ff2d78', letterSpacing: 1 }}>
                {stress.alert}
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   §7  MAIN APPLICATION
════════════════════════════════════════════════════════════════════ */
export default function App() {

  /* ── Existing simulation state ── */
  const [activeTab,     setActiveTab]     = useState('command');
  const [selectedCrops, setSelectedCrops] = useState(new Set(CROPS.map(c => c.id)));
  const [disaster,      setDisaster]      = useState({ day: null, type: null });
  const [showModal,     setShowModal]     = useState(false);
  const [currentDay,    setCurrentDay]    = useState(90);
  const [qrDataUrl,     setQrDataUrl]     = useState('');

  /* ── Hard Engineering state ── */
  const [sensors,      setSensors]      = useState(SENSOR_DEFAULTS);
  const [nodeAFailed,  setNodeAFailed]  = useState(false);
  const [scarcityMode, setScarcityMode] = useState(false);

  /* ── Inject Google Fonts ── */
  useEffect(() => {
    if (document.getElementById('lp-fonts')) return;
    const link = document.createElement('link');
    link.id   = 'lp-fonts';
    link.rel  = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;600&family=Orbitron:wght@700;900&display=swap';
    document.head.appendChild(link);
  }, []);

  /* ── QR mission debrief (existing) ── */
  useEffect(() => {
    const envUrl = import.meta.env.VITE_MISSION_DEBRIEF_URL;
    const target = (typeof envUrl === 'string' && envUrl.trim())
      ? envUrl.trim()
      : (() => {
          const base = import.meta.env.BASE_URL || '/';
          const u = new URL(base, window.location.origin);
          u.pathname = u.pathname.replace(/\/?$/, '/mission-debrief.html');
          return u.href;
        })();
    let cancelled = false;
    QRCode.toDataURL(target, { width: 320, margin: 1, color: { dark: '#00FF41', light: '#050911' }, errorCorrectionLevel: 'M' })
      .then(dataUrl => { if (!cancelled) setQrDataUrl(dataUrl); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  /* ── 90-day simulation data ── */
  const allData     = useMemo(() => generateData(disaster.day, disaster.type), [disaster]);
  const visibleData = useMemo(() => allData.slice(0, currentDay), [allData, currentDay]);

  /* ── Aggregate simulation stats ── */
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
    return { tBioKg: tBioKg.toFixed(2), tWater: tWater.toFixed(1), tKcal: Math.round(tKcal).toLocaleString(), payloadM, bestWUE };
  }, [allData]);

  /* ── Radar data ── */
  const radarData = useMemo(() => {
    const snap = allData[Math.min(currentDay, allData.length) - 1];
    if (!snap) return [];
    const maxB = Math.max(1, ...CROPS.map(c => snap[`${c.id}_biomass`] || 0));
    const maxK = Math.max(1, ...CROPS.map(c => snap[`${c.id}_kcal`]    || 0));
    const maxW = Math.max(1e-9, ...CROPS.map(c => snap[`${c.id}_WUE`]  || 0));
    const entry = (key, fn) => ({ m: key, ...Object.fromEntries(CROPS.map(c => [c.id, fn(c, snap)])) });
    return [
      entry('Biomass',   (c, s) => +((s[`${c.id}_biomass`] || 0) / maxB * 100).toFixed(1)),
      entry('Kcal',      (c, s) => +((s[`${c.id}_kcal`]    || 0) / maxK * 100).toFixed(1)),
      entry('WUE',       (c, s) => +((s[`${c.id}_WUE`]     || 0) / maxW * 100).toFixed(1)),
      entry('NDVI',      (c, s) => +((s[`${c.id}_NDVI`]    || 0)       * 100).toFixed(1)),
      entry('pH Stab.',  (c, s) => { const dev = Math.abs((s[`${c.id}_pH`] || c.optPH) - c.optPH); return +Math.max(0, (1 - dev / 2) * 100).toFixed(1); }),
    ];
  }, [allData, currentDay]);

  /* ── Pie data ── */
  const pieData = useMemo(() => {
    const snap = allData[Math.min(currentDay, allData.length) - 1];
    if (!snap) return [];
    return CROPS.filter(c => selectedCrops.has(c.id)).map(c => ({ name: c.name, value: +(snap[`${c.id}_water`] || 0).toFixed(2), color: c.color }));
  }, [allData, currentDay, selectedCrops]);

  /* ════════════════════════════════════════════════════════════════
     §8  HARD ENGINEERING DATA FLOW (useMemo → simulationEngine.js)
  ════════════════════════════════════════════════════════════════ */
  const engineData = useMemo(() => {
    // Mesh compensation
    const mesh = calculateMeshCompensation(nodeAFailed);

    // Scarcity priority (use humidity as proxy for water availability when scarcity mode is on)
    const waterFraction = scarcityMode ? sensors.humidity / 100 : 1.0;
    const scarcity      = calculateScarcityPriority(waterFraction);

    // Derive live NDVI from sensor state (proxy for real sensor fusion)
    const ndvi = Math.max(0, Math.min(0.98,
      0.18
      + (sensors.ppfd / 600)    * 0.28
      + (sensors.co2  / 2000)   * 0.18
      + Math.max(0, 1 - Math.abs(sensors.ph - 6.2) / 2) * 0.22
      + (sensors.humidity / 100) * 0.12
      - (sensors.ethylene / 200) * 0.08
    ));

    // PID controller
    const pid = runMetabolicPID(ndvi, 0.70);

    // Yield estimation (honours mesh multiplier and scarcity dormancy)
    const yieldData = estimateYield(
      sensors,
      mesh.ppfdMultiplier,
      scarcityMode ? scarcity.ranked : null,
    );

    // Total biomass from live sensor yield
    const totalBiomassKg = yieldData.reduce((s, c) => s + c.yield, 0) / 1000;

    // Prophet transpiration anomaly detection
    // Predicted = baseline model; actual = sensor-modified
    const predictedTranspiration = sensors.temp * 0.8 + sensors.humidity * 0.5;
    const actualTranspiration    = predictedTranspiration
      * (0.92 + (sensors.dissolvedO2 / 12) * 0.10 - (sensors.ethylene / 200) * 0.06);
    const stress = detectEarlyStress(actualTranspiration, predictedTranspiration, totalBiomassKg);

    // System vitality radar
    const vitalityRadar = buildVitalityRadar(sensors);

    // Real-time payload savings headline
    const realtimePayloadM = stress.payloadSavingsM;

    // Plant passport data for the primary crop (top scarcity priority)
    const topCrop    = scarcity.ranked[0];
    const ndviHealth = Math.round(ndvi * 100);
    const passportData = {
      plantId:          `LP-${topCrop.id.toUpperCase().slice(0, 6)}-${String(Math.round(ndvi * 1000)).padStart(3, '0')}`,
      survivalPriority: ndvi < 0.4 ? 'CRITICAL' : ndvi < 0.65 ? 'HIGH' : 'NOMINAL',
      healthScore:      ndviHealth,
    };

    return { mesh, scarcity, pid, yieldData, stress, vitalityRadar, realtimePayloadM, passportData, ndvi, totalBiomassKg };
  }, [sensors, nodeAFailed, scarcityMode]);

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
    { id: 'command',     label: '🌍 Command Center'  },
    { id: 'nutrients',   label: '🧪 Root & Nutrient'  },
    { id: 'atmosphere',  label: '🌡️ Atmosphere'       },
    { id: 'sensors',     label: '📡 Sensors & NDVI'   },
    { id: 'engineering', label: '⚙️ Hard Engineering'  },  // NEW
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
        .crop-pill { cursor: pointer; border: 1px solid; border-radius: 20px;
          padding: 5px 13px; font-size: 12px; font-weight: 600;
          font-family: 'Rajdhani', sans-serif; letter-spacing: 0.6px;
          transition: all 0.18s ease; background: transparent; }
        .crop-pill:hover { transform: translateY(-1px); }
        .tab-btn { background: none; border: none; cursor: pointer;
          font-family: 'Rajdhani', sans-serif; font-size: 14px; font-weight: 600;
          letter-spacing: 0.6px; padding: 11px 22px; color: #4a6fa5;
          border-bottom: 2px solid transparent; transition: all 0.18s ease; }
        .tab-btn:hover  { color: #00cfff; }
        .tab-btn.active { color: #00cfff; border-bottom-color: #00cfff; }
        .tab-btn.eng-tab        { color: #4a6fa5; }
        .tab-btn.eng-tab:hover  { color: #00FF41; }
        .tab-btn.eng-tab.active { color: #00FF41; border-bottom-color: #00FF41; }
        .dis-btn { border: 1px solid; border-radius: 7px; padding: 9px 17px;
          cursor: pointer; font-weight: 700; letter-spacing: 0.5px;
          font-family: 'Rajdhani', sans-serif; font-size: 13px;
          transition: all 0.18s ease; background: transparent; }
        .dis-btn:hover { transform: translateY(-1px); filter: brightness(1.2); }
        .modal-overlay { position: fixed; inset: 0; background: rgba(5,9,17,0.88);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000; backdrop-filter: blur(5px); }
        @keyframes pulse-badge {
          0%,100% { box-shadow: 0 0 6px rgba(255,45,120,0.4); }
          50%      { box-shadow: 0 0 20px rgba(255,45,120,0.8), 0 0 40px rgba(255,45,120,0.3); } }
        .disaster-badge { animation: pulse-badge 1.8s infinite; }
        @keyframes fade-in { from { opacity:0; transform: translateY(6px); } to { opacity:1; transform:none; } }
        .fade-in { animation: fade-in 0.3s ease both; }
        .scanlines { position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background: repeating-linear-gradient(0deg, transparent, transparent 2px,
            rgba(0,207,255,0.012) 2px, rgba(0,207,255,0.012) 4px); }
      `}</style>

      <div className="scanlines" />

      {/* ════════════════════════════════════════════════════════════
          MODAL — QR Mission Report
      ════════════════════════════════════════════════════════════ */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="fade-in" onClick={e => e.stopPropagation()}
            style={{ background: '#0c1322', border: '1px solid #00cfff', borderRadius: 14,
              padding: 32, width: 500, position: 'relative',
              boxShadow: '0 0 60px rgba(0,207,255,0.2), 0 0 120px rgba(0,207,255,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 10, color: '#4a6fa5', letterSpacing: 3, fontFamily: "'IBM Plex Mono', monospace", marginBottom: 4 }}>CLASSIFIED MISSION REPORT</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: '#00cfff', fontFamily: "'Orbitron', monospace", letterSpacing: 1.5 }}>LUNAR-PONICS α-1</div>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: '#4a6fa5', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: '2px 6px' }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
              <div style={{ flexShrink: 0 }}>
                <div className="qr-container">
                  <p className="qr-label">SCAN FOR COMMANDER LOG</p>
                  {qrDataUrl
                    ? <img src={qrDataUrl} alt="Mission Debrief QR" className="qr-image" />
                    : <div className="qr-image qr-placeholder">ENCODING UPLINK…</div>}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                {[
                  { label: 'BEST WUE CROP',  value: `${stats.bestWUE.icon} ${stats.bestWUE.name}`, color: stats.bestWUE.color },
                  { label: 'PAYLOAD SAVED',   value: `$${stats.payloadM} M`,                        color: '#00cfff' },
                  { label: 'TOTAL KCAL',      value: stats.tKcal,                                    color: '#00ff9d' },
                  { label: 'WATER CONSUMED',  value: `${stats.tWater} L`,                           color: '#c77dff' },
                  { label: 'TOTAL BIOMASS',   value: `${stats.tBioKg} kg`,                          color: '#ff8c42' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ marginBottom: 13 }}>
                    <div style={{ fontSize: 9, color: '#4a6fa5', letterSpacing: 2.5, fontFamily: "'IBM Plex Mono', monospace", marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 17, fontWeight: 700, color, fontFamily: "'IBM Plex Mono', monospace" }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 20, padding: '11px 14px', background: '#050911', borderRadius: 7,
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
              color: disasterActive ? '#ff2d78' : '#00ff9d',
              borderLeft: `3px solid ${disasterActive ? '#ff2d78' : '#00ff9d'}` }}>
              {disasterActive
                ? `⚠️ CATASTROPHIC EVENT: ${disaster.type === 'solar_flare' ? 'SOLAR FLARE' : 'HULL LEAK'} — DAY ${disaster.day}`
                : '✅  MISSION NOMINAL — NO CATASTROPHIC EVENTS RECORDED'}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          HEADER — sticky, includes PlantPassportQR + payload savings
      ════════════════════════════════════════════════════════════ */}
      <header style={{ background: 'rgba(12,19,34,0.96)', borderBottom: '1px solid #162844',
        padding: '10px 28px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 200,
        backdropFilter: 'blur(10px)' }}>

        {/* Left: branding */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <span style={{ fontSize: 28 }}>🌙</span>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 3, color: '#00cfff',
              fontFamily: "'Orbitron', monospace", lineHeight: 1 }}>LUNAR-PONICS</div>
            <div style={{ fontSize: 9.5, color: '#4a6fa5', fontFamily: "'IBM Plex Mono', monospace",
              letterSpacing: 1.5, marginTop: 2 }}>TUA STATION · MISSION CONTROL · 90-DAY POLYCULTURE SIMULATION</div>
          </div>
          {disasterActive && (
            <div className="disaster-badge" style={{ background: 'rgba(255,45,120,0.12)', border: '1px solid #ff2d78',
              borderRadius: 5, padding: '5px 13px', color: '#ff2d78',
              fontSize: 12, fontWeight: 700, letterSpacing: 1, fontFamily: "'IBM Plex Mono', monospace" }}>
              ⚠️ {disaster.type === 'solar_flare' ? 'SOLAR FLARE' : 'HULL BREACH'} · DAY {disaster.day}
            </div>
          )}
          {nodeAFailed && (
            <div style={{ background: 'rgba(255,45,120,0.10)', border: '1px solid rgba(255,45,120,0.5)',
              borderRadius: 5, padding: '5px 13px', color: '#ff2d78',
              fontSize: 11, fontWeight: 700, letterSpacing: 1, fontFamily: "'IBM Plex Mono', monospace",
              animation: 'pulse-badge 1.8s infinite' }}>
              ⚡ NODE A OFFLINE
            </div>
          )}
        </div>

        {/* Center: real-time payload savings from engineering engine */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8.5, color: '#4a6fa5', letterSpacing: 2, marginBottom: 2 }}>
              RT PAYLOAD SAVINGS
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 20, fontWeight: 700, color: '#00FF41',
              textShadow: '0 0 12px rgba(0,255,65,0.5)', letterSpacing: -0.5 }}>
              ${engineData.realtimePayloadM}M
            </div>
          </div>
          <div style={{ width: 1, height: 36, background: '#162844' }} />

          {/* PlantPassportQR — compact in header */}
          <div style={{ transform: 'scale(0.72)', transformOrigin: 'center' }}>
            <PlantPassportQR plantData={engineData.passportData} />
          </div>
        </div>

        {/* Right: telemetry ticker + mission day + report btn */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {(() => {
            const snap = allData[Math.min(currentDay, allData.length) - 1];
            return snap ? (
              <div style={{ display: 'flex', gap: 16, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10 }}>
                {[
                  { k: 'TEMP', v: `${snap.temp}°C`,    c: '#ff8c42' },
                  { k: 'RH',   v: `${snap.humidity}%`, c: '#c77dff' },
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

          <button onClick={() => setShowModal(true)}
            style={{ background: 'transparent', border: '1px solid #00cfff', borderRadius: 7,
              color: '#00cfff', padding: '9px 20px', cursor: 'pointer',
              fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: 1, transition: 'all 0.18s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,207,255,0.1)'; e.currentTarget.style.boxShadow = '0 0 20px rgba(0,207,255,0.2)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent';          e.currentTarget.style.boxShadow = 'none'; }}>
            📋 GENERATE REPORT
          </button>
        </div>
      </header>

      {/* ════════════════════════════════════════════════════════════
          MAIN CONTENT
      ════════════════════════════════════════════════════════════ */}
      <div style={{ padding: '18px 28px', maxWidth: 1440, margin: '0 auto', position: 'relative', zIndex: 1 }}>

        {/* ── NASA Payload Economics Banner ── */}
        <div style={{ background: 'linear-gradient(135deg, #0c1a30 0%, #0f2040 40%, #0c1a30 100%)',
          border: '1px solid #00cfff', borderRadius: 14, padding: '22px 30px',
          marginBottom: 16, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 24, flexWrap: 'wrap',
          boxShadow: '0 0 40px rgba(0,207,255,0.12), inset 0 1px 0 rgba(0,207,255,0.08)',
          position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: '5%', top: '50%', transform: 'translateY(-50%)',
            width: 320, height: 320, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(0,207,255,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div>
            <div style={{ fontSize: 9.5, color: '#4a6fa5', letterSpacing: 3, fontFamily: "'IBM Plex Mono', monospace", marginBottom: 8 }}>
              NASA PAYLOAD ECONOMICS · LUNAR GATEWAY PROTOCOL
            </div>
            <div style={{ fontSize: 52, fontWeight: 700, color: '#00cfff', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: -1, lineHeight: 1 }}>
              ${stats.payloadM}M
            </div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 6, letterSpacing: 0.4 }}>
              saved via in-situ resource production over 90-day cycle
            </div>
          </div>
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
            {[
              { label: 'TOTAL BIOMASS',  value: `${stats.tBioKg} kg`,                            color: '#ff8c42' },
              { label: 'CALORIC OUTPUT', value: stats.tKcal,                                      color: '#00ff9d' },
              { label: 'H₂O CONSUMED',  value: `${stats.tWater} L`,                             color: '#c77dff' },
              { label: 'BEST WUE CROP', value: `${stats.bestWUE.icon} ${stats.bestWUE.name}`,    color: stats.bestWUE.color },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: '#4a6fa5', letterSpacing: 2.5, fontFamily: "'IBM Plex Mono', monospace", marginBottom: 5 }}>{label}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color, fontFamily: "'IBM Plex Mono', monospace" }}>{value}</div>
              </div>
            ))}
          </div>
          <div style={{ borderLeft: '1px solid #1e3a5f', paddingLeft: 22, textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: 9, color: '#4a6fa5', letterSpacing: 2, fontFamily: "'IBM Plex Mono', monospace", marginBottom: 6 }}>COST BASIS</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#64748b', fontFamily: "'IBM Plex Mono', monospace" }}>$1.2M</div>
            <div style={{ fontSize: 9.5, color: '#4a6fa5', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: 1 }}>per kg to LEO</div>
          </div>
        </div>

        {/* ── Controls row ── */}
        <div style={{ background: '#0c1322', border: '1px solid #162844', borderRadius: 11,
          padding: '13px 20px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', flex: 1 }}>
            {CROPS.map(crop => {
              const on = selectedCrops.has(crop.id);
              return (
                <button key={crop.id} className="crop-pill" onClick={() => toggleCrop(crop.id)}
                  style={{ borderColor: on ? crop.color : '#1e3a5f', color: on ? crop.color : '#4a6fa5',
                    background: on ? `${crop.color}1a` : 'transparent', boxShadow: on ? `0 0 12px ${crop.color}30` : 'none' }}>
                  {crop.icon} {crop.name}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <span style={{ fontSize: 10, color: '#4a6fa5', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: 1.5 }}>DAY</span>
            <input type="range" min={1} max={90} value={currentDay} onChange={e => setCurrentDay(+e.target.value)}
              style={{ width: 130, accentColor: '#00cfff', cursor: 'pointer' }} />
            <span style={{ fontSize: 15, color: '#00cfff', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, minWidth: 28 }}>{currentDay}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="dis-btn" onClick={() => triggerDisaster('solar_flare')}
              style={{ borderColor: '#ffb300', color: '#ffb300',
                background: disasterActive && disaster.type === 'solar_flare' ? 'rgba(255,179,0,0.13)' : 'transparent',
                boxShadow:  disasterActive && disaster.type === 'solar_flare' ? '0 0 16px rgba(255,179,0,0.3)' : 'none' }}>
              ☀️ Solar Flare
            </button>
            <button className="dis-btn" onClick={() => triggerDisaster('hull_leak')}
              style={{ borderColor: '#00cfff', color: '#00cfff',
                background: disasterActive && disaster.type === 'hull_leak' ? 'rgba(0,207,255,0.10)' : 'transparent',
                boxShadow:  disasterActive && disaster.type === 'hull_leak' ? '0 0 16px rgba(0,207,255,0.25)' : 'none' }}>
              💨 Hull Leak
            </button>
            {disasterActive && (
              <button className="dis-btn" onClick={() => setDisaster({ day: null, type: null })}
                style={{ borderColor: '#4a6fa5', color: '#4a6fa5' }}>
                ✕ Clear
              </button>
            )}
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div style={{ borderBottom: '1px solid #162844', marginBottom: 16, display: 'flex' }}>
          {TABS.map(t => (
            <button key={t.id}
              className={`tab-btn ${t.id === 'engineering' ? 'eng-tab' : ''} ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════
            TAB 1 — COMMAND CENTER
        ════════════════════════════════════════════════════════ */}
        {activeTab === 'command' && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card title="BIOMASS GROWTH TRAJECTORY"
              sub="Logistic S-Curve Growth per Species (grams fresh weight)">
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={visibleData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <defs>
                    {activeCrops.map(c => (
                      <linearGradient key={c.id} id={`bg-${c.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={c.color} stopOpacity={0.18} />
                        <stop offset="95%" stopColor={c.color} stopOpacity={0.01} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="day" {...AXIS} label={{ value: 'Mission Day', position: 'insideBottomRight', offset: -8, fill: '#4a6fa5', fontSize: 10 }} />
                  <YAxis {...AXIS} label={{ value: 'Biomass (g)', angle: -90, position: 'insideLeft', offset: 10, fill: '#4a6fa5', fontSize: 10 }} />
                  <Tooltip content={<ChartTip unit=" g" />} />
                  <Legend wrapperStyle={LEGEND_STYLE} />
                  {disasterActive && (
                    <ReferenceLine x={disaster.day} stroke="#ff2d78" strokeDasharray="5 3" strokeWidth={1.5}
                      label={{ value: `⚠ D${disaster.day}`, position: 'insideTopRight', fill: '#ff2d78', fontSize: 10, fontFamily: "'IBM Plex Mono', monospace" }} />
                  )}
                  {activeCrops.map(c => (
                    <Area key={c.id} type="monotone" dataKey={`${c.id}_biomass`} name={`${c.icon} ${c.name}`}
                      stroke={c.color} fill={`url(#bg-${c.id})`} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Card title="PERFORMANCE RADAR · MULTI-METRIC" sub={`Day ${currentDay} Normalized Score (0–100)`}>
                <ResponsiveContainer width="100%" height={320}>
                  <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                    <PolarGrid stroke="#162844" />
                    <PolarAngleAxis dataKey="m" tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: "'IBM Plex Mono', monospace" }} />
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
              <Card title="WATER DISTRIBUTION · CONSUMPTION SHARE" sub={`Day ${currentDay} H₂O Allocation (L/day)`}>
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name"
                      cx="50%" cy="50%" innerRadius={72} outerRadius={116}
                      stroke="#050911" strokeWidth={2} paddingAngle={2}>
                      {pieData.map((e, i) => <Cell key={i} fill={e.color} fillOpacity={0.88} />)}
                    </Pie>
                    <Tooltip {...TIP_STYLE} formatter={(v) => [`${Number(v).toFixed(2)} L/day`, 'Water']} />
                    <Legend wrapperStyle={LEGEND_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            TAB 2 — ROOT & NUTRIENT
        ════════════════════════════════════════════════════════ */}
        {activeTab === 'nutrients' && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card title="NUTRIENT SOLUTION · ACIDITY" sub="Root Zone pH — 90-Day Monitoring">
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={visibleData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="day" {...AXIS} />
                  <YAxis domain={[4.5, 8.5]} {...AXIS} label={{ value: 'pH', angle: -90, position: 'insideLeft', offset: 10, fill: '#4a6fa5', fontSize: 10 }} />
                  <Tooltip content={<ChartTip />} />
                  <Legend wrapperStyle={LEGEND_STYLE} />
                  <ReferenceLine y={5.5} stroke="#1e3a5f" strokeDasharray="6 4" label={{ value: '5.5 LOW', position: 'insideLeft', fill: '#4a6fa5', fontSize: 9 }} />
                  <ReferenceLine y={7.0} stroke="#1e3a5f" strokeDasharray="6 4" label={{ value: '7.0 HIGH', position: 'insideLeft', fill: '#4a6fa5', fontSize: 9 }} />
                  {disasterActive && <ReferenceLine x={disaster.day} stroke="#ff2d78" strokeDasharray="4 3" strokeWidth={1.5} />}
                  {activeCrops.map(c => (
                    <Line key={c.id} type="monotone" dataKey={`${c.id}_pH`} name={`${c.icon} ${c.name}`} stroke={c.color} strokeWidth={2} dot={false} />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
            <Card title="ELECTRICAL CONDUCTIVITY" sub="Nutrient Concentration (EC) — mS/cm">
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={visibleData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="day" {...AXIS} />
                  <YAxis domain={[0, 5]} {...AXIS} label={{ value: 'mS/cm', angle: -90, position: 'insideLeft', offset: 10, fill: '#4a6fa5', fontSize: 10 }} />
                  <Tooltip content={<ChartTip unit=" mS/cm" />} />
                  <Legend wrapperStyle={LEGEND_STYLE} />
                  {disasterActive && <ReferenceLine x={disaster.day} stroke="#ff2d78" strokeDasharray="4 3" strokeWidth={1.5} />}
                  {activeCrops.map(c => (
                    <Line key={c.id} type="monotone" dataKey={`${c.id}_EC`} name={`${c.icon} ${c.name}`} stroke={c.color} strokeWidth={2} dot={false} />
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
                    <Area key={c.id} type="monotone" dataKey={`${c.id}_WUE`} name={`${c.icon} ${c.name}`}
                      stroke={c.color} fill={`url(#wue-${c.id})`} strokeWidth={1.8} dot={false} />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            TAB 3 — ATMOSPHERE
        ════════════════════════════════════════════════════════ */}
        {activeTab === 'atmosphere' && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card title="THERMAL & HYGROSCOPIC CONDITIONS" sub="Habitat Temperature (°C) & Relative Humidity (%)">
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={visibleData} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#ff8c42" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#ff8c42" stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id="humGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#c77dff" stopOpacity={0.20} />
                      <stop offset="95%" stopColor="#c77dff" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="day" {...AXIS} />
                  <YAxis yAxisId="T" domain={[-15, 50]} {...AXIS} label={{ value: '°C', angle: -90, position: 'insideLeft', offset: 10, fill: '#4a6fa5', fontSize: 10 }} />
                  <YAxis yAxisId="H" orientation="right" domain={[0, 100]} {...AXIS} label={{ value: '% RH', angle: 90, position: 'insideRight', offset: 10, fill: '#4a6fa5', fontSize: 10 }} />
                  <Tooltip {...TIP_STYLE} />
                  <Legend wrapperStyle={LEGEND_STYLE} />
                  {disasterActive && <ReferenceLine yAxisId="T" x={disaster.day} stroke="#ff2d78" strokeDasharray="4 3" strokeWidth={1.5} label={{ value: `⚠ DAY ${disaster.day}`, position: 'insideTopRight', fill: '#ff2d78', fontSize: 10 }} />}
                  <Area yAxisId="T" type="monotone" dataKey="temp"     name="Temperature (°C)" stroke="#ff8c42" fill="url(#tempGrad)" strokeWidth={2.2} dot={false} />
                  <Area yAxisId="H" type="monotone" dataKey="humidity" name="Humidity (%)"      stroke="#c77dff" fill="url(#humGrad)"  strokeWidth={2.2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
            <Card title="PHOTOSYNTHETICALLY ACTIVE RADIATION" sub="PAR Light Intensity — μmol/m²/s (16-hr photoperiod)">
              <ResponsiveContainer width="100%" height={250}>
                <ComposedChart data={visibleData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="parGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#ffeb3b" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#ffeb3b" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="day" {...AXIS} />
                  <YAxis domain={[300, 560]} {...AXIS} />
                  <Tooltip {...TIP_STYLE} />
                  <Area type="monotone" dataKey="PAR" name="PAR (μmol/m²/s)" stroke="#ffeb3b" fill="url(#parGrad)" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            TAB 4 — SENSORS & NDVI
        ════════════════════════════════════════════════════════ */}
        {activeTab === 'sensors' && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card title="IONIZING RADIATION TELEMETRY" sub="Galactic Cosmic Ray & Solar Particle Flux (mSv/day)">
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
                  <YAxis {...AXIS} label={{ value: 'mSv/day', angle: -90, position: 'insideLeft', offset: 10, fill: '#4a6fa5', fontSize: 10 }} />
                  <Tooltip {...TIP_STYLE} />
                  {disasterActive && <ReferenceLine x={disaster.day} stroke="#ff2d78" strokeDasharray="4 3" strokeWidth={2}
                    label={{ value: `☢ ${disaster.type === 'solar_flare' ? 'FLARE EVENT' : 'HULL BREACH'}`, position: 'insideTopRight', fill: '#ff2d78', fontSize: 10, fontFamily: "'IBM Plex Mono', monospace" }} />}
                  <Area type="monotone" dataKey="radiation" name="Radiation (mSv/day)"
                    stroke={disasterActive ? '#ff2d78' : '#64748b'} fill="url(#radGrad)" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
            <Card title="NDVI · NORMALIZED DIFFERENCE VEGETATION INDEX" sub="Crop Health Score (0.0 = dead → 1.0 = peak vigor)">
              <ResponsiveContainer width="100%" height={290}>
                <ComposedChart data={visibleData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="day" {...AXIS} />
                  <YAxis domain={[0, 1]} {...AXIS} tickCount={6} />
                  <Tooltip content={<ChartTip />} />
                  <Legend wrapperStyle={LEGEND_STYLE} />
                  <ReferenceLine y={0.4} stroke="#1e3a5f" strokeDasharray="5 4" label={{ value: 'STRESS THRESHOLD', position: 'insideTopRight', fill: '#4a6fa5', fontSize: 9 }} />
                  {disasterActive && <ReferenceLine x={disaster.day} stroke="#ff2d78" strokeDasharray="4 3" strokeWidth={1.5} label={{ value: `⚠ D${disaster.day}`, position: 'insideTopRight', fill: '#ff2d78', fontSize: 10 }} />}
                  {activeCrops.map(c => (
                    <Line key={c.id} type="monotone" dataKey={`${c.id}_NDVI`} name={`${c.icon} ${c.name}`}
                      stroke={c.color} strokeWidth={2.2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
            <Card title="CALORIC OUTPUT · DAILY PRODUCTION" sub="Kilocalories Generated per Crop (kcal/day)">
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
                    <Area key={c.id} type="monotone" dataKey={`${c.id}_kcal`} name={`${c.icon} ${c.name}`}
                      stroke={c.color} fill={`url(#kc-${c.id})`} strokeWidth={2} dot={false} />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            TAB 5 — HARD ENGINEERING (NEW)
        ════════════════════════════════════════════════════════ */}
        {activeTab === 'engineering' && (
          <div className="fade-in">

            {/* ── Engineering header banner ── */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(0,255,65,0.04) 0%, rgba(5,9,17,0.98) 50%, rgba(0,255,65,0.03) 100%)',
              border: '1px solid rgba(0,255,65,0.30)', borderRadius: 12,
              padding: '18px 26px', marginBottom: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 24, flexWrap: 'wrap',
              boxShadow: '0 0 30px rgba(0,255,65,0.08), inset 0 1px 0 rgba(0,255,65,0.06)',
            }}>
              <div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(0,255,65,0.55)',
                  letterSpacing: 3, marginBottom: 8 }}>
                  CESAS · HARD ENGINEERING MODULE · LIVE SENSOR INTEGRATION
                </div>
                <div style={{ fontSize: 46, fontWeight: 700, color: '#00FF41', fontFamily: "'IBM Plex Mono', monospace",
                  letterSpacing: -1, lineHeight: 1, textShadow: '0 0 20px rgba(0,255,65,0.5)' }}>
                  ${engineData.realtimePayloadM}M
                </div>
                <div style={{ fontSize: 12, color: 'rgba(0,255,65,0.55)', marginTop: 6, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: 1 }}>
                  real-time payload savings · $1.2M/kg LEO basis
                </div>
              </div>

              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
                {[
                  { label: 'LIVE NDVI',     value: engineData.ndvi.toFixed(3),              color: engineData.ndvi < 0.4 ? '#ff2d78' : '#00FF41' },
                  { label: 'TOTAL YIELD',   value: `${(engineData.totalBiomassKg * 1000).toFixed(0)} g`, color: '#ffeb3b' },
                  { label: 'ACTIVE NODES',  value: `${engineData.mesh.activeNodes}/3`,       color: nodeAFailed ? '#ff2d78' : '#00cfff' },
                  { label: 'ANOMALY',       value: engineData.stress.anomalyDetected ? 'YES' : 'NO', color: engineData.stress.anomalyDetected ? '#ff2d78' : '#00FF41' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 8.5, color: 'rgba(0,255,65,0.45)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: 2.5, marginBottom: 5 }}>{label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color, fontFamily: "'IBM Plex Mono', monospace" }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Plant Passport QR (full size) */}
              <PlantPassportQR plantData={engineData.passportData} />
            </div>

            {/* ── Anomaly alert bar (visible when stress detected) ── */}
            {(engineData.stress.anomalyDetected || engineData.mesh.alert || engineData.scarcity.alert) && (
              <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {engineData.stress.alert && (
                  <div className="anomaly-alert" style={{ padding: '9px 14px', borderRadius: 7, border: '1px solid rgba(255,45,120,0.4)',
                    background: 'rgba(255,45,120,0.08)', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
                    color: '#ff2d78', letterSpacing: 0.8 }}>
                    {engineData.stress.alert}
                  </div>
                )}
                {engineData.mesh.alert && (
                  <div className="mesh-active" style={{ padding: '9px 14px', borderRadius: 7, border: '1px solid rgba(0,207,255,0.3)',
                    background: 'rgba(0,207,255,0.07)', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
                    color: '#00cfff', letterSpacing: 0.8 }}>
                    {engineData.mesh.alert}
                  </div>
                )}
                {engineData.scarcity.alert && (
                  <div style={{ padding: '9px 14px', borderRadius: 7, border: '1px solid rgba(255,179,0,0.3)',
                    background: 'rgba(255,179,0,0.07)', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
                    color: '#ffb300', letterSpacing: 0.8 }}>
                    {engineData.scarcity.alert}
                  </div>
                )}
              </div>
            )}

            {/* ── Main two-column layout ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 16, alignItems: 'start' }}>
              {/* LEFT: sensor sliders + controls */}
              <SensorPanel
                sensors={sensors}
                setSensors={setSensors}
                nodeAFailed={nodeAFailed}
                setNodeAFailed={setNodeAFailed}
                scarcityMode={scarcityMode}
                setScarcityMode={setScarcityMode}
                engineData={engineData}
              />
              {/* RIGHT: charts */}
              <EngineeringCharts engineData={engineData} />
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{ marginTop: 28, paddingTop: 16, borderTop: '1px solid #162844',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, color: '#2a4a7f', letterSpacing: 1.5 }}>
              LUNAR-PONICS MISSION CONTROL · ALPHA-1 · POLYCULTURE CLOSED-LOOP GROWTH SYSTEM
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, color: '#3d5a8c', letterSpacing: 1.5 }}>
              LEGACY COMMANDER: ALI QUSHJI · TUA STATION
            </div>
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, color: '#2a4a7f', letterSpacing: 1.5 }}>
            PRNG SEED: 42 · {CROPS.length} SPECIES · 90-DAY DETERMINISTIC SIMULATION
          </div>
        </div>

      </div>
    </div>
  );
}
