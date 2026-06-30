import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert, DeviceEventEmitter } from 'react-native';
import { Pusher, PusherEvent } from '@pusher/pusher-websocket-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactNativeForegroundService from '@supersami/rn-foreground-service';

import { Ticket, CounterConfig } from '../types';
import {
  requestBluetoothPermissions,
  scanBluetoothPrinters,
  scanUsbPrinters,
  DiscoveredPrinter,
} from '../utils/printerDiscovery';
import { writeLog, readTodayLogs, LogEntry } from '../utils/logger';
import { executePrintJob, warmPrinterConnection } from '../utils/printerTransport';
import {
  readJournalTickets,
  updateJournalTicketStatus,
  clearStaleJournalTickets,
  appendJournalTicket,
  reconcileMissingJournalTickets,
} from '../utils/ticketStorage';
import { getEngineConfig } from '../utils/engineConfig';
import {
  cacheDiscoveredPrinters,
  headlessPrintingLocks,
  updatePersistedEngineStatus,
} from '../utils/engineState';

import {
  ScanPhase,
  HardwareTab,
  EngineStatus,
  scanPhaseConfig,
} from '../components/theme';

import {
  generateMockTicket,
  runHardwarePrint,
  ensureNotificationPermission,
} from '../utils/printingHelpers';

export const usePrinterEngine = () => {
  const apiUrl: string = 'https://cm-bps.vercel.app';

  const [activeTab, setActiveTab] = useState<'HARDWARE' | 'QUEUE' | 'LOGS'>(
    'QUEUE',
  );
  const [hardwareTab, setHardwareTab] = useState<HardwareTab>('REGISTERED');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [counters, setCounters] = useState<CounterConfig[]>([]);
  const [discoveredPrinters, setDiscoveredPrinters] = useState<
    DiscoveredPrinter[]
  >([]);
  const [scanPhase, setScanPhase] = useState<ScanPhase>('idle');
  const [selectedUnlinked, setSelectedUnlinked] =
    useState<DiscoveredPrinter | null>(null);
  const [newCounterNum, setNewCounterNum] = useState<string>('');
  const [newCounterName, setNewCounterName] = useState<string>('');
  const [manualIp, setManualIp] = useState<string>('');
  const [isServerRunning, setIsServerRunning] = useState<boolean>(false);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>({
    connected: false,
    channels: [],
    updatedAt: '',
  });

  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [inputEngineId, setInputEngineId] = useState<string>('');
  const [inputPriority, setInputPriority] = useState<string>('1');

  const countersRef = useRef<CounterConfig[]>([]);
  const discoveredPrintersRef = useRef<DiscoveredPrinter[]>([]);
  const logsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getEngineConfig().then(cfg => {
      if (cfg) {
        setInputEngineId(cfg.id);
        setInputPriority(String(cfg.priority));
      }
    });
  }, []);

  const syncJournalUI = useCallback(async (): Promise<void> => {
    const journalData: Ticket[] = await readJournalTickets();
    setTickets(journalData);

    try {
      const storedMeta: string | null = await AsyncStorage.getItem(
        '@printer_engine_status',
      );
      if (storedMeta) {
        setEngineStatus(JSON.parse(storedMeta) as EngineStatus);
      } else {
        setEngineStatus({ connected: false, channels: [], updatedAt: '' });
      }
    } catch {}
  }, []);

  const refreshLogs = useCallback(async (): Promise<void> => {
    const data: LogEntry[] = await readTodayLogs();
    setLogs(data);
  }, []);

  useEffect(() => {
    syncJournalUI();

    let uiPollInterval: ReturnType<typeof setInterval> | null = null;
    if (activeTab === 'QUEUE' || activeTab === 'HARDWARE') {
      uiPollInterval = setInterval(() => {
        syncJournalUI();
      }, 2000);
    }

    const sub = DeviceEventEmitter.addListener('JOURNAL_UPDATED', () => {
      syncJournalUI();
    });

    return () => {
      sub.remove();
      if (uiPollInterval) clearInterval(uiPollInterval);
    };
  }, [activeTab, syncJournalUI]);

  useEffect(() => {
    if (activeTab === 'LOGS') {
      refreshLogs();
      logsIntervalRef.current = setInterval(() => {
        refreshLogs();
      }, 3000);
    } else {
      if (logsIntervalRef.current) {
        clearInterval(logsIntervalRef.current);
        logsIntervalRef.current = null;
      }
    }

    return () => {
      if (logsIntervalRef.current) {
        clearInterval(logsIntervalRef.current);
        logsIntervalRef.current = null;
      }
    };
  }, [activeTab, refreshLogs]);

  const executePrint = useCallback(async (ticket: Ticket): Promise<void> => {
    const orderTime = ticket.createdAt
      ? new Date(ticket.createdAt).getTime()
      : 0;
    if (Date.now() - orderTime >= 10 * 60 * 1000) {
      writeLog(
        'WARN',
        `[PRINT] Manual retry rejected for order ${ticket.orderId} — exceeded 10-minute threshold.`,
      );
      Alert.alert(
        'Timeout Expired',
        'This order is too old to be reprinted from the tablet engine.',
      );
      return;
    }

    const targetCounter: CounterConfig | undefined = countersRef.current.find(
      (c: CounterConfig) =>
        c.id === ticket.counterId &&
        c.status === 'ACTIVE' &&
        c.printerAddress &&
        c.printerType !== 'NONE',
    );

    if (!targetCounter || !targetCounter.printerAddress) {
      writeLog(
        'WARN',
        `[PRINT] No active printer routing for counter "${ticket.counterId}" — job dropped.`,
      );
      await updateJournalTicketStatus(ticket.orderId, 'CANCELLED');
      DeviceEventEmitter.emit('JOURNAL_UPDATED');
      return;
    }

    const MAX_ATTEMPTS = 3;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        writeLog(
          'INFO',
          `[PRINT-PIPELINE] Dispatching print job for ${ticket.orderId} (Attempt ${attempt}/${MAX_ATTEMPTS})`,
        );

        await runHardwarePrint(
          targetCounter.printerType,
          targetCounter.printerAddress,
          ticket,
        );

        await updateJournalTicketStatus(ticket.orderId, 'COMPLETED');
        DeviceEventEmitter.emit('JOURNAL_UPDATED');
        return;
      } catch (err: unknown) {
        lastError = err;
        writeLog(
          'WARN',
          `[PRINT-PIPELINE] Attempt ${attempt} failed for "${
            targetCounter.displayName
          }": ${String(err)}`,
        );

        if (attempt < MAX_ATTEMPTS) {
          await new Promise<void>(resolve => setTimeout(() => resolve(), 2000));
        }
      }
    }

    writeLog(
      'ERROR',
      `[PRINT-PIPELINE] All ${MAX_ATTEMPTS} print cycles exhausted for ${ticket.orderId}. Marking as failed.`,
    );
    await updateJournalTicketStatus(ticket.orderId, 'CANCELLED');
    DeviceEventEmitter.emit('JOURNAL_UPDATED');
    Alert.alert(
      'Print Failed',
      `Could not print after ${MAX_ATTEMPTS} attempts. Error: ${String(
        lastError,
      )}`,
    );
  }, []);

  const toggleServerRuntime = async (): Promise<void> => {
    const nativePusher = Pusher.getInstance();

    if (isServerRunning) {
      try {
        writeLog('WARN', '[SYSTEM] Initiating full system teardown matrix...');

        const currentConfig = await getEngineConfig();
        if (currentConfig) {
          writeLog(
            'INFO',
            `[API] Dispatching manual status teardown notice for: ${currentConfig.id}`,
          );
          fetch('https://cm-bps.vercel.app/api/engine/ping', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Engine-Token':
                '38d6960a32cda66ce327d44d358755f706420303e11825a34eca38544a07e2c7',
            },

            body: JSON.stringify({
              engineId: currentConfig.id,
              status: 'OFF',
            }),
          }).catch(err => {
            writeLog(
              'WARN',
              `[API] Silent drop encountered during state shutdown broadcast: ${String(
                err,
              )}`,
            );
          });
        }

        const statusMeta = await AsyncStorage.getItem('@printer_engine_status');
        if (statusMeta) {
          const parsedStatus = JSON.parse(statusMeta);
          if (Array.isArray(parsedStatus.channels)) {
            for (const channelName of parsedStatus.channels) {
              writeLog(
                'INFO',
                `[PUSHER] Cleaning channel reference: unsubscribe(${channelName})`,
              );
              await nativePusher.unsubscribe({ channelName });
            }
          }
        }

        writeLog(
          'INFO',
          '[PUSHER] Terminating native socket instance safely...',
        );
        await nativePusher.disconnect();
        writeLog('INFO', '[SYSTEM] Socket transport dropped cleanly.');
      } catch (disconnectError: unknown) {
        writeLog(
          'ERROR',
          `[PUSHER] Teardown lifecycle exception: ${String(disconnectError)}`,
        );
      } finally {
        if (globalThis.engineHeartbeatInterval) {
          clearInterval(globalThis.engineHeartbeatInterval);
          globalThis.engineHeartbeatInterval = null;
        }

        if (globalThis.printerWarmupInterval) {
          clearInterval(globalThis.printerWarmupInterval);
          globalThis.printerWarmupInterval = null;
        }

        ReactNativeForegroundService.remove_task('printerOrderPollingTask');
        await ReactNativeForegroundService.stop();
        await AsyncStorage.removeItem('@printer_engine_status');

        DeviceEventEmitter.emit('ENGINE_STATUS_CHANGED', {
          connected: false,
          channels: [],
          updatedAt: new Date().toLocaleTimeString(),
        });
        writeLog(
          'WARN',
          '[SYSTEM] Foreground printer server terminated safely.',
        );
      }
      return;
    }

    const currentConfig = await getEngineConfig();
    if (!currentConfig) {
      writeLog(
        'WARN',
        '[SYSTEM] Core parameters missing. Opening setup panel.',
      );
      setShowConfigModal(true);
      return;
    }
    const verifiedConfig = currentConfig;

    const hasNotifPermission: boolean = await ensureNotificationPermission();
    if (!hasNotifPermission) {
      writeLog(
        'WARN',
        '[SYSTEM] POST_NOTIFICATIONS tracking permissions missing.',
      );
    }

    try {
      await ReactNativeForegroundService.start({
        id: 9912,
        title: 'Printer Server Active',
        message: `Instance Node: ${verifiedConfig.id}`,
        icon: 'ic_launcher',
        importance: 'high',
        vibration: false,
        visibility: 'public',
        largeIcon: 'ic_launcher',
        color: '#FF6B35',
        ServiceType: 'dataSync',
      } as any);

      ReactNativeForegroundService.add_task(
        async () => {
          try {
            const enginePingResponse = await fetch(
              'https://cm-bps.vercel.app/api/engine/ping',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Engine-Token':
                    '38d6960a32cda66ce327d44d358755f706420303e11825a34eca38544a07e2c7',
                },
                body: JSON.stringify({
                  engineId: verifiedConfig.id,
                  priority: verifiedConfig.priority,
                }),
              },
            );

            if (!enginePingResponse.ok) {
              const pingErrResult = await enginePingResponse
                .json()
                .catch(() => ({ error: 'Cluster collision context.' }));

              if (globalThis.engineHeartbeatInterval) {
                clearInterval(globalThis.engineHeartbeatInterval);
                globalThis.engineHeartbeatInterval = null;
              }

              if (globalThis.printerWarmupInterval) {
                clearInterval(globalThis.printerWarmupInterval);
                globalThis.printerWarmupInterval = null;
              }

              ReactNativeForegroundService.remove_task(
                'printerOrderPollingTask',
              );
              await ReactNativeForegroundService.stop();

              DeviceEventEmitter.emit('ENGINE_STATUS_CHANGED', {
                connected: false,
                channels: [],
                updatedAt: new Date().toLocaleTimeString(),
              });
              Alert.alert(
                'Cluster Preemption',
                pingErrResult.error || 'A higher priority engine dominates.',
              );
              return;
            }

            const PING_INTERVAL_MS = 5 * 60 * 1000;
            if (!globalThis.engineHeartbeatInterval) {
              globalThis.engineHeartbeatInterval = setInterval(async () => {
                try {
                  const pingResponse = await fetch(
                    'https://cm-bps.vercel.app/api/engine/ping',
                    {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'X-Engine-Token':
                          '38d6960a32cda66ce327d44d358755f706420303e11825a34eca38544a07e2c7',
                      },
                      body: JSON.stringify({
                        engineId: verifiedConfig.id,
                        priority: verifiedConfig.priority,
                      }),
                    },
                  );

                  if (!pingResponse.ok) {
                    if (globalThis.engineHeartbeatInterval) {
                      clearInterval(globalThis.engineHeartbeatInterval);
                      globalThis.engineHeartbeatInterval = null;
                    }

                    if (globalThis.printerWarmupInterval) {
                      clearInterval(globalThis.printerWarmupInterval);
                      globalThis.printerWarmupInterval = null;
                    }

                    ReactNativeForegroundService.remove_task(
                      'printerOrderPollingTask',
                    );
                    await ReactNativeForegroundService.stop();
                    DeviceEventEmitter.emit('ENGINE_STATUS_CHANGED', {
                      connected: false,
                      channels: [],
                      updatedAt: new Date().toLocaleTimeString(),
                    });
                  }
                } catch {}
              }, PING_INTERVAL_MS);
            }

            const response: Response = await fetch(
              'https://cm-bps.vercel.app/api/counters',
              {
                method: 'GET',
                headers: {
                  Accept: 'application/json',
                  'X-Engine-Token':
                    '38d6960a32cda66ce327d44d358755f706420303e11825a34eca38544a07e2c7',
                },
              },
            );
            const result: any = await response.json();

            if (!result || !result.success || !Array.isArray(result.data))
              return;
            const activeCounters: CounterConfig[] =
              result.data as CounterConfig[];

            for (const counter of activeCounters) {
              if (
                !counter.printerAddress ||
                counter.printerType === 'NONE' ||
                counter.printerType === 'LAN'
              )
                continue;
              await warmPrinterConnection(
                counter.printerType as 'BT' | 'USB',
                counter.printerAddress,
              );
            }

            const WARMUP_INTERVAL_MS: number = 2 * 60 * 1000;

            if (!globalThis.printerWarmupInterval) {
              globalThis.printerWarmupInterval = setInterval(
                async (): Promise<void> => {
                  writeLog(
                    'INFO',
                    '[HEARTBEAT] Firing anti-decay printer warmup cycle...',
                  );

                  try {
                    const warmupResponse = await fetch(
                      'https://cm-bps.vercel.app/api/counters',
                      {
                        method: 'GET',
                        headers: {
                          Accept: 'application/json',
                          'X-Engine-Token':
                            '38d6960a32cda66ce327d44d358755f706420303e11825a34eca38544a07e2c7',
                        },
                      },
                    );
                    const warmupResult = await warmupResponse.json();

                    if (
                      warmupResult &&
                      warmupResult.success &&
                      Array.isArray(warmupResult.data)
                    ) {
                      const freshCounters: CounterConfig[] =
                        warmupResult.data as CounterConfig[];
                      for (const counter of freshCounters) {
                        if (
                          !counter.printerAddress ||
                          counter.printerType === 'NONE' ||
                          counter.printerType === 'LAN'
                        )
                          continue;
                        await warmPrinterConnection(
                          counter.printerType as 'BT' | 'USB',
                          counter.printerAddress,
                        );
                      }
                    }
                  } catch (err: unknown) {
                    writeLog(
                      'WARN',
                      `[HEARTBEAT] Failed to fetch fresh counters for warmup: ${String(
                        err,
                      )}`,
                    );
                  }
                },
                WARMUP_INTERVAL_MS,
              );
            }

            const headlessPusher: Pusher = Pusher.getInstance();
            await headlessPusher.connect();

            const currentChannels: Set<string> = new Set<string>(
              activeCounters.map((c: CounterConfig) => `counter-${c.id}`),
            );

            const statusPayload = {
              connected: true,
              channels: Array.from(currentChannels),
              updatedAt: new Date().toLocaleTimeString(),
            };

            await updatePersistedEngineStatus(statusPayload);
            DeviceEventEmitter.emit('ENGINE_STATUS_CHANGED', statusPayload);

            for (const channelName of currentChannels) {
              try {
                writeLog(
                  'INFO',
                  `[TASK-LIFECYCLE] Purging stale channel space: ${channelName}`,
                );
                await headlessPusher.unsubscribe({ channelName });
              } catch {}

              try {
                await headlessPusher.subscribe({
                  channelName,
                  onSubscriptionSucceeded: () => {
                    writeLog(
                      'INFO',
                      `[PUSHER-SUB] Active pipeline confirmed for channel: ${channelName}`,
                    );
                  },
                  onSubscriptionError: (message: string, error) => {
                    writeLog(
                      'ERROR',
                      `[PUSHER-SUB] Subscription rejected for ${channelName}! Msg: ${message} | Context: ${JSON.stringify(
                        error,
                      )}`,
                    );
                  },
                  onEvent: async (event: PusherEvent) => {
                    if (event.eventName !== 'NEW_ORDER') return;

                    try {
                      const rawTicket: Ticket =
                        typeof event.data === 'string'
                          ? (JSON.parse(event.data) as Ticket)
                          : (event.data as unknown as Ticket);

                      const actionableTicket: Ticket = {
                        ...rawTicket,
                        status: 'PENDING',
                      };
                      const currentJournal: Ticket[] =
                        await readJournalTickets();

                      if (
                        currentJournal.some(
                          (t: Ticket) => t.orderId === actionableTicket.orderId,
                        )
                      )
                        return;

                      await appendJournalTicket(actionableTicket);
                      DeviceEventEmitter.emit('JOURNAL_UPDATED');

                      const matchedCounter = activeCounters.find(
                        (c: CounterConfig) =>
                          c.id === actionableTicket.counterId,
                      );
                      if (!matchedCounter) return;

                      const printerAddress =
                        matchedCounter.printerAddress || undefined;

                      if (
                        printerAddress &&
                        matchedCounter.status === 'ACTIVE' &&
                        matchedCounter.printerType !== 'NONE'
                      ) {
                        let attempts = 0;
                        let locked = false;
                        while (
                          headlessPrintingLocks[printerAddress] &&
                          attempts < 10
                        ) {
                          locked = true;
                          await new Promise<void>(r =>
                            setTimeout(() => r(), 1500),
                          );
                          attempts++;
                        }

                        if (headlessPrintingLocks[printerAddress] && locked) {
                          await updateJournalTicketStatus(
                            actionableTicket.orderId,
                            'CANCELLED',
                          );
                          DeviceEventEmitter.emit('JOURNAL_UPDATED');
                          return;
                        }

                        const terminateEngineLocally =
                          async (): Promise<void> => {
                            try {
                              writeLog(
                                'WARN',
                                '[FATAL-SHUTDOWN] Executing graceful native engine teardown matrix...',
                              );

                              fetch(
                                'https://cm-bps.vercel.app/api/engine/ping',
                                {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                    'X-Engine-Token':
                                      '38d6960a32cda66ce327d44d358755f706420303e11825a34eca38544a07e2c7',
                                  },
                                  body: JSON.stringify({
                                    engineId: verifiedConfig.id,
                                    status: 'OFF',
                                  }),
                                },
                              ).catch((): void => {});

                              if (globalThis.engineHeartbeatInterval) {
                                clearInterval(
                                  globalThis.engineHeartbeatInterval,
                                );
                                globalThis.engineHeartbeatInterval = null;
                              }

                              if (globalThis.printerWarmupInterval) {
                                clearInterval(globalThis.printerWarmupInterval);
                                globalThis.printerWarmupInterval = null;
                              }

                              const fatalPusherDisconnect: Pusher =
                                Pusher.getInstance();

                              const channelArray: string[] =
                                Array.from(currentChannels);
                              for (const chnlName of channelArray) {
                                await fatalPusherDisconnect
                                  .unsubscribe({ channelName: chnlName })
                                  .catch((): void => {});
                              }

                              await fatalPusherDisconnect
                                .disconnect()
                                .catch((): void => {});

                              ReactNativeForegroundService.remove_task(
                                'printerOrderPollingTask',
                              );
                              await ReactNativeForegroundService.stop().catch(
                                (): void => {},
                              );

                              await AsyncStorage.removeItem(
                                '@printer_engine_status',
                              ).catch((): void => {});

                              DeviceEventEmitter.emit('ENGINE_STATUS_CHANGED', {
                                connected: false,
                                channels: [],
                                updatedAt: new Date().toLocaleTimeString(),
                              });
                            } catch (shutdownError: unknown) {
                              writeLog(
                                'ERROR',
                                `[FATAL-SHUTDOWN] Native thread breakdown: ${String(
                                  shutdownError,
                                )}`,
                              );
                            }
                            DeviceEventEmitter.emit('FORCE_STOP_SERVER_UI');
                          };

                        try {
                          headlessPrintingLocks[printerAddress] = true;

                          await updateJournalTicketStatus(
                            actionableTicket.orderId,
                            'PRINTING',
                          );

                          try {
                            await executePrintJob(
                              matchedCounter.printerType as
                                | 'LAN'
                                | 'BT'
                                | 'USB',
                              printerAddress,
                              actionableTicket,
                            );
                            writeLog(
                              'INFO',
                              `[ENGINE] Hardware buffer flush confirmed for order: ${actionableTicket.orderId}`,
                            );
                          } catch (hardwareError) {
                            writeLog(
                              'ERROR',
                              `[PRINTER-HARDWARE] Physical print failed for order ${
                                actionableTicket.orderId
                              }: ${String(
                                hardwareError,
                              )}. Shutting down engine pipeline...`,
                            );

                            await updateJournalTicketStatus(
                              actionableTicket.orderId,
                              'PENDING',
                            ).catch(() => {});

                            await terminateEngineLocally();

                            Alert.alert(
                              '🖨️ HARDWARE PRINT FAILURE',
                              `Printer hardware failed to emit receipt for Token No: ${
                                actionableTicket.ticketReference || 'XXXX'
                              }. Engine stopped. Order state marked as PENDING to authorize cron refunds.`,
                              [{ text: 'ACKNOWLEDGE' }],
                            );
                            return;
                          }

                          await updateJournalTicketStatus(
                            actionableTicket.orderId,
                            'COMPLETED',
                          );
                        } catch (pipelineFatalError: unknown) {
                          writeLog(
                            'ERROR',
                            `[FATAL-PIPELINE] Aborting print stream to prevent split-brain state. Order: ${
                              actionableTicket.orderId
                            }. Error: ${String(pipelineFatalError)}`,
                          );

                          await updateJournalTicketStatus(
                            actionableTicket.orderId,
                            'CANCELLED',
                          ).catch(() => {});

                          await terminateEngineLocally();

                          Alert.alert(
                            '⚠️ CRITICAL API FAILURE',
                            `Could not synchronize order status with cloud servers. The printing engine has been terminated safely to prevent invalid customer coupons.\n\nOrder ID: ${actionableTicket.orderId}`,
                            [{ text: 'ACKNOWLEDGE' }],
                          );
                        } finally {
                          headlessPrintingLocks[printerAddress] = false;
                          DeviceEventEmitter.emit('JOURNAL_UPDATED');
                        }
                      } else {
                        await updateJournalTicketStatus(
                          actionableTicket.orderId,
                          'CANCELLED',
                        );
                        DeviceEventEmitter.emit('JOURNAL_UPDATED');
                      }
                    } catch {}
                  },
                });
              } catch {}
            }
          } catch {
            const fallbackPayload = {
              connected: false,
              channels: [],
              updatedAt: new Date().toLocaleTimeString(),
            };
            await updatePersistedEngineStatus(fallbackPayload);
            DeviceEventEmitter.emit('ENGINE_STATUS_CHANGED', fallbackPayload);
          }
        },
        {
          delay: 1000,
          onLoop: false,
          taskId: 'printerOrderPollingTask',
          onError: () => {},
        },
      );

      setIsServerRunning(true);
    } catch {
      Alert.alert(
        'Fault',
        'Could not establish foreground channel context execution layer.',
      );
    }
  };

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      'FORCE_STOP_SERVER_UI',
      () => {
        setIsServerRunning(false);
        setEngineStatus({ connected: false, channels: [], updatedAt: '' });
        writeLog(
          'WARN',
          '[SYSTEM] Foreground printer agent server paused via notification interaction.',
        );
      },
    );
    return () => {
      subscription.remove();
    };
  }, []);

  const testUnlinkedPrinter = async (
    printer: DiscoveredPrinter,
  ): Promise<void> => {
    writeLog(
      'INFO',
      `[TEST] Firing test print to unlinked ${printer.type}[${printer.address}]`,
    );
    try {
      const mockTicket: Ticket = generateMockTicket('UNLINKED_TEST');
      await runHardwarePrint(
        printer.type || 'LAN',
        printer.address || '',
        mockTicket,
      );
      Alert.alert('Success', 'Test receipt sent to hardware.');
    } catch (err: unknown) {
      writeLog('ERROR', `[TEST] Test print failed: ${String(err)}`);
      Alert.alert('Test Failed', String(err));
    }
  };

  const testRegisteredCounter = async (
    counter: CounterConfig,
  ): Promise<void> => {
    if (!counter.printerAddress) return;
    writeLog(
      'INFO',
      `[TEST] Firing test print to registered counter "${counter.displayName}"`,
    );
    try {
      const mockTicket: Ticket = generateMockTicket(counter.id);
      await runHardwarePrint(
        counter.printerType,
        counter.printerAddress,
        mockTicket,
      );
      Alert.alert('Success', `Test receipt sent to ${counter.displayName}.`);
    } catch (err: unknown) {
      writeLog(
        'ERROR',
        `[TEST] Test print failed for "${counter.displayName}": ${String(err)}`,
      );
      Alert.alert('Test Failed', String(err));
    }
  };

  const fetchCounters = useCallback(async (): Promise<void> => {
    try {
      writeLog('INFO', '[API] Fetching counter list...');
      const response: Response = await fetch(
        'https://cm-bps.vercel.app/api/counters',
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'X-Engine-Token':
              '38d6960a32cda66ce327d44d358755f706420303e11825a34eca38544a07e2c7',
          },
        },
      );
      const result: any = await response.json();
      if (result.success) {
        writeLog('INFO', `[API] ${result.data.length} counter(s) loaded.`);
        setCounters(result.data as CounterConfig[]);
        countersRef.current = result.data as CounterConfig[];
      }
    } catch (err: unknown) {
      writeLog('ERROR', `[API] Failed to fetch counters: ${String(err)}`);
    }
  }, []);

  const registerCounter = async (printer: DiscoveredPrinter): Promise<void> => {
    if (!newCounterNum || !newCounterName) {
      Alert.alert(
        'Missing Fields',
        'Please provide a counter number and name.',
      );
      return;
    }
    try {
      writeLog(
        'INFO',
        `[API] Registering counter "${newCounterName}" → ${printer.type}[${printer.address}]`,
      );
      const response: Response = await fetch(`${apiUrl}/api/counters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Engine-Token':
            '38d6960a32cda66ce327d44d358755f706420303e11825a34eca38544a07e2c7',
        },
        body: JSON.stringify({
          counterNumber: parseInt(newCounterNum, 10),
          displayName: newCounterName,
          printerType: printer.type || 'LAN',
          printerAddress: printer.address || '',
        }),
      });
      const result: any = await response.json();
      if (result.success) {
        writeLog(
          'INFO',
          `[API] Counter "${newCounterName}" registered successfully.`,
        );
        setSelectedUnlinked(null);
        setNewCounterNum('');
        setNewCounterName('');
        await fetchCounters();
        setHardwareTab('REGISTERED');
      } else {
        Alert.alert('Registration Failed', result.error || 'Unknown error');
      }
    } catch (err: unknown) {
      writeLog(
        'ERROR',
        `[API] Network error during registration: ${String(err)}`,
      );
    }
  };

  const addManualLanPrinter = (): void => {
    if (!manualIp) return;
    const manualPrinter: DiscoveredPrinter = {
      id: `manual-${Date.now()}`,
      name: 'Network Printer (LAN)',
      type: 'LAN',
      address: manualIp,
    };
    setDiscoveredPrinters((prev: DiscoveredPrinter[]) => {
      if (
        !prev.find(
          (p: DiscoveredPrinter) => p.address === manualPrinter.address,
        )
      )
        return [...prev, manualPrinter];
      return prev;
    });
    setManualIp('');
  };

  const addDiscoveredPrinter = (device: DiscoveredPrinter): void => {
    setDiscoveredPrinters((prev: DiscoveredPrinter[]) => {
      if (prev.find((p: DiscoveredPrinter) => p.address === device.address)) {
        return prev;
      }
      const next: DiscoveredPrinter[] = [...prev, device];
      discoveredPrintersRef.current = next;

      cacheDiscoveredPrinters(next);
      return next;
    });
  };

  useEffect(() => {
    const statusSub = DeviceEventEmitter.addListener(
      'ENGINE_STATUS_CHANGED',
      (status: EngineStatus) => {
        setEngineStatus(status);
        setIsServerRunning(status.connected);
      },
    );

    return () => {
      statusSub.remove();
    };
  }, []);

  useEffect(() => {
    const synchronizeDatabaseOnLaunch = async () => {
      writeLog('INFO', '[SYNC] Cold start reconciliation initialized...');
      await reconcileMissingJournalTickets();
      DeviceEventEmitter.emit('JOURNAL_UPDATED');
    };

    synchronizeDatabaseOnLaunch();
  }, []);

  useEffect(() => {
    let stopBtScanning: (() => void) | null = null;
    let scanTimeout: ReturnType<typeof setTimeout> | null = null;

    const initPipeline = async (): Promise<void> => {
      writeLog('INFO', '=== SYSTEM BOOT SEQUENCE START ===');

      try {
        writeLog(
          'WARN',
          '[BOOT-CLEANUP] Purging orphaned native service task locks...',
        );
        ReactNativeForegroundService.remove_task('printerOrderPollingTask');
        await ReactNativeForegroundService.stop();
        await AsyncStorage.removeItem('@printer_engine_status');
        setIsServerRunning(false);
      } catch {}

      await clearStaleJournalTickets();

      try {
        const nativePusher: Pusher = Pusher.getInstance();

        try {
          const storedStatus = await AsyncStorage.getItem(
            '@printer_engine_status',
          );
          if (storedStatus) {
            const parsed = JSON.parse(storedStatus);
            if (Array.isArray(parsed.channels)) {
              for (const chan of parsed.channels) {
                await nativePusher
                  .unsubscribe({ channelName: chan })
                  .catch(() => {});
              }
            }
          }
        } catch {}

        await nativePusher.disconnect().catch(() => {});

        await nativePusher.init({
          apiKey: 'de978c89a0a60f82aefd',
          cluster: 'ap2',
          onConnectionStateChange: (
            currentState: string,
            previousState: string,
          ) => {
            writeLog(
              'INFO',
              `[PUSHER] State change event: ${previousState} -> ${currentState}`,
            );
          },
          onError: (message: string, code: any) => {
            writeLog(
              'ERROR',
              `[PUSHER-DRV] Internal transport failure [${code}]: ${message}`,
            );
          },
        });
        writeLog(
          'INFO',
          '[PUSHER] Global native driver parameters initialized successfully.',
        );
      } catch (pusherInitErr: unknown) {
        writeLog(
          'ERROR',
          `[PUSHER] Static configuration lock failed: ${String(pusherInitErr)}`,
        );
      }

      setScanPhase('bonded');
      const btPermission: boolean = await requestBluetoothPermissions();

      const tasks: Promise<any>[] = [
        fetchCounters(),
        (async (): Promise<void> => {
          await scanUsbPrinters(addDiscoveredPrinter);
        })(),
      ];

      if (btPermission) {
        setScanPhase('scanning');
        tasks.push(
          (async (): Promise<void> => {
            stopBtScanning = scanBluetoothPrinters(
              addDiscoveredPrinter,
              () => {},
            );
            scanTimeout = setTimeout(() => {
              if (stopBtScanning) stopBtScanning();
              setScanPhase('done');
            }, 15000);
          })(),
        );
      } else {
        setScanPhase('done');
      }

      await Promise.allSettled(tasks);
      writeLog('INFO', '=== BOOT SEQUENCE COMPLETE ===');
    };

    initPipeline();

    return () => {
      if (scanTimeout) clearTimeout(scanTimeout);
      if (stopBtScanning) stopBtScanning();
    };
  }, [fetchCounters]);

  const unlinkedPrinters: DiscoveredPrinter[] = discoveredPrinters.filter(
    (dp: DiscoveredPrinter) =>
      !counters.some((c: CounterConfig) => c.printerAddress === dp.address),
  );

  const scanMeta = scanPhaseConfig[scanPhase];
  const pendingCount = tickets.filter(
    (t: Ticket) => t.status === 'PENDING',
  ).length;
  const failedCount = tickets.filter(
    (t: Ticket) => t.status === 'CANCELLED',
  ).length;

  return {
    activeTab,
    setActiveTab,
    hardwareTab,
    setHardwareTab,
    logs,
    tickets,
    counters,
    discoveredPrinters,
    scanPhase,
    selectedUnlinked,
    setSelectedUnlinked,
    newCounterNum,
    setNewCounterNum,
    newCounterName,
    setNewCounterName,
    manualIp,
    setManualIp,
    isServerRunning,
    engineStatus,
    showConfigModal,
    setShowConfigModal,
    inputEngineId,
    setInputEngineId,
    inputPriority,
    setInputPriority,
    unlinkedPrinters,
    scanMeta,
    pendingCount,
    failedCount,
    refreshLogs,
    executePrint,
    toggleServerRuntime,
    testUnlinkedPrinter,
    testRegisteredCounter,
    fetchCounters,
    registerCounter,
    addManualLanPrinter,
  };
};
