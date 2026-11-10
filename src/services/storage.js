import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const storage = {
  async setItem(key, value) {
    if (Platform.OS === 'web') {
      try {
        localStorage.setItem(key, value);
      } catch (e) {
        console.warn('localStorage set error', e);
      }
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },

  async getItem(key) {
    if (Platform.OS === 'web') {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        return null;
      }
    }
    return await SecureStore.getItemAsync(key);
  },

  async deleteItem(key) {
    if (Platform.OS === 'web') {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        console.warn('localStorage remove error', e);
      }
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};