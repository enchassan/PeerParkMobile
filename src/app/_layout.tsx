import { Stack } from 'expo-router';
import '../global.css'; 

export default function RootLayout() {
  return (
    <Stack>
      {/* Login Screen */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      
      {/* Driver Map View */}
      <Stack.Screen name="explore" options={{ headerShown: false }} />
      
      {/* Host Dashboard */}
      <Stack.Screen name="host" options={{ headerShown: false }} />
    </Stack>
  );
}