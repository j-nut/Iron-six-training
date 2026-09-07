/* Recovery layer: conversation continuity, retry controls, and coach chat navigation. */
(() => {
  if (window.__ironSixCoachRecoveryLoaded) return;
  window.__ironSixCoachRecoveryLoaded = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, options = {}) => {
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
      const parsed = new URL(url, location.href);
      if (parsed.pathname === '/api/coach' && String(options.method || 'GET').toUpperCase() === 'POST' && typeof options.body === 'string') {
        const body = JSON.parse(options.body);
        const user = typeof activeUser === 'function' ? activeUser() : null;
        const history = Array.isArray(user?.coachMessages) ? user.coachMessages : [];
        body.conversation = history.slice(-14).map(message => ({
          role: message?.role === 'assistant' ? 'assistant' : 'user',
          text: String(message?.text || '').slice(0, 1600)
        })).filter(message => message.text);
        options = { ...options, body: JSON.stringify(body) };
      }
    } catch (_) {}
    return originalFetch(input, options);
  };

  function installNavigation() {
    const coach = document.getElementById('coach');
    const chat = document.getElementById('coachChat');
    if (!coach || !chat || document.getElementById('coachJumpControls')) return;
    const controls = document.createElement('div');
    controls.id = 'coachJumpControls';
    controls.setAttribute('aria-label', 'Coach chat navigation');
    controls.innerHTML = '<button type="button" id="coachJumpTop" aria-label="Go to top of coach chat">↑ Top</button><button type="button" id="coachJumpLatest" aria-label="Go to latest coach message">↓ Latest</button>';
    coach.appendChild(controls);
    controls.querySelector('#coachJumpTop').onclick = () => coach.scrollIntoView({ behavior: 'smooth', block: 'start' });
    controls.querySelector('#coachJumpLatest').onclick = () => {
      const last = chat.lastElementChild || document.getElementById('coachForm');
      last?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    const style = document.createElement('style');
    style.textContent = '#coachJumpControls{position:fixed;right:max(12px,env(safe-area-inset-right));bottom:calc(76px + env(safe-area-inset-bottom));z-index:30;display:none;flex-direction:column;gap:8px}#coach.active #coachJumpControls{display:flex}#coachJumpControls button{border:1px solid var(--line);background:rgba(20,22,27,.94);color:var(--text);border-radius:999px;padding:10px 12px;min-height:42px;font-size:12px;font-weight:800;box-shadow:0 5px 18px rgba(0,0,0,.28)}';
    document.head.appendChild(style);
  }

  function addRetryButtons() {
    const chat = document.getElementById('coachChat');
    if (!chat) return;
    const messages = [...chat.querySelectorAll('.coach-msg.assistant')];
    for (const box of messages) {
      if (box.querySelector('.coach-retry')) continue;
      const text = box.textContent || '';
      if (!/^Coach is unavailable:/i.test(text)) continue;
      const user = typeof activeUser === 'function' ? activeUser() : null;
      const history = Array.isArray(user?.coachMessages) ? user.coachMessages : [];
      const errorIndex = history.map(x => x?.text || '').lastIndexOf(text.replace(/Retry$/, '').trim());
      let prompt = '';
      for (let i = (errorIndex >= 0 ? errorIndex : history.length) - 1; i >= 0; i--) {
        if (history[i]?.role === 'user' && history[i]?.text) { prompt = history[i].text; break; }
      }
      if (!prompt) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn secondary coach-retry';
      button.textContent = 'Retry';
      button.style.marginTop = '10px';
      button.onclick = () => {
        const input = document.getElementById('coachInput');
        const form = document.getElementById('coachForm');
        if (!input || !form) return;
        input.value = prompt;
        form.requestSubmit();
      };
      box.appendChild(button);
    }
  }

  function install() {
    installNavigation();
    addRetryButtons();
    const chat = document.getElementById('coachChat');
    if (chat && !chat.__ironSixRecoveryObserver) {
      const observer = new MutationObserver(addRetryButtons);
      observer.observe(chat, { childList: true, subtree: true });
      chat.__ironSixRecoveryObserver = observer;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
  setTimeout(install, 0);
})();
