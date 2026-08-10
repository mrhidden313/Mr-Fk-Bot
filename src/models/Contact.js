const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
    sessionId: { type: String, required: true },
    lid: { type: String, index: true }, // The @lid string
    jid: { type: String, required: true }, // The real phone number JID (@s.whatsapp.net)
    name: { type: String },
    pushName: { type: String }
}, { timestamps: true });

// Compound index to ensure uniqueness per session
contactSchema.index({ sessionId: 1, lid: 1 }, { unique: true, sparse: true });
contactSchema.index({ sessionId: 1, jid: 1 }, { unique: true });

module.exports = mongoose.model('Contact', contactSchema);
