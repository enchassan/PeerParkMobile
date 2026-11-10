import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';
import api from '../services/api';

interface ParkingSpot {
  _id: string;
  street_address: string;
  hourly_rate: number;
  spot_status: string;
  is_active: boolean;
  location: {
    coordinates: [number, number]; // [lng, lat]
  };
  host_id?: {
    full_name: string;
    phone_number: string;
  };
}

export default function ExploreWebScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [spots, setSpots] = useState<ParkingSpot[]>([]);
  const [selectedSpot, setSelectedSpot] = useState<ParkingSpot | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [bookingHours, setBookingHours] = useState(2);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);

  // Fetch Spots from backend
  const fetchSpots = async (query = '') => {
    try {
      const response = await api.get('/spots/nearby', {
        params: { lat: 31.5204, lng: 74.3587, radius: 25, maxPrice: 1000 },
      });
      let fetched: ParkingSpot[] = response.data?.spots || [];
      if (query.trim()) {
        fetched = fetched.filter((s) =>
          s.street_address.toLowerCase().includes(query.toLowerCase())
        );
      }
      setSpots(fetched);
    } catch (err: any) {
      console.error('Failed to fetch spots:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSpots();
  }, []);

  const handleBookSpot = async () => {
    if (!selectedSpot) return;
    setBookingSubmitting(true);
    try {
      const now = new Date();
      const checkin = new Date(now.getTime() + 10 * 60 * 1000);
      const checkout = new Date(checkin.getTime() + bookingHours * 60 * 60 * 1000);

      await api.post('/bookings/request', {
        spot_id: selectedSpot._id,
        scheduled_checkin: checkin.toISOString(),
        scheduled_checkout: checkout.toISOString(),
      });

      alert(`Booking Requested for ${selectedSpot.street_address} (${bookingHours} hrs)! The host will review and approve it.`);
      setSelectedSpot(null);
      router.push('/bookings' as any);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Booking failed.');
    } finally {
      setBookingSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await SecureStore.deleteItemAsync('userToken');
    await SecureStore.deleteItemAsync('userRole');
    router.replace('/' as any);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={styles.dot} />
          <Text style={styles.logoText}>PeerPark Web Explorer</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity
            onPress={() => router.push('/bookings' as any)}
            style={styles.navBtn}
          >
            <Text style={styles.navBtnText}>📋 My Bookings</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleLogout} style={styles.signOutBtn}>
            <Text style={{ color: '#9CA3AF', fontSize: 12 }}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={{ flex: 1, padding: 20 }}>
        {/* Search */}
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search Lahore areas (DHA, Gulberg, Johar Town)..."
            placeholderTextColor="#6B7280"
            value={searchQuery}
            onChangeText={(txt) => {
              setSearchQuery(txt);
              fetchSpots(txt);
            }}
          />
        </View>

        {/* Embedded Interactive OpenStreetMap (Iframe for Web) */}
        <View style={styles.mapContainer}>
          <iframe
            title="OpenStreetMap"
            width="100%"
            height="320"
            style={{ border: 0, borderRadius: 20 }}
            src="https://www.openstreetmap.org/export/embed.html?bbox=74.15%2C31.35%2C74.45%2C31.60&layer=mapnik&marker=31.5204%2C74.3587"
          />
        </View>

        {/* Available Spots Grid */}
        <Text style={styles.sectionHeading}>
          Available Parking Spaces ({spots.length})
        </Text>

        {loading ? (
          <ActivityIndicator color="#10B981" size="large" />
        ) : (
          <View style={{ gap: 12, marginBottom: 80 }}>
            {spots.map((spot) => {
              const isSelected = selectedSpot?._id === spot._id;
              return (
                <TouchableOpacity
                  key={spot._id}
                  onPress={() => setSelectedSpot(spot)}
                  style={[
                    styles.spotCard,
                    isSelected && { borderColor: '#10B981', backgroundColor: '#131D2E' },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.spotTitle}>{spot.street_address}</Text>
                    <Text style={styles.spotHost}>
                      Host: {spot.host_id?.full_name || 'Verified Host'}
                    </Text>
                    <Text style={styles.spotCoords}>
                      Coords: {spot.location.coordinates[1].toFixed(4)}° N, {spot.location.coordinates[0].toFixed(4)}° E
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.spotPrice}>Rs. {spot.hourly_rate}</Text>
                    <Text style={{ color: '#9CA3AF', fontSize: 10 }}>/hour</Text>
                    <Text style={styles.bookTag}>{isSelected ? 'Selected' : 'Tap to Book'}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Booking Bottom Sheet */}
      {selectedSpot && (
        <View style={styles.bottomSheet}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
            <View>
              <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 16 }}>
                {selectedSpot.street_address}
              </Text>
              <Text style={{ color: '#10B981', fontWeight: 'bold', fontSize: 13, marginTop: 2 }}>
                Rs. {selectedSpot.hourly_rate}/hr
              </Text>
            </View>

            {/* Duration Selector */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <TouchableOpacity
                onPress={() => setBookingHours((p) => Math.max(1, p - 1))}
                style={styles.counterBtn}
              >
                <Text style={{ color: '#FFF', fontWeight: 'bold' }}>-</Text>
              </TouchableOpacity>
              <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{bookingHours} hrs</Text>
              <TouchableOpacity
                onPress={() => setBookingHours((p) => Math.min(12, p + 1))}
                style={styles.counterBtn}
              >
                <Text style={{ color: '#FFF', fontWeight: 'bold' }}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 16 }}>
              Total: Rs. {selectedSpot.hourly_rate * bookingHours}
            </Text>

            <TouchableOpacity
              onPress={handleBookSpot}
              disabled={bookingSubmitting}
              style={styles.confirmBtn}
            >
              {bookingSubmitting ? (
                <ActivityIndicator color="#0B0F19" />
              ) : (
                <Text style={{ color: '#0B0F19', fontWeight: 'bold' }}>Confirm Booking</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19' },
  header: {
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 15,
    backgroundColor: '#1A2235',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#374151',
  },
  dot: { height: 10, width: 10, borderRadius: 5, backgroundColor: '#10B981' },
  logoText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  navBtn: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  navBtnText: { color: '#10B981', fontWeight: 'bold', fontSize: 12 },
  signOutBtn: {
    backgroundColor: '#0B0F19',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#374151',
  },
  searchBar: {
    backgroundColor: '#1A2235',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  searchInput: { color: '#FFF', fontSize: 14, outlineStyle: 'none' as any },
  mapContainer: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 20,
  },
  sectionHeading: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  spotCard: {
    backgroundColor: '#1A2235',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#374151',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  spotTitle: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
  spotHost: { color: '#9CA3AF', fontSize: 12, marginTop: 2 },
  spotCoords: { color: '#6B7280', fontSize: 11, marginTop: 4 },
  spotPrice: { color: '#10B981', fontWeight: '900', fontSize: 18 },
  bookTag: { color: '#10B981', fontSize: 11, fontWeight: 'bold', marginTop: 4 },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1A2235',
    padding: 20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: '#374151',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  counterBtn: {
    backgroundColor: '#0B0F19',
    height: 30,
    width: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#4B5563',
  },
  confirmBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
});