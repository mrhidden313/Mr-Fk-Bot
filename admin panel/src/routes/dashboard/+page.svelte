<script>
    import { onMount, onDestroy } from 'svelte';
    import { goto } from '$app/navigation';

    let token = $state('');
    let userEmail = $state('');
    let status = $state('checking');
    let qrBase64 = $state(null);
    let errorMsg = $state('');
    let actionLoading = $state(false);
    let pollInterval = null;
    let authMode = $state('qr'); // 'qr' or 'pair'
    let phoneNumber = $state('');
    let pairingCodeStr = $state(null);

    const API_URL = '/api';

    onMount(() => {
        token = localStorage.getItem('userToken') || '';
        userEmail = localStorage.getItem('userEmail') || '';
        if (!token) { goto('/login'); return; }
        checkStatus();
    });

    onDestroy(() => stopPolling());

    async function checkStatus() {
        try {
            const res = await fetch(`${API_URL}/sessions/${token}/status`);
            if (!res.ok) {
                if (res.status === 401 || res.status === 403) { logout(); return; }
                errorMsg = `Server error (${res.status})`;
                status = 'error';
                return;
            }
            const data = await res.json();
            const newStatus = data.status || 'disconnected';
            status = newStatus;
            if (data.qr) qrBase64 = data.qr;
            if (data.pairingCode) pairingCodeStr = data.pairingCode;
            
            if (newStatus === 'connected' || newStatus === 'disconnected' || newStatus === 'not_found') {
                stopPolling();
                if (newStatus !== 'qr_ready' && newStatus !== 'starting' && newStatus !== 'pairing_code') {
                    qrBase64 = null;
                    pairingCodeStr = null;
                }
            } else {
                startPolling();
            }
        } catch {
            errorMsg = 'Network error — cannot reach server.';
            status = 'error';
        }
    }

    function startPolling() {
        if (!pollInterval) pollInterval = setInterval(checkStatus, 2500);
    }

    function stopPolling() {
        if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
    }

    async function requestConnection() {
        if (authMode === 'pair') {
            const cleanPhone = phoneNumber.replace(/\D/g, '');
            if (cleanPhone.length < 10 || cleanPhone.length > 15) {
                errorMsg = 'Please enter a valid full number (e.g. 92...)';
                return;
            }
        }

        actionLoading = true;
        errorMsg = '';
        status = 'starting';
        startPolling();
        try {
            const payload = { sessionId: token };
            if (authMode === 'pair') payload.phoneNumber = phoneNumber.replace(/\D/g, '');
            
            const res = await fetch(`${API_URL}/sessions/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            let data;
            try { data = await res.json(); } catch { data = {}; }
            if (!res.ok) {
                if (data.error && data.error.includes('already active')) {
                    status = 'starting';
                } else {
                    errorMsg = data.error || `Failed to start (${res.status})`;
                    status = 'error';
                    stopPolling();
                }
            }
        } catch {
            errorMsg = 'Network error — cannot reach server.';
            status = 'error';
            stopPolling();
        } finally {
            actionLoading = false;
        }
    }

    async function disconnect() {
        if (!confirm('Disconnect WhatsApp?')) return;
        actionLoading = true;
        try {
            await fetch(`${API_URL}/sessions/stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: token })
            });
            status = 'disconnected';
            stopPolling();
            checkStatus();
        } catch {
            errorMsg = 'Error disconnecting.';
        }
        actionLoading = false;
    }

    async function cancelConnection() {
        actionLoading = true;
        try {
            await fetch(`${API_URL}/sessions/stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: token })
            });
            stopPolling();
            checkStatus();
        } catch (e) {
            console.error('Failed to cancel connection', e);
        }
        actionLoading = false;
    }

    let copied = $state(false);
    function copyCode() {
        if (!pairingCodeStr) return;
        navigator.clipboard.writeText(pairingCodeStr.match(/.{1,4}/g)?.join('-') || pairingCodeStr);
        copied = true;
        setTimeout(() => copied = false, 2000);
    }

    function logout() {
        stopPolling();
        localStorage.removeItem('userToken');
        localStorage.removeItem('userEmail');
        goto('/login');
    }
</script>

<div class="console">
    <div class="top-bar">
        <div class="top-bar-left">
            <div class="avatar">📱</div>
            <div>
                <h1>My Console</h1>
                {#if userEmail}<p>{userEmail}</p>{/if}
            </div>
        </div>
        <button class="btn btn-ghost" onclick={logout}>Logout</button>
    </div>

    <div class="panel">
        <div class="panel-accent"></div>

        {#if status === 'checking'}
            <div class="state-view">
                <div class="spinner-lg"></div>
                <p>Loading your instance...</p>
            </div>

        {:else if status === 'disconnected' || status === 'not_found'}
            <div class="state-view">
                <div class="icon-circle icon-gray">📵</div>
                <h2>Not Connected</h2>
                <p>Link your WhatsApp to activate Anti-Delete & View-Once protection.</p>
                
                <div class="auth-mode-switch">
                    <button class="mode-btn {authMode === 'qr' ? 'active' : ''}" onclick={() => authMode = 'qr'}>QR Code</button>
                    <button class="mode-btn {authMode === 'pair' ? 'active' : ''}" onclick={() => authMode = 'pair'}>Pairing Code</button>
                </div>
                
                {#if authMode === 'pair'}
                    <div class="phone-input-wrapper">
                        <div class="phone-prefix">+</div>
                        <input type="tel" class="phone-input-styled" placeholder="Country Code & Number (92...)" bind:value={phoneNumber} />
                    </div>
                {/if}

                {#if errorMsg}
                    <div class="alert alert-error">⚠ {errorMsg}</div>
                {/if}
                <button class="btn btn-primary" onclick={requestConnection} disabled={actionLoading || (authMode === 'pair' && !phoneNumber)}>
                    {#if actionLoading}<span class="spinner"></span> Starting...{:else}Connect Now{/if}
                </button>
            </div>

        {:else if status === 'starting'}
            <div class="state-view">
                <div class="pulse-rings">
                    <div class="ring ring-1"></div>
                    <div class="ring ring-2"></div>
                    <div class="ring ring-3"></div>
                    <span class="ring-icon">⚡</span>
                </div>
                <h2>Booting Engine</h2>
                <p>Requesting secure QR from WhatsApp servers...</p>
                <button class="btn btn-ghost" onclick={cancelConnection} style="margin-top: 1rem;">Cancel</button>
            </div>

        {:else if status === 'qr_ready' && qrBase64}
            <div class="state-view">
                <div class="qr-frame">
                    <img src={qrBase64} alt="WhatsApp QR Code" />
                </div>
                <h2>Scan to Connect</h2>
                <p>Open WhatsApp > Menu > <strong>Linked Devices</strong> > Link a Device</p>
                <div class="qr-timer"><span class="dot-blink"></span> Waiting for scan...</div>
                <button class="btn btn-ghost" onclick={cancelConnection} style="margin-top: 1rem;">Cancel</button>
            </div>

        {:else if status === 'pairing_code' && pairingCodeStr}
            <div class="state-view">
                <h2>Pairing Code</h2>
                <div class="pairing-code-wrapper">
                    <div class="pairing-code-display">{pairingCodeStr.match(/.{1,4}/g)?.join('-') || pairingCodeStr}</div>
                    <button class="btn btn-primary btn-copy" onclick={copyCode}>
                        {copied ? 'Copied! ✓' : 'Copy'}
                    </button>
                </div>
                <p>Open WhatsApp > Linked Devices > Link with Phone Number</p>
                <div class="qr-timer"><span class="dot-blink"></span> Waiting for confirmation...</div>
                <button class="btn btn-ghost" onclick={cancelConnection} style="margin-top: 1rem;">Cancel</button>
            </div>

        {:else if (status === 'qr_ready' && !qrBase64) || status === 'starting' || (status === 'pairing_code' && !pairingCodeStr)}
            <div class="state-view">
                <div class="spinner-lg"></div>
                <p>Generating, please wait...</p>
                <button class="btn btn-ghost" onclick={cancelConnection} style="margin-top: 1rem;">Cancel</button>
            </div>

        {:else if status === 'connected'}
            <div class="state-view">
                <div class="icon-circle icon-green">✓</div>
                <h2 class="connected-title">Engine Active</h2>
                <p>WhatsApp connected. Anti-Delete & View-Once modules are running.</p>
                <div class="features-grid">
                    <div class="feature-chip">🔒 Anti-Delete</div>
                    <div class="feature-chip">👁 View-Once</div>
                    <div class="feature-chip">🤖 Auto-Reply</div>
                </div>
                <button class="btn btn-danger" onclick={disconnect} disabled={actionLoading}>
                    {#if actionLoading}<span class="spinner"></span> Disconnecting...{:else}Disconnect{/if}
                </button>
            </div>

        {:else if status === 'error'}
            <div class="state-view">
                <div class="icon-circle icon-red">✗</div>
                <h2>Engine Error</h2>
                <p class="err-txt">{errorMsg || 'An unknown error occurred.'}</p>
                <button class="btn btn-primary" onclick={requestConnection} disabled={actionLoading}>Retry</button>
            </div>
        {/if}
    </div>
</div>

<style>
    .console { width: 100%; max-width: 560px; }
    .top-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; }
    .top-bar-left { display: flex; align-items: center; gap: 0.75rem; }
    .avatar { width: 40px; height: 40px; background: linear-gradient(135deg, #14b8a6, #0ea5e9); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.125rem; box-shadow: 0 4px 12px rgba(20,184,166,0.25); }
    .top-bar-left h1 { font-size: 1.25rem; font-weight: 700; color: #f1f5f9; margin: 0 0 2px; }
    .top-bar-left p { font-size: 0.8125rem; color: #64748b; margin: 0; }

    .panel { background: linear-gradient(135deg, #1a1f2e, #161b27); border: 1px solid rgba(20,184,166,0.15); border-radius: 20px; overflow: hidden; position: relative; min-height: 420px; box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
    .panel-accent { position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #14b8a6, #0ea5e9, #6366f1); }

    .state-view { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3rem 2rem; text-align: center; gap: 1rem; min-height: 420px; }
    .state-view h2 { font-size: 1.5rem; font-weight: 700; color: #f1f5f9; margin: 0; }
    .state-view p { color: #64748b; margin: 0; max-width: 320px; line-height: 1.6; font-size: 0.9375rem; }
    .state-view p strong { color: #94a3b8; }

    .icon-circle { width: 72px; height: 72px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2rem; }
    .icon-gray { background: rgba(100,116,139,0.15); border: 2px solid rgba(100,116,139,0.2); }
    .icon-green { background: rgba(16,185,129,0.15); border: 2px solid rgba(16,185,129,0.25); font-size: 2.5rem; color: #34d399; }
    .icon-red { background: rgba(239,68,68,0.15); border: 2px solid rgba(239,68,68,0.25); font-size: 2.5rem; color: #f87171; }
    .connected-title { background: linear-gradient(135deg, #34d399, #0ea5e9); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }

    .features-grid { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.5rem; }
    .feature-chip { padding: 0.4rem 0.875rem; background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.2); border-radius: 20px; font-size: 0.8125rem; color: #34d399; }

    .pulse-rings { position: relative; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; }
    .ring { position: absolute; border-radius: 50%; border: 2px solid rgba(20,184,166,0.4); animation: pulse 2s ease-out infinite; }
    .ring-1 { width: 80px; height: 80px; animation-delay: 0s; }
    .ring-2 { width: 56px; height: 56px; animation-delay: 0.4s; }
    .ring-3 { width: 32px; height: 32px; animation-delay: 0.8s; border-color: rgba(20,184,166,0.6); }
    .ring-icon { font-size: 1.25rem; position: relative; z-index: 1; }
    @keyframes pulse { 0% { transform: scale(0.8); opacity: 1; } 100% { transform: scale(1.4); opacity: 0; } }

    .qr-frame { background: #fff; padding: 12px; border-radius: 16px; box-shadow: 0 8px 30px rgba(0,0,0,0.4); border: 4px solid #1e293b; }
    .qr-frame img { width: 220px; height: 220px; display: block; }

    .qr-timer { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8125rem; color: #64748b; }
    .dot-blink { width: 8px; height: 8px; background: #14b8a6; border-radius: 50%; animation: blink 1.2s ease-in-out infinite; }
    @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.2; } }

    .alert { display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1rem; border-radius: 10px; font-size: 0.875rem; }
    .alert-error { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25); color: #f87171; }
    .err-txt { color: #f87171 !important; }

    .btn { padding: 0.75rem 2rem; border: none; border-radius: 10px; font-size: 0.9375rem; font-weight: 600; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; }
    .btn-primary { background: linear-gradient(135deg, #14b8a6, #0ea5e9); color: #fff; box-shadow: 0 4px 15px rgba(20,184,166,0.25); }
    .btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(20,184,166,0.35); }
    .btn-danger { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25); color: #f87171; }
    .btn-danger:hover:not(:disabled) { background: rgba(239,68,68,0.2); }
    .btn-ghost { background: rgba(20,184,166,0.08); color: #94a3b8; border: 1px solid rgba(20,184,166,0.15); padding: 0.5rem 1rem; }
    .btn-ghost:hover:not(:disabled) { background: rgba(20,184,166,0.15); color: #e2e8f0; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

    .spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; }
    .spinner-lg { width: 44px; height: 44px; border: 3px solid rgba(20,184,166,0.2); border-top-color: #14b8a6; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .auth-mode-switch { display: flex; gap: 0.5rem; justify-content: center; margin: 1.5rem 0 1rem; }
    .mode-btn { padding: 0.5rem 1rem; border-radius: 8px; border: 1px solid #334155; background: transparent; color: #94a3b8; cursor: pointer; transition: 0.2s; font-size: 0.9rem; }
    .mode-btn.active { background: rgba(20,184,166,0.1); color: #14b8a6; border-color: #14b8a6; font-weight: 600; }
    
    .phone-input-wrapper { display: flex; align-items: center; justify-content: center; margin-bottom: 1.5rem; }
    .phone-prefix { background: #1e293b; color: #94a3b8; padding: 0.75rem 1rem; border: 1px solid #334155; border-right: none; border-radius: 8px 0 0 8px; font-weight: 600; font-size: 1.1rem; }
    .phone-input-styled { padding: 0.75rem; border-radius: 0 8px 8px 0; border: 1px solid #334155; background: #0f172a; color: #f8fafc; width: 100%; max-width: 220px; text-align: left; font-size: 1.1rem; outline: none; transition: 0.2s; }
    .phone-input-styled:focus { border-color: #14b8a6; }
    
    .pairing-code-wrapper { display: flex; flex-direction: column; align-items: center; gap: 1rem; margin: 1.5rem 0; }
    .pairing-code-display { font-size: 3rem; font-weight: 800; letter-spacing: 8px; padding: 1.5rem 2rem; background: linear-gradient(135deg, #0f172a, #1e293b); border-radius: 12px; border: 2px solid #14b8a6; color: #14b8a6; text-align: center; font-family: monospace; box-shadow: 0 0 20px rgba(20,184,166,0.2); text-shadow: 0 0 10px rgba(20,184,166,0.4); margin: 0; }
    .btn-copy { font-size: 0.9rem; padding: 0.5rem 1.5rem; }
</style>
