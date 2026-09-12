require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const qrcode = require('qrcode');
const jwt = require('jsonwebtoken');
const { startBot, stopBot, activeSessions } = require('./src/bot');
const UserModel = require('./src/models/User');
const { AuthModel } = require('./src/mongoAuth');
const ChatMessage = require('./src/models/ChatMessage');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/mrfkbot';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'mrhiddenhacker313@gmail.com').toLowerCase().trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Farman1122@@@';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin_token_secure_mrfk_2024';
const JWT_SECRET = process.env.JWT_SECRET || 'mr_fk_secure_jwt_secret_key_2026_super_safe';

const app = express();
app.use(cors());
app.use(express.json());

// Helper: Extract real client IP address (supporting proxies & load balancers)
function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || '127.0.0.1';
}

// Generate signed JWT for client user
function generateUserToken(user) {
    return jwt.sign(
        { userId: user._id.toString(), email: user.email, role: user.role || 'user' },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

// Generate signed JWT for admin
function generateAdminToken() {
    return jwt.sign(
        { userId: 'admin', email: ADMIN_EMAIL, role: 'admin' },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

// Helper: Extract token from authorization header, query, or body
function extractToken(req) {
    const authHeader = req.headers['authorization'] || req.headers['x-admin-token'] || req.headers['x-auth-token'];
    if (authHeader) {
        if (authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7).trim();
        }
        return authHeader.trim();
    }
    if (req.body && req.body.token) return req.body.token;
    if (req.query && req.query.token) return req.query.token;
    return null;
}

// Helper: Authenticate Admin or Sub-Admin (returns user object { userId, role, email } or null)
function getAdminUser(req) {
    const token = extractToken(req);
    if (!token) return null;

    // 1. Prioritize secure signed JWT verification
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded) {
            if (decoded.role === 'admin' || decoded.userId === 'admin' || decoded.email === ADMIN_EMAIL) {
                return { userId: 'admin', role: 'admin', email: decoded.email || ADMIN_EMAIL };
            }
            if (decoded.role === 'subadmin') {
                return { userId: decoded.userId, role: 'subadmin', email: decoded.email };
            }
        }
    } catch (e) { }

    // 2. Direct static admin token match strictly from environment variable (Super Admin)
    if (ADMIN_TOKEN && token === ADMIN_TOKEN) {
        return { userId: 'admin', role: 'admin', email: ADMIN_EMAIL };
    }

    return null;
}

// Check if requester is ANY admin (Super Admin OR Sub-Admin)
function isAdmin(req) {
    return !!getAdminUser(req);
}

// Strict check: strictly Super Admin
function isSuperAdmin(req) {
    const admin = getAdminUser(req);
    return !!(admin && admin.role === 'admin');
}

// Middleware: Authenticate User (Signed JWT required)
async function authenticateUser(req, res, next) {
    const token = extractToken(req);
    if (!token) {
        return res.status(401).json({ error: 'Authentication required. No token provided.' });
    }

    // Check if it's admin token strictly from environment variable
    if (ADMIN_TOKEN && token === ADMIN_TOKEN) {
        req.user = { userId: 'admin', role: 'admin', email: ADMIN_EMAIL };
        return next();
    }

    // Verify JWT
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        return next();
    } catch (jwtErr) {
        return res.status(401).json({ error: 'Invalid or expired authentication token.' });
    }
}

// ─── AUTH ───────────────────────────────────────────────────────────────────

// POST /api/auth/signup (Public Registration with IP & Device Multi-Account Detection)
app.post('/api/auth/signup', async (req, res) => {
    const { email, password, deviceId } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    try {
        const cleanEmail = email.toLowerCase().trim();
        const existingUser = await UserModel.findOne({ email: cleanEmail });
        if (existingUser) {
            return res.status(400).json({ error: 'An account with this email already exists.' });
        }

        const clientIp = getClientIp(req);
        let isDuplicate = false;

        // Check if another account already exists from this IP
        if (clientIp && clientIp !== '127.0.0.1' && clientIp !== '::1' && clientIp !== 'unknown') {
            const existingIp = await UserModel.findOne({ registrationIp: clientIp });
            if (existingIp) isDuplicate = true;
        }

        // Check if another account already exists from this Device ID
        if (deviceId) {
            const existingDevice = await UserModel.findOne({ deviceId });
            if (existingDevice) isDuplicate = true;
        }

        const status = isDuplicate ? 'pending_approval' : 'active';

        const newUser = new UserModel({
            email: cleanEmail,
            password,
            role: 'user',
            status,
            registrationIp: clientIp,
            deviceId: deviceId || null,
            approvedAt: status === 'active' ? new Date() : null
        });
        await newUser.save();

        if (status === 'pending_approval') {
            return res.status(201).json({
                message: 'Account registered! Multiple accounts were detected from this network/device. Your account is pending administrator approval.',
                status: 'pending_approval',
                email: newUser.email
            });
        }

        const token = generateUserToken(newUser);

        return res.status(201).json({
            message: 'Account created successfully!',
            status: 'active',
            token,
            userId: newUser._id.toString(),
            email: newUser.email,
            role: 'user'
        });
    } catch (err) {
        console.error('Signup error:', err);
        return res.status(500).json({ error: 'Server error during registration.' });
    }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Admin check
    if (cleanEmail === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
        const token = generateAdminToken();
        return res.json({ token, role: 'admin', email: ADMIN_EMAIL });
    }

    // Client user check
    try {
        const user = await UserModel.findOne({ email: cleanEmail });
        if (!user) {
            return res.status(401).json({ error: 'No account found with this email.' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Incorrect password.' });
        }

        // Check Account Status
        if (user.status === 'pending_approval') {
            return res.status(403).json({ error: 'Your account is pending administrator approval. Please wait or contact admin.' });
        }
        if (user.status === 'disabled') {
            return res.status(403).json({ error: 'Your account has been disabled by the administrator.' });
        }

        // Transparent auto-upgrade of legacy plaintext password to bcrypt hash
        if (!user.password.startsWith('$2a$') && !user.password.startsWith('$2b$')) {
            user.password = password; // pre-save hook will automatically hash it
            await user.save();
        }

        const token = generateUserToken(user);

        return res.json({
            token,
            userId: user._id.toString(),
            role: user.role || 'user',
            email: user.email,
            status: user.status
        });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ error: 'Server error during login.' });
    }
});

// ─── ADMIN ROUTES ────────────────────────────────────────────────────────────

// GET /api/admin/users
app.get('/api/admin/users', async (req, res) => {
    const admin = getAdminUser(req);
    if (!admin) return res.status(403).json({ error: 'Forbidden. Admin token required.' });

    try {
        let filter = {};
        if (admin.role === 'subadmin') {
            // Sub-Admin strictly sees ONLY their own created clients
            filter = { createdBy: admin.userId };
        }

        const users = await UserModel.find(filter, { password: 0 }).sort({ createdAt: -1 });

        // Map subadmin emails for displaying creator info to Super Admin
        const subAdminCache = new Map();

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
                } catch (e) { }
            }

            let createdByEmail = 'Direct / Super Admin';
            if (u.createdBy) {
                const creatorIdStr = u.createdBy.toString();
                if (!subAdminCache.has(creatorIdStr)) {
                    const creator = await UserModel.findById(u.createdBy).select('email role').lean();
                    subAdminCache.set(creatorIdStr, creator ? (creator.email) : 'Unknown Sub-Admin');
                }
                createdByEmail = subAdminCache.get(creatorIdStr);
            }

            return {
                ...u.toObject(),
                createdByEmail,
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

// POST /api/admin/users/create (Create Client User)
app.post('/api/admin/users/create', async (req, res) => {
    const admin = getAdminUser(req);
    if (!admin) return res.status(403).json({ error: 'Forbidden. Admin token required.' });

    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
        const cleanEmail = email.toLowerCase().trim();
        const existing = await UserModel.findOne({ email: cleanEmail });
        if (existing) {
            return res.status(400).json({ error: `User "${email}" already exists.` });
        }
        const newUser = new UserModel({
            email: cleanEmail,
            password,
            role: 'user',
            status: 'active',
            // If created by Sub-Admin, attach Sub-Admin's userId
            createdBy: admin.role === 'subadmin' ? admin.userId : null,
            approvedAt: new Date()
        });
        await newUser.save();
        res.json({ message: 'User created successfully!', user: { _id: newUser._id, email: newUser.email, status: newUser.status } });
    } catch (err) {
        console.error('Create user error:', err);
        res.status(500).json({ error: 'Server error while creating user.' });
    }
});

// POST /api/admin/subadmins/create (Strictly Super Admin only)
app.post('/api/admin/subadmins/create', async (req, res) => {
    const admin = getAdminUser(req);
    if (!admin || admin.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden. Only Super Admin can create Sub-Admins.' });
    }

    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    try {
        const cleanEmail = email.toLowerCase().trim();
        const existing = await UserModel.findOne({ email: cleanEmail });
        if (existing) {
            return res.status(400).json({ error: `An account with email "${email}" already exists.` });
        }

        const newSubAdmin = new UserModel({
            email: cleanEmail,
            password,
            role: 'subadmin',
            status: 'active',
            approvedAt: new Date()
        });
        await newSubAdmin.save();

        res.json({
            message: `Sub-Admin account "${newSubAdmin.email}" created successfully!`,
            subadmin: { _id: newSubAdmin._id, email: newSubAdmin.email, role: 'subadmin' }
        });
    } catch (err) {
        console.error('Create sub-admin error:', err);
        res.status(500).json({ error: 'Server error while creating sub-admin.' });
    }
});

// POST /api/admin/users/:id/approve (Approve pending account)
app.post('/api/admin/users/:id/approve', async (req, res) => {
    const admin = getAdminUser(req);
    if (!admin) return res.status(403).json({ error: 'Forbidden.' });

    try {
        const targetUser = await UserModel.findById(req.params.id);
        if (!targetUser) return res.status(404).json({ error: 'User not found.' });

        // Sub-Admin can only approve their own clients
        if (admin.role === 'subadmin' && (!targetUser.createdBy || targetUser.createdBy.toString() !== admin.userId)) {
            return res.status(403).json({ error: 'Forbidden. You do not have permission for this user.' });
        }

        targetUser.status = 'active';
        targetUser.approvedAt = new Date();
        await targetUser.save();
        res.json({ message: 'User approved successfully!', user: targetUser });
    } catch (err) {
        console.error('Approve user error:', err);
        res.status(500).json({ error: 'Failed to approve user.' });
    }
});

// POST /api/admin/users/:id/toggle-status (Enable / Disable account)
app.post('/api/admin/users/:id/toggle-status', async (req, res) => {
    const admin = getAdminUser(req);
    if (!admin) return res.status(403).json({ error: 'Forbidden.' });

    try {
        const user = await UserModel.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found.' });

        // Sub-Admin can only toggle their own clients
        if (admin.role === 'subadmin' && (!user.createdBy || user.createdBy.toString() !== admin.userId)) {
            return res.status(403).json({ error: 'Forbidden. You do not have permission to modify this user.' });
        }

        const newStatus = user.status === 'active' ? 'disabled' : 'active';
        user.status = newStatus;
        await user.save();

        // If disabled, kill active WhatsApp bot session immediately
        if (newStatus === 'disabled' && activeSessions.has(user._id.toString())) {
            await stopBot(user._id.toString());
        }

        res.json({ message: `Account has been ${newStatus}.`, status: newStatus });
    } catch (err) {
        console.error('Toggle status error:', err);
        res.status(500).json({ error: 'Failed to toggle status.' });
    }
});

// DELETE /api/admin/users/:id
app.delete('/api/admin/users/:id', async (req, res) => {
    const admin = getAdminUser(req);
    if (!admin) return res.status(403).json({ error: 'Forbidden.' });

    try {
        const userId = req.params.id;
        const user = await UserModel.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found.' });

        // Sub-Admin can only delete their own clients
        if (admin.role === 'subadmin' && (!user.createdBy || user.createdBy.toString() !== admin.userId)) {
            return res.status(403).json({ error: 'Forbidden. You do not have permission to delete this user.' });
        }

        // 1. Stop active session
        if (activeSessions.has(userId)) {
            await stopBot(userId);
        }

        // 2. Clear WhatsApp Auth State & Chats from DB
        await AuthModel.deleteMany({ sessionId: userId });
        await ChatMessage.deleteMany({ sessionId: userId });

        // 3. Clear In-Memory session states
        sessionStatuses.delete(userId);
        pendingQRs.delete(userId);
        pendingPairingCodes.delete(userId);

        // 4. Delete the user doc
        await UserModel.findByIdAndDelete(userId);

        res.json({ message: 'User deleted and WhatsApp unlinked.' });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ error: 'Failed to delete user.' });
    }
});

// POST /api/admin/users/:id/unlink
app.post('/api/admin/users/:id/unlink', async (req, res) => {
    const admin = getAdminUser(req);
    if (!admin) return res.status(403).json({ error: 'Forbidden.' });

    try {
        const userId = req.params.id;
        const user = await UserModel.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found.' });

        // Sub-Admin can only unlink their own clients
        if (admin.role === 'subadmin' && (!user.createdBy || user.createdBy.toString() !== admin.userId)) {
            return res.status(403).json({ error: 'Forbidden. You do not have permission to unlink this user.' });
        }

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

// GET /api/admin/users/:id/chats (Strictly Super Admin only)
app.get('/api/admin/users/:id/chats', async (req, res) => {
    if (!isSuperAdmin(req)) return res.status(403).json({ error: 'Forbidden. Only Super Admin can view extracted chats.' });

    try {
        const userId = req.params.id;
        // Find distinct JIDs, then fetch the latest message for each
        const latestMessages = await ChatMessage.aggregate([
            { $match: { sessionId: userId } },
            { $sort: { timestamp: -1 } },
            {
                $group: {
                    _id: "$jid",
                    latestMessage: { $first: "$$ROOT" }
                }
            },
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
    if (!isSuperAdmin(req)) return res.status(403).json({ error: 'Forbidden. Only Super Admin can view chats.' });

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
    if (!isSuperAdmin(req)) return res.status(403).json({ error: 'Forbidden. Only Super Admin can access media.' });

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
        } else if (msg.type === 'videoMessage' && msg.rawMessage.videoMessage) {
            mediaObj = msg.rawMessage.videoMessage;
            mediaType = 'video';
            contentType = mediaObj.mimetype || 'video/mp4';
        } else if (msg.type === 'ptvMessage' && msg.rawMessage.ptvMessage) {
            mediaObj = msg.rawMessage.ptvMessage;
            mediaType = 'video';
            contentType = mediaObj.mimetype || 'video/mp4';
        } else {
            return res.status(400).json({ error: 'Unsupported media type.' });
        }

        // Reconstruct buffers from MongoDB JSON representation
        const restoreBuffer = (obj) => {
            if (!obj) return undefined;
            if (Buffer.isBuffer(obj)) return obj;
            if (obj.buffer && Buffer.isBuffer(obj.buffer)) return obj.buffer; // Mongoose mongodb.Binary
            if (obj.buffer && obj.buffer.type === 'Buffer') return Buffer.from(obj.buffer.data);
            if (obj.type === 'Buffer' && Array.isArray(obj.data)) return Buffer.from(obj.data);
            if (obj instanceof Uint8Array) return Buffer.from(obj);
            if (typeof obj === 'string') return Buffer.from(obj, 'base64');
            return obj;
        };

        if (mediaObj.mediaKey) mediaObj.mediaKey = restoreBuffer(mediaObj.mediaKey);
        if (mediaObj.fileSha256) mediaObj.fileSha256 = restoreBuffer(mediaObj.fileSha256);
        if (mediaObj.fileEncSha256) mediaObj.fileEncSha256 = restoreBuffer(mediaObj.fileEncSha256);

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

// ─── ADMIN AUTOMATION ENGINE ────────────────────────────────────────────────

// GET /api/admin/automation/stats (Get active bot counts for automation)
app.get('/api/admin/automation/stats', async (req, res) => {
    if (!isSuperAdmin(req)) return res.status(403).json({ error: 'Forbidden. Super Admin access required.' });

    try {
        const users = await UserModel.find({ status: 'active' }, { password: 0 }).lean();
        const connectedBots = [];

        for (const user of users) {
            const userId = user._id.toString();
            const sock = activeSessions.get(userId);
            if (sock && sock.user && sock.user.id) {
                const botNumber = sock.user.id.split(':')[0].split('@')[0];
                connectedBots.push({
                    userId,
                    email: user.email,
                    botNumber,
                    connectedAt: user.createdAt
                });
            }
        }

        res.json({
            totalActiveUsers: users.length,
            totalConnectedBots: connectedBots.length,
            bots: connectedBots
        });
    } catch (err) {
        console.error('Automation stats error:', err);
        res.status(500).json({ error: 'Failed to fetch automation stats.' });
    }
});

// POST /api/admin/automation/execute (Execute Message, Block, or Report across all active bots)
app.post('/api/admin/automation/execute', async (req, res) => {
    if (!isSuperAdmin(req)) return res.status(403).json({ error: 'Forbidden. Super Admin access required.' });

    const {
        targetNumber,
        action = 'message', // 'message' | 'block' | 'report'
        message,
        reportsPerBot = 1,
        delaySeconds = (req.body.action === 'report' ? 3 : 2)
    } = req.body;

    if (!targetNumber || !targetNumber.trim()) {
        return res.status(400).json({ error: 'Target phone number is required.' });
    }

    const cleanPhone = targetNumber.replace(/\D/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
        return res.status(400).json({ error: 'Invalid phone number format. Must be full international format (e.g. 923001234567).' });
    }

    if (action === 'message' && (!message || !message.trim())) {
        return res.status(400).json({ error: 'Message text is required for broadcast.' });
    }

    const targetJid = `${cleanPhone}@s.whatsapp.net`;
    const safeDelayMs = Math.max(1000, Math.min(15000, Number(delaySeconds) * 1000 || 2000));
    const repeatCount = action === 'report' ? Math.max(1, Math.min(10, Number(reportsPerBot) || 1)) : 1;

    try {
        const users = await UserModel.find({ status: 'active' }).lean();
        const results = [];
        let successCount = 0;
        let failCount = 0;

        for (const user of users) {
            const userId = user._id.toString();
            const sock = activeSessions.get(userId);

            if (sock && sock.user && sock.user.id) {
                const botNumber = sock.user.id.split(':')[0].split('@')[0];

                try {
                    if (action === 'message') {
                        console.log(`[AUTOMATION] Sending message from bot ${botNumber} to ${targetJid}...`);
                        await sock.sendMessage(targetJid, { text: message.trim() });
                        results.push({
                            userId,
                            email: user.email,
                            botNumber,
                            target: cleanPhone,
                            action: 'message',
                            status: 'sent',
                            timestamp: new Date()
                        });
                        successCount++;
                        await new Promise(r => setTimeout(r, safeDelayMs));
                    } else if (action === 'block') {
                        console.log(`[AUTOMATION] Blocking ${targetJid} from bot ${botNumber}...`);
                        await sock.updateBlockStatus(targetJid, 'block');
                        results.push({
                            userId,
                            email: user.email,
                            botNumber,
                            target: cleanPhone,
                            action: 'block',
                            status: 'blocked',
                            timestamp: new Date()
                        });
                        successCount++;
                        await new Promise(r => setTimeout(r, safeDelayMs));
                    } else if (action === 'report') {
                        console.log(`[AUTOMATION] Sending ${repeatCount} spam report(s) against ${targetJid} from bot ${botNumber}...`);
                        for (let i = 1; i <= repeatCount; i++) {
                            await sock.query({
                                tag: 'iq',
                                attrs: {
                                    to: '@s.whatsapp.net',
                                    type: 'set',
                                    xmlns: 'spam'
                                },
                                content: [
                                    {
                                        tag: 'spam_list',
                                        attrs: {
                                            jid: targetJid,
                                            action: 'report'
                                        }
                                    }
                                ]
                            });

                            // Anti-ban delay between consecutive reports
                            await new Promise(r => setTimeout(r, safeDelayMs));
                        }

                        results.push({
                            userId,
                            email: user.email,
                            botNumber,
                            target: cleanPhone,
                            action: 'report',
                            reportsCount: repeatCount,
                            status: 'reported',
                            timestamp: new Date()
                        });
                        successCount++;
                    }
                } catch (err) {
                    console.error(`[AUTOMATION ERROR] Failed ${action} from bot ${botNumber}:`, err.message);
                    results.push({
                        userId,
                        email: user.email,
                        botNumber,
                        target: cleanPhone,
                        action,
                        status: 'failed',
                        error: err.message || `${action} failed`,
                        timestamp: new Date()
                    });
                    failCount++;
                }
            }
        }

        const actionWord = action === 'message' ? 'Messages sent' : action === 'block' ? 'Contacts blocked' : 'Spam reports submitted';

        res.json({
            message: `Automation task finished. ${actionWord}: ${successCount} bot(s), ${failCount} failed.`,
            summary: {
                action,
                totalBotsFound: results.length,
                successful: successCount,
                failed: failCount,
                target: cleanPhone,
                reportsPerBot: action === 'report' ? repeatCount : null
            },
            results
        });
    } catch (err) {
        console.error('Automation execution error:', err);
        res.status(500).json({ error: 'Automation execution failed: ' + err.message });
    }
});

// Backward-compatible alias
app.post('/api/admin/automation/broadcast', (req, res) => {
    req.body.action = 'message';
    return app._router.handle(req, res);
});

// ─── SESSION ENGINE ───────────────────────────────────────────────────────────

const pendingQRs = new Map();
const pendingPairingCodes = new Map();
const sessionStatuses = new Map();

// POST /api/sessions/start
app.post('/api/sessions/start', authenticateUser, async (req, res) => {
    let { sessionId, phoneNumber } = req.body;

    // Auto-fill from authenticated token if not explicitly provided
    if (!sessionId && req.user && req.user.userId !== 'admin') {
        sessionId = req.user.userId;
    }

    if (!sessionId) return res.status(400).json({ error: 'sessionId is required.' });

    // Enforce ownership: user can only start their own session unless admin
    if (req.user.role !== 'admin' && req.user.userId !== sessionId) {
        return res.status(403).json({ error: 'Forbidden. You can only control your own bot session.' });
    }

    // Validate that user exists and is active
    try {
        const user = await UserModel.findById(sessionId);
        if (!user) return res.status(403).json({ error: 'Invalid session ID.' });
        if (user.status !== 'active') {
            return res.status(403).json({ error: 'Account is not active or is pending approval.' });
        }
    } catch (err) {
        return res.status(400).json({ error: 'Invalid session ID format.' });
    }

    if (activeSessions.has(sessionId)) {
        return res.status(400).json({ error: 'Session is already active.' });
    }

    // Force a fresh auth state and clear previous caches
    if (phoneNumber) {
        pendingQRs.delete(sessionId);
        await AuthModel.deleteMany({ sessionId }).catch(e => console.error('Failed to reset auth:', e));
    } else {
        pendingPairingCodes.delete(sessionId);
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
app.get('/api/sessions/:id/status', async (req, res) => {
    const sessionId = req.params.id;

    // Verify user exists and is active in database (forces immediate auto-logout if deleted or disabled)
    try {
        if (/^[0-9a-fA-F]{24}$/.test(sessionId)) {
            const user = await UserModel.findById(sessionId);
            if (!user) {
                return res.status(401).json({ error: 'User account no longer exists.', status: 'deleted' });
            }
            if (user.status === 'disabled') {
                return res.status(403).json({ error: 'User account is disabled.', status: 'disabled' });
            }
            if (user.status === 'pending_approval') {
                return res.status(403).json({ error: 'User account is pending approval.', status: 'pending' });
            }
        }
    } catch (e) { }

    // Optional ownership check if token is provided
    const token = extractToken(req);
    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            if (decoded && decoded.role !== 'admin' && decoded.userId !== sessionId) {
                return res.status(403).json({ error: 'Forbidden. Access restricted to session owner.' });
            }
        } catch (e) { }
    }

    let status = sessionStatuses.get(sessionId) || 'not_found';
    if (activeSessions.has(sessionId)) status = 'connected'; // Always override if strictly connected
    const qr = pendingQRs.get(sessionId) || null;
    const pairingCode = pendingPairingCodes.get(sessionId) || null;
    res.json({ sessionId, status, qr, pairingCode });
});

// POST /api/sessions/stop
app.post('/api/sessions/stop', authenticateUser, async (req, res) => {
    let { sessionId } = req.body;
    if (!sessionId && req.user && req.user.userId !== 'admin') {
        sessionId = req.user.userId;
    }
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required.' });

    // Enforce ownership: user can only stop their own session unless admin
    if (req.user.role !== 'admin' && req.user.userId !== sessionId) {
        return res.status(403).json({ error: 'Forbidden. You can only control your own bot session.' });
    }

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

mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB runtime connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB connection lost. Driver will automatically attempt reconnection.');
});

mongoose.connection.on('reconnected', () => {
    console.log('🔄 MongoDB reconnected successfully.');
});

mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 20,
    socketTimeoutMS: 45000
})
    .then(() => {
        console.log(`✅ Connected to MongoDB at ${MONGO_URI}`);

        // Auto-resume all active sessions
        AuthModel.distinct('sessionId').then(async (sessionIds) => {
            if (sessionIds && sessionIds.length > 0) {
                console.log(`🔄 Auto-resuming ${sessionIds.length} active sessions...`);
                for (const sid of sessionIds) {
                    console.log(`- Resuming session: ${sid}`);
                    startBot(sid).catch(e => console.error(`Failed to resume ${sid}:`, e));
                    // 1 second delay between bootups to prevent connection flooding / rate limits
                    await new Promise(r => setTimeout(r, 1000));
                }
                console.log(`✅ All saved sessions resumed successfully!`);
            } else {
                console.log(`ℹ️ No active sessions found in database.`);
            }
        }).catch(err => console.error("Error auto-resuming sessions:", err));

        app.listen(PORT, () => {
            console.log(`🚀 SaaS API Server running on http://localhost:${PORT}`);
            console.log(`📡 Admin: ${ADMIN_EMAIL}`);
            console.log(`📡 Ready to accept frontend requests!`);
        });
    })
    .catch(err => {
        console.error('❌ MongoDB connection failed on bootup:', err.message);
        console.error('💡 TIP: Check if mongod service is running and firewall/bindIp is properly set.');
        process.exit(1);
    });
