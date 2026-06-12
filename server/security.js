// SolUSSD — Security: PIN hashing + private key encryption
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { ENCRYPTION_KEY } = require('./config');

const SALT_ROUNDS = 10;

/**
 * Hash a 4-digit PIN using bcrypt
 */
async function hashPin(pin) {
    return bcrypt.hash(pin, SALT_ROUNDS);
}

/**
 * Verify a PIN against its bcrypt hash
 */
async function verifyPin(pin, hash) {
    return bcrypt.compare(pin, hash);
}

/**
 * Derive a 32-byte AES key from the master key + user PIN
 */
function deriveKey(userPin) {
    return crypto.createHash('sha256')
        .update(ENCRYPTION_KEY + userPin)
        .digest();
}

/**
 * Encrypt a Solana secret key array with AES-256-GCM
 */
function encryptKey(secretKeyArray, userPin) {
    const key = deriveKey(userPin);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const plaintext = Buffer.from(secretKeyArray);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return JSON.stringify({
        iv: iv.toString('hex'),
        encrypted: encrypted.toString('hex'),
        authTag: authTag.toString('hex'),
    });
}

/**
 * Decrypt an encrypted secret key back to Uint8Array
 */
function decryptKey(encryptedJson, userPin) {
    const { iv, encrypted, authTag } = JSON.parse(encryptedJson);
    const key = deriveKey(userPin);

    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encrypted, 'hex')),
        decipher.final(),
    ]);

    return new Uint8Array(decrypted);
}

module.exports = { hashPin, verifyPin, encryptKey, decryptKey };
