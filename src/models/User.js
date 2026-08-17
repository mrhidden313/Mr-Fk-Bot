const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'user'], default: 'user' },
    status: { type: String, enum: ['active', 'pending_approval', 'disabled'], default: 'active', index: true },
    registrationIp: { type: String, default: null, index: true },
    deviceId: { type: String, default: null, index: true },
    approvedAt: { type: Date, default: null },
    connectedNumber: { type: String, default: null }, // The WhatsApp JID when connected
    createdAt: { type: Date, default: Date.now }
});

// Pre-save hook: Hash password before saving if it has been modified (and not already hashed)
UserSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    // Check if already a bcrypt hash
    if (!this.password.startsWith('$2a$') && !this.password.startsWith('$2b$')) {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
    }
});

// Instance method to compare password with backward compatibility
UserSchema.methods.comparePassword = async function (candidatePassword) {
    if (!this.password) return false;
    // If stored password is a bcrypt hash
    if (this.password.startsWith('$2a$') || this.password.startsWith('$2b$')) {
        return bcrypt.compare(candidatePassword, this.password);
    }
    // Fallback: Legacy plain-text password match
    return this.password === candidatePassword;
};

// Static helper to hash password directly
UserSchema.statics.hashPassword = async function (password) {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
};

const UserModel = mongoose.model('User', UserSchema);

module.exports = UserModel;

