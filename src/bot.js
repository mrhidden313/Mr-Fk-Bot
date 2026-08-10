const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { handleMessages } = require('./handler');
const { useMongoDBAuthState } = require('./mongoAuth');

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
                // Limit store to last 500 msgs per user
                const keys = Object.keys(store);
                if (keys.length > 500) delete store[keys[0]];
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
