/**
 * MR FK BOT - Serializer
 * This file cleans the messy WhatsApp JSON so our router doesn't crash.
 */
function serialize(sock, msg) {
    if (!msg) return msg;

    // Standardize IDs and sender logic
    msg.id = msg.key.id;
    msg.isGroup = msg.key.remoteJid.endsWith('@g.us');
    msg.sender = msg.isGroup ? msg.key.participant : msg.key.remoteJid;
    msg.from = msg.key.remoteJid;
    
    // Safety check for empty messages
    if (!msg.message) return msg;

    // Extract Message Type with deep wrapper unwrapping
    // WhatsApp wraps messages in multiple shells: ephemeral, documentWithCaption, messageContextInfo etc.
    msg.type = Object.keys(msg.message)[0];
    
    // Deep unwrap - only real wrapper shells, NOT viewOnce types!
    // ephemeralMessage = disappearing messages shell (safe to unwrap)
    // viewOnceMessage/V2/V2Extension = these are the REAL types we detect in handler.js, DO NOT unwrap them!
    const WRAPPERS = ['ephemeralMessage'];
    let unwrapDepth = 0;
    while (WRAPPERS.includes(msg.type) && unwrapDepth < 5) {
        const inner = msg.message[msg.type]?.message;
        if (!inner) break;
        msg.message = inner;
        msg.type = Object.keys(msg.message)[0];
        unwrapDepth++;
    }
    // messageContextInfo puts the real type at index [1]
    if (msg.type === 'messageContextInfo') {
        const allKeys = Object.keys(msg.message);
        msg.type = allKeys.find(k => k !== 'messageContextInfo') || msg.type;
    }
    
    console.log(`[SERIALIZE] Final type: ${msg.type}`);

    // Safely Extract Text Body from any type of message
    msg.body = (msg.type === 'conversation' && msg.message.conversation) ? msg.message.conversation : 
               (msg.type === 'extendedTextMessage' && msg.message.extendedTextMessage.text) ? msg.message.extendedTextMessage.text : 
               (msg.type === 'imageMessage' && msg.message.imageMessage.caption) ? msg.message.imageMessage.caption : 
               (msg.type === 'videoMessage' && msg.message.videoMessage.caption) ? msg.message.videoMessage.caption : '';

    // Extract Quoted Message (For .vv command and others)
    if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        msg.quoted = {
            message: msg.message.extendedTextMessage.contextInfo.quotedMessage,
            key: {
                remoteJid: msg.from,
                fromMe: msg.message.extendedTextMessage.contextInfo.participant === sock?.user?.id?.split(':')[0] + '@s.whatsapp.net',
                id: msg.message.extendedTextMessage.contextInfo.stanzaId,
                participant: msg.message.extendedTextMessage.contextInfo.participant
            }
        };
        msg.quoted.type = Object.keys(msg.quoted.message)[0];
    }

    // Create a powerful, human-like reply function
    msg.reply = async (text) => {
        try {
            // ANTI-BAN: 1. Send "Read" tick
            await sock.readMessages([msg.key]).catch(() => {});
            
            // ANTI-BAN: 2. Simulate typing
            await sock.sendPresenceUpdate('composing', msg.from).catch(() => {});
            
            // ANTI-BAN: 3. Randomized delay (1 to 2 seconds)
            const delay = Math.floor(Math.random() * (2000 - 1000 + 1)) + 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
            
            // ANTI-BAN: 4. Stop typing
            await sock.sendPresenceUpdate('paused', msg.from).catch(() => {});
        } catch (e) {
            console.error("[Anti-Ban] Non-fatal error during reply simulation:", e.message);
        }
        
        // Always attempt to send the message
        return sock.sendMessage(msg.from, { text: text }, { quoted: msg });
    };

    return msg;
}

module.exports = { serialize };
