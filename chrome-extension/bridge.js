(() => {
  const isRengifoApp = Boolean(document.querySelector('meta[name="rengifo-siat-app"]'));
  if (!isRengifoApp) return;

  const setInstalledFlag = () => {
    if (document.documentElement) {
      document.documentElement.dataset.rengifoSiatExt = '1';
    }
  };

  setInstalledFlag();
  window.postMessage({ type: 'RENGIFO_SIAT_READY' }, window.location.origin);

  window.addEventListener('message', async (event) => {
    if (event.source !== window || !event.data) return;

    if (event.data.type === 'RENGIFO_PING_EXT') {
      setInstalledFlag();
      window.postMessage({ type: 'RENGIFO_SIAT_READY' }, window.location.origin);
      return;
    }

    if (event.data.type !== 'RENGIFO_OPEN_SIAT') return;

    const { nit, email, password } = event.data.payload || {};
    await chrome.storage.local.set({
      rengifo_pending_siat: {
        nit: String(nit || ''),
        email: String(email || ''),
        password: String(password || ''),
        ts: Date.now()
      }
    });

    window.postMessage({ type: 'RENGIFO_SIAT_ACK' }, window.location.origin);
  });
})();
