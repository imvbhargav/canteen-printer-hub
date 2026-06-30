import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EngineConfig } from '../utils/engineConfig';
import { writeLog } from '../utils/logger';
import { theme } from './theme';

interface EngineConfigModalProps {
  visible: boolean;
  onClose: () => void;
  inputEngineId: string;
  setInputEngineId: (val: string) => void;
  inputPriority: string;
  setInputPriority: (val: string) => void;
  onSaved: (config: EngineConfig) => void;
}

export const EngineConfigModal = ({
  visible,
  onClose,
  inputEngineId,
  setInputEngineId,
  inputPriority,
  setInputPriority,
  onSaved,
}: EngineConfigModalProps) => {
  if (!visible) return null;

  const handleSave = async () => {
    if (!inputEngineId.trim()) {
      Alert.alert(
        'Validation Error',
        'Engine target ID metric cannot be left empty.',
      );
      return;
    }
    const calculatedPriority = parseInt(inputPriority, 10) || 1;
    const targetConfig: EngineConfig = {
      id: inputEngineId.trim(),
      priority: calculatedPriority,
    };

    try {
      await AsyncStorage.setItem(
        '@munchup_engine_config',
        JSON.stringify(targetConfig),
      );
      writeLog(
        'INFO',
        `[CONFIG] Engine parameters manually updated locally to: ${targetConfig.id} [P: ${targetConfig.priority}]`,
      );
      onSaved(targetConfig);
    } catch (err: unknown) {
      writeLog('ERROR', `[CONFIG] Failed to save config locally: ${String(err)}`);
      Alert.alert('Error', 'Failed to save configuration.');
    }
  };

  return (
    <View style={uiStyles.modalOverlay}>
      <View style={uiStyles.modalContainer}>
        <View style={uiStyles.modalHeader}>
          <Text style={uiStyles.modalTitle}>
            Engine Cluster Configuration
          </Text>
          <TouchableOpacity
            onPress={onClose}
            style={uiStyles.modalCloseBtn}
          >
            <Text style={uiStyles.modalCloseBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={uiStyles.modalBody}>
          <Text style={uiStyles.helperText}>
            Define persistent identifiers for this tablet instance. Active
            assignments handle downstream channel feeds across your network
            counters.
          </Text>

          <View style={uiStyles.inputGroup}>
            <Text style={uiStyles.inputLabel}>
              PERSISTENT NODE INSTANCE ID
            </Text>
            <TextInput
              style={uiStyles.textInput}
              value={inputEngineId}
              onChangeText={setInputEngineId}
              placeholder="e.g., Engine-Cafeteria-Tab1"
              placeholderTextColor={theme.muted}
              autoCapitalize="none"
            />
          </View>

          <View style={uiStyles.inputGroup}>
            <Text style={uiStyles.inputLabel}>
              CLUSTER PRIORITY WEIGHTING
            </Text>
            <TextInput
              style={uiStyles.textInput}
              value={inputPriority}
              onChangeText={input =>
                setInputPriority(input.replace(/[^0-9]/g, ''))
              }
              placeholder="1 (Low) or 2 (High)"
              placeholderTextColor={theme.muted}
              keyboardType="numeric"
            />
          </View>

          <TouchableOpacity
            style={uiStyles.saveConfigBtn}
            onPress={handleSave}
          >
            <Text style={uiStyles.saveConfigBtnText}>
              COMMIT ENGINE CONFIG
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const uiStyles = StyleSheet.create({
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 999,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: theme.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderLight,
  },
  modalTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.foreground,
    letterSpacing: 0.2,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalCloseBtnText: {
    fontSize: 14,
    color: theme.muted,
  },
  modalBody: {
    padding: 16,
    gap: 16,
  },
  helperText: {
    fontSize: 11,
    color: theme.muted,
    lineHeight: 16,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier New',
    fontSize: 10,
    color: theme.secondary,
    fontWeight: '700',
  },
  textInput: {
    backgroundColor: theme.surface,
    color: theme.foreground,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    fontSize: 13,
    borderWidth: 1,
    borderColor: theme.border,
  },
  saveConfigBtn: {
    backgroundColor: theme.accent,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  saveConfigBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.5,
  },
});
