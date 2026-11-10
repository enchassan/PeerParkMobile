import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
} from 'react-native';
import MapView, { Marker, UrlTile, Polyline, Region } from 'react-native-maps';
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

interface RouteMeta {
  distanceKm: number;
  durationMins: number;
}

export default function ExploreScreen() {
  const router = useRouter();
  const mapRef = useRef<MapView | null>(null);

  // Map & Location State (Default: Lahore)
  const [currentCoords, setCurrentCoords] = useState<{ latitude: number; longitude: number }>({
    latitude: 31.5204,
    longitude: 74.3587,
  });

  const [mapRegion, setMapRegion] = useState<Region>({
    latitude: 31.5204,
    longitude: 74.3587,
    latitudeDelta: 0.12,
    longitudeDelta: 0.12,
  });

  // UI State
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [spots, setSpots] = useState<ParkingSpot[]>([]);
  const [selectedSpot, setSelectedSpot] = useState<ParkingSpot | null>(null);

  // OSRM Routing State (FR-07)
  const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [routeMeta, setRouteMeta] = useState<RouteMeta | null>(null);
  const [fetchingRoute, setFetchingRoute] = useState(false);

  // Filters State
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [selectedRadius, setSelectedRadius] = useState<number>(15);
  const [maxPrice, setMaxPrice] = useState<number>(500);

  // Booking State
  const [bookingHours, setBookingHours] = useState<number>(2);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);

  // 1. Initialize Location & Spots
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({});
          const lat = loc.coords.latitude;
          const lng = loc.coords.longitude;

          setCurrentCoords({ latitude: lat, longitude: lng });
          const newReg = {
            latitude: lat,
            longitude: lng,
            latitudeDelta: 0.08,
            longitudeDelta: 0.08,
          };
          setMapRegion(newReg);
          mapRef.current?.animateToRegion(newReg, 1000);

          fetchNearbySpots(lat, lng, selectedRadius, maxPrice);
        } else {
          fetchNearbySpots(31.5204, 74.3587, selectedRadius, maxPrice);
        }
      } catch (err) {
        console.warn('GPS fallback to central Lahore:', err);
        fetchNearbySpots(31.5204, 74.3587, selectedRadius, maxPrice);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 2. Query Nearby Spots from Backend
  const fetchNearbySpots = async (lat: number, lng: number, radius: number, priceLimit: number) => {
    try {
      const response = await api.get('/spots/nearby', {
        params: { lat, lng, radius, maxPrice: priceLimit },
      });
      const fetched: ParkingSpot[] = response.data?.spots || [];
      setSpots(fetched);
    } catch (error: any) {
      console.error('Failed to fetch spots:', error.message);
    }
  };

  // 3. OSRM Route Calculation (FR-07)
  const fetchDrivingRoute = async (spot: ParkingSpot) => {
    setFetchingRoute(true);
    try {
      const startLng = currentCoords.longitude;
      const startLat = currentCoords.latitude;
      const endLng = spot.location.coordinates[0];
      const endLat = spot.location.coordinates[1];

      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;

      const response = await axios.get(osrmUrl, { timeout: 6000 });
      const route = response.data?.routes?.[0];

      if (route && route.geometry?.coordinates) {
        const points = route.geometry.coordinates.map((pt: [number, number]) => ({
          latitude: pt[1],
          longitude: pt[0],
        }));

        setRouteCoords(points);
        setRouteMeta({
          distanceKm: Math.round((route.distance / 1000) * 10) / 10,
          durationMins: Math.max(1, Math.round(route.duration / 60)),
        });

        // Fit map view to show entire polyline
        mapRef.current?.fitToCoordinates(points, {
          edgePadding: { top: 120, right: 60, bottom: 280, left: 60 },
          animated: true,
        });
      }
    } catch (err) {
      Alert.alert('Routing Notice', 'Could not fetch live road directions from OSRM.');
    } finally {
      setFetchingRoute(false);
    }
  };

  const clearRoute = () => {
    setRouteCoords([]);
    setRouteMeta(null);
  };

  // 4. Address Search via Nominatim
  const handleAddressSearch = async () => {
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      const query = `${searchQuery.trim()}, Lahore, Pakistan`;
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        query
      )}&limit=1`;

      const response = await axios.get(url, {
        headers: { 'User-Agent': 'PeerPark-Mobile/1.0' },
      });

      if (response.data && response.data.length > 0) {
        const targetLat = parseFloat(response.data[0].lat);
        const targetLng = parseFloat(response.data[0].lon);

        const newRegion: Region = {
          latitude: targetLat,
          longitude: targetLng,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        };

        setCurrentCoords({ latitude: targetLat, longitude: targetLng });
        setMapRegion(newRegion);
        mapRef.current?.animateToRegion(newRegion, 1000);
        clearRoute();

        fetchNearbySpots(targetLat, targetLng, selectedRadius, maxPrice);
      } else {
        Alert.alert('Area Not Found', 'Could not locate that neighborhood in Lahore.');
      }
    } catch (err: any) {
      Alert.alert('Search Error', 'Unable to reach the geocoding service.');
    } finally {
      setSearching(false);
    }
  };

  // 5. Apply Filters
  const handleApplyFilters = () => {
    setShowFilterModal(false);
    fetchNearbySpots(currentCoords.latitude, currentCoords.longitude, selectedRadius, maxPrice);
  };

  // 6. Submit Booking
  const handleBookSpot = async () => {
    if (!selectedSpot) return;

    setBookingSubmitting(true);
    try {
      const now = new Date();
      const checkinTime = new Date(now.getTime() + 10 * 60 * 1000);
      const checkoutTime = new Date(checkinTime.getTime() + bookingHours * 60 * 60 * 1000);

      await api.post('/bookings/request', {
        spot_id: selectedSpot._id,
        scheduled_checkin: checkinTime.toISOString(),
        scheduled_checkout: checkoutTime.toISOString(),
      });

      Alert.alert(
        'Booking Requested!',
        `Your reservation for ${selectedSpot.street_address} (${bookingHours} hrs) has been submitted. The host will review and approve it shortly.`,
        [
          {
            text: 'View in My Bookings',
            onPress: () => {
              setSelectedSpot(null);
              clearRoute();
              router.push('/bookings' as any);
            },
          },
          {
            text: 'Stay on Map',
            onPress: () => {
              setSelectedSpot(null);
            },
            style: 'cancel',
          },
        ]
      );
    } catch (error: any) {
      Alert.alert('Booking Failed', error.response?.data?.message || 'Could not place booking request.');
    } finally {
      setBookingSubmitting(false);
    }
  };

  // 7. Sign Out
  const handleLogout = async () => {
    await SecureStore.deleteItemAsync('userToken');
    await SecureStore.deleteItemAsync('userRole');
    await SecureStore.deleteItemAsync('userData');
    router.replace('/' as any);
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.loadingText}>Loading OpenStreetMap Engine...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 1. OpenStreetMap Tile MapView */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={mapRegion}
        showsUserLocation
        showsMyLocationButton
        onPress={() => setSelectedSpot(null)}
      >
        <UrlTile
          urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maximumZ={19}
          flipY={false}
          zIndex={1}
        />

        {/* OSRM Route Polyline (FR-07) */}
        {routeCoords.length > 0 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor="#10B981"
            strokeWidth={5}
            zIndex={10}
          />
        )}

        {/* Parking Spot Pins */}
        {spots.map((spot) => {
          const [lng, lat] = spot.location.coordinates;
          const isSelected = selectedSpot?._id === spot._id;

          return (
            <Marker
              key={spot._id}
              coordinate={{ latitude: lat, longitude: lng }}
              zIndex={isSelected ? 999 : 2}
              onPress={(e) => {
                e.stopPropagation();
                setSelectedSpot(spot);
                fetchDrivingRoute(spot);
              }}
            >
              <View
                style={[
                  styles.markerBadge,
                  isSelected ? styles.markerBadgeSelected : styles.markerBadgeDefault,
                ]}
              >
                <Text
                  style={[
                    styles.markerText,
                    isSelected ? styles.markerTextSelected : styles.markerTextDefault,
                  ]}
                >
                  Rs. {spot.hourly_rate}
                </Text>
              </View>
            </Marker>
          );
        })}
      </MapView>

      {/* 2. Top Header & Search Bar */}
      <View style={styles.topBarContainer}>
        <View style={styles.headerRow}>
          <View style={styles.logoRow}>
            <View style={styles.logoDot} />
            <Text style={styles.logoText}>PeerPark</Text>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
              onPress={() => router.push('/bookings' as any)}
              style={styles.myBookingsButton}
            >
              <Text style={styles.myBookingsText}>📋 My Bookings</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleLogout} style={styles.signOutButton}>
              <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Search Input Bar */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search Lahore area (e.g. DHA, Gulberg)..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleAddressSearch}
            returnKeyType="search"
          />

          {searching ? (
            <ActivityIndicator size="small" color="#10B981" style={{ marginRight: 8 }} />
          ) : (
            <TouchableOpacity onPress={handleAddressSearch} style={styles.searchActionButton}>
              <Text style={styles.searchActionText}>Search</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={() => setShowFilterModal(true)}
            style={styles.filterButton}
          >
            <Text style={styles.filterButtonText}>⚙️</Text>
          </TouchableOpacity>
        </View>

        {/* Route Info Badge (When OSRM Route is active) */}
        {routeMeta ? (
          <View style={styles.routePill}>
            <Text style={styles.routePillText}>
              🚗 {routeMeta.distanceKm} km • ~{routeMeta.durationMins} mins via OSRM
            </Text>
            <TouchableOpacity onPress={clearRoute} style={styles.clearRouteBtn}>
              <Text style={styles.clearRouteText}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.spotsCountTag}>
            <Text style={styles.spotsCountText}>
              {spots.length} {spots.length === 1 ? 'spot' : 'spots'} available nearby
            </Text>
          </View>
        )}
      </View>

      {/* 3. Spot Details & Booking Bottom Sheet */}
      {selectedSpot && (
        <View style={styles.bottomSheetContainer}>
          <View style={styles.bottomSheetCard}>
            <View style={styles.spotHeaderRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.spotAddressText} numberOfLines={1}>
                  {selectedSpot.street_address}
                </Text>
                <Text style={styles.spotHostText}>
                  Host: {selectedSpot.host_id?.full_name || 'Verified Resident'}
                  {routeMeta ? ` • ${routeMeta.distanceKm} km away` : ''}
                </Text>
              </View>

              <View style={styles.spotRateBox}>
                <Text style={styles.spotRateText}>Rs. {selectedSpot.hourly_rate}</Text>
                <Text style={styles.spotRateUnit}>per hour</Text>
              </View>
            </View>

            {/* Duration Selector */}
            <View style={styles.durationRow}>
              <Text style={styles.durationLabel}>Duration:</Text>
              <View style={styles.durationControls}>
                <TouchableOpacity
                  onPress={() => setBookingHours((prev) => Math.max(1, prev - 1))}
                  style={styles.durationBtn}
                >
                  <Text style={styles.durationBtnText}>-</Text>
                </TouchableOpacity>

                <Text style={styles.durationValText}>{bookingHours} hrs</Text>

                <TouchableOpacity
                  onPress={() => setBookingHours((prev) => Math.min(12, prev + 1))}
                  style={styles.durationBtn}
                >
                  <Text style={styles.durationBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Total Fee Preview */}
            <View style={styles.totalPreviewBox}>
              <Text style={styles.totalLabel}>Estimated Total</Text>
              <Text style={styles.totalAmountText}>
                Rs. {selectedSpot.hourly_rate * bookingHours}
              </Text>
            </View>

            {/* Action Buttons: Directions & Book */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => fetchDrivingRoute(selectedSpot)}
                disabled={fetchingRoute}
                style={styles.directionsBtn}
              >
                {fetchingRoute ? (
                  <ActivityIndicator color="#10B981" size="small" />
                ) : (
                  <Text style={styles.directionsBtnText}>🧭 Route</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleBookSpot}
                disabled={bookingSubmitting}
                style={styles.bookButton}
              >
                {bookingSubmitting ? (
                  <ActivityIndicator color="#0B0F19" />
                ) : (
                  <Text style={styles.bookButtonText}>Confirm Booking</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* 4. Filters Modal */}
      <Modal visible={showFilterModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Filter Parking Spots</Text>

            <Text style={styles.filterSectionTitle}>Maximum Distance Radius</Text>
            <View style={styles.filterRow}>
              {[2, 5, 10, 20].map((radius) => (
                <TouchableOpacity
                  key={radius}
                  onPress={() => setSelectedRadius(radius)}
                  style={[
                    styles.filterChip,
                    selectedRadius === radius ? styles.filterChipActive : styles.filterChipInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedRadius === radius ? styles.filterChipTextActive : styles.filterChipTextInactive,
                    ]}
                  >
                    {radius} km
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.filterSectionTitle}>Max Hourly Rate (PKR)</Text>
            <View style={styles.filterRow}>
              {[150, 250, 400, 1000].map((price) => (
                <TouchableOpacity
                  key={price}
                  onPress={() => setMaxPrice(price)}
                  style={[
                    styles.filterChip,
                    maxPrice === price ? styles.filterChipActive : styles.filterChipInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      maxPrice === price ? styles.filterChipTextActive : styles.filterChipTextInactive,
                    ]}
                  >
                    Rs. {price}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                onPress={() => setShowFilterModal(false)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleApplyFilters}
                style={styles.modalApplyBtn}
              >
                <Text style={styles.modalApplyText}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0B0F19',
  },
  loadingText: {
    color: '#9CA3AF',
    marginTop: 12,
    fontSize: 14,
  },
  topBarContainer: {
    position: 'absolute',
    top: 52,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    zIndex: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoDot: {
    height: 10,
    width: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
  },
  logoText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 20,
    letterSpacing: 0.5,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  myBookingsButton: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  myBookingsText: {
    color: '#10B981',
    fontWeight: '700',
    fontSize: 12,
  },
  signOutButton: {
    backgroundColor: '#1A2235',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  signOutText: {
    color: '#D1D5DB',
    fontWeight: '600',
    fontSize: 12,
  },
  searchContainer: {
    backgroundColor: 'rgba(26, 34, 53, 0.95)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#374151',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    paddingVertical: 6,
  },
  searchActionButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  searchActionText: {
    color: '#10B981',
    fontWeight: '700',
    fontSize: 13,
  },
  filterButton: {
    marginLeft: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  filterButtonText: {
    fontSize: 12,
  },
  spotsCountTag: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(11, 15, 25, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#374151',
  },
  spotsCountText: {
    color: '#E5E7EB',
    fontSize: 11,
    fontWeight: '600',
  },
  routePill: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#1A2235',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routePillText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '800',
  },
  clearRouteBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    height: 18,
    width: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearRouteText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  markerBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 5,
  },
  markerBadgeDefault: {
    backgroundColor: '#10B981',
    borderColor: '#0B0F19',
  },
  markerBadgeSelected: {
    backgroundColor: '#FFFFFF',
    borderColor: '#10B981',
  },
  markerText: {
    fontSize: 11,
    fontWeight: '800',
  },
  markerTextDefault: {
    color: '#FFFFFF',
  },
  markerTextSelected: {
    color: '#0B0F19',
  },
  bottomSheetContainer: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    zIndex: 20,
  },
  bottomSheetCard: {
    backgroundColor: '#1A2235',
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#374151',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
  },
  spotHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  spotAddressText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  spotHostText: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 4,
  },
  spotRateBox: {
    alignItems: 'flex-end',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  spotRateText: {
    color: '#10B981',
    fontSize: 17,
    fontWeight: '900',
  },
  spotRateUnit: {
    color: '#9CA3AF',
    fontSize: 10,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: '#374151',
  },
  durationLabel: {
    color: '#D1D5DB',
    fontSize: 14,
    fontWeight: '600',
  },
  durationControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  durationBtn: {
    backgroundColor: '#0B0F19',
    height: 32,
    width: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#4B5563',
  },
  durationBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 18,
  },
  durationValText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  totalPreviewBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0B0F19',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 16,
  },
  totalLabel: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  totalAmountText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  directionsBtn: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  directionsBtnText: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '800',
  },
  bookButton: {
    flex: 1,
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookButtonText: {
    color: '#0B0F19',
    fontSize: 15,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  modalContent: {
    backgroundColor: '#1A2235',
    padding: 24,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: '#374151',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 16,
  },
  filterSectionTitle: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  filterChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  filterChipActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: '#10B981',
  },
  filterChipInactive: {
    backgroundColor: '#0B0F19',
    borderColor: '#374151',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: '#10B981',
  },
  filterChipTextInactive: {
    color: '#9CA3AF',
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: '#0B0F19',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
  },
  modalCancelText: {
    color: '#9CA3AF',
    fontWeight: '600',
    fontSize: 14,
  },
  modalApplyBtn: {
    flex: 1,
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  modalApplyText: {
    color: '#0B0F19',
    fontWeight: '800',
    fontSize: 14,
  },
});