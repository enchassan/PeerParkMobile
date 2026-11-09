import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const API_URL = 'https://peerpark-api.loca.lt';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 8000,
});

api.interceptors.request.use(
  async (config) => {
    try {
      const token = await SecureStore.getItemAsync('userToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (err) {
      console.warn('SecureStore token read error:', err);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export default api;