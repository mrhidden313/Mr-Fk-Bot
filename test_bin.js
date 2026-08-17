const { Binary } = require('mongodb');
const bin = new Binary(Buffer.from('hello'));

const restoreBuffer = (obj) => {
    if (!obj) return undefined;
    if (Buffer.isBuffer(obj)) return obj;
    if (obj.buffer && Buffer.isBuffer(obj.buffer)) return obj.buffer; // FIX for mongodb.Binary!
    if (obj.buffer && obj.buffer.type === 'Buffer') return Buffer.from(obj.buffer.data);
    if (obj.type === 'Buffer' && Array.isArray(obj.data)) return Buffer.from(obj.data);
    if (obj instanceof Uint8Array) return Buffer.from(obj);
    if (typeof obj === 'string') return Buffer.from(obj, 'base64');
    return obj;
};

const restored = restoreBuffer(bin);
console.log(Buffer.isBuffer(restored)); // Should be true!
console.log(restored.toString()); // Should be 'hello'
