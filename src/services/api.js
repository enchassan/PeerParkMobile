import axios from 'axios';
import { Platform } from 'react-native';
import { storage } from './storage';

// Use localhost on Web, and your Wi-Fi IP on physical iPhone
const API_URL = Platform.OS === 'web' 
  ? 'http://localhost:5000/api' 
  : 'http://192.168.1.2:5000/api';

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
      const token = await storage.getItem('userToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (err) {
      console.warn('Token read error:', err);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export default api;