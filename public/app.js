/**
 * SolUSSD Web Simulator — Frontend Client
 * ─────────────────────────────────────────
 * Thin client that drives the phone UI and talks to POST /api/ussd.
 * The backend owns all session state, wallet logic, and Solana calls.
 */

class USSDSimulator {
  constructor() {
    // Generate a unique session ID and random Nigerian phone number
    this.sessionId = 'web_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    this.phoneNumber = '+234' + '80' + Math.floor(Math.random() * 100000000).toString().padStart(8, '0');

    // Cumulative input segments sent to the backend as "1*2*3" etc.
    this.textHistory = [];
    this.sessionActive = false;
    this.isProcessing = false;

    // DOM references
    this.screenContent = document.getElementById('ussd-content');
    this.loader = document.getElementById('ussd-loader');
    this.loaderText = document.getElementById('loader-text');
    this.input = document.getElementById('ussd-input');
    this.display = document.getElementById('ussd-display');

    this.bindEvents();
    this.showIdleScreen();
  }

  // ─── Idle / Welcome Screen ──────────────────────────────────────
  showIdleScreen() {
    this.sessionActive = false;
    this.renderScreen(
      'SolUSSD v1.0\n' +
      '━━━━━━━━━━━━━━━━━\n\n' +
      'Dial *384*1# to start\n\n' +
      'Type the code above\n' +
      'and press Reply'
    );
  }

  // ─── Event Bindings ─────────────────────────────────────────────
  bindEvents() {
    // Reply button
    document.getElementById('btn-reply').addEventListener('click', () => this.submitInput());

    // Cancel button
    document.getElementById('btn-cancel').addEventListener('click', () => this.cancelSession());

    // Backspace / clear button
    document.getElementById('btn-clear').addEventListener('click', () => {
      this.input.value = '';
      this.input.focus();
    });

    // Enter key submits
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.submitInput();
      }
    });

    // Keypad — delegated click handler
    document.getElementById('keypad').addEventListener('click', (e) => {
      const key = e.target.closest('.key');
      if (!key) return;

      this.input.value += key.dataset.value;
      this.input.focus();

      // Tactile press animation
      key.style.transform = 'scale(0.92)';
      key.style.background = 'rgba(153,69,255,0.3)';
      setTimeout(() => {
        key.style.transform = '';
        key.style.background = '';
      }, 150);
    });

    // "Dial" shortcut button on the info panel
    document.getElementById('btn-dial').addEventListener('click', () => {
      this.input.value = '*384*1#';
      this.submitInput();
      document.querySelector('.phone-section').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  // ─── Submit User Input ──────────────────────────────────────────
  async submitInput() {
    if (this.isProcessing) return;

    const value = this.input.value.trim();
    this.input.value = '';
    if (!value) return;

    // Detect USSD dial code → start a fresh session
    if (value === '*384*1#' || value === '*384*1') {
      this.sessionId = 'web_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      this.textHistory = [];
      this.sessionActive = true;
      await this.sendToBackend('');
      return;
    }

    // If no active session, remind user to dial first
    if (!this.sessionActive) {
      this.showIdleScreen();
      return;
    }

    // Append to cumulative history and send "1*2*3" style text
    this.textHistory.push(value);
    const text = this.textHistory.join('*');
    await this.sendToBackend(text);
  }

  // ─── API Call ───────────────────────────────────────────────────
  async sendToBackend(text) {
    this.isProcessing = true;
    this.showLoader('Processing...');

    try {
      const res = await fetch('/api/ussd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.sessionId,
          phoneNumber: this.phoneNumber,
          text: text,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      let response = data.response || 'END An error occurred.';

      // Parse the CON / END prefix from Africa's Talking style responses
      if (response.startsWith('END ')) {
        // Session terminated by server
        this.sessionActive = false;
        this.textHistory = [];
        response = response.substring(4);
        this.hideLoader();
        this.renderScreen(response);
      } else if (response.startsWith('CON ')) {
        // Session continues — expect more input
        response = response.substring(4);
        this.hideLoader();
        this.renderScreen(response);
      } else {
        // Fallback — render whatever came back
        this.hideLoader();
        this.renderScreen(response);
      }
    } catch (err) {
      console.error('API Error:', err);
      this.hideLoader();
      this.renderScreen(
        'Connection error.\n' +
        'Server may be offline.\n\n' +
        'Dial *384*1# to retry.'
      );
      this.sessionActive = false;
      this.textHistory = [];
    }

    this.isProcessing = false;
  }

  // ─── Screen Rendering ──────────────────────────────────────────
  renderScreen(text) {
    const html = this.escapeHtml(text);

    this.screenContent.style.display = 'block';
    this.screenContent.innerHTML = html;

    // Trigger CSS transition
    this.screenContent.classList.remove('screen-transition');
    void this.screenContent.offsetWidth; // force reflow
    this.screenContent.classList.add('screen-transition');

    // Update input state
    this.input.disabled = false;
    this.input.type = 'text';
    this.input.placeholder = this.sessionActive ? 'Type response...' : 'Dial *384*1#...';
    this.input.focus();

    // Scroll display to top for fresh content
    this.display.scrollTop = 0;
  }

  // ─── Utilities ─────────────────────────────────────────────────
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/\n/g, '<br>');
  }

  showLoader(text) {
    this.screenContent.style.display = 'none';
    this.loader.style.display = 'flex';
    this.loaderText.textContent = text;
    this.input.disabled = true;
  }

  hideLoader() {
    this.loader.style.display = 'none';
    this.screenContent.style.display = 'block';
    this.input.disabled = false;
  }

  cancelSession() {
    if (this.isProcessing) return;
    this.sessionActive = false;
    this.textHistory = [];
    this.showIdleScreen();
  }
}

// ─── Boot ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  window.simulator = new USSDSimulator();
  console.log('🚀 SolUSSD Simulator ready');
  console.log('📱 Phone:', window.simulator.phoneNumber);
});
