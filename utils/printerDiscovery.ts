import { Platform, PermissionsAndroid } from 'react-native';
import { writeLog } from './logger';
import {
  ReactNativePosPrinter,
  ThermalPrinterDevice,
  ThermalPrinterNativeDevice,
} from 'react-native-thermal-pos-printer';

export interface DiscoveredPrinter {
  id: string;
  name: string;
  type: 'LAN' | 'BT' | 'USB';
  address: string;
  _device?: ThermalPrinterDevice;
}

export const requestBluetoothPermissions = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    writeLog('WARN', `[BT] Bluetooth unsupported on platform: ${Platform.OS}`);
    return false;
  }

  writeLog(
    'INFO',
    `[BT] Requesting permissions (Android API ${Platform.Version})`,
  );

  if (Platform.Version >= 31) {
    const granted: Record<string, string> =
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);
    const scan: boolean =
      granted['android.permission.BLUETOOTH_SCAN'] ===
      PermissionsAndroid.RESULTS.GRANTED;
    const connect: boolean =
      granted['android.permission.BLUETOOTH_CONNECT'] ===
      PermissionsAndroid.RESULTS.GRANTED;
    writeLog(
      scan && connect ? 'INFO' : 'WARN',
      `[BT] BLUETOOTH_SCAN=${scan ? 'GRANTED' : 'DENIED'} | BLUETOOTH_CONNECT=${
        connect ? 'GRANTED' : 'DENIED'
      }`,
    );
    return scan && connect;
  } else {
    const result: string = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    const ok: boolean = result === PermissionsAndroid.RESULTS.GRANTED;
    writeLog(
      ok ? 'INFO' : 'WARN',
      `[BT] ACCESS_FINE_LOCATION=${ok ? 'GRANTED' : 'DENIED'}`,
    );
    return ok;
  }
};

const BT_MAJOR_CLASS_IMAGING = 6;
const BT_MINOR_CLASS_PRINTER_BIT = 32;

const classifyByCoD = (
  rawClass: string | number | null | undefined,
): 'PRINTER' | 'NON_PRINTER' | 'UNKNOWN' => {
  if (rawClass === null || rawClass === undefined || rawClass === '') {
    return 'UNKNOWN';
  }

  const cod: number =
    typeof rawClass === 'number'
      ? rawClass
      : parseInt(String(rawClass), String(rawClass).startsWith('0x') ? 16 : 10);

  if (isNaN(cod)) return 'UNKNOWN';

  const majorClass: number = Math.floor(cod / 256) % 32;
  const minorClass: number = Math.floor(cod / 4) % 64;

  if (majorClass !== BT_MAJOR_CLASS_IMAGING) return 'NON_PRINTER';

  const hasPrinterBit: boolean =
    minorClass % (BT_MINOR_CLASS_PRINTER_BIT * 2) >= BT_MINOR_CLASS_PRINTER_BIT;

  return hasPrinterBit ? 'PRINTER' : 'PRINTER';
};

const AUDIO_DEVICE_KEYWORDS: string[] = [
  'AIRPODS',
  'HEADPHONE',
  'EARPHONE',
  'EARBUDS',
];

const isObviousAudioDevice = (name: string): boolean => {
  const upper: string = name.toUpperCase();
  return AUDIO_DEVICE_KEYWORDS.some((kw: string) => upper.includes(kw));
};

const extractDeviceInfo = (
  device: ThermalPrinterDevice,
): { name: string; address: string; rawType: string } => {
  const name: string = device.getName() || 'Unknown Printer';
  const address: string = device.getAddress() || '';
  const rawType: string = (device.getType() || '').toUpperCase();
  return { name, address, rawType };
};

export const scanBluetoothPrinters = (
  onDeviceFound: (device: DiscoveredPrinter) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  let cancelled: boolean = false;
  const seen: Set<string> = new Set<string>();

  const run = async (): Promise<void> => {
    try {
      const ok: boolean = await requestBluetoothPermissions();
      if (!ok) throw new Error('Bluetooth permissions denied.');

      writeLog('INFO', '[BT] Initialising printer module...');
      await ReactNativePosPrinter.init();

      writeLog('INFO', '[BT] Fetching device list...');
      const devices: ThermalPrinterDevice[] =
        await ReactNativePosPrinter.getDeviceList();
      writeLog(
        'INFO',
        `[BT] ${devices.length} device(s) returned. Filtering for BT...`,
      );

      if (cancelled) return;

      let found: number = 0;
      devices.forEach((device: ThermalPrinterDevice) => {
        const { name, address, rawType } = extractDeviceInfo(device);
        const isBT: boolean = rawType === 'BLUETOOTH' || rawType === 'BT';

        if (!isBT) {
          return;
        }

        const rawClass: string | number | null | undefined =
          (device as any).deviceClass ?? null;
        const codResult = classifyByCoD(rawClass);

        let isAccepted: boolean;
        let filterReason: string;

        if (codResult === 'PRINTER') {
          isAccepted = true;
          filterReason = 'ACCEPTED (CoD=printer/imaging)';
        } else if (codResult === 'NON_PRINTER') {
          isAccepted = false;
          filterReason = 'FILTERED (CoD=non-printer)';
        } else {
          const isObviousAudio: boolean = isObviousAudioDevice(name);
          isAccepted = !isObviousAudio;
          filterReason = isObviousAudio
            ? 'FILTERED (CoD=unknown, name=obvious-audio)'
            : 'ACCEPTED (CoD=unknown, name=no-match)';
        }

        writeLog(
          isAccepted ? 'INFO' : 'WARN',
          `[BT] ${filterReason} | name="${name}" addr="${address}" class="${
            rawClass ?? 'N/A'
          }"`,
        );

        if (!isAccepted || !address || seen.has(address)) return;
        seen.add(address);
        found++;

        onDeviceFound({
          id: address,
          name,
          type: 'BT',
          address,
          _device: device,
        });
      });

      writeLog('INFO', `[BT] Scan complete. ${found} BT printer(s) surfaced.`);
    } catch (err: unknown) {
      const msg: string = err instanceof Error ? err.message : String(err);
      writeLog('ERROR', `[BT] Error: ${msg}`);
      onError?.(err instanceof Error ? err : new Error(msg));
    }
  };

  run();

  return (): void => {
    cancelled = true;
    writeLog('INFO', '[BT] Teardown requested.');
  };
};

export const scanUsbPrinters = async (
  onDeviceFound: (device: DiscoveredPrinter) => void,
): Promise<void> => {
  try {
    writeLog('INFO', '[USB] Initialising printer module for USB scan...');
    await ReactNativePosPrinter.init();

    const devices: ThermalPrinterDevice[] =
      await ReactNativePosPrinter.getDeviceList();
    writeLog(
      'INFO',
      `[USB] ${devices.length} total device(s) returned. Filtering for USB...`,
    );

    let found: number = 0;
    devices.forEach((device: ThermalPrinterDevice) => {
      const { name, address, rawType } = extractDeviceInfo(device);
      const native: ThermalPrinterNativeDevice = device.getDevice();
      const vendorId: string =
        (native as any).vendor_id || (native as any).vendorId || '';
      const productId: string =
        (native as any).product_id || (native as any).productId || '';
      const resolvedAddress: string = address || `${vendorId}:${productId}`;

      writeLog(
        rawType === 'USB' ? 'INFO' : 'WARN',
        `[USB] ${
          rawType === 'USB' ? 'ACCEPTED' : 'SKIPPED'
        } | name="${name}" addr="${resolvedAddress}" vendor=${vendorId} product=${productId}`,
      );

      if (rawType !== 'USB' || !resolvedAddress) return;
      found++;

      onDeviceFound({
        id: resolvedAddress,
        name,
        type: 'USB',
        address: resolvedAddress,
        _device: device,
      });
    });

    if (found === 0) {
      writeLog(
        'WARN',
        '[USB] No USB printers found. Ensure OTG cable is connected and USB host mode is active.',
      );
    } else {
      writeLog('INFO', `[USB] ${found} USB printer(s) surfaced.`);
    }
  } catch (err: unknown) {
    const msg: string = err instanceof Error ? err.message : String(err);
    writeLog('ERROR', `[USB] Scan failed: ${msg}`);
  }
};
