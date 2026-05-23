import type { ProcessedData } from './types';

interface DayFlags {
  hasAbsorption: boolean;
  hasDistribution: boolean;
  maxVolRatio: number;
}

export interface StockAggregate {
  stock: string;
  rows: ProcessedData[];
  latestRow: ProcessedData;
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
  grade: string;
  signal: string;
  estimateStatus: string;
  scoreBreakdown: {
    brokerFlow: number;
    volume: number;
    phase: number;
    behavior: number;
    price: number;
  };
}

export function buildStockAggregates(data: ProcessedData[]): Map<string, StockAggregate> {
  const map = new Map<string, {
    rows: ProcessedData[];
    latestRow: ProcessedData | null;
    topBrokerNetAccum: number;
    topBrokerConcSum: number;
    topBrokerConcCount: number;
    totalMarketVal: number;
    trackedDates: Set<string>;
    dayFlags: Map<string, DayFlags>;
  }>();

  const sorted = [...data].sort(
    (a, b) => new Date(a.raw.date).getTime() - new Date(b.raw.date).getTime()
  );

  for (const row of sorted) {
    const stock = row.raw.stock;
    if (!map.has(stock)) {
      map.set(stock, {
        rows: [],
        latestRow: null,
        topBrokerNetAccum: 0,
        topBrokerConcSum: 0,
        topBrokerConcCount: 0,
        totalMarketVal: 0,
        trackedDates: new Set(),
        dayFlags: new Map(),
      });
    }

    const s = map.get(stock)!;
    s.rows.push(row);

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

    if (
      !s.latestRow ||
      row.raw.date > s.latestRow.raw.date ||
      (row.raw.date === s.latestRow.raw.date &&
        row.score.totalScore > s.latestRow.score.totalScore)
    ) {
      s.latestRow = row;
    }
  }

  const result = new Map<string, StockAggregate>();
  map.forEach((s, stock) => {
    if (!s.latestRow) return;

    let absorptionDays = 0;
    let distributionDays = 0;
    let volSum = 0;

    s.dayFlags.forEach((day) => {
      if (day.hasAbsorption) absorptionDays++;
      if (day.hasDistribution) distributionDays++;
      volSum += day.maxVolRatio;
    });

    result.set(stock, {
      stock,
      rows: s.rows,
      latestRow: s.latestRow,
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

export function computeStockLevelScore(agg: StockAggregate): StockLevelScore {
  const lr = agg.latestRow;
  const topNetBuy = agg.topBrokerNetAccum;

  const intensity = agg.totalMarketVal > 0 ? topNetBuy / agg.totalMarketVal : 0;
  const aggNetBuyScore = Math.max(-30, Math.min(30, intensity * 10 * 30));
  const aggVolumeScore = Math.min(15, agg.avgVolRatio * 7.5);

  const aggPhaseBonus =
    lr.phase.phase === 'MARKUP'
      ? 15
      : lr.phase.phase === 'ACCUMULATION'
        ? 10
        : lr.phase.phase === 'SIDEWAYS'
          ? 0
          : lr.phase.phase === 'DISTRIBUTION'
            ? -10
            : -15;

  const aggBehaviorScore = computeStockBehaviorScore(agg);

  const aggPriceScore = Math.min(10, lr.price.candleStrength * 10);
  const rawTotalScore =
    20 + aggNetBuyScore + aggVolumeScore + aggPhaseBonus + aggBehaviorScore + aggPriceScore;
  const verdictScore = Number(Math.max(0, Math.min(100, rawTotalScore)).toFixed(1));

  let grade = 'D';
  if (verdictScore >= 80) grade = 'A+';
  else if (verdictScore >= 65) grade = 'A';
  else if (verdictScore >= 50) grade = 'B+';
  else if (verdictScore >= 35) grade = 'B';
  else if (verdictScore >= 20) grade = 'C';

  let signal = 'SELL';
  if (grade === 'A+') signal = 'BUY NOW';
  else if (grade === 'A') signal = 'BUY';
  else if (grade === 'B+') signal = 'WATCH';
  else if (grade === 'B') signal = 'MONITOR';
  else if (grade === 'C') signal = 'AVOID';

  return {
    verdictScore,
    grade,
    signal,
    estimateStatus: getEstimateStatus(agg),
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
  const flags = agg.dayFlags.get(agg.latestRow.raw.date);
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

  const latestDay = agg.dayFlags.get(agg.latestRow.raw.date);
  if (latestDay?.hasAbsorption) score += 3;
  if (latestDay?.hasDistribution) score -= 3;

  const b = agg.latestRow.behavior;
  if (b.markup === 'MARKUP') score += 2;
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

  const latestDay = agg.dayFlags.get(agg.latestRow.raw.date);
  if (latestDay?.hasAbsorption && latestDay?.hasDistribution) {
    return 'CAMPURAN (hari ini)';
  }
  if (latestDay?.hasAbsorption) return 'ABSORPSI (hari ini)';
  if (latestDay?.hasDistribution) return 'DISTRIBUSI (hari ini)';

  const b = agg.latestRow.behavior;
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
