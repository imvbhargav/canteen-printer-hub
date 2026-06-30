import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { DiscoveredPrinter } from '../utils/printerDiscovery';
import { theme } from './theme';

interface DiscoveredPrinterCardProps {
  printer: DiscoveredPrinter;
  isSelected: boolean;
  onTest: () => void;
  onToggleLink: () => void;
  newCounterNum: string;
  setNewCounterNum: (val: string) => void;
  newCounterName: string;
  setNewCounterName: (val: string) => void;
  onRegister: () => void;
}

export const DiscoveredPrinterCard = ({
  printer,
  isSelected,
  onTest,
  onToggleLink,
  newCounterNum,
  setNewCounterNum,
  newCounterName,
  setNewCounterName,
  onRegister,
}: DiscoveredPrinterCardProps) => {
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
