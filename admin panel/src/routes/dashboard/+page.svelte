<script>
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';

    let token = '';
    let status = 'disconnected'; // 'disconnected', 'starting', 'qr_ready', 'connected', 'error'
    let qrBase64 = null;
    let loading = true;
    let pollInterval = null;

    const API_URL = 'https://162.35.171.126.nip.io/api';

    onMount(() => {
        token = localStorage.getItem('userToken'); // This acts as their unique Session ID in our SaaS
        if (!token) {
            goto('/login');
            return;
        }
        
        checkStatus();
    });

    async function checkStatus() {
        try {
            const res = await fetch(`${API_URL}/sessions/${token}/status`);
            const data = await res.json();
            
            if (data.status === 'not_found' || data.status === 'disconnected') {
                status = 'disconnected';
                qrBase64 = null;
                stopPolling();
            } else {
                status = data.status;
                if (data.qr) qrBase64 = data.qr;
                
                if (status === 'starting' || status === 'qr_ready') {
                    startPolling();
                } else if (status === 'connected') {
                    qrBase64 = null;
                    stopPolling();
                }
            }
        } catch (err) {
            console.error('Error fetching status:', err);
        } finally {
            loading = false;
        }
    }

    function startPolling() {
        if (!pollInterval) {
            pollInterval = setInterval(checkStatus, 3000);
        }
    }

    function stopPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    }

    async function requestConnection() {
        loading = true;
        try {
            const res = await fetch(`${API_URL}/sessions/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: token })
            });
            
            if (res.ok) {
                status = 'starting';
                startPolling();
            } else {
                const data = await res.json();
                console.error(data.error);
                status = 'error';
            }
        } catch (err) {
            console.error('Connection request failed:', err);
            status = 'error';
        } finally {
            loading = false;
        }
    }

    async function disconnect() {
        if (!confirm('Are you sure you want to disconnect your WhatsApp?')) return;
        loading = true;
        try {
            await fetch(`${API_URL}/sessions/stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: token })
            });
            status = 'disconnected';
            qrBase64 = null;
            stopPolling();
        } catch (err) {
            console.error(err);
        } finally {
            loading = false;
        }
    }

    function logout() {
        localStorage.removeItem('userToken');
        goto('/login');
    }
</script>

<div class="w-full max-w-4xl space-y-8">
    <div class="flex justify-between items-center">
        <div>
            <h1 class="text-3xl font-bold text-white">Console</h1>
            <p class="text-slate-400 mt-1">Connect your WhatsApp instance</p>
        </div>
        <button on:click={logout} class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700">Logout</button>
    </div>

    <div class="bg-[#1e293b] rounded-3xl border border-slate-700/50 shadow-2xl overflow-hidden relative">
        <div class="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-teal-500 to-emerald-400"></div>
        
        <div class="p-8 md:p-12 flex flex-col items-center text-center space-y-6">
            
            {#if loading}
                <div class="py-12">
                    <svg class="animate-spin h-12 w-12 text-teal-500 mx-auto" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <p class="mt-4 text-slate-400">Loading your instance...</p>
                </div>
            
            {:else if status === 'disconnected' || status === 'not_found'}
                <div class="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-2 shadow-inner">
                    <svg class="w-10 h-10 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                </div>
                <h2 class="text-2xl font-bold text-white">WhatsApp Not Connected</h2>
                <p class="text-slate-400 max-w-md mx-auto">Link your WhatsApp to activate the Anti-Delete and View-Once engine.</p>
                
                <button on:click={requestConnection} class="mt-8 px-8 py-4 bg-teal-500 hover:bg-teal-400 text-slate-900 font-bold rounded-2xl shadow-lg shadow-teal-500/20 transition-all transform hover:scale-105 active:scale-95">
                    Generate Connection QR
                </button>

            {:else if status === 'starting'}
                <div class="py-12 space-y-6">
                    <div class="relative w-24 h-24 mx-auto">
                        <div class="absolute inset-0 rounded-full border-t-2 border-teal-500 animate-spin"></div>
                        <div class="absolute inset-2 rounded-full border-r-2 border-emerald-400 animate-spin" style="animation-direction: reverse; animation-duration: 1.5s;"></div>
                        <div class="absolute inset-4 rounded-full border-b-2 border-cyan-400 animate-spin" style="animation-duration: 2s;"></div>
                    </div>
                    <div>
                        <h2 class="text-xl font-bold text-white">Booting Engine...</h2>
                        <p class="text-slate-400">Requesting secure QR code from WhatsApp servers.</p>
                    </div>
                </div>

            {:else if status === 'qr_ready' && qrBase64}
                <div class="bg-white p-4 rounded-3xl shadow-2xl mx-auto inline-block border-8 border-slate-800">
                    <img src={qrBase64} alt="WhatsApp QR Code" class="w-64 h-64 object-contain">
                </div>
                <div>
                    <h2 class="text-2xl font-bold text-white flex items-center justify-center gap-2">
                        <span class="relative flex h-3 w-3">
                          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                          <span class="relative inline-flex rounded-full h-3 w-3 bg-teal-500"></span>
                        </span>
                        Awaiting Scan
                    </h2>
                    <p class="text-slate-400 mt-2 max-w-md mx-auto">Open WhatsApp on your phone > Linked Devices > Link a Device. Point your camera at this code.</p>
                </div>

            {:else if status === 'connected'}
                <div class="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mb-2 shadow-[0_0_30px_rgba(16,185,129,0.3)]">
                    <svg class="w-12 h-12 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                </div>
                <h2 class="text-3xl font-bold text-white text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-200">Engine Active</h2>
                <p class="text-slate-400 max-w-md mx-auto">Your WhatsApp is successfully routed through the MR FK Engine. Anti-Delete and Auto View-Once modules are running.</p>
                
                <div class="pt-8 w-full max-w-md">
                    <button on:click={disconnect} class="w-full px-6 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-medium rounded-xl transition-colors">
                        Disconnect Instance
                    </button>
                </div>
                
            {:else if status === 'error'}
                <div class="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-2">
                    <svg class="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </div>
                <h2 class="text-2xl font-bold text-white">Connection Failed</h2>
                <p class="text-slate-400">The engine encountered an error while booting. Please try again.</p>
                <button on:click={requestConnection} class="mt-6 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-xl transition-colors">
                    Retry Connection
                </button>
            {/if}

        </div>
    </div>
</div>
