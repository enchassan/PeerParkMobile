import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import api from '../services/api';

type AuthMode = 'login' | 'register';
type UserRole = 'Driver' | 'Host';

export default function AuthScreen() {
  const router = useRouter();

  // Mode and Role state
  const [mode, setMode] = useState<AuthMode>('login');
  const [role, setRole] = useState<UserRole>('Driver');
  const [loading, setLoading] = useState<boolean>(false);
  const [checkingSession, setCheckingSession] = useState<boolean>(true);

  // Form Fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [cnicNumber, setCnicNumber] = useState('');

  // 1. Auto-login check on mount
  useEffect(() => {
    const checkExistingSession = async () => {
      try {
        const token = await SecureStore.getItemAsync('userToken');
        const savedRole = await SecureStore.getItemAsync('userRole');

        if (token && savedRole) {
          if (savedRole === 'Host') {
            router.replace('/host' as any);
          } else {
            router.replace('/explore' as any);
          }
          return;
        }
      } catch (err) {
        console.warn('Session check skipped:', err);
      } finally {
        setCheckingSession(false);
      }
    };

    checkExistingSession();
  }, []);

  // 2. Handle Login
  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Required Fields', 'Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/auth/login', {
        email: email.trim().toLowerCase(),
        password,
      });

      const { token, user } = response.data;
      if (token && user) {
        await SecureStore.setItemAsync('userToken', token);
        await SecureStore.setItemAsync('userRole', user.role);
        await SecureStore.setItemAsync('userData', JSON.stringify(user));

        if (user.role === 'Host') {
          router.replace('/host' as any);
        } else {
          router.replace('/explore' as any);
        }
      }
    } catch (error: any) {
      Alert.alert(
        'Login Failed',
        error.response?.data?.message || 'Invalid email or password.'
      );
    } finally {
      setLoading(false);
    }
  };

  // 3. Handle Registration
  const handleRegister = async () => {
    if (!fullName.trim() || !email.trim() || !phone.trim() || !password) {
      Alert.alert('Missing Fields', 'Please fill in all required registration fields.');
      return;
    }

    if (role === 'Host' && !cnicNumber.trim()) {
      Alert.alert('CNIC Required', 'Hosts must provide a valid CNIC for verification.');
      return;
    }

    setLoading(true);
    try {
      const payload: any = {
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        phone_number: phone.trim(),
        role,
      };

      if (role === 'Host') {
        payload.cnic_matrix = {
          cnic_number: cnicNumber.trim(),
          cnic_front_url: 'https://res.cloudinary.com/demo/image/upload/sample_cnic_front.jpg',
          cnic_back_url: 'https://res.cloudinary.com/demo/image/upload/sample_cnic_back.jpg',
        };
      }

      const response = await api.post('/auth/register', payload);
      const { token, user } = response.data;

      if (token && user) {
        await SecureStore.setItemAsync('userToken', token);
        await SecureStore.setItemAsync('userRole', user.role || role);
        await SecureStore.setItemAsync('userData', JSON.stringify(user));

        Alert.alert(
          'Account Created',
          role === 'Host'
            ? 'Host account registered! You can now list parking spaces.'
            : 'Driver account registered! Welcome to PeerPark.',
          [
            {
              text: 'Continue',
              onPress: () => {
                if (role === 'Host') {
                  router.replace('/host' as any);
                } else {
                  router.replace('/explore' as any);
                }
              },
            },
          ]
        );
      }
    } catch (error: any) {
      Alert.alert(
        'Registration Failed',
        error.response?.data?.message || 'Could not complete registration. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <View className="flex-1 justify-center items-center bg-[#0B0F19]">
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-[#0B0F19]"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
        className="px-6 py-12"
        keyboardShouldPersistTaps="handled"
      >
        {/* Brand Header */}
        <View className="mb-8">
          <View className="flex-row items-center gap-2 mb-2">
            <View className="h-3 w-3 rounded-full bg-[#10B981]" />
            <Text className="text-xs uppercase tracking-[0.25em] text-[#10B981] font-semibold">
              Peer-to-Peer Parking
            </Text>
          </View>
          <Text className="text-4xl font-extrabold text-white">PeerPark</Text>
          <Text className="text-gray-400 mt-2 text-sm">
            {mode === 'login'
              ? 'Sign in to access your parking dashboard.'
              : 'Join Lahore’s crowdsourced parking network.'}
          </Text>
        </View>

        {/* Mode Switcher Tabs */}
        <View className="flex-row bg-[#1A2235] p-1 rounded-2xl mb-6 border border-gray-800">
          <TouchableOpacity
            onPress={() => setMode('login')}
            className={`flex-1 py-3 rounded-xl items-center ${
              mode === 'login' ? 'bg-[#10B981]' : ''
            }`}
          >
            <Text
              className={`font-semibold text-sm ${
                mode === 'login' ? 'text-[#0B0F19]' : 'text-gray-400'
              }`}
            >
              Sign In
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setMode('register')}
            className={`flex-1 py-3 rounded-xl items-center ${
              mode === 'register' ? 'bg-[#10B981]' : ''
            }`}
          >
            <Text
              className={`font-semibold text-sm ${
                mode === 'register' ? 'text-[#0B0F19]' : 'text-gray-400'
              }`}
            >
              Create Account
            </Text>
          </TouchableOpacity>
        </View>

        {/* Registration Role Selector */}
        {mode === 'register' && (
          <View className="mb-6">
            <Text className="text-xs text-gray-400 uppercase font-semibold tracking-wider mb-2">
              Select Your Role
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setRole('Driver')}
                className={`flex-1 p-4 rounded-2xl border ${
                  role === 'Driver'
                    ? 'border-[#10B981] bg-[#10B981]/10'
                    : 'border-gray-800 bg-[#1A2235]'
                }`}
              >
                <Text
                  className={`font-bold text-base ${
                    role === 'Driver' ? 'text-[#10B981]' : 'text-white'
                  }`}
                >
                  🚗 Driver
                </Text>
                <Text className="text-xs text-gray-400 mt-1">Find & book parking</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setRole('Host')}
                className={`flex-1 p-4 rounded-2xl border ${
                  role === 'Host'
                    ? 'border-[#10B981] bg-[#10B981]/10'
                    : 'border-gray-800 bg-[#1A2235]'
                }`}
              >
                <Text
                  className={`font-bold text-base ${
                    role === 'Host' ? 'text-[#10B981]' : 'text-white'
                  }`}
                >
                  🏠 Host
                </Text>
                <Text className="text-xs text-gray-400 mt-1">Rent empty driveway</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Input Fields */}
        <View className="space-y-4">
          {mode === 'register' && (
            <View>
              <Text className="text-xs text-gray-400 mb-1 ml-1">Full Name</Text>
              <TextInput
                className="w-full bg-[#1A2235] text-white px-4 py-3.5 rounded-xl border border-gray-800 focus:border-[#10B981]"
                placeholder="e.g. Hassan Mirza"
                placeholderTextColor="#6B7280"
                value={fullName}
                onChangeText={setFullName}
              />
            </View>
          )}

          <View>
            <Text className="text-xs text-gray-400 mb-1 ml-1">Email Address</Text>
            <TextInput
              className="w-full bg-[#1A2235] text-white px-4 py-3.5 rounded-xl border border-gray-800 focus:border-[#10B981]"
              placeholder="e.g. hassan@peerpark.com"
              placeholderTextColor="#6B7280"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          {mode === 'register' && (
            <View>
              <Text className="text-xs text-gray-400 mb-1 ml-1">Phone Number</Text>
              <TextInput
                className="w-full bg-[#1A2235] text-white px-4 py-3.5 rounded-xl border border-gray-800 focus:border-[#10B981]"
                placeholder="+92 300 1234567"
                placeholderTextColor="#6B7280"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </View>
          )}

          {mode === 'register' && role === 'Host' && (
            <View>
              <Text className="text-xs text-gray-400 mb-1 ml-1">CNIC Number</Text>
              <TextInput
                className="w-full bg-[#1A2235] text-white px-4 py-3.5 rounded-xl border border-gray-800 focus:border-[#10B981]"
                placeholder="35201-1234567-1"
                placeholderTextColor="#6B7280"
                value={cnicNumber}
                onChangeText={setCnicNumber}
                keyboardType="numbers-and-punctuation"
              />
            </View>
          )}

          <View>
            <Text className="text-xs text-gray-400 mb-1 ml-1">Password</Text>
            <TextInput
              className="w-full bg-[#1A2235] text-white px-4 py-3.5 rounded-xl border border-gray-800 focus:border-[#10B981]"
              placeholder="••••••••"
              placeholderTextColor="#6B7280"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          className="w-full bg-[#10B981] py-4 rounded-xl items-center mt-8 active:opacity-90"
          onPress={mode === 'login' ? handleLogin : handleRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#0B0F19" />
          ) : (
            <Text className="text-[#0B0F19] font-bold text-base">
              {mode === 'login'
                ? 'Sign In'
                : role === 'Driver'
                ? 'Create Driver Account'
                : 'Register as Host'}
            </Text>
          )}
        </TouchableOpacity>

        {/* Footer info */}
        <View className="mt-8 items-center">
          <Text className="text-xs text-gray-500 text-center">
            Secured by JWT Authentication & End-to-End Encryption
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}