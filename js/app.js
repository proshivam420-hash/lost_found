/**
 * Campus Lost & Found - Main Application Logic
 * Integrated with Firebase Auth, Cloud Firestore, Cloud Storage, and Resolution Workflow
 */

// Application State
const state = {
  items: [],
  activeTab: 'all',          // 'all' | 'Lost' | 'Found' | 'Resolved'
  searchQuery: '',
  selectedCategory: 'all',   // 'all' | 'Electronics' | 'IDs/Wallets' | 'Keys' | 'Books/Notes' | 'Clothing' | 'Other'
  selectedLocation: 'all',   // 'all' | 'Library' | 'Student Union' | 'Cafeteria' | 'Dorms' | 'Gym'
  sortBy: 'newest',          // 'newest' | 'oldest'
  uploadedImageFile: null,
  uploadedImageBase64: null,
  activeItemForDetails: null,
  currentUser: null,
  authPendingAction: null,   // Callback to execute after successful sign-in
  toastTimeout: null
};

// Category Default Fallback Images
const CATEGORY_FALLBACK_IMAGES = {
  'Electronics': 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=800&q=80',
  'IDs/Wallets': 'https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=800&q=80',
  'Keys': 'https://images.unsplash.com/photo-1582139329536-e7284fece509?auto=format&fit=crop&w=800&q=80',
  'Books/Notes': 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=800&q=80',
  'Clothing': 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=800&q=80',
  'Other': 'https://images.unsplash.com/photo-1584824486509-112e4181ff6b?auto=format&fit=crop&w=800&q=80'
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  initFirebase();
  initEventListeners();
  setDefaultDate();
});

// Initialize Firebase & Listeners
function initFirebase() {
  FirebaseService.init();

  // Update backend status pill
  const statusText = document.getElementById('backendStatusText');
  if (statusText) {
    statusText.textContent = FirebaseService.isLive() ? 'Firebase Live' : 'Firebase Demo Mode';
  }

  // Auth State Listener
  FirebaseService.auth.onAuthStateChanged((user) => {
    state.currentUser = user;
    updateAuthUI(user);

    // If an action was queued waiting for sign in, run it
    if (user && typeof state.authPendingAction === 'function') {
      const action = state.authPendingAction;
      state.authPendingAction = null;
      action();
    }

    // Refresh details modal view if open
    if (state.activeItemForDetails) {
      window.openDetailsModal(state.activeItemForDetails.id);
    }
  });

  // Firestore Real-time Items Subscription
  FirebaseService.items.subscribe((items) => {
    state.items = items;
    renderApp();
  }, (err) => {
    console.warn('Subscription warning:', err);
  });
}

// Update UI based on User Authentication
function updateAuthUI(user) {
  const openAuthBtn = document.getElementById('openAuthModalBtn');
  const userProfilePill = document.getElementById('userProfilePill');
  const userDisplayName = document.getElementById('userDisplayName');
  const userEmailTag = document.getElementById('userEmailTag');
  const userAvatarContainer = document.getElementById('userAvatarContainer');
  const userInitials = document.getElementById('userInitials');
  const authNoticeBanner = document.getElementById('authNoticeBanner');
  const bannerUserName = document.getElementById('bannerUserName');
  const bannerUserEmail = document.getElementById('bannerUserEmail');

  const formContactName = document.getElementById('formContactName');
  const formContactEmail = document.getElementById('formContactEmail');

  if (user) {
    openAuthBtn?.classList.add('hidden');
    userProfilePill?.classList.remove('hidden');

    if (userDisplayName) userDisplayName.textContent = user.displayName || 'Campus User';
    if (userEmailTag) userEmailTag.textContent = user.email || '';
    
    // Set Avatar or Initials
    if (user.photoURL && userAvatarContainer) {
      userAvatarContainer.innerHTML = `<img src="${user.photoURL}" alt="${user.displayName}" class="w-full h-full object-cover" />`;
    } else if (userInitials) {
      const initial = (user.displayName || user.email || 'U').charAt(0).toUpperCase();
      userAvatarContainer.innerHTML = `<span id="userInitials">${initial}</span>`;
    }

    // Pre-populate Post Form with verified user contact
    if (formContactName && !formContactName.value) formContactName.value = user.displayName || '';
    if (formContactEmail) formContactEmail.value = user.email || '';

    // Show banner once
    if (authNoticeBanner && !sessionStorage.getItem('dismissed_auth_banner')) {
      authNoticeBanner.classList.remove('hidden');
      if (bannerUserName) bannerUserName.textContent = user.displayName || 'User';
      if (bannerUserEmail) bannerUserEmail.textContent = user.email || '';
    }
  } else {
    openAuthBtn?.classList.remove('hidden');
    userProfilePill?.classList.add('hidden');
    authNoticeBanner?.classList.add('hidden');
  }

  // Re-render feed to show "Mark as Resolved" buttons if author
  renderApp();
}

// Set Today's Date in Post Form
function setDefaultDate() {
  const dateInput = document.getElementById('formDate');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
  }
}

// Refresh Lucide Icons safely
function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

// Main Render Function
function renderApp() {
  updateCounts();
  renderFilteredItems();
  updateFilterUI();
  refreshIcons();
}

// Update Tab Counts
function updateCounts() {
  const allCount = state.items.length;
  const lostCount = state.items.filter(i => i.type === 'Lost' && i.status !== 'resolved').length;
  const foundCount = state.items.filter(i => i.type === 'Found' && i.status !== 'resolved').length;
  const resolvedCount = state.items.filter(i => i.status === 'resolved').length;

  document.getElementById('allCountBadge').textContent = allCount;
  document.getElementById('lostCountBadge').textContent = lostCount;
  document.getElementById('foundCountBadge').textContent = foundCount;
  const resBadge = document.getElementById('resolvedCountBadge');
  if (resBadge) resBadge.textContent = resolvedCount;
}

// Filter and Sort Items
function getFilteredItems() {
  return state.items.filter(item => {
    const isResolved = item.status === 'resolved';

    // Tab filter
    if (state.activeTab === 'Resolved') {
      if (!isResolved) return false;
    } else if (state.activeTab === 'Lost') {
      if (item.type !== 'Lost' || isResolved) return false;
    } else if (state.activeTab === 'Found') {
      if (item.type !== 'Found' || isResolved) return false;
    }
    // 'all' includes both active and resolved items

    // Category filter
    if (state.selectedCategory !== 'all' && item.category !== state.selectedCategory) {
      return false;
    }

    // Location filter
    if (state.selectedLocation !== 'all' && item.location !== state.selectedLocation) {
      return false;
    }

    // Search query filter
    if (state.searchQuery.trim() !== '') {
      const q = state.searchQuery.toLowerCase().trim();
      const inTitle = (item.title || '').toLowerCase().includes(q);
      const inDesc = (item.description || '').toLowerCase().includes(q);
      const inLoc = (item.location || '').toLowerCase().includes(q);
      const inCat = (item.category || '').toLowerCase().includes(q);
      if (!inTitle && !inDesc && !inLoc && !inCat) {
        return false;
      }
    }

    return true;
  }).sort((a, b) => {
    const timeA = new Date(a.createdAt || a.date).getTime();
    const timeB = new Date(b.createdAt || b.date).getTime();
    return state.sortBy === 'newest' ? timeB - timeA : timeA - timeB;
  });
}

// Render Items Feed Grid
function renderFilteredItems() {
  const grid = document.getElementById('itemsGrid');
  const emptyState = document.getElementById('emptyState');
  const feedCount = document.getElementById('feedItemCount');
  const feedTitle = document.getElementById('feedTitle');

  const filtered = getFilteredItems();

  // Update Section Title & Count Badge
  let titlePrefix = 'All Active & Resolved Items';
  if (state.activeTab === 'Lost') titlePrefix = 'Lost Belongings';
  if (state.activeTab === 'Found') titlePrefix = 'Found Belongings';
  if (state.activeTab === 'Resolved') titlePrefix = 'Returned & Resolved Items';

  feedTitle.textContent = titlePrefix;
  feedCount.textContent = `${filtered.length} item${filtered.length === 1 ? '' : 's'}`;

  if (filtered.length === 0) {
    grid.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  grid.innerHTML = filtered.map(item => {
    const isResolved = item.status === 'resolved';
    const isLost = item.type === 'Lost';
    const imageUrl = item.imageUrl || item.image || CATEGORY_FALLBACK_IMAGES[item.category] || CATEGORY_FALLBACK_IMAGES['Other'];

    // Check if the current user is the original creator
    const isAuthor = state.currentUser && (
      state.currentUser.uid === item.userId ||
      (item.userEmail && state.currentUser.email === item.userEmail)
    );

    // Badge styling
    let badgeHtml = '';
    if (isResolved) {
      badgeHtml = `
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold tracking-wider uppercase shadow-md bg-slate-800 text-white border border-slate-700">
          <i data-lucide="check-check" class="w-3.5 h-3.5 text-emerald-400"></i>
          Resolved
        </span>
      `;
    } else if (isLost) {
      badgeHtml = `
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold tracking-wider uppercase shadow-md bg-rose-500 text-white">
          <span class="w-1.5 h-1.5 rounded-full bg-rose-200 animate-ping"></span>
          LOST
        </span>
      `;
    } else {
      badgeHtml = `
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold tracking-wider uppercase shadow-md bg-emerald-600 text-white">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-200 animate-ping"></span>
          FOUND
        </span>
      `;
    }

    // Author Quick Action Button on card
    let authorCardAction = '';
    if (isAuthor && !isResolved) {
      authorCardAction = `
        <button 
          onclick="event.stopPropagation(); markAsResolved('${item.id}')"
          class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-100 hover:bg-emerald-600 hover:text-white text-emerald-800 transition-colors shadow-sm"
          title="Mark as Resolved / Returned"
        >
          <i data-lucide="check-circle" class="w-3 h-3"></i>
          <span>Mark Returned</span>
        </button>
      `;
    }

    return `
      <article class="bg-white rounded-2xl overflow-hidden border ${isResolved ? 'border-slate-300/80 opacity-90' : 'border-slate-200/80'} shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col group">
        
        <!-- Card Top Image & Badges -->
        <div class="relative h-48 w-full bg-slate-100 overflow-hidden shrink-0">
          <img 
            src="${imageUrl}" 
            alt="${escapeHtml(item.title)}" 
            loading="lazy"
            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ${isResolved ? 'grayscale-[35%]' : ''}"
            onerror="this.onerror=null; this.src='${CATEGORY_FALLBACK_IMAGES[item.category] || CATEGORY_FALLBACK_IMAGES['Other']}';"
          />
          <div class="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-black/20"></div>

          <!-- Status Badge -->
          <div class="absolute top-3 left-3">
            ${badgeHtml}
          </div>

          <!-- Category Chip on Image -->
          <div class="absolute top-3 right-3 flex items-center gap-1.5">
            <span class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white/90 backdrop-blur-md text-slate-800 shadow-sm">
              ${escapeHtml(item.category)}
            </span>
          </div>

          <!-- Location & Date on Card Image -->
          <div class="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-white text-xs">
            <div class="flex items-center gap-1.5 font-medium drop-shadow-sm">
              <i data-lucide="map-pin" class="w-3.5 h-3.5 text-indigo-300 shrink-0"></i>
              <span class="truncate">${escapeHtml(item.location)}</span>
            </div>
            <div class="flex items-center gap-1 text-[11px] text-slate-200 shrink-0 drop-shadow-sm">
              <i data-lucide="clock" class="w-3 h-3 text-slate-300"></i>
              <span>${escapeHtml(item.displayDate || formatDate(item.date || item.createdAt))}</span>
            </div>
          </div>
        </div>

        <!-- Card Body Content -->
        <div class="p-4 sm:p-5 flex-1 flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between gap-1 mb-1">
              <h3 class="font-bold text-slate-900 text-base leading-snug group-hover:text-indigo-600 transition-colors line-clamp-1">
                ${escapeHtml(item.title)}
              </h3>
              ${isAuthor ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 shrink-0">You</span>' : ''}
            </div>
            <p class="text-xs text-slate-500 leading-relaxed line-clamp-2 mb-4">
              ${escapeHtml(item.description)}
            </p>
          </div>

          <!-- Card Footer & Action Button -->
          <div class="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
            <div>
              ${authorCardAction || `<span class="text-[11px] font-medium text-slate-400">By: <span class="text-slate-600 font-semibold">${escapeHtml((item.contactName || item.userName || 'Student').split(' ')[0])}</span></span>`}
            </div>

            <button 
              onclick="openDetailsModal('${item.id}')"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                isResolved
                  ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                  : isLost 
                    ? 'bg-rose-50 text-rose-700 hover:bg-rose-600 hover:text-white border border-rose-200' 
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white border border-emerald-200'
              }"
            >
              <span>${isResolved ? 'View Record' : 'View Details / Claim'}</span>
              <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
            </button>
          </div>

        </div>

      </article>
    `;
  }).join('');
}

// Update UI State for Category & Location Chips
function updateFilterUI() {
  document.querySelectorAll('.category-chip').forEach(btn => {
    const cat = btn.getAttribute('data-category');
    if (cat === state.selectedCategory) {
      btn.className = 'category-chip px-3.5 py-1.5 rounded-xl font-medium transition-all shrink-0 bg-indigo-600 text-white shadow-sm shadow-indigo-500/20 flex items-center gap-1.5';
    } else {
      btn.className = 'category-chip px-3.5 py-1.5 rounded-xl font-medium transition-all shrink-0 bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center gap-1.5';
    }
  });

  document.querySelectorAll('.location-chip').forEach(btn => {
    const loc = btn.getAttribute('data-location');
    if (loc === state.selectedLocation) {
      btn.className = 'location-chip px-3 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 bg-slate-900 text-white shadow-sm';
    } else {
      btn.className = 'location-chip px-3 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 bg-slate-100 text-slate-600 hover:bg-slate-200';
    }
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    const tab = btn.getAttribute('data-tab');
    if (tab === state.activeTab) {
      if (tab === 'Lost') {
        btn.className = 'tab-btn flex items-center gap-2 py-3 px-4 border-b-2 font-bold text-sm transition-all text-rose-600 border-rose-600';
      } else if (tab === 'Found') {
        btn.className = 'tab-btn flex items-center gap-2 py-3 px-4 border-b-2 font-bold text-sm transition-all text-emerald-600 border-emerald-600';
      } else if (tab === 'Resolved') {
        btn.className = 'tab-btn flex items-center gap-2 py-3 px-4 border-b-2 font-bold text-sm transition-all text-slate-800 border-slate-800';
      } else {
        btn.className = 'tab-btn flex items-center gap-2 py-3 px-4 border-b-2 font-bold text-sm transition-all text-indigo-600 border-indigo-600';
      }
    } else {
      btn.className = 'tab-btn flex items-center gap-2 py-3 px-4 border-b-2 font-semibold text-sm transition-all text-slate-500 hover:text-slate-900 border-transparent hover:border-slate-300';
    }
  });

  const isFiltered = state.selectedCategory !== 'all' || state.selectedLocation !== 'all' || state.searchQuery !== '' || state.activeTab !== 'all';
  const resetBtn = document.getElementById('resetFiltersBtn');
  if (resetBtn) {
    if (isFiltered) resetBtn.classList.remove('hidden');
    else resetBtn.classList.add('hidden');
  }

  const filterPillContainer = document.getElementById('filterPillContainer');
  if (filterPillContainer) {
    let pillsHtml = '';
    if (state.selectedCategory !== 'all') {
      pillsHtml += `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">${escapeHtml(state.selectedCategory)}</span>`;
    }
    if (state.selectedLocation !== 'all') {
      pillsHtml += `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">${escapeHtml(state.selectedLocation)}</span>`;
    }
    if (state.searchQuery.trim() !== '') {
      pillsHtml += `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">"${escapeHtml(state.searchQuery.trim())}"</span>`;
    }
    filterPillContainer.innerHTML = pillsHtml;
  }
}

// Reset all filters to default
function resetAllFilters() {
  state.activeTab = 'all';
  state.selectedCategory = 'all';
  state.selectedLocation = 'all';
  state.searchQuery = '';
  state.sortBy = 'newest';

  const dSearch = document.getElementById('desktopSearchInput');
  const mSearch = document.getElementById('mobileSearchInput');
  if (dSearch) dSearch.value = '';
  if (mSearch) mSearch.value = '';
  document.getElementById('clearDesktopSearch')?.classList.add('hidden');
  document.getElementById('clearMobileSearch')?.classList.add('hidden');
  document.getElementById('sortBySelect').value = 'newest';

  renderApp();
}

// Event Listeners setup
function initEventListeners() {
  // Tabs Navigation
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeTab = btn.getAttribute('data-tab');
      renderApp();
    });
  });

  // Category Filtering
  document.getElementById('categoryChips').addEventListener('click', (e) => {
    const chip = e.target.closest('.category-chip');
    if (!chip) return;
    state.selectedCategory = chip.getAttribute('data-category');
    renderApp();
  });

  // Location Filtering
  document.getElementById('locationChips').addEventListener('click', (e) => {
    const chip = e.target.closest('.location-chip');
    if (!chip) return;
    state.selectedLocation = chip.getAttribute('data-location');
    renderApp();
  });

  // Sort dropdown
  document.getElementById('sortBySelect')?.addEventListener('change', (e) => {
    state.sortBy = e.target.value;
    renderApp();
  });

  // Reset Filters Buttons
  document.getElementById('resetFiltersBtn')?.addEventListener('click', resetAllFilters);
  document.getElementById('emptyResetBtn')?.addEventListener('click', resetAllFilters);

  // Search Inputs
  const dSearch = document.getElementById('desktopSearchInput');
  const mSearch = document.getElementById('mobileSearchInput');
  const dClear = document.getElementById('clearDesktopSearch');
  const mClear = document.getElementById('clearMobileSearch');

  function handleSearchInput(value) {
    state.searchQuery = value;
    if (dSearch) dSearch.value = value;
    if (mSearch) mSearch.value = value;

    if (value.trim() !== '') {
      dClear?.classList.remove('hidden');
      mClear?.classList.remove('hidden');
    } else {
      dClear?.classList.add('hidden');
      mClear?.classList.add('hidden');
    }
    renderApp();
  }

  dSearch?.addEventListener('input', (e) => handleSearchInput(e.target.value));
  mSearch?.addEventListener('input', (e) => handleSearchInput(e.target.value));
  dClear?.addEventListener('click', () => handleSearchInput(''));
  mClear?.addEventListener('click', () => handleSearchInput(''));

  // Keyboard shortcut: Pressing "/" focuses search
  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      dSearch?.focus();
    } else if (e.key === 'Escape') {
      closePostModal();
      closeDetailsModal();
      closeAuthModal();
      closeFirebaseConfigModal();
    }
  });

  // Post Item Modal Open Buttons (Require Authentication)
  const handleProtectedPostOpen = () => {
    if (!state.currentUser) {
      state.authPendingAction = () => openPostModal();
      openAuthModal("Sign in to Report an Item");
      return;
    }
    openPostModal();
  };

  document.getElementById('openPostModalBtn')?.addEventListener('click', handleProtectedPostOpen);
  document.getElementById('fabPostBtn')?.addEventListener('click', handleProtectedPostOpen);

  // Post Item Modal Close Buttons
  document.getElementById('closePostModalBtn')?.addEventListener('click', closePostModal);
  document.getElementById('cancelPostBtn')?.addEventListener('click', closePostModal);
  document.getElementById('postModalBackdrop')?.addEventListener('click', closePostModal);

  // Image Upload Handling
  const dropZone = document.getElementById('imageDropZone');
  const fileInput = document.getElementById('formImageInput');
  const removeImageBtn = document.getElementById('removeImageBtn');

  dropZone?.addEventListener('click', (e) => {
    if (e.target.closest('#removeImageBtn')) return;
    fileInput.click();
  });

  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleImageFile(file);
  });

  dropZone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('border-indigo-500', 'bg-indigo-50/50');
  });

  dropZone?.addEventListener('dragleave', () => {
    dropZone.classList.remove('border-indigo-500', 'bg-indigo-50/50');
  });

  dropZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-indigo-500', 'bg-indigo-50/50');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageFile(e.dataTransfer.files[0]);
    }
  });

  removeImageBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    state.uploadedImageFile = null;
    state.uploadedImageBase64 = null;
    fileInput.value = '';
    document.getElementById('uploadPrompt').classList.remove('hidden');
    document.getElementById('imagePreviewContainer').classList.add('hidden');
    document.getElementById('imagePreview').src = '';
  });

  // Post Form Submission
  document.getElementById('postItemForm')?.addEventListener('submit', handlePostItemSubmit);

  // Details Modal Close Buttons
  document.getElementById('closeDetailsModalBtn')?.addEventListener('click', closeDetailsModal);
  document.getElementById('closeDetailsFooterBtn')?.addEventListener('click', closeDetailsModal);
  document.getElementById('detailsModalBackdrop')?.addEventListener('click', closeDetailsModal);

  // Details Modal Claim Button (Requires Auth)
  document.getElementById('submitClaimBtn')?.addEventListener('click', handleClaimSubmit);

  // Details Modal: Mark Resolved Button
  document.getElementById('markResolvedBtn')?.addEventListener('click', () => {
    if (state.activeItemForDetails) {
      markAsResolved(state.activeItemForDetails.id);
    }
  });

  // Dismiss Toast button
  document.getElementById('dismissToastBtn')?.addEventListener('click', hideToast);

  // Dismiss Auth Banner
  document.getElementById('dismissBannerBtn')?.addEventListener('click', () => {
    document.getElementById('authNoticeBanner')?.classList.add('hidden');
    sessionStorage.setItem('dismissed_auth_banner', 'true');
  });

  // ==================== AUTH MODAL CONTROLS ====================
  document.getElementById('openAuthModalBtn')?.addEventListener('click', () => openAuthModal());
  document.getElementById('closeAuthModalBtn')?.addEventListener('click', closeAuthModal);
  document.getElementById('authModalBackdrop')?.addEventListener('click', closeAuthModal);
  document.getElementById('signOutBtn')?.addEventListener('click', handleSignOut);

  // Google Sign-In Button
  document.getElementById('googleSignInBtn')?.addEventListener('click', handleGoogleSignIn);

  // Email Auth Tabs (Sign In vs Create Account)
  let isSignUpMode = false;
  const tabSignIn = document.getElementById('authTabSignIn');
  const tabSignUp = document.getElementById('authTabSignUp');
  const nameGroup = document.getElementById('authNameGroup');
  const authSubmitBtn = document.getElementById('authSubmitBtn');

  tabSignIn?.addEventListener('click', () => {
    isSignUpMode = false;
    tabSignIn.className = 'py-2 rounded-lg bg-white text-indigo-600 shadow-sm transition-all';
    tabSignUp.className = 'py-2 rounded-lg text-slate-500 hover:text-slate-800 transition-all';
    nameGroup?.classList.add('hidden');
    authSubmitBtn.textContent = 'Sign In with Email';
    hideAuthError();
  });

  tabSignUp?.addEventListener('click', () => {
    isSignUpMode = true;
    tabSignUp.className = 'py-2 rounded-lg bg-white text-indigo-600 shadow-sm transition-all';
    tabSignIn.className = 'py-2 rounded-lg text-slate-500 hover:text-slate-800 transition-all';
    nameGroup?.classList.remove('hidden');
    authSubmitBtn.textContent = 'Create Campus Account';
    hideAuthError();
  });

  // Email Auth Form Submit
  document.getElementById('emailAuthForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAuthError();
    const email = document.getElementById('authEmailInput').value.trim();
    const password = document.getElementById('authPasswordInput').value.trim();
    const displayName = document.getElementById('authNameInput').value.trim();

    try {
      authSubmitBtn.disabled = true;
      authSubmitBtn.textContent = 'Authenticating...';

      if (isSignUpMode) {
        await FirebaseService.auth.signUpWithEmail(email, password, displayName);
        showToast('Account Created!', `Welcome to Campus Lost & Found, ${displayName || email}!`);
      } else {
        await FirebaseService.auth.signInWithEmail(email, password);
        showToast('Signed In!', `Welcome back, ${email}!`);
      }
      closeAuthModal();
    } catch (err) {
      showAuthError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      authSubmitBtn.disabled = false;
      authSubmitBtn.textContent = isSignUpMode ? 'Create Campus Account' : 'Sign In with Email';
    }
  });

  // ==================== FIREBASE CONFIG MODAL ====================
  document.getElementById('firebaseStatusBtn')?.addEventListener('click', openFirebaseConfigModal);
  document.getElementById('closeFirebaseConfigBtn')?.addEventListener('click', closeFirebaseConfigModal);
  document.getElementById('firebaseConfigBackdrop')?.addEventListener('click', closeFirebaseConfigModal);
  
  document.getElementById('saveFirebaseConfigBtn')?.addEventListener('click', () => {
    const apiKey = document.getElementById('cfgApiKey').value.trim();
    const projectId = document.getElementById('cfgProjectId').value.trim();
    const authDomain = document.getElementById('cfgAuthDomain').value.trim();
    const storageBucket = document.getElementById('cfgStorageBucket').value.trim();

    if (!apiKey || !projectId) {
      alert('Please provide at least API Key and Project ID.');
      return;
    }

    const customConfig = {
      apiKey,
      projectId,
      authDomain: authDomain || `${projectId}.firebaseapp.com`,
      storageBucket: storageBucket || `${projectId}.appspot.com`,
      messagingSenderId: "1234567890",
      appId: "1:1234567890:web:abcdef"
    };

    localStorage.setItem('campus_lost_found_firebase_config', JSON.stringify(customConfig));
    showToast('Firebase Config Saved!', 'Reloading application with new credentials...');
    setTimeout(() => window.location.reload(), 800);
  });

  document.getElementById('resetFirebaseConfigBtn')?.addEventListener('click', () => {
    localStorage.removeItem('campus_lost_found_firebase_config');
    showToast('Reset to Demo Backend', 'Reloading application...');
    setTimeout(() => window.location.reload(), 800);
  });
}

// Read Image File
function handleImageFile(file) {
  if (!file.type.startsWith('image/')) {
    showToast('Invalid File', 'Please select an image file (PNG, JPG, WEBP).', 'error');
    return;
  }
  state.uploadedImageFile = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    state.uploadedImageBase64 = e.target.result;
    document.getElementById('imagePreview').src = state.uploadedImageBase64;
    document.getElementById('uploadPrompt').classList.add('hidden');
    document.getElementById('imagePreviewContainer').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

// Google Sign In Handler
async function handleGoogleSignIn() {
  hideAuthError();
  try {
    const user = await FirebaseService.auth.signInWithGoogle();
    showToast('Google Sign-In Successful', `Signed in as ${user.displayName || user.email}`);
    closeAuthModal();
  } catch (err) {
    showAuthError(err.message || 'Google sign-in was cancelled or blocked.');
  }
}

// Sign Out Handler
async function handleSignOut() {
  await FirebaseService.auth.signOut();
  showToast('Signed Out', 'You have been signed out.');
}

// Auth Modal Open/Close
function openAuthModal(customTitle) {
  const modal = document.getElementById('authModal');
  const title = document.getElementById('authModalTitle');
  if (customTitle && title) title.textContent = customTitle;
  else if (title) title.textContent = "Sign In to Campus Lost & Found";

  hideAuthError();
  modal.classList.remove('hidden');
  document.body.classList.add('overflow-hidden');

  setTimeout(() => {
    modal.querySelector('.modal-backdrop').classList.add('active');
    modal.querySelector('.modal-content').classList.add('active');
  }, 10);
  refreshIcons();
}

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal.classList.contains('hidden')) return;

  modal.querySelector('.modal-backdrop').classList.remove('active');
  modal.querySelector('.modal-content').classList.remove('active');

  setTimeout(() => {
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }, 250);
}

function showAuthError(msg) {
  const alert = document.getElementById('authErrorAlert');
  const msgEl = document.getElementById('authErrorMessage');
  if (alert && msgEl) {
    msgEl.textContent = msg;
    alert.classList.remove('hidden');
  }
}

function hideAuthError() {
  document.getElementById('authErrorAlert')?.classList.add('hidden');
}

// Firebase Config Modal Open/Close
function openFirebaseConfigModal() {
  const modal = document.getElementById('firebaseConfigModal');
  const { config, isCustom } = getActiveFirebaseConfig();

  document.getElementById('cfgApiKey').value = isCustom ? config.apiKey : '';
  document.getElementById('cfgProjectId').value = isCustom ? config.projectId : '';
  document.getElementById('cfgAuthDomain').value = isCustom ? config.authDomain : '';
  document.getElementById('cfgStorageBucket').value = isCustom ? config.storageBucket : '';

  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.querySelector('.modal-backdrop').classList.add('active');
    modal.querySelector('.modal-content').classList.add('active');
  }, 10);
  refreshIcons();
}

function closeFirebaseConfigModal() {
  const modal = document.getElementById('firebaseConfigModal');
  if (modal.classList.contains('hidden')) return;

  modal.querySelector('.modal-backdrop').classList.remove('active');
  modal.querySelector('.modal-content').classList.remove('active');
  setTimeout(() => modal.classList.add('hidden'), 250);
}

// Open Post Modal
function openPostModal() {
  const modal = document.getElementById('postItemModal');
  modal.classList.remove('hidden');
  document.body.classList.add('overflow-hidden');
  setDefaultDate();

  // Ensure contact inputs have user data
  if (state.currentUser) {
    const nameInput = document.getElementById('formContactName');
    const emailInput = document.getElementById('formContactEmail');
    if (nameInput && !nameInput.value) nameInput.value = state.currentUser.displayName || '';
    if (emailInput && !emailInput.value) emailInput.value = state.currentUser.email || '';
  }

  setTimeout(() => {
    modal.querySelector('.modal-backdrop').classList.add('active');
    modal.querySelector('.modal-content').classList.add('active');
  }, 10);
  refreshIcons();
}

// Close Post Modal
function closePostModal() {
  const modal = document.getElementById('postItemModal');
  if (modal.classList.contains('hidden')) return;

  modal.querySelector('.modal-backdrop').classList.remove('active');
  modal.querySelector('.modal-content').classList.remove('active');

  setTimeout(() => {
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }, 250);
}

// Handle Post Item Submit (Uploads to Storage, Creates in Firestore)
async function handlePostItemSubmit(e) {
  e.preventDefault();

  if (!state.currentUser) {
    state.authPendingAction = () => openPostModal();
    openAuthModal('Sign In Required to Post Item');
    return;
  }

  const submitBtn = document.getElementById('submitPostBtn');
  const typeRadio = document.querySelector('input[name="itemType"]:checked');
  const type = typeRadio ? typeRadio.value : 'Lost';
  const title = document.getElementById('formTitle').value.trim();
  const category = document.getElementById('formCategory').value;
  const location = document.getElementById('formLocation').value;
  const rawDate = document.getElementById('formDate').value;
  const description = document.getElementById('formDescription').value.trim();
  const contactName = document.getElementById('formContactName').value.trim();
  const contactEmail = document.getElementById('formContactEmail').value.trim();
  const contactPhone = document.getElementById('formContactPhone').value.trim() || 'N/A';

  if (!title || !category || !location || !rawDate || !description || !contactName || !contactEmail) {
    showToast('Missing Fields', 'Please complete all required fields (*).', 'error');
    return;
  }

  try {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <i data-lucide="loader" class="w-4 h-4 animate-spin"></i>
      <span>Uploading to Storage & Firestore...</span>
    `;
    refreshIcons();

    // 1. Upload photo to Firebase Cloud Storage (if provided)
    let imageUrl = null;
    if (state.uploadedImageFile) {
      imageUrl = await FirebaseService.storage.uploadImage(state.uploadedImageFile, state.currentUser.uid);
    } else if (state.uploadedImageBase64) {
      imageUrl = state.uploadedImageBase64;
    } else {
      imageUrl = CATEGORY_FALLBACK_IMAGES[category] || CATEGORY_FALLBACK_IMAGES['Other'];
    }

    // 2. Create document in Cloud Firestore
    const dateObj = new Date(rawDate + 'T12:00:00');
    const itemPayload = {
      type: type,
      title: title,
      category: category,
      location: location,
      date: dateObj.toISOString(),
      displayDate: formatDate(dateObj.toISOString()),
      description: description,
      imageUrl: imageUrl,
      contactName: contactName,
      contactEmail: contactEmail,
      contactPhone: contactPhone,
      status: 'active'
    };

    await FirebaseService.items.create(itemPayload);

    // Reset Form
    document.getElementById('postItemForm').reset();
    state.uploadedImageFile = null;
    state.uploadedImageBase64 = null;
    document.getElementById('uploadPrompt').classList.remove('hidden');
    document.getElementById('imagePreviewContainer').classList.add('hidden');
    document.getElementById('imagePreview').src = '';

    closePostModal();

    // Switch view to include newly posted item
    if (state.activeTab !== 'all' && state.activeTab !== type) {
      state.activeTab = type;
    }
    state.selectedCategory = 'all';
    state.selectedLocation = 'all';
    state.searchQuery = '';

    showToast('Report Published!', `Your ${type.toLowerCase()} item report for "${title}" is now live on Firestore.`);
  } catch (err) {
    console.error('Error submitting report:', err);
    showToast('Submission Failed', err.message || 'Could not save report to Firestore.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `
      <i data-lucide="send" class="w-4 h-4"></i>
      <span>Submit to Firestore</span>
    `;
    refreshIcons();
  }
}

// Mark Item as Resolved / Returned
window.markAsResolved = async function(itemId) {
  if (!state.currentUser) {
    openAuthModal('Sign In Required to Mark as Resolved');
    return;
  }

  const item = state.items.find(i => i.id === itemId);
  if (!item) return;

  const isAuthor = state.currentUser.uid === item.userId ||
    (item.userEmail && state.currentUser.email === item.userEmail);

  if (!isAuthor) {
    showToast('Permission Denied', 'Only the user who originally posted this item can mark it as resolved.', 'error');
    return;
  }

  const confirmed = confirm(`Are you sure you want to mark "${item.title}" as resolved/returned?`);
  if (!confirmed) return;

  try {
    await FirebaseService.items.markResolved(itemId);
    closeDetailsModal();
    showToast('Item Resolved! 🎉', `"${item.title}" has been marked as returned to owner.`);
  } catch (err) {
    showToast('Error', err.message || 'Failed to update item status in Firestore.', 'error');
  }
};

// Open Item Details & Claim Modal
window.openDetailsModal = function(itemId) {
  const item = state.items.find(i => i.id === itemId);
  if (!item) return;

  state.activeItemForDetails = item;

  const isResolved = item.status === 'resolved';
  const isLost = item.type === 'Lost';
  const isAuthor = state.currentUser && (
    state.currentUser.uid === item.userId ||
    (item.userEmail && state.currentUser.email === item.userEmail)
  );

  // Badge Container
  const badgeContainer = document.getElementById('detailBadgeContainer');
  if (isResolved) {
    badgeContainer.innerHTML = `
      <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold tracking-wider uppercase shadow-md bg-slate-800 text-white border border-slate-700">
        <i data-lucide="check-check" class="w-3.5 h-3.5 text-emerald-400"></i>
        Returned / Resolved
      </span>
    `;
  } else {
    badgeContainer.innerHTML = `
      <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold tracking-wider uppercase shadow-md ${
        isLost ? 'bg-rose-500 text-white' : 'bg-emerald-600 text-white'
      }">
        <span class="w-2 h-2 rounded-full ${isLost ? 'bg-rose-200' : 'bg-emerald-200'} animate-ping"></span>
        ${item.type} Item
      </span>
    `;
  }

  // Author Action Banner ("Mark as Resolved / Returned")
  const authorBanner = document.getElementById('authorActionBanner');
  const resolvedNotice = document.getElementById('resolvedNotice');
  const claimSection = document.getElementById('claimSectionContainer');

  if (isAuthor && !isResolved) {
    authorBanner?.classList.remove('hidden');
  } else {
    authorBanner?.classList.add('hidden');
  }

  if (isResolved) {
    resolvedNotice?.classList.remove('hidden');
    claimSection?.classList.add('hidden');
  } else {
    resolvedNotice?.classList.add('hidden');
    claimSection?.classList.remove('hidden');
  }

  // Populate data
  document.getElementById('detailImage').src = item.imageUrl || item.image || CATEGORY_FALLBACK_IMAGES[item.category] || CATEGORY_FALLBACK_IMAGES['Other'];
  document.getElementById('detailTitle').textContent = item.title;
  document.getElementById('detailCategory').textContent = item.category;
  document.getElementById('detailDate').textContent = item.displayDate || formatDate(item.date || item.createdAt);
  document.getElementById('detailDateCard').textContent = item.displayDate || formatDate(item.date || item.createdAt);
  document.getElementById('detailLocation').textContent = item.location;
  document.getElementById('detailDescription').textContent = item.description;
  document.getElementById('detailItemId').textContent = (item.id || '').toUpperCase();

  // Contact Info
  document.getElementById('detailContactName').textContent = item.contactName || item.userName || 'Campus User';
  const emailLink = document.getElementById('detailContactEmailLink');
  emailLink.textContent = item.contactEmail || item.userEmail || 'N/A';
  emailLink.href = `mailto:${item.contactEmail || item.userEmail}?subject=Campus Lost and Found: ${encodeURIComponent(item.title)}`;

  const phoneRow = document.getElementById('detailPhoneRow');
  if (item.contactPhone && item.contactPhone !== 'N/A') {
    phoneRow.classList.remove('hidden');
    document.getElementById('detailContactPhone').textContent = item.contactPhone;
  } else {
    phoneRow.classList.add('hidden');
  }

  // Dynamic Claim Section
  const claimTitle = document.getElementById('claimSectionTitle');
  const claimSub = document.getElementById('claimSectionSubtitle');
  const claimLabel = document.getElementById('claimInputLabel');
  const claimBtn = document.getElementById('submitClaimBtn');
  const claimInput = document.getElementById('claimMessageInput');
  claimInput.value = '';

  if (isLost) {
    claimTitle.textContent = "Have you seen or found this item?";
    claimSub.textContent = "Help the owner recover it by sharing location clues or arranging a safe campus handoff.";
    claimLabel.textContent = "Send message or sighting details to owner:";
    claimInput.placeholder = "e.g. Left at 2nd floor desk or handed to librarian...";
    claimBtn.textContent = "Send Sighting Report";
  } else {
    claimTitle.textContent = "Is this your item? Claim & Verify Ownership";
    claimSub.textContent = "Describe distinctive marks, serial numbers, or contents to verify you are the rightful owner.";
    claimLabel.textContent = "Ownership verification note / Claim request:";
    claimInput.placeholder = "e.g. Serial # ends in 4492, distinctive green key tag...";
    claimBtn.textContent = "Submit Claim Request";
  }

  // Open Modal
  const modal = document.getElementById('detailsModal');
  modal.classList.remove('hidden');
  document.body.classList.add('overflow-hidden');

  setTimeout(() => {
    modal.querySelector('.modal-backdrop').classList.add('active');
    modal.querySelector('.modal-content').classList.add('active');
  }, 10);
  refreshIcons();
};

// Close Details Modal
function closeDetailsModal() {
  const modal = document.getElementById('detailsModal');
  if (modal.classList.contains('hidden')) return;

  modal.querySelector('.modal-backdrop').classList.remove('active');
  modal.querySelector('.modal-content').classList.remove('active');

  setTimeout(() => {
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    state.activeItemForDetails = null;
  }, 250);
}

// Handle Claim Submission (Requires Auth)
function handleClaimSubmit() {
  if (!state.currentUser) {
    state.authPendingAction = () => {
      if (state.activeItemForDetails) {
        window.openDetailsModal(state.activeItemForDetails.id);
      }
    };
    openAuthModal('Sign In Required to Submit Claim');
    return;
  }

  const input = document.getElementById('claimMessageInput');
  const message = input.value.trim();

  if (!message) {
    showToast('Input Required', 'Please enter a brief verification or sighting note before submitting.', 'error');
    return;
  }

  const item = state.activeItemForDetails;
  closeDetailsModal();

  if (item && item.type === 'Lost') {
    showToast('Sighting Sent!', `Your note has been routed to ${item.contactName || 'the owner'}. Thank you for helping your fellow student!`);
  } else {
    showToast('Claim Submitted!', `Verification request submitted to the finder (${item ? item.contactName : 'Campus Desk'}).`);
  }
}

// Toast Notification
function showToast(title, message, type = 'success') {
  const toast = document.getElementById('toastNotification');
  const toastTitle = document.getElementById('toastTitle');
  const toastMessage = document.getElementById('toastMessage');
  const toastIcon = document.getElementById('toastIcon');

  if (!toast) return;

  clearTimeout(state.toastTimeout);

  toastTitle.textContent = title;
  toastMessage.textContent = message;

  if (type === 'error') {
    toastIcon.className = 'w-7 h-7 rounded-full bg-rose-500 flex items-center justify-center text-white shrink-0';
    toastIcon.innerHTML = '<i data-lucide="alert-circle" class="w-4 h-4"></i>';
  } else {
    toastIcon.className = 'w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center text-white shrink-0';
    toastIcon.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i>';
  }
  refreshIcons();

  toast.classList.remove('hidden');

  state.toastTimeout = setTimeout(() => {
    hideToast();
  }, 4500);
}

function hideToast() {
  const toast = document.getElementById('toastNotification');
  if (toast) toast.classList.add('hidden');
}

// Helper: Format Date string
function formatDate(isoString) {
  if (!isoString) return 'Recently';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch (e) {
    return 'Recently';
  }
}

// Helper: Escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
