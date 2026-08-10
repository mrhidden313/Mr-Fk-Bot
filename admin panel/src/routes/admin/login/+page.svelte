<script>
    import { goto } from '$app/navigation';

    let email = $state('');
    let password = $state('');
    let error = $state('');
    let loading = $state(false);

    const API_URL = '/api';

    async function handleLogin() {
        loading = true;
        error = '';
        try {
            const res = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            let data;
            try { data = await res.json(); } catch { data = {}; }
            if (res.ok && data.role === 'admin') {
                localStorage.setItem('adminToken', data.token);
                goto('/admin/dashboard');
            } else {
                error = data.error || 'Invalid credentials.';
            }
        } catch {
            error = 'Network error. Cannot reach server.';
        } finally {
            loading = false;
        }
    }
</script>

<div class="card">
    <div class="card-glow"></div>
    <div class="brand">
        <div class="icon">⚡</div>
        <h1>Admin Command</h1>
        <p>Secure access to the MR FK engine core.</p>
    </div>

    {#if error}
        <div class="alert">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            {error}
        </div>
    {/if}

    <form onsubmit={(e) => { e.preventDefault(); handleLogin(); }}>
        <div class="field">
            <label for="email">Admin Email</label>
            <input id="email" type="email" bind:value={email} required disabled={loading} autocomplete="email" />
        </div>
        <div class="field">
            <label for="password">Master Password</label>
            <input id="password" type="password" bind:value={password} required disabled={loading} autocomplete="current-password" />
        </div>
        <button type="submit" disabled={loading}>
            {#if loading}<span class="spin"></span> Authenticating...{:else}Bypass Security{/if}
        </button>
    </form>
</div>

<style>
    .card {
        width: 100%; max-width: 400px;
        background: rgba(30, 41, 59, 0.8);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(100, 116, 139, 0.3);
        border-radius: 20px;
        padding: 2.5rem;
        position: relative; overflow: hidden;
        box-shadow: 0 25px 50px rgba(0,0,0,0.5);
    }
    .card-glow {
        position: absolute; top: -60px; right: -60px;
        width: 180px; height: 180px;
        background: radial-gradient(circle, rgba(16,185,129,0.2), transparent 70%);
        border-radius: 50%; pointer-events: none;
    }
    .brand { text-align: center; margin-bottom: 2rem; position: relative; z-index: 1; }
    .icon { font-size: 2rem; margin-bottom: 0.625rem; display: block; }
    .brand h1 { font-size: 1.625rem; font-weight: 700; color: #fff; margin: 0 0 0.25rem; }
    .brand p { font-size: 0.875rem; color: #64748b; margin: 0; }

    .alert {
        display: flex; align-items: center; gap: 0.5rem;
        padding: 0.75rem 1rem; border-radius: 10px;
        font-size: 0.875rem; margin-bottom: 1.25rem;
        background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); color: #f87171;
        position: relative; z-index: 1;
    }

    form { position: relative; z-index: 1; }
    .field { margin-bottom: 1.125rem; }
    .field label { display: block; font-size: 0.8125rem; font-weight: 500; color: #94a3b8; margin-bottom: 0.4rem; }
    .field input {
        width: 100%; padding: 0.75rem 1rem;
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid rgba(100,116,139,0.4);
        border-radius: 10px; color: #e2e8f0;
        font-size: 0.9375rem; outline: none;
        transition: border-color 0.2s, box-shadow 0.2s;
        box-sizing: border-box;
    }
    .field input:focus { border-color: #10b981; box-shadow: 0 0 0 3px rgba(16,185,129,0.15); }
    .field input:disabled { opacity: 0.55; cursor: not-allowed; }

    button[type="submit"] {
        width: 100%; margin-top: 0.5rem;
        padding: 0.875rem;
        background: #10b981; color: white;
        border: none; border-radius: 10px;
        font-size: 0.9375rem; font-weight: 600;
        cursor: pointer; transition: all 0.2s;
        display: flex; align-items: center; justify-content: center; gap: 0.5rem;
        box-shadow: 0 4px 15px rgba(16,185,129,0.3);
    }
    button[type="submit"]:hover:not(:disabled) { background: #059669; transform: translateY(-1px); box-shadow: 0 6px 20px rgba(16,185,129,0.4); }
    button[type="submit"]:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

    .spin { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
</style>
