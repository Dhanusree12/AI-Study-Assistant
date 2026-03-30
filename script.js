// Secure API Configuration (Proxied via Backend)
const GROQ_MODEL = "qwen/qwen3-32b";
const GROQ_API_URL = "/api/chat";

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
    const getUsers = () => JSON.parse(localStorage.getItem('study_users')) || [];
    const saveUsers = (users) => localStorage.setItem('study_users', JSON.stringify(users));
    const getCurrentUserId = () => localStorage.getItem('currentUserId');
    const setCurrentUserId = (userId) => localStorage.setItem('currentUserId', userId);
    
    // Helper to get current user object
    const getCurrentUser = () => {
        const id = getCurrentUserId();
        if (!id) return null;
        return getUsers().find(u => u.id === id);
    };

    const getGravatar = (email) => {
        if (!window.md5) return null;
        const hash = md5(email.toLowerCase().trim());
        return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=150`;
    };

    const getInitials = (name) => {
        return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
    };

    /* ==============================
       Google Sign-In Callback
    ============================== */
    window.handleGoogleLogin = (response) => {
        const payload = JSON.parse(atob(response.credential.split('.')[1]));
        const { name, email, picture, sub } = payload;
        
        let users = getUsers();
        let user = users.find(u => u.email === email);
        
        if (!user) {
            user = {
                id: 'g_' + sub,
                name,
                email,
                profileImage: picture,
                type: 'google'
            };
            users.push(user);
        } else {
            // Update image if it's a google user
            if (user.type === 'google') user.profileImage = picture;
        }
        
        saveUsers(users);
        setCurrentUserId(user.id);
        window.location.href = 'index.html';
    };

    /* ==============================
       Sign Up Handling
    ============================== */
    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
        signupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('name').value.trim();
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirm-password').value;

            if (password !== confirmPassword) {
                alert("Passwords do not match!");
                return;
            }

            const users = getUsers();
            if (users.find(u => u.email === email)) {
                alert("Account with this email already exists!");
                return;
            }

            const newUser = {
                id: Date.now().toString(),
                name,
                email,
                password,
                profileImage: getGravatar(email),
                type: 'local'
            };

            users.push(newUser);
            saveUsers(users);

            alert("Account created successfully! Please login.");
            window.location.href = 'login.html';
        });
    }

    /* ==============================
       Login Handling
    ============================== */
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;

            const users = getUsers();
            const user = users.find(u => u.email === email && u.password === password);

            if (user) {
                setCurrentUserId(user.id);
                window.location.href = 'index.html';
            } else {
                alert("Invalid email or password!");
            }
        });
    }

    /* ==============================
       Chat Dashboard Logic
    ============================== */
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
        // Enforce Login
        const currentUserId = getCurrentUserId();
        if (!currentUserId && !window.location.href.includes('login.html') && !window.location.href.includes('signup.html')) {
            window.location.href = 'login.html';
            return;
        }
        const chatInput = document.getElementById('chat-input');
        const sendBtn = document.getElementById('send-btn');
        const fileUpload = document.getElementById('file-upload');
        const uploadBtn = document.getElementById('upload-btn');
        const micBtn = document.getElementById('mic-btn');
        const filePreviewContainer = document.getElementById('file-preview-container');
        const newChatBtn = document.getElementById('new-chat-btn');
        const themeToggle = document.getElementById('theme-toggle');
        const openSidebarBtn = document.getElementById('open-sidebar');
        const closeSidebarBtn = document.getElementById('close-sidebar');
        const sidebar = document.getElementById('sidebar');
        const historyList = document.getElementById('history-list');
        const searchHistory = document.getElementById('search-history');
        const welcomeScreen = document.getElementById('welcome-screen');
        if (!chatContainer) return;

        let currentUploadedFiles = [];
        let chats = [];
        let lastTopic = ""; 
        try {
            const storageKey = `chats_${currentUserId}`;
            const savedChats = localStorage.getItem(storageKey);
            if (savedChats) chats = JSON.parse(savedChats) || [];
        } catch (e) {
            console.error("Failed to parse chats from localStorage:", e);
        }
        let currentChatId = null;
        let currentPreviewUrl = null;
        if (typeof pdfjsLib !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }

        // Modal Listeners
        const previewModal = document.getElementById('preview-modal');
        const closeModal = document.getElementById('close-modal');
        if (closeModal) {
            closeModal.onclick = () => previewModal.classList.add('hidden');
        }
        const archivedToggle = document.getElementById('archived-toggle');
        const archivedList = document.getElementById('archived-list');
        if (archivedToggle) {
            archivedToggle.onclick = () => {
                archivedList.classList.toggle('hidden');
                archivedToggle.classList.toggle('open');
            };
        }

        const confirmModal = document.getElementById('confirm-modal');
        const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
        const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
        let chatToDelete = null;

        if (cancelDeleteBtn) cancelDeleteBtn.onclick = () => confirmModal.classList.add('hidden');
        if (confirmDeleteBtn) {
            confirmDeleteBtn.onclick = () => {
                if (chatToDelete) {
                    chats = chats.filter(c => c.id !== chatToDelete);
                    if (currentChatId === chatToDelete) newChatBtn.click();
                    saveChats();
                    renderSidebarHistory();
                    confirmModal.classList.add('hidden');
                }
            };
        }

        const setupHeaderActions = () => {
            const shareBtn = document.getElementById('header-share-btn');
            const menuBtn = document.getElementById('header-menu-btn');
            const dropdown = document.getElementById('header-menu-dropdown');

            if (shareBtn) shareBtn.onclick = () => {
                if (currentChatId) shareChat(currentChatId);
            };
            
            if (menuBtn) {
                menuBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (currentChatId) dropdown.classList.toggle('show');
                };
            }

            const headerActions = {
                'header-rename': () => renameChatUI(currentChatId),
                'header-pin': () => togglePin(currentChatId),
                'header-archive': () => toggleArchive(currentChatId),
                'header-delete': () => deleteChatUI(currentChatId)
            };

            for (const [id, fn] of Object.entries(headerActions)) {
                const el = document.getElementById(id);
                if (el) {
                    el.onclick = () => {
                        dropdown.classList.remove('show');
                        if (currentChatId) fn();
                    };
                }
            }
        };

        const shareModal = document.getElementById('share-modal');
        const closeShareModal = document.getElementById('close-share-modal');
        const openMoreBtn = document.getElementById('open-more-share');
        const backShareBtn = document.getElementById('back-share-btn');
        const modalCopyLink = document.getElementById('modal-copy-link');

        if (closeShareModal) closeShareModal.onclick = () => shareModal.classList.add('hidden');
        if (openMoreBtn) openMoreBtn.onclick = () => {
            document.getElementById('share-main-view').classList.add('hidden');
            document.getElementById('share-more-view').classList.remove('hidden');
        };
        if (backShareBtn) backShareBtn.onclick = () => {
            document.getElementById('share-more-view').classList.add('hidden');
            document.getElementById('share-main-view').classList.remove('hidden');
        };
        if (modalCopyLink) modalCopyLink.onclick = () => {
            const id = shareModal.dataset.chatId;
            const chatUrl = window.location.origin + window.location.pathname + '?chat=' + id;
            navigator.clipboard.writeText(chatUrl).then(() => {
                showToast("Link successfully copied!");
            });
        };

        window.addEventListener('click', (e) => {
            if (!e.target.closest('.chat-dots') && !e.target.closest('.header-menu-container')) {
                document.querySelectorAll('.chat-dropdown').forEach(d => d.remove());
                document.querySelectorAll('.history-item.open').forEach(el => el.classList.remove('open'));
                const headerMenu = document.getElementById('header-menu-dropdown');
                if (headerMenu) headerMenu.classList.remove('show');
            }
        });

        if (localStorage.getItem('theme') === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
        }

        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            if (currentTheme === 'dark') {
                document.documentElement.removeAttribute('data-theme');
                localStorage.setItem('theme', 'light');
                themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
            } else {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('theme', 'dark');
                themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
            }
        });

        const profileAvatar = document.querySelector('.user-profile');
        const profileDropdown = document.getElementById('profile-dropdown');
        const currentUser = getCurrentUser();

        const updateProfileDisplay = () => {
            const user = getCurrentUser();
            if (user && profileAvatar) {
                if (user.profileImage) {
                    profileAvatar.innerHTML = `<img src="${user.profileImage}" alt="Profile">`;
                } else {
                    profileAvatar.innerHTML = `<span>${getInitials(user.name)}</span>`;
                }
                document.getElementById('profile-name').innerText = user.name;
                document.getElementById('profile-email').innerText = user.email;
                const dropdownPic = document.getElementById('profile-dropdown-pic');
                if (dropdownPic) {
                    if (user.profileImage) {
                        dropdownPic.innerHTML = `<img src="${user.profileImage}" alt="Profile">`;
                    } else {
                        dropdownPic.innerHTML = `<div class="initials-circle">${getInitials(user.name)}</div>`;
                    }
                }
                const changePassBtn = document.getElementById('profile-change-pass-btn');
                if (changePassBtn) {
                    if (user.type === 'google') changePassBtn.classList.add('hidden-important');
                    else changePassBtn.classList.remove('hidden-important');
                }
            }
        };

        if (profileAvatar) {
            profileAvatar.onclick = (e) => {
                e.stopPropagation();
                if (profileDropdown) profileDropdown.classList.toggle('show');
            };
        }

        window.logout = () => {
            localStorage.removeItem('currentUserId');
            window.location.href = 'login.html';
        };

        updateProfileDisplay();

        const changePassModal = document.getElementById('change-password-modal');
        window.openChangePassword = () => {
            if (profileDropdown) profileDropdown.classList.remove('show');
            if (changePassModal) changePassModal.classList.remove('hidden');
        };
        window.closeChangePassword = () => {
            if (changePassModal) changePassModal.classList.add('hidden');
        };

        const editModal = document.getElementById('edit-profile-modal');
        window.openEditProfile = () => {
            if (profileDropdown) profileDropdown.classList.remove('show');
            document.getElementById('edit-name').value = currentUser.name;
            document.getElementById('edit-email').value = currentUser.email;
            updateEditPic();
            if (editModal) editModal.classList.remove('hidden');
        };
        window.closeEditProfile = () => {
            if (editModal) editModal.classList.add('hidden');
        };

        const updateEditPic = () => {
            const editPic = document.getElementById('edit-profile-pic');
            if (editPic) {
                if (currentUser.profileImage) {
                    editPic.innerHTML = `<img src="${currentUser.profileImage}">`;
                } else {
                    editPic.innerHTML = `<div class="initials-circle" style="font-size:30px;">${getInitials(currentUser.name)}</div>`;
                }
            }
        };

        document.getElementById('edit-profile-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const newName = document.getElementById('edit-name').value;
            const users = getUsers();
            const idx = users.findIndex(u => u.id === currentUser.id);
            if (idx !== -1) {
                users[idx].name = newName;
                saveUsers(users);
                updateProfileDisplay();
                alert("Profile updated!");
                closeEditProfile();
            }
        });

        document.getElementById('profile-upload')?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                const base64 = event.target.result;
                const users = getUsers();
                const idx = users.findIndex(u => u.id === currentUser.id);
                if (idx !== -1) {
                    users[idx].profileImage = base64;
                    saveUsers(users);
                    updateProfileDisplay();
                    updateEditPic();
                }
            };
            reader.readAsDataURL(file);
        });

        const changePassForm = document.getElementById('change-pass-form');
        if (changePassForm) {
            changePassForm.onsubmit = (e) => {
                e.preventDefault();
                const current = document.getElementById('current-pass').value;
                const newPass = document.getElementById('new-pass').value;
                const confirmPass = document.getElementById('confirm-new-pass').value;
                if (current !== currentUser.password) { alert("Incorrect current password!"); return; }
                if (newPass !== confirmPass) { alert("New passwords do not match!"); return; }
                const users = getUsers();
                const userIdx = users.findIndex(u => u.id === currentUser.id);
                if (userIdx !== -1) {
                    users[userIdx].password = newPass;
                    saveUsers(users);
                    alert("Password updated successfully!");
                    closeChangePassword();
                }
            };
        }

        if (openSidebarBtn) openSidebarBtn.addEventListener('click', () => { sidebar && sidebar.classList.add('active'); });
        if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', () => { sidebar && sidebar.classList.remove('active'); });

        uploadBtn.addEventListener('click', () => fileUpload.click());
        fileUpload.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            files.forEach(file => {
                if (!currentUploadedFiles.some(f => f.name === file.name)) {
                    currentUploadedFiles.push({ file, name: file.name, type: file.type });
                }
            });
            updateFilePreview();
        });

        function updateFilePreview() {
            if (currentUploadedFiles.length > 0) {
                filePreviewContainer.classList.remove('hidden');
                filePreviewContainer.innerHTML = '';
                currentUploadedFiles.forEach((fileObj, index) => {
                    const card = document.createElement('div');
                    card.className = 'file-preview-card';
                    let icon = fileObj.type.startsWith('image/') ? 'fa-image' : (fileObj.type === 'application/pdf' ? 'fa-file-pdf' : 'fa-file');
                    card.innerHTML = `
                        <i class="fa-solid ${icon}"></i> 
                        <span class="file-name">${fileObj.name}</span>
                        <button onclick="removeFile(${index})"><i class="fa-solid fa-xmark"></i></button>
                    `;
                    filePreviewContainer.appendChild(card);
                });
            } else { filePreviewContainer.classList.add('hidden'); }
        }

        window.removeFile = (index) => {
            currentUploadedFiles.splice(index, 1);
            updateFilePreview();
        };

        let recognition;
        if ('webkitSpeechRecognition' in window) {
            recognition = new webkitSpeechRecognition();
            recognition.onstart = () => micBtn.classList.add('recording');
            recognition.onresult = (event) => {
                chatInput.value += (chatInput.value ? ' ' : '') + event.results[0][0].transcript;
            };
            recognition.onend = () => micBtn.classList.remove('recording');
        }
        micBtn.addEventListener('click', () => {
            if (recognition) recognition.start();
            else alert("Speech recognition not supported.");
        });

        async function sendMessageToGroq(userMsg, history = [], fileContext = "") {
            try {
                const response = await fetch(GROQ_API_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model: GROQ_MODEL,
                        messages: [
                            { role: "system", content: "CRITICAL: FINAL_ANSWER_ONLY_MODE=ENABLED. CHAIN_OF_THOUGHT=DISABLED. GLOBAL_KNOWLEDGE=ENABLED.\n\nSTRICT INSTRUCTIONS:\n- YOU MUST START EVERY RESPONSE WITH THE TEXT '### START'.\n- GLOBAL MASTERY: Provide comprehensive, holistic knowledge on all world locations (countries, cities, landmarks). Include geography, history, economy, and local customs.\n- LOCAL INSTITUTIONS: Accurately list universities, companies, and attractions in EVERY location. Never generalize.\n- NO NARRATION after the '### START' tag.\n- IMAGE/DIAGRAM: [SHOW_IMAGES: query]\n- Oracle Persona: Concise, Holistic, and Direct." },
                            ...history.slice(-10).map(msg => ({ role: msg.role, content: msg.content })),
                            { role: "user", content: fileContext ? `Attached File Content:\n\"\"\"\n${fileContext}\n\"\"\"\n\nUser Question:\n${userMsg}` : userMsg }
                        ],
                        temperature: 0,
                        max_tokens: 1024
                    })
                });
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error?.message || `API Error: ${response.status}`);
                }
                const data = await response.json();
                return data.choices[0].message.content;
            } catch (error) { console.error("Groq API Error:", error); throw error; }
        }

        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && !sendBtn.disabled) {
                e.preventDefault(); handleSend();
            }
        });
        sendBtn.addEventListener('click', handleSend);

        async function handleSend() {
            const message = chatInput.value.trim();
            const files = [...currentUploadedFiles];
            chatInput.value = '';
            chatInput.style.height = 'auto';
            currentUploadedFiles = [];
            updateFilePreview();
            if (welcomeScreen) welcomeScreen.style.display = 'none';

            appendUserMessage(message, files);
            if (message.length > 3) lastTopic = message;

            if (!currentChatId) {
                currentChatId = Date.now().toString();
                chats.unshift({ id: currentChatId, title: message || (files.length > 0 ? files[0].name : "New Chat"), messages: [] });
                renderSidebarHistory();
            }
            const chatObj = chats.find(c => c.id === currentChatId);

            const persistedFiles = await Promise.all(files.map(async f => ({
                name: f.name, type: f.type, size: f.file.size, data: await fileToBase64(f.file)
            })));
            chatObj.messages.push({ role: 'user', content: message, files: persistedFiles });
            saveChats();

            const typingId = appendTypingIndicator();
            try {
                let fileContext = "";
                for (const f of files) fileContext += (await extractTextFromFile(f)) + "\n";
                if (fileContext.length > 15000) fileContext = fileContext.substring(0, 15000) + "...";

                const history = chatObj.messages.slice(0, -1);
                const aiResponse = await sendMessageToGroq(message || "Analyze files.", history, fileContext);
                removeMessage(typingId);
                appendAIMessage(aiResponse);
                chatObj.messages.push({ role: 'assistant', content: aiResponse });
                saveChats();
            } catch (err) {
                removeMessage(typingId);
                appendAIMessage(`⚠️ Error: ${err.message}`);
            }
        }

        function appendUserMessage(text, files, shouldScroll = true) {
            const div = document.createElement('div');
            div.className = 'message user';
            let filesHtml = files.map(f => {
                let objectUrl = f.file ? URL.createObjectURL(f.file) : f.data;
                let thumbnailHtml = f.type.startsWith('image/') ? `<img src="${objectUrl}" alt="thumbnail">` : (f.type === 'application/pdf' ? `<i class="fa-solid fa-file-pdf" style="color:#f40f02;"></i>` : `<i class="fa-solid fa-file"></i>`);
                return `
                    <div class="file-card" onclick="openPersistedFilePreview('${objectUrl}', '${f.name}', '${f.type}')">
                        <div class="file-thumbnail">${thumbnailHtml}</div>
                        <div class="file-info"><span class="file-name">${f.name}</span></div>
                    </div>`;
            }).join('');
            const user = getCurrentUser();
            let avatarHtml = user?.profileImage ? `<img src="${user.profileImage}" alt="User">` : `<span>${getInitials(user?.name || "User")}</span>`;
            div.innerHTML = `<div class="avatar user-avatar">${avatarHtml}</div><div class="msg-content">${filesHtml}<div>${escapeHTML(text)}</div></div>`;
            chatContainer.appendChild(div);
            if (shouldScroll) scrollToBottom();
        }

        function stripMetaTalk(text) {
            if (!text) return "";
            let cleaned = text.trim();
            cleaned = cleaned.replace(/<(thought|thinking)>[\s\S]*?<\/\1>/gi, '').trim();
            if (cleaned.includes('### START')) cleaned = cleaned.split('### START')[1].trim();
            return cleaned;
        }

        function appendAIMessage(text, shouldScroll = true) {
            const div = document.createElement('div');
            div.className = 'message ai';
            const fullyCleaned = stripMetaTalk(text);
            const imageMatch = fullyCleaned.match(/\[SHOW_IMAGES:\s*(.*?)\]/);
            let finalOutput = fullyCleaned.replace(/\[SHOW_IMAGES:\s*(.*?)\]/g, '').trim();
            div.innerHTML = `
                <div class="avatar ai-avatar"><img src="cute_robot.png" alt="AI"></div>
                <div class="msg-content">
                    <div class="ai-text">${marked.parse(finalOutput)}</div>
                    <div class="image-grid-container"></div>
                </div>`;
            chatContainer.appendChild(div);
            if (imageMatch) renderImages(imageMatch[1], div.querySelector('.image-grid-container'));
            if (shouldScroll) scrollToBottom();
        }

        async function renderImages(query, container) {
            container.innerHTML = `<div style="font-size:12px;opacity:0.6;">Finding images for "${query}"...</div>`;
            try {
                const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=pageimages&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=5&piprop=thumbnail&pithumbsize=800`;
                const response = await fetch(url);
                const data = await response.json();
                if (!data.query || !data.query.pages) { container.innerHTML = ''; return; }
                const pages = Object.values(data.query.pages);
                container.innerHTML = '<div class="image-grid"></div>';
                const grid = container.querySelector('.image-grid');
                pages.forEach(page => {
                    if (page.thumbnail) {
                        const item = document.createElement('div');
                        item.className = 'image-grid-item';
                        item.innerHTML = `<img src="${page.thumbnail.source}">`;
                        item.onclick = () => window.open(page.thumbnail.source, '_blank');
                        grid.appendChild(item);
                    }
                });
            } catch (e) { container.innerHTML = ''; }
        }

        function appendTypingIndicator() {
            const id = 'typing-' + Date.now();
            const div = document.createElement('div');
            div.id = id; div.className = 'message ai';
            div.innerHTML = `<div class="avatar ai-avatar"><img src="cute_robot.png"></div><div class="msg-content typing-indicator"><span></span><span></span><span></span></div>`;
            chatContainer.appendChild(div);
            scrollToBottom();
            return id;
        }

        function removeMessage(id) { document.getElementById(id)?.remove(); }
        function scrollToBottom() {
            requestAnimationFrame(() => { chatContainer.scrollTop = chatContainer.scrollHeight; });
        }
        function saveChats() { 
            localStorage.setItem(`chats_${currentUserId}`, JSON.stringify(chats)); 
        }
        function escapeHTML(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
        function fileToBase64(file) {
            return new Promise((res, rej) => { const r = new FileReader(); r.readAsDataURL(file); r.onload = () => res(r.result); r.onerror = rej; });
        }
        function base64ToBlob(base64, type) {
            const byteString = atob(base64.split(',')[1]);
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
            return new Blob([ab], { type: type });
        }
        async function extractTextFromFile(fileObj) {
            const { file, type } = fileObj;
            if (type === 'application/pdf') return await extractTextFromPDF(file);
            if (type.startsWith('image/')) return await extractTextFromImage(file);
            if (type.includes('word')) return await extractTextFromWord(file);
            return new Promise(res => { const r = new FileReader(); r.onload = e => res(e.target.result); r.readAsText(file); });
        }
        async function extractTextFromPDF(file) {
            const ab = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
            let text = "";
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                text += content.items.map(item => item.str).join(" ") + "\n";
            }
            return text;
        }
        async function extractTextFromImage(file) {
            const result = await Tesseract.recognize(file, 'eng');
            return result.data.text;
        }
        async function extractTextFromWord(file) {
            const ab = await file.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer: ab });
            return result.value;
        }

        window.openPersistedFilePreview = (url, name, type) => {
            if (type === 'application/pdf' || type.startsWith('image/')) window.open(url, '_blank');
            else alert("Preview not available.");
        };

        function renderSidebarHistory(filter = '') {
            historyList.innerHTML = '';
            chats.forEach(chat => {
                if (filter && !chat.title.toLowerCase().includes(filter.toLowerCase())) return;
                const item = document.createElement('div');
                item.className = `history-item ${chat.id === currentChatId ? 'active' : ''}`;
                item.innerHTML = `<i class="fa-regular fa-message"></i><span class="chat-title-text">${escapeHTML(chat.title)}</span>`;
                item.onclick = () => loadChat(chat.id);
                historyList.appendChild(item);
            });
        }

        function loadChat(id) {
            currentChatId = id;
            updateChatHeader();
            const chat = chats.find(c => c.id === id);
            chatContainer.innerHTML = '';
            chat.messages.forEach(m => {
                if (m.role === 'user') appendUserMessage(m.content, m.files || [], false);
                else appendAIMessage(m.content, false);
            });
            scrollToBottom();
            renderSidebarHistory();
        }

        function updateChatHeader() {
            const chatTitle = document.getElementById('header-chat-title');
            if (currentChatId) {
                const chat = chats.find(c => c.id === currentChatId);
                chatTitle.innerText = chat.title || "AI Study Assistant";
            } else { chatTitle.innerText = "AI Study Assistant"; }
        }

        newChatBtn.onclick = () => {
            currentChatId = null;
            updateChatHeader();
            chatContainer.innerHTML = '';
            if (welcomeScreen) welcomeScreen.style.display = 'flex';
            renderSidebarHistory();
        };

        setupHeaderActions();
        updateChatHeader();
        searchHistory.oninput = (e) => renderSidebarHistory(e.target.value);
        renderSidebarHistory();

        /* --------------------------
           Selection-to-AI Logic (Final Corrected)
        -------------------------- */
        const selectionBtn = document.getElementById('selection-ask-btn');
        let selectedText = "";

        document.addEventListener('mouseup', (e) => {
            const selection = window.getSelection();
            const text = selection.toString() ? selection.toString().trim() : "";
            if (text && text.length > 2 && e.target !== selectionBtn) {
                selectedText = text;
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                if (selectionBtn) {
                    // Positioning relative to body (which is now relative)
                    selectionBtn.style.left = `${rect.left + window.scrollX + (rect.width/2) - (selectionBtn.offsetWidth/2 || 40)}px`;
                    selectionBtn.style.top = `${rect.top + window.scrollY - 60}px`;
                    selectionBtn.classList.remove('hidden');
                }
            } else if (selectionBtn && !text) {
                selectionBtn.classList.add('hidden');
            }
        });

        document.addEventListener('mousedown', (e) => {
            if (e.target !== selectionBtn && selectionBtn) selectionBtn.classList.add('hidden');
        });

        if (selectionBtn) {
            selectionBtn.onclick = async () => {
                selectionBtn.classList.add('hidden');
                
                // Integrate explanation directly into the current chat stream
                const researchQuery = `As a High-Precision Oracle, please explain this study material: "${selectedText}"`;
                appendUserMessage(`Explain this: "${selectedText}"`, []);
                
                if (!currentChatId) {
                    currentChatId = Date.now().toString();
                    chats.unshift({ id: currentChatId, title: "Study Analysis", messages: [] });
                }
                const chatObj = chats.find(c => c.id === currentChatId);
                chatObj.messages.push({ role: 'user', content: researchQuery });
                
                const typingId = appendTypingIndicator();
                try {
                    const aiResponse = await sendMessageToGroq(researchQuery, chatObj.messages.slice(0, -1));
                    removeMessage(typingId);
                    appendAIMessage(aiResponse);
                    chatObj.messages.push({ role: 'assistant', content: aiResponse });
                    saveChats();
                } catch (err) {
                    removeMessage(typingId);
                    appendAIMessage(`⚠️ Error: ${err.message}`);
                }
            };
        }
    }
});
