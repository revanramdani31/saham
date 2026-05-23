import { useMemo } from 'react';
import type { ProcessedData } from '../engine/types';
import { Layers } from 'lucide-react';

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

export function PhaseDetectorTab({ data }: PhaseDetectorTabProps) {
  // Aggregate latest phase per stock, and show phase history timeline
  const stockPhases = useMemo(() => {
    const map = new Map<string, { stock: string; timeline: { date: string; phase: string; score: number; confidence: number; wyckoff: string; action: string }[] }>();

    const sorted = [...data].sort((a, b) => new Date(a.raw.date).getTime() - new Date(b.raw.date).getTime());

    sorted.forEach(row => {
      if (!map.has(row.raw.stock)) {
        map.set(row.raw.stock, { stock: row.raw.stock, timeline: [] });
      }

      const s = map.get(row.raw.stock)!;
      // Add only if date not already present (deduplicate per day)
      const existing = s.timeline.find(t => t.date === row.raw.date);
      if (!existing) {
        s.timeline.push({
          date: row.raw.date,
          phase: row.phase.phase,
          score: row.phase.phaseScore,
          confidence: row.phase.confidence,
          wyckoff: row.phase.wyckoffStage,
          action: row.phase.action,
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
            Visualisasi fase pasar setiap saham berdasarkan metode Wyckoff: Accumulation → Markup → Distribution → Markdown.
          </p>
        </div>
      </div>

      {/* Legend */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Layers size={16} className="text-purple" />
          <span className="text-sm font-semibold">Legenda Fase Wyckoff</span>
        </div>
        <div className="flex gap-4 flex-wrap">
          {Object.entries(PHASE_COLORS).map(([phase, color]) => (
            <div key={phase} className="flex items-center gap-2">
              <div style={{ width: 12, height: 12, borderRadius: 3, background: color }} />
              <span className="text-xs text-secondary">{phase}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Per-stock phase cards */}
      <div className="grid grid-cols-1 gap-6">
        {stockPhases.map(({ stock, timeline }) => {
          const latest = timeline[timeline.length - 1];
          if (!latest) return null;
          const phaseColor = PHASE_COLORS[latest.phase] || '#888';
          const phaseBg = PHASE_BG[latest.phase] || 'transparent';

          return (
            <div key={stock} className="card">
              {/* Stock header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-xl">{stock}</span>
                  <span
                    className="badge font-bold"
                    style={{ background: phaseBg, color: phaseColor, border: `1px solid ${phaseColor}`, padding: '4px 12px' }}
                  >
                    {latest.phase}
                  </span>
                  <span className="text-xs text-secondary">{latest.wyckoff}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs text-secondary">Confidence</p>
                    <p className="font-bold" style={{ color: phaseColor }}>{latest.confidence}%</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-secondary">Rekomendasi</p>
                    <p className={`font-bold text-sm ${getActionStyle(latest.action)}`}>{latest.action}</p>
                  </div>
                </div>
              </div>

              {/* Phase timeline bar (visual horizontal) */}
              <div style={{ overflowX: 'auto', paddingBottom: '8px' }}>
                <div style={{ display: 'flex', gap: '3px', minWidth: `${timeline.length * 36}px` }}>
                  {timeline.map((t, i) => {
                    const col = PHASE_COLORS[t.phase] || '#555';
                    const bg = PHASE_BG[t.phase] || 'rgba(100,100,100,0.1)';
                    return (
                      <div
                        key={i}
                        title={`${t.date}\n${t.phase} (Score: ${t.score})`}
                        style={{
                          flex: 1,
                          minWidth: '32px',
                          padding: '6px 2px',
                          borderRadius: '4px',
                          background: bg,
                          border: `1px solid ${col}33`,
                          textAlign: 'center',
                          cursor: 'default',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.transform = 'scaleY(1.1)')}
                        onMouseLeave={e => (e.currentTarget.style.transform = 'scaleY(1)')}
                      >
                        <div style={{ fontSize: '8px', color: col, fontWeight: 700, letterSpacing: 0 }}>
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
    </div>
  );
}
