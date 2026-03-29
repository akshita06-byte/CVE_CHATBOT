const { contextBridge } = require('electron');

// Expose a minimal, safe API to the renderer.
// Use `window.api.fetch(url, options)` from renderer code instead of direct Node access.
contextBridge.exposeInMainWorld('api', {
  fetch: async (url, options) => {
    const res = await fetch(url, options);
    const ct = res.headers.get('content-type') || '';
    const body = ct.includes('application/json') ? await res.json() : await res.text();
    return { ok: res.ok, status: res.status, headers: Object.fromEntries(res.headers.entries()), body };
  }
});
