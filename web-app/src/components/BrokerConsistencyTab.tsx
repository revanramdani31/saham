import { useState, useMemo } from 'react';
import type { ProcessedData } from '../engine/types';
import { Users, Search } from 'lucide-react';
import { formatCompact } from '../utils/format';
import { exportBrokerFlow } from '../utils/exportCsv';

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
}

interface BrokerCrossStock {
  broker: string;
  totalStocks: number;
  totalNetBuy: number;
  avgConsistency: number;
  strongestStock: string;
  stockStats: StockStat[];
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

    // Group by stock
    const stockMap = new Map<string, StockStat>();
    const sortedBrokerData = [...brokerData].sort((a, b) => new Date(a.raw.date).getTime() - new Date(b.raw.date).getTime());

    sortedBrokerData.forEach(row => {
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
        });
      }
      const s = stockMap.get(row.raw.stock)!;
      s.totalNetBuy += row.flow.netBuy;
      s.days++;
      if (row.flow.netBuy > 0) s.buyDays++;
      s.latestPhase = row.phase.phase;
      s.signal = row.score.signal;
    });

    stockMap.forEach(s => {
      s.consistency = s.days > 0 ? (s.buyDays / s.days) * 100 : 0;
      s.avgNetBuy = s.days > 0 ? s.totalNetBuy / s.days : 0;
    });

    const stockStats = Array.from(stockMap.values()).sort((a, b) => b.totalNetBuy - a.totalNetBuy);

    const totalNetBuy = stockStats.reduce((acc, s) => acc + s.totalNetBuy, 0);
    const avgConsistency = stockStats.reduce((acc, s) => acc + s.consistency, 0) / (stockStats.length || 1);
    const strongestStock = stockStats[0]?.stock || '-';

    return {
      broker: activeBroker,
      totalStocks: stockStats.length,
      totalNetBuy,
      avgConsistency,
      strongestStock,
      stockStats,
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
                    <th>Konsistensi Beli</th>
                    <th>Phase Terkini</th>
                    <th>Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {brokerStats.stockStats.map((s, idx) => (
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
                      <td className="text-sm text-secondary">{s.latestPhase}</td>
                      <td>
                        <span className={`font-semibold text-sm ${getSignalColor(s.signal)}`}>
                          {s.signal}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
