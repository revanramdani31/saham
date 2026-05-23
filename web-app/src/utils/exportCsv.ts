// Export utilities for downloading data as CSV from the browser
import type { ProcessedData, RawTradeData } from '../engine/types';

function downloadCsv(filename: string, content: string) {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeCsv(val: any): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsvRow(fields: any[]): string {
  return fields.map(escapeCsv).join(',');
}

export function exportRawData(data: RawTradeData[]) {
  const headers = ['Date','Stock','Broker','Buy Value','Sell Value','Buy Avg','Sell Avg','Open','High','Low','Close','Volume'];
  const rows = data.map(d => toCsvRow([
    d.date, d.stock, d.broker, d.buyValue, d.sellValue,
    d.buyAvg, d.sellAvg, d.open, d.high, d.low, d.close, d.volume
  ]));
  downloadCsv('bandarmologi_raw_data.csv', [toCsvRow(headers), ...rows].join('\n'));
}

export function exportSignals(data: ProcessedData[]) {
  const headers = ['Date','Stock','Grade','Total Score','Phase','Signal','Behavior','Net Buy','Vol Ratio'];
  const sorted = [...data].sort((a, b) => b.score.totalScore - a.score.totalScore);
  const rows = sorted.map(d => toCsvRow([
    d.raw.date, d.raw.stock, d.score.grade, d.score.totalScore.toFixed(1),
    d.phase.phase, d.score.signal, d.behavior.behaviorLabel,
    d.flow.netBuy, d.volume.volRatio.toFixed(2)
  ]));
  downloadCsv('bandarmologi_signals.csv', [toCsvRow(headers), ...rows].join('\n'));
}

export function exportBrokerFlow(data: ProcessedData[]) {
  const headers = ['Date','Stock','Broker','Net Buy','Buy Ratio','Sell Ratio','Mkt Share','Signal','Domination'];
  const sorted = [...data].sort((a, b) => new Date(b.raw.date).getTime() - new Date(a.raw.date).getTime());
  const rows = sorted.map(d => toCsvRow([
    d.raw.date, d.raw.stock, d.raw.broker,
    d.flow.netBuy, (d.flow.buyRatio * 100).toFixed(1) + '%',
    (d.flow.sellRatio * 100).toFixed(1) + '%',
    (d.flow.brokerMktShare * 100).toFixed(1) + '%',
    d.flow.signal, d.flow.domination
  ]));
  downloadCsv('bandarmologi_broker_flow.csv', [toCsvRow(headers), ...rows].join('\n'));
}
