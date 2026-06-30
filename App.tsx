import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  StatusBar,
  TouchableOpacity,
  LogBox,
  Platform,
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from './components/theme';
import { QueueTab } from './components/QueueTab';
import { HardwareTabContent } from './components/HardwareTabContent';
import { LogsTab } from './components/LogsTab';
import { EngineConfigModal } from './components/EngineConfigModal';
import { usePrinterEngine } from './hooks/usePrinterEngine';

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

export default function App(): React.JSX.Element {
  const {
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
    registerCounter,
    addManualLanPrinter,
  } = usePrinterEngine();

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
            onPress={toggleServerRuntime}
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

          <TouchableOpacity
            style={uiStyles.configHeaderBtn}
            onPress={() => setShowConfigModal(true)}
            disabled={isServerRunning}
          >
            <Text style={uiStyles.configHeaderBtnText}>⚙</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={appStyles.screenBody}>
        {activeTab === 'QUEUE' && (
          <QueueTab
            isServerRunning={isServerRunning}
            engineStatus={engineStatus}
            tickets={tickets}
            executePrint={executePrint}
          />
        )}

        {activeTab === 'HARDWARE' && (
          <HardwareTabContent
            hardwareTab={hardwareTab}
            counters={counters}
            discoveredPrinters={discoveredPrinters}
            unlinkedPrinters={unlinkedPrinters}
            scanPhase={scanPhase}
            scanMeta={scanMeta}
            selectedUnlinked={selectedUnlinked}
            setSelectedUnlinked={setSelectedUnlinked}
            newCounterNum={newCounterNum}
            setNewCounterNum={setNewCounterNum}
            newCounterName={newCounterName}
            setNewCounterName={setNewCounterName}
            manualIp={manualIp}
            setManualIp={setManualIp}
            testRegisteredCounter={testRegisteredCounter}
            testUnlinkedPrinter={testUnlinkedPrinter}
            registerCounter={registerCounter}
            addManualLanPrinter={addManualLanPrinter}
          />
        )}

        {activeTab === 'LOGS' && (
          <LogsTab
            logs={logs}
            refreshLogs={refreshLogs}
          />
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

      <EngineConfigModal
        visible={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        inputEngineId={inputEngineId}
        setInputEngineId={setInputEngineId}
        inputPriority={inputPriority}
        setInputPriority={setInputPriority}
        onSaved={() => {
          setShowConfigModal(false);
        }}
      />
    </SafeAreaView>
  );
}

const uiStyles = StyleSheet.create({
  configHeaderBtn: {
    display: 'none',
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  configHeaderBtnText: {
    fontSize: 16,
    color: theme.secondary,
  },
});

const appStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
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
});
