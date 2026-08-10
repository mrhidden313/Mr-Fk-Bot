const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, index: true },
    jid: { type: String, required: true, index: true },
    messageId: { type: String },
    fromMe: { type: Boolean, default: false },
    sender: { type: String },
    pushName: { type: String },
    body: { type: String, default: '' },
    type: { type: String, default: 'text' }, // text, image, video, audio, sticker, document, etc.
    caption: { type: String },
    isGroup: { type: Boolean, default: false },
    groupName: { type: String },
    timestamp: { type: Date, default: Date.now }
}, {
    timestamps: { createdAt: 'savedAt' }
});

chatMessageSchema.index({ sessionId: 1, jid: 1, timestamp: -1 });
chatMessageSchema.index({ sessionId: 1, messageId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
