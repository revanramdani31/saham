import { useState, useMemo } from 'react';
import type { ProcessedData } from '../engine/types';
import { TrendingUp, TrendingDown, Minus, Search, ChevronUp, ChevronDown, Calendar } from 'lucide-react';
import { formatCompact } from '../utils/format';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const CHART_COLORS = ['#3fb950', '#58a6ff', '#d29922', '#bc8cff', '#f85149'];

interface BrokerTrendTabProps {
  data: ProcessedData[];
}

interface BrokerTrendSummary {
  broker: string;
  days: number;
  totalNetBuy: number;
  buyDays: number;
  sellDays: number;
  avgNetBuy: number;
  maxNetBuy: number;
  minNetBuy: number;
  consecutiveBuy: number;  // streak terbaru
  consistency: number;     // % hari akumulasi
  trend: string;           // UPTREND / DOWNTREND / SIDEWAYS
  signal: string;
  history: { date: string; netBuy: number }[];
  totalBuyValue: number;
  totalBuyVolume: number;
  avgBuyPrice: number;
  currentPrice: number;
  floatingPct: number;
}

type DateFilter = 'ALL' | '3D' | '5D' | '1M' | '3M' | 'YTD';

export function BrokerTrendTab({ data }: BrokerTrendTabProps) {
  // State filter
  const [selectedStock, setSelectedStock] = useState<string>('');
  const [sortKey, setSortKey] = useState<keyof BrokerTrendSummary>('totalNetBuy');
  const [sortAsc, setSortAsc] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>('ALL');

  // Daftar saham unik dari data
  const stockList = useMemo(() => {
    const s = new Set<string>();
    data.forEach(d => s.add(d.raw.stock));
    return Array.from(s).sort();
  }, [data]);

  // Auto-select stock pertama kalau belum ada pilihan
  const activeStock = selectedStock || stockList[0] || '';

  // Filter data untuk saham yang dipilih, urutkan kronologis
  const stockFilteredData = useMemo(() => {
    return [...data]
      .filter(d => d.raw.stock === activeStock)
      .sort((a, b) => new Date(a.raw.date).getTime() - new Date(b.raw.date).getTime());
  }, [data, activeStock]);

  const filteredData = useMemo(() => {
    if (!stockFilteredData.length || dateFilter === 'ALL') return stockFilteredData;

    const uniqueDates = Array.from(new Set(stockFilteredData.map(d => d.raw.date))).sort();
    const latestDateStr = uniqueDates[uniqueDates.length - 1];
    if (!latestDateStr) return stockFilteredData;
    const latestDate = new Date(latestDateStr);

    let cutoffDate = new Date(0);
    
    if (dateFilter === '3D') {
      const cutoffStr = uniqueDates[Math.max(0, uniqueDates.length - 3)];
      cutoffDate = new Date(cutoffStr);
    } else if (dateFilter === '5D') {
      const cutoffStr = uniqueDates[Math.max(0, uniqueDates.length - 5)];
      cutoffDate = new Date(cutoffStr);
    } else if (dateFilter === '1M') {
      cutoffDate = new Date(latestDate);
      cutoffDate.setMonth(cutoffDate.getMonth() - 1);
    } else if (dateFilter === '3M') {
      cutoffDate = new Date(latestDate);
      cutoffDate.setMonth(cutoffDate.getMonth() - 3);
    } else if (dateFilter === 'YTD') {
      cutoffDate = new Date(latestDate.getFullYear(), 0, 1);
    }

    return stockFilteredData.filter(d => new Date(d.raw.date) >= cutoffDate);
  }, [stockFilteredData, dateFilter]);

  // Hitung statistik per broker
  const brokerTrends = useMemo<BrokerTrendSummary[]>(() => {
    const map = new Map<string, BrokerTrendSummary>();

    filteredData.forEach(row => {
      const broker = row.raw.broker;
      const netBuy = row.flow.netBuy;

      if (!map.has(broker)) {
        map.set(broker, {
          broker,
          days: 0,
          totalNetBuy: 0,
          buyDays: 0,
          sellDays: 0,
          avgNetBuy: 0,
          maxNetBuy: 0,
          minNetBuy: Infinity,
          consecutiveBuy: 0,
          consistency: 0,
          trend: 'SIDEWAYS',
          signal: 'MONITOR',
          history: [],
          totalBuyValue: 0,
          totalBuyVolume: 0,
          avgBuyPrice: 0,
          currentPrice: 0,
          floatingPct: 0,
        });
      }

      const s = map.get(broker)!;
      s.days++;
      s.totalNetBuy += netBuy;
      if (netBuy > 0) s.buyDays++;
      else if (netBuy < 0) s.sellDays++;
      if (netBuy > s.maxNetBuy) s.maxNetBuy = netBuy;
      if (netBuy < s.minNetBuy) s.minNetBuy = netBuy;
      s.history.push({ date: row.raw.date, netBuy });

      if (row.raw.buyAvg > 0) {
        s.totalBuyValue += row.raw.buyValue;
        s.totalBuyVolume += (row.raw.buyValue / row.raw.buyAvg);
      }
    });

    // Post-process
    const latestClose = filteredData.length > 0 ? filteredData[filteredData.length - 1].raw.close : 0;
    
    map.forEach(s => {
      s.avgNetBuy = s.days > 0 ? s.totalNetBuy / s.days : 0;
      if (s.minNetBuy === Infinity) s.minNetBuy = 0;
      s.avgBuyPrice = s.totalBuyVolume > 0 ? s.totalBuyValue / s.totalBuyVolume : 0;
      s.currentPrice = latestClose;
      s.floatingPct = s.avgBuyPrice > 0 ? ((s.currentPrice - s.avgBuyPrice) / s.avgBuyPrice) * 100 : 0;

      // Konsistensi beli
      s.consistency = s.days > 0 ? (s.buyDays / s.days) * 100 : 0;

      // Streak akumulasi terbaru (consecutive buy dari belakang)
      let streak = 0;
      for (let i = s.history.length - 1; i >= 0; i--) {
        if (s.history[i].netBuy > 0) streak++;
        else break;
      }
      s.consecutiveBuy = streak;

      // Trend: bandingkan rata-rata 3 data terakhir vs 3 data awal
      if (s.history.length >= 4) {
        const first3Avg = s.history.slice(0, 3).reduce((acc, h) => acc + h.netBuy, 0) / 3;
        const last3Avg = s.history.slice(-3).reduce((acc, h) => acc + h.netBuy, 0) / 3;
        if (last3Avg > first3Avg * 1.1) s.trend = 'UPTREND';
        else if (last3Avg < first3Avg * 0.9) s.trend = 'DOWNTREND';
        else s.trend = 'SIDEWAYS';
      }

      // Signal
      if (s.consistency >= 70 && s.totalNetBuy > 0) s.signal = 'STRONG ACCUMULATION';
      else if (s.consistency >= 50 && s.totalNetBuy > 0) s.signal = 'ACCUMULATION';
      else if (s.consistency <= 30 && s.totalNetBuy < 0) s.signal = 'DISTRIBUTION';
      else s.signal = 'MONITOR';
    });

    return Array.from(map.values());
  }, [filteredData]);

  // Ambil top 5 broker berdasarkan Total Net Buy tertinggi
  const topBrokersForChart = useMemo(() => {
    return [...brokerTrends]
      .sort((a, b) => b.totalNetBuy - a.totalNetBuy)
      .slice(0, 5)
      .map(b => b.broker);
  }, [brokerTrends]);

  // Siapkan data untuk grafik kumulatif
  const chartData = useMemo(() => {
    if (!filteredData.length || !topBrokersForChart.length) return [];
    
    // Ambil tanggal unik, urutkan
    const dates = Array.from(new Set(filteredData.map(d => d.raw.date))).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    
    // Tracking total berjalan untuk tiap broker
    const cumulative: Record<string, number> = {};
    topBrokersForChart.forEach(b => cumulative[b] = 0);
    
    const result: any[] = [];
    
    // Kelompokkan data per tanggal
    const dataByDate = new Map<string, ProcessedData[]>();
    filteredData.forEach(d => {
      const date = d.raw.date;
      if (!dataByDate.has(date)) dataByDate.set(date, []);
      dataByDate.get(date)!.push(d);
    });
    
    dates.forEach(date => {
      const dayData = dataByDate.get(date) || [];
      const entry: any = { date };
      
      // Tambahkan net buy hari ini ke total kumulatif
      dayData.forEach(d => {
        if (topBrokersForChart.includes(d.raw.broker)) {
          cumulative[d.raw.broker] += d.flow.netBuy;
        }
      });
      
      // Simpan nilai kumulatif ke entry data grafik
      topBrokersForChart.forEach(b => {
        entry[b] = cumulative[b];
      });
      
      result.push(entry);
    });
    
    return result;
  }, [filteredData, topBrokersForChart]);

  // Sorting
  const sortedBrokers = useMemo(() => {
    return [...brokerTrends].sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortAsc ? av - bv : bv - av;
    });
  }, [brokerTrends, sortKey, sortAsc]);

  const handleSort = (key: keyof BrokerTrendSummary) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const SortIcon = ({ col }: { col: keyof BrokerTrendSummary }) => {
    if (sortKey !== col) return <span style={{ opacity: 0.3, fontSize: '10px' }}>▼</span>;
    return sortAsc ? <ChevronUp size={13} /> : <ChevronDown size={13} />;
  };

  const getSignalStyle = (signal: string) => {
    if (signal === 'STRONG ACCUMULATION') return 'bg-green';
    if (signal === 'ACCUMULATION') return 'bg-green';
    if (signal === 'DISTRIBUTION') return 'bg-red';
    return 'bg-yellow';
  };

  const getTrendIcon = (trend: string) => {
    if (trend === 'UPTREND') return <TrendingUp size={16} className="text-green" />;
    if (trend === 'DOWNTREND') return <TrendingDown size={16} className="text-red" />;
    return <Minus size={16} className="text-secondary" />;
  };

  // Mini sparkline bar untuk history (5 hari terakhir)
  const SparkBar = ({ history }: { history: { date: string; netBuy: number }[] }) => {
    const last5 = history.slice(-5);
    const max = Math.max(...last5.map(h => Math.abs(h.netBuy)), 1);
    return (
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '24px' }}>
        {last5.map((h, i) => {
          const height = Math.max(4, (Math.abs(h.netBuy) / max) * 24);
          const color = h.netBuy > 0 ? '#3fb950' : '#f85149';
          return (
            <div
              key={i}
              title={`${h.date}: ${formatCompact(h.netBuy)}`}
              style={{
                width: '8px',
                height: `${height}px`,
                background: color,
                borderRadius: '2px',
                transition: 'height 0.3s',
              }}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="main-content">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-gradient">Broker Trend per Saham</h1>
          <p className="text-secondary text-sm">
            Lihat konsistensi dan tren aktivitas setiap broker pada satu saham tertentu.
          </p>
        </div>
      </div>

      {/* Pilih Saham */}
      <div className="card mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Search size={16} className="text-secondary" />
            <span className="text-sm font-semibold">Pilih Saham:</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {stockList.map(stock => (
              <button
                key={stock}
                onClick={() => setSelectedStock(stock)}
                className={`btn ${activeStock === stock ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 16px', fontSize: '0.85rem', fontWeight: 600 }}
              >
                {stock}
              </button>
            ))}
          </div>
          {stockList.length === 0 && (
            <p className="text-secondary text-sm">Belum ada data. Silakan upload data di tab Raw Data.</p>
          )}
        </div>
      </div>

      {/* Filter Tanggal */}
      {activeStock && (
        <div className="card mb-6" style={{ padding: '12px 20px' }}>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-secondary" />
              <span className="text-sm font-semibold">Rentang Waktu:</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[
                { key: 'ALL', label: 'Semua Waktu' },
                { key: '3D', label: '3 Hari' },
                { key: '5D', label: '1 Minggu' },
                { key: '1M', label: '1 Bulan' },
                { key: '3M', label: '3 Bulan' },
                { key: 'YTD', label: 'YTD' },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setDateFilter(f.key as DateFilter)}
                  className={`btn ${dateFilter === f.key ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '4px 12px', fontSize: '0.8rem', fontWeight: 600, borderRadius: '999px' }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Grafik Tren Kumulatif */}
      {activeStock && chartData.length > 0 && (
        <div className="card mb-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="text-blue" size={20} />
            <h3 className="font-semibold">Kumulatif Akumulasi Top 5 Broker</h3>
          </div>
          <div style={{ height: '350px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  stroke="var(--text-secondary)" 
                  tick={{ fontSize: 12 }}
                  tickMargin={10}
                  tickFormatter={(val) => {
                    const d = new Date(val);
                    return `${d.getDate()}/${d.getMonth()+1}`;
                  }} 
                />
                <YAxis 
                  stroke="var(--text-secondary)" 
                  tick={{ fontSize: 12 }}
                  tickFormatter={(val) => formatCompact(val)} 
                  width={60}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', borderRadius: '8px' }}
                  itemStyle={{ fontSize: '13px' }}
                  formatter={(value: any) => formatCompact(value)}
                  labelFormatter={(label) => new Date(label).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '13px', paddingTop: '10px' }} />
                {topBrokersForChart.map((broker, idx) => (
                  <Line 
                    key={broker} 
                    type="monotone" 
                    dataKey={broker} 
                    name={broker}
                    stroke={CHART_COLORS[idx % CHART_COLORS.length]} 
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Tabel Broker Trend */}
      {activeStock && sortedBrokers.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="text-cyan" size={20} />
            <h3 className="font-semibold">
              Aktivitas Broker untuk <span className="text-blue">{activeStock}</span>
            </h3>
            <span className="badge bg-yellow text-xs" style={{ marginLeft: 'auto' }}>
              {sortedBrokers.length} Broker Aktif
            </span>
          </div>
          <div className="table-container" style={{ maxHeight: '600px', overflowY: 'auto' }}>
            <table>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <tr>
                  <th>Broker</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('days')}>
                    <div className="flex items-center gap-1 justify-center">Hari Aktif <SortIcon col="days" /></div>
                  </th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('totalNetBuy')}>
                    <div className="flex items-center gap-1 justify-center">Total Net Buy <SortIcon col="totalNetBuy" /></div>
                  </th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('avgNetBuy')}>
                    <div className="flex items-center gap-1 justify-center">Avg/Hari <SortIcon col="avgNetBuy" /></div>
                  </th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('avgBuyPrice')}>
                    <div className="flex items-center gap-1 justify-center">Avg Beli <SortIcon col="avgBuyPrice" /></div>
                  </th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('floatingPct')}>
                    <div className="flex items-center gap-1 justify-center">Harga Saat Ini <SortIcon col="floatingPct" /></div>
                  </th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('consistency')}>
                    <div className="flex items-center gap-1 justify-center">Konsistensi Beli <SortIcon col="consistency" /></div>
                  </th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('consecutiveBuy')}>
                    <div className="flex items-center gap-1 justify-center">Streak Buy <SortIcon col="consecutiveBuy" /></div>
                  </th>
                  <th>Tren</th>
                  <th>5 Hari Terakhir</th>
                  <th>Signal</th>
                </tr>
              </thead>
              <tbody>
                {sortedBrokers.map((b, idx) => (
                  <tr key={idx}>
                    <td className="font-bold text-blue">{b.broker}</td>
                    <td>
                      <span className="text-secondary">{b.days}</span>
                      <span className="text-xs text-secondary"> hari</span>
                    </td>
                    <td className="text-right">
                      <span className={`font-semibold ${b.totalNetBuy > 0 ? 'text-green' : 'text-red'}`}>
                        {b.totalNetBuy > 0 ? '+' : ''}{formatCompact(b.totalNetBuy)}
                      </span>
                    </td>
                    <td className="text-right">
                      <span className={`font-semibold ${b.avgNetBuy > 0 ? 'text-green' : 'text-red'}`}>
                        {b.avgNetBuy > 0 ? '+' : ''}{formatCompact(b.avgNetBuy)}
                      </span>
                    </td>
                    <td className="text-right">
                      <span className="font-semibold text-cyan">
                        {b.avgBuyPrice > 0 ? Math.round(b.avgBuyPrice).toLocaleString('id-ID') : '-'}
                      </span>
                    </td>
                    <td className="text-right">
                      {b.avgBuyPrice > 0 ? (
                        <div className="flex flex-col items-end">
                          <span className="text-sm font-semibold">{b.currentPrice.toLocaleString('id-ID')}</span>
                          <span className={`text-xs font-bold ${b.floatingPct > 0 ? 'text-green' : b.floatingPct < 0 ? 'text-red' : 'text-secondary'}`}>
                            {b.floatingPct > 0 ? '+' : ''}{b.floatingPct.toFixed(2)}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-secondary">-</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{
                          height: '6px', borderRadius: '3px', flex: 1,
                          background: 'var(--border-color)', maxWidth: '60px'
                        }}>
                          <div style={{
                            height: '100%', borderRadius: '3px',
                            width: `${b.consistency}%`,
                            background: b.consistency >= 60 ? '#3fb950' : b.consistency >= 40 ? '#d29922' : '#f85149'
                          }} />
                        </div>
                        <span className="text-xs">{b.consistency.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td>
                      {b.consecutiveBuy > 0 ? (
                        <span className="text-green font-bold">{b.consecutiveBuy}🔥</span>
                      ) : (
                        <span className="text-secondary">-</span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        {getTrendIcon(b.trend)}
                        <span className={`text-xs font-semibold ${b.trend === 'UPTREND' ? 'text-green' : b.trend === 'DOWNTREND' ? 'text-red' : 'text-secondary'}`}>
                          {b.trend}
                        </span>
                      </div>
                    </td>
                    <td>
                      <SparkBar history={b.history} />
                    </td>
                    <td>
                      <span className={`badge ${getSignalStyle(b.signal)}`} style={{ padding: '4px 8px', fontSize: '0.7rem' }}>
                        {b.signal}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
