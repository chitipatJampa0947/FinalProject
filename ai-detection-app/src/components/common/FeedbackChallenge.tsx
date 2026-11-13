import { useEffect, useRef } from 'react';
type Widget = { render: (node: HTMLElement, options: Record<string, unknown>) => string; remove: (id: string) => void };
declare global { interface Window { turnstile?: Widget } }
let loading: Promise<void> | undefined;
function loadWidget(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; script.async = true;
    const timer = setTimeout(() => { script.remove(); reject(new Error('Verification unavailable')); }, 10_000);
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('Verification unavailable')); };
    document.head.append(script);
  }).catch(error => { loading = undefined; throw error; });
  return loading;
}
export function FeedbackChallenge({ siteKey, onToken, onError }: { siteKey: string; onToken: (token: string) => void; onError: () => void }) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false; let id: string | undefined;
    void loadWidget().then(() => {
      if (disposed || !element.current || !window.turnstile) return;
      id = window.turnstile.render(element.current, { sitekey: siteKey, action: 'feedback', callback: onToken,
        'expired-callback': () => onToken(''), 'error-callback': () => { onToken(''); onError(); } });
    }).catch(() => { if (!disposed) onError(); });
    return () => { disposed = true; if (id) window.turnstile?.remove(id); };
  }, [siteKey, onToken, onError]);
  return <div ref={element} aria-label="Feedback abuse-prevention verification" />;
}
