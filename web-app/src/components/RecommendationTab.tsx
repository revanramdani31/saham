import { useMemo, useState } from 'react';
import type { ProcessedData } from '../engine/types';
import {
  TrendingUp, TrendingDown, Target, AlertTriangle,
  CheckCircle, XCircle, Minus, Zap,
  BarChart2, Activity, BookOpen, HelpCircle
} from 'lucide-react';
import { formatCompact, formatPrice } from '../utils/format';
import { buildRecommendations, type StockRecommendation } from '../engine/recommendations';

interface RecommendationTabProps {
  data: ProcessedData[];
}

const VERDICT_CONFIG = {
  'STRONG BUY': { color: '#3FB950', bg: 'rgba(46,160,67,0.15)', border: 'rgba(46,160,67,0.4)', icon: CheckCircle, label: 'STRONG BUY', emoji: '🚀' },
  'BUY':        { color: '#58A6FF', bg: 'rgba(56,139,253,0.12)', border: 'rgba(56,139,253,0.35)', icon: TrendingUp, label: 'BUY', emoji: '✅' },
  'WATCH':      { color: '#D29922', bg: 'rgba(210,153,34,0.12)', border: 'rgba(210,153,34,0.35)', icon: Activity, label: 'WATCH', emoji: '👀' },
  'AVOID':      { color: '#F85149', bg: 'rgba(218,54,51,0.12)', border: 'rgba(218,54,51,0.3)', icon: XCircle, label: 'AVOID', emoji: '🚫' },
  'SELL':       { color: '#F85149', bg: 'rgba(218,54,51,0.15)', border: 'rgba(218,54,51,0.4)', icon: TrendingDown, label: 'SELL / EXIT', emoji: '🔴' },
};

function ScoreBar({ label, value, max, color, isBiDirectional, tooltip }: { label: string; value: number; max: number; color: string; isBiDirectional?: boolean; tooltip?: string }) {
  const signedMax = Math.max(max, 1);
  const displayVal = Number.isInteger(value) ? value : value.toFixed(1);
  const barColor = value < 0 ? '#F85149' : value === 0 ? '#8B949E' : color;
  
  let left = '0%';
  let width = '0%';

  if (isBiDirectional) {
    const pct = (Math.abs(value) / signedMax) * 50;
    width = `${pct}%`;
    left = value < 0 ? `${50 - pct}%` : '50%';
  } else {
    width = `${Math.max(0, Math.min(100, (value / signedMax) * 100))}%`;
  }

  // Force minimum visibility for 0 if it's not bi-directional
  if (value === 0 && !isBiDirectional) {
    width = '4%';
  }

  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          {label}
          {tooltip && (
            <span title={tooltip} style={{ cursor: 'help', display: 'flex' }}>
              <HelpCircle size={12} />
            </span>
          )}
        </span>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: barColor }}>
          {value > 0 && isBiDirectional ? '+' : ''}{displayVal} / {isBiDirectional ? `±${max}` : max}
        </span>
      </div>
      <div style={{ height: '5px', borderRadius: '4px', background: 'var(--border-color)', position: 'relative', overflow: 'hidden' }}>
        {isBiDirectional && (
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', background: 'var(--text-secondary)', zIndex: 1, opacity: 0.5 }} />
        )}
        <div style={{ 
          position: 'absolute', 
          height: '100%', 
          left, 
          width, 
          background: barColor, 
          borderRadius: '4px', 
          transition: 'all 0.6s ease' 
        }} />
      </div>
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: StockRecommendation['verdict'] }) {
  const cfg = VERDICT_CONFIG[verdict];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '5px 12px', borderRadius: '999px', fontSize: '0.72rem',
      fontWeight: 700, letterSpacing: '0.06em',
      color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`
    }}>
      {cfg.emoji} {cfg.label}
    </span>
  );
}

function TradingPlanCard({ rec }: { rec: StockRecommendation }) {
  const cfg = VERDICT_CONFIG[rec.verdict];
  const canTrade = rec.verdict === 'STRONG BUY' || rec.verdict === 'BUY';
  const [capital, setCapital] = useState<number>(10000000); // 10 jt default

  return (
    <div style={{
      background: 'rgba(13,17,23,0.6)', border: `1px solid ${cfg.border}`,
      borderRadius: '14px', padding: '20px', position: 'relative', overflow: 'hidden'
    }}>
      {/* Glow accent top */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
        background: `linear-gradient(90deg, transparent, ${cfg.color}, transparent)`
      }} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '1.3rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif' }}>{rec.stock}</span>
            <VerdictBadge verdict={rec.verdict} />
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Update: {rec.latestDate} &nbsp;|&nbsp; Close: <strong style={{ color: 'var(--text-primary)' }}>Rp {formatPrice(rec.latestClose)}</strong>
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: cfg.color, lineHeight: 1 }}>{rec.verdictScore}</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Verdict Score</div>
        </div>
      </div>

      {/* Score breakdown bars */}
      <div style={{ marginBottom: '14px', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.08em', marginBottom: '10px', textTransform: 'uppercase' }}>
          📊 Ringkasan Analisa
        </div>
        <ScoreBar label="Broker Flow" value={rec.scoreBreakdown.brokerFlow} max={30} color="#388BFD" isBiDirectional tooltip="Kekuatan akumulasi bandar (+30) vs distribusi (-30)" />
        <ScoreBar label="Volume Analisis" value={rec.scoreBreakdown.volume} max={15} color="#09B6A2" tooltip="Validitas pergerakan didukung volume. Skala 0-15." />
        <ScoreBar label="Phase Detector (Wyckoff)" value={rec.scoreBreakdown.phase} max={15} color="#6E40C9" isBiDirectional tooltip="Fase saham. Markup (+15), Accumulation (+10), Markdown (-15)" />
        <ScoreBar label="Broker Behavior" value={rec.scoreBreakdown.behavior} max={10} color="#D29922" isBiDirectional tooltip="Perilaku agresif bandar. 0 = Netral, +10 = Akumulasi agresif, -10 = Jualan agresif" />
        <ScoreBar label="Price Action" value={rec.scoreBreakdown.price} max={10} color="#3FB950" tooltip="Kekuatan bentuk candlestick terakhir. Skala 0-10." />
      </div>

      {/* Metrics row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '14px' }}>
        <MetricChip label="Phase" value={rec.phase} color={
          rec.phase === 'MARKUP' || rec.phase === 'ACCUMULATION' ? '#3FB950' :
          rec.phase === 'SIDEWAYS' ? '#D29922' : '#F85149'
        } />
        <MetricChip label="Wyckoff" value={rec.wyckoffStage.split(' - ')[1] || rec.wyckoffStage} color="#6E40C9" />
        <MetricChip label="Behavior" value={rec.behaviorLabel || 'NETRAL'} color={
          /AKUMULASI|ABSORPSI|Absorpsi|Markup|BOW|BULLISH|POSITIF/i.test(rec.behaviorLabel) ? '#3FB950' :
          /DISTRIBUSI|Distribusi|Markdown|SOS|BEARISH|NEGATIF/i.test(rec.behaviorLabel) ? '#F85149' : '#D29922'
        } />
        <MetricChip label="Broker Flow" value={rec.brokerFlowSignal} color={
          rec.brokerFlowSignal === 'AKUMULASI' ? '#3FB950' :
          rec.brokerFlowSignal === 'DISTRIBUSI' ? '#F85149' : '#8B949E'
        } />
        <MetricChip label="Status Bandar" value={rec.estimateStatus} color={
          rec.estimateStatus.includes('ACCUMULATION') ? '#3FB950' :
          rec.estimateStatus.includes('DISTRIBUTION') ? '#F85149' : '#D29922'
        } />
        <MetricChip label="Vol Ratio" value={`${rec.avgVolRatio.toFixed(2)}x`} color={
          rec.avgVolRatio > 1.5 ? '#3FB950' : rec.avgVolRatio > 1 ? '#D29922' : '#8B949E'
        } />
        <MetricChip label="Top Broker Conc." value={`${(rec.topBrokerConcentration * 100).toFixed(0)}%`} color={
          rec.topBrokerConcentration > 0.5 ? '#388BFD' : rec.topBrokerConcentration > 0.3 ? '#D29922' : '#8B949E'
        } />
      </div>

      {/* Trading Plan */}
      {canTrade ? (
        <div style={{ background: 'rgba(46,160,67,0.06)', border: '1px solid rgba(46,160,67,0.2)', borderRadius: '10px', padding: '14px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#3FB950', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              💡 Trading Plan & Simulasi
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Modal:</span>
              <input
                type="number"
                value={capital}
                onChange={(e) => setCapital(Number(e.target.value) || 0)}
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  fontSize: '0.7rem',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  width: '90px'
                }}
              />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <PlanItem icon="🎯" label="Buy Zone" value={`Rp ${formatPrice(rec.entryLow)} – ${formatPrice(rec.entryHigh)}`} color="#58A6FF" />
            <PlanItem icon="🛡️" label="Stop Loss" value={`Rp ${formatPrice(rec.stopLoss)}`} sub={`-${rec.riskPercent.toFixed(1)}% (Rp ${formatPrice(capital * (rec.riskPercent / 100))})`} color="#F85149" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            <TpItem label="TP 1" price={rec.tp1} rr={rec.tp1RR} entryMid={(rec.entryLow + rec.entryHigh) / 2} color="#3FB950" capital={capital} />
            <TpItem label="TP 2" price={rec.tp2} rr={rec.tp2RR} entryMid={(rec.entryLow + rec.entryHigh) / 2} color="#09B6A2" capital={capital} />
            <TpItem label="TP 3" price={rec.tp3} rr={rec.tp3RR} entryMid={(rec.entryLow + rec.entryHigh) / 2} color="#D29922" capital={capital} />
          </div>
          <div style={{ marginTop: '10px', fontSize: '0.7rem', color: 'var(--text-secondary)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px' }}>
            📌 Hari absorpsi: <strong style={{ color: '#3FB950' }}>{rec.absorptionDays}</strong> &nbsp;|&nbsp;
            Hari distribusi: <strong style={{ color: '#F85149' }}>{rec.distributionDays}</strong> &nbsp;|&nbsp;
            Net Buy Kumulatif: <strong style={{ color: rec.cumulativeNetBuy > 0 ? '#3FB950' : '#F85149' }}>
              {rec.cumulativeNetBuy > 0 ? '+' : ''}{formatCompact(rec.cumulativeNetBuy)}
            </strong>
          </div>
        </div>
      ) : (
        <div style={{ background: 'rgba(218,54,51,0.06)', border: '1px solid rgba(218,54,51,0.2)', borderRadius: '10px', padding: '14px', marginBottom: '12px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#F85149', letterSpacing: '0.08em', marginBottom: '8px', textTransform: 'uppercase' }}>
            ⛔ Tidak Disarankan Beli Saat Ini
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {rec.verdict === 'WATCH'
              ? 'Saham ini masih dalam fase konsolidasi. Tunggu konfirmasi sinyal beli yang lebih kuat sebelum masuk posisi.'
              : 'Kondisi teknikal dan bandarmologi menunjukkan tekanan jual / distribusi. Hindari posisi beli.'}
          </p>
        </div>
      )}

      {/* Warnings */}
      {rec.warnings.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {rec.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: '0.72rem', color: '#D29922', background: 'rgba(210,153,34,0.08)', padding: '5px 10px', borderRadius: '6px', border: '1px solid rgba(210,153,34,0.2)' }}>
              {w}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ padding: '7px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
      <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function PlanItem({ icon, label, value, sub, color }: { icon: string; label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: `1px solid ${color}30` }}>
      <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '3px', textTransform: 'uppercase' }}>{icon} {label}</div>
      <div style={{ fontWeight: 700, color, fontSize: '0.9rem' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{sub}</div>}
    </div>
  );
}

function TpItem({ label, price, rr, entryMid, color, capital }: { label: string; price: number; rr: number; entryMid: number; color: string; capital: number }) {
  const profitPct = entryMid > 0 ? ((price - entryMid) / entryMid) * 100 : 0;
  const profitAmt = capital * (profitPct / 100);
  return (
    <div style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: `1px solid ${color}40`, textAlign: 'center' }}>
      <div style={{ fontSize: '0.65rem', color, fontWeight: 700, marginBottom: '3px', textTransform: 'uppercase' }}>{label} ({rr}R)</div>
      <div style={{ fontWeight: 700, color, fontSize: '0.85rem' }}>Rp {formatPrice(price)}</div>
      <div style={{ fontSize: '0.65rem', color: '#3FB950', marginTop: '2px' }}>
        +{profitPct.toFixed(1)}% <br /> <span style={{ opacity: 0.8, fontWeight: 600 }}>Rp {formatCompact(profitAmt)}</span>
      </div>
    </div>
  );
}

export function RecommendationTab({ data }: RecommendationTabProps) {
  const recommendations = useMemo(() => buildRecommendations(data), [data]);
  const [filter, setFilter] = useState<'ALL' | 'STRONG BUY' | 'BUY' | 'WATCH' | 'AVOID'>('ALL');
  const [expandedStock, setExpandedStock] = useState<string | null>(null);

  const filtered = filter === 'ALL' ? recommendations : recommendations.filter(r => r.verdict === filter || (filter === 'AVOID' && (r.verdict === 'AVOID' || r.verdict === 'SELL')));

  const strongBuy = recommendations.filter(r => r.verdict === 'STRONG BUY').length;
  const buy = recommendations.filter(r => r.verdict === 'BUY').length;
  const watch = recommendations.filter(r => r.verdict === 'WATCH').length;
  const avoid = recommendations.filter(r => r.verdict === 'AVOID' || r.verdict === 'SELL').length;

  const filterBtns: { key: 'ALL' | 'STRONG BUY' | 'BUY' | 'WATCH' | 'AVOID'; label: string; count: number; color: string }[] = [
    { key: 'ALL', label: 'Semua', count: recommendations.length, color: '#388BFD' },
    { key: 'STRONG BUY', label: '🚀 Strong Buy', count: strongBuy, color: '#3FB950' },
    { key: 'BUY', label: '✅ Buy', count: buy, color: '#58A6FF' },
    { key: 'WATCH', label: '👀 Watch', count: watch, color: '#D29922' },
    { key: 'AVOID', label: '🚫 Avoid / Sell', count: avoid, color: '#F85149' },
  ];

  return (
    <div className="main-content">
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '10px',
            background: 'linear-gradient(135deg, #1F6FEB, #09B6A2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <BookOpen size={20} color="white" />
          </div>
          <h1 className="text-gradient" style={{ margin: 0 }}>Rekomendasi Planning</h1>
        </div>
        <p className="text-secondary text-sm">
          Kesimpulan komprehensif dari seluruh analisa — Broker Flow, Volume, Wyckoff Phase, Behavior, Price Action — untuk menentukan kelayakan beli saham beserta trading plan lengkap.
        </p>
      </div>

      {/* Summary KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Strong Buy', count: strongBuy, color: '#3FB950', icon: <CheckCircle size={20} />, bg: 'rgba(46,160,67,0.1)' },
          { label: 'Buy', count: buy, color: '#58A6FF', icon: <TrendingUp size={20} />, bg: 'rgba(56,139,253,0.1)' },
          { label: 'Watch', count: watch, color: '#D29922', icon: <Activity size={20} />, bg: 'rgba(210,153,34,0.1)' },
          { label: 'Avoid / Sell', count: avoid, color: '#F85149', icon: <XCircle size={20} />, bg: 'rgba(218,54,51,0.1)' },
        ].map(item => (
          <div key={item.label} className="card" style={{ textAlign: 'center', padding: '20px 16px' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '50%',
              background: item.bg, display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: item.color, margin: '0 auto 10px'
            }}>
              {item.icon}
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: item.color, lineHeight: 1 }}>{item.count}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</div>
          </div>
        ))}
      </div>

      {/* Legend / Methodology note */}
      <div style={{
        background: 'rgba(56,139,253,0.06)', border: '1px solid rgba(56,139,253,0.2)',
        borderRadius: '10px', padding: '14px 18px', marginBottom: '24px',
        display: 'flex', alignItems: 'flex-start', gap: '12px'
      }}>
        <Zap size={18} color="#388BFD" style={{ marginTop: '1px', flexShrink: 0 }} />
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <strong style={{ color: '#388BFD' }}>Metodologi Verdict Score (0–100): </strong>
          Base 20 + Broker Flow (−30 s/d +30) + Volume (0–15) + Wyckoff Phase (−15 s/d +15) + Behavior (−10 s/d +10) + Price (0–10).
          &nbsp;<strong>Strong Buy ≥65</strong>, <strong>Buy ≥50</strong>, <strong>Watch ≥35</strong>, sisanya <strong>Avoid/Sell</strong>.
          Trading plan menggunakan ATR-proxy dari 5 candle terakhir untuk menghitung Buy Zone, Stop Loss, dan 3 level Target Profit (1.5R / 3R / 5R).
        </div>
      </div>

      {/* Filter buttons */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {filterBtns.map(btn => (
          <button
            key={btn.key}
            onClick={() => setFilter(btn.key)}
            style={{
              padding: '8px 16px', borderRadius: '999px', border: '1px solid',
              borderColor: filter === btn.key ? btn.color : 'var(--border-color)',
              background: filter === btn.key ? `${btn.color}20` : 'transparent',
              color: filter === btn.key ? btn.color : 'var(--text-secondary)',
              fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.2s', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            {btn.label}
            <span style={{
              background: filter === btn.key ? btn.color : 'var(--bg-tertiary)',
              color: filter === btn.key ? '#0D1117' : 'var(--text-secondary)',
              borderRadius: '999px', fontSize: '0.7rem', padding: '1px 7px', fontWeight: 700
            }}>
              {btn.count}
            </span>
          </button>
        ))}
      </div>

      {/* Summary Table */}
      <div className="card" style={{ marginBottom: '24px', padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BarChart2 size={18} color="#388BFD" />
          <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontSize: '1rem' }}>Tabel Ringkasan</h3>
        </div>
        <div className="table-container" style={{ border: 'none', maxHeight: '350px', overflowY: 'auto' }}>
          <table>
            <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
              <tr>
                <th>Saham</th>
                <th>Close</th>
                <th>Verdict</th>
                <th>Score</th>
                <th>Phase</th>
                <th>Behavior</th>
                <th>Net Buy Kum.</th>
                <th>Buy Zone</th>
                <th>Stop Loss</th>
                <th>TP1</th>
                <th>TP2</th>
                <th>Risk%</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(rec => {
                const cfg = VERDICT_CONFIG[rec.verdict];
                return (
                  <tr
                    key={rec.stock}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setExpandedStock(expandedStock === rec.stock ? null : rec.stock)}
                  >
                    <td style={{ fontWeight: 700, fontSize: '1rem', color: cfg.color }}>{rec.stock}</td>
                    <td>Rp {formatPrice(rec.latestClose)}</td>
                    <td><VerdictBadge verdict={rec.verdict} /></td>
                    <td>
                      <span style={{ fontWeight: 700, fontSize: '1.1rem', color: rec.verdictScore >= 65 ? '#3FB950' : rec.verdictScore >= 40 ? '#D29922' : '#F85149' }}>
                        {rec.verdictScore.toFixed(1)}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: rec.phase === 'MARKUP' || rec.phase === 'ACCUMULATION' ? '#3FB950' : rec.phase === 'SIDEWAYS' ? '#D29922' : '#F85149' }}>
                        {rec.phase}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.75rem', color: /AKUMULASI|ABSORPSI|Absorpsi|BULLISH|POSITIF/i.test(rec.behaviorLabel) ? '#3FB950' : /DISTRIBUSI|Distribusi|BEARISH|NEGATIF/i.test(rec.behaviorLabel) ? '#F85149' : '#8B949E' }}>
                      {rec.behaviorLabel || 'NETRAL'}
                    </td>
                    <td style={{ fontWeight: 600, color: rec.cumulativeNetBuy > 0 ? '#3FB950' : '#F85149', fontSize: '0.8rem' }}>
                      {rec.cumulativeNetBuy > 0 ? '+' : ''}{formatCompact(rec.cumulativeNetBuy)}
                    </td>
                    <td style={{ fontSize: '0.78rem', color: '#58A6FF' }}>
                      {(rec.verdict === 'STRONG BUY' || rec.verdict === 'BUY')
                        ? `${formatPrice(rec.entryLow)}–${formatPrice(rec.entryHigh)}`
                        : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: '0.78rem', color: '#F85149' }}>
                      {(rec.verdict === 'STRONG BUY' || rec.verdict === 'BUY')
                        ? formatPrice(rec.stopLoss)
                        : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: '0.78rem', color: '#3FB950' }}>
                      {(rec.verdict === 'STRONG BUY' || rec.verdict === 'BUY')
                        ? formatPrice(rec.tp1)
                        : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: '0.78rem', color: '#09B6A2' }}>
                      {(rec.verdict === 'STRONG BUY' || rec.verdict === 'BUY')
                        ? formatPrice(rec.tp2)
                        : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: '0.78rem', color: rec.riskPercent > 5 ? '#F85149' : '#D29922' }}>
                      {(rec.verdict === 'STRONG BUY' || rec.verdict === 'BUY')
                        ? `${rec.riskPercent.toFixed(1)}%`
                        : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Cards */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <Target size={18} color="#388BFD" />
        <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontSize: '1rem' }}>Detail Kartu Rekomendasi</h3>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '4px' }}>
          (klik baris tabel untuk highlight, atau scroll ke bawah)
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: '16px' }}>
        {filtered.map(rec => (
          <TradingPlanCard key={rec.stock} rec={rec} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
          <Minus size={40} style={{ margin: '0 auto 12px' }} />
          <p>Tidak ada saham dengan filter ini.</p>
        </div>
      )}

      {/* Disclaimer */}
      <div style={{
        marginTop: '28px', padding: '14px 18px',
        background: 'rgba(210,153,34,0.06)', border: '1px solid rgba(210,153,34,0.2)',
        borderRadius: '10px', display: 'flex', gap: '10px', alignItems: 'flex-start'
      }}>
        <AlertTriangle size={16} color="#D29922" style={{ flexShrink: 0, marginTop: '1px' }} />
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <strong style={{ color: '#D29922' }}>Disclaimer:</strong> Rekomendasi ini dihasilkan secara otomatis berdasarkan analisa bandarmologi dan teknikal dari data broker yang diupload.
          Ini bukan saran investasi. Selalu lakukan riset mandiri (DYOR) dan gunakan manajemen risiko yang tepat sebelum membeli saham.
          Trading mengandung risiko. Hasil masa lalu tidak menjamin hasil di masa depan.
        </p>
      </div>
    </div>
  );
}
