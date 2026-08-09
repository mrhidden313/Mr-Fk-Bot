const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const figlet = require('figlet');
const qrcode = require('qrcode-terminal');
const config = require('./config');
const { handleMessages } = require('./src/handler');

// Real Message Store for proper View Once media decryption
// Baileys calls getMessage() when it needs to decrypt media. Without a REAL store, View Once fails silently.
const messageStore = {};

// Global Crash Preventer & Bug Tracker
// This will catch any fatal errors and print them clearly instead of just dying silently
process.on('uncaughtException', (err) => {
    console.error('\n[🚨 CRITICAL BUG] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('\n[🚨 CRITICAL BUG] Unhandled Promise Rejection at:', promise, 'reason:', reason);
});

// 👑 Branding: Print the massive MR FK BOT logo in the terminal
function showBranding() {
    console.clear();
    console.log(figlet.textSync(config.botName, { font: 'Standard', horizontalLayout: 'default' }));
    console.log(`\n==============================================`);
    console.log(`🚀 Created by: ${config.ownerName}`);
    console.log(`🛡️  Status: Starting Connection Engine...`);
    console.log(`==============================================\n`);
}

async function startBot() {
    showBranding();

    // 1. Session Setup: We save credentials so you don't scan QR code every time (Learning from basic bot mistakes)
    const { state, saveCreds } = await useMultiFileAuthState(config.sessionName);
    const { version } = await fetchLatestBaileysVersion();

    // 2. Initialize Socket Connection
    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        // CRITICAL FIX: Real getMessage store so Baileys can decrypt View Once media
        getMessage: async (key) => {
            const id = key.id;
            if (messageStore[id]) {
                return messageStore[id];
            }
            return { conversation: 'hello' }; // fallback
        }
    });

    // Store incoming messages for decryption reference
    sock.ev.on('messages.upsert', async (m) => {
        for (const msg of m.messages) {
            if (msg.message && msg.key?.id) {
                messageStore[msg.key.id] = msg.message;
                // Keep store lean - only last 500 messages
                const keys = Object.keys(messageStore);
                if (keys.length > 500) delete messageStore[keys[0]];
            }
        }
    });

    // 3. Handle Connection Updates (Disconnects, Restarts, QR Scans)
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            showBranding(); // Clear the screen and redraw the logo
            qrcode.generate(qr, { small: true });
            console.log("📲 Please scan the QR code above with your WhatsApp!");
            console.log("⏱️  (QR code refreshes automatically every 20 seconds for security)");
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`⚠️ Connection closed. Reconnecting: ${shouldReconnect}`);
            
            if (shouldReconnect) {
                startBot(); // Reconnect automatically!
            } else {
                console.log(`❌ You logged out! Please delete the '${config.sessionName}' folder and restart.`);
            }
        } else if (connection === 'open') {
            console.log(`✅ ${config.botName} is successfully connected to WhatsApp!`);
        }
    });

    // 4. Save Session Keys whenever they update
    sock.ev.on('creds.update', saveCreds);

    // 5. Route all incoming messages to our Handler
    sock.ev.on('messages.upsert', async (m) => {
        await handleMessages(sock, m);
    });
}

// Start the engine
startBot();
