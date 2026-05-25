import type { RawTradeData } from './types';
import type { DailyStockTotals } from './types';

export interface OhlcvBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  netBuy: number;
}

export function buildDailyBars(
  rawData: RawTradeData[],
  stock: string,
  dailyTotalsLookup: (date: string, stock: string) => DailyStockTotals
): OhlcvBar[] {
  const byDate = new Map<string, RawTradeData>();

  for (const row of rawData) {
    if (row.stock !== stock) continue;
    if (!byDate.has(row.date)) byDate.set(row.date, row);
  }

  return Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, row]) => {
      const totals = dailyTotalsLookup(date, stock);
      const netBuy = totals.top3BuyerNetBuy + totals.top3SellerNetBuy;
      return {
        date,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: totals.totalVolume,
        netBuy,
      };
    });
}

function aggregateBars(daily: OhlcvBar[], groupKey: (date: string) => string): OhlcvBar[] {
  const groups = new Map<string, OhlcvBar[]>();

  for (const bar of daily) {
    const key = groupKey(bar.date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(bar);
  }

  const result: OhlcvBar[] = [];
  for (const [_key, bars] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
    result.push({
      date: sorted[sorted.length - 1].date,
      open: sorted[0].open,
      high: Math.max(...sorted.map((b) => b.high)),
      low: Math.min(...sorted.map((b) => b.low)),
      close: sorted[sorted.length - 1].close,
      volume: sorted.reduce((s, b) => s + b.volume, 0),
      netBuy: sorted.reduce((s, b) => s + b.netBuy, 0),
    });
  }

  return result;
}

/** ISO week key (YYYY-Www) */
function weekKey(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function aggregateToWeekly(daily: OhlcvBar[]): OhlcvBar[] {
  return aggregateBars(daily, weekKey);
}

export function aggregateToMonthly(daily: OhlcvBar[]): OhlcvBar[] {
  return aggregateBars(daily, (d) => d.slice(0, 7));
}
