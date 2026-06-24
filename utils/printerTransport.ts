import { Buffer } from 'buffer';
import {
  ReactNativePosPrinter,
  ThermalPrinterDevice,
} from 'react-native-thermal-pos-printer';
import { writeLog } from './logger';
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
): Promise<ThermalPrinterDevice> => {
  let device = activeConnections.get(address);

  // 1. Check existing pool
  if (device?.isConnected()) {
    writeLog('INFO', `[${type}] Reusing warm connection to ${address}.`);
    return device;
  }

  // 2. Pool miss or silently dead socket — evict it
  if (device) {
    writeLog(
      'WARN',
      `[${type}] Dead cached socket detected. Evicting from pool.`,
    );
    activeConnections.delete(address);
  }

  // 3. Headless-Safe Cold Start: Always allocate fresh
  writeLog('INFO', `[${type}] Cold connecting to ${address}...`);
  device = await withTimeout<ThermalPrinterDevice>(
    ReactNativePosPrinter.connectPrinter(address, { timeout: 8000 }),
    8500,
    `Hardware allocation to ${address} timed out.`,
  );

  if (!device.isConnected()) {
    writeLog(
      'WARN',
      `[${type}] Allocation succeeded but port unready. Forcing connection layer...`,
    );
    await withTimeout<void>(
      device.connect({ timeout: 8000 }),
      8500,
      `Connect layer timed out`,
    );
  }

  // 4. Hardware Stabilization
  await sleep(2000);

  if (!device.isConnected()) {
    throw new Error(
      `[${type}] Connection rejected by printer hardware after stabilization.`,
    );
  }

  // 5. Cache for future jobs and the 2-minute heartbeat
  activeConnections.set(address, device);
  return device;
};

const sendViaDeviceNative = async (
  type: 'BT' | 'USB',
  address: string,
  ticket: Ticket,
  paperWidth: number = 48,
): Promise<void> => {
  const device: ThermalPrinterDevice = await resolveConnectedDevice(
    type,
    address,
  );

  try {
    writeLog('INFO', `[${type}] Sending ticket via native API...`);

    const underlineSeparator: string = '_'.repeat(paperWidth);
    const dashSeparator: string = '-'.repeat(paperWidth);

    // Header block synchronized with matching typography cases
    await device.printText('BMSCW CANTEEN\n', { align: 'CENTER', bold: true });
    await device.printText('Basavanagudi\n', { align: 'CENTER' });
    await device.printText('+91 77607 62484\n', { align: 'CENTER' });
    await device.printText(`${underlineSeparator}\n`, { align: 'CENTER' }); // Matches generateReceiptBytes formatting line string

    const timestamp: Date = ticket.createdAt
      ? new Date(ticket.createdAt)
      : new Date();
    const dateStr: string = timestamp.toLocaleDateString('en-GB');
    const timeStr: string = timestamp.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    // Center aligned timestamp line
    await device.printText(`Date: ${dateStr}   Time: ${timeStr}\n\n`, {
      align: 'CENTER',
    });

    const tokenNo: string = ticket.ticketReference || 'XXXX';
    // Emphasized Token Number block with padding feeds matching the ESC/POS layout
    await device.printText(`TOKEN: ${tokenNo}\n\n`, {
      align: 'CENTER',
      bold: true,
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

    // Dynamic right total string computation matching generateReceiptBytes string padding rules
    const rawNetTotal: string = ticket.netTotal || '0.00';
    const totalAmountFormatted: string = `Rs.${formatPrice(rawNetTotal)}`; // Replaced Unicode sign with matching Rs. string format

    const totalLabelWidth: number = paperWidth - amtColWidth;
    const totalLabel: string = 'TOTAL'.padEnd(totalLabelWidth, ' ');
    const totalValRight: string = totalAmountFormatted.padStart(
      amtColWidth,
      ' ',
    );

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
): Promise<void> => {
  writeLog('INFO', `[TRANSPORT] Routing job → ${type}[${address}]`);

  switch (type) {
    case 'LAN':
      const bytes: Uint8Array = generateReceiptBytes(ticket, 48);
      return sendLAN(address, bytes);
    case 'BT':
    case 'USB':
      return sendViaDeviceNative(type, address, ticket, 48);
    default:
      throw new Error(`[TRANSPORT] Unknown printer type: ${type}`);
  }
};

export const warmPrinterConnection = async (
  type: 'BT' | 'USB',
  address: string,
): Promise<void> => {
  try {
    const existing: ThermalPrinterDevice | undefined =
      activeConnections.get(address);
    if (existing?.isConnected()) {
      writeLog('INFO', `[WARMUP] ${address} already warm. Skipping.`);
      return;
    }

    if (existing) {
      writeLog('WARN', `[WARMUP] Evicting dead cached socket for ${address}.`);
      activeConnections.delete(address);
    }

    writeLog('INFO', `[WARMUP] Pre-connecting ${type}[${address}]`);

    const device: ThermalPrinterDevice =
      await withTimeout<ThermalPrinterDevice>(
        ReactNativePosPrinter.connectPrinter(address, { timeout: 8000 }),
        8500,
        `Warmup timed out for ${address}`,
      );

    if (!device.isConnected()) {
      await withTimeout<void>(
        device.connect({ timeout: 8000 }),
        8500,
        `Warmup connect layer timed out`,
      );
      await sleep(2000);
    }

    if (device.isConnected()) {
      activeConnections.set(address, device);
      writeLog('INFO', `[WARMUP] ${address} pooled successfully.`);
    } else {
      writeLog(
        'WARN',
        `[WARMUP] ${address} still not connected after warmup attempt.`,
      );
    }
  } catch (err: unknown) {
    writeLog('WARN', `[WARMUP] ${address} failed: ${String(err)}`);
  }
};
