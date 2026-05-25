import type { ValidationRecord } from './validationEngine';

export interface ScoringWeights {
  base: number;
  brokerFlowMax: number;
  volumeMax: number;
  phaseMax: number;
  behaviorMax: number;
  priceMax: number;
  calibratedAt: string;
  sampleSize: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  base: 20,
  brokerFlowMax: 30,
  volumeMax: 15,
  phaseMax: 15,
  behaviorMax: 10,
  priceMax: 10,
  calibratedAt: '',
  sampleSize: 0,
};

/**
 * Kalibrasi bobot sederhana dari histori validasi (bukan ML penuh).
 * Menyesuaikan skala broker flow & phase berdasarkan akurasi per verdict.
 */
export function calibrateWeightsFromValidation(
  records: ValidationRecord[],
  getOutcome: (r: ValidationRecord) => string
): ScoringWeights {
  const weights = { ...DEFAULT_WEIGHTS };
  const decisive = records.filter((r) => {
    const o = getOutcome(r);
    return o === 'BENAR' || o === 'SALAH';
  });

  if (decisive.length < 20) {
    return weights;
  }

  const buyVerdicts = ['STRONG BUY', 'BUY'];
  const buyRecords = decisive.filter((r) => buyVerdicts.includes(r.verdict));
  const buyCorrect = buyRecords.filter((r) => getOutcome(r) === 'BENAR').length;
  const buyAccuracy = buyRecords.length > 0 ? buyCorrect / buyRecords.length : 0.5;

  // Jika akurasi BUY rendah, kurangi agresivitas broker flow & phase
  if (buyAccuracy < 0.45) {
    weights.brokerFlowMax = 22;
    weights.phaseMax = 10;
  } else if (buyAccuracy > 0.65) {
    weights.brokerFlowMax = 32;
    weights.phaseMax = 18;
  }

  weights.calibratedAt = new Date().toISOString();
  weights.sampleSize = decisive.length;
  return weights;
}
