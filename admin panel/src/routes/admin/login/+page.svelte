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
        <div class="brand-icon">⚡</div>
        <h1>Admin Access</h1>
        <p>MR FK Engine Control Panel</p>
    </div>

    {#if error}
        <div class="alert alert-error"><span>⚠</span> {error}</div>
    {/if}

    <form onsubmit={(e) => { e.preventDefault(); handleLogin(); }} class="form">
        <div class="field">
            <label for="email">Admin Email</label>
            <input id="email" type="email" bind:value={email} required disabled={loading} autocomplete="email" />
        </div>
        <div class="field">
            <label for="password">Password</label>
            <input id="password" type="password" bind:value={password} required disabled={loading} autocomplete="current-password" />
        </div>
        <button type="submit" class="btn btn-primary" disabled={loading}>
            {#if loading}<span class="spinner"></span> Authenticating...{:else}Enter Control Panel{/if}
        </button>
    </form>
</div>

<style>
    .card { width: 100%; max-width: 420px; background: linear-gradient(135deg, #1a1f2e, #161b27); border: 1px solid rgba(99,102,241,0.2); border-radius: 20px; padding: 2.5rem; position: relative; overflow: hidden; box-shadow: 0 25px 50px rgba(0,0,0,0.5); }
    .card-glow { position: absolute; top: -80px; right: -80px; width: 200px; height: 200px; background: radial-gradient(circle, rgba(99,102,241,0.15), transparent 70%); border-radius: 50%; pointer-events: none; }
    .brand { text-align: center; margin-bottom: 2rem; position: relative; z-index: 1; }
    .brand-icon { font-size: 2.5rem; margin-bottom: 0.75rem; display: block; }
    .brand h1 { font-size: 1.75rem; font-weight: 700; color: #fff; margin: 0 0 0.25rem; letter-spacing: -0.5px; }
    .brand p { font-size: 0.875rem; color: #64748b; margin: 0; }
    .alert { display: flex; align-items: center; gap: 0.5rem; padding: 0.875rem 1rem; border-radius: 10px; font-size: 0.875rem; margin-bottom: 1.25rem; position: relative; z-index: 1; }
    .alert-error { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); color: #f87171; }
    .form { position: relative; z-index: 1; }
    .field { margin-bottom: 1.25rem; }
    .field label { display: block; font-size: 0.8125rem; font-weight: 500; color: #94a3b8; margin-bottom: 0.5rem; }
    .field input { width: 100%; padding: 0.75rem 1rem; background: rgba(10,15,30,0.8); border: 1px solid rgba(99,102,241,0.2); border-radius: 10px; color: #e2e8f0; font-size: 0.9375rem; outline: none; transition: border-color 0.2s, box-shadow 0.2s; box-sizing: border-box; }
    .field input:focus { border-color: rgba(99,102,241,0.5); box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
    .field input:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn { width: 100%; padding: 0.875rem; border: none; border-radius: 10px; font-size: 0.9375rem; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 0.5rem; }
    .btn-primary { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; box-shadow: 0 4px 15px rgba(99,102,241,0.3); }
    .btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(99,102,241,0.4); }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
    .spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
</style>
