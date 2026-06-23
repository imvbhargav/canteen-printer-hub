import AsyncStorage from '@react-native-async-storage/async-storage';
import { DiscoveredPrinter } from './printerDiscovery';

const PRINTERS_CACHE_KEY = '@munchup_discovered_printers_cache';
const ENGINE_STATUS_KEY = '@printer_engine_status';

// Module-level variable to guarantee tracking across headless task restarts
export const headlessPrintingLocks: Record<string, boolean> = {};

export async function cacheDiscoveredPrinters(
  printers: DiscoveredPrinter[],
): Promise<void> {
  await AsyncStorage.setItem(PRINTERS_CACHE_KEY, JSON.stringify(printers));
}

export async function getCachedDiscoveredPrinters(): Promise<
  DiscoveredPrinter[]
> {
  try {
    const raw = await AsyncStorage.getItem(PRINTERS_CACHE_KEY);
    return raw ? (JSON.parse(raw) as DiscoveredPrinter[]) : [];
  } catch {
    return [];
  }
}

export async function updatePersistedEngineStatus(status: {
  connected: boolean;
  channels: string[];
  updatedAt: string;
}): Promise<void> {
  await AsyncStorage.setItem(ENGINE_STATUS_KEY, JSON.stringify(status));
}
