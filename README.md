# Campus Lost & Found 🎓🔍

A modern, full-stack, mobile-friendly web application for university campuses. Features **Firebase Authentication**, **Cloud Firestore** real-time sync, **Cloud Storage** for authentic photo uploads, and an author-specific **Resolution Workflow** to mark items returned.

![Campus Lost & Found Screenshot](https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=1200&q=80)

---

## 🚀 Key Features

### 1. 🔐 Firebase Authentication
- **Multi-Provider Auth**:
  - **Google Sign-In**: One-click authentication with Google OAuth pop-up.
  - **Email & Password**: Registration and sign-in with verified campus email addresses.
- **Protected Actions**: Users must authenticate before:
  - Reporting an item (via header or floating action button `+`).
  - Submitting an ownership claim or sighting report.
- **Header Profile**: Displays the authenticated user's photo/avatar, full name, email, and sign-out button.
- **Auto-Fill**: Automatically binds the reporter's verified name and email to newly reported items.

### 2. 🗄️ Cloud Firestore Integration
- **Real-Time Database Sync**: Automatically listens for document updates with Firestore snapshots (`onSnapshot`), instantly reflecting new reports across all connected devices and browsers.
- **Document Model**:
  - `id`: Unique Firestore document reference
  - `title`, `type` (`Lost` | `Found`), `category`, `location`, `date`, `description`
  - `imageUrl`: Public cloud download URL from Cloud Storage
  - `userId`, `userEmail`, `contactName`, `contactEmail`, `contactPhone`
  - `status`: `'active'` | `'resolved'`
  - `createdAt`, `resolvedAt`, `resolvedBy`

### 3. 📸 Real Photo Cloud Storage
- Direct client-side file picker & drag-and-drop zone with instant thumbnail previews.
- Uploads images directly to Firebase Cloud Storage under `items/{userId}_{timestamp}_{filename}`.
- Generates secure download URLs stored in Firestore with automatic responsive card rendering.

### 4. ✅ Author-Only "Mark as Resolved / Returned" Workflow
- **Ownership Verification**: Automatically checks if `currentUser.uid === item.userId`.
- **Card Action**: Displays an exclusive **`Mark Returned`** button directly on the card for posts authored by the logged-in user.
- **Details Modal Action**: Displays an author-only banner:
  > *"You reported this item! Reunited with its owner? Mark it resolved to close further inquiries."*
  with a **`Mark as Resolved / Returned`** button.
- **Resolved State**:
  - Updates the badge to a prominent dark slate **`✓ RESOLVED`** tag.
  - Disables further claims ("Item Successfully Resolved & Returned").
  - Moves the record to the dedicated **Resolved** tab.

### 5. 🎛️ Dual Backend Mode (Live Firebase + Built-in Demo)
- **Live Firebase**: Connect any Firebase project by editing [js/firebaseConfig.js](file:///Users/shivamsingh/Downloads/lost_found/js/firebaseConfig.js) or clicking the Firebase status badge in the header to enter your API keys.
- **Demo Mode**: Works immediately out-of-the-box with complete client-side simulated auth, Firestore state sync, and storage—no setup hurdles required!

---

## 🛠️ How to Connect Your Live Firebase Project

1. Go to the [Firebase Console](https://console.firebase.google.com/) and create a project.
2. Enable:
   - **Authentication** (Google Sign-In & Email/Password providers).
   - **Cloud Firestore** (Start in test mode or with read/write rules).
   - **Cloud Storage** (For photo uploads).
3. Copy your Web App config credentials.
4. Either:
   - Click the **"Firebase Demo Mode"** badge in the app header and paste your API Key, Project ID, Auth Domain, and Storage Bucket; OR
   - Edit [js/firebaseConfig.js](file:///Users/shivamsingh/Downloads/lost_found/js/firebaseConfig.js):
   ```javascript
   const DEFAULT_FIREBASE_CONFIG = {
     apiKey: "YOUR_API_KEY",
     authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
     projectId: "YOUR_PROJECT_ID",
     storageBucket: "YOUR_PROJECT_ID.appspot.com",
     messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
     appId: "YOUR_APP_ID"
   };
   ```

---

## 🏃 Running the Application

Serve the files using Python's built-in web server:

```bash
# In the project directory:
python3 -m http.server 4173
```

Visit the app at:
[http://localhost:4173](http://localhost:4173)

---

## 📂 File Architecture

```
lost_found/
├── index.html              # Responsive HTML5 markup, Tailwind CSS, Auth & Modals
├── css/
│   └── styles.css          # Glassmorphism, animations, scrollbars
├── js/
│   ├── firebaseConfig.js   # Firebase configuration & credential management
│   ├── firebaseService.js  # Unified Firebase Auth, Firestore, and Storage service layer
│   ├── mockData.js         # Initial seed items for Firestore initialization
│   └── app.js              # State management, filter logic, modals, resolution workflow
└── README.md               # Documentation
```
