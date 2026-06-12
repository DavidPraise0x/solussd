// SolUSSD — USSD Engine: Africa's Talking format state machine
// Processes cumulative text input (e.g. "1*1234*1234") and returns CON/END responses

const db = require('./database');
const solana = require('./solana-service');
const { hashPin, verifyPin, encryptKey, decryptKey } = require('./security');

const DIVIDER = '━━━━━━━━━━━━━━━━━';

/**
 * Shorten a Solana address for display
 */
function shortAddr(addr) {
    if (!addr || addr.length < 12) return addr || '—';
    return addr.slice(0, 6) + '...' + addr.slice(-4);
}

/**
 * Main USSD processor — Africa's Talking compatible
 * 
 * @param {string} sessionId - Unique session identifier
 * @param {string} phoneNumber - User's phone number (e.g. +2348012345678)
 * @param {string} text - Cumulative asterisk-separated input ("" then "1" then "1*1234")
 * @param {string} serviceCode - USSD service code (e.g. *384*1#)
 * @returns {string} Response prefixed with CON (continue) or END (end session)
 */
async function processUSSD(sessionId, phoneNumber, text, serviceCode) {
    const segments = text.split('*').filter(s => s !== '');
    const user = db.getUser(phoneNumber);
    const code = serviceCode || '*384*1#';

    try {
        // ========================================
        // NO USER — Registration flow
        // ========================================
        if (!user) {
            return await handleNewUser(phoneNumber, segments, code);
        }

        // ========================================
        // EXISTING USER — Main menu flow
        // ========================================
        return await handleExistingUser(phoneNumber, user, segments, code);

    } catch (err) {
        console.error('[USSD Engine] Error:', err);
        return `END An error occurred.\nPlease try again.\nDial ${code}`;
    }
}

/**
 * Handle new user registration flow
 */
async function handleNewUser(phone, segments, code) {
    // Level 0: Welcome screen
    if (segments.length === 0) {
        return [
            'CON Welcome to SolUSSD!',
            DIVIDER,
            'Solana on any phone.',
            '',
            '1. Create Account',
            '0. Exit',
        ].join('\n');
    }

    // Exit
    if (segments[0] === '0') {
        return `END Thank you for using SolUSSD!\nDial ${code} anytime.`;
    }

    // Not creating account
    if (segments[0] !== '1') {
        return `END Invalid option.\nDial ${code} to try again.`;
    }

    // Level 1: Ask for PIN
    if (segments.length === 1) {
        return 'CON Create Account\n' + DIVIDER + '\nSet a 4-digit PIN:';
    }

    // Level 2: Validate PIN, ask for confirmation
    if (segments.length === 2) {
        const pin = segments[1];
        if (!/^\d{4}$/.test(pin)) {
            return `END Invalid PIN. Must be\nexactly 4 digits.\n\nDial ${code} to retry.`;
        }
        return 'CON Confirm your 4-digit PIN:';
    }

    // Level 3: Confirm PIN, create account
    if (segments.length === 3) {
        const pin = segments[1];
        const confirmPin = segments[2];

        if (pin !== confirmPin) {
            return `END PINs do not match.\n\nDial ${code} to try again.`;
        }

        // Create wallet
        const wallet = solana.createWallet();
        const pinHash = await hashPin(pin);
        const encryptedSecret = encryptKey(wallet.secretKey, pin);

        // Save to database
        db.createUser(phone, wallet.publicKey, encryptedSecret, pinHash);

        return [
            'END ✓ Account Created!',
            DIVIDER,
            'Address:',
            shortAddr(wallet.publicKey),
            '',
            'PIN saved securely.',
            '',
            `Dial ${code} to start.`,
        ].join('\n');
    }

    return `END Invalid input.\nDial ${code} to retry.`;
}

/**
 * Handle existing user menu flows
 */
async function handleExistingUser(phone, user, segments, code) {
    // Level 0: Main menu
    if (segments.length === 0) {
        const balance = db.getSimBalance(phone);
        return [
            `CON SolUSSD ${code}`,
            DIVIDER,
            `Balance: ${balance.toFixed(4)} SOL`,
            '',
            '1. Check Balance',
            '2. Send SOL',
            '3. Receive SOL',
            '4. Fund Wallet',
            '5. Transactions',
            '6. Account Info',
            '0. Exit',
        ].join('\n');
    }

    const choice = segments[0];

    // Exit
    if (choice === '0') {
        return `END Thank you for using\nSolUSSD!\n\nDial ${code} anytime.`;
    }

    switch (choice) {
        case '1': return await handleCheckBalance(phone, user, segments, code);
        case '2': return await handleSendSOL(phone, user, segments, code);
        case '3': return handleReceive(user);
        case '4': return await handleFundWallet(phone, user, segments, code);
        case '5': return handleTransactions(phone, code);
        case '6': return handleAccountInfo(user);
        default:
            return `END Invalid option.\nDial ${code} to try again.`;
    }
}

// ==========================================
// 1. CHECK BALANCE
// ==========================================
async function handleCheckBalance(phone, user, segments, code) {
    // Level 1: Ask for PIN
    if (segments.length === 1) {
        return 'CON Check Balance\n' + DIVIDER + '\nEnter your PIN:';
    }

    // Level 2: Verify PIN, show balance
    if (segments.length === 2) {
        const pin = segments[1];
        const valid = await verifyPin(pin, user.pin_hash);
        if (!valid) {
            return `END Wrong PIN.\n\nDial ${code} to retry.`;
        }

        const balance = db.getSimBalance(phone);
        return [
            'END Account Balance',
            DIVIDER,
            '',
            `◎ ${balance.toFixed(4)} SOL`,
            '',
            `Address: ${shortAddr(user.public_key)}`,
        ].join('\n');
    }

    return `END Invalid input.\nDial ${code}`;
}

// ==========================================
// 2. SEND SOL
// ==========================================
async function handleSendSOL(phone, user, segments, code) {
    // Level 1: Ask for PIN
    if (segments.length === 1) {
        return 'CON Send SOL\n' + DIVIDER + '\nEnter your PIN:';
    }

    // Level 2: Verify PIN, ask for address
    if (segments.length === 2) {
        const pin = segments[1];
        const valid = await verifyPin(pin, user.pin_hash);
        if (!valid) {
            return `END Wrong PIN.\n\nDial ${code} to retry.`;
        }
        return 'CON Enter recipient\nSolana address:';
    }

    // Level 3: Validate address, ask for amount
    if (segments.length === 3) {
        const address = segments[2];
        if (!solana.isValidAddress(address)) {
            return `END Invalid Solana address.\n\nDial ${code} to retry.`;
        }
        if (address === user.public_key) {
            return `END Cannot send to your\nown address.\n\nDial ${code} to retry.`;
        }
        const balance = db.getSimBalance(phone);
        return [
            'CON Send SOL',
            `To: ${shortAddr(address)}`,
            `Balance: ${balance.toFixed(4)} SOL`,
            '',
            'Enter amount in SOL:',
        ].join('\n');
    }

    // Level 4: Validate amount, confirm
    if (segments.length === 4) {
        const address = segments[2];
        const amount = parseFloat(segments[3]);

        if (isNaN(amount) || amount <= 0) {
            return `END Invalid amount.\n\nDial ${code} to retry.`;
        }

        const balance = db.getSimBalance(phone);
        const total = amount + 0.000005;
        if (total > balance) {
            return `END Insufficient balance.\nYou have ${balance.toFixed(4)} SOL\nbut need ${total.toFixed(6)} SOL.\n\nDial ${code}`;
        }

        return [
            'CON Confirm Transfer',
            DIVIDER,
            `To:   ${shortAddr(address)}`,
            `Amt:  ${amount.toFixed(4)} SOL`,
            'Fee:  ~0.000005 SOL',
            '',
            '1. ✓ Confirm',
            '2. ✕ Cancel',
        ].join('\n');
    }

    // Level 5: Execute or cancel
    if (segments.length === 5) {
        const confirmation = segments[4];

        if (confirmation === '2') {
            return `END Transaction cancelled.\n\nDial ${code}`;
        }

        if (confirmation !== '1') {
            return 'CON Please select:\n1. ✓ Confirm\n2. ✕ Cancel';
        }

        const address = segments[2];
        const amount = parseFloat(segments[3]);

        // Check balance again
        const balance = db.getSimBalance(phone);
        if (amount + 0.000005 > balance) {
            return `END Insufficient balance.\n\nDial ${code}`;
        }

        // Record simulated transaction
        const signature = solana.generateSimSignature();
        db.addTransaction(phone, 'send', amount, address, user.public_key, signature);

        const newBal = db.getSimBalance(phone);
        return [
            'END ✓ Transfer Sent!',
            DIVIDER,
            `Amount: ${amount.toFixed(4)} SOL`,
            `To: ${shortAddr(address)}`,
            `Tx: ${signature.slice(0, 12)}...`,
            '',
            `New balance: ${newBal.toFixed(4)} SOL`,
        ].join('\n');
    }

    return `END Invalid input.\nDial ${code}`;
}

// ==========================================
// 3. RECEIVE SOL
// ==========================================
function handleReceive(user) {
    const addr = user.public_key;
    return [
        'END Receive SOL',
        DIVIDER,
        'Your Solana Address:',
        '',
        addr.slice(0, 22),
        addr.slice(22),
        '',
        'Share this address to',
        'receive SOL payments.',
    ].join('\n');
}

// ==========================================
// 4. FUND WALLET (Simulated airdrop)
// ==========================================
async function handleFundWallet(phone, user, segments, code) {
    // Level 1: Select amount
    if (segments.length === 1) {
        return [
            'CON Fund Wallet',
            DIVIDER,
            'Add test SOL:',
            '',
            '1. + 1 SOL',
            '2. + 5 SOL',
            '3. + 10 SOL',
            '0. Cancel',
        ].join('\n');
    }

    // Level 2: Execute funding
    if (segments.length === 2) {
        const choice = segments[1];

        if (choice === '0') {
            return `END Cancelled.\nDial ${code}`;
        }

        const amounts = { '1': 1, '2': 5, '3': 10 };
        const amount = amounts[choice];

        if (!amount) {
            return `END Invalid option.\nDial ${code} to retry.`;
        }

        // Record simulated airdrop
        const signature = solana.generateSimSignature();
        db.addTransaction(phone, 'airdrop', amount, null, null, signature);

        const newBal = db.getSimBalance(phone);
        return [
            'END ✓ Wallet Funded!',
            DIVIDER,
            `+${amount.toFixed(4)} SOL added`,
            '',
            `New balance:`,
            `◎ ${newBal.toFixed(4)} SOL`,
            '',
            `Dial ${code} to continue.`,
        ].join('\n');
    }

    return `END Invalid input.\nDial ${code}`;
}

// ==========================================
// 5. TRANSACTION HISTORY
// ==========================================
function handleTransactions(phone, code) {
    const txs = db.getTransactions(phone, 5);

    if (txs.length === 0) {
        return `END No transactions yet.\n\nFund your wallet first.\nDial ${code}`;
    }

    const lines = ['END Recent Transactions', DIVIDER, ''];
    txs.forEach((tx, i) => {
        const date = new Date(tx.created_at * 1000);
        const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (tx.type === 'airdrop') {
            lines.push(`${i + 1}. ▼ +${tx.amount.toFixed(2)} SOL`);
            lines.push(`   Fund  ${time}`);
        } else if (tx.type === 'send') {
            lines.push(`${i + 1}. ▲ -${tx.amount.toFixed(2)} SOL`);
            lines.push(`   → ${shortAddr(tx.to_address)}  ${time}`);
        } else if (tx.type === 'receive') {
            lines.push(`${i + 1}. ▼ +${tx.amount.toFixed(2)} SOL`);
            lines.push(`   Received  ${time}`);
        }
        lines.push('');
    });

    return lines.join('\n');
}

// ==========================================
// 6. ACCOUNT INFO
// ==========================================
function handleAccountInfo(user) {
    const addr = user.public_key;
    return [
        'END Account Info',
        DIVIDER,
        '',
        'Address:',
        shortAddr(addr),
        '',
        'Full address:',
        addr.slice(0, 22),
        addr.slice(22),
        '',
        'Network: Solana Devnet',
    ].join('\n');
}

module.exports = { processUSSD };
