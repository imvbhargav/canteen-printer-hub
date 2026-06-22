/**
 * @format
 */

import { Buffer } from 'buffer';
import ReactNativeForegroundService from '@supersami/rn-foreground-service';

global.Buffer = Buffer;

import structuredClone from '@ungap/structured-clone';
if (!global.structuredClone) {
  global.structuredClone = structuredClone;
}

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

ReactNativeForegroundService.register({
  config: {
    alert: true,
    onServiceErrorCallBack: () => {
      console.error('Foreground printer service execution thread failure.');
    },
  },
});

AppRegistry.registerComponent(appName, () => App);
