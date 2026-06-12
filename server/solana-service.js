// SolUSSD — Solana Service: Real keypair generation + devnet operations
const solanaWeb3 = require('@solana/web3.js');
const config = require('./config');
const crypto = require('crypto');

// Lazy-initialized connection
let connection = null;

function getConnection() {
    if (!connection) {
        connection = new solanaWeb3.Connection(config.SOLANA_RPC_URL, {
            commitment: 'confirmed',
            confirmTransactionInitialTimeout: 60000,
        });
    }
    return connection;
}

/**
 * Generate a new Solana keypair
 */
function createWallet() {
    const keypair = solanaWeb3.Keypair.generate();
    return {
        publicKey: keypair.publicKey.toBase58(),
        secretKey: Array.from(keypair.secretKey),
    };
}

/**
 * Get real SOL balance from devnet
 */
async function getBalance(publicKeyBase58) {
    try {
        const conn = getConnection();
        const pubkey = new solanaWeb3.PublicKey(publicKeyBase58);
        const lamports = await conn.getBalance(pubkey);
        return lamports / solanaWeb3.LAMPORTS_PER_SOL;
    } catch (err) {
        console.error('getBalance error:', err.message);
        return 0;
    }
}

/**
 * Send SOL from one wallet to another (real devnet transaction)
 */
async function sendSOL(senderSecretKeyArray, toAddressBase58, amountSOL) {
    const conn = getConnection();
    const senderKeypair = solanaWeb3.Keypair.fromSecretKey(
        new Uint8Array(senderSecretKeyArray)
    );
    const recipientPubkey = new solanaWeb3.PublicKey(toAddressBase58);
    const lamports = Math.round(amountSOL * solanaWeb3.LAMPORTS_PER_SOL);

    const transaction = new solanaWeb3.Transaction().add(
        solanaWeb3.SystemProgram.transfer({
            fromPubkey: senderKeypair.publicKey,
            toPubkey: recipientPubkey,
            lamports,
        })
    );

    const signature = await solanaWeb3.sendAndConfirmTransaction(
        conn, transaction, [senderKeypair]
    );

    return signature;
}

/**
 * Request airdrop from devnet faucet with retries
 */
async function requestAirdrop(publicKeyBase58, amountSOL = 1) {
    const conn = getConnection();
    const pubkey = new solanaWeb3.PublicKey(publicKeyBase58);
    const lamports = Math.round(amountSOL * solanaWeb3.LAMPORTS_PER_SOL);
    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const { blockhash, lastValidBlockHeight } =
                await conn.getLatestBlockhash('confirmed');

            const signature = await conn.requestAirdrop(pubkey, lamports);

            await conn.confirmTransaction({
                signature, blockhash, lastValidBlockHeight,
            }, 'confirmed');

            return signature;
        } catch (err) {
            lastError = err;
            if (attempt < maxRetries) {
                await new Promise(r => setTimeout(r, attempt * 2000));
            }
        }
    }
    throw lastError || new Error('Airdrop failed');
}

/**
 * Validate a Solana address
 */
function isValidAddress(address) {
    try {
        new solanaWeb3.PublicKey(address);
        return true;
    } catch {
        return false;
    }
}

/**
 * Generate a realistic-looking simulated tx signature
 */
function generateSimSignature() {
    return 'sim_' + crypto.randomBytes(32).toString('hex');
}

module.exports = {
    createWallet, getBalance, sendSOL,
    requestAirdrop, isValidAddress, generateSimSignature,
};
