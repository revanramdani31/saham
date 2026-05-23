import { useMemo } from 'react';
import type { ProcessedData } from '../engine/types';
import { Target } from 'lucide-react';
import { BandarmologiEngine } from '../engine/BandarmologiEngine';

interface WatchlistTabProps {
  data: ProcessedData[];
}

export function WatchlistTab({ data }: WatchlistTabProps) {
  const engine = useMemo(() => new BandarmologiEngine([]), []);
  const stockSummaries = useMemo(() => engine.getStockSummaries(data), [data, engine]);

  const sortedStocks = [...stockSummaries].sort((a, b) => b.latestScore - a.latestScore);

  const getSignalBadgeColor = (signal: string) => {
    if (signal.includes('BUY')) return 'bg-green';
    if (signal.includes('SELL') || signal === 'AVOID') return 'bg-red';
    return 'bg-yellow';
  };

  const getPhaseBadgeColor = (phase: string) => {
    if (phase === 'MARKUP' || phase === 'ACCUMULATION') return 'bg-green';
    if (phase === 'SIDEWAYS') return 'bg-yellow';
    return 'bg-red';
  };

  return (
    <div className="main-content">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-gradient">Watchlist & Signal</h1>
          <p className="text-secondary text-sm">Kesimpulan akhir untuk keputusan trading Anda.</p>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Target className="text-red" size={20} />
          <h3 className="font-semibold">Sinyal Saham Aktif</h3>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Stock</th>
                <th>Phase</th>
                <th>Grade</th>
                <th>Total Score</th>
                <th>Action Signal</th>
              </tr>
            </thead>
            <tbody>
              {sortedStocks.map((stock, idx) => (
                <tr key={idx}>
                  <td className="font-bold text-lg">{stock.stock}</td>
                  <td>
                    <span className={`badge ${getPhaseBadgeColor(stock.latestPhase)}`}>
                      {stock.latestPhase}
                    </span>
                  </td>
                  <td>
                    <span className={`font-bold ${['A+', 'A'].includes(stock.grade) ? 'text-green' : ['D', 'C'].includes(stock.grade) ? 'text-red' : 'text-yellow'}`}>
                      {stock.grade}
                    </span>
                  </td>
                  <td className="font-semibold">{stock.latestScore.toFixed(1)} / 100</td>
                  <td>
                    <span className={`badge ${getSignalBadgeColor(stock.latestSignal)}`} style={{ padding: '8px 16px', fontSize: '0.875rem' }}>
                      {stock.latestSignal}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
