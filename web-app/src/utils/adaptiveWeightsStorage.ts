import localforage from 'localforage';
import type { ScoringWeights } from '../engine/adaptiveScoring';

const WEIGHTS_KEY = 'adaptive_scoring_weights';

export async function loadScoringWeights(): Promise<ScoringWeights | null> {
  return localforage.getItem<ScoringWeights>(WEIGHTS_KEY);
}

export async function saveScoringWeights(weights: ScoringWeights): Promise<void> {
  await localforage.setItem(WEIGHTS_KEY, weights);
}

export async function clearScoringWeights(): Promise<void> {
  await localforage.removeItem(WEIGHTS_KEY);
}
