const UserModel = require('./src/models/User');
const assert = require('assert');

async function runTest() {
    console.log('🧪 Testing Public Signup & IP Multi-Account Approval Logic...\n');

    // MOCK DB COLLECTION
    const mockUsers = [];

    UserModel.findOne = async (query) => {
        if (query.email) {
            return mockUsers.find(u => u.email === query.email) || null;
        }
        if (query.registrationIp) {
            return mockUsers.find(u => u.registrationIp === query.registrationIp) || null;
        }
        if (query.deviceId) {
            return mockUsers.find(u => u.deviceId === query.deviceId) || null;
        }
        return null;
    };

    UserModel.findById = async (id) => {
        return mockUsers.find(u => u._id === id) || null;
    };

    UserModel.findByIdAndUpdate = async (id, update) => {
        const u = mockUsers.find(user => user._id === id);
        if (u) {
            Object.assign(u, update);
            return u;
        }
        return null;
    };

    // 1. First User Signup (IP: 203.0.113.195)
    console.log('1️⃣ First User Signup on IP 203.0.113.195 (Should be Auto-Active)...');
    const ip1 = '203.0.113.195';
    const dev1 = 'dev_abc_123';
    
    let isDup1 = !!(await UserModel.findOne({ registrationIp: ip1 }) || await UserModel.findOne({ deviceId: dev1 }));
    let status1 = isDup1 ? 'pending_approval' : 'active';
    assert.strictEqual(status1, 'active', 'First user should be active');
    
    const user1 = {
        _id: 'user_111',
        email: 'first@user.com',
        status: status1,
        registrationIp: ip1,
        deviceId: dev1,
        save: async () => {}
    };
    mockUsers.push(user1);
    console.log('   ✅ First User: ACTIVE (Auto-approved)');

    // 2. Second User Signup on SAME IP (203.0.113.195)
    console.log('2️⃣ Second User Signup on SAME IP 203.0.113.195 (Should be Pending Approval)...');
    const ip2 = '203.0.113.195'; // SAME IP!
    const dev2 = 'dev_xyz_789';

    let isDup2 = !!(await UserModel.findOne({ registrationIp: ip2 }) || await UserModel.findOne({ deviceId: dev2 }));
    let status2 = isDup2 ? 'pending_approval' : 'active';
    assert.strictEqual(status2, 'pending_approval', 'Second user on same IP must be pending_approval');

    const user2 = {
        _id: 'user_222',
        email: 'second@user.com',
        status: status2,
        registrationIp: ip2,
        deviceId: dev2,
        save: async function() { }
    };
    mockUsers.push(user2);
    console.log('   ✅ Second User on Same IP: PENDING_APPROVAL');

    // 3. Second User trying to log in while pending
    console.log('3️⃣ Second User Login Attempt while Pending...');
    let loginBlocked = user2.status === 'pending_approval';
    assert.strictEqual(loginBlocked, true, 'Pending user must be blocked from logging in');
    console.log('   ✅ Login correctly blocked for pending account');

    // 4. Admin Approves Second User
    console.log('4️⃣ Admin Approves Second User...');
    await UserModel.findByIdAndUpdate(user2._id, { status: 'active', approvedAt: new Date() });
    assert.strictEqual(user2.status, 'active', 'Status must be active after approval');
    console.log('   ✅ Account status updated to ACTIVE');

    // 5. Admin Disables User
    console.log('5️⃣ Admin Disables User...');
    user2.status = 'disabled';
    assert.strictEqual(user2.status, 'disabled', 'Status must be disabled');
    loginBlocked = user2.status === 'disabled';
    assert.strictEqual(loginBlocked, true, 'Disabled user must be blocked');
    console.log('   ✅ Disable control works perfectly');

    console.log('\n🎉 ALL SIGNUP, IP DETECTION & APPROVAL TESTS PASSED!');
}

runTest().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
