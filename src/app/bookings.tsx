import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import api from '../services/api';

type TabType = 'active' | 'pending' | 'completed';
type PaymentGateway = 'JazzCash' | 'EasyPaisa';

interface Booking {
  _id: string;
  spot_id?: {
    _id: string;
    street_address: string;
    hourly_rate: number;
  };
  host_id?: {
    _id: string;
    full_name: string;
    phone_number: string;
  };
  driver_id?: any;
  scheduled_checkin: string;
  scheduled_checkout: string;
  actual_checkin?: string | null;
  actual_checkout?: string | null;
  total_fee: number;
  booking_status: 'Pending' | 'Confirmed' | 'Active_Parking' | 'Completed' | 'Declined' | 'Expired';
  createdAt: string;
}

export default function BookingsScreen() {
  const router = useRouter();

  // State
  const [tab, setTab] = useState<TabType>('active');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [currentUserId, setCurrentUserId] = useState<string>('');

  // Active Parking Timer State
  const [secondsElapsed, setSecondsElapsed] = useState<number>(0);
  const [activeSession, setActiveSession] = useState<Booking | null>(null);

  // Checkout Modal State
  const [showCheckoutModal, setShowCheckoutModal] = useState<boolean>(false);
  const [checkoutBooking, setCheckoutBooking] = useState<Booking | null>(null);
  const [selectedGateway, setSelectedGateway] = useState<PaymentGateway>('JazzCash');
  const [rating, setRating] = useState<number>(5);
  const [processingPayment, setProcessingPayment] = useState<boolean>(false);

  // 1. Fetch Bookings for Current Driver
  const loadBookings = useCallback(async () => {
    try {
      const storedUserData = await SecureStore.getItemAsync('userData');
      const user = storedUserData ? JSON.parse(storedUserData) : null;
      const uid = user?._id || user?.id || '';
      setCurrentUserId(uid);

      const response = await api.get('/bookings');
      const allBookings: Booking[] = response.data?.bookings || [];

      // Filter bookings belonging to this driver
      const myBookings = allBookings.filter((b: any) => {
        const dId = b.driver_id?._id || b.driver_id;
        return uid ? dId === uid : true;
      });

      setBookings(myBookings);

      // Check if there is an ongoing parking session
      const currentActive = myBookings.find(
        (b) => b.booking_status === 'Active_Parking'
      );
      if (currentActive && currentActive.actual_checkin) {
        setActiveSession(currentActive);
        const startTime = new Date(currentActive.actual_checkin).getTime();
        const now = Date.now();
        setSecondsElapsed(Math.max(0, Math.floor((now - startTime) / 1000)));
      } else {
        setActiveSession(null);
      }
    } catch (error: any) {
      console.error('Failed to load bookings:', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  // 2. Active Session Ticking Timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    if (activeSession) {
      interval = setInterval(() => {
        setSecondsElapsed((prev) => prev + 1);
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeSession]);

  const formatTimer = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadBookings();
  };

  // 3. Driver Check-In Trigger
  const handleCheckIn = async (bookingId: string) => {
    try {
      const response = await api.patch(`/bookings/${bookingId}/checkin`);
      Alert.alert(
        'Checked In!',
        'Your parking session has started. The active duration timer is running.'
      );
      loadBookings();
    } catch (error: any) {
      Alert.alert('Check-In Failed', error.response?.data?.message || 'Could not check in.');
    }
  };

  // 4. Driver Check-Out Trigger
  const handleCheckOut = async (booking: Booking) => {
    try {
      await api.patch(`/bookings/${booking._id}/checkout`);
      setCheckoutBooking(booking);
      setShowCheckoutModal(true);
      loadBookings();
    } catch (error: any) {
      Alert.alert('Check-Out Failed', error.response?.data?.message || 'Could not check out.');
    }
  };

  // 5. Final Payment Authorization & Invoicing
  const handleConfirmPayment = async () => {
    setProcessingPayment(true);
    try {
      // Simulating M-Wallet USSD clearing
      await new Promise((resolve) => setTimeout(resolve, 1500));

      Alert.alert(
        'Payment Complete!',
        `Rs. ${checkoutBooking?.total_fee} authorized via ${selectedGateway}. Digital invoice generated and escrow released to the host. Thank you for rating ${rating} stars!`,
        [
          {
            text: 'OK',
            onPress: () => {
              setShowCheckoutModal(false);
              setCheckoutBooking(null);
              setTab('completed');
              loadBookings();
            },
          },
        ]
      );
    } finally {
      setProcessingPayment(false);
    }
  };

  // Filter Bookings by Tab
  const activeList = bookings.filter(
    (b) => b.booking_status === 'Confirmed' || b.booking_status === 'Active_Parking'
  );
  const pendingList = bookings.filter((b) => b.booking_status === 'Pending');
  const completedList = bookings.filter(
    (b) => b.booking_status === 'Completed' || b.booking_status === 'Declined'
  );

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-[#0B0F19]">
        <ActivityIndicator size="large" color="#10B981" />
        <Text className="text-gray-400 mt-3 text-sm">Syncing reservations...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#0B0F19]">
      <View className="flex-1 px-5 pt-12 pb-6">
        {/* Header */}
        <View className="flex-row items-center justify-between mb-6">
          <View>
            <Text className="text-xs uppercase tracking-wider text-[#10B981] font-semibold">
              Driver Portal
            </Text>
            <Text className="text-2xl font-extrabold text-white">My Bookings</Text>
          </View>

          <TouchableOpacity
            onPress={() => router.replace('/explore' as any)}
            className="bg-[#1A2235] px-3.5 py-2 rounded-xl border border-gray-800"
          >
            <Text className="text-gray-300 text-xs font-semibold">🗺️ Live Map</Text>
          </TouchableOpacity>
        </View>

        {/* Tab Switcher */}
        <View className="flex-row bg-[#1A2235] p-1 rounded-2xl mb-6 border border-gray-800">
          {(['active', 'pending', 'completed'] as TabType[]).map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              className={`flex-1 py-2.5 rounded-xl items-center ${
                tab === t ? 'bg-[#10B981]' : ''
              }`}
            >
              <Text
                className={`text-xs font-bold capitalize ${
                  tab === t ? 'text-[#0B0F19]' : 'text-gray-400'
                }`}
              >
                {t}
                {t === 'active' && activeList.length > 0 && ` (${activeList.length})`}
                {t === 'pending' && pendingList.length > 0 && ` (${pendingList.length})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content List */}
        <ScrollView
          className="flex-1"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />
          }
        >
          {/* TAB 1: ACTIVE BOOKINGS */}
          {tab === 'active' && (
            <View className="space-y-4">
              {activeList.length === 0 ? (
                <View className="bg-[#1A2235]/60 p-8 rounded-3xl border border-gray-800 items-center">
                  <Text className="text-gray-400 text-sm">No active parking sessions right now.</Text>
                  <TouchableOpacity
                    onPress={() => router.replace('/explore' as any)}
                    className="mt-4 bg-[#10B981] px-5 py-2.5 rounded-xl"
                  >
                    <Text className="text-[#0B0F19] font-bold text-xs">Find Parking on Map</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                activeList.map((b) => {
                  const isParkingNow = b.booking_status === 'Active_Parking';

                  return (
                    <View
                      key={b._id}
                      className="bg-[#1A2235] p-5 rounded-3xl border border-gray-800 shadow-xl"
                    >
                      {/* Top status & badge */}
                      <View className="flex-row items-center justify-between mb-3">
                        <View className="flex-row items-center gap-2">
                          <View
                            className={`h-2.5 w-2.5 rounded-full ${
                              isParkingNow ? 'bg-sky-400 animate-pulse' : 'bg-emerald-400'
                            }`}
                          />
                          <Text
                            className={`text-xs font-bold uppercase tracking-wider ${
                              isParkingNow ? 'text-sky-400' : 'text-emerald-400'
                            }`}
                          >
                            {isParkingNow ? 'Active Parking' : 'Confirmed Booking'}
                          </Text>
                        </View>

                        <Text className="text-white font-extrabold text-sm">
                          Rs. {b.total_fee}
                        </Text>
                      </View>

                      {/* Spot Details */}
                      <Text className="text-white text-lg font-bold">
                        {b.spot_id?.street_address || 'Designated Parking Spot'}
                      </Text>
                      <Text className="text-gray-400 text-xs mt-1">
                        Host: {b.host_id?.full_name || 'Verified Host'} • {b.host_id?.phone_number}
                      </Text>

                      {/* Live Ticking Timer Display (Figure 42/53) */}
                      {isParkingNow && (
                        <View className="my-5 bg-[#0B0F19] py-5 px-4 rounded-2xl border border-gray-800 items-center">
                          <Text className="text-gray-400 text-xs uppercase tracking-widest font-semibold mb-1">
                            Elapsed Duration
                          </Text>
                          <Text className="text-3xl font-mono font-extrabold text-[#10B981]">
                            {formatTimer(secondsElapsed)}
                          </Text>
                        </View>
                      )}

                      {/* Action Triggers */}
                      <View className="mt-4 pt-4 border-t border-gray-800 flex-row gap-3">
                        {!isParkingNow ? (
                          <TouchableOpacity
                            onPress={() => handleCheckIn(b._id)}
                            className="flex-1 bg-[#10B981] py-3.5 rounded-xl items-center"
                          >
                            <Text className="text-[#0B0F19] font-bold text-sm">
                              Check-In (Arrived)
                            </Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            onPress={() => handleCheckOut(b)}
                            className="flex-1 bg-rose-500 py-3.5 rounded-xl items-center"
                          >
                            <Text className="text-white font-bold text-sm">
                              Check-Out & Pay
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* TAB 2: PENDING BOOKINGS (Figure 45) */}
          {tab === 'pending' && (
            <View className="space-y-4">
              {pendingList.length === 0 ? (
                <View className="bg-[#1A2235]/60 p-8 rounded-3xl border border-gray-800 items-center">
                  <Text className="text-gray-400 text-sm">No pending requests awaiting approval.</Text>
                </View>
              ) : (
                pendingList.map((b) => (
                  <View
                    key={b._id}
                    className="bg-[#1A2235] p-5 rounded-3xl border border-amber-500/30"
                  >
                    <View className="flex-row items-center justify-between mb-2">
                      <Text className="text-amber-400 text-xs font-bold uppercase tracking-wider">
                        ⏳ Awaiting Host Approval
                      </Text>
                      <Text className="text-white font-bold text-sm">
                        Rs. {b.total_fee}
                      </Text>
                    </View>

                    <Text className="text-white text-base font-bold">
                      {b.spot_id?.street_address || 'Requested Driveway'}
                    </Text>
                    <Text className="text-gray-400 text-xs mt-1">
                      Rate: Rs. {b.spot_id?.hourly_rate || '150'}/hr
                    </Text>

                    <View className="mt-4 bg-[#0B0F19] p-3 rounded-xl border border-gray-800 flex-row justify-between">
                      <Text className="text-gray-400 text-xs">Requested At:</Text>
                      <Text className="text-gray-200 text-xs font-semibold">
                        {new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          {/* TAB 3: COMPLETED BOOKINGS (Figure 46) */}
          {tab === 'completed' && (
            <View className="space-y-4">
              {completedList.length === 0 ? (
                <View className="bg-[#1A2235]/60 p-8 rounded-3xl border border-gray-800 items-center">
                  <Text className="text-gray-400 text-sm">No completed bookings yet.</Text>
                </View>
              ) : (
                completedList.map((b) => (
                  <View
                    key={b._id}
                    className="bg-[#1A2235] p-5 rounded-2xl border border-gray-800"
                  >
                    <View className="flex-row items-start justify-between">
                      <View className="flex-1 pr-3">
                        <Text className="text-white font-bold text-sm">
                          {b.spot_id?.street_address || 'Parking Location'}
                        </Text>
                        <Text className="text-gray-400 text-xs mt-1">
                          {new Date(b.createdAt).toLocaleDateString()}
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text className="text-[#10B981] font-extrabold text-base">
                          Rs. {b.total_fee}
                        </Text>
                        <View className="flex-row items-center gap-1 mt-1">
                          <Text className="text-amber-400 text-xs">★ 5.0</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}
        </ScrollView>
      </View>

      {/* 6. Checkout & Invoice Settlement Modal (Figure 43/52) */}
      <Modal visible={showCheckoutModal} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/75">
          <View className="bg-[#1A2235] p-6 rounded-t-3xl border-t border-gray-800">
            {/* Success Icon */}
            <View className="items-center mb-4">
              <View className="h-14 w-14 rounded-full bg-[#10B981]/20 items-center justify-center border border-[#10B981]/40 mb-2">
                <Text className="text-2xl">✓</Text>
              </View>
              <Text className="text-white text-2xl font-extrabold">Parking Complete</Text>
              <Text className="text-gray-400 text-xs mt-1">
                Please review your invoice and authorize payment.
              </Text>
            </View>

            {/* Invoice Breakdown Card */}
            <View className="bg-[#0B0F19] p-4 rounded-2xl border border-gray-800 mb-5">
              <Text className="text-gray-400 text-xs font-semibold uppercase mb-3">
                Invoice Summary
              </Text>

              <View className="flex-row justify-between mb-2">
                <Text className="text-gray-400 text-xs">Hourly Rate</Text>
                <Text className="text-gray-200 text-xs font-semibold">
                  Rs. {checkoutBooking?.spot_id?.hourly_rate || 150}/hr
                </Text>
              </View>

              <View className="flex-row justify-between pt-3 border-t border-gray-800 items-baseline">
                <Text className="text-white font-bold text-sm">Total Cost</Text>
                <Text className="text-[#10B981] font-extrabold text-2xl">
                  Rs. {checkoutBooking?.total_fee || 300}
                </Text>
              </View>
            </View>

            {/* Microfinance Gateway Selector */}
            <Text className="text-gray-300 text-xs font-semibold uppercase mb-2">
              Pay With Mobile Wallet
            </Text>
            <View className="flex-row gap-3 mb-5">
              {(['JazzCash', 'EasyPaisa'] as PaymentGateway[]).map((gw) => (
                <TouchableOpacity
                  key={gw}
                  onPress={() => setSelectedGateway(gw)}
                  className={`flex-1 py-3 rounded-xl items-center border ${
                    selectedGateway === gw
                      ? 'border-[#10B981] bg-[#10B981]/15'
                      : 'border-gray-800 bg-[#0B0F19]'
                  }`}
                >
                  <Text
                    className={`font-bold text-sm ${
                      selectedGateway === gw ? 'text-[#10B981]' : 'text-gray-400'
                    }`}
                  >
                    {gw}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Star Rating Selector */}
            <View className="items-center mb-6">
              <Text className="text-gray-400 text-xs mb-2">Rate your Host</Text>
              <View className="flex-row gap-3">
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity key={star} onPress={() => setRating(star)}>
                    <Text className={`text-2xl ${star <= rating ? 'text-amber-400' : 'text-gray-600'}`}>
                      ★
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Confirm & Pay CTA */}
            <TouchableOpacity
              onPress={handleConfirmPayment}
              disabled={processingPayment}
              className="w-full bg-[#10B981] py-4 rounded-xl items-center active:opacity-90"
            >
              {processingPayment ? (
                <ActivityIndicator color="#0B0F19" />
              ) : (
                <Text className="text-[#0B0F19] font-extrabold text-base">
                  Confirm & Pay (Rs. {checkoutBooking?.total_fee || 300})
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}