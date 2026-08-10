<script>
    import { onMount, onDestroy } from 'svelte';
    import { goto } from '$app/navigation';

    let users = [];
    let pageLoading = true;
    let fetchError = '';
    let newEmail = '';
    let newPassword = '';
    let creating = false;
    let createMessage = '';
    let createError = '';
    let token = '';
    let deletingId = null;

    const API_URL = '/api';

    onMount(async () => {
        token = localStorage.getItem('adminToken');
        if (!token) {
            goto('/admin/login');
            return;
        }
        await fetchUsers();
    });

    async function fetchUsers() {
        pageLoading = true;
        fetchError = '';
        try {
            const res = await fetch(`${API_URL}/admin/users`, {
                headers: {
                    'x-admin-token': token,
                    'Authorization': token
                }
            });

            if (res.status === 403 || res.status === 401) {
                localStorage.removeItem('adminToken');
                goto('/admin/login');
                return;
            }

            let data;
            try { data = await res.json(); } catch { data = []; }

            if (res.ok) {
                users = Array.isArray(data) ? data : [];
            } else {
                fetchError = data.error || `Server error (${res.status})`;
            }
        } catch (err) {
            fetchError = 'Network error — cannot reach server. Check VPS.';
        } finally {
            pageLoading = false;
        }
    }

    async function createUser() {
        if (!newEmail.trim() || !newPassword.trim()) {
            createError = 'Both email and password are required.';
            return;
        }
        creating = true;
        createMessage = '';
        createError = '';

        try {
            const res = await fetch(`${API_URL}/admin/users/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-token': token
                },
                body: JSON.stringify({ token, email: newEmail.trim(), password: newPassword.trim() })
            });

            let data;
            try { data = await res.json(); } catch { data = {}; }

            if (res.ok) {
                createMessage = `User ${newEmail} created!`;
                newEmail = '';
                newPassword = '';
                await fetchUsers();
            } else {
                createError = data.error || `Failed (${res.status})`;
            }
        } catch (err) {
            createError = 'Network error — cannot reach server.';
        } finally {
            creating = false;
        }
    }

    async function deleteUser(userId, userEmail) {
        if (!confirm(`Delete ${userEmail}? This cannot be undone.`)) return;
        deletingId = userId;
        try {
            const res = await fetch(`${API_URL}/admin/users/${userId}`, {
                method: 'DELETE',
                headers: { 'x-admin-token': token, 'Authorization': token }
            });
            if (res.ok) {
                users = users.filter(u => u._id !== userId);
            } else {
                let data;
                try { data = await res.json(); } catch { data = {}; }
                alert(data.error || 'Delete failed.');
            }
        } catch (err) {
            alert('Network error.');
        } finally {
            deletingId = null;
        }
    }

    function logout() {
        localStorage.removeItem('adminToken');
        goto('/admin/login');
    }

    function formatDate(d) {
        if (!d) return '—';
        return new Date(d).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
    }
</script>

<div class="dashboard">
    <!-- Header -->
    <div class="top-bar">
        <div class="top-bar-left">
            <div class="avatar">⚡</div>
            <div>
                <h1>Admin Panel</h1>
                <p>MR FK Engine — Client Management</p>
            </div>
        </div>
        <button class="btn btn-ghost" on:click={logout}>Logout</button>
    </div>

    <div class="grid">
        <!-- Create User Card -->
        <div class="card card-narrow">
            <h2 class="card-title">
                <span class="icon">+</span> New Client
            </h2>

            {#if createMessage}
                <div class="alert alert-success">{createMessage}</div>
            {/if}
            {#if createError}
                <div class="alert alert-error">⚠ {createError}</div>
            {/if}

            <form on:submit|preventDefault={createUser} class="create-form">
                <div class="field">
                    <label for="newEmail">Client Email</label>
                    <input
                        id="newEmail"
                        type="email"
                        bind:value={newEmail}
                        required
                        disabled={creating}
                        placeholder="client@example.com"
                    />
                </div>
                <div class="field">
                    <label for="newPass">Temp Password</label>
                    <input
                        id="newPass"
                        type="text"
                        bind:value={newPassword}
                        required
                        disabled={creating}
                        placeholder="Set a password"
                    />
                </div>
                <button type="submit" class="btn btn-primary" disabled={creating}>
                    {#if creating}
                        <span class="spinner"></span> Creating...
                    {:else}
                        Create Account
                    {/if}
                </button>
            </form>

            <div class="divider"></div>

            <div class="stats-row">
                <div class="stat-box">
                    <span class="stat-val">{users.length}</span>
                    <span class="stat-label">Total Clients</span>
                </div>
                <div class="stat-box">
                    <span class="stat-val">{users.filter(u => u.connectedNumber).length}</span>
                    <span class="stat-label">Connected</span>
                </div>
            </div>
        </div>

        <!-- Users List Card -->
        <div class="card card-wide">
            <div class="card-header">
                <h2 class="card-title"><span class="icon">👥</span> Active Clients</h2>
                <button class="btn btn-ghost btn-sm" on:click={fetchUsers} disabled={pageLoading}>
                    {pageLoading ? '...' : '↻ Refresh'}
                </button>
            </div>

            {#if pageLoading}
                <div class="state-center">
                    <div class="spinner-lg"></div>
                    <p>Loading clients...</p>
                </div>
            {:else if fetchError}
                <div class="state-center">
                    <div class="error-icon">⚠</div>
                    <p class="error-text">{fetchError}</p>
                    <button class="btn btn-ghost btn-sm" on:click={fetchUsers}>Retry</button>
                </div>
            {:else if users.length === 0}
                <div class="state-center">
                    <div class="empty-icon">📋</div>
                    <p>No clients yet. Create one!</p>
                </div>
            {:else}
                <div class="table-wrapper">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Email</th>
                                <th>WhatsApp</th>
                                <th>Created</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each users as user}
                                <tr>
                                    <td class="email-cell">{user.email}</td>
                                    <td>
                                        {#if user.connectedNumber}
                                            <span class="badge badge-green">● Connected</span>
                                        {:else}
                                            <span class="badge badge-gray">○ Inactive</span>
                                        {/if}
                                    </td>
                                    <td class="date-cell">{formatDate(user.createdAt)}</td>
                                    <td>
                                        <button
                                            class="btn-delete"
                                            on:click={() => deleteUser(user._id, user.email)}
                                            disabled={deletingId === user._id}
                                        >
                                            {deletingId === user._id ? '...' : '🗑'}
                                        </button>
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

<style>
    .dashboard { width: 100%; max-width: 1100px; padding: 1rem; }

    .top-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5rem;
    }
    .top-bar-left { display: flex; align-items: center; gap: 0.875rem; }
    .avatar {
        width: 44px; height: 44px;
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        border-radius: 12px;
        display: flex; align-items: center; justify-content: center;
        font-size: 1.25rem;
        flex-shrink: 0;
        box-shadow: 0 4px 15px rgba(99,102,241,0.3);
    }
    .top-bar-left h1 { font-size: 1.375rem; font-weight: 700; color: #f1f5f9; margin: 0 0 2px; }
    .top-bar-left p { font-size: 0.8125rem; color: #64748b; margin: 0; }

    .grid {
        display: grid;
        grid-template-columns: 280px 1fr;
        gap: 1.25rem;
        align-items: start;
    }
    @media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }

    .card {
        background: linear-gradient(135deg, #1a1f2e 0%, #161b27 100%);
        border: 1px solid rgba(99,102,241,0.15);
        border-radius: 16px;
        padding: 1.5rem;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    }
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; }
    .card-title {
        font-size: 1rem;
        font-weight: 600;
        color: #e2e8f0;
        margin: 0 0 1.25rem;
        display: flex; align-items: center; gap: 0.5rem;
    }
    .card-header .card-title { margin: 0; }
    .icon { font-style: normal; }

    .create-form {}
    .field { margin-bottom: 1rem; }
    .field label { display: block; font-size: 0.8125rem; font-weight: 500; color: #94a3b8; margin-bottom: 0.375rem; }
    .field input {
        width: 100%;
        padding: 0.7rem 0.875rem;
        background: rgba(10, 15, 30, 0.8);
        border: 1px solid rgba(99,102,241,0.2);
        border-radius: 8px;
        color: #e2e8f0;
        font-size: 0.875rem;
        outline: none;
        transition: border-color 0.2s, box-shadow 0.2s;
        box-sizing: border-box;
    }
    .field input:focus { border-color: rgba(99,102,241,0.5); box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
    .field input:disabled { opacity: 0.5; cursor: not-allowed; }
    .field input::placeholder { color: #475569; }

    .btn {
        padding: 0.7rem 1.25rem;
        border: none;
        border-radius: 8px;
        font-size: 0.875rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
    }
    .btn-primary {
        width: 100%;
        justify-content: center;
        background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
        color: #fff;
        box-shadow: 0 4px 12px rgba(99,102,241,0.25);
        margin-top: 0.25rem;
    }
    .btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(99,102,241,0.35); }
    .btn-ghost { background: rgba(99,102,241,0.08); color: #94a3b8; border: 1px solid rgba(99,102,241,0.15); }
    .btn-ghost:hover:not(:disabled) { background: rgba(99,102,241,0.15); color: #e2e8f0; }
    .btn-sm { padding: 0.4rem 0.875rem; font-size: 0.8125rem; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

    .btn-delete {
        padding: 0.35rem 0.625rem;
        background: rgba(239,68,68,0.08);
        border: 1px solid rgba(239,68,68,0.15);
        border-radius: 6px;
        color: #f87171;
        cursor: pointer;
        font-size: 0.875rem;
        transition: all 0.2s;
    }
    .btn-delete:hover:not(:disabled) { background: rgba(239,68,68,0.15); }
    .btn-delete:disabled { opacity: 0.4; cursor: not-allowed; }

    .alert {
        padding: 0.75rem 1rem;
        border-radius: 8px;
        font-size: 0.8125rem;
        margin-bottom: 1rem;
    }
    .alert-success { background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.25); color: #34d399; }
    .alert-error { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25); color: #f87171; }

    .divider { height: 1px; background: rgba(99,102,241,0.1); margin: 1.25rem 0; }

    .stats-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
    .stat-box {
        background: rgba(10,15,30,0.5);
        border: 1px solid rgba(99,102,241,0.1);
        border-radius: 10px;
        padding: 0.875rem;
        text-align: center;
    }
    .stat-val { display: block; font-size: 1.625rem; font-weight: 700; color: #a5b4fc; }
    .stat-label { display: block; font-size: 0.75rem; color: #64748b; margin-top: 2px; }

    .state-center {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        padding: 3rem 1rem; gap: 0.75rem; color: #64748b; text-align: center;
    }
    .state-center p { margin: 0; font-size: 0.875rem; }
    .error-icon { font-size: 2rem; }
    .error-text { color: #f87171; }
    .empty-icon { font-size: 2rem; }

    .table-wrapper { overflow-x: auto; }
    .table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .table thead tr { border-bottom: 1px solid rgba(99,102,241,0.15); }
    .table th { padding: 0.625rem 0.875rem; text-align: left; font-weight: 500; color: #64748b; font-size: 0.8125rem; }
    .table tbody tr { border-bottom: 1px solid rgba(99,102,241,0.06); transition: background 0.15s; }
    .table tbody tr:hover { background: rgba(99,102,241,0.05); }
    .table tbody tr:last-child { border-bottom: none; }
    .table td { padding: 0.875rem 0.875rem; color: #cbd5e1; vertical-align: middle; }
    .email-cell { color: #e2e8f0; font-weight: 500; word-break: break-all; }
    .date-cell { color: #64748b; white-space: nowrap; }

    .badge {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.25rem 0.625rem;
        border-radius: 20px;
        font-size: 0.75rem;
        font-weight: 500;
        white-space: nowrap;
    }
    .badge-green { background: rgba(16,185,129,0.1); color: #34d399; border: 1px solid rgba(16,185,129,0.2); }
    .badge-gray { background: rgba(100,116,139,0.1); color: #94a3b8; border: 1px solid rgba(100,116,139,0.2); }

    .spinner {
        width: 14px; height: 14px;
        border: 2px solid rgba(255,255,255,0.3);
        border-top-color: #fff;
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
        flex-shrink: 0;
    }
    .spinner-lg {
        width: 40px; height: 40px;
        border: 3px solid rgba(99,102,241,0.2);
        border-top-color: #6366f1;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
</style>
