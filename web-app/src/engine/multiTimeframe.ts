import type { OhlcvBar } from './timeframeAggregation';
import { aggregateToMonthly, aggregateToWeekly } from './timeframeAggregation';
import {
  analyzeWyckoff,
  type WyckoffAnalysis,
  type WyckoffPhase,
  MIN_CANDLES_GOOD,
} from './wyckoffDetector';

export type MtfAlignment = 'STRONG' | 'ALIGNED' | 'MIXED' | 'CONFLICT' | 'INSUFFICIENT';

export interface MultiTimeframeResult {
  daily: WyckoffAnalysis;
  weekly: WyckoffAnalysis;
  monthly: WyckoffAnalysis;
  confirmedPhase: WyckoffPhase;
  alignment: MtfAlignment;
  alignmentScore: number;
  alignmentDetail: string;
}

const BULLISH_PHASES: WyckoffPhase[] = ['ACCUMULATION', 'MARKUP'];
const BEARISH_PHASES: WyckoffPhase[] = ['DISTRIBUTION', 'MARKDOWN'];

function phaseBias(phase: WyckoffPhase): number {
  if (BULLISH_PHASES.includes(phase)) return 1;
  if (BEARISH_PHASES.includes(phase)) return -1;
  return 0;
}

function barsUpToDate(bars: OhlcvBar[], asOfDate: string): OhlcvBar[] {
  return bars.filter((b) => b.date <= asOfDate);
}

function weeklyUpTo(daily: OhlcvBar[], asOfDate: string): OhlcvBar[] {
  const weekly = aggregateToWeekly(daily);
  return weekly.filter((b) => b.date <= asOfDate);
}

function monthlyUpTo(daily: OhlcvBar[], asOfDate: string): OhlcvBar[] {
  const monthly = aggregateToMonthly(daily);
  return monthly.filter((b) => b.date <= asOfDate);
}

export function analyzeMultiTimeframe(
  dailyBars: OhlcvBar[],
  asOfDate: string
): MultiTimeframeResult {
  const dBars = barsUpToDate(dailyBars, asOfDate);
  const wBars = weeklyUpTo(dailyBars, asOfDate);
  const mBars = monthlyUpTo(dailyBars, asOfDate);

  const daily = analyzeWyckoff(dBars);
  const weekly = analyzeWyckoff(wBars);
  const monthly = analyzeWyckoff(mBars);

  const biases = [phaseBias(daily.phase), phaseBias(weekly.phase), phaseBias(monthly.phase)];
  const sum = biases.reduce((a, b) => a + b, 0);
  const alignmentScore = Math.round((sum / 3) * 100);

  let alignment: MtfAlignment = 'MIXED';
  let alignmentDetail = 'Timeframe tidak selaras — tunggu konfirmasi';

  const minDaily = dBars.length >= MIN_CANDLES_GOOD;

  if (!minDaily || dBars.length < 10) {
    alignment = 'INSUFFICIENT';
    alignmentDetail = `Butuh minimal ${MIN_CANDLES_GOOD} candle harian untuk MTF andal (saat ini: ${dBars.length})`;
  } else if (sum === 3) {
    alignment = 'STRONG';
    alignmentDetail = 'Daily + Weekly + Monthly bullish — sinyal kuat';
  } else if (sum === -3) {
    alignment = 'STRONG';
    alignmentDetail = 'Daily + Weekly + Monthly bearish — hindari beli';
  } else if (sum === 2 || sum === -2) {
    alignment = 'ALIGNED';
    alignmentDetail = sum > 0 ? 'Mayoritas timeframe bullish' : 'Mayoritas timeframe bearish';
  } else if (sum === 0) {
    alignment = 'MIXED';
    alignmentDetail = 'Campuran fase — kurangi ukuran posisi';
  } else {
    alignment = 'CONFLICT';
    alignmentDetail = 'Daily vs Weekly/Monthly bertentangan — risiko tinggi';
  }

  // Confirmed phase: daily default, upgrade if MTF agrees
  let confirmedPhase = daily.phase;
  if (alignment === 'STRONG' || alignment === 'ALIGNED') {
    if (sum > 0) confirmedPhase = sum >= 2 ? 'MARKUP' : 'ACCUMULATION';
    if (sum < 0) confirmedPhase = sum <= -2 ? 'MARKDOWN' : 'DISTRIBUTION';
  }

  return {
    daily,
    weekly,
    monthly,
    confirmedPhase,
    alignment,
    alignmentScore,
    alignmentDetail,
  };
}
