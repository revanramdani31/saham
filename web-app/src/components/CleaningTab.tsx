import { useMemo } from 'react';
import type { RawTradeData } from '../engine/types';
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { formatCompact, formatPrice } from '../utils/format';
import { exportRawData } from '../utils/exportCsv';
import { deleteSingleRow, saveRawData } from '../utils/storage';

interface CleaningTabProps {
  data: RawTradeData[];
  onDataUpdated: (newData: RawTradeData[]) => void;
}

interface RowStatus {
  row: RawTradeData;
  valid: boolean;
  missing: boolean;
  duplicate: boolean;
  status: 'CLEAN' | 'INVALID' | 'DUPLIKAT';
}

export function CleaningTab({ data, onDataUpdated }: CleaningTabProps) {
  const rowStatuses = useMemo<RowStatus[]>(() => {
    const seenKeys = new Map<string, number>();

    return data.map((row, idx) => {
      const key = `${row.date}-${row.stock}-${row.broker}`;
      const prevIdx = seenKeys.get(key);
      const isDuplicate = prevIdx !== undefined;
      seenKeys.set(key, idx);

      const missing = !row.date || !row.stock || !row.broker;
      const valid = !missing && (row.buyValue > 0 || row.sellValue > 0) && row.close > 0;

      let status: 'CLEAN' | 'INVALID' | 'DUPLIKAT';
      if (isDuplicate) status = 'DUPLIKAT';
      else if (!valid) status = 'INVALID';
      else status = 'CLEAN';

      return { row, valid, missing, duplicate: isDuplicate, status };
    });
  }, [data]);

  const cleanCount = rowStatuses.filter(r => r.status === 'CLEAN').length;
  const invalidCount = rowStatuses.filter(r => r.status === 'INVALID').length;
  const dupCount = rowStatuses.filter(r => r.status === 'DUPLIKAT').length;

  const handleDeleteDuplicates = async () => {
    if (!confirm(`Hapus ${dupCount} baris duplikat otomatis?`)) return;
    const seenKeys = new Set<string>();
    const cleaned = data.filter(row => {
      const key = `${row.date}-${row.stock}-${row.broker}`;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });
    const updated = await saveRawData(cleaned);
    onDataUpdated(updated);
  };

  const handleDeleteRow = async (row: RawTradeData) => {
    if (!confirm(`Hapus baris ${row.stock} - ${row.broker} (${row.date})?`)) return;
    const updated = await deleteSingleRow(row.date, row.stock, row.broker);
    onDataUpdated(updated);
  };

  const statusIcon = (status: string) => {
    if (status === 'CLEAN') return <CheckCircle size={15} className="text-green" />;
    if (status === 'DUPLIKAT') return <AlertTriangle size={15} className="text-yellow" />;
    return <XCircle size={15} className="text-red" />;
  };

  return (
    <div className="main-content">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-gradient">Data Cleaning Engine</h1>
          <p className="text-secondary text-sm">Validasi kualitas data — deteksi missing values, data tidak valid, dan duplikat.</p>
        </div>
        <div className="flex gap-2">
          {dupCount > 0 && (
            <button className="btn bg-yellow text-black flex items-center gap-2" onClick={handleDeleteDuplicates}>
              <AlertTriangle size={15} /> Hapus {dupCount} Duplikat
            </button>
          )}
          <button className="btn btn-secondary flex items-center gap-2" onClick={() => exportRawData(data)}>
            Export CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card" style={{ textAlign: 'center', borderColor: 'var(--accent-green)' }}>
          <CheckCircle className="text-green mb-2" size={28} style={{ margin: '0 auto' }} />
          <h2 className="text-green font-bold text-2xl">{cleanCount}</h2>
          <p className="text-secondary text-sm">Data Clean</p>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <AlertTriangle className="text-yellow mb-2" size={28} style={{ margin: '0 auto' }} />
          <h2 className="text-yellow font-bold text-2xl">{dupCount}</h2>
          <p className="text-secondary text-sm">Duplikat</p>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <XCircle className="text-red mb-2" size={28} style={{ margin: '0 auto' }} />
          <h2 className="text-red font-bold text-2xl">{invalidCount}</h2>
          <p className="text-secondary text-sm">Invalid</p>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-container" style={{ maxHeight: '600px', overflowY: 'auto' }}>
          <table>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                <th>Status</th>
                <th>Date</th>
                <th>Stock</th>
                <th>Broker</th>
                <th>Buy Val</th>
                <th>Sell Val</th>
                <th>Close</th>
                <th>Issue</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rowStatuses.map((r, idx) => (
                <tr key={idx} style={{
                  background: r.status === 'CLEAN' ? undefined :
                    r.status === 'DUPLIKAT' ? 'rgba(210,153,34,0.08)' : 'rgba(218,54,51,0.08)'
                }}>
                  <td>
                    <div className="flex items-center gap-1">
                      {statusIcon(r.status)}
                      <span className={`text-xs font-semibold ${r.status === 'CLEAN' ? 'text-green' : r.status === 'DUPLIKAT' ? 'text-yellow' : 'text-red'}`}>
                        {r.status}
                      </span>
                    </div>
                  </td>
                  <td className="text-secondary text-xs">{r.row.date || '—'}</td>
                  <td className="font-bold">{r.row.stock || '—'}</td>
                  <td>{r.row.broker || '—'}</td>
                  <td className="text-green">{formatCompact(r.row.buyValue)}</td>
                  <td className="text-red">{formatCompact(r.row.sellValue)}</td>
                  <td>{formatPrice(r.row.close)}</td>
                  <td className="text-xs text-secondary">
                    {r.missing ? 'Field kosong' : !r.valid ? 'Tidak ada nilai' : r.duplicate ? 'Duplikat' : ''}
                  </td>
                  <td>
                    {r.status !== 'CLEAN' && (
                      <button
                        className="btn bg-red text-red"
                        style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                        onClick={() => handleDeleteRow(r.row)}
                      >
                        Hapus
                      </button>
                    )}
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
