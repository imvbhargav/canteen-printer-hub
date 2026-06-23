import { Buffer } from 'buffer';
import {
  ReactNativePosPrinter,
  ThermalPrinterDevice,
} from 'react-native-thermal-pos-printer';
import { writeLog } from './logger';
import { DiscoveredPrinter } from './printerDiscovery';
import net from 'react-native-tcp-socket';
import { Ticket } from '../types';
import { generateReceiptBytes, formatPrice } from './printerUtils';

const activeConnections: Map<string, ThermalPrinterDevice> = new Map<
  string,
  ThermalPrinterDevice
>();

const sleep = (ms: number): Promise<void> =>
  new Promise<void>((resolve: () => void) => setTimeout(() => resolve(), ms));

const withTimeout = <T>(
  promise: Promise<T>,
  ms: number,
  fallbackError: string,
): Promise<T> => {
  return new Promise<T>(
    (resolve: (value: T) => void, reject: (reason?: any) => void) => {
      const timer: ReturnType<typeof setTimeout> = setTimeout(
        () => reject(new Error(fallbackError)),
        ms,
      );
      promise
        .then((res: T) => {
          clearTimeout(timer);
          resolve(res);
        })
        .catch((err: unknown) => {
          clearTimeout(timer);
          reject(err);
        });
    },
  );
};

const sendLAN = (address: string, bytes: Uint8Array): Promise<void> => {
  return new Promise<void>(
    (
      resolve: (value: void | PromiseLike<void>) => void,
      reject: (reason?: any) => void,
    ) => {
      const [host, portStr]: string[] = address.includes(':')
        ? address.split(':')
        : [address, '9100'];
      const port: number = parseInt(portStr, 10) || 9100;

      writeLog('INFO', `[LAN] Connecting to ${host}:${port}...`);

      let settled: boolean = false;
      const settle = (fn: () => void): void => {
        if (!settled) {
          settled = true;
          fn();
        }
      };

      const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
        client.destroy();
        settle(() =>
          reject(new Error(`[LAN] Connection to ${host}:${port} timed out`)),
        );
      }, 10000);

      const client: net.Socket = net.createConnection(
        { host, port, tls: false },
        () => {
          clearTimeout(timer);
          writeLog('INFO', `[LAN] Connected. Sending ${bytes.length} bytes...`);

          client.write(Buffer.from(bytes));

          setTimeout(() => {
            client.destroy();
            writeLog('INFO', '[LAN] Done. Socket closed.');
            settle(resolve);
          }, 800);
        },
      );

      client.on('error', (err: Error) => {
        clearTimeout(timer);
        writeLog('ERROR', `[LAN] Socket error: ${err.message}`);
        settle(() => reject(new Error(`[LAN] ${err.message}`)));
      });
    },
  );
};

const resolveConnectedDevice = async (
  type: 'BT' | 'USB',
  address: string,
  discovered?: DiscoveredPrinter,
): Promise<ThermalPrinterDevice> => {
  let device: ThermalPrinterDevice | undefined = activeConnections.get(address);
  let needsStabilization: boolean = false;

  if (device) {
    if (device.isConnected()) {
      writeLog(
        'INFO',
        `[${type}] Reusing warm connection to ${address}. Instant print.`,
      );
      return device;
    } else {
      writeLog(
        'WARN',
        `[${type}] Cached socket is dead. Evicting from pool...`,
      );
      activeConnections.delete(address);
      device = undefined;
    }
  }

  if (!device && discovered?._device) {
    writeLog(
      'INFO',
      `[${type}] Using fresh instance from scanner. Connecting...`,
    );
    device = discovered._device;
  }

  if (!device) {
    writeLog(
      'INFO',
      `[${type}] Cold start route triggered. Mounting driver channel: ${address}`,
    );
    device = await withTimeout<ThermalPrinterDevice>(
      ReactNativePosPrinter.connectPrinter(address, { timeout: 8000 }),
      8500,
      `Static connection wrapper allocation to ${address} timed out or deadlocked.`,
    );
    needsStabilization = true;
  }

  if (!device) {
    throw new Error(
      `[${type}] Could not resolve device instance reference allocations for ${address}`,
    );
  }

  if (!device.isConnected()) {
    writeLog(
      'INFO',
      `[${type}] Direct pipe link closed. Forcing connection thread descriptor...`,
    );
    await withTimeout<void>(
      device.connect({ timeout: 8000 }),
      8500,
      `Instance connection step to ${address} timed out or deadlocked.`,
    );
    needsStabilization = true;
  }

  if (needsStabilization) {
    writeLog(
      'INFO',
      `[${type}] Hardware socket opening... stabilizing channel for 2s.`,
    );
    await sleep(2000);

    if (!device.isConnected()) {
      writeLog(
        'WARN',
        `[${type}] Target port unready after baseline sleep. Forcing step-down connection retry cycle...`,
      );
      await withTimeout<void>(
        device.connect({ timeout: 8000 }),
        8500,
        'Fallback hardware retry descriptor timed out',
      );
      await sleep(1000);
    }
  }

  if (!device.isConnected()) {
    throw new Error(`[${type}] Connection rejected by printer hardware.`);
  }

  activeConnections.set(address, device);
  return device;
};

const sendViaDeviceNative = async (
  type: 'BT' | 'USB',
  address: string,
  ticket: Ticket,
  discovered?: DiscoveredPrinter,
  paperWidth: number = 48,
): Promise<void> => {
  const device: ThermalPrinterDevice = await resolveConnectedDevice(
    type,
    address,
    discovered,
  );

  try {
    writeLog('INFO', `[${type}] Sending ticket via native API...`);

    const underlineSeparator: string = '_'.repeat(paperWidth);
    const dashSeparator: string = '-'.repeat(paperWidth);

    await device.printText('BMSCW CANTEEN\n', { align: 'CENTER', bold: true });
    await device.printText('Basavanagudi\n', { align: 'CENTER' });
    await device.printText('+91 77607 62484\n', { align: 'CENTER' });
    await device.printText(`${underlineSeparator}\n`, { align: 'LEFT' });

    const timestamp: Date = new Date();
    const dateStr: string = timestamp.toLocaleDateString('en-GB');
    const timeStr: string = timestamp.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    await device.printText(`D : ${dateStr} T : ${timeStr}\n\n`, {
      align: 'LEFT',
    });

    const tokenNo: string = ticket.ticketReference || 'XXXX';
    await device.printText(`Order No / Token No : ${tokenNo}\n`, {
      align: 'LEFT',
    });
    await device.printText(`${dashSeparator}\n`, { align: 'LEFT' });

    const amtColWidth: number = 8;
    const qtyColWidth: number = 6;
    const itemNameWidth: number = paperWidth - amtColWidth - qtyColWidth;

    const headerItem: string = 'Item'.padEnd(itemNameWidth, ' ');
    const headerQty: string = 'Qty'.padStart(qtyColWidth, ' ');
    const headerAmt: string = 'Amt'.padStart(amtColWidth, ' ');
    await device.printText(`${headerItem}${headerQty}${headerAmt}\n`, {
      align: 'LEFT',
    });
    await device.printText(`${dashSeparator}\n`, { align: 'LEFT' });

    for (const item of ticket.items || []) {
      const cleanAmt: string = formatPrice(item.itemTotal);
      const cleanQty: string = String(item.quantity);
      let nameString: string = item.name;

      if (nameString.length > itemNameWidth) {
        nameString = nameString.substring(0, itemNameWidth - 3) + '...';
      } else {
        nameString = nameString.padEnd(itemNameWidth, ' ');
      }

      const colQty: string = cleanQty.padStart(qtyColWidth, ' ');
      const colAmt: string = cleanAmt.padStart(amtColWidth, ' ');

      await device.printText(`${nameString}${colQty}${colAmt}\n`, {
        align: 'LEFT',
      });
    }

    const totalLabel: string = 'TOTAL'.padEnd(paperWidth - 10, ' ');
    const rawNetTotal: string = ticket.netTotal || '0.00';
    const totalAmountFormatted: string = `\u20B9${formatPrice(rawNetTotal)}`;
    const totalValRight: string = totalAmountFormatted.padStart(10, ' ');

    await device.printText(`${dashSeparator}\n`, { align: 'LEFT' });
    await device.printText(`${totalLabel}${totalValRight}\n`, {
      align: 'LEFT',
      bold: true,
    });
    await device.printText(`${dashSeparator}\n\n\n`, { align: 'LEFT' });

    const status: { online: boolean; paperOut: boolean } =
      await device.getStatus();
    if (status.online && !status.paperOut) {
      await ReactNativePosPrinter.cutPaper();
    }

    writeLog('INFO', `[${type}] Print complete.`);
  } catch (err: unknown) {
    writeLog('WARN', `[${type}] Print failed. Evicting from active pool.`);
    activeConnections.delete(address);
    throw err;
  }
};

export const executePrintJob = async (
  type: 'LAN' | 'BT' | 'USB',
  address: string,
  ticket: Ticket,
  discovered?: DiscoveredPrinter,
): Promise<void> => {
  writeLog('INFO', `[TRANSPORT] Routing job → ${type}[${address}]`);

  switch (type) {
    case 'LAN':
      const bytes: Uint8Array = generateReceiptBytes(ticket, 48);
      return sendLAN(address, bytes);
    case 'BT':
    case 'USB':
      return sendViaDeviceNative(type, address, ticket, discovered, 48);
    default:
      throw new Error(`[TRANSPORT] Unknown printer type: ${type}`);
  }
};

export const warmPrinterConnection = async (
  type: 'BT' | 'USB',
  address: string,
): Promise<void> => {
  try {
    writeLog('INFO', `[WARMUP] Pre-connecting ${type}[${address}]`);

    const device: ThermalPrinterDevice =
      await withTimeout<ThermalPrinterDevice>(
        ReactNativePosPrinter.connectPrinter(address, { timeout: 8000 }),
        8500,
        `Warmup timed out for ${address}`,
      );

    if (device && device.isConnected()) {
      activeConnections.set(address, device);
      writeLog('INFO', `[WARMUP] ${address} pooled successfully.`);
    } else {
      writeLog(
        'WARN',
        `[WARMUP] ${address} connected but isConnected() returned false.`,
      );
    }
  } catch (err: unknown) {
    writeLog('WARN', `[WARMUP] ${address} failed: ${String(err)}`);
  }
};
