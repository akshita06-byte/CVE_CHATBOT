// Show selected filename next to the Choose file label
const _fileInputEl = document.getElementById('fileInput');
const _fileLabelEl = document.querySelector('label[for="fileInput"]');
const _fileNameFallback = _fileLabelEl ? _fileLabelEl.textContent : 'Choose file';
if (_fileInputEl && _fileLabelEl) {
    _fileInputEl.addEventListener('change', function () {
        if (this.files && this.files.length > 0) {
            const fullName = this.files[0].name || '';
            // Display without extension for cleaner UI, but keep full filename in title for accessibility
            const displayName = fullName.replace(/\.(xlsx|xls|csv|txt|pdf|docx?|json|zip|rar)$/i, '');
            _fileLabelEl.textContent = displayName || fullName;
            _fileLabelEl.title = fullName;
        } else {
            _fileLabelEl.textContent = _fileNameFallback;
            _fileLabelEl.title = '';
        }
    });
}

// Bridge-aware fetch wrapper: prefer `window.api.fetch` when present (Electron preload),
// otherwise use the browser `fetch` implementation.
const _isBridge = (typeof window.api !== 'undefined' && typeof window.api.fetch === 'function');
class _BridgeResponse {
    constructor(raw) {
        this._raw = raw || {};
        this.ok = !!raw.ok;
        this.status = raw.status || 0;
        // normalize headers to a simple map
        this._headers = {};
        for (const k of Object.keys(raw.headers || {})) this._headers[k.toLowerCase()] = raw.headers[k];
    }
    async json() { return this._raw.body; }
    async text() { return (typeof this._raw.body === 'string') ? this._raw.body : JSON.stringify(this._raw.body); }
    headers = {
        get: (k) => this._headers[(k || '').toLowerCase()] || null
    }
}
const _fetch = _isBridge ? async (url, options) => {
    const r = await window.api.fetch(url, options);
    return new _BridgeResponse(r);
} : window.fetch.bind(window);

// --- Authentication UI wiring ---
const authOverlay = document.getElementById('authOverlay');
// Registration elements
const regEmail = document.getElementById('regEmail');
const regName = document.getElementById('regName');
const regMobile = document.getElementById('regMobile');
const regPassword = document.getElementById('regPassword');
const btnToggleRegPwd = document.getElementById('btnToggleRegPwd');
const regBtnRegister = document.getElementById('regBtnRegister');
const regBtnToLogin = document.getElementById('regBtnToLogin');

// Login elements
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const btnToggleLoginPwd = document.getElementById('btnToggleLoginPwd');
const loginBtnLogin = document.getElementById('loginBtnLogin');
const loginBtnToRegister = document.getElementById('loginBtnToRegister');

const registrationSection = document.getElementById('registrationSection');
const loginSection = document.getElementById('loginSection');

// legacy single-field auth (kept for backward compatibility, may be absent)
const authUsername = document.getElementById('authUsername');
const authPassword = document.getElementById('authPassword');
const authMessage = document.getElementById('authMessage');
const btnRegister = document.getElementById('btnShowRegister');
const btnLogin = document.getElementById('btnLogin');
const btnLogout = document.getElementById('btnLogout');
const userGreeting = document.getElementById('userGreeting');
const btnTogglePwd = document.getElementById('btnTogglePwd');
// (search-area user elements removed; header greeting + logout used)

function showAuthOverlay() {
    if (authOverlay) authOverlay.style.display = 'flex';
    document.body.classList.add('auth-locked');
}
function hideAuthOverlay() {
    if (authOverlay) authOverlay.style.display = 'none';
    document.body.classList.remove('auth-locked');
}

function setAuthMsg(msg, isError) {
    if (!authMessage) return;
    // set text
    authMessage.textContent = msg || '';
    // clear existing state classes
    authMessage.classList.remove('success', 'error', 'flash');
    if (!msg) return;
    // apply new state
    if (isError) authMessage.classList.add('error');
    else authMessage.classList.add('success');
    // trigger a pop/flash animation
    // force reflow to restart animation
    void authMessage.offsetWidth;
    authMessage.classList.add('flash');
    // auto-clear non-critical messages after a short delay
    setTimeout(() => {
        // only clear flash class but keep message for small time; remove classes after 4s
        authMessage.classList.remove('flash');
    }, 800);
    setTimeout(() => {
        // clear success messages after a short duration (keep errors until user action)
        if (!isError) {
            authMessage.textContent = '';
            authMessage.classList.remove('success');
        }
    }, 4200);
}

async function postJson(url, body) {
    const res = await _fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await (res.json ? res.json().catch(() => ({})) : Promise.resolve({}));
    return { ok: !!res.ok, status: res.status || 0, data };
}

async function tryRegister() {
    const username = (authUsername && authUsername.value || '').trim();
    const password = (authPassword && authPassword.value) || '';
    if (!username || !password) {
        setAuthMsg('Enter name and password', true);
        return;
    }
    // disable buttons while request runs
    if (btnRegister) btnRegister.disabled = true;
    if (btnLogin) btnLogin.disabled = true;
    setAuthMsg('Registering...', false);
    try {
    const resp = await postJson('http://127.0.0.1:5003/register', { username, password });
        if (resp.ok) {
            setAuthMsg('Registration successful. You are logged in.', false);
            localStorage.setItem('cve_user', username);
            updateHeaderForUser(username);
            hideAuthOverlay();
        } else {
            // FastAPI returns detail on errors; try to surface it
            const detail = resp.data && (resp.data.detail || resp.data.error || resp.data.message);
            if (resp.status === 409) {
                setAuthMsg(detail || 'You are already registered, please login', true);
            } else {
                setAuthMsg(detail || 'Registration failed', true);
            }
        }
    } catch (err) {
        setAuthMsg('Network error: ' + (err.message || err), true);
    } finally {
        if (btnRegister) btnRegister.disabled = false;
        if (btnLogin) btnLogin.disabled = false;
    }
}

async function tryLogin() {
    const username = (authUsername && authUsername.value || '').trim();
    const password = (authPassword && authPassword.value) || '';
    if (!username || !password) {
        setAuthMsg('Enter name and password', true);
        return;
    }
    if (btnLogin) btnLogin.disabled = true;
    if (btnRegister) btnRegister.disabled = true;
    setAuthMsg('Logging in...', false);
    try {
    const resp = await postJson('http://127.0.0.1:5003/login', { username, password });
        if (resp.ok) {
            setAuthMsg('Login successful', false);
            localStorage.setItem('cve_user', username);
            updateHeaderForUser(username);
            hideAuthOverlay();
        } else {
            const detail = resp.data && (resp.data.detail || resp.data.error || resp.data.message);
            setAuthMsg(detail || 'Login failed', true);
        }
    } catch (err) {
        setAuthMsg('Network error: ' + (err.message || err), true);
    } finally {
        if (btnLogin) btnLogin.disabled = false;
        if (btnRegister) btnRegister.disabled = false;
    }
}

// Legacy buttons (if present) still use backend endpoints
if (btnRegister) btnRegister.addEventListener('click', tryRegister);
if (btnLogin) btnLogin.addEventListener('click', tryLogin);

// Helper: show registration or login section
function showRegistration() {
    if (registrationSection) registrationSection.classList.remove('hidden');
    if (loginSection) loginSection.classList.add('hidden');
    const t = document.getElementById('authTitle'); if (t) t.textContent = 'Register — ACCESS CVE CHATBOT';
    setAuthMsg('', false);
}
function showLogin() {
    if (registrationSection) registrationSection.classList.add('hidden');
    if (loginSection) loginSection.classList.remove('hidden');
    const t = document.getElementById('authTitle'); if (t) t.textContent = 'Login — ACCESS CVE CHATBOT';
    setAuthMsg('', false);
}

// Local storage users key: store object mapping email -> {name,mobile,password}
function loadUsers() {
    try { return JSON.parse(localStorage.getItem('cve_users') || '{}'); } catch (e) { return {}; }
}
function saveUsers(u) { localStorage.setItem('cve_users', JSON.stringify(u)); }

// Registration flow — hits backend API so data persists in users.json
if (regBtnRegister) regBtnRegister.addEventListener('click', async function(){
    const email = (regEmail && regEmail.value || '').trim().toLowerCase();
    const name = (regName && regName.value || '').trim();
    const mobile = (regMobile && regMobile.value || '').trim();
    const pwd = (regPassword && regPassword.value || '');
    if (!email || !name || !mobile || !pwd) { setAuthMsg('Please fill all registration fields', true); return; }
    setAuthMsg('Registering...', false);
    try {
        const resp = await postJson('http://127.0.0.1:5003/register', { username: email, password: pwd });
        if (resp.ok) {
            setAuthMsg('Registration successful — now please login', false);
            if (loginEmail) loginEmail.value = email;
        } else {
            const detail = resp.data && (resp.data.detail || resp.data.error || resp.data.message);
            setAuthMsg(detail || 'Registration failed', true);
        }
    } catch (err) {
        setAuthMsg('Network error: ' + (err.message || err), true);
    }
});

// Navigate to Login from registration
if (regBtnToLogin) regBtnToLogin.addEventListener('click', function(){ showLogin(); });

// Login flow — hits backend API
if (loginBtnLogin) loginBtnLogin.addEventListener('click', async function(){
    const email = (loginEmail && loginEmail.value || '').trim().toLowerCase();
    const pwd = (loginPassword && loginPassword.value || '');
    if (!email || !pwd) { setAuthMsg('Please enter email and password', true); return; }
    setAuthMsg('Logging in...', false);
    try {
        const resp = await postJson('http://127.0.0.1:5003/login', { username: email, password: pwd });
        if (resp.ok) {
            setAuthMsg('Login successful', false);
            const displayName = (resp.data && resp.data.username) || email;
            localStorage.setItem('cve_user', displayName);
            updateHeaderForUser(displayName);
            hideAuthOverlay();
        } else {
            const detail = resp.data && (resp.data.detail || resp.data.error || resp.data.message);
            setAuthMsg(detail || 'Login failed', true);
        }
    } catch (err) {
        setAuthMsg('Network error: ' + (err.message || err), true);
    }
});

if (loginBtnToRegister) loginBtnToRegister.addEventListener('click', function(){ showRegistration(); });

// Toggle password visibility for registration/login
if (btnToggleRegPwd && regPassword) {
    btnToggleRegPwd.addEventListener('click', function(){
        if (regPassword.type === 'password') { regPassword.type = 'text'; btnToggleRegPwd.textContent = 'Hide'; }
        else { regPassword.type = 'password'; btnToggleRegPwd.textContent = 'Show'; }
    });
}
if (btnToggleLoginPwd && loginPassword) {
    btnToggleLoginPwd.addEventListener('click', function(){
        if (loginPassword.type === 'password') { loginPassword.type = 'text'; btnToggleLoginPwd.textContent = 'Hide'; }
        else { loginPassword.type = 'password'; btnToggleLoginPwd.textContent = 'Show'; }
    });
}

// On load, check if user is already logged in
window.addEventListener('load', function () {
    // Always open registration on load, regardless of previous login.
    // If you'd like to allow persisting login in future, set allowPersistedLogin = true
    const allowPersistedLogin = true;
    if (allowPersistedLogin) {
        const u = localStorage.getItem('cve_user');
        if (u && u.length) {
            hideAuthOverlay();
            setAuthMsg('', false);
            updateHeaderForUser(u);
            return;
        }
    }

    // Clear any persisted login so the app always requires registration/login on fresh open
    try { localStorage.removeItem('cve_user'); } catch (e) { /* ignore */ }
    showAuthOverlay();
    showRegistration();
});

// Toggle password visibility
if (btnTogglePwd && authPassword) {
    btnTogglePwd.addEventListener('click', function () {
        if (authPassword.type === 'password') {
            authPassword.type = 'text';
            btnTogglePwd.textContent = 'Hide';
        } else {
            authPassword.type = 'password';
            btnTogglePwd.textContent = 'Show';
        }
    });
}

// Update header greeting and logout visibility
function updateHeaderForUser(username) {
    if (userGreeting) {
        userGreeting.textContent = `Hi, ${username}`;
        userGreeting.style.display = 'inline';
    }
    if (btnLogout) btnLogout.style.display = 'inline-block';
    // Only update top header greeting/logout; search-area removed
}

// Logout handler
if (btnLogout) {
    btnLogout.addEventListener('click', function () {
        localStorage.removeItem('cve_user');
        if (userGreeting) userGreeting.style.display = 'none';
        btnLogout.style.display = 'none';
    // search-area removed; only top header cleared below
        showAuthOverlay();
    });
}

// search-area logout removed; top header logout handles sign-out

// Allow Enter key to trigger Login inside auth modal
if (authOverlay) {
    authOverlay.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            // prefer login action
            e.preventDefault();
            tryLogin();
        }
    });
}

document.getElementById('cveForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const cveInput = document.getElementById('cveId').value.trim();
    const fileInput = document.getElementById('fileInput');

    const chat = document.getElementById('chat');
    const submitBtn = document.getElementById('submitBtn');
    const loading = document.getElementById('loading');

    // show loading state and disable inputs
    if (submitBtn) submitBtn.disabled = true;
    if (loading) loading.style.display = 'flex';

    // collect CVE IDs from file or text input
    let cveList = [];
    if (fileInput && fileInput.files && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        try {
            const name = (file.name || '').toLowerCase();
            if ((name.endsWith('.xlsx') || name.endsWith('.xls')) && window.XLSX) {
                cveList = await parseXlsxFileForCves(file);
            } else {
                const text = await file.text();
                cveList = parseFileForCves(text, file.name);
            }
            if (cveList.length === 0) {
                chat.innerHTML += `<p style="color:red;">❌ No CVE IDs found in file.</p>`;
                return;
            }
            updateSelectedCount(cveList.length);
        } catch (err) {
            chat.innerHTML += `<p style="color:red;">❌ Failed to read file: ${err.message}</p>`;
            return;
        }
    } else if (cveInput) {
        // Only treat input as multiple CVE IDs when the user explicitly separates them with commas.
        // If the input contains no commas but includes multiple space-separated tokens and at least one CVE-like token, block processing.
        if (cveInput.includes(',')) {
            // Allow flexible parsing when comma-separated list is provided
            cveList = parseFlexibleCveInput(cveInput);
        } else {
            // Strict pre-check: if the raw input contains more than one CVE-like match and no commas, require commas
                const reAll = /CVE[-\s]?\d{4}[-\s]?\d{2,7}/gi;
                const matches = cveInput.match(reAll) || [];
                if (matches.length > 1) {
                if (chat) {
                    chat.style.display = 'block';
                    chat.innerHTML = `<p style="color:red;font-weight:700;">PLEASE SEPARATE THE CVE ID'S WITH A COMMA</p>`;
                    setTimeout(() => {
                        if (chat) {
                            chat.style.display = 'none';
                            chat.innerHTML = '';
                        }
                    }, 4000);
                }
                // Re-enable inputs and hide loading
                if (submitBtn) submitBtn.disabled = false;
                if (loading) loading.style.display = 'none';
                return;
            }
            // Fallback: parse normally (single token)
            cveList = [cveInput];
        }
    } else {
        chat.innerHTML += `<p style="color:red;">❌ Please enter a CVE ID or choose a file.</p>`;
        return;
    }

    // Prepare a results buffer that will be opened in a new window/page
    const resultsHtml = [];
    // update UI selected count
    updateSelectedCount(cveList.length);
    resultsHtml.push(`<p style="color:blue;"><strong>You:</strong> ${escapeHtml(cveList.join(', '))}</p>`);

    try {

    // Backend endpoints (try localhost first)
    const FASTAPI_URL = 'http://localhost:5003/fastapi_get_cve';
    const FASTAPI_SIMILAR_URL = 'http://localhost:5003/fastapi_find_similar';

    // Diagnostic: verify backend reachability via bridge (_fetch) and direct window.fetch
    try {
        let healthOk = false;
        try {
            const h = await fetchWithFallback('http://localhost:5003/health', { method: 'GET' });
            healthOk = !!(h && h.ok);
            console.log('Health check (bridge) ok=', healthOk);
        } catch (bridgeErr) {
            console.warn('Health check via bridge failed:', bridgeErr);
        }

        if (!healthOk) {
            try {
                if (typeof window.fetch === 'function') {
                    const alt = await window.fetch('http://localhost:5003/health', { method: 'GET' });
                    console.log('Health check (direct window.fetch) ok=', !!(alt && alt.ok));
                    if (alt && alt.ok) healthOk = true;
                }
            } catch (directErr) {
                console.warn('Health check via direct fetch failed:', directErr);
            }
        }

        if (!healthOk) {
            const msg = 'Backend unreachable from renderer: bridge and direct fetch failed';
            console.error(msg);
            resultsHtml.push(`<p style="color:red;">❌ ${escapeHtml(msg)}</p>`);
            if (submitBtn) submitBtn.disabled = false;
            if (loading) loading.style.display = 'none';
            openResultsWindow(resultsHtml.join('\n'), 'CVE Report - Error', 'Backend connectivity error');
            return;
        }
    } catch (err) {
        console.warn('Unexpected error during backend diagnostic:', err);
    }

    // Helper: try fetch, and if it fails, retry swapping localhost <-> 127.0.0.1
    async function fetchWithFallback(url, options) {
        try {
            return await _fetch(url, options);
        } catch (err) {
            // try alternate host
            try {
                const alt = url.replace('localhost', '127.0.0.1');
                return await _fetch(alt, options);
            } catch (err2) {
                try {
                    const alt2 = url.replace('127.0.0.1', 'localhost');
                    return await _fetch(alt2, options);
                } catch (err3) {
                    throw err3 || err2 || err;
                }
            }
        }
    }

    // Quick health check to surface obvious connectivity problems
    async function backendHealthy() {
        try {
            const h = await fetchWithFallback('http://localhost:5003/health', { method: 'GET' });
            return h && h.ok;
        } catch (e) {
            return false;
        }
    }
        // const BRIDGE_URL = 'http://127.0.0.1:5000/get_cve';  // Commented out - using FastAPI only
        // const FLASK_URL = 'http://127.0.0.1:5001/get_cve';   // Commented out - using FastAPI only

        // submit sequentially to preserve order and avoid overloading backend

        for (const id of cveList) {
            // Use FastAPI backend only
            console.log(`🚀 Using FastAPI backend for ${id}...`);
            let res = null;
            // Attempt fetch with one retry for transient network errors
            // include logged-in user name (if any) so backend can record it
            const currentUser = (localStorage.getItem('cve_user') || 'unknown');
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    res = await _fetch(FASTAPI_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-User-Name': currentUser },
                        body: JSON.stringify({ cve_id: id })
                    });
                    break; // success (got a response object)
                } catch (netErr) {
                    console.warn(`Network fetch attempt ${attempt+1} failed for ${id}:`, netErr);
                    if (attempt === 0) {
                        // wait briefly before retry
                        await new Promise(r => setTimeout(r, 250));
                        continue;
                    } else {
                        // give up and record error
                        resultsHtml.push(`<p style="color:red;">❌ Network error fetching ${escapeHtml(id)}: ${escapeHtml(String(netErr && netErr.message || netErr))}</p>`);
                    }
                }
            }

            if (!res) {
                // move to next CVE
                continue;
            }

            if (res.ok) {
                console.log(`✅ FastAPI backend successful for ${id}`);
            } else {
                console.log(`❌ FastAPI failed for ${id} (${res.status})`);
            }

            if (!res.ok) {
                const contentType = res.headers.get('content-type') || '';
                if (contentType.includes('application/json')) {
                    const errBody = await res.json();
                    const msg = errBody.error || `Server returned status ${res.status}`;
                    const errId = errBody.error_id ? ` (error id: ${errBody.error_id})` : '';
                    resultsHtml.push(`<p style="color:red;">❌ ${escapeHtml(msg)}${escapeHtml(errId)}</p>`);
                    console.error('Server error body:', errBody);
                    continue;
                }
                resultsHtml.push(`<p style="color:red;">❌ Failed to fetch data for ${escapeHtml(id)}: Status ${res.status}</p>`);
                continue;
            }

            const data = await res.json();
            if (data.error) {
                resultsHtml.push(`<p style="color:red;">❌ Error for ${escapeHtml(id)}: ${escapeHtml(data.error)}</p>`);
                continue;
            }


            if (data.structured) {
                // Render the main structured report
                resultsHtml.push(renderStructuredReport(data.structured));

                // Fetch similar CVEs (RAG) and append to results
                try {
                    const simRes = await _fetch(FASTAPI_SIMILAR_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-User-Name': currentUser },
                        body: JSON.stringify({ cve_id: id })
                    });
                    if (simRes.ok) {
                        const simData = await simRes.json();
                        if (simData && Array.isArray(simData.cves) && simData.cves.length) {
                            // Deduplicate similar CVEs by normalized cve_id and skip the queried CVE itself
                            const seen = new Set();
                            const targetNorm = (String(id || '')).toUpperCase().trim();
                            const uniques = [];
                            for (const s of simData.cves) {
                                const sid = (s && s.cve_id) ? String(s.cve_id).toUpperCase().trim() : '';
                                if (!sid) continue;
                                if (sid === targetNorm) continue; // don't include self
                                if (seen.has(sid)) continue;
                                seen.add(sid);
                                uniques.push(s);
                            }
                            if (uniques.length) {
                                let simHtml = '<div style="margin:10px 0;padding:10px;background:#fff3e0;border-left:4px solid #ff9800;border-radius:6px;">';
                                simHtml += '<strong>🔎 Similar CVEs (approx):</strong><br><ul style="margin:8px 0 0 18px;">';
                                for (const s of uniques) {
                                    const link = s.cve_id ? `<a href="https://nvd.nist.gov/vuln/detail/${encodeURIComponent(s.cve_id)}" target="_blank">${escapeHtml(s.cve_id)}</a>` : escapeHtml(String(s.cve_id));
                                    const sd = s.short_description ? escapeHtml(s.short_description) : '';
                                    simHtml += `<li style="margin:6px 0;">${link}${sd ? ' — ' + sd : ''}${s.score ? ` <span style="color:#666;font-size:12px;">(score:${s.score.toFixed(2)})</span>` : ''}</li>`;
                                }
                                simHtml += '</ul></div>';
                                resultsHtml.push(simHtml);
                            }
                        }
                    } else {
                        console.warn('Similar CVE lookup failed for', id, simRes.status);
                    }
                } catch (err) {
                    console.warn('Error fetching similar CVEs for', id, err);
                }

                
            } else if (data.chat && Array.isArray(data.chat.messages)) {
                for (const msg of data.chat.messages) {
                    const role = msg.role || 'assistant';
                    const content = msg.content || '';
                    const format = msg.format || 'markdown';
                    if (format === 'markdown' && window.marked) {
                        resultsHtml.push(`<div class="report"><strong>${role}:</strong> ${window.marked.parse(content)}</div>`);
                    } else {
                        resultsHtml.push(`<div class="report"><strong>${role}:</strong> <pre>${escapeHtml(content)}</pre></div>`);
                    }
                }
            } else if (data.markdown) {
                const rendered = window.marked ? window.marked.parse(data.markdown) : data.markdown;
                resultsHtml.push(`<div class="report">${rendered}</div>`);
            } else {
                resultsHtml.push(`<pre>${JSON.stringify(data, null, 2)}</pre>`);
            }

            // small delay to be polite
            await new Promise(r => setTimeout(r, 250));
        }

        // When finished processing all CVEs, open results in a new window
        console.log('Processing complete, opening results window...');
        console.log('Results HTML length:', resultsHtml.join('\n').length);
        console.log('Results HTML preview:', resultsHtml.join('\n').substring(0, 200) + '...');

        openResultsWindow(resultsHtml.join('\n'), `CVE Report - ${cveList.join(', ')}`, `Processed ${cveList.length} CVE(s)`);

        // show a small hint in the main UI
        chat.innerHTML = `<p style="color:green;">✅ Results opened in new window. Processed ${cveList.length} CVE(s).</p>`;

    } catch (err) {
        console.error("Fetch error:", err);
        resultsHtml.push(`<p style="color:red;">❌ Error: ${escapeHtml(err.message)}</p>`);
        openResultsWindow(resultsHtml.join('\n'), 'CVE Report - Error', 'Error processing CVEs');
    }
    finally {
        // hide loading state and re-enable inputs
        if (submitBtn) submitBtn.disabled = false;
        if (loading) loading.style.display = 'none';
        console.log('Form processing complete, inputs re-enabled');
    }

});

// Note: 'Find similar CVEs' button removed from main UI; similar results are displayed inside the results window.

// Parse a file's text and extract CVE-like tokens (CVE-YYYY-NNNN+)
function parseFileForCves(text, filename) {
    const lines = text.split(/\r?\n/);
    const results = [];
    for (const ln of lines) {
        const cells = ln.split(/[,\t;]/).map(c => c.trim()).filter(Boolean);
        for (const c of cells) {
            const match = c.match(/CVE-\d{4}-\d{4,}/i);
            if (match) results.push(match[0].toUpperCase());
        }
    }
    return Array.from(new Set(results));
}

// Parse flexible input strings into canonical CVE tokens
function parseFlexibleCveInput(input) {
    const out = [];
    // First try to find all explicit CVE occurrences in the input (handles space-separated entries)
    const re = /CVE[-\s]?(\d{4})[-\s]?(\d{2,7})/gi;
    let m;
    while ((m = re.exec(input)) !== null) {
        const year = m[1];
        // Preserve leading zeros in the numeric portion to keep canonical format like 0708
        const num = m[2] || '0';
        out.push(`CVE-${year}-${num}`);
    }

    if (out.length) {
        return Array.from(new Set(out.map(x => x.toUpperCase())));
    }

    // If no explicit matches, split on commas/newlines/semicolons, fallback to whitespace splitting
    let parts = input.split(/[,;\n]+/).map(p => p.trim()).filter(Boolean);
    if (parts.length <= 1) {
        parts = input.split(/\s+/).map(p => p.trim()).filter(Boolean);
    }

    for (const p of parts) {
        let m2 = p.match(/CVE[-\s]?(\d{4})[-\s]?(\d{2,7})/i);
        if (!m2) {
            const digits = p.replace(/[^0-9]/g, '');
            if (digits.length >= 6) {
                const year = digits.slice(0, 4);
                const rest = digits.slice(4);
                m2 = [p, year, rest];
            }
        }
        if (m2) {
            const year = m2[1];
            const num = m2[2] || '0';
            out.push(`CVE-${year}-${num}`);
            continue;
        }

        // Fallback try: patterns with letters between parts
        const fallback = p.match(/(CVE)(\D*)(\d{4})(\D*)(\d{2,7})/i);
        if (fallback) {
            const year = fallback[3];
            const num = fallback[5] || '0';
            out.push(`CVE-${year}-${num}`);
            continue;
        }

        // otherwise keep the token for backend normalization
        if (p) out.push(p);
    }

    return Array.from(new Set(out.map(x => x.toUpperCase())));
}

// Update selected CVE count UI
function updateSelectedCount(n) {
    const el = document.getElementById('selectedCount');
    if (el) el.textContent = `Selected CVE IDs: ${n}`;
}

// Use SheetJS to parse an XLS/XLSX file and extract CVE IDs from all sheets/cells
async function parseXlsxFileForCves(file) {
    return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = window.XLSX.read(data, { type: 'array' });
                const results = [];
                for (const sheetName of workbook.SheetNames) {
                    const sheet = workbook.Sheets[sheetName];
                    const csv = window.XLSX.utils.sheet_to_csv(sheet);
                    const found = parseFileForCves(csv, file.name + ':' + sheetName);
                    for (const f of found) results.push(f);
                }
                resolve(Array.from(new Set(results)));
            } catch (err) {
                reject(err);
            }
        };
        reader.readAsArrayBuffer(file);
    });
}

// Small helper to escape HTML when rendering plain text in <pre>
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Expose a parent-level CSV download helper so popups can delegate downloads to the main window
window._receiveCsv = function(text, filename) {
    try {
        const blob = new Blob([text], {type: 'text/csv;charset=utf-8;'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'export.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        console.log('Parent initiated CSV download:', filename);
    } catch (e) {
        console.error('Parent download failed', e);
        alert('Download failed: ' + (e && e.message ? e.message : 'unknown'));
    }
};

// --- Admin logs helper (fetch and show local times) ---
async function fetchAdminLogs(limit = 20) {
    try {
        const res = await _fetch('http://127.0.0.1:5003/admin/logs?limit=' + encodeURIComponent(limit), {
            method: 'GET',
            headers: { 'X-Admin-Token': 'devtoken' }
        });
        if (!res.ok) {
            alert('Failed to fetch admin logs: ' + res.status);
            return;
        }
        const rows = await res.json();
        // convert event_timestamp (ISO UTC) to local string
        const html = ['<div style="padding:10px;font-family:Arial,Helvetica,sans-serif;max-height:60vh;overflow:auto;">', '<h3>Recent Activity Logs (local time)</h3>', '<table style="width:100%;border-collapse:collapse;">', '<thead><tr><th style="text-align:left">id</th><th style="text-align:left">cve_id</th><th style="text-align:left">user</th><th style="text-align:left">timestamp (local)</th><th style="text-align:left">meta</th></tr></thead><tbody>'];
        for (const r of rows) {
            let ts = r.event_timestamp || '';
            try {
                // ensure Z so Date parses as UTC
                if (!ts.endsWith('Z') && !ts.includes('+')) ts = ts.replace(' ', 'T') + 'Z';
                const d = new Date(ts);
                ts = d.toLocaleString();
            } catch (e) {
                // fallback: leave original
            }
            html.push(`<tr><td>${escapeHtml(String(r.id))}</td><td>${escapeHtml(r.cve_id||'')}</td><td>${escapeHtml(r.user_name||'')}</td><td>${escapeHtml(String(ts))}</td><td><pre style="white-space:pre-wrap">${escapeHtml(JSON.stringify(r.meta||{}))}</pre></td></tr>`);
        }
        html.push('</tbody></table></div>');
        const w = window.open('', '_blank', 'width=900,height=600');
        if (w) {
            w.document.title = 'Admin Logs';
            w.document.body.innerHTML = html.join('\n');
        } else {
            alert('Popup blocked — cannot open admin logs window.');
        }
    } catch (err) {
        alert('Error fetching admin logs: ' + (err && err.message ? err.message : err));
    }
}

// Add a small admin button to the page if a container exists
(function addAdminButton(){
    try {
        const b = document.createElement('button');
        b.textContent = 'Admin Logs';
        b.style.position = 'fixed';
        b.style.bottom = '12px';
        b.style.right = '12px';
        b.style.zIndex = '9999';
        b.style.background = '#1976d2';
        b.style.color = '#fff';
        b.style.border = 'none';
        b.style.padding = '8px 10px';
        b.style.borderRadius = '6px';
        b.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)';
        b.addEventListener('click', ()=> fetchAdminLogs(50));
        document.body.appendChild(b);
    } catch (e) { /* ignore DOM errors during headless runs */ }
})();


function renderStructuredReport(report) {
    const title = report.cve_id || report.title || '';
    let html = `<div class="report"><h3>${escapeHtml(title)}</h3>`;

    // Description (sanitize to remove any appended similar-CVE lists from AI output)
    const sanitizeDescription = (d) => {
        if (!d) return 'No description available.';
        // Remove a trailing 'Similar CVEs' section if present
        // Detect common phrases like 'Similar CVEs' or 'Similar CVEs (based on' and slash-listing of CVE IDs
        const lines = d.split(/\r?\n/);
        // Find index where similar list likely starts
        let cutIndex = lines.length;
        for (let i = 0; i < lines.length; i++) {
            const l = lines[i].toLowerCase();
            if (l.includes('similar cve') || l.includes('similar vulnerabilities') || l.startsWith('similar cves') || l.startsWith('similar vulnerabilities')) {
                cutIndex = i;
                break;
            }
            // also catch a line that is just a dash-prefixed list starting with CVE- or list of CVE ids
            if (/^\s*[-•*]\s*cve-\d{4}-\d+/i.test(lines[i])) {
                cutIndex = i;
                break;
            }
            // or a line that begins with 'Similar CVEs (' etc
            if (/^\s*similar cve/i.test(lines[i])) {
                cutIndex = i;
                break;
            }
        }
        const kept = lines.slice(0, cutIndex).join('\n').trim();
        return kept || 'No description available.';
    };

    const cleanDesc = sanitizeDescription(report.description || '');
    html += `<div style="margin:8px 0;"><strong>Description:</strong><br>${escapeHtml(cleanDesc)}</div>`;

    // CVSS, Severity, Dates
    html += `<ul class="meta" style="list-style:none;padding:0;margin:0 0 10px 0;">
        <li><strong>CVSS Score:</strong> <b>${escapeHtml(String((report.cvss && report.cvss.score) || 'N/A'))}</b></li>
        <li><strong>CVSS Version:</strong> <b>${escapeHtml(String((report.cvss && report.cvss.version) || 'N/A'))}</b></li>
        <li><strong>Severity:</strong> <b>${escapeHtml(String(report.severity || 'N/A'))}</b></li>
        <li><strong>Published:</strong> <b>${escapeHtml(report.published_date || 'N/A')}</b></li>
        <li><strong>Last Modified:</strong> <b>${escapeHtml(report.modified_date || 'N/A')}</b></li>
    </ul>`;

    // NVD link for more details
    try {
        const cveIdForLink = encodeURIComponent(title || (report.cve_id || ''));
        if (cveIdForLink) {
            const nvdUrl = `https://nvd.nist.gov/vuln/detail/${cveIdForLink}`;
            html += `<div style="margin:6px 0;font-size:13px;"><a href="${escapeHtml(nvdUrl)}" target="_blank" style="color:#1976d2;">To get more info, click here</a></div>`;
        }
    } catch (e) {
        // silent fallback if encoding fails
    }

    // AI enhancement flag no longer shown in UI

    // CWE IDs
    if (report.cwes && report.cwes.length > 0) {
        html += `<div style="margin:8px 0;"><strong>CWE IDs:</strong><br>`;
        report.cwes.forEach(cwe => {
            html += `<span class="cwe-tag" style="display:inline-block;background:#e1f5fe;color:#0277bd;padding:4px 8px;margin:2px;border-radius:4px;font-size:12px;">${escapeHtml(cwe)}</span>`;
        });
        html += `</div>`;
    }

    // Sources used (for debugging)
    if (report.sources_used && report.sources_used.length > 0) {
        html += `<div style="margin:8px 0;font-size:12px;color:#666;">
            <strong>Data Sources:</strong> ${report.sources_used.join(', ')}
        </div>`;
    }

    // Common Consequences Table
    if (report.common_consequences_table && report.common_consequences_table.headers && report.common_consequences_table.rows) {
        const sourceCwe = report.common_consequences_table_cwe ? ` (from ${escapeHtml(report.common_consequences_table_cwe)})` : '';
        html += `<div style="margin:16px 0;"><strong>Common Consequences:${sourceCwe}</strong>`;
        html += renderTable(report.common_consequences_table, 'consequences');
        html += `</div>`;
    }

    // Potential Mitigations Table
    if (report.potential_mitigations_table && report.potential_mitigations_table.headers && report.potential_mitigations_table.rows) {
        const sourceCwe = report.potential_mitigations_table_cwe ? ` (from ${escapeHtml(report.potential_mitigations_table_cwe)})` : '';
        html += `<div style="margin:16px 0;"><strong>Potential Mitigations:${sourceCwe}</strong>`;
        html += renderTable(report.potential_mitigations_table, 'mitigations');
        html += `</div>`;
    }

    // Detection Methods Table
    if (report.detection_methods_table && report.detection_methods_table.headers && report.detection_methods_table.rows) {
        const sourceCwe = report.detection_methods_table_cwe ? ` (from ${escapeHtml(report.detection_methods_table_cwe)})` : '';
        html += `<div style="margin:16px 0;"><strong>Detection Methods:${sourceCwe}</strong>`;
        html += renderTable(report.detection_methods_table, 'detection');
        html += `</div>`;
    }

    // References intentionally omitted from the output

    html += '</div>';
    return html;
}

function renderTable(tbl, tableType) {
    let html = '<table class="report-table" style="width:100%;border-collapse:collapse;margin-top:8px;background:#fff;border-radius:6px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">';

    // Table header
    html += '<thead><tr style="background:#f5f5f5;">';
    for (const h of tbl.headers) {
        html += `<th style="padding:12px;text-align:left;font-weight:600;color:#333;border-bottom:2px solid #ddd;">${escapeHtml(h)}</th>`;
    }
    html += '</tr></thead>';

    // Table body
    html += '<tbody>';
    for (let i = 0; i < tbl.rows.length; i++) {
        const row = tbl.rows[i];
        const rowClass = i % 2 === 0 ? 'even' : 'odd';
        html += `<tr class="${rowClass}" style="background:${rowClass === 'even' ? '#fafafa' : '#fff'};">`;
        for (const cell of row) {
            html += `<td style="padding:12px;text-align:left;vertical-align:top;border-bottom:1px solid #eee;color:#555;">${escapeHtml(cell)}</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody></table>';

    return html;
}

// Open a new window and write the accumulated results HTML into it
let _resultsWindowRef = null;
function openResultsWindow(innerHtml, title, metaText) {
    console.log('openResultsWindow called with:', { title, metaText, htmlLength: innerHtml.length });

    // Use a named window so repeated calls reuse the same window/tab
    const name = 'cve_results_window';
    console.log('Attempting to open window with name:', name);

    const w = window.open('', name, 'width=1200,height=800,scrollbars=yes,resizable=yes');

    if (!w) {
        // Popup blocked, show alert and fall back to inline display
        console.warn('Popup blocked by browser');
        alert('Popup blocked: Please allow popups for this site to view results in a new window.');
        displayResultsInline(innerHtml, title, metaText);
        return;
    }

    console.log('Window opened successfully:', w);

    try {
        const doc = w.document;
        console.log('Document object obtained:', doc);

        // Simpler, safer popup generation: write a minimal skeleton and then
        // inject the results HTML and wire export buttons from the host.
        doc.open();
        // Add a dedicated container for CVE badges (will be populated from host)
        doc.write('<!doctype html><html><head><meta charset="utf-8"><title>' + escapeHtml(title || 'CVE Report') + '</title>' +
            '<style>body{font-family:Arial,Helvetica,sans-serif;margin:20px;background:linear-gradient(180deg,#05243a 0%, #07304f 100%);color:#eaf6ff;line-height:1.6} .report{background:#ffffff;padding:20px;margin-bottom:20px;border-radius:8px;border-left:4px solid #62a3ff} .report h3{color:#000000 !important;font-weight:800;margin-top:0;margin-bottom:8px;} .header{margin-bottom:20px;padding-bottom:15px;border-bottom:2px solid rgba(255,255,255,0.06)} .meta{color:#dbeefd;font-size:14px;margin-bottom:8px} .meta strong, .meta b { color: #000000 !important; } pre{white-space:pre-wrap;background:#f8f8f8;padding:15px;border-radius:6px;border:1px solid #ddd} h2{margin-top:0;color:#eaf6ff} button{cursor:pointer} .cve-badge{display:inline-block;padding:6px 10px;border-radius:999px;background:#dff6ff;color:#042b44;font-weight:700;border:1px solid rgba(11,99,214,0.12);margin:4px 6px 0 0;font-size:13px} #results{background:linear-gradient(180deg,#e8f6ff 0%, #dff3ff 100%);color:#042b44;border-radius:10px;padding:12px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.6),0 6px 18px rgba(10,30,80,0.04);}</style>' +
            '</head><body><div class="header"><h2>' + escapeHtml((title || 'CVE Report').split(' - ')[0]) + '</h2><div class="meta">' + escapeHtml(metaText || '') + '</div><div id="cve-badges" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;"></div><div style="margin-top:10px;"><button id="exportSelectedBtn" style="margin-right:8px;padding:8px 12px;border-radius:6px;border:none;background:#28a745;color:white;">Export</button><button id="exportAllBtn" style="padding:8px 12px;border-radius:6px;border:none;background:#218838;color:white;">Export All</button></div></div><div id="results"></div></body></html>');
        doc.close();

            // Insert the results HTML into the popup's results container
            try {
            const resultsDiv = doc.getElementById('results');
            if (resultsDiv) resultsDiv.innerHTML = innerHtml;

            // Populate CVE badges in the popup header based on the provided title (after ' - ')
            try {
                const badgesContainer = doc.getElementById('cve-badges');
                if (badgesContainer) {
                    const raw = String(title || '');
                    // Expecting title like 'CVE Report - CVE-2022-22965, CVE-2023-34362'
                    const parts = raw.split(' - ');
                    const cvePart = parts.slice(1).join(' - ');
                    if (cvePart) {
                        const items = cvePart.split(',').map(s=>s.trim()).filter(Boolean);
                        items.forEach(it => {
                            const span = doc.createElement('span');
                            span.className = 'cve-badge';
                            span.textContent = it;
                            badgesContainer.appendChild(span);
                        });
                    }
                }
            } catch (e) { /* ignore badge population errors */ }

            // Helper to gather report rows from the popup document and extract structured fields
            function gatherReportsFromDoc(d){
                const reports = Array.from(d.querySelectorAll('.report'));
                return reports.map((el, idx) => {
                    const titleEl = el.querySelector('h3');
                    const title = titleEl ? titleEl.textContent.trim() : '';

                    // CVE id: prefer NVD link text if present
                    const link = el.querySelector('a[href*="nvd.nist.gov"]');
                    const cve = link ? link.textContent.trim() : title;

                    // Description: find a div that contains the 'Description:' label
                    let desc = '';
                    const divs = Array.from(el.querySelectorAll('div'));
                    for (const dEl of divs) {
                        const strong = dEl.querySelector('strong');
                        if (strong && /description/i.test(strong.textContent || '')) {
                            desc = dEl.textContent.replace(/\s*Description:\s*/i, '').trim();
                            break;
                        }
                    }
                    if (!desc) {
                        // fallback: entire report text minus title
                        desc = (el.innerText || '').replace(/\s+/g,' ').trim();
                        if (title) desc = desc.replace(title, '').trim();
                    }

                    // Meta list: CVSS Score, CVSS Version, Severity, Published, Last Modified
                    const meta = {};
                    const lis = Array.from(el.querySelectorAll('ul.meta li'));
                    lis.forEach(li=>{
                        const txt = li.textContent || '';
                        const m = txt.split(':');
                        if (m.length >= 2) {
                            const key = m[0].trim();
                            const value = m.slice(1).join(':').trim();
                            meta[key] = value;
                        }
                    });

                    // CWEs
                    const cwes = Array.from(el.querySelectorAll('.cwe-tag')).map(n=>n.textContent.trim()).filter(Boolean);

                    // Data sources
                    let sources = '';
                    const dsEl = Array.from(el.querySelectorAll('div')).find(dE => (dE.textContent||'').toLowerCase().includes('data sources'));
                    if (dsEl) sources = dsEl.textContent.replace(/\s*Data Sources:\s*/i,'').trim();

                    // Tables: collect Consequences, Mitigations, Detection as plain text
                    const tables = {};
                    const strongs = Array.from(el.querySelectorAll('strong'));
                    for (const s of strongs) {
                        const label = (s.textContent || '').trim();
                        if (/Common Consequences/i.test(label) || /Potential Mitigations/i.test(label) || /Detection Methods/i.test(label)) {
                            let tbl = s.nextElementSibling;
                            if (!tbl || tbl.tagName !== 'TABLE') {
                                let next = s.parentElement;
                                tbl = next ? next.querySelector('table') : null;
                            }
                            if (tbl && tbl.tagName === 'TABLE') {
                                const headers = Array.from(tbl.querySelectorAll('thead th')).map(h=>h.textContent.trim());
                                const rows = Array.from(tbl.querySelectorAll('tbody tr')).map(tr=> Array.from(tr.querySelectorAll('td')).map(td=>td.textContent.trim()).join(' | '));
                                tables[label.replace(/\s*:\s*/,'')] = { headers, rows };
                            }
                        }
                    }

                    return {
                        index: idx+1,
                        cve,
                        title,
                        description: desc,
                        cvss_score: meta['CVSS Score'] || meta['CVSS Score:'] || meta['CVSS'] || '',
                        cvss_version: meta['CVSS Version'] || '',
                        severity: meta['Severity'] || '',
                        published: meta['Published'] || '',
                        last_modified: meta['Last Modified'] || '',
                        cwes: cwes.join('; '),
                        sources: sources,
                        tables: JSON.stringify(tables)
                    };
                });
            }

            // Host-side XLSX generation & download using SheetJS (falls back to CSV if XLSX unavailable)
            // Consistent export headers and formatter
            function getExportHeaders() {
                return ['Index','CVE ID','Title','Description','CVSS Score','CVSS Version','Severity','Published Date','Last Modified Date','CWE(s)','Data Sources','Tables'];
            }
            function formatRowsForExport(rows) {
                return (rows || []).map(r => ({
                    'Index': r.index || '',
                    'CVE ID': r.cve || '',
                    'Title': r.title || '',
                    'Description': r.description || '',
                    'CVSS Score': r.cvss_score || '',
                    'CVSS Version': r.cvss_version || '',
                    'Severity': r.severity || '',
                    'Published Date': r.published || '',
                    'Last Modified Date': r.last_modified || '',
                    'CWE(s)': r.cwes || '',
                    'Data Sources': r.sources || '',
                    'Tables': r.tables || ''
                }));
            }

            function downloadXlsxHost(rows, filename) {
                const formatted = formatRowsForExport(rows || []);
                const headers = getExportHeaders();
                try {
                    if (window.XLSX && typeof window.XLSX.utils !== 'undefined') {
                        const ws = window.XLSX.utils.json_to_sheet(formatted, { header: headers });
                        const wb = { SheetNames: ['CVE Reports'], Sheets: { 'CVE Reports': ws } };
                        window.XLSX.writeFile(wb, filename);
                        return;
                    }
                } catch (e) {
                    console.warn('XLSX export failed, falling back to CSV', e);
                }
                // Fallback to CSV using the same header order
                function esc(s){ if (s==null) return ''; return '"'+String(s).replace(/\r?\n/g,' ').replace(/"/g,'""')+'"'; }
                const lines = [headers.map(esc).join(',')];
                for (const r of formatted) lines.push(headers.map(h=>esc(r[h])).join(','));
                const blob = new Blob([lines.join('\n')], {type:'text/csv;charset=utf-8;'});
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = filename.replace(/\.xlsx$/i,'.csv'); document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
            }
            // CSV helpers used by popup fallback
            function csvFromRowsHost(rows){
                const formatted = formatRowsForExport(rows || []);
                if (!formatted.length) return '';
                function esc(s){ if (s==null) return ''; return '"'+String(s).replace(/\r?\n/g,' ').replace(/"/g,'""')+'"'; }
                const headers = getExportHeaders();
                const lines = [headers.map(esc).join(',')];
                for (const r of formatted) lines.push(headers.map(h=>esc(r[h])).join(','));
                return lines.join('\n');
            }
            function downloadCsvHost(text, filename){ const blob = new Blob([text], {type:'text/csv;charset=utf-8;'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }

            // Insert checkboxes beside each report if not present
            const reports = Array.from(resultsDiv.querySelectorAll('.report'));
            reports.forEach((el, i)=>{
                if (el.previousElementSibling && el.previousElementSibling.classList && el.previousElementSibling.classList.contains('report-select-wrap')) return;
                const wrap = doc.createElement('div'); wrap.className = 'report-select-wrap'; wrap.style.display = 'flex'; wrap.style.alignItems = 'flex-start';
                const cb = doc.createElement('input'); cb.type='checkbox'; cb.className='report-select'; cb.style.margin='6px 10px 0 0';
                el.parentNode.insertBefore(wrap, el);
                wrap.appendChild(cb);
                wrap.appendChild(el);
            });

            // Pagination: configurable page size, numbered links, styled pager
            (function setupPaginationPopup(){
                let perPage = 10;
                let wraps = Array.from(resultsDiv.querySelectorAll('.report-select-wrap'));
                if (wraps.length <= perPage) return; // no pagination needed
                let current = 0;
                let totalPages = () => Math.max(1, Math.ceil(wraps.length / perPage));

                const pager = doc.createElement('div');
                pager.style.cssText = 'margin-top:12px;display:flex;flex-direction:row;justify-content:center;gap:12px;align-items:center;padding:8px 0;background:transparent;';

                // Page size selector
                const sizeWrap = doc.createElement('div');
                sizeWrap.style.cssText = 'display:flex;align-items:center;gap:6px;color:#333;';
                const sizeLabel = doc.createElement('span'); sizeLabel.textContent = 'Page size:'; sizeLabel.style.fontSize='13px';
                const sizeSelect = doc.createElement('select');
                [5,10,20].forEach(n=>{ const o = doc.createElement('option'); o.value = n; o.text = n; if (n===perPage) o.selected=true; sizeSelect.appendChild(o); });
                sizeSelect.style.cssText = 'padding:6px;border-radius:6px;border:1px solid #ccc;';
                sizeWrap.appendChild(sizeLabel); sizeWrap.appendChild(sizeSelect);

                const pageLinks = doc.createElement('div'); pageLinks.style.cssText = 'display:flex;gap:6px;align-items:center;';

                const info = doc.createElement('div'); info.style.color='#333'; info.style.minWidth='90px'; info.style.textAlign='center';

                pager.appendChild(sizeWrap);
                pager.appendChild(pageLinks);
                pager.appendChild(info);
                resultsDiv.parentNode.appendChild(pager);

                function buildLinks(){
                    pageLinks.innerHTML='';
                    const tp = totalPages();
                    for(let i=0;i<tp;i++){
                        const btn = doc.createElement('button'); btn.textContent = (i+1).toString();
                        btn.dataset.page = i;
                        btn.style.cssText = 'padding:6px 10px;border-radius:6px;border:1px solid #007bff;background:#fff;color:#007bff;cursor:pointer;';
                        btn.addEventListener('click', ()=> showPage(i));
                        pageLinks.appendChild(btn);
                    }
                }

                function showPage(p){
                    wraps = Array.from(resultsDiv.querySelectorAll('.report-select-wrap'));
                    const tp = totalPages();
                    current = Math.max(0, Math.min(p, tp-1));
                    wraps.forEach((w, idx)=>{
                        const start = current*perPage;
                        const end = start + perPage;
                        w.style.display = (idx >= start && idx < end) ? 'flex' : 'none';
                    });
                    info.textContent = `Page ${current+1} / ${tp}`;
                    // update link styles
                    Array.from(pageLinks.children).forEach((b, idx)=>{
                        if (idx === current) { b.style.background = '#007bff'; b.style.color='#fff'; }
                        else { b.style.background = '#fff'; b.style.color='#007bff'; }
                    });
                    try{ resultsDiv.scrollIntoView({behavior:'smooth'}); }catch(e){}
                }

                sizeSelect.addEventListener('change', ()=>{
                    perPage = parseInt(sizeSelect.value,10) || 5;
                    buildLinks();
                    showPage(0);
                });

                // keyboard navigation (left/right) when popup is open: expose pager on popup window
                w._resultsPager = {
                    next: ()=> { const tp = totalPages(); if (current < tp-1) showPage(current+1); },
                    prev: ()=> { if (current > 0) showPage(current-1); },
                    goto: (n)=> showPage(n)
                };

                buildLinks();
                showPage(0);
            })();

            // Wire buttons: note these handlers run in the host context and operate on the popup document
            const selBtn = doc.getElementById('exportSelectedBtn');
            const allBtn = doc.getElementById('exportAllBtn');
            if (selBtn) {
                selBtn.addEventListener('click', function(){
                    try{
                        selBtn.textContent = 'DOWNLOADING...'; selBtn.style.opacity = '0.9';
                    } catch(e){}
                    const selects = Array.from(resultsDiv.querySelectorAll('.report-select'));
                    const rows = gatherReportsFromDoc(doc).filter((r,i)=> selects[i] && selects[i].checked);
                    if (!rows.length) { alert('No reports selected'); try{ selBtn.textContent='Export'; }catch(e){}; return; }
                    // export as .xlsx with SheetJS when available
                    try { downloadXlsxHost(rows, 'selected_cves.xlsx'); }
                    catch(e) { downloadCsvHost(csvFromRowsHost(rows), 'selected_cves.csv'); }
                    setTimeout(()=>{ try{ selBtn.textContent='DOWNLOADED'; selBtn.style.background='#28a745'; }catch(e){} },800);
                });
            }
            if (allBtn) {
                allBtn.addEventListener('click', function(){
                    try{ allBtn.textContent='DOWNLOADING...'; allBtn.style.opacity='0.9'; } catch(e){}
                    const rows = gatherReportsFromDoc(doc);
                    if (!rows.length) { alert('No reports to export'); try{ allBtn.textContent='Export All'; }catch(e){}; return; }
                    try { downloadXlsxHost(rows, 'all_cves.xlsx'); }
                    catch(e) { downloadCsvHost(csvFromRowsHost(rows), 'all_cves.csv'); }
                    setTimeout(()=>{ try{ allBtn.textContent='DOWNLOADED'; allBtn.style.background='#28a745'; }catch(e){} },800);
                });
            }

            w.focus();
            _resultsWindowRef = w;
            console.log('Results window opened successfully (safe DOM injection)');
        } catch (errInner) {
            console.error('Failed to populate popup via safe DOM approach:', errInner);
            // fallback
            displayResultsInline(innerHtml, title, metaText);
        }

    } catch (err) {
        console.error('Unable to open results window:', err);
        alert('Unable to open results window: ' + err.message);
        // Fall back to inline display
        displayResultsInline(innerHtml, title, metaText);
    }
}

// Keep the inline display as fallback
function displayResultsInline(innerHtml, title, metaText) {
    const chat = document.getElementById('chat');

    // Create results container
    let resultsContainer = document.getElementById('results-container');
    if (!resultsContainer) {
        resultsContainer = document.createElement('div');
        resultsContainer.id = 'results-container';
        resultsContainer.style.cssText = `
            margin-top: 20px;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 8px;
            border: 1px solid #dee2e6;
            max-height: 600px;
            overflow-y: auto;
        `;
        chat.appendChild(resultsContainer);
    }

    // Clear previous results
    resultsContainer.innerHTML = '';

    // Add header
    const header = document.createElement('div');
    header.style.cssText = `
        margin-bottom: 15px;
        padding-bottom: 10px;
        border-bottom: 2px solid #007bff;
    `;
    header.innerHTML = `
        <h3 style="margin: 0; color: #007bff;">${escapeHtml(title || 'CVE Report')}</h3>
        <p style="margin: 5px 0 0 0; color: #6c757d; font-size: 14px;">${escapeHtml(metaText || '')}</p>
    `;
    resultsContainer.appendChild(header);

    // Add results content first
    const content = document.createElement('div');
    content.id = 'results';
    content.innerHTML = innerHtml;
    resultsContainer.appendChild(content);

    // Add export buttons to inline results (placed above results)
    const exportWrap = document.createElement('div');
    exportWrap.style.cssText = 'margin-top:8px;margin-bottom:8px;';
    exportWrap.innerHTML = `<button id="inlineExportSelected" style="margin-right:8px;padding:8px 12px;border-radius:6px;border:none;background:#28a745;color:white;cursor:pointer;">Export</button><button id="inlineExportAll" style="padding:8px 12px;border-radius:6px;border:none;background:#218838;color:white;cursor:pointer;">Export All</button>`;
    resultsContainer.insertBefore(exportWrap, content);

    // Wire export functionality for inline view
    (function(){
        function escapeCsvCell(s){ if(s==null) return ''; s = String(s).replace(new RegExp('\\r?\\n','g'),' ').replace(/"/g,'""'); return '"'+s+'"'; }
        function gatherReports(elRoot){
            const reports = Array.from(elRoot.querySelectorAll('.report'));
            return reports.map((el, idx) => {
                const titleEl = el.querySelector('h3');
                const title = titleEl ? titleEl.textContent.trim() : '';
                const link = el.querySelector('a[href*="nvd.nist.gov"]');
                const cve = link ? link.textContent.trim() : title;
                let desc = '';
                const divs = Array.from(el.querySelectorAll('div'));
                for (const dEl of divs) {
                    const strong = dEl.querySelector('strong');
                    if (strong && /description/i.test(strong.textContent || '')) {
                        desc = dEl.textContent.replace(/\s*Description:\s*/i, '').trim();
                        break;
                    }
                }
                if (!desc) desc = el.innerText.replace(/\s+/g,' ').trim().replace(title, '').trim();

                const meta = {};
                const lis = Array.from(el.querySelectorAll('ul.meta li'));
                lis.forEach(li=>{
                    const txt = li.textContent || '';
                    const m = txt.split(':');
                    if (m.length >= 2) meta[m[0].trim()] = m.slice(1).join(':').trim();
                });
                const cwes = Array.from(el.querySelectorAll('.cwe-tag')).map(n=>n.textContent.trim()).filter(Boolean);
                const dsEl = Array.from(el.querySelectorAll('div')).find(dE => (dE.textContent||'').toLowerCase().includes('data sources'));
                const sources = dsEl ? dsEl.textContent.replace(/\s*Data Sources:\s*/i,'').trim() : '';

                const tables = {};
                const strongs = Array.from(el.querySelectorAll('strong'));
                for (const s of strongs) {
                    const label = (s.textContent || '').trim();
                    if (/Common Consequences/i.test(label) || /Potential Mitigations/i.test(label) || /Detection Methods/i.test(label)) {
                        let tbl = s.nextElementSibling;
                        if (!tbl || tbl.tagName !== 'TABLE') {
                            let next = s.parentElement;
                            tbl = next ? next.querySelector('table') : null;
                        }
                        if (tbl && tbl.tagName === 'TABLE') {
                            const headers = Array.from(tbl.querySelectorAll('thead th')).map(h=>h.textContent.trim());
                            const rows = Array.from(tbl.querySelectorAll('tbody tr')).map(tr=> Array.from(tr.querySelectorAll('td')).map(td=>td.textContent.trim()).join(' | '));
                            tables[label.replace(/\s*:\s*/,'')] = { headers, rows };
                        }
                    }
                }

                return {
                    index: idx+1,
                    cve,
                    title,
                    description: desc,
                    cvss_score: meta['CVSS Score'] || '',
                    cvss_version: meta['CVSS Version'] || '',
                    severity: meta['Severity'] || '',
                    published: meta['Published'] || '',
                    last_modified: meta['Last Modified'] || '',
                    cwes: cwes.join('; '),
                    sources: sources,
                    tables: JSON.stringify(tables)
                };
            });
        }
        function csvFromRows(rows){ const hdr = Object.keys(rows[0]||{}); const lines = [hdr.map(escapeCsvCell).join(',')]; for(const r of rows) lines.push(hdr.map(k=>escapeCsvCell(r[k])).join(',')); return lines.join('\n'); }
        function downloadCsv(text, filename){ const blob = new Blob([text], {type:'text/csv;charset=utf-8;'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }

        // XLSX downloader for inline exports (reuses SheetJS if available)
        function downloadXlsx(rows, filename) {
            const formatted = formatRowsForExport(rows || []);
            const headers = getExportHeaders();
            try {
                if (window.XLSX && typeof window.XLSX.utils !== 'undefined') {
                    const ws = window.XLSX.utils.json_to_sheet(formatted, { header: headers });
                    const wb = { SheetNames: ['CVE Reports'], Sheets: { 'CVE Reports': ws } };
                    window.XLSX.writeFile(wb, filename);
                    return;
                }
            } catch (e) { console.warn('XLSX write failed, falling back to CSV', e); }
            // fallback to CSV
            downloadCsv(csvFromRows(rows), filename.replace(/\.xlsx$/i,'.csv'));
        }

        // Insert checkboxes beside each report if not present
        const reports = Array.from(content.querySelectorAll('.report'));
        reports.forEach((el, i)=>{
            if (el.previousElementSibling && el.previousElementSibling.classList && el.previousElementSibling.classList.contains('report-select-wrap')) return;
            const wrap = document.createElement('div'); wrap.className = 'report-select-wrap'; wrap.style.display = 'flex'; wrap.style.alignItems = 'flex-start';
            const cb = document.createElement('input'); cb.type='checkbox'; cb.className='report-select'; cb.style.margin='6px 10px 0 0';
            el.parentNode.insertBefore(wrap, el);
            wrap.appendChild(cb);
            wrap.appendChild(el);
        });

        // Pagination for inline results: configurable with numbered links and keyboard navigation
        (function setupPaginationInline(){
            let perPage = 10;
            let wraps = Array.from(resultsContainer.querySelectorAll('.report-select-wrap'));
            if (wraps.length <= perPage) return;
            let current = 0;
            const totalPages = () => Math.max(1, Math.ceil(wraps.length / perPage));

            const pager = document.createElement('div');
            pager.style.cssText = 'margin-top:12px;display:flex;flex-direction:row;justify-content:center;gap:12px;align-items:center;padding:8px 0;';

            const sizeWrap = document.createElement('div');
            sizeWrap.style.cssText = 'display:flex;align-items:center;gap:6px;color:#333;';
            const sizeLabel = document.createElement('span'); sizeLabel.textContent = 'Page size:'; sizeLabel.style.fontSize='13px';
            const sizeSelect = document.createElement('select');
            [5,10,20].forEach(n=>{ const o = document.createElement('option'); o.value = n; o.text = n; if (n===perPage) o.selected=true; sizeSelect.appendChild(o); });
            sizeSelect.style.cssText = 'padding:6px;border-radius:6px;border:1px solid #ccc;';
            sizeWrap.appendChild(sizeLabel); sizeWrap.appendChild(sizeSelect);

            const pageLinks = document.createElement('div'); pageLinks.style.cssText = 'display:flex;gap:6px;align-items:center;';
            const info = document.createElement('div'); info.style.color='#333'; info.style.minWidth='90px'; info.style.textAlign='center';
            pager.appendChild(sizeWrap); pager.appendChild(pageLinks); pager.appendChild(info);
            resultsContainer.appendChild(pager);

            function buildLinks(){
                pageLinks.innerHTML='';
                const tp = totalPages();
                for(let i=0;i<tp;i++){
                    const btn = document.createElement('button'); btn.textContent = (i+1).toString();
                    btn.dataset.page = i;
                    btn.style.cssText = 'padding:6px 10px;border-radius:6px;border:1px solid #007bff;background:#fff;color:#007bff;cursor:pointer;';
                    btn.addEventListener('click', ()=> showPage(i));
                    pageLinks.appendChild(btn);
                }
            }

            function showPage(p){
                wraps = Array.from(resultsContainer.querySelectorAll('.report-select-wrap'));
                const tp = totalPages();
                current = Math.max(0, Math.min(p, tp-1));
                wraps.forEach((w, idx)=>{
                    const start = current*perPage;
                    const end = start + perPage;
                    w.style.display = (idx >= start && idx < end) ? 'flex' : 'none';
                });
                info.textContent = `Page ${current+1} / ${tp}`;
                Array.from(pageLinks.children).forEach((b, idx)=>{
                    if (idx === current) { b.style.background = '#007bff'; b.style.color='#fff'; }
                    else { b.style.background = '#fff'; b.style.color='#007bff'; }
                });
                try{ resultsContainer.scrollIntoView({behavior:'smooth'}); }catch(e){}
            }

            sizeSelect.addEventListener('change', ()=>{
                perPage = parseInt(sizeSelect.value,10) || 5;
                buildLinks();
                showPage(0);
            });

            // expose inline pager controls on main window for keyboard navigation
            window._inlineResultsPager = {
                next: ()=> { const tp = totalPages(); if (current < tp-1) showPage(current+1); },
                prev: ()=> { if (current > 0) showPage(current-1); },
                goto: (n)=> showPage(n)
            };

            buildLinks();
            showPage(0);
        })();

        document.getElementById('inlineExportSelected').addEventListener('click', function(e){
            const btn = e.currentTarget;
            const selects = Array.from(resultsContainer.querySelectorAll('.report-select'));
            const rows = gatherReports(resultsContainer).filter((r,i)=> selects[i] && selects[i].checked);
            if (!rows.length) { alert('No reports selected'); return; }
            try { btn.textContent='DOWNLOADING...'; btn.style.opacity='0.9'; } catch(e){}
            try { downloadXlsx(rows, 'selected_cves.xlsx'); }
            catch(e) { downloadCsv(csvFromRows(rows), 'selected_cves.csv'); }
            setTimeout(()=>{ try{ btn.textContent='DOWNLOADED'; btn.style.background='#28a745'; }catch(e){} },800);
        });
        document.getElementById('inlineExportAll').addEventListener('click', function(e){
            const btn = e.currentTarget;
            const rows = gatherReports(resultsContainer);
            if (!rows.length) { alert('No reports to export'); return; }
            try { btn.textContent='DOWNLOADING...'; btn.style.opacity='0.9'; } catch(e){}
            try { downloadXlsx(rows, 'all_cves.xlsx'); }
            catch(e) { downloadCsv(csvFromRows(rows), 'all_cves.csv'); }
            setTimeout(()=>{ try{ btn.textContent='DOWNLOADED'; btn.style.background='#28a745'; }catch(e){} },800);
        });
    })();

    // Scroll to results
    resultsContainer.scrollIntoView({ behavior: 'smooth' });
}

// Clear previous results and reset interface

// Keyboard navigation for paging: left/right arrows
document.addEventListener('keydown', function(e){
    // Ignore if typing in an input or textarea
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement && document.activeElement.isContentEditable) return;
    if (e.key === 'ArrowLeft'){
        try{
            // Prefer popup pager if open
            if (window._resultsWindowRef && window._resultsWindowRef._resultsPager) { window._resultsWindowRef._resultsPager.prev(); e.preventDefault(); return; }
            if (window._inlineResultsPager) { window._inlineResultsPager.prev(); e.preventDefault(); return; }
        }catch(err){/*ignore*/}
    } else if (e.key === 'ArrowRight'){
        try{
            if (window._resultsWindowRef && window._resultsWindowRef._resultsPager) { window._resultsWindowRef._resultsPager.next(); e.preventDefault(); return; }
            if (window._inlineResultsPager) { window._inlineResultsPager.next(); e.preventDefault(); return; }
        }catch(err){/*ignore*/}
    }
});

