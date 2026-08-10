const fs = require('fs');
const path = require('path');

const defaultSettings = {
    antiDelete: true,
    stealthJid: null,
    autoStatus: false,
    statusJid: null,
    antiViewOnce: true,
    viewOnceJid: null,
    botMode: 'private',
    knownUsers: []
};

/**
 * Get the settings file path for a specific user session
 * Each user gets their own isolated settings file
 */
function getSettingsPath(sessionId) {
    if (!sessionId) {
        // Fallback for legacy single-user mode
        return path.join(__dirname, '..', 'settings.json');
    }
    const dir = path.join(__dirname, '..', 'user_settings');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Sanitize sessionId so it's safe as a filename
    const safe = sessionId.toString().replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(dir, `settings_${safe}.json`);
}

/**
 * Load settings for a specific user session
 */
function loadSettings(sessionId) {
    const dbPath = getSettingsPath(sessionId);
    if (!fs.existsSync(dbPath)) {
        fs.writeFileSync(dbPath, JSON.stringify(defaultSettings, null, 2));
        return { ...defaultSettings };
    }
    try {
        const data = fs.readFileSync(dbPath, 'utf8');
        const loaded = JSON.parse(data);
        return { ...defaultSettings, ...loaded };
    } catch (e) {
        return { ...defaultSettings };
    }
}

/**
 * Save settings for a specific user session
 */
function saveSettings(settings, sessionId) {
    const dbPath = getSettingsPath(sessionId);
    fs.writeFileSync(dbPath, JSON.stringify(settings, null, 2));
}

module.exports = { loadSettings, saveSettings };
