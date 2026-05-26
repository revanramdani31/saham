import type { ProcessedData } from './types';

export interface IhsgSeriesPoint {
    date: string;
    close: number;
    changePercent?: number;
}

export interface ForeignFlowPoint {
    date: string;
    netBuy: number;
}

export interface MarketContext {
    ihsgSeries?: IhsgSeriesPoint[];
    foreignFlowSeries?: ForeignFlowPoint[];
    sectorMap?: Record<string, string>;
}

export const DEFAULT_SECTOR_MAP: Record<string, string> = {
    BMTR: 'Basic Materials',
    BNBR: 'Industrials',
    BOBA: 'Consumer Cyclicals',
    BUMI: 'Basic Materials',
    ERAA: 'Consumer Cyclicals',
    GPSO: 'Industrials',
    GULA: 'Consumer Non-Cyclicals',
    KJEN: 'Industrials',
    KOTA: 'Property & Real Estate',
    MBMA: 'Basic Materials',
    MDKA: 'Basic Materials',
    MPOW: 'Utilities',
    PADI: 'Financials',
    PNLF: 'Financials',
    SMIL: 'Industrials',
    TOOL: 'Industrials',
    VKTR: 'Industrials',
};

function normalizeKey(value: string): string {
    return value.trim().toUpperCase();
}

function normalizeDate(value: string): number {
    return new Date(value).getTime();
}

export function mergeSectorMaps(base: Record<string, string>, override?: Record<string, string>): Record<string, string> {
    const merged: Record<string, string> = {};

    for (const [stock, sector] of Object.entries(base)) {
        merged[normalizeKey(stock)] = sector.trim();
    }

    for (const [stock, sector] of Object.entries(override ?? {})) {
        if (!sector) continue;
        merged[normalizeKey(stock)] = sector.trim();
    }

    return merged;
}

export function getSectorForStock(stock: string, sectorMap: Record<string, string>): string {
    return sectorMap[normalizeKey(stock)] ?? 'UNMAPPED';
}

export function buildDefaultMarketContext(_data?: ProcessedData[]): MarketContext {
    return {
        sectorMap: mergeSectorMaps(DEFAULT_SECTOR_MAP),
    };
}

function normalizeIhsgSeries(value: unknown): IhsgSeriesPoint[] | undefined {
    if (!Array.isArray(value)) return undefined;

    const series = value.reduce<IhsgSeriesPoint[]>((acc, item) => {
        if (!item || typeof item !== 'object') return acc;

        const record = item as Record<string, unknown>;
        const date = typeof record.date === 'string' ? record.date : '';
        const close = Number(record.close ?? record.value ?? 0);
        const changePercent = record.changePercent === undefined ? undefined : Number(record.changePercent);
        if (!date || !Number.isFinite(close)) return acc;

        if (changePercent !== undefined && Number.isFinite(changePercent)) {
            acc.push({ date, close, changePercent });
            return acc;
        }

        acc.push({ date, close });
        return acc;
    }, []).sort((a, b) => normalizeDate(a.date) - normalizeDate(b.date));

    return series.length > 0 ? series : undefined;
}

function normalizeForeignFlowSeries(value: unknown): ForeignFlowPoint[] | undefined {
    if (!Array.isArray(value)) return undefined;

    const series = value.reduce<ForeignFlowPoint[]>((acc, item) => {
        if (!item || typeof item !== 'object') return acc;

        const record = item as Record<string, unknown>;
        const date = typeof record.date === 'string' ? record.date : '';
        const netBuy = Number(record.netBuy ?? record.value ?? record.flow ?? 0);
        if (!date || !Number.isFinite(netBuy)) return acc;

        acc.push({ date, netBuy });
        return acc;
    }, []).sort((a, b) => normalizeDate(a.date) - normalizeDate(b.date));

    return series.length > 0 ? series : undefined;
}

function normalizeSectorMap(value: unknown): Record<string, string> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

    const map: Record<string, string> = {};
    for (const [stock, sector] of Object.entries(value as Record<string, unknown>)) {
        if (typeof sector !== 'string' || !sector.trim()) continue;
        map[normalizeKey(stock)] = sector.trim();
    }

    return Object.keys(map).length > 0 ? map : undefined;
}

export function normalizeMarketContext(value: unknown): MarketContext | null {
    if (!value || typeof value !== 'object') return null;

    const record = value as Record<string, unknown>;
    const ihsgSeries = normalizeIhsgSeries(record.ihsgSeries ?? record.ihsg ?? record.indexSeries);
    const foreignFlowSeries = normalizeForeignFlowSeries(
        record.foreignFlowSeries ?? record.foreignFlow ?? record.foreignFlowHistory
    );
    const sectorMap = normalizeSectorMap(record.sectorMap ?? record.sectors);

    if (!ihsgSeries && !foreignFlowSeries && !sectorMap) return null;

    return {
        ihsgSeries,
        foreignFlowSeries,
        sectorMap,
    };
}