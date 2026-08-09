<script>
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';

    let users = [];
    let loading = true;
    let newEmail = '';
    let newPassword = '';
    let creating = false;
    let message = '';
    
    const API_URL = 'http://localhost:3000/api';
    let token = '';

    onMount(async () => {
        token = localStorage.getItem('adminToken');
        if (!token) {
            goto('/admin/login');
            return;
        }
        await fetchUsers();
    });

    async function fetchUsers() {
        try {
            const res = await fetch(`${API_URL}/admin/users`, {
                headers: { 'Authorization': token }
            });
            if (res.ok) {
                users = await res.json();
            } else {
                goto('/admin/login');
            }
        } catch (err) {
            console.error(err);
        } finally {
            loading = false;
        }
    }

    async function createUser() {
        creating = true;
        message = '';
        try {
            const res = await fetch(`${API_URL}/admin/users/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, email: newEmail, password: newPassword })
            });
            const data = await res.json();
            if (res.ok) {
                message = `✅ User created successfully!`;
                newEmail = '';
                newPassword = '';
                await fetchUsers();
            } else {
                message = `❌ ${data.error}`;
            }
        } catch (err) {
            message = '❌ Failed to connect.';
        } finally {
            creating = false;
        }
    }

    function logout() {
        localStorage.removeItem('adminToken');
        goto('/admin/login');
    }
</script>

<div class="w-full max-w-6xl space-y-8">
    <div class="flex justify-between items-center">
        <div>
            <h1 class="text-3xl font-bold text-white">Admin Dashboard</h1>
            <p class="text-slate-400 mt-1">Manage SaaS Clients & Access Control</p>
        </div>
        <button on:click={logout} class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700">Logout</button>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        <!-- Create User Card -->
        <div class="bg-[#1e293b] rounded-2xl border border-slate-700/50 p-6 shadow-xl h-fit">
            <h2 class="text-xl font-bold text-white mb-6 flex items-center gap-2">
                <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                Generate Client Account
            </h2>
            
            <form on:submit|preventDefault={createUser} class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-slate-400 mb-1">Client Email</label>
                    <input type="email" bind:value={newEmail} required class="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500">
                </div>
                <div>
                    <label class="block text-sm font-medium text-slate-400 mb-1">Temporary Password</label>
                    <input type="text" bind:value={newPassword} required class="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500">
                </div>
                <button type="submit" disabled={creating} class="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-colors disabled:opacity-50">
                    {creating ? 'Creating...' : 'Create Account'}
                </button>
            </form>
            
            {#if message}
                <div class="mt-4 p-3 rounded-lg text-sm {message.startsWith('✅') ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}">
                    {message}
                </div>
            {/if}
        </div>

        <!-- Users List -->
        <div class="lg:col-span-2 bg-[#1e293b] rounded-2xl border border-slate-700/50 p-6 shadow-xl overflow-hidden flex flex-col">
            <h2 class="text-xl font-bold text-white mb-6">Active Clients</h2>
            
            {#if loading}
                <div class="flex-grow flex items-center justify-center">
                    <svg class="animate-spin h-8 w-8 text-emerald-500" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                </div>
            {:else if users.length === 0}
                <div class="flex-grow flex flex-col items-center justify-center text-slate-500 space-y-2">
                    <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                    <p>No client accounts generated yet.</p>
                </div>
            {:else}
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="border-b border-slate-700 text-sm text-slate-400">
                                <th class="pb-3 font-medium">Client Email</th>
                                <th class="pb-3 font-medium">WhatsApp Status</th>
                                <th class="pb-3 font-medium">Created</th>
                            </tr>
                        </thead>
                        <tbody class="text-sm">
                            {#each users as user}
                                <tr class="border-b border-slate-700/50 hover:bg-slate-800/30 transition-colors">
                                    <td class="py-4 font-medium text-slate-200">{user.email}</td>
                                    <td class="py-4">
                                        {#if user.connectedNumber}
                                            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                                Connected
                                            </span>
                                        {:else}
                                            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20">
                                                Not Connected
                                            </span>
                                        {/if}
                                    </td>
                                    <td class="py-4 text-slate-500">{new Date(user.createdAt).toLocaleDateString()}</td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {/if}
        </div>
    </div>
</div>
