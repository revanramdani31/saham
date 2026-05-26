import { useMemo, useState } from 'react';
import Papa from 'papaparse';
import { Plus, Trash2, LineChart, ArrowDownUp, Layers3, Save, RotateCcw, Upload } from 'lucide-react';
import type { MarketContext, IhsgSeriesPoint, ForeignFlowPoint } from '../engine/marketContext';
import { normalizeMarketContext } from '../engine/marketContext';
import {
    Area,
    CartesianGrid,
    ComposedChart,
    Line,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { NumberInput } from './NumberInput';

interface MarketContextTabProps {
    marketContext: MarketContext | null;
    onMarketContextUpdated: (context: MarketContext | null) => void;
}

function sortByDate<T extends { date: string }>(items: T[]): T[] {
    return [...items].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function getRowValue(row: any, candidates: string[]) {
    const keys = Object.keys(row);
    const foundKey = keys.find(k => candidates.some(s => k.toLowerCase().includes(s)));
    return foundKey ? row[foundKey] : undefined;
}

function mergeSeriesByDate<T extends { date: string }>(existing: T[], parsed: T[]): T[] {
    const map = new Map<string, T>();
    existing.forEach(e => map.set(e.date, e));
    parsed.forEach(p => map.set(p.date, p));
    return Array.from(map.values());
}

export function MarketContextTab({ marketContext, onMarketContextUpdated }: Readonly<MarketContextTabProps>) {
    const [ihsgDate, setIhsgDate] = useState(new Date().toISOString().split('T')[0]);
    const [ihsgClose, setIhsgClose] = useState('');
    const [ihsgChangePercent, setIhsgChangePercent] = useState('');

    const [flowDate, setFlowDate] = useState(new Date().toISOString().split('T')[0]);
    const [flowNetBuy, setFlowNetBuy] = useState<number>(0);

    const [sectorStock, setSectorStock] = useState('');
    const [sectorName, setSectorName] = useState('');

    const ihsgSeries = useMemo(() => sortByDate(marketContext?.ihsgSeries ?? []), [marketContext]);
    const foreignFlowSeries = useMemo(() => sortByDate(marketContext?.foreignFlowSeries ?? []), [marketContext]);
    const sectorMap = marketContext?.sectorMap ?? {};
    const ihsgChartData = useMemo(() => {
        return [...ihsgSeries]
            .reverse()
            .map((point, index, series) => {
                const previous = series[index - 1];
                const changeFromPrevious = previous
                    ? ((point.close - previous.close) / previous.close) * 100
                    : point.changePercent;

                return {
                    ...point,
                    label: point.date.slice(5),
                    changeFromPrevious,
                };
            });
    }, [ihsgSeries]);

    const latestIhsg = ihsgSeries[0];
    const latestFlow = foreignFlowSeries[0];
    const sectorCount = Object.keys(sectorMap).length;
    let latestIhsgChangeLabel = '—';
    if (latestIhsg?.changePercent !== undefined) {
        latestIhsgChangeLabel = `${latestIhsg.changePercent > 0 ? '+' : ''}${latestIhsg.changePercent.toFixed(2)}%`;
    }

    const saveContext = (next: MarketContext | null) => {
        onMarketContextUpdated(next);
    };

    const cloneContext = (): MarketContext => {
        const next: MarketContext = {};
        if (marketContext?.ihsgSeries) next.ihsgSeries = [...marketContext.ihsgSeries];
        if (marketContext?.foreignFlowSeries) next.foreignFlowSeries = [...marketContext.foreignFlowSeries];
        if (marketContext?.sectorMap) next.sectorMap = { ...marketContext.sectorMap };
        return next;
    };

    const addIhsgRow = () => {
        const close = Number(ihsgClose);
        const changePercent = ihsgChangePercent === '' ? undefined : Number(ihsgChangePercent);
        if (!ihsgDate || !Number.isFinite(close)) return;

        const nextRow: IhsgSeriesPoint = changePercent !== undefined && Number.isFinite(changePercent)
            ? { date: ihsgDate, close, changePercent }
            : { date: ihsgDate, close };

        const nextSeries = [...ihsgSeries.filter((row) => row.date !== ihsgDate), nextRow];
        const nextContext = cloneContext();
        nextContext.ihsgSeries = nextSeries;
        saveContext(nextContext);

        setIhsgClose('');
        setIhsgChangePercent('');
    };

    const addForeignFlowRow = () => {
        const netBuy = flowNetBuy;
        if (!flowDate || !Number.isFinite(netBuy) || netBuy === 0) return;

        const nextRow: ForeignFlowPoint = { date: flowDate, netBuy };
        const nextSeries = [...foreignFlowSeries.filter((row) => row.date !== flowDate), nextRow];
        const nextContext = cloneContext();
        nextContext.foreignFlowSeries = nextSeries;
        saveContext(nextContext);

        setFlowNetBuy(0);
    };

    const addSectorMapRow = () => {
        const stock = sectorStock.trim().toUpperCase();
        const sector = sectorName.trim();
        if (!stock || !sector) return;

        const nextContext = cloneContext();
        nextContext.sectorMap = {
            ...sectorMap,
            [stock]: sector,
        };
        saveContext(nextContext);

        setSectorStock('');
        setSectorName('');
    };

    const removeIhsgRow = (date: string) => {
        const nextSeries = ihsgSeries.filter((row) => row.date !== date);
        const nextContext = cloneContext();
        nextContext.ihsgSeries = nextSeries.length > 0 ? nextSeries : undefined;
        saveContext(nextContext);
    };

    const removeFlowRow = (date: string) => {
        const nextSeries = foreignFlowSeries.filter((row) => row.date !== date);
        const nextContext = cloneContext();
        nextContext.foreignFlowSeries = nextSeries.length > 0 ? nextSeries : undefined;
        saveContext(nextContext);
    };

    const removeSector = (stock: string) => {
        const nextMap = { ...sectorMap };
        delete nextMap[stock];
        const nextContext = cloneContext();
        nextContext.sectorMap = Object.keys(nextMap).length > 0 ? nextMap : undefined;
        saveContext(nextContext);
    };

    const clearAll = () => {
        if (!confirm('Hapus semua market context yang disimpan?')) return;
        saveContext(null);
    };

    const isEmpty = ihsgSeries.length === 0 && foreignFlowSeries.length === 0 && sectorCount === 0;

    const [uploadType, setUploadType] = useState<'ihsg' | 'flow' | 'sector'>('ihsg');
    const [csvError, setCsvError] = useState<string>('');
    const [csvSuccess, setCsvSuccess] = useState<string>('');
    const mapIhsgRows = (data: any[]): IhsgSeriesPoint[] => {
        return data.map((row) => {
            const date = getRowValue(row, ['date', 'tanggal']);
            const closeRaw = getRowValue(row, ['close', 'harga', 'closing']);
            const changeRaw = getRowValue(row, ['change', 'change%', 'chg', 'change_percent', 'change%']);
            const close = closeRaw ? Number(String(closeRaw).replaceAll(',', '')) : Number.NaN;
            const changePercent = changeRaw !== undefined && changeRaw !== '' ? Number(String(changeRaw).replaceAll(',', '')) : undefined;
            if (!date || !Number.isFinite(close)) return null;
            
            const point: IhsgSeriesPoint = { date: String(date), close };
            if (changePercent !== undefined && Number.isFinite(changePercent)) {
                point.changePercent = changePercent;
            }
            return point;
        }).filter((r): r is IhsgSeriesPoint => r !== null);
    };

    const mapFlowRows = (data: any[]): ForeignFlowPoint[] => {
        return data.map((row) => {
            const date = getRowValue(row, ['date', 'tanggal']);
            const netRaw = getRowValue(row, ['net', 'netbuy', 'net_buy', 'net_buy_value', 'netbuyvalue']);
            const netBuy = netRaw ? Number(String(netRaw).replaceAll(',', '')) : Number.NaN;
            if (!date || !Number.isFinite(netBuy)) return null;
            return { date: String(date), netBuy };
        }).filter((r): r is ForeignFlowPoint => r !== null);
    };

    const mapSectorPairs = (data: any[]) => {
        return data.map((row) => {
            const stockRaw = getRowValue(row, ['stock', 'kode', 'ticker']);
            const sectorRaw = getRowValue(row, ['sector', 'sektor', 'industry']);
            if (!stockRaw || !sectorRaw) return null;
            return { stock: String(stockRaw).trim().toUpperCase(), sector: String(sectorRaw).trim() };
        }).filter((p) => p !== null) as { stock: string; sector: string }[];
    };



    const parseCsv = (csvText: string) => {
        setCsvError('');
        setCsvSuccess('');
        const isTabSeparated = csvText.includes('\t');
        Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
            delimiter: isTabSeparated ? '\t' : ',',
            complete: (results) => {
                try {
                    if (!results?.data?.length) {
                        setCsvError('CSV kosong atau tidak valid.');
                        return;
                    }

                    const rows = results.data as any[];

                    if (uploadType === 'ihsg') {
                        const parsed = mapIhsgRows(rows);
                        if (parsed.length === 0) {
                            setCsvError('Tidak menemukan baris IHSG yang valid. Pastikan ada kolom tanggal dan close.');
                            return;
                        }
                        const next = cloneContext();
                        next.ihsgSeries = mergeSeriesByDate(ihsgSeries, parsed);
                        const normalized = normalizeMarketContext(next) ?? next;
                        saveContext(normalized);
                        setCsvSuccess(`Berhasil impor ${parsed.length} baris IHSG.`);
                        return;
                    }

                    if (uploadType === 'flow') {
                        const parsed = mapFlowRows(rows);
                        if (parsed.length === 0) {
                            setCsvError('Tidak menemukan baris foreign flow yang valid. Pastikan ada kolom tanggal dan net buy.');
                            return;
                        }
                        const next = cloneContext();
                        next.foreignFlowSeries = mergeSeriesByDate(foreignFlowSeries, parsed);
                        const normalized = normalizeMarketContext(next) ?? next;
                        saveContext(normalized);
                        setCsvSuccess(`Berhasil impor ${parsed.length} baris foreign flow.`);
                        return;
                    }

                    if (uploadType === 'sector') {
                        const parsed = mapSectorPairs(rows);
                        if (parsed.length === 0) {
                            setCsvError('Tidak menemukan pasangan stock->sector yang valid. Pastikan ada kolom stock dan sector.');
                            return;
                        }
                        const next = cloneContext();
                        const base = next.sectorMap ?? {};
                        parsed.forEach(p => { base[p.stock] = p.sector; });
                        next.sectorMap = base;
                        const normalized = normalizeMarketContext(next) ?? next;
                        saveContext(normalized);
                        setCsvSuccess(`Berhasil impor ${parsed.length} mapping sektor.`);
                        return;
                    }
                } catch (err: any) {
                    setCsvError('Gagal memproses CSV: ' + (err?.message ?? String(err)));
                }
            }
        });
    };

    const handleFileUploadCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            parseCsv(text);
        } catch (err: any) {
            setCsvError('Gagal membaca file: ' + (err?.message ?? String(err)));
        }
    };

    const handlePasteCsv = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text');
        parseCsv(pasted);
    };

    return (
        <div className="main-content">
            <div className="flex justify-between items-start mb-8">
                <div>
                    <h1 className="text-gradient">Market Context / IHSG</h1>
                    <p className="text-secondary text-sm">Isi IHSG, foreign flow, dan peta sektor secara manual. Data ini dipakai untuk market regime.</p>
                </div>
                <button onClick={clearAll} className="btn bg-red text-red flex items-center gap-2">
                    <RotateCcw size={16} /> Hapus Context
                </button>
            </div>

            <div className="card mb-8">
                <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
                    <div>
                        <h3 className="font-semibold flex items-center gap-2">
                            <LineChart size={18} /> Trend IHSG
                        </h3>
                        <p className="text-secondary text-sm">Grafik ini mengikuti data IHSG yang sudah disimpan, jadi perubahan trend langsung terlihat.</p>
                    </div>
                    {latestIhsg && (
                        <div className="flex items-center gap-4 text-sm">
                            <div>
                                <div className="text-secondary text-xs">Close Terakhir</div>
                                <div className="font-semibold">{latestIhsg.close.toLocaleString('id-ID')}</div>
                            </div>
                            <div>
                                <div className="text-secondary text-xs">Change %</div>
                                <div className={`font-semibold ${latestIhsg.changePercent !== undefined && latestIhsg.changePercent < 0 ? 'text-red' : 'text-green'}`}>
                                    {latestIhsgChangeLabel}
                                </div>
                            </div>
                            <div>
                                <div className="text-secondary text-xs">Total Point</div>
                                <div className="font-semibold">{ihsgSeries.length}</div>
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ width: '100%', height: 340 }}>
                    {ihsgChartData.length > 0 ? (
                        <ResponsiveContainer>
                            <ComposedChart data={ihsgChartData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#2D3139" />
                                <XAxis dataKey="label" stroke="#8B949E" fontSize={12} minTickGap={24} />
                                <YAxis stroke="#8B949E" fontSize={12} domain={['auto', 'auto']} tickFormatter={(value) => Number(value).toLocaleString('id-ID')} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#161B22', borderColor: '#30363D', borderRadius: '8px' }}
                                    itemStyle={{ color: '#E6EDF3' }}
                                    labelStyle={{ color: '#E6EDF3' }}
                                    formatter={(value: any, name: any) => {
                                        if (name === 'Change %') {
                                            return [`${Number(value).toFixed(2)}%`, name];
                                        }
                                        return [Number(value).toLocaleString('id-ID'), name as string];
                                    }}
                                    labelFormatter={(label) => `Tanggal: ${label}`}
                                />
                                <Area type="monotone" dataKey="close" name="Close IHSG" stroke="#388BFD" fill="rgba(56, 139, 253, 0.18)" strokeWidth={3} />
                                <Line type="monotone" dataKey="changeFromPrevious" name="Change %" stroke="#3FB950" strokeWidth={2} dot={false} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex h-full items-center justify-center text-secondary rounded-lg border border-dashed border-white/10">
                            Belum ada data IHSG. Input atau import data dulu untuk melihat trend.
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-4 gap-4 mb-8">
                <div className="card">
                    <div className="text-secondary text-xs mb-1">IHSG Tersimpan</div>
                    <div className="text-2xl font-bold">{ihsgSeries.length}</div>
                    <div className="text-xs text-secondary mt-1">baris data</div>
                </div>
                <div className="card">
                    <div className="text-secondary text-xs mb-1">Foreign Flow</div>
                    <div className="text-2xl font-bold">{foreignFlowSeries.length}</div>
                    <div className="text-xs text-secondary mt-1">baris data</div>
                </div>
                <div className="card">
                    <div className="text-secondary text-xs mb-1">Sektor Map</div>
                    <div className="text-2xl font-bold">{sectorCount}</div>
                    <div className="text-xs text-secondary mt-1">kode saham</div>
                </div>
                <div className="card">
                    <div className="text-secondary text-xs mb-1">Status</div>
                    <div className="text-2xl font-bold">{isEmpty ? 'Kosong' : 'Aktif'}</div>
                    <div className="text-xs text-secondary mt-1">manual override</div>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-6 mb-8">
                <div className="card">
                    <h3 className="mb-4 font-semibold flex items-center gap-2"><LineChart size={18} /> Input IHSG</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="form-group">
                            <label htmlFor="ihsg-date" className="text-xs text-secondary mb-1 block">Tanggal</label>
                            <input id="ihsg-date" type="date" className="input-field" value={ihsgDate} onChange={(e) => setIhsgDate(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label htmlFor="ihsg-close" className="text-xs text-secondary mb-1 block">Close IHSG</label>
                            <input id="ihsg-close" type="number" className="input-field" value={ihsgClose} onChange={(e) => setIhsgClose(e.target.value)} placeholder="7365.12" />
                        </div>
                        <div className="form-group col-span-2">
                            <label htmlFor="ihsg-change" className="text-xs text-secondary mb-1 block">Change % (opsional)</label>
                            <input id="ihsg-change" type="number" className="input-field" value={ihsgChangePercent} onChange={(e) => setIhsgChangePercent(e.target.value)} placeholder="0.42" />
                        </div>
                    </div>
                    <button onClick={addIhsgRow} className="btn btn-primary mt-4 flex items-center gap-2">
                        <Plus size={16} /> Simpan IHSG
                    </button>
                </div>

                <div className="card">
                    <h3 className="mb-4 font-semibold flex items-center gap-2"><ArrowDownUp size={18} /> Input Foreign Flow</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="form-group">
                            <label htmlFor="flow-date" className="text-xs text-secondary mb-1 block">Tanggal</label>
                            <input id="flow-date" type="date" className="input-field" value={flowDate} onChange={(e) => setFlowDate(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label htmlFor="flow-netbuy" className="text-xs text-secondary mb-1 block">Net Buy</label>
                            <NumberInput value={flowNetBuy} onChange={setFlowNetBuy} className="input-field" placeholder="1.25B" />
                        </div>
                    </div>
                    <button onClick={addForeignFlowRow} className="btn btn-primary mt-4 flex items-center gap-2">
                        <Save size={16} /> Simpan Flow
                    </button>
                </div>

                <div className="card">
                    <h3 className="mb-4 font-semibold flex items-center gap-2"><Layers3 size={18} /> Input Sektor</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="form-group">
                            <label htmlFor="sector-stock" className="text-xs text-secondary mb-1 block">Kode Saham</label>
                            <input id="sector-stock" type="text" className="input-field" value={sectorStock} onChange={(e) => setSectorStock(e.target.value.toUpperCase())} placeholder="BMTR" />
                        </div>
                        <div className="form-group">
                            <label htmlFor="sector-name" className="text-xs text-secondary mb-1 block">Nama Sektor</label>
                            <input id="sector-name" type="text" className="input-field" value={sectorName} onChange={(e) => setSectorName(e.target.value)} placeholder="Basic Materials" />
                        </div>
                    </div>
                    <button onClick={addSectorMapRow} className="btn btn-primary mt-4 flex items-center gap-2">
                        <Plus size={16} /> Simpan Sektor
                    </button>
                </div>
            </div>

            <div className="card mb-6">
                <h3 className="mb-3 font-semibold flex items-center gap-2"><Upload size={18} /> Import CSV (IHSG / Foreign Flow / Sector)</h3>
                <div className="grid grid-cols-3 gap-3 items-end">
                    <div>
                        <label htmlFor="csv-type" className="text-xs text-secondary mb-1 block">Tipe CSV</label>
                        <select id="csv-type" value={uploadType} onChange={(e) => setUploadType(e.target.value as any)} className="input-field">
                            <option value="ihsg">IHSG (date, close, change%)</option>
                            <option value="flow">Foreign Flow (date, netBuy)</option>
                            <option value="sector">Sector Map (stock, sector)</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="csv-file-input" className="text-xs text-secondary mb-1 block">Pilih File CSV</label>
                        <label className="btn btn-secondary mt-2 w-full text-xs" htmlFor="csv-file-input">
                            Pilih File
                        </label>
                        <input id="csv-file-input" type="file" accept=".csv,.tsv,text/csv" style={{ display: 'none' }} onChange={handleFileUploadCsv} />
                    </div>
                    <div>
                        <label htmlFor="csv-paste" className="text-xs text-secondary mb-1 block">Paste CSV</label>
                        <textarea id="csv-paste" placeholder="Paste CSV di sini..." onPaste={handlePasteCsv} className="input-field" style={{ height: 40 }} />
                    </div>
                </div>
                {csvError && <div className="text-red text-sm mt-2">{csvError}</div>}
                {csvSuccess && <div className="text-green text-sm mt-2">{csvSuccess}</div>}
            </div>

            <div className="grid grid-cols-3 gap-6">
                <div className="card">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="font-semibold">IHSG Tersimpan</h3>
                        {latestIhsg && <span className="text-xs text-secondary">Terakhir: {latestIhsg.date}</span>}
                    </div>
                    {ihsgSeries.length === 0 ? (
                        <p className="text-secondary text-sm">Belum ada data IHSG.</p>
                    ) : (
                        <div className="space-y-2 max-h-80 overflow-y-auto">
                            {ihsgSeries.map((row) => (
                                <div key={row.date} className="flex justify-between items-center p-2 rounded bg-dark-2">
                                    <div>
                                        <div className="font-semibold">{row.date}</div>
                                        <div className="text-xs text-secondary">Close: {row.close.toLocaleString('id-ID')}</div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-secondary">{row.changePercent ?? '-'}%</span>
                                        <button onClick={() => removeIhsgRow(row.date)} className="text-red">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="card">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="font-semibold">Foreign Flow</h3>
                        {latestFlow && <span className="text-xs text-secondary">Terakhir: {latestFlow.date}</span>}
                    </div>
                    {foreignFlowSeries.length === 0 ? (
                        <p className="text-secondary text-sm">Belum ada data foreign flow.</p>
                    ) : (
                        <div className="space-y-2 max-h-80 overflow-y-auto">
                            {foreignFlowSeries.map((row) => (
                                <div key={row.date} className="flex justify-between items-center p-2 rounded bg-dark-2">
                                    <div>
                                        <div className="font-semibold">{row.date}</div>
                                        <div className="text-xs text-secondary">Net Buy: {row.netBuy.toLocaleString('id-ID')}</div>
                                    </div>
                                    <button onClick={() => removeFlowRow(row.date)} className="text-red">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="card">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="font-semibold">Sektor Map</h3>
                        <span className="text-xs text-secondary">{sectorCount} item</span>
                    </div>
                    {sectorCount === 0 ? (
                        <p className="text-secondary text-sm">Belum ada mapping sektor.</p>
                    ) : (
                        <div className="space-y-2 max-h-80 overflow-y-auto">
                            {Object.entries(sectorMap).map(([stock, sector]) => (
                                <div key={stock} className="flex justify-between items-center p-2 rounded bg-dark-2">
                                    <div>
                                        <div className="font-semibold">{stock}</div>
                                        <div className="text-xs text-secondary">{sector}</div>
                                    </div>
                                    <button onClick={() => removeSector(stock)} className="text-red">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
