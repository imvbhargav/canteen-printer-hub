import { Platform, PermissionsAndroid } from 'react-native';
import { Ticket } from '../types';
import { writeLog } from './logger';
import { executePrintJob } from './printerTransport';

export const generateMockTicket = (counterId: string): Ticket => ({
  orderId: `TEST-${Date.now().toString().slice(-6)}`,
  counterId,
  ticketReference: `TX-${Math.floor(Math.random() * 900) + 100}`,
  netTotal: '10.00',
  createdAt: new Date().toISOString(),
  items: [
    {
      name: 'ITEM TEST',
      quantity: 1,
      unitPrice: '10.00',
      itemTotal: '10.00',
    },
  ],
  status: 'COMPLETED',
});

export const runHardwarePrint = async (
  type: string,
  address: string,
  ticket: Ticket,
): Promise<void> => {
  writeLog(
    'INFO',
    `[PRINT] Initiating print to ${type}[${address}] — Ref: ${ticket.ticketReference}`,
  );
  await executePrintJob(type as 'LAN' | 'BT' | 'USB', address, ticket);
  writeLog('INFO', `[PRINT] Print successful → ${type}[${address}]`);
};

export const ensureNotificationPermission = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;
  // @ts-ignore
  if (Platform.Version < 33) return true;
  try {
    const granted = await PermissionsAndroid.request(
      'android.permission.POST_NOTIFICATIONS',
      {
        title: 'Notifications Required',
        message:
          'Printer Server needs to show a persistent notification to keep the background print queue alive.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
        buttonNeutral: 'Ask Later',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (e: unknown) {
    console.warn('Notification permission request failed:', e);
    return false;
  }
};
