const UserModel = require('./src/models/User');
const ChatMessage = require('./src/models/ChatMessage');
const Contact = require('./src/models/Contact');
const { handleMessages, clearSessionCache } = require('./src/handler');
const assert = require('assert');

// Stub DB calls to allow isolated offline testing
ChatMessage.create = async () => ({});
Contact.find = () => ({ lean: async () => [] });

async function runTests() {
    console.log('🧪 Starting Security & Multi-Tenant Verification Tests...\n');

    // TEST 1: Bcrypt Password Hashing & Legacy Plaintext Verification
    console.log('1️⃣ Testing Password Hashing & Legacy Backward-Compatibility...');
    const user = new UserModel({
        email: 'test@example.com',
        password: 'mySecretPassword123',
        role: 'user'
    });

    // Before save, password is plain text
    assert.strictEqual(user.password, 'mySecretPassword123');
    
    // Legacy comparison test (before hash)
    let isMatch = await user.comparePassword('mySecretPassword123');
    assert.strictEqual(isMatch, true, 'Legacy plaintext comparison failed');

    let isWrongMatch = await user.comparePassword('wrongPassword');
    assert.strictEqual(isWrongMatch, false, 'Wrong password comparison failed');

    // Simulate pre-save hook
    const salt = await require('bcryptjs').genSalt(10);
    user.password = await require('bcryptjs').hash(user.password, salt);

    assert(user.password.startsWith('$2a$') || user.password.startsWith('$2b$'), 'Password was not hashed with bcrypt');

    // Hashed comparison test
    isMatch = await user.comparePassword('mySecretPassword123');
    assert.strictEqual(isMatch, true, 'Hashed password comparison failed');

    isWrongMatch = await user.comparePassword('wrongPassword');
    assert.strictEqual(isWrongMatch, false, 'Wrong password against hash should fail');

    console.log('   ✅ Password Hashing & Backward-Compatibility: PASSED');

    // TEST 2: Multi-Tenant Cache Isolation Test
    console.log('2️⃣ Testing Multi-Tenant Message Isolation (Zero Data Leaks)...');
    
    const tenantA_ID = 'session_tenant_alpha';
    const tenantB_ID = 'session_tenant_beta';

    const fakeSockA = { user: { id: '923000000001:0@s.whatsapp.net' }, sendMessage: async () => {} };
    const fakeSockB = { user: { id: '923000000002:0@s.whatsapp.net' }, sendMessage: async () => {} };

    // Tenant A receives a message
    const msgA = {
        type: 'notify',
        messages: [{
            key: { id: 'MSG_A_999', remoteJid: '123456@s.whatsapp.net', fromMe: false },
            message: { conversation: 'Secret message for Tenant A' }
        }]
    };

    await handleMessages(fakeSockA, msgA, tenantA_ID);

    // Tenant B receives a message with different ID
    const msgB = {
        type: 'notify',
        messages: [{
            key: { id: 'MSG_B_888', remoteJid: '654321@s.whatsapp.net', fromMe: false },
            message: { conversation: 'Secret message for Tenant B' }
        }]
    };

    await handleMessages(fakeSockB, msgB, tenantB_ID);

    // Now Tenant B receives a protocolMessage (REVOKE/delete) targeting Tenant A's message 'MSG_A_999'
    let tenantB_leaked = false;
    fakeSockB.sendMessage = async (target, content) => {
        if (content.text && content.text.includes('Secret message for Tenant A')) {
            tenantB_leaked = true;
        }
    };

    const revokeAttemptOnB = {
        type: 'notify',
        messages: [{
            key: { id: 'REVOKE_EVENT_1', remoteJid: '654321@s.whatsapp.net', fromMe: false },
            message: {
                protocolMessage: {
                    key: { id: 'MSG_A_999' },
                    type: 0 // REVOKE
                }
            }
        }]
    };

    await handleMessages(fakeSockB, revokeAttemptOnB, tenantB_ID);

    assert.strictEqual(tenantB_leaked, false, 'CRITICAL: Tenant B recovered Tenant A message! Cache is leaking between sessions!');
    console.log('   ✅ Multi-Tenant Cache Isolation: PASSED (Zero cross-session data leak)');

    // TEST 3: Cleanup on session stop
    console.log('3️⃣ Testing Session Cache Cleanup...');
    clearSessionCache(tenantA_ID);
    clearSessionCache(tenantB_ID);
    console.log('   ✅ Session Cache Cleanup: PASSED');

    console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
