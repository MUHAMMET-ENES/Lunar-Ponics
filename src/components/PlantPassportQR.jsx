/**
 * PlantPassportQR.jsx
 * ═══════════════════════════════════════════════════════════════════
 * Plant Passport QR Code Component — Lunar-Ponics Alpha-1
 *
 * Generates a dynamic QR code that encodes plantData as query params
 * and links to the mission debrief page.
 *
 * Installation (if not already present):
 *   npm install qrcode.react
 *
 * Props:
 *   plantData {Object}
 *     - plantId         {string}  e.g. "LP-SORGHUM-001"
 *     - survivalPriority{string}  "CRITICAL" | "HIGH" | "NOMINAL"
 *     - healthScore     {number}  0–100
 * ═══════════════════════════════════════════════════════════════════
 */
import React, { useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const PRIORITY_COLOR = {
  CRITICAL: '#ff2d78',
  HIGH:     '#ffb300',
  NOMINAL:  '#00FF41',
};

export default function PlantPassportQR({ plantData = {} }) {
  const {
    plantId          = 'LP-ALPHA-001',
    survivalPriority = 'HIGH',
    healthScore      = 87,
  } = plantData;

  /* Build the QR target URL with plant metadata as query params */
  const qrValue = useMemo(() => {
    const params = new URLSearchParams({
      id:       plantId,
      priority: survivalPriority,
      health:   healthScore,
      ts:       Date.now(),
    });
    return `${window.location.origin}/mission-debrief.html?${params.toString()}`;
  }, [plantId, survivalPriority, healthScore]);

  const priorityColor = PRIORITY_COLOR[survivalPriority] ?? '#00FF41';
  const healthColor   = healthScore >= 70 ? '#00FF41' : healthScore >= 40 ? '#ffb300' : '#ff2d78';

  return (
    <div style={styles.wrapper}>
      {/* Neon border glow container */}
      <div style={styles.container}>

        {/* ── Scanning sweep animation line ── */}
        <div style={styles.scanLine} />

        {/* ── Corner tick-marks (CRT crosshair aesthetic) ── */}
        <div style={{ ...styles.corner, top: 3,  left:  3,  borderTop:  '2px solid #00FF41', borderLeft:  '2px solid #00FF41' }} />
        <div style={{ ...styles.corner, top: 3,  right: 3,  borderTop:  '2px solid #00FF41', borderRight: '2px solid #00FF41' }} />
        <div style={{ ...styles.corner, bottom: 3, left:  3,  borderBottom: '2px solid #00FF41', borderLeft:  '2px solid #00FF41' }} />
        <div style={{ ...styles.corner, bottom: 3, right: 3,  borderBottom: '2px solid #00FF41', borderRight: '2px solid #00FF41' }} />

        {/* ── Header label ── */}
        <div style={styles.label}>▶ PLANT PASSPORT</div>

        {/* ── QR Code (SVG rendered inline — no img tag needed) ── */}
        <div style={styles.qrWrapper}>
          <QRCodeSVG
            value={qrValue}
            size={148}
            bgColor="#050911"
            fgColor="#00FF41"
            level="M"
            style={styles.qrSvg}
          />
        </div>

        {/* ── Plant ID line ── */}
        <div style={styles.plantId}>{plantId}</div>

        {/* ── Priority + Health badges ── */}
        <div style={styles.badgeRow}>
          <span style={{ ...styles.badge, borderColor: `${priorityColor}55`, color: priorityColor }}>
            {survivalPriority}
          </span>
          <span style={{ ...styles.badge, borderColor: `${healthColor}55`, color: healthColor }}>
            HLTH {healthScore}%
          </span>
        </div>

      </div>

      {/* Inline keyframe for scan animation */}
      <style>{`
        @keyframes qr-scan {
          0%   { top: 0%;   opacity: 0.9; }
          45%  { opacity: 1; }
          50%  { top: 100%; opacity: 0.9; }
          100% { top: 0%;   opacity: 0; }
        }
        @keyframes qr-pulse-border {
          0%,100% { box-shadow: 0 0 18px rgba(0,255,65,0.30), 0 0 40px rgba(0,255,65,0.10), inset 0 0 20px rgba(0,255,65,0.05); }
          50%     { box-shadow: 0 0 26px rgba(0,255,65,0.55), 0 0 60px rgba(0,255,65,0.18), inset 0 0 26px rgba(0,255,65,0.08); }
        }
      `}</style>
    </div>
  );
}

/* ── Styles object (keeps JSX clean) ───────────────────────────── */
const styles = {
  wrapper: {
    display:  'inline-block',
    position: 'relative',
  },
  container: {
    position:     'relative',
    padding:      '12px 14px 14px',
    border:       '1px solid rgba(0,255,65,0.45)',
    borderRadius: '10px',
    background:   'linear-gradient(145deg, rgba(5,9,17,0.97) 0%, rgba(6,18,10,0.90) 50%, rgba(5,9,17,0.97) 100%)',
    boxShadow:    '0 0 22px rgba(0,255,65,0.28), 0 0 48px rgba(0,255,65,0.10), inset 0 0 24px rgba(0,255,65,0.06)',
    animation:    'qr-pulse-border 3.5s ease-in-out infinite',
    overflow:     'hidden',
  },
  scanLine: {
    position:   'absolute',
    left:       0,
    right:      0,
    height:     '2px',
    background: 'linear-gradient(90deg, transparent 0%, #00FF41 30%, rgba(0,255,65,0.9) 50%, #00FF41 70%, transparent 100%)',
    animation:  'qr-scan 2.8s ease-in-out infinite',
    zIndex:     10,
    filter:     'blur(0.5px)',
  },
  corner: {
    position: 'absolute',
    width:    10,
    height:   10,
  },
  label: {
    marginBottom:   8,
    fontFamily:     "'IBM Plex Mono', monospace",
    fontSize:       8,
    fontWeight:     600,
    letterSpacing:  '2.4px',
    color:          '#00FF41',
    textAlign:      'center',
    textShadow:     '0 0 10px rgba(0,255,65,0.95), 0 0 22px rgba(0,255,65,0.45)',
  },
  qrWrapper: {
    display:      'flex',
    alignItems:   'center',
    justifyContent: 'center',
  },
  qrSvg: {
    display:      'block',
    borderRadius: '6px',
    border:       '1.5px solid rgba(0,255,65,0.8)',
    boxShadow:    '0 0 14px rgba(0,255,65,0.40)',
  },
  plantId: {
    marginTop:    6,
    fontFamily:   "'IBM Plex Mono', monospace",
    fontSize:     7,
    color:        'rgba(0,255,65,0.50)',
    textAlign:    'center',
    letterSpacing:'1.6px',
    textShadow:   '0 0 6px rgba(0,255,65,0.25)',
  },
  badgeRow: {
    display:        'flex',
    gap:            5,
    marginTop:      6,
    justifyContent: 'center',
  },
  badge: {
    fontFamily:   "'IBM Plex Mono', monospace",
    fontSize:     7,
    letterSpacing:'1px',
    padding:      '2px 6px',
    border:       '1px solid',
    borderRadius: 3,
    fontWeight:   600,
  },
};
