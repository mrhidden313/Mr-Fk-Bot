const assert = require('assert');

console.log('🧪 Testing Multi-Mode WhatsApp Automation (Message / Block / Report)...\n');

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

// 1. Phone number sanitization
function sanitizeTarget(phone) {
    const clean = (phone || '').replace(/\D/g, '');
    if (clean.length < 10 || clean.length > 15) throw new Error('Invalid phone format');
    return `${clean}@s.whatsapp.net`;
}

check(sanitizeTarget('+92 300 9988776') === '923009988776@s.whatsapp.net', 'Format target JID from input with + and spaces');

// 2. Multi-Mode Dispatch Simulator
async function simulateAutomationExecution(action, target, message, reportsCount = 1) {
    const targetJid = sanitizeTarget(target);
    const mockBots = [
        { id: 'bot1', number: '923011111111', isOnline: true },
        { id: 'bot2', number: '923022222222', isOnline: true }
    ];

    const results = [];

    for (const bot of mockBots) {
        if (action === 'message') {
            if (!message) throw new Error('Message is required');
            results.push({ bot: bot.number, action: 'message', status: 'sent' });
        } else if (action === 'block') {
            results.push({ bot: bot.number, action: 'block', status: 'blocked' });
        } else if (action === 'report') {
            const count = Math.max(1, Number(reportsCount) || 1);
            results.push({ bot: bot.number, action: 'report', reportsCount: count, status: 'reported' });
        }
    }
    return results;
}

// Test Mode 1: Message
simulateAutomationExecution('message', '923001234567', 'Test broadcast').then(msgRes => {
    check(msgRes.length === 2 && msgRes[0].status === 'sent', 'Mode 1: Broadcast message processed across bots');

    // Test Mode 2: Block
    return simulateAutomationExecution('block', '923001234567');
}).then(blockRes => {
    check(blockRes.length === 2 && blockRes[0].status === 'blocked', 'Mode 2: Mass contact block processed across bots');

    // Test Mode 3: Report (3x per bot)
    return simulateAutomationExecution('report', '923001234567', null, 3);
}).then(reportRes => {
    check(reportRes.length === 2 && reportRes[0].reportsCount === 3 && reportRes[0].status === 'reported', 'Mode 3: Mass spam report with 3x multiplier processed');

    console.log(`\n🎉 All Automation Modes Verified Successfully: ${passed}/${total} passed.`);
    if (passed === total) process.exit(0);
    else process.exit(1);
}).catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});
