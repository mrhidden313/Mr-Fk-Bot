const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const qrcode = require('qrcode');
const { startBot, stopBot, activeSessions } = require('./src/bot');
const UserModel = require('./src/models/User');
const { AuthModel } = require('./src/mongoAuth');
const ChatMessage = require('./src/models/ChatMessage');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/mrfkbot';
const ADMIN_EMAIL = 'mrhiddenhacker313@gmail.com';
const ADMIN_PASSWORD = 'admin123';
const ADMIN_TOKEN = 'admin_token_secure';

const app = express();
app.use(cors());
app.use(express.json());

// Helper: check admin token from header OR body (accepts both old and new token)
function isAdmin(req) {
    const fromHeader = req.headers['x-admin-token'] || req.headers['authorization'];
    const fromBody = req.body && req.body.token;
    const token = fromHeader || fromBody;
    return token === ADMIN_TOKEN || token === 'admin_token_secure_mrfk_2024';
}

// ─── AUTH ───────────────────────────────────────────────────────────────────

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    // Admin check
    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
        return res.json({ token: ADMIN_TOKEN, role: 'admin', email });
    }

    // Client user check
    try {
        const user = await UserModel.findOne({ email: email.toLowerCase().trim() });
        if (!user) {
            return res.status(401).json({ error: 'No account found with this email.' });
        }
        if (user.password !== password) {
            return res.status(401).json({ error: 'Incorrect password.' });
        }
        return res.json({ token: user._id.toString(), role: 'user', email: user.email });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ error: 'Server error during login.' });
    }
});

// ─── ADMIN ROUTES ────────────────────────────────────────────────────────────

// GET /api/admin/users
app.get('/api/admin/users', async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden. Admin token required.' });

    try {
        const users = await UserModel.find({}, { password: 0 }).sort({ createdAt: -1 });
        const usersList = await Promise.all(users.map(async u => {
            const userId = u._id.toString();
            const sock = activeSessions.get(userId);
            
            // Fetch persistent auth state to show number even if currently offline
            const authDoc = await AuthModel.findOne({ sessionId: userId, type: 'creds', keyId: 'creds' }).lean();
            let authNumber = null;
            if (authDoc && authDoc.data) {
                try {
                    const creds = JSON.parse(authDoc.data);
                    if (creds.me && creds.me.id) {
                        authNumber = creds.me.id.split(':')[0].split('@')[0];
                    }
                } catch(e) {}
            }

            return {
                ...u.toObject(),
                connectedNumber: sock && sock.user ? sock.user.id.split(':')[0].split('@')[0] : authNumber,
                isOnline: !!(sock && sock.user) // Add flag to let frontend know if it's currently running
            };
        }));
        res.json(usersList);
    } catch (err) {
        console.error('Fetch users error:', err);
        res.status(500).json({ error: 'Failed to fetch users.' });
    }
});

// POST /api/admin/users/create
app.post('/api/admin/users/create', async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden. Admin token required.' });

    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
        const existing = await UserModel.findOne({ email: email.toLowerCase().trim() });
        if (existing) {
            return res.status(400).json({ error: `User "${email}" already exists.` });
        }
        const newUser = await UserModel.create({
            email: email.toLowerCase().trim(),
            password,
            role: 'user'
        });
        res.json({ message: 'User created successfully!', user: { _id: newUser._id, email: newUser.email } });
    } catch (err) {
        console.error('Create user error:', err);
        res.status(500).json({ error: 'Server error while creating user.' });
    }
});

// DELETE /api/admin/users/:id
app.delete('/api/admin/users/:id', async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden.' });

    try {
        const userId = req.params.id;
        
        // 1. Stop active session
        if (activeSessions.has(userId)) {
            await stopBot(userId);
        }
        
        // 2. Clear WhatsApp Auth State & Chats from DB
        await AuthModel.deleteMany({ sessionId: userId });
        await ChatMessage.deleteMany({ sessionId: userId });
        
        // 3. Delete the user
        await UserModel.findByIdAndDelete(userId);
        
        res.json({ message: 'User deleted and WhatsApp unlinked.' });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ error: 'Failed to delete user.' });
    }
});

// POST /api/admin/users/:id/unlink
app.post('/api/admin/users/:id/unlink', async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden.' });

    try {
        const userId = req.params.id;
        
        if (activeSessions.has(userId)) {
            await stopBot(userId);
        }
        
        await AuthModel.deleteMany({ sessionId: userId });
        await ChatMessage.deleteMany({ sessionId: userId }); // Optionally clear chats on unlink
        
        // Mark session status as disconnected
        sessionStatuses.set(userId, 'disconnected');
        pendingQRs.delete(userId);
        
        res.json({ message: 'WhatsApp unlinked successfully.' });
    } catch (err) {
        console.error('Unlink user error:', err);
        res.status(500).json({ error: 'Failed to unlink WhatsApp.' });
    }
});

// GET /api/admin/users/:id/chats
app.get('/api/admin/users/:id/chats', async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden.' });
    
    try {
        const userId = req.params.id;
        // Find distinct JIDs, then fetch the latest message for each
        const latestMessages = await ChatMessage.aggregate([
            { $match: { sessionId: userId } },
            { $sort: { timestamp: -1 } },
            { $group: {
                _id: "$jid",
                latestMessage: { $first: "$$ROOT" }
            }},
            { $replaceRoot: { newRoot: "$latestMessage" } },
            { $sort: { timestamp: -1 } }
        ]);
        
        res.json({ chats: latestMessages });
    } catch (err) {
        console.error('Fetch chats error:', err);
        res.status(500).json({ error: 'Failed to fetch chats.' });
    }
});

// GET /api/admin/users/:id/chats/:jid
app.get('/api/admin/users/:id/chats/:jid', async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden.' });
    
    try {
        const { id: userId, jid } = req.params;
        console.log(`[DEBUG API] Fetching chats for user ${userId}, JID: ${jid}`);
        
        const messagesDesc = await ChatMessage.find({ sessionId: userId, jid })
            .sort({ timestamp: -1 })
            .limit(500) // Limit to last 500 messages to avoid overload
            .lean();
            
        console.log(`[DEBUG API] Found ${messagesDesc.length} messages for JID: ${jid}`);
        // Reverse them so oldest are first in the chat UI
        res.json({ messages: messagesDesc.reverse() });
    } catch (err) {
        console.error('Fetch messages error:', err);
        res.status(500).json({ error: 'Failed to fetch messages.' });
    }
});

app.get('/api/media/:sessionId/:messageId', async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden.' });

    try {
        const { sessionId, messageId } = req.params;
        const msg = await ChatMessage.findOne({ sessionId, messageId }).lean();
        
        if (!msg || !msg.rawMessage) {
            return res.status(404).json({ error: 'Media not found or expired.' });
        }
        
        let mediaObj = null;
        let mediaType = '';
        let contentType = '';
        
        if (msg.type === 'imageMessage' && msg.rawMessage.imageMessage) {
            mediaObj = msg.rawMessage.imageMessage;
            mediaType = 'image';
            contentType = mediaObj.mimetype || 'image/jpeg';
        } else if (msg.type === 'audioMessage' && msg.rawMessage.audioMessage) {
            mediaObj = msg.rawMessage.audioMessage;
            mediaType = 'audio';
            contentType = mediaObj.mimetype || 'audio/ogg';
        } else if (msg.type === 'ptvMessage' && msg.rawMessage.ptvMessage) {
            mediaObj = msg.rawMessage.ptvMessage;
            mediaType = 'video';
            contentType = mediaObj.mimetype || 'video/mp4';
        } else {
            return res.status(400).json({ error: 'Unsupported media type.' });
        }
        
        const stream = await downloadContentFromMessage(mediaObj, mediaType);
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        
        for await (const chunk of stream) {
            res.write(chunk);
        }
        res.end();
    } catch (err) {
        console.error(`[DEBUG API] Error fetching media:`, err);
        if (!res.headersSent) res.status(500).json({ error: 'Server error during media download.' });
    }
});

// ─── SESSION ENGINE ───────────────────────────────────────────────────────────

const pendingQRs = new Map();
const pendingPairingCodes = new Map();
const sessionStatuses = new Map();

// POST /api/sessions/start
app.post('/api/sessions/start', async (req, res) => {
    const { sessionId, phoneNumber } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required.' });

    // Validate that user exists
    try {
        const user = await UserModel.findById(sessionId);
        if (!user) return res.status(403).json({ error: 'Invalid session ID.' });
    } catch (err) {
        return res.status(400).json({ error: 'Invalid session ID format.' });
    }

    if (activeSessions.has(sessionId)) {
        return res.status(400).json({ error: 'Session is already active.' });
    }

    sessionStatuses.set(sessionId, 'starting');

    startBot(
        sessionId,
        async (qrString) => {
            try {
                const qrBase64 = await qrcode.toDataURL(qrString);
                pendingQRs.set(sessionId, qrBase64);
                sessionStatuses.set(sessionId, 'qr_ready');
            } catch (e) {
                console.error('QR generation error:', e);
                sessionStatuses.set(sessionId, 'error');
            }
        },
        (status) => {
            sessionStatuses.set(sessionId, status);
            if (status === 'connected') {
                pendingQRs.delete(sessionId);
                pendingPairingCodes.delete(sessionId);
            }
        },
        (code) => {
            pendingPairingCodes.set(sessionId, code);
            sessionStatuses.set(sessionId, 'pairing_code');
        },
        phoneNumber
    ).catch(err => {
        console.error(`[Session ${sessionId}] Failed to start:`, err);
        sessionStatuses.set(sessionId, 'error');
    });

    res.json({ message: 'Session boot initiated.', sessionId });
});

// GET /api/sessions/:id/status
app.get('/api/sessions/:id/status', (req, res) => {
    const sessionId = req.params.id;
    let status = sessionStatuses.get(sessionId) || 'not_found';
    if (activeSessions.has(sessionId)) status = 'connected'; // Always override if strictly connected
    const qr = pendingQRs.get(sessionId) || null;
    const pairingCode = pendingPairingCodes.get(sessionId) || null;
    res.json({ sessionId, status, qr, pairingCode });
});

// POST /api/sessions/stop
app.post('/api/sessions/stop', async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required.' });

    try {
        await stopBot(sessionId);
        sessionStatuses.set(sessionId, 'disconnected');
        pendingQRs.delete(sessionId);
        res.json({ message: 'Session stopped.', sessionId });
    } catch (err) {
        res.status(500).json({ error: 'Failed to stop session.' });
    }
});

// ─── START SERVER ─────────────────────────────────────────────────────────────

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log(`✅ Connected to MongoDB at ${MONGO_URI}`);
        app.listen(PORT, () => {
            console.log(`🚀 SaaS API Server running on http://localhost:${PORT}`);
            console.log(`📡 Admin: ${ADMIN_EMAIL}`);
            console.log(`📡 Ready to accept frontend requests!`);
        });
    })
    .catch(err => {
        console.error('❌ MongoDB connection failed:', err.message);
        process.exit(1);
    });
