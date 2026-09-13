import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// We must use your network IP, not 'localhost', so the mobile emulator/device can route it.
const API_URL = 'http://192.168.1.7:5000/api'; 

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Intercept every request to inject the JWT token if the user is logged in
api.interceptors.request.use(
  async (config) => {
    const token = await SecureStore.getItemAsync('userToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export default api;