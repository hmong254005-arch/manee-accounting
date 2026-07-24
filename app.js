// app.js - Main Application Logic

let defaultApiKey = ''; // ต้องตั้งค่าในแอป
let apiKey = localStorage.getItem('manee_api_key') || defaultApiKey;
let transactions = [];
let products = [];
let chartInstance = null;
let chatHistory = [];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Setup UI Listeners safely
    const safeSetup = (name, fn) => {
        try { fn(); } catch (e) { console.error(`Error in ${name}:`, e); }
    };

    safeSetup('setupNavigation', setupNavigation);
    safeSetup('setupSettings', setupSettings);
    safeSetup('setupChat', setupChat);
    safeSetup('setupTransactionsTable', setupTransactionsTable);
    safeSetup('setupProducts', setupProducts);
    safeSetup('setupDashboardFilter', setupDashboardFilter);
    safeSetup('setupCalendar', setupCalendar);
    
    document.getElementById('refresh-insight-btn')?.addEventListener('click', generateInsight);

    // Init DB & Auth
    try {
        await window.dbAPI.initDB();
        setupAuthUI(); // Wire up login buttons
        
        const user = await window.dbAPI.getCurrentUser();
        if (user) {
            // Logged in
            document.getElementById('auth-modal').style.display = 'none';
            await loadTransactions();
            await loadProducts();
            setupPOSDailySummary();
            generateInsight();
        } else {
            // Not logged in
            document.getElementById('auth-modal').style.display = 'flex';
        }
    } catch (e) {
        console.error("Failed to initialize app", e);
        alert("ไม่สามารถเชื่อมต่อฐานข้อมูลได้: " + (e.message || e.name || String(e)));
    }
});

// --- Auth UI Logic ---
function setupAuthUI() {
    const authModal = document.getElementById('auth-modal');
    const authOptions = document.getElementById('auth-options');
    const emailForm = document.getElementById('email-auth-form');
    const authLoading = document.getElementById('auth-loading');
    
    const showEmailBtn = document.getElementById('btn-show-email-login') || document.getElementById('btn-show-email-auth');
    if (showEmailBtn) {
        showEmailBtn.addEventListener('click', () => {
            authOptions.style.display = 'none';
            emailForm.style.display = 'block';
        });
    }
    
    const backBtn = document.getElementById('btn-back-to-options') || document.getElementById('btn-back-to-auth');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            emailForm.style.display = 'none';
            authOptions.style.display = 'block';
        });
    }
    
    const showLoading = () => {
        authOptions.style.display = 'none';
        emailForm.style.display = 'none';
        authLoading.style.display = 'block';
    };
    
    const hideLoading = () => {
        authLoading.style.display = 'none';
        authOptions.style.display = 'block';
    };
    
    const handleLoginSuccess = async () => {
        authModal.style.display = 'none';
        await loadTransactions();
        await loadProducts();
        setupPOSDailySummary();
        generateInsight();
        showToast("เข้าสู่ระบบสำเร็จ!");
    };
    
    // Guest Login
    const guestBtn = document.getElementById('btn-guest-login');
    if (guestBtn) {
        guestBtn.addEventListener('click', async () => {
            showLoading();
            try {
                await window.dbAPI.signInAnonymously();
                await handleLoginSuccess();
            } catch (e) {
                hideLoading();
                alert("เข้าใช้งานทันทีไม่สำเร็จ: " + e.message);
            }
        });
    }
    
    // Email Login/Signup
    const loginSubmitBtn = document.getElementById('btn-login-submit') || document.getElementById('btn-email-login');
    if (loginSubmitBtn) {
        loginSubmitBtn.addEventListener('click', async () => {
            const email = document.getElementById('auth-email').value;
            const password = document.getElementById('auth-password').value;
            
            if (!email || !password) {
            alert("กรุณากรอกอีเมลและรหัสผ่าน");
            return;
        }
        
        showLoading();
        try {
            // Try sign in first
            try {
                await window.dbAPI.signInWithEmail(email, password);
                await handleLoginSuccess();
            } catch (signInErr) {
                // If invalid credentials, maybe user doesn't exist. Try signup.
                if (signInErr.message.includes("Invalid login credentials") || signInErr.message.includes("invalid claim")) {
                    try {
                        await window.dbAPI.signUpWithEmail(email, password);
                        await handleLoginSuccess();
                    } catch (signUpErr) {
                        throw signUpErr;
                    }
                } else {
                    throw signInErr;
                }
            }
        } catch (e) {
            hideLoading();
            emailForm.style.display = 'block';
            alert("ไม่สามารถเข้าสู่ระบบได้: " + e.message);
        }
    });
    }
}

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-menu .nav-item');
    const views = document.querySelectorAll('.view-section');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                sidebar.classList.toggle('mobile-open');
                if(overlay) overlay.classList.toggle('active');
            } else {
                sidebar.classList.toggle('collapsed');
            }
        });
    }
    
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    if (mobileMenuBtn && sidebar) {
        mobileMenuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('mobile-open');
            if(overlay) overlay.classList.toggle('active');
        });
    }

    if (overlay) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('mobile-open');
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
        });
    }

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const tab = item.getAttribute('data-tab');
            
            // Update active nav
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Update active view
            views.forEach(view => view.classList.remove('active'));
            const targetView = document.getElementById(`view-${tab}`);
            if (targetView) targetView.classList.add('active');
            
            // Close mobile menu if open
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('mobile-open');
                sidebar.classList.remove('open');
                if(overlay) overlay.classList.remove('active');
            }

            // Refresh data if needed
            if (tab === 'dashboard') {
                updateDashboard();
            } else if (tab === 'transactions') {
                renderTransactionsTable();
            }
            
            // Change mobile page title
            const titleMap = {
                'dashboard': 'หน้าแรก',
                'chat': 'คุยกับมานี',
                'transactions': 'ประวัติ',
                'pos': 'POS',
                'products': 'สินค้า'
            };
            const titleEl = document.getElementById('mobile-page-title');
            if (titleEl && titleMap[tab]) {
                titleEl.textContent = titleMap[tab];
            }
            
            // Auto close sidebar on mobile when navigating
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('open');
                if(overlay) overlay.classList.remove('active');
            }
        });
    });
}

function setupSettings() {
    const modal = document.getElementById('settings-modal');
    const openBtn = document.getElementById('open-settings-btn');
    const closeBtn = document.getElementById('close-modal-btn');
    const saveBtn = document.getElementById('save-settings-btn');
    const keyInput = document.getElementById('gemini-api-key');

    if (!modal || !keyInput) return;

    // Load saved key
    if (apiKey) keyInput.value = apiKey;

    // Show modal if no key on first load
    if (!apiKey) {
        modal.classList.add('active');
    }

    if (openBtn) {
        openBtn.addEventListener('click', () => {
            modal.classList.add('active');
            // Close mobile sidebar
            const sidebar = document.querySelector('.sidebar');
            const overlay = document.getElementById('sidebar-overlay');
            if (window.innerWidth <= 768 && sidebar) {
                sidebar.classList.remove('mobile-open');
                if(overlay) overlay.classList.remove('active');
            }
        });
    }
    if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.remove('active'));

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const key = keyInput.value.trim();
            if (key) {
                apiKey = key;
                localStorage.setItem('manee_api_key', key);
                modal.classList.remove('active');
                if (typeof addChatMessage === 'function') addChatMessage("ระบบ", "บันทึก API Key เรียบร้อยแล้ว พร้อมใช้งานค่ะ!", "ai");
            } else {
                alert("กรุณาใส่ API Key");
            }
        });
    }

    // Logout Logic
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (confirm("ต้องการออกจากระบบใช่หรือไม่?")) {
                try {
                    await window.dbAPI.signOut();
                    window.location.reload();
                } catch (e) {
                    alert("ออกจากระบบไม่สำเร็จ: " + e.message);
                }
            }
        });
    }

    // Backup & Restore Logic
    const exportBtn = document.getElementById('export-data-btn');
    const importInput = document.getElementById('import-file-input');

    if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
            try {
                const allTxs = await window.dbAPI.getTransactions();
                const allProds = await window.dbAPI.getProducts();
                const data = {
                    transactions: allTxs,
                    products: allProds,
                    exportDate: new Date().toISOString()
                };
                
                // Add BOM for Excel compatibility if needed, but we use JSON.
                const jsonStr = JSON.stringify(data, null, 2);
                const blob = new Blob([jsonStr], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                
                const dlAnchorElem = document.createElement('a');
                dlAnchorElem.setAttribute("href", url);
                dlAnchorElem.setAttribute("download", `manee_backup_${new Date().toISOString().split('T')[0]}.json`);
                document.body.appendChild(dlAnchorElem);
                dlAnchorElem.click();
                document.body.removeChild(dlAnchorElem);
                URL.revokeObjectURL(url);
                
            } catch (e) {
                alert('เกิดข้อผิดพลาดในการสำรองข้อมูล: ' + e.message);
            }
        });
    }

    if (importInput) {
        importInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    if (data.transactions && data.products) {
                        if (confirm(`พบข้อมูลรายการ ${data.transactions.length} รายการ และเมนูสินค้า ${data.products.length} รายการ\nคุณต้องการกู้คืนข้อมูลนี้หรือไม่? (ข้อมูลปัจจุบันจะถูกลบและแทนที่ด้วยข้อมูลใหม่นี้)`)) {
                            
                            await window.dbAPI.clearAllData();
                            
                            let txCount = 0;
                            for (let tx of data.transactions) {
                                await window.dbAPI.addTransaction(tx);
                                txCount++;
                            }
                            
                            let prodCount = 0;
                            for (let prod of data.products) {
                                await window.dbAPI.addProduct(prod);
                                prodCount++;
                            }
                            
                            alert(`กู้คืนข้อมูลสำเร็จแล้ว!\nรายการบัญชี: ${txCount}\nเมนูสินค้า: ${prodCount}\nระบบจะทำการรีเฟรชหน้าจอ...`);
                            location.reload();
                        }
                    } else {
                        alert('ไฟล์ไม่ถูกต้องหรือไม่ใช่ไฟล์สำรองข้อมูลของระบบมานีบัญชี');
                    }
                } catch (error) {
                    alert('ไม่สามารถอ่านไฟล์ได้: ' + error.message);
                }
                importInput.value = ''; // Reset input
            };
            reader.readAsText(file);
        });
    }
}

let currentChatImageBase64 = null;
let currentChatImageMimeType = null;
let currentChatDocBase64 = null;
let currentChatDocMimeType = null;
let currentChatDocName = null;

function setupChat() {
    const todayStr = new Date().toISOString().split('T')[0];
    const savedDate = localStorage.getItem('manee_chat_date');
    if (savedDate !== todayStr) {
        localStorage.setItem('manee_chat_date', todayStr);
        localStorage.removeItem('manee_chat_history');
        chatHistory = [];
    } else {
        chatHistory = JSON.parse(localStorage.getItem('manee_chat_history')) || [];
        // Render history
        chatHistory.forEach(msg => {
            addChatMessage(msg.sender, msg.htmlContent, msg.type, false);
        });
    }

    const sendBtn = document.getElementById('chat-send-btn');
    const micBtn = document.getElementById('line-mic-btn');
    const input = document.getElementById('chat-input');
    const fileInput = document.getElementById('chat-image-upload');
    const docInput = document.getElementById('chat-doc-upload');
    const previewContainer = document.getElementById('chat-image-preview-container');
    const previewImg = document.getElementById('chat-image-preview');
    const removeImgBtn = document.getElementById('remove-image-btn');
    const docPreviewContainer = document.getElementById('chat-doc-preview-container');
    const docNameSpan = document.getElementById('chat-doc-name');
    const removeDocBtn = document.getElementById('remove-doc-btn');

    if (sendBtn) {
        sendBtn.addEventListener('click', () => {
            if (input.value.trim().length > 0 || currentChatImageBase64 || currentChatDocBase64) {
                handleSendMessage();
            }
        });
    }
    
    // Web Speech API for Mic
    let recognition = null;
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.lang = 'th-TH';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = function() {
            if(micBtn) micBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="red" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3" fill="red"></circle></svg>';
            input.placeholder = 'กำลังฟัง...';
        };

        recognition.onresult = function(event) {
            const speechResult = event.results[0][0].transcript;
            input.value += (input.value ? ' ' : '') + speechResult;
            input.dispatchEvent(new Event('input')); // trigger height resize and button toggle
        };

        recognition.onerror = function(event) {
            showToast("ไม่สามารถรับเสียงได้ กรุณาลองใหม่");
        };

        recognition.onend = function() {
            if(micBtn) micBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>';
            input.placeholder = 'พิมพ์ข้อความที่นี่...';
        };
    }

    if (micBtn) {
        micBtn.addEventListener('click', () => {
            if (recognition) {
                try { recognition.start(); } catch(e) {}
            } else {
                showToast("เบราว์เซอร์ของคุณไม่รองรับการสั่งงานด้วยเสียง");
            }
        });
    }
    
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            // On mobile, let Enter add a new line. User must tap Send button.
            if (window.innerWidth <= 768) return; 
            
            e.preventDefault();
            handleSendMessage();
        }
    });

    input.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        if (typeof handleLineInput === 'function') handleLineInput();
    });

    // Image Upload
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                currentChatImageMimeType = file.type;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    currentChatImageBase64 = ev.target.result.split(',')[1];
                    previewImg.src = ev.target.result;
                    previewContainer.style.display = 'block';
                };
                reader.readAsDataURL(file);
            }
        });
    }

    if (removeImgBtn) {
        removeImgBtn.addEventListener('click', () => {
            currentChatImageBase64 = null;
            currentChatImageMimeType = null;
            if(fileInput) fileInput.value = '';
            if(previewContainer) previewContainer.style.display = 'none';
            if(previewImg) previewImg.src = '';
        });
    }

    // Document Upload
    if (docInput) {
        docInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                currentChatDocMimeType = file.type;
                currentChatDocName = file.name;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    currentChatDocBase64 = ev.target.result.split(',')[1];
                    if(docNameSpan) docNameSpan.innerText = file.name;
                    if(docPreviewContainer) docPreviewContainer.style.display = 'block';
                };
                reader.readAsDataURL(file);
            }
        });
    }

    if (removeDocBtn) {
        removeDocBtn.addEventListener('click', () => {
            currentChatDocBase64 = null;
            currentChatDocMimeType = null;
            currentChatDocName = null;
            if(docInput) docInput.value = '';
            if(docPreviewContainer) docPreviewContainer.style.display = 'none';
        });
    }
}

async function handleSendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    const hasImage = !!currentChatImageBase64;
    const hasDoc = !!currentChatDocBase64;
    
    if (!text && !hasImage && !hasDoc) return;

    // Add user message
    let userMsgHtml = text ? text.replace(/\n/g, '<br>') : '';
    if (hasImage) {
        userMsgHtml += `<br><img src="data:${currentChatImageMimeType};base64,${currentChatImageBase64}" style="max-height: 150px; border-radius: 8px; margin-top: 8px;">`;
    }
    if (hasDoc) {
        userMsgHtml += `<br><div style="background: rgba(0,0,0,0.05); padding: 8px; border-radius: 8px; margin-top: 8px; display: inline-flex; align-items: center; gap: 8px;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg> <span style="font-size: 14px;">${currentChatDocName}</span></div>`;
    }
    
    addChatMessage("คุณ", userMsgHtml, "user");
    
    // Clear inputs
    input.value = '';
    input.style.height = 'auto';
    
    if(typeof handleLineInput === 'function') {
        handleLineInput();
    }
    const previewContainer = document.getElementById('chat-image-preview-container');
    if(previewContainer) previewContainer.style.display = 'none';
    const docPreviewContainer = document.getElementById('chat-doc-preview-container');
    if(docPreviewContainer) docPreviewContainer.style.display = 'none';
    
    const b64 = currentChatImageBase64 || currentChatDocBase64;
    const mime = currentChatImageMimeType || currentChatDocMimeType;
    
    currentChatImageBase64 = null;
    currentChatImageMimeType = null;
    currentChatDocBase64 = null;
    currentChatDocMimeType = null;
    currentChatDocName = null;
    
    const fileInput = document.getElementById('chat-image-upload');
    if(fileInput) fileInput.value = '';
    const docInput = document.getElementById('chat-doc-upload');
    if(docInput) docInput.value = '';

    // Add loading indicator
    const loadingId = addChatMessage("มานี", "<span class='loading-dots'>กำลังคิด</span>", "ai", false);

    try {
        const response = await window.aiAPI.processUserMessage(text, apiKey, transactions, b64, mime);
        
        // Remove loading
        document.getElementById(loadingId).remove();
        
        // Show AI reply (using marked to parse markdown)
        addChatMessage("มานี", marked.parse(response.reply), "ai", true);

        // Save new transactions
        if (response.transactions && response.transactions.length > 0) {
            for (const tx of response.transactions) {
                // Force use the exact current time from the device to avoid timezone/format bugs from AI
                let txDate = new Date().toISOString();
                
                await window.dbAPI.addTransaction({
                    date: txDate,
                    category: tx.category,
                    type: tx.type,
                    detail: tx.detail,
                    amount: Number(tx.amount)
                });
            }
            await loadTransactions();
            updateDashboard(); // Refresh dashboard in background
        }

    } catch (error) {
        document.getElementById(loadingId).remove();
        addChatMessage("ระบบ", `ข้อผิดพลาด: ${error.message}`, "ai", false);
    }
}

function addChatMessage(sender, htmlContent, type, save = true) {
    const container = document.getElementById('chat-messages');
    const id = 'msg-' + Date.now();
    
    const msgDiv = document.createElement('div');
    msgDiv.id = id;
    msgDiv.className = `message ${type}`;
    
    // We trust the HTML content here as it's parsed from our controlled marked.js
    msgDiv.innerHTML = `
        <div class="message-content">
            ${htmlContent}
        </div>
    `;
    
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
    
    if (save) {
        chatHistory.push({ sender, htmlContent, type });
        localStorage.setItem('manee_chat_history', JSON.stringify(chatHistory));
    }
    
    return id;
}

let currentTxCategory = 'all';
let currentTxType = 'all';

function setupTransactionsTable() {
    const categoryBtns = document.querySelectorAll('#filter-category .tx-filter-btn');
    categoryBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            categoryBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentTxCategory = e.target.getAttribute('data-filter');
            renderTransactionsTable();
        });
    });
    
    const typeBtns = document.querySelectorAll('#filter-type .tx-filter-btn');
    typeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            typeBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentTxType = e.target.getAttribute('data-filter');
            renderTransactionsTable();
        });
    });

    const dateFilter = document.getElementById('filter-date');
    if (dateFilter) {
        // Set to today's date by default (local timezone YYYY-MM-DD)
        const todayObj = new Date();
        const yyyy = todayObj.getFullYear();
        const mm = String(todayObj.getMonth() + 1).padStart(2, '0');
        const dd = String(todayObj.getDate()).padStart(2, '0');
        dateFilter.value = `${yyyy}-${mm}-${dd}`;
        
        dateFilter.addEventListener('change', () => {
            renderTransactionsTable();
        });
    }
}

function setupDashboardFilter() {
    const periodSelect = document.getElementById('dashboard-period-select');
    if (periodSelect) {
        periodSelect.addEventListener('change', () => {
            updateDashboard();
        });
    }
}

async function loadTransactions() {
    transactions = await window.dbAPI.getTransactions();
    
    // Fix corrupt dates from old AI responses
    let hasCorrupt = false;
    for (const tx of transactions) {
        if (!tx.date || tx.date === "YYYY-MM-DDTHH:mm:ss.000Z" || isNaN(new Date(tx.date).getTime())) {
            tx.date = new Date().toISOString(); // Default to today
            if (window.dbAPI.updateTransaction) {
                await window.dbAPI.updateTransaction(tx);
                hasCorrupt = true;
            }
        }
    }
    
    if (hasCorrupt) {
        transactions = await window.dbAPI.getTransactions();
    }
    
    renderTransactionsTable();
    updateDashboard();
    renderPOSStats();
    if (typeof renderCalendar === 'function') renderCalendar();
}

function renderTransactionsTable() {
    const tbody = document.getElementById('transactions-tbody');
    tbody.innerHTML = '';

    const dateFilterValue = document.getElementById('filter-date')?.value;

    const filteredTx = transactions.filter(tx => {
        const matchCategory = currentTxCategory === 'all' || tx.category === currentTxCategory;
        const matchType = currentTxType === 'all' || tx.type === currentTxType;
        
        let matchDate = true;
        if (dateFilterValue) {
            const txDateObj = new Date(tx.date);
            const yyyy = txDateObj.getFullYear();
            const mm = String(txDateObj.getMonth() + 1).padStart(2, '0');
            const dd = String(txDateObj.getDate()).padStart(2, '0');
            const txLocalISO = `${yyyy}-${mm}-${dd}`;
            matchDate = txLocalISO === dateFilterValue;
        }

        return matchCategory && matchType && matchDate;
    });

    let summaryIncome = 0;
    let summaryExpense = 0;

    filteredTx.forEach(tx => {
        if (tx.type === 'income') summaryIncome += tx.amount;
        else summaryExpense += tx.amount;
    });

    const summaryNet = summaryIncome - summaryExpense;

    document.getElementById('tx-summary-income').textContent = `฿${summaryIncome.toLocaleString()}`;
    document.getElementById('tx-summary-expense').textContent = `฿${summaryExpense.toLocaleString()}`;
    
    const netEl = document.getElementById('tx-summary-net');
    netEl.textContent = `฿${summaryNet.toLocaleString()}`;
    if (summaryNet > 0) netEl.style.color = 'var(--profit-color)';
    else if (summaryNet < 0) netEl.style.color = 'var(--danger-color)';
    else netEl.style.color = 'var(--text-primary)';

    if (filteredTx.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: #64748B;">ยังไม่มีข้อมูลรายการบัญชีในหมวดหมู่นี้</td></tr>';
        return;
    }

    filteredTx.forEach(tx => {
        const date = new Date(tx.date).toLocaleString('th-TH');
        const catBadge = tx.category === 'store' 
            ? '<span class="badge store">ร้านค้า</span>' 
            : '<span class="badge house">ครัวเรือน</span>';
            
        const typeBadge = tx.type === 'income' 
            ? '<span class="badge income">รายรับ</span>' 
            : '<span class="badge expense">รายจ่าย</span>';

        const amountColor = tx.type === 'income' ? 'var(--profit-color)' : 'var(--expense-color)';
        const prefix = tx.type === 'income' ? '+' : '-';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="col-date" data-label="วันที่-เวลา">${date}</td>
            <td class="col-category" data-label="หมวดหมู่">${catBadge}</td>
            <td class="col-type" data-label="ประเภท">${typeBadge}</td>
            <td class="col-detail" data-label="รายละเอียด">${tx.detail}</td>
            <td class="col-amount" data-label="จำนวนเงิน" style="color: ${amountColor}; font-weight: 500;">${prefix}฿${tx.amount.toLocaleString()}</td>
            <td class="col-action" data-label="ลบ">
                <button class="delete-btn" onclick="deleteTx('${tx.id}')">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.deleteTx = async function(id) {
    if (confirm('คุณต้องการลบรายการนี้ใช่หรือไม่?')) {
        await window.dbAPI.deleteTransaction(id);
        await loadTransactions();
    }
};

function getFilteredDashboardTransactions() {
    const periodSelect = document.getElementById('dashboard-period-select');
    const period = periodSelect ? periodSelect.value : 'today';
    
    if (period === 'all') return transactions;
    
    const now = new Date();
    let startDate = new Date();
    
    if (period === 'today') {
        startDate.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
        // Last 7 days including today
        startDate.setDate(now.getDate() - 6);
        startDate.setHours(0, 0, 0, 0);
    } else if (period === 'month') {
        // Since start of this month
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
    } else if (period === 'year') {
        // Since start of this year
        startDate.setMonth(0, 1);
        startDate.setHours(0, 0, 0, 0);
    }
    
    return transactions.filter(tx => new Date(tx.date) >= startDate);
}

function updateDashboard() {
    let storeIncome = 0;
    let storeExpense = 0;
    let houseIncome = 0;
    let houseExpense = 0;

    const filteredTx = getFilteredDashboardTransactions();

    filteredTx.forEach(tx => {
        if (tx.category === 'store') {
            if (tx.type === 'income') storeIncome += tx.amount;
            else storeExpense += tx.amount;
        } else {
            if (tx.type === 'income') houseIncome += tx.amount;
            else houseExpense += tx.amount;
        }
    });

    const storeProfit = storeIncome - storeExpense;
    const totalIncome = storeIncome + houseIncome;
    const totalExpense = storeExpense + houseExpense;
    const netBalance = totalIncome - totalExpense;

    const safeSetText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    };

    safeSetText('summary-store-profit', `฿${storeProfit.toLocaleString()}`);
    safeSetText('summary-store-expense', `฿${storeExpense.toLocaleString()}`);
    safeSetText('summary-house-expense', `฿${houseExpense.toLocaleString()}`);
    safeSetText('summary-total-income', `฿${totalIncome.toLocaleString()}`);
    safeSetText('summary-net-balance', `฿${netBalance.toLocaleString()}`);

    // Update Best Sellers with filtered data
    updateBestSellers(filteredTx);

    // Update Chart
    const ctx = document.getElementById('mainChart').getContext('2d');
    
    const chartData = {
        labels: ['รายรับร้านค้า', 'รายจ่ายร้านค้า', 'รายรับครัวเรือน', 'รายจ่ายครัวเรือน'],
        datasets: [{
            data: [storeIncome, storeExpense, houseIncome, houseExpense],
            backgroundColor: [
                '#10B981', // green
                '#F59E0B', // amber
                '#06B6D4', // cyan
                '#EF4444'  // red
            ],
            borderWidth: 0
        }]
    };

    Chart.register(ChartDataLabels);

    if (chartInstance) {
        chartInstance.data = chartData;
        chartInstance.update();
    } else {
        chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            font: { family: "'Sarabun', sans-serif" }
                        }
                    },
                    datalabels: {
                        color: '#fff',
                        font: {
                            weight: 'bold',
                            size: 14
                        },
                        formatter: (value, context) => {
                            if (value === 0) return null;
                            const dataArr = context.chart.data.datasets[0].data;
                            let sum = 0;
                            dataArr.forEach(data => sum += data);
                            let percentage = (value * 100 / sum).toFixed(1) + "%";
                            return percentage;
                        }
                    }
                }
            }
        });
    }
}

async function generateInsight() {
    const insightBox = document.getElementById('insight-content');
    if (!insightBox) return;

    if (!apiKey || apiKey === '') {
        insightBox.innerHTML = '<p class="insight-placeholder">กรุณาตั้งค่า API Key เพื่อดูคำแนะนำ</p>';
        return;
    }

    if (transactions.length === 0) {
        insightBox.innerHTML = '<p class="insight-placeholder">ยังไม่มีข้อมูลบัญชีให้วิเคราะห์ ลองเพิ่มรายรับรายจ่ายดูก่อนนะครับ</p>';
        return;
    }

    insightBox.innerHTML = '<p class="insight-placeholder"><span class="loading-dots">กำลังวิเคราะห์ข้อมูลการเงินของคุณ</span></p>';
    
    try {
        const response = await window.aiAPI.processUserMessage("วิเคราะห์ภาพรวมการเงินสั้นๆ ให้หน่อย", apiKey, transactions);
        insightBox.innerHTML = marked.parse(response.reply);
    } catch (e) {
        insightBox.innerHTML = `<p style="color: var(--expense-color);">เกิดข้อผิดพลาดในการวิเคราะห์: ${e.message}</p>`;
    }
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    toast.innerText = message;
    toast.className = 'toast show ' + type;
    
    setTimeout(() => {
        toast.className = 'toast';
    }, 3000);
}

// --- POS & Menu Management ---

function setupProducts() {
    const addBtn = document.getElementById('add-product-btn');
    if (addBtn) {
        addBtn.addEventListener('click', async () => {
            const nameInput = document.getElementById('new-product-name');
            const priceInput = document.getElementById('new-product-price');
            const categorySelect = document.getElementById('new-product-category');
            const colorSelect = document.getElementById('new-product-color');

            const name = nameInput.value.trim();
            const price = parseFloat(priceInput.value);
            const category = categorySelect ? categorySelect.value : 'ทั่วไป';
            const color = colorSelect.value;
            const orderInput = document.getElementById('new-product-order');
            const sort_order = orderInput ? parseInt(orderInput.value) || 0 : 0;

            if (!name || isNaN(price) || price < 0) {
                showToast("กรุณากรอกชื่อและราคาให้ถูกต้อง", "error");
                return;
            }

            const newProduct = { name, price, category, color };
            const addedProd = await window.dbAPI.addProduct(newProduct);
            
            if (addedProd && addedProd.id) {
                let savedOrder = JSON.parse(localStorage.getItem('menuSortOrder')) || {};
                savedOrder[addedProd.id] = sort_order;
                localStorage.setItem('menuSortOrder', JSON.stringify(savedOrder));
            }
            
            nameInput.value = '';
            priceInput.value = '';
            if (orderInput) orderInput.value = (sort_order + 1).toString();
            showToast("เพิ่มเมนูเรียบร้อยแล้ว");
            
            await loadProducts();
        });
    }
}

async function loadProducts() {
    products = await window.dbAPI.getProducts();
    
    // Load sort order from localStorage
    const savedOrder = JSON.parse(localStorage.getItem('menuSortOrder') || '{}');
    
    // Apply order
    products.forEach(p => {
        p.sort_order = savedOrder[p.id] !== undefined ? savedOrder[p.id] : 999;
    });

    // Sort products by order (ascending), then by name
    products.sort((a, b) => {
        const orderA = a.sort_order;
        const orderB = b.sort_order;
        if (orderA !== orderB) return orderA - orderB;
        return (a.name || '').localeCompare(b.name || '');
    });
    renderManageMenuTable();
    renderPOSGrid();
}

function renderManageMenuTable() {
    const table = document.getElementById('menu-table');
    if (!table) return;
    
    const existingTbodies = table.querySelectorAll('tbody');
    existingTbodies.forEach(tb => tb.remove());
    
    if (products.length === 0) {
        const emptyTbody = document.createElement('tbody');
        emptyTbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: #64748B;">ยังไม่มีเมนูสินค้า กรุณาเพิ่มเมนูใหม่</td></tr>';
        table.appendChild(emptyTbody);
        return;
    }

    const grouped = {};
    products.forEach(p => {
        const cat = p.category || 'ทั่วไป';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(p);
    });

    let catIndex = 0;
    for (const cat in grouped) {
        const catId = `menu-cat-${catIndex}`;
        
        const headerTbody = document.createElement('tbody');
        const headerTr = document.createElement('tr');
        headerTr.className = 'menu-category-header';
        headerTr.innerHTML = `
            <td colspan="6" style="background-color: #f8fafc; cursor: pointer; border-bottom: 2px solid #e2e8f0;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <strong style="font-size: 15px; color: var(--primary-color);">${cat} <span style="font-size: 13px; color: var(--text-secondary); font-weight: normal;">(${grouped[cat].length} รายการ)</span></strong>
                    <span class="accordion-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></span>
                </div>
            </td>
        `;
        headerTbody.appendChild(headerTr);
        table.appendChild(headerTbody);

        const itemsTbody = document.createElement('tbody');
        itemsTbody.className = `sortable-category ${catId}`;
        
        grouped[cat].forEach(p => {
            const tr = document.createElement('tr');
            tr.className = `menu-item-row`;
            tr.dataset.id = p.id;
            tr.innerHTML = `
                <td class="drag-handle" style="cursor: grab; width: 30px; text-align: center; color: #cbd5e1;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>
                </td>
                <td><span class="color-dot" style="background-color: ${p.color};"></span></td>
                <td style="font-size: 13px;">${p.name}</td>
                <td class="hide-on-mobile"><span class="badge" style="background-color:#E2E8F0;color:#1E293B;">${cat}</span></td>
                <td style="font-size: 13px;">฿${p.price.toLocaleString()}</td>
                <td style="text-align: right; white-space: nowrap;">
                    <div style="display: flex; justify-content: flex-end; align-items: center; gap: 8px;">
                        <button class="btn btn-icon" onclick="editProduct('${p.id}')" style="color: var(--primary-color); padding: 6px; border-radius: 8px; display: inline-flex; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button class="delete-btn" onclick="deleteProduct('${p.id}')" style="padding: 6px; border-radius: 8px; display: inline-flex; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </td>
            `;
            itemsTbody.appendChild(tr);
        });
        
        table.appendChild(itemsTbody);

        headerTr.onclick = function() {
            const isExpanded = this.classList.contains('expanded');
            const icon = this.querySelector('polyline');
            if (isExpanded) {
                this.classList.remove('expanded');
                icon.setAttribute('points', '6 9 12 15 18 9');
                itemsTbody.style.display = 'none';
            } else {
                this.classList.add('expanded');
                icon.setAttribute('points', '18 15 12 9 6 15');
                itemsTbody.style.display = '';
            }
        };

        itemsTbody.style.display = 'none';

        if (window.Sortable) {
            Sortable.create(itemsTbody, {
                animation: 150,
                handle: '.drag-handle',
                onEnd: async function(evt) {
                    const tbody = evt.to;
                    const rows = tbody.querySelectorAll('.menu-item-row');
                    
                    const savedOrder = JSON.parse(localStorage.getItem('menuSortOrder') || '{}');
                    
                    for (let i = 0; i < rows.length; i++) {
                        const id = rows[i].dataset.id;
                        savedOrder[id] = i + 1;
                        
                        const p = products.find(prod => prod.id === id);
                        if (p) p.sort_order = i + 1;
                    }
                    
                    // Save to local storage since we can't alter DB schema directly
                    localStorage.setItem('menuSortOrder', JSON.stringify(savedOrder));
                    
                    products.sort((a, b) => {
                        const orderA = a.sort_order !== undefined ? a.sort_order : 999;
                        const orderB = b.sort_order !== undefined ? b.sort_order : 999;
                        if (orderA !== orderB) return orderA - orderB;
                        return (a.name || '').localeCompare(b.name || '');
                    });
                    renderPOSGrid();
                }
            });
        }
        
        catIndex++;
    }
}

window.deleteProduct = async function(id) {
    if (confirm('คุณต้องการลบเมนูนี้ใช่หรือไม่?')) {
        await window.dbAPI.deleteProduct(id);
        await loadProducts();
        showToast("ลบเมนูเรียบร้อยแล้ว");
    }
}

window.editProduct = function(id) {
    const product = products.find(p => p.id === id);
    if (!product) return;
    
    document.getElementById('edit-product-id').value = product.id;
    document.getElementById('edit-product-name').value = product.name;
    document.getElementById('edit-product-price').value = product.price;
    document.getElementById('edit-product-category').value = product.category || 'กาแฟ';
    document.getElementById('edit-product-color').value = product.color;
    document.getElementById('edit-product-order').value = product.sort_order !== undefined ? product.sort_order : 999;
    
    document.getElementById('edit-product-modal').classList.add('active');
}

// Edit Product Modal events
document.addEventListener('DOMContentLoaded', () => {
    const saveBtn = document.getElementById('save-edit-product-btn');
    const cancelBtn = document.getElementById('cancel-edit-product-btn');
    const modal = document.getElementById('edit-product-modal');
    
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const id = document.getElementById('edit-product-id').value;
            const name = document.getElementById('edit-product-name').value.trim();
            const price = Number(document.getElementById('edit-product-price').value);
            const category = document.getElementById('edit-product-category').value;
            const color = document.getElementById('edit-product-color').value;
            const sort_order = parseInt(document.getElementById('edit-product-order').value) || 0;
            
            if (!name || isNaN(price) || price < 0) {
                alert('กรุณากรอกข้อมูลให้ครบถ้วนและถูกต้อง');
                return;
            }
            
            await window.dbAPI.updateProduct({ id, name, price, category, color });
            
            // If they changed the order in the edit modal, save it to local storage
            let savedOrder = JSON.parse(localStorage.getItem('menuSortOrder')) || {};
            savedOrder[id] = sort_order;
            localStorage.setItem('menuSortOrder', JSON.stringify(savedOrder));
            
            modal.classList.remove('active');
            await loadProducts();
            showToast("แก้ไขเมนูเรียบร้อยแล้ว");
        });
    }
    
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            modal.classList.remove('active');
        });
    }
});;

function guessCategory(name) {
    if (!name) return 'ทั่วไป';
    if (name.includes('กาแฟ') || name.includes('ลาเต้') || name.includes('คาปู') || name.includes('เอสเปรสโซ') || name.includes('มอคค่า') || name.includes('อเมริกาโน่')) return 'กาแฟ';
    if (name.includes('ชา')) return 'ชา';
    if (name.includes('นม') || name.includes('โกโก้') || name.includes('ช็อกโกแลต')) return 'นม/โกโก้';
    if (name.includes('โซดา')) return 'อิตาเลียนโซดา';
    return 'ทั่วไป';
}

function renderPOSGrid() {
    const gridContainer = document.getElementById('pos-grid');
    if (!gridContainer) return;
    
    gridContainer.innerHTML = '';
    
    if (products.length === 0) {
        gridContainer.innerHTML = '<p style="color: #64748B; padding: 20px;">ยังไม่มีเมนู กรุณาไปที่ "จัดการเมนู" เพื่อเพิ่มสินค้าก่อนใช้งาน POS</p>';
        return;
    }

    // Group products
    const grouped = {};
    products.forEach(p => {
        const cat = p.category || guessCategory(p.name);
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(p);
    });

    // Sort categories
    let catOrder = JSON.parse(localStorage.getItem('posCategorySortOrder')) || [];
    const cats = Object.keys(grouped).sort((a, b) => {
        let ia = catOrder.indexOf(a);
        let ib = catOrder.indexOf(b);
        if (ia === -1) ia = 999;
        if (ib === -1) ib = 999;
        return ia - ib;
    });

    const posItemSortOrder = JSON.parse(localStorage.getItem('posItemSortOrder') || '{}');

    // Render each category
    for (const cat of cats) {
        const items = grouped[cat];
        
        // Sort items within category
        if (posItemSortOrder[cat]) {
            items.sort((a, b) => {
                let ia = posItemSortOrder[cat].indexOf(a.id.toString());
                let ib = posItemSortOrder[cat].indexOf(b.id.toString());
                if (ia === -1) ia = 999;
                if (ib === -1) ib = 999;
                return ia - ib;
            });
        }

        const section = document.createElement('details');
        section.className = 'pos-category-section filter-accordion';
        section.dataset.cat = cat;
        section.open = true; // Open by default
        
        const title = document.createElement('summary');
        title.className = 'pos-category-title';
        title.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;"><span>📂</span> ${cat}</div>
            <svg class="accordion-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
        `;
        section.appendChild(title);
        
        const grid = document.createElement('div');
        grid.className = 'pos-grid';
        
        items.forEach(p => {
            const btn = document.createElement('button');
            btn.className = 'pos-btn';
            btn.dataset.id = p.id;
            btn.style.backgroundColor = p.color || 'var(--primary-color)';
            
            btn.innerHTML = `
                <span style="font-size: 15px; line-height: 1.2; pointer-events: none;">${p.name}</span>
                <span class="pos-price" style="pointer-events: none;">฿${p.price.toLocaleString()}</span>
            `;
            
            btn.addEventListener('click', async () => {
                const tx = {
                    date: new Date().toISOString(),
                    category: 'store',
                    type: 'income',
                    detail: p.name,
                    amount: p.price
                };
                
                await window.dbAPI.addTransaction(tx);
                await loadTransactions();
                
                showToast(`ขาย ${p.name} (฿${p.price}) เรียบร้อย`);
            });
            
            grid.appendChild(btn);
        });
        
        section.appendChild(grid);
        gridContainer.appendChild(section);

        // Make items sortable
        if (window.Sortable) {
            Sortable.create(grid, {
                animation: 150,
                delay: 250,
                delayOnTouchOnly: true,
                swap: true, // Use swap mode to prevent grid cascading reflow
                swapClass: 'highlight', // Class applied to swap target
                forceFallback: true, // Fix native HTML5 drag ghost positioning on mobile
                fallbackOnBody: true,
                onEnd: function() {
                    const btns = grid.querySelectorAll('.pos-btn');
                    const catSort = JSON.parse(localStorage.getItem('posItemSortOrder') || '{}');
                    catSort[cat] = Array.from(btns).map(b => b.dataset.id);
                    localStorage.setItem('posItemSortOrder', JSON.stringify(catSort));
                }
            });
        }
    }

    // Make categories sortable
    if (window.Sortable) {
        Sortable.create(gridContainer, {
            animation: 150,
            delay: 250,
            delayOnTouchOnly: true,
            handle: '.pos-category-title',
            forceFallback: true, // Fix native HTML5 drag ghost positioning on mobile
            fallbackOnBody: true,
            onEnd: function() {
                const sections = gridContainer.querySelectorAll('.pos-category-section');
                const newOrder = Array.from(sections).map(sec => sec.dataset.cat);
                localStorage.setItem('posCategorySortOrder', JSON.stringify(newOrder));
            }
        });
    }
}

function updateBestSellers(txList) {
    const bsList = document.getElementById('best-sellers-list');
    if (!bsList) return;
    
    const targetTx = txList || transactions;
    
    // Calculate stats
    const itemStats = {};
    
    // Only count store income transactions
    targetTx.forEach(tx => {
        if (tx.category === 'store' && tx.type === 'income') {
            if (!itemStats[tx.detail]) {
                itemStats[tx.detail] = { count: 0, revenue: 0 };
            }
            itemStats[tx.detail].count += 1;
            itemStats[tx.detail].revenue += tx.amount;
        }
    });
    
    // Sort by revenue descending (or could sort by count)
    const sortedItems = Object.entries(itemStats)
        .sort((a, b) => b[1].revenue - a[1].revenue)
        .slice(0, 5); // Top 5
        
    bsList.innerHTML = '';
    
    if (sortedItems.length === 0) {
        bsList.innerHTML = '<p style="color: #64748B; font-size: 14px;">ยังไม่มีข้อมูลการขายสินค้า</p>';
        return;
    }
    
    sortedItems.forEach((item, index) => {
        const name = item[0];
        const stats = item[1];
        
        const div = document.createElement('div');
        div.className = 'best-seller-item';
        div.innerHTML = `
            <div class="bs-rank">#${index + 1}</div>
            <div class="bs-info">
                <div class="bs-name">${name}</div>
                <div class="bs-qty">${stats.count} แก้ว/ชิ้น</div>
            </div>
            <div class="bs-amount">฿${stats.revenue.toLocaleString()}</div>
        `;
        bsList.appendChild(div);
    });
}

function renderPOSStats() {
    const statsList = document.getElementById('pos-stats-list');
    const totalEl = document.getElementById('pos-today-total');
    if (!statsList || !totalEl) return;
    
    // Get today's start date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let totalSales = 0;
    let totalItems = 0;
    const itemStats = {};
    
    transactions.forEach(tx => {
        const txDate = new Date(tx.date);
        if (tx.category === 'store' && tx.type === 'income' && txDate >= today) {
            if (!itemStats[tx.detail]) itemStats[tx.detail] = { count: 0, revenue: 0 };
            itemStats[tx.detail].count += 1;
            itemStats[tx.detail].revenue += tx.amount;
            totalSales += tx.amount;
            totalItems += 1;
        }
    });
    
    const sortedItems = Object.entries(itemStats).sort((a, b) => b[1].revenue - a[1].revenue);
    
    statsList.innerHTML = '';
    
    if (sortedItems.length === 0) {
        statsList.innerHTML = '<p style="color: #64748B; font-size: 14px; text-align: center; padding: 20px 0;">ยังไม่มียอดขายวันนี้</p>';
    } else {
        sortedItems.forEach(item => {
            const name = item[0];
            const stats = item[1];
            statsList.innerHTML += `
                <div class="pos-stat-item">
                    <div>
                        <div class="pos-stat-name">${name}</div>
                        <div class="pos-stat-qty">${stats.count} รายการ</div>
                    </div>
                    <div class="pos-stat-amount">฿${stats.revenue.toLocaleString()}</div>
                </div>
            `;
        });
    }
    
    totalEl.innerText = `฿${totalSales.toLocaleString()}`;
    const itemsTotalEl = document.getElementById('pos-today-items-total');
    if (itemsTotalEl) {
        itemsTotalEl.innerHTML = `${totalItems} <span style="font-size: 16px; font-weight: 400; color: var(--text-secondary);">รายการ</span>`;
    }
}

function setupPOSDailySummary() {
    const closeShopBtn = document.getElementById('close-shop-btn');
    const modal = document.getElementById('daily-summary-modal');
    const closeBtn = document.getElementById('close-daily-summary-btn');
    
    if (!closeShopBtn || !modal) return;
    
    closeShopBtn.addEventListener('click', handleCloseShop);
    closeBtn.addEventListener('click', () => modal.classList.remove('active'));
}

async function handleCloseShop() {
    const modal = document.getElementById('daily-summary-modal');
    const statsSummary = document.getElementById('daily-stats-summary');
    const insightBox = document.getElementById('daily-ai-insight');
    
    // Calculate today's stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let totalSales = 0;
    let totalItems = 0;
    const itemStats = {};
    const todayTransactions = [];
    
    transactions.forEach(tx => {
        const txDate = new Date(tx.date);
        if (tx.category === 'store' && tx.type === 'income' && txDate >= today) {
            todayTransactions.push(tx);
            if (!itemStats[tx.detail]) itemStats[tx.detail] = { count: 0, revenue: 0 };
            itemStats[tx.detail].count += 1;
            itemStats[tx.detail].revenue += tx.amount;
            totalSales += tx.amount;
            totalItems += 1;
        }
    });
    
    const sortedItems = Object.entries(itemStats).sort((a, b) => b[1].revenue - a[1].revenue);
    const bestSeller = sortedItems.length > 0 ? sortedItems[0] : null;
    
    statsSummary.innerHTML = `
        <div class="daily-summary-item">
            <span style="font-weight: 500;">จำนวนรายการขาย</span>
            <span style="font-weight: bold;">${totalItems} รายการ</span>
        </div>
        <div class="daily-summary-item">
            <span style="font-weight: 500;">รายรับรวมวันนี้</span>
            <span style="font-weight: bold; color: var(--profit-color); font-size: 18px;">฿${totalSales.toLocaleString()}</span>
        </div>
        ${bestSeller ? `
        <div class="daily-summary-item" style="background: #f0fdf4; border: 1px solid #bbf7d0;">
            <span style="font-weight: 500; color: #166534;">🌟 เมนูขายดีที่สุด</span>
            <span style="font-weight: bold; color: #166534;">${bestSeller[0]} (${bestSeller[1].count} แก้ว/ชิ้น)</span>
        </div>` : ''}
    `;
    
    modal.classList.add('active');
    
    // Get AI Insight
    if (!apiKey || apiKey === '') {
        insightBox.innerHTML = '<p class="insight-placeholder">กรุณาตั้งค่า API Key เพื่อดูคำแนะนำจาก AI</p>';
        return;
    }

    if (todayTransactions.length === 0) {
        insightBox.innerHTML = '<p class="insight-placeholder">วันนี้ยังไม่มีข้อมูลการขายหน้านร้านเลยครับ พรุ่งนี้สู้ใหม่นะครับ!</p>';
        return;
    }

    insightBox.innerHTML = '<p class="insight-placeholder"><span class="loading-dots">กำลังวิเคราะห์ยอดขายและหาแนวทางพัฒนา...</span></p>';
    
    try {
        const prompt = "นี่คือข้อมูลยอดขายหน้าร้านประจำวันนี้ วิเคราะห์ยอดขายให้หน่อยว่าเมนูไหนเด่น หรือมีอะไรน่าสนใจ พร้อมกับให้คำแนะนำและวิธีพัฒนาให้ยอดขายดีขึ้นในวันพรุ่งนี้ (ตอบแบบเป็นข้อๆ กระชับ เข้าใจง่าย):";
        const response = await window.aiAPI.processUserMessage(prompt, apiKey, todayTransactions);
        insightBox.innerHTML = marked.parse(response.reply);
    } catch (e) {
        insightBox.innerHTML = `<p style="color: var(--expense-color);">เกิดข้อผิดพลาดในการวิเคราะห์: ${e.message}</p>`;
    }
}

// --- Calendar View Logic ---
let currentCalDate = new Date();

function setupCalendar() {
    const prevBtn = document.getElementById('cal-prev-month');
    const nextBtn = document.getElementById('cal-next-month');
    const closeDetailBtn = document.getElementById('close-calendar-detail-btn');
    const modal = document.getElementById('calendar-detail-modal');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            currentCalDate.setMonth(currentCalDate.getMonth() - 1);
            renderCalendar();
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            currentCalDate.setMonth(currentCalDate.getMonth() + 1);
            renderCalendar();
        });
    }

    if (closeDetailBtn && modal) {
        closeDetailBtn.addEventListener('click', () => {
            modal.classList.remove('active');
        });
    }
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const title = document.getElementById('cal-current-month');
    if (!grid || !title) return;

    const year = currentCalDate.getFullYear();
    const month = currentCalDate.getMonth();

    const monthNames = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    title.innerText = `${monthNames[month]} ${year + 543}`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    grid.innerHTML = '';

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-day empty';
        grid.appendChild(emptyCell);
    }

    // Days of the month
    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-day';
        if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
            cell.classList.add('today');
        }

        // Calculate sales for this day
        let dailyIncome = 0;
        let dailyExpense = 0;
        const cellDateStart = new Date(year, month, day, 0, 0, 0);
        const cellDateEnd = new Date(year, month, day, 23, 59, 59);

        transactions.forEach(tx => {
            const txDate = new Date(tx.date);
            if (txDate >= cellDateStart && txDate <= cellDateEnd) {
                if (tx.type === 'income') dailyIncome += tx.amount;
                else dailyExpense += tx.amount;
            }
        });

        const netBalance = dailyIncome - dailyExpense;

        let salesHtml = '';
        if (dailyIncome > 0 || dailyExpense > 0) {
            if (netBalance > 0) salesHtml = `<span class="day-sales profit">+฿${netBalance.toLocaleString()}</span>`;
            else if (netBalance < 0) salesHtml = `<span class="day-sales loss">-฿${Math.abs(netBalance).toLocaleString()}</span>`;
            else salesHtml = `<span class="day-sales zero">฿0</span>`;
        } else {
            salesHtml = `<span class="day-sales zero">-</span>`;
        }

        cell.innerHTML = `
            <div class="day-number">${day}</div>
            ${salesHtml}
        `;

        cell.addEventListener('click', () => {
            showCalendarDetail(year, month, day);
        });

        grid.appendChild(cell);
    }
}

function showCalendarDetail(year, month, day) {
    const modal = document.getElementById('calendar-detail-modal');
    const title = document.getElementById('calendar-detail-title');
    const summary = document.getElementById('calendar-detail-summary');
    const tbody = document.getElementById('calendar-detail-tbody');
    
    if (!modal || !title || !summary || !tbody) return;

    const dateStart = new Date(year, month, day, 0, 0, 0);
    const dateEnd = new Date(year, month, day, 23, 59, 59);
    
    const displayDate = dateStart.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    title.innerText = `ยอดประจำวันที่ ${displayDate}`;

    let dailyIncome = 0;
    let dailyExpense = 0;
    let storeIncome = 0;
    const dailyTxs = [];

    transactions.forEach(tx => {
        const txDate = new Date(tx.date);
        if (txDate >= dateStart && txDate <= dateEnd) {
            dailyTxs.push(tx);
            if (tx.type === 'income') {
                dailyIncome += tx.amount;
                if (tx.category === 'store') storeIncome += tx.amount;
            } else {
                dailyExpense += tx.amount;
            }
        }
    });

    const netBalance = dailyIncome - dailyExpense;

    summary.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px;">
            <div style="background: white; border: 1px solid var(--border-color); padding: 12px; border-radius: 8px;">
                <div style="font-size: 13px; color: var(--text-secondary);">รายรับรวม</div>
                <div style="font-size: 18px; font-weight: bold; color: var(--profit-color);">฿${dailyIncome.toLocaleString()}</div>
            </div>
            <div style="background: white; border: 1px solid var(--border-color); padding: 12px; border-radius: 8px;">
                <div style="font-size: 13px; color: var(--text-secondary);">รายจ่ายรวม</div>
                <div style="font-size: 18px; font-weight: bold; color: var(--expense-color);">฿${dailyExpense.toLocaleString()}</div>
            </div>
            <div style="background: white; border: 1px solid var(--border-color); padding: 12px; border-radius: 8px;">
                <div style="font-size: 13px; color: var(--text-secondary);">ยอดคงเหลือ</div>
                <div style="font-size: 18px; font-weight: bold; color: ${netBalance >= 0 ? 'var(--profit-color)' : 'var(--expense-color)'};">
                    ${netBalance >= 0 ? '+' : '-'}฿${Math.abs(netBalance).toLocaleString()}
                </div>
            </div>
        </div>
    `;

    tbody.innerHTML = '';
    if (dailyTxs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #64748B;">ไม่มีรายการในวันนี้</td></tr>';
    } else {
        dailyTxs.sort((a, b) => new Date(b.date) - new Date(a.date));
        dailyTxs.forEach(tx => {
            const time = new Date(tx.date).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
            const typeBadge = tx.type === 'income' 
                ? '<span class="badge income">รายรับ</span>' 
                : '<span class="badge expense">รายจ่าย</span>';
            const amountColor = tx.type === 'income' ? 'var(--profit-color)' : 'var(--expense-color)';
            const prefix = tx.type === 'income' ? '+' : '-';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${time}</td>
                <td>${tx.detail} <span style="font-size: 12px; color: #64748B;">(${tx.category === 'store' ? 'ร้าน' : 'บ้าน'})</span></td>
                <td>${typeBadge}</td>
                <td style="color: ${amountColor}; font-weight: 500;">${prefix}฿${tx.amount.toLocaleString()}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    modal.classList.add('active');
}

window.forceUpdateApp = function() {
    if ('caches' in window) {
        caches.keys().then(function(names) {
            for (let name of names) caches.delete(name);
        });
    }
    window.location.reload(true);
};

// --- LINE Style UI Handlers ---
window.handleLineInput = function() {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');
    const micBtn = document.getElementById('line-mic-btn');
    const leftActions = document.getElementById('line-left-actions');
    const expandBtn = document.getElementById('line-expand-btn');

    if (input && input.value.trim().length > 0) {
        if(sendBtn) sendBtn.style.display = 'flex';
        if(micBtn) micBtn.style.display = 'none';
        if(leftActions) leftActions.style.display = 'none';
        if(expandBtn) expandBtn.style.display = 'flex';
    } else {
        if(sendBtn) sendBtn.style.display = 'none';
        if(micBtn) micBtn.style.display = 'flex';
        if(leftActions) leftActions.style.display = 'flex';
        if(expandBtn) expandBtn.style.display = 'none';
    }
};

window.toggleLineActions = function() {
    const leftActions = document.getElementById('line-left-actions');
    const expandBtn = document.getElementById('line-expand-btn');
    
    if (leftActions && expandBtn) {
        if (leftActions.style.display === 'none') {
            leftActions.style.display = 'flex';
            expandBtn.style.display = 'none';
        } else {
            leftActions.style.display = 'none';
            expandBtn.style.display = 'flex';
        }
    }
};
