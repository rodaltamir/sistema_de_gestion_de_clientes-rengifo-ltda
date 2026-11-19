(() => {
  const TTL_MS = 180000; // 3 minutes
  let filledDone = false;

  function setNativeValue(el, value) {
    if (!el || value === undefined || value === null || value === '') return false;
    el.focus();
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;
    if (setter) {
      setter.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }

  function findInputs() {
    // 1. Exact selectors for Impuestos Nacionales Bolivia (Keycloak login2)
    let nitInput =
      document.querySelector('#nitCur') ||
      document.querySelector('input[name="nitCur"]');
    let emailInput =
      document.querySelector('#email') ||
      document.querySelector('input[name="email"]');
    let passInput =
      document.querySelector('#password') ||
      document.querySelector('input[name="password"]');

    // 2. Fallback heuristic if selectors ever change
    if (!nitInput || !emailInput || !passInput) {
      const inputs = [
        ...document.querySelectorAll('input:not([type="hidden"]):not([disabled])')
      ];
      for (const inp of inputs) {
        const meta = [
          inp.name,
          inp.id,
          inp.placeholder,
          inp.getAttribute('aria-label'),
          inp.getAttribute('formcontrolname'),
          inp.closest('label, .form-group, mat-form-field, div')?.textContent || ''
        ]
          .join(' ')
          .toLowerCase();

        if (inp.type === 'password' && !passInput) {
          passInput = inp;
        } else if (
          (inp.type === 'email' || meta.includes('correo') || meta.includes('email')) &&
          !emailInput
        ) {
          emailInput = inp;
        } else if ((meta.includes('nit') || meta.includes('cur')) && !nitInput) {
          nitInput = inp;
        }
      }
    }

    return { nitInput, emailInput, passInput };
  }

  function showBanner(msg) {
    if (!document.body) return;
    const existing = document.getElementById('rengifo-siat-banner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'rengifo-siat-banner';
    banner.textContent = msg;
    Object.assign(banner.style, {
      position: 'fixed',
      top: '14px',
      right: '14px',
      zIndex: '2147483647',
      background: '#1f2937',
      color: '#ffffff',
      borderLeft: '4px solid #e87700',
      padding: '10px 14px',
      borderRadius: '8px',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '13px',
      fontWeight: '600',
      boxShadow: '0 8px 24px rgba(0,0,0,0.25)'
    });
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 5000);
  }

  async function tryFillWith(pending) {
    if (filledDone || !pending) return false;
    if (Date.now() - Number(pending.ts || 0) > TTL_MS) {
      await chrome.storage.local.remove('rengifo_pending_siat');
      return false;
    }

    const { nitInput, emailInput, passInput } = findInputs();
    // Wait until the real login form (at least password + nit or email) is in the DOM
    if (!passInput && !nitInput) return false;

    let filledCount = 0;
    if (nitInput && pending.nit) {
      if (setNativeValue(nitInput, pending.nit)) filledCount++;
    }
    if (emailInput && pending.email) {
      if (setNativeValue(emailInput, pending.email)) filledCount++;
    }
    if (passInput && pending.password) {
      if (setNativeValue(passInput, pending.password)) filledCount++;
    }

    if (filledCount > 0) {
      filledDone = true;
      await chrome.storage.local.remove('rengifo_pending_siat');
      showBanner('Rengifo SIAT: Datos completados ✓ — Presiona Ingresar');
      return true;
    }
    return false;
  }

  async function checkAndFill() {
    if (filledDone) return true;
    const result = await chrome.storage.local.get('rengifo_pending_siat');
    return tryFillWith(result?.rengifo_pending_siat);
  }

  // Listen for late storage writes (if bridge.js finishes just after tab opens)
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.rengifo_pending_siat?.newValue) {
      tryFillWith(changes.rengifo_pending_siat.newValue);
    }
  });

  // Initial check + MutationObserver + short polling fallback
  checkAndFill();

  const observer = new MutationObserver(() => {
    checkAndFill().then((done) => {
      if (done) observer.disconnect();
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const pollId = setInterval(() => {
    checkAndFill().then((done) => {
      if (done) {
        clearInterval(pollId);
        observer.disconnect();
      }
    });
  }, 400);

  setTimeout(() => {
    clearInterval(pollId);
    observer.disconnect();
  }, 30000);
})();
