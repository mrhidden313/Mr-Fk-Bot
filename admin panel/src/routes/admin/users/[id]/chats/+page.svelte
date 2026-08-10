<script>
    import { onMount, tick } from 'svelte';
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';

    let userId = $state('');
    let token = $state('');
    let chats = $state([]);
    let loadingChats = $state(true);
    let fetchError = $state('');

    let selectedJid = $state(null);
    let messages = $state([]);
    let loadingMessages = $state(false);
    let messagesContainer = $state(null);
    let loadedImages = $state({}); // Track clicked images

    const API_URL = '/api';

    onMount(async () => {
        token = localStorage.getItem('adminToken') || '';
        if (!token) { goto('/admin/login'); return; }
        
        userId = $page.params.id;
        if (!userId) { goto('/admin/dashboard'); return; }

        await fetchChats();
    });

    async function fetchChats() {
        loadingChats = true;
        fetchError = '';
        try {
            const res = await fetch(`${API_URL}/admin/users/${userId}/chats`, {
                headers: { 'x-admin-token': token, 'Authorization': token }
            });
            if (res.status === 403 || res.status === 401) {
                localStorage.removeItem('adminToken');
                goto('/admin/login');
                return;
            }
            const data = await res.json();
            if (res.ok) {
                chats = data.chats || [];
            } else {
                fetchError = data.error || `Server error (${res.status})`;
            }
        } catch (err) {
            fetchError = 'Network error while fetching chats.';
        } finally {
            loadingChats = false;
        }
    }

    async function selectChat(jid) {
        selectedJid = jid;
        loadingMessages = true;
        messages = [];
        try {
            const res = await fetch(`${API_URL}/admin/users/${userId}/chats/${encodeURIComponent(jid)}`, {
                headers: { 'x-admin-token': token, 'Authorization': token }
            });
            const data = await res.json();
            if (res.ok) {
                messages = data.messages || [];
                await tick();
                scrollToBottom();
            } else {
                alert(data.error || 'Failed to fetch messages');
            }
        } catch (err) {
            alert('Network error while fetching messages.');
        } finally {
            loadingMessages = false;
        }
    }

    function scrollToBottom() {
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    function formatTime(timestamp) {
        if (!timestamp) return '';
        const d = new Date(timestamp);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function formatDate(timestamp) {
        if (!timestamp) return '';
        const d = new Date(timestamp);
        return d.toLocaleDateString([], { day: '2-digit', month: 'short' });
    }

    function formatNumber(jid) {
        if (!jid) return 'Unknown';
        if (jid.includes('@g.us')) return jid.split('@')[0] + ' (Group)';
        if (jid.includes('@lid')) return 'Hidden User (WhatsApp Privacy)';
        return '+' + jid.split('@')[0];
    }
</script>

<div class="chat-layout">
    <!-- Header -->
    <div class="app-header">
        <button class="btn-back" onclick={() => goto('/admin/dashboard')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            Back to Dashboard
        </button>
        <div class="header-title">
            <h2>WhatsApp Viewer</h2>
            <span class="user-id">User: {userId}</span>
        </div>
        <div style="width: 140px;"></div> <!-- Spacer -->
    </div>

    <div class="chat-container">
        <!-- Sidebar: Chat List -->
        <div class="sidebar">
            <div class="sidebar-header">
                <h3>Recent Chats</h3>
                <button class="btn-refresh" onclick={fetchChats} disabled={loadingChats}>↻</button>
            </div>
            
            <div class="chat-list">
                {#if loadingChats}
                    <div class="status-msg"><span class="spin"></span> Loading...</div>
                {:else if fetchError}
                    <div class="status-msg err">{fetchError}</div>
                {:else if chats.length === 0}
                    <div class="status-msg">No chats found in database for this session.</div>
                {:else}
                    {#each chats as chat}
                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <div class="chat-item {selectedJid === chat.jid ? 'active' : ''}" onclick={() => selectChat(chat.jid)}>
                            <div class="chat-avatar">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                            </div>
                            <div class="chat-info">
                                <div class="chat-row-1">
                                    <span class="chat-name">{chat.isGroup && chat.groupName ? chat.groupName : (chat.pushName || formatNumber(chat.jid))}</span>
                                    <span class="chat-time">{formatDate(chat.timestamp)}</span>
                                </div>
                                <div class="chat-row-2">
                                    <span class="chat-preview">{chat.body || (chat.type !== 'text' ? `[${chat.type}]` : '')}</span>
                                </div>
                            </div>
                        </div>
                    {/each}
                {/if}
            </div>
        </div>

        <!-- Main Area: Messages -->
        <div class="main-chat">
            {#if !selectedJid}
                <div class="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(100,116,139,0.5)" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    <h3>Select a chat to view messages</h3>
                    <p>Message history is recorded passively by the bot engine.</p>
                </div>
            {:else}
                <div class="chat-header">
                    <div class="chat-avatar">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    </div>
                    <div class="header-info">
                        <h3>{formatNumber(selectedJid)}</h3>
                        <span class="status">Read-only View</span>
                    </div>
                </div>

                <div class="messages-area" bind:this={messagesContainer}>
                    {#if loadingMessages}
                        <div class="status-msg"><span class="spin"></span> Fetching messages...</div>
                    {:else if messages.length === 0}
                        <div class="status-msg">No messages found for this chat.</div>
                    {:else}
                        {#each messages as msg}
                            <div class="message-wrapper {msg.fromMe ? 'outgoing' : 'incoming'}">
                                <div class="message-bubble">
                                    {#if msg.isGroup && !msg.fromMe}
                                        <div class="sender-name">{formatNumber(msg.sender)}</div>
                                    {/if}
                                    
                                    {#if msg.type === 'imageMessage'}
                                        {#if loadedImages[msg.messageId]}
                                            <div class="media-preview">
                                                <img src="/api/media/{userId}/{msg.messageId}?token={token}" alt="Attachment preview" />
                                            </div>
                                        {:else}
                                            <!-- svelte-ignore a11y_click_events_have_key_events -->
                                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                                            <div class="media-placeholder clickable" onclick={() => loadedImages[msg.messageId] = true}>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                                                <span>Click to download & view image</span>
                                            </div>
                                        {/if}
                                    {:else if msg.type === 'videoMessage'}
                                        <div class="media-placeholder">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                                            <span>[Video Attachment]</span>
                                        </div>
                                    {:else if msg.type === 'audioMessage' || msg.type === 'ptvMessage'}
                                        <div class="audio-player">
                                            <audio controls src="/api/media/{userId}/{msg.messageId}?token={token}"></audio>
                                        </div>
                                    {/if}

                                    <div class="text">
                                        {#if msg.body}
                                            {msg.body}
                                        {:else if msg.caption}
                                            {msg.caption}
                                        {:else if msg.type !== 'text' && msg.type !== 'conversation' && msg.type !== 'extendedTextMessage' && msg.type !== 'imageMessage' && msg.type !== 'videoMessage' && msg.type !== 'ptvMessage' && msg.type !== 'audioMessage'}
                                            <i style="opacity:0.7">[{msg.type}]</i>
                                        {/if}
                                    </div>
                                    <div class="meta">
                                        <span class="time">{formatTime(msg.timestamp)}</span>
                                    </div>
                                </div>
                            </div>
                        {/each}
                    {/if}
                </div>
                
                <div class="chat-input-placeholder">
                    <p>Replies are disabled in viewer mode.</p>
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    :global(body) { margin: 0; background: #0f172a; color: #f8fafc; font-family: 'Inter', system-ui, sans-serif; overflow: hidden; }

    .chat-layout { display: flex; flex-direction: column; height: 100vh; width: 100vw; background: #0f172a; }

    .app-header { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1.5rem; background: rgba(30,41,59,0.9); border-bottom: 1px solid rgba(100,116,139,0.2); }
    .btn-back { display: flex; align-items: center; gap: 0.5rem; background: transparent; border: none; color: #94a3b8; font-size: 0.95rem; font-weight: 500; cursor: pointer; transition: color 0.2s; padding: 0; }
    .btn-back:hover { color: #f8fafc; }
    .header-title { text-align: center; }
    .header-title h2 { margin: 0 0 2px; font-size: 1.1rem; color: #10b981; }
    .user-id { font-size: 0.75rem; color: #64748b; font-family: monospace; }

    .chat-container { display: flex; flex: 1; overflow: hidden; background: #0f172a; }

    /* Sidebar */
    .sidebar { width: 350px; background: #1e293b; border-right: 1px solid rgba(100,116,139,0.2); display: flex; flex-direction: column; flex-shrink: 0; }
    .sidebar-header { padding: 1rem 1.25rem; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(100,116,139,0.1); background: rgba(15,23,42,0.3); }
    .sidebar-header h3 { margin: 0; font-size: 1rem; color: #cbd5e1; }
    .btn-refresh { background: none; border: none; color: #94a3b8; font-size: 1.25rem; cursor: pointer; padding: 0; }
    .btn-refresh:hover:not(:disabled) { color: #10b981; }

    .chat-list { flex: 1; overflow-y: auto; }
    .chat-list::-webkit-scrollbar { width: 6px; }
    .chat-list::-webkit-scrollbar-thumb { background: rgba(100,116,139,0.3); }

    .chat-item { display: flex; align-items: center; gap: 1rem; padding: 0.875rem 1.25rem; border-bottom: 1px solid rgba(100,116,139,0.05); cursor: pointer; transition: background 0.15s; }
    .chat-item:hover { background: rgba(30,41,59,0.8); }
    .chat-item.active { background: rgba(16,185,129,0.15); border-left: 4px solid #10b981; padding-left: calc(1.25rem - 4px); }
    
    .chat-avatar { width: 44px; height: 44px; border-radius: 50%; background: #334155; display: flex; align-items: center; justify-content: center; color: #94a3b8; flex-shrink: 0; }
    .chat-item.active .chat-avatar { background: #10b981; color: #fff; }

    .chat-info { flex: 1; overflow: hidden; }
    .chat-row-1 { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; }
    .chat-name { font-weight: 500; color: #f1f5f9; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .chat-time { font-size: 0.75rem; color: #64748b; }
    .chat-row-2 { font-size: 0.85rem; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    /* Main Chat */
    .main-chat { flex: 1; display: flex; flex-direction: column; background: #0f172a; position: relative; }
    .main-chat::before { content: ''; position: absolute; top:0; left:0; right:0; bottom:0; background: url('https://w0.peakpx.com/wallpaper/818/148/HD-wallpaper-whatsapp-background-cool-dark-green-new-theme-whatsapp-thumbnail.jpg') center/cover; opacity: 0.05; pointer-events: none; }

    .empty-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #64748b; text-align: center; }
    .empty-state h3 { color: #94a3b8; margin: 1rem 0 0.5rem; font-weight: 500; }
    .empty-state p { font-size: 0.875rem; margin: 0; }

    .chat-header { padding: 0.75rem 1.5rem; background: #1e293b; border-bottom: 1px solid rgba(100,116,139,0.2); display: flex; align-items: center; gap: 1rem; z-index: 1; }
    .chat-header .chat-avatar { width: 40px; height: 40px; }
    .header-info h3 { margin: 0 0 2px; font-size: 1.05rem; color: #f8fafc; font-weight: 500; }
    .header-info .status { font-size: 0.75rem; color: #10b981; }

    .messages-area { flex: 1; padding: 1.5rem 5%; overflow-y: auto; display: flex; flex-direction: column; gap: 0.5rem; z-index: 1; }
    .messages-area::-webkit-scrollbar { width: 6px; }
    .messages-area::-webkit-scrollbar-thumb { background: rgba(100,116,139,0.3); border-radius: 3px; }

    .message-wrapper { display: flex; width: 100%; margin-bottom: 0.5rem; }
    .message-wrapper.incoming { justify-content: flex-start; }
    .message-wrapper.outgoing { justify-content: flex-end; }

    .message-bubble { max-width: 65%; padding: 0.5rem 0.6rem 0.4rem 0.75rem; border-radius: 8px; position: relative; box-shadow: 0 1px 2px rgba(0,0,0,0.15); }
    .incoming .message-bubble { background: #1e293b; border-top-left-radius: 0; }
    .outgoing .message-bubble { background: #064e3b; border-top-right-radius: 0; }

    .sender-name { font-size: 0.75rem; font-weight: 600; color: #34d399; margin-bottom: 0.25rem; }
    
    .media-placeholder { display: flex; align-items: center; gap: 0.5rem; background: rgba(0,0,0,0.2); padding: 0.5rem; border-radius: 6px; font-size: 0.8rem; color: #94a3b8; margin-bottom: 0.4rem; }

    .text { font-size: 0.95rem; line-height: 1.4; color: #f1f5f9; white-space: pre-wrap; word-break: break-word; }
    
    .meta { display: flex; justify-content: flex-end; margin-top: 2px; }
    .time { font-size: 0.65rem; color: rgba(255,255,255,0.5); }

    .chat-input-placeholder { padding: 1rem 1.5rem; background: #1e293b; border-top: 1px solid rgba(100,116,139,0.2); text-align: center; color: #64748b; font-size: 0.875rem; z-index: 1; }

    .status-msg { padding: 2rem; text-align: center; color: #94a3b8; font-size: 0.9rem; }
    .status-msg.err { color: #f87171; }
    
    .spin { width: 14px; height: 14px; border: 2px solid rgba(100,116,139,0.3); border-top-color: #94a3b8; border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; margin-right: 6px; vertical-align: middle; }
    @keyframes spin { to { transform: rotate(360deg); } }
</style>
