import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import { CounterConfig } from '../types';
import { DiscoveredPrinter } from '../utils/printerDiscovery';
import { HardwareTab, ScanPhase, theme } from './theme';
import { RegisteredCounterCard } from './RegisteredCounterCard';
import { DiscoveredPrinterCard } from './DiscoveredPrinterCard';
import { CollapsibleSection } from './CollapsibleSection';

interface HardwareTabContentProps {
  hardwareTab: HardwareTab;
  counters: CounterConfig[];
  discoveredPrinters: DiscoveredPrinter[];
  unlinkedPrinters: DiscoveredPrinter[];
  scanPhase: ScanPhase;
  scanMeta: { label: string; color: string };
  selectedUnlinked: DiscoveredPrinter | null;
  setSelectedUnlinked: (printer: DiscoveredPrinter | null) => void;
  newCounterNum: string;
  setNewCounterNum: (val: string) => void;
  newCounterName: string;
  setNewCounterName: (val: string) => void;
  manualIp: string;
  setManualIp: (val: string) => void;
  testRegisteredCounter: (counter: CounterConfig) => void;
  testUnlinkedPrinter: (printer: DiscoveredPrinter) => void;
  registerCounter: (printer: DiscoveredPrinter) => void;
  addManualLanPrinter: () => void;
}

export const HardwareTabContent = ({
  hardwareTab,
  counters,
  discoveredPrinters,
  unlinkedPrinters,
  scanPhase,
  scanMeta,
  selectedUnlinked,
  setSelectedUnlinked,
  newCounterNum,
  setNewCounterNum,
  newCounterName,
  setNewCounterName,
  manualIp,
  setManualIp,
  testRegisteredCounter,
  testUnlinkedPrinter,
  registerCounter,
  addManualLanPrinter,
}: HardwareTabContentProps) => {
  return (
    <View style={hwStyles.flexContainer}>
      {hardwareTab === 'REGISTERED' && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={hwStyles.scrollContent}
        >
          {counters.length === 0 ? (
            <View style={hwStyles.emptyState}>
              <View style={hwStyles.emptyIconWrap}>
                <Text style={hwStyles.emptyIconText}>🗄</Text>
              </View>
              <Text style={hwStyles.emptyTitle}>No Stations Mapped</Text>
              <Text style={hwStyles.emptySub}>
                Discover network or wireless nodes to link them to terminal endpoints.
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
          contentContainerStyle={hwStyles.scrollContent}
        >
          <View style={hwStyles.scanStrip}>
            <View style={hwStyles.scanStripLeft}>
              {scanPhase !== 'done' && (
                <ActivityIndicator
                  size="small"
                  color={scanMeta.color}
                  style={hwStyles.scanStripSpinner}
                />
              )}
              <Text
                style={[
                  hwStyles.scanStripLabel,
                  { color: scanMeta.color },
                ]}
              >
                {scanMeta.label}
              </Text>
            </View>
            <Text style={hwStyles.scanStripCount}>
              {discoveredPrinters.length} DEVICES FOUND
            </Text>
          </View>

          {unlinkedPrinters.length === 0 && scanPhase === 'done' ? (
            <View style={hwStyles.emptyState}>
              <View style={hwStyles.emptyIconWrap}>
                <Text style={hwStyles.emptyIconText}>🔍</Text>
              </View>
              <Text style={hwStyles.emptyTitle}>No Unlinked Interfaces</Text>
              <Text style={hwStyles.emptySub}>
                All discovered print engines match an internal routing rule safely.
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
            <View style={hwStyles.manualForm}>
              <Text style={hwStyles.manualLabel}>
                TARGET HOST IPv4 ADDRESS
              </Text>
              <TextInput
                style={hwStyles.input}
                placeholder="e.g. 192.168.1.100"
                placeholderTextColor={theme.muted}
                value={manualIp}
                onChangeText={setManualIp}
              />
              <TouchableOpacity
                style={hwStyles.discoverBtn}
                onPress={addManualLanPrinter}
              >
                <Text style={hwStyles.discoverBtnText}>
                  MOUNT NETWORK INTERFACE
                </Text>
              </TouchableOpacity>
            </View>
          </CollapsibleSection>
        </ScrollView>
      )}
    </View>
  );
};

const hwStyles = StyleSheet.create({
  flexContainer: { flex: 1 },
  scrollContent: { paddingVertical: 16, paddingBottom: 20 },
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
});
