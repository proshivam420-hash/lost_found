/**
 * Firebase Configuration for Campus Lost & Found
 * 
 * Replace the placeholder values below with your Firebase Project credentials
 * from the Firebase Console (Project Settings > General > Your apps > Web app).
 * 
 * You can also configure this dynamically directly from the UI using the
 * "Configure Firebase" button in the app header!
 */

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Check if user has saved credentials in localStorage
function getActiveFirebaseConfig() {
  const saved = localStorage.getItem('campus_lost_found_firebase_config');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.apiKey && parsed.apiKey !== "YOUR_API_KEY") {
        return { config: parsed, isCustom: true };
      }
    } catch (e) {
      console.warn('Failed to parse saved Firebase config:', e);
    }
  }

  const isConfigured = DEFAULT_FIREBASE_CONFIG.apiKey && DEFAULT_FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY";
  return {
    config: DEFAULT_FIREBASE_CONFIG,
    isCustom: isConfigured
  };
}
