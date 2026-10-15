import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';
import api from '../services/api';

interface Host {
  _id: string;
  full_name: string;
  phone_number: string;
  email: string;
}

interface ParkingSpot {
  _id: string;
  street_address: string;
  hourly_rate: number;
  spot_status: string;
  is_active: boolean;
  location: {
    coordinates: [number, number]; // [longitude, latitude]
  };
  host_id?: Host;
}

export default function ExploreScreen() {
  const router = useRouter();
  const mapRef = useRef<MapView | null>(null);

  // Map & Location State (Default: Lahore, Pakistan)
  const [currentCoords, setCurrentCoords] = useState<{ latitude: number; longitude: number }>({
    latitude: 31.5204,
    longitude: 74.3587,
  });
  const [mapRegion, setMapRegion] = useState<Region>({
    latitude: 31.5204,
    longitude: 74.3587,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });

  // UI State
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [spots, setSpots] = useState<ParkingSpot[]>([]);
  const [selectedSpot, setSelectedSpot] = useState<ParkingSpot | null>(null);

  // Filters Modal State
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [selectedRadius, setSelectedRadius] = useState<number>(10); // km
  const [maxPrice, setMaxPrice] = useState<number>(500); // PKR

  // Booking Modal State
  const [bookingHours, setBookingHours] = useState<number>(2);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);

  // 1. Initialize User Location
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({});
          const userLat = loc.coords.latitude;
          const userLng = loc.coords.longitude;

          setCurrentCoords({ latitude: userLat, longitude: userLng });
          setMapRegion({
            latitude: userLat,
            longitude: userLng,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          });

          fetchNearbySpots(userLat, userLng, selectedRadius, maxPrice);
        } else {
          // Default to central Lahore if location access denied
          fetchNearbySpots(31.5204, 74.3587, selectedRadius, maxPrice);
        }
      } catch (err) {
        console.warn('Location fetch fallback:', err);
        fetchNearbySpots(31.5204, 74.3587, selectedRadius, maxPrice);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 2. Fetch Nearby Spots from Backend
  const fetchNearbySpots = async (
    lat: number,
    lng: number,
    radius: number,
    priceLimit: number
  ) => {
    try {
      const response = await api.get('/spots/nearby', {
        params: {
          lat,
          lng,
          radius,
          maxPrice: priceLimit,
        },
      });

      const fetchedSpots: ParkingSpot[] = response.data?.spots || [];
      setSpots(fetchedSpots);
    } catch (error: any) {
      console.error('Failed to fetch spots:', error.message);
    }
  };

  // 3. Forward-Geocoding via OpenStreetMap Nominatim
  const handleAddressSearch = async () => {
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      // Append Lahore / Pakistan for high-relevance local results
      const query = `${searchQuery.trim()}, Lahore, Pakistan`;
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        query
      )}&limit=1`;

      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'PeerPark-MobileApp/1.0',
        },
      });

      if (response.data && response.data.length > 0) {
        const targetLat = parseFloat(response.data[0].lat);
        const targetLng = parseFloat(response.data[0].lon);

        const newRegion: Region = {
          latitude: targetLat,
          longitude: targetLng,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        };

        setCurrentCoords({ latitude: targetLat, longitude: targetLng });
        setMapRegion(newRegion);
        mapRef.current?.animateToRegion(newRegion, 1000);

        // Fetch spots around newly searched destination
        fetchNearbySpots(targetLat, targetLng, selectedRadius, maxPrice);
      } else {
        Alert.alert('Location Not Found', 'Could not find the specified area in Lahore.');
      }
    } catch (error: any) {
      Alert.alert('Search Error', 'Unable to reach the geocoding service.');
    } finally {
      setSearching(false);
    }
  };

  // 4. Apply Filters
  const handleApplyFilters = () => {
    setShowFilterModal(false);
    fetchNearbySpots(currentCoords.latitude, currentCoords.longitude, selectedRadius, maxPrice);
  };

  // 5. Submit Booking Request
  const handleBookSpot = async () => {
    if (!selectedSpot) return;

    setBookingSubmitting(true);
    try {
      const now = new Date();
      const checkinTime = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes from now
      const checkoutTime = new Date(checkinTime.getTime() + bookingHours * 60 * 60 * 1000);

      const response = await api.post('/bookings/request', {
        spot_id: selectedSpot._id,
        scheduled_checkin: checkinTime.toISOString(),
        scheduled_checkout: checkoutTime.toISOString(),
      });

      Alert.alert(
        'Booking Requested!',
        `Your reservation for ${selectedSpot.street_address} (${bookingHours} hrs) has been submitted. The host will review and approve it shortly.`,
        [
          {
            text: 'OK',
            onPress: () => setSelectedSpot(null),
          },
        ]
      );
    } catch (error: any) {
      Alert.alert(
        'Booking Failed',
        error.response?.data?.message || 'Could not place booking request.'
      );
    } finally {
      setBookingSubmitting(false);
    }
  };

  // 6. User Logout
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
        <Text className="text-gray-400 mt-3 text-sm">Locating nearby parking...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#0B0F19]">
      {/* 1. Base Map Layer */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        className="w-full h-full"
        initialRegion={mapRegion}
        showsUserLocation
        showsMyLocationButton
        onPress={() => setSelectedSpot(null)}
      >
        {spots.map((spot) => {
          const [lng, lat] = spot.location.coordinates;
          const isSelected = selectedSpot?._id === spot._id;

          return (
            <Marker
              key={spot._id}
              coordinate={{ latitude: lat, longitude: lng }}
              onPress={(e) => {
                e.stopPropagation();
                setSelectedSpot(spot);
              }}
            >
              <View
                className={`px-3 py-1.5 rounded-full border-2 shadow-lg ${
                  isSelected
                    ? 'bg-white border-[#10B981]'
                    : 'bg-[#10B981] border-[#0B0F19]'
                }`}
              >
                <Text
                  className={`font-bold text-xs ${
                    isSelected ? 'text-[#0B0F19]' : 'text-white'
                  }`}
                >
                  Rs. {spot.hourly_rate}/hr
                </Text>
              </View>
            </Marker>
          );
        })}
      </MapView>

      {/* 2. Top Navigation & Search Bar */}
      <View className="absolute top-12 left-0 right-0 px-4">
        {/* Quick Bar: Logo & Logout */}
        <View className="flex-row items-center justify-between mb-3 px-1">
          <View className="flex-row items-center gap-2">
            <View className="h-2.5 w-2.5 rounded-full bg-[#10B981]" />
            <Text className="text-white font-extrabold text-lg tracking-wide">PeerPark</Text>
          </View>

          <TouchableOpacity
            onPress={handleLogout}
            className="bg-[#1A2235]/90 px-3 py-1.5 rounded-xl border border-gray-800"
          >
            <Text className="text-gray-300 text-xs font-semibold">Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* Search Input Container */}
        <View className="bg-[#1A2235]/95 backdrop-blur-md flex-row items-center px-4 py-2.5 rounded-2xl border border-gray-800 shadow-xl">
          <TextInput
            className="flex-1 text-white text-sm py-1"
            placeholder="Search Lahore area (e.g. DHA, Gulberg)..."
            placeholderTextColor="#6B7280"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleAddressSearch}
            returnKeyType="search"
          />

          {searching ? (
            <ActivityIndicator size="small" color="#10B981" className="mr-2" />
          ) : (
            <TouchableOpacity onPress={handleAddressSearch} className="px-2 py-1">
              <Text className="text-[#10B981] font-bold text-xs">Search</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={() => setShowFilterModal(true)}
            className="ml-2 bg-[#10B981]/20 p-2 rounded-xl border border-[#10B981]/40"
          >
            <Text className="text-[#10B981] text-xs font-bold">⚙️</Text>
          </TouchableOpacity>
        </View>

        {/* Live Spots Counter Chip */}
        <View className="mt-2 self-start bg-[#0B0F19]/80 px-3 py-1 rounded-full border border-gray-800">
          <Text className="text-gray-300 text-xs">
            {spots.length} {spots.length === 1 ? 'spot' : 'spots'} available nearby
          </Text>
        </View>
      </View>

      {/* 3. Spot Details & Booking Bottom Sheet */}
      {selectedSpot && (
        <View className="absolute bottom-6 left-0 right-0 px-4">
          <View className="bg-[#1A2235] p-5 rounded-3xl border border-gray-800 shadow-2xl">
            {/* Spot Header */}
            <View className="flex-row justify-between items-start mb-3">
              <View className="flex-1 pr-3">
                <Text className="text-white text-lg font-bold" numberOfLines={1}>
                  {selectedSpot.street_address}
                </Text>
                <Text className="text-gray-400 text-xs mt-1">
                  Host: {selectedSpot.host_id?.full_name || 'Verified Resident'}
                </Text>
              </View>
              <View className="items-end bg-[#10B981]/15 px-3 py-1.5 rounded-xl border border-[#10B981]/30">
                <Text className="text-[#10B981] text-lg font-extrabold">
                  Rs. {selectedSpot.hourly_rate}
                </Text>
                <Text className="text-gray-400 text-[10px]">per hour</Text>
              </View>
            </View>

            {/* Duration Selector */}
            <View className="my-3 pt-3 border-t border-gray-800 flex-row items-center justify-between">
              <Text className="text-gray-300 text-sm font-semibold">Duration:</Text>
              <View className="flex-row items-center gap-3">
                <TouchableOpacity
                  onPress={() => setBookingHours((prev) => Math.max(1, prev - 1))}
                  className="bg-[#0B0F19] h-8 w-8 rounded-lg items-center justify-center border border-gray-700"
                >
                  <Text className="text-white font-bold text-base">-</Text>
                </TouchableOpacity>

                <Text className="text-white font-bold text-sm">{bookingHours} hrs</Text>

                <TouchableOpacity
                  onPress={() => setBookingHours((prev) => Math.min(12, prev + 1))}
                  className="bg-[#0B0F19] h-8 w-8 rounded-lg items-center justify-center border border-gray-700"
                >
                  <Text className="text-white font-bold text-base">+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Total Fee Preview */}
            <View className="flex-row items-center justify-between mb-4 bg-[#0B0F19] p-3 rounded-xl border border-gray-800">
              <Text className="text-gray-400 text-xs">Estimated Total</Text>
              <Text className="text-white font-bold text-base">
                Rs. {selectedSpot.hourly_rate * bookingHours}
              </Text>
            </View>

            {/* Book Spot CTA */}
            <TouchableOpacity
              onPress={handleBookSpot}
              disabled={bookingSubmitting}
              className="w-full bg-[#10B981] py-3.5 rounded-xl items-center active:opacity-90"
            >
              {bookingSubmitting ? (
                <ActivityIndicator color="#0B0F19" />
              ) : (
                <Text className="text-[#0B0F19] font-bold text-base">
                  Confirm Booking Request
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 4. Filters Modal */}
      <Modal visible={showFilterModal} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/60">
          <View className="bg-[#1A2235] p-6 rounded-t-3xl border-t border-gray-800">
            <Text className="text-white text-xl font-bold mb-4">Filter Parking Spots</Text>

            {/* Radius Options */}
            <Text className="text-gray-400 text-xs font-semibold uppercase mb-2">
              Maximum Distance Radius
            </Text>
            <View className="flex-row gap-2 mb-5">
              {[2, 5, 10, 20].map((radius) => (
                <TouchableOpacity
                  key={radius}
                  onPress={() => setSelectedRadius(radius)}
                  className={`flex-1 py-2.5 rounded-xl items-center border ${
                    selectedRadius === radius
                      ? 'border-[#10B981] bg-[#10B981]/20'
                      : 'border-gray-800 bg-[#0B0F19]'
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      selectedRadius === radius ? 'text-[#10B981]' : 'text-gray-400'
                    }`}
                  >
                    {radius} km
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Max Hourly Rate Options */}
            <Text className="text-gray-400 text-xs font-semibold uppercase mb-2">
              Max Hourly Rate (PKR)
            </Text>
            <View className="flex-row gap-2 mb-6">
              {[150, 250, 400, 1000].map((price) => (
                <TouchableOpacity
                  key={price}
                  onPress={() => setMaxPrice(price)}
                  className={`flex-1 py-2.5 rounded-xl items-center border ${
                    maxPrice === price
                      ? 'border-[#10B981] bg-[#10B981]/20'
                      : 'border-gray-800 bg-[#0B0F19]'
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      maxPrice === price ? 'text-[#10B981]' : 'text-gray-400'
                    }`}
                  >
                    Rs. {price}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Buttons */}
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setShowFilterModal(false)}
                className="flex-1 bg-[#0B0F19] py-3.5 rounded-xl items-center border border-gray-800"
              >
                <Text className="text-gray-400 font-semibold text-sm">Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleApplyFilters}
                className="flex-1 bg-[#10B981] py-3.5 rounded-xl items-center"
              >
                <Text className="text-[#0B0F19] font-bold text-sm">Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}