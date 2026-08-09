const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');

// PHONE #2 JID - Bot will message this first to force Signal key exchange
// Change this to your second number!
const PHONE2_JID = '923305153963@s.whatsapp.net';

const msgStore = {};

async function startTest() {
    console.log('\n VIEW ONCE DETECTOR v4 - With forced key exchange\n');
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({ 
        version, 
        logger: pino({ level: 'silent' }), 
        auth: state, 
        getMessage: async (key) => msgStore[key.id] || { conversation: '' },
        retryRequestDelayMs: 250,
        maxMsgRetryCount: 5
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection }) => {
        if (connection === 'open') {
            console.log('Connected! Forcing Signal key exchange with phone #2...');
            // Send a message TO phone #2 first to establish keys in BOTH directions
            try {
                await new Promise(r => setTimeout(r, 3000)); // wait 3s for session to settle
                await sock.sendMessage(PHONE2_JID, { text: 'Bot ready! Please send a View Once photo now.' });
                console.log('Key exchange initiated! Now send View Once from phone #2!\n');
            } catch(e) {
                console.log('Could not send to phone #2 - manual key exchange needed:', e.message);
            }
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        for (const msg of m.messages) {
            if (msg.key?.id && msg.message && Object.keys(msg.message).length > 0) {
                msgStore[msg.key.id] = msg.message;
            }
            
            const from = msg.key?.remoteJid;
            const fromMe = msg.key?.fromMe;
            if (fromMe) continue; // skip own messages
            
            const msgKeys = Object.keys(msg.message || {});
            
            console.log('\n--- NEW MESSAGE ---');
            console.log('From:', from);
            console.log('Keys:', JSON.stringify(msgKeys));
            console.log('messageStubType:', msg.messageStubType);
            
            if (msgKeys.length === 0) {
                console.log('*** CIPHERTEXT STUB - Keys not synced yet! Retry being sent...');
                continue;
            }

            const raw = JSON.stringify(msg.message).toLowerCase();
            if (raw.includes('viewonce')) {
                console.log('\n VIEWONCE DETECTED!');
                await sock.sendMessage(from, { text: ' VIEW ONCE PAKAD LIYA! Recovering...' });
                await downloadAndSend(sock, msg, from);
            } else {
                console.log('Type:', msgKeys[0]);
            }
        }
    });

    sock.ev.on('messages.update', async (updates) => {
        for (const u of updates) {
            if (u.update?.message && Object.keys(u.update.message).length > 0) {
                const raw = JSON.stringify(u.update.message).toLowerCase();
                console.log('\n[RETRY DECRYPTED] Keys:', Object.keys(u.update.message));
                if (raw.includes('viewonce')) {
                    console.log('VIEWONCE IN RETRY!');
                    const fakeMsg = { key: u.key, message: u.update.message };
                    await sock.sendMessage(u.key.remoteJid, { text: 'VIEW ONCE RECOVERED FROM RETRY!' });
                    await downloadAndSend(sock, fakeMsg, u.key.remoteJid);
                }
            }
        }
    });
}

async function downloadAndSend(sock, msg, from) {
    const msgObj = msg.message || {};
    const vKey = Object.keys(msgObj).find(k => k.toLowerCase().includes('viewonce'));
    if (!vKey || !msgObj[vKey]?.message) { console.log('No inner message!'); return; }
    const inner = msgObj[vKey].message;
    const mt = Object.keys(inner)[0];
    const md = inner[mt];
    try {
        const stream = await downloadContentFromMessage(md, mt.replace('Message',''));
        let buf = Buffer.from([]);
        for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
        console.log('Buffer:', buf.length, 'bytes');
        if (mt === 'imageMessage') await sock.sendMessage(from, { image: buf, caption: 'Recovered!' });
        else if (mt === 'videoMessage') await sock.sendMessage(from, { video: buf, caption: 'Recovered!' });
        console.log('SENT!');
    } catch(e) { console.error('Download error:', e.message); }
}

startTest().catch(console.error);
