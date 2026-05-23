import { useMemo } from 'react';
import type { ProcessedData } from '../engine/types';
import { TrendingUp, TrendingDown, Minus, Download } from 'lucide-react';
import { formatCompact, formatPrice } from '../utils/format';
import { exportSignals } from '../utils/exportCsv';
import { buildStockAggregates, computeStockLevelScore } from '../engine/stockAggregation';

interface AccumulationTabProps {
  data: ProcessedData[];
}

interface StockAccumSummary {
  stock: string;
  latestDate: string;
  latestClose: number;
  cumulativeNetBuy: number;
  totalBuyValue: number;
  totalSellValue: number;
  absorptionDays: number;
  distributionDays: number;
  totalDays: number;
  phase: string;
  latestScore: number;
  latestSignal: string;
  accumPercent: number;
  estimateStatus: string;
}

export function AccumulationTab({ data }: AccumulationTabProps) {
  const summaries = useMemo<StockAccumSummary[]>(() => {
    const aggregates = buildStockAggregates(data);
    const result: StockAccumSummary[] = [];

    aggregates.forEach((agg) => {
      const { verdictScore, signal, estimateStatus } = computeStockLevelScore(agg);
      const lr = agg.latestRow;

      let totalBuyValue = 0;
      let totalSellValue = 0;
      for (const row of agg.rows) {
        totalBuyValue += row.raw.buyValue;
        totalSellValue += row.raw.sellValue;
      }

      const accumPercent =
        agg.totalDays > 0
          ? (agg.absorptionDays / agg.totalDays) * 100
          : 0;

      result.push({
        stock: agg.stock,
        latestDate: lr.raw.date,
        latestClose: lr.raw.close,
        cumulativeNetBuy: agg.topBrokerNetAccum,
        totalBuyValue,
        totalSellValue,
        absorptionDays: agg.absorptionDays,
        distributionDays: agg.distributionDays,
        totalDays: agg.totalDays,
        phase: lr.phase.phase,
        latestScore: verdictScore,
        latestSignal: signal,
        accumPercent,
        estimateStatus,
      });
    });

    return result.sort((a, b) => b.cumulativeNetBuy - a.cumulativeNetBuy);
  }, [data]);

  const getStatusColor = (status: string) => {
    if (status === 'HEAVY ACCUMULATION') return 'bg-green';
    if (status === 'ACCUMULATION') return 'bg-green';
    if (status === 'HEAVY DISTRIBUTION') return 'bg-red';
    if (status === 'DISTRIBUTION') return 'bg-red';
    return 'bg-yellow';
  };

  const getPhaseIcon = (phase: string) => {
    if (phase === 'MARKUP' || phase === 'ACCUMULATION') return <TrendingUp size={14} className="text-green" />;
    if (phase === 'MARKDOWN' || phase === 'DISTRIBUTION') return <TrendingDown size={14} className="text-red" />;
    return <Minus size={14} className="text-secondary" />;
  };

  const maxAbs = Math.max(...summaries.map(s => Math.abs(s.cumulativeNetBuy)), 1);

  return (
    <div className="main-content">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-gradient">Accumulation & Distribution Tracker</h1>
          <p className="text-secondary text-sm">
            Deteksi saham mana yang sedang diam-diam diakumulasi atau didistribusikan bandar.
          </p>
        </div>
        <button
          className="btn btn-secondary flex items-center gap-2"
          onClick={() => exportSignals(data)}
        >
          <Download size={16} /> Export Signals CSV
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="text-secondary text-sm mb-1">Saham Akumulasi</p>
          <h2 className="text-green font-bold text-2xl">
            {summaries.filter(s => s.cumulativeNetBuy > 0).length}
          </h2>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="text-secondary text-sm mb-1">Saham Distribusi</p>
          <h2 className="text-red font-bold text-2xl">
            {summaries.filter(s => s.cumulativeNetBuy < 0).length}
          </h2>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="text-secondary text-sm mb-1">Heavy Accumulation</p>
          <h2 className="text-cyan font-bold text-2xl">
            {summaries.filter(s => s.estimateStatus === 'HEAVY ACCUMULATION').length}
          </h2>
        </div>
      </div>

      <div className="card">
        <div className="table-container" style={{ maxHeight: '600px', overflowY: 'auto' }}>
          <table>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                <th>Stock</th>
                <th>Update</th>
                <th>Close</th>
                <th>Kumulatif Top Broker Net</th>
                <th>Net Buy Bar</th>
                <th>Hari Absorpsi</th>
                <th>Hari Distribusi</th>
                <th>% Hari Absorpsi</th>
                <th>Phase</th>
                <th>Score</th>
                <th>Status Bandar</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => {
                const barWidth = (Math.abs(s.cumulativeNetBuy) / maxAbs) * 100;
                return (
                  <tr key={s.stock}>
                    <td className="font-bold text-lg">{s.stock}</td>
                    <td className="text-secondary text-xs">{s.latestDate}</td>
                    <td>{formatPrice(s.latestClose)}</td>
                    <td>
                      <span className={`font-bold ${s.cumulativeNetBuy > 0 ? 'text-green' : 'text-red'}`}>
                        {s.cumulativeNetBuy > 0 ? '+' : ''}{formatCompact(s.cumulativeNetBuy)}
                      </span>
                    </td>
                    <td style={{ width: '120px' }}>
                      <div style={{ height: '8px', borderRadius: '4px', background: 'var(--border-color)', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: `${barWidth}%`,
                          borderRadius: '4px',
                          background: s.cumulativeNetBuy >= 0 ? '#3fb950' : '#f85149',
                          transition: 'width 0.5s ease'
                        }} />
                      </div>
                    </td>
                    <td className="text-center">
                      <span className="text-green font-semibold">{s.absorptionDays}</span>
                    </td>
                    <td className="text-center">
                      <span className="text-red font-semibold">{s.distributionDays}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ height: '6px', borderRadius: '3px', flex: 1, background: 'var(--border-color)', maxWidth: '50px' }}>
                          <div style={{
                            height: '100%', borderRadius: '3px',
                            width: `${s.accumPercent}%`,
                            background: s.accumPercent >= 60 ? '#3fb950' : '#d29922'
                          }} />
                        </div>
                        <span className="text-xs">{s.accumPercent.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        {getPhaseIcon(s.phase)}
                        <span className="text-xs">{s.phase}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`font-bold ${s.latestScore >= 50 ? 'text-green' : s.latestScore >= 35 ? 'text-yellow' : 'text-red'}`}>
                        {s.latestScore.toFixed(0)}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${getStatusColor(s.estimateStatus)}`} style={{ padding: '4px 8px', fontSize: '0.7rem' }}>
                        {s.estimateStatus}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
