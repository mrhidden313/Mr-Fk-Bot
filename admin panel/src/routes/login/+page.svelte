<script>
    import { goto } from '$app/navigation';

    let email = '';
    let password = '';
    let error = '';
    let loading = false;

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
            
            if (res.ok && data.role === 'user') {
                localStorage.setItem('userToken', data.token); // token is the user._id
                goto('/dashboard');
            } else {
                error = data.error || 'Invalid credentials or you are not a Client.';
            }
        } catch (err) {
            error = 'Could not connect to the MR FK Engine.';
        } finally {
            loading = false;
        }
    }
</script>

<div class="w-full max-w-md p-8 space-y-8 bg-[#1e293b]/80 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-700/50 relative overflow-hidden">
    <!-- Decorative gradient blob -->
    <div class="absolute -top-24 -left-24 w-48 h-48 bg-teal-500/20 rounded-full blur-3xl"></div>
    
    <div class="relative z-10 text-center">
        <h2 class="text-3xl font-bold tracking-tight text-white">Client Portal</h2>
        <p class="mt-2 text-sm text-slate-400">Login with the credentials provided by your Administrator.</p>
    </div>

    {#if error}
        <div class="relative z-10 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
            <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            {error}
        </div>
    {/if}

    <form class="relative z-10 mt-8 space-y-6" on:submit|preventDefault={handleLogin}>
        <div class="space-y-4">
            <div>
                <label for="email" class="block text-sm font-medium text-slate-300">Email Address</label>
                <input id="email" bind:value={email} type="email" required class="mt-1 block w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all duration-200" placeholder="you@example.com">
            </div>
            <div>
                <label for="password" class="block text-sm font-medium text-slate-300">Password</label>
                <input id="password" bind:value={password} type="password" required class="mt-1 block w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all duration-200" placeholder="••••••••">
            </div>
        </div>

        <button type="submit" disabled={loading} class="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-slate-900 bg-teal-400 hover:bg-teal-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 focus:ring-offset-slate-900 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
            {#if loading}
                <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-slate-900" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Connecting...
            {:else}
                Login to Console
            {/if}
        </button>
    </form>
</div>
