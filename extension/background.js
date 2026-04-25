// Service worker. v0 keeps it minimal — there's no message bridge needed
// because session cookies travel with fetch(credentials:'include') in
// content scripts and the popup. Hook on install to set defaults.

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.storage.local.set({ votum_first_seen: Date.now() });
  }
});

// Cross-tab signal so the popup knows to refresh when the user signs in
// in another tab. The auth-done page calls chrome.runtime.sendMessage if
// it's loaded inside a Votum extension popup; otherwise there's nothing
// to do here.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'votum_auth_changed') {
    chrome.storage.local.set({ votum_auth_changed_at: Date.now() });
    sendResponse({ ok: true });
    return true;
  }
  return undefined;
});
