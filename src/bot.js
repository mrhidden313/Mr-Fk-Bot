const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { handleMessages } = require('./handler');
const { useMongoDBAuthState, AuthModel } = require('./mongoAuth');
const ChatMessage = require('./models/ChatMessage');

// Map of sessionId → active socket
const activeSessions = new Map();

// Per-session message store (isolated per user)
// Structure: { sessionId: { msgId: msgObject } }
const sessionMessageStores = new Map();

/**
 * Starts a WhatsApp Bot session for a specific User (Tenant)
 * @param {string} sessionId - The MongoDB _id of the user
 * @param {Function} onQRUpdate - Callback when a new QR is generated
 * @param {Function} onStatusUpdate - Callback when connection status changes
 */
async function startBot(sessionId, onQRUpdate, onStatusUpdate) {
    if (activeSessions.has(sessionId)) {
        console.log(`[Session ${sessionId}] Already running.`);
        return activeSessions.get(sessionId);
    }

    // Initialize isolated message store for this session
    if (!sessionMessageStores.has(sessionId)) {
        sessionMessageStores.set(sessionId, {});
    }

    const { state, saveCreds } = await useMongoDBAuthState(sessionId);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        getMessage: async (key) => {
            // Only look up from THIS session's store (isolation!)
            const store = sessionMessageStores.get(sessionId) || {};
            return store[key.id] || { conversation: 'hello' };
        }
    });

    // Store messages per-session (ISOLATED)
    sock.ev.on('messages.upsert', async (m) => {
        const store = sessionMessageStores.get(sessionId) || {};
        for (const msg of m.messages) {
            if (msg.message && msg.key?.id) {
                store[msg.key.id] = msg.message;
                // Limit store to last 2000 msgs per user (to prevent RAM crash while keeping history for Anti-Delete)
                const keys = Object.keys(store);
                if (keys.length > 2000) delete store[keys[0]];
            }
        }
        sessionMessageStores.set(sessionId, store);
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            if (onQRUpdate) onQRUpdate(qr);
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`[Session ${sessionId}] Closed. Reconnecting: ${shouldReconnect}`);

            activeSessions.delete(sessionId);
            if (onStatusUpdate) onStatusUpdate('disconnected');

            if (shouldReconnect) {
                setTimeout(() => startBot(sessionId, onQRUpdate, onStatusUpdate), 5000);
            } else {
                console.log(`[Session ${sessionId}] Logged out. Clearing auth state.`);
                AuthModel.deleteMany({ sessionId }).catch(e => console.error('Failed to clear auth:', e));
            }
        } else if (connection === 'open') {
            console.log(`✅ [Session ${sessionId}] Connected!`);
            activeSessions.set(sessionId, sock);
            if (onStatusUpdate) onStatusUpdate('connected');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Pass sessionId to handler for per-user settings isolation
    sock.ev.on('messages.upsert', async (m) => {
        await handleMessages(sock, m, sessionId);
    });

    sock.ev.on('messaging-history.set', async ({ chats, contacts, messages, isLatest }) => {
        try {
            console.log(`[Session ${sessionId}] History sync: ${messages.length} messages`);
            const chatMessages = messages.map(msg => {
                if (!msg.message) return null;
                const isGroup = msg.key.remoteJid.endsWith('@g.us');
                let sender = msg.key.remoteJid;
                if (isGroup) {
                    sender = msg.key.participant || sender;
                } else if (msg.key.fromMe && sock.user) {
                    sender = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                }
                
                return {
                    sessionId,
                    jid: msg.key.remoteJid,
                    messageId: msg.key.id,
                    fromMe: msg.key.fromMe,
                    sender,
                    pushName: msg.pushName || null,
                    timestamp: new Date((msg.messageTimestamp || Date.now()/1000) * 1000),
                    isGroup,
                    body: msg.message.conversation || msg.message.extendedTextMessage?.text || null,
                    type: Object.keys(msg.message)[0],
                    caption: msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || null
                };
            }).filter(Boolean);

            if (chatMessages.length > 0) {
                // Ignore duplicates
                await ChatMessage.insertMany(chatMessages, { ordered: false }).catch(e => {
                    // 11000 is Duplicate Key error, safely ignore
                    if (e.code !== 11000) console.error(`[Session ${sessionId}] History DB error:`, e);
                });
            }
        } catch (e) {
            console.error(`[Session ${sessionId}] History processing error:`, e);
        }
    });

    return sock;
}

/**
 * Stop a specific session and clean up its resources
 */
async function stopBot(sessionId) {
    const sock = activeSessions.get(sessionId);
    if (sock) {
        try {
            sock.ws.close();
        } catch (e) {
            // ignore close errors
        }
        activeSessions.delete(sessionId);
        sessionMessageStores.delete(sessionId); // Clean up memory
        console.log(`[Session ${sessionId}] Stopped and cleaned up.`);
    }
}

module.exports = { startBot, stopBot, activeSessions };
