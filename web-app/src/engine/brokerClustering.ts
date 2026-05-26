import type { ProcessedData } from './types';

export interface BrokerCluster {
    clusterName: string;
    brokers: string[];        // ['YP', 'AK', 'DH']
    correlationScore: number; // seberapa sering bergerak bersamaan (0-1)
    combinedNetBuy: number;   // total net buy gabungan (signed)
    isInstitutional: boolean; // heuristic flag
    verdict: BrokerClusterVerdict;
    verdictReason: string;
}

export type BrokerClusterVerdict = 'AKUMULASI' | 'DISTRIBUSI' | 'NETRAL';

interface PairStat {
    coOccurrences: number;
    sameSign: number;
    correlation: number; // derived
}

export function detectBrokerClusters(rows: ProcessedData[], opts?: {
    minCoOccurrence?: number;
    minCorrelation?: number;
    institutionalNetBuyThreshold?: number;
}): BrokerCluster[] {
    const minCoOccurrence = opts?.minCoOccurrence ?? 5;
    const minCorrelation = opts?.minCorrelation ?? 0.6;
    const institutionalNetBuyThreshold = opts?.institutionalNetBuyThreshold ?? 1_000_000_000; // heuristic

    const { activity, brokerTotals } = buildActivity(rows);
    const { pairStats, brokersSet } = computePairStats(activity);

    // finalize correlations
    for (const s of pairStats.values()) {
        s.correlation = s.coOccurrences > 0 ? s.sameSign / s.coOccurrences : 0;
    }

    const clusters = buildClusters(pairStats, brokersSet, brokerTotals, { minCoOccurrence, minCorrelation, institutionalNetBuyThreshold });

    return clusters;
}

function buildActivity(rows: ProcessedData[]) {
    const activity = new Map<string, Map<string, number>>();
    const brokerTotals = new Map<string, number>();
    for (const r of rows) {
        const key = `${r.raw.date}|${r.raw.stock}`;
        const by = activity.get(key) ?? new Map<string, number>();
        by.set(r.raw.broker, r.flow.netBuy);
        activity.set(key, by);
        brokerTotals.set(r.raw.broker, (brokerTotals.get(r.raw.broker) ?? 0) + r.flow.netBuy);
    }
    return { activity, brokerTotals };
}

function computePairStats(activity: Map<string, Map<string, number>>) {
    const pairStats = new Map<string, PairStat>();
    const brokersSet = new Set<string>();
    for (const by of activity.values()) {
        const brokers = Array.from(by.keys());
        for (let i = 0; i < brokers.length; i++) {
            for (let j = i + 1; j < brokers.length; j++) {
                const a = brokers[i];
                const b = brokers[j];
                brokersSet.add(a); brokersSet.add(b);
                const na = by.get(a) ?? 0;
                const nb = by.get(b) ?? 0;
                const key = a < b ? `${a}::${b}` : `${b}::${a}`;
                const stat = pairStats.get(key) ?? { coOccurrences: 0, sameSign: 0, correlation: 0 };
                stat.coOccurrences++;
                const signA = Math.sign(na);
                const signB = Math.sign(nb);
                if (signA !== 0 && signA === signB) stat.sameSign++;
                pairStats.set(key, stat);
            }
        }
    }
    return { pairStats, brokersSet };
}

function buildClusters(pairStats: Map<string, PairStat>, brokersSet: Set<string>, brokerTotals: Map<string, number>, opts: {
    minCoOccurrence: number;
    minCorrelation: number;
    institutionalNetBuyThreshold: number;
}) {
    const brokers = Array.from(brokersSet);
    const uf = buildUnionFind(pairStats, brokers, opts);
    const parent = uf.parent;
    const groups = collectGroups(parent, brokers);

    const clusters: BrokerCluster[] = [];
    for (const brokersArr of groups.values()) {
        const cluster = buildClusterFromGroup(brokersArr, pairStats, brokerTotals, opts);
        if (cluster) clusters.push(cluster);
    }

    return clusters.sort((a, b) => Math.abs(b.combinedNetBuy) - Math.abs(a.combinedNetBuy));
}

function buildUnionFind(pairStats: Map<string, PairStat>, brokers: string[], opts: { minCoOccurrence: number; minCorrelation: number }) {
    const index = new Map<string, number>();
    brokers.forEach((b, i) => index.set(b, i));
    const parent = brokers.map((_, i) => i);
    function find(i: number): number {
        if (parent[i] === i) {
            return i;
        }
        parent[i] = find(parent[i]);
        return parent[i];
    }
    function union(i: number, j: number) {
        const ri = find(i);
        const rj = find(j);
        if (ri !== rj) parent[rj] = ri;
    }

    for (const [k, s] of pairStats) {
        if (s.coOccurrences >= opts.minCoOccurrence && s.correlation >= opts.minCorrelation) {
            const parts = k.split('::');
            const a = parts[0]; const b = parts[1];
            const ia = index.get(a); const ib = index.get(b);
            if (ia === undefined || ib === undefined) continue;
            union(ia, ib);
        }
    }

    return { parent, index };
}

function findRoot(i: number, parentArr: number[]): number {
    if (parentArr[i] === i) return i;
    parentArr[i] = findRoot(parentArr[i], parentArr);
    return parentArr[i];
}

function collectGroups(parent: number[], brokers: string[]) {
    const groups = new Map<number, string[]>();
    for (let i = 0; i < brokers.length; i++) {
        const r = findRoot(i, parent);
        const arr = groups.get(r) ?? [];
        arr.push(brokers[i]);
        groups.set(r, arr);
    }
    return groups;
}

function buildClusterFromGroup(brokersArr: string[], pairStats: Map<string, PairStat>, brokerTotals: Map<string, number>, opts: { institutionalNetBuyThreshold: number }) {
    if (brokersArr.length <= 1) return null;
    let corrSum = 0; let corrCount = 0;
    for (let i = 0; i < brokersArr.length; i++) {
        for (let j = i + 1; j < brokersArr.length; j++) {
            const a = brokersArr[i], b = brokersArr[j];
            const key = a < b ? `${a}::${b}` : `${b}::${a}`;
            const s = pairStats.get(key);
            if (s) { corrSum += s.correlation; corrCount++; }
        }
    }
    const avgCorr = corrCount > 0 ? corrSum / corrCount : 0;
    const combinedNetBuy = brokersArr.reduce((acc, b) => acc + (brokerTotals.get(b) ?? 0), 0);
    const clusterName = brokersArr.join('-');
    const isInstitutional = Math.abs(combinedNetBuy) >= opts.institutionalNetBuyThreshold || avgCorr >= 0.8;
    const verdict = classifyClusterVerdict(combinedNetBuy, avgCorr, opts.institutionalNetBuyThreshold);
    const verdictReason = buildClusterVerdictReason(verdict, combinedNetBuy, avgCorr, isInstitutional, opts.institutionalNetBuyThreshold);
    return {
        clusterName,
        brokers: brokersArr,
        correlationScore: Number(avgCorr.toFixed(3)),
        combinedNetBuy,
        isInstitutional,
        verdict,
        verdictReason,
    };
}

function classifyClusterVerdict(combinedNetBuy: number, correlationScore: number, institutionalNetBuyThreshold: number): BrokerClusterVerdict {
    const magnitude = Math.abs(combinedNetBuy);
    const weakCluster = magnitude < institutionalNetBuyThreshold * 0.25 && correlationScore < 0.65;

    if (weakCluster || combinedNetBuy === 0) {
        return 'NETRAL';
    }

    return combinedNetBuy > 0 ? 'AKUMULASI' : 'DISTRIBUSI';
}

function buildClusterVerdictReason(
    verdict: BrokerClusterVerdict,
    combinedNetBuy: number,
    correlationScore: number,
    isInstitutional: boolean,
    institutionalNetBuyThreshold: number
): string {
    const magnitudeText = `${Math.abs(combinedNetBuy).toLocaleString('id-ID')}`;
    const correlationText = `${Math.round(correlationScore * 100)}%`;

    if (verdict === 'AKUMULASI') {
        return `Cluster net buyer dominan (+${magnitudeText}) dengan korelasi ${correlationText}${isInstitutional ? ' dan karakter institusional' : ''}.`;
    }

    if (verdict === 'DISTRIBUSI') {
        return `Cluster net seller dominan (-${magnitudeText}) dengan korelasi ${correlationText}${isInstitutional ? ' dan karakter institusional' : ''}.`;
    }

    return `Arah cluster belum tegas: net buy masih kecil dibanding ambang ${institutionalNetBuyThreshold.toLocaleString('id-ID')} dan korelasi baru ${correlationText}.`;
}

export default detectBrokerClusters;
