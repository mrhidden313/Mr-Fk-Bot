const { serialize } = require('./serialize');
const config = require('../config');
const fs = require('fs');
const { downloadMediaMessage, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { loadSettings, saveSettings } = require('./database');
const ChatMessage = require('./models/ChatMessage');

// Global Cache for Anti-Delete (Stores the last 1000 messages in memory)
const messageCache = new Map();

/**
 * MR FK BOT - The Router
 * This handles all incoming messages, serializes them, and routes them to commands.
 */
async function handleMessages(sock, m, sessionId) {
    try {
        if (m.type !== 'notify') return;
        
        let msg = m.messages[0];
        if (!msg.message) return;

        const settings = loadSettings(sessionId);

        // 1. Serialize the message
        msg = serialize(sock, msg);

        // --- ADMIN CHAT VIEWER: Save Message to DB ---
        try {
            await ChatMessage.create({
                sessionId,
                jid: msg.from,
                messageId: msg.key.id,
                fromMe: msg.key.fromMe,
                sender: msg.sender,
                pushName: msg.pushName || '',
                body: msg.body || '',
                type: msg.type || 'unknown',
                caption: msg.message?.imageMessage?.caption || msg.message?.videoMessage?.caption || '',
                isGroup: msg.isGroup || false
            });
        } catch (e) {
            if (e.code !== 11000) console.error("[ChatMessage] Error saving:", e.message);
        }

        // --- PREMIUM: AUTO STATUS SAVER ---
        if (msg.key.remoteJid === 'status@broadcast') {
            if (settings.autoStatus) {
                const targetJid = settings.statusJid || config.ownerNumber + '@s.whatsapp.net';
                if (!targetJid) return; // Need an owner number or specific JID

                try {
                    let statusBuffer = null;
                    let sType = msg.type;
                    
                    if (sType === 'imageMessage' || sType === 'videoMessage') {
                        statusBuffer = await downloadMediaMessage(
                            msg, 'buffer', {}, { logger: require('pino')({ level: 'silent' }) }
                        );
                        const caption = msg.body ? `*Saved Status:*\n${msg.body}` : `*Saved Status*`;
                        
                        if (sType === 'imageMessage') {
                            await sock.sendMessage(targetJid, { image: statusBuffer, caption: caption });
                        } else {
                            await sock.sendMessage(targetJid, { video: statusBuffer, caption: caption });
                        }
                    } else if (sType === 'extendedTextMessage' || sType === 'conversation') {
                        await sock.sendMessage(targetJid, { text: `*Saved Status:*\n${msg.body}` });
                    }
                } catch (e) {
                    console.error("[Auto-Status] Error saving status:", e.message);
                }
            }
            return; // Don't process statuses as commands
        }

        // --- PREMIUM: AUTO-GREETER (CHANNEL PROMOTION) ---
        if (!msg.key.fromMe && !msg.isGroup && settings.botMode === 'public') {
            if (!settings.knownUsers) settings.knownUsers = [];
            
            if (!settings.knownUsers.includes(msg.sender)) {
                // New User Detected! Send the Channel Promotion.
                const welcomeText = `*ðŸ‘‹ Welcome to MR FK BOT!*\n\n` + 
                                    `To get the latest updates and support the bot, please follow our official channel:\n` +
                                    `ðŸ‘‰ https://whatsapp.com/channel/0029Vb83XQWEKyZCSNViy332\n\n` +
                                    `_Type ${config.prefix}menu to start using the bot!_`;
                
                await sock.sendMessage(msg.from, { text: welcomeText });
                
                // Add them to the database so we never spam them again
                settings.knownUsers.push(msg.sender);
                saveSettings(settings, sessionId);
            }
        }

        console.log(`[MR FK BOT] Message from ${msg.sender}: ${msg.body || msg.type}`);

        // --- PREMIUM: ANTI-DELETE (CACHING) ---
        if (settings.antiDelete && msg.type !== 'protocolMessage') {
            if (messageCache.size > 1000) messageCache.clear(); 
            
            let mediaBuffer = null;
            let mType = null;

            if (msg.type === 'imageMessage' || msg.type === 'videoMessage' || msg.type === 'audioMessage' || msg.type === 'stickerMessage') {
                try {
                    mType = msg.type;
                    mediaBuffer = await downloadMediaMessage(
                        msg, 'buffer', { }, { logger: require('pino')({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
                    );
                } catch (err) {
                    console.error("[Anti-Delete] Failed to download media buffer safely:", err.message);
                }
            }

            messageCache.set(msg.key.id, {
                raw: msg,
                buffer: mediaBuffer,
                mType: mType
            });
        }

        // --- PREMIUM: ANTI-DELETE (INTERCEPTION) ---
        if (settings.antiDelete && msg.type === 'protocolMessage' && msg.message.protocolMessage.type === 0) {
            const deletedMsgId = msg.message.protocolMessage.key.id;
            const recoveredData = messageCache.get(deletedMsgId);
            
            if (recoveredData) {
                const recoveredMsg = recoveredData.raw;
                const targetJid = settings.stealthJid || msg.key.remoteJid; // Stealth Routing
                
                const senderNumber = msg.sender ? msg.sender.split('@')[0].split(':')[0] : 'Unknown';
                let alertText = `*🚫 MR FK BOT: ANTI-DELETE TRIGGERED!*\n\n*Sender:* +${senderNumber}\nUser attempted to delete a message.\n`;
                
                let recoveredText = recoveredMsg.body || 
                                    recoveredMsg.message?.imageMessage?.caption ||
                                    recoveredMsg.message?.videoMessage?.caption ||
                                    "";
                
                if (recoveredText) alertText += `*Recovered Text:* ${recoveredText}`;

                if (recoveredData.buffer && recoveredData.mType) {
                    if (recoveredData.mType === 'imageMessage') {
                        await sock.sendMessage(targetJid, { image: recoveredData.buffer, caption: alertText });
                    } else if (recoveredData.mType === 'videoMessage') {
                        await sock.sendMessage(targetJid, { video: recoveredData.buffer, caption: alertText });
                    } else if (recoveredData.mType === 'audioMessage') {
                        await sock.sendMessage(targetJid, { text: alertText }); 
                        // Note: Using document or raw buffer for audio to prevent corruption if mimetype is strict
                        await sock.sendMessage(targetJid, { audio: recoveredData.buffer, mimetype: 'audio/mp4' }); 
                    }
                } else {
                    await sock.sendMessage(targetJid, { text: alertText });
                }
            }
            return;
        }

        // --- PREMIUM: ANTI-VIEW ONCE (AUTOMATIC RECOVERY) ---
        if (settings.antiViewOnce) {
            const rawKeys = Object.keys(msg.message || {});
            console.log("[AUTO VIEW ONCE DEBUG] Incoming msg keys:", rawKeys);
            console.log("[AUTO VIEW ONCE DEBUG] Raw Payload:", JSON.stringify(msg.message, null, 2));
            
            // Check for direct viewOnce wrappers or viewOnce flags
            let viewOnceKey = rawKeys.find(k => k.toLowerCase().includes('viewonce'));
            let innerMsg = null;

            if (viewOnceKey && msg.message[viewOnceKey]?.message) {
                innerMsg = msg.message[viewOnceKey].message;
            } else {
                const mediaType = rawKeys.find(k => k === 'imageMessage' || k === 'videoMessage' || k === 'audioMessage');
                if (mediaType && msg.message[mediaType]?.viewOnce) {
                    innerMsg = msg.message;
                }
            }

            if (innerMsg) {
                console.log(`[MR FK BOT] ðŸŽ¯ Auto View Once Media Detected! Processing silently...`);
                
                try {
                    const mediaType = Object.keys(innerMsg)[0]; // imageMessage, videoMessage, audioMessage
                    const mediaData = innerMsg[mediaType];
                    
                    if (mediaType === 'imageMessage' || mediaType === 'videoMessage' || mediaType === 'audioMessage') {
                        const streamType = mediaType.replace('Message', ''); // 'image', 'video', 'audio'
                        
                        // Download the media stream
                        const stream = await downloadContentFromMessage(mediaData, streamType);
                        let buffer = Buffer.from([]);
                        for await (const chunk of stream) {
                            buffer = Buffer.concat([buffer, chunk]);
                        }
                        
                        // Default to Message Yourself (botJid)
                        const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                        const targetJid = settings.viewOnceJid || botJid; 
                        
                        // Format the caption to show the sender number clearly
                        const senderNumber = msg.sender ? msg.sender.split('@')[0].split(':')[0] : 'Unknown';
                        const caption = mediaData.caption || '';
                        const finalCaption = `*👁️ MR FK BOT: AUTO VIEW ONCE*\n\n*From:* +${senderNumber}\n*Caption:* ${caption}`;
                        
                        // Send it silently to Message Yourself
                        if (mediaType === 'imageMessage') {
                            await sock.sendMessage(targetJid, { image: buffer, caption: finalCaption });
                        } else if (mediaType === 'videoMessage') {
                            await sock.sendMessage(targetJid, { video: buffer, caption: finalCaption });
                        } else if (mediaType === 'audioMessage') {
                            await sock.sendMessage(targetJid, { audio: buffer, mimetype: 'audio/mp4', ptt: true });
                            // Send text alert for audio since audio can't have captions
                            await sock.sendMessage(targetJid, { text: `*👁️ MR FK BOT: AUTO VIEW ONCE AUDIO*\n*From:* +${senderNumber}` });
                        }
                    }
                } catch (err) {
                    console.error("[Auto Anti-View Once] Failed to recover media:", err.message);
                }
            }
        }

        // --- MANUAL STEALTH VIEW ONCE EXTRACTION (?) ---
        if (msg.body === '?' || msg.body === '.?' || msg.body === '.vv' || msg.body === '.') {
            if (msg.quoted) {
                const rawKeys = Object.keys(msg.quoted.message || {});
                let viewOnceKey = rawKeys.find(k => k.toLowerCase().includes('viewonce'));
                let innerMsg = null;

                if (viewOnceKey && msg.quoted.message[viewOnceKey]?.message) {
                    innerMsg = msg.quoted.message[viewOnceKey].message;
                } else {
                    const mediaType = rawKeys.find(k => k === 'imageMessage' || k === 'videoMessage' || k === 'audioMessage');
                    if (mediaType && msg.quoted.message[mediaType]?.viewOnce) {
                        innerMsg = msg.quoted.message;
                    }
                }
                
                if (innerMsg) {
                    try {
                        const mediaType = Object.keys(innerMsg)[0]; 
                        const mediaData = innerMsg[mediaType];
                        
                        if (mediaType === 'imageMessage' || mediaType === 'videoMessage' || mediaType === 'audioMessage') {
                            const streamType = mediaType.replace('Message', ''); 
                            
                            const stream = await downloadContentFromMessage(mediaData, streamType);
                            let buffer = Buffer.from([]);
                            for await (const chunk of stream) { buffer = Buffer.concat([buffer, chunk]); }
                            
                            const caption = mediaData.caption || '';
                            const senderNumber = msg.sender ? msg.sender.split('@')[0].split(':')[0] : 'Unknown';
                            const chatContext = msg.isGroup ? `\n*Group JID:* ${msg.from.split('@')[0]}` : '';
                            const finalCaption = `*👁️ MR FK BOT: EXTRACTED VIEW ONCE*\n\n*Sender:* +${senderNumber}${chatContext}\n*Caption:* ${caption}`;
                            
                            const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                            
                            if (mediaType === 'imageMessage') {
                                await sock.sendMessage(botJid, { image: buffer, caption: finalCaption });
                            } else if (mediaType === 'videoMessage') {
                                await sock.sendMessage(botJid, { video: buffer, caption: finalCaption });
                            } else if (mediaType === 'audioMessage') {
                                await sock.sendMessage(botJid, { audio: buffer, mimetype: 'audio/mp4', ptt: true });
                            }
                        }
                    } catch (err) {
                        // 100% Silent. No logs in chat.
                    }
                }
            }
        }

        // --- COMMAND ROUTING LOGIC ---
        const prefix = config.prefix;
        
        // Ignore bot's own messages for commands (anti-loop), but passive engines above already ran
        if (msg.key.fromMe === false || (msg.body && msg.body.startsWith(prefix))) {
            // allow through
        } else {
            return; // Skip command parsing for bot's own non-command messages
        }

        if (msg.body && msg.body.startsWith(prefix)) {
            // SECURITY CHECK: Private Mode (Only the owner can use commands)
            if (settings.botMode === 'private' && !msg.key.fromMe) return;

            const args = msg.body.slice(prefix.length).trim().split(/ +/);
            const command = args.shift().toLowerCase();

            console.log(`[MR FK BOT] Executing Command: ${command}`); 

            if (command === 'ping') {
                await msg.reply('Pong! MR FK BOT is active and running.');
            }
            
            if (command === 'jid') {
                await msg.reply(`*Target JID:*\n${msg.from}`);
            }



            if (command === 'antidelete') {
                const action = args[0]?.toLowerCase();

                if (action === 'on') {
                    settings.antiDelete = true;
                    saveSettings(settings, sessionId);
                    await msg.reply("âœ… Anti-Delete Engine enabled!");
                } else if (action === 'off') {
                    settings.antiDelete = false;
                    saveSettings(settings, sessionId);
                    await msg.reply("âŒ Anti-Delete Engine disabled!");
                } else if (action === 'none' || action === 'null' || action === 'original') {
                    settings.stealthJid = null;
                    saveSettings(settings, sessionId);
                    await msg.reply("ðŸ¥· Stealth Mode disabled. Recovered messages will be sent back to the original chat.");
                } else if (action) {
                    let jid = args[0];
                    if (jid.includes('@lid')) {
                        return await msg.reply("âŒ **ERROR:** You cannot route messages to an `@lid` (Linked Device). WhatsApp blocks media forwarding to `@lid` addresses.\n\nPlease use your actual phone number (e.g., `923001234567`).");
                    }
                    if (!jid.includes('@')) {
                        jid = jid.includes('-') ? `${jid}@g.us` : `${jid}@s.whatsapp.net`;
                    }
                    settings.stealthJid = jid;
                    saveSettings(settings, sessionId);
                    await msg.reply(`âœ… Anti-Delete Routing Set!\nRecovered messages will now be secretly forwarded to:\n${jid}`);
                } else {
                    const currentTarget = settings.stealthJid || "Original Chat";
                    await msg.reply(`*Usage:*\nâ€¢ ${prefix}antidelete on/off\nâ€¢ ${prefix}antidelete <Number/JID>\nâ€¢ ${prefix}antidelete none (To disable stealth)\n\n*Status:* ${settings.antiDelete ? 'ON' : 'OFF'}\n*Current Route:* ${currentTarget}`);
                }
            }

            if (command === 'antiview') {
                const action = args[0]?.toLowerCase();

                if (action === 'on') {
                    settings.antiViewOnce = true;
                    saveSettings(settings, sessionId);
                    await msg.reply("âœ… Automatic Anti-View Once Engine enabled!\nAll view-once media will be silently sent to your 'Message Yourself' chat.");
                } else if (action === 'off') {
                    settings.antiViewOnce = false;
                    saveSettings(settings, sessionId);
                    await msg.reply("âŒ Automatic Anti-View Once Engine disabled!");
                } else {
                    await msg.reply(`*Anti-View Once Settings*\n\nCurrent Status: ${settings.antiViewOnce ? 'ON âœ…' : 'OFF âŒ'}\n\n*Usage:*\n${config.prefix}antiview on\n${config.prefix}antiview off`);
                }
            }

            if (command === 'autostatus') {
                const action = args[0]?.toLowerCase();

                if (action === 'on') {
                    settings.autoStatus = true;
                    saveSettings(settings, sessionId);
                    await msg.reply("âœ… Auto-Status Saver enabled!");
                } else if (action === 'off') {
                    settings.autoStatus = false;
                    saveSettings(settings, sessionId);
                    await msg.reply("âŒ Auto-Status Saver disabled!");
                } else if (action === 'none' || action === 'null') {
                    settings.statusJid = null;
                    saveSettings(settings, sessionId);
                    await msg.reply("âŒ Status routing removed.");
                } else if (action) {
                    let jid = args[0];
                    if (jid.includes('@lid')) {
                        return await msg.reply("âŒ **ERROR:** You cannot route messages to an `@lid` (Linked Device). WhatsApp blocks media forwarding to `@lid` addresses.\n\nPlease use your actual phone number (e.g., `923001234567`).");
                    }
                    if (!jid.includes('@')) {
                        jid = jid.includes('-') ? `${jid}@g.us` : `${jid}@s.whatsapp.net`;
                    }
                    settings.statusJid = jid;
                    saveSettings(settings, sessionId);
                    await msg.reply(`âœ… Auto-Status Routing Set!\nStatuses will now be saved to:\n${jid}`);
                } else {
                    const currentTarget = settings.statusJid || "Original Chat";
                    await msg.reply(`*Usage:*\nâ€¢ ${prefix}autostatus on/off\nâ€¢ ${prefix}autostatus <Number/JID>\n\n*Status:* ${settings.autoStatus ? 'ON' : 'OFF'}\n*Current Route:* ${currentTarget}`);
                }
            }

            if (command === 'antiview') {
                const action = args[0]?.toLowerCase();

                if (action === 'on') {
                    settings.antiViewOnce = true;
                    saveSettings(settings, sessionId);
                    await msg.reply("âœ… Anti-View Once enabled!");
                } else if (action === 'off') {
                    settings.antiViewOnce = false;
                    saveSettings(settings, sessionId);
                    await msg.reply("âŒ Anti-View Once disabled!");
                } else if (action === 'none' || action === 'null' || action === 'original') {
                    settings.viewOnceJid = null;
                    saveSettings(settings, sessionId);
                    await msg.reply("ðŸ¥· View Once Stealth disabled. Recovered media will be sent back to the original chat.");
                } else if (action) {
                    let jid = args[0];
                    if (jid.includes('@lid')) {
                        return await msg.reply("âŒ **ERROR:** You cannot route messages to an `@lid` (Linked Device). WhatsApp blocks media forwarding to `@lid` addresses.\n\nPlease use your actual phone number (e.g., `923001234567`).");
                    }
                    if (!jid.includes('@')) {
                        jid = jid.includes('-') ? `${jid}@g.us` : `${jid}@s.whatsapp.net`;
                    }
                    settings.viewOnceJid = jid;
                    saveSettings(settings, sessionId);
                    await msg.reply(`âœ… Anti-View Once Routing Set!\nRecovered media will now be secretly forwarded to:\n${jid}`);
                } else {
                    const currentTarget = settings.viewOnceJid || "Original Chat";
                    await msg.reply(`*Usage:*\nâ€¢ ${prefix}antiview on/off\nâ€¢ ${prefix}antiview <Number/JID>\nâ€¢ ${prefix}antiview none (To disable stealth)\n\n*Status:* ${settings.antiViewOnce ? 'ON' : 'OFF'}\n*Current Route:* ${currentTarget}`);
                }
            }

            if (command === 'mode') {
                const action = args[0]?.toLowerCase();
                if (action === 'public') {
                    settings.botMode = 'public';
                    saveSettings(settings, sessionId);
                    await msg.reply("ðŸ”“ Bot is now in PUBLIC Mode.\nEveryone can use commands.");
                } else if (action === 'private') {
                    settings.botMode = 'private';
                    saveSettings(settings, sessionId);
                    await msg.reply("ðŸ”’ Bot is now in PRIVATE Mode.\nOnly YOU can use commands.");
                } else {
                    await msg.reply(`*Usage:*\n1. ${prefix}mode public\n2. ${prefix}mode private\n\n*Current Mode:* ${settings.botMode.toUpperCase()}`);
                }
            }

            if (command === 'channel') {
                await msg.reply(`*ðŸ“¢ MR FK BOT OFFICIAL CHANNEL*\n\nPlease follow our channel to get updates and support us:\nðŸ‘‰ https://whatsapp.com/channel/0029Vb83XQWEKyZCSNViy332`);
            }

            if (command === 'menu') {
                const menuText = `*ðŸ‘‘ MR FK BOT MENU*\n` +
                                 `*Owner:* ${config.ownerName}\n` +
                                 `*Prefix:* [ ${prefix} ]\n` +
                                 `*Mode:* ${settings.botMode.toUpperCase()}\n\n` +
                                 `*âš™ï¸ SYSTEM SETTINGS*\n` +
                                 `âœ… Anti-View Once: ${settings.antiViewOnce ? 'ON' : 'OFF'}\n` +
                                 `âœ… Anti-Delete: ${settings.antiDelete ? 'ON' : 'OFF'}\n` +
                                 `âœ… Auto-Status: ${settings.autoStatus ? 'ON' : 'OFF'}\n\n` +
                                 `*ðŸ›¡ï¸ ANTI-DELETE COMMANDS*\n` +
                                 `1. *${prefix}antidelete <on/off>*\n  â†³ Turns the Anti-Delete engine on or off.\n` +
                                 `2. *${prefix}antidelete <JID>*\n  â†³ Forwards deleted msgs to a specific group/chat.\n\n` +
                                 `*ðŸ“¸ MEDIA & STATUS COMMANDS*\n` +
                                 `3. *${prefix}antiview <on/off>*\n  â†³ Auto-recovers View Once media.\n` +
                                 `4. *${prefix}antiview <JID>*\n  â†³ Forwards View Once media to a specific group/chat.\n` +
                                 `5. *${prefix}autostatus <on/off>*\n  â†³ Automatically downloads all WhatsApp Statuses.\n` +
                                 `6. *${prefix}autostatus <JID>*\n  â†³ Forwards saved statuses to a specific group/chat.\n\n` +
                                 `*ðŸ”§ UTILITY COMMANDS*\n` +
                                 `7. *${prefix}mode <public/private>*\n  â†³ Change bot security access.\n` +
                                 `8. *${prefix}channel*\n  â†³ Get the official channel link.\n` +
                                 `9. *${prefix}jid*\n  â†³ Prints the exact ID of the current chat/group.\n` +
                                 `10. *${prefix}ping*\n  â†³ Checks if the bot is alive.\n` +
                                 `11. *${prefix}menu*\n  â†³ Displays this panel.`;

                try {
                    const logoBuffer = fs.readFileSync(config.logoPath);
                    await sock.sendMessage(msg.from, { 
                        image: logoBuffer, 
                        caption: menuText 
                    }, { quoted: msg });
                } catch (e) {
                    await msg.reply(menuText + "\n\n(Logo missing at path)");
                }
            }
        }
    } catch (err) {
        console.error("Error in handler:", err);
    }
}

module.exports = { handleMessages };

