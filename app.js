/* ============================================
   SolUSSD — Solana on USSD Prototype
   Simulation Mode + Real Solana Keypairs
   ============================================ */

// ============================================
// SOLANA SERVICE (Simulation + Real Keypairs)
// ============================================
class SolanaService {
    constructor() {
        this.wallet = null;
        this.initialized = false;
        this.balance = 0; // in SOL, tracked locally
        this.transactions = []; // local tx history
        this.init();
    }

    init() {
        try {
            this.loadWallet();
            this.initialized = true;
            console.log('✅ SolUSSD initialized (Simulation Mode)');
        } catch (err) {
            console.error('❌ Init error:', err);
        }
    }

    loadWallet() {
        try {
            const stored = localStorage.getItem('solussd_wallet');
            if (stored) {
                const secretKey = new Uint8Array(JSON.parse(stored));
                this.wallet = solanaWeb3.Keypair.fromSecretKey(secretKey);
                // Restore balance
                const savedBalance = localStorage.getItem('solussd_balance');
                this.balance = savedBalance ? parseFloat(savedBalance) : 0;
                // Restore transactions
                const savedTx = localStorage.getItem('solussd_transactions');
                this.transactions = savedTx ? JSON.parse(savedTx) : [];
                console.log('🔑 Wallet loaded:', this.wallet.publicKey.toBase58());
                console.log('💰 Balance:', this.balance, 'SOL');
            }
        } catch (err) {
            console.error('Wallet load error:', err);
            localStorage.removeItem('solussd_wallet');
            localStorage.removeItem('solussd_balance');
            localStorage.removeItem('solussd_transactions');
        }
    }

    saveState() {
        localStorage.setItem('solussd_balance', this.balance.toString());
        localStorage.setItem('solussd_transactions', JSON.stringify(this.transactions));
    }

    createWallet() {
        this.wallet = solanaWeb3.Keypair.generate();
        this.balance = 0;
        this.transactions = [];
        localStorage.setItem(
            'solussd_wallet',
            JSON.stringify(Array.from(this.wallet.secretKey))
        );
        this.saveState();
        return this.wallet.publicKey.toBase58();
    }

    hasWallet() {
        return this.wallet !== null;
    }

    getAddress() {
        return this.wallet ? this.wallet.publicKey.toBase58() : null;
    }

    getShortAddress(addr) {
        if (!addr) addr = this.getAddress();
        if (!addr) return '—';
        return addr.slice(0, 6) + '...' + addr.slice(-4);
    }

    getBalance() {
        return this.balance;
    }

    // Generate a realistic-looking tx signature
    generateTxSignature() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789';
        let sig = '';
        for (let i = 0; i < 88; i++) {
            sig += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return sig;
    }

    async requestAirdrop(amountSOL = 1) {
        if (!this.wallet) throw new Error('No wallet');

        // Simulate network delay (feels realistic)
        await new Promise(r => setTimeout(r, 800 + Math.random() * 700));

        this.balance += amountSOL;
        const signature = this.generateTxSignature();

        this.transactions.unshift({
            type: 'airdrop',
            amount: amountSOL,
            signature,
            timestamp: Date.now(),
        });

        this.saveState();
        console.log(`✅ Airdrop: +${amountSOL} SOL | Balance: ${this.balance} SOL`);
        return signature;
    }

    async sendSOL(toAddress, amountSOL) {
        if (!this.wallet) throw new Error('No wallet');

        // Check balance
        const fee = 0.000005;
        const total = amountSOL + fee;
        if (this.balance < total) {
            throw new Error(`Insufficient balance. You have ${this.balance.toFixed(4)} SOL but need ${total.toFixed(6)} SOL (including fee).`);
        }

        // Simulate network delay
        await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));

        this.balance -= total;
        // Avoid floating point issues
        this.balance = Math.round(this.balance * 1e9) / 1e9;

        const signature = this.generateTxSignature();

        this.transactions.unshift({
            type: 'send',
            to: toAddress,
            amount: amountSOL,
            fee,
            signature,
            timestamp: Date.now(),
        });

        this.saveState();
        console.log(`✅ Sent: ${amountSOL} SOL to ${toAddress.slice(0, 8)}... | Balance: ${this.balance} SOL`);
        return signature;
    }

    // Simulate receiving SOL (for demo)
    async receiveSol(amount) {
        if (!this.wallet) throw new Error('No wallet');
        this.balance += amount;
        const signature = this.generateTxSignature();

        this.transactions.unshift({
            type: 'receive',
            amount,
            signature,
            timestamp: Date.now(),
        });

        this.saveState();
        return signature;
    }

    isValidAddress(address) {
        try {
            new solanaWeb3.PublicKey(address);
            return true;
        } catch {
            return false;
        }
    }

    getRecentTransactions(count = 5) {
        return this.transactions.slice(0, count);
    }

    deleteWallet() {
        this.wallet = null;
        this.balance = 0;
        this.transactions = [];
        localStorage.removeItem('solussd_wallet');
        localStorage.removeItem('solussd_pin');
        localStorage.removeItem('solussd_balance');
        localStorage.removeItem('solussd_transactions');
    }
}


// ============================================
// USSD ENGINE — State Machine
// ============================================
class USSDEngine {
    constructor(solanaService) {
        this.solana = solanaService;
        this.state = 'IDLE';
        this.pin = localStorage.getItem('solussd_pin') || null;
        this.temp = {};
        this.history = [];
    }

    getInitialScreen() {
        return this.renderScreen(
            'SolUSSD v1.0',
            [
                '',
                'Dial *384*1# to start',
                '',
                'Type the code above',
                'and press Reply'
            ],
            { noInput: true }
        );
    }

    async processInput(input) {
        input = (input || '').trim();

        // Handle USSD code dialing from any state
        if (input === '*384*1#' || input === '*384*1') {
            this.state = 'WELCOME';
            return this.showWelcome();
        }

        switch (this.state) {
            case 'IDLE': return this.handleIdle(input);
            case 'WELCOME': return this.handleWelcome(input);
            case 'CREATE_WALLET': return this.handleCreateWallet(input);
            case 'SET_PIN': return this.handleSetPin(input);
            case 'CONFIRM_PIN': return this.handleConfirmPin(input);
            case 'ENTER_PIN': return this.handleEnterPin(input);
            case 'BALANCE': return this.handleBalance(input);
            case 'SEND_ADDRESS': return this.handleSendAddress(input);
            case 'SEND_AMOUNT': return this.handleSendAmount(input);
            case 'SEND_CONFIRM': return this.handleSendConfirm(input);
            case 'RECEIVE': return this.handleReceive(input);
            case 'AIRDROP': return this.handleAirdrop(input);
            case 'TX_HISTORY': return this.handleTxHistory(input);
            case 'RESET_CONFIRM': return this.handleResetConfirm(input);
            default:
                this.state = 'IDLE';
                return this.getInitialScreen();
        }
    }

    // --- Screen Renderers ---

    renderScreen(title, lines, options = {}) {
        const divider = '━━━━━━━━━━━━━━━━━';
        let html = '';

        if (title) {
            html += `<span class="ussd-header">${this.esc(title)}</span>`;
            html += `<span class="ussd-divider">${divider}</span>`;
        }

        lines.forEach(line => {
            html += this.esc(line) + '\n';
        });

        return {
            html,
            expectInput: !options.noInput,
            isLoading: !!options.loading,
            loadingText: options.loadingText || 'Processing...',
            inputType: options.inputType || 'text',
            placeholder: options.placeholder || 'Type response...'
        };
    }

    esc(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // --- State Handlers ---

    handleIdle(input) {
        if (input.startsWith('*') && input.endsWith('#')) {
            if (input === '*384*1#') {
                this.state = 'WELCOME';
                return this.showWelcome();
            }
            return this.renderScreen('Error', [
                '', 'Invalid USSD code.',
                'Please dial *384*1#'
            ]);
        }
        return this.getInitialScreen();
    }

    showWelcome() {
        const has = this.solana.hasWallet();
        const lines = [
            '',
            '1. ' + (has ? 'Account Info' : 'Create Account'),
            '2. Check Balance',
            '3. Send SOL',
            '4. Receive SOL',
            '5. Fund Wallet (Free)',
            '6. Transaction History',
        ];
        if (has) lines.push('7. Reset Account');
        lines.push('', '0. Exit');

        return this.renderScreen('SolUSSD *384*1#', lines, {
            placeholder: 'Select option...'
        });
    }

    handleWelcome(input) {
        const has = this.solana.hasWallet();

        switch (input) {
            case '1':
                if (has) return this.showAccountInfo();
                this.state = 'CREATE_WALLET';
                return this.createWallet();

            case '2':
                if (!has) return this.noWalletError();
                if (this.pin) {
                    this.temp.nextState = 'BALANCE';
                    this.state = 'ENTER_PIN';
                    return this.showPinPrompt('Check Balance');
                }
                this.state = 'BALANCE';
                return this.showBalance();

            case '3':
                if (!has) return this.noWalletError();
                if (this.pin) {
                    this.temp.nextState = 'SEND_ADDRESS';
                    this.state = 'ENTER_PIN';
                    return this.showPinPrompt('Send SOL');
                }
                this.state = 'SEND_ADDRESS';
                return this.showSendAddress();

            case '4':
                if (!has) return this.noWalletError();
                this.state = 'RECEIVE';
                return this.showReceive();

            case '5':
                if (!has) return this.noWalletError();
                this.state = 'AIRDROP';
                return this.showAirdropConfirm();

            case '6':
                if (!has) return this.noWalletError();
                this.state = 'TX_HISTORY';
                return this.showTxHistory();

            case '7':
                if (has) {
                    this.state = 'RESET_CONFIRM';
                    return this.showResetConfirm();
                }
                return this.showWelcome();

            case '0':
                this.state = 'IDLE';
                return this.renderScreen('Session Ended', [
                    '', 'Thank you for using', 'SolUSSD.', '',
                    'Dial *384*1# to', 'start again.'
                ], { noInput: true });

            default:
                return this.renderScreen('SolUSSD *384*1#', [
                    '', '⚠ Invalid option.', 'Please select 1-7.', '',
                    '0. Back to menu'
                ], { placeholder: 'Select option...' });
        }
    }

    // 1. Create Wallet
    createWallet() {
        return {
            ...this.renderScreen('', []),
            isLoading: true,
            loadingText: 'Creating wallet...',
            asyncAction: async () => {
                await new Promise(r => setTimeout(r, 600));
                const address = this.solana.createWallet();
                this.state = 'SET_PIN';
                return this.renderScreen('✓ Wallet Created!', [
                    '',
                    'Your Solana address:',
                    this.solana.getShortAddress(address),
                    '',
                    'Full address:',
                    address.slice(0, 22),
                    address.slice(22),
                    '',
                    'Set a 4-digit PIN to',
                    'secure your account:'
                ], {
                    placeholder: 'Enter 4-digit PIN...',
                    inputType: 'password'
                });
            }
        };
    }

    // Set PIN
    handleSetPin(input) {
        if (!/^\d{4}$/.test(input)) {
            return this.renderScreen('Set PIN', [
                '', '⚠ PIN must be exactly',
                '4 digits (0-9).', '', 'Enter your PIN:'
            ], { placeholder: 'Enter 4-digit PIN...', inputType: 'password' });
        }
        this.temp.newPin = input;
        this.state = 'CONFIRM_PIN';
        return this.renderScreen('Confirm PIN', [
            '', 'Re-enter your 4-digit', 'PIN to confirm:'
        ], { placeholder: 'Confirm PIN...', inputType: 'password' });
    }

    handleConfirmPin(input) {
        if (input !== this.temp.newPin) {
            this.state = 'SET_PIN';
            delete this.temp.newPin;
            return this.renderScreen('PIN Mismatch', [
                '', '⚠ PINs do not match.', '', 'Enter a new 4-digit PIN:'
            ], { placeholder: 'Enter 4-digit PIN...', inputType: 'password' });
        }

        this.pin = input;
        localStorage.setItem('solussd_pin', this.pin);
        delete this.temp.newPin;
        this.state = 'WELCOME';

        return this.renderScreen('✓ Account Ready!', [
            '', 'Your SolUSSD account', 'is now set up.', '',
            'PIN saved securely.', '',
            'Select "Fund Wallet" to', 'get test SOL.', '',
            '0. Main Menu'
        ], { placeholder: 'Press 0...' });
    }

    // Account Info
    showAccountInfo() {
        const addr = this.solana.getAddress();
        const bal = this.solana.getBalance();
        return this.renderScreen('Account Info', [
            '',
            'Address:',
            this.solana.getShortAddress(),
            '',
            'Full address:',
            addr.slice(0, 22),
            addr.slice(22),
            '',
            'Balance: ◎ ' + bal.toFixed(4) + ' SOL',
            'Network: Solana (Sim)',
            '',
            '0. Main Menu'
        ], { placeholder: 'Press 0...' });
    }

    // PIN Prompt
    showPinPrompt(action) {
        return this.renderScreen(action, [
            '', 'Enter your 4-digit PIN:'
        ], { placeholder: 'Enter PIN...', inputType: 'password' });
    }

    handleEnterPin(input) {
        if (input !== this.pin) {
            return this.renderScreen('⚠ Wrong PIN', [
                '', 'Incorrect PIN.', 'Please try again:',
            ], { placeholder: 'Enter PIN...', inputType: 'password' });
        }

        const nextState = this.temp.nextState;
        delete this.temp.nextState;

        switch (nextState) {
            case 'BALANCE':
                this.state = 'BALANCE';
                return this.showBalance();
            case 'SEND_ADDRESS':
                this.state = 'SEND_ADDRESS';
                return this.showSendAddress();
            default:
                this.state = 'WELCOME';
                return this.showWelcome();
        }
    }

    // 2. Check Balance
    showBalance() {
        return {
            isLoading: true,
            loadingText: 'Fetching balance...',
            html: '',
            expectInput: false,
            asyncAction: async () => {
                await new Promise(r => setTimeout(r, 500));
                const balance = this.solana.getBalance();
                this.state = 'WELCOME';
                return this.renderScreen('Account Balance', [
                    '',
                    '◎ ' + balance.toFixed(4) + ' SOL',
                    '',
                    'Address:',
                    this.solana.getShortAddress(),
                    '',
                    '0. Main Menu'
                ], { placeholder: 'Press 0...' });
            }
        };
    }

    handleBalance(input) {
        this.state = 'WELCOME';
        return this.showWelcome();
    }

    // 3. Send SOL
    showSendAddress() {
        return this.renderScreen('Send SOL', [
            '', 'Enter the recipient\'s', 'Solana address:', '', '0. Cancel'
        ], { placeholder: 'Paste/type address...' });
    }

    handleSendAddress(input) {
        if (input === '0') { this.state = 'WELCOME'; return this.showWelcome(); }

        if (!this.solana.isValidAddress(input)) {
            return this.renderScreen('⚠ Invalid Address', [
                '', 'That is not a valid', 'Solana address.', '',
                'Enter address again:', '', '0. Cancel'
            ], { placeholder: 'Paste/type address...' });
        }

        if (input === this.solana.getAddress()) {
            return this.renderScreen('⚠ Error', [
                '', 'Cannot send to your', 'own address.', '',
                'Enter address:', '', '0. Cancel'
            ], { placeholder: 'Paste/type address...' });
        }

        this.temp.sendTo = input;
        this.state = 'SEND_AMOUNT';

        const bal = this.solana.getBalance();
        return this.renderScreen('Send SOL', [
            '',
            'To: ' + this.solana.getShortAddress(input),
            'Balance: ◎ ' + bal.toFixed(4) + ' SOL',
            '',
            'Enter amount in SOL:',
            '', '0. Cancel'
        ], { placeholder: 'e.g. 0.1' });
    }

    handleSendAmount(input) {
        if (input === '0') { this.state = 'WELCOME'; return this.showWelcome(); }

        const amount = parseFloat(input);

        if (isNaN(amount) || amount <= 0) {
            return this.renderScreen('⚠ Invalid Amount', [
                '', 'Please enter a valid', 'amount greater than 0.', '',
                'Enter amount in SOL:', '', '0. Cancel'
            ], { placeholder: 'e.g. 0.1' });
        }

        const balance = this.solana.getBalance();
        if (amount + 0.000005 > balance) {
            return this.renderScreen('⚠ Insufficient Balance', [
                '',
                'You have ◎ ' + balance.toFixed(4) + ' SOL',
                'but need ◎ ' + (amount + 0.000005).toFixed(6),
                '(including fee).',
                '',
                'Enter a smaller amount:', '', '0. Cancel'
            ], { placeholder: 'e.g. 0.1' });
        }

        this.temp.sendAmount = amount;
        this.state = 'SEND_CONFIRM';

        return this.renderScreen('Confirm Transfer', [
            '',
            'To:     ' + this.solana.getShortAddress(this.temp.sendTo),
            'Amount: ◎ ' + amount.toFixed(4) + ' SOL',
            'Fee:    ~0.000005 SOL',
            '',
            '1. ✓ Confirm & Send',
            '2. ✕ Cancel'
        ], { placeholder: 'Select 1 or 2...' });
    }

    handleSendConfirm(input) {
        if (input === '2' || input === '0') {
            this.state = 'WELCOME';
            delete this.temp.sendTo;
            delete this.temp.sendAmount;
            return this.showWelcome();
        }

        if (input !== '1') {
            return this.renderScreen('Confirm Transfer', [
                '', 'Please select:', '',
                '1. ✓ Confirm & Send', '2. ✕ Cancel'
            ], { placeholder: 'Select 1 or 2...' });
        }

        const to = this.temp.sendTo;
        const amount = this.temp.sendAmount;

        return {
            isLoading: true,
            loadingText: 'Sending ◎ ' + amount.toFixed(4) + ' SOL...',
            html: '',
            expectInput: false,
            asyncAction: async () => {
                try {
                    const signature = await this.solana.sendSOL(to, amount);
                    this.state = 'WELCOME';
                    delete this.temp.sendTo;
                    delete this.temp.sendAmount;

                    const shortSig = signature.slice(0, 8) + '...' + signature.slice(-4);
                    const newBal = this.solana.getBalance();

                    return this.renderScreen('✓ Transfer Sent!', [
                        '',
                        'Amount: ◎ ' + amount.toFixed(4) + ' SOL',
                        'To: ' + this.solana.getShortAddress(to),
                        'Tx: ' + shortSig,
                        '',
                        'New balance:',
                        '◎ ' + newBal.toFixed(4) + ' SOL',
                        '',
                        '0. Main Menu'
                    ], { placeholder: 'Press 0...' });
                } catch (err) {
                    this.state = 'WELCOME';
                    return this.renderScreen('✕ Transfer Failed', [
                        '', err.message || 'Transaction failed.', '',
                        'Your SOL was not sent.', '', '0. Main Menu'
                    ], { placeholder: 'Press 0...' });
                }
            }
        };
    }

    // 4. Receive SOL
    showReceive() {
        const addr = this.solana.getAddress();
        return this.renderScreen('Receive SOL', [
            '',
            'Your Solana Address:',
            '',
            addr.slice(0, 22),
            addr.slice(22),
            '',
            'Share this address to',
            'receive SOL payments.',
            '',
            '0. Main Menu'
        ], { placeholder: 'Press 0...' });
    }

    handleReceive(input) {
        this.state = 'WELCOME';
        return this.showWelcome();
    }

    // 5. Fund Wallet (Simulated Airdrop)
    showAirdropConfirm() {
        return this.renderScreen('Fund Wallet', [
            '',
            'Add test SOL to your',
            'wallet for demo.',
            '',
            'Select amount:',
            '',
            '1. + 1.0 SOL',
            '2. + 5.0 SOL',
            '3. + 10.0 SOL',
            '',
            '0. Cancel'
        ], { placeholder: 'Select 1, 2, or 3...' });
    }

    handleAirdrop(input) {
        if (input === '0') {
            this.state = 'WELCOME';
            return this.showWelcome();
        }

        let amount;
        switch (input) {
            case '1': amount = 1; break;
            case '2': amount = 5; break;
            case '3': amount = 10; break;
            default: return this.showAirdropConfirm();
        }

        return {
            isLoading: true,
            loadingText: 'Funding wallet...',
            html: '',
            expectInput: false,
            asyncAction: async () => {
                const sig = await this.solana.requestAirdrop(amount);
                const shortSig = sig.slice(0, 8) + '...' + sig.slice(-4);
                const newBal = this.solana.getBalance();
                this.state = 'WELCOME';

                return this.renderScreen('✓ Wallet Funded!', [
                    '',
                    '+' + amount.toFixed(4) + ' SOL added!',
                    '',
                    'Tx: ' + shortSig,
                    '',
                    'New balance:',
                    '◎ ' + newBal.toFixed(4) + ' SOL',
                    '',
                    '0. Main Menu'
                ], { placeholder: 'Press 0...' });
            }
        };
    }

    // 6. Transaction History
    showTxHistory() {
        const txs = this.solana.getRecentTransactions(5);

        if (txs.length === 0) {
            this.state = 'WELCOME';
            return this.renderScreen('Transactions', [
                '', 'No transactions yet.', '',
                'Fund your wallet to', 'get started.', '',
                '0. Main Menu'
            ], { placeholder: 'Press 0...' });
        }

        const lines = [''];
        txs.forEach((tx, i) => {
            const time = new Date(tx.timestamp).toLocaleTimeString([], {
                hour: '2-digit', minute: '2-digit'
            });

            if (tx.type === 'airdrop') {
                lines.push(`${i + 1}. ▼ +${tx.amount.toFixed(2)} SOL`);
                lines.push(`   Fund  ${time}`);
            } else if (tx.type === 'send') {
                const short = tx.to.slice(0, 6) + '..';
                lines.push(`${i + 1}. ▲ -${tx.amount.toFixed(2)} SOL`);
                lines.push(`   → ${short}  ${time}`);
            } else if (tx.type === 'receive') {
                lines.push(`${i + 1}. ▼ +${tx.amount.toFixed(2)} SOL`);
                lines.push(`   Received  ${time}`);
            }
            lines.push('');
        });

        lines.push('0. Main Menu');

        return this.renderScreen('Recent Transactions', lines, {
            placeholder: 'Press 0...'
        });
    }

    handleTxHistory(input) {
        this.state = 'WELCOME';
        return this.showWelcome();
    }

    // 7. Reset Account
    showResetConfirm() {
        return this.renderScreen('⚠ Reset Account', [
            '', 'This will DELETE your',
            'wallet and all data.', '',
            'This cannot be undone!', '',
            '1. Yes, reset everything',
            '2. No, go back'
        ], { placeholder: 'Select 1 or 2...' });
    }

    handleResetConfirm(input) {
        if (input === '1') {
            this.solana.deleteWallet();
            this.pin = null;
            this.temp = {};
            this.state = 'WELCOME';
            return this.renderScreen('✓ Account Reset', [
                '', 'All data has been', 'cleared.', '',
                'Create a new account', 'to get started.', '',
                '0. Main Menu'
            ], { placeholder: 'Press 0...' });
        }
        this.state = 'WELCOME';
        return this.showWelcome();
    }

    // Error Helpers
    noWalletError() {
        return this.renderScreen('⚠ No Account', [
            '', 'You need to create an', 'account first.', '',
            'Select option 1 from', 'the main menu.', '',
            '0. Main Menu'
        ], { placeholder: 'Press 0...' });
    }

    cancelSession() {
        this.state = 'IDLE';
        this.temp = {};
        return this.getInitialScreen();
    }
}


// ============================================
// UI CONTROLLER
// ============================================
class UIController {
    constructor() {
        this.solana = new SolanaService();
        this.ussd = new USSDEngine(this.solana);

        // DOM refs
        this.screenContent = document.getElementById('ussd-content');
        this.loader = document.getElementById('ussd-loader');
        this.loaderText = document.getElementById('loader-text');
        this.input = document.getElementById('ussd-input');
        this.display = document.getElementById('ussd-display');

        this.isProcessing = false;

        this.bindEvents();
        this.showScreen(this.ussd.getInitialScreen());
    }

    bindEvents() {
        // Reply button
        document.getElementById('btn-reply').addEventListener('click', () => {
            this.submitInput();
        });

        // Cancel button
        document.getElementById('btn-cancel').addEventListener('click', () => {
            this.cancelSession();
        });

        // Clear button
        document.getElementById('btn-clear').addEventListener('click', () => {
            this.input.value = '';
            this.input.focus();
        });

        // Enter key
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.submitInput();
            }
        });

        // Keypad buttons
        document.getElementById('keypad').addEventListener('click', (e) => {
            const key = e.target.closest('.key');
            if (!key) return;
            const value = key.dataset.value;
            this.input.value += value;
            this.input.focus();
            key.classList.add('key-pressed');
            setTimeout(() => key.classList.remove('key-pressed'), 150);
        });

        // Dial button (on info panel)
        document.getElementById('btn-dial').addEventListener('click', () => {
            this.input.value = '*384*1#';
            this.submitInput();
            document.querySelector('.phone-section').scrollIntoView({
                behavior: 'smooth', block: 'center'
            });
        });
    }

    async submitInput() {
        if (this.isProcessing) return;

        const value = this.input.value.trim();
        this.input.value = '';

        if (!value && this.ussd.state === 'IDLE') return;

        this.isProcessing = true;
        const result = await this.ussd.processInput(value);
        await this.showScreen(result);
        this.isProcessing = false;
    }

    async showScreen(screenData) {
        if (!screenData) return;

        if (screenData.isLoading && screenData.asyncAction) {
            this.showLoader(screenData.loadingText);
            try {
                const result = await screenData.asyncAction();
                this.hideLoader();
                this.renderContent(result);
            } catch (err) {
                this.hideLoader();
                this.renderContent(
                    this.ussd.renderScreen('⚠ Error', [
                        '', err.message || 'An error occurred.', '', '0. Main Menu'
                    ])
                );
            }
            return;
        }

        this.renderContent(screenData);
    }

    renderContent(data) {
        this.screenContent.style.display = 'block';
        this.screenContent.innerHTML = data.html;
        this.screenContent.classList.remove('screen-transition');
        void this.screenContent.offsetWidth;
        this.screenContent.classList.add('screen-transition');

        this.input.disabled = false;
        this.input.placeholder = data.placeholder || 'Type response...';
        this.input.type = data.inputType === 'password' ? 'password' : 'text';
        this.input.focus();

        this.display.scrollTop = 0;
    }

    showLoader(text) {
        this.screenContent.style.display = 'none';
        this.loader.classList.add('active');
        this.loaderText.textContent = text || 'Processing...';
        this.input.disabled = true;
    }

    hideLoader() {
        this.loader.classList.remove('active');
        this.screenContent.style.display = 'block';
        this.input.disabled = false;
    }

    cancelSession() {
        if (this.isProcessing) return;
        const screen = this.ussd.cancelSession();
        this.showScreen(screen);
    }
}


// ============================================
// INITIALIZE
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    const checkAndInit = () => {
        if (typeof solanaWeb3 !== 'undefined') {
            console.log('🚀 SolUSSD initializing...');
            window.app = new UIController();
            console.log('✅ SolUSSD ready (Simulation Mode)');
            console.log('ℹ️  Real Solana keypairs + simulated transactions for reliable demo');
        } else {
            console.log('⏳ Waiting for Solana web3.js...');
            setTimeout(checkAndInit, 200);
        }
    };
    checkAndInit();
});

// Pressed key style
const dynamicStyle = document.createElement('style');
dynamicStyle.textContent = `.key-pressed { background: rgba(153, 69, 255, 0.3) !important; transform: scale(0.92) !important; }`;
document.head.appendChild(dynamicStyle);
