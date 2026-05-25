import type { ProcessedData } from './types';
import { DEFAULT_WEIGHTS, type ScoringWeights } from './adaptiveScoring';

interface DayFlags {
  hasAbsorption: boolean;
  hasDistribution: boolean;
  maxVolRatio: number;
}

/**
 * Snapshot agregasi mayoritas broker di hari terakhir.
 * Dipakai sebagai representasi kondisi saham, bukan satu broker saja.
 */
export interface LatestDaySnapshot {
  /** Row dengan nilai close (pakai row pertama per hari sebagai representasi OHLC) */
  priceRow: ProcessedData;
  /** Phase dari Wyckoff (sama untuk semua broker di hari yang sama) */
  phase: ProcessedData['phase'];
  /** Rata-rata candleStrength semua broker di hari terakhir */
  avgCandleStrength: number;
  /** Mayoritas sinyal broker: net buy > 0 = bullish */
  majorityNetBuy: number;
  /** Jumlah broker net buy vs net sell di hari terakhir */
  brokersBullish: number;
  brokersTotal: number;
  /** Confidence Wyckoff dari phase row */
  wyckoffConfidence: number;
}

export interface StockAggregate {
  stock: string;
  rows: ProcessedData[];
  /** Row representatif hari terakhir (untuk backward compat, pakai majority logic) */
  latestRow: ProcessedData;
  /** Snapshot agregasi mayoritas broker hari terakhir */
  latestSnapshot: LatestDaySnapshot;
  topBrokerNetAccum: number;
  avgTopBrokerConc: number;
  totalMarketVal: number;
  totalDays: number;
  absorptionDays: number;
  distributionDays: number;
  avgVolRatio: number;
  dayFlags: Map<string, DayFlags>;
}

export interface StockLevelScore {
  verdictScore: number;
  /** Score setelah di-discount oleh Wyckoff confidence (0–100) */
  confidenceAdjustedScore: number;
  grade: string;
  signal: string;
  estimateStatus: string;
  wyckoffConfidence: number;
  dataQuality: string;
  scoreBreakdown: {
    brokerFlow: number;
    volume: number;
    phase: number;
    behavior: number;
    price: number;
  };
}

/**
 * Bangun snapshot mayoritas broker untuk hari terakhir suatu saham.
 * Menggantikan logika "broker dengan score tertinggi" yang bisa misleading.
 */
function buildLatestSnapshot(
  _latestDate: string,
  rowsOnLatestDate: ProcessedData[]
): LatestDaySnapshot {
  if (rowsOnLatestDate.length === 0) {
    // fallback seharusnya tidak terjadi
    throw new Error('No rows for latest date');
  }

  // OHLC & phase ambil dari row pertama (semua broker punya data harga yang sama per hari)
  const priceRow = rowsOnLatestDate[0];
  const phase = priceRow.phase;

  // Mayoritas broker: hitung berapa yang net buy vs net sell
  let brokersBullish = 0;
  let totalNetBuy = 0;
  let candleStrengthSum = 0;

  for (const row of rowsOnLatestDate) {
    totalNetBuy += row.flow.netBuy;
    candleStrengthSum += row.price.candleStrength;
    if (row.flow.netBuy > 0) brokersBullish++;
  }

  return {
    priceRow,
    phase,
    avgCandleStrength: candleStrengthSum / rowsOnLatestDate.length,
    majorityNetBuy: totalNetBuy,
    brokersBullish,
    brokersTotal: rowsOnLatestDate.length,
    wyckoffConfidence: phase.confidence,
  };
}

export function buildStockAggregates(data: ProcessedData[]): Map<string, StockAggregate> {
  const map = new Map<string, {
    rows: ProcessedData[];
    latestDate: string;
    topBrokerNetAccum: number;
    topBrokerConcSum: number;
    topBrokerConcCount: number;
    totalMarketVal: number;
    trackedDates: Set<string>;
    dayFlags: Map<string, DayFlags>;
    rowsByDate: Map<string, ProcessedData[]>;
  }>();

  const sorted = [...data].sort(
    (a, b) => new Date(a.raw.date).getTime() - new Date(b.raw.date).getTime()
  );

  for (const row of sorted) {
    const stock = row.raw.stock;
    if (!map.has(stock)) {
      map.set(stock, {
        rows: [],
        latestDate: '',
        topBrokerNetAccum: 0,
        topBrokerConcSum: 0,
        topBrokerConcCount: 0,
        totalMarketVal: 0,
        trackedDates: new Set(),
        dayFlags: new Map(),
        rowsByDate: new Map(),
      });
    }

    const s = map.get(stock)!;
    s.rows.push(row);

    // Track latest date
    if (row.raw.date > s.latestDate) s.latestDate = row.raw.date;

    // Group rows by date for majority logic
    if (!s.rowsByDate.has(row.raw.date)) s.rowsByDate.set(row.raw.date, []);
    s.rowsByDate.get(row.raw.date)!.push(row);

    const dateKey = row.raw.date;
    if (!s.trackedDates.has(dateKey)) {
      s.trackedDates.add(dateKey);
      s.topBrokerNetAccum +=
        row.dailyTotals.top3BuyerNetBuy + row.dailyTotals.top3SellerNetBuy;
      s.topBrokerConcSum += row.dailyTotals.topBuyerConcentration;
      s.topBrokerConcCount++;
      s.totalMarketVal += row.dailyTotals.totalBuyValue;
      s.dayFlags.set(dateKey, {
        hasAbsorption: false,
        hasDistribution: false,
        maxVolRatio: 0,
      });
    }

    const day = s.dayFlags.get(dateKey)!;
    if (row.behavior.absorption === 'ABSORPTION') day.hasAbsorption = true;
    if (row.behavior.distribution === 'DISTRIBUTION') day.hasDistribution = true;
    day.maxVolRatio = Math.max(day.maxVolRatio, row.volume.volRatio);
  }

  const result = new Map<string, StockAggregate>();
  map.forEach((s, stock) => {
    if (!s.latestDate) return;

    let absorptionDays = 0;
    let distributionDays = 0;
    let volSum = 0;

    s.dayFlags.forEach((day) => {
      if (day.hasAbsorption) absorptionDays++;
      if (day.hasDistribution) distributionDays++;
      volSum += day.maxVolRatio;
    });

    const latestRows = s.rowsByDate.get(s.latestDate) ?? [];
    const latestSnapshot = buildLatestSnapshot(s.latestDate, latestRows);

    result.set(stock, {
      stock,
      rows: s.rows,
      // latestRow: pakai priceRow dari snapshot untuk backward compat
      latestRow: latestSnapshot.priceRow,
      latestSnapshot,
      topBrokerNetAccum: s.topBrokerNetAccum,
      avgTopBrokerConc:
        s.topBrokerConcCount > 0 ? s.topBrokerConcSum / s.topBrokerConcCount : 0,
      totalMarketVal: s.totalMarketVal,
      totalDays: s.trackedDates.size,
      absorptionDays,
      distributionDays,
      avgVolRatio: s.trackedDates.size > 0 ? volSum / s.trackedDates.size : 1,
      dayFlags: s.dayFlags,
    });
  });

  return result;
}

export function getEstimateStatus(agg: StockAggregate): string {
  const { topBrokerNetAccum: topNetBuy, avgTopBrokerConc, absorptionDays } = agg;
  if (topNetBuy > 0 && avgTopBrokerConc > 0.4 && absorptionDays >= 1) {
    return 'HEAVY ACCUMULATION';
  }
  if (topNetBuy > 0) return 'ACCUMULATION';
  if (topNetBuy < 0 && avgTopBrokerConc > 0.4) return 'HEAVY DISTRIBUTION';
  if (topNetBuy < 0) return 'DISTRIBUTION';
  return 'BALANCED';
}

/**
 * Hitung confidence multiplier dari Wyckoff.
 * - confidence < 20 → penalti besar (data tidak cukup / fase tidak jelas)
 * - confidence 20–50 → partial
 * - confidence > 50 → full atau bonus
 */
function wyckoffConfidenceMultiplier(confidence: number): number {
  if (confidence < 20) return 0.4;
  if (confidence < 35) return 0.65;
  if (confidence < 50) return 0.80;
  if (confidence < 70) return 1.0;
  return 1.1; // bonus sedikit kalau confidence tinggi
}

/**
 * Hitung majority broker factor: rasio broker bullish di hari terakhir.
 * Kalau mayoritas broker net sell, score diturunkan.
 * Range: 0.5 (semua seller) → 1.0 (balanced) → 1.2 (semua buyer)
 */
function majorityBrokerFactor(snapshot: LatestDaySnapshot): number {
  if (snapshot.brokersTotal === 0) return 1.0;
  const bullishRatio = snapshot.brokersBullish / snapshot.brokersTotal;
  // 0% bullish = 0.5, 50% = 1.0, 100% = 1.2
  return 0.5 + bullishRatio * 0.7;
}

export function computeStockLevelScore(
  agg: StockAggregate,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): StockLevelScore {
  const snap = agg.latestSnapshot;
  const topNetBuy = agg.topBrokerNetAccum;
  const w = weights;

  // === Komponen scoring (sama seperti sebelumnya) ===
  const intensity = agg.totalMarketVal > 0 ? topNetBuy / agg.totalMarketVal : 0;
  const aggNetBuyScore = Math.max(
    -w.brokerFlowMax,
    Math.min(w.brokerFlowMax, intensity * 10 * w.brokerFlowMax)
  );
  const aggVolumeScore = Math.min(w.volumeMax, agg.avgVolRatio * (w.volumeMax / 2));

  const phaseCap = w.phaseMax;
  let aggPhaseBonus =
    snap.phase.phase === 'MARKUP'
      ? phaseCap
      : snap.phase.phase === 'ACCUMULATION'
        ? Math.round(phaseCap * 0.65)
        : snap.phase.phase === 'SIDEWAYS'
          ? 0
          : snap.phase.phase === 'DISTRIBUTION'
            ? -Math.round(phaseCap * 0.65)
            : -phaseCap;

  if (snap.phase.mtfAlignment === 'STRONG') {
    aggPhaseBonus += snap.phase.mtfScore > 0 ? 8 : -8;
  } else if (snap.phase.mtfAlignment === 'ALIGNED') {
    aggPhaseBonus += snap.phase.mtfScore > 0 ? 4 : -4;
  } else if (snap.phase.mtfAlignment === 'CONFLICT') {
    aggPhaseBonus -= 6;
  }
  if (snap.phase.wyckoffEvent === 'SPRING' || snap.phase.wyckoffEvent === 'LPS') {
    aggPhaseBonus += 5;
  }
  if (snap.phase.wyckoffEvent === 'UPTHRUST') {
    aggPhaseBonus -= 5;
  }

  const aggBehaviorScore = Math.max(
    -w.behaviorMax,
    Math.min(w.behaviorMax, computeStockBehaviorScore(agg))
  );

  // FIX: Pakai avgCandleStrength dari snapshot (rata-rata semua broker), bukan satu broker
  const aggPriceScore = Math.min(w.priceMax, snap.avgCandleStrength * w.priceMax);

  const rawTotalScore =
    w.base + aggNetBuyScore + aggVolumeScore + aggPhaseBonus + aggBehaviorScore + aggPriceScore;
  const verdictScore = Number(Math.max(0, Math.min(100, rawTotalScore)).toFixed(1));

  // === FIX B: Confidence-weighted score ===
  const confMultiplier = wyckoffConfidenceMultiplier(snap.wyckoffConfidence);
  const majorityFactor = majorityBrokerFactor(snap);

  // Score dasar dikali confidence multiplier dan majority factor
  // Base (20) tidak di-discount karena selalu ada, hanya komponen variabel
  const variableScore = verdictScore - w.base;
  const adjustedVariable = variableScore * confMultiplier * majorityFactor;
  const confidenceAdjustedScore = Number(
    Math.max(0, Math.min(100, w.base + adjustedVariable)).toFixed(1)
  );

  // === Grade & Signal pakai confidenceAdjustedScore (bukan raw) ===
  let grade = 'D';
  if (confidenceAdjustedScore >= 80) grade = 'A+';
  else if (confidenceAdjustedScore >= 65) grade = 'A';
  else if (confidenceAdjustedScore >= 50) grade = 'B+';
  else if (confidenceAdjustedScore >= 35) grade = 'B';
  else if (confidenceAdjustedScore >= 20) grade = 'C';

  // === FIX D: Confidence filter — data kurang tidak dapat sinyal kuat ===
  let signal: string;
  const isDataInsufficient = snap.phase.dataQuality === 'INSUFFICIENT';
  const isLowConfidence = snap.wyckoffConfidence < 30;

  if (isDataInsufficient) {
    // Data < 10 candle: paksa ke WATCH/MONITOR/AVOID
    if (grade === 'A+' || grade === 'A') signal = 'WATCH';
    else if (grade === 'B+') signal = 'MONITOR';
    else signal = 'AVOID';
  } else if (isLowConfidence) {
    // Confidence rendah: downgrade satu level
    if (grade === 'A+') signal = 'BUY';
    else if (grade === 'A') signal = 'WATCH';
    else if (grade === 'B+') signal = 'MONITOR';
    else if (grade === 'B') signal = 'AVOID';
    else signal = 'SELL';
  } else {
    if (grade === 'A+') signal = 'BUY NOW';
    else if (grade === 'A') signal = 'BUY';
    else if (grade === 'B+') signal = 'WATCH';
    else if (grade === 'B') signal = 'MONITOR';
    else if (grade === 'C') signal = 'AVOID';
    else signal = 'SELL';
  }

  return {
    verdictScore,
    confidenceAdjustedScore,
    grade,
    signal,
    estimateStatus: getEstimateStatus(agg),
    wyckoffConfidence: snap.wyckoffConfidence,
    dataQuality: snap.phase.dataQuality,
    scoreBreakdown: {
      brokerFlow: aggNetBuyScore,
      volume: aggVolumeScore,
      phase: aggPhaseBonus,
      behavior: aggBehaviorScore,
      price: aggPriceScore,
    },
  };
}

/** One OHLC row per calendar day (for ATR / trading plan). */
export function getLastNDailyCandles(rows: ProcessedData[], n: number): ProcessedData[] {
  const byDate = new Map<string, ProcessedData>();
  for (const r of rows) {
    if (!byDate.has(r.raw.date)) byDate.set(r.raw.date, r);
  }
  const dates = Array.from(byDate.keys()).sort();
  return dates.slice(-n).map((d) => byDate.get(d)!);
}

export function latestDayHasDistribution(agg: StockAggregate): boolean {
  const flags = agg.dayFlags.get(agg.latestSnapshot.priceRow.raw.date);
  return flags?.hasDistribution ?? false;
}

/** Skor behavior level saham (−10 s/d +10), bukan satu broker saja. */
export function computeStockBehaviorScore(agg: StockAggregate): number {
  let score = 0;

  if (agg.absorptionDays > agg.distributionDays) {
    score = Math.min(10, 4 + agg.absorptionDays * 2);
  } else if (agg.distributionDays > agg.absorptionDays) {
    score = Math.max(-10, -4 - agg.distributionDays * 2);
  }

  const latestDate = agg.latestSnapshot.priceRow.raw.date;
  const latestDay = agg.dayFlags.get(latestDate);
  if (latestDay?.hasAbsorption) score += 3;
  if (latestDay?.hasDistribution) score -= 3;

  // FIX C: Pakai mayoritas broker bukan satu broker
  const snap = agg.latestSnapshot;
  const bullishRatio = snap.brokersTotal > 0
    ? snap.brokersBullish / snap.brokersTotal
    : 0.5;

  if (bullishRatio >= 0.7) score += 2;      // mayoritas kuat beli
  else if (bullishRatio >= 0.5) score += 1;  // mayoritas tipis beli
  else if (bullishRatio <= 0.3) score -= 2;  // mayoritas kuat jual
  else if (bullishRatio < 0.5) score -= 1;   // mayoritas tipis jual

  // Phase-based modifier
  const b = snap.priceRow.behavior;
  if (b.markdown === 'MARKDOWN') score -= 2;
  if (b.buyWeakness === 'BOW') score += 2;
  if (b.sellStrength === 'SOS') score -= 2;

  return Math.max(-10, Math.min(10, score));
}

/** Label behavior untuk tampilan rekomendasi (level saham). */
export function getStockBehaviorSummary(agg: StockAggregate): string {
  if (agg.absorptionDays > agg.distributionDays) {
    return `AKUMULASI (${agg.absorptionDays}/${agg.totalDays} hari)`;
  }
  if (agg.distributionDays > agg.absorptionDays) {
    return `DISTRIBUSI (${agg.distributionDays}/${agg.totalDays} hari)`;
  }

  const latestDate = agg.latestSnapshot.priceRow.raw.date;
  const latestDay = agg.dayFlags.get(latestDate);
  if (latestDay?.hasAbsorption && latestDay?.hasDistribution) {
    return 'CAMPURAN (hari ini)';
  }
  if (latestDay?.hasAbsorption) return 'ABSORPSI (hari ini)';
  if (latestDay?.hasDistribution) return 'DISTRIBUSI (hari ini)';

  const snap = agg.latestSnapshot;
  const bullishRatio = snap.brokersTotal > 0
    ? snap.brokersBullish / snap.brokersTotal
    : 0.5;

  if (bullishRatio >= 0.7) return `MAYORITAS BELI (${snap.brokersBullish}/${snap.brokersTotal} broker)`;
  if (bullishRatio <= 0.3) return `MAYORITAS JUAL (${snap.brokersTotal - snap.brokersBullish}/${snap.brokersTotal} broker)`;

  const b = snap.priceRow.behavior;
  const patterns: string[] = [];
  if (b.absorption === 'ABSORPTION') patterns.push('Absorpsi');
  if (b.distribution === 'DISTRIBUTION') patterns.push('Distribusi');
  if (b.markup === 'MARKUP') patterns.push('Markup');
  if (b.markdown === 'MARKDOWN') patterns.push('Markdown');
  if (b.buyWeakness === 'BOW') patterns.push('BOW');
  if (b.sellStrength === 'SOS') patterns.push('SOS');
  if (patterns.length > 0) return patterns.join(' · ');

  const label = b.behaviorLabel?.trim();
  return label && label !== '—' ? label : 'NETRAL';
}
