const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'settings.json');

const defaultSettings = {
    antiDelete: true,
    stealthJid: null,
    autoStatus: false,
    statusJid: null,
    antiViewOnce: true,
    viewOnceJid: null,
    botMode: 'private', // 'private' or 'public'
    knownUsers: [] // Tracks who has already received the Channel Auto-Greeter
};

function loadSettings() {
    if (!fs.existsSync(dbPath)) {
        fs.writeFileSync(dbPath, JSON.stringify(defaultSettings, null, 2));
        return defaultSettings;
    }
    try {
        const data = fs.readFileSync(dbPath, 'utf8');
        const loaded = JSON.parse(data);
        // Merge loaded settings with defaults to prevent missing properties!
        return { ...defaultSettings, ...loaded };
    } catch (e) {
        return defaultSettings;
    }
}

function saveSettings(settings) {
    fs.writeFileSync(dbPath, JSON.stringify(settings, null, 2));
}

module.exports = { loadSettings, saveSettings };
