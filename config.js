const path = require('path');

module.exports = {
    // 👑 The Identity of the Bot
    botName: "MR FK BOT",
    ownerName: "mr fk",
    
    // 🖼️ The Global Logo Path (Used for menus, watermarks, etc)
    logoPath: path.join(__dirname, 'assets', 'logo.png'),

    // ⚙️ Technical Settings
    prefix: ".", // The command prefix (e.g. .ping)
    sessionName: "auth_info_baileys", // Folder where WhatsApp login is saved
};
