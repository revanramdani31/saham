import localforage from 'localforage';
import type { RawTradeData } from '../engine/types';

localforage.config({
  name: 'BandarmologiApp',
  storeName: 'trade_data',
});

const RAW_DATA_KEY = 'raw_trade_data';

export async function saveRawData(newData: RawTradeData[]): Promise<RawTradeData[]> {
  try {
    const existingData: RawTradeData[] | null = await localforage.getItem(RAW_DATA_KEY);
    
    let combinedData: RawTradeData[] = [];
    if (existingData && existingData.length > 0) {
      // Create a unique key for each row to prevent duplicates (Date + Stock + Broker)
      const dataMap = new Map<string, RawTradeData>();
      
      existingData.forEach(d => {
        dataMap.set(`${d.date}-${d.stock}-${d.broker}`, d);
      });
      
      newData.forEach(d => {
        dataMap.set(`${d.date}-${d.stock}-${d.broker}`, d);
      });
      
      combinedData = Array.from(dataMap.values());
    } else {
      combinedData = [...newData];
    }
    
    await localforage.setItem(RAW_DATA_KEY, combinedData);
    return combinedData;
  } catch (error) {
    console.error('Error saving data:', error);
    throw error;
  }
}

export async function loadRawData(): Promise<RawTradeData[]> {
  try {
    const data: RawTradeData[] | null = await localforage.getItem(RAW_DATA_KEY);
    return data || [];
  } catch (error) {
    console.error('Error loading data:', error);
    return [];
  }
}

export async function clearRawData(): Promise<void> {
  try {
    await localforage.removeItem(RAW_DATA_KEY);
  } catch (error) {
    console.error('Error clearing data:', error);
    throw error;
  }
}

export async function deleteSingleRow(date: string, stock: string, broker: string): Promise<RawTradeData[]> {
  try {
    const existingData: RawTradeData[] | null = await localforage.getItem(RAW_DATA_KEY);
    if (!existingData) return [];
    
    const newData = existingData.filter(d => 
      !(d.date === date && d.stock === stock && d.broker === broker)
    );
    
    await localforage.setItem(RAW_DATA_KEY, newData);
    return newData;
  } catch (error) {
    console.error('Error deleting single row:', error);
    throw error;
  }
}

export async function updateSingleRow(oldDate: string, oldStock: string, oldBroker: string, newData: RawTradeData): Promise<RawTradeData[]> {
  try {
    const existingData: RawTradeData[] | null = await localforage.getItem(RAW_DATA_KEY);
    if (!existingData) return [];
    
    const index = existingData.findIndex(d => 
      d.date === oldDate && d.stock === oldStock && d.broker === oldBroker
    );
    
    if (index !== -1) {
      existingData[index] = newData;
      await localforage.setItem(RAW_DATA_KEY, existingData);
    }
    return existingData;
  } catch (error) {
    console.error('Error updating single row:', error);
    throw error;
  }
}

export async function deleteStockData(stock: string): Promise<RawTradeData[]> {
  try {
    const existingData: RawTradeData[] | null = await localforage.getItem(RAW_DATA_KEY);
    if (!existingData) return [];
    
    const newData = existingData.filter(d => d.stock !== stock);
    
    await localforage.setItem(RAW_DATA_KEY, newData);
    return newData;
  } catch (error) {
    console.error('Error deleting stock data:', error);
    throw error;
  }
}
