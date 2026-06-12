// SolUSSD — Configuration
require('dotenv').config();

module.exports = {
    PORT: parseInt(process.env.PORT) || 5500,
    SOLANA_RPC_URL: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || 'solussd-dev-key-change-in-prod-32',
    DB_PATH: process.env.DB_PATH || './data/solussd.db',
};
