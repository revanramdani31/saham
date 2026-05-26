import localforage from 'localforage';
import type { MarketContext } from '../engine/marketContext';
import { normalizeMarketContext } from '../engine/marketContext';

const MARKET_CONTEXT_KEY = 'market_context_manual';

export async function loadStoredMarketContext(): Promise<MarketContext | null> {
    try {
        const data = await localforage.getItem<MarketContext>(MARKET_CONTEXT_KEY);
        return data ?? null;
    } catch {
        return null;
    }
}

export async function saveStoredMarketContext(context: MarketContext): Promise<MarketContext> {
    const normalized = normalizeMarketContext(context) ?? context;
    await localforage.setItem(MARKET_CONTEXT_KEY, normalized);
    return normalized;
}

export async function clearStoredMarketContext(): Promise<void> {
    await localforage.removeItem(MARKET_CONTEXT_KEY);
}
