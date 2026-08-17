<script>
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';

    let token = $state('');
    let stats = $state({ totalActiveUsers: 0, totalConnectedBots: 0, bots: [] });
    let pageLoading = $state(true);
    let errorMsg = $state('');
    let successMsg = $state('');

    // Automation Form State
    let selectedAction = $state('message'); // 'message' | 'block' | 'report'
    let targetNumber = $state('');
    let messageText = $state('');
    let reportsPerBot = $state(1);
    let delaySeconds = $state(2);
    let sending = $state(false);
    let executionResults = $state(null);

    const API_URL = '/api';

    onMount(async () => {
        token = localStorage.getItem('adminToken') || '';
        if (!token) {
            goto('/admin/login');
            return;
        }
        await fetchStats();
    });

    // Automatically set optimal recommended delay when action changes
    $effect(() => {
        if (selectedAction === 'report' && delaySeconds < 3) {
            delaySeconds = 3;
        } else if (selectedAction !== 'report' && delaySeconds > 3) {
            delaySeconds = 2;
        }
    });

    async function fetchStats() {
        pageLoading = true;
        errorMsg = '';
        try {
            const res = await fetch(`${API_URL}/admin/automation/stats`, {
                headers: { 'x-admin-token': token, 'Authorization': token }
            });
            if (res.status === 401 || res.status === 403) {
                localStorage.removeItem('adminToken');
                goto('/admin/login');
                return;
            }
            const data = await res.json();
            if (res.ok) {
                stats = data;
            } else {
                errorMsg = data.error || 'Failed to fetch bot statistics.';
            }
        } catch {
            errorMsg = 'Network error — cannot reach server.';
        } finally {
            pageLoading = false;
        }
    }

    async function handleExecute() {
        errorMsg = '';
        successMsg = '';

        const cleanPhone = targetNumber.replace(/\D/g, '');
        if (cleanPhone.length < 10 || cleanPhone.length > 15) {
            errorMsg = 'Please enter a valid target phone number with country code (e.g. 923001234567).';
            return;
        }

        if (selectedAction === 'message' && !messageText.trim()) {
            errorMsg = 'Please enter the message you want to broadcast.';
            return;
        }

        if (stats.totalConnectedBots === 0) {
            errorMsg = 'No connected WhatsApp bots found online. Users must link their WhatsApp first.';
            return;
        }

        let confirmPrompt = '';
        if (selectedAction === 'message') {
            confirmPrompt = `Broadcast message to +${cleanPhone} using all ${stats.totalConnectedBots} online bots?`;
        } else if (selectedAction === 'block') {
            confirmPrompt = `BLOCK +${cleanPhone} across ALL ${stats.totalConnectedBots} connected WhatsApp accounts?`;
        } else if (selectedAction === 'report') {
            const totalRep = stats.totalConnectedBots * Number(reportsPerBot);
            confirmPrompt = `Submit ${totalRep} SPAM REPORTS (${reportsPerBot}x per bot) against +${cleanPhone} with ${delaySeconds}s intervals?`;
        }

        if (!confirm(confirmPrompt)) {
            return;
        }

        sending = true;
        executionResults = null;

        try {
            const res = await fetch(`${API_URL}/admin/automation/execute`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-token': token,
                    'Authorization': token
                },
                body: JSON.stringify({
                    targetNumber: cleanPhone,
                    action: selectedAction,
                    message: selectedAction === 'message' ? messageText.trim() : undefined,
                    reportsPerBot: selectedAction === 'report' ? Number(reportsPerBot) : 1,
                    delaySeconds: Number(delaySeconds)
                })
            });

            const data = await res.json();
            if (res.ok) {
                successMsg = data.message;
                executionResults = data;
                await fetchStats();
            } else {
                errorMsg = data.error || 'Execution failed.';
            }
        } catch (err) {
            errorMsg = 'Network error during automation execution.';
        } finally {
            sending = false;
        }
    }

    function formatTime(d) {
        if (!d) return '';
        return new Date(d).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
</script>

<div class="automation-container">
    <!-- Top Navigation Header -->
    <div class="header">
        <div class="header-left">
            <a href="/admin/dashboard" class="btn-back">
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
                Dashboard
            </a>
            <div class="title-wrap">
                <h1>⚡ WhatsApp Multi-Bot Automation Hub</h1>
                <p>Broadcast messages, mass block contacts, or launch synchronized spam report strikes</p>
            </div>
        </div>
        <div class="header-right">
            <button class="btn-refresh" onclick={fetchStats} disabled={pageLoading || sending}>
                {#if pageLoading}<span class="spin"></span>{:else}🔄 Refresh Fleet{/if}
            </button>
        </div>
    </div>

    <!-- Quick Stats Metric Cards -->
    <div class="metrics-grid">
        <div class="metric-card">
            <div class="metric-icon" style="background: rgba(99, 102, 241, 0.15); color: #818cf8;">
                <svg width="26" height="26" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            </div>
            <div class="metric-info">
                <span class="metric-val">{stats.totalConnectedBots}</span>
                <span class="metric-lbl">Online Connected Bots</span>
            </div>
        </div>

        <div class="metric-card">
            <div class="metric-icon" style="background: rgba(16, 185, 129, 0.15); color: #34d399;">
                <svg width="26" height="26" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
            </div>
            <div class="metric-info">
                <span class="metric-val">{stats.totalActiveUsers}</span>
                <span class="metric-lbl">Total Registered Accounts</span>
            </div>
        </div>

        <div class="metric-card">
            <div class="metric-icon" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24;">
                <svg width="26" height="26" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <div class="metric-info">
                <span class="metric-val">{delaySeconds}s</span>
                <span class="metric-lbl">Anti-Ban Safe Interval</span>
            </div>
        </div>
    </div>

    <!-- Alert Messages -->
    {#if errorMsg}
        <div class="alert alert-danger">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <span>{errorMsg}</span>
        </div>
    {/if}

    {#if successMsg}
        <div class="alert alert-success">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            <span>{successMsg}</span>
        </div>
    {/if}

    <!-- Main Workspace Grid -->
    <div class="workspace-grid">
        <!-- Left: Dispatcher Form Controls -->
        <div class="card dispatch-card">
            <div class="card-glow"></div>
            <div class="card-header">
                <h2>🎯 Automation Setup</h2>
                <p>Select an action mode and target recipient</p>
            </div>

            <form onsubmit={(e) => { e.preventDefault(); handleExecute(); }}>
                <!-- Target Phone Number -->
                <div class="field">
                    <label for="targetPhone">Target WhatsApp Phone Number</label>
                    <div class="input-wrap">
                        <span class="input-icon">📱</span>
                        <input
                            id="targetPhone"
                            type="text"
                            bind:value={targetNumber}
                            placeholder="e.g. 923001234567 (with country code)"
                            disabled={sending}
                            required
                        />
                    </div>
                    <span class="field-hint">Numbers only. Do not add + or dashes.</span>
                </div>

                <!-- Action Mode Selector -->
                <div class="field">
                    <label for="actionSelect">Select Automation Action</label>
                    <select id="actionSelect" bind:value={selectedAction} disabled={sending} class="action-select">
                        <option value="message">📩 1. Send Message (Broadcast)</option>
                        <option value="block">🚫 2. Mass Block Contact</option>
                        <option value="report">🚨 3. Mass Spam Report Strike (Without Block)</option>
                    </select>
                </div>

                <!-- Mode 1: Message Textarea -->
                {#if selectedAction === 'message'}
                    <div class="field">
                        <div class="label-row">
                            <label for="broadcastMsg">Broadcast Message Content</label>
                            <span class="char-count">{messageText.length} chars</span>
                        </div>
                        <textarea
                            id="broadcastMsg"
                            rows="4"
                            bind:value={messageText}
                            placeholder="Type the message to broadcast from all connected bots..."
                            disabled={sending}
                            required
                        ></textarea>
                    </div>
                {/if}

                <!-- Mode 3: Reports Per Bot Count -->
                {#if selectedAction === 'report'}
                    <div class="report-box">
                        <div class="field" style="margin-bottom: 0.75rem;">
                            <label for="reportCount">Reports Per Bot (Repetitions)</label>
                            <select id="reportCount" bind:value={reportsPerBot} disabled={sending}>
                                <option value={1}>1 Report per bot ({stats.totalConnectedBots * 1} total reports)</option>
                                <option value={2}>2 Reports per bot ({stats.totalConnectedBots * 2} total reports)</option>
                                <option value={3}>3 Reports per bot ({stats.totalConnectedBots * 3} total reports)</option>
                                <option value={5}>5 Reports per bot ({stats.totalConnectedBots * 5} total reports)</option>
                            </select>
                        </div>
                        <div class="report-notice">
                            🛡️ <strong>Spam Report Mode:</strong> All connected bots will submit official spam reports against the target without blocking. A 3-second safe delay is enforced between reports.
                        </div>
                    </div>
                {/if}

                <!-- Mode 2: Block Mode Notice -->
                {#if selectedAction === 'block'}
                    <div class="block-box">
                        🚫 <strong>Mass Block Mode:</strong> Every connected WhatsApp bot will immediately add this target number to their blocklist.
                    </div>
                {/if}

                <!-- Anti-Ban Dispatch Delay -->
                <div class="field" style="margin-top: 1rem;">
                    <label for="delayInterval">Anti-Ban Dispatch Delay</label>
                    <select id="delayInterval" bind:value={delaySeconds} disabled={sending}>
                        {#if selectedAction !== 'report'}
                            <option value={1}>1 Second (Fast)</option>
                            <option value={2}>2 Seconds (Recommended Standard)</option>
                        {/if}
                        <option value={3}>3 Seconds (Recommended for Reports / Best Practice)</option>
                        <option value={5}>5 Seconds (Ultra Safe Stealth)</option>
                    </select>
                    <span class="field-hint">Interval between consecutive bot actions to prevent WhatsApp spam filters.</span>
                </div>

                <!-- Launch Button -->
                <button
                    type="submit"
                    class="btn-launch {selectedAction}"
                    disabled={sending || stats.totalConnectedBots === 0}
                >
                    {#if sending}
                        <span class="spin"></span> Executing {selectedAction.toUpperCase()} ({stats.totalConnectedBots} Bots)...
                    {:else if selectedAction === 'message'}
                        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
                        Launch Broadcast ({stats.totalConnectedBots} Bots)
                    {:else if selectedAction === 'block'}
                        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
                        Mass Block Number ({stats.totalConnectedBots} Bots)
                    {:else if selectedAction === 'report'}
                        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                        Launch Report Strike ({stats.totalConnectedBots * reportsPerBot} Reports)
                    {/if}
                </button>
            </form>
        </div>

        <!-- Right: Connected Fleet & Live Execution Logs -->
        <div class="card fleet-card">
            <div class="card-header">
                <h2>📊 Connected Bot Fleet ({stats.bots.length})</h2>
                <p>Active accounts that participate in automation tasks</p>
            </div>

            {#if executionResults}
                <!-- Live Execution Results Banner -->
                <div class="results-banner">
                    <div class="results-summary">
                        <div class="res-badge res-total">Total: {executionResults.summary.totalBotsFound}</div>
                        <div class="res-badge res-ok">✅ Success: {executionResults.summary.successful}</div>
                        {#if executionResults.summary.failed > 0}
                            <div class="res-badge res-err">❌ Failed: {executionResults.summary.failed}</div>
                        {/if}
                    </div>

                    <div class="results-table-wrap">
                        <table class="results-table">
                            <thead>
                                <tr>
                                    <th>Sender Bot</th>
                                    <th>Action</th>
                                    <th>Status</th>
                                    <th>Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each executionResults.results as res}
                                    <tr>
                                        <td><strong>+{res.botNumber}</strong> ({res.email})</td>
                                        <td>
                                            {#if res.action === 'message'}
                                                <span class="badge-action badge-msg">📩 Message</span>
                                            {:else if res.action === 'block'}
                                                <span class="badge-action badge-block">🚫 Block</span>
                                            {:else}
                                                <span class="badge-action badge-report">🚨 Report ({res.reportsCount || 1}x)</span>
                                            {/if}
                                        </td>
                                        <td>
                                            {#if res.status === 'sent' || res.status === 'blocked' || res.status === 'reported'}
                                                <span class="badge-sent">✓ {res.status.toUpperCase()}</span>
                                            {:else}
                                                <span class="badge-failed">Failed: {res.error}</span>
                                            {/if}
                                        </td>
                                        <td>{formatTime(res.timestamp)}</td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                </div>
            {:else if stats.bots.length === 0}
                <div class="empty-state">
                    <div class="empty-icon">📵</div>
                    <h3>No Online Bots Available</h3>
                    <p>When clients link their WhatsApp via QR or Pairing Code, they will appear here automatically.</p>
                </div>
            {:else}
                <div class="bot-list">
                    {#each stats.bots as bot}
                        <div class="bot-item">
                            <div class="bot-avatar">📱</div>
                            <div class="bot-meta">
                                <span class="bot-num">+{bot.botNumber}</span>
                                <span class="bot-user">{bot.email}</span>
                            </div>
                            <div class="bot-status">
                                <span class="dot-online"></span> Ready
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .automation-container {
        width: 100%;
        max-width: 1400px;
        margin: 0 auto;
        padding: 2rem;
        min-height: 100vh;
        box-sizing: border-box;
    }

    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2rem;
        padding-bottom: 1.5rem;
        border-bottom: 1px solid rgba(100, 116, 139, 0.2);
    }

    .header-left {
        display: flex;
        align-items: center;
        gap: 1.5rem;
    }

    .btn-back {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.6rem 1rem;
        background: rgba(30, 41, 59, 0.8);
        border: 1px solid rgba(100, 116, 139, 0.3);
        border-radius: 8px;
        color: #cbd5e1;
        text-decoration: none;
        font-weight: 500;
        font-size: 0.9rem;
        transition: all 0.2s;
    }
    .btn-back:hover {
        background: rgba(51, 65, 85, 0.8);
        color: #f8fafc;
        transform: translateX(-2px);
    }

    .title-wrap h1 {
        margin: 0 0 0.25rem;
        font-size: 1.75rem;
        font-weight: 700;
        color: #f8fafc;
        letter-spacing: -0.5px;
    }
    .title-wrap p {
        margin: 0;
        color: #94a3b8;
        font-size: 0.9rem;
    }

    .btn-refresh {
        padding: 0.6rem 1.1rem;
        background: rgba(30, 41, 59, 0.8);
        border: 1px solid rgba(100, 116, 139, 0.3);
        border-radius: 8px;
        color: #cbd5e1;
        font-weight: 500;
        font-size: 0.875rem;
        cursor: pointer;
        transition: all 0.2s;
    }
    .btn-refresh:hover:not(:disabled) {
        background: rgba(51, 65, 85, 0.9);
        color: #f8fafc;
    }

    .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 1.25rem;
        margin-bottom: 2rem;
    }

    .metric-card {
        background: rgba(30, 41, 59, 0.5);
        border: 1px solid rgba(100, 116, 139, 0.2);
        border-radius: 14px;
        padding: 1.25rem 1.5rem;
        display: flex;
        align-items: center;
        gap: 1.25rem;
        box-shadow: 0 10px 25px rgba(0,0,0,0.2);
    }

    .metric-icon {
        width: 50px;
        height: 50px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .metric-info {
        display: flex;
        flex-direction: column;
    }

    .metric-val {
        font-size: 1.75rem;
        font-weight: 700;
        color: #f8fafc;
        line-height: 1.2;
    }

    .metric-lbl {
        font-size: 0.85rem;
        color: #94a3b8;
        font-weight: 500;
    }

    .alert {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 1rem 1.25rem;
        border-radius: 10px;
        margin-bottom: 1.5rem;
        font-size: 0.95rem;
    }
    .alert-danger {
        background: rgba(239, 68, 68, 0.12);
        border: 1px solid rgba(239, 68, 68, 0.3);
        color: #f87171;
    }
    .alert-success {
        background: rgba(16, 185, 129, 0.12);
        border: 1px solid rgba(16, 185, 129, 0.3);
        color: #34d399;
    }

    .workspace-grid {
        display: grid;
        grid-template-columns: 1.1fr 1fr;
        gap: 1.75rem;
    }

    .card {
        background: rgba(30, 41, 59, 0.6);
        border: 1px solid rgba(100, 116, 139, 0.25);
        border-radius: 16px;
        padding: 2rem;
        position: relative;
        overflow: hidden;
        box-shadow: 0 15px 35px rgba(0,0,0,0.3);
        backdrop-filter: blur(16px);
    }

    .card-glow {
        position: absolute;
        bottom: -60px;
        right: -60px;
        width: 200px;
        height: 200px;
        background: radial-gradient(circle, rgba(99, 102, 241, 0.15), transparent 70%);
        pointer-events: none;
    }

    .card-header {
        margin-bottom: 1.5rem;
    }
    .card-header h2 {
        margin: 0 0 0.25rem;
        font-size: 1.35rem;
        font-weight: 700;
        color: #f8fafc;
    }
    .card-header p {
        margin: 0;
        font-size: 0.875rem;
        color: #94a3b8;
    }

    .field {
        margin-bottom: 1.35rem;
    }
    .field label {
        display: block;
        font-size: 0.875rem;
        font-weight: 600;
        color: #cbd5e1;
        margin-bottom: 0.5rem;
    }
    .label-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .char-count {
        font-size: 0.78rem;
        color: #64748b;
    }

    .action-select {
        border-color: #6366f1;
        background: rgba(99, 102, 241, 0.1);
        font-weight: 600;
    }

    .report-box {
        background: rgba(245, 158, 11, 0.08);
        border: 1px solid rgba(245, 158, 11, 0.3);
        border-radius: 10px;
        padding: 1.25rem;
        margin-bottom: 1.25rem;
    }
    .report-notice {
        font-size: 0.82rem;
        color: #fbbf24;
        line-height: 1.4;
    }

    .block-box {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.3);
        border-radius: 10px;
        padding: 1.25rem;
        font-size: 0.85rem;
        color: #f87171;
        margin-bottom: 1.25rem;
        line-height: 1.4;
    }

    .input-wrap {
        position: relative;
        display: flex;
        align-items: center;
    }
    .input-icon {
        position: absolute;
        left: 1rem;
        font-size: 1.1rem;
        pointer-events: none;
    }
    .input-wrap input {
        padding-left: 2.75rem !important;
    }

    input, select, textarea {
        width: 100%;
        padding: 0.85rem 1rem;
        background: rgba(15, 23, 42, 0.7);
        border: 1px solid rgba(100, 116, 139, 0.4);
        border-radius: 10px;
        color: #f8fafc;
        font-size: 0.95rem;
        outline: none;
        transition: all 0.2s;
        box-sizing: border-box;
    }
    input:focus, select:focus, textarea:focus {
        border-color: #6366f1;
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
        background: rgba(15, 23, 42, 0.9);
    }
    input:disabled, select:disabled, textarea:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .field-hint {
        display: block;
        font-size: 0.78rem;
        color: #64748b;
        margin-top: 0.4rem;
    }

    .btn-launch {
        width: 100%;
        margin-top: 1rem;
        padding: 1rem 1.5rem;
        color: white;
        border: none;
        border-radius: 10px;
        font-size: 1.05rem;
        font-weight: 700;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.6rem;
        transition: all 0.2s;
    }
    .btn-launch.message {
        background: linear-gradient(135deg, #4f46e5, #7c3aed);
        box-shadow: 0 6px 20px rgba(99, 102, 241, 0.4);
    }
    .btn-launch.message:hover:not(:disabled) {
        background: linear-gradient(135deg, #4338ca, #6d28d9);
        transform: translateY(-2px);
        box-shadow: 0 8px 25px rgba(99, 102, 241, 0.55);
    }

    .btn-launch.block {
        background: linear-gradient(135deg, #dc2626, #991b1b);
        box-shadow: 0 6px 20px rgba(220, 38, 38, 0.4);
    }
    .btn-launch.block:hover:not(:disabled) {
        background: linear-gradient(135deg, #b91c1c, #7f1d1d);
        transform: translateY(-2px);
        box-shadow: 0 8px 25px rgba(220, 38, 38, 0.55);
    }

    .btn-launch.report {
        background: linear-gradient(135deg, #d97706, #b45309);
        box-shadow: 0 6px 20px rgba(217, 119, 6, 0.4);
    }
    .btn-launch.report:hover:not(:disabled) {
        background: linear-gradient(135deg, #b45309, #92400e);
        transform: translateY(-2px);
        box-shadow: 0 8px 25px rgba(217, 119, 6, 0.55);
    }

    .btn-launch:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
    }

    /* Fleet List Styles */
    .bot-list {
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
        max-height: 480px;
        overflow-y: auto;
    }

    .bot-item {
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid rgba(100, 116, 139, 0.25);
        border-radius: 10px;
        padding: 0.85rem 1.15rem;
        display: flex;
        align-items: center;
        gap: 1rem;
    }

    .bot-avatar {
        font-size: 1.4rem;
    }

    .bot-meta {
        flex: 1;
        display: flex;
        flex-direction: column;
    }
    .bot-num {
        font-weight: 700;
        color: #f8fafc;
        font-size: 0.95rem;
    }
    .bot-user {
        font-size: 0.8rem;
        color: #94a3b8;
    }

    .bot-status {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.8rem;
        color: #34d399;
        font-weight: 600;
    }
    .dot-online {
        width: 8px;
        height: 8px;
        background: #10b981;
        border-radius: 50%;
        box-shadow: 0 0 8px #10b981;
    }

    .empty-state {
        text-align: center;
        padding: 3rem 1.5rem;
    }
    .empty-icon {
        font-size: 3rem;
        margin-bottom: 0.75rem;
    }
    .empty-state h3 {
        margin: 0 0 0.5rem;
        color: #f8fafc;
    }
    .empty-state p {
        margin: 0;
        color: #94a3b8;
        font-size: 0.875rem;
    }

    /* Execution Results Table */
    .results-banner {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .results-summary {
        display: flex;
        gap: 0.75rem;
    }
    .res-badge {
        padding: 0.4rem 0.85rem;
        border-radius: 6px;
        font-size: 0.82rem;
        font-weight: 600;
    }
    .res-total { background: rgba(100, 116, 139, 0.2); color: #cbd5e1; }
    .res-ok { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
    .res-err { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }

    .results-table-wrap {
        max-height: 380px;
        overflow-y: auto;
        border: 1px solid rgba(100, 116, 139, 0.2);
        border-radius: 8px;
    }
    .results-table {
        width: 100%;
        border-collapse: collapse;
        text-align: left;
        font-size: 0.85rem;
    }
    .results-table th {
        background: rgba(15, 23, 42, 0.8);
        padding: 0.75rem 1rem;
        color: #94a3b8;
        font-weight: 600;
        border-bottom: 1px solid rgba(100, 116, 139, 0.2);
    }
    .results-table td {
        padding: 0.75rem 1rem;
        border-bottom: 1px solid rgba(100, 116, 139, 0.1);
        color: #cbd5e1;
    }
    .badge-action {
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 600;
    }
    .badge-msg { background: rgba(99, 102, 241, 0.2); color: #a5b4fc; }
    .badge-block { background: rgba(239, 68, 68, 0.2); color: #fca5a5; }
    .badge-report { background: rgba(245, 158, 11, 0.2); color: #fde047; }

    .badge-sent {
        color: #34d399;
        font-weight: 600;
    }
    .badge-failed {
        color: #f87171;
        font-weight: 600;
    }

    .spin {
        width: 18px;
        height: 18px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: #fff;
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
        display: inline-block;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    @media (max-width: 900px) {
        .workspace-grid {
            grid-template-columns: 1fr;
        }
    }
</style>
