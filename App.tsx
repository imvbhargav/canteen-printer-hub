import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  Alert,
  LogBox,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
  PermissionsAndroid,
  DeviceEventEmitter,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pusher, PusherEvent } from '@pusher/pusher-websocket-react-native';
import { Ticket, CounterConfig } from './types';
import {
  requestBluetoothPermissions,
  scanBluetoothPrinters,
  scanUsbPrinters,
  DiscoveredPrinter,
} from './utils/printerDiscovery';
import { writeLog, readTodayLogs, LogEntry } from './utils/logger';
import {
  executePrintJob,
  warmPrinterConnection,
} from './utils/printerTransport';
import {
  readJournalTickets,
  updateJournalTicketStatus,
  clearStaleJournalTickets,
  appendJournalTicket,
} from './utils/ticketStorage';
import ReactNativeForegroundService from '@supersami/rn-foreground-service';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getEngineConfig, promptForEngineConfig } from './utils/engineConfig';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

LogBox.ignoreLogs([
  '`new NativeEventEmitter()` was called with a non-null argument without the required `addListener` method',
  '`new NativeEventEmitter()` was called with a non-null argument without the required `removeListeners` method',
]);

type ScanPhase = 'idle' | 'bonded' | 'scanning' | 'done';
type HardwareTab = 'REGISTERED' | 'DISCOVERED';

interface EngineStatus {
  connected: boolean;
  channels: string[];
  updatedAt: string;
}

const theme = {
  background: '#FAFAFA',
  surface: '#FFFFFF',
  surfaceAlt: '#F8FAFC',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  foreground: '#0F172A',
  secondary: '#475569',
  muted: '#64748B',
  accent: '#FF6B35',
  accentDim: '#FFF3ED',
  destructive: '#EF4444',
  destructiveDim: '#FEF2F2',
  success: '#10B981',
  successDim: '#ECFDF5',
  warning: '#F59E0B',
  warningDim: '#FEF3C7',
  info: '#3B82F6',
  infoDim: '#EFF6FF',
};

const scanPhaseConfig: Record<ScanPhase, { label: string; color: string }> = {
  idle: { label: 'IDLE', color: theme.muted },
  bonded: { label: 'READING PAIRED…', color: theme.info },
  scanning: { label: 'SCANNING HARDWARE…', color: theme.warning },
  done: { label: 'READY', color: theme.success },
};

const Pill = ({
  label,
  color,
  bg,
}: {
  label: string;
  color: string;
  bg: string;
}) => (
  <View
    style={[
      pillStyles.wrap,
      { backgroundColor: bg, borderColor: color + '20' },
    ]}
  >
    <View style={[pillStyles.dot, { backgroundColor: color }]} />
    <Text style={[pillStyles.text, { color }]}>{label}</Text>
  </View>
);

const pillStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 10,
    letterSpacing: 0.5,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});

const Divider = () => <View style={dividerStyles.container} />;
const dividerStyles = StyleSheet.create({
  container: {
    height: 1,
    backgroundColor: theme.borderLight,
    marginVertical: 4,
  },
});

const SectionLabel = ({ text }: { text: string }) => (
  <View style={sectionLabelStyles.wrap}>
    <Text style={sectionLabelStyles.text}>{text}</Text>
    <View style={sectionLabelStyles.line} />
  </View>
);

const sectionLabelStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    marginTop: 6,
    paddingHorizontal: 14,
  },
  text: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: theme.muted,
    fontWeight: '700',
  },
  line: { flex: 1, height: 1, backgroundColor: theme.border },
});

const CollapsibleSection = ({
  title,
  badge,
  children,
  defaultOpen = true,
}: {
  title: string;
  badge?: string | number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState<boolean>(defaultOpen);
  const rotation = useRef<Animated.Value>(
    new Animated.Value(defaultOpen ? 1 : 0),
  ).current;

  const toggle = (): void => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Animated.timing(rotation, {
      toValue: open ? 0 : 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
    setOpen((v: boolean) => !v);
  };

  const rotate: Animated.AnimatedInterpolation<string | number> =
    rotation.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '90deg'],
    });

  return (
    <View style={collapseStyles.container}>
      <TouchableOpacity
        onPress={toggle}
        activeOpacity={0.7}
        style={collapseStyles.header}
      >
        <View style={collapseStyles.headerLeft}>
          <Animated.Text
            style={[collapseStyles.chevron, { transform: [{ rotate }] }]}
          >
            ▶
          </Animated.Text>
          <Text style={collapseStyles.title}>{title}</Text>
          {badge !== undefined && (
            <View style={collapseStyles.badge}>
              <Text style={collapseStyles.badgeText}>{badge}</Text>
            </View>
          )}
        </View>
        <Text style={collapseStyles.toggleHint}>{open ? 'HIDE' : 'SHOW'}</Text>
      </TouchableOpacity>
      {open && <View style={collapseStyles.body}>{children}</View>}
    </View>
  );
};

const collapseStyles = StyleSheet.create({
  container: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    marginBottom: 14,
    overflow: 'hidden',
    marginHorizontal: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: theme.surfaceAlt,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chevron: { fontSize: 10, color: theme.muted },
  title: {
    fontSize: 12,
    letterSpacing: 0.3,
    color: theme.foreground,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    backgroundColor: theme.surface,
    borderColor: theme.border,
  },
  badgeText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 10,
    fontWeight: '700',
    color: theme.muted,
  },
  toggleHint: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 9,
    letterSpacing: 0.5,
    color: theme.muted,
  },
  body: { borderTopWidth: 1, borderTopColor: theme.borderLight },
});

const RegisteredCounterCard = ({
  counter,
  onTest,
}: {
  counter: CounterConfig;
  onTest: () => void;
}) => {
  const isActive: boolean = counter.status === 'ACTIVE';
  return (
    <View style={regCardStyles.card}>
      <View style={regCardStyles.topRow}>
        <View style={regCardStyles.iconFrame}>
          <Text
            style={[
              regCardStyles.iconText,
              { color: isActive ? theme.accent : theme.muted },
            ]}
          >
            🖨
          </Text>
        </View>
        <View style={regCardStyles.nameCol}>
          <Text style={regCardStyles.name}>{counter.displayName}</Text>
          <Text style={regCardStyles.sub}>
            {counter.printerType} • {counter.printerAddress || 'UNASSIGNED'}
          </Text>
        </View>
        <Pill
          label={counter.status}
          color={isActive ? theme.success : theme.destructive}
          bg={isActive ? theme.successDim : theme.destructiveDim}
        />
      </View>
      <Divider />
      <View style={regCardStyles.footer}>
        <TouchableOpacity style={regCardStyles.testBtn} onPress={onTest}>
          <Text style={regCardStyles.testBtnText}>↻ TEST PRINT</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const regCardStyles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    marginHorizontal: 14,
    marginBottom: 12,
    overflow: 'hidden',
  },
  topRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  iconFrame: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: theme.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconText: { fontSize: 16 },
  nameCol: { flex: 1, marginRight: 12 },
  name: {
    color: theme.foreground,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  sub: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 10,
    color: theme.muted,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: theme.surfaceAlt,
  },
  testBtn: {
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: theme.surface,
  },
  testBtnText: { fontSize: 11, color: theme.secondary, fontWeight: '600' },
});

const DiscoveredPrinterCard = ({
  printer,
  isSelected,
  onTest,
  onToggleLink,
  newCounterNum,
  setNewCounterNum,
  newCounterName,
  setNewCounterName,
  onRegister,
}: {
  printer: DiscoveredPrinter;
  isSelected: boolean;
  onTest: () => void;
  onToggleLink: () => void;
  newCounterNum: string;
  setNewCounterNum: (val: string) => void;
  newCounterName: string;
  setNewCounterName: (val: string) => void;
  onRegister: () => void;
}) => {
  const typeStr: string = printer.type || 'UNKNOWN';
  return (
    <View style={discStyles.card}>
      <View style={discStyles.topRow}>
        <View style={discStyles.left}>
          <View style={discStyles.iconFrame}>
            <Text style={discStyles.iconText}>
              {typeStr === 'LAN' ? '🌐' : '🖥'}
            </Text>
          </View>
          <View style={discStyles.nameCol}>
            <Text style={discStyles.name}>
              {printer.name || 'Generic Device'}
            </Text>
            <Text style={discStyles.addr}>{printer.address}</Text>
          </View>
        </View>
        <View style={discStyles.actions}>
          <TouchableOpacity style={discStyles.testBtn} onPress={onTest}>
            <Text style={discStyles.testBtnText}>TEST</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[discStyles.linkBtn, isSelected && discStyles.linkBtnActive]}
            onPress={onToggleLink}
          >
            <Text
              style={[
                discStyles.linkBtnText,
                isSelected && discStyles.linkBtnTextActive,
              ]}
            >
              {isSelected ? 'CANCEL' : 'LINK'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      {isSelected && (
        <View style={discStyles.form}>
          <View style={discStyles.formHeader}>
            <Text style={discStyles.formTitle}>⊕ REGISTER TO NEW COUNTER</Text>
          </View>
          <View style={discStyles.formBody}>
            <View style={discStyles.inputRow}>
              <View style={discStyles.inputWrapSmall}>
                <Text style={discStyles.inputLabel}>COUNTER #</Text>
                <TextInput
                  style={discStyles.input}
                  placeholder="1"
                  placeholderTextColor={theme.muted}
                  keyboardType="numeric"
                  value={newCounterNum}
                  onChangeText={setNewCounterNum}
                />
              </View>
              <View style={discStyles.inputWrapLarge}>
                <Text style={discStyles.inputLabel}>DISPLAY NAME</Text>
                <TextInput
                  style={discStyles.input}
                  placeholder="Snacks Desk"
                  placeholderTextColor={theme.muted}
                  value={newCounterName}
                  onChangeText={setNewCounterName}
                />
              </View>
            </View>
            <TouchableOpacity style={discStyles.saveBtn} onPress={onRegister}>
              <Text style={discStyles.saveBtnText}>SAVE CONFIGURATION</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const discStyles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    marginHorizontal: 14,
    marginBottom: 12,
    overflow: 'hidden',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  iconFrame: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: theme.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { fontSize: 14 },
  nameCol: { flex: 1 },
  name: {
    color: theme.foreground,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  addr: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 10,
    color: theme.muted,
  },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  testBtn: {
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: theme.surfaceAlt,
  },
  testBtnText: { fontSize: 11, color: theme.muted, fontWeight: '600' },
  linkBtn: {
    backgroundColor: theme.accent,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  linkBtnActive: {
    backgroundColor: theme.destructiveDim,
    borderWidth: 1,
    borderColor: theme.destructive + '40',
  },
  linkBtnText: { fontSize: 11, color: '#FFFFFF', fontWeight: '700' },
  linkBtnTextActive: { color: theme.destructive },
  form: {
    borderTopWidth: 1,
    borderTopColor: theme.border,
    backgroundColor: theme.surfaceAlt,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderLight,
  },
  formTitle: { fontSize: 11, color: theme.foreground, fontWeight: '700' },
  formBody: { padding: 16, gap: 12 },
  inputRow: { flexDirection: 'row', gap: 12 },
  inputWrapSmall: { flex: 0.3, gap: 6 },
  inputWrapLarge: { flex: 0.7, gap: 6 },
  inputLabel: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 10,
    color: theme.muted,
    fontWeight: '700',
  },
  input: {
    backgroundColor: theme.surface,
    color: theme.foreground,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    fontSize: 13,
    borderWidth: 1,
    borderColor: theme.border,
  },
  saveBtn: {
    backgroundColor: theme.accent,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
});

const TicketCard = ({
  item,
  onRetry,
}: {
  item: Ticket;
  onRetry: () => void;
}) => {
  const statusMeta: Record<string, { color: string; bg: string }> = {
    COMPLETED: { color: theme.success, bg: theme.successDim },
    CANCELLED: { color: theme.destructive, bg: theme.destructiveDim },
    PENDING: { color: theme.warning, bg: theme.warningDim },
  };
  const meta: { color: string; bg: string } = statusMeta[
    item.status ?? 'PENDING'
  ] || {
    color: theme.muted,
    bg: theme.surfaceAlt,
  };

  // Calculate if the 10-minute retry window is still valid
  const orderTime = item.createdAt ? new Date(item.createdAt).getTime() : 0;
  const isRetryAllowed = Date.now() - orderTime < 10 * 60 * 1000;

  return (
    <View style={ticketStyles.card}>
      <View style={ticketStyles.header}>
        <Pill
          label={item.status ?? 'PENDING'}
          color={meta.color}
          bg={meta.bg}
        />
        <Text style={ticketStyles.ref}>{item.ticketReference}</Text>
      </View>
      <View style={ticketStyles.body}>
        {item.items?.map((i: any, idx: number) => (
          <View key={idx} style={ticketStyles.itemRow}>
            <View style={ticketStyles.qtyNameRow}>
              <View style={ticketStyles.qtyBadge}>
                <Text style={ticketStyles.qty}>{i.quantity}x</Text>
              </View>
              <Text style={ticketStyles.itemName}>{i.name}</Text>
            </View>
            <Text style={ticketStyles.price}>₹{i.itemTotal}</Text>
          </View>
        ))}
      </View>
      {/* Hide retry button entirely if order status is COMPLETED or if the 10-min window expired */}
      {item.status !== 'COMPLETED' && isRetryAllowed && (
        <TouchableOpacity style={ticketStyles.retryBtn} onPress={onRetry}>
          <Text style={ticketStyles.retryText}>↺ RETRY SYSTEM PRINT</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const ticketStyles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    marginHorizontal: 14,
    marginBottom: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderLight,
    backgroundColor: theme.surfaceAlt,
  },
  ref: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 12,
    color: theme.foreground,
    fontWeight: '700',
  },
  body: { padding: 16, gap: 10 },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  qtyNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: theme.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.borderLight,
  },
  qty: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 11,
    color: theme.secondary,
    fontWeight: '700',
  },
  itemName: { color: theme.foreground, fontSize: 13, fontWeight: '500' },
  price: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 13,
    color: theme.foreground,
    fontWeight: '600',
  },
  retryBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.accent + '30',
    backgroundColor: theme.accentDim,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { fontSize: 11, color: theme.accent, fontWeight: '700' },
});

export default function App(): React.JSX.Element {
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

  const countersRef = useRef<CounterConfig[]>([]);
  const discoveredPrintersRef = useRef<DiscoveredPrinter[]>([]);
  const logsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const generateMockTicket = (counterId: string): Ticket => ({
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

  const runHardwarePrint = async (
    type: string,
    address: string,
    ticket: Ticket,
    discovered?: DiscoveredPrinter,
  ): Promise<void> => {
    writeLog(
      'INFO',
      `[PRINT] Initiating print to ${type}[${address}] — Ref: ${ticket.ticketReference}`,
    );
    await executePrintJob(
      type as 'LAN' | 'BT' | 'USB',
      address,
      ticket,
      discovered,
    );
    writeLog('INFO', `[PRINT] Print successful → ${type}[${address}]`);
  };

  const executePrint = useCallback(async (ticket: Ticket): Promise<void> => {
    // Time-window guard
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

    // Auto-Retry Matrix Execution Loop
    const MAX_ATTEMPTS = 3;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        writeLog(
          'INFO',
          `[PRINT-PIPELINE] Dispatching print job for ${ticket.orderId} (Attempt ${attempt}/${MAX_ATTEMPTS})`,
        );

        const cachedPrinter: DiscoveredPrinter | undefined =
          discoveredPrintersRef.current.find(
            (dp: DiscoveredPrinter) =>
              dp.address === targetCounter.printerAddress,
          );

        await runHardwarePrint(
          targetCounter.printerType,
          targetCounter.printerAddress,
          ticket,
          cachedPrinter,
        );

        // Success: Mark complete and exit the execution ring cleanly
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

        // If we have remaining attempts, cool down the driver stack for 2 seconds before retrying
        if (attempt < MAX_ATTEMPTS) {
          await new Promise<void>(resolve => setTimeout(() => resolve(), 2000));
        }
      }
    }

    // Exhausted Path: Executes only if all 3 attempts hit the catch block
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

  const ensureNotificationPermission = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    if (Platform.Version < 33) return true;
    try {
      const granted: string = await PermissionsAndroid.request(
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

  const toggleServerRuntime = async (): Promise<void> => {
    if (isServerRunning) {
      try {
        writeLog('WARN', '[SYSTEM] Initiating full system teardown matrix...');
        const nativePusher = Pusher.getInstance();

        writeLog(
          'INFO',
          '[PUSHER] Disconnecting native transport layer directly...',
        );
        await nativePusher.disconnect();
        writeLog(
          'INFO',
          '[PUSHER] Native socket transport disconnected completely.',
        );
      } catch (disconnectError: unknown) {
        writeLog(
          'ERROR',
          `[PUSHER] Socket cleanup fault: ${String(disconnectError)}`,
        );
      }

      ReactNativeForegroundService.remove_task('printerOrderPollingTask');
      await ReactNativeForegroundService.stop();
      await AsyncStorage.removeItem('@printer_engine_status');
      setIsServerRunning(false);
      setEngineStatus({ connected: false, channels: [], updatedAt: '' });
      writeLog(
        'WARN',
        '[SYSTEM] Foreground printer agent server paused manually.',
      );
      return;
    }

    let currentConfig = await getEngineConfig();
    if (!currentConfig) {
      try {
        currentConfig = await promptForEngineConfig();
      } catch {
        writeLog('WARN', '[SYSTEM] Engine initialization aborted by operator.');
        return;
      }
    }
    const verifiedConfig = currentConfig;

    const hasNotifPermission: boolean = await ensureNotificationPermission();
    if (!hasNotifPermission) {
      writeLog(
        'WARN',
        '[SYSTEM] POST_NOTIFICATIONS denied — foreground notification will not display.',
      );
    }

    try {
      await ReactNativeForegroundService.start({
        id: 9912,
        title: 'Printer Server Active',
        message:
          'Monitoring multi-counter queue lines in parallel background threads...',
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
            writeLog(
              'INFO',
              `[ENGINE] Synchronizing cluster token for node ${verifiedConfig.id}...`,
            );
            const enginePingResponse = await fetch(
              'https://cm-bps.vercel.app/api/engine/ping',
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  engineId: verifiedConfig.id,
                  priority: verifiedConfig.priority,
                }),
              },
            );

            if (!enginePingResponse.ok) {
              const pingErrResult = await enginePingResponse
                .json()
                .catch(() => ({ error: 'Unknown system clash' }));
              writeLog(
                'ERROR',
                `[CLUSTER-CONFLICT] Assertion failed: ${pingErrResult.error}`,
              );

              ReactNativeForegroundService.remove_task(
                'printerOrderPollingTask',
              );
              await ReactNativeForegroundService.stop();
              setIsServerRunning(false);
              setEngineStatus({
                connected: false,
                channels: [],
                updatedAt: '',
              });
              Alert.alert(
                'Cluster Preemption',
                pingErrResult.error || 'A higher priority engine dominates.',
              );
              return;
            }

            writeLog('INFO', '[API] Resolving counter endpoint allocation...');
            const response: Response = await fetch(
              'https://cm-bps.vercel.app/api/counters',
            );
            const result: any = await response.json();

            if (!result || !result.success || !Array.isArray(result.data)) {
              writeLog(
                'ERROR',
                '[API] Failed parsing downstream data config matrix.',
              );
              return;
            }

            const activeCounters: CounterConfig[] =
              result.data as CounterConfig[];

            writeLog(
              'INFO',
              '[WARMUP] Initiating eager hardware pooling phase...',
            );
            for (const counter of activeCounters) {
              if (
                !counter.printerAddress ||
                counter.printerType === 'NONE' ||
                counter.printerType === 'LAN'
              ) {
                continue;
              }
              await warmPrinterConnection(
                counter.printerType as 'BT' | 'USB',
                counter.printerAddress,
              );
            }

            const nativePusher: Pusher = Pusher.getInstance();
            const headlessPrintingLocks: Record<string, boolean> = {};

            writeLog('INFO', '[PUSHER] Triggering remote cluster dial up...');
            await nativePusher.connect();

            const currentChannels: Set<string> = new Set<string>(
              activeCounters.map((c: CounterConfig) => `counter-${c.id}`),
            );

            await AsyncStorage.setItem(
              '@printer_engine_status',
              JSON.stringify({
                connected: true,
                channels: Array.from(currentChannels),
                updatedAt: new Date().toLocaleTimeString(),
              }),
            );

            for (const channelName of currentChannels) {
              try {
                writeLog(
                  'INFO',
                  `[PUSHER] Executing subscribe() promise for: ${channelName}`,
                );

                await nativePusher.subscribe({
                  channelName,
                  onSubscriptionSucceeded: () => {
                    writeLog(
                      'INFO',
                      `[PUSHER] CALLBACK: Confirmed subscription for channel: ${channelName}`,
                    );
                  },
                  onSubscriptionError: (message: string) => {
                    writeLog(
                      'ERROR',
                      `[PUSHER] CALLBACK: Subscription denied for ${channelName}: ${message}`,
                    );
                  },
                  onEvent: async (event: PusherEvent) => {
                    if (event.eventName !== 'NEW_ORDER') return;

                    try {
                      writeLog(
                        'INFO',
                        `[PAYLOAD] Received event tracking signature on channel ${channelName}`,
                      );
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
                      ) {
                        writeLog(
                          'WARN',
                          `[JOURNAL] Deduplicated duplicate order packet hash: ${actionableTicket.orderId}`,
                        );
                        return;
                      }

                      await appendJournalTicket(actionableTicket);
                      DeviceEventEmitter.emit('JOURNAL_UPDATED');

                      const matchedCounter: CounterConfig | undefined =
                        activeCounters.find(
                          (c: CounterConfig) =>
                            c.id === actionableTicket.counterId,
                        );

                      if (!matchedCounter) return;
                      const printerAddress: string | undefined =
                        matchedCounter.printerAddress || undefined;

                      if (
                        printerAddress &&
                        matchedCounter.status === 'ACTIVE' &&
                        matchedCounter.printerType !== 'NONE'
                      ) {
                        if (headlessPrintingLocks[printerAddress]) {
                          let attempts: number = 0;
                          while (
                            headlessPrintingLocks[printerAddress] &&
                            attempts < 10
                          ) {
                            await new Promise<void>((r: () => void) => {
                              setTimeout(r, 1500);
                            });
                            attempts++;
                          }
                        }

                        try {
                          headlessPrintingLocks[printerAddress] = true;

                          const matchedPrinterDevice:
                            | DiscoveredPrinter
                            | undefined = discoveredPrintersRef.current.find(
                            (dp: DiscoveredPrinter) =>
                              dp.address === printerAddress,
                          );

                          await executePrintJob(
                            matchedCounter.printerType as 'LAN' | 'BT' | 'USB',
                            printerAddress,
                            actionableTicket,
                            matchedPrinterDevice,
                          );

                          await updateJournalTicketStatus(
                            actionableTicket.orderId,
                            'COMPLETED',
                          );
                        } catch (taskErr: unknown) {
                          writeLog(
                            'ERROR',
                            `[HEADLESS-TASK] Execution crashed: ${String(
                              taskErr,
                            )}`,
                          );
                          await updateJournalTicketStatus(
                            actionableTicket.orderId,
                            'CANCELLED',
                          ).catch(() => {});
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
                    } catch (parseErr: unknown) {
                      writeLog(
                        'ERROR',
                        `[HEADLESS-PAYLOAD] Serialization block failed: ${String(
                          parseErr,
                        )}`,
                      );
                    }
                  },
                });

                writeLog(
                  'INFO',
                  `[PUSHER] subscribe() promise resolved for: ${channelName}`,
                );
              } catch (subKeyError: unknown) {
                writeLog(
                  'ERROR',
                  `[PUSHER] Critical promise failure calling subscribe line for ${channelName}: ${String(
                    subKeyError,
                  )}`,
                );
              }
            }
          } catch (netFatal: unknown) {
            writeLog(
              'ERROR',
              `[HEADLESS-CORE] Task loop failed out completely: ${String(
                netFatal,
              )}`,
            );
            await AsyncStorage.setItem(
              '@printer_engine_status',
              JSON.stringify({
                connected: false,
                channels: [],
                updatedAt: new Date().toLocaleTimeString(),
              }),
            );
          }
        },
        {
          delay: 1000,
          onLoop: false,
          taskId: 'printerOrderPollingTask',
          onError: (err: any) => {
            writeLog(
              'ERROR',
              `[FOREGROUND-SERVICE] Task runner exception: ${String(err)}`,
            );
          },
        },
      );

      setIsServerRunning(true);
      writeLog('INFO', '[SYSTEM] Foreground processing channel established.');
    } catch (e: unknown) {
      writeLog('ERROR', `[SYSTEM] Boot sequence error: ${String(e)}`);
      Alert.alert('Fault', 'Could not secure background channel runtime.');
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
        printer,
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
      const cachedPrinter: DiscoveredPrinter | undefined =
        discoveredPrintersRef.current.find(
          (dp: DiscoveredPrinter) => dp.address === counter.printerAddress,
        );
      await runHardwarePrint(
        counter.printerType,
        counter.printerAddress,
        mockTicket,
        cachedPrinter,
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
      const response: Response = await fetch(`${apiUrl}/api/counters`);
      const result: any = await response.json();
      if (result.success) {
        writeLog('INFO', `[API] ${result.data.length} counter(s) loaded.`);
        setCounters(result.data as CounterConfig[]);
        countersRef.current = result.data as CounterConfig[];
      }
    } catch (err: unknown) {
      writeLog('ERROR', `[API] Failed to fetch counters: ${String(err)}`);
    }
  }, [apiUrl]);

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
        headers: { 'Content-Type': 'application/json' },
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
      return next;
    });
  };

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
          await nativePusher.disconnect();
        } catch {}

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

  const scanMeta: { label: string; color: string } = scanPhaseConfig[scanPhase];
  const levelColor = (level: string): string =>
    level === 'ERROR'
      ? theme.destructive
      : level === 'WARN'
      ? theme.warning
      : theme.success;
  const pendingCount: number = tickets.filter(
    (t: Ticket) => t.status === 'PENDING',
  ).length;
  const failedCount: number = tickets.filter(
    (t: Ticket) => t.status === 'CANCELLED',
  ).length;

  return (
    <SafeAreaView style={appStyles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.surface} />

      <View style={appStyles.header}>
        <View style={appStyles.headerTextBlock}>
          <Text style={appStyles.headerSub}>BMSCW Canteen, Basavanagudi</Text>
          <Text style={appStyles.headerTitle}>MunchUp Printer Hub</Text>
        </View>
        <View style={appStyles.headerRight}>
          <TouchableOpacity
            style={[
              appStyles.statusToggleBtn,
              {
                borderColor: isServerRunning
                  ? theme.success + '40'
                  : theme.muted + '40',
              },
            ]}
            onPress={() => {
              toggleServerRuntime();
            }}
            activeOpacity={0.8}
          >
            <View style={appStyles.toggleBtnLabelSection}>
              <Text
                style={[appStyles.toggleBtnText, { color: theme.foreground }]}
              >
                CORE ENGINE
              </Text>
            </View>
            <View
              style={[
                appStyles.toggleBtnStatusSection,
                isServerRunning
                  ? appStyles.statusSectionActive
                  : appStyles.statusSectionInactive,
              ]}
            >
              <View
                style={[
                  appStyles.statusIndicatorDot,
                  isServerRunning ? appStyles.dotActive : appStyles.dotInactive,
                ]}
              />
              <Text
                style={[
                  appStyles.toggleStatusLabelText,
                  isServerRunning
                    ? appStyles.textActive
                    : appStyles.textInactive,
                ]}
              >
                {isServerRunning ? 'ON' : 'OFF'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <View style={appStyles.screenBody}>
        {activeTab === 'QUEUE' && (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={appStyles.scrollContent}
          >
            <View style={appStyles.pusherStatusCard}>
              <View style={appStyles.pusherStatusHeader}>
                <View style={appStyles.pusherStatusDotLabel}>
                  <View
                    style={[
                      appStyles.statusIndicatorDot,
                      {
                        backgroundColor:
                          isServerRunning && engineStatus.connected
                            ? theme.success
                            : isServerRunning
                            ? theme.warning
                            : theme.destructive,
                      },
                    ]}
                  />
                  <Text style={appStyles.pusherStatusTitle}>
                    Pusher WebSocket Pipeline
                  </Text>
                </View>
                <Text style={appStyles.pusherStatusMetaText}>
                  {isServerRunning && engineStatus.connected
                    ? 'CONNECTED'
                    : isServerRunning
                    ? 'INITIALIZING...'
                    : 'DISCONNECTED'}
                </Text>
              </View>
              {isServerRunning && engineStatus.channels.length > 0 ? (
                <View style={appStyles.pusherChannelsList}>
                  <Text style={appStyles.pusherChannelsLabel}>
                    Listening Subscriptions ({engineStatus.channels.length}):
                  </Text>
                  <View style={appStyles.pusherChannelsRow}>
                    {engineStatus.channels.map((chan: string) => (
                      <View key={chan} style={appStyles.pusherChannelBadge}>
                        <Text style={appStyles.pusherChannelBadgeText}>
                          {chan}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : (
                <Text style={appStyles.pusherNoChannelsText}>
                  {isServerRunning
                    ? 'Synchronizing network data matrix configurations...'
                    : 'Turn on the core system engine to attach runtime node subscriptions.'}
                </Text>
              )}
            </View>

            <View style={appStyles.statsRow}>
              {[
                {
                  label: 'TOTAL JOBS',
                  value: tickets.length,
                  color: theme.foreground,
                  bg: theme.surface,
                },
                {
                  label: 'PENDING',
                  value: pendingCount,
                  color: theme.warning,
                  bg: theme.warningDim,
                },
                {
                  label: 'FAILED',
                  value: failedCount,
                  color: theme.destructive,
                  bg: theme.destructiveDim,
                },
                {
                  label: 'COMPLETED',
                  value: tickets.filter((t: Ticket) => t.status === 'COMPLETED')
                    .length,
                  color: theme.success,
                  bg: theme.successDim,
                },
              ].map(
                (s: {
                  label: string;
                  value: number;
                  color: string;
                  bg: string;
                }) => (
                  <View
                    key={s.label}
                    style={[appStyles.statBox, { backgroundColor: s.bg }]}
                  >
                    <Text style={[appStyles.statNum, { color: s.color }]}>
                      {s.value}
                    </Text>
                    <Text style={appStyles.statLabel}>{s.label}</Text>
                  </View>
                ),
              )}
            </View>

            {tickets.length === 0 ? (
              <View style={appStyles.emptyState}>
                <View style={appStyles.emptyIconWrap}>
                  <Text style={appStyles.emptyIconText}>🗒</Text>
                </View>
                <Text style={appStyles.emptyTitle}>Queue is Empty</Text>
                <Text style={appStyles.emptySub}>
                  Waiting for incoming system transaction payloads to route.
                </Text>
              </View>
            ) : (
              <>
                <SectionLabel text="Transactional Journal Queue" />
                {tickets.map((item: Ticket) => (
                  <TicketCard
                    key={item.orderId}
                    item={item}
                    onRetry={() => {
                      executePrint(item);
                    }}
                  />
                ))}
              </>
            )}
          </ScrollView>
        )}

        {activeTab === 'HARDWARE' && (
          <View style={appStyles.flexContainer}>
            {hardwareTab === 'REGISTERED' && (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={appStyles.scrollContent}
              >
                {counters.length === 0 ? (
                  <View style={appStyles.emptyState}>
                    <View style={appStyles.emptyIconWrap}>
                      <Text style={appStyles.emptyIconText}>🗄</Text>
                    </View>
                    <Text style={appStyles.emptyTitle}>No Stations Mapped</Text>
                    <Text style={appStyles.emptySub}>
                      Discover network or wireless nodes to link them to
                      terminal endpoints.
                    </Text>
                  </View>
                ) : (
                  counters.map((counter: CounterConfig) => (
                    <RegisteredCounterCard
                      key={counter.id}
                      counter={counter}
                      onTest={() => {
                        testRegisteredCounter(counter);
                      }}
                    />
                  ))
                )}
              </ScrollView>
            )}

            {hardwareTab === 'DISCOVERED' && (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={appStyles.scrollContent}
              >
                <View style={appStyles.scanStrip}>
                  <View style={appStyles.scanStripLeft}>
                    {scanPhase !== 'done' && (
                      <ActivityIndicator
                        size="small"
                        color={scanMeta.color}
                        style={appStyles.scanStripSpinner}
                      />
                    )}
                    <Text
                      style={[
                        appStyles.scanStripLabel,
                        { color: scanMeta.color },
                      ]}
                    >
                      {scanMeta.label}
                    </Text>
                  </View>
                  <Text style={appStyles.scanStripCount}>
                    {discoveredPrinters.length} DEVICES FOUND
                  </Text>
                </View>

                {unlinkedPrinters.length === 0 && scanPhase === 'done' ? (
                  <View style={appStyles.emptyState}>
                    <View style={appStyles.emptyIconWrap}>
                      <Text style={appStyles.emptyIconText}>🔍</Text>
                    </View>
                    <Text style={appStyles.emptyTitle}>
                      No Unlinked Interfaces
                    </Text>
                    <Text style={appStyles.emptySub}>
                      All discovered print engines match an internal routing
                      rule safely.
                    </Text>
                  </View>
                ) : (
                  unlinkedPrinters.map((printer: DiscoveredPrinter) => (
                    <DiscoveredPrinterCard
                      key={printer.address}
                      printer={printer}
                      isSelected={selectedUnlinked?.address === printer.address}
                      onTest={() => {
                        testUnlinkedPrinter(printer);
                      }}
                      onToggleLink={(): void =>
                        setSelectedUnlinked(
                          selectedUnlinked?.address === printer.address
                            ? null
                            : printer,
                        )
                      }
                      newCounterNum={newCounterNum}
                      setNewCounterNum={setNewCounterNum}
                      newCounterName={newCounterName}
                      setNewCounterName={setNewCounterName}
                      onRegister={(): void => {
                        registerCounter(printer);
                      }}
                    />
                  ))
                )}

                <CollapsibleSection
                  title="Add Static IPv4 Network Printer"
                  defaultOpen={false}
                  badge="IP"
                >
                  <View style={appStyles.manualForm}>
                    <Text style={appStyles.manualLabel}>
                      TARGET HOST IPv4 ADDRESS
                    </Text>
                    <TextInput
                      style={appStyles.input}
                      placeholder="e.g. 192.168.1.100"
                      placeholderTextColor={theme.muted}
                      value={manualIp}
                      onChangeText={setManualIp}
                    />
                    <TouchableOpacity
                      style={appStyles.discoverBtn}
                      onPress={addManualLanPrinter}
                    >
                      <Text style={appStyles.discoverBtnText}>
                        MOUNT NETWORK INTERFACE
                      </Text>
                    </TouchableOpacity>
                  </View>
                </CollapsibleSection>
              </ScrollView>
            )}
          </View>
        )}

        {activeTab === 'LOGS' && (
          <View style={appStyles.logsWrap}>
            <View style={appStyles.logsTopBar}>
              <View style={appStyles.logsLegend}>
                {[
                  { type: 'INFO', color: theme.success },
                  { type: 'WARN', color: theme.warning },
                  { type: 'ERROR', color: theme.destructive },
                ].map((level: { type: string; color: string }) => (
                  <View key={level.type} style={appStyles.legendItem}>
                    <View
                      style={[
                        appStyles.legendDot,
                        { backgroundColor: level.color },
                      ]}
                    />
                    <Text
                      style={[appStyles.legendText, { color: level.color }]}
                    >
                      {level.type}
                    </Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity
                style={appStyles.refreshBtn}
                onPress={(): void => {
                  refreshLogs();
                }}
              >
                <Text style={appStyles.refreshBtnText}>↻ SYNC CONSOLE</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {logs.length === 0 ? (
                <View style={appStyles.emptyState}>
                  <View style={appStyles.emptyIconWrap}>
                    <Text style={appStyles.emptyIconText}>⌨</Text>
                  </View>
                  <Text style={appStyles.emptyTitle}>Console Stdout Empty</Text>
                  <Text style={appStyles.emptySub}>
                    No log entries recorded in this session environment block.
                  </Text>
                </View>
              ) : (
                logs.map((log: LogEntry, i: number) => (
                  <View
                    key={i}
                    style={[
                      appStyles.logEntry,
                      log.level === 'ERROR' && appStyles.logEntryError,
                      log.level === 'WARN' && appStyles.logEntryWarn,
                    ]}
                  >
                    <View style={appStyles.logMeta}>
                      <View
                        style={[
                          appStyles.levelBadge,
                          {
                            borderColor: levelColor(log.level) + '30',
                            backgroundColor: levelColor(log.level) + '10',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            appStyles.levelBadgeText,
                            { color: levelColor(log.level) },
                          ]}
                        >
                          {log.level}
                        </Text>
                      </View>
                      <View style={timeWrapStyle.timeWrap}>
                        <Text style={appStyles.logTs}>
                          🕒 {new Date(log.timestamp).toLocaleTimeString()}
                        </Text>
                      </View>
                    </View>
                    <Text style={appStyles.logMsg}>{log.message}</Text>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        )}
      </View>

      <View style={appStyles.bottomNavBar}>
        <TouchableOpacity
          style={appStyles.bottomNavItem}
          onPress={() => setActiveTab('QUEUE')}
          activeOpacity={0.8}
        >
          {activeTab === 'QUEUE' && (
            <View style={appStyles.bottomNavOverline} />
          )}
          <View style={appStyles.navItemInner}>
            <Text
              style={[
                appStyles.bottomNavLabel,
                activeTab === 'QUEUE' && appStyles.bottomNavLabelActive,
              ]}
            >
              Queue
            </Text>
            {(pendingCount > 0 || failedCount > 0) && (
              <View
                style={[
                  appStyles.navDot,
                  {
                    backgroundColor:
                      failedCount > 0 ? theme.destructive : theme.warning,
                  },
                ]}
              />
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={appStyles.bottomNavItem}
          onPress={() => {
            setActiveTab('HARDWARE');
            setHardwareTab('REGISTERED');
          }}
          activeOpacity={0.8}
        >
          {activeTab === 'HARDWARE' && hardwareTab === 'REGISTERED' && (
            <View style={appStyles.bottomNavOverline} />
          )}
          <Text
            style={[
              appStyles.bottomNavLabel,
              activeTab === 'HARDWARE' &&
                hardwareTab === 'REGISTERED' &&
                appStyles.bottomNavLabelActive,
            ]}
          >
            Registered
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={appStyles.bottomNavItem}
          onPress={() => {
            setActiveTab('HARDWARE');
            setHardwareTab('DISCOVERED');
          }}
          activeOpacity={0.8}
        >
          {activeTab === 'HARDWARE' && hardwareTab === 'DISCOVERED' && (
            <View style={appStyles.bottomNavOverline} />
          )}
          <Text
            style={[
              appStyles.bottomNavLabel,
              activeTab === 'HARDWARE' &&
                hardwareTab === 'DISCOVERED' &&
                appStyles.bottomNavLabelActive,
            ]}
          >
            Discovered
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={appStyles.bottomNavItem}
          onPress={() => setActiveTab('LOGS')}
          activeOpacity={0.8}
        >
          {activeTab === 'LOGS' && <View style={appStyles.bottomNavOverline} />}
          <Text
            style={[
              appStyles.bottomNavLabel,
              activeTab === 'LOGS' && appStyles.bottomNavLabelActive,
            ]}
          >
            Logs
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const timeWrapStyle = StyleSheet.create({
  timeWrap: { flexDirection: 'row', alignItems: 'center' },
});

const appStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  flexContainer: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    backgroundColor: theme.surface,
  },
  headerTextBlock: { gap: 1 },
  headerSub: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 8,
    letterSpacing: 0.5,
    color: theme.muted,
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.foreground,
    letterSpacing: -0.3,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  statusToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: theme.surfaceAlt,
  },
  toggleBtnLabelSection: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleBtnText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  toggleBtnStatusSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 5,
    borderLeftWidth: 1,
    borderLeftColor: theme.border,
  },
  statusIndicatorDot: { width: 6, height: 6, borderRadius: 3 },
  toggleStatusLabelText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 10,
    fontWeight: '800',
  },
  statusSectionActive: { backgroundColor: theme.success },
  statusSectionInactive: { backgroundColor: theme.border },
  dotActive: { backgroundColor: '#FFFFFF' },
  dotInactive: { backgroundColor: theme.muted },
  textActive: { color: '#FFFFFF' },
  textInactive: { color: theme.secondary },
  screenBody: { flex: 1 },
  bottomNavBar: {
    flexDirection: 'row',
    backgroundColor: theme.surface,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingBottom: Platform.OS === 'ios' ? 20 : 0,
  },
  bottomNavItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    position: 'relative',
  },
  bottomNavLabel: {
    fontSize: 12,
    color: theme.muted,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  bottomNavLabelActive: { color: theme.foreground, fontWeight: '700' },
  bottomNavOverline: {
    position: 'absolute',
    top: 0,
    left: '15%',
    right: '15%',
    height: 3,
    backgroundColor: theme.accent,
    borderRadius: 2,
  },
  navItemInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  navDot: { width: 6, height: 6, borderRadius: 3 },
  scrollContent: { paddingVertical: 16, paddingBottom: 20 },
  scanStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 14,
    marginHorizontal: 14,
  },
  scanStripLeft: { flexDirection: 'row', alignItems: 'center' },
  scanStripSpinner: { marginRight: 8 },
  scanStripLabel: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 11,
    fontWeight: '700',
  },
  scanStripCount: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 10,
    color: theme.muted,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    paddingHorizontal: 32,
  },
  emptyIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyIconText: { fontSize: 24 },
  emptyTitle: {
    color: theme.foreground,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  emptySub: {
    color: theme.muted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
    paddingHorizontal: 14,
  },
  statBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  statNum: { fontSize: 20, fontWeight: '800', marginBottom: 2 },
  statLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: theme.muted,
    textAlign: 'center',
  },
  manualForm: { padding: 16, gap: 10 },
  manualLabel: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 10,
    color: theme.muted,
    fontWeight: '700',
  },
  input: {
    backgroundColor: theme.surface,
    color: theme.foreground,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    fontSize: 13,
    borderWidth: 1,
    borderColor: theme.border,
  },
  discoverBtn: {
    backgroundColor: theme.accent,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  discoverBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  logsWrap: { flex: 1, paddingHorizontal: 14, paddingTop: 14 },
  logsTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  logsLegend: { flexDirection: 'row', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { fontSize: 10, fontWeight: '700' },
  refreshBtn: {
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: theme.surface,
  },
  refreshBtnText: { fontSize: 10, color: theme.secondary, fontWeight: '700' },
  logEntry: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderLight,
    borderRadius: 8,
    marginBottom: 8,
  },
  logEntryError: {
    backgroundColor: theme.destructiveDim,
    borderColor: theme.destructive + '15',
  },
  logEntryWarn: {
    backgroundColor: theme.warningDim,
    borderColor: theme.warning + '15',
  },
  logMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  levelBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  levelBadgeText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 9,
    fontWeight: '700',
  },
  logTs: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 10,
    color: theme.muted,
  },
  logMsg: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
    color: theme.foreground,
    lineHeight: 16,
  },
  pusherStatusCard: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 14,
    marginBottom: 16,
  },
  pusherStatusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pusherStatusDotLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pusherStatusTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.foreground,
  },
  pusherStatusMetaText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 10,
    fontWeight: '800',
    color: theme.secondary,
  },
  pusherChannelsList: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.borderLight,
    paddingTop: 12,
    gap: 8,
  },
  pusherChannelsLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.muted,
  },
  pusherChannelsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pusherChannelBadge: {
    backgroundColor: theme.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pusherChannelBadgeText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 10,
    color: theme.foreground,
    fontWeight: '600',
  },
  pusherNoChannelsText: {
    fontSize: 11,
    color: theme.muted,
    lineHeight: 16,
    marginTop: 10,
  },
});
