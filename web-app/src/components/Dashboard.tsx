import React, { useMemo } from 'react';
import type { ProcessedData } from '../engine/types';
import { BandarmologiEngine } from '../engine/BandarmologiEngine';
import { TrendingUp, Activity, Users, ShieldAlert, Zap, PieChart as PieChartIcon, BarChart2 } from 'lucide-react';
import { formatCompact } from '../utils/format';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface DashboardProps {
  data: ProcessedData[];
}

export function Dashboard({ data }: DashboardProps) {
  const engine = useMemo(() => new BandarmologiEngine([]), []);
  const stockSummaries = useMemo(() => engine.getStockSummaries(data), [data, engine]);
  const brokerSummaries = useMemo(() => engine.getBrokerSummaries(data), [data, engine]);

  // KPIs
  const activeStocks = new Set(data.map(d => d.raw.stock)).size;
  const activeBrokers = new Set(data.map(d => d.raw.broker)).size;
  
  // Get latest signals per stock
  const latestSignals = useMemo(() => {
    return stockSummaries.filter(
      (s) => s.latestSignal === 'BUY NOW' || s.latestSignal === 'BUY' || s.latestSignal === 'STRONG BUY'
    ).length;
  }, [stockSummaries]);
  
  const sellSignals = useMemo(() => {
    return stockSummaries.filter(
      (s) => s.latestSignal === 'SELL' || s.latestSignal === 'AVOID'
    ).length;
  }, [stockSummaries]);

  const watchSignals = useMemo(() => {
    return stockSummaries.filter(
      (s) => s.latestSignal === 'WATCH' || s.latestSignal === 'MONITOR'
    ).length;
  }, [stockSummaries]);

  // Sorting
  const topStocks = [...stockSummaries].sort((a, b) => b.latestScore - a.latestScore).slice(0, 10);
  const topBrokers = [...brokerSummaries].sort((a, b) => b.totalNetBuy - a.totalNetBuy).slice(0, 10);

  const getPhaseBadgeColor = (phase: string) => {
    if (phase === 'MARKUP' || phase === 'ACCUMULATION') return 'bg-green';
    if (phase === 'SIDEWAYS') return 'bg-yellow';
    return 'bg-red';
  };

  // Chart Data
  const pieData = [
    { name: 'Buy', value: latestSignals, color: '#3FB950' },
    { name: 'Sell', value: sellSignals, color: '#F85149' },
    { name: 'Watch', value: watchSignals, color: '#D29922' }
  ].filter(d => d.value > 0);

  const barData = topBrokers.map(b => ({
    broker: b.broker,
    netBuy: b.totalNetBuy
  }));

  return (
    <div className="main-content">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-gradient">Dashboard</h1>
          <p className="text-secondary text-sm">Ringkasan Sinyal dan Top Saham</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <KPICard title="SAHAM AKTIF" value={activeStocks} icon={<Activity size={20} />} color="text-blue" />
        <KPICard title="BROKER AKTIF" value={activeBrokers} icon={<Users size={20} />} color="text-purple" />
        <KPICard title="BUY SIGNALS" value={latestSignals} icon={<TrendingUp size={20} />} color="text-green" />
        <KPICard title="SELL SIGNALS" value={sellSignals} icon={<ShieldAlert size={20} />} color="text-red" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <PieChartIcon className="text-purple" size={20} />
            <h3 className="font-semibold">Distribusi Sinyal Saham</h3>
          </div>
          <div style={{ width: '100%', height: 300 }}>
            {pieData.length > 0 ? (
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    label={(props: any) => `${props.name} ${((props.percent || 0) * 100).toFixed(0)}%`}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#161B22', borderColor: '#30363D', borderRadius: '8px' }}
                    itemStyle={{ color: '#E6EDF3' }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-secondary">
                Belum ada data sinyal
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 className="text-blue" size={20} />
            <h3 className="font-semibold">Top 10 Broker Net Buy</h3>
          </div>
          <div style={{ width: '100%', height: 300 }}>
            {barData.length > 0 ? (
              <ResponsiveContainer>
                <BarChart data={barData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2D3139" horizontal={true} vertical={false} />
                  <XAxis type="number" stroke="#8B949E" fontSize={12} tickFormatter={(val) => formatCompact(val)} />
                  <YAxis dataKey="broker" type="category" stroke="#8B949E" fontSize={12} width={50} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#161B22', borderColor: '#30363D', borderRadius: '8px' }}
                    itemStyle={{ color: '#E6EDF3' }}
                    formatter={(value: any) => [formatCompact(value), 'Net Buy']}
                  />
                  <Bar dataKey="netBuy" fill="#388BFD" radius={[0, 4, 4, 0]}>
                    {barData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.netBuy >= 0 ? '#2EA043' : '#F85149'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-secondary">
                Belum ada data broker
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Top Stocks Table */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="text-yellow" size={20} />
            <h3 className="font-semibold">Top Saham by Score</h3>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Stock</th>
                  <th>Score</th>
                  <th>Phase</th>
                  <th>Net Buy</th>
                  <th>Signal</th>
                </tr>
              </thead>
              <tbody>
                {topStocks.map(stock => (
                  <tr key={stock.stock}>
                    <td className="font-bold">{stock.stock}</td>
                    <td>
                      <span className={`text-sm font-semibold ${stock.latestScore >= 70 ? 'text-green' : stock.latestScore <= 30 ? 'text-red' : 'text-yellow'}`}>
                        {stock.latestScore.toFixed(1)}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${getPhaseBadgeColor(stock.latestPhase)}`}>
                        {stock.latestPhase}
                      </span>
                    </td>
                    <td className="text-sm font-semibold">{formatCompact(stock.totalNetBuy)}</td>
                    <td>
                      <span className={`badge ${stock.latestSignal.includes('BUY') ? 'bg-green' : stock.latestSignal.includes('SELL') ? 'bg-red' : 'bg-yellow'}`}>
                        {stock.latestSignal}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Brokers Table */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Users className="text-blue" size={20} />
            <h3 className="font-semibold">Detail Top Broker</h3>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Broker</th>
                  <th>Total Net Buy</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {topBrokers.map((broker, idx) => (
                  <tr key={broker.broker}>
                    <td className="font-bold">
                      <span className="text-secondary text-xs mr-2">#{idx + 1}</span>
                      {broker.broker}
                    </td>
                    <td>
                      <span className={`text-sm font-semibold ${broker.totalNetBuy > 0 ? 'text-green' : 'text-red'}`}>
                        {formatCompact(broker.totalNetBuy)}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${broker.dominance === 'NET BUYER' ? 'bg-green' : broker.dominance === 'NET SELLER' ? 'bg-red' : 'bg-yellow'}`}>
                        {broker.dominance}
                      </span>
                      <span className="text-xs text-secondary ml-1">({broker.consistencyScore.toFixed(0)}%)</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function KPICard({ title, value, icon, color }: { title: string, value: string | number, icon: React.ReactNode, color: string }) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`p-3 rounded-full bg-tertiary ${color}`} style={{ background: 'var(--bg-tertiary)' }}>
        {icon}
      </div>
      <div>
        <div className="text-xs text-secondary font-semibold mb-1">{title}</div>
        <div className="text-2xl font-bold">{value}</div>
      </div>
    </div>
  );
}
