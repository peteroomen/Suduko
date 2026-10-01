// Updates wait until the old app's tabs are closed. Never reload an active game.
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js', {
        scope: '/', updateViaCache: 'none',
      });
      navigator.serviceWorker.ready.then(() => {
        window.dispatchEvent(new CustomEvent('suduko:offline-ready'));
      });
      const notify = () => window.dispatchEvent(new CustomEvent('suduko:update-available'));
      if (registration.waiting) notify();
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) notify();
        });
      });
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) registration.update().catch(() => {});
      });
    } catch {
      window.dispatchEvent(new CustomEvent('suduko:offline-unavailable'));
      // Browsers without service-worker support still run the full online app.
    }
  }, { once: true });
}
