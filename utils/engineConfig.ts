import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

const ENGINE_CONFIG_KEY = '@munchup_engine_config';

export interface EngineConfig {
  id: string;
  priority: number;
}

export async function getEngineConfig(): Promise<EngineConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(ENGINE_CONFIG_KEY);
    return raw ? (JSON.parse(raw) as EngineConfig) : null;
  } catch {
    return null;
  }
}

export async function saveEngineConfig(config: EngineConfig): Promise<void> {
  await AsyncStorage.setItem(ENGINE_CONFIG_KEY, JSON.stringify(config));
}

export function promptForEngineConfig(): Promise<EngineConfig> {
  return new Promise(resolve => {
    Alert.prompt(
      'Configure Engine ID',
      'Enter a unique, persistent identifier for this processing node (e.g., Engine-Primary-Tab):',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Next',
          onPress: (engineId: string | undefined) => {
            if (!engineId || !engineId.trim()) {
              Alert.alert('Error', 'Engine ID cannot be blank.');
              return;
            }

            Alert.prompt(
              'Set Engine Priority',
              'Enter priority weighting integer (Higher numbers override lower numbers, e.g., 1 or 2):',
              [
                {
                  text: 'Save',
                  onPress: async (priorityStr: string | undefined) => {
                    const priority = parseInt(priorityStr || '1', 10) || 1;
                    const config: EngineConfig = {
                      id: engineId.trim(),
                      priority,
                    };
                    await saveEngineConfig(config);
                    resolve(config);
                  },
                },
              ],
              'plain-text',
              '1',
            );
          },
        },
      ],
      'plain-text',
    );
  });
}
