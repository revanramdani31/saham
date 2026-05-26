import type { ProcessedData } from './types';
import {
    buildDefaultMarketContext,
    getSectorForStock,
    mergeSectorMaps,
    type ForeignFlowPoint,
    type IhsgSeriesPoint,
    type MarketContext,
} from './marketContext';

export type IhsgPhase = 'BULL' | 'BEAR' | 'SIDEWAYS';
export type IhsgTrend = 'UPTREND' | 'DOWNTREND' | 'FLAT';
export type ForeignFlow = 'NET BUY' | 'NET SELL' | 'NEUTRAL';

export interface MarketRegime {
    ihsgPhase: IhsgPhase;
    ihsgTrend: IhsgTrend;
    sectorRotation: string;
    foreignFlow: ForeignFlow;
    fearGreedIndex: number;
    commentary: string;
    source: 'real' | 'hybrid' | 'proxy';
}

function average(values: number[]): number {
    return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function signText(value: number): string {
    return value >= 0 ? '+' : '';
}

function formatMoneyMB(value: number): string {
    const abs = Math.abs(value);
    if (abs >= 1e12) return `Rp ${(abs / 1e12).toFixed(2)}T`;
    if (abs >= 1e9) return `Rp ${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `Rp ${(abs / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `Rp ${(abs / 1e3).toFixed(2)}K`;
    return `Rp ${abs.toFixed(0)}`;
}

function sortByDate<T extends { date: string }>(points: T[]): T[] {
    return [...points].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function countBy<T>(values: T[], predicate: (value: T) => boolean): number {
    return values.reduce((count, value) => count + (predicate(value) ? 1 : 0), 0);
}

function detectTrendFromBreadth(bullishRatio: number, avgScore: number): IhsgTrend {
    if (bullishRatio >= 0.6 || avgScore >= 60) return 'UPTREND';
    if (bullishRatio <= 0.4 || avgScore <= 40) return 'DOWNTREND';
    return 'FLAT';
}

function deriveTrendFromMomentum(momentum: number, latestChange: number): IhsgTrend {
    if (momentum >= 0.03 || latestChange >= 0.5) return 'UPTREND';
    if (momentum <= -0.03 || latestChange <= -0.5) return 'DOWNTREND';
    return 'FLAT';
}

function derivePhaseFromMomentum(momentum: number, latestClose: number, sma20: number): IhsgPhase {
    if (momentum >= 0.05 && latestClose >= sma20) return 'BULL';
    if (momentum <= -0.05 && latestClose <= sma20) return 'BEAR';
    return 'SIDEWAYS';
}

function describePhase(phase: IhsgPhase): string {
    if (phase === 'BULL') return 'menguat';
    if (phase === 'BEAR') return 'melemah';
    return 'netral';
}

function deriveIhsgContext(series: IhsgSeriesPoint[]): { phase: IhsgPhase; trend: IhsgTrend; commentary: string } {
    const sorted = sortByDate(series);
    const latest = sorted.at(-1);
    if (!latest) {
        return {
            phase: 'SIDEWAYS',
            trend: 'FLAT',
            commentary: 'IHSG belum memiliki data yang cukup.',
        };
    }

    const lookback = sorted.slice(Math.max(0, sorted.length - 20));
    const prev = sorted.at(-2);
    const start = lookback[0] ?? latest;
    const sma20 = average(lookback.map((point) => point.close));
    const momentum = start && start.close > 0 ? (latest.close - start.close) / start.close : 0;
    const latestChange = latest.changePercent ?? (prev && prev.close > 0 ? ((latest.close - prev.close) / prev.close) * 100 : 0);
    const trend = deriveTrendFromMomentum(momentum, latestChange);
    const phase = derivePhaseFromMomentum(momentum, latest.close, sma20);
    const momentumPct = `${signText(momentum)}${(momentum * 100).toFixed(1)}%`;

    return {
        phase,
        trend,
        commentary: `IHSG ${describePhase(phase)} (${momentumPct} vs basis 20 hari).`,
    };
}

function deriveForeignFlow(series: ForeignFlowPoint[]): ForeignFlow {
    const sorted = sortByDate(series);
    const recent = sorted.slice(Math.max(0, sorted.length - 5));
    const latestNetBuy = sorted.at(-1)?.netBuy ?? 0;
    const recentAverage = average(recent.map((point) => point.netBuy));
    const signal = latestNetBuy === 0 ? recentAverage : latestNetBuy;

    if (signal > 0) return 'NET BUY';
    if (signal < 0) return 'NET SELL';
    return 'NEUTRAL';
}

function deriveSectorRotation(data: ProcessedData[], sectorMap: Record<string, string>): string {
    if (data.length === 0) return 'N/A';

    const latestByStock = new Map<string, ProcessedData>();
    for (const row of data) {
        const current = latestByStock.get(row.raw.stock);
        if (!current || row.raw.date > current.raw.date) {
            latestByStock.set(row.raw.stock, row);
        }
    }

    const sectorStats = new Map<string, { netBuy: number; score: number; stocks: Set<string> }>();

    for (const row of latestByStock.values()) {
        const sector = getSectorForStock(row.raw.stock, sectorMap);
        if (!sectorStats.has(sector)) {
            sectorStats.set(sector, { netBuy: 0, score: 0, stocks: new Set() });
        }

        const stats = sectorStats.get(sector);
        if (!stats) continue;
        stats.netBuy += row.flow.netBuy;
        stats.score += row.score.totalScore;
        stats.stocks.add(row.raw.stock);
    }

    const ranked = [...sectorStats.entries()]
        .filter(([sector]) => sector !== 'UNMAPPED')
        .map(([sector, stats]) => ({
            sector,
            netBuy: stats.netBuy,
            score: stats.score,
            stocks: stats.stocks.size,
        }))
        .sort((a, b) => b.netBuy - a.netBuy || b.score - a.score || b.stocks - a.stocks)
        .slice(0, 3);

    if (ranked.length === 0) return 'UNMAPPED';

    return ranked
        .map((entry) => `${entry.sector} (${entry.netBuy >= 0 ? '+' : '-'}${formatMoneyMB(entry.netBuy)})`)
        .join(', ');
}

/**
 * Market regime detector.
 * Saat data IHSG/foreign flow asli tersedia, detector akan memakainya langsung.
 * Kalau belum, detector tetap fallback ke breadth data saham yang diupload.
 */
export function detectMarketRegime(data: ProcessedData[], context: MarketContext = {}): MarketRegime {
    const defaultContext = buildDefaultMarketContext();
    const sectorMap = mergeSectorMaps(defaultContext.sectorMap ?? {}, context.sectorMap);
    const latestByStock = new Map<string, ProcessedData>();

    for (const row of data) {
        const current = latestByStock.get(row.raw.stock);
        if (!current || row.raw.date > current.raw.date) {
            latestByStock.set(row.raw.stock, row);
        }
    }

    const latestRows = Array.from(latestByStock.values());
    const hasRealMarketContext = Boolean(context.ihsgSeries?.length || context.foreignFlowSeries?.length);

    if (latestRows.length === 0) {
        return buildEmptyMarketRegime(context, hasRealMarketContext);
    }

    return buildMarketRegimeFromRows(latestRows, sectorMap, context, hasRealMarketContext);
}

function buildEmptyMarketRegime(context: MarketContext, hasRealMarketContext: boolean): MarketRegime {
    if (!hasRealMarketContext) {
        return {
            ihsgPhase: 'SIDEWAYS',
            ihsgTrend: 'FLAT',
            sectorRotation: 'N/A',
            foreignFlow: 'NEUTRAL',
            fearGreedIndex: 50,
            commentary: 'Belum ada data saham untuk menghitung market regime.',
            source: 'proxy',
        };
    }

    const ihsg = context.ihsgSeries?.length ? deriveIhsgContext(context.ihsgSeries) : undefined;
    const foreignFlow = context.foreignFlowSeries?.length ? deriveForeignFlow(context.foreignFlowSeries) : 'NEUTRAL';

    let ihsgPhaseScore = 0;
    if (ihsg?.phase === 'BULL') {
        ihsgPhaseScore = 18;
    } else if (ihsg?.phase === 'BEAR') {
        ihsgPhaseScore = -18;
    }

    let ihsgTrendScore = 0;
    if (ihsg?.trend === 'UPTREND') {
        ihsgTrendScore = 10;
    } else if (ihsg?.trend === 'DOWNTREND') {
        ihsgTrendScore = -10;
    }

    let foreignFlowScore = 0;
    if (foreignFlow === 'NET BUY') {
        foreignFlowScore = 8;
    } else if (foreignFlow === 'NET SELL') {
        foreignFlowScore = -8;
    }
    const fearGreedBase = 50 + ihsgPhaseScore + ihsgTrendScore + foreignFlowScore;

    return {
        ihsgPhase: ihsg?.phase ?? 'SIDEWAYS',
        ihsgTrend: ihsg?.trend ?? 'FLAT',
        sectorRotation: 'N/A',
        foreignFlow,
        fearGreedIndex: clamp(Math.round(fearGreedBase), 0, 100),
        commentary: ihsg?.commentary ?? 'Market context tersedia, tetapi data saham belum dimuat.',
        source: 'real',
    };
}

function buildMarketRegimeFromRows(
    latestRows: ProcessedData[],
    sectorMap: Record<string, string>,
    context: MarketContext,
    hasRealMarketContext: boolean
): MarketRegime {
    const ihsgFromContext = context.ihsgSeries?.length ? deriveIhsgContext(context.ihsgSeries) : null;
    const foreignFlowFromContext = context.foreignFlowSeries?.length ? deriveForeignFlow(context.foreignFlowSeries) : null;

    const bullishStocks = latestRows.filter((row) => row.phase.phase === 'ACCUMULATION' || row.phase.phase === 'MARKUP' || row.score.totalScore >= 50);
    const bearishStocks = latestRows.filter((row) => row.phase.phase === 'DISTRIBUTION' || row.phase.phase === 'MARKDOWN' || row.score.totalScore < 35);
    const bullishRatio = bullishStocks.length / latestRows.length;
    const bearishRatio = bearishStocks.length / latestRows.length;
    const avgScore = average(latestRows.map((row) => row.score.totalScore));
    const avgVolRatio = average(latestRows.map((row) => row.volume.volRatio));
    const fallbackForeignFlow = deriveFallbackForeignFlow(latestRows);
    const breadthTrend = detectTrendFromBreadth(bullishRatio, avgScore);
    const breadthPhase = deriveBreadthPhase(bullishRatio, bearishRatio, avgScore);
    const ihsgTrend = ihsgFromContext?.trend ?? breadthTrend;
    const ihsgPhase = ihsgFromContext?.phase ?? breadthPhase;
    const foreignFlow = foreignFlowFromContext ?? fallbackForeignFlow;
    const fearGreedIndex = deriveFearGreedIndex(bullishRatio, bearishRatio, avgScore, avgVolRatio, foreignFlow);
    const sectorRotation = deriveSectorRotation(latestRows, sectorMap);

    return {
        ihsgPhase,
        ihsgTrend,
        sectorRotation,
        foreignFlow,
        fearGreedIndex,
        commentary: buildMarketCommentary(ihsgPhase, sectorRotation),
        source: deriveMarketSource(hasRealMarketContext, sectorRotation),
    };
}

function deriveFallbackForeignFlow(latestRows: ProcessedData[]): ForeignFlow {
    const netBuyCount = countBy(latestRows, (row) => row.flow.netBuy > 0);
    const netSellCount = countBy(latestRows, (row) => row.flow.netBuy < 0);

    if (netBuyCount > netSellCount) return 'NET BUY';
    if (netSellCount > netBuyCount) return 'NET SELL';
    return 'NEUTRAL';
}

function deriveBreadthPhase(bullishRatio: number, bearishRatio: number, avgScore: number): IhsgPhase {
    if (bullishRatio >= 0.6 && avgScore >= 55) return 'BULL';
    if (bearishRatio >= 0.55 || avgScore < 40) return 'BEAR';
    return 'SIDEWAYS';
}

function deriveFearGreedIndex(
    bullishRatio: number,
    bearishRatio: number,
    avgScore: number,
    avgVolRatio: number,
    foreignFlow: ForeignFlow
): number {
    let flowBonus = 0;
    if (foreignFlow === 'NET BUY') {
        flowBonus = 8;
    } else if (foreignFlow === 'NET SELL') {
        flowBonus = -8;
    }

    return clamp(
        Math.round(50 + (bullishRatio - bearishRatio) * 35 + ((avgScore - 50) / 50) * 15 + ((avgVolRatio - 1) * 10) + flowBonus),
        0,
        100
    );
}

function deriveMarketSource(hasRealMarketContext: boolean, sectorRotation: string): MarketRegime['source'] {
    if (hasRealMarketContext) return 'real';
    if (sectorRotation === 'UNMAPPED') return 'proxy';
    return 'hybrid';
}

function buildMarketCommentary(phase: IhsgPhase, sectorRotation: string): string {
    if (phase === 'BULL') return `Market breadth mendukung sinyal beli. Rotasi sektor: ${sectorRotation}.`;
    if (phase === 'BEAR') return `Market breadth lemah, sinyal beli perlu filter tambahan. Rotasi sektor defensif: ${sectorRotation}.`;
    return `Market cenderung netral; pilih saham yang paling kuat. Rotasi sektor: ${sectorRotation}.`;
}