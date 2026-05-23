import { useState } from 'react';
import { DataUpload } from './DataUpload';
import type { RawTradeData } from '../engine/types';
import { clearRawData, saveRawData, deleteSingleRow, updateSingleRow, deleteStockData } from '../utils/storage';
import { Trash2, X, Pencil, Check } from 'lucide-react';
import { NumberInput } from './NumberInput';
import { formatCompact, formatPrice } from '../utils/format';

interface RawDataTabProps {
  data: RawTradeData[];
  onDataUpdated: (newData: RawTradeData[]) => void;
}

export function RawDataTab({ data, onDataUpdated }: RawDataTabProps) {
  const [isClearing, setIsClearing] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<RawTradeData | null>(null);
  const [stockToDelete, setStockToDelete] = useState<string>('');

  const uniqueStocks = Array.from(new Set(data.map(d => d.stock))).sort();

  const handleNewDataLoaded = async (newData: RawTradeData[]) => {
    // Append and save to local storage
    const combinedData = await saveRawData(newData);
    onDataUpdated(combinedData);
  };

  const handleClear = async () => {
    if (confirm('Apakah Anda yakin ingin menghapus SEMUA data historis? Data tidak dapat dikembalikan.')) {
      setIsClearing(true);
      await clearRawData();
      onDataUpdated([]);
      setIsClearing(false);
    }
  };

  const handleDeleteRow = async (date: string, stock: string, broker: string) => {
    if (confirm(`Hapus data ${stock} - ${broker} tanggal ${date}?`)) {
      const updatedData = await deleteSingleRow(date, stock, broker);
      onDataUpdated(updatedData);
    }
  };

  const handleDeleteStock = async () => {
    if (!stockToDelete) return;
    if (confirm(`Apakah Anda yakin ingin menghapus SEMUA data untuk saham ${stockToDelete}?`)) {
      const updatedData = await deleteStockData(stockToDelete);
      onDataUpdated(updatedData);
      setStockToDelete('');
    }
  };

  const handleEditClick = (row: RawTradeData) => {
    setEditingKey(`${row.date}-${row.stock}-${row.broker}`);
    setEditFormData({ ...row });
  };

  const handleCancelEdit = () => {
    setEditingKey(null);
    setEditFormData(null);
  };

  const handleSaveEdit = async (oldDate: string, oldStock: string, oldBroker: string) => {
    if (!editFormData) return;
    const updatedData = await updateSingleRow(oldDate, oldStock, oldBroker, editFormData);
    onDataUpdated(updatedData);
    setEditingKey(null);
    setEditFormData(null);
  };

  const handleInputChange = (field: keyof RawTradeData, value: string | number) => {
    if (!editFormData) return;
    setEditFormData({ ...editFormData, [field]: value });
  };

  return (
    <div className="main-content">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-gradient">Raw Data Engine</h1>
          <p className="text-secondary text-sm">Upload atau kelola data historis transaksi.</p>
        </div>
        {data.length > 0 && (
          <div className="flex gap-4 items-center">
            <div className="flex items-center gap-2 bg-dark-2 p-2 rounded-lg">
              <select 
                value={stockToDelete} 
                onChange={e => setStockToDelete(e.target.value)}
                className="input-field py-1 px-2 text-sm"
              >
                <option value="">-- Pilih Saham --</option>
                {uniqueStocks.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <button 
                onClick={handleDeleteStock} 
                disabled={!stockToDelete} 
                className="btn bg-red text-red py-1 px-3 text-sm flex items-center gap-1"
                style={{ opacity: !stockToDelete ? 0.5 : 1 }}
                title="Hapus Semua Data Saham Terpilih"
              >
                <Trash2 size={14} /> Hapus Saham
              </button>
            </div>
            <button onClick={handleClear} disabled={isClearing} className="btn bg-red text-red flex items-center gap-2">
              <Trash2 size={16} /> Hapus Semua Data
            </button>
          </div>
        )}
      </div>

      <div className="mb-8">
        <DataUpload onDataLoaded={handleNewDataLoaded} />
      </div>

      {data.length > 0 && (
        <div className="card">
          <h3 className="mb-4 font-semibold">Data Tersimpan ({data.length} baris)</h3>
          <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Stock</th>
                  <th>Broker</th>
                  <th>Buy Val</th>
                  <th>Sell Val</th>
                  <th>Close</th>
                  <th>Volume</th>
                  <th style={{ width: '50px' }}></th>
                </tr>
              </thead>
              <tbody>
                {data.slice(0, 100).map((row, idx) => {
                  const rowKey = `${row.date}-${row.stock}-${row.broker}`;
                  const isEditing = editingKey === rowKey && editFormData;
                  
                  return isEditing ? (
                    <tr key={idx} style={{ backgroundColor: 'rgba(56, 139, 253, 0.05)' }}>
                      <td>
                        <input type="date" value={editFormData.date} onChange={e => handleInputChange('date', e.target.value)} className="input-field" style={{ padding: '4px', fontSize: '0.8rem', width: '110px' }} />
                      </td>
                      <td>
                        <input type="text" value={editFormData.stock} onChange={e => handleInputChange('stock', e.target.value.toUpperCase())} className="input-field font-bold" style={{ padding: '4px', fontSize: '0.8rem', width: '70px' }} />
                      </td>
                      <td>
                        <input type="text" value={editFormData.broker} onChange={e => handleInputChange('broker', e.target.value.toUpperCase())} className="input-field" style={{ padding: '4px', fontSize: '0.8rem', width: '60px' }} />
                      </td>
                      <td>
                        <NumberInput value={editFormData.buyValue} onChange={(val: number) => handleInputChange('buyValue', val)} className="input-field text-green" style={{ padding: '4px', fontSize: '0.8rem', width: '90px' }} />
                      </td>
                      <td>
                        <NumberInput value={editFormData.sellValue} onChange={(val: number) => handleInputChange('sellValue', val)} className="input-field text-red" style={{ padding: '4px', fontSize: '0.8rem', width: '90px' }} />
                      </td>
                      <td>
                        <NumberInput value={editFormData.close} onChange={(val: number) => handleInputChange('close', val)} className="input-field" style={{ padding: '4px', fontSize: '0.8rem', width: '70px' }} />
                      </td>
                      <td>
                        <NumberInput value={editFormData.volume} onChange={(val: number) => handleInputChange('volume', val)} className="input-field" style={{ padding: '4px', fontSize: '0.8rem', width: '80px' }} />
                      </td>
                      <td>
                        <div className="flex gap-1">
                          <button onClick={() => handleSaveEdit(row.date, row.stock, row.broker)} className="btn bg-green text-green" style={{ padding: '4px', minWidth: 'auto', borderRadius: '4px' }} title="Simpan">
                            <Check size={14} />
                          </button>
                          <button onClick={handleCancelEdit} className="btn bg-red text-red" style={{ padding: '4px', minWidth: 'auto', borderRadius: '4px' }} title="Batal">
                            <X size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={idx}>
                      <td>{row.date}</td>
                      <td className="font-bold">{row.stock}</td>
                      <td>{row.broker}</td>
                      <td className="text-green font-semibold" title={row.buyValue.toLocaleString('id-ID')}>{formatCompact(row.buyValue)}</td>
                      <td className="text-red font-semibold" title={row.sellValue.toLocaleString('id-ID')}>{formatCompact(row.sellValue)}</td>
                      <td>{formatPrice(row.close)}</td>
                      <td title={row.volume.toLocaleString('id-ID')}>{formatCompact(row.volume)}</td>
                      <td>
                        <div className="flex gap-1">
                          <button 
                            onClick={() => handleEditClick(row)}
                            className="btn bg-yellow text-yellow"
                            style={{ padding: '4px', minWidth: 'auto', borderRadius: '4px' }}
                            title="Edit baris ini"
                          >
                            <Pencil size={14} />
                          </button>
                          <button 
                            onClick={() => handleDeleteRow(row.date, row.stock, row.broker)}
                            className="btn bg-red text-red"
                            style={{ padding: '4px', minWidth: 'auto', borderRadius: '4px' }}
                            title="Hapus baris ini"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data.length > 100 && (
            <p className="text-xs text-secondary mt-2 text-center">Menampilkan 100 data terakhir dari total {data.length} data.</p>
          )}
        </div>
      )}
    </div>
  );
}
