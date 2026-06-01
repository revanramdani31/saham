import { useMemo, useState } from 'react';
import type { ProcessedData } from '../engine/types';
import { Activity, Users } from 'lucide-react';
import { formatCompact } from '../utils/format';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  PieChart,
  Pie,
  Cell as PieCell
} from 'recharts';

interface BrokerFlowTabProps {
  data: ProcessedData[];
}

type BrokerSignalWindow = 'DAILY' | 'ROLLING_3D' | 'WEEKLY' | 'MONTHLY';

interface BrokerSignalSummary {
  label: string;
  latestDate: string;
  netBuy: number;
  buyerPressure: number;
  sellerPressure: number;
  buyerRatio: number;
  sellerRatio: number;
  topBuyerConcentration: number;
  signal: string;
  domination: string;
}

function windowLabel(window: BrokerSignalWindow): string {
  if (window === 'DAILY') return 'Harian';
  if (window === 'ROLLING_3D') return '3 Hari';
  if (window === 'WEEKLY') return 'Mingguan';
  return 'Bulanan';
}

function getPeriodKey(date: string, window: BrokerSignalWindow, index: number): string {
  if (window === 'WEEKLY') {
    const d = new Date(`${date}T12:00:00`);
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  if (window === 'MONTHLY') {
    return date.slice(0, 7);
  }

  if (window === 'ROLLING_3D') {
    return `ROLL_${Math.floor(index / 3)}`;
  }

  return date;
}

function buildSignalSummary(rows: ProcessedData[], window: BrokerSignalWindow): BrokerSignalSummary | null {
  if (rows.length === 0) return null;

  const sorted = [...rows].sort((a, b) => a.raw.date.localeCompare(b.raw.date));
  const grouped = new Map<string, ProcessedData[]>();

  sorted.forEach((row, index) => {
    const key = getPeriodKey(row.raw.date, window, index);
    const bucket = grouped.get(key) ?? [];
    bucket.push(row);
    grouped.set(key, bucket);
  });

  const groups = [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const latestGroup = groups[groups.length - 1]?.[1] ?? [];
  if (latestGroup.length === 0) return null;

  const latestDate = latestGroup[latestGroup.length - 1].raw.date;
  const netBuy = latestGroup.reduce((sum, row) => sum + row.flow.netBuy, 0);
  const buyerPressure = latestGroup.reduce((sum, row) => sum + Math.max(0, row.dailyTotals.top3BuyerNetBuy), 0);
  const sellerPressure = latestGroup.reduce((sum, row) => sum + Math.abs(Math.min(0, row.dailyTotals.top3SellerNetBuy)), 0);
  const totalPressure = buyerPressure + sellerPressure;
  const buyerRatio = totalPressure === 0 ? 0 : (buyerPressure / totalPressure) * 100;
  const sellerRatio = totalPressure === 0 ? 0 : (sellerPressure / totalPressure) * 100;
  const topBuyerConcentration = latestGroup.reduce((sum, row) => sum + row.dailyTotals.topBuyerConcentration, 0) / latestGroup.length;

  let signal = 'MONITOR';
  if (netBuy > 0) {
    signal = buyerRatio >= 60 ? 'AKUMULASI' : 'BUY PRESSURE';
  } else if (netBuy < 0) {
    signal = sellerRatio >= 60 ? 'DISTRIBUSI' : 'SELL PRESSURE';
  }

  let domination = 'BALANCED';
  if (buyerRatio >= 70) domination = 'DOMINANT BUY';
  else if (sellerRatio >= 70) domination = 'DOMINANT SELL';

  return {
    label: windowLabel(window),
    latestDate,
    netBuy,
    buyerPressure,
    sellerPressure,
    buyerRatio,
    sellerRatio,
    topBuyerConcentration,
    signal,
    domination,
  };
}

export function BrokerFlowTab({ data }: BrokerFlowTabProps) {
  const stocks = useMemo(() => {
    return Array.from(new Set(data.map(d => d.raw.stock))).sort();
  }, [data]);

  const [selectedStock, setSelectedStock] = useState<string>(stocks[0] || '');
  const [signalWindow, setSignalWindow] = useState<BrokerSignalWindow>('ROLLING_3D');

  const stockData = useMemo(() => {
    if (!selectedStock) return [];
    return data
      .filter(d => d.raw.stock === selectedStock)
      .sort((a, b) => new Date(a.raw.date).getTime() - new Date(b.raw.date).getTime());
  }, [data, selectedStock]);

  const chartData = useMemo(() => {
    let cumulative = 0;
    return stockData.map(d => {
      cumulative += d.flow.netBuy;
      return {
        date: d.raw.date.substring(5), // e.g., "05-21"
        netBuy: d.flow.netBuy,
        cumulative: cumulative
      };
    });
  }, [stockData]);

  const latest = stockData[stockData.length - 1];
  const signalSummary = useMemo(() => buildSignalSummary(stockData, signalWindow), [stockData, signalWindow]);

  // Buyer vs seller pressure must use absolute magnitudes.
  // top3SellerNetBuy is negative by definition (net sell), so convert to absolute pressure.
  const top3BuyerPressure = latest ? Math.max(0, latest.dailyTotals.top3BuyerNetBuy) : 0;
  const top3SellerPressure = latest ? Math.max(0, Math.abs(latest.dailyTotals.top3SellerNetBuy)) : 0;
  const totalTop3Pressure = top3BuyerPressure + top3SellerPressure;
  const top3BuyerRatio = totalTop3Pressure === 0 ? 0 : (top3BuyerPressure / totalTop3Pressure) * 100;
  const top3SellerRatio = totalTop3Pressure === 0 ? 0 : (top3SellerPressure / totalTop3Pressure) * 100;

  const formatNum = (n: number) => formatCompact(n);

  if (!selectedStock) {
    return <div className="p-8 text-center text-secondary">Silakan upload data terlebih dahulu.</div>;
  }

  return (
    <div className="main-content">
      <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-gradient">Broker Flow Engine</h1>
          <p className="text-secondary text-sm">Analisis detail pergerakan akumulasi & distribusi broker.</p>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="card">
            <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
              <Users size={16} className="text-purple" />
              Sinyal Broker Terakhir ({latest.raw.date})
            </h3>
            <div className="flex justify-between items-center p-4 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
              <div>
                <div className="text-xs text-secondary mb-1">Status Bandar</div>
                <div className={`font-bold text-lg ${latest.flow.signal === 'AKUMULASI' ? 'text-green' : latest.flow.signal === 'DISTRIBUSI' ? 'text-red' : 'text-yellow'}`}>
                  {latest.flow.signal}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-secondary mb-1">Net Buy/Sell</div>
                <div className={`font-bold text-lg ${latest.flow.netBuy > 0 ? 'text-green' : latest.flow.netBuy < 0 ? 'text-red' : ''}`}>
                  {latest.flow.netBuy > 0 ? '+' : ''}{formatNum(latest.flow.netBuy)}
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-between text-xs text-secondary">
              <div>Dominasi: <strong className="text-white">{latest.flow.domination}</strong></div>
              <div>Top Broker Mkt Share: <strong className="text-white">{(latest.flow.brokerMktShare * 100).toFixed(1)}%</strong></div>
            </div>
            <div className="mt-4 text-xs text-secondary">
              Snapshot di atas adalah <strong className="text-white">harian</strong>. Gunakan ringkasan agregasi di bawah untuk melihat akumulasi beberapa hari.
            </div>
          </div>

          <div className="card">
            <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
              <Activity size={16} className="text-blue" />
              Kekuatan Pembeli vs Penjual (Top 3)
            </h3>
            <div className="mt-2">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-green">Buyer ({formatCompact(top3BuyerPressure)})</span>
                <span className="text-red">Seller ({formatCompact(top3SellerPressure)})</span>
              </div>
              <div className="w-full h-3 bg-[var(--bg-tertiary)] rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-green"
                  style={{ width: `${top3BuyerRatio}%` }}
                />
                <div
                  className="h-full bg-red"
                  style={{ width: `${top3SellerRatio}%` }}
                />
              </div>
              <p className="text-xs text-secondary mt-5 text-center">
                Visualisasi kekuatan 3 broker teratas di sisi beli dan sisi jual pada hari terakhir.
              </p>
            </div>
          </div>

          <div className="card">
            <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
              <Users size={16} className="text-green" />
              Dominasi Top 3 Buyer
            </h3>
            <div className="flex items-center justify-between mt-2">
              <div style={{ width: 100, height: 100 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Top 3 Buyer', value: latest.dailyTotals.topBuyerConcentration * 100 },
                        { name: 'Ritel / Lainnya', value: (1 - latest.dailyTotals.topBuyerConcentration) * 100 }
                      ]}
                      innerRadius={25}
                      outerRadius={45}
                      dataKey="value"
                      stroke="none"
                    >
                      <PieCell fill="#2EA043" />
                      <PieCell fill="#2D3139" />
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#161B22', borderColor: '#30363D', borderRadius: '8px', fontSize: '0.75rem' }}
                      itemStyle={{ color: '#E6EDF3' }}
                      formatter={(val: any) => `${Number(val).toFixed(1)}%`}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 ml-4">
                <div className="text-xs text-secondary mb-1">Penguasaan:</div>
                <div className="text-xl font-bold text-green">{(latest.dailyTotals.topBuyerConcentration * 100).toFixed(1)}%</div>
                {latest.dailyTotals.topBuyerConcentration > 0.5 ? (
                  <div className="mt-2 text-[0.65rem] font-bold bg-[rgba(46,160,67,0.15)] text-[#3FB950] px-2 py-1 rounded-full inline-block border border-[rgba(46,160,67,0.3)]">
                    👑 BANDAR DOMINAN
                  </div>
                ) : (
                  <div className="mt-2 text-[0.65rem] font-bold bg-[rgba(139,148,158,0.15)] text-secondary px-2 py-1 rounded-full inline-block border border-[rgba(139,148,158,0.3)]">
                    👥 RITEL / MENYEBAR
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {signalSummary && (
        <div className="card mb-8" style={{ padding: '16px 20px' }}>
          <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Activity className="text-cyan" size={20} />
              Ringkasan Sinyal Agregasi {signalSummary.label}
            </h3>
            <div className="flex gap-2 flex-wrap">
              {(['DAILY', 'ROLLING_3D', 'WEEKLY', 'MONTHLY'] as BrokerSignalWindow[]).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setSignalWindow(w)}
                  className="btn btn-secondary"
                  style={{
                    padding: '6px 10px',
                    fontSize: '0.72rem',
                    background: signalWindow === w ? 'rgba(46,160,67,0.15)' : undefined,
                    borderColor: signalWindow === w ? '#3FB950' : undefined,
                  }}
                >
                  {windowLabel(w)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="rounded-lg p-3 bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
              <div className="text-xs text-secondary mb-1">Net Buy / Sell</div>
              <div className={`font-bold text-lg ${signalSummary.netBuy > 0 ? 'text-green' : signalSummary.netBuy < 0 ? 'text-red' : 'text-secondary'}`}>
                {signalSummary.netBuy > 0 ? '+' : ''}{formatCompact(signalSummary.netBuy)}
              </div>
            </div>
            <div className="rounded-lg p-3 bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
              <div className="text-xs text-secondary mb-1">Status Bandar</div>
              <div className={`font-bold text-lg ${signalSummary.signal === 'AKUMULASI' ? 'text-green' : signalSummary.signal === 'DISTRIBUSI' ? 'text-red' : 'text-yellow'}`}>
                {signalSummary.signal}
              </div>
            </div>
            <div className="rounded-lg p-3 bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
              <div className="text-xs text-secondary mb-1">Dominasi</div>
              <div className="font-bold text-lg text-white">{signalSummary.domination}</div>
            </div>
            <div className="rounded-lg p-3 bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
              <div className="text-xs text-secondary mb-1">Tgl terakhir</div>
              <div className="font-bold text-lg text-white">{signalSummary.latestDate}</div>
            </div>
          </div>
          <p className="text-xs text-secondary mt-3">
            Ringkasan agregasi ini membantu membaca akumulasi bertahap, misalnya saat 3 hari terakhir konsisten buy walau hari terakhir terlihat sell.
          </p>
        </div>
      )}

      <div className="card mb-8">
        <div className="flex items-center gap-2 mb-6">
          <Activity className="text-blue" size={20} />
          <h3 className="font-semibold">Grafik Akumulasi Broker ({selectedStock})</h3>
        </div>
        <div style={{ width: '100%', height: 400 }}>
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2D3139" />
              <XAxis dataKey="date" stroke="#8B949E" fontSize={12} />
              <YAxis stroke="#8B949E" fontSize={12} tickFormatter={(val) => formatCompact(val)} />
              <Tooltip
                contentStyle={{ backgroundColor: '#161B22', borderColor: '#30363D', borderRadius: '8px' }}
                itemStyle={{ color: '#E6EDF3' }}
                formatter={(value: any, name: any) => [formatCompact(value), name === 'netBuy' ? 'Net Buy Harian' : 'Akumulasi Total']}
              />
              <Legend />
              <ReferenceLine y={0} stroke="#8B949E" />
              <Bar dataKey="netBuy" name="Net Buy Harian">
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.netBuy >= 0 ? '#2EA043' : '#F85149'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
