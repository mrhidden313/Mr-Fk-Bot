<script>
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';

    let users = $state([]);
    let pageLoading = $state(true);
    let fetchError = $state('');
    
    // Create User Modal State
    let showCreateModal = $state(false);
    let newEmail = $state('');
    let newPassword = $state('');
    let creating = $state(false);
    let createMessage = $state('');
    let createError = $state('');
    
    let token = $state('');
    let deletingId = $state(null);
    let unlinkingId = $state(null);
    let approvingId = $state(null);
    let togglingId = $state(null);

    // Detail Panel State
    let selectedUser = $state(null);

    // Derived Pending Approvals
    let pendingUsers = $derived(users.filter(u => u.status === 'pending_approval'));

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
                createMessage = `✓ "${newEmail}" created successfully!`;
                newEmail = '';
                newPassword = '';
                await fetchUsers();
                setTimeout(() => {
                    showCreateModal = false;
                    createMessage = '';
                }, 1500);
            } else {
                createError = data.error || `Failed (${res.status})`;
            }
        } catch {
            createError = 'Network error.';
        } finally {
            creating = false;
        }
    }

    async function approveUser(userId) {
        approvingId = userId;
        try {
            const res = await fetch(`${API_URL}/admin/users/${userId}/approve`, {
                method: 'POST',
                headers: { 'x-admin-token': token, 'Authorization': token }
            });
            let data; try { data = await res.json(); } catch { data = {}; }
            if (res.ok) {
                users = users.map(u => u._id === userId ? { ...u, status: 'active' } : u);
                if (selectedUser && selectedUser._id === userId) {
                    selectedUser = { ...selectedUser, status: 'active' };
                }
            } else {
                alert(data.error || 'Approval failed.');
            }
        } catch {
            alert('Network error.');
        } finally {
            approvingId = null;
        }
    }

    async function toggleUserStatus(userId) {
        togglingId = userId;
        try {
            const res = await fetch(`${API_URL}/admin/users/${userId}/toggle-status`, {
                method: 'POST',
                headers: { 'x-admin-token': token, 'Authorization': token }
            });
            let data; try { data = await res.json(); } catch { data = {}; }
            if (res.ok) {
                users = users.map(u => u._id === userId ? { ...u, status: data.status, connectedNumber: data.status === 'disabled' ? null : u.connectedNumber } : u);
                if (selectedUser && selectedUser._id === userId) {
                    selectedUser = { ...selectedUser, status: data.status, connectedNumber: data.status === 'disabled' ? null : selectedUser.connectedNumber };
                }
            } else {
                alert(data.error || 'Toggle failed.');
            }
        } catch {
            alert('Network error.');
        } finally {
            togglingId = null;
        }
    }

    async function deleteUser(userId, userEmail) {
        if (!confirm(`Delete ${userEmail}? This will also unlink WhatsApp and remove all chats from the server.`)) return;
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
            <h1>MR FK Admin Dashboard</h1>
            <p>Manage SaaS Clients, IP Approvals & Access Control</p>
        </div>
        <div class="topbar-right">
            <a href="/admin/automation" class="btn-automation">
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                Automation
            </a>
            <button class="btn-primary" onclick={() => { showCreateModal = true; createMessage = ''; createError = ''; }}>
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                New Client
            </button>
            <button class="btn-logout" onclick={logout}>Logout</button>
        </div>
    </div>

    <!-- Quick Stats -->
    <div class="stats-row">
        <div class="stat-card">
            <div class="stat-icon" style="background: rgba(16, 185, 129, 0.1); color: #10b981;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            </div>
            <div class="stat-details">
                <span class="stat-value">{users.length}</span>
                <span class="stat-label">Total Clients</span>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon" style="background: rgba(59, 130, 246, 0.1); color: #3b82f6;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            </div>
            <div class="stat-details">
                <span class="stat-value">{users.filter(u => u.connectedNumber).length}</span>
                <span class="stat-label">Active Sessions</span>
            </div>
        </div>
        <div class="stat-card" style={pendingUsers.length > 0 ? 'border-color: rgba(245, 158, 11, 0.4); background: rgba(245, 158, 11, 0.08);' : ''}>
            <div class="stat-icon" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            </div>
            <div class="stat-details">
                <span class="stat-value" style={pendingUsers.length > 0 ? 'color: #fbbf24;' : ''}>{pendingUsers.length}</span>
                <span class="stat-label">Pending Approvals</span>
            </div>
        </div>
    </div>

    <!-- Pending Approvals Section (If Any) -->
    {#if pendingUsers.length > 0}
        <div class="pending-section">
            <div class="pending-header">
                <div class="pending-title">
                    <span class="pulse-dot"></span>
                    <h3>⚠️ Pending Approval Queue ({pendingUsers.length})</h3>
                </div>
                <p>These accounts registered from an IP address or device that already has an account.</p>
            </div>
            <div class="pending-grid">
                {#each pendingUsers as pUser}
                    <div class="pending-card">
                        <div class="p-info">
                            <div class="p-email">{pUser.email}</div>
                            <div class="p-meta">
                                <span>🌐 IP: <strong>{pUser.registrationIp || 'Unknown'}</strong></span>
                                <span>⏱️ {formatDate(pUser.createdAt)}</span>
                            </div>
                        </div>
                        <div class="p-actions">
                            <button class="btn-approve" onclick={() => approveUser(pUser._id)} disabled={approvingId === pUser._id}>
                                {#if approvingId === pUser._id}<span class="spin"></span>{:else}✓ Approve{/if}
                            </button>
                            <button class="btn-reject" onclick={() => deleteUser(pUser._id, pUser.email)} disabled={deletingId === pUser._id}>
                                ✕ Reject
                            </button>
                        </div>
                    </div>
                {/each}
            </div>
        </div>
    {/if}

    <!-- Main Content: Full width table -->
    <div class="main-content">
        <div class="card fill-height">
            <div class="card-header">
                <h2 class="card-title" style="margin:0">
                    Client List
                </h2>
                <div style="display: flex; gap: 0.75rem; align-items: center;">
                    <a href="/admin/automation" class="btn-automation-sm">
                        ⚡ Multi-Bot Automation
                    </a>
                    <button class="btn-refresh" onclick={fetchUsers} disabled={pageLoading}>
                        {pageLoading ? '...' : '↻ Refresh Data'}
                    </button>
                </div>
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
                    <p style="color:#64748b; font-size: 1.1rem;">No clients registered yet.</p>
                    <button class="btn-primary" style="margin-top: 1rem;" onclick={() => showCreateModal = true}>Create First Client</button>
                </div>
            {:else}
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Client Email</th>
                                <th>Account Status</th>
                                <th>WhatsApp Status</th>
                                <th>Registration IP</th>
                                <th>Connected Number</th>
                                <th>Created On</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each users as user}
                                <tr onclick={() => openUserDetail(user)} class={selectedUser?._id === user._id ? 'active-row' : ''}>
                                    <td class="em" data-label="Client Email">{user.email}</td>
                                    <td data-label="Account Status">
                                        {#if user.status === 'active' || !user.status}
                                            <span class="badge green">● Active</span>
                                        {:else if user.status === 'pending_approval'}
                                            <span class="badge yellow">● Pending Review</span>
                                        {:else if user.status === 'disabled'}
                                            <span class="badge red">● Disabled</span>
                                        {/if}
                                    </td>
                                    <td data-label="WhatsApp Status">
                                        {#if user.connectedNumber}
                                            {#if user.isOnline}
                                                <span class="badge green">● Connected (Active)</span>
                                            {:else}
                                                <span class="badge yellow">● Connected (Offline)</span>
                                            {/if}
                                        {:else}
                                            <span class="badge gray">○ Not Linked</span>
                                        {/if}
                                    </td>
                                    <td class="dim mono-sm" data-label="Registration IP">
                                        {user.registrationIp || '—'}
                                    </td>
                                    <td class="dim" data-label="Connected Number">
                                        {user.connectedNumber ? `+${user.connectedNumber}` : '—'}
                                    </td>
                                    <td class="dim" data-label="Created On">{formatDate(user.createdAt)}</td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {/if}
        </div>
    </div>
</div>

<!-- Create Client Modal -->
{#if showCreateModal}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-backdrop" onclick={() => showCreateModal = false}>
        <div class="modal" onclick={(e) => e.stopPropagation()}>
            <div class="modal-header">
                <h2>Generate New Client</h2>
                <button class="btn-close" onclick={() => showCreateModal = false}>✕</button>
            </div>
            <div class="modal-body">
                {#if createMessage}
                    <div class="msg msg-ok">{createMessage}</div>
                {/if}
                {#if createError}
                    <div class="msg msg-err">⚠ {createError}</div>
                {/if}

                <form onsubmit={(e) => { e.preventDefault(); createUser(); }}>
                    <div class="field">
                        <label for="newEmail">Client Email Address</label>
                        <input id="newEmail" type="email" bind:value={newEmail} required disabled={creating} placeholder="Enter email (e.g. client@domain.com)" />
                    </div>
                    <div class="field">
                        <label for="newPass">Temporary Password</label>
                        <input id="newPass" type="text" bind:value={newPassword} required disabled={creating} placeholder="Set a secure password" />
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn-secondary" onclick={() => showCreateModal = false} disabled={creating}>Cancel</button>
                        <button type="submit" class="btn-primary" disabled={creating}>
                            {#if creating}<span class="spin"></span> Creating...{:else}Create Account{/if}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
{/if}

<!-- Slide-in User Detail Panel -->
{#if selectedUser}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="backdrop" onclick={closeDetail}></div>
    <div class="detail-panel">
        <div class="panel-header">
            <h3>Client Overview</h3>
            <button class="btn-close" onclick={closeDetail}>✕</button>
        </div>
        <div class="panel-content">
            <div class="info-group">
                <div class="label-text">Email Address</div>
                <div class="info-val">{selectedUser.email}</div>
            </div>
            <div class="info-group">
                <div class="label-text">Account Status</div>
                <div class="info-val">
                    {#if selectedUser.status === 'active' || !selectedUser.status}
                        <span class="badge green">● Active</span>
                    {:else if selectedUser.status === 'pending_approval'}
                        <span class="badge yellow">● Pending Approval</span>
                    {:else if selectedUser.status === 'disabled'}
                        <span class="badge red">● Disabled</span>
                    {/if}
                </div>
            </div>
            <div class="info-group">
                <div class="label-text">Registration IP</div>
                <div class="info-val mono">{selectedUser.registrationIp || 'Unknown'}</div>
            </div>
            <div class="info-group">
                <div class="label-text">System ID</div>
                <div class="info-val mono">{selectedUser._id}</div>
            </div>
            <div class="info-group">
                <div class="label-text">Registration Date</div>
                <div class="info-val">{formatDate(selectedUser.createdAt)}</div>
            </div>
            <div class="info-group">
                <div class="label-text">WhatsApp Connection</div>
                <div class="info-val">
                    {#if selectedUser.connectedNumber}
                        <span class="badge green" style="font-size: 0.875rem;">● Connected (+{selectedUser.connectedNumber})</span>
                    {:else}
                        <span class="badge gray" style="font-size: 0.875rem;">○ Not Connected</span>
                    {/if}
                </div>
            </div>

            <div class="divider" style="margin: 2rem 0 1rem; border-top: 1px solid rgba(100,116,139,0.2);"></div>
            <h4>Administrative Actions</h4>
            <div class="action-buttons">
                {#if selectedUser.status === 'pending_approval'}
                    <button class="btn-action success" onclick={() => approveUser(selectedUser._id)} disabled={approvingId === selectedUser._id}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        {approvingId === selectedUser._id ? 'Approving...' : 'Approve Account Now'}
                    </button>
                {/if}

                <button class="btn-action primary" onclick={() => viewChats(selectedUser._id)}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    View Chats (Read Only)
                </button>
                
                <button class="btn-action warning" onclick={() => toggleUserStatus(selectedUser._id)} disabled={togglingId === selectedUser._id}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                    {togglingId === selectedUser._id ? 'Updating...' : (selectedUser.status === 'disabled' ? 'Enable Account' : 'Disable Account')}
                </button>

                <button class="btn-action warning" onclick={() => unlinkWhatsApp(selectedUser._id)} disabled={!selectedUser.connectedNumber || unlinkingId === selectedUser._id}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>
                    {unlinkingId === selectedUser._id ? 'Unlinking...' : 'Unlink WhatsApp Session'}
                </button>

                <button class="btn-action danger" onclick={() => deleteUser(selectedUser._id, selectedUser.email)} disabled={deletingId === selectedUser._id}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    {deletingId === selectedUser._id ? 'Deleting...' : 'Delete Client Completely'}
                </button>
            </div>
        </div>
    </div>
{/if}

<style>
    .dashboard { width: 100%; max-width: 1400px; padding: 0 2rem; margin: 0 auto; display: flex; flex-direction: column; min-height: 100vh; }

    .topbar { display: flex; justify-content: space-between; align-items: center; padding: 2rem 0 1.5rem; border-bottom: 1px solid rgba(100,116,139,0.15); margin-bottom: 1.5rem; }
    .topbar-left h1 { font-size: 2rem; font-weight: 700; color: #f8fafc; margin: 0 0 6px; letter-spacing: -0.5px; }
    .topbar-left p { font-size: 0.95rem; color: #94a3b8; margin: 0; }
    
    .topbar-right { display: flex; gap: 1rem; align-items: center; }

    .btn-automation { padding: 0.6rem 1.15rem; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; border: none; border-radius: 8px; font-size: 0.95rem; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 0.5rem; text-decoration: none; box-shadow: 0 4px 12px rgba(99,102,241,0.3); }
    .btn-automation:hover { background: linear-gradient(135deg, #4f46e5, #7c3aed); transform: translateY(-1px); box-shadow: 0 6px 16px rgba(99,102,241,0.45); color: white; }

    .btn-automation-sm { padding: 0.45rem 0.9rem; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; border: none; border-radius: 6px; font-size: 0.85rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem; text-decoration: none; box-shadow: 0 4px 12px rgba(99,102,241,0.3); transition: all 0.2s; }
    .btn-automation-sm:hover { background: linear-gradient(135deg, #4f46e5, #7c3aed); transform: translateY(-1px); box-shadow: 0 6px 16px rgba(99,102,241,0.45); color: white; }

    .btn-primary { padding: 0.6rem 1.25rem; background: #10b981; color: white; border: none; border-radius: 8px; font-size: 0.95rem; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 0.5rem; box-shadow: 0 4px 12px rgba(16,185,129,0.2); }
    .btn-primary:hover:not(:disabled) { background: #059669; transform: translateY(-1px); box-shadow: 0 6px 16px rgba(16,185,129,0.3); }
    .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
    
    .btn-secondary { padding: 0.6rem 1.25rem; background: transparent; color: #cbd5e1; border: 1px solid rgba(100,116,139,0.4); border-radius: 8px; font-size: 0.95rem; font-weight: 500; cursor: pointer; transition: all 0.2s; }
    .btn-secondary:hover:not(:disabled) { background: rgba(30,41,59,0.8); color: #f8fafc; }

    .btn-logout { padding: 0.6rem 1.25rem; background: rgba(30,41,59,0.5); border: 1px solid rgba(100,116,139,0.3); border-radius: 8px; color: #94a3b8; font-size: 0.9rem; font-weight: 500; cursor: pointer; transition: all 0.2s; }
    .btn-logout:hover { background: rgba(239,68,68,0.1); color: #f87171; border-color: rgba(239,68,68,0.2); }

    .stats-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.5rem; margin-bottom: 1.75rem; }
    .stat-card { background: rgba(30, 41, 59, 0.4); border: 1px solid rgba(100,116,139,0.15); border-radius: 12px; padding: 1.25rem 1.5rem; display: flex; align-items: center; gap: 1.25rem; }
    .stat-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
    .stat-details { display: flex; flex-direction: column; }
    .stat-value { font-size: 1.75rem; font-weight: 700; color: #f8fafc; line-height: 1.2; }
    .stat-label { font-size: 0.85rem; color: #94a3b8; font-weight: 500; }

    /* Pending Approval Queue Styles */
    .pending-section { background: rgba(245, 158, 11, 0.06); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 12px; padding: 1.5rem; margin-bottom: 2rem; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
    .pending-header { margin-bottom: 1.25rem; }
    .pending-title { display: flex; align-items: center; gap: 0.6rem; }
    .pending-title h3 { margin: 0; font-size: 1.15rem; color: #fbbf24; font-weight: 700; }
    .pending-header p { margin: 0.25rem 0 0; font-size: 0.875rem; color: #cbd5e1; }
    .pulse-dot { width: 10px; height: 10px; background: #fbbf24; border-radius: 50%; box-shadow: 0 0 10px #fbbf24; animation: pulse 1.5s infinite; }
    @keyframes pulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(1.3); } 100% { opacity: 1; transform: scale(1); } }
    
    .pending-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem; }
    .pending-card { background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 10px; padding: 1rem 1.25rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
    .p-email { font-weight: 600; color: #f8fafc; font-size: 0.95rem; margin-bottom: 0.25rem; }
    .p-meta { font-size: 0.78rem; color: #94a3b8; display: flex; flex-direction: column; gap: 0.15rem; }
    .p-actions { display: flex; gap: 0.5rem; flex-shrink: 0; }
    .btn-approve { padding: 0.45rem 0.85rem; background: #10b981; color: white; border: none; border-radius: 6px; font-size: 0.82rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }
    .btn-approve:hover:not(:disabled) { background: #059669; transform: translateY(-1px); }
    .btn-reject { padding: 0.45rem 0.85rem; background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3); border-radius: 6px; font-size: 0.82rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }
    .btn-reject:hover:not(:disabled) { background: rgba(239,68,68,0.3); }

    .main-content { flex: 1; min-height: 0; padding-bottom: 2rem; }
    .card { background: rgba(30, 41, 59, 0.5); border: 1px solid rgba(100,116,139,0.2); border-radius: 12px; padding: 1.5rem; display: flex; flex-direction: column; height: 100%; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
    
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; padding-bottom: 0.75rem; }
    .card-title { font-size: 1.15rem; font-weight: 600; color: #f8fafc; margin: 0; display: flex; align-items: center; gap: 0.6rem; }

    .btn-refresh { padding: 0.4rem 0.8rem; background: rgba(30,41,59,0.8); border: 1px solid rgba(100,116,139,0.4); border-radius: 6px; color: #cbd5e1; font-size: 0.85rem; font-weight: 500; cursor: pointer; transition: all 0.2s; }
    .btn-refresh:hover:not(:disabled) { color: #fff; background: rgba(51,65,85,1); }

    .state { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; padding: 3rem 1rem; gap: 1rem; text-align: center; }
    .err-txt { color: #f87171; font-size: 0.95rem; margin: 0; }

    .table-wrap { overflow-y: auto; flex: 1; padding-right: 4px; }
    .table-wrap::-webkit-scrollbar { width: 6px; }
    .table-wrap::-webkit-scrollbar-thumb { background: rgba(100,116,139,0.3); border-radius: 3px; }
    
    table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.95rem; }
    thead tr { position: sticky; top: 0; background: rgba(30,41,59,0.95); backdrop-filter: blur(4px); z-index: 10; }
    th { padding: 0.875rem 1rem; text-align: left; font-weight: 600; color: #94a3b8; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(100,116,139,0.2); }
    tbody tr { cursor: pointer; transition: all 0.2s; }
    tbody tr:hover { background: rgba(16,185,129,0.05); }
    tbody tr.active-row { background: rgba(16,185,129,0.1); border-left: 3px solid #10b981; }
    td { padding: 1.125rem 1rem; color: #cbd5e1; border-bottom: 1px solid rgba(100,116,139,0.1); }
    .em { color: #f8fafc; font-weight: 500; font-size: 1rem; }
    .dim { color: #64748b; }
    .mono-sm { font-family: monospace; font-size: 0.85rem; color: #94a3b8; }

    .badge { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.35rem 0.85rem; border-radius: 20px; font-size: 0.85rem; font-weight: 500; }
    .green { background: rgba(16,185,129,0.15); color: #34d399; border: 1px solid rgba(16,185,129,0.25); }
    .yellow { background: rgba(245,158,11,0.15); color: #fbbf24; border: 1px solid rgba(245,158,11,0.3); }
    .red { background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3); }
    .gray { background: rgba(100,116,139,0.15); color: #94a3b8; border: 1px solid rgba(100,116,139,0.25); }

    /* Modal Styles */
    .modal-backdrop { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15,23,42,0.8); backdrop-filter: blur(8px); z-index: 100; display: flex; align-items: center; justify-content: center; }
    .modal { background: #1e293b; width: 100%; max-width: 480px; border-radius: 16px; border: 1px solid rgba(100,116,139,0.3); box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); overflow: hidden; animation: modalPop 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
    @keyframes modalPop { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
    
    .modal-header { padding: 1.5rem 1.75rem; border-bottom: 1px solid rgba(100,116,139,0.2); display: flex; justify-content: space-between; align-items: center; background: rgba(15,23,42,0.4); }
    .modal-header h2 { margin: 0; font-size: 1.25rem; color: #f8fafc; font-weight: 600; }
    .modal-body { padding: 1.75rem; }
    .modal-footer { margin-top: 2rem; display: flex; justify-content: flex-end; gap: 1rem; }

    .field { margin-bottom: 1.25rem; }
    .field label { display: block; font-size: 0.875rem; font-weight: 500; color: #94a3b8; margin-bottom: 0.5rem; }
    .field input { width: 100%; padding: 0.875rem 1rem; background: rgba(15,23,42,0.6); border: 1px solid rgba(100,116,139,0.4); border-radius: 8px; color: #f1f5f9; font-size: 0.95rem; outline: none; transition: all 0.2s; box-sizing: border-box; }
    .field input:focus { border-color: #10b981; box-shadow: 0 0 0 3px rgba(16,185,129,0.15); background: rgba(15,23,42,0.8); }
    .field input:disabled { opacity: 0.6; cursor: not-allowed; }

    .msg { padding: 0.75rem 1rem; border-radius: 8px; font-size: 0.875rem; margin-bottom: 1.5rem; }
    .msg-ok { background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.25); color: #34d399; }
    .msg-err { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25); color: #f87171; }

    /* Detail Panel */
    .backdrop { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15,23,42,0.6); backdrop-filter: blur(4px); z-index: 40; }
    .detail-panel { position: fixed; top: 0; right: 0; bottom: 0; width: 450px; max-width: 100vw; background: #1e293b; z-index: 50; box-shadow: -10px 0 30px rgba(0,0,0,0.5); border-left: 1px solid rgba(100,116,139,0.2); display: flex; flex-direction: column; animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
    @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }

    .panel-header { padding: 1.5rem 2rem; border-bottom: 1px solid rgba(100,116,139,0.2); display: flex; justify-content: space-between; align-items: center; background: rgba(15,23,42,0.4); }
    .panel-header h3 { margin: 0; font-size: 1.25rem; color: #f8fafc; font-weight: 600; }
    .btn-close { background: none; border: none; color: #94a3b8; font-size: 1.5rem; cursor: pointer; padding: 0.2rem; line-height: 1; transition: color 0.2s; }
    .btn-close:hover { color: #f8fafc; }

    .panel-content { padding: 2rem; overflow-y: auto; flex: 1; }
    .info-group { margin-bottom: 1.75rem; }
    .info-group .label-text { display: block; font-size: 0.85rem; color: #64748b; margin-bottom: 0.4rem; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
    .info-val { font-size: 1.1rem; color: #e2e8f0; font-weight: 500; }
    .mono { font-family: monospace; font-size: 1rem; background: rgba(15,23,42,0.5); padding: 0.4rem 0.75rem; border-radius: 6px; display: inline-block; border: 1px solid rgba(100,116,139,0.2); }

    h4 { margin: 0 0 1.25rem; color: #cbd5e1; font-size: 1.05rem; font-weight: 600; }

    .action-buttons { display: flex; flex-direction: column; gap: 0.875rem; }
    .btn-action { display: flex; align-items: center; gap: 0.75rem; width: 100%; padding: 1rem 1.25rem; border-radius: 10px; border: 1px solid transparent; font-size: 0.95rem; font-weight: 500; cursor: pointer; transition: all 0.2s; }
    .btn-action:disabled { opacity: 0.5; cursor: not-allowed; }
    
    .success { background: rgba(16,185,129,0.2); color: #34d399; border-color: rgba(16,185,129,0.4); }
    .success:hover:not(:disabled) { background: rgba(16,185,129,0.3); }

    .primary { background: rgba(16,185,129,0.15); color: #34d399; border-color: rgba(16,185,129,0.3); }
    .primary:hover:not(:disabled) { background: rgba(16,185,129,0.25); border-color: rgba(16,185,129,0.5); }
    
    .warning { background: rgba(245,158,11,0.15); color: #fbbf24; border-color: rgba(245,158,11,0.3); }
    .warning:hover:not(:disabled) { background: rgba(245,158,11,0.25); border-color: rgba(245,158,11,0.5); }
    
    .danger { background: rgba(239,68,68,0.15); color: #f87171; border-color: rgba(239,68,68,0.3); }
    .danger:hover:not(:disabled) { background: rgba(239,68,68,0.25); border-color: rgba(239,68,68,0.5); }

    .spin { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; flex-shrink: 0; display: inline-block; }
    .spin-lg { width: 40px; height: 40px; border: 3px solid rgba(16,185,129,0.2); border-top-color: #10b981; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Mobile Responsiveness */
    @media (max-width: 768px) {
        .dashboard { padding: 0 1rem; }
        .topbar { flex-direction: column; align-items: flex-start; gap: 1rem; }
        .topbar-right { width: 100%; justify-content: space-between; }
        
        table, thead, tbody, th, td, tr { display: block; }
        thead tr { display: none; }
        tr { margin-bottom: 1rem; border: 1px solid rgba(100,116,139,0.2); border-radius: 8px; padding: 1rem; background: rgba(30,41,59,0.3); }
        td { border: none; padding: 0.5rem 0; display: flex; justify-content: space-between; align-items: center; text-align: right; border-bottom: 1px solid rgba(100,116,139,0.05); }
        td:last-child { border-bottom: none; }
        td::before { content: attr(data-label); font-weight: 600; color: #94a3b8; font-size: 0.8rem; text-transform: uppercase; text-align: left; margin-right: 1rem; }
        
        .detail-panel { width: 100%; border-left: none; }
        .pending-grid { grid-template-columns: 1fr; }
    }
</style>
