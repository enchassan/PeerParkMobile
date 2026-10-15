import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Switch,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import axios from 'axios';
import api from '../services/api';

interface ParkingSpot {
  _id: string;
  street_address: string;
  hourly_rate: number;
  is_active: boolean;
  spot_status: string;
  location: {
    coordinates: [number, number]; // [lng, lat]
  };
}

interface BookingRequest {
  _id: string;
  spot_id?: {
    _id: string;
    street_address: string;
    hourly_rate: number;
  };
  driver_id?: {
    _id: string;
    full_name: string;
    phone_number: string;
    email: string;
  };
  scheduled_checkin: string;
  scheduled_checkout: string;
  total_fee: number;
  booking_status: string;
}

export default function HostScreen() {
  const router = useRouter();

  // Host Data State
  const [hostUser, setHostUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [spots, setSpots] = useState<ParkingSpot[]>([]);
  const [pendingBookings, setPendingBookings] = useState<BookingRequest[]>([]);
  const [totalEarnings, setTotalEarnings] = useState<number>(0);

  // Add Spot Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAddress, setNewAddress] = useState('');
  const [newRate, setNewRate] = useState('150');
  const [geocoding, setGeocoding] = useState(false);
  const [creatingSpot, setCreatingSpot] = useState(false);
  const [coords, setCoords] = useState<{ lng: number; lat: number }>({
    lng: 74.3587,
    lat: 31.5204, // Default: Lahore
  });

  // 1. Load Host Profile & Data
  const loadHostData = useCallback(async () => {
    try {
      const storedUserData = await SecureStore.getItemAsync('userData');
      const user = storedUserData ? JSON.parse(storedUserData) : null;
      setHostUser(user);

      // Fetch host's own spots
      let spotsRes;
      try {
        spotsRes = await api.get('/spots/my');
      } catch (err) {
        spotsRes = await api.get('/spots?mine=true');
      }
      const mySpots: ParkingSpot[] = spotsRes.data?.spots || [];
      setSpots(mySpots);

      // Fetch bookings to filter requests and compute earnings
      const bookingsRes = await api.get('/bookings');
      const allBookings: BookingRequest[] = bookingsRes.data?.bookings || [];

      // Filter bookings relevant to this host
      const myBookings = allBookings.filter((b: any) => {
        const hostId = b.host_id?._id || b.host_id;
        return user?.id ? hostId === user.id : true;
      });

      // Filter pending requests
      const pending = myBookings.filter((b) => b.booking_status === 'Pending');
      setPendingBookings(pending);

      // Compute total earnings from completed sessions
      const earnings = myBookings
        .filter((b) => b.booking_status === 'Completed')
        .reduce((sum, b) => sum + (Number(b.total_fee) || 0), 0);
      setTotalEarnings(earnings);
    } catch (error: any) {
      console.error('Failed to load host dashboard:', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadHostData();
  }, [loadHostData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadHostData();
  };

  // 2. Toggle Spot Visibility
  const handleToggleSpot = async (spotId: string) => {
    try {
      const response = await api.patch(`/spots/${spotId}/toggle`);
      const updated = response.data?.spot;

      setSpots((prev) =>
        prev.map((s) => (s._id === spotId ? { ...s, is_active: !s.is_active } : s))
      );
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to toggle visibility.');
    }
  };

  // 3. Respond to Incoming Booking Request
  const handleBookingDecision = async (bookingId: string, decision: 'Accept' | 'Decline') => {
    try {
      await api.patch(`/bookings/${bookingId}/respond`, { decision });

      Alert.alert(
        decision === 'Accept' ? 'Booking Accepted!' : 'Booking Declined',
        decision === 'Accept'
          ? 'The driver has been notified to proceed with payment and parking.'
          : 'The time slot has been released back to your calendar.'
      );

      // Remove from pending list
      setPendingBookings((prev) => prev.filter((b) => b._id !== bookingId));
    } catch (error: any) {
      Alert.alert('Decision Failed', error.response?.data?.message || 'Could not update booking.');
    }
  };

  // 4. Auto-Geocode Address using Nominatim
  const handleAutoGeocode = async () => {
    if (!newAddress.trim()) {
      Alert.alert('Address Required', 'Please enter a street address to locate.');
      return;
    }

    setGeocoding(true);
    try {
      const query = `${newAddress.trim()}, Lahore, Pakistan`;
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        query
      )}&limit=1`;

      const response = await axios.get(url, {
        headers: { 'User-Agent': 'PeerPark-HostModule/1.0' },
      });

      if (response.data && response.data.length > 0) {
        const lat = parseFloat(response.data[0].lat);
        const lon = parseFloat(response.data[0].lon);
        setCoords({ lat, lng: lon });
        Alert.alert('Location Found', `Mapped coordinates:\nLat: ${lat.toFixed(4)}, Lng: ${lon.toFixed(4)}`);
      } else {
        // Fallback to current device GPS
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({});
          setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
          Alert.alert('Address Geocode Fallback', 'Used current GPS location for this spot.');
        } else {
          Alert.alert('Not Found', 'Could not resolve address. Lahore default coordinates applied.');
        }
      }
    } catch (err) {
      Alert.alert('Notice', 'Using default regional coordinates.');
    } finally {
      setGeocoding(false);
    }
  };

  // 5. Submit New Parking Spot
  const handleCreateSpot = async () => {
    if (!newAddress.trim() || !newRate.trim()) {
      Alert.alert('Required Fields', 'Please provide an address and hourly rate.');
      return;
    }

    setCreatingSpot(true);
    try {
      const payload = {
        street_address: newAddress.trim(),
        hourly_rate: Number(newRate),
        is_active: true,
        spot_status: 'Approved',
        location: {
          type: 'Point',
          coordinates: [coords.lng, coords.lat], // GeoJSON standard [lng, lat]
        },
      };

      const response = await api.post('/spots/create', payload);
      const created = response.data?.spot;

      if (created) {
        setSpots((prev) => [created, ...prev]);
        setShowAddModal(false);
        setNewAddress('');
        setNewRate('150');
        Alert.alert('Spot Created!', 'Your parking space is now active on the driver map.');
      }
    } catch (error: any) {
      Alert.alert('Creation Failed', error.response?.data?.message || 'Could not create spot.');
    } finally {
      setCreatingSpot(false);
    }
  };

  // 6. Logout
  const handleLogout = async () => {
    await SecureStore.deleteItemAsync('userToken');
    await SecureStore.deleteItemAsync('userRole');
    await SecureStore.deleteItemAsync('userData');
    router.replace('/' as any);
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-[#0B0F19]">
        <ActivityIndicator size="large" color="#10B981" />
        <Text className="text-gray-400 mt-3 text-sm">Loading Host Command Center...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#0B0F19]">
      <ScrollView
        className="flex-1 px-5 pt-12 pb-8"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />}
      >
        {/* Top Header */}
        <View className="flex-row items-center justify-between mb-6">
          <View>
            <Text className="text-xs uppercase tracking-wider text-[#10B981] font-semibold">
              Host Command Center
            </Text>
            <Text className="text-2xl font-extrabold text-white">
              {hostUser?.full_name || 'Host Dashboard'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleLogout}
            className="bg-[#1A2235] px-3.5 py-2 rounded-xl border border-gray-800"
          >
            <Text className="text-gray-300 text-xs font-semibold">Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* 1. Net Earnings Card */}
        <View className="bg-gradient-to-r bg-[#1A2235] p-6 rounded-3xl border border-gray-800 mb-6 shadow-xl">
          <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider">
            Total Net Earnings
          </Text>
          <View className="flex-row items-baseline gap-2 mt-2">
            <Text className="text-3xl font-extrabold text-[#10B981]">
              Rs. {totalEarnings.toLocaleString()}
            </Text>
            <Text className="text-gray-400 text-xs">PKR</Text>
          </View>
          <View className="flex-row items-center gap-2 mt-4 pt-3 border-t border-gray-800">
            <View className="h-2 w-2 rounded-full bg-[#10B981]" />
            <Text className="text-gray-400 text-xs">
              {spots.length} spaces registered • Auto-clearing via JazzCash/EasyPaisa
            </Text>
          </View>
        </View>

        {/* 2. Active Listings Section */}
        <View className="mb-6">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-white text-base font-bold uppercase tracking-wider">
              Active Listings ({spots.length})
            </Text>
            <TouchableOpacity
              onPress={() => setShowAddModal(true)}
              className="bg-[#10B981] px-3 py-1.5 rounded-xl active:opacity-90"
            >
              <Text className="text-[#0B0F19] text-xs font-bold">+ Add New</Text>
            </TouchableOpacity>
          </View>

          {spots.length === 0 ? (
            <View className="bg-[#1A2235]/60 p-6 rounded-2xl border border-gray-800 items-center">
              <Text className="text-gray-400 text-sm">No parking spots listed yet.</Text>
              <TouchableOpacity
                onPress={() => setShowAddModal(true)}
                className="mt-3 bg-[#10B981]/20 px-4 py-2 rounded-xl border border-[#10B981]/40"
              >
                <Text className="text-[#10B981] text-xs font-bold">List Your Driveway</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="space-y-3">
              {spots.map((spot) => (
                <View
                  key={spot._id}
                  className="bg-[#1A2235] p-4 rounded-2xl border border-gray-800 flex-row items-center justify-between"
                >
                  <View className="flex-1 pr-3">
                    <Text className="text-white font-bold text-sm" numberOfLines={1}>
                      {spot.street_address}
                    </Text>
                    <View className="flex-row items-center gap-2 mt-1">
                      <Text className="text-[#10B981] text-xs font-bold">
                        Rs. {spot.hourly_rate}/hr
                      </Text>
                      <Text className="text-gray-500 text-[10px]">•</Text>
                      <Text
                        className={`text-[10px] font-semibold ${
                          spot.spot_status === 'Approved' ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {spot.spot_status}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row items-center gap-2">
                    <Text className="text-gray-400 text-xs font-semibold">
                      {spot.is_active ? 'Live' : 'Hidden'}
                    </Text>
                    <Switch
                      value={spot.is_active}
                      onValueChange={() => handleToggleSpot(spot._id)}
                      trackColor={{ false: '#374151', true: '#10B981' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 3. Pending Booking Requests Section */}
        <View className="mb-8">
          <Text className="text-white text-base font-bold uppercase tracking-wider mb-3">
            Pending Requests ({pendingBookings.length})
          </Text>

          {pendingBookings.length === 0 ? (
            <View className="bg-[#1A2235]/60 p-5 rounded-2xl border border-gray-800 items-center">
              <Text className="text-gray-400 text-xs">No pending reservation requests right now.</Text>
            </View>
          ) : (
            <View className="space-y-3">
              {pendingBookings.map((b) => (
                <View
                  key={b._id}
                  className="bg-[#1A2235] p-4 rounded-2xl border border-amber-500/30"
                >
                  <View className="flex-row justify-between items-start mb-2">
                    <View>
                      <Text className="text-white font-bold text-sm">
                        {b.driver_id?.full_name || 'Driver'}
                      </Text>
                      <Text className="text-gray-400 text-xs">
                        Spot: {b.spot_id?.street_address || 'Your Driveway'}
                      </Text>
                    </View>
                    <View className="items-end bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/30">
                      <Text className="text-[#10B981] font-bold text-xs">
                        Est. Rs. {b.total_fee}
                      </Text>
                    </View>
                  </View>

                  <Text className="text-gray-400 text-xs mb-3">
                    Phone: {b.driver_id?.phone_number || 'N/A'}
                  </Text>

                  {/* Accept / Decline Action Buttons */}
                  <View className="flex-row gap-2 pt-2 border-t border-gray-800">
                    <TouchableOpacity
                      onPress={() => handleBookingDecision(b._id, 'Decline')}
                      className="flex-1 bg-[#0B0F19] py-2.5 rounded-xl items-center border border-rose-500/40"
                    >
                      <Text className="text-rose-400 font-bold text-xs">Decline</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => handleBookingDecision(b._id, 'Accept')}
                      className="flex-1 bg-[#10B981] py-2.5 rounded-xl items-center"
                    >
                      <Text className="text-[#0B0F19] font-bold text-xs">Accept Booking</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* 4. "Add New Space" Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1 justify-end bg-black/70"
        >
          <View className="bg-[#1A2235] p-6 rounded-t-3xl border-t border-gray-800 max-h-[85%]">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-white text-xl font-bold">List a Parking Space</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Text className="text-gray-400 text-lg font-bold">✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              {/* Address Input */}
              <View className="mb-4">
                <Text className="text-gray-300 text-xs font-semibold mb-1">
                  Physical Street Address
                </Text>
                <TextInput
                  className="bg-[#0B0F19] text-white px-4 py-3 rounded-xl border border-gray-800"
                  placeholder="e.g. 14B Sunset Blvd, DHA Phase 5"
                  placeholderTextColor="#6B7280"
                  value={newAddress}
                  onChangeText={setNewAddress}
                />

                <TouchableOpacity
                  onPress={handleAutoGeocode}
                  disabled={geocoding}
                  className="mt-2 bg-[#10B981]/15 py-2 px-3 rounded-lg border border-[#10B981]/40 self-start flex-row items-center gap-1.5"
                >
                  {geocoding ? (
                    <ActivityIndicator size="small" color="#10B981" />
                  ) : (
                    <Text className="text-[#10B981] text-xs font-bold">
                      📍 Auto-Detect Coordinates (Nominatim)
                    </Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Coordinates Preview */}
              <View className="mb-4 bg-[#0B0F19] p-3 rounded-xl border border-gray-800 flex-row justify-between">
                <Text className="text-gray-400 text-xs">Latitude: {coords.lat.toFixed(4)}</Text>
                <Text className="text-gray-400 text-xs">Longitude: {coords.lng.toFixed(4)}</Text>
              </View>

              {/* Hourly Rate Input */}
              <View className="mb-6">
                <Text className="text-gray-300 text-xs font-semibold mb-1">
                  Hourly Rental Rate (PKR)
                </Text>
                <TextInput
                  className="bg-[#0B0F19] text-white px-4 py-3 rounded-xl border border-gray-800"
                  placeholder="150"
                  placeholderTextColor="#6B7280"
                  value={newRate}
                  onChangeText={setNewRate}
                  keyboardType="numeric"
                />
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                onPress={handleCreateSpot}
                disabled={creatingSpot}
                className="w-full bg-[#10B981] py-4 rounded-xl items-center active:opacity-90 mb-4"
              >
                {creatingSpot ? (
                  <ActivityIndicator color="#0B0F19" />
                ) : (
                  <Text className="text-[#0B0F19] font-bold text-base">Submit Space Listing</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}