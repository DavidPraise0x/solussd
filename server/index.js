/**
 * SolUSSD — Express server entry point
 *
 * Exposes three endpoints:
 *   POST /ussd      — Africa's Talking USSD callback (text/plain response)
 *   POST /api/ussd  — JSON wrapper for the web-based USSD simulator
 *   GET  /api/health — simple liveness probe
 *
 * Static files in ../public are served automatically so the frontend
 * simulator can be accessed from the same origin.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const { initDB } = require('./database');
const { processUSSD } = require('./ussd-engine');

const app = express();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the frontend simulator from ../public
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------------------------------------------------------------------------
// Initialise database (creates tables on first run)
// ---------------------------------------------------------------------------
initDB();

// ---------------------------------------------------------------------------
// Africa's Talking USSD callback
// ---------------------------------------------------------------------------
app.post('/ussd', async (req, res) => {
  const { sessionId, serviceCode, phoneNumber, text } = req.body;
  console.log(`[USSD] Session: ${sessionId} | Phone: ${phoneNumber} | Input: "${text}"`);

  try {
    const response = await processUSSD(sessionId, phoneNumber, text || '', serviceCode);
    console.log(`[USSD] Response: ${response.substring(0, 80)}...`);
    res.set('Content-Type', 'text/plain');
    res.send(response);
  } catch (err) {
    console.error('[USSD] Error:', err);
    res.set('Content-Type', 'text/plain');
    res.send('END An error occurred. Please try again.');
  }
});

// ---------------------------------------------------------------------------
// Web simulator API — same USSD logic, wrapped in JSON
// ---------------------------------------------------------------------------
app.post('/api/ussd', async (req, res) => {
  const { sessionId, phoneNumber, text } = req.body;

  try {
    const response = await processUSSD(
      sessionId || 'web_' + Date.now(),
      phoneNumber || '+2348000000000',
      text || '',
      '*384*1#',
    );
    res.json({ response });
  } catch (err) {
    console.error('[API] Error:', err);
    res.json({ response: 'END An error occurred.' });
  }
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'SolUSSD', network: 'devnet' });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
const server = app.listen(config.PORT, () => {
  console.log('');
  console.log('  ◎ SolUSSD Server running');
  console.log(`  > http://localhost:${config.PORT}`);
  console.log('  > USSD endpoint: POST /ussd');
  console.log('  > API endpoint:  POST /api/ussd');
  console.log('  > Network: Solana Devnet');
  console.log('');

  if (!process.env.RENDER) {
    startTunnel();
  } else {
    console.log('  🌐 Running on Render Cloud. Public tunnel skipped.');
  }
});


async function startTunnel() {
  const { spawn } = require('child_process');
  console.log('  📡 Initializing secure Serveo tunnel...');

  const ssh = spawn('ssh', [
    '-i', 'C:\\Users\\Hipiclab03\\.ssh\\id_ed25519',
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=3',
    '-R', `solussd-ng:80:localhost:${config.PORT}`,
    'serveo.net'
  ]);

  ssh.stdout.on('data', (data) => {
    const output = data.toString().trim();
    if (output) {
      console.log(`  [Tunnel]: ${output}`);
    }
  });

  ssh.stderr.on('data', (data) => {
    const error = data.toString().trim();
    // Ignore harmless ssh warning about non-interactive terminal allocation
    if (error && !error.includes('Pseudo-terminal')) {
      console.error(`  [Tunnel Warning]: ${error}`);
    }
  });

  ssh.on('close', (code) => {
    console.log(`  ❌ Tunnel process exited with code ${code}. Reconnecting in 5 seconds...`);
    setTimeout(startTunnel, 5000);
  });
}


