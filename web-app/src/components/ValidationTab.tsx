import { useMemo, useState, useEffect, useCallback } from 'react';
import type { ProcessedData } from '../engine/types';
import {
  runRecommendationValidation,
  computeValidationStats,
  DEFAULT_VALIDATION_OPTIONS,
  type ValidationRecord,
  type ValidationOutcome,
  type ValidationOptions,
} from '../engine/validationEngine';
import {
  loadManualValidations,
  saveManualValidation,
  clearManualValidation,
  type ManualValidationEntry,
} from '../utils/validationStorage';
import {
  ClipboardCheck, CheckCircle, XCircle, Clock, HelpCircle,
  TrendingUp, Filter, Trash2, Sparkles
} from 'lucide-react';
import { calibrateWeightsFromValidation } from '../engine/adaptiveScoring';
import { saveScoringWeights } from '../utils/adaptiveWeightsStorage';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { formatPrice } from '../utils/format';

interface ValidationTabProps {
  data: ProcessedData[];
}

type OutcomeFilter = 'ALL' | 'BENAR' | 'SALAH' | 'NETRAL' | 'MENUNGGU';

const OUTCOME_STYLE: Record<
  ValidationOutcome,
  { color: string; bg: string; label: string }
> = {
  BENAR: { color: '#3FB950', bg: 'rgba(46,160,67,0.15)', label: 'Benar' },
  SALAH: { color: '#F85149', bg: 'rgba(218,54,51,0.15)', label: 'Salah' },
  NETRAL: { color: '#D29922', bg: 'rgba(210,153,34,0.12)', label: 'Netral' },
  MENUNGGU: { color: '#8B949E', bg: 'rgba(139,148,158,0.12)', label: 'Menunggu' },
};

function OutcomeBadge({ outcome }: { outcome: ValidationOutcome }) {
  const s = OUTCOME_STYLE[outcome];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: '999px',
        fontSize: '0.72rem',
        fontWeight: 700,
        color: s.color,
        background: s.bg,
        border: `1px solid ${s.color}40`,
      }}
    >
      {s.label}
    </span>
  );
}

export function ValidationTab({ data }: ValidationTabProps) {
  const [options, setOptions] = useState<ValidationOptions>(DEFAULT_VALIDATION_OPTIONS);
  const [manualMap, setManualMap] = useState<Record<string, ManualValidationEntry>>({});
  const [filter, setFilter] = useState<OutcomeFilter>('ALL');
  const [verdictFilter, setVerdictFilter] = useState<string>('ALL');
  const [calibrateMsg, setCalibrateMsg] = useState<string>('');

  const handleCalibrateWeights = async () => {
    const weights = calibrateWeightsFromValidation(records, getFinalOutcome);
    await saveScoringWeights(weights);
    if (weights.sampleSize < 20) {
      setCalibrateMsg(
        `Bobot default dipakai — butuh ≥20 sampel Benar/Salah (saat ini: ${weights.sampleSize}).`
      );
    } else {
      setCalibrateMsg(
        `Bobot dikalibrasi dari ${weights.sampleSize} sampel. Buka tab Rekomendasi untuk melihat skor terbaru.`
      );
    }
  };

  useEffect(() => {
    loadManualValidations().then(setManualMap);
  }, []);

  const getFinalOutcome = useCallback(
    (r: ValidationRecord): ValidationOutcome => {
      const manual = manualMap[r.id];
      if (manual?.manualOutcome && manual.manualOutcome !== 'MENUNGGU') {
        return manual.manualOutcome;
      }
      return r.autoOutcome;
    },
    [manualMap]
  );

  const records = useMemo(
    () => runRecommendationValidation(data, options),
    [data, options]
  );

  const stats = useMemo(
    () => computeValidationStats(records, getFinalOutcome),
    [records, getFinalOutcome]
  );

  const filtered = useMemo(() => {
    return records.filter((r) => {
      const outcome = getFinalOutcome(r);
      if (filter !== 'ALL' && outcome !== filter) return false;
      if (verdictFilter !== 'ALL' && r.verdict !== verdictFilter) return false;
      return true;
    });
  }, [records, filter, verdictFilter, getFinalOutcome]);

  const handleManualChange = async (
    id: string,
    manualOutcome: ValidationOutcome,
    note?: string
  ) => {
    if (manualOutcome === 'MENUNGGU') {
      const next = await clearManualValidation(id);
      setManualMap(next);
      return;
    }
    const entry: ManualValidationEntry = {
      manualOutcome,
      note,
      updatedAt: new Date().toISOString(),
    };
    const next = await saveManualValidation(id, entry);
    setManualMap(next);
  };

  const verdicts = useMemo(
    () => [...new Set(records.map((r) => r.verdict))].sort(),
    [records]
  );

  return (
    <div className="main-content">
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #6E40C9, #388BFD)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ClipboardCheck size={20} color="white" />
          </div>
          <h1 className="text-gradient" style={{ margin: 0 }}>
            Validasi Rekomendasi
          </h1>
        </div>
        <p className="text-secondary text-sm">
          Uji apakah rekomendasi benar dengan membandingkan sinyal di tanggal T vs harga N sesi
          trading kemudian. Sistem walk-forward hanya memakai data yang sudah ada saat tanggal sinyal.
        </p>
      </div>

      {/* Settings */}
      <div className="card mb-6" style={{ padding: '16px 20px' }}>
        <h3 className="font-semibold mb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
          PENGATURAN BACKTEST
        </h3>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="text-xs text-secondary block mb-1">Sesi ke depan</label>
            <select
              className="input-field"
              value={options.forwardSessions}
              onChange={(e) =>
                setOptions((o) => ({
                  ...o,
                  forwardSessions: Number(e.target.value),
                }))
              }
            >
              {[3, 5, 10, 20].map((n) => (
                <option key={n} value={n}>
                  {n} sesi trading
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-secondary block mb-1">Threshold sukses (%)</label>
            <input
              type="number"
              className="input-field"
              step="0.5"
              value={options.successThresholdPct}
              onChange={(e) =>
                setOptions((o) => ({
                  ...o,
                  successThresholdPct: Number(e.target.value),
                }))
              }
            />
          </div>
          <div>
            <label className="text-xs text-secondary block mb-1">Threshold gagal (%)</label>
            <input
              type="number"
              className="input-field"
              step="0.5"
              value={options.failThresholdPct}
              onChange={(e) =>
                setOptions((o) => ({
                  ...o,
                  failThresholdPct: Number(e.target.value),
                }))
              }
            />
          </div>
          <div>
            <label className="text-xs text-secondary block mb-1">Mode TP/SL</label>
            <select
              className="input-field"
              value={options.tpSlValidationMode}
              onChange={(e) =>
                setOptions((o) => ({
                  ...o,
                  tpSlValidationMode: e.target.value as ValidationOptions['tpSlValidationMode'],
                }))
              }
            >
              <option value="FIRST_TOUCH_CONSERVATIVE">First-touch konservatif (disarankan)</option>
              <option value="WINDOW_ANY_TOUCH">Window any-touch (legacy)</option>
            </select>
          </div>
        </div>
        <p className="text-xs text-secondary mt-3">
          <strong>Beli (STRONG BUY / BUY):</strong> benar jika return ≥ threshold sukses; salah jika
          ≤ threshold gagal. <strong>Jual (SELL / AVOID):</strong> kebalikannya.{' '}
          <strong>WATCH</strong> biasanya netral.
        </p>
        <p className="text-xs text-secondary mt-2">
          <strong>Mode TP/SL konservatif:</strong> evaluasi berdasarkan urutan first-touch. Jika TP dan SL
          tersentuh di candle yang sama, sistem menganggap <strong>SL tercapai lebih dulu</strong>.
        </p>
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          <button
            type="button"
            className="btn btn-primary flex items-center gap-2"
            style={{ fontSize: '0.8rem' }}
            onClick={handleCalibrateWeights}
          >
            <Sparkles size={16} /> Kalibrasi bobot skor dari validasi
          </button>
          {calibrateMsg && (
            <span className="text-xs text-secondary">{calibrateMsg}</span>
          )}
        </div>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '24px' }}>
        <StatCard
          label="Akurasi (Benar/Salah)"
          value={`${stats.accuracyPct.toFixed(1)}%`}
          sub={`${stats.benar} benar / ${stats.salah} salah`}
          color="#6E40C9"
          icon={<TrendingUp size={18} />}
        />
        <StatCard
          label="Benar"
          value={stats.benar}
          color="#3FB950"
          icon={<CheckCircle size={18} />}
        />
        <StatCard
          label="Salah"
          value={stats.salah}
          color="#F85149"
          icon={<XCircle size={18} />}
        />
        <StatCard
          label="Netral"
          value={stats.netral}
          color="#D29922"
          icon={<HelpCircle size={18} />}
        />
        <StatCard
          label="Menunggu data"
          value={stats.pending}
          color="#8B949E"
          icon={<Clock size={18} />}
        />
      </div>

      {/* Per-verdict breakdown Chart */}
      {Object.keys(stats.byVerdict).length > 0 && (
        <div className="card mb-6" style={{ padding: '20px' }}>
          <h3 className="font-semibold mb-6 text-sm flex items-center gap-2">
            <TrendingUp className="text-purple" size={18} />
            Akurasi Per Jenis Rekomendasi
          </h3>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <BarChart
                data={Object.entries(stats.byVerdict).map(([v, s]) => ({
                  name: v,
                  Benar: s.benar,
                  Salah: s.salah,
                  Netral: s.total - s.benar - s.salah
                }))}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#2D3139" vertical={false} />
                <XAxis dataKey="name" stroke="#8B949E" fontSize={12} />
                <YAxis stroke="#8B949E" fontSize={12} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#161B22', borderColor: '#30363D', borderRadius: '8px' }}
                  itemStyle={{ color: '#E6EDF3' }}
                />
                <Legend />
                <Bar dataKey="Benar" stackId="a" fill="#3FB950" />
                <Bar dataKey="Salah" stackId="a" fill="#F85149" />
                <Bar dataKey="Netral" stackId="a" fill="#D29922" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <Filter size={16} className="text-secondary" />
        {(['ALL', 'BENAR', 'SALAH', 'NETRAL', 'MENUNGGU'] as OutcomeFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="btn btn-secondary"
            style={{
              padding: '6px 12px',
              fontSize: '0.75rem',
              background: filter === f ? 'rgba(110,64,201,0.2)' : undefined,
              borderColor: filter === f ? '#6E40C9' : undefined,
            }}
          >
            {f === 'ALL' ? 'Semua' : OUTCOME_STYLE[f as ValidationOutcome].label}
          </button>
        ))}
        <select
          className="input-field"
          style={{ width: 'auto', minWidth: '140px' }}
          value={verdictFilter}
          onChange={(e) => setVerdictFilter(e.target.value)}
        >
          <option value="ALL">Semua verdict</option>
          {verdicts.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container" style={{ border: 'none', maxHeight: '520px' }}>
          <table>
            <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
              <tr>
                <th>Saham</th>
                <th>Tgl Sinyal</th>
                <th>Verdict</th>
                <th>Skor</th>
                <th>Harga Entry</th>
                <th>Tgl Cek</th>
                <th>Harga +{options.forwardSessions}s</th>
                <th>Return %</th>
                <th>TP1 / SL</th>
                <th>Otomatis</th>
                <th>Hasil Akhir</th>
                <th>Penilaian Anda</th>
                <th>Catatan</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const finalOutcome = getFinalOutcome(r);
                const manual = manualMap[r.id];
                return (
                  <tr key={r.id}>
                    <td className="font-bold">{r.stock}</td>
                    <td className="text-xs text-secondary">{r.signalDate}</td>
                    <td>
                      <span className="text-xs font-semibold">{r.verdict}</span>
                    </td>
                    <td>{r.verdictScore.toFixed(0)}</td>
                    <td>{formatPrice(r.entryClose)}</td>
                    <td className="text-xs">{r.futureDate ?? '—'}</td>
                    <td>{r.futureClose != null ? formatPrice(r.futureClose) : '—'}</td>
                    <td
                      style={{
                        fontWeight: 600,
                        color:
                          r.returnPct == null
                            ? 'var(--text-secondary)'
                            : r.returnPct > 0
                              ? '#3FB950'
                              : r.returnPct < 0
                                ? '#F85149'
                                : undefined,
                      }}
                    >
                      {r.returnPct != null ? `${r.returnPct > 0 ? '+' : ''}${r.returnPct}%` : '—'}
                    </td>
                    <td className="text-xs text-secondary">
                      {r.tp1Hit == null
                        ? '—'
                        : `${r.tp1Hit ? '✓TP1' : '—'} / ${r.stopLossHit ? '✗SL' : '—'}`}
                    </td>
                    <td>
                      {r.autoOutcome === 'MENUNGGU' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(139,148,158,0.12)', padding: '3px 8px', borderRadius: '999px', width: 'fit-content', border: '1px solid rgba(139,148,158,0.4)' }} title={`Butuh ${r.sessionsLeft} hari trading lagi`}>
                          <Clock size={12} color="#8B949E" />
                          <span style={{ fontSize: '0.68rem', color: '#8B949E', fontWeight: 700, whiteSpace: 'nowrap' }}>Tunggu {r.sessionsLeft} sesi</span>
                        </div>
                      ) : (
                        <OutcomeBadge outcome={r.autoOutcome} />
                      )}
                    </td>
                    <td>
                      {finalOutcome === 'MENUNGGU' ? (
                        <span style={{ fontSize: '0.7rem', color: '#8B949E', fontWeight: 600 }}>-</span>
                      ) : (
                        <OutcomeBadge outcome={finalOutcome} />
                      )}
                      {manual && (
                        <span className="text-xs text-secondary" style={{ display: 'block' }}>
                          (manual)
                        </span>
                      )}
                    </td>
                    <td>
                      <select
                        className="input-field"
                        style={{ padding: '4px 8px', fontSize: '0.75rem', minWidth: '110px' }}
                        value={manual?.manualOutcome ?? ''}
                        onChange={(e) => {
                          const v = e.target.value as ValidationOutcome | '';
                          if (!v) handleManualChange(r.id, 'MENUNGGU');
                          else handleManualChange(r.id, v);
                        }}
                      >
                        <option value="">Ikuti otomatis</option>
                        <option value="BENAR">Benar</option>
                        <option value="SALAH">Salah</option>
                        <option value="NETRAL">Netral</option>
                      </select>
                      {manual && (
                        <button
                          type="button"
                          title="Hapus override"
                          onClick={() => handleManualChange(r.id, 'MENUNGGU')}
                          style={{
                            marginLeft: '4px',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--text-secondary)',
                            verticalAlign: 'middle',
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </td>
                    <td>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Opsional"
                        style={{ padding: '4px 8px', fontSize: '0.75rem', width: '100px' }}
                        defaultValue={manual?.note ?? ''}
                        onBlur={(e) => {
                          if (manual?.manualOutcome) {
                            handleManualChange(r.id, manual.manualOutcome, e.target.value);
                          }
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <p className="text-center text-secondary p-8 text-sm">
            Tidak ada data validasi untuk filter ini. Upload lebih banyak data historis agar backtest
            bisa berjalan.
          </p>
        )}
      </div>

      {/* Legend */}
      <div
        className="mt-6"
        style={{
          padding: '14px 18px',
          background: 'rgba(110,64,201,0.06)',
          border: '1px solid rgba(110,64,201,0.25)',
          borderRadius: '10px',
          fontSize: '0.78rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
        }}
      >
        <strong style={{ color: '#6E40C9' }}>Cara membaca:</strong> Setiap baris adalah rekomendasi
        yang <em>seharusnya</em> Anda lihat di tanggal sinyal (tanpa melihat masa depan). Setelah
        upload data hari-hari berikutnya, baris yang tadinya &quot;Menunggu&quot; otomatis terisi
        hasilnya. Kolom <strong>Penilaian Anda</strong> disimpan di browser untuk koreksi manual
        (misalnya TP tercapai tapi return kecil).         Akurasi di atas memakai penilaian manual jika ada.
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  color,
  icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '16px 12px' }}>
      <div style={{ color, margin: '0 auto 8px', display: 'flex', justifyContent: 'center' }}>
        {icon}
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div
        className="text-xs text-secondary"
        style={{ marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}
      >
        {label}
      </div>
      {sub && <div className="text-xs text-secondary mt-1">{sub}</div>}
    </div>
  );
}
