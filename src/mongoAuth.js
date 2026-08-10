const mongoose = require('mongoose');
const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

const AuthSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, index: true },
    type: { type: String, required: true }, // 'creds' or 'key'
    keyId: { type: String, required: true }, // e.g. 'app-state-sync-key-123'
    data: { type: String, required: true } // JSON stringified data
});

AuthSchema.index({ sessionId: 1, type: 1, keyId: 1 }, { unique: true });
const AuthModel = mongoose.model('AuthState', AuthSchema);

/**
 * MongoDB Auth State Adapter for Baileys
 * Handles multi-tenant sessions in a single database.
 */
async function useMongoDBAuthState(sessionId) {
    const writeData = async (type, keyId, data) => {
        const serialized = JSON.stringify(data, BufferJSON.replacer);
        await AuthModel.findOneAndUpdate(
            { sessionId, type, keyId },
            { data: serialized },
            { upsert: true, returnDocument: 'after' }
        );
    };

    const readData = async (type, keyId) => {
        const doc = await AuthModel.findOne({ sessionId, type, keyId });
        if (doc && doc.data) {
            return JSON.parse(doc.data, BufferJSON.reviver);
        }
        return null;
    };

    const removeData = async (type, keyId) => {
        await AuthModel.deleteOne({ sessionId, type, keyId });
    };

    // Initialize or load creds
    let creds = await readData('creds', 'creds');
    if (!creds) {
        creds = initAuthCreds();
        await writeData('creds', 'creds', creds);
    }

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(
                        ids.map(async id => {
                            let value = await readData(type, id);
                            if (type === 'app-state-sync-key' && value) {
                                value = require('@whiskeysockets/baileys').proto.Message.AppStateSyncKeyData.fromObject(value);
                            }
                            data[id] = value;
                        })
                    );
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            if (value) {
                                tasks.push(writeData(category, id, value));
                            } else {
                                tasks.push(removeData(category, id));
                            }
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => writeData('creds', 'creds', creds)
    };
}

module.exports = { useMongoDBAuthState, AuthModel };
