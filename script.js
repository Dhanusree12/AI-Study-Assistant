// Secure API Configuration (Proxied via Backend)
const GROQ_MODEL = "qwen/qwen3-32b";
const GROQ_API_URL = "/api/chat";

/* ==============================
   Early Theme Application
============================== */
(function() {
    const theme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', theme);
})();

document.addEventListener('DOMContentLoaded', () => {
    /* ==============================
       Toggle Password Visibility
    ============================== */
    const initPasswordToggle = (toggleId, inputId) => {
        const toggleIcon = document.getElementById(toggleId);
        const passwordInput = document.getElementById(inputId);
        if (toggleIcon && passwordInput) {
            toggleIcon.addEventListener('click', () => {
                const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                passwordInput.setAttribute('type', type);
                toggleIcon.classList.toggle('fa-eye');
                toggleIcon.classList.toggle('fa-eye-slash');
            });
        }
    };
    initPasswordToggle('toggle-password', 'password');
    initPasswordToggle('toggle-signup-password', 'password');

    /* ==============================
       User Management & Auth Logic
    ============================== */
    const getUsers = () => {
        let users = JSON.parse(localStorage.getItem('study_users')) || [];
        if (users.length === 0) {
            users = [{ id: 'demo123', name: 'Demo Student', email: 'admin@student.com', password: 'admin123', type: 'local' }];
            localStorage.setItem('study_users', JSON.stringify(users));
        }
        return users;
    };
    const saveUsers = (users) => localStorage.setItem('study_users', JSON.stringify(users));
    const getCurrentUserId = () => localStorage.getItem('currentUserId');
    const setCurrentUserId = (userId) => localStorage.setItem('currentUserId', userId);
    const getCurrentUser = () => {
        const id = getCurrentUserId();
        if (!id) return null;
        return getUsers().find(u => u.id === id);
    };
    const getInitials = (name) => name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

    /* ==============================
       Google Sign-In Callback
    ============================== */
    window.handleGoogleLogin = (response) => {
        try {
            const payload = JSON.parse(atob(response.credential.split('.')[1]));
            const { name, email, picture, sub } = payload;
            let users = getUsers();
            let user = users.find(u => u.email === email);
            if (!user) {
                user = { id: 'g_' + sub, name, email, profileImage: picture, type: 'google' };
                users.push(user);
            } else if (user.type === 'google') user.profileImage = picture;
            saveUsers(users);
            setCurrentUserId(user.id);
            window.location.href = 'index.html';
        } catch (e) { alert("Google Auth error."); }
    };

    /* ==============================
       Dashboard Initialization
    ============================== */
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
        const currentUserId = getCurrentUserId();
        if (!currentUserId && !window.location.href.includes('login.html')) {
            window.location.href = 'login.html'; return;
        }

        const chatInput = document.getElementById('chat-input');
        const sendBtn = document.getElementById('send-btn');
        const fileUpload = document.getElementById('file-upload');
        const uploadBtn = document.getElementById('upload-btn');
        const micBtn = document.getElementById('mic-btn');
        const filePreviewContainer = document.getElementById('file-preview-container');
        const newChatBtn = document.getElementById('new-chat-btn');
        const historyList = document.getElementById('history-list');
        const archivedList = document.getElementById('archived-list');
        const welcomeScreen = document.getElementById('welcome-screen');
        const profileAvatarTrigger = document.getElementById('user-profile-trigger');
        const profileDropdown = document.getElementById('profile-dropdown');
        const archivedToggle = document.getElementById('archived-toggle');

        // Header Elements
        const headerShareBtn = document.getElementById('header-share-btn');
        const headerMenuBtn = document.getElementById('header-menu-btn');
        const headerMenuDropdown = document.getElementById('header-menu-dropdown');
        const headerChatTitle = document.getElementById('header-chat-title');
        const themeToggle = document.getElementById('theme-toggle');

        /* ==============================
           Theme Toggle Logic
        ============================== */
        const currentTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', currentTheme);
        
        const updateThemeIcon = (theme) => {
            if (!themeToggle) return;
            const icon = themeToggle.querySelector('i');
            if (theme === 'dark') {
                icon.classList.replace('fa-moon', 'fa-sun');
            } else {
                icon.classList.replace('fa-sun', 'fa-moon');
            }
        };
        updateThemeIcon(currentTheme);

        if (themeToggle) {
            themeToggle.onclick = () => {
                const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
                document.documentElement.setAttribute('data-theme', theme);
                localStorage.setItem('theme', theme);
                updateThemeIcon(theme);
            };
        }

        let currentUploadedFiles = [];
        let chats = [];
        let currentChatId = null;
        let chatToDelete = null;

        /* ==============================
           IndexedDB Persistence Logic
        ============================== */
        const ChatDB = {
            dbName: 'StudyAssistantDB', storeName: 'chats', db: null,
            async init() {
                return new Promise((resolve, reject) => {
                    const req = indexedDB.open(this.dbName, 1);
                    req.onupgradeneeded = (e) => {
                        const db = e.target.result;
                        if (!db.objectStoreNames.contains(this.storeName)) db.createObjectStore(this.storeName, { keyPath: 'userId' });
                    };
                    req.onsuccess = (e) => { this.db = e.target.result; resolve(); };
                    req.onerror = (e) => reject(e);
                });
            },
            async save(userId, chats) {
                const tx = this.db.transaction([this.storeName], 'readwrite');
                const store = tx.objectStore(this.storeName);
                return new Promise((res, rej) => {
                    const req = store.put({ userId, chats });
                    req.onsuccess = () => res(); req.onerror = rej;
                });
            },
            async load(userId) {
                const tx = this.db.transaction([this.storeName], 'readonly');
                const store = tx.objectStore(this.storeName);
                return new Promise((res, rej) => {
                    const req = store.get(userId);
                    req.onsuccess = (e) => res(e.target.result ? e.target.result.chats : []);
                    req.onerror = rej;
                });
            }
        };

        const initializeChats = async () => {
            await ChatDB.init();
            chats = await ChatDB.load(currentUserId);
            // Migrate from localStorage if needed
            if (chats.length === 0) {
                const old = JSON.parse(localStorage.getItem(`chats_${currentUserId}`)) || [];
                if (old.length > 0) {
                    chats = old;
                    await ChatDB.save(currentUserId, chats);
                    localStorage.removeItem(`chats_${currentUserId}`);
                }
            }
            renderSidebarHistory();
            updateHeaderControls();
        };
        initializeChats();

        if (typeof pdfjsLib !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }

        /* ==============================
           Profile & UI Utilities
        ============================== */
        const generateAvatar = (user, size = '40px') => {
            const name = (user?.name || "User").trim();
            const initial = name ? name.charAt(0).toUpperCase() : "U";
            
            if (user?.profileImage) {
                return `<img src="${user.profileImage}" style="width:${size}; height:${size}; border-radius:50%; object-fit:cover; display:block;">`;
            }

            // Generate a consistent color based on name
            let hash = 0;
            for (let i = 0; i < name.length; i++) {
                hash = name.charCodeAt(i) + ((hash << 5) - hash);
            }
            const colors = [
                '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEEAD', 
                '#D4A5A5', '#9B59B6', '#3498DB', '#E67E22', '#2ECC71'
            ];
            const color = colors[Math.abs(hash) % colors.length];

            return `
                <div class="fallback-avatar" style="
                    width: ${size}; 
                    height: ${size}; 
                    background-color: ${color}; 
                    color: white; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    border-radius: 50%; 
                    font-weight: bold; 
                    font-size: ${size === '100%' ? '18px' : 'calc(' + size + ' * 0.5)'};
                    user-select: none;
                    text-transform: uppercase;
                    flex-shrink: 0;
                ">
                    ${initial}
                </div>
            `;
        };

        const updateProfileDisplay = () => {
            const user = getCurrentUser();
            const profilePicEl = document.getElementById('profilePic');
            if (user && profilePicEl) {
                profilePicEl.innerHTML = generateAvatar(user, '100%');
                document.getElementById('profile-name').innerText = user.name;
                document.getElementById('profile-email').innerText = user.email;
                const dropdownPic = document.getElementById('profile-dropdown-pic');
                if (dropdownPic) dropdownPic.innerHTML = generateAvatar(user, '100%');
                
                // Hide Change Password for Google users
                const changePassBtn = document.getElementById('profile-change-pass-btn');
                if (changePassBtn) changePassBtn.style.display = (user.type === 'google' ? 'none' : 'flex');
                
                // Show/Hide Remove Photo button in modal
                const removeBtn = document.getElementById('remove-photo-btn');
                if (removeBtn) removeBtn.style.display = user.profileImage ? 'flex' : 'none';
            }
        };
        updateProfileDisplay();

        /* ==============================
           Profile Management Logic
        ============================== */
        window.openEditProfile = () => {
            const user = getCurrentUser();
            if (!user) return;
            document.getElementById('edit-name').value = user.name;
            document.getElementById('edit-email').value = user.email;
            const editPicEl = document.getElementById('edit-profile-pic');
            if (editPicEl) editPicEl.innerHTML = generateAvatar(user, '100%');
            document.getElementById('edit-profile-modal').classList.remove('hidden');
        };

        window.closeEditProfile = () => {
            document.getElementById('edit-profile-modal').classList.add('hidden');
        };

        document.getElementById('edit-profile-form').onsubmit = (e) => {
            e.preventDefault();
            const user = getCurrentUser();
            let users = getUsers();
            const index = users.findIndex(u => u.id === user.id);
            if (index !== -1) {
                users[index].name = document.getElementById('edit-name').value.trim();
                saveUsers(users);
                updateProfileDisplay();
                closeEditProfile();
                showToast("Profile updated! ✨");
            }
        };

        document.getElementById('profile-upload').onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const user = getCurrentUser();
                    let users = getUsers();
                    const index = users.findIndex(u => u.id === user.id);
                    if (index !== -1) {
                        users[index].profileImage = ev.target.result;
                        saveUsers(users);
                        updateProfileDisplay();
                        const editPicEl = document.getElementById('edit-profile-pic');
                        if (editPicEl) editPicEl.innerHTML = generateAvatar(users[index], '100%');
                        showToast("Photo updated! 📸");
                    }
                };
                reader.readAsDataURL(file);
            }
        };

        window.removeProfilePhoto = () => {
            const user = getCurrentUser();
            if (!user || !user.profileImage) return;
            let users = getUsers();
            const index = users.findIndex(u => u.id === user.id);
            if (index !== -1) {
                users[index].profileImage = null;
                saveUsers(users);
                updateProfileDisplay();
                const editPicEl = document.getElementById('edit-profile-pic');
                if (editPicEl) editPicEl.innerHTML = generateAvatar(users[index], '100%');
                showToast("Photo removed! 🗑️");
            }
        };

        window.openChangePassword = () => {
            document.getElementById('change-pass-form').reset();
            document.getElementById('change-password-modal').classList.remove('hidden');
        };

        window.closeChangePassword = () => {
            document.getElementById('change-password-modal').classList.add('hidden');
        };

        document.getElementById('change-pass-form').onsubmit = (e) => {
            e.preventDefault();
            const user = getCurrentUser();
            const newPass = document.getElementById('new-pass').value;
            const confirmNewPass = document.getElementById('confirm-new-pass').value;

            if (newPass !== confirmNewPass) return alert("Passwords don't match!");
            if (newPass.length < 6) return alert("Password must be at least 6 characters.");

            let users = getUsers();
            const index = users.findIndex(u => u.id === user.id);
            if (index !== -1) {
                users[index].password = newPass;
                saveUsers(users);
                closeChangePassword();
                showToast("Password updated successfully! 🔒");
            }
        };

        window.logout = () => {
            localStorage.removeItem('currentUserId');
            window.location.href = 'login.html';
        };

        /* ==============================
           Image Preview Modal Logic
        ============================== */
        const previewModal = document.getElementById('preview-modal');
        const modalBody = document.getElementById('modal-body');
        const closePreviewBtn = document.getElementById('close-preview');
        const downloadPreviewBtn = document.getElementById('download-preview');

        window.openImageModal = (src) => {
            if (!modalBody || !previewModal || !downloadPreviewBtn) return;
            modalBody.innerHTML = `<img src="${src}" alt="Image Preview" style="max-width:100%; max-height:80vh; object-fit:contain; border-radius:12px;">`;
            downloadPreviewBtn.href = src;
            previewModal.classList.remove('hidden');
        };

        window.openFilePreview = (url, type, name) => {
            if (type && type.startsWith('image/')) {
                window.openImageModal(url);
            } else {
                // Robust handling for PDFs and other files, especially from Base64
                try {
                    let previewUrl = url;
                    if (url.startsWith('data:')) {
                        const parts = url.split(',');
                        const byteString = atob(parts[1]);
                        const mimeString = parts[0].split(':')[1].split(';')[0];
                        const ab = new ArrayBuffer(byteString.length);
                        const ia = new Uint8Array(ab);
                        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
                        const blob = new Blob([ab], { type: mimeString });
                        previewUrl = URL.createObjectURL(blob);
                    }
                    window.open(previewUrl, '_blank');
                } catch (e) {
                    window.open(url, '_blank');
                }
            }
        };

        window.closeImageModal = () => {
            previewModal.classList.add('hidden');
            setTimeout(() => { modalBody.innerHTML = ''; }, 300);
        };

        if (closePreviewBtn) closePreviewBtn.onclick = window.closeImageModal;
        if (previewModal) {
            previewModal.onclick = (e) => {
                if (e.target === previewModal) window.closeImageModal();
            };
        }

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                window.closeImageModal();
                if (document.getElementById('confirm-modal')) document.getElementById('confirm-modal').classList.add('hidden');
                if (document.getElementById('share-modal')) document.getElementById('share-modal').classList.add('hidden');
            }
        });


        if (profileAvatarTrigger) {
            profileAvatarTrigger.onclick = (e) => { e.stopPropagation(); profileDropdown.classList.toggle('show'); };
        }
        window.onclick = (e) => {
            profileDropdown?.classList.remove('show');
            headerMenuDropdown?.classList.remove('show');
            if (e.target === selectionModal) window.closeSelectionModal();
            if (!e.target.closest('.history-controls')) {
                document.querySelectorAll('.chat-dropdown').forEach(d => d.classList.remove('show'));
            }
        };
        window.logout = () => { localStorage.removeItem('currentUserId'); window.location.href = 'login.html'; };

        /* ==============================
           Share Functionality
        ============================== */
        window.shareActiveChat = () => {
            const chat = chats.find(c => c.id === currentChatId);
            if (chat) {
                document.getElementById('share-chat-title').innerText = chat.title || "Study Session";
                document.getElementById('share-subtitle').innerText = "Share this chat";
            }
            document.getElementById('share-modal').classList.remove('hidden');
        };
        window.closeShareModal = () => {
            document.getElementById('share-modal').classList.add('hidden');
        };
        window.toggleMoreShare = () => {
            document.getElementById('share-more-view').classList.toggle('hidden');
        };
        window.shareTo = (platform) => {
            const url = window.location.href.split('?')[0];
            const text = "Join my AI study session on AI Study Assistant!";
            let link = "";
            switch (platform) {
                case 'whatsapp': link = `https://wa.me/?text=${encodeURIComponent(text + " " + url)}`; break;
                case 'x': link = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`; break;
                case 'linkedin': link = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`; break;
                case 'gmail': link = `mailto:?subject=Study Session&body=${encodeURIComponent(text + "\n" + url)}`; break;
                case 'telegram': link = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`; break;
                case 'facebook': link = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`; break;
                case 'reddit': link = `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`; break;
            }
            if (link) window.open(link, '_blank');
        };
        const shareCopyBtn = document.getElementById('share-copy-btn');
        if (shareCopyBtn) {
            shareCopyBtn.onclick = () => {
                const url = window.location.href.split('?')[0];
                navigator.clipboard.writeText(url).then(() => showToast("Session link copied! 📋"));
            };
        }

        /* ==============================
           Voice to Text Integration
        ============================== */
        let recognition;
        if ('webkitSpeechRecognition' in window) {
            recognition = new webkitSpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.onstart = () => micBtn.classList.add('recording');
            recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                chatInput.value += (chatInput.value ? ' ' : '') + transcript;
                micBtn.classList.remove('recording');
            };
            recognition.onend = () => micBtn.classList.remove('recording');
        }
        micBtn.onclick = () => {
            if (recognition) recognition.start();
            else alert("Speech recognition not supported in this browser.");
        };

        /* ==============================
           Selection-to-Study Logic
        ============================== */
        const selectionBtn = document.getElementById('selection-ask-btn');
        const selectionModal = document.getElementById('selection-modal');
        const selectionInput = document.getElementById('selection-input');
        const selectionSendBtn = document.getElementById('selection-send-btn');
        let selectedText = "";

        const openSelectionModal = (text) => {
            selectedText = text;
            selectionInput.value = `Explain this: "${text}"`;
            selectionModal.classList.remove('hidden');
            selectionInput.focus();
            selectionBtn.classList.add('hidden');
        };

        window.closeSelectionModal = () => {
            selectionModal.classList.add('hidden');
        };

        document.addEventListener('mouseup', (e) => {
            // If click is inside the button or modal, let other handlers handle it
            if (e.target.closest('#selection-ask-btn') || e.target.closest('#selection-modal')) return;
            
            const selection = window.getSelection();
            const text = selection.toString().trim();
            
            if (text.length > 2) {
                selectedText = text;
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                
                // Position button above selection
                selectionBtn.style.left = `${rect.left + window.scrollX + (rect.width / 2) - 60}px`;
                selectionBtn.style.top = `${rect.top + window.scrollY - 50}px`;
                selectionBtn.classList.remove('hidden');
            } else {
                selectionBtn.classList.add('hidden');
            }
        });

        // Mobile Long-Press Support
        let selectionTimeout;
        document.addEventListener('selectionchange', () => {
            clearTimeout(selectionTimeout);
            selectionTimeout = setTimeout(() => {
                const selection = window.getSelection();
                const text = selection.toString().trim();
                if (text.length > 2 && /Mobi|Android/i.test(navigator.userAgent)) {
                    selectedText = text;
                    const range = selection.getRangeAt(0);
                    const rect = range.getBoundingClientRect();
                    selectionBtn.style.left = `${rect.left + window.scrollX + (rect.width / 2) - 60}px`;
                    selectionBtn.style.top = `${rect.top + window.scrollY - 60}px`;
                    selectionBtn.classList.remove('hidden');
                }
            }, 500);
        });

        if (selectionBtn) {
            selectionBtn.onclick = (e) => {
                e.stopPropagation();
                openSelectionModal(selectedText);
            };
        }

        if (selectionSendBtn) {
            selectionSendBtn.onclick = () => {
                const query = selectionInput.value.trim();
                if (!query) return;
                closeSelectionModal();
                handleSend(query);
            };
        }

        /* ==============================
           Header Actions
        ============================== */
        function updateHeaderControls() {
            if (currentChatId) {
                headerShareBtn.classList.remove('hidden');
                headerMenuBtn.classList.remove('hidden');
                const chat = chats.find(c => c.id === currentChatId);
                headerChatTitle.innerText = (chat.title || "Study Session") + (chat.archived ? " (Archived)" : "");
                
                // Update dynamic Pin text in header menu
                const headerPinLink = document.getElementById('header-pin');
                if (headerPinLink) {
                    headerPinLink.innerHTML = `<i class="fa-solid fa-thumbtack"></i> ${chat.pinned ? 'Unpin' : 'Pin'}`;
                }
                // Update dynamic Archive text in header menu
                const headerArchiveLink = document.getElementById('header-archive');
                if (headerArchiveLink) {
                    headerArchiveLink.innerHTML = chat.archived 
                        ? `<i class="fa-solid fa-arrow-up-from-bracket"></i> Restore` 
                        : `<i class="fa-solid fa-box-archive"></i> Archive`;
                }
            } else {
                headerShareBtn.classList.add('hidden');
                headerMenuBtn.classList.add('hidden');
                headerChatTitle.innerText = "AI Study Assistant";
            }
        }
        headerMenuBtn.onclick = (e) => { e.stopPropagation(); headerMenuDropdown.classList.toggle('show'); };
        headerShareBtn.onclick = () => window.shareActiveChat();

        function showToast(msg) {
            const t = document.createElement('div'); t.className = 'toast'; t.innerText = msg;
            document.body.appendChild(t);
            setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 2500);
        }

        /* ==============================
           Delete Confirmation Logic (Custom)
        ============================== */
        window.deleteHistory = (id, e) => {
            if (e) e.stopPropagation();
            chatToDelete = id;
            document.getElementById('confirm-modal').classList.remove('hidden');
            document.querySelectorAll('.chat-dropdown').forEach(d => d.classList.remove('show'));
        };

        document.getElementById('cancel-delete-btn').onclick = () => {
            document.getElementById('confirm-modal').classList.add('hidden');
            chatToDelete = null;
        };

        document.getElementById('confirm-delete-btn').onclick = () => {
            if (chatToDelete) {
                chats = chats.filter(c => c.id !== chatToDelete);
                saveChats();
                if (currentChatId === chatToDelete) window.location.reload();
                else renderSidebarHistory();
            }
            document.getElementById('confirm-modal').classList.add('hidden');
            chatToDelete = null;
        };

        document.getElementById('header-delete').onclick = (e) => window.deleteHistory(currentChatId, e);
        document.getElementById('header-rename').onclick = (e) => window.startRename(currentChatId, e);
        document.getElementById('header-pin').onclick = (e) => window.togglePin(currentChatId, e);
        document.getElementById('header-archive').onclick = (e) => {
            const chat = chats.find(c => c.id === currentChatId);
            if (chat) {
                if (chat.archived) window.restoreArchive(currentChatId, e);
                else window.archiveHistory(currentChatId, e);
            }
        };

        /* ==============================
           File & AI Core Logic
        ============================== */
        uploadBtn.onclick = () => fileUpload.click();
        fileUpload.onchange = (e) => {
            const files = Array.from(e.target.files);
            files.forEach(f => { if (!currentUploadedFiles.find(x => x.name === f.name)) currentUploadedFiles.push({ file: f, name: f.name, type: f.type }); });
            updateFilePreview();
        };

        function updateFilePreview() {
            filePreviewContainer.innerHTML = '';
            if (currentUploadedFiles.length === 0) return filePreviewContainer.classList.add('hidden');
            filePreviewContainer.classList.remove('hidden');
            currentUploadedFiles.forEach((f, i) => {
                const card = document.createElement('div');
                card.className = 'file-preview-card';
                card.innerHTML = `<span>${f.name}</span><button onclick="removeFile(${i})">&times;</button>`;
                filePreviewContainer.appendChild(card);
            });
        }
        window.removeFile = (i) => { currentUploadedFiles.splice(i, 1); updateFilePreview(); };

        async function handleSend(overrideText = null) {
            const msg = overrideText || chatInput.value.trim();
            const files = [...currentUploadedFiles];
            if (!msg && files.length === 0) return;
            
            if (!overrideText) chatInput.value = '';
            currentUploadedFiles = [];
            updateFilePreview();
            if (welcomeScreen) welcomeScreen.style.display = 'none';

            appendUserMessage(msg, files);
            if (!currentChatId) {
                currentChatId = Date.now().toString();
                chats.unshift({ id: currentChatId, title: msg.substring(0, 30) || (files.length > 0 ? files[0].name : "Study Session"), messages: [] });
            }
            updateHeaderControls();
            const chatObj = chats.find(c => c.id === currentChatId);
            const tid = appendTypingIndicator();

            try {
                let context = "";
                const persistedFiles = [];
                for (const f of files) {
                    const text = await extractTextFromFile(f);
                    context += text + "\n";
                    persistedFiles.push({ name: f.name, type: f.type, data: await fileToBase64(f.file) });
                }
                const ans = await sendMessageToGroq(msg || "Analyze files.", chatObj.messages, context);
                removeMessage(tid);
                appendAIMessage(ans);
                chatObj.messages.push({ role: 'user', content: msg, files: persistedFiles }, { role: 'assistant', content: ans });
                saveChats();
                renderSidebarHistory();
            } catch (e) { removeMessage(tid); appendAIMessage("Error: " + e.message); }
        }
        sendBtn.onclick = () => handleSend();
        chatInput.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };

        async function extractTextFromFile(f) {
            if (f.type === 'application/pdf') return await extractPDF(f.file);
            if (f.type.startsWith('image/')) return (await Tesseract.recognize(f.file, 'eng')).data.text;
            if (f.type.includes('word')) {
                const res = await mammoth.extractRawText({ arrayBuffer: await f.file.arrayBuffer() });
                return res.value;
            }
            return await f.file.text();
        }
        async function extractPDF(file) {
            const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
            let text = "";
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                text += (await page.getTextContent()).items.map(it => it.str).join(" ") + "\n";
            }
            return text;
        }

        async function sendMessageToGroq(userMsg, history = [], fileContext = "") {
            const response = await fetch(GROQ_API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: GROQ_MODEL,
                    messages: [
                        { role: "system", content: "### Oracle Assistant Mode: Friendly Conversational Response. Start responses with natural, helpful phrases like 'Sure! Here's a simple explanation:' or 'Happy to help!'. Rules: 1. NO 'START', 'Explain:', or robotic headers. 2. Use simple, clear language. 3. Friendly and polite tone. 4. Use short paragraphs and bullets. 5. STRICT FINAL ANSWER ONLY. No thinking tags. If user asks for images, respond with 'Ok, the images of [query]' followed by [SHOW_IMAGES: query]." },
                        ...history.slice(-10).map(m => ({ role: m.role, content: m.content })),
                        { role: "user", content: fileContext ? `File Context:\n${fileContext}\n\nQuestion: ${userMsg}` : userMsg }
                    ]
                })
            });
            const data = await response.json();
            return data.choices[0].message.content;
        }

        function appendUserMessage(text, files) {
            const div = document.createElement('div');
            div.className = 'message user';
            const user = getCurrentUser();
            const avatar = generateAvatar(user, '40px');

            let filesHtml = files.map(f => {
                const url = f.data || (f.file ? URL.createObjectURL(f.file) : "");
                const type = f.type || (f.file ? f.file.type : "");
                if (!url) return '';
                return `
                    <div class="file-card" style="margin-bottom:10px;">
                        <span class="file-name">${f.name}</span>
                        <div style="display:flex; gap:8px; margin-top:5px;">
                            <button onclick="window.openFilePreview('${url}', '${type}', '${f.name.replace(/'/g, "\\'")}')" class="btn-text" style="font-size:11px;">Preview</button>
                            <a href="${url}" download="${f.name}" class="btn-text" style="font-size:11px; color:var(--primary-color);">Download</a>
                        </div>
                    </div>`;
            }).join('');

            div.innerHTML = `<div class="avatar user-avatar">${avatar}</div><div class="msg-content">${filesHtml}<div>${escapeHTML(text)}</div></div>`;
            chatContainer.appendChild(div);
            scrollToBottom();
        }

        function appendAIMessage(text) {
            const div = document.createElement('div');
            div.className = 'message ai';
            
            // Aggressive cleaning to remove "START" and other preambles
            let cleaned = text.trim();
            cleaned = cleaned.replace(/<(thought|thinking)>[\s\S]*?<\/\1>/gi, '').trim();
            // Remove "START" at the beginning, potentially with punctuation
            cleaned = cleaned.replace(/^START(\s|:|-|!|.)*/i, '').trim();
            // Remove robotic prefixes while keeping friendly ones
            cleaned = cleaned.replace(/^(Explain:|Definition:|Answer:|Output:|Result:|Here is the explanation:)/i, '').trim();

            const imageMatch = cleaned.match(/\[SHOW_IMAGES:\s*(.*?)\]/);
            let finalOutput = cleaned.replace(/\[SHOW_IMAGES:\s*(.*?)\]/g, '').trim();
            
            // Double check cleanup on the final output string
            finalOutput = finalOutput.replace(/^START(\s|:|-|!|.)*/i, '').trim();

            if (imageMatch) {
                const query = imageMatch[1];
                // If the output is now empty or was just 'START', use the requested simple line
                if (!finalOutput) {
                    finalOutput = `Ok, the images of ${query}`;
                }
            }

            div.innerHTML = `
                <div class="avatar ai-avatar"><img src="cute_robot.png"></div>
                <div class="msg-content">
                    <div class="ai-text">${marked.parse(finalOutput)}</div>
                    <div class="image-grid-container"></div>
                </div>`;
            chatContainer.appendChild(div);
            if (imageMatch) renderImages(imageMatch[1], div.querySelector('.image-grid-container'));
            scrollToBottom();
        }

        async function renderImages(query, container) {
            try {
                const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=pageimages&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=5&piprop=thumbnail&pithumbsize=800`;
                const res = await fetch(url);
                const data = await res.json();
                if (!data.query?.pages) return;
                const pages = Object.values(data.query.pages);
                container.innerHTML = '<div class="image-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(130px, 1fr)); gap:12px; margin-top:10px;"></div>';
                const grid = container.querySelector('.image-grid');
                pages.forEach(p => {
                    if (p.thumbnail) {
                        const item = document.createElement('div');
                        item.className = 'image-grid-item';
                        item.innerHTML = `
                            <img src="${p.thumbnail.source}" 
                                 onclick="openImageModal('${p.thumbnail.source}')" 
                                 style="width:100%; height:120px; object-fit:cover; border-radius:12px; cursor:pointer;"
                                 title="Click to preview image">
                        `;
                        grid.appendChild(item);
                    }
                });
            } catch (e) { }
        }

        function appendTypingIndicator() {
            const id = 'typing-' + Date.now();
            const div = document.createElement('div'); div.id = id; div.className = 'message ai';
            div.innerHTML = `<div class="avatar ai-avatar"><img src="cute_robot.png"></div><div class="msg-content">Thinking...</div>`;
            chatContainer.appendChild(div);
            scrollToBottom();
            return id;
        }
        function removeMessage(id) { document.getElementById(id)?.remove(); }
        function scrollToBottom() { chatContainer.scrollTop = chatContainer.scrollHeight; }
        function saveChats() { 
            ChatDB.save(currentUserId, chats).catch(e => console.error("DB error:", e)); 
        }
        function escapeHTML(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
        function fileToBase64(file) { return new Promise((res) => { const r = new FileReader(); r.readAsDataURL(file); r.onload = () => res(r.result); }); }

        /* ==============================
           Side-Bar Vertical Elipsis Menu (Click-to-Show)
        ============================== */
        const searchInput = document.getElementById('search-history');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                renderSidebarHistory(searchInput.value.trim());
            });
        }

        function renderSidebarHistory(filterTerm = '') {
            historyList.innerHTML = '';
            const term = filterTerm.toLowerCase();
            
            const pinned = chats.filter(c => c.pinned && !c.archived && (c.title || "").toLowerCase().includes(term));
            const regular = chats.filter(c => !c.pinned && !c.archived && (c.title || "").toLowerCase().includes(term));

            [...pinned, ...regular].forEach(c => {
                const it = document.createElement('div');
                it.className = `history-item ${c.id === currentChatId ? 'active' : ''}`;

                it.innerHTML = `
                    <div class="chat-item-main" style="display:flex; align-items:center; gap:8px; flex:1; min-width:0;">
                        ${c.pinned ? '<i class="fa-solid fa-thumbtack pin-active-icon"></i>' : '<i class="fa-solid fa-message chat-msg-icon"></i>'}
                        <span class="history-title-text" id="title-text-${c.id}">${c.title || "Study Session"}</span>
                    </div>
                    <div class="history-controls">
                        <button class="chat-dots" onclick="event.stopPropagation(); toggleDots('${c.id}')">
                            <i class="fa-solid fa-ellipsis-vertical"></i>
                        </button>
                        <div class="chat-dropdown" id="dots-${c.id}">
                            <div class="chat-dropdown-item" onclick="startRename('${c.id}', event)"><i class="fa-solid fa-pen"></i> Rename</div>
                            <div class="chat-dropdown-item" onclick="window.togglePin('${c.id}', event)"><i class="fa-solid fa-thumbtack"></i> ${c.pinned ? 'Unpin' : 'Pin'}</div>
                            <div class="chat-dropdown-item" onclick="archiveHistory('${c.id}', event)"><i class="fa-solid fa-box-archive"></i> Archive</div>
                            <div class="chat-dropdown-item" onclick="window.shareActiveChat(); event.stopPropagation();"><i class="fa-solid fa-share"></i> Share</div>
                            <div class="chat-dropdown-item delete" onclick="window.deleteHistory('${c.id}', event)"><i class="fa-solid fa-trash"></i> Delete</div>
                        </div>
                    </div>
                `;
                it.onclick = () => loadChat(c.id);
                historyList.appendChild(it);
            });
            renderArchivedList(filterTerm);
        }

        window.toggleDots = (id) => {
            const dropdown = document.getElementById(`dots-${id}`);
            const isShown = dropdown.classList.contains('show');
            document.querySelectorAll('.chat-dropdown').forEach(d => d.classList.remove('show'));
            if (!isShown) dropdown.classList.add('show');
        };

        window.startRename = (id, e) => {
            e.stopPropagation();
            const titleSpan = document.getElementById(`title-text-${id}`);
            const originalText = titleSpan.innerText;
            const input = document.createElement('input');
            input.type = 'text'; input.className = 'rename-input'; input.value = originalText;
            titleSpan.replaceWith(input);
            input.focus();
            document.querySelectorAll('.chat-dropdown').forEach(d => d.classList.remove('show'));

            const commit = () => {
                const newTitle = input.value.trim() || originalText;
                chats.find(c => c.id === id).title = newTitle;
                saveChats(); renderSidebarHistory(); updateHeaderControls();
            };
            input.onkeydown = (ev) => {
                if (ev.key === 'Enter') commit();
                if (ev.key === 'Escape') renderSidebarHistory();
            };
            input.onblur = commit;
        };

        window.togglePin = (id, e) => {
            if (e) e.stopPropagation();
            const chat = chats.find(c => c.id === id);
            if (chat) {
                chat.pinned = !chat.pinned;
                saveChats(); renderSidebarHistory(); updateHeaderControls();
            }
        };

        window.archiveHistory = (id, e) => {
            if (e) e.stopPropagation();
            const chat = chats.find(c => c.id === id);
            if (chat) {
                chat.archived = true;
                saveChats();
                renderSidebarHistory();
                
                // Show the archived section and open it
                document.getElementById('archived-section').style.display = 'block';
                archivedList.classList.remove('hidden');
                archivedToggle.classList.add('open');
                
                showToast("Chat archived! 📦");
                
                if (currentChatId === id) {
                    currentChatId = null;
                    chatContainer.innerHTML = '';
                    if (welcomeScreen) welcomeScreen.style.display = 'flex';
                    updateHeaderControls();
                }
            }
            document.querySelectorAll('.chat-dropdown').forEach(d => d.classList.remove('show'));
        };

        function renderArchivedList(filterTerm = '') {
            archivedList.innerHTML = '';
            const term = filterTerm.toLowerCase();
            const archived = chats.filter(c => c.archived && (c.title || "").toLowerCase().includes(term));
            
            if (archived.length === 0 && !term) {
                document.getElementById('archived-section').style.display = 'none';
                return;
            }
            // Show archived section if we have results OR if we are searching (so user sees it)
            document.getElementById('archived-section').style.display = 'block';
            
            archived.forEach(c => {
                const it = document.createElement('div');
                it.className = `history-item ${c.id === currentChatId ? 'active' : ''}`;
                it.innerHTML = `
                    <div class="chat-item-main" style="display:flex; align-items:center; gap:8px; flex:1; min-width:0;">
                        <i class="fa-solid fa-box-archive chat-msg-icon" style="opacity:0.6;"></i>
                        <span class="history-title-text">${c.title}</span>
                    </div>
                    <div class="history-controls">
                        <button class="chat-dots" onclick="event.stopPropagation(); toggleDots('archived-${c.id}')"><i class="fa-solid fa-ellipsis-vertical"></i></button>
                        <div class="chat-dropdown" id="dots-archived-${c.id}">
                            <div class="chat-dropdown-item" onclick="restoreArchive('${c.id}', event)"><i class="fa-solid fa-arrow-up-from-bracket"></i> Restore</div>
                            <div class="chat-dropdown-item delete" onclick="window.deleteHistory('${c.id}', event)"><i class="fa-solid fa-trash"></i> Delete</div>
                        </div>
                    </div>
                `;
                it.onclick = () => loadChat(c.id);
                archivedList.appendChild(it);
            });
        }

        window.restoreArchive = (id, e) => {
            if (e) e.stopPropagation();
            const chat = chats.find(c => c.id === id);
            if (chat) {
                chat.archived = false;
                saveChats();
                renderSidebarHistory();
                updateHeaderControls();
                showToast("Chat restored! 🚀");
            }
            document.querySelectorAll('.chat-dropdown').forEach(d => d.classList.remove('show'));
        };

        archivedToggle.onclick = () => {
            archivedList.classList.toggle('hidden');
            archivedToggle.classList.toggle('open');
        };

        function loadChat(id) {
            currentChatId = id;
            const chat = chats.find(c => c.id === id);
            chatContainer.innerHTML = '';
            if (welcomeScreen) welcomeScreen.style.display = 'none';
            chat.messages.forEach(m => m.role === 'user' ? appendUserMessage(m.content, m.files || []) : appendAIMessage(m.content));
            renderSidebarHistory();
            updateHeaderControls();
        }

        newChatBtn.onclick = () => window.location.reload();
    }

    /* ==============================
       Login & Signup Form Handlers
    ============================== */
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.onsubmit = (e) => {
            e.preventDefault();
            const emailInput = document.getElementById('email');
            const passwordInput = document.getElementById('password');
            const email = emailInput.value.trim();
            const password = passwordInput.value;

            if (!email || !password) return; // Let browser validation handle it
            
            const users = getUsers();
            const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
            if (user) {
                setCurrentUserId(user.id);
                // Quick transition
                document.body.style.opacity = '0';
                setTimeout(() => { window.location.href = 'index.html'; }, 300);
            } else {
                loginForm.classList.add('shake');
                setTimeout(() => loginForm.classList.remove('shake'), 500);
                alert("Incorrect email or password. You can use admin@student.com / admin123 to test!");
            }
        };
    }

    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
        signupForm.onsubmit = (e) => {
            e.preventDefault();
            const name = document.getElementById('name').value.trim();
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirm-password');
            const confirmVal = confirmPassword ? confirmPassword.value : password;

            if (password !== confirmVal) return alert("Passwords do not match!");
            if (password.length < 6) return alert("Password must be at least 6 characters.");

            let users = getUsers();
            if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) return alert("Email already exists!");

            const newUser = { id: Date.now().toString(), name, email, password, type: 'local', createdAt: new Date().toISOString() };
            users.push(newUser);
            saveUsers(users);
            setCurrentUserId(newUser.id);
            
            document.body.style.opacity = '0';
            setTimeout(() => { window.location.href = 'index.html'; }, 300);
        };
    }
});
