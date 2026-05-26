import type { OhlcvBar } from './timeframeAggregation';

export const MIN_CANDLES_LIMITED = 10;
export const MIN_CANDLES_GOOD = 20;
export const MIN_CANDLES_OPTIMAL = 30;

export type WyckoffPhase =
  | 'ACCUMULATION'
  | 'MARKUP'
  | 'DISTRIBUTION'
  | 'MARKDOWN'
  | 'SIDEWAYS';

export type WyckoffEvent = 'SPRING' | 'UPTHRUST' | 'LPS' | 'NONE';

export type DataQuality = 'INSUFFICIENT' | 'LIMITED' | 'GOOD' | 'OPTIMAL';

export interface WyckoffAnalysis {
  date: string;
  phase: WyckoffPhase;
  wyckoffStage: string;
  phaseScore: number;
  confidence: number;
  action: string;
  vsaSignal: string;
  vsaSignals: string[];
  wyckoffEvent: WyckoffEvent;
  eventDetail: string;
  candleCount: number;
  dataQuality: DataQuality;
  rangeHigh: number;
  rangeLow: number;
  closePositionInRange: number;
  spreadRatio: number;
  volumeRatio: number;
}

interface WyckoffSpringValidation {
  rangeAge: number; // days since range formed
  volumeOnSpring: boolean; // volume on spring > avg
  closeRecovery: boolean; // close recovered back into range
  subsequentVolume: boolean; // volume after spring increased
  brokerAbsorption: boolean; // netBuy on spring > 0 (approx. bandar absorption)
}

function avg(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function getDataQuality(n: number): DataQuality {
  if (n < MIN_CANDLES_LIMITED) return 'INSUFFICIENT';
  if (n < MIN_CANDLES_GOOD) return 'LIMITED';
  if (n < MIN_CANDLES_OPTIMAL) return 'GOOD';
  return 'OPTIMAL';
}

function analyzeVSA(
  bars: OhlcvBar[],
  _rangeHigh: number,
  rangeLow: number
): { signals: string[]; primary: string } {
  const signals: string[] = [];
  const last = bars.at(-1)!;
  const prev = bars.length >= 2 ? bars.at(-2)! : last;

  const spread = last.high - last.low;
  const avgSpread = avg(bars.slice(-20).map((b) => b.high - b.low)) || spread;
  const avgVol = avg(bars.slice(-20).map((b) => b.volume)) || last.volume;

  const spreadRatio = avgSpread === 0 ? 1 : spread / avgSpread;
  const volumeRatio = avgVol === 0 ? 1 : last.volume / avgVol;
  const progress = last.close - prev.close;

  if (volumeRatio > 1.5 && spreadRatio > 1.2 && Math.abs(progress) < avgSpread * 0.25) {
    signals.push('EFFORT vs RESULT (reversal risk)');
  }

  if (
    last.close < last.open &&
    volumeRatio > 1.4 &&
    last.low >= prev.low &&
    bars.slice(-5).filter((b) => b.close < b.open).length >= 2
  ) {
    signals.push('STOPPING VOLUME');
  }

  if (last.close > last.open && volumeRatio < 0.7) {
    signals.push('NO DEMAND');
  }

  if (last.close < last.open && volumeRatio < 0.7 && last.close > rangeLow) {
    signals.push('NO SUPPLY');
  }

  if (volumeRatio > 2 && spreadRatio > 1.5) {
    signals.push('CLIMACTIC VOLUME');
  }

  const primary = signals[0] ?? 'NEUTRAL VSA';
  return { signals, primary };
}

function detectWyckoffEvent(bars: OhlcvBar[], rangeHigh: number, rangeLow: number, phase: WyckoffPhase): { event: WyckoffEvent; detail: string } {
  return getWyckoffEventDetailed(bars, rangeHigh, rangeLow, phase);
}

function getWyckoffEventDetailed(bars: OhlcvBar[], rangeHigh: number, rangeLow: number, phase: WyckoffPhase): { event: WyckoffEvent; detail: string } {
  if (bars.length < 5) return { event: 'NONE', detail: '' };

  const rangeSize = rangeHigh - rangeLow;
  if (rangeSize <= 0) return { event: 'NONE', detail: '' };

  const last = bars.at(-1)!;
  const avgVol = avg(bars.slice(-30).map((b) => b.volume)) || last.volume;

  const EVENT_LOOKBACK = Math.min(20, Math.max(6, Math.floor(bars.length / 3)));
  const MIN_RANGE_AGE = 10; // days
  const VOL_MULT = 1.1;
  const SUBSEQ_VOL_MULT = 1.05;

  const eventCandidates = bars.slice(-1 - EVENT_LOOKBACK, -1);

  const firstHighIndex = bars.findIndex((b) => b.high === rangeHigh);
  const firstLowIndex = bars.findIndex((b) => b.low === rangeLow);
  const firstExtremeIndex = Math.min(
    firstHighIndex === -1 ? Infinity : firstHighIndex,
    firstLowIndex === -1 ? Infinity : firstLowIndex
  );
  const rangeAge = firstExtremeIndex === Infinity ? bars.length : bars.length - firstExtremeIndex;

  const opts = { bars, last, rangeLow, rangeHigh, rangeSize, avgVol, rangeAge, MIN_RANGE_AGE, VOL_MULT, SUBSEQ_VOL_MULT };

  for (const b of eventCandidates) {
    const s = evaluateSpringCandidate(b, opts);
    if (s) return { event: 'SPRING', detail: s };
  }

  for (const b of eventCandidates) {
    const s = evaluateUpthrustCandidate(b, opts);
    if (s) return { event: 'UPTHRUST', detail: s };
  }

  // LPS detection moved to helper
  const lpsDetail = evaluateLps(bars, last, rangeLow, rangeSize, phase);
  if (lpsDetail) return { event: 'LPS', detail: lpsDetail };

  return { event: 'NONE', detail: '' };
}

function scorePhase(
  bars: OhlcvBar[],
  _rangeHigh: number,
  _rangeLow: number,
  closePos: number,
  event: WyckoffEvent,
  vsaSignals: string[]
): { phase: WyckoffPhase; score: number } {
  // const n unused — removed to satisfy linter
  const closes = bars.map((b) => b.close);
  const sma10 = avg(closes.slice(-10));
  const sma20 = avg(closes.slice(-20));
  const last = bars.at(-1)!;

  const netBuyRecent = avg(bars.slice(-5).map((b) => b.netBuy));
  const netBuyOlder = avg(bars.slice(-15, -5).map((b) => b.netBuy));
  const netBuyTrend = netBuyRecent - netBuyOlder;

  let score = 0;

  score += computeTrendScore(last.close, sma10, sma20);
  score += computePositionScore(closePos);
  score += computeNetBuyScore(netBuyTrend);
  score += computeWyckoffEventScore(event);
  score += computeVSAModifiers(vsaSignals, closePos);

  let phase: WyckoffPhase = 'SIDEWAYS';
  if (score >= 5) phase = 'MARKUP';
  else if (score >= 2) phase = 'ACCUMULATION';
  else if (score <= -5) phase = 'MARKDOWN';
  else if (score <= -2) phase = 'DISTRIBUTION';

  return { phase, score };
}

function computeTrendScore(lastClose: number, sma10: number, sma20: number) {
  if (lastClose > sma10 && sma10 > sma20) return 3;
  if (lastClose < sma10 && sma10 < sma20) return -3;
  if (lastClose > sma20) return 1;
  if (lastClose < sma20) return -1;
  return 0;
}

function computePositionScore(closePos: number) {
  if (closePos > 0.65) return 2;
  if (closePos < 0.35) return -2;
  return 0;
}

function computeNetBuyScore(netBuyTrend: number) {
  if (netBuyTrend > 0) return 2;
  if (netBuyTrend < 0) return -2;
  return 0;
}

function computeWyckoffEventScore(event: WyckoffEvent) {
  if (event === 'SPRING') return 4;
  if (event === 'LPS') return 3;
  if (event === 'UPTHRUST') return -4;
  return 0;
}

function computeVSAModifiers(vsaSignals: string[], closePos: number) {
  let s = 0;
  if (vsaSignals.some((t) => t.includes('STOPPING') || t.includes('NO SUPPLY'))) s += 1;
  if (vsaSignals.some((t) => t.includes('NO DEMAND') || t.includes('EFFORT'))) s -= 1;
  if (vsaSignals.some((t) => t.includes('CLIMACTIC'))) s += closePos > 0.5 ? -1 : 1;
  return s;
}

function evaluateLps(bars: OhlcvBar[], last: OhlcvBar, rangeLow: number, rangeSize: number, phase: WyckoffPhase): string | null {
  if (phase !== 'ACCUMULATION' && phase !== 'MARKUP') return null;
  const supportZone = rangeLow + rangeSize * 0.35;
  const nearSupport = last.low <= supportZone && last.close > supportZone;
  const volDeclining = bars.length >= 3 && bars.at(-2)!.volume > last.volume && last.close > last.open;
  if (nearSupport && volDeclining) return 'Pullback ke support dengan volume menurun — entry zone potensial';
  return null;
}

function wyckoffStageLabel(phase: WyckoffPhase, event: WyckoffEvent, isPhaseB = false): string {
  if (isPhaseB) return 'Phase B — Building Cause';
  if (event === 'SPRING') return 'Phase C — Spring (test)';
  if (event === 'UPTHRUST') return 'Phase C — Upthrust (UTAD)';
  if (event === 'LPS') return 'Phase D — Last Point of Support';
  if (phase === 'ACCUMULATION') return 'Phase A/B — Accumulation';
  if (phase === 'MARKUP') return 'Phase D/E — Markup';
  if (phase === 'DISTRIBUTION') return 'Phase A/B — Distribution';
  if (phase === 'MARKDOWN') return 'Phase D/E — Markdown';
  return 'Phase B — Trading Range';
}

function detectPhaseB(bars: OhlcvBar[], rangeHigh: number, rangeLow: number): boolean {
  // Heuristics: long-lived range with multiple tests of support/resistance
  if (bars.length < 18) return false;
  const rangeSize = rangeHigh - rangeLow;
  if (rangeSize <= 0) return false;
  const touchThreshold = Math.max(1, rangeSize * 0.02);
  let touches = 0;
  for (const b of bars) {
    if (b.low <= rangeLow + touchThreshold) touches++;
    if (b.high >= rangeHigh - touchThreshold) touches++;
  }
  // count distinct tests: require at least 4 touches and longevity
  const firstHighIndex = bars.findIndex((b) => b.high === rangeHigh);
  const firstLowIndex = bars.findIndex((b) => b.low === rangeLow);
  const firstExtremeIndex = Math.min(
    firstHighIndex === -1 ? Infinity : firstHighIndex,
    firstLowIndex === -1 ? Infinity : firstLowIndex
  );
  const rangeAge = firstExtremeIndex === Infinity ? bars.length : bars.length - firstExtremeIndex;
  return touches >= 4 && rangeAge >= 12;
}

function evaluateSpringCandidate(b: OhlcvBar, opts: {
  bars: OhlcvBar[];
  last: OhlcvBar;
  rangeLow: number;
  rangeSize: number;
  avgVol: number;
  rangeAge: number;
  MIN_RANGE_AGE: number;
  VOL_MULT: number;
  SUBSEQ_VOL_MULT: number;
}): string | null {
  const { bars, last, rangeLow, rangeSize, avgVol, rangeAge, MIN_RANGE_AGE, VOL_MULT, SUBSEQ_VOL_MULT } = opts;
  const threshold = rangeLow - rangeSize * 0.02;
  if (!(b.low < threshold && b.close > rangeLow)) return null;
  const idx = bars.indexOf(b);
  const nextBar = idx + 1 < bars.length ? bars.at(idx + 1) : undefined;
  const volumeOnSpring = b.volume > avgVol * VOL_MULT;
  const closeRecovery = last.close > rangeLow && last.close > b.close;
  const subsequentVolume = nextBar ? nextBar.volume > b.volume * SUBSEQ_VOL_MULT : false;
  const brokerAbsorption = (b.netBuy ?? 0) > 0;
  const validations: WyckoffSpringValidation = {
    rangeAge,
    volumeOnSpring,
    closeRecovery,
    subsequentVolume,
    brokerAbsorption,
  };
  const supportive = [volumeOnSpring, subsequentVolume, brokerAbsorption].filter(Boolean).length >= 1;
  if (rangeAge >= MIN_RANGE_AGE && closeRecovery && supportive) {
    return `False breakdown ${b.date} lalu recovery — tanda akumulasi. Validasi: ${JSON.stringify(validations)}`;
  }
  return null;
}

function evaluateUpthrustCandidate(b: OhlcvBar, opts: {
  bars: OhlcvBar[];
  last: OhlcvBar;
  rangeHigh: number;
  rangeSize: number;
  avgVol: number;
  rangeAge: number;
  MIN_RANGE_AGE: number;
  VOL_MULT: number;
  SUBSEQ_VOL_MULT: number;
}): string | null {
  const { bars, last, rangeHigh, rangeSize, avgVol, rangeAge, MIN_RANGE_AGE, VOL_MULT, SUBSEQ_VOL_MULT } = opts;
  const threshold = rangeHigh + rangeSize * 0.02;
  if (!(b.high > threshold && b.close < rangeHigh)) return null;
  const idx = bars.indexOf(b);
  const nextBar = idx + 1 < bars.length ? bars.at(idx + 1) : undefined;
  const volumeOnUpthrust = b.volume > avgVol * VOL_MULT;
  const closeRejection = last.close < rangeHigh && last.close < b.close;
  const subsequentVolume = nextBar ? nextBar.volume > b.volume * SUBSEQ_VOL_MULT : false;
  const brokerDistribution = (b.netBuy ?? 0) < 0;
  const validations = {
    rangeAge,
    volumeOnSpring: volumeOnUpthrust,
    closeRecovery: closeRejection,
    subsequentVolume,
    brokerAbsorption: brokerDistribution,
  };
  const supportive = [volumeOnUpthrust, subsequentVolume, brokerDistribution].filter(Boolean).length >= 1;
  if (rangeAge >= MIN_RANGE_AGE && closeRejection && supportive) {
    return `False breakout ${b.date} lalu rejection — tanda distribusi. Validasi: ${JSON.stringify(validations)}`;
  }
  return null;
}

function actionForPhase(phase: WyckoffPhase, event: WyckoffEvent): string {
  if (event === 'SPRING' || event === 'LPS') return 'ACCUMULATE / BUY';
  if (event === 'UPTHRUST') return 'REDUCE / SELL';
  if (phase === 'MARKUP') return 'BUY/HOLD';
  if (phase === 'ACCUMULATION') return 'ACCUMULATE';
  if (phase === 'DISTRIBUTION') return 'REDUCE/SELL';
  if (phase === 'MARKDOWN') return 'AVOID';
  return 'WATCH';
}

/**
 * Analisa Wyckoff + VSA pada serangkaian OHLCV (satu timeframe).
 */
export function analyzeWyckoff(bars: OhlcvBar[]): WyckoffAnalysis {
  const n = bars.length;
  const last = bars[n - 1];
  const dataQuality = getDataQuality(n);

  if (n === 0) {
    return {
      date: '',
      phase: 'SIDEWAYS',
      wyckoffStage: 'No data',
      phaseScore: 0,
      confidence: 0,
      action: 'WATCH',
      vsaSignal: '—',
      vsaSignals: [],
      wyckoffEvent: 'NONE',
      eventDetail: '',
      candleCount: 0,
      dataQuality: 'INSUFFICIENT',
      rangeHigh: 0,
      rangeLow: 0,
      closePositionInRange: 0.5,
      spreadRatio: 1,
      volumeRatio: 1,
    };
  }

  const lookback = Math.min(30, n);
  const window = bars.slice(-lookback);
  const rangeHigh = Math.max(...window.map((b) => b.high));
  const rangeLow = Math.min(...window.map((b) => b.low));
  const rangeSize = rangeHigh - rangeLow;
  const closePos = rangeSize === 0 ? 0.5 : (last.close - rangeLow) / rangeSize;

  const { signals: vsaSignals, primary: vsaSignal } = analyzeVSA(window, rangeHigh, rangeLow);
  const { phase: preliminaryPhase } = scorePhase(window, rangeHigh, rangeLow, closePos, 'NONE', vsaSignals);
  const { event, detail } = detectWyckoffEvent(window, rangeHigh, rangeLow, preliminaryPhase);
  const isPhaseB = detectPhaseB(window, rangeHigh, rangeLow);
  const { phase, score } = scorePhase(window, rangeHigh, rangeLow, closePos, event, vsaSignals);

  const spread = last.high - last.low;
  const avgSpread = avg(window.slice(-20).map((b) => b.high - b.low)) || spread;
  const avgVol = avg(window.slice(-20).map((b) => b.volume)) || last.volume;

  let confidence = Math.min(100, Math.abs(score) * 12 + 25);
  let qualityFactor = 0.25;
  if (dataQuality === 'OPTIMAL') qualityFactor = 1;
  else if (dataQuality === 'GOOD') qualityFactor = 0.85;
  else if (dataQuality === 'LIMITED') qualityFactor = 0.55;
  confidence = Math.round(confidence * qualityFactor);

  if (event !== 'NONE') confidence = Math.min(100, confidence + 10);
  if (isPhaseB) confidence = Math.min(100, confidence + 5);

  return {
    date: last.date,
    phase,
    wyckoffStage: wyckoffStageLabel(phase, event, isPhaseB),
    phaseScore: score,
    confidence,
    action: actionForPhase(phase, event),
    vsaSignal,
    vsaSignals,
    wyckoffEvent: event,
    eventDetail: detail,
    candleCount: n,
    dataQuality,
    rangeHigh,
    rangeLow,
    closePositionInRange: closePos,
    spreadRatio: avgSpread === 0 ? 1 : spread / avgSpread,
    volumeRatio: avgVol === 0 ? 1 : last.volume / avgVol,
  };
}
