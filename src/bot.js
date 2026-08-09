const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const config = require('../config');
const { handleMessages } = require('./handler');
const { useMongoDBAuthState } = require('./mongoAuth');
const mongoose = require('mongoose');

const activeSessions = new Map();
const messageStore = {};

/**
 * Starts a WhatsApp Bot session for a specific User (Tenant)
 * @param {string} sessionId - The unique ID of the user (e.g. phone number)
 * @param {Function} onQRUpdate - Callback when a new QR is generated
 * @param {Function} onStatusUpdate - Callback when connection status changes
 */
async function startBot(sessionId, onQRUpdate, onStatusUpdate) {
    if (activeSessions.has(sessionId)) {
        console.log(`[Session ${sessionId}] Already running.`);
        return activeSessions.get(sessionId);
    }

    // Connect to MongoDB Auth State
    const { state, saveCreds } = await useMongoDBAuthState(sessionId);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        getMessage: async (key) => {
            const id = key.id;
            if (messageStore[id]) return messageStore[id];
            return { conversation: 'hello' }; 
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        for (const msg of m.messages) {
            if (msg.message && msg.key?.id) {
                messageStore[msg.key.id] = msg.message;
                const keys = Object.keys(messageStore);
                if (keys.length > 2000) delete messageStore[keys[0]]; // 2000 msgs across all users
            }
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            if (onQRUpdate) onQRUpdate(qr);
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
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

    sock.ev.on('messages.upsert', async (m) => {
        // SaaS Multi-Tenant Support: We pass the sessionId so handler knows who this belongs to
        await handleMessages(sock, m, sessionId);
    });
    
    return sock;
}

/**
 * Stop a specific session
 */
async function stopBot(sessionId) {
    const sock = activeSessions.get(sessionId);
    if (sock) {
        sock.ws.close();
        activeSessions.delete(sessionId);
        console.log(`[Session ${sessionId}] Stopped.`);
    }
}

module.exports = { startBot, stopBot, activeSessions };
