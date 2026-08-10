const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const qrcode = require('qrcode');
const { startBot, stopBot, activeSessions } = require('./src/bot');
const UserModel = require('./src/models/User');

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/mrfkbot';
const ADMIN_EMAIL = 'mrhiddenhacker313@gmail.com';
const ADMIN_PASSWORD = 'admin123';
const ADMIN_TOKEN = 'admin_token_secure_mrfk_2024';

const app = express();
app.use(cors());
app.use(express.json());

// Helper: check admin token from header OR body
function isAdmin(req) {
    const fromHeader = req.headers['x-admin-token'] || req.headers['authorization'];
    const fromBody = req.body && req.body.token;
    const token = fromHeader || fromBody;
    return token === ADMIN_TOKEN;
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
        res.json(users);
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
        // Also stop their active session if any
        if (activeSessions.has(userId)) {
            await stopBot(userId);
        }
        await UserModel.findByIdAndDelete(userId);
        res.json({ message: 'User deleted.' });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ error: 'Failed to delete user.' });
    }
});

// ─── SESSION ENGINE ───────────────────────────────────────────────────────────

const pendingQRs = new Map();
const sessionStatuses = new Map();

// POST /api/sessions/start
app.post('/api/sessions/start', async (req, res) => {
    const { sessionId } = req.body;
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
            if (status === 'connected') pendingQRs.delete(sessionId);
        }
    ).catch(err => {
        console.error(`[Session ${sessionId}] Failed to start:`, err);
        sessionStatuses.set(sessionId, 'error');
    });

    res.json({ message: 'Session boot initiated.', sessionId });
});

// GET /api/sessions/:id/status
app.get('/api/sessions/:id/status', (req, res) => {
    const sessionId = req.params.id;
    const status = sessionStatuses.get(sessionId) || 'not_found';
    const qr = pendingQRs.get(sessionId) || null;
    res.json({ sessionId, status, qr });
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
