// Pre-calculated daily totals per stock (fixes same-day aggregation bias)
export interface DailyStockTotals {
  totalBuyValue: number;
  totalSellValue: number;
  totalVolume: number;
  totalNetBuy: number;
  // Top broker concentration for smart money tracking
  top3BuyerNetBuy: number;
  top3SellerNetBuy: number;
  top5BuyerNetBuy: number;
  top5SellerNetBuy: number;
  topBuyerConcentration: number;   // % of total buy value by top 3 buyers
  topSellerConcentration: number;  // % of total sell value by top 3 sellers
}

export interface RawTradeData {
  date: string;
  stock: string;
  broker: string;
  buyValue: number;
  sellValue: number;
  buyAvg: number;
  sellAvg: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BrokerFlowResult {
  date: string;
  stock: string;
  broker: string;
  buyValue: number;
  sellValue: number;
  netBuy: number;
  buyRatio: number;
  sellRatio: number;
  stockTotalBuy: number;
  stockTotalSell: number;
  stockNet: number;
  brokerMktShare: number;
  buyStrength: string;
  flowDirection: string;
  intensity: number;
  signal: string;
  domination: string;
}

export interface PriceActionResult {
  date: string;
  stock: string;
  open: number;
  high: number;
  low: number;
  close: number;
  priceChangePercent: number;
  candleBody: number;
  upperShadow: number;
  lowerShadow: number;
  candleType: string;
  candleStrength: number;
  trend: string;
  prevClose: number;
  gapPercent: number;
  pricePhase: string;
}

export interface VolumeAnalyzerResult {
  date: string;
  stock: string;
  broker: string;
  volume: number;
  stockTotalVol: number;
  brokerVolPercent: number;
  avgVol: number;
  volRatio: number;
  isAbnormal: string;
  volTrend: string;
  bsValRatio: number;
  volumeScore: number;
  volSignal: string;
  volCategory: string;
}

export interface BrokerBehaviorResult {
  date: string;
  stock: string;
  broker: string;
  netBuy: number;
  priceChangePercent: number;
  candleStrength: number;
  volRatio: number;
  buyWeakness: string;
  sellStrength: string;
  absorption: string;
  distribution: string;
  markup: string;
  markdown: string;
  behaviorScore: number;
  behaviorLabel: string;
  action: string;
}

export interface PhaseDetectorResult {
  date: string;
  stock: string;
  close: number;
  volRatio: number;
  netBuyAgg: number;
  behavior: string;
  priceTrend: string;
  volTrend: string;
  netTrend: string;
  phaseScore: number;
  phase: string;
  wyckoffStage: string;
  confidence: number;
  action: string;
}

export interface ScoringEngineResult {
  date: string;
  stock: string;
  netBuyScore: number;
  volumeScore: number;
  candleScore: number;
  behaviorScore: number;
  absorptionBonus: number;
  distPenalty: number;
  phaseBonus: number;
  totalScore: number;
  grade: string;
  status: string;
  signal: string;
  scoreRank: number;
  action: string;
}

export interface ProcessedData {
  raw: RawTradeData;
  flow: BrokerFlowResult;
  price: PriceActionResult;
  volume: VolumeAnalyzerResult;
  behavior: BrokerBehaviorResult;
  phase: PhaseDetectorResult;
  score: ScoringEngineResult;
  dailyTotals: DailyStockTotals;
}

export interface StockSummary {
  stock: string;
  latestDate: string;
  latestScore: number;
  latestPhase: string;
  latestSignal: string;
  totalNetBuy: number;
  avgVolRatio: number;
  absorptionCount: number;
  grade: string;
}

export interface BrokerSummary {
  broker: string;
  totalNetBuy: number;
  dominance: string;
  consistencyScore: number;
  signal: string;
}
