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
import { storage } from '../services/storage';
import api from '../services/api';

export default function ProfileScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<any>(null);

  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/auth/me');
        const profile = res.data?.user;
        if (profile) {
          setUser(profile);
          setFullName(profile.full_name || '');
          setPhoneNumber(profile.phone_number || '');
          await storage.setItem('userData', JSON.stringify(profile));
        }
      } catch (err) {
        const cached = await storage.getItem('userData');
        if (cached) {
          const parsed = JSON.parse(cached);
          setUser(parsed);
          setFullName(parsed.full_name || '');
          setPhoneNumber(parsed.phone_number || '');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSaveProfile = async () => {
    if (!fullName.trim() || !phoneNumber.trim()) {
      Alert.alert('Required Fields', 'Name and phone number cannot be empty.');
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        full_name: fullName.trim(),
        phone_number: phoneNumber.trim(),
      };

      if (newPassword.trim()) {
        payload.current_password = currentPassword;
        payload.new_password = newPassword.trim();
      }

      const res = await api.patch('/auth/profile', payload);
      if (res.data?.user) {
        setUser(res.data.user);
        await storage.setItem('userData', JSON.stringify(res.data.user));
      }
      setCurrentPassword('');
      setNewPassword('');
      Alert.alert('Saved', 'Your profile has been updated.');
    } catch (error: any) {
      Alert.alert(
        'Update Failed',
        error.response?.data?.message || 'Could not update profile.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await storage.deleteItem('userToken');
    await storage.deleteItem('userRole');
    await storage.deleteItem('userData');
    router.replace('/' as any);
  };

  if (loading) {
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
        className="flex-1 px-5 pt-12 pb-10"
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between mb-6">
          <TouchableOpacity
            onPress={() => router.back()}
            className="bg-[#1A2235] px-3.5 py-2 rounded-xl border border-gray-800"
          >
            <Text className="text-gray-300 text-xs font-semibold">← Back</Text>
          </TouchableOpacity>
          <Text className="text-white text-lg font-extrabold">My Profile</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Identity Summary Card */}
        <View className="bg-[#1A2235] p-5 rounded-3xl border border-gray-800 mb-6">
          <Text className="text-white text-xl font-extrabold">
            {user?.full_name || 'User'}
          </Text>
          <Text className="text-gray-400 text-xs mt-1">{user?.email}</Text>

          <View className="flex-row items-center gap-2 mt-3">
            <View className="bg-[#10B981]/15 px-3 py-1 rounded-full border border-[#10B981]/30">
              <Text className="text-[#10B981] text-[11px] font-bold">
                {user?.role || 'Driver'}
              </Text>
            </View>
            <View
              className={`px-3 py-1 rounded-full border ${
                user?.is_profile_verified
                  ? 'bg-emerald-500/15 border-emerald-500/30'
                  : 'bg-amber-500/15 border-amber-500/30'
              }`}
            >
              <Text
                className={`text-[11px] font-bold ${
                  user?.is_profile_verified
                    ? 'text-emerald-400'
                    : 'text-amber-400'
                }`}
              >
                {user?.is_profile_verified
                  ? '✓ Verified'
                  : '⏳ Verification Pending'}
              </Text>
            </View>
          </View>

          {!!user?.cnic_matrix?.cnic_number && (
            <Text className="text-gray-400 text-xs mt-3 pt-3 border-t border-gray-800">
              CNIC: {user.cnic_matrix.cnic_number}
            </Text>
          )}
        </View>

        {/* Edit Details Form */}
        <View className="bg-[#1A2235] p-5 rounded-3xl border border-gray-800 mb-6">
          <Text className="text-gray-300 text-xs font-bold uppercase tracking-wider mb-4">
            Account Details
          </Text>

          <Text className="text-gray-400 text-xs mb-1">Full Name</Text>
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            placeholder="Full Name"
            placeholderTextColor="#6B7280"
            className="bg-[#0B0F19] text-white px-4 py-3 rounded-xl border border-gray-800 mb-4"
          />

          <Text className="text-gray-400 text-xs mb-1">Phone Number</Text>
          <TextInput
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholder="+923001234567"
            placeholderTextColor="#6B7280"
            keyboardType="phone-pad"
            className="bg-[#0B0F19] text-white px-4 py-3 rounded-xl border border-gray-800 mb-5"
          />

          <Text className="text-gray-300 text-xs font-bold uppercase tracking-wider mb-3 pt-3 border-t border-gray-800">
            Change Password (Optional)
          </Text>

          <TextInput
            value={currentPassword}
            onChangeText={setCurrentPassword}
            placeholder="Current Password"
            placeholderTextColor="#6B7280"
            secureTextEntry
            className="bg-[#0B0F19] text-white px-4 py-3 rounded-xl border border-gray-800 mb-3"
          />

          <TextInput
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="New Password (min 6 chars)"
            placeholderTextColor="#6B7280"
            secureTextEntry
            className="bg-[#0B0F19] text-white px-4 py-3 rounded-xl border border-gray-800 mb-5"
          />

          <TouchableOpacity
            onPress={handleSaveProfile}
            disabled={saving}
            className="w-full bg-[#10B981] py-3.5 rounded-xl items-center"
          >
            {saving ? (
              <ActivityIndicator color="#0B0F19" />
            ) : (
              <Text className="text-[#0B0F19] font-extrabold text-sm">
                Save Changes
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Sign Out */}
        <TouchableOpacity
          onPress={handleLogout}
          className="w-full bg-rose-500/15 py-3.5 rounded-xl items-center border border-rose-500/30 mb-10"
        >
          <Text className="text-rose-400 font-bold text-sm">Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
