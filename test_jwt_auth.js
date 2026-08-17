require('dotenv').config();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'mr_fk_secure_jwt_secret_key_2026_super_safe';

console.log('🧪 Starting JWT Auth Security Tests...\n');

let passed = 0;
let total = 0;

function assert(condition, testName) {
    total++;
    if (condition) {
        console.log(`✅ [PASS] ${testName}`);
        passed++;
    } else {
        console.error(`❌ [FAIL] ${testName}`);
    }
}

// 1. Generate User Token
const mockUser = {
    _id: '65cb7f1a92e1234567890abc',
    email: 'testuser@example.com',
    role: 'user'
};

const userToken = jwt.sign(
    { userId: mockUser._id.toString(), email: mockUser.email, role: mockUser.role },
    JWT_SECRET,
    { expiresIn: '7d' }
);

assert(typeof userToken === 'string' && userToken.split('.').length === 3, 'User JWT generates valid 3-part header.payload.signature structure');

// 2. Decode and verify valid token
try {
    const decoded = jwt.verify(userToken, JWT_SECRET);
    assert(decoded.userId === mockUser._id && decoded.email === mockUser.email && decoded.role === 'user', 'Decoded JWT payload contains correct userId, email, and role');
} catch (e) {
    assert(false, 'Decoded JWT failed verification');
}

// 3. Reject tampered token
try {
    const tamperedToken = userToken.slice(0, -5) + 'xxxxx';
    jwt.verify(tamperedToken, JWT_SECRET);
    assert(false, 'Tampered token was accepted (Security Failure!)');
} catch (e) {
    assert(true, 'Tampered token successfully rejected with signature verification error');
}

// 4. Reject token signed with wrong secret
try {
    const fakeToken = jwt.sign({ userId: mockUser._id, role: 'admin' }, 'wrong_secret');
    jwt.verify(fakeToken, JWT_SECRET);
    assert(false, 'Token signed with foreign secret was accepted (Security Failure!)');
} catch (e) {
    assert(true, 'Token signed with wrong secret correctly rejected');
}

// 5. Admin Token Generation & Verification
const adminToken = jwt.sign(
    { userId: 'admin', email: 'mrhiddenhacker313@gmail.com', role: 'admin' },
    JWT_SECRET,
    { expiresIn: '7d' }
);

try {
    const decodedAdmin = jwt.verify(adminToken, JWT_SECRET);
    assert(decodedAdmin.role === 'admin' && decodedAdmin.userId === 'admin', 'Admin JWT verified with admin role');
} catch (e) {
    assert(false, 'Admin JWT failed verification');
}

console.log(`\n🎉 Test Results: ${passed}/${total} passed.`);
if (passed === total) {
    process.exit(0);
} else {
    process.exit(1);
}
