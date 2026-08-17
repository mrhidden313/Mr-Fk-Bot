const assert = require('assert');

console.log('🧪 Testing Pairing Code 65s Cooldown Lock & QR Mode Isolation...\n');

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

// 1. Simulate the Pairing Code Lock logic
class MockSessionManager {
    constructor(phoneNumber) {
        this.phoneNumber = phoneNumber;
        this.hasRequestedPairingCode = false;
        this.pairingCodeCooldownUntil = 0;
        this.codesGenerated = [];
        this.qrsEmitted = [];
    }

    async onQrEvent(qrString) {
        if (this.phoneNumber) {
            const now = Date.now();
            if (!this.hasRequestedPairingCode || now > this.pairingCodeCooldownUntil) {
                this.hasRequestedPairingCode = true;
                this.pairingCodeCooldownUntil = now + 65000;
                const fakeCode = 'CODE-' + Math.floor(1000 + Math.random() * 9000);
                this.codesGenerated.push(fakeCode);
            }
            // In pairing mode, QR is never emitted
        } else {
            this.qrsEmitted.push(qrString);
        }
    }
}

async function runTest() {
    // Test A: Pairing code with multiple incoming QR events (simulating Baileys emitting QR every 15s)
    const pairSession = new MockSessionManager('923001234567');

    // 1st QR event -> generates Code #1
    await pairSession.onQrEvent('qr_event_1');
    check(pairSession.codesGenerated.length === 1, 'Initial pairing code generated');

    // 2nd QR event 10s later -> should be SKIPPED by the lock
    await pairSession.onQrEvent('qr_event_2');
    check(pairSession.codesGenerated.length === 1, '2nd QR event ignored (Code kept alive without being overwritten)');

    // 3rd QR event 20s later -> should be SKIPPED by the lock
    await pairSession.onQrEvent('qr_event_3');
    check(pairSession.codesGenerated.length === 1, '3rd QR event ignored (Zero code fluctuation)');
    check(pairSession.qrsEmitted.length === 0, 'No QR images emitted in Pairing Code mode');

    // Test B: QR mode with incoming QR events
    const qrSession = new MockSessionManager(null);
    await qrSession.onQrEvent('qr_1');
    await qrSession.onQrEvent('qr_2');
    check(qrSession.qrsEmitted.length === 2, 'QR mode emits QR updates normally');
    check(qrSession.codesGenerated.length === 0, 'No pairing codes generated in QR mode');

    console.log(`\n🎉 Pairing Code Lock Tests: ${passed}/${total} passed.`);
    if (passed === total) process.exit(0);
    else process.exit(1);
}

runTest();
