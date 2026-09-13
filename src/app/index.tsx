import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import api from '../services/api';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const router = useRouter();

  const handleLogin = async () => {
    try {
      // Hit the Express backend using your new Axios interceptor
      const response = await api.post('/auth/login', { email, password });
      
      if (response.data.token) {
        // Persist session and role to device storage
        await SecureStore.setItemAsync('userToken', response.data.token);
        await SecureStore.setItemAsync('userRole', response.data.user.role);
        
        // Role-Based Access Control routing
        if (response.data.user.role === 'Driver') {
          router.replace('/explore' as any);
        } else if (response.data.user.role === 'Host') {
          router.replace('/host' as any);
        } else {
          router.replace('/explore' as any); 
        }
      }
    } catch (error: any) {
      Alert.alert(
        'Login Failed', 
        error.response?.data?.message || 'Invalid network routing or credentials.'
      );
    }
  };

  return (
    <View className="flex-1 justify-center px-6 bg-[#0B0F19]">
      <Text className="text-3xl font-bold text-white mb-2">PeerPark</Text>
      <Text className="text-gray-400 mb-8">Sign in to the peer-to-peer parking network.</Text>

      <TextInput
        className="w-full bg-[#1A2235] text-white px-4 py-4 rounded-lg mb-4"
        placeholder="Email Address"
        placeholderTextColor="#6B7280"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      
      <TextInput
        className="w-full bg-[#1A2235] text-white px-4 py-4 rounded-lg mb-8"
        placeholder="Password"
        placeholderTextColor="#6B7280"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity 
        className="w-full bg-[#10B981] py-4 rounded-lg items-center"
        onPress={handleLogin}
      >
        <Text className="text-white font-bold text-lg">Sign In</Text>
      </TouchableOpacity>
    </View>
  );
}