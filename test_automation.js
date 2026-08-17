const assert = require('assert');

console.log('🧪 Testing Admin Multi-Bot Automation & Broadcast Logic...\n');

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

// 1. Phone number cleansing & JID formatting
function formatTargetJid(raw) {
    const cleanPhone = (raw || '').replace(/\D/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
        throw new Error('Invalid phone number format');
    }
    return `${cleanPhone}@s.whatsapp.net`;
}

check(formatTargetJid('+92 300 1234567') === '923001234567@s.whatsapp.net', 'Format standard international number with spaces & plus');
check(formatTargetJid('00923001234567') === '00923001234567@s.whatsapp.net', 'Format number with leading zeros');

try {
    formatTargetJid('123');
    check(false, 'Should reject short numbers');
} catch (e) {
    check(true, 'Correctly rejected short number (<10 digits)');
}

// 2. Multi-bot simulated dispatch with safe delay
async function simulateMultiBotDispatch(bots, targetNumber, message, delayMs) {
    const targetJid = formatTargetJid(targetNumber);
    const results = [];

    for (const bot of bots) {
        try {
            if (!bot.isOnline) throw new Error('Bot is offline');
            // Simulating sendMessage
            results.push({ botNumber: bot.number, target: targetJid, status: 'sent' });
        } catch (err) {
            results.push({ botNumber: bot.number, target: targetJid, status: 'failed', error: err.message });
        }
    }
    return results;
}

const mockBots = [
    { number: '923011111111', isOnline: true },
    { number: '923022222222', isOnline: true },
    { number: '923033333333', isOnline: false }
];

simulateMultiBotDispatch(mockBots, '923009999999', 'Hello from Multi-Bot Automation', 100).then(results => {
    check(results.length === 3, 'All 3 bots processed');
    check(results.filter(r => r.status === 'sent').length === 2, '2 online bots successfully sent');
    check(results.filter(r => r.status === 'failed').length === 1, '1 offline bot correctly caught with error');

    console.log(`\n🎉 Automation Test Results: ${passed}/${total} passed.`);
    if (passed === total) process.exit(0);
    else process.exit(1);
});
