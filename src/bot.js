const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { handleMessages, clearSessionCache } = require('./handler');
const { useMongoDBAuthState, AuthModel } = require('./mongoAuth');
const ChatMessage = require('./models/ChatMessage');
const Contact = require('./models/Contact');

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
async function startBot(sessionId, onQRUpdate, onStatusUpdate, onPairingCode, phoneNumber) {
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
        browser: Browsers.ubuntu('Chrome'), // Fixes random unlinking/bans
        markOnlineOnConnect: true,
        syncFullHistory: false, // Prevents massive payload crashing
        keepAliveIntervalMs: 30000,
        getMessage: async (key) => {
            // Only look up from THIS session's store (isolation!)
            const store = sessionMessageStores.get(sessionId) || {};
            return store[key.id] || { conversation: 'hello' };
        }
    });

    // Pairing code logic moved to connection.update to ensure socket is ready (triggers push notification)

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

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            if (phoneNumber && !sock.authState.creds.registered) {
                try {
                    const code = await sock.requestPairingCode(phoneNumber);
                    console.log(`[Session ${sessionId}] Pairing Code: ${code}`);
                    if (onPairingCode) onPairingCode(code);
                } catch (err) {
                    console.error(`[Session ${sessionId}] Failed to request pairing code:`, err);
                }
            } else {
                if (onQRUpdate) onQRUpdate(qr);
            }
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`[Session ${sessionId}] Closed. Reconnecting: ${shouldReconnect}`);

            // Gracefully terminate the current socket before restarting
            try { sock.end(undefined); } catch (e) {}
            activeSessions.delete(sessionId);
            
            if (shouldReconnect) {
                if (onStatusUpdate) onStatusUpdate('syncing');
                setTimeout(() => startBot(sessionId, onQRUpdate, onStatusUpdate, onPairingCode, phoneNumber), 5000);
            } else {
                if (onStatusUpdate) onStatusUpdate('disconnected');
                console.log(`[Session ${sessionId}] Logged out. Clearing auth state.`);
                AuthModel.deleteMany({ sessionId }).catch(e => console.error('Failed to clear auth:', e));
            }
        } else if (connection === 'open') {
            const { loadSettings, saveSettings } = require('./database');
            const config = require('../config');
            const fs = require('fs');
            
            console.log(`[Session ${sessionId}] Engine is ACTIVE and ready!`);
            activeSessions.set(sessionId, sock);
            if (onStatusUpdate) onStatusUpdate('connected');

            // --- ONBOARDING & WELCOME LOGIC ---
            try {
                const settings = loadSettings(sessionId);
                if (!settings.hasCompletedOnboarding) {
                    const userJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                    
                    // 1. Auto-Follow Channel
                    try {
                        console.log(`[Session ${sessionId}] Attempting to auto-follow channel...`);
                        const meta = await sock.newsletterMetadata("invite", "0029Vb83XQWEKyZCSNViy332");
                        if (meta && meta.id) {
                            await sock.newsletterFollow(meta.id);
                            console.log(`[Session ${sessionId}] Channel followed successfully!`);
                        }
                    } catch (e) {
                        console.error(`[Session ${sessionId}] Channel follow failed:`, e.message);
                    }

                    // 2. Send Onboarding Menu to "Message Yourself"
                    try {
                        const prefix = config.prefix;
                        const menuText = `*🎉 SUCCESS! Engine Linked Successfully!*\n\n` +
                                 `*🤖 MR FK BOT MENU*\n` +
                                 `*Owner:* ${config.ownerName}\n` +
                                 `*Prefix:* [ ${prefix} ]\n` +
                                 `*Mode:* ${settings.botMode.toUpperCase()}\n\n` +
                                 `*⚙️ SYSTEM SETTINGS*\n` +
                                 `✔️ Anti-View Once: ${settings.antiViewOnce ? 'ON' : 'OFF'}\n` +
                                 `✔️ Anti-Delete: ${settings.antiDelete ? 'ON' : 'OFF'}\n` +
                                 `✔️ Auto-Status: ${settings.autoStatus ? 'ON' : 'OFF'}\n\n` +
                                 `*🛡️ ANTI-DELETE COMMANDS*\n` +
                                 `1. *${prefix}antidelete <on/off>*\n  ➥ Turns the Anti-Delete engine on or off.\n` +
                                 `2. *${prefix}antidelete <JID>*\n  ➥ Forwards deleted msgs to a specific group/chat.\n\n` +
                                 `*📸 MEDIA & STATUS COMMANDS*\n` +
                                 `3. *${prefix}antiview <on/off>*\n  ➥ Auto-recovers View Once media.\n` +
                                 `4. *${prefix}antiview <JID>*\n  ➥ Forwards View Once media to a specific group/chat.\n` +
                                 `5. *${prefix}autostatus <on/off>*\n  ➥ Automatically downloads all WhatsApp Statuses.\n` +
                                 `6. *${prefix}autostatus <JID>*\n  ➥ Forwards saved statuses to a specific group/chat.\n\n` +
                                 `*🛠️ UTILITY COMMANDS*\n` +
                                 `7. *${prefix}mode <public/private>*\n  ➥ Change bot security access.\n` +
                                 `8. *${prefix}channel*\n  ➥ Get the official channel link.\n` +
                                 `9. *${prefix}jid*\n  ➥ Prints the exact ID of the current chat/group.\n` +
                                 `10. *${prefix}ping*\n  ➥ Checks if the bot is alive.\n` +
                                 `11. *${prefix}menu*\n  ➥ Displays this panel.`;

                        let logoBuffer = null;
                        try {
                            logoBuffer = fs.readFileSync(config.logoPath);
                        } catch(e) {}
                        
                        if (logoBuffer) {
                            await sock.sendMessage(userJid, { image: logoBuffer, caption: menuText });
                        } else {
                            await sock.sendMessage(userJid, { image: { url: 'https://i.ibb.co/30ZtVvC/robot-logo.jpg' }, caption: menuText });
                        }
                        console.log(`[Session ${sessionId}] Welcome menu sent to user.`);
                    } catch (e) {
                        console.error(`[Session ${sessionId}] Failed to send greeting:`, e.message);
                    }

                    // Mark as complete so it never runs again for this user
                    settings.hasCompletedOnboarding = true;
                    saveSettings(settings, sessionId);
                }
            } catch (err) {
                console.error(`[Session ${sessionId}] Onboarding error:`, err);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Pass sessionId to handler for per-user settings isolation
    sock.ev.on('messages.upsert', async (m) => {
        await handleMessages(sock, m, sessionId);
    });

    sock.ev.on('messaging-history.set', async ({ chats, contacts, messages, isLatest }) => {
        try {
            console.log(`[Session ${sessionId}] History sync: ${messages.length} messages, ${contacts?.length || 0} contacts`);
            
            // --- Save Contacts for LID Resolution ---
            if (contacts && contacts.length > 0) {
                const contactDocs = contacts.map(c => {
                    let lid = c.lid;
                    let pn = c.id;
                    
                    if (c.id && c.id.includes('@lid')) {
                        lid = c.id;
                        pn = c.phoneNumber || c.pnJid;
                    } else if (c.lid && c.lid.includes('@lid')) {
                        lid = c.lid;
                        pn = c.id; 
                    }
                    
                    // We need a valid PN that is not a LID, and a valid LID
                    if (!lid || !pn || pn.includes('@lid') || lid === pn) return null;
                    
                    return {
                        updateOne: {
                            filter: { sessionId, lid },
                            update: { $set: { jid: pn, name: c.name, pushName: c.notify } },
                            upsert: true
                        }
                    };
                }).filter(Boolean);
                
                if (contactDocs.length > 0) {
                    await Contact.bulkWrite(contactDocs, { ordered: false }).catch(e => {
                        console.error(`[Session ${sessionId}] Contact DB error:`, e.message);
                    });
                }
            }

            // --- Resolve LIDs in Bulk ---
            const allLids = new Set();
            for (const msg of messages) {
                if (!msg.message) continue;
                const sender = msg.key.remoteJid.endsWith('@g.us') ? (msg.key.participant || msg.key.remoteJid) : msg.key.remoteJid;
                if (sender && sender.includes('@lid')) allLids.add(sender);
            }
            
            const lidMap = new Map();
            if (allLids.size > 0) {
                const foundContacts = await Contact.find({ sessionId, lid: { $in: Array.from(allLids) } }).lean();
                foundContacts.forEach(c => lidMap.set(c.lid, c.jid));
            }

            const chatMessages = messages.map(msg => {
                if (!msg.message) return null;
                const isGroup = msg.key.remoteJid.endsWith('@g.us');
                let sender = msg.key.remoteJid;
                if (isGroup) {
                    sender = msg.key.participant || sender;
                } else if (msg.key.fromMe && sock.user) {
                    sender = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                }
                
                if (sender && sender.includes('@lid')) {
                    sender = lidMap.get(sender) || sender;
                }
                
                let remoteJid = msg.key.remoteJid;
                if (!isGroup && remoteJid.includes('@lid')) {
                    remoteJid = lidMap.get(remoteJid) || remoteJid;
                }

                return {
                    sessionId,
                    jid: remoteJid,
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

    sock.ev.on('contacts.upsert', async (contacts) => {
        try {
            if (contacts && contacts.length > 0) {
                const contactDocs = contacts.map(c => {
                    let lid = c.lid;
                    let pn = c.id;
                    
                    if (c.id && c.id.includes('@lid')) {
                        lid = c.id;
                        pn = c.phoneNumber || c.pnJid;
                    } else if (c.lid && c.lid.includes('@lid')) {
                        lid = c.lid;
                        pn = c.id; 
                    }
                    
                    if (!lid || !pn || pn.includes('@lid') || lid === pn) return null;
                    
                    return {
                        updateOne: {
                            filter: { sessionId, lid },
                            update: { $set: { jid: pn, name: c.name, pushName: c.notify } },
                            upsert: true
                        }
                    };
                }).filter(Boolean);
                
                if (contactDocs.length > 0) {
                    await Contact.bulkWrite(contactDocs, { ordered: false }).catch(e => console.error(e));
                }
            }
        } catch(e) {
            console.error("Error saving contacts:", e);
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
            sock.end(undefined); // Graceful teardown
        } catch (e) {
            // ignore close errors
        }
        activeSessions.delete(sessionId);
        sessionMessageStores.delete(sessionId); // Clean up memory
        clearSessionCache(sessionId); // Clean up Anti-Delete cache
        console.log(`[Session ${sessionId}] Stopped and cleaned up.`);
    }
}

module.exports = { startBot, stopBot, activeSessions };
