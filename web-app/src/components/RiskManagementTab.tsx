import { useState } from 'react';
import { Calculator, AlertTriangle, ShieldCheck } from 'lucide-react';
import { formatCompact, formatPrice } from '../utils/format';

export function RiskManagementTab() {
  const [capital, setCapital] = useState<string>('100000000');
  const [riskPercent, setRiskPercent] = useState<string>('2');
  const [entryPrice, setEntryPrice] = useState<string>('');
  const [stopLoss, setStopLoss] = useState<string>('');
  const [stockCode, setStockCode] = useState<string>('');

  const numCapital = Number(capital) || 0;
  const numRisk = Number(riskPercent) || 0;
  const numEntry = Number(entryPrice) || 0;
  const numSl = Number(stopLoss) || 0;

  // Calculations
  const maxRiskAmount = numCapital * (numRisk / 100);
  
  // Risk per share
  const riskPerShare = numEntry - numSl;
  const riskPercentPerShare = numEntry > 0 ? (riskPerShare / numEntry) * 100 : 0;
  
  // Position sizing
  let maxShares = 0;
  if (riskPerShare > 0) {
    maxShares = Math.floor(maxRiskAmount / riskPerShare);
  }
  const maxLots = Math.floor(maxShares / 100);
  
  const positionValue = maxLots * 100 * numEntry;
  const positionPercent = numCapital > 0 ? (positionValue / numCapital) * 100 : 0;
  
  const isValidTrade = riskPerShare > 0 && numEntry > 0 && positionValue <= numCapital;

  return (
    <div className="main-content">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-gradient">Risk Management Calculator</h1>
          <p className="text-secondary text-sm">Hitung position sizing dan kelola batas risiko Anda sebelum melakukan trade.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-8">
        {/* Form Kalkulator */}
        <div className="card">
          <div className="flex items-center gap-2 mb-6">
            <Calculator className="text-blue" size={20} />
            <h3 className="font-semibold">Parameter Trading</h3>
          </div>
          
          <div className="form-group mb-4">
            <label className="text-sm text-secondary mb-1 block">Total Modal (Rp)</label>
            <input 
              type="number" 
              value={capital}
              onChange={(e) => setCapital(e.target.value)}
              className="input-field" 
            />
          </div>
          
          <div className="form-group mb-4">
            <label className="text-sm text-secondary mb-1 block">Risiko per Trade (%)</label>
            <input 
              type="number" 
              value={riskPercent}
              onChange={(e) => setRiskPercent(e.target.value)}
              className="input-field" 
              max="10"
              step="0.1"
            />
            <p className="text-xs text-secondary mt-1">Disarankan: 1% - 3%</p>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="form-group">
              <label className="text-sm text-secondary mb-1 block">Kode Saham</label>
              <input 
                type="text" 
                value={stockCode}
                onChange={(e) => setStockCode(e.target.value.toUpperCase())}
                className="input-field" 
                placeholder="Mis: BBCA"
              />
            </div>
            <div className="form-group">
              <label className="text-sm text-secondary mb-1 block">Entry Price (Rp)</label>
              <input 
                type="number" 
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                className="input-field" 
                placeholder="0"
              />
            </div>
            <div className="form-group">
              <label className="text-sm text-secondary mb-1 block">Stop Loss (Rp)</label>
              <input 
                type="number" 
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                className="input-field" 
                placeholder="0"
              />
            </div>
          </div>
        </div>

        {/* Hasil Kalkulasi */}
        <div className="card">
          <div className="flex items-center gap-2 mb-6">
            <ShieldCheck className="text-green" size={20} />
            <h3 className="font-semibold">Trading Plan</h3>
          </div>

          {!isValidTrade ? (
            <div className="bg-yellow text-black p-4 rounded-lg flex items-start gap-3">
              <AlertTriangle size={24} className="mt-1" />
              <div>
                <h4 className="font-bold">Data Belum Lengkap/Valid</h4>
                <p className="text-sm">Pastikan Entry Price lebih besar dari Stop Loss dan Modal mencukupi.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
                <p className="text-sm text-secondary mb-1">Maksimal Risiko (Rp)</p>
                <h2 className="text-red font-bold text-2xl">-Rp {formatCompact(maxRiskAmount)}</h2>
                <p className="text-xs text-secondary mt-1">Jarak Stop Loss: -{riskPercentPerShare.toFixed(2)}%</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
                  <p className="text-sm text-secondary mb-1">Maksimal Beli (Lot)</p>
                  <h2 className="text-green font-bold text-2xl">{formatPrice(maxLots)} Lot</h2>
                  <p className="text-xs text-secondary mt-1">({formatPrice(maxShares)} lembar)</p>
                </div>
                <div className="p-4 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
                  <p className="text-sm text-secondary mb-1">Alokasi Modal (Rp)</p>
                  <h2 className="text-blue font-bold text-2xl">Rp {formatCompact(positionValue)}</h2>
                  <p className="text-xs text-secondary mt-1">{positionPercent.toFixed(1)}% dari Total Modal</p>
                </div>
              </div>

              {stockCode && (
                <div className="mt-6 p-4 rounded-lg border border-green bg-[rgba(46,160,67,0.1)]">
                  <h4 className="font-bold text-green mb-2">💡 Eksekusi Plan: {stockCode}</h4>
                  <ul className="text-sm text-secondary space-y-1">
                    <li>1. Beli maksimal <strong>{formatPrice(maxLots)} Lot</strong> di harga <strong>Rp {formatPrice(numEntry)}</strong>.</li>
                    <li>2. Set Auto-Reject / Stop Loss di harga <strong>Rp {formatPrice(numSl)}</strong>.</li>
                    <li>3. Jika terkena Stop Loss, kerugian maksimal Anda adalah <strong>Rp {formatCompact(maxRiskAmount)}</strong> ({numRisk}% dari modal).</li>
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
