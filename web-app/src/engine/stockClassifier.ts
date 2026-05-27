/**
 * stockClassifier.ts — FIX 3: Adaptive threshold per karakteristik saham
 *
 * Masalah sebelumnya: grade A+ = skor ≥ 80 berlaku sama untuk SEMUA saham.
 * Saham perbankan (BBRI, BMRI) punya profil volume & broker flow beda total
 * dibanding saham tambang (ANTM, MDKA) atau properti (BSDE, PWON).
 *
 * Solusi: Klasifikasi otomatis berdasarkan data yang sudah ada (harga, likuiditas, ticker)
 * tanpa perlu input manual user — lalu sesuaikan threshold grade per profil.
 */

// ─────────────────────────────────────────────
// Tipe & Profil
// ─────────────────────────────────────────────

export type StockTier = 'LQ45' | 'MID' | 'SMALL' | 'MICRO';
export type StockSector = 'BANKING' | 'MINING' | 'PROPERTY' | 'CONSUMER' | 'INFRA' | 'TECH' | 'OTHER';

export interface StockProfile {
  ticker: string;
  tier: StockTier;
  sector: StockSector;
  /** Threshold skor untuk grade A+ (BUY NOW) */
  gradeAPlus: number;
  /** Threshold skor untuk grade A (BUY) */
  gradeA: number;
  /** Threshold skor untuk grade B+ (WATCH) */
  gradeBPlus: number;
  /** Threshold skor untuk grade B (MONITOR) */
  gradeB: number;
  /** Threshold skor untuk grade C (AVOID) */
  gradeC: number;
  /** Min volRatio yang dianggap signifikan untuk sektor ini */
  volRatioSignificant: number;
  /** Label sektor untuk display */
  sectorLabel: string;
}

// ─────────────────────────────────────────────
// Database ticker per sektor (IDX)
// Tidak perlu lengkap — cukup saham yang sering muncul
// ─────────────────────────────────────────────

const BANKING_TICKERS = new Set([
  'BBCA','BBRI','BMRI','BBNI','BNGA','BDMN','BTPS','BJBR','BJTM',
  'AGRO','ARTO','BBYB','BCIC','BINA','BMAS','BNBA','BNGA','BPFI',
  'BRIS','BSIM','BTPN','BVIC','INPC','MAYA','MCOR','MEGA','NISP','PNBS',
]);

const MINING_TICKERS = new Set([
  'ANTM','MDKA','ADMR','ADRO','PTBA','ITMG','HRUM','BUMI','BYAN',
  'INCO','TINS','AALI','LSIP','SSMS','SIMP','UNSP','MITI','DOID',
  'GEMS','KKGI','MBAP','MYOH','PKPK','SMMT','SMRU','TOBA','GTBO',
]);

const PROPERTY_TICKERS = new Set([
  'BSDE','PWON','SMRA','CTRA','LPKR','ASRI','DILD','EMDE','GPRA',
  'JRPT','KIJA','MDLN','MKPI','MTLA','MYRX','NIRO','PLIN','POLL',
  'PPRO','RDTX','RODA','SCBD','SMDM','TARA','DMAS',
]);

const CONSUMER_TICKERS = new Set([
  'UNVR','ICBP','INDF','MYOR','KLBF','SIDO','ULTJ','CLEO','FOOD',
  'GOOD','HOKI','IIKP','KEJU','MLBI','MOLI','PSGO','SKLT','STTP',
  'WMUU','ADES','AISA','CEKA','DLTA','GGRM','HMSP','RMBA',
]);

const INFRA_TICKERS = new Set([
  'TLKM','ISAT','EXCL','LINK','TBIG','TOWR','JSMR','WIKA','WSKT',
  'PTPP','ADHI','ACST','NRCA','SSIA','TOTL','DGIK','MTRA','PULH',
  'IDPR','META','MPXL','PGAS','PEHA','SMGR','INTP',
]);

const TECH_TICKERS = new Set([
  'GOTO','BUKA','EMTK','KPIG','DMMX','MTEL','FILM','MCAS','NFCX',
  'NICI','PPGL','WIFI','EDGE','MTDL','MLPT','PTSN','LCKM',
]);

// ─────────────────────────────────────────────
// Threshold default per sektor
// Logika: sektor dengan volume volatilitas tinggi (mining, tech)
// butuh threshold lebih longgar agar tidak over-filter.
// Sektor defensif (banking, consumer) lebih stabil, threshold lebih ketat.
// ─────────────────────────────────────────────

const SECTOR_THRESHOLDS: Record<StockSector, {
  gradeAPlus: number; gradeA: number; gradeBPlus: number; gradeB: number; gradeC: number;
  volRatioSignificant: number;
}> = {
  // Banking: volume pola stabil, sinyal bandar lebih presisi → threshold ketat
  BANKING:  { gradeAPlus: 78, gradeA: 62, gradeBPlus: 47, gradeB: 32, gradeC: 18, volRatioSignificant: 1.8 },
  // Mining: volume sangat volatile (harga komoditas, berita), butuh threshold lebih longgar
  MINING:   { gradeAPlus: 72, gradeA: 57, gradeBPlus: 42, gradeB: 28, gradeC: 15, volRatioSignificant: 2.5 },
  // Property: illiquid secara relatif, cycle panjang → threshold longgar
  PROPERTY: { gradeAPlus: 70, gradeA: 55, gradeBPlus: 40, gradeB: 26, gradeC: 14, volRatioSignificant: 2.2 },
  // Consumer: stabil seperti banking tapi lebih sedikit broker besar → sedikit lebih longgar
  CONSUMER: { gradeAPlus: 75, gradeA: 60, gradeBPlus: 45, gradeB: 30, gradeC: 17, volRatioSignificant: 1.9 },
  // Infra/Telco: campuran, volume moderat
  INFRA:    { gradeAPlus: 74, gradeA: 59, gradeBPlus: 44, gradeB: 29, gradeC: 16, volRatioSignificant: 2.0 },
  // Tech: volume sangat tidak stabil, banyak noise → threshold paling longgar
  TECH:     { gradeAPlus: 70, gradeA: 55, gradeBPlus: 40, gradeB: 25, gradeC: 13, volRatioSignificant: 3.0 },
  // Other: pakai threshold standar
  OTHER:    { gradeAPlus: 75, gradeA: 60, gradeBPlus: 45, gradeB: 30, gradeC: 17, volRatioSignificant: 2.0 },
};

// ─────────────────────────────────────────────
// Tier adjustment: saham kecil butuh threshold lebih longgar
// karena volume mereka naturally lebih volatile
// ─────────────────────────────────────────────

const TIER_DELTA: Record<StockTier, number> = {
  LQ45:  0,   // no adjustment, threshold sektor sudah cukup
  MID:  -3,   // sedikit lebih longgar
  SMALL: -6,  // lebih longgar lagi
  MICRO: -10, // paling longgar — tapi sudah difilter liquidity gate Fix 2
};

// ─────────────────────────────────────────────
// Klasifikasi tier berdasarkan avg daily market value
// ─────────────────────────────────────────────

export function classifyTier(avgDailyMarketVal: number): StockTier {
  if (avgDailyMarketVal >= 50_000_000_000) return 'LQ45';   // ≥ 50 miliar/hari
  if (avgDailyMarketVal >= 5_000_000_000)  return 'MID';    // ≥ 5 miliar/hari
  if (avgDailyMarketVal >= 500_000_000)    return 'SMALL';  // ≥ 500 juta/hari
  return 'MICRO';                                            // < 500 juta/hari
}

// ─────────────────────────────────────────────
// Klasifikasi sektor berdasarkan ticker
// ─────────────────────────────────────────────

export function classifySector(ticker: string): StockSector {
  const t = ticker.toUpperCase().trim();
  if (BANKING_TICKERS.has(t))  return 'BANKING';
  if (MINING_TICKERS.has(t))   return 'MINING';
  if (PROPERTY_TICKERS.has(t)) return 'PROPERTY';
  if (CONSUMER_TICKERS.has(t)) return 'CONSUMER';
  if (INFRA_TICKERS.has(t))    return 'INFRA';
  if (TECH_TICKERS.has(t))     return 'TECH';
  return 'OTHER';
}

// Label display
const SECTOR_LABELS: Record<StockSector, string> = {
  BANKING:  'Perbankan',
  MINING:   'Tambang/Komoditas',
  PROPERTY: 'Properti',
  CONSUMER: 'Konsumer',
  INFRA:    'Infrastruktur/Telco',
  TECH:     'Teknologi',
  OTHER:    'Lainnya',
};

// ─────────────────────────────────────────────
// Main function: buat profil saham dari ticker + likuiditas
// ─────────────────────────────────────────────

export function getStockProfile(
  ticker: string,
  avgDailyMarketVal: number
): StockProfile {
  const sector = classifySector(ticker);
  const tier   = classifyTier(avgDailyMarketVal);
  const base   = SECTOR_THRESHOLDS[sector];
  const delta  = TIER_DELTA[tier];

  return {
    ticker,
    tier,
    sector,
    gradeAPlus:  base.gradeAPlus  + delta,
    gradeA:      base.gradeA      + delta,
    gradeBPlus:  base.gradeBPlus  + delta,
    gradeB:      base.gradeB      + delta,
    gradeC:      base.gradeC      + delta,
    volRatioSignificant: base.volRatioSignificant,
    sectorLabel: SECTOR_LABELS[sector],
  };
}

// ─────────────────────────────────────────────
// Grade dari skor menggunakan profil adaptif
// ─────────────────────────────────────────────

export function getAdaptiveGrade(score: number, profile: StockProfile): string {
  if (score >= profile.gradeAPlus) return 'A+';
  if (score >= profile.gradeA)     return 'A';
  if (score >= profile.gradeBPlus) return 'B+';
  if (score >= profile.gradeB)     return 'B';
  if (score >= profile.gradeC)     return 'C';
  return 'D';
}

// ─────────────────────────────────────────────
// Signal dari grade + data quality (sama seperti sebelumnya)
// ─────────────────────────────────────────────

export function getAdaptiveSignal(
  grade: string,
  dataQuality: string,
  wyckoffConfidence: number
): string {
  const isInsufficient = dataQuality === 'INSUFFICIENT';
  const isLowConf      = wyckoffConfidence < 30;

  if (isInsufficient) {
    if (grade === 'A+' || grade === 'A') return 'WATCH';
    if (grade === 'B+') return 'MONITOR';
    return 'AVOID';
  }
  if (isLowConf) {
    if (grade === 'A+') return 'BUY';
    if (grade === 'A')  return 'WATCH';
    if (grade === 'B+') return 'MONITOR';
    if (grade === 'B')  return 'AVOID';
    return 'SELL';
  }

  if (grade === 'A+') return 'BUY NOW';
  if (grade === 'A')  return 'BUY';
  if (grade === 'B+') return 'WATCH';
  if (grade === 'B')  return 'MONITOR';
  if (grade === 'C')  return 'AVOID';
  return 'SELL';
}