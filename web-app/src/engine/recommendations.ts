import type { ProcessedData } from './types';
import type { ScoringWeights } from './adaptiveScoring';
import { DEFAULT_WEIGHTS } from './adaptiveScoring';
import type { MarketRegime } from './marketRegime';
import {
  buildStockAggregates,
  computeStockLevelScore,
  getLastNDailyCandles,
  getStockBehaviorSummary,
  latestDayHasDistribution,
} from './stockAggregation';

export type RecommendationVerdict = 'STRONG BUY' | 'BUY' | 'WATCH' | 'AVOID' | 'SELL';

export interface StockRecommendation {
  stock: string;
  latestClose: number;
  latestDate: string;
  totalScore: number;
  grade: string;
  signal: string;
  phase: string;
  wyckoffStage: string;
  phaseScore: number;
  phaseConfidence: number;
  behaviorLabel: string;
  cumulativeNetBuy: number;
  topBrokerNetAccum: number;
  topBrokerConcentration: number;
  brokerFlowSignal: string;
  brokerDomination: string;
  avgVolRatio: number;
  volSignal: string;
  absorptionDays: number;
  distributionDays: number;
  estimateStatus: string;
  pricePhase: string;
  candleStrength: number;
  verdictScore: number;
  verdict: RecommendationVerdict;
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  riskPercent: number;
  tp1RR: number;
  tp2RR: number;
  tp3RR: number;
  marketRegime: MarketRegime;
  scoreBreakdown: {
    brokerFlow: number;
    volume: number;
    phase: number;
    behavior: number;
    price: number;
  };
  warnings: string[];
}

function adjustVerdictByMarket(
  verdict: RecommendationVerdict,
  phase: string,
  marketRegime: MarketRegime,
  warnings: string[]
): RecommendationVerdict {
  if (marketRegime.ihsgPhase === 'BULL') {
    if (verdict === 'WATCH' && phase === 'ACCUMULATION') return 'BUY';
    return verdict;
  }

  if (marketRegime.ihsgPhase === 'BEAR') {
    if (phase === 'MARKUP') {
      warnings.push('⚠️ IHSG BEAR: markup ini perlu verifikasi ekstra (potensi false breakout / manipulasi)');
      if (verdict === 'STRONG BUY') return 'BUY';
      if (verdict === 'BUY') return 'WATCH';
      return verdict;
    }

    if (phase === 'ACCUMULATION' && (verdict === 'STRONG BUY' || verdict === 'BUY')) {
      warnings.push('⚠️ IHSG BEAR: akumulasi cenderung diperlakukan sebagai watchlist sampai market membaik');
      return 'WATCH';
    }
  }

  return verdict;
}

export function buildRecommendations(
  data: ProcessedData[],
  weights: ScoringWeights = DEFAULT_WEIGHTS,
  marketRegime: MarketRegime = {
    ihsgPhase: 'SIDEWAYS',
    ihsgTrend: 'FLAT',
    sectorRotation: 'N/A',
    foreignFlow: 'NEUTRAL',
    fearGreedIndex: 50,
    commentary: 'Belum ada market regime.',
    source: 'proxy',
  }
): StockRecommendation[] {
  const aggregates = buildStockAggregates(data);
  const results: StockRecommendation[] = [];

  aggregates.forEach((agg, stock) => {
    const snap = agg.latestSnapshot;
    const lr = snap.priceRow;
    const close = lr.raw.close;
    const topNetBuy = agg.topBrokerNetAccum;
    const avgTopBrokerConc = agg.avgTopBrokerConc;
    const avgVolRatio = agg.avgVolRatio;

    const { verdictScore: _rawScore, confidenceAdjustedScore, grade, signal, estimateStatus, scoreBreakdown, wyckoffConfidence, dataQuality } =
      computeStockLevelScore(agg, weights);

    // FIX A: Unified scoring — pakai confidenceAdjustedScore untuk semua keputusan
    const effectiveScore = confidenceAdjustedScore;

    const warnings: string[] = [];
    if (latestDayHasDistribution(agg)) {
      warnings.push('⚠️ Terdeteksi pola distribusi bandar (hari terakhir)');
    }
    if (snap.phase.phase === 'MARKDOWN') warnings.push('⚠️ Saham dalam fase MARKDOWN – hindari beli');
    if (snap.phase.phase === 'DISTRIBUTION') warnings.push('⚠️ Fase distribusi Wyckoff – bandar sedang jual');
    if (agg.distributionDays > agg.absorptionDays && agg.distributionDays > 1) {
      warnings.push('⚠️ Hari distribusi lebih banyak dari absorpsi');
    }
    if (avgVolRatio < 0.5) warnings.push('⚠️ Volume rendah – kurang likuid');
    if (lr.price.pricePhase === 'MARKDOWN') warnings.push('⚠️ Price action menunjukkan tekanan jual kuat');
    if (topNetBuy < 0) warnings.push('⚠️ Top broker net seller – bandar utama sedang distribusi');
    if (avgTopBrokerConc > 0.6 && topNetBuy < 0) {
      warnings.push('⚠️ Konsentrasi tinggi pada seller – distribusi terkonsentrasi');
    }
    // FIX D: Warning data kualitas rendah
    if (dataQuality === 'INSUFFICIENT') {
      warnings.push('⚠️ Data < 10 hari — sinyal tidak reliable, tambah data historis');
    } else if (dataQuality === 'LIMITED') {
      warnings.push('⚠️ Data terbatas (< 20 hari) — confidence Wyckoff rendah');
    }
    // FIX C: Warning mayoritas broker jual
    if (snap.brokersTotal > 0 && snap.brokersBullish / snap.brokersTotal < 0.3) {
      warnings.push(`⚠️ Mayoritas broker net sell (${snap.brokersTotal - snap.brokersBullish}/${snap.brokersTotal} broker)`);
    }

    if (marketRegime.ihsgPhase === 'BEAR' && snap.phase.phase === 'MARKUP') {
      warnings.push('⚠️ Market bear vs markup: sinyal bisa lebih berisiko / tidak sustainable');
    }

    if (marketRegime.ihsgPhase === 'BULL' && snap.phase.phase === 'ACCUMULATION') {
      warnings.push('✅ Market bull mendukung akumulasi');
    }

    // FIX A+D: Verdict pakai effectiveScore (confidence-adjusted) bukan raw verdictScore
    let verdict: RecommendationVerdict = 'AVOID';
    if (effectiveScore >= 65 && warnings.length === 0) verdict = 'STRONG BUY';
    else if (effectiveScore >= 50 && warnings.length <= 1) verdict = 'BUY';
    else if (effectiveScore >= 35) verdict = 'WATCH';
    else if (snap.phase.phase === 'MARKDOWN' || latestDayHasDistribution(agg)) verdict = 'SELL';
    else verdict = 'AVOID';

    verdict = adjustVerdictByMarket(verdict, snap.phase.phase, marketRegime, warnings);

    const last5 = getLastNDailyCandles(agg.rows, 5);
    const candleCount = Math.max(last5.length, 1);
    const avgHigh = last5.reduce((acc, r) => acc + r.raw.high, 0) / candleCount;
    const avgLow = last5.reduce((acc, r) => acc + r.raw.low, 0) / candleCount;
    const avgRange = avgHigh - avgLow;
    const slBuffer = Math.max(avgRange * 0.5, close * 0.03);

    const entryLow = Math.round(close - avgRange * 0.2);
    const entryHigh = Math.round(close);
    const entryMid = (entryLow + entryHigh) / 2;
    const stopLoss = Math.round(entryMid - slBuffer);
    const riskAmt = entryMid - stopLoss;
    const riskPercent = entryMid > 0 ? (riskAmt / entryMid) * 100 : 0;

    const tp1 = Math.round(entryMid + riskAmt * 1.5);
    const tp2 = Math.round(entryMid + riskAmt * 3);
    const tp3 = Math.round(entryMid + riskAmt * 5);

    results.push({
      stock,
      latestClose: close,
      latestDate: lr.raw.date,
      totalScore: effectiveScore,        // FIX A: unified score
      grade,
      signal,
      phase: snap.phase.phase,
      wyckoffStage: snap.phase.wyckoffStage,
      phaseScore: snap.phase.phaseScore,
      phaseConfidence: wyckoffConfidence,
      behaviorLabel: getStockBehaviorSummary(agg),
      cumulativeNetBuy: topNetBuy,
      topBrokerNetAccum: topNetBuy,
      topBrokerConcentration: avgTopBrokerConc,
      brokerFlowSignal: lr.flow.signal,
      brokerDomination: lr.flow.domination,
      avgVolRatio,
      volSignal: lr.volume.volSignal,
      absorptionDays: agg.absorptionDays,
      distributionDays: agg.distributionDays,
      estimateStatus,
      pricePhase: lr.price.pricePhase,
      candleStrength: snap.avgCandleStrength,   // FIX C: rata-rata semua broker
      verdictScore: effectiveScore,
      verdict,
      entryLow,
      entryHigh,
      stopLoss,
      tp1,
      tp2,
      tp3,
      riskPercent,
      tp1RR: 1.5,
      tp2RR: 3,
      tp3RR: 5,
      marketRegime,
      scoreBreakdown,
      warnings,
    });
  });

  return results.sort((a, b) => b.verdictScore - a.verdictScore);
}

/** Rekomendasi satu saham pada tanggal tertentu (hanya data ≤ asOfDate). */
export function buildRecommendationAsOf(
  data: ProcessedData[],
  stock: string,
  asOfDate: string,
  marketRegime?: MarketRegime
): StockRecommendation | null {
  const subset = data.filter((r) => r.raw.stock === stock && r.raw.date <= asOfDate);
  if (subset.length === 0) return null;
  return buildRecommendations(subset, DEFAULT_WEIGHTS, marketRegime).find((r) => r.stock === stock) ?? null;
}
