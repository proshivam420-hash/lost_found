/**
 * Firebase Backend Service Layer
 * 
 * Provides unified interface for:
 * 1. Firebase Authentication (Google Sign-In, Email/Password, Sign Out, Auth State)
 * 2. Cloud Firestore (Real-time syncing, item creation, mark as resolved)
 * 3. Firebase Cloud Storage (Real photo file uploads)
 * 4. Resilient Fallback / Demo Mode if Firebase keys have not yet been plugged in
 */

const FirebaseService = (function() {
  let isLive = false;
  let authInstance = null;
  let dbInstance = null;
  let storageInstance = null;
  let authCallbacks = [];
  let currentAuthUser = null;

  // Initialize service
  function init() {
    const { config, isCustom } = getActiveFirebaseConfig();

    if (isCustom && typeof firebase !== 'undefined' && firebase.apps) {
      try {
        if (!firebase.apps.length) {
          firebase.initializeApp(config);
        }
        authInstance = firebase.auth();
        dbInstance = firebase.firestore();
        storageInstance = firebase.storage();
        isLive = true;
        console.log('🔥 Connected to Live Firebase Project:', config.projectId);

        authInstance.onAuthStateChanged((user) => {
          currentAuthUser = user ? formatFirebaseUser(user) : null;
          notifyAuthListeners();
        });
      } catch (err) {
        console.error('Failed to initialize live Firebase, falling back to local mode:', err);
        setupFallbackAuth();
      }
    } else {
      console.log('⚡ Running in Firebase Local/Demo Mode. Configure live keys in Firebase Settings.');
      setupFallbackAuth();
    }
  }

  // Format Firebase User into standardized structure
  function formatFirebaseUser(user) {
    return {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || user.email.split('@')[0],
      photoURL: user.photoURL || null,
      providerId: user.providerData && user.providerData[0] ? user.providerData[0].providerId : 'password'
    };
  }

  // Fallback simulated authentication for testing without setup hurdles
  function setupFallbackAuth() {
    isLive = false;
    const storedUser = localStorage.getItem('campus_lost_found_demo_user');
    if (storedUser) {
      try {
        currentAuthUser = JSON.parse(storedUser);
      } catch (e) {
        currentAuthUser = null;
      }
    }
  }

  function notifyAuthListeners() {
    authCallbacks.forEach(cb => {
      try { cb(currentAuthUser); } catch (e) { console.error(e); }
    });
  }

  // ==================== AUTHENTICATION ====================

  async function signInWithGoogle() {
    if (isLive && authInstance) {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('email');
      provider.addScope('profile');
      const result = await authInstance.signInWithPopup(provider);
      return formatFirebaseUser(result.user);
    } else {
      // Demo Google Sign-In simulation
      const mockGoogleUser = {
        uid: 'demo-google-uid-778',
        email: 'alex.rivera@campus.edu',
        displayName: 'Alex Rivera',
        photoURL: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
        providerId: 'google.com'
      };
      currentAuthUser = mockGoogleUser;
      localStorage.setItem('campus_lost_found_demo_user', JSON.stringify(mockGoogleUser));
      notifyAuthListeners();
      return mockGoogleUser;
    }
  }

  async function signInWithEmail(email, password) {
    if (isLive && authInstance) {
      const result = await authInstance.signInWithEmailAndPassword(email, password);
      return formatFirebaseUser(result.user);
    } else {
      // Demo Email Sign-In
      if (!email || !password) throw new Error('Email and password are required.');
      const mockUser = {
        uid: 'user-' + btoa(email).replace(/=/g, '').toLowerCase().slice(0, 16),
        email: email,
        displayName: email.split('@')[0],
        photoURL: null,
        providerId: 'password'
      };
      currentAuthUser = mockUser;
      localStorage.setItem('campus_lost_found_demo_user', JSON.stringify(mockUser));
      notifyAuthListeners();
      return mockUser;
    }
  }

  async function signUpWithEmail(email, password, displayName) {
    if (isLive && authInstance) {
      const result = await authInstance.createUserWithEmailAndPassword(email, password);
      if (displayName) {
        await result.user.updateProfile({ displayName });
      }
      return formatFirebaseUser(result.user);
    } else {
      // Demo Email Registration
      if (!email || !password) throw new Error('Email and password are required.');
      const mockUser = {
        uid: 'user-' + btoa(email).replace(/=/g, '').toLowerCase().slice(0, 16),
        email: email,
        displayName: displayName || email.split('@')[0],
        photoURL: null,
        providerId: 'password'
      };
      currentAuthUser = mockUser;
      localStorage.setItem('campus_lost_found_demo_user', JSON.stringify(mockUser));
      notifyAuthListeners();
      return mockUser;
    }
  }

  async function signOut() {
    if (isLive && authInstance) {
      await authInstance.signOut();
    } else {
      currentAuthUser = null;
      localStorage.removeItem('campus_lost_found_demo_user');
      notifyAuthListeners();
    }
  }

  function onAuthStateChanged(cb) {
    authCallbacks.push(cb);
    cb(currentAuthUser);
    return () => {
      authCallbacks = authCallbacks.filter(c => c !== cb);
    };
  }

  function getCurrentUser() {
    return currentAuthUser;
  }

  // ==================== FIRESTORE & DATA ====================

  function subscribeItems(onSuccess, onError) {
    if (isLive && dbInstance) {
      try {
        const unsubscribe = dbInstance.collection('items')
          .orderBy('createdAt', 'desc')
          .onSnapshot(async (snapshot) => {
            // If collection is completely empty, seed with initial items
            if (snapshot.empty && typeof INITIAL_ITEMS !== 'undefined') {
              console.log('Seeding initial items to Firestore...');
              await seedFirestoreDefaults();
              return;
            }
            const items = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            }));
            onSuccess(items);
          }, (err) => {
            console.error('Firestore subscription error:', err);
            if (onError) onError(err);
            // Fallback to local
            subscribeLocalItems(onSuccess);
          });
        return unsubscribe;
      } catch (e) {
        console.warn('Falling back to local storage store:', e);
        return subscribeLocalItems(onSuccess);
      }
    } else {
      return subscribeLocalItems(onSuccess);
    }
  }

  // Helper to seed Firestore defaults
  async function seedFirestoreDefaults() {
    if (!dbInstance) return;
    const batch = dbInstance.batch();
    INITIAL_ITEMS.forEach(item => {
      const docRef = dbInstance.collection('items').doc(item.id);
      batch.set(docRef, {
        ...item,
        status: item.status || 'active',
        userId: 'system-campus-seed',
        createdAt: item.date || new Date().toISOString()
      });
    });
    await batch.commit();
  }

  // Fallback local subscription
  function subscribeLocalItems(callback) {
    const LOCAL_STORE_KEY = 'campus_lost_found_firestore_db';
    let data = localStorage.getItem(LOCAL_STORE_KEY);
    let items = [];
    if (data) {
      try { items = JSON.parse(data); } catch (e) { items = []; }
    }
    if (!items || items.length === 0) {
      items = (typeof INITIAL_ITEMS !== 'undefined' ? INITIAL_ITEMS : []).map(i => ({
        ...i,
        status: i.status || 'active',
        userId: i.userId || 'system-campus-seed',
        createdAt: i.date || new Date().toISOString()
      }));
      localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(items));
    }
    callback(items);

    // Storage event listener for multi-tab sync in local mode
    const handler = (e) => {
      if (e.key === LOCAL_STORE_KEY) {
        try {
          callback(JSON.parse(e.newValue || '[]'));
        } catch (err) {}
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }

  async function createItem(itemData) {
    const user = getCurrentUser();
    if (!user) throw new Error('Authentication required to report an item.');

    const payload = {
      ...itemData,
      status: 'active',
      userId: user.uid,
      userEmail: user.email,
      userName: user.displayName,
      createdAt: new Date().toISOString()
    };

    if (isLive && dbInstance) {
      const docRef = await dbInstance.collection('items').add(payload);
      return { id: docRef.id, ...payload };
    } else {
      // Local Firestore simulation
      const LOCAL_STORE_KEY = 'campus_lost_found_firestore_db';
      const raw = localStorage.getItem(LOCAL_STORE_KEY);
      let items = raw ? JSON.parse(raw) : [];
      const newDoc = {
        id: `item-${Date.now()}`,
        ...payload
      };
      items.unshift(newDoc);
      localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(items));
      // Dispatch storage event for current window
      window.dispatchEvent(new StorageEvent('storage', {
        key: LOCAL_STORE_KEY,
        newValue: JSON.stringify(items)
      }));
      return newDoc;
    }
  }

  async function markItemResolved(itemId) {
    const user = getCurrentUser();
    if (!user) throw new Error('You must be signed in to resolve an item.');

    if (isLive && dbInstance) {
      await dbInstance.collection('items').doc(itemId).update({
        status: 'resolved',
        resolvedAt: new Date().toISOString(),
        resolvedBy: user.uid
      });
      return true;
    } else {
      const LOCAL_STORE_KEY = 'campus_lost_found_firestore_db';
      const raw = localStorage.getItem(LOCAL_STORE_KEY);
      let items = raw ? JSON.parse(raw) : [];
      items = items.map(item => {
        if (item.id === itemId) {
          return {
            ...item,
            status: 'resolved',
            resolvedAt: new Date().toISOString(),
            resolvedBy: user.uid
          };
        }
        return item;
      });
      localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(items));
      window.dispatchEvent(new StorageEvent('storage', {
        key: LOCAL_STORE_KEY,
        newValue: JSON.stringify(items)
      }));
      return true;
    }
  }

  // ==================== STORAGE ====================

  async function uploadImageFile(file, userId) {
    if (!file) return null;

    if (isLive && storageInstance) {
      try {
        const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
        const storagePath = `items/${userId || 'anon'}_${Date.now()}_${safeName}`;
        const fileRef = storageInstance.ref().child(storagePath);
        const snapshot = await fileRef.put(file);
        const downloadUrl = await snapshot.ref.getDownloadURL();
        return downloadUrl;
      } catch (err) {
        console.warn('Firebase Storage upload failed, falling back to base64 data URL:', err);
        return readFileAsDataUrl(file);
      }
    } else {
      return readFileAsDataUrl(file);
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });
  }

  return {
    init,
    isLive: () => isLive,
    auth: {
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      signOut,
      onAuthStateChanged,
      getCurrentUser
    },
    items: {
      subscribe: subscribeItems,
      create: createItem,
      markResolved: markItemResolved
    },
    storage: {
      uploadImage: uploadImageFile
    }
  };
})();
