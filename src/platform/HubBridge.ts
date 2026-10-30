// CC-GH owns the Telegram WebView and its Back button. This frame exchanges
// lifecycle signals with that parent; it never receives Telegram/user data.
export function connectHubBridge(onActiveChange: (active: boolean) => void): () => void {
  if (new URLSearchParams(window.location.search).get('embed') !== 'ccgh') return () => {};
  if (window.parent === window || !document.referrer) return () => {};
  let parentOrigin: string;
  try {
    const referrer = new URL(document.referrer);
    if (
      referrer.protocol !== 'https:' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(referrer.hostname)
    )
      return () => {};
    parentOrigin = referrer.origin;
  } catch {
    return () => {};
  }
  const ready = (): void =>
    window.parent.postMessage({ type: 'bentoku:ready', version: 1 }, parentOrigin);
  const receive = (event: MessageEvent): void => {
    if (
      event.source !== window.parent ||
      event.origin !== parentOrigin ||
      event.data?.version !== 1
    )
      return;
    if (event.data.type === 'ccgh:bentoku:connect') ready();
    if (event.data.type === 'ccgh:bentoku:visibility' && typeof event.data.visible === 'boolean')
      onActiveChange(event.data.visible);
  };
  window.addEventListener('message', receive);
  onActiveChange(false);
  ready();
  return () => window.removeEventListener('message', receive);
}
