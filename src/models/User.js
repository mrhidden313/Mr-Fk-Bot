const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // Plain text for simplicity, in production use bcrypt
    role: { type: String, enum: ['admin', 'user'], default: 'user' },
    connectedNumber: { type: String, default: null }, // The WhatsApp JID when connected
    createdAt: { type: Date, default: Date.now }
});

const UserModel = mongoose.model('User', UserSchema);

module.exports = UserModel;
