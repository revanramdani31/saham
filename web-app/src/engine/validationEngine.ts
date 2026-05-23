import type { ProcessedData } from './types';
import {
  buildRecommendationAsOf,
  type RecommendationVerdict,
} from './recommendations';

export type ValidationOutcome = 'BENAR' | 'SALAH' | 'NETRAL' | 'MENUNGGU';

export interface ValidationOptions {
  /** Jumlah sesi trading ke depan untuk cek harga */
  forwardSessions: number;
  /** Return % dianggap sukses untuk sinyal beli */
  successThresholdPct: number;
  /** Return % dianggap gagal untuk sinyal beli */
  failThresholdPct: number;
}

export const DEFAULT_VALIDATION_OPTIONS: ValidationOptions = {
  forwardSessions: 5,
  successThresholdPct: 2,
  failThresholdPct: -2,
};

export interface ValidationRecord {
  id: string;
  stock: string;
  signalDate: string;
  verdict: RecommendationVerdict;
  verdictScore: number;
  entryClose: number;
  futureDate: string | null;
  futureClose: number | null;
  returnPct: number | null;
  forwardSessions: number;
  autoOutcome: ValidationOutcome;
  tp1Hit: boolean | null;
  stopLossHit: boolean | null;
  sessionsLeft?: number;
}

export function validationRecordId(
  stock: string,
  signalDate: string,
  forwardSessions: number
): string {
  return `${stock}|${signalDate}|${forwardSessions}`;
}

function getDailyCloses(
  data: ProcessedData[],
  stock: string
): { date: string; close: number; high: number; low: number }[] {
  const byDate = new Map<string, { close: number; high: number; low: number }>();
  for (const r of data) {
    if (r.raw.stock !== stock) continue;
    if (!byDate.has(r.raw.date)) {
      byDate.set(r.raw.date, {
        close: r.raw.close,
        high: r.raw.high,
        low: r.raw.low,
      });
    }
  }
  return Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, ohlc]) => ({ date, ...ohlc }));
}

function evaluateOutcome(
  verdict: RecommendationVerdict,
  returnPct: number,
  opts: ValidationOptions
): ValidationOutcome {
  const { successThresholdPct, failThresholdPct } = opts;
  const bullish = verdict === 'STRONG BUY' || verdict === 'BUY';
  const bearish = verdict === 'SELL' || verdict === 'AVOID';

  if (bullish) {
    if (returnPct >= successThresholdPct) return 'BENAR';
    if (returnPct <= failThresholdPct) return 'SALAH';
    return 'NETRAL';
  }

  if (bearish) {
    if (returnPct <= failThresholdPct) return 'BENAR';
    if (returnPct >= successThresholdPct) return 'SALAH';
    return 'NETRAL';
  }

  // WATCH: netral kecuali pergerakan ekstrem
  if (Math.abs(returnPct) >= successThresholdPct) return 'NETRAL';
  return 'NETRAL';
}

function checkTpSlInWindow(
  candles: { date: string; close: number; high: number; low: number }[],
  startIdx: number,
  endIdx: number,
  stopLoss: number,
  tp1: number,
  verdict: RecommendationVerdict
): { tp1Hit: boolean | null; stopLossHit: boolean | null } {
  if (verdict !== 'STRONG BUY' && verdict !== 'BUY') {
    return { tp1Hit: null, stopLossHit: null };
  }

  let tp1Hit = false;
  let stopLossHit = false;
  for (let i = startIdx + 1; i <= endIdx; i++) {
    const c = candles[i];
    if (c.low <= stopLoss) stopLossHit = true;
    if (c.high >= tp1) tp1Hit = true;
  }
  return { tp1Hit, stopLossHit };
}

/**
 * Walk-forward: untuk setiap tanggal & saham, bangun rekomendasi hanya dari data masa lalu,
 * lalu bandingkan dengan harga N sesi ke depan.
 */
export function runRecommendationValidation(
  data: ProcessedData[],
  options: ValidationOptions = DEFAULT_VALIDATION_OPTIONS
): ValidationRecord[] {
  const stocks = [...new Set(data.map((r) => r.raw.stock))];
  const records: ValidationRecord[] = [];

  for (const stock of stocks) {
    const candles = getDailyCloses(data, stock);
    if (candles.length < 2) continue;

    for (let i = 0; i < candles.length; i++) {
      const signalDate = candles[i].date;
      const entryClose = candles[i].close;

      const rec = buildRecommendationAsOf(data, stock, signalDate);
      if (!rec) continue;

      const futureIdx = i + options.forwardSessions;
      const id = validationRecordId(stock, signalDate, options.forwardSessions);

      if (futureIdx >= candles.length) {
        records.push({
          id,
          stock,
          signalDate,
          verdict: rec.verdict,
          verdictScore: rec.verdictScore,
          entryClose,
          futureDate: null,
          futureClose: null,
          returnPct: null,
          forwardSessions: options.forwardSessions,
          autoOutcome: 'MENUNGGU',
          tp1Hit: null,
          stopLossHit: null,
          sessionsLeft: options.forwardSessions - (candles.length - 1 - i),
        });
        continue;
      }

      const future = candles[futureIdx];
      const returnPct =
        entryClose === 0
          ? 0
          : ((future.close - entryClose) / entryClose) * 100;

      const { tp1Hit, stopLossHit } = checkTpSlInWindow(
        candles,
        i,
        futureIdx,
        rec.stopLoss,
        rec.tp1,
        rec.verdict
      );

      records.push({
        id,
        stock,
        signalDate,
        verdict: rec.verdict,
        verdictScore: rec.verdictScore,
        entryClose,
        futureDate: future.date,
        futureClose: future.close,
        returnPct: Number(returnPct.toFixed(2)),
        forwardSessions: options.forwardSessions,
        autoOutcome: evaluateOutcome(rec.verdict, returnPct, options),
        tp1Hit,
        stopLossHit,
      });
    }
  }

  return records.sort((a, b) => b.signalDate.localeCompare(a.signalDate));
}

export interface ValidationStats {
  total: number;
  validated: number;
  pending: number;
  benar: number;
  salah: number;
  netral: number;
  accuracyPct: number;
  byVerdict: Record<string, { total: number; benar: number; salah: number }>;
}

export function computeValidationStats(
  records: ValidationRecord[],
  getFinalOutcome: (r: ValidationRecord) => ValidationOutcome
): ValidationStats {
  const byVerdict: Record<string, { total: number; benar: number; salah: number }> = {};
  let benar = 0;
  let salah = 0;
  let netral = 0;
  let pending = 0;

  for (const r of records) {
    const outcome = getFinalOutcome(r);
    if (outcome === 'MENUNGGU') {
      pending++;
      continue;
    }
    if (!byVerdict[r.verdict]) {
      byVerdict[r.verdict] = { total: 0, benar: 0, salah: 0 };
    }
    byVerdict[r.verdict].total++;

    if (outcome === 'BENAR') {
      benar++;
      byVerdict[r.verdict].benar++;
    } else if (outcome === 'SALAH') {
      salah++;
      byVerdict[r.verdict].salah++;
    } else {
      netral++;
    }
  }

  const validated = benar + salah + netral;
  const decisive = benar + salah;
  const accuracyPct = decisive > 0 ? (benar / decisive) * 100 : 0;

  return {
    total: records.length,
    validated,
    pending,
    benar,
    salah,
    netral,
    accuracyPct,
    byVerdict,
  };
}
