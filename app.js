/**
 * Community Z - WhatsApp-like Chat Application
 * 
 * SETUP INSTRUCTIONS:
 * 1. Enable Email/Password authentication in Firebase Console
 * 2. Enable Realtime Database in test mode or add the provided security rules
 * 3. Replace firebaseConfig with your Firebase project configuration
 * 4. Test with two browser windows using different accounts
 * 
 * FEATURES:
 * - User authentication (signup/login)
 * - Real-time messaging
 * - Friend requests and management
 * - Block/unblock functionality
 * - Audio/video calling with WebRTC
 * - Online presence tracking
 * - Responsive design
 * 
 * LIMITATIONS:
 * - WebRTC requires TURN server for production use
 * - Database rules should be hardened for production security
 * - File sharing not implemented (can be added)
 * - Push notifications not implemented (requires service worker)
 */

// ===== FIREBASE CONFIGURATION =====
const firebaseConfig = {
    apiKey: "AIzaSyCPg4Yqiw9YBLkG03nyNtW873CaU3SxHhc",
    authDomain: "self-2ff34.firebaseapp.com",
    databaseURL: "https://self-2ff34-default-rtdb.firebaseio.com",
    projectId: "self-2ff34",
    storageBucket: "self-2ff34.firebasestorage.app",
    messagingSenderId: "419819673860",
    appId: "1:419819673860:web:7b3d080e9a3f24131cd851",
    measurementId: "G-CQDZLDZRWT"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();

// ===== GLOBAL VARIABLES =====
let currentUser = null;
let currentChatUser = null;
let currentCall = null;
let localStream = null;
let remoteStream = null;
let peerConnection = null;
let callTimer = null;
let callStartTime = null;
let typingTimeout = null;
let onlineUsersRef = null;
let messagesRef = null;
let friendRequestsRef = null;

// WebRTC Configuration
const rtcConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// ===== UTILITY FUNCTIONS =====

/**
 * Generate a deterministic conversation ID from two user IDs
 */
function generateConversationId(uid1, uid2) {
    return [uid1, uid2].sort().join('_');
}

/**
 * Generate a random avatar URL
 */
function generateAvatarUrl(username) {
    const colors = ['FF6B6B', '4ECDC4', '45B7D1', '96CEB4', 'FFEAA7', 'DDA0DD', 'FFB347'];
    const color = colors[Math.abs(hashCode(username)) % colors.length];
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=${color}&color=fff&size=200&bold=true`;
}

/**
 * Simple hash function for consistent avatar colors
 */
function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
}

/**
 * Format timestamp for display
 */
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 168) { // 7 days
        return date.toLocaleDateString([], { weekday: 'short' });
    } else {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
}

/**
 * Format call duration
 */
function formatCallDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
}

/**
 * Show notification
 */
function showNotification(title, message, type = 'info') {
    const container = document.getElementById('notification-container');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    notification.innerHTML = `
        <div class="notification-header">
            <span class="notification-title">${title}</span>
            <button class="notification-close" onclick="this.parentElement.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="notification-message">${message}</div>
    `;
    
    container.appendChild(notification);
    
    // Show notification
    setTimeout(() => notification.classList.add('show'), 100);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

/**
 * Show toast message
 */
function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    
    container.appendChild(toast);
    
    // Show toast
    setTimeout(() => toast.classList.add('show'), 100);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Show/hide loading screen
 */
function toggleLoadingScreen(show = true) {
    const loadingScreen = document.getElementById('loading-screen');
    const app = document.getElementById('app');
    
    if (show) {
        loadingScreen.style.opacity = '1';
        loadingScreen.style.visibility = 'visible';
        app.classList.add('hidden');
    } else {
        loadingScreen.style.opacity = '0';
        loadingScreen.style.visibility = 'hidden';
        app.classList.remove('hidden');
    }
}

/**
 * Switch between pages
 */
function showPage(pageId) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // Show target page
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.add('active');
    }
}

/**
 * Show/hide modal
 */
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// ===== AUTHENTICATION FUNCTIONS =====

/**
 * Toggle password visibility
 */
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const button = input.nextElementSibling.nextElementSibling;
    const icon = button.querySelector('i');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fas fa-eye';
    }
}

/**
 * Show signup form
 */
function showSignupForm() {
    document.getElementById('login-form').classList.remove('active');
    document.getElementById('signup-form').classList.add('active');
}

/**
 * Show login form
 */
function showLoginForm() {
    document.getElementById('signup-form').classList.remove('active');
    document.getElementById('login-form').classList.add('active');
}

/**
 * Check password strength
 */
function checkPasswordStrength(password) {
    let strength = 0;
    let strengthText = 'Weak';
    let strengthClass = 'weak';
    
    if (password.length >= 8) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    
    switch (strength) {
        case 0:
        case 1:
            strengthText = 'Very Weak';
            strengthClass = 'weak';
            break;
        case 2:
            strengthText = 'Weak';
            strengthClass = 'weak';
            break;
        case 3:
            strengthText = 'Fair';
            strengthClass = 'fair';
            break;
        case 4:
            strengthText = 'Good';
            strengthClass = 'good';
            break;
        case 5:
            strengthText = 'Strong';
            strengthClass = 'strong';
            break;
    }
    
    return { strength, strengthText, strengthClass };
}

/**
 * Handle user signup
 */
async function handleSignup(event) {
    event.preventDefault();
    
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const confirmPassword = document.getElementById('signup-confirm-password').value;
    const username = document.getElementById('signup-username').value.trim();
    const agreeTerms = document.getElementById('agree-terms').checked;
    
    // Validation
    if (!email || !password || !username) {
        showToast('Please fill in all fields');
        return;
    }
    
    if (password !== confirmPassword) {
        showToast('Passwords do not match');
        return;
    }
    
    if (password.length < 6) {
        showToast('Password must be at least 6 characters');
        return;
    }
    
    if (!agreeTerms) {
        showToast('Please agree to the terms and conditions');
        return;
    }
    
    // Check if username is available
    try {
        const usernameSnapshot = await database.ref('usernames').child(username.toLowerCase()).once('value');
        if (usernameSnapshot.exists()) {
            showToast('Username is already taken');
            return;
        }
    } catch (error) {
        console.error('Error checking username:', error);
        showToast('Error checking username availability');
        return;
    }
    
    // Show loading
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoader = submitBtn.querySelector('.btn-loader');
    
    btnText.classList.add('hidden');
    btnLoader.classList.remove('hidden');
    submitBtn.disabled = true;
    
    try {
        // Create user account
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Save user data to database
        const userData = {
            uid: user.uid,
            email: email,
            username: username,
            displayName: username,
            avatarUrl: generateAvatarUrl(username),
            online: true,
            lastSeen: firebase.database.ServerValue.TIMESTAMP,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            blockedUsers: {},
            settings: {
                notifications: true,
                onlineStatus: true,
                readReceipts: true
            }
        };
        
        // Save to users and usernames collections
        await Promise.all([
            database.ref('users').child(user.uid).set(userData),
            database.ref('usernames').child(username.toLowerCase()).set(user.uid)
        ]);
        
        showToast('Account created successfully!');
        
    } catch (error) {
        console.error('Signup error:', error);
        let errorMessage = 'Failed to create account';
        
        switch (error.code) {
            case 'auth/email-already-in-use':
                errorMessage = 'Email is already registered';
                break;
            case 'auth/invalid-email':
                errorMessage = 'Invalid email address';
                break;
            case 'auth/weak-password':
                errorMessage = 'Password is too weak';
                break;
            default:
                errorMessage = error.message;
        }
        
        showToast(errorMessage);
    } finally {
        // Hide loading
        btnText.classList.remove('hidden');
        btnLoader.classList.add('hidden');
        submitBtn.disabled = false;
    }
}

/**
 * Handle user login
 */
async function handleLogin(event) {
    event.preventDefault();
    
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    
    if (!email || !password) {
        showToast('Please fill in all fields');
        return;
    }
    
    // Show loading
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoader = submitBtn.querySelector('.btn-loader');
    
    btnText.classList.add('hidden');
    btnLoader.classList.remove('hidden');
    submitBtn.disabled = true;
    
    try {
        await auth.signInWithEmailAndPassword(email, password);
        showToast('Welcome back!');
    } catch (error) {
        console.error('Login error:', error);
        let errorMessage = 'Failed to sign in';
        
        switch (error.code) {
            case 'auth/user-not-found':
                errorMessage = 'No account found with this email';
                break;
            case 'auth/wrong-password':
                errorMessage = 'Incorrect password';
                break;
            case 'auth/invalid-email':
                errorMessage = 'Invalid email address';
                break;
            case 'auth/too-many-requests':
                errorMessage = 'Too many failed attempts. Please try again later';
                break;
            default:
                errorMessage = error.message;
        }
        
        showToast(errorMessage);
    } finally {
        // Hide loading
        btnText.classList.remove('hidden');
        btnLoader.classList.add('hidden');
        submitBtn.disabled = false;
    }
}

/**
 * Handle user logout
 */
async function logout() {
    try {
        if (currentUser) {
            // Set user offline
            await database.ref('users').child(currentUser.uid).update({
                online: false,
                lastSeen: firebase.database.ServerValue.TIMESTAMP
            });
        }
        
        // Clean up WebRTC
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        
        // Clean up listeners
        if (onlineUsersRef) onlineUsersRef.off();
        if (messagesRef) messagesRef.off();
        if (friendRequestsRef) friendRequestsRef.off();
        
        await auth.signOut();
        showToast('Signed out successfully');
    } catch (error) {
        console.error('Logout error:', error);
        showToast('Error signing out');
    }
}

// ===== FRIENDS MANAGEMENT =====

/**
 * Switch sidebar tabs
 */
function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    // Load content based on tab
    switch (tabName) {
        case 'chats':
            loadFriendsList();
            break;
        case 'requests':
            loadFriendRequests();
            break;
        case 'blocked':
            loadBlockedUsers();
            break;
    }
}

/**
 * Load friends list
 */
async function loadFriendsList() {
    if (!currentUser) return;
    
    const friendsList = document.getElementById('friends-list');
    
    try {
        const userSnapshot = await database.ref('users').child(currentUser.uid).once('value');
        const userData = userSnapshot.val();
        
        if (!userData || !userData.friends) {
            friendsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-comments"></i>
                    <h3>No conversations yet</h3>
                    <p>Start a conversation by adding friends</p>
                    <button class="btn btn-primary" onclick="showAddFriendModal()">
                        Add Friends
                    </button>
                </div>
            `;
            return;
        }
        
        const friends = userData.friends;
        const friendsArray = [];
        
        // Get friend details
        for (const friendId of Object.keys(friends)) {
            const friendSnapshot = await database.ref('users').child(friendId).once('value');
            const friendData = friendSnapshot.val();
            
            if (friendData) {
                // Get last message
                const conversationId = generateConversationId(currentUser.uid, friendId);
                const lastMessageSnapshot = await database.ref('conversations')
                    .child(conversationId)
                    .child('messages')
                    .orderByKey()
                    .limitToLast(1)
                    .once('value');
                
                let lastMessage = null;
                if (lastMessageSnapshot.exists()) {
                    const messages = lastMessageSnapshot.val();
                    const messageKey = Object.keys(messages)[0];
                    lastMessage = messages[messageKey];
                }
                
                friendsArray.push({
                    ...friendData,
                    lastMessage,
                    friendshipTimestamp: friends[friendId]
                });
            }
        }
        
        // Sort by last message timestamp
        friendsArray.sort((a, b) => {
            const aTime = a.lastMessage ? a.lastMessage.timestamp : a.friendshipTimestamp;
            const bTime = b.lastMessage ? b.lastMessage.timestamp : b.friendshipTimestamp;
            return bTime - aTime;
        });
        
        // Render friends list
        friendsList.innerHTML = friendsArray.map(friend => `
            <div class="friend-item" onclick="openChat('${friend.uid}')">
                <div class="friend-avatar">
                    <img src="${friend.avatarUrl}" alt="${friend.displayName}">
                    ${friend.online ? '<div class="online-indicator"></div>' : ''}
                </div>
                <div class="friend-info">
                    <div class="friend-name">${friend.displayName}</div>
                    <div class="friend-last-message">
                        ${friend.lastMessage ? 
                            (friend.lastMessage.senderId === currentUser.uid ? 'You: ' : '') + 
                            friend.lastMessage.content.substring(0, 30) + 
                            (friend.lastMessage.content.length > 30 ? '...' : '')
                            : 'No messages yet'
                        }
                    </div>
                </div>
                <div class="friend-meta">
                    <div class="friend-time">
                        ${friend.lastMessage ? formatTime(friend.lastMessage.timestamp) : ''}
                    </div>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading friends list:', error);
        friendsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error loading friends</h3>
                <p>Please try again later</p>
            </div>
        `;
    }
}

/**
 * Load friend requests
 */
async function loadFriendRequests() {
    if (!currentUser) return;
    
    const requestsList = document.getElementById('requests-list');
    
    try {
        const requestsSnapshot = await database.ref('friendRequests')
            .orderByChild('receiverId')
            .equalTo(currentUser.uid)
            .once('value');
        
        if (!requestsSnapshot.exists()) {
            requestsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-clock"></i>
                    <h3>No pending requests</h3>
                    <p>Friend requests will appear here</p>
                </div>
            `;
            return;
        }
        
        const requests = requestsSnapshot.val();
        const requestsArray = [];
        
        // Get sender details for each request
        for (const [requestId, request] of Object.entries(requests)) {
            if (request.status === 'pending') {
                const senderSnapshot = await database.ref('users').child(request.senderId).once('value');
                const senderData = senderSnapshot.val();
                
                if (senderData) {
                    requestsArray.push({
                        requestId,
                        ...request,
                        senderData
                    });
                }
            }
        }
        
        // Sort by timestamp
        requestsArray.sort((a, b) => b.timestamp - a.timestamp);
        
        // Render requests list
        requestsList.innerHTML = requestsArray.map(request => `
            <div class="request-item">
                <div class="friend-avatar">
                    <img src="${request.senderData.avatarUrl}" alt="${request.senderData.displayName}">
                </div>
                <div class="friend-info">
                    <div class="friend-name">${request.senderData.displayName}</div>
                    <div class="friend-last-message">@${request.senderData.username}</div>
                </div>
                <div class="friend-meta">
                    <button class="btn btn-primary" onclick="acceptFriendRequest('${request.requestId}', '${request.senderId}')">
                        Accept
                    </button>
                    <button class="btn btn-secondary" onclick="declineFriendRequest('${request.requestId}')">
                        Decline
                    </button>
                </div>
            </div>
        `).join('');
        
        // Update badge
        const badge = document.getElementById('requests-badge');
        if (requestsArray.length > 0) {
            badge.textContent = requestsArray.length;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
        
    } catch (error) {
        console.error('Error loading friend requests:', error);
        requestsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error loading requests</h3>
                <p>Please try again later</p>
            </div>
        `;
    }
}

/**
 * Load blocked users
 */
async function loadBlockedUsers() {
    if (!currentUser) return;
    
    const blockedList = document.getElementById('blocked-list');
    
    try {
        const userSnapshot = await database.ref('users').child(currentUser.uid).once('value');
        const userData = userSnapshot.val();
        
        if (!userData || !userData.blockedUsers) {
            blockedList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-slash"></i>
                    <h3>No blocked users</h3>
                    <p>Blocked users will appear here</p>
                </div>
            `;
            return;
        }
        
        const blockedUsers = userData.blockedUsers;
        const blockedArray = [];
        
        // Get blocked user details
        for (const blockedId of Object.keys(blockedUsers)) {
            const blockedSnapshot = await database.ref('users').child(blockedId).once('value');
            const blockedData = blockedSnapshot.val();
            
            if (blockedData) {
                blockedArray.push({
                    ...blockedData,
                    blockedTimestamp: blockedUsers[blockedId]
                });
            }
        }
        
        // Sort by blocked timestamp
        blockedArray.sort((a, b) => b.blockedTimestamp - a.blockedTimestamp);
        
        // Render blocked list
        blockedList.innerHTML = blockedArray.map(blocked => `
            <div class="blocked-item">
                <div class="friend-avatar">
                    <img src="${blocked.avatarUrl}" alt="${blocked.displayName}">
                </div>
                <div class="friend-info">
                    <div class="friend-name">${blocked.displayName}</div>
                    <div class="friend-last-message">@${blocked.username}</div>
                </div>
                <div class="friend-meta">
                    <button class="btn btn-primary" onclick="unblockUser('${blocked.uid}')">
                        Unblock
                    </button>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading blocked users:', error);
        blockedList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error loading blocked users</h3>
                <p>Please try again later</p>
            </div>
        `;
    }
}

/**
 * Show add friend modal
 */
function showAddFriendModal() {
    showModal('add-friend-modal');
    document.getElementById('search-friend-input').focus();
}

/**
 * Search for friends
 */
async function searchFriend() {
    const searchInput = document.getElementById('search-friend-input');
    const searchResults = document.getElementById('search-results');
    const query = searchInput.value.trim().toLowerCase();
    
    if (!query) {
        showToast('Please enter an email or username');
        return;
    }
    
    searchResults.innerHTML = '<div class="text-center">Searching...</div>';
    
    try {
        let userSnapshot = null;
        
        // Search by email first
        if (query.includes('@')) {
            const usersSnapshot = await database.ref('users')
                .orderByChild('email')
                .equalTo(query)
                .once('value');
            
            if (usersSnapshot.exists()) {
                const users = usersSnapshot.val();
                const userId = Object.keys(users)[0];
                userSnapshot = { key: userId, val: () => users[userId] };
            }
        } else {
            // Search by username
            const usernameSnapshot = await database.ref('usernames')
                .child(query)
                .once('value');
            
            if (usernameSnapshot.exists()) {
                const userId = usernameSnapshot.val();
                const userDataSnapshot = await database.ref('users').child(userId).once('value');
                userSnapshot = userDataSnapshot;
            }
        }
        
        if (!userSnapshot || !userSnapshot.exists()) {
            searchResults.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-slash"></i>
                    <h3>User not found</h3>
                    <p>No user found with that email or username</p>
                </div>
            `;
            return;
        }
        
        const userData = userSnapshot.val();
        const userId = userSnapshot.key;
        
        // Check if it's the current user
        if (userId === currentUser.uid) {
            searchResults.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user"></i>
                    <h3>That's you!</h3>
                    <p>You cannot add yourself as a friend</p>
                </div>
            `;
            return;
        }
        
        // Check if already friends
        const currentUserSnapshot = await database.ref('users').child(currentUser.uid).once('value');
        const currentUserData = currentUserSnapshot.val();
        
        if (currentUserData.friends && currentUserData.friends[userId]) {
            searchResults.innerHTML = `
                <div class="search-result-item">
                    <img src="${userData.avatarUrl}" alt="${userData.displayName}" class="search-result-avatar">
                    <div class="search-result-info">
                        <div class="search-result-name">${userData.displayName}</div>
                        <div class="search-result-email">@${userData.username}</div>
                    </div>
                    <button class="btn btn-secondary" disabled>
                        Already Friends
                    </button>
                </div>
            `;
            return;
        }
        
        // Check if blocked
        if (currentUserData.blockedUsers && currentUserData.blockedUsers[userId]) {
            searchResults.innerHTML = `
                <div class="search-result-item">
                    <img src="${userData.avatarUrl}" alt="${userData.displayName}" class="search-result-avatar">
                    <div class="search-result-info">
                        <div class="search-result-name">${userData.displayName}</div>
                        <div class="search-result-email">@${userData.username}</div>
                    </div>
                    <button class="btn btn-secondary" disabled>
                        Blocked
                    </button>
                </div>
            `;
            return;
        }
        
        // Check if request already sent
        const existingRequestSnapshot = await database.ref('friendRequests')
            .orderByChild('senderId')
            .equalTo(currentUser.uid)
            .once('value');
        
        let requestExists = false;
        if (existingRequestSnapshot.exists()) {
            const requests = existingRequestSnapshot.val();
            for (const request of Object.values(requests)) {
                if (request.receiverId === userId && request.status === 'pending') {
                    requestExists = true;
                    break;
                }
            }
        }
        
        // Render search result
        searchResults.innerHTML = `
            <div class="search-result-item">
                <img src="${userData.avatarUrl}" alt="${userData.displayName}" class="search-result-avatar">
                <div class="search-result-info">
                    <div class="search-result-name">${userData.displayName}</div>
                    <div class="search-result-email">@${userData.username}</div>
                </div>
                <button class="btn ${requestExists ? 'btn-secondary' : 'btn-primary'}" 
                        ${requestExists ? 'disabled' : `onclick="sendFriendRequest('${userId}')"`}>
                    ${requestExists ? 'Request Sent' : 'Send Request'}
                </button>
            </div>
        `;
        
    } catch (error) {
        console.error('Error searching for user:', error);
        searchResults.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Search Error</h3>
                <p>Please try again later</p>
            </div>
        `;
    }
}

/**
 * Send friend request
 */
async function sendFriendRequest(receiverId) {
    try {
        const requestData = {
            senderId: currentUser.uid,
            receiverId: receiverId,
            status: 'pending',
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };
        
        await database.ref('friendRequests').push(requestData);
        
        showToast('Friend request sent!');
        
        // Update the button
        const button = event.target;
        button.textContent = 'Request Sent';
        button.classList.remove('btn-primary');
        button.classList.add('btn-secondary');
        button.disabled = true;
        
    } catch (error) {
        console.error('Error sending friend request:', error);
        showToast('Failed to send friend request');
    }
}

/**
 * Accept friend request
 */
async function acceptFriendRequest(requestId, senderId) {
    try {
        // Update request status
        await database.ref('friendRequests').child(requestId).update({
            status: 'accepted',
            acceptedAt: firebase.database.ServerValue.TIMESTAMP
        });
        
        // Add to both users' friends lists
        const timestamp = firebase.database.ServerValue.TIMESTAMP;
        await Promise.all([
            database.ref('users').child(currentUser.uid).child('friends').child(senderId).set(timestamp),
            database.ref('users').child(senderId).child('friends').child(currentUser.uid).set(timestamp)
        ]);
        
        showToast('Friend request accepted!');
        loadFriendRequests();
        loadFriendsList();
        
    } catch (error) {
        console.error('Error accepting friend request:', error);
        showToast('Failed to accept friend request');
    }
}

/**
 * Decline friend request
 */
async function declineFriendRequest(requestId) {
    try {
        await database.ref('friendRequests').child(requestId).update({
            status: 'declined',
            declinedAt: firebase.database.ServerValue.TIMESTAMP
        });
        
        showToast('Friend request declined');
        loadFriendRequests();
        
    } catch (error) {
        console.error('Error declining friend request:', error);
        showToast('Failed to decline friend request');
    }
}

/**
 * Block user
 */
async function blockUser(userId) {
    try {
        const timestamp = firebase.database.ServerValue.TIMESTAMP;
        
        // Add to blocked users list
        await database.ref('users').child(currentUser.uid).child('blockedUsers').child(userId).set(timestamp);
        
        // Remove from friends list if exists
        await Promise.all([
            database.ref('users').child(currentUser.uid).child('friends').child(userId).remove(),
            database.ref('users').child(userId).child('friends').child(currentUser.uid).remove()
        ]);
        
        showToast('User blocked');
        loadFriendsList();
        loadBlockedUsers();
        
        // Close chat if currently open
        if (currentChatUser && currentChatUser.uid === userId) {
            goToFriends();
        }
        
    } catch (error) {
        console.error('Error blocking user:', error);
        showToast('Failed to block user');
    }
}

/**
 * Unblock user
 */
async function unblockUser(userId) {
    try {
        await database.ref('users').child(currentUser.uid).child('blockedUsers').child(userId).remove();
        
        showToast('User unblocked');
        loadBlockedUsers();
        
    } catch (error) {
        console.error('Error unblocking user:', error);
        showToast('Failed to unblock user');
    }
}

// ===== CHAT FUNCTIONS =====

/**
 * Open chat with a friend
 */
async function openChat(friendId) {
    try {
        // Get friend data
        const friendSnapshot = await database.ref('users').child(friendId).once('value');
        const friendData = friendSnapshot.val();
        
        if (!friendData) {
            showToast('User not found');
            return;
        }
        
        currentChatUser = friendData;
        
        // Update UI
        document.getElementById('chat-user-name').textContent = friendData.displayName;
        document.getElementById('chat-user-avatar').src = friendData.avatarUrl;
        document.getElementById('chat-user-last-seen').textContent = friendData.online ? 'Online' : `Last seen ${formatTime(friendData.lastSeen)}`;
        
        const statusIndicator = document.getElementById('chat-user-status');
        if (friendData.online) {
            statusIndicator.classList.add('online-indicator');
        } else {
            statusIndicator.classList.remove('online-indicator');
        }
        
        // Show chat page
        showPage('chat-page');
        
        // Load messages
        loadMessages(friendId);
        
        // Set up real-time message listener
        setupMessageListener(friendId);
        
        // Mark messages as read
        markMessagesAsRead(friendId);
        
    } catch (error) {
        console.error('Error opening chat:', error);
        showToast('Failed to open chat');
    }
}

/**
 * Go back to friends list
 */
function goToFriends() {
    showPage('friends-page');
    currentChatUser = null;
    
    // Clean up message listener
    if (messagesRef) {
        messagesRef.off();
        messagesRef = null;
    }
    
    // Clear typing timeout
    if (typingTimeout) {
        clearTimeout(typingTimeout);
        typingTimeout = null;
    }
}

/**
 * Load messages for a conversation
 */
async function loadMessages(friendId) {
    const messagesContainer = document.querySelector('.messages-container');
    const conversationId = generateConversationId(currentUser.uid, friendId);
    
    try {
        const messagesSnapshot = await database.ref('conversations')
            .child(conversationId)
            .child('messages')
            .orderByKey()
            .limitToLast(50)
            .once('value');
        
        if (!messagesSnapshot.exists()) {
            messagesContainer.innerHTML = `
                <div class="chat-date-separator">
                    <span>Start of conversation</span>
                </div>
            `;
            return;
        }
        
        const messages = messagesSnapshot.val();
        const messagesArray = Object.entries(messages).map(([id, message]) => ({
            id,
            ...message
        }));
        
        // Group messages by date
        const messagesByDate = {};
        messagesArray.forEach(message => {
            const date = new Date(message.timestamp).toDateString();
            if (!messagesByDate[date]) {
                messagesByDate[date] = [];
            }
            messagesByDate[date].push(message);
        });
        
        // Render messages
        let html = '';
        Object.entries(messagesByDate).forEach(([date, dayMessages]) => {
            const dateObj = new Date(date);
            const today = new Date().toDateString();
            const yesterday = new Date(Date.now() - 86400000).toDateString();
            
            let dateLabel = date;
            if (date === today) {
                dateLabel = 'Today';
            } else if (date === yesterday) {
                dateLabel = 'Yesterday';
            } else {
                dateLabel = dateObj.toLocaleDateString([], { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                });
            }
            
            html += `
                <div class="chat-date-separator">
                    <span>${dateLabel}</span>
                </div>
            `;
            
            dayMessages.forEach(message => {
                const isSent = message.senderId === currentUser.uid;
                const messageClass = isSent ? 'sent' : 'received';
                
                html += `
                    <div class="message ${messageClass}">
                        <div class="message-bubble">
                            <div class="message-content">${escapeHtml(message.content)}</div>
                            <div class="message-meta">
                                <span class="message-time">${formatTime(message.timestamp)}</span>
                                ${isSent ? `<span class="message-status ${message.read ? 'read' : 'delivered'}">
                                    <i class="fas fa-check${message.read ? '-double' : ''}"></i>
                                </span>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            });
        });
        
        messagesContainer.innerHTML = html;
        
        // Scroll to bottom
        const chatMessages = document.getElementById('chat-messages');
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
    } catch (error) {
        console.error('Error loading messages:', error);
        messagesContainer.innerHTML = `
            <div class="chat-date-separator">
                <span>Error loading messages</span>
            </div>
        `;
    }
}

/**
 * Setup real-time message listener
 */
function setupMessageListener(friendId) {
    const conversationId = generateConversationId(currentUser.uid, friendId);
    
    // Clean up existing listener
    if (messagesRef) {
        messagesRef.off();
    }
    
    // Set up new listener
    messagesRef = database.ref('conversations')
        .child(conversationId)
        .child('messages')
        .orderByKey()
        .limitToLast(1);
    
    messagesRef.on('child_added', (snapshot) => {
        const message = snapshot.val();
        const messageId = snapshot.key;
        
        // Skip if this is an old message (from initial load)
        if (Date.now() - message.timestamp > 5000) return;
        
        // Add message to UI
        addMessageToUI(message, messageId);
        
        // Mark as read if not sent by current user
        if (message.senderId !== currentUser.uid) {
            markMessageAsRead(conversationId, messageId);
        }
        
        // Show notification if page is not visible
        if (document.hidden && message.senderId !== currentUser.uid) {
            showNotification(
                currentChatUser.displayName,
                message.content,
                'info'
            );
        }
    });
}

/**
 * Add message to UI
 */
function addMessageToUI(message, messageId) {
    const messagesContainer = document.querySelector('.messages-container');
    const isSent = message.senderId === currentUser.uid;
    const messageClass = isSent ? 'sent' : 'received';
    
    const messageElement = document.createElement('div');
    messageElement.className = `message ${messageClass}`;
    messageElement.innerHTML = `
        <div class="message-bubble">
            <div class="message-content">${escapeHtml(message.content)}</div>
            <div class="message-meta">
                <span class="message-time">${formatTime(message.timestamp)}</span>
                ${isSent ? `<span class="message-status ${message.read ? 'read' : 'delivered'}">
                    <i class="fas fa-check${message.read ? '-double' : ''}"></i>
                </span>` : ''}
            </div>
        </div>
    `;
    
    messagesContainer.appendChild(messageElement);
    
    // Scroll to bottom
    const chatMessages = document.getElementById('chat-messages');
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * Send message
 */
async function sendMessage() {
    if (!currentChatUser) return;
    
    const messageInput = document.getElementById('message-input');
    const content = messageInput.value.trim();
    
    if (!content) return;
    
    const conversationId = generateConversationId(currentUser.uid, currentChatUser.uid);
    
    try {
        const messageData = {
            senderId: currentUser.uid,
            receiverId: currentChatUser.uid,
            content: content,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            read: false,
            type: 'text'
        };
        
        // Add message to conversation
        await database.ref('conversations')
            .child(conversationId)
            .child('messages')
            .push(messageData);
        
        // Update conversation metadata
        await database.ref('conversations')
            .child(conversationId)
            .child('metadata')
            .update({
                lastMessage: content,
                lastMessageTimestamp: firebase.database.ServerValue.TIMESTAMP,
                lastMessageSender: currentUser.uid
            });
        
        // Clear input
        messageInput.value = '';
        messageInput.style.height = 'auto';
        
        // Update send button state
        updateSendButtonState();
        
    } catch (error) {
        console.error('Error sending message:', error);
        showToast('Failed to send message');
    }
}

/**
 * Mark messages as read
 */
async function markMessagesAsRead(friendId) {
    const conversationId = generateConversationId(currentUser.uid, friendId);
    
    try {
        const unreadMessagesSnapshot = await database.ref('conversations')
            .child(conversationId)
            .child('messages')
            .orderByChild('read')
            .equalTo(false)
            .once('value');
        
        if (!unreadMessagesSnapshot.exists()) return;
        
        const updates = {};
        unreadMessagesSnapshot.forEach(snapshot => {
            const message = snapshot.val();
            if (message.receiverId === currentUser.uid) {
                updates[`conversations/${conversationId}/messages/${snapshot.key}/read`] = true;
            }
        });
        
        if (Object.keys(updates).length > 0) {
            await database.ref().update(updates);
        }
        
    } catch (error) {
        console.error('Error marking messages as read:', error);
    }
}

/**
 * Mark single message as read
 */
async function markMessageAsRead(conversationId, messageId) {
    try {
        await database.ref('conversations')
            .child(conversationId)
            .child('messages')
            .child(messageId)
            .update({ read: true });
    } catch (error) {
        console.error('Error marking message as read:', error);
    }
}

/**
 * Update send button state
 */
function updateSendButtonState() {
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    
    if (messageInput.value.trim()) {
        sendBtn.style.background = 'var(--primary-color)';
        sendBtn.disabled = false;
    } else {
        sendBtn.style.background = 'var(--gray-300)';
        sendBtn.disabled = true;
    }
}

/**
 * Handle typing indicator
 */
function handleTyping() {
    if (!currentChatUser) return;
    
    const conversationId = generateConversationId(currentUser.uid, currentChatUser.uid);
    
    // Set typing status
    database.ref('conversations')
        .child(conversationId)
        .child('typing')
        .child(currentUser.uid)
        .set(true);
    
    // Clear existing timeout
    if (typingTimeout) {
        clearTimeout(typingTimeout);
    }
    
    // Set timeout to clear typing status
    typingTimeout = setTimeout(() => {
        database.ref('conversations')
            .child(conversationId)
            .child('typing')
            .child(currentUser.uid)
            .remove();
    }, 3000);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== WEBRTC CALLING FUNCTIONS =====

/**
 * Initialize WebRTC peer connection
 */
function createPeerConnection() {
    peerConnection = new RTCPeerConnection(rtcConfiguration);
    
    // Handle remote stream
    peerConnection.ontrack = (event) => {
        remoteStream = event.streams[0];
        const remoteVideo = document.getElementById('remote-video');
        if (remoteVideo) {
            remoteVideo.srcObject = remoteStream;
        }
    };
    
    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate && currentCall) {
            database.ref('calls')
                .child(currentCall.id)
                .child('candidates')
                .child(currentUser.uid)
                .push(event.candidate.toJSON());
        }
    };
    
    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
        console.log('Connection state:', peerConnection.connectionState);
        
        if (peerConnection.connectionState === 'connected') {
            updateCallStatus('Connected');
            startCallTimer();
        } else if (peerConnection.connectionState === 'disconnected' || 
                   peerConnection.connectionState === 'failed') {
            endCall();
        }
    };
    
    return peerConnection;
}

/**
 * Start audio call
 */
async function startAudioCall() {
    if (!currentChatUser) return;
    
    try {
        // Get user media (audio only)
        localStream = await navigator.mediaDevices.getUserMedia({ 
            audio: true, 
            video: false 
        });
        
        // Create call record
        const callData = {
            callerId: currentUser.uid,
            receiverId: currentChatUser.uid,
            type: 'audio',
            status: 'calling',
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };
        
        const callRef = await database.ref('calls').push(callData);
        currentCall = { id: callRef.key, ...callData };
        
        // Show audio call page
        showPage('audio-call-page');
        document.getElementById('audio-call-name').textContent = currentChatUser.displayName;
        document.getElementById('audio-call-avatar').src = currentChatUser.avatarUrl;
        document.getElementById('audio-call-status').textContent = 'Calling...';
        
        // Create peer connection and add stream
        createPeerConnection();
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Create and send offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        await database.ref('calls').child(currentCall.id).update({
            offer: offer
        });
        
        // Listen for answer
        database.ref('calls').child(currentCall.id).child('answer').on('value', async (snapshot) => {
            if (snapshot.exists() && peerConnection.signalingState === 'have-local-offer') {
                const answer = snapshot.val();
                await peerConnection.setRemoteDescription(answer);
            }
        });
        
        // Listen for ICE candidates
        database.ref('calls').child(currentCall.id).child('candidates').child(currentChatUser.uid).on('child_added', async (snapshot) => {
            const candidate = snapshot.val();
            if (peerConnection.remoteDescription) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
        });
        
        // Set timeout for call
        setTimeout(() => {
            if (currentCall && currentCall.status === 'calling') {
                endCall();
                showToast('Call timeout');
            }
        }, 30000);
        
    } catch (error) {
        console.error('Error starting audio call:', error);
        showToast('Failed to start call');
        endCall();
    }
}

/**
 * Start video call
 */
async function startVideoCall() {
    if (!currentChatUser) return;
    
    try {
        // Get user media (audio and video)
        localStream = await navigator.mediaDevices.getUserMedia({ 
            audio: true, 
            video: true 
        });
        
        // Create call record
        const callData = {
            callerId: currentUser.uid,
            receiverId: currentChatUser.uid,
            type: 'video',
            status: 'calling',
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };
        
        const callRef = await database.ref('calls').push(callData);
        currentCall = { id: callRef.key, ...callData };
        
        // Show video call page
        showPage('video-call-page');
        document.getElementById('call-user-name').textContent = currentChatUser.displayName;
        document.getElementById('call-status').textContent = 'Calling...';
        
        // Set local video
        const localVideo = document.getElementById('local-video');
        localVideo.srcObject = localStream;
        
        // Create peer connection and add stream
        createPeerConnection();
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Create and send offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        await database.ref('calls').child(currentCall.id).update({
            offer: offer
        });
        
        // Listen for answer
        database.ref('calls').child(currentCall.id).child('answer').on('value', async (snapshot) => {
            if (snapshot.exists() && peerConnection.signalingState === 'have-local-offer') {
                const answer = snapshot.val();
                await peerConnection.setRemoteDescription(answer);
            }
        });
        
        // Listen for ICE candidates
        database.ref('calls').child(currentCall.id).child('candidates').child(currentChatUser.uid).on('child_added', async (snapshot) => {
            const candidate = snapshot.val();
            if (peerConnection.remoteDescription) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
        });
        
        // Set timeout for call
        setTimeout(() => {
            if (currentCall && currentCall.status === 'calling') {
                endCall();
                showToast('Call timeout');
            }
        }, 30000);
        
    } catch (error) {
        console.error('Error starting video call:', error);
        showToast('Failed to start call');
        endCall();
    }
}

/**
 * Accept incoming call
 */
async function acceptCall() {
    if (!currentCall) return;
    
    try {
        // Get user media
        const constraints = {
            audio: true,
            video: currentCall.type === 'video'
        };
        
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Show appropriate call page
        if (currentCall.type === 'video') {
            showPage('video-call-page');
            document.getElementById('call-user-name').textContent = currentCall.callerName;
            document.getElementById('call-status').textContent = 'Connected';
            
            const localVideo = document.getElementById('local-video');
            localVideo.srcObject = localStream;
        } else {
            showPage('audio-call-page');
            document.getElementById('audio-call-name').textContent = currentCall.callerName;
            document.getElementById('audio-call-status').textContent = 'Connected';
        }
        
        // Create peer connection and add stream
        createPeerConnection();
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Set remote description (offer)
        await peerConnection.setRemoteDescription(currentCall.offer);
        
        // Create and send answer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        await database.ref('calls').child(currentCall.id).update({
            answer: answer,
            status: 'accepted'
        });
        
        // Listen for ICE candidates
        database.ref('calls').child(currentCall.id).child('candidates').child(currentCall.callerId).on('child_added', async (snapshot) => {
            const candidate = snapshot.val();
            if (peerConnection.remoteDescription) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
        });
        
        // Close incoming call modal
        closeModal('incoming-call-modal');
        
    } catch (error) {
        console.error('Error accepting call:', error);
        showToast('Failed to accept call');
        declineCall();
    }
}

/**
 * Decline incoming call
 */
async function declineCall() {
    if (currentCall) {
        try {
            await database.ref('calls').child(currentCall.id).update({
                status: 'declined'
            });
        } catch (error) {
            console.error('Error declining call:', error);
        }
    }
    
    closeModal('incoming-call-modal');
    currentCall = null;
}

/**
 * End call
 */
async function endCall() {
    try {
        // Update call status
        if (currentCall) {
            await database.ref('calls').child(currentCall.id).update({
                status: 'ended',
                endedAt: firebase.database.ServerValue.TIMESTAMP
            });
        }
        
        // Clean up WebRTC
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        
        // Clean up call timer
        if (callTimer) {
            clearInterval(callTimer);
            callTimer = null;
        }
        
        // Clean up Firebase listeners
        if (currentCall) {
            database.ref('calls').child(currentCall.id).off();
        }
        
        currentCall = null;
        callStartTime = null;
        
        // Return to chat or friends page
        if (currentChatUser) {
            showPage('chat-page');
        } else {
            showPage('friends-page');
        }
        
    } catch (error) {
        console.error('Error ending call:', error);
    }
}

/**
 * End audio call
 */
function endAudioCall() {
    endCall();
}

/**
 * Toggle mute
 */
function toggleMute() {
    if (!localStream) return;
    
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        
        const muteBtn = document.getElementById('mute-btn');
        if (audioTrack.enabled) {
            muteBtn.classList.remove('muted');
            muteBtn.innerHTML = '<i class="fas fa-microphone"></i>';
        } else {
            muteBtn.classList.add('muted');
            muteBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
        }
    }
}

/**
 * Toggle audio mute (for audio calls)
 */
function toggleAudioMute() {
    if (!localStream) return;
    
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        
        const muteBtn = document.getElementById('audio-mute-btn');
        if (audioTrack.enabled) {
            muteBtn.classList.remove('muted');
            muteBtn.innerHTML = '<i class="fas fa-microphone"></i>';
        } else {
            muteBtn.classList.add('muted');
            muteBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
        }
    }
}

/**
 * Toggle camera
 */
function toggleCamera() {
    if (!localStream) return;
    
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        
        const cameraBtn = document.getElementById('camera-btn');
        if (videoTrack.enabled) {
            cameraBtn.classList.remove('disabled');
            cameraBtn.innerHTML = '<i class="fas fa-video"></i>';
        } else {
            cameraBtn.classList.add('disabled');
            cameraBtn.innerHTML = '<i class="fas fa-video-slash"></i>';
        }
    }
}

/**
 * Switch camera (front/back)
 */
async function switchCamera() {
    if (!localStream) return;
    
    try {
        const videoTrack = localStream.getVideoTracks()[0];
        const constraints = {
            audio: true,
            video: {
                facingMode: videoTrack.getSettings().facingMode === 'user' ? 'environment' : 'user'
            }
        };
        
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Replace video track
        const newVideoTrack = newStream.getVideoTracks()[0];
        const sender = peerConnection.getSenders().find(s => 
            s.track && s.track.kind === 'video'
        );
        
        if (sender) {
            await sender.replaceTrack(newVideoTrack);
        }
        
        // Update local video
        videoTrack.stop();
        localStream.removeTrack(videoTrack);
        localStream.addTrack(newVideoTrack);
        
        const localVideo = document.getElementById('local-video');
        localVideo.srcObject = localStream;
        
    } catch (error) {
        console.error('Error switching camera:', error);
        showToast('Failed to switch camera');
    }
}

/**
 * Toggle screen share
 */
async function toggleScreenShare() {
    if (!peerConnection) return;
    
    try {
        const screenShareBtn = document.querySelector('.screen-share-btn');
        
        if (screenShareBtn.classList.contains('active')) {
            // Stop screen sharing
            const videoTrack = localStream.getVideoTracks()[0];
            const constraints = { audio: true, video: true };
            const cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
            const newVideoTrack = cameraStream.getVideoTracks()[0];
            
            const sender = peerConnection.getSenders().find(s => 
                s.track && s.track.kind === 'video'
            );
            
            if (sender) {
                await sender.replaceTrack(newVideoTrack);
            }
            
            videoTrack.stop();
            localStream.removeTrack(videoTrack);
            localStream.addTrack(newVideoTrack);
            
            const localVideo = document.getElementById('local-video');
            localVideo.srcObject = localStream;
            
            screenShareBtn.classList.remove('active');
            screenShareBtn.innerHTML = '<i class="fas fa-desktop"></i>';
            
        } else {
            // Start screen sharing
            const screenStream = await navigator.mediaDevices.getDisplayMedia({ 
                video: true, 
                audio: true 
            });
            const screenTrack = screenStream.getVideoTracks()[0];
            
            const sender = peerConnection.getSenders().find(s => 
                s.track && s.track.kind === 'video'
            );
            
            if (sender) {
                await sender.replaceTrack(screenTrack);
            }
            
            const videoTrack = localStream.getVideoTracks()[0];
            videoTrack.stop();
            localStream.removeTrack(videoTrack);
            localStream.addTrack(screenTrack);
            
            const localVideo = document.getElementById('local-video');
            localVideo.srcObject = localStream;
            
            screenShareBtn.classList.add('active');
            screenShareBtn.innerHTML = '<i class="fas fa-stop"></i>';
            
            // Handle screen share end
            screenTrack.onended = () => {
                toggleScreenShare();
            };
        }
        
    } catch (error) {
        console.error('Error toggling screen share:', error);
        showToast('Failed to toggle screen share');
    }
}

/**
 * Toggle speaker (for audio calls)
 */
function toggleSpeaker() {
    // This is a placeholder - actual speaker toggle would require more complex audio routing
    const speakerBtn = document.querySelector('.speaker-btn');
    speakerBtn.classList.toggle('active');
    
    if (speakerBtn.classList.contains('active')) {
        speakerBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
        showToast('Speaker off');
    } else {
        speakerBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
        showToast('Speaker on');
    }
}

/**
 * Start call timer
 */
function startCallTimer() {
    if (callTimer) return;
    
    callStartTime = Date.now();
    callTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
        const formattedTime = formatCallDuration(elapsed);
        
        const videoTimer = document.getElementById('call-timer');
        const audioTimer = document.getElementById('audio-call-timer');
        
        if (videoTimer) videoTimer.textContent = formattedTime;
        if (audioTimer) audioTimer.textContent = formattedTime;
    }, 1000);
}

/**
 * Update call status
 */
function updateCallStatus(status) {
    const videoStatus = document.getElementById('call-status');
    const audioStatus = document.getElementById('audio-call-status');
    
    if (videoStatus) videoStatus.textContent = status;
    if (audioStatus) audioStatus.textContent = status;
}

/**
 * Minimize call (placeholder)
 */
function minimizeCall() {
    showToast('Call minimized');
    // In a real app, this would minimize the call to a small floating window
}

// ===== SETTINGS AND MODALS =====

/**
 * Show settings modal
 */
function showSettingsModal() {
    showModal('settings-modal');
    
    // Load current settings
    if (currentUser) {
        document.getElementById('display-name').value = currentUser.displayName || '';
        document.getElementById('status-message').value = currentUser.statusMessage || '';
        
        // Load settings from database
        database.ref('users').child(currentUser.uid).child('settings').once('value')
            .then(snapshot => {
                const settings = snapshot.val() || {};
                
                document.getElementById('online-status').checked = settings.onlineStatus !== false;
                document.getElementById('read-receipts').checked = settings.readReceipts !== false;
                document.getElementById('message-notifications').checked = settings.notifications !== false;
                document.getElementById('call-notifications').checked = settings.callNotifications !== false;
            });
    }
}

/**
 * Save settings
 */
async function saveSettings() {
    if (!currentUser) return;
    
    try {
        const displayName = document.getElementById('display-name').value.trim();
        const statusMessage = document.getElementById('status-message').value.trim();
        const onlineStatus = document.getElementById('online-status').checked;
        const readReceipts = document.getElementById('read-receipts').checked;
        const notifications = document.getElementById('message-notifications').checked;
        const callNotifications = document.getElementById('call-notifications').checked;
        
        const updates = {
            displayName: displayName || currentUser.username,
            statusMessage: statusMessage,
            settings: {
                onlineStatus,
                readReceipts,
                notifications,
                callNotifications
            }
        };
        
        await database.ref('users').child(currentUser.uid).update(updates);
        
        // Update current user object
        currentUser.displayName = updates.displayName;
        currentUser.statusMessage = updates.statusMessage;
        currentUser.settings = updates.settings;
        
        // Update UI
        document.getElementById('user-display-name').textContent = currentUser.displayName;
        
        showToast('Settings saved');
        closeModal('settings-modal');
        
    } catch (error) {
        console.error('Error saving settings:', error);
        showToast('Failed to save settings');
    }
}

/**
 * Show chat options modal
 */
function showChatOptions() {
    if (!currentChatUser) return;
    
    showModal('chat-options-modal');
    
    // Update block/unblock text
    const blockText = document.getElementById('block-text');
    database.ref('users').child(currentUser.uid).child('blockedUsers').child(currentChatUser.uid).once('value')
        .then(snapshot => {
            if (snapshot.exists()) {
                blockText.textContent = 'Unblock User';
            } else {
                blockText.textContent = 'Block User';
            }
        });
}

/**
 * Clear search
 */
function clearSearch() {
    const searchInput = document.getElementById('friend-search');
    searchInput.value = '';
    searchInput.focus();
    
    const clearBtn = document.querySelector('.search-clear');
    clearBtn.classList.add('hidden');
    
    // Reload friends list
    loadFriendsList();
}

/**
 * Clear chat history
 */
async function clearChatHistory() {
    if (!currentChatUser) return;
    
    if (!confirm('Are you sure you want to clear all chat history? This action cannot be undone.')) {
        return;
    }
    
    try {
        const conversationId = generateConversationId(currentUser.uid, currentChatUser.uid);
        await database.ref('conversations').child(conversationId).child('messages').remove();
        
        showToast('Chat history cleared');
        closeModal('chat-options-modal');
        
        // Reload messages
        loadMessages(currentChatUser.uid);
        
    } catch (error) {
        console.error('Error clearing chat history:', error);
        showToast('Failed to clear chat history');
    }
}

/**
 * Export chat
 */
async function exportChat() {
    if (!currentChatUser) return;
    
    try {
        const conversationId = generateConversationId(currentUser.uid, currentChatUser.uid);
        const messagesSnapshot = await database.ref('conversations')
            .child(conversationId)
            .child('messages')
            .orderByKey()
            .once('value');
        
        if (!messagesSnapshot.exists()) {
            showToast('No messages to export');
            return;
        }
        
        const messages = messagesSnapshot.val();
        let chatText = `Chat Export - ${currentUser.displayName} & ${currentChatUser.displayName}\n`;
        chatText += `Exported on: ${new Date().toLocaleString()}\n\n`;
        
        Object.values(messages).forEach(message => {
            const sender = message.senderId === currentUser.uid ? currentUser.displayName : currentChatUser.displayName;
            const time = new Date(message.timestamp).toLocaleString();
            chatText += `[${time}] ${sender}: ${message.content}\n`;
        });
        
        // Create and download file
        const blob = new Blob([chatText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat_${currentChatUser.username}_${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast('Chat exported successfully');
        closeModal('chat-options-modal');
        
    } catch (error) {
        console.error('Error exporting chat:', error);
        showToast('Failed to export chat');
    }
}

/**
 * Toggle block user
 */
async function toggleBlockUser() {
    if (!currentChatUser) return;
    
    try {
        const blockedSnapshot = await database.ref('users')
            .child(currentUser.uid)
            .child('blockedUsers')
            .child(currentChatUser.uid)
            .once('value');
        
        if (blockedSnapshot.exists()) {
            // Unblock user
            await unblockUser(currentChatUser.uid);
        } else {
            // Block user
            if (confirm(`Are you sure you want to block ${currentChatUser.displayName}?`)) {
                await blockUser(currentChatUser.uid);
            }
        }
        
        closeModal('chat-options-modal');
        
    } catch (error) {
        console.error('Error toggling block status:', error);
        showToast('Failed to update block status');
    }
}

/**
 * Remove friend
 */
async function removeFriend() {
    if (!currentChatUser) return;
    
    if (!confirm(`Are you sure you want to remove ${currentChatUser.displayName} from your friends list?`)) {
        return;
    }
    
    try {
        // Remove from both users' friends lists
        await Promise.all([
            database.ref('users').child(currentUser.uid).child('friends').child(currentChatUser.uid).remove(),
            database.ref('users').child(currentChatUser.uid).child('friends').child(currentUser.uid).remove()
        ]);
        
        showToast('Friend removed');
        closeModal('chat-options-modal');
        goToFriends();
        loadFriendsList();
        
    } catch (error) {
        console.error('Error removing friend:', error);
        showToast('Failed to remove friend');
    }
}

// ===== PRESENCE AND LISTENERS =====

/**
 * Setup presence system
 */
function setupPresence() {
    if (!currentUser) return;
    
    const userRef = database.ref('users').child(currentUser.uid);
    const presenceRef = database.ref('.info/connected');
    
    presenceRef.on('value', (snapshot) => {
        if (snapshot.val() === true) {
            // User is online
            userRef.update({
                online: true,
                lastSeen: firebase.database.ServerValue.TIMESTAMP
            });
            
            // Set up disconnect handler
            userRef.onDisconnect().update({
                online: false,
                lastSeen: firebase.database.ServerValue.TIMESTAMP
            });
        }
    });
}

/**
 * Setup incoming call listener
 */
function setupIncomingCallListener() {
    if (!currentUser) return;
    
    database.ref('calls')
        .orderByChild('receiverId')
        .equalTo(currentUser.uid)
        .on('child_added', async (snapshot) => {
            const call = snapshot.val();
            const callId = snapshot.key;
            
            if (call.status === 'calling') {
                // Get caller info
                const callerSnapshot = await database.ref('users').child(call.callerId).once('value');
                const callerData = callerSnapshot.val();
                
                if (callerData) {
                    currentCall = {
                        id: callId,
                        ...call,
                        callerName: callerData.displayName,
                        callerAvatar: callerData.avatarUrl
                    };
                    
                    // Show incoming call modal
                    document.getElementById('incoming-call-name').textContent = callerData.displayName;
                    document.getElementById('incoming-call-avatar').src = callerData.avatarUrl;
                    document.getElementById('incoming-call-type').textContent = `Incoming ${call.type} call`;
                    
                    showModal('incoming-call-modal');
                    
                    // Play ringtone (if available)
                    // playRingtone();
                }
            }
        });
}

// ===== EVENT LISTENERS =====

// Authentication form listeners
document.getElementById('login-form-element').addEventListener('submit', handleLogin);
document.getElementById('signup-form-element').addEventListener('submit', handleSignup);

// Password strength checker
document.getElementById('signup-password').addEventListener('input', (e) => {
    const password = e.target.value;
    const { strengthClass, strengthText } = checkPasswordStrength(password);
    
    const strengthFill = document.querySelector('.strength-fill');
    const strengthTextEl = document.querySelector('.strength-text');
    
    strengthFill.className = `strength-fill ${strengthClass}`;
    strengthTextEl.textContent = strengthText;
});

// Message input listeners
document.getElementById('message-input').addEventListener('input', (e) => {
    // Auto-resize textarea
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
    
    // Update send button state
    updateSendButtonState();
    
    // Handle typing indicator
    handleTyping();
});

document.getElementById('message-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Search input listener
document.getElementById('friend-search').addEventListener('input', (e) => {
    const clearBtn = document.querySelector('.search-clear');
    if (e.target.value.trim()) {
        clearBtn.classList.remove('hidden');
    } else {
        clearBtn.classList.add('hidden');
    }
});

// Search friend input listener
document.getElementById('search-friend-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        searchFriend();
    }
});

// Modal click outside to close
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
        document.body.style.overflow = '';
    }
});

// ===== FIREBASE AUTH STATE LISTENER =====

auth.onAuthStateChanged(async (user) => {
    if (user) {
        // User is signed in
        try {
            const userSnapshot = await database.ref('users').child(user.uid).once('value');
            currentUser = userSnapshot.val();
            
            if (currentUser) {
                // Update UI
                document.getElementById('user-display-name').textContent = currentUser.displayName;
                document.getElementById('user-avatar').src = currentUser.avatarUrl;
                
                // Setup presence and listeners
                setupPresence();
                setupIncomingCallListener();
                
                // Load initial data
                loadFriendsList();
                loadFriendRequests();
                
                // Show friends page
                showPage('friends-page');
            }
        } catch (error) {
            console.error('Error loading user data:', error);
            showToast('Error loading user data');
        }
    } else {
        // User is signed out
        currentUser = null;
        currentChatUser = null;
        
        // Clean up
        if (onlineUsersRef) onlineUsersRef.off();
        if (messagesRef) messagesRef.off();
        if (friendRequestsRef) friendRequestsRef.off();
        
        // Show auth page
        showPage('auth-page');
    }
    
    // Hide loading screen
    toggleLoadingScreen(false);
});

// ===== INITIALIZATION =====

// Show loading screen initially
toggleLoadingScreen(true);

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('Community Z initialized');
    
    // Check if user is already authenticated
    const user = auth.currentUser;
    if (!user) {
        toggleLoadingScreen(false);
        showPage('auth-page');
    }
});

// ===== DATABASE SECURITY RULES (REFERENCE) =====
/*
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "auth != null",
        ".write": "$uid === auth.uid",
        "friends": {
          ".read": "auth != null",
          ".write": "$uid === auth.uid"
        },
        "blockedUsers": {
          ".read": "$uid === auth.uid",
          ".write": "$uid === auth.uid"
        }
      }
    },
    "usernames": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    "conversations": {
      "$conversationId": {
        ".read": "auth != null && (root.child('users').child(auth.uid).child('friends').hasChildren() || root.child('users').child(auth.uid).exists())",
        ".write": "auth != null"
      }
    },
    "friendRequests": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    "calls": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
*/

