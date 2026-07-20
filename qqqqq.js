// ============================================
// Clean Frontend - Aincrad Only, Auto Key, Auto Redirect
// ============================================
(function() {
  // ============================================
  // TOTP Generator
  // ============================================
  function base32ToHex(base32) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    let hex = '';
    
    base32 = base32.toUpperCase().replace(/\s/g, '').replace(/=+$/, '');
    
    for (let i = 0; i < base32.length; i++) {
      const val = alphabet.indexOf(base32.charAt(i));
      if (val === -1) throw new Error('Invalid base32 char');
      bits += val.toString(2).padStart(5, '0');
    }
    
    for (let i = 0; i + 8 <= bits.length; i += 8) {
      hex += parseInt(bits.substr(i, 8), 2).toString(16).padStart(2, '0');
    }
    return hex;
  }

  async function generateTOTP(secret, timeStep = 30, digits = 6, offset = 0) {
    const key = base32ToHex(secret);
    const epoch = Math.floor(Date.now() / 1000);
    const time = Math.floor(epoch / timeStep) + offset;
    
    const msg = new ArrayBuffer(8);
    const view = new DataView(msg);
    view.setUint32(0, Math.floor(time / 0x100000000), false);
    view.setUint32(4, time >>> 0, false);
    
    const keyBytes = new Uint8Array(key.length / 2);
    for (let i = 0; i < key.length; i += 2) {
      keyBytes[i / 2] = parseInt(key.substr(i, 2), 16);
    }
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyBytes,
      { name: 'HMAC', hash: 'SHA-1' },
      false, ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, msg);
    const hmacResult = new Uint8Array(signature);
    const offset_byte = hmacResult[hmacResult.length - 1] & 0xf;
    const binary = 
      ((hmacResult[offset_byte] & 0x7f) << 24) |
      ((hmacResult[offset_byte + 1] & 0xff) << 16) |
      ((hmacResult[offset_byte + 2] & 0xff) << 8) |
      (hmacResult[offset_byte + 3] & 0xff);
    
    return (binary % Math.pow(10, digits)).toString().padStart(digits, '0');
  }

  // ============================================
  // Constants
  // ============================================
  const WORKER_URL = 'https://lol.amin89310.workers.dev/';
  const TOTP_SECRET = '6ZQ4X3VPEK5XG2Q';
  const API_KEY = 'abdullah'; // Inbuilt key

  const TYPE_CONFIG = {
    '1': { label: 'Aincrad Proxy', icon: '🛡️', color: '#6366f1', desc: 'aincradproxy.xyz' },
    '2': { label: 'Aincrad Mods', icon: '⚙️', color: '#8b5cf6', desc: 'aincradmods.com' }
  };

  let currentPin = '';
  let pinInterval = null;
  let selectedType = null;
  let isProcessing = false;
  let redirectTimer = null;

  // ============================================
  // Styles
  // ============================================
  function injectStyles() {
    if (document.getElementById('getkey-styles')) return;
    const style = document.createElement('style');
    style.id = 'getkey-styles';
    style.textContent = `
      .gk-overlay * { box-sizing: border-box; margin: 0; padding: 0; }
      .gk-overlay {
        position: fixed; inset: 0; z-index: 9999999;
        display: flex; align-items: center; justify-content: center;
        font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
        animation: gkFadeIn 0.2s ease;
      }
      @keyframes gkFadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes gkSlideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      @keyframes gkSpin { to { transform: rotate(360deg); } }
      @keyframes gkPulse { 0%,100%{ opacity: 1; } 50%{ opacity: 0.4; } }
      .gk-bg {
        position: absolute; inset: 0;
        background: rgba(0,0,0,0.85);
        backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      }
      .gk-card {
        position: relative;
        background: #0d0d1a; border: 1px solid #2a2a45;
        border-radius: 16px; padding: 28px 24px 20px;
        width: 400px; max-width: 95vw; max-height: 90vh;
        overflow-y: auto; box-shadow: 0 30px 60px rgba(0,0,0,0.8);
        animation: gkSlideUp 0.35s ease;
      }
      .gk-header {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 20px;
      }
      .gk-title {
        font-size: 20px; font-weight: 700; color: #e0e0f0;
        display: flex; align-items: center; gap: 8px;
      }
      .gk-close {
        width: 32px; height: 32px; border-radius: 8px;
        border: 1px solid #333; background: #1a1a30;
        color: #888; cursor: pointer; font-size: 16px;
        display: flex; align-items: center; justify-content: center;
        transition: all 0.2s;
      }
      .gk-close:hover { background: #2a2a40; color: #fff; }
      .gk-label {
        font-size: 10px; font-weight: 700; text-transform: uppercase;
        letter-spacing: 0.8px; color: #666; margin-bottom: 8px;
      }
      .gk-types {
        display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
        margin-bottom: 18px;
      }
      .gk-type-btn {
        padding: 16px 10px; border-radius: 12px;
        border: 2px solid #252545; background: #12122a;
        color: #999; cursor: pointer; font-family: inherit;
        font-size: 12px; font-weight: 600; text-align: center;
        transition: all 0.25s; display: flex; flex-direction: column;
        align-items: center; gap: 6px;
      }
      .gk-type-btn:hover { border-color: #444; background: #1a1a35; transform: translateY(-2px); }
      .gk-type-btn.sel {
        border-color: #6366f1 !important;
        background: rgba(99,102,241,0.12) !important;
        color: #fff !important;
        box-shadow: 0 0 25px rgba(99,102,241,0.25);
      }
      .gk-type-btn .gk-icon { font-size: 28px; }
      .gk-type-btn .gk-name { font-weight: 700; font-size: 14px; }
      .gk-type-btn .gk-desc { font-size: 10px; opacity: 0.5; }
      .gk-pin-section {
        background: #08081a; border: 1px solid #1a1a35;
        border-radius: 12px; padding: 16px; margin-bottom: 16px;
        text-align: center;
      }
      .gk-pin {
        font-family: 'Cascadia Code', 'Fira Code', monospace;
        font-size: 30px; font-weight: 800; letter-spacing: 8px;
        color: #34d399; cursor: pointer; user-select: all;
        transition: all 0.3s;
      }
      .gk-pin-label { font-size: 10px; color: #555; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1px; }
      .gk-timer { font-size: 10px; color: #555; margin-top: 6px; }
      .gk-timer span { font-weight: 700; }
      .gk-key-badge {
        display: flex; align-items: center; justify-content: center;
        gap: 6px; margin-bottom: 16px; padding: 8px 14px;
        background: rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.2);
        border-radius: 8px; font-size: 11px; color: #a5b4fc;
      }
      .gk-key-badge .gk-key-val { font-weight: 700; color: #c4b5fd; }
      .gk-submit {
        width: 100%; padding: 14px; border-radius: 10px;
        border: none; background: linear-gradient(135deg, #6366f1, #8b5cf6);
        color: #fff; font-family: inherit; font-size: 15px;
        font-weight: 700; cursor: pointer; transition: all 0.3s;
        display: flex; align-items: center; justify-content: center;
        gap: 8px;
      }
      .gk-submit:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 10px 30px rgba(99,102,241,0.45);
      }
      .gk-submit:disabled { opacity: 0.4; cursor: not-allowed; }
      .gk-spinner {
        width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.2);
        border-top-color: #fff; border-radius: 50%;
        animation: gkSpin 0.7s linear infinite; display: none;
      }
      .gk-submit.loading .gk-spinner { display: block; }
      .gk-submit.loading .gk-btn-text { display: none; }
      .gk-result {
        margin-top: 12px; padding: 12px; border-radius: 10px;
        font-size: 12px; font-weight: 500; display: none;
        animation: gkSlideUp 0.2s ease; word-break: break-all;
      }
      .gk-result.show { display: block; }
      .gk-result.ok { background: rgba(16,185,129,0.06); border: 1px solid rgba(16,185,129,0.25); color: #6ee7b7; }
      .gk-result.err { background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.25); color: #fca5a5; }
      .gk-result a { display: block; color: #93c5fd; margin-top: 6px; font-size: 11px; text-decoration: none; padding: 6px; background: rgba(0,0,0,0.3); border-radius: 6px; }
      .gk-result a:hover { text-decoration: underline; }
      .gk-copy-btn {
        margin-top: 8px; padding: 6px 14px; border-radius: 6px;
        border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04);
        color: #bbb; cursor: pointer; font-family: inherit; font-size: 11px;
        font-weight: 600; transition: all 0.2s;
      }
      .gk-copy-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
      .gk-redirect {
        display: none; align-items: center; gap: 8px;
        margin-top: 10px; padding: 8px 12px;
        background: rgba(99,102,241,0.08); border-radius: 8px;
        font-size: 11px; color: #a5b4fc; font-weight: 500;
      }
      .gk-redirect.show { display: flex; }
      .gk-dot { width: 7px; height: 7px; border-radius: 50%; background: #818cf8; animation: gkPulse 1s infinite; }
      .gk-footer { text-align: center; font-size: 9px; color: #444; margin-top: 16px; }
      .gk-footer b { color: #6366f1; }
    `;
    document.head.appendChild(style);
  }

  // ============================================
  // Build UI
  // ============================================
  function buildOverlay() {
    const container = document.createElement('div');
    container.className = 'gk-overlay';
    container.id = 'gk-overlay';
    
    container.innerHTML = `
      <div class="gk-bg"></div>
      <div class="gk-card">
        <div class="gk-header">
          <div class="gk-title">🔐 Aincrad Portal</div>
          <button class="gk-close" id="gk-close">✕</button>
        </div>
        
        <div class="gk-label">Select Type</div>
        <div class="gk-types" id="gk-types">
          ${Object.entries(TYPE_CONFIG).map(([k,v]) => `
            <button class="gk-type-btn" data-type="${k}">
              <span class="gk-icon">${v.icon}</span>
              <span class="gk-name">${v.label}</span>
              <span class="gk-desc">${v.desc}</span>
            </button>
          `).join('')}
        </div>
        
        <div class="gk-key-badge">
          🔑 API Key: <span class="gk-key-val">${API_KEY}</span>
        </div>
        
        <div class="gk-pin-section">
          <div class="gk-pin-label">TOTP PIN • Tap to Copy</div>
          <div class="gk-pin" id="gk-pin" title="Click to copy">------</div>
          <div class="gk-timer">Refreshes in <span id="gk-secs">30</span>s</div>
        </div>
        
        <button class="gk-submit" id="gk-submit">
          <span class="gk-btn-text">🚀 Get Link & Redirect</span>
          <span class="gk-spinner"></span>
        </button>
        
        <div class="gk-redirect" id="gk-redirect">
          <span class="gk-dot"></span>
          <span id="gk-redirect-text">Redirecting in 3s...</span>
        </div>
        
        <div class="gk-result" id="gk-result"></div>
        <div class="gk-footer">Powered by <b>@A2MBD3</b> • TOTP Secured</div>
      </div>
    `;
    
    document.body.appendChild(container);
  }

  // ============================================
  // Logic
  // ============================================
  function setupEvents() {
    const overlay = document.getElementById('gk-overlay');
    const typeBtns = document.querySelectorAll('.gk-type-btn');
    const submitBtn = document.getElementById('gk-submit');
    const resultBox = document.getElementById('gk-result');
    const redirectDiv = document.getElementById('gk-redirect');
    const pinDisplay = document.getElementById('gk-pin');
    
    // Type selection
    typeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        typeBtns.forEach(b => b.classList.remove('sel'));
        btn.classList.add('sel');
        selectedType = btn.dataset.type;
        
        resultBox.classList.remove('show', 'ok', 'err');
        resultBox.innerHTML = '';
        redirectDiv.classList.remove('show');
        if (redirectTimer) clearTimeout(redirectTimer);
      });
    });
    
    // Pin copy
    pinDisplay.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(currentPin);
        pinDisplay.style.color = '#6ee7b7';
        pinDisplay.style.transform = 'scale(1.05)';
        setTimeout(() => {
          pinDisplay.style.color = '#34d399';
          pinDisplay.style.transform = 'scale(1)';
        }, 500);
      } catch(e) {}
    });
    
    // Close
    document.getElementById('gk-close').addEventListener('click', destroy);
    overlay.querySelector('.gk-bg').addEventListener('click', destroy);
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') { destroy(); document.removeEventListener('keydown', escHandler); }
    });
    
    // Submit
    submitBtn.addEventListener('click', handleSubmit);
  }

  function destroy() {
    const overlay = document.getElementById('gk-overlay');
    if (overlay) overlay.remove();
    if (pinInterval) clearInterval(pinInterval);
    if (redirectTimer) clearTimeout(redirectTimer);
  }

  async function handleSubmit() {
    const submitBtn = document.getElementById('gk-submit');
    const resultBox = document.getElementById('gk-result');
    const redirectDiv = document.getElementById('gk-redirect');
    
    if (isProcessing) return;
    if (redirectTimer) clearTimeout(redirectTimer);
    redirectDiv.classList.remove('show');
    
    if (!selectedType) {
      showResult('err', '⚠️ Select Aincrad Proxy or Aincrad Mods first');
      return;
    }
    
    // Build Worker URL with inbuilt key
    const apiUrl = `${WORKER_URL}?file=crx.json&type=${encodeURIComponent(selectedType)}&key=${API_KEY}&pin=${currentPin}`;
    
    isProcessing = true;
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    resultBox.classList.remove('show', 'ok', 'err');
    resultBox.innerHTML = '';
    
    try {
      console.log('[Aincrad] Fetching:', apiUrl);
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      
      const data = await response.json();
      console.log('[Aincrad] Response:', data);
      
      if (data.success && data.destinationLink) {
        const typeName = TYPE_CONFIG[selectedType]?.label || selectedType;
        showResult('ok',
          `✅ ${typeName} link ready!`,
          data.destinationLink
        );
        
        try { await navigator.clipboard.writeText(data.destinationLink); } catch(e) {}
        
        // Auto-redirect
        startRedirect(data.destinationLink);
      } else {
        showResult('err', `❌ ${data.error || 'No link found in response'}`);
      }
    } catch (err) {
      console.error('[Aincrad] Error:', err);
      showResult('err', `❌ Network error: ${err.message}`);
    } finally {
      isProcessing = false;
      submitBtn.classList.remove('loading');
      submitBtn.disabled = false;
    }
  }

  function startRedirect(url) {
    const redirectDiv = document.getElementById('gk-redirect');
    const redirectText = document.getElementById('gk-redirect-text');
    
    redirectDiv.classList.add('show');
    
    let count = 3;
    redirectText.textContent = `Redirecting in ${count}s...`;
    
    const tick = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(tick);
        redirectText.textContent = '🚀 Opening now...';
        window.open(url, '_blank');
        setTimeout(() => { window.location.href = url; }, 500);
      } else {
        redirectText.textContent = `Redirecting in ${count}s...`;
      }
    }, 1000);
    
    redirectTimer = setTimeout(() => clearInterval(tick), 5000);
  }

  function showResult(type, msg, link = null) {
    const resultBox = document.getElementById('gk-result');
    resultBox.classList.remove('show', 'ok', 'err');
    
    let html = msg;
    if (link) {
      html += `<a href="${link}" target="_blank">${link}</a>`;
      html += `<br><button class="gk-copy-btn" onclick="navigator.clipboard.writeText('${link.replace(/'/g,"\\'")}');this.textContent='✅ Copied!';setTimeout(()=>this.textContent='📋 Copy Again',1500)">📋 Copy Link</button>`;
    }
    
    resultBox.innerHTML = html;
    resultBox.classList.add('show', type);
  }

  // ============================================
  // PIN updater
  // ============================================
  async function updatePin() {
    try {
      currentPin = await generateTOTP(TOTP_SECRET, 30, 6);
      const el = document.getElementById('gk-pin');
      if (el) el.textContent = currentPin;
    } catch(e) {
      const el = document.getElementById('gk-pin');
      if (el) el.textContent = 'ERROR';
    }
  }

  function updateTimer() {
    const now = Math.floor(Date.now() / 1000);
    const rem = 30 - (now % 30);
    const el = document.getElementById('gk-secs');
    if (el) {
      el.textContent = rem;
      el.style.color = rem <= 5 ? '#ef4444' : rem <= 10 ? '#f59e0b' : '#10b981';
    }
    if (rem >= 29) updatePin();
  }

  // ============================================
  // Init
  // ============================================
  async function init() {
    if (document.getElementById('gk-overlay')) return;
    
    injectStyles();
    buildOverlay();
    setupEvents();
    
    await updatePin();
    updateTimer();
    pinInterval = setInterval(updateTimer, 1000);
  }

  // Start when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();