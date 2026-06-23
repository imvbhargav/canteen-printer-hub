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

// Memory pool to keep hardware sockets open between Pusher events
const activeConnections = new Map<string, ThermalPrinterDevice>();

const sleep = (ms: number): Promise<void> =>
  new Promise<void>(resolve => setTimeout(() => resolve(), ms));

/**
 * Strict JS-level timeout wrapper to protect against native module deadlocks.
 */
const withTimeout = <T>(
  promise: Promise<T>,
  ms: number,
  fallbackError: string,
): Promise<T> => {
  return new Promise((resolve, reject) => {
    const timer: ReturnType<typeof setTimeout> = setTimeout(
      () => reject(new Error(fallbackError)),
      ms,
    );
    promise
      .then(res => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch(err => {
        clearTimeout(timer);
        reject(err);
      });
  });
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

      const client: ReturnType<typeof net.createConnection> =
        net.createConnection({ host, port, tls: false }, () => {
          clearTimeout(timer);
          writeLog('INFO', `[LAN] Connected. Sending ${bytes.length} bytes...`);

          client.write(Buffer.from(bytes));

          setTimeout(() => {
            client.destroy();
            writeLog('INFO', '[LAN] Done. Socket closed.');
            settle(resolve);
          }, 800);
        });

      client.on('error', (err: Error) => {
        clearTimeout(timer);
        writeLog('ERROR', `[LAN] Socket error: ${err.message}`);
        settle(() => reject(new Error(`[LAN] ${err.message}`)));
      });
    },
  );
};

// Intelligently routes traffic to warm sockets, scanner instances, or cold starts.
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

  if (!device && type === 'BT') {
    writeLog(
      'INFO',
      `[BT] Headless cold-start detected. Verifying system bonding records for MAC: ${address}`,
    );
    try {
      const pairedDevices: any[] = await ReactNativePosPrinter.getDeviceList();
      const isPaired: boolean = pairedDevices.some(
        (d: any) => d.macAddress === address || d.address === address,
      );

      if (!isPaired) {
        writeLog(
          'WARN',
          `[BT] Device ${address} is not paired in Android system settings.`,
        );
      } else {
        writeLog(
          'INFO',
          `[BT] Verified device pairing trace in system adapter registry.`,
        );
      }
    } catch (adapterErr: unknown) {
      writeLog(
        'ERROR',
        `[BT] Native adapter verification exception: ${String(adapterErr)}`,
      );
    }
  }

  if (!device) {
    writeLog(
      'INFO',
      `[${type}] Executing native initialization driver channel factory for ${address}...`,
    );
    device = await withTimeout(
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
    await withTimeout(
      device.connect({ timeout: 8000 }),
      8500,
      `Instance connection step to ${address} timed out or deadlocked.`,
    );
    needsStabilization = true;
  }

  if (needsStabilization) {
    writeLog(
      'INFO',
      `[${type}] Hardware socket opening... stabilizing for 1s.`,
    );
    await sleep(1000);
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
  paperWidth: number = 48, // Increased default from 32 to 48 for standard 80mm layouts
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

    // Structural Header Blocks
    await device.printText('BMSCW CANTEEN\n', { align: 'CENTER', bold: true });
    await device.printText('Basavanagudi\n', { align: 'CENTER' });
    await device.printText('+91 77607 62484\n', { align: 'CENTER' });
    await device.printText(`${underlineSeparator}\n`, { align: 'LEFT' });

    // Timestamps Metadata Attributes
    const timestamp = new Date();
    const dateStr: string = timestamp.toLocaleDateString('en-GB'); // DD/MM/YYYY
    const timeStr: string = timestamp.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    await device.printText(`D : ${dateStr} T : ${timeStr}\n\n`, {
      align: 'LEFT',
    });

    // Cleaned Token Block: Exclusively rely on ticketReference and modify label hierarchy
    const tokenNo: string = ticket.ticketReference || 'XXXX';
    await device.printText(`Order No / Token No : ${tokenNo}\n`, {
      align: 'LEFT',
    });
    await device.printText(`${dashSeparator}\n`, { align: 'LEFT' });

    // Grid Row Header Definition Column Mapping Rules
    const amtColWidth = 8; // Expanded spacing mapping bounds
    const qtyColWidth = 6; // Expanded spacing mapping bounds
    const itemNameWidth = paperWidth - amtColWidth - qtyColWidth;

    const headerItem = 'Item'.padEnd(itemNameWidth, ' ');
    const headerQty = 'Qty'.padStart(qtyColWidth, ' ');
    const headerAmt = 'Amt'.padStart(amtColWidth, ' ');
    await device.printText(`${headerItem}${headerQty}${headerAmt}\n`, {
      align: 'LEFT',
    });
    await device.printText(`${dashSeparator}\n`, { align: 'LEFT' });

    // Transform and Print Item Rows
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

    // Grand Totals Formatting Block
    const totalLabel = 'TOTAL'.padEnd(paperWidth - 10, ' ');
    const rawNetTotal: string = ticket.netTotal || '0.00';
    const totalAmountFormatted: string = `\u20B9${formatPrice(rawNetTotal)}`;
    const totalValRight: string = totalAmountFormatted.padStart(10, ' ');

    await device.printText(`${dashSeparator}\n`, { align: 'LEFT' });
    await device.printText(`${totalLabel}${totalValRight}\n`, {
      align: 'LEFT',
      bold: true,
    });
    await device.printText(`${dashSeparator}\n\n\n`, { align: 'LEFT' });

    // Status Queries & Hardware Cut Handlers
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
      // Uses the ESC/POS payload compiler (which also uses the updated width configuration now)
      const bytes: Uint8Array = generateReceiptBytes(ticket, 48);
      return sendLAN(address, bytes);
    case 'BT':
    case 'USB':
      // Invokes native connection execution directly
      return sendViaDeviceNative(type, address, ticket, discovered, 48);
    default:
      throw new Error(`[TRANSPORT] Unknown printer type: ${type}`);
  }
};
