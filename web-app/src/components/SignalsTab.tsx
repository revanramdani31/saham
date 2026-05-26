import { useMemo } from 'react';
import type { ProcessedData } from '../engine/types';
import { Grid, Radio } from 'lucide-react';
import { formatCompact } from '../utils/format';
import { buildRecommendationAsOf } from '../engine/recommendations';

interface SignalsTabProps {
  data: ProcessedData[];
}

export function SignalsTab({ data }: Readonly<SignalsTabProps>) {
  // Heatmap + log generation using stock-level confidence-adjusted recommendation as-of each date
  const { dates, stocks, matrix, signalLog } = useMemo(() => {
    const datesSet = new Set<string>();
    const stocksSet = new Set<string>();

    data.forEach(d => {
      datesSet.add(d.raw.date);
      stocksSet.add(d.raw.stock);
    });

    const datesArr = Array.from(datesSet).sort((a, b) => a.localeCompare(b));
    const stocksArr = Array.from(stocksSet).sort((a, b) => a.localeCompare(b));

    type MatrixCell = {
      signal: string;
      score: number;
      phase: string;
      behaviorLabel: string;
      cumulativeNetBuy: number;
      absorptionDays: number;
      distributionDays: number;
    };

    const mat: Record<string, Record<string, MatrixCell | null>> = {};
    const logs: Array<{
      date: string;
      stock: string;
      score: number;
      phase: string;
      behaviorLabel: string;
      cumulativeNetBuy: number;
      signal: string;
      absorptionDays: number;
      distributionDays: number;
    }> = [];

    stocksArr.forEach(s => {
      mat[s] = {};
      datesArr.forEach(d => {
        const rec = buildRecommendationAsOf(data, s, d);
        if (!rec) {
          mat[s][d] = null;
          return;
        }

        const cell: MatrixCell = {
          signal: rec.signal,
          score: rec.totalScore,
          phase: rec.phase,
          behaviorLabel: rec.behaviorLabel,
          cumulativeNetBuy: rec.cumulativeNetBuy,
          absorptionDays: rec.absorptionDays,
          distributionDays: rec.distributionDays,
        };

        mat[s][d] = cell;
        logs.push({
          date: d,
          stock: s,
          score: rec.totalScore,
          phase: rec.phase,
          behaviorLabel: rec.behaviorLabel,
          cumulativeNetBuy: rec.cumulativeNetBuy,
          signal: rec.signal,
          absorptionDays: rec.absorptionDays,
          distributionDays: rec.distributionDays,
        });
      });
    });

    const sortedLogs = [...logs].sort((a, b) => {
      if (a.date !== b.date) {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
      return b.score - a.score;
    });

    return { dates: datesArr, stocks: stocksArr, matrix: mat, signalLog: sortedLogs };
  }, [data]);

  const getSignalColor = (signal: string) => {
    if (signal === 'STRONG BUY') return '#2EA043'; // Dark Green
    if (signal === 'BUY' || signal === 'BUY NOW') return '#3FB950'; // Green
    if (signal === 'WATCH') return '#D29922'; // Yellow
    if (signal === 'MONITOR') return '#F0883E'; // Orange
    if (signal === 'SELL') return '#F85149'; // Red
    if (signal === 'AVOID') return '#DA3633'; // Dark Red
    return 'var(--bg-tertiary)'; // Default empty
  };

  const getSignalBadgeColor = (signal: string) => {
    if (signal.includes('BUY')) return 'bg-green';
    if (signal.includes('SELL') || signal === 'AVOID') return 'bg-red';
    return 'bg-yellow';
  };

  return (
    <div className="main-content">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-gradient">Auto Signal Engine & Heatmap</h1>
          <p className="text-secondary text-sm">Pemetaan visual (Heatmap) dan log sinyal otomatis dari engine.</p>
        </div>
      </div>

      <div className="card mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Grid className="text-purple" size={20} />
          <h3 className="font-semibold">Signal Heatmap (Matrix)</h3>
        </div>

        {stocks.length === 0 ? (
          <div className="p-8 text-center text-secondary">Silakan upload data terlebih dahulu.</div>
        ) : (
          <div style={{ overflowX: 'auto', paddingBottom: '12px' }}>
            <table style={{ minWidth: '100%', borderCollapse: 'separate', borderSpacing: '2px' }}>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, background: 'var(--bg-secondary)', zIndex: 10, textAlign: 'left', padding: '8px' }}>Saham</th>
                  {dates.map(d => (
                    <th key={d} style={{ textAlign: 'center', padding: '8px', fontSize: '0.75rem', minWidth: '80px' }}>
                      {d.substring(5)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stocks.map(stock => (
                  <tr key={stock}>
                    <td style={{ position: 'sticky', left: 0, background: 'var(--bg-secondary)', zIndex: 10, fontWeight: 'bold', padding: '8px' }}>
                      {stock}
                    </td>
                    {dates.map(date => {
                      const cell = matrix[stock][date];
                      if (!cell) {
                        return <td key={date} style={{ background: 'var(--bg-tertiary)', borderRadius: '4px' }}></td>;
                      }
                      return (
                        <td
                          key={date}
                          title={`${stock} on ${date}: ${cell.signal} (Score: ${cell.score.toFixed(1)})`}
                          style={{
                            background: getSignalColor(cell.signal),
                            borderRadius: '4px',
                            cursor: 'pointer',
                            textAlign: 'center',
                            color: 'white',
                            fontSize: '0.7rem',
                            fontWeight: 'bold',
                            padding: '8px 4px'
                          }}
                        >
                          {cell.signal}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-4 mt-4 justify-center text-xs text-secondary flex-wrap">
              <div className="flex items-center gap-1"><span style={{ width: 12, height: 12, background: '#2EA043', borderRadius: 2, display: 'inline-block' }}></span> Strong Buy</div>
              <div className="flex items-center gap-1"><span style={{ width: 12, height: 12, background: '#3FB950', borderRadius: 2, display: 'inline-block' }}></span> Buy</div>
              <div className="flex items-center gap-1"><span style={{ width: 12, height: 12, background: '#D29922', borderRadius: 2, display: 'inline-block' }}></span> Watch</div>
              <div className="flex items-center gap-1"><span style={{ width: 12, height: 12, background: '#F85149', borderRadius: 2, display: 'inline-block' }}></span> Sell</div>
              <div className="flex items-center gap-1"><span style={{ width: 12, height: 12, background: '#DA3633', borderRadius: 2, display: 'inline-block' }}></span> Avoid</div>
            </div>
          </div>
        )}
      </div>

      <div className="card mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Radio className="text-purple" size={20} />
          <h3 className="font-semibold">Log Sinyal Otomatis</h3>
          <span className="text-xs text-secondary ml-2">(Score = Confidence-Adjusted Stock Score)</span>
        </div>
        <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
          <table>
            <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
              <tr>
                <th>Date</th>
                <th>Stock</th>
                <th>Score</th>
                <th>Phase</th>
                <th>Behavior</th>
                <th>Net Buy</th>
                <th>Signal</th>
              </tr>
            </thead>
            <tbody>
              {signalLog.map((row) => {
                let netBuyClass = '';
                if (row.cumulativeNetBuy > 0) {
                  netBuyClass = 'text-green';
                } else if (row.cumulativeNetBuy < 0) {
                  netBuyClass = 'text-red';
                }

                return (
                  <tr key={`${row.date}-${row.stock}`}>
                    <td className="text-secondary">{row.date}</td>
                    <td className="font-bold">{row.stock}</td>
                    <td>
                      <span className="font-bold">{row.score.toFixed(1)}</span>
                    </td>
                    <td>{row.phase}</td>
                    <td>{row.behaviorLabel}</td>
                    <td className={netBuyClass}>
                      {formatCompact(row.cumulativeNetBuy)}
                    </td>
                    <td>
                      <span className={`badge ${getSignalBadgeColor(row.signal)}`} style={{ padding: '4px 8px', fontSize: '0.75rem' }}>
                        {row.signal}
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
