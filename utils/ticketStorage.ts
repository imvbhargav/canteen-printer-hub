import RNFS from 'react-native-fs';
import { Ticket } from '../types';
import { writeLog } from './logger';

const FILE_PATH = `${RNFS.DocumentDirectoryPath}/tickets_journal.json`;

export const readJournalTickets = async (): Promise<Ticket[]> => {
  try {
    const exists = await RNFS.exists(FILE_PATH);
    if (!exists) return [];
    const content = await RNFS.readFile(FILE_PATH, 'utf8');
    return JSON.parse(content) as Ticket[];
  } catch {
    return [];
  }
};

export const appendJournalTicket = async (
  ticket: Ticket,
): Promise<Ticket[]> => {
  try {
    const history = await readJournalTickets();
    if (history.some((t: Ticket) => t.orderId === ticket.orderId))
      return history;

    const updated: Ticket[] = [ticket, ...history];
    await RNFS.writeFile(FILE_PATH, JSON.stringify(updated), 'utf8');
    return updated;
  } catch {
    return [];
  }
};

export const updateJournalTicketStatus = async (
  orderId: string,
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED',
): Promise<Ticket[]> => {
  try {
    const history = await readJournalTickets();
    const updated: Ticket[] = history.map((t: Ticket) =>
      t.orderId === orderId ? { ...t, status } : t,
    );

    await RNFS.writeFile(FILE_PATH, JSON.stringify(updated), 'utf8');

    if (status === 'COMPLETED') {
      forceServerStatusUpdate(orderId, status).catch((err: unknown) => {
        writeLog(
          'ERROR',
          `[NETWORK-FATAL] Pipeline drop for ${orderId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });
    }

    return updated;
  } catch (error: unknown) {
    writeLog(
      'ERROR',
      `[JOURNAL] Critical failure while saving status: ${
        error instanceof Error ? error.message : 'Unknown'
      }`,
    );
    return [];
  }
};

const forceServerStatusUpdate = async (
  orderId: string,
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED',
): Promise<void> => {
  const API_URL = `https://cm-bps.vercel.app/api/tickets/${orderId}/status`;

  // Safe math-based string generation that will never throw in a headless task
  const requestId = `REQ-${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 9)}`;

  try {
    const response: Response = await fetch(API_URL, {
      method: 'PATCH',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Request-Id': requestId,
      },
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      const fallbackText = await response.text();
      throw new Error(`HTTP ${response.status}: ${fallbackText}`);
    }
  } catch (networkError: unknown) {
    throw new Error(
      `Socket transport exception: ${
        networkError instanceof Error
          ? networkError.message
          : String(networkError)
      }`,
    );
  }
};

export const clearStaleJournalTickets = async (): Promise<Ticket[]> => {
  try {
    const history = await readJournalTickets();
    const startOfToday: Date = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayMs: number = startOfToday.getTime();

    const now: Date = new Date();
    const currentYearShort: string = now.getFullYear().toString().slice(-2);
    const currentMonth: string = String(now.getMonth() + 1).padStart(2, '0');
    const currentDay: string = String(now.getDate()).padStart(2, '0');
    const todayPrefix: number = parseInt(
      `${currentYearShort}${currentMonth}${currentDay}`,
      10,
    );

    const updated: Ticket[] = history.filter((t: Ticket) => {
      if (t.createdAt) {
        const ticketTime: number = new Date(t.createdAt).getTime();
        return ticketTime >= startOfTodayMs;
      }

      if (t.ticketReference) {
        const prodMatch: RegExpMatchArray | null =
          t.ticketReference.match(/^(\d{6})/);
        if (prodMatch && prodMatch[1]) {
          const orderDateNumber: number = parseInt(prodMatch[1], 10);
          return orderDateNumber >= todayPrefix;
        }
      }

      return false;
    });

    await RNFS.writeFile(FILE_PATH, JSON.stringify(updated), 'utf8');
    return updated;
  } catch {
    return [];
  }
};
