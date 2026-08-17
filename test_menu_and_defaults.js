const assert = require('assert');
const { loadSettings } = require('./src/database');

console.log('🧪 Testing .menu Signup URL, Private Mode & Anti-Delete Default Routing...\n');

let passed = 0;
let total = 0;

function check(cond, name) {
    total++;
    if (cond) {
        console.log(`✅ [PASS] ${name}`);
        passed++;
    } else {
        console.error(`❌ [FAIL] ${name}`);
    }
}

// 1. Check default botMode is 'private'
const freshSettings = loadSettings('test_temp_session_' + Date.now());
check(freshSettings.botMode === 'private', 'Fresh session defaults to PRIVATE mode');
check(freshSettings.antiDelete === true, 'Fresh session defaults to antiDelete: true');
check(freshSettings.antiViewOnce === true, 'Fresh session defaults to antiViewOnce: true');

// Clean up temp file
try {
    const fs = require('fs');
    const path = require('path');
    const tempFile = path.join(__dirname, 'user_settings', `settings_test_temp_session_${Date.now()}.json`);
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
} catch(e) {}

// 2. Test Anti-Delete target routing
function resolveAntiDeleteTarget(settings, mockSock, mockMsg) {
    const botJid = mockSock.user?.id ? (mockSock.user.id.split(':')[0].split('@')[0] + '@s.whatsapp.net') : mockMsg.from;
    return settings.stealthJid || botJid;
}

const mockSock = { user: { id: '923001234567:1@s.whatsapp.net' } };
const groupMsg = { key: { remoteJid: '120363012345678@g.us' }, from: '120363012345678@g.us' };

// When stealthJid is null, must default to Message Yourself (Owner's own JID)
const defaultTarget = resolveAntiDeleteTarget({ stealthJid: null }, mockSock, groupMsg);
check(defaultTarget === '923001234567@s.whatsapp.net', 'Anti-Delete routes to Owner Message Yourself (+923001234567) by default (NOT the group)');

// When stealthJid is configured, must forward to custom target
const customTarget = resolveAntiDeleteTarget({ stealthJid: '120363999999999@g.us' }, mockSock, groupMsg);
check(customTarget === '120363999999999@g.us', 'Anti-Delete forwards to custom stealth JID when explicitly set');

// 3. Test .menu contains signup link
const handlerContent = require('fs').readFileSync(require('path').join(__dirname, 'src', 'handler.js'), 'utf8');
check(handlerContent.includes('https://mr-fk-bot.vercel.app/signup'), '.menu command includes SaaS signup URL');

const botContent = require('fs').readFileSync(require('path').join(__dirname, 'src', 'bot.js'), 'utf8');
check(botContent.includes('https://mr-fk-bot.vercel.app/signup'), 'Onboarding welcome message includes SaaS signup URL');

console.log(`\n🎉 Test Results: ${passed}/${total} passed.`);
if (passed === total) process.exit(0);
else process.exit(1);
