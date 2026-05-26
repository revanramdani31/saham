import type { MarketContext } from '../engine/marketContext';
import { normalizeMarketContext } from '../engine/marketContext';

export async function loadMarketContext(): Promise<MarketContext | null> {
    try {
        const response = await fetch('/fetched/market-context.json', { cache: 'no-store' });
        if (!response.ok) return null;

        const payload = await response.json();
        return normalizeMarketContext(payload);
    } catch {
        return null;
    }
}