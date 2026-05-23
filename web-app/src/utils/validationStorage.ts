import localforage from 'localforage';
import type { ValidationOutcome } from '../engine/validationEngine';

export interface ManualValidationEntry {
  manualOutcome: ValidationOutcome;
  note?: string;
  updatedAt: string;
}

const MANUAL_VALIDATION_KEY = 'manual_validation_overrides';

export async function loadManualValidations(): Promise<Record<string, ManualValidationEntry>> {
  try {
    const data = await localforage.getItem<Record<string, ManualValidationEntry>>(
      MANUAL_VALIDATION_KEY
    );
    return data ?? {};
  } catch {
    return {};
  }
}

export async function saveManualValidation(
  id: string,
  entry: ManualValidationEntry
): Promise<Record<string, ManualValidationEntry>> {
  const all = await loadManualValidations();
  all[id] = entry;
  await localforage.setItem(MANUAL_VALIDATION_KEY, all);
  return all;
}

export async function clearManualValidation(id: string): Promise<Record<string, ManualValidationEntry>> {
  const all = await loadManualValidations();
  delete all[id];
  await localforage.setItem(MANUAL_VALIDATION_KEY, all);
  return all;
}

export async function clearAllManualValidations(): Promise<void> {
  await localforage.removeItem(MANUAL_VALIDATION_KEY);
}
