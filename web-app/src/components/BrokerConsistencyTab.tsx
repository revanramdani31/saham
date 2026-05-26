import { useState, useMemo } from 'react';
import type { ProcessedData } from '../engine/types';
import { Users, Search, Fingerprint } from 'lucide-react';
import { formatCompact } from '../utils/format';
import { exportBrokerFlow } from '../utils/exportCsv';
import {
  computeProfileMetrics,
  classifyBrokerBehavior,
  getBehaviorBadgeStyle,
  type BrokerBehaviorProfile,
  type BrokerProfileMetrics,
} from '../engine/brokerProfiler';

interface BrokerConsistencyTabProps {
  data: ProcessedData[];
}

interface StockStat {
  stock: string;
  totalNetBuy: number;
  days: number;
  buyDays: number;
  consistency: number;
  avgNetBuy: number;
  latestPhase: string;
  signal: string;
  totalBuyValue: number;
  totalSellValue: number;
  grossValue: number;
  netGrossRatio: number;
  behaviorProfile: BrokerBehaviorProfile;
}

interface BrokerCrossStock {
  broker: string;
  totalStocks: number;
  totalNetBuy: number;
  avgConsistency: number;
  strongestStock: string;
  stockStats: StockStat[];
  globalMetrics: BrokerProfileMetrics;
  globalProfile: BrokerBehaviorProfile;
}

export function BrokerConsistencyTab({ data }: BrokerConsistencyTabProps) {
  const [selectedBroker, setSelectedBroker] = useState<string>('');

  const brokerList = useMemo(() => {
    const s = new Set<string>();
    data.forEach(d => s.add(d.raw.broker));
    return Array.from(s).sort();
  }, [data]);

  const activeBroker = selectedBroker || brokerList[0] || '';

  const brokerStats = useMemo<BrokerCrossStock | null>(() => {
    if (!activeBroker) return null;

    const brokerData = data.filter(d => d.raw.broker === activeBroker);

    // Compute total market days (unique dates across ALL data)
    const allDates = new Set<string>();
    data.forEach(d => allDates.add(d.raw.date));
    const totalMarketDays = allDates.size;

    // Group by stock — collect daily rows for profiling
    const stockDailyRows = new Map<string, { buyValue: number; sellValue: number; netBuy: number }[]>();
    const stockMap = new Map<string, StockStat>();
    const sortedBrokerData = [...brokerData].sort((a, b) => new Date(a.raw.date).getTime() - new Date(b.raw.date).getTime());

    // Also collect global daily rows (one entry per date, aggregated)
    const globalDailyMap = new Map<string, { buyValue: number; sellValue: number; netBuy: number }>();

    sortedBrokerData.forEach(row => {
      // Accumulate global daily
      const gd = globalDailyMap.get(row.raw.date) ?? { buyValue: 0, sellValue: 0, netBuy: 0 };
      gd.buyValue += row.raw.buyValue;
      gd.sellValue += row.raw.sellValue;
      gd.netBuy += row.flow.netBuy;
      globalDailyMap.set(row.raw.date, gd);

      // Accumulate per-stock daily
      if (!stockDailyRows.has(row.raw.stock)) stockDailyRows.set(row.raw.stock, []);
      stockDailyRows.get(row.raw.stock)!.push({
        buyValue: row.raw.buyValue,
        sellValue: row.raw.sellValue,
        netBuy: row.flow.netBuy,
      });

      if (!stockMap.has(row.raw.stock)) {
        stockMap.set(row.raw.stock, {
          stock: row.raw.stock,
          totalNetBuy: 0,
          days: 0,
          buyDays: 0,
          consistency: 0,
          avgNetBuy: 0,
          latestPhase: row.phase.phase,
          signal: row.score.signal,
          totalBuyValue: 0,
          totalSellValue: 0,
          grossValue: 0,
          netGrossRatio: 0,
          behaviorProfile: { tag: 'PASSIVE', label: 'Passive', description: '', confidence: 0 },
        });
      }
      const s = stockMap.get(row.raw.stock)!;
      s.totalNetBuy += row.flow.netBuy;
      s.totalBuyValue += row.raw.buyValue;
      s.totalSellValue += row.raw.sellValue;
      s.days++;
      if (row.flow.netBuy > 0) s.buyDays++;
      s.latestPhase = row.phase.phase;
      s.signal = row.score.signal;
    });

    stockMap.forEach((s, stock) => {
      s.consistency = s.days > 0 ? (s.buyDays / s.days) * 100 : 0;
      s.avgNetBuy = s.days > 0 ? s.totalNetBuy / s.days : 0;
      s.grossValue = s.totalBuyValue + s.totalSellValue;
      s.netGrossRatio = s.grossValue > 0 ? Math.abs(s.totalNetBuy) / s.grossValue : 0;

      // Per-stock behavior profile
      const rows = stockDailyRows.get(stock) ?? [];
      const metrics = computeProfileMetrics(rows, totalMarketDays);
      s.behaviorProfile = classifyBrokerBehavior(metrics);
    });

    const stockStats = Array.from(stockMap.values()).sort((a, b) => b.totalNetBuy - a.totalNetBuy);

    const totalNetBuy = stockStats.reduce((acc, s) => acc + s.totalNetBuy, 0);
    const avgConsistency = stockStats.reduce((acc, s) => acc + s.consistency, 0) / (stockStats.length || 1);
    const strongestStock = stockStats[0]?.stock || '-';

    // Global behavior profile
    const globalDailyArr = Array.from(globalDailyMap.values());
    const globalMetrics = computeProfileMetrics(globalDailyArr, totalMarketDays);
    const globalProfile = classifyBrokerBehavior(globalMetrics);

    return {
      broker: activeBroker,
      totalStocks: stockStats.length,
      totalNetBuy,
      avgConsistency,
      strongestStock,
      stockStats,
      globalMetrics,
      globalProfile,
    };
  }, [data, activeBroker]);

  const getSignalColor = (signal: string) => {
    if (signal.includes('BUY')) return 'text-green';
    if (signal === 'AVOID' || signal.includes('SELL')) return 'text-red';
    return 'text-yellow';
  };

  return (
    <div className="main-content">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-gradient">Broker Consistency Engine</h1>
          <p className="text-secondary text-sm">
            Pilih satu broker — lihat di saham apa saja dia aktif dan seberapa konsisten dia beli (cross-stock view).
          </p>
        </div>
        <button className="btn btn-secondary flex items-center gap-2" onClick={() => exportBrokerFlow(data)}>
          Export Broker Flow CSV
        </button>
      </div>

      {/* Pilih Broker */}
      <div className="card mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Search size={16} className="text-secondary" />
            <span className="text-sm font-semibold">Pilih Broker:</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {brokerList.map(broker => (
              <button
                key={broker}
                onClick={() => setSelectedBroker(broker)}
                className={`btn ${activeBroker === broker ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 14px', fontSize: '0.85rem', fontWeight: 600 }}
              >
                {broker}
              </button>
            ))}
          </div>
        </div>
      </div>

      {brokerStats && (
        <>
          {/* Broker summary cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="card" style={{ textAlign: 'center' }}>
              <p className="text-secondary text-xs mb-1">Total Saham Dimainkan</p>
              <h2 className="font-bold text-2xl text-blue">{brokerStats.totalStocks}</h2>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <p className="text-secondary text-xs mb-1">Total Net Buy</p>
              <h2 className={`font-bold text-2xl ${brokerStats.totalNetBuy > 0 ? 'text-green' : 'text-red'}`}>
                {brokerStats.totalNetBuy > 0 ? '+' : ''}{formatCompact(brokerStats.totalNetBuy)}
              </h2>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <p className="text-secondary text-xs mb-1">Avg Konsistensi</p>
              <h2 className="font-bold text-2xl text-yellow">{brokerStats.avgConsistency.toFixed(0)}%</h2>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <p className="text-secondary text-xs mb-1">Saham Terkuat</p>
              <h2 className="font-bold text-2xl text-cyan">{brokerStats.strongestStock}</h2>
            </div>
          </div>

          {/* Global Persona Card */}
          {(() => {
            const gp = brokerStats.globalProfile;
            const gm = brokerStats.globalMetrics;
            const gpStyle = getBehaviorBadgeStyle(gp.tag);
            return (
              <div className="card mb-6" style={{ borderLeft: `3px solid ${gpStyle.color}` }}>
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-lg" style={{ background: gpStyle.bg }}>
                    <Fingerprint size={28} style={{ color: gpStyle.color }} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h3 className="font-semibold text-white m-0">Profil Perilaku Global: {activeBroker}</h3>
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        background: gpStyle.bg,
                        color: gpStyle.color,
                        border: `1px solid ${gpStyle.border}`,
                      }}>
                        {gp.label}
                      </span>
                      <span className="text-xs text-secondary">Confidence: {gp.confidence.toFixed(0)}%</span>
                    </div>
                    <p className="text-sm text-secondary mb-3 leading-relaxed">{gp.description}</p>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <div className="bg-dark-2 p-2 rounded border border-white/5 text-center">
                        <div className="text-xs text-secondary">Net/Gross</div>
                        <div className="font-bold text-sm text-white">{(gm.netGrossRatio * 100).toFixed(1)}%</div>
                      </div>
                      <div className="bg-dark-2 p-2 rounded border border-white/5 text-center">
                        <div className="text-xs text-secondary">Partisipasi</div>
                        <div className="font-bold text-sm text-white">{(gm.participationRate * 100).toFixed(0)}%</div>
                      </div>
                      <div className="bg-dark-2 p-2 rounded border border-white/5 text-center">
                        <div className="text-xs text-secondary">Hari Aktif</div>
                        <div className="font-bold text-sm text-white">{gm.daysActive} / {gm.totalMarketDays}</div>
                      </div>
                      <div className="bg-dark-2 p-2 rounded border border-white/5 text-center">
                        <div className="text-xs text-secondary">Avg Gross/Hari</div>
                        <div className="font-bold text-sm text-white">{formatCompact(gm.avgDailyGross)}</div>
                      </div>
                      <div className="bg-dark-2 p-2 rounded border border-white/5 text-center">
                        <div className="text-xs text-secondary">Konsentrasi</div>
                        <div className="font-bold text-sm text-white">{(gm.concentrationRatio * 100).toFixed(0)}%</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Per-stock breakdown */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Users className="text-blue" size={20} />
              <h3 className="font-semibold">
                Aktivitas <span className="text-blue">{activeBroker}</span> di Setiap Saham
              </h3>
            </div>
            <div className="table-container" style={{ maxHeight: '500px', overflowY: 'auto' }}>
              <table>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr>
                    <th>Stock</th>
                    <th>Hari Aktif</th>
                    <th>Total Net Buy</th>
                    <th>Avg/Hari</th>
                    <th>Net/Gross</th>
                    <th>Konsistensi Beli</th>
                    <th>Behavior</th>
                    <th>Phase</th>
                    <th>Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {brokerStats.stockStats.map((s, idx) => {
                    const bStyle = getBehaviorBadgeStyle(s.behaviorProfile.tag);
                    return (
                    <tr key={idx}>
                      <td className="font-bold text-lg">{s.stock}</td>
                      <td className="text-secondary">{s.days} hari</td>
                      <td>
                        <span className={`font-semibold ${s.totalNetBuy > 0 ? 'text-green' : 'text-red'}`}>
                          {s.totalNetBuy > 0 ? '+' : ''}{formatCompact(s.totalNetBuy)}
                        </span>
                      </td>
                      <td>
                        <span className={`font-semibold ${s.avgNetBuy > 0 ? 'text-green' : 'text-red'}`}>
                          {s.avgNetBuy > 0 ? '+' : ''}{formatCompact(s.avgNetBuy)}
                        </span>
                      </td>
                      <td>
                        <span className="font-mono text-sm" style={{ color: s.netGrossRatio >= 0.3 ? '#3FB950' : s.netGrossRatio >= 0.15 ? '#D29922' : '#8B949E' }}>
                          {(s.netGrossRatio * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ height: '6px', borderRadius: '3px', width: '60px', background: 'var(--border-color)' }}>
                            <div style={{
                              height: '100%', borderRadius: '3px',
                              width: `${s.consistency}%`,
                              background: s.consistency >= 60 ? '#3fb950' : s.consistency >= 40 ? '#d29922' : '#f85149'
                            }} />
                          </div>
                          <span className="text-xs">{s.consistency.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td>
                        <span
                          title={s.behaviorProfile.description}
                          style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            background: bStyle.bg,
                            color: bStyle.color,
                            border: `1px solid ${bStyle.border}`,
                            cursor: 'help',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {s.behaviorProfile.label}
                        </span>
                      </td>
                      <td className="text-sm text-secondary">{s.latestPhase}</td>
                      <td>
                        <span className={`font-semibold text-sm ${getSignalColor(s.signal)}`}>
                          {s.signal}
                        </span>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
