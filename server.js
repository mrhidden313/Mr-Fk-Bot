const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const qrcode = require('qrcode'); 
const { startBot, stopBot, activeSessions } = require('./src/bot');
const UserModel = require('./src/models/User');

// SaaS Configuration
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/mrfkbot';

const app = express();
app.use(cors());
app.use(express.json());

// --- SECURE AUTHENTICATION & ADMIN ROUTES ---

// 1. Unified Login (Admin & User)
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    
    // Check if it's the Master Admin
    if (email === 'mrhiddenhacker313@gmail.com' && password === 'admin123') {
        return res.json({ token: 'admin_token_secure', role: 'admin', email });
    }

    // Check if it's a Client User
    const user = await UserModel.findOne({ email, password });
    if (user) {
        return res.json({ token: user._id.toString(), role: 'user', email: user.email });
    }

    return res.status(401).json({ error: 'Invalid email or password' });
});

// 2. Admin Route: Create new Client User
app.post('/api/admin/users/create', async (req, res) => {
    const { token, email, password } = req.body;
    
    if (token !== 'admin_token_secure') return res.status(403).json({ error: 'Forbidden' });
    
    try {
        const newUser = await UserModel.create({ email, password, role: 'user' });
        res.json({ message: 'User created successfully!', user: newUser });
    } catch (err) {
        res.status(400).json({ error: 'User already exists or invalid data' });
    }
});

// 3. Admin Route: List all Client Users
app.get('/api/admin/users', async (req, res) => {
    const token = req.headers.authorization;
    if (token !== 'admin_token_secure') return res.status(403).json({ error: 'Forbidden' });

    const users = await UserModel.find({}, { password: 0 }); // Exclude passwords
    res.json(users);
});


// --- WHATSAPP SESSION ENGINE ROUTES ---

// In-memory store for pending QR codes (Frontend will poll this)
const pendingQRs = new Map();
const sessionStatuses = new Map(); // 'disconnected', 'qr_ready', 'connected'

// API: Start a new WhatsApp Session (Returns immediately, QR generated asynchronously)
app.post('/api/sessions/start', async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

    if (activeSessions.has(sessionId)) {
        return res.status(400).json({ error: 'Session is already active' });
    }

    sessionStatuses.set(sessionId, 'starting');

    // Trigger bot start in the background
    startBot(
        sessionId,
        async (qrString) => {
            // Convert raw QR string to Base64 Image for the Web Frontend
            const qrBase64 = await qrcode.toDataURL(qrString);
            pendingQRs.set(sessionId, qrBase64);
            sessionStatuses.set(sessionId, 'qr_ready');
        },
        (status) => {
            sessionStatuses.set(sessionId, status);
            if (status === 'connected') {
                pendingQRs.delete(sessionId);
            }
        }
    ).catch(err => {
        console.error(`[Session ${sessionId}] Failed to start:`, err);
        sessionStatuses.set(sessionId, 'error');
    });

    res.json({ message: 'Session boot sequence initiated', sessionId });
});

// API: Get Status & QR Code (Frontend will call this every 2 seconds)
app.get('/api/sessions/:id/status', (req, res) => {
    const sessionId = req.params.id;
    const status = sessionStatuses.get(sessionId) || 'not_found';
    const qr = pendingQRs.get(sessionId) || null;

    res.json({ sessionId, status, qr });
});

// API: Stop/Logout a Session
app.post('/api/sessions/stop', async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

    await stopBot(sessionId);
    sessionStatuses.set(sessionId, 'disconnected');
    pendingQRs.delete(sessionId);
    
    res.json({ message: 'Session stopped successfully', sessionId });
});

// Connect to MongoDB & Start Server
mongoose.connect(MONGO_URI)
    .then(() => {
        console.log(`✅ Connected to MongoDB at ${MONGO_URI}`);
        app.listen(PORT, () => {
            console.log(`🚀 SaaS API Server running on http://localhost:${PORT}`);
            console.log(`📡 Ready to accept frontend requests!`);
        });
    })
    .catch(err => {
        console.error('❌ Failed to connect to MongoDB:', err);
    });
