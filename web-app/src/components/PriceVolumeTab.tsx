import { useMemo, useState } from 'react';
import type { ProcessedData } from '../engine/types';
import { BarChart2 } from 'lucide-react';
import { formatCompact, formatPrice } from '../utils/format';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface PriceVolumeTabProps {
  data: ProcessedData[];
}

export function PriceVolumeTab({ data }: PriceVolumeTabProps) {
  const stocks = useMemo(() => {
    return Array.from(new Set(data.map(d => d.raw.stock))).sort();
  }, [data]);

  const [selectedStock, setSelectedStock] = useState<string>(stocks[0] || '');

  const stockData = useMemo(() => {
    if (!selectedStock) return [];
    return data
      .filter(d => d.raw.stock === selectedStock)
      .sort((a, b) => new Date(a.raw.date).getTime() - new Date(b.raw.date).getTime());
  }, [data, selectedStock]);

  const chartData = useMemo(() => {
    return stockData.map(d => ({
      date: d.raw.date.substring(5), // e.g., "05-21"
      close: d.price.close,
      volume: d.volume.stockTotalVol,
      volRatio: d.volume.volRatio,
      isBullish: d.price.priceChangePercent >= 0,
    }));
  }, [stockData]);

  const latest = stockData[stockData.length - 1];

  const getPhaseColor = (phase: string) => {
    if (phase === 'MARKUP') return 'text-green';
    if (phase === 'MARKDOWN') return 'text-red';
    return 'text-yellow';
  };

  const getAbnormalColor = (status: string) => {
    if (status === 'ABNORMAL') return 'bg-red text-white';
    if (status === 'TINGGI') return 'bg-yellow text-black';
    return 'text-secondary';
  };

  if (!selectedStock) {
    return <div className="p-8 text-center text-secondary">Silakan upload data terlebih dahulu.</div>;
  }

  return (
    <div className="main-content">
      <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-gradient">Price Action & Volume</h1>
          <p className="text-secondary text-sm">Analisa kekuatan candlestick, fase tren harga, dan anomali volume.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-secondary font-semibold">Pilih Saham:</label>
          <select 
            className="input-field" 
            value={selectedStock} 
            onChange={e => setSelectedStock(e.target.value)}
            style={{ width: '150px' }}
          >
            {stocks.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {latest && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="card text-center">
            <h3 className="text-xs text-secondary font-semibold uppercase mb-1">Harga Terakhir</h3>
            <div className={`text-2xl font-bold ${latest.price.priceChangePercent > 0 ? 'text-green' : latest.price.priceChangePercent < 0 ? 'text-red' : ''}`}>
              {formatPrice(latest.price.close)}
            </div>
            <div className="text-xs mt-1">
              {latest.price.priceChangePercent > 0 ? '+' : ''}{(latest.price.priceChangePercent * 100).toFixed(2)}%
            </div>
          </div>
          <div className="card text-center">
            <h3 className="text-xs text-secondary font-semibold uppercase mb-1">Fase Tren</h3>
            <div className={`text-xl font-bold ${getPhaseColor(latest.price.pricePhase)}`}>
              {latest.price.pricePhase}
            </div>
            <div className="text-xs text-secondary mt-1">
              Kekuatan Tren: {(latest.price.candleStrength * 100).toFixed(0)}%
            </div>
          </div>
          <div className="card text-center">
            <h3 className="text-xs text-secondary font-semibold uppercase mb-1">Status Volume</h3>
            <div className="mt-2">
              <span className={`badge ${getAbnormalColor(latest.volume.isAbnormal)}`} style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
                {latest.volume.isAbnormal} ({latest.volume.volRatio.toFixed(1)}x)
              </span>
            </div>
            <div className="text-xs text-secondary mt-2">
              Total Volume: {formatCompact(latest.volume.stockTotalVol)}
            </div>
          </div>
        </div>
      )}

      <div className="card mb-8">
        <div className="flex items-center gap-2 mb-6">
          <BarChart2 className="text-blue" size={20} />
          <h3 className="font-semibold">Grafik Harga & Volume ({selectedStock})</h3>
        </div>
        <div style={{ width: '100%', height: 400 }}>
          <ResponsiveContainer>
            <ComposedChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2D3139" />
              <XAxis dataKey="date" stroke="#8B949E" fontSize={12} />
              <YAxis yAxisId="left" stroke="#8B949E" fontSize={12} domain={['auto', 'auto']} />
              <YAxis yAxisId="right" orientation="right" stroke="#8B949E" fontSize={12} tickFormatter={(val) => formatCompact(val)} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#161B22', borderColor: '#30363D', borderRadius: '8px' }}
                itemStyle={{ color: '#E6EDF3' }}
                formatter={(value: any, name: any) => {
                  if (name === 'Volume') return [formatCompact(value), name];
                  return [formatPrice(value), name as string];
                }}
              />
              <Legend />
              <Bar 
                yAxisId="right" 
                dataKey="volume" 
                name="Volume" 
                fill="#388BFD" 
                opacity={0.3} 
                radius={[4, 4, 0, 0]}
              />
              <Line 
                yAxisId="left" 
                type="monotone" 
                dataKey="close" 
                name="Close Price" 
                stroke="#6E40C9" 
                strokeWidth={3}
                dot={{ r: 4, fill: '#6E40C9' }}
                activeDot={{ r: 6 }} 
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
}
