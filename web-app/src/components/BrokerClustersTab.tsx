import { useMemo, useState } from 'react';
import type { ProcessedData } from '../engine/types';
import detectBrokerClusters from '../engine/brokerClustering';
import { NumberInput } from './NumberInput';
import { formatCompact } from '../utils/format';
import { getBrokerCategory, getCategoryBadgeStyle } from '../engine/brokerCategories';

function getClusterBadgeColor(verdict: 'AKUMULASI' | 'DISTRIBUSI' | 'NETRAL') {
    if (verdict === 'AKUMULASI') return { bg: 'rgba(46,160,67,0.15)', color: '#3FB950', border: 'rgba(46,160,67,0.35)' };
    if (verdict === 'DISTRIBUSI') return { bg: 'rgba(248,81,73,0.15)', color: '#F85149', border: 'rgba(248,81,73,0.35)' };
    return { bg: 'rgba(139,148,158,0.12)', color: '#8B949E', border: 'rgba(139,148,158,0.3)' };
}

export function BrokerClustersTab({ data }: Readonly<{ data: ProcessedData[] }>) {
    const [selectedStock, setSelectedStock] = useState<string>('ALL');
    const [minCoOccurrence, setMinCoOccurrence] = useState<number>(5);
    const [minCorrelation, setMinCorrelation] = useState<number>(0.6);
    const [institutionalThreshold, setInstitutionalThreshold] = useState<number>(1000000000);

    const uniqueStocks = useMemo(() => {
        return Array.from(new Set(data.map(d => d.raw.stock))).sort();
    }, [data]);

    const clusters = useMemo(() => {
        try {
            const filteredData = selectedStock === 'ALL' ? data : data.filter(d => d.raw.stock === selectedStock);
            return detectBrokerClusters(filteredData, {
                minCoOccurrence,
                minCorrelation,
                institutionalNetBuyThreshold: institutionalThreshold,
            });
        } catch (err) {
            console.error('broker clustering failed', err);
            return [];
        }
    }, [data, minCoOccurrence, minCorrelation, institutionalThreshold, selectedStock]);

    return (
        <div className="main-content">
            <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-gradient mb-2">Broker Clusters</h1>
                    <p className="text-secondary text-sm max-w-3xl">
                        Mendeteksi kelompok broker yang sering bergerak bersamaan. Setiap cluster akan dievaluasi apakah pergerakan mereka mengarah pada akumulasi, distribusi, atau netral.
                    </p>
                </div>
                <div className="flex items-center gap-3 text-xs bg-dark-2 p-2 rounded-lg border border-white/5">
                    <span className="text-secondary mr-1">Kategori:</span>
                    <span style={{ color: '#E34C26' }} className="font-semibold">Asing</span>
                    <span style={{ color: '#388BFD' }} className="font-semibold">Ritel</span>
                    <span style={{ color: '#3FB950' }} className="font-semibold">Institusi</span>
                    <span style={{ color: '#8B949E' }} className="font-semibold">Unknown</span>
                </div>
            </div>

            <div className="card mb-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-4">
                    <h3 className="font-semibold text-sm text-white">Parameter Clustering</h3>
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-secondary whitespace-nowrap">Filter Saham:</label>
                        <select className="input-field py-1" style={{ width: '120px' }} value={selectedStock} onChange={e => setSelectedStock(e.target.value)}>
                            <option value="ALL">Semua Saham</option>
                            {uniqueStocks.map(stock => (
                                <option key={stock} value={stock}>{stock}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="form-group">
                        <label className="text-xs text-secondary mb-2 block">Min Co-occurrence</label>
                        <input type="number" className="input-field" value={minCoOccurrence} onChange={e => setMinCoOccurrence(Number(e.target.value))} />
                        <div className="text-xs text-secondary mt-1">Minimal hari pergerakan bersamaan</div>
                    </div>
                    <div className="form-group">
                        <label className="text-xs text-secondary mb-2 block">Min Correlation</label>
                        <input type="number" step="0.05" min="0" max="1" className="input-field" value={minCorrelation} onChange={e => setMinCorrelation(Number(e.target.value))} />
                        <div className="text-xs text-secondary mt-1">Batas skor korelasi (0 - 1)</div>
                    </div>
                    <div className="form-group">
                        <label className="text-xs text-secondary mb-2 block">Institutional Threshold</label>
                        <NumberInput value={institutionalThreshold} onChange={setInstitutionalThreshold} className="input-field" placeholder="1B" />
                        <div className="text-xs text-secondary mt-1">Batas minimum total transaksi (Rp)</div>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                {clusters.length === 0 && (
                    <div className="card text-center text-secondary py-10 border border-dashed border-white/10 flex flex-col items-center justify-center">
                        <div className="text-lg mb-2">Tidak ada cluster ditemukan</div>
                        <div className="text-sm">Coba turunkan Min Co-occurrence atau Min Correlation untuk mendeteksi lebih banyak cluster.</div>
                    </div>
                )}

                {clusters.map((c, idx) => {
                    const badge = getClusterBadgeColor(c.verdict);
                    const brokerList = c.brokers;
                    const topBrokers = brokerList.slice(0, 4).join(', ');
                    const remainingCount = brokerList.length - 4;
                    const displayName = remainingCount > 0 ? `${topBrokers} & ${remainingCount} lainnya` : topBrokers;

                    return (
                        <div key={c.clusterName} className="card hover-bg transition-colors relative overflow-hidden group border border-white/5">
                            <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: badge.color }} />
                            
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pl-4">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                                        <h3 className="font-semibold text-lg text-white m-0">Cluster {idx + 1}: {displayName}</h3>
                                        <span style={{
                                            padding: '4px 10px',
                                            borderRadius: '6px',
                                            fontSize: '0.7rem',
                                            fontWeight: 700,
                                            background: badge.bg,
                                            color: badge.color,
                                            border: `1px solid ${badge.border}`,
                                        }}>
                                            {c.verdict}
                                        </span>
                                        {c.isInstitutional && (
                                            <span style={{
                                                padding: '4px 10px',
                                                borderRadius: '6px',
                                                fontSize: '0.7rem',
                                                fontWeight: 600,
                                                background: 'rgba(56, 139, 253, 0.1)',
                                                color: '#58A6FF',
                                                border: '1px solid rgba(56, 139, 253, 0.3)',
                                            }}>
                                                Institutional
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-secondary text-xs mb-3">
                                        <strong className="text-white/70 block mb-2">Anggota Cluster:</strong>
                                        <div className="flex flex-wrap gap-1.5">
                                            {brokerList.map(b => {
                                                const cat = getBrokerCategory(b);
                                                const style = getCategoryBadgeStyle(cat);
                                                return (
                                                    <span 
                                                        key={b} 
                                                        style={{ 
                                                            color: style.color, 
                                                            backgroundColor: style.bg, 
                                                            borderColor: style.border 
                                                        }} 
                                                        className="px-2 py-0.5 rounded border text-[11px] font-bold"
                                                        title={`Broker ${b} (${cat})`}
                                                    >
                                                        {b}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div className="text-sm text-secondary bg-dark-2 p-3 rounded-lg border border-white/5 leading-relaxed">
                                        {c.verdictReason}
                                    </div>
                                </div>

                                <div className="text-left md:text-right w-full md:w-auto bg-dark-2 p-4 rounded-lg border border-white/5 md:border-none md:bg-transparent md:p-0">
                                    <div className="text-xs text-secondary mb-1">Total Net Volume</div>
                                    <div className="font-bold text-xl" style={{ color: c.combinedNetBuy >= 0 ? '#3FB950' : '#F85149' }}>
                                        {c.combinedNetBuy >= 0 ? '+' : ''}Rp {formatCompact(Math.abs(c.combinedNetBuy))}
                                    </div>
                                    <div className="text-xs text-secondary mt-1 mb-2 font-mono">
                                        {c.combinedNetBuy.toLocaleString('id-ID')}
                                    </div>
                                    <div className="text-xs text-secondary flex items-center justify-start md:justify-end gap-2">
                                        Korelasi: <strong className="text-white">{(c.correlationScore * 100).toFixed(1)}%</strong>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default BrokerClustersTab;
