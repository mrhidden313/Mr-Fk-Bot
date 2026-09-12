const path = require('path');

module.exports = {
    // 👑 The Identity of the Bot
    botName: "Bot by Mr HIDDEN & SUDAIS H4CKR",
    ownerName: "Mr HIDDEN & SUDAIS H4CKR",
    
    // 🖼️ The Global Logo Path (Used for menus, watermarks, etc)
    logoPath: path.join(__dirname, 'assets', 'logo.png'),

    // ⚙️ Technical Settings
    prefix: ".", // The command prefix (e.g. .ping)
    sessionName: "auth_info_baileys", // Folder where WhatsApp login is saved
};
