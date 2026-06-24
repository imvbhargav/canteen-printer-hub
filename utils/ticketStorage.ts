import RNFS from 'react-native-fs';
import { Ticket, TicketStatus } from '../types';
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
    if (
      history.some(
        (t: Ticket) =>
          t.orderId === ticket.orderId ||
          (t.ticketReference && t.ticketReference === ticket.ticketReference),
      )
    )
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
  status: TicketStatus,
): Promise<Ticket[]> => {
  try {
    const history = await readJournalTickets();
    const updated: Ticket[] = history.map((t: Ticket) =>
      t.orderId === orderId || t.ticketReference === orderId
        ? { ...t, status }
        : t,
    );

    await RNFS.writeFile(FILE_PATH, JSON.stringify(updated), 'utf8');

    if (['PENDING', 'COMPLETED', 'PRINTING'].includes(status)) {
      await forceServerStatusUpdateWithRetry(orderId, status);
    }

    return updated;
  } catch (error: unknown) {
    writeLog(
      'ERROR',
      `[JOURNAL-CRITICAL] Failure during status processing: ${
        error instanceof Error ? error.message : 'Unknown'
      }`,
    );
    throw error;
  }
};

const forceServerStatusUpdateWithRetry = async (
  orderId: string,
  status: TicketStatus,
): Promise<void> => {
  const API_URL = `https://cm-bps.vercel.app/api/tickets/${orderId}/status`;

  await fetchWithBackoff(() =>
    fetch(API_URL, {
      method: 'PATCH',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Engine-Token':
          '38d6960a32cda66ce327d44d358755f706420303e11825a34eca38544a07e2c7',
      },
      body: JSON.stringify({ status }),
    }),
  );
};

export const fetchWithBackoff = async (
  task: () => Promise<Response>,
  maxAttempts = 5,
  baseDelayMs = 2000,
): Promise<Response> => {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await task();
      if (response.ok) {
        return response;
      }
      const text = await response.text().catch(() => 'No body context');
      throw new Error(`HTTP ${response.status}: ${text}`);
    } catch (error) {
      lastError = error;
      writeLog(
        'WARN',
        `[NETWORK-RETRY] Attempt ${attempt}/${maxAttempts} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        await new Promise<void>(resolve => setTimeout(() => resolve(), delay));
      }
    }
  }
  throw lastError;
};

export const clearStaleJournalTickets = async (): Promise<Ticket[]> => {
  try {
    const history = await readJournalTickets();
    const startOfToday: Date = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayMs: number = startOfToday.getTime();

    const now: Date = new Date();
    const currentYearLong = now.getFullYear().toString(); // Matches 4 digit "2026"
    const currentMonth: string = String(now.getMonth() + 1).padStart(2, '0');
    const currentDay: string = String(now.getDate()).padStart(2, '0');
    const todayPrefix: number = parseInt(
      `${currentYearLong}${currentMonth}${currentDay}`,
      10,
    );

    const updated: Ticket[] = history.filter((t: Ticket) => {
      if (t.createdAt) {
        const ticketTime: number = new Date(t.createdAt).getTime();
        return ticketTime >= startOfTodayMs;
      }

      if (t.ticketReference) {
        // Updated regex to catch both 6-digit (YYMMDD) and 8-digit (YYYYMMDD) prefixes cleanly
        const prodMatch: RegExpMatchArray | null =
          t.ticketReference.match(/^(\d{6,8})/);
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

/**
 * Deduplicates and merges arrays of tickets by orderId or ticketReference,
 * updating statuses based on server final states and handling the 10-minute retry window.
 */
export const mergeJournalTickets = async (
  fetchedTickets: Ticket[],
): Promise<Ticket[]> => {
  try {
    const history = await readJournalTickets();
    const updatedHistory = [...history];
    const TEN_MINUTES_MS = 10 * 60 * 1000;
    const nowMs = Date.now();

    for (const fetched of fetchedTickets) {
      // FIX: Check match across both possible identification fields safely
      const existingIndex = updatedHistory.findIndex(
        (t: Ticket) =>
          (fetched.orderId && t.orderId === fetched.orderId) ||
          (fetched.ticketReference &&
            t.ticketReference === fetched.ticketReference),
      );

      const ticketCreatedAtMs = new Date(fetched.createdAt ?? nowMs).getTime();
      const isExpired = nowMs - ticketCreatedAtMs > TEN_MINUTES_MS;

      const serverStatus: TicketStatus = fetched.status ?? 'PENDING';
      let targetStatus: TicketStatus = serverStatus;

      if (['PENDING', 'PRINTING'].includes(serverStatus) && isExpired) {
        targetStatus = 'CANCELLED';
      }

      if (existingIndex === -1) {
        updatedHistory.unshift({
          ...fetched,
          status: targetStatus,
        });
      } else {
        const localTicket = updatedHistory[existingIndex];

        if (
          ['COMPLETED', 'CANCELLED'].includes(serverStatus) ||
          localTicket.status !== targetStatus
        ) {
          updatedHistory[existingIndex] = {
            ...localTicket,
            ...fetched,
            status: targetStatus,
          };
        }
      }
    }

    updatedHistory.sort(
      (a, b) =>
        new Date(b.createdAt ?? 0).getTime() -
        new Date(a.createdAt ?? 0).getTime(),
    );

    await RNFS.writeFile(FILE_PATH, JSON.stringify(updatedHistory), 'utf8');
    return updatedHistory;
  } catch {
    return [];
  }
};

/**
 * Parses sequential IDs to find numerical missing counter items safely.
 * Matches both 4-digit and 2-digit sequence headers dynamically.
 */
const calculateMissingSequences = (
  oldestId: string,
  newestId: string,
): string[] => {
  const missing: string[] = [];

  // FIX: Regex adjusted to safely capture optional full 4-digit year prefix (e.g. "20260622A")
  const matchOld = oldestId.match(/^([A-Z0-9]+[A-Z])(\d+)$/i);
  const matchNew = newestId.match(/^([A-Z0-9]+[A-Z])(\d+)$/i);

  if (!matchOld || !matchNew) return [];

  const [_, prefixOld, numStrOld] = matchOld;
  const [__, prefixNew, numStrNew] = matchNew;

  if (prefixOld !== prefixNew) return [];

  const startNum = parseInt(numStrOld, 10);
  const endNum = parseInt(numStrNew, 10);
  const padLength = numStrOld.length;

  for (let i = startNum + 1; i < endNum; i++) {
    const nextNumStr = String(i).padStart(padLength, '0');
    missing.push(`${prefixOld}${nextNumStr}`);
  }

  return missing;
};

export const reconcileMissingJournalTickets = async (): Promise<Ticket[]> => {
  try {
    const history = await readJournalTickets();

    let lastSeenOrderId: string | null = null;
    let missingOrderIds: string[] = [];

    if (history.length > 0) {
      const chronological = [...history].sort(
        (a, b) =>
          new Date(a.createdAt ?? 0).getTime() -
          new Date(b.createdAt ?? 0).getTime(),
      );

      lastSeenOrderId = chronological[chronological.length - 1].orderId;

      for (let i = 0; i < chronological.length - 1; i++) {
        const gapSlots = calculateMissingSequences(
          chronological[i].orderId,
          chronological[i + 1].orderId,
        );
        missingOrderIds = [...missingOrderIds, ...gapSlots];
      }
    }

    writeLog(
      'INFO',
      `[RECONCILE] Checking server pipeline. Gaps calculated: ${missingOrderIds.length}`,
    );

    const syncResponse = await fetchWithBackoff(() =>
      fetch('https://cm-bps.vercel.app/api/engine/sync', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Engine-Token':
            '38d6960a32cda66ce327d44d358755f706420303e11825a34eca38544a07e2c7',
        },
        body: JSON.stringify({
          lastSeenOrderId,
          missingOrderIds,
        }),
      }),
    );

    const jsonResult = await syncResponse.json();
    if (jsonResult.success && Array.isArray(jsonResult.data)) {
      writeLog(
        'INFO',
        `[RECONCILE] Recovered ${jsonResult.data.length} tickets securely from back-channel endpoints.`,
      );
      const updatedList = await mergeJournalTickets(jsonResult.data);
      return updatedList;
    }

    return history;
  } catch (error) {
    writeLog(
      'ERROR',
      `[RECONCILE-FATAL] Failed to catch up missing transactions: ${String(
        error,
      )}`,
    );
    return [];
  }
};
