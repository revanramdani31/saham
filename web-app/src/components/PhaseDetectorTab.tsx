import { useMemo } from 'react';
import type { ProcessedData } from '../engine/types';
import { Layers, AlertTriangle, TrendingUp, Calendar } from 'lucide-react';
import { MIN_CANDLES_GOOD, MIN_CANDLES_OPTIMAL } from '../engine/wyckoffDetector';

interface PhaseDetectorTabProps {
  data: ProcessedData[];
}

const PHASE_COLORS: Record<string, string> = {
  ACCUMULATION: '#2ea043',
  MARKUP: '#3fb950',
  DISTRIBUTION: '#da3633',
  MARKDOWN: '#f85149',
  SIDEWAYS: '#d29922',
};

const PHASE_BG: Record<string, string> = {
  ACCUMULATION: 'rgba(46,160,67,0.15)',
  MARKUP: 'rgba(63,185,80,0.15)',
  DISTRIBUTION: 'rgba(218,54,51,0.15)',
  MARKDOWN: 'rgba(248,81,73,0.15)',
  SIDEWAYS: 'rgba(210,153,34,0.15)',
};

const MTF_COLORS: Record<string, string> = {
  STRONG: '#3FB950',
  ALIGNED: '#58A6FF',
  MIXED: '#D29922',
  CONFLICT: '#F85149',
  INSUFFICIENT: '#8B949E',
};

const EVENT_COLORS: Record<string, string> = {
  SPRING: '#3FB950',
  LPS: '#09B6A2',
  UPTHRUST: '#F85149',
  NONE: '#8B949E',
};

export function PhaseDetectorTab({ data }: PhaseDetectorTabProps) {
  const stockPhases = useMemo(() => {
    const map = new Map<
      string,
      {
        stock: string;
        timeline: {
          date: string;
          phase: string;
          dailyPhase: string;
          weeklyPhase: string;
          monthlyPhase: string;
          score: number;
          confidence: number;
          wyckoff: string;
          action: string;
          vsaSignal: string;
          wyckoffEvent: string;
          eventDetail: string;
          mtfAlignment: string;
          mtfScore: number;
          mtfDetail: string;
          candleCount: number;
          dataQuality: string;
        }[];
      }
    >();

    const sorted = [...data].sort(
      (a, b) => new Date(a.raw.date).getTime() - new Date(b.raw.date).getTime()
    );

    sorted.forEach((row) => {
      if (!map.has(row.raw.stock)) {
        map.set(row.raw.stock, { stock: row.raw.stock, timeline: [] });
      }
      const s = map.get(row.raw.stock)!;
      if (!s.timeline.find((t) => t.date === row.raw.date)) {
        const p = row.phase;
        s.timeline.push({
          date: row.raw.date,
          phase: p.phase,
          dailyPhase: p.dailyPhase ?? p.phase,
          weeklyPhase: p.weeklyPhase ?? '—',
          monthlyPhase: p.monthlyPhase ?? '—',
          score: p.phaseScore,
          confidence: p.confidence,
          wyckoff: p.wyckoffStage,
          action: p.action,
          vsaSignal: p.vsaSignal ?? '—',
          wyckoffEvent: p.wyckoffEvent ?? 'NONE',
          eventDetail: p.eventDetail ?? '',
          mtfAlignment: p.mtfAlignment ?? 'INSUFFICIENT',
          mtfScore: p.mtfScore ?? 0,
          mtfDetail: p.mtfDetail ?? '',
          candleCount: p.candleCount ?? 0,
          dataQuality: p.dataQuality ?? 'INSUFFICIENT',
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.stock.localeCompare(b.stock));
  }, [data]);

  const getActionStyle = (action: string) => {
    if (action.includes('BUY') || action === 'ACCUMULATE') return 'text-green';
    if (action.includes('SELL') || action === 'AVOID' || action.includes('REDUCE')) return 'text-red';
    return 'text-yellow';
  };

  return (
    <div className="main-content">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-gradient">Wyckoff Phase Detector</h1>
          <p className="text-secondary text-sm">
            VSA (Volume Spread Analysis), deteksi Spring / Upthrust / LPS, dan konfirmasi multi-timeframe
            Daily · Weekly · Monthly. Akurasi optimal dengan ≥{MIN_CANDLES_OPTIMAL} candle harian.
          </p>
        </div>
      </div>

      <div
        className="card mb-6"
        style={{
          padding: '14px 18px',
          background: 'rgba(110,64,201,0.06)',
          border: '1px solid rgba(110,64,201,0.25)',
        }}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} color="#6E40C9" style={{ flexShrink: 0, marginTop: 2 }} />
          <div className="text-xs text-secondary" style={{ lineHeight: 1.6 }}>
            <strong style={{ color: '#6E40C9' }}>Data quality:</strong> &lt;{MIN_CANDLES_GOOD} hari = terbatas ·
            {MIN_CANDLES_GOOD}–{MIN_CANDLES_OPTIMAL - 1} = baik · ≥{MIN_CANDLES_OPTIMAL} = optimal.
            Weekly/Monthly dibangun otomatis dari data harian Anda.
          </div>
        </div>
      </div>

      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Layers size={16} className="text-purple" />
          <span className="text-sm font-semibold">Legenda</span>
        </div>
        <div className="flex gap-4 flex-wrap mb-3">
          {Object.entries(PHASE_COLORS).map(([phase, color]) => (
            <div key={phase} className="flex items-center gap-2">
              <div style={{ width: 12, height: 12, borderRadius: 3, background: color }} />
              <span className="text-xs text-secondary">{phase}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-3 flex-wrap text-xs text-secondary">
          <span><strong style={{ color: EVENT_COLORS.SPRING }}>SPRING</strong> = false breakdown</span>
          <span><strong style={{ color: EVENT_COLORS.UPTHRUST }}>UPTHRUST</strong> = false breakout</span>
          <span><strong style={{ color: EVENT_COLORS.LPS }}>LPS</strong> = last point of support</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {stockPhases.map(({ stock, timeline }) => {
          const latest = timeline[timeline.length - 1];
          if (!latest) return null;
          const phaseColor = PHASE_COLORS[latest.phase] || '#888';
          const phaseBg = PHASE_BG[latest.phase] || 'transparent';
          const mtfColor = MTF_COLORS[latest.mtfAlignment] || '#888';
          const eventColor = EVENT_COLORS[latest.wyckoffEvent] || '#888';

          return (
            <div key={stock} className="card">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-bold text-xl">{stock}</span>
                  <span
                    className="badge font-bold"
                    style={{
                      background: phaseBg,
                      color: phaseColor,
                      border: `1px solid ${phaseColor}`,
                      padding: '4px 12px',
                    }}
                  >
                    {latest.phase}
                  </span>
                  {latest.wyckoffEvent !== 'NONE' && (
                    <span
                      className="badge"
                      style={{
                        color: eventColor,
                        border: `1px solid ${eventColor}`,
                        background: `${eventColor}18`,
                        fontSize: '0.7rem',
                      }}
                    >
                      {latest.wyckoffEvent}
                    </span>
                  )}
                  <span className="text-xs text-secondary">{latest.wyckoff}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs text-secondary">Confidence</p>
                    <p className="font-bold" style={{ color: phaseColor }}>
                      {latest.confidence}%
                    </p>
                    <p className="text-xs text-secondary">{latest.dataQuality} · {latest.candleCount}D</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-secondary">MTF</p>
                    <p className="font-bold text-sm" style={{ color: mtfColor }}>
                      {latest.mtfAlignment}
                    </p>
                  </div>
                </div>
              </div>

              <div
                className="grid grid-cols-3 gap-3 mb-4"
                style={{ fontSize: '0.75rem' }}
              >
                <MtfChip label="Daily" phase={latest.dailyPhase} />
                <MtfChip label="Weekly" phase={latest.weeklyPhase} />
                <MtfChip label="Monthly" phase={latest.monthlyPhase} />
              </div>

              {latest.eventDetail && (
                <p
                  className="text-xs mb-3"
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: `${eventColor}12`,
                    border: `1px solid ${eventColor}40`,
                    color: eventColor,
                  }}
                >
                  {latest.eventDetail}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
                <div style={{ padding: '10px', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                  <span className="text-secondary">VSA Signal: </span>
                  <strong>{latest.vsaSignal}</strong>
                </div>
                <div style={{ padding: '10px', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                  <span className="text-secondary">MTF: </span>
                  <strong style={{ color: mtfColor }}>{latest.mtfDetail}</strong>
                </div>
              </div>

              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-secondary flex items-center gap-1">
                  <Calendar size={12} /> Timeline harian
                </span>
                <span className={`text-xs font-semibold ${getActionStyle(latest.action)}`}>
                  {latest.action}
                </span>
              </div>

              <div style={{ overflowX: 'auto', paddingBottom: '8px' }}>
                <div style={{ display: 'flex', gap: '3px', minWidth: `${timeline.length * 36}px` }}>
                  {timeline.map((t, i) => {
                    const col = PHASE_COLORS[t.phase] || '#555';
                    const bg = PHASE_BG[t.phase] || 'rgba(100,100,100,0.1)';
                    return (
                      <div
                        key={i}
                        title={`${t.date}\n${t.phase} (D:${t.dailyPhase} W:${t.weeklyPhase})\nVSA: ${t.vsaSignal}\n${t.wyckoffEvent !== 'NONE' ? t.wyckoffEvent : ''}`}
                        style={{
                          flex: 1,
                          minWidth: '32px',
                          padding: '6px 2px',
                          borderRadius: '4px',
                          background: bg,
                          border: `1px solid ${col}33`,
                          textAlign: 'center',
                          cursor: 'default',
                        }}
                      >
                        <div style={{ fontSize: '8px', color: col, fontWeight: 700 }}>
                          {t.phase.slice(0, 2)}
                        </div>
                        <div style={{ fontSize: '7px', color: 'var(--text-secondary)', marginTop: 2 }}>
                          {t.date.slice(5)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {stockPhases.length === 0 && (
        <div className="card text-center p-8 text-secondary">
          <TrendingUp size={32} style={{ margin: '0 auto 12px' }} />
          <p>Upload data historis untuk analisa Wyckoff multi-timeframe.</p>
        </div>
      )}
    </div>
  );
}

function MtfChip({ label, phase }: { label: string; phase: string }) {
  const color = PHASE_COLORS[phase] || '#8B949E';
  return (
    <div
      style={{
        padding: '8px 10px',
        borderRadius: '8px',
        border: '1px solid var(--border-color)',
        textAlign: 'center',
      }}
    >
      <div className="text-secondary" style={{ fontSize: '0.65rem', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontWeight: 700, color }}>{phase}</div>
    </div>
  );
}
