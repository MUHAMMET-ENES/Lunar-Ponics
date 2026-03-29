/**
 * simulationEngine.js
 * ═══════════════════════════════════════════════════════════════════
 * Hard Engineering Logic Core — Lunar-Ponics Alpha-1
 * Closed Ecological Space Agriculture System (CESAS)
 *
 * All heavy math lives here so App.jsx stays clean.
 * ═══════════════════════════════════════════════════════════════════
 */

/* ════════════════════════════════════════════════════════════════════
   §1  MESH NODE COMPENSATION LOGIC
   If Node Alpha fails, remaining nodes absorb its load at +15% PPFD
   and +15% CO₂ to keep photosynthetic output stable.
════════════════════════════════════════════════════════════════════ */
export function calculateMeshCompensation(nodeAFailed) {
  if (!nodeAFailed) {
    return {
      ppfdMultiplier: 1.0,
      co2Multiplier:  1.0,
      status:         'NOMINAL',
      activeNodes:    3,
      alert:          null,
    };
  }
  return {
    ppfdMultiplier: 1.15,
    co2Multiplier:  1.15,
    status:         'COMPENSATING',
    activeNodes:    2,
    alert:          'NODE ALPHA OFFLINE — MESH COMPENSATION ACTIVE (+15% PPFD / CO₂)',
  };
}

/* ════════════════════════════════════════════════════════════════════
   §2  SCARCITY PRIORITY ALGORITHM
   Ranks crops by Water-to-Calorie efficiency ratio.
   Priority order: Sorghum > Peanut > Lettuce
   Rule: If total water availability < 20% → trigger Lettuce dormancy.
════════════════════════════════════════════════════════════════════ */

// Water consumed (L) per 1 kcal produced — lower = more efficient
const SCARCITY_MANIFEST = [
  { id: 'sorghum', name: 'Sorghum', icon: '🌾', waterPerKcal: 0.00274, priority: 1 },
  { id: 'peanut',  name: 'Peanut',  icon: '🥜', waterPerKcal: 0.00212, priority: 2 },
  { id: 'lettuce', name: 'Lettuce', icon: '🥬', waterPerKcal: 0.14667, priority: 3 },
];

export function calculateScarcityPriority(waterFraction) {
  // waterFraction: 0.0–1.0 from sensor input
  const pct = Math.max(0, Math.min(1, waterFraction));
  const lettuceDormancy = pct < 0.20;

  const ranked = SCARCITY_MANIFEST.map(crop => {
    const isDormant  = lettuceDormancy && crop.id === 'lettuce';
    // Caloric efficiency score (higher = better use of scarce water)
    const efficiency = isDormant ? 0 : 1 / crop.waterPerKcal;
    return { ...crop, dormant: isDormant, efficiency };
  });

  // Normalize to percentage water share
  const totalEff = ranked.reduce((s, c) => s + c.efficiency, 0);
  ranked.forEach(c => {
    c.sharePercent = totalEff > 0 ? +(c.efficiency / totalEff * 100).toFixed(1) : 0;
  });

  return {
    ranked,
    lettuceDormancy,
    waterFraction:  pct,
    waterPct:       +(pct * 100).toFixed(1),
    alert: lettuceDormancy
      ? '🥬 LETTUCE → DORMANCY PROTOCOL ENGAGED (H₂O < 20%)'
      : null,
  };
}

/* ════════════════════════════════════════════════════════════════════
   §3  METABOLIC PID CONTROLLER
   Regulates light intensity and nutrient delivery based on real-time
   NDVI feedback vs. a target growth rate.
   SAFETY RULE: If NDVI < 0.4 → throttle outputs to prevent
   "biological burn" — over-stimulating already-stressed tissue.
════════════════════════════════════════════════════════════════════ */
const PID_KP = 1.20;   // Proportional gain
const PID_KD = 0.35;   // Derivative gain (rate of change damper)

export function runMetabolicPID(currentNDVI, targetGrowth = 0.70) {
  const BIO_BURN_THRESHOLD = 0.40;
  const isUnderStress      = currentNDVI < BIO_BURN_THRESHOLD;

  const error      = targetGrowth - currentNDVI;
  // Simplified PD controller (stateless, safe for React useMemo)
  const rawOutput  = PID_KP * error - PID_KD * Math.abs(error) * Math.sign(error) * 0.1;

  // Map PID output → actuator percentages (0–100%)
  let lightOutput    = Math.max(0, Math.min(1.0, 0.50 + rawOutput * 0.50));
  let nutrientOutput = Math.max(0, Math.min(1.0, 0.50 + rawOutput * 0.40));

  // ── Biological Burn Prevention ──────────────────────────────────
  if (isUnderStress) {
    lightOutput    = Math.min(lightOutput,    0.45);  // Hard cap at 45%
    nutrientOutput = Math.min(nutrientOutput, 0.35);  // Hard cap at 35%
  }

  const statusLabel = isUnderStress
    ? '⚠️ THROTTLED — BIO-BURN PREVENTION'
    : rawOutput > 0.5
      ? '🚀 GROWTH ACCELERATING'
      : error < 0
        ? '⏬ REDUCING STIMULATION'
        : '✅ NOMINAL REGULATION';

  return {
    currentNDVI:    +currentNDVI.toFixed(3),
    targetGrowth,
    error:          +error.toFixed(3),
    pidOutput:      +rawOutput.toFixed(3),
    lightOutput:    +(lightOutput    * 100).toFixed(1),   // % of max luminaire
    nutrientOutput: +(nutrientOutput * 100).toFixed(1),   // % of max dosing
    isUnderStress,
    throttled:      isUnderStress,
    status:         statusLabel,
  };
}

/* ════════════════════════════════════════════════════════════════════
   §4  PROPHET EARLY-STRESS DETECTION MODULE
   Transpiration Ratio = ActualTranspiration / PredictedTranspiration
   If ratio < 0.98 → anomalyDetected = true (early water-stress signal)
   Payload savings are calculated from total biomass yield.
════════════════════════════════════════════════════════════════════ */
const PAYLOAD_COST_PER_KG = 1_200_000; // USD per kg to LEO

export function detectEarlyStress(actualTranspiration, predictedTranspiration, biomassKg) {
  const safePredicted = predictedTranspiration > 0 ? predictedTranspiration : 1;
  const ratio         = actualTranspiration / safePredicted;

  const anomalyDetected = ratio < 0.98;
  const payloadSavings  = biomassKg * PAYLOAD_COST_PER_KG;

  // Confidence: how far below the 0.98 threshold (normalized to 0–100%)
  const stressConfidence = anomalyDetected
    ? Math.min(100, +((0.98 - ratio) / 0.02 * 100).toFixed(1))
    : 0;

  return {
    ratio:            +ratio.toFixed(4),
    anomalyDetected,
    stressConfidence,
    payloadSavings,
    payloadSavingsM:  +(payloadSavings / 1_000_000).toFixed(2),
    alert: anomalyDetected
      ? `⚠️ TRANSPIRATION ANOMALY — ratio ${ratio.toFixed(4)} (threshold 0.98)`
      : null,
  };
}

/* ════════════════════════════════════════════════════════════════════
   §5  COMPOSITE YIELD ESTIMATOR
   Combines all 8 sensor readings into a per-crop yield estimate (g).
   Used by the Engineering tab BarChart.
════════════════════════════════════════════════════════════════════ */
export const YIELD_CROPS = [
  { id: 'sweetPotato', name: 'Sweet Potato', icon: '🍠', color: '#ff8c42', optPH: 6.0, optEC: 1.8, baseYield: 420 },
  { id: 'peanut',      name: 'Peanut',       icon: '🥜', color: '#daa520', optPH: 6.2, optEC: 1.6, baseYield: 280 },
  { id: 'sorghum',     name: 'Sorghum',      icon: '🌾', color: '#00cfff', optPH: 6.5, optEC: 1.4, baseYield: 390 },
  { id: 'lettuce',     name: 'Lettuce',      icon: '🥬', color: '#00ff9d', optPH: 6.0, optEC: 1.0, baseYield: 180 },
  { id: 'microTomato', name: 'Micro-Tomato', icon: '🍅', color: '#ff2d78', optPH: 6.3, optEC: 2.2, baseYield: 230 },
  { id: 'quinoa',      name: 'Quinoa',       icon: '🌱', color: '#c77dff', optPH: 6.5, optEC: 1.5, baseYield: 310 },
  { id: 'strawberry',  name: 'Strawberry',   icon: '🍓', color: '#ff6b9d', optPH: 5.8, optEC: 1.2, baseYield: 165 },
];

/**
 * @param {Object} sensors         – { temp, co2, humidity, ethylene, ph, ec, dissolvedO2, ppfd }
 * @param {number} meshMultiplier  – PPFD boost from mesh compensation (default 1.0)
 * @param {Array}  scarcityRanked  – ranked array from calculateScarcityPriority (or null)
 * @returns {Array} per-crop objects with { ...crop, yield, composite, dormant }
 */
export function estimateYield(sensors, meshMultiplier = 1.0, scarcityRanked = null) {
  const { temp, co2, humidity, ppfd, ph, ec, dissolvedO2, ethylene } = sensors;

  return YIELD_CROPS.map(crop => {
    // ── Individual stress/gain factors (all 0–1 except co2Factor which can reach 1.3)
    const tempFactor  = Math.max(0, 1 - Math.abs(temp - 22) / 20);
    const co2Factor   = Math.min(1.3, 0.70 + (co2 / 2000) * 0.60);
    const humFactor   = Math.max(0.4, 1 - Math.abs(humidity - 65) / 80);
    const lightFactor = Math.min(1.35, (ppfd * meshMultiplier) / 600);
    const phFactor    = Math.max(0.2, 1 - Math.abs(ph  - crop.optPH) / 2.0);
    const ecFactor    = Math.max(0.3, 1 - Math.abs(ec  - crop.optEC) / 3.0);
    const ethFactor   = Math.max(0.5, 1 - ethylene / 200);
    const doFactor    = Math.min(1.1, dissolvedO2 / 8);

    const composite = tempFactor * co2Factor * humFactor * lightFactor
                    * phFactor   * ecFactor  * ethFactor * doFactor;

    // Check if scarcity ranking placed this crop in dormancy
    const scEntry  = scarcityRanked?.find(r => r.id === crop.id);
    const dormant  = scEntry?.dormant ?? false;

    const yield_g  = dormant ? 0 : +(crop.baseYield * composite).toFixed(1);
    const yieldPct = +(composite * 100).toFixed(1);

    return { ...crop, yield: yield_g, composite: yieldPct, dormant };
  });
}

/* ════════════════════════════════════════════════════════════════════
   §6  SYSTEM VITALITY RADAR DATA
   Normalizes sensor readings against ideal targets for the RadarChart.
════════════════════════════════════════════════════════════════════ */
export function buildVitalityRadar(sensors) {
  const { temp, co2, humidity, ppfd, ph, ec, dissolvedO2, ethylene } = sensors;
  return [
    { axis: 'Light',     value: Math.min(100, +(ppfd / 8).toFixed(1)) },
    { axis: 'CO₂',       value: Math.min(100, +((co2 - 400) / 16).toFixed(1)) },
    { axis: 'Humidity',  value: Math.max(0,   +(100 - Math.abs(humidity - 65)).toFixed(1)) },
    { axis: 'pH Opt.',   value: Math.max(0,   +(100 - Math.abs(ph - 6.2) * 30).toFixed(1)) },
    { axis: 'EC Bal.',   value: Math.max(0,   +(100 - Math.abs(ec - 1.8) * 25).toFixed(1)) },
    { axis: 'O₂ Diss.', value: Math.min(100, +(dissolvedO2 * 8.3).toFixed(1)) },
    { axis: 'Ethylene',  value: Math.max(0,   +(100 - ethylene).toFixed(1)) },
    { axis: 'Temp.',     value: Math.max(0,   +(100 - Math.abs(temp - 22) * 4).toFixed(1)) },
  ];
}
