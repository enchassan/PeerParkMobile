import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';

export default function ExploreScreen() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSpot, setSelectedSpot] = useState<any>(null);

  const mockSpots = [
    { id: '1', title: '14B Sunset Blvd, DHA', price: 150, latitude: 31.5204, longitude: 74.3587, distance: '2 mins away' },
    { id: '2', title: 'Tech Park Block C', price: 200, latitude: 31.5304, longitude: 74.3487, distance: '5 mins away' },
  ];

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Allow location access to view nearby spots.');
        setLoading(false);
        return;
      }
      let currentLocation = await Location.getCurrentPositionAsync({});
      setLocation(currentLocation);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-[#0B0F19]">
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#0B0F19]">
      {/* Base Map Layer */}
      <MapView
        provider={PROVIDER_DEFAULT}
        className="w-full h-full"
        initialRegion={{
          latitude: location?.coords.latitude || 31.5204,
          longitude: location?.coords.longitude || 74.3587,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        showsUserLocation
        onPress={() => setSelectedSpot(null)} // Close bottom sheet when tapping map
      >
        {mockSpots.map((spot) => (
          <Marker
            key={spot.id}
            coordinate={{ latitude: spot.latitude, longitude: spot.longitude }}
            onPress={(e) => {
              e.stopPropagation();
              setSelectedSpot(spot);
            }}
          >
            {/* Custom Price Marker Pin */}
            <View className="bg-[#10B981] px-3 py-1 rounded-full border-2 border-[#0B0F19]">
              <Text className="text-white font-bold text-xs">Rs. {spot.price}/hr</Text>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Floating Search Bar */}
      <View className="absolute top-12 w-full px-4">
        <View className="bg-[#1A2235]/90 backdrop-blur-md flex-row items-center px-4 py-3 rounded-2xl border border-gray-800">
          <TextInput
            className="flex-1 text-white ml-2"
            placeholder="Where are you parking?"
            placeholderTextColor="#6B7280"
          />
        </View>
      </View>

      {/* Bottom Sheet Container */}
      {selectedSpot && (
        <View className="absolute bottom-8 w-full px-4">
          <View className="bg-[#1A2235] p-5 rounded-3xl border border-gray-800 shadow-lg">
            <View className="flex-row justify-between items-start mb-4">
              <View>
                <Text className="text-white text-xl font-bold">{selectedSpot.title}</Text>
                <Text className="text-gray-400 mt-1">{selectedSpot.distance}</Text>
              </View>
              <View className="items-end">
                <Text className="text-white text-xl font-bold">Rs. {selectedSpot.price}</Text>
                <Text className="text-gray-400 text-xs">per hour</Text>
              </View>
            </View>

            <TouchableOpacity className="w-full bg-[#10B981] py-4 rounded-xl items-center">
              <Text className="text-white font-bold text-lg">Book Spot</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}