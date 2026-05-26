/**
 * Dynamic Broker Profiler
 * Mengklasifikasikan perilaku broker berdasarkan pola trading, bukan kode broker.
 */

export type BrokerBehaviorTag =
  | 'SCALPER'
  | 'ACCUMULATOR'
  | 'DISTRIBUTOR'
  | 'HIT_AND_RUN'
  | 'LIQUIDITY_PROVIDER'
  | 'SWING_TRADER'
  | 'PASSIVE';

export interface BrokerBehaviorProfile {
  tag: BrokerBehaviorTag;
  label: string;          // Human-readable label
  description: string;    // Penjelasan singkat
  confidence: number;     // 0-100
}

export interface BrokerProfileMetrics {
  totalBuyValue: number;
  totalSellValue: number;
  grossValue: number;
  netValue: number;       // signed
  absNetValue: number;
  netGrossRatio: number;  // |net| / gross, 0-1
  daysActive: number;
  totalMarketDays: number;
  participationRate: number; // daysActive / totalMarketDays, 0-1
  buyDays: number;
  sellDays: number;
  buyConsistency: number; // buyDays / daysActive, 0-1
  maxSingleDayNet: number;    // absolute
  avgDailyGross: number;
  concentrationRatio: number; // maxSingleDayNet / absNetValue — how concentrated their activity is
}

/**
 * Menghitung metrik profil dari data mentah per broker (atau per broker+stock).
 */
export function computeProfileMetrics(
  dailyRows: { buyValue: number; sellValue: number; netBuy: number }[],
  totalMarketDays: number,
): BrokerProfileMetrics {
  let totalBuyValue = 0;
  let totalSellValue = 0;
  let buyDays = 0;
  let sellDays = 0;
  let maxSingleDayNet = 0;

  for (const row of dailyRows) {
    totalBuyValue += row.buyValue;
    totalSellValue += row.sellValue;
    if (row.netBuy > 0) buyDays++;
    if (row.netBuy < 0) sellDays++;
    const absNet = Math.abs(row.netBuy);
    if (absNet > maxSingleDayNet) maxSingleDayNet = absNet;
  }

  const grossValue = totalBuyValue + totalSellValue;
  const netValue = totalBuyValue - totalSellValue;
  const absNetValue = Math.abs(netValue);
  const netGrossRatio = grossValue > 0 ? absNetValue / grossValue : 0;
  const daysActive = dailyRows.length;
  const participationRate = totalMarketDays > 0 ? daysActive / totalMarketDays : 0;
  const buyConsistency = daysActive > 0 ? buyDays / daysActive : 0;
  const avgDailyGross = daysActive > 0 ? grossValue / daysActive : 0;
  const concentrationRatio = absNetValue > 0 ? maxSingleDayNet / absNetValue : 0;

  return {
    totalBuyValue,
    totalSellValue,
    grossValue,
    netValue,
    absNetValue,
    netGrossRatio,
    daysActive,
    totalMarketDays,
    participationRate,
    buyDays,
    sellDays,
    buyConsistency,
    maxSingleDayNet,
    avgDailyGross,
    concentrationRatio,
  };
}

/**
 * Mengklasifikasikan perilaku broker berdasarkan metrik.
 * Prioritas: Hit & Run > Scalper > Accumulator/Distributor > Liquidity Provider > Swing > Passive
 */
export function classifyBrokerBehavior(m: BrokerProfileMetrics): BrokerBehaviorProfile {
  // ---- Hit & Run ----
  // Hanya aktif 1-2 hari, tapi transaksi besar & konsentrasi tinggi
  if (m.daysActive <= 2 && m.grossValue > 0 && m.concentrationRatio >= 0.8) {
    return {
      tag: 'HIT_AND_RUN',
      label: 'Hit & Run',
      description: `Masuk ${m.daysActive} hari dengan transaksi terkonsentrasi (${(m.concentrationRatio * 100).toFixed(0)}% di 1 hari). Biasanya spekulan jangka sangat pendek.`,
      confidence: Math.min(90, 60 + (1 - m.participationRate) * 30),
    };
  }

  // ---- Scalper / HFT ----
  // Net/Gross ratio sangat rendah → banyak bolak-balik
  if (m.netGrossRatio < 0.15 && m.daysActive >= 3) {
    const conf = Math.min(95, 60 + (1 - m.netGrossRatio) * 40);
    return {
      tag: 'SCALPER',
      label: 'Scalper / Day Trader',
      description: `Net/Gross hanya ${(m.netGrossRatio * 100).toFixed(1)}% — hampir semua yang dibeli langsung dijual kembali. Aktif ${m.daysActive} hari.`,
      confidence: conf,
    };
  }

  // ---- Accumulator ----
  // Net positif besar, konsistensi beli tinggi, dan aktif banyak hari
  if (m.netValue > 0 && m.buyConsistency >= 0.6 && m.netGrossRatio >= 0.3 && m.daysActive >= 3) {
    const conf = Math.min(95, 50 + m.buyConsistency * 30 + m.netGrossRatio * 20);
    return {
      tag: 'ACCUMULATOR',
      label: 'Accumulator',
      description: `Konsisten beli ${(m.buyConsistency * 100).toFixed(0)}% hari, Net/Gross ${(m.netGrossRatio * 100).toFixed(1)}%. Pola akumulasi kuat selama ${m.daysActive} hari.`,
      confidence: conf,
    };
  }

  // ---- Distributor ----
  // Net negatif besar, konsistensi jual tinggi
  const sellConsistency = m.daysActive > 0 ? m.sellDays / m.daysActive : 0;
  if (m.netValue < 0 && sellConsistency >= 0.6 && m.netGrossRatio >= 0.3 && m.daysActive >= 3) {
    const conf = Math.min(95, 50 + sellConsistency * 30 + m.netGrossRatio * 20);
    return {
      tag: 'DISTRIBUTOR',
      label: 'Distributor',
      description: `Konsisten jual ${(sellConsistency * 100).toFixed(0)}% hari, Net/Gross ${(m.netGrossRatio * 100).toFixed(1)}%. Pola distribusi kuat selama ${m.daysActive} hari.`,
      confidence: conf,
    };
  }

  // ---- Liquidity Provider ----
  // Sangat aktif (partisipasi tinggi), net rendah, gross besar
  if (m.participationRate >= 0.7 && m.netGrossRatio < 0.25) {
    return {
      tag: 'LIQUIDITY_PROVIDER',
      label: 'Liquidity Provider',
      description: `Hadir ${(m.participationRate * 100).toFixed(0)}% hari bursa dengan Net/Gross hanya ${(m.netGrossRatio * 100).toFixed(1)}%. Menyediakan likuiditas dua arah.`,
      confidence: Math.min(85, 50 + m.participationRate * 35),
    };
  }

  // ---- Swing Trader ----
  // Aktif beberapa hari, ada arah, tapi tidak se-konsisten accumulator/distributor
  if (m.daysActive >= 3 && m.netGrossRatio >= 0.15) {
    return {
      tag: 'SWING_TRADER',
      label: 'Swing Trader',
      description: `Aktif ${m.daysActive} hari dengan Net/Gross ${(m.netGrossRatio * 100).toFixed(1)}%. Punya arah tapi tidak konsisten penuh.`,
      confidence: 50,
    };
  }

  // ---- Passive ----
  return {
    tag: 'PASSIVE',
    label: 'Passive / Low Activity',
    description: `Aktivitas rendah (${m.daysActive} hari, partisipasi ${(m.participationRate * 100).toFixed(0)}%). Belum cukup data untuk profiling akurat.`,
    confidence: 30,
  };
}

/**
 * Warna badge berdasarkan behavior tag.
 */
export function getBehaviorBadgeStyle(tag: BrokerBehaviorTag) {
  switch (tag) {
    case 'SCALPER':
      return { color: '#D29922', bg: 'rgba(210, 153, 34, 0.12)', border: 'rgba(210, 153, 34, 0.35)' };
    case 'ACCUMULATOR':
      return { color: '#3FB950', bg: 'rgba(63, 185, 80, 0.12)', border: 'rgba(63, 185, 80, 0.35)' };
    case 'DISTRIBUTOR':
      return { color: '#F85149', bg: 'rgba(248, 81, 73, 0.12)', border: 'rgba(248, 81, 73, 0.35)' };
    case 'HIT_AND_RUN':
      return { color: '#F0883E', bg: 'rgba(240, 136, 62, 0.12)', border: 'rgba(240, 136, 62, 0.35)' };
    case 'LIQUIDITY_PROVIDER':
      return { color: '#58A6FF', bg: 'rgba(88, 166, 255, 0.12)', border: 'rgba(88, 166, 255, 0.35)' };
    case 'SWING_TRADER':
      return { color: '#BC8CFF', bg: 'rgba(188, 140, 255, 0.12)', border: 'rgba(188, 140, 255, 0.35)' };
    case 'PASSIVE':
    default:
      return { color: '#8B949E', bg: 'rgba(139, 148, 158, 0.08)', border: 'rgba(139, 148, 158, 0.25)' };
  }
}
