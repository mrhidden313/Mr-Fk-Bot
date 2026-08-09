<script>
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';

    let email = '';
    let password = '';
    let error = '';
    let loading = false;

    // Production HTTPS endpoint
    const API_URL = 'https://162.35.171.126.nip.io/api';

    async function handleLogin() {
        loading = true;
        error = '';
        
        try {
            const res = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            
            const data = await res.json();
            
            if (res.ok && data.role === 'admin') {
                localStorage.setItem('adminToken', data.token);
                goto('/admin/dashboard');
            } else {
                error = data.error || 'Access Denied. Admin only.';
            }
        } catch (err) {
            error = 'Could not connect to the server.';
        } finally {
            loading = false;
        }
    }
</script>

<div class="w-full max-w-md p-8 space-y-8 bg-[#1e293b]/80 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-700/50 relative overflow-hidden">
    <!-- Decorative gradient blob -->
    <div class="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl"></div>
    
    <div class="relative z-10 text-center">
        <h2 class="text-3xl font-bold tracking-tight text-white">Admin Command</h2>
        <p class="mt-2 text-sm text-slate-400">Secure access to the MR FK engine core.</p>
    </div>

    {#if error}
        <div class="relative z-10 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            {error}
        </div>
    {/if}

    <form class="relative z-10 mt-8 space-y-6" on:submit|preventDefault={handleLogin}>
        <div class="space-y-4">
            <div>
                <label for="email" class="block text-sm font-medium text-slate-300">Admin Email</label>
                <input id="email" bind:value={email} type="email" required class="mt-1 block w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all duration-200" placeholder="mrhiddenhacker313@gmail.com">
            </div>
            <div>
                <label for="password" class="block text-sm font-medium text-slate-300">Master Password</label>
                <input id="password" bind:value={password} type="password" required class="mt-1 block w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all duration-200" placeholder="••••••••">
            </div>
        </div>

        <button type="submit" disabled={loading} class="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 focus:ring-offset-slate-900 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
            {#if loading}
                <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Authenticating...
            {:else}
                Bypass Security
            {/if}
        </button>
    </form>
</div>
