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
  const last = bars[bars.length - 1];
  const prev = bars.length >= 2 ? bars[bars.length - 2] : last;

  const spread = last.high - last.low;
  const avgSpread = avg(bars.slice(-20).map((b) => b.high - b.low)) || spread;
  const avgVol = avg(bars.slice(-20).map((b) => b.volume)) || last.volume;

  const spreadRatio = avgSpread === 0 ? 1 : spread / avgSpread;
  const volumeRatio = avgVol === 0 ? 1 : last.volume / avgVol;
  const progress = last.close - prev.close;

  // Effort vs Result: high volume + wide spread but small net progress
  if (volumeRatio > 1.5 && spreadRatio > 1.2 && Math.abs(progress) < avgSpread * 0.25) {
    signals.push('EFFORT vs RESULT (reversal risk)');
  }

  // Stopping volume: high vol down-bar after decline, hold above low
  if (
    last.close < last.open &&
    volumeRatio > 1.4 &&
    last.low >= prev.low &&
    bars.slice(-5).filter((b) => b.close < b.open).length >= 2
  ) {
    signals.push('STOPPING VOLUME');
  }

  // No demand: up bar, low volume
  if (last.close > last.open && volumeRatio < 0.7) {
    signals.push('NO DEMAND');
  }

  // No supply: down bar, low volume in range
  if (last.close < last.open && volumeRatio < 0.7 && last.close > rangeLow) {
    signals.push('NO SUPPLY');
  }

  // Climactic action
  if (volumeRatio > 2 && spreadRatio > 1.5) {
    signals.push('CLIMACTIC VOLUME');
  }

  const primary = signals[0] ?? 'NEUTRAL VSA';
  return { signals, primary };
}

function detectWyckoffEvent(
  bars: OhlcvBar[],
  rangeHigh: number,
  rangeLow: number,
  phase: WyckoffPhase
): { event: WyckoffEvent; detail: string } {
  if (bars.length < 5) return { event: 'NONE', detail: '' };

  const rangeSize = rangeHigh - rangeLow;
  if (rangeSize <= 0) return { event: 'NONE', detail: '' };

  const last = bars[bars.length - 1];
  const lookback = bars.slice(-5, -1);

  // Spring: false breakdown below range then close back inside
  for (let i = 0; i < lookback.length; i++) {
    const b = lookback[i];
    const threshold = rangeLow - rangeSize * 0.02;
    if (b.low < threshold && b.close > rangeLow) {
      const confirmed = last.close > rangeLow && last.close > b.close;
      if (confirmed) {
        return {
          event: 'SPRING',
          detail: `False breakdown ${b.date} lalu recovery — tanda akumulasi`,
        };
      }
    }
  }

  // Upthrust: false breakout above range then close back inside
  for (let i = 0; i < lookback.length; i++) {
    const b = lookback[i];
    const threshold = rangeHigh + rangeSize * 0.02;
    if (b.high > threshold && b.close < rangeHigh) {
      const confirmed = last.close < rangeHigh && last.close < b.close;
      if (confirmed) {
        return {
          event: 'UPTHRUST',
          detail: `False breakout ${b.date} lalu rejection — tanda distribusi`,
        };
      }
    }
  }

  // LPS: Last Point of Support — pullback to support in markup/accum with decreasing vol
  if (phase === 'ACCUMULATION' || phase === 'MARKUP') {
    const supportZone = rangeLow + rangeSize * 0.35;
    const nearSupport = last.low <= supportZone && last.close > supportZone;
    const volDeclining =
      bars.length >= 3 &&
      bars[bars.length - 2].volume > last.volume &&
      last.close > last.open;
    if (nearSupport && volDeclining) {
      return {
        event: 'LPS',
        detail: 'Pullback ke support dengan volume menurun — entry zone potensial',
      };
    }
  }

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
  const n = bars.length;
  const closes = bars.map((b) => b.close);
  const sma10 = avg(closes.slice(-10));
  const sma20 = avg(closes.slice(-20));
  const last = bars[n - 1];

  const netBuyRecent = avg(bars.slice(-5).map((b) => b.netBuy));
  const netBuyOlder = avg(bars.slice(-15, -5).map((b) => b.netBuy));
  const netBuyTrend = netBuyRecent - netBuyOlder;

  let score = 0;

  // Trend structure
  if (last.close > sma10 && sma10 > sma20) score += 3;
  else if (last.close < sma10 && sma10 < sma20) score -= 3;
  else if (last.close > sma20) score += 1;
  else if (last.close < sma20) score -= 1;

  // Position in range
  if (closePos > 0.65) score += 2;
  else if (closePos < 0.35) score -= 2;

  // Net buy flow
  if (netBuyTrend > 0) score += 2;
  else if (netBuyTrend < 0) score -= 2;

  // Wyckoff events
  if (event === 'SPRING') score += 4;
  if (event === 'LPS') score += 3;
  if (event === 'UPTHRUST') score -= 4;

  // VSA modifiers
  if (vsaSignals.some((s) => s.includes('STOPPING') || s.includes('NO SUPPLY'))) score += 1;
  if (vsaSignals.some((s) => s.includes('NO DEMAND') || s.includes('EFFORT'))) score -= 1;
  if (vsaSignals.some((s) => s.includes('CLIMACTIC'))) {
    score += closePos > 0.5 ? -1 : 1;
  }

  let phase: WyckoffPhase = 'SIDEWAYS';
  if (score >= 5) phase = 'MARKUP';
  else if (score >= 2) phase = 'ACCUMULATION';
  else if (score <= -5) phase = 'MARKDOWN';
  else if (score <= -2) phase = 'DISTRIBUTION';

  return { phase, score };
}

function wyckoffStageLabel(phase: WyckoffPhase, event: WyckoffEvent): string {
  if (event === 'SPRING') return 'Phase C — Spring (test)';
  if (event === 'UPTHRUST') return 'Phase C — Upthrust (UTAD)';
  if (event === 'LPS') return 'Phase D — Last Point of Support';
  if (phase === 'ACCUMULATION') return 'Phase A/B — Accumulation';
  if (phase === 'MARKUP') return 'Phase D/E — Markup';
  if (phase === 'DISTRIBUTION') return 'Phase A/B — Distribution';
  if (phase === 'MARKDOWN') return 'Phase D/E — Markdown';
  return 'Phase B — Trading Range';
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
  const { phase, score } = scorePhase(window, rangeHigh, rangeLow, closePos, event, vsaSignals);

  const spread = last.high - last.low;
  const avgSpread = avg(window.slice(-20).map((b) => b.high - b.low)) || spread;
  const avgVol = avg(window.slice(-20).map((b) => b.volume)) || last.volume;

  let confidence = Math.min(100, Math.abs(score) * 12 + 25);
  const qualityFactor =
    dataQuality === 'OPTIMAL'
      ? 1
      : dataQuality === 'GOOD'
        ? 0.85
        : dataQuality === 'LIMITED'
          ? 0.55
          : 0.25;
  confidence = Math.round(confidence * qualityFactor);

  if (event !== 'NONE') confidence = Math.min(100, confidence + 10);

  return {
    date: last.date,
    phase,
    wyckoffStage: wyckoffStageLabel(phase, event),
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
