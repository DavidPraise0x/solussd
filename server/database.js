// SolUSSD — Database layer using sql.js (pure JS SQLite)
const path = require('path');
const fs = require('fs');
const { DB_PATH } = require('./config');

let db = null;

/**
 * Initialize the SQLite database
 */
async function initDB() {
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();

    // Ensure data directory exists
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    // Load existing database or create new
    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
        console.log('  📂 Database loaded from', DB_PATH);
    } else {
        db = new SQL.Database();
        console.log('  📂 New database created at', DB_PATH);
    }

    // Create tables
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            phone TEXT PRIMARY KEY,
            public_key TEXT UNIQUE NOT NULL,
            encrypted_secret TEXT NOT NULL,
            pin_hash TEXT NOT NULL,
            created_at INTEGER DEFAULT (strftime('%s','now'))
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone TEXT NOT NULL REFERENCES users(phone),
            type TEXT NOT NULL,
            amount REAL NOT NULL,
            to_address TEXT,
            from_address TEXT,
            signature TEXT,
            status TEXT DEFAULT 'success',
            created_at INTEGER DEFAULT (strftime('%s','now'))
        )
    `);

    // Save immediately
    saveDB();
    return db;
}

/**
 * Persist database to disk
 */
function saveDB() {
    if (!db) return;
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
}

/**
 * Create a new user account
 */
function createUser(phone, publicKey, encryptedSecret, pinHash) {
    db.run(
        'INSERT INTO users (phone, public_key, encrypted_secret, pin_hash) VALUES (?, ?, ?, ?)',
        [phone, publicKey, encryptedSecret, pinHash]
    );
    saveDB();
}

/**
 * Get user by phone number
 */
function getUser(phone) {
    const stmt = db.prepare('SELECT * FROM users WHERE phone = ?');
    stmt.bind([phone]);
    if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return row;
    }
    stmt.free();
    return null;
}

/**
 * Get user by Solana public key
 */
function getUserByPublicKey(publicKey) {
    const stmt = db.prepare('SELECT * FROM users WHERE public_key = ?');
    stmt.bind([publicKey]);
    if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return row;
    }
    stmt.free();
    return null;
}

/**
 * Delete a user and their transactions
 */
function deleteUser(phone) {
    db.run('DELETE FROM transactions WHERE phone = ?', [phone]);
    db.run('DELETE FROM users WHERE phone = ?', [phone]);
    saveDB();
}

/**
 * Record a transaction
 */
function addTransaction(phone, type, amount, toAddress, fromAddress, signature, status = 'success') {
    db.run(
        `INSERT INTO transactions (phone, type, amount, to_address, from_address, signature, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [phone, type, amount, toAddress || null, fromAddress || null, signature, status]
    );
    saveDB();
}

/**
 * Get recent transactions for a user
 */
function getTransactions(phone, limit = 5) {
    const stmt = db.prepare(
        'SELECT * FROM transactions WHERE phone = ? ORDER BY created_at DESC LIMIT ?'
    );
    stmt.bind([phone, limit]);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

/**
 * Calculate simulated balance from transaction history
 * Airdrops/receives are positive, sends are negative
 */
function getSimBalance(phone) {
    const stmt = db.prepare(`
        SELECT 
            COALESCE(SUM(CASE 
                WHEN type IN ('airdrop', 'receive') THEN amount 
                WHEN type = 'send' THEN -(amount + 0.000005)
                ELSE 0 
            END), 0) as balance
        FROM transactions 
        WHERE phone = ? AND status = 'success'
    `);
    stmt.bind([phone]);
    let balance = 0;
    if (stmt.step()) {
        balance = stmt.getAsObject().balance;
    }
    stmt.free();
    // Avoid floating point issues
    return Math.round(balance * 1e9) / 1e9;
}

module.exports = {
    initDB, createUser, getUser, getUserByPublicKey,
    deleteUser, addTransaction, getTransactions, getSimBalance,
};
