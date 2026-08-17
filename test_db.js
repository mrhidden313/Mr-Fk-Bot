const mongoose = require('mongoose');
const ChatMessage = require('./src/models/ChatMessage');
mongoose.connect('mongodb://localhost:27017/mrfkbot').then(async () => {
    const msg = await ChatMessage.findOne({ type: 'audioMessage' }).lean();
    console.log(JSON.stringify(msg, null, 2));
    process.exit(0);
});
