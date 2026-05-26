import { useMemo, useState } from 'react';
import type { ProcessedData } from '../engine/types';
import detectBrokerClusters from '../engine/brokerClustering';

export function BrokerClustersTab({ data }: Readonly<{ data: ProcessedData[] }>) {
    const [minCoOccurrence, setMinCoOccurrence] = useState<number>(5);
    const [minCorrelation, setMinCorrelation] = useState<number>(0.6);
    const [institutionalThreshold, setInstitutionalThreshold] = useState<number>(1000000000);

    const clusters = useMemo(() => {
        try {
            return detectBrokerClusters(data, {
                minCoOccurrence,
                minCorrelation,
                institutionalNetBuyThreshold: institutionalThreshold,
            });
        } catch (err) {
            console.error('broker clustering failed', err);
            return [];
        }
    }, [data, minCoOccurrence, minCorrelation, institutionalThreshold]);

    return (
        <div style={{ padding: 20 }}>
            <h3 style={{ marginBottom: 8 }}>Broker Clusters</h3>
            <p style={{ marginTop: 0, color: 'var(--text-secondary)' }}>Detected groups of brokers that tend to move together.</p>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12, marginBottom: 16 }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span>Min co-occurrence</span>
                    <input type="number" value={minCoOccurrence} onChange={e => setMinCoOccurrence(Number(e.target.value))} style={{ width: 96 }} />
                </label>

                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span>Min correlation</span>
                    <input type="number" step="0.05" min="0" max="1" value={minCorrelation} onChange={e => setMinCorrelation(Number(e.target.value))} style={{ width: 96 }} />
                </label>

                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span>Institutional threshold</span>
                    <input type="number" value={institutionalThreshold} onChange={e => setInstitutionalThreshold(Number(e.target.value))} style={{ width: 160 }} />
                </label>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
                {clusters.length === 0 && (
                    <div style={{ color: 'var(--text-secondary)' }}>No clusters found for the current thresholds.</div>
                )}

                {clusters.map((c) => (
                    <div key={c.clusterName} style={{ padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <strong>{c.clusterName}</strong>
                                <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{c.brokers.join(', ')}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: 600 }}>{Math.abs(c.combinedNetBuy).toLocaleString()}</div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{c.correlationScore} • {c.isInstitutional ? 'Institutional' : 'Retail-like'}</div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default BrokerClustersTab;
