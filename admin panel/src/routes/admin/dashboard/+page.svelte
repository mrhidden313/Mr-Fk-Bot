<script>
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';

    let users = $state([]);
    let pageLoading = $state(true);
    let fetchError = $state('');
    let newEmail = $state('');
    let newPassword = $state('');
    let creating = $state(false);
    let createMessage = $state('');
    let createError = $state('');
    let token = $state('');
    let deletingId = $state(null);
    let unlinkingId = $state(null);

    // Detail Panel State
    let selectedUser = $state(null);

    const API_URL = '/api';

    onMount(async () => {
        token = localStorage.getItem('adminToken') || '';
        if (!token) { goto('/admin/login'); return; }
        await fetchUsers();
    });

    async function fetchUsers() {
        pageLoading = true;
        fetchError = '';
        try {
            const res = await fetch(`${API_URL}/admin/users`, {
                headers: { 'x-admin-token': token, 'Authorization': token }
            });
            if (res.status === 403 || res.status === 401) {
                localStorage.removeItem('adminToken');
                goto('/admin/login');
                return;
            }
            let data;
            try { data = await res.json(); } catch { data = []; }
            if (res.ok) { users = Array.isArray(data) ? data : []; }
            else { fetchError = data.error || `Server error (${res.status})`; }
        } catch (err) {
            fetchError = 'Network error — cannot reach server.';
        } finally {
            pageLoading = false;
        }
    }

    async function createUser() {
        if (!newEmail.trim() || !newPassword.trim()) {
            createError = 'Both fields are required.';
            return;
        }
        creating = true;
        createMessage = '';
        createError = '';
        try {
            const res = await fetch(`${API_URL}/admin/users/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
                body: JSON.stringify({ token, email: newEmail.trim(), password: newPassword.trim() })
            });
            let data;
            try { data = await res.json(); } catch { data = {}; }
            if (res.ok) {
                createMessage = `✓ "${newEmail}" created!`;
                newEmail = '';
                newPassword = '';
                await fetchUsers();
            } else {
                createError = data.error || `Failed (${res.status})`;
            }
        } catch {
            createError = 'Network error.';
        } finally {
            creating = false;
        }
    }

    async function deleteUser(userId, userEmail) {
        if (!confirm(`Delete ${userEmail}? This will also unlink WhatsApp and remove all chats.`)) return;
        deletingId = userId;
        try {
            const res = await fetch(`${API_URL}/admin/users/${userId}`, {
                method: 'DELETE',
                headers: { 'x-admin-token': token, 'Authorization': token }
            });
            if (res.ok) {
                users = users.filter(u => u._id !== userId);
                if (selectedUser && selectedUser._id === userId) selectedUser = null;
            } else {
                let data; try { data = await res.json(); } catch { data = {}; }
                alert(data.error || 'Delete failed.');
            }
        } catch { alert('Network error.'); }
        finally { deletingId = null; }
    }

    async function unlinkWhatsApp(userId) {
        if (!confirm('Are you sure you want to unlink WhatsApp for this user? This will log them out immediately.')) return;
        unlinkingId = userId;
        try {
            const res = await fetch(`${API_URL}/admin/users/${userId}/unlink`, {
                method: 'POST',
                headers: { 'x-admin-token': token, 'Authorization': token }
            });
            if (res.ok) {
                // Update local state
                users = users.map(u => {
                    if (u._id === userId) {
                        return { ...u, connectedNumber: null };
                    }
                    return u;
                });
                if (selectedUser && selectedUser._id === userId) {
                    selectedUser.connectedNumber = null;
                }
                alert('WhatsApp unlinked successfully.');
            } else {
                let data; try { data = await res.json(); } catch { data = {}; }
                alert(data.error || 'Unlink failed.');
            }
        } catch { alert('Network error.'); }
        finally { unlinkingId = null; }
    }

    function viewChats(userId) {
        goto(`/admin/users/${userId}/chats`);
    }

    function logout() {
        localStorage.removeItem('adminToken');
        goto('/admin/login');
    }

    function formatDate(d) {
        if (!d) return '—';
        return new Date(d).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    function openUserDetail(user) {
        selectedUser = user;
    }

    function closeDetail() {
        selectedUser = null;
    }
</script>

<div class="dashboard">
    <!-- Header -->
    <div class="topbar">
        <div class="topbar-left">
            <h1>Admin Dashboard</h1>
            <p>Manage SaaS Clients &amp; Access Control</p>
        </div>
        <button class="btn-logout" onclick={logout}>Logout</button>
    </div>

    <div class="grid">
        <!-- Sidebar: Create User & Stats -->
        <div class="sidebar">
            <div class="card">
                <h2 class="card-title">
                    <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                    Generate Client
                </h2>

                {#if createMessage}
                    <div class="msg msg-ok">{createMessage}</div>
                {/if}
                {#if createError}
                    <div class="msg msg-err">⚠ {createError}</div>
                {/if}

                <form onsubmit={(e) => { e.preventDefault(); createUser(); }}>
                    <div class="field">
                        <label for="newEmail">Client Email</label>
                        <input id="newEmail" type="email" bind:value={newEmail} required disabled={creating} placeholder="client@example.com" />
                    </div>
                    <div class="field">
                        <label for="newPass">Temporary Password</label>
                        <input id="newPass" type="text" bind:value={newPassword} required disabled={creating} placeholder="Set a password" />
                    </div>
                    <button type="submit" class="btn-create" disabled={creating}>
                        {#if creating}<span class="spin"></span> Creating...{:else}Create Account{/if}
                    </button>
                </form>

                <div class="divider"></div>

                <div class="stats">
                    <div class="stat">
                        <span class="stat-n">{users.length}</span>
                        <span class="stat-l">Total Clients</span>
                    </div>
                    <div class="stat">
                        <span class="stat-n">{users.filter(u => u.connectedNumber).length}</span>
                        <span class="stat-l">Connected</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Main Area: Users Table or Detail Panel -->
        <div class="main-content">
            <div class="card fill-height">
                <div class="card-header">
                    <h2 class="card-title" style="margin:0">
                        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0"/></svg>
                        Active Clients
                    </h2>
                    <button class="btn-refresh" onclick={fetchUsers} disabled={pageLoading}>
                        {pageLoading ? '...' : '↻ Refresh'}
                    </button>
                </div>

                {#if pageLoading}
                    <div class="state">
                        <div class="spin-lg"></div>
                        <p>Loading clients...</p>
                    </div>
                {:else if fetchError}
                    <div class="state">
                        <p class="err-txt">⚠ {fetchError}</p>
                        <button class="btn-refresh" onclick={fetchUsers}>Retry</button>
                    </div>
                {:else if users.length === 0}
                    <div class="state">
                        <p style="color:#64748b">No clients yet. Create your first one.</p>
                    </div>
                {:else}
                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Client Email</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each users as user}
                                    <tr onclick={() => openUserDetail(user)} class={selectedUser?._id === user._id ? 'active-row' : ''}>
                                        <td class="em">{user.email}</td>
                                        <td>
                                            {#if user.connectedNumber}
                                                <span class="badge green">● Connected</span>
                                            {:else}
                                                <span class="badge gray">○ Not Connected</span>
                                            {/if}
                                        </td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                {/if}
            </div>
        </div>
    </div>
</div>

<!-- Slide-in User Detail Panel -->
{#if selectedUser}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="backdrop" onclick={closeDetail}></div>
    <div class="detail-panel">
        <div class="panel-header">
            <h3>Client Details</h3>
            <button class="btn-close" onclick={closeDetail}>✕</button>
        </div>
        <div class="panel-content">
            <div class="info-group">
                <div class="label-text">Email</div>
                <div class="info-val">{selectedUser.email}</div>
            </div>
            <div class="info-group">
                <div class="label-text">User ID</div>
                <div class="info-val mono">{selectedUser._id}</div>
            </div>
            <div class="info-group">
                <div class="label-text">Created On</div>
                <div class="info-val">{formatDate(selectedUser.createdAt)}</div>
            </div>
            <div class="info-group">
                <div class="label-text">WhatsApp Status</div>
                <div class="info-val">
                    {#if selectedUser.connectedNumber}
                        <span class="badge green" style="font-size: 0.875rem;">● Connected (+{selectedUser.connectedNumber})</span>
                    {:else}
                        <span class="badge gray" style="font-size: 0.875rem;">○ Not Connected</span>
                    {/if}
                </div>
            </div>

            <div class="divider" style="margin: 2rem 0 1rem;"></div>
            <h4>Actions</h4>
            <div class="action-buttons">
                <button class="btn-action primary" onclick={() => viewChats(selectedUser._id)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    View Chats (Read Only)
                </button>
                
                <button class="btn-action warning" onclick={() => unlinkWhatsApp(selectedUser._id)} disabled={!selectedUser.connectedNumber || unlinkingId === selectedUser._id}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>
                    {unlinkingId === selectedUser._id ? 'Unlinking...' : 'Unlink WhatsApp'}
                </button>

                <button class="btn-action danger" onclick={() => deleteUser(selectedUser._id, selectedUser.email)} disabled={deletingId === selectedUser._id}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    {deletingId === selectedUser._id ? 'Deleting...' : 'Delete User Completely'}
                </button>
            </div>
        </div>
    </div>
{/if}

<style>
    .dashboard { width: 100%; max-width: 1400px; padding: 0 1rem; margin: 0 auto; }

    .topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; padding: 1rem 0; border-bottom: 1px solid rgba(100,116,139,0.1); }
    .topbar-left h1 { font-size: 1.875rem; font-weight: 700; color: #fff; margin: 0 0 4px; }
    .topbar-left p { font-size: 0.95rem; color: #64748b; margin: 0; }
    .btn-logout { padding: 0.6rem 1.25rem; background: rgba(30,41,59,0.8); border: 1px solid rgba(100,116,139,0.3); border-radius: 8px; color: #94a3b8; font-size: 0.9rem; font-weight: 500; cursor: pointer; transition: all 0.2s; }
    .btn-logout:hover { background: rgba(51,65,85,0.8); color: #e2e8f0; border-color: rgba(100,116,139,0.5); }

    .grid { display: grid; grid-template-columns: 320px 1fr; gap: 1.5rem; align-items: start; height: calc(100vh - 120px); min-height: 600px; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; height: auto; } }

    .sidebar { display: flex; flex-direction: column; gap: 1.5rem; }
    .main-content { display: flex; flex-direction: column; height: 100%; }

    .card { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(12px); border: 1px solid rgba(100,116,139,0.2); border-radius: 12px; padding: 1.5rem; display: flex; flex-direction: column; }
    .fill-height { height: 100%; overflow: hidden; }
    
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; padding-bottom: 0.75rem; border-bottom: 1px solid rgba(100,116,139,0.1); }
    .card-title { font-size: 1.1rem; font-weight: 600; color: #f8fafc; margin: 0 0 1.25rem; display: flex; align-items: center; gap: 0.6rem; }

    .field { margin-bottom: 1.25rem; }
    .field label { display: block; font-size: 0.875rem; font-weight: 500; color: #94a3b8; margin-bottom: 0.4rem; }
    .field input { width: 100%; padding: 0.75rem 1rem; background: rgba(15,23,42,0.6); border: 1px solid rgba(100,116,139,0.4); border-radius: 8px; color: #f1f5f9; font-size: 0.9rem; outline: none; transition: border-color 0.2s, box-shadow 0.2s; box-sizing: border-box; }
    .field input:focus { border-color: #10b981; box-shadow: 0 0 0 3px rgba(16,185,129,0.15); }
    .field input:disabled { opacity: 0.6; cursor: not-allowed; }
    .field input::placeholder { color: #475569; }

    .btn-create { width: 100%; padding: 0.875rem; margin-top: 0.5rem; background: #10b981; color: white; border: none; border-radius: 8px; font-size: 0.95rem; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 0.5rem; box-shadow: 0 4px 12px rgba(16,185,129,0.2); }
    .btn-create:hover:not(:disabled) { background: #059669; transform: translateY(-1px); box-shadow: 0 6px 16px rgba(16,185,129,0.3); }
    .btn-create:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

    .btn-refresh { padding: 0.4rem 0.8rem; background: rgba(30,41,59,0.8); border: 1px solid rgba(100,116,139,0.4); border-radius: 6px; color: #cbd5e1; font-size: 0.85rem; font-weight: 500; cursor: pointer; transition: all 0.2s; }
    .btn-refresh:hover:not(:disabled) { color: #fff; background: rgba(51,65,85,1); }

    .msg { padding: 0.75rem 1rem; border-radius: 8px; font-size: 0.875rem; margin-bottom: 1.25rem; }
    .msg-ok { background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.25); color: #34d399; }
    .msg-err { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25); color: #f87171; }

    .divider { height: 1px; background: rgba(100,116,139,0.15); margin: 1.5rem 0; }
    .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .stat { background: rgba(15,23,42,0.5); border: 1px solid rgba(100,116,139,0.2); border-radius: 10px; padding: 1rem; text-align: center; }
    .stat-n { display: block; font-size: 1.875rem; font-weight: 700; color: #10b981; }
    .stat-l { display: block; font-size: 0.8rem; color: #64748b; margin-top: 4px; font-weight: 500; }

    .state { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; padding: 3rem 1rem; gap: 1rem; text-align: center; }
    .err-txt { color: #f87171; font-size: 0.95rem; margin: 0; }

    .table-wrap { overflow-y: auto; flex: 1; padding-right: 4px; }
    .table-wrap::-webkit-scrollbar { width: 6px; }
    .table-wrap::-webkit-scrollbar-thumb { background: rgba(100,116,139,0.3); border-radius: 3px; }
    
    table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.95rem; }
    thead tr { position: sticky; top: 0; background: rgba(30,41,59,0.95); backdrop-filter: blur(4px); z-index: 10; }
    th { padding: 0.75rem 1rem; text-align: left; font-weight: 600; color: #94a3b8; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(100,116,139,0.2); }
    tbody tr { cursor: pointer; transition: all 0.2s; }
    tbody tr:hover { background: rgba(16,185,129,0.05); }
    tbody tr.active-row { background: rgba(16,185,129,0.1); border-left: 3px solid #10b981; }
    td { padding: 1rem; color: #cbd5e1; border-bottom: 1px solid rgba(100,116,139,0.1); }
    .em { color: #f8fafc; font-weight: 500; }

    .badge { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.3rem 0.75rem; border-radius: 20px; font-size: 0.8rem; font-weight: 500; }
    .green { background: rgba(16,185,129,0.15); color: #34d399; border: 1px solid rgba(16,185,129,0.3); }
    .gray { background: rgba(100,116,139,0.15); color: #94a3b8; border: 1px solid rgba(100,116,139,0.3); }

    /* Detail Panel */
    .backdrop { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15,23,42,0.6); backdrop-filter: blur(4px); z-index: 40; }
    .detail-panel { position: fixed; top: 0; right: 0; bottom: 0; width: 400px; max-width: 100vw; background: #1e293b; z-index: 50; box-shadow: -10px 0 30px rgba(0,0,0,0.5); border-left: 1px solid rgba(100,116,139,0.2); display: flex; flex-direction: column; animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
    
    @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }

    .panel-header { padding: 1.5rem; border-bottom: 1px solid rgba(100,116,139,0.2); display: flex; justify-content: space-between; align-items: center; background: rgba(15,23,42,0.4); }
    .panel-header h3 { margin: 0; font-size: 1.25rem; color: #f8fafc; font-weight: 600; }
    .btn-close { background: none; border: none; color: #94a3b8; font-size: 1.5rem; cursor: pointer; padding: 0.2rem; line-height: 1; transition: color 0.2s; }
    .btn-close:hover { color: #f8fafc; }

    .panel-content { padding: 1.5rem; overflow-y: auto; flex: 1; }
    .info-group { margin-bottom: 1.5rem; }
    .info-group .label-text { display: block; font-size: 0.85rem; color: #64748b; margin-bottom: 0.4rem; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
    .info-val { font-size: 1.05rem; color: #e2e8f0; font-weight: 500; }
    .mono { font-family: monospace; font-size: 0.95rem; background: rgba(15,23,42,0.5); padding: 0.3rem 0.6rem; border-radius: 4px; display: inline-block; }

    h4 { margin: 0 0 1rem; color: #cbd5e1; font-size: 1rem; font-weight: 600; }

    .action-buttons { display: flex; flex-direction: column; gap: 0.75rem; }
    .btn-action { display: flex; align-items: center; gap: 0.6rem; width: 100%; padding: 0.875rem 1rem; border-radius: 8px; border: 1px solid transparent; font-size: 0.95rem; font-weight: 500; cursor: pointer; transition: all 0.2s; }
    .btn-action:disabled { opacity: 0.5; cursor: not-allowed; }
    
    .primary { background: rgba(16,185,129,0.15); color: #34d399; border-color: rgba(16,185,129,0.3); }
    .primary:hover:not(:disabled) { background: rgba(16,185,129,0.25); border-color: rgba(16,185,129,0.5); }
    
    .warning { background: rgba(245,158,11,0.15); color: #fbbf24; border-color: rgba(245,158,11,0.3); }
    .warning:hover:not(:disabled) { background: rgba(245,158,11,0.25); border-color: rgba(245,158,11,0.5); }
    
    .danger { background: rgba(239,68,68,0.15); color: #f87171; border-color: rgba(239,68,68,0.3); }
    .danger:hover:not(:disabled) { background: rgba(239,68,68,0.25); border-color: rgba(239,68,68,0.5); }

    .spin { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; flex-shrink: 0; display: inline-block; }
    .spin-lg { width: 40px; height: 40px; border: 3px solid rgba(16,185,129,0.2); border-top-color: #10b981; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
</style>
