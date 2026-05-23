import { useState } from 'react';
import Papa from 'papaparse';
import { Upload, ClipboardPaste, AlertCircle, Edit3, PlusCircle } from 'lucide-react';
import type { RawTradeData } from '../engine/types';
import { NumberInput } from './NumberInput';

interface DataUploadProps {
  onDataLoaded: (data: RawTradeData[]) => void;
}

export function DataUpload({ onDataLoaded }: DataUploadProps) {
  const [error, setError] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [showManual, setShowManual] = useState(false);

  // Manual form state
  const [manualForm, setManualForm] = useState({
    date: new Date().toISOString().split('T')[0],
    stock: '',
    broker: '',
    buyValue: 0,
    sellValue: 0,
    buyAvg: 0,
    sellAvg: 0,
    open: 0,
    high: 0,
    low: 0,
    close: 0,
    volume: 0
  });

  const parseData = (csvText: string) => {
    const isTabSeparated = csvText.includes('\t');
    
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      delimiter: isTabSeparated ? '\t' : ',',
      complete: (results) => {
        try {
          const rawData: RawTradeData[] = results.data.map((row: any) => {
            const getVal = (keys: string[]) => {
              const rowKeys = Object.keys(row);
              const foundKey = rowKeys.find(rk => keys.some(k => rk.toLowerCase().includes(k)));
              return foundKey ? row[foundKey] : undefined;
            };

            const parseNum = (val: string) => {
              if (!val) return 0;
              return Number(String(val).replace(/,/g, ''));
            };

            return {
              date: getVal(['date', 'tanggal']) || '',
              stock: getVal(['stock', 'saham', 'kode']) || '',
              broker: getVal(['broker', 'sekuritas']) || '',
              buyValue: parseNum(getVal(['buy value', 'bval'])),
              sellValue: parseNum(getVal(['sell value', 'sval'])),
              buyAvg: parseNum(getVal(['buy avg', 'bavg'])),
              sellAvg: parseNum(getVal(['sell avg', 'savg'])),
              open: parseNum(getVal(['open'])),
              high: parseNum(getVal(['high'])),
              low: parseNum(getVal(['low'])),
              close: parseNum(getVal(['close'])),
              volume: parseNum(getVal(['volume', 'vol']))
            };
          }).filter((d: RawTradeData) => d.date && d.stock && d.broker && d.close > 0);

          if (rawData.length === 0) {
            setError('Data tidak valid. Pastikan format kolom sesuai.');
            setSuccessMsg('');
            return;
          }
          
          const summaryMap = new Map<string, Set<string>>();
          rawData.forEach(d => {
            if (!summaryMap.has(d.stock)) summaryMap.set(d.stock, new Set());
            summaryMap.get(d.stock)!.add(d.date);
          });
          let summaryText = 'Berhasil memuat: ';
          const parts: string[] = [];
          summaryMap.forEach((dates, stock) => {
            parts.push(`${stock} (${Array.from(dates).join(', ')})`);
          });
          summaryText += parts.join(' | ');

          setError('');
          setSuccessMsg(summaryText);
          onDataLoaded(rawData);
        } catch (err: any) {
          setError('Gagal membaca data: ' + err.message);
        }
      }
    });
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    parseData(pastedText);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        parseData(text);
      };
      reader.readAsText(file);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!manualForm.stock || !manualForm.broker || !manualForm.close) {
      setError('Kolom Saham, Broker, dan Harga Close wajib diisi!');
      return;
    }

    const newRow: RawTradeData = {
      date: manualForm.date,
      stock: manualForm.stock.toUpperCase(),
      broker: manualForm.broker.toUpperCase(),
      buyValue: manualForm.buyValue || 0,
      sellValue: manualForm.sellValue || 0,
      buyAvg: manualForm.buyAvg || 0,
      sellAvg: manualForm.sellAvg || 0,
      open: manualForm.open || 0,
      high: manualForm.high || 0,
      low: manualForm.low || 0,
      close: manualForm.close || 0,
      volume: manualForm.volume || 0
    };

    setError('');
    setSuccessMsg(`Berhasil memuat: ${newRow.stock} (${newRow.date})`);
    onDataLoaded([newRow]);
    
    // Clear form except date
    setManualForm({
      ...manualForm,
      stock: '',
      broker: '',
      buyValue: 0,
      sellValue: 0,
      buyAvg: 0,
      sellAvg: 0,
      volume: 0
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setManualForm({
      ...manualForm,
      [e.target.name]: e.target.value
    });
  };

  const handleNumberChange = (field: string, val: number) => {
    setManualForm({
      ...manualForm,
      [field]: val
    });
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div className="card" style={{ maxWidth: '800px', width: '100%', textAlign: 'center' }}>
        <h2 className="mb-4">Import Data Baru</h2>
        <p className="text-secondary mb-8">Pilih cara memasukkan data transaksi harian Anda.</p>

        {error && (
          <div className="bg-red mb-4" style={{ padding: '12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={18} />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="bg-green mb-4" style={{ padding: '12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', color: '#fff' }}>
            <span className="text-sm">✅ {successMsg} <br/><span style={{opacity: 0.8, fontSize: '0.7rem'}}>Cek jika ada salah tanggal. Data dengan tanggal kembar akan ditumpuk.</span></span>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="card" style={{ padding: '24px 16px', background: 'var(--bg-tertiary)', borderStyle: 'dashed' }}>
            <Upload size={32} className="text-blue mb-4" style={{ margin: '0 auto' }} />
            <h3 className="mb-2 font-semibold">Upload CSV</h3>
            <label className="btn btn-secondary mt-2 w-full text-xs" style={{ width: '100%' }}>
              Pilih File
              <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileUpload} />
            </label>
          </div>

          <div className="card" style={{ padding: '24px 16px', background: 'var(--bg-tertiary)', borderStyle: 'dashed' }}>
            <ClipboardPaste size={32} className="text-green mb-4" style={{ margin: '0 auto' }} />
            <h3 className="mb-2 font-semibold">Paste Data</h3>
            <textarea 
              className="btn btn-secondary mt-2 w-full text-xs" 
              placeholder="Paste di sini..."
              style={{ width: '100%', resize: 'none', height: '32px', paddingTop: '8px', textAlign: 'center' }}
              onPaste={handlePaste}
            />
          </div>

          <div 
            className="card" 
            style={{ padding: '24px 16px', background: showManual ? 'rgba(56, 139, 253, 0.1)' : 'var(--bg-tertiary)', borderStyle: 'dashed', cursor: 'pointer', borderColor: showManual ? 'var(--accent-cyan)' : '' }}
            onClick={() => setShowManual(!showManual)}
          >
            <Edit3 size={32} className="text-purple mb-4" style={{ margin: '0 auto' }} />
            <h3 className="mb-2 font-semibold">Input Manual</h3>
            <button className="btn btn-secondary mt-2 w-full text-xs" style={{ width: '100%' }}>
              Isi Form Manual
            </button>
          </div>
        </div>
        
        {showManual && (
          <form onSubmit={handleManualSubmit} className="mt-8 p-6" style={{ background: 'var(--bg-tertiary)', borderRadius: '12px', textAlign: 'left' }}>
            <h3 className="font-semibold mb-4 text-purple flex items-center gap-2"><Edit3 size={18} /> Form Input Manual</h3>
            
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="form-group">
                <label className="text-xs text-secondary mb-1 block">Tanggal</label>
                <input type="date" name="date" value={manualForm.date} onChange={handleInputChange} className="input-field" required />
              </div>
              <div className="form-group">
                <label className="text-xs text-secondary mb-1 block">Kode Saham</label>
                <input type="text" name="stock" value={manualForm.stock} onChange={handleInputChange} className="input-field" placeholder="BBCA" required />
              </div>
              <div className="form-group">
                <label className="text-xs text-secondary mb-1 block">Kode Broker</label>
                <input type="text" name="broker" value={manualForm.broker} onChange={handleInputChange} className="input-field" placeholder="YP" required />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="form-group">
                <label className="text-xs text-secondary mb-1 block">Buy Value (Rp)</label>
                <NumberInput value={manualForm.buyValue} onChange={(val) => handleNumberChange('buyValue', val)} className="input-field" />
              </div>
              <div className="form-group">
                <label className="text-xs text-secondary mb-1 block">Sell Value (Rp)</label>
                <NumberInput value={manualForm.sellValue} onChange={(val) => handleNumberChange('sellValue', val)} className="input-field" />
              </div>
              <div className="form-group">
                <label className="text-xs text-secondary mb-1 block">Buy Avg</label>
                <NumberInput value={manualForm.buyAvg} onChange={(val) => handleNumberChange('buyAvg', val)} className="input-field" />
              </div>
              <div className="form-group">
                <label className="text-xs text-secondary mb-1 block">Sell Avg</label>
                <NumberInput value={manualForm.sellAvg} onChange={(val) => handleNumberChange('sellAvg', val)} className="input-field" />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="form-group">
                <label className="text-xs text-secondary mb-1 block">Harga Open</label>
                <NumberInput value={manualForm.open} onChange={(val) => handleNumberChange('open', val)} className="input-field" />
              </div>
              <div className="form-group">
                <label className="text-xs text-secondary mb-1 block">Harga High</label>
                <NumberInput value={manualForm.high} onChange={(val) => handleNumberChange('high', val)} className="input-field" />
              </div>
              <div className="form-group">
                <label className="text-xs text-secondary mb-1 block">Harga Low</label>
                <NumberInput value={manualForm.low} onChange={(val) => handleNumberChange('low', val)} className="input-field" />
              </div>
              <div className="form-group">
                <label className="text-xs text-secondary mb-1 block">Harga Close</label>
                <NumberInput value={manualForm.close} onChange={(val) => handleNumberChange('close', val)} className="input-field" />
              </div>
              <div className="form-group">
                <label className="text-xs text-secondary mb-1 block">Total Volume</label>
                <NumberInput value={manualForm.volume} onChange={(val) => handleNumberChange('volume', val)} className="input-field" />
              </div>
            </div>

            <div className="flex justify-end">
              <button type="submit" className="btn btn-primary"><PlusCircle size={18}/> Tambah Data</button>
            </div>
          </form>
        )}
        
        {!showManual && (
          <div style={{ textAlign: 'left', marginTop: '32px' }}>
            <h4 className="text-sm mb-2 text-secondary font-semibold">Format Kolom CSV/Excel:</h4>
            <p className="text-xs text-secondary">
              Date, Stock, Broker, Buy Value, Sell Value, Buy Avg, Sell Avg, Open, High, Low, Close, Volume
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
