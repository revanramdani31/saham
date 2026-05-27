import type { RawTradeData, ProcessedData, BrokerFlowResult, PriceActionResult, VolumeAnalyzerResult, BrokerBehaviorResult, PhaseDetectorResult, ScoringEngineResult, StockSummary, BrokerSummary, DailyStockTotals } from './types';
import { buildStockAggregates, computeStockLevelScore } from './stockAggregation';
import { buildDailyBars } from './timeframeAggregation';
import { analyzeMultiTimeframe } from './multiTimeframe';
import { MIN_CANDLES_GOOD } from './wyckoffDetector';

/**
 * Helper type for the pre-calculated daily totals lookup map.
 * Key format: "date|stock"
 */
type DailyTotalsMap = Map<string, DailyStockTotals>;

export class BandarmologiEngine {
  private rawData: RawTradeData[];
  private dailyTotalsMap: DailyTotalsMap = new Map();
  private phaseMap: Map<string, PhaseDetectorResult> = new Map();

  constructor(data: RawTradeData[]) {
    // Sort data chronologically
    this.rawData = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  /**
   * FIX #1: Pre-calculate daily totals for each stock on each date.
   * This ensures that ALL broker rows on the same day see the SAME total values,
   * eliminating the bias where early-processed rows saw incomplete daily totals.
   *
   * Also calculates Top 3/5 Broker Concentration for smart money tracking (FIX #3).
   */
  private precalculateDailyTotals(): void {
    // Group all rows by date+stock
    const groups = new Map<string, RawTradeData[]>();
    for (const row of this.rawData) {
      const key = `${row.date}|${row.stock}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    // For each group, calculate complete daily totals + top broker concentration
    for (const [key, rows] of groups) {
      const totalBuyValue = rows.reduce((sum, d) => sum + d.buyValue, 0);
      const totalSellValue = rows.reduce((sum, d) => sum + d.sellValue, 0);
      const totalVolume = rows.reduce((sum, d) => sum + d.volume, 0);
      const totalNetBuy = totalBuyValue - totalSellValue;

      // Calculate per-broker net buy for concentration analysis
      const brokerNetBuys = rows.map(r => ({
        broker: r.broker,
        netBuy: r.buyValue - r.sellValue,
        buyValue: r.buyValue,
        sellValue: r.sellValue,
      }));

      // Sort by net buy descending to find top buyers
      const sortedByNetBuy = [...brokerNetBuys].sort((a, b) => b.netBuy - a.netBuy);

      // Top 3 & 5 Buyers (highest net buy)
      const top3Buyers = sortedByNetBuy.slice(0, Math.min(3, sortedByNetBuy.length));
      const top5Buyers = sortedByNetBuy.slice(0, Math.min(5, sortedByNetBuy.length));

      // Top 3 & 5 Sellers (lowest net buy = highest net sell)
      const top3Sellers = sortedByNetBuy.slice(-Math.min(3, sortedByNetBuy.length));
      const top5Sellers = sortedByNetBuy.slice(-Math.min(5, sortedByNetBuy.length));

      const top3BuyerNetBuy = top3Buyers.reduce((sum, b) => sum + b.netBuy, 0);
      const top3SellerNetBuy = top3Sellers.reduce((sum, b) => sum + b.netBuy, 0);
      const top5BuyerNetBuy = top5Buyers.reduce((sum, b) => sum + b.netBuy, 0);
      const top5SellerNetBuy = top5Sellers.reduce((sum, b) => sum + b.netBuy, 0);

      // Top buyer concentration: what % of total buy value do top 3 buyers hold?
      const top3BuyerBuyVal = top3Buyers.reduce((sum, b) => sum + b.buyValue, 0);
      const topBuyerConcentration = totalBuyValue === 0 ? 0 : top3BuyerBuyVal / totalBuyValue;

      // Top seller concentration: what % of total sell value do top 3 sellers hold?
      const top3SellerSellVal = top3Sellers.reduce((sum, b) => sum + b.sellValue, 0);
      const topSellerConcentration = totalSellValue === 0 ? 0 : top3SellerSellVal / totalSellValue;

      this.dailyTotalsMap.set(key, {
        totalBuyValue,
        totalSellValue,
        totalVolume,
        totalNetBuy,
        top3BuyerNetBuy,
        top3SellerNetBuy,
        top5BuyerNetBuy,
        top5SellerNetBuy,
        topBuyerConcentration,
        topSellerConcentration,
      });
    }
  }

  /**
   * Get pre-calculated daily totals for a given date+stock.
   */
  private getDailyTotals(date: string, stock: string): DailyStockTotals {
    const key = `${date}|${stock}`;
    return this.dailyTotalsMap.get(key) || {
      totalBuyValue: 0, totalSellValue: 0, totalVolume: 0, totalNetBuy: 0,
      top3BuyerNetBuy: 0, top3SellerNetBuy: 0,
      top5BuyerNetBuy: 0, top5SellerNetBuy: 0,
      topBuyerConcentration: 0, topSellerConcentration: 0,
    };
  }

  public processAll(): ProcessedData[] {
    // FIX #1: Pre-calculate all daily totals BEFORE processing rows
    this.precalculateDailyTotals();
    this.precalculateWyckoffPhases();

    const results: ProcessedData[] = [];

    // Process row by row with historical context available
    for (let i = 0; i < this.rawData.length; i++) {
      const row = this.rawData[i];
      const historicalData = this.rawData.slice(0, i + 1);
      const dailyTotals = this.getDailyTotals(row.date, row.stock);

      // FIX #1: Pass pre-calculated daily totals instead of partial slice
      const flow = this.calculateBrokerFlow(row, dailyTotals);
      const price = this.calculatePriceAction(row, historicalData);
      // FIX #2: Pass full rawData for proper historical avgVol (excluding today)
      const volume = this.calculateVolumeAnalyzer(row, dailyTotals, this.rawData);
      const behavior = this.calculateBrokerBehavior(row, flow, price, volume, this.rawData);

      // FIX #3 (Deep): Use Top Broker Net Accumulation for Phase Detector (avoid zero-sum total market bias)
      const netBuyAgg = dailyTotals.top3BuyerNetBuy + dailyTotals.top3SellerNetBuy;
      const phase = this.calculatePhaseDetector(row, price, volume, behavior, netBuyAgg);
      const score = this.calculateScoring(row, flow, price, volume, behavior, phase);

      results.push({ raw: row, flow, price, volume, behavior, phase, score, dailyTotals });
    }

    // Second pass: Calculate ranks
    this.applyRanks(results);

    return results;
  }

  /**
   * Wyckoff + VSA + multi-timeframe (D/W/M) per saham & tanggal.
   */
  private precalculateWyckoffPhases(): void {
    this.phaseMap.clear();
    const stocks = [...new Set(this.rawData.map((r) => r.stock))];

    for (const stock of stocks) {
      const dailyBars = buildDailyBars(this.rawData, stock, (d, s) =>
        this.getDailyTotals(d, s)
      );
      const dates = [...new Set(dailyBars.map((b) => b.date))].sort();

      for (const date of dates) {
        const mtf = analyzeMultiTimeframe(dailyBars, date);
        const d = mtf.daily;
        const bar = dailyBars.find((b) => b.date === date);

        let confidence = d.confidence;
        if (mtf.alignment === 'STRONG') confidence = Math.min(100, confidence + 15);
        else if (mtf.alignment === 'ALIGNED') confidence = Math.min(100, confidence + 8);
        else if (mtf.alignment === 'CONFLICT') confidence = Math.max(15, confidence - 20);
        else if (mtf.alignment === 'INSUFFICIENT') confidence = Math.max(10, Math.round(confidence * 0.6));

        const key = `${stock}|${date}`;
        this.phaseMap.set(key, {
          date,
          stock,
          close: bar?.close ?? 0,
          volRatio: 0,
          netBuyAgg: bar?.netBuy ?? 0,
          behavior: '',
          priceTrend: '',
          volTrend: '',
          netTrend: (bar?.netBuy ?? 0) > 0 ? 'BELI' : 'JUAL',
          phaseScore: d.phaseScore,
          phase: mtf.confirmedPhase,
          dailyPhase: d.phase,
          weeklyPhase: mtf.weekly.phase,
          monthlyPhase: mtf.monthly.phase,
          wyckoffStage: d.wyckoffStage,
          confidence,
          action: d.action,
          vsaSignal: d.vsaSignal,
          vsaSignals: d.vsaSignals.join(' | '),
          wyckoffEvent: d.wyckoffEvent,
          eventDetail: d.eventDetail,
          mtfAlignment: mtf.alignment,
          mtfScore: mtf.alignmentScore,
          mtfDetail: mtf.alignmentDetail,
          candleCount: d.candleCount,
          dataQuality: d.dataQuality,
        });
      }
    }
  }

  private getPrevClose(row: RawTradeData, historicalData: RawTradeData[]): number {
    const previousDaysForStock = historicalData.filter(
      (d) => d.stock === row.stock && d.date < row.date
    );
    if (previousDaysForStock.length === 0) return row.close;

    const datesByStock = new Set(previousDaysForStock.map((d) => d.date));
    const maxDateStr = Array.from(datesByStock).sort().at(-1)!;
    const lastDayRecord = previousDaysForStock.find((d) => d.date === maxDateStr);
    return lastDayRecord ? lastDayRecord.close : row.close;
  }

  /**
   * FIX #1: Now uses pre-calculated daily totals instead of partial historicalData slice.
   * This ensures stockTotalBuy, stockTotalSell, and brokerMktShare are consistent
   * across ALL broker rows on the same day.
   */
  private calculateBrokerFlow(row: RawTradeData, dailyTotals: DailyStockTotals): BrokerFlowResult {
    const netBuy = row.buyValue - row.sellValue;
    const totalVal = row.buyValue + row.sellValue;
    const buyRatio = totalVal === 0 ? 0 : row.buyValue / totalVal;
    const sellRatio = totalVal === 0 ? 0 : row.sellValue / totalVal;

    // FIX #1: Use pre-calculated daily totals (complete for all brokers on this day)
    const stockTotalBuy = dailyTotals.totalBuyValue;
    const stockTotalSell = dailyTotals.totalSellValue;
    const stockNet = stockTotalBuy - stockTotalSell;

    // FIX #3 (Deep): Proper market share includes both buy and sell sides
    const totalMarketVal = stockTotalBuy + stockTotalSell;
    const brokerMktShare = totalMarketVal === 0 ? 0 : (row.buyValue + row.sellValue) / totalMarketVal;
    
    let buyStrength = "LEMAH";
    if (buyRatio >= 0.7) buyStrength = "KUAT";
    else if (buyRatio >= 0.5) buyStrength = "MODERATE";

    let flowDirection = "NEUTRAL";
    if (netBuy > 0) flowDirection = "NET BUY";
    else if (netBuy < 0) flowDirection = "NET SELL";

    const intensity = stockTotalBuy === 0 ? 0 : Math.abs(netBuy) / stockTotalBuy;

    let signal = "NEUTRAL";
    if (netBuy > 0 && buyRatio > 0.6) signal = "AKUMULASI";
    else if (netBuy < 0 && sellRatio > 0.6) signal = "DISTRIBUSI";

    let domination = "BALANCED";
    if (buyRatio > 0.7) domination = "DOMINANT BUY";
    else if (sellRatio > 0.7) domination = "DOMINANT SELL";

    return {
      date: row.date, stock: row.stock, broker: row.broker,
      buyValue: row.buyValue, sellValue: row.sellValue,
      netBuy, buyRatio, sellRatio, stockTotalBuy, stockTotalSell,
      stockNet, brokerMktShare, buyStrength, flowDirection, intensity,
      signal, domination
    };
  }

  private calculatePriceAction(row: RawTradeData, historicalData: RawTradeData[]): PriceActionResult {
    const prevClose = this.getPrevClose(row, historicalData);
    const priceChangePercent = prevClose === 0 ? 0 : (row.close - prevClose) / prevClose;
    const candleBody = Math.abs(row.close - row.open);
    const upperShadow = row.high - Math.max(row.open, row.close);
    const lowerShadow = Math.min(row.open, row.close) - row.low;
    
    let candleType = "DOJI";
    if (row.close > row.open) candleType = "BULLISH";
    else if (row.close < row.open) candleType = "BEARISH";

    const spread = row.high - row.low;
    const candleStrength = spread === 0 ? 0 : candleBody / spread;

    let trend = "FLAT";
    if (row.close > prevClose) trend = "NAIK";
    else if (row.close < prevClose) trend = "TURUN";

    const gapPercent = prevClose === 0 ? 0 : (row.open - prevClose) / prevClose;

    let pricePhase = "TRANSISI";
    if (priceChangePercent > 0.01 && candleStrength > 0.6) pricePhase = "MARKUP";
    else if (priceChangePercent < -0.01 && candleStrength > 0.6) pricePhase = "MARKDOWN";
    else if (Math.abs(priceChangePercent) < 0.005) pricePhase = "SIDEWAYS";

    return {
      date: row.date, stock: row.stock,
      open: row.open, high: row.high, low: row.low, close: row.close,
      priceChangePercent, candleBody, upperShadow, lowerShadow,
      candleType, candleStrength, trend, prevClose, gapPercent, pricePhase
    };
  }

  /**
   * FIX #1 + FIX #2: Volume analyzer with two critical improvements:
   *  - stockTotalVol now uses pre-calculated daily totals (complete for all brokers)
   *  - avgVol now EXCLUDES today's data, using only prior history as baseline
   *    so that first-day spikes are properly detected instead of always showing 1.0x
   */
  private calculateVolumeAnalyzer(row: RawTradeData, dailyTotals: DailyStockTotals, allData: RawTradeData[]): VolumeAnalyzerResult {
    // FIX #1: Use pre-calculated daily total volume
    const stockTotalVol = dailyTotals.totalVolume;
    const brokerVolPercent = stockTotalVol === 0 ? 0 : row.volume / stockTotalVol;

    // FIX #2: Avg Vol for this Broker in this Stock — EXCLUDE today's date
    // Only use historical data from BEFORE today as the baseline
    const brokerStockHistorical = allData.filter(
      d => d.broker === row.broker && d.stock === row.stock && d.date < row.date
    );
    
    let avgVol: number;
    let volRatio: number;
    
    if (brokerStockHistorical.length === 0) {
      // No prior history: this is the first day for this broker+stock combo
      // We can't compare against history, so use a neutral baseline
      avgVol = row.volume; // Set avg = current volume as placeholder
      volRatio = 1.0;      // Neutral ratio (no spike detection possible)
    } else {
      const sumVol = brokerStockHistorical.reduce((sum, d) => sum + d.volume, 0);
      avgVol = sumVol / brokerStockHistorical.length;
      volRatio = avgVol === 0 ? 1.0 : row.volume / avgVol;
    }

    let isAbnormal = "NORMAL";
    if (volRatio > 2.5) isAbnormal = "ABNORMAL";
    else if (volRatio > 1.5) isAbnormal = "TINGGI";

    const volTrend = volRatio > 1 ? "NAIK" : "TURUN";
    const bsValRatio = row.sellValue === 0 ? 0 : row.buyValue / row.sellValue;
    const volumeScore = Math.min(100, volRatio * 40);

    let volSignal = "LOW";
    if (volumeScore > 70) volSignal = "VERY HIGH";
    else if (volumeScore > 50) volSignal = "HIGH";
    else if (volumeScore > 30) volSignal = "MEDIUM";

    let volCategory = "NORMAL";
    if (isAbnormal === "ABNORMAL") volCategory = "SPIKE";
    else if (isAbnormal === "TINGGI") volCategory = "ELEVATED";

    return {
      date: row.date, stock: row.stock, broker: row.broker,
      volume: row.volume, stockTotalVol, brokerVolPercent,
      avgVol, volRatio, isAbnormal, volTrend, bsValRatio,
      volumeScore, volSignal, volCategory
    };
  }

  private calculateBrokerBehavior(row: RawTradeData, flow: BrokerFlowResult, price: PriceActionResult, vol: VolumeAnalyzerResult, allData: RawTradeData[]): BrokerBehaviorResult {
    // FIX BOW: Konfirmasi minimal 2 dari 3 hari terakhir harus menunjukkan net buy saat harga turun
    // Ini eliminasi "fake BOW" dari 1 candle — bandar serius akumulasi secara konsisten
    const brokerHistory = allData
      .filter(d => d.broker === row.broker && d.stock === row.stock && d.date < row.date)
      .sort((a, b) => a.date.localeCompare(b.date));

    // Ambil 2 hari terakhir sebelum hari ini
    const recentDays = brokerHistory.slice(-2);

    // Hitung berapa hari dari history yang menunjukkan BOW (net buy saat harga turun)
    // Kita butuh close harga hari sebelumnya untuk hitung perubahan harga tiap hari
    let confirmedBowDays = 0;
    for (let i = 0; i < recentDays.length; i++) {
      const d = recentDays[i];
      const netBuyD = d.buyValue - d.sellValue;
      // Cari close hari sebelum d
      const prevDays = brokerHistory.filter(x => x.stock === d.stock && x.date < d.date);
      const prevClose = prevDays.length > 0 ? prevDays[prevDays.length - 1].close : d.close;
      const priceChgD = prevClose === 0 ? 0 : (d.close - prevClose) / prevClose;
      if (netBuyD > 0 && priceChgD < -0.005) confirmedBowDays++;
    }
    // Hari ini sendiri juga harus menunjukkan BOW
    const todayBow = flow.netBuy > 0 && price.priceChangePercent < -0.005;
    // BOW confirmed jika: hari ini BOW + minimal 1 dari 2 hari sebelumnya juga BOW
    // (jika data kurang dari 2 hari, cukup 1 konfirmasi atau hari ini saja dengan volume spike)
    const bow = todayBow && (
      recentDays.length === 0
        ? vol.volRatio > 2.0  // Hari pertama: butuh volume spike kuat sebagai pengganti konfirmasi
        : confirmedBowDays >= 1  // Ada data history: minimal 1 hari konfirmasi
    );

    const sos = flow.netBuy < 0 && price.priceChangePercent > 0.005;
    const abs = flow.netBuy > 0 && Math.abs(price.priceChangePercent) < 0.005 && vol.volRatio > 1.5;
    const dist = flow.netBuy < 0 && vol.volRatio > 1.5 && price.candleStrength < 0.4;
    const markup = flow.netBuy > 0 && price.priceChangePercent > 0.01 && vol.volRatio > 1.2;
    const markdown = flow.netBuy < 0 && price.priceChangePercent < -0.01 && vol.volRatio > 1;

    const behaviorScore = (bow ? 15 : 0) + (sos ? -10 : 0) + (abs ? 20 : 0) + 
                          (dist ? -20 : 0) + (markup ? 25 : 0) + (markdown ? -15 : 0);

    let behaviorLabel = "NEUTRAL";
    if (behaviorScore >= 30) behaviorLabel = "BULLISH BANDAR";
    else if (behaviorScore >= 15) behaviorLabel = "POSITIF";
    else if (behaviorScore >= -10) behaviorLabel = "NEUTRAL";
    else if (behaviorScore >= -30) behaviorLabel = "NEGATIF";
    else behaviorLabel = "BEARISH BANDAR";

    let action = "MONITOR";
    if (bow) action = "BUY";
    else if (abs) action = "ACCUMULATE";
    else if (markup) action = "HOLD/BUY";
    else if (sos) action = "WATCH SELL";
    else if (dist) action = "REDUCE";
    else if (markdown) action = "AVOID";

    return {
      date: row.date, stock: row.stock, broker: row.broker,
      netBuy: flow.netBuy, priceChangePercent: price.priceChangePercent,
      candleStrength: price.candleStrength, volRatio: vol.volRatio,
      buyWeakness: bow ? "BOW" : "—",
      sellStrength: sos ? "SOS" : "—",
      absorption: abs ? "ABSORPTION" : "—",
      distribution: dist ? "DISTRIBUTION" : "—",
      markup: markup ? "MARKUP" : "—",
      markdown: markdown ? "MARKDOWN" : "—",
      behaviorScore, behaviorLabel, action
    };
  }

  private calculatePhaseDetector(
    row: RawTradeData,
    price: PriceActionResult,
    vol: VolumeAnalyzerResult,
    behavior: BrokerBehaviorResult,
    netBuyAgg: number
  ): PhaseDetectorResult {
    const key = `${row.stock}|${row.date}`;
    const cached = this.phaseMap.get(key);
    const netTrend = netBuyAgg > 0 ? 'BELI' : 'JUAL';

    if (cached) {
      return {
        ...cached,
        close: row.close,
        volRatio: vol.volRatio,
        netBuyAgg,
        behavior: behavior.behaviorLabel,
        priceTrend: price.trend,
        volTrend: vol.volTrend,
        netTrend,
      };
    }

    // Fallback jika cache miss
    return {
      date: row.date,
      stock: row.stock,
      close: row.close,
      volRatio: vol.volRatio,
      netBuyAgg,
      behavior: behavior.behaviorLabel,
      priceTrend: price.trend,
      volTrend: vol.volTrend,
      netTrend,
      phaseScore: 0,
      phase: 'SIDEWAYS',
      dailyPhase: 'SIDEWAYS',
      weeklyPhase: 'SIDEWAYS',
      monthlyPhase: 'SIDEWAYS',
      wyckoffStage: 'Phase B - Sideways',
      confidence: 20,
      action: 'WATCH',
      vsaSignal: '—',
      vsaSignals: '',
      wyckoffEvent: 'NONE',
      eventDetail: '',
      mtfAlignment: 'INSUFFICIENT',
      mtfScore: 0,
      mtfDetail: `Minimal ${MIN_CANDLES_GOOD} candle harian diperlukan`,
      candleCount: 0,
      dataQuality: 'INSUFFICIENT',
    };
  }

  private calculateScoring(row: RawTradeData, flow: BrokerFlowResult, price: PriceActionResult, vol: VolumeAnalyzerResult, behavior: BrokerBehaviorResult, phase: PhaseDetectorResult): ScoringEngineResult {
    // Scoring engine Bug-007 fix logic:
    const netBuyScore = Math.max(0, Math.min(25, (flow.buyRatio - 0.5) * 50));

    // FIX 2: Liquidity gate — saham lapis 3 (low-cap) tidak boleh dapat volume score tinggi
    // Minimum daily market value 500 juta rupiah untuk score penuh
    // Di bawah itu score di-discount proporsional agar tidak muncul sebagai sinyal palsu
    const MIN_LIQUID_VAL = 500_000_000;   // 500 juta = threshold liquid
    const MIN_VIABLE_VAL = 50_000_000;    // 50 juta = batas bawah absolut
    const dailyMarketVal = flow.stockTotalBuy + flow.stockTotalSell;
    const liquidityFactor =
      dailyMarketVal >= MIN_LIQUID_VAL ? 1.0 :
      dailyMarketVal >= MIN_VIABLE_VAL
        ? 0.3 + 0.7 * ((dailyMarketVal - MIN_VIABLE_VAL) / (MIN_LIQUID_VAL - MIN_VIABLE_VAL))
        : 0.1; // hampir nol — saham sangat illiquid
    const rawVolumeScore = Math.min(20, vol.volRatio * 10);
    const volumeScore = rawVolumeScore * liquidityFactor;

    const candleScore = Math.min(15, price.candleStrength * 15);
    const behaviorScore = Math.max(-15, Math.min(25, behavior.behaviorScore / 2));
    
    const absorptionBonus = behavior.absorption === "ABSORPTION" ? 15 : 0;
    
    let distPenalty = 0;
    if (behavior.distribution === "DISTRIBUTION") distPenalty = -20;
    else if (behavior.markdown === "MARKDOWN") distPenalty = -10;

    let phaseBonus = 0;
    if (phase.phase === "MARKUP") phaseBonus = 10;
    else if (phase.phase === "ACCUMULATION") phaseBonus = 8;
    else if (phase.phase === "SIDEWAYS") phaseBonus = 2;
    else if (phase.phase === "DISTRIBUTION") phaseBonus = -5;
    else phaseBonus = -8;

    const totalScore = netBuyScore + volumeScore + candleScore + behaviorScore + absorptionBonus + distPenalty + phaseBonus;

    let grade = "D";
    if (totalScore >= 80) grade = "A+";
    else if (totalScore >= 65) grade = "A";
    else if (totalScore >= 50) grade = "B+";
    else if (totalScore >= 35) grade = "B";
    else if (totalScore >= 20) grade = "C";

    let status = "MARKDOWN";
    if (totalScore >= 70) status = "STRONG ACCUMULATION";
    else if (totalScore >= 50) status = "ACCUMULATION";
    else if (totalScore >= 30) status = "NEUTRAL";
    else if (totalScore >= 10) status = "DISTRIBUTION";

    let signal = "SELL";
    if (grade === "A+") signal = "BUY NOW";
    else if (grade === "A") signal = "BUY";
    else if (grade === "B+") signal = "WATCH";
    else if (grade === "B") signal = "MONITOR";
    else if (grade === "C") signal = "AVOID";

    return {
      date: row.date, stock: row.stock,
      netBuyScore, volumeScore, candleScore, behaviorScore,
      absorptionBonus, distPenalty, phaseBonus,
      totalScore, grade, status, signal, scoreRank: 0, action: behavior.action
    };
  }

  private applyRanks(results: ProcessedData[]) {
    const aggregates = buildStockAggregates(results);
    const ranked = Array.from(aggregates.entries())
      .map(([stock, agg]) => ({
        stock,
        // FIX A: Unified scoring
        score: computeStockLevelScore(agg).confidenceAdjustedScore,
      }))
      .sort((a, b) => b.score - a.score);

    const rankByStock = new Map<string, number>();
    ranked.forEach((item, index) => rankByStock.set(item.stock, index + 1));

    for (const r of results) {
      r.score.scoreRank = rankByStock.get(r.raw.stock) ?? 0;
    }
  }

  public getStockSummaries(results: ProcessedData[]): StockSummary[] {
    const aggregates = buildStockAggregates(results);
    const summaries: StockSummary[] = [];

    aggregates.forEach((agg) => {
      // FIX A: Unified scoring — pakai confidenceAdjustedScore
      const { confidenceAdjustedScore, grade, signal } = computeStockLevelScore(agg);
      const snap = agg.latestSnapshot;
      summaries.push({
        stock: agg.stock,
        latestDate: snap.priceRow.raw.date,
        latestScore: confidenceAdjustedScore,
        latestPhase: snap.phase.phase,
        latestSignal: signal,
        totalNetBuy: agg.topBrokerNetAccum,
        avgVolRatio: agg.avgVolRatio,
        absorptionCount: agg.absorptionDays,
        grade,
      });
    });

    return summaries;
  }

  public getBrokerSummaries(results: ProcessedData[]): BrokerSummary[] {
    const brokerMap = new Map<
      string,
      { totalNetBuy: number; buyDays: Set<string>; totalDays: Set<string> }
    >();

    for (const r of results) {
      if (!brokerMap.has(r.raw.broker)) {
        brokerMap.set(r.raw.broker, {
          totalNetBuy: 0,
          buyDays: new Set(),
          totalDays: new Set(),
        });
      }
      const b = brokerMap.get(r.raw.broker)!;
      b.totalNetBuy += r.flow.netBuy;
      b.totalDays.add(`${r.raw.date}|${r.raw.stock}`);
      if (r.flow.netBuy > 0) b.buyDays.add(`${r.raw.date}|${r.raw.stock}`);
    }

    const summaries: BrokerSummary[] = [];
    brokerMap.forEach((b, broker) => {
      const dayCount = b.totalDays.size;
      const consistencyScore =
        dayCount > 0 ? (b.buyDays.size / dayCount) * 100 : 0;

      let dominance = 'NEUTRAL';
      if (b.totalNetBuy > 0) dominance = 'NET BUYER';
      else if (b.totalNetBuy < 0) dominance = 'NET SELLER';

      let signal = 'MONITOR';
      if (consistencyScore >= 70 && b.totalNetBuy > 0) signal = 'BUY';
      else if (consistencyScore >= 50 && b.totalNetBuy > 0) signal = 'WATCH';
      else if (b.totalNetBuy < 0 && consistencyScore < 40) signal = 'SELL';
      else if (b.totalNetBuy < 0) signal = 'AVOID';

      summaries.push({
        broker,
        totalNetBuy: b.totalNetBuy,
        dominance,
        consistencyScore,
        signal,
      });
    });

    return summaries.sort((a, b) => b.totalNetBuy - a.totalNetBuy);
  }
}