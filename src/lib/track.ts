import { supabase } from '@/integrations/supabase/client';

export type TrackEvent = 'view_link' | 'view_checkout' | 'click_certificado' | 'click_guia';

function getVisitorId(): string {
  if (typeof window === 'undefined') return 'ssr';
  const KEY = 'cmd_visitor_id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));
    localStorage.setItem(KEY, id);
  }
  return id;
}

function parseUA(ua: string) {
  const s = ua.toLowerCase();
  let browser = 'Outro';
  if (/edg\//.test(s)) browser = 'Edge';
  else if (/opr\/|opera/.test(s)) browser = 'Opera';
  else if (/chrome/.test(s) && !/edg\//.test(s)) browser = 'Chrome';
  else if (/firefox/.test(s)) browser = 'Firefox';
  else if (/safari/.test(s) && !/chrome/.test(s)) browser = 'Safari';
  else if (/samsungbrowser/.test(s)) browser = 'Samsung Internet';

  let os = 'Outro';
  if (/windows/.test(s)) os = 'Windows';
  else if (/android/.test(s)) os = 'Android';
  else if (/iphone|ipad|ipod/.test(s)) os = 'iOS';
  else if (/mac os|macintosh/.test(s)) os = 'macOS';
  else if (/linux/.test(s)) os = 'Linux';

  let device = 'Desktop';
  if (/iphone|ipod/.test(s)) device = 'iOS';
  else if (/ipad/.test(s)) device = 'iPad';
  else if (/android/.test(s)) device = /mobile/.test(s) ? 'Android' : 'Android Tablet';
  else if (/mobile|phone/.test(s)) device = 'Mobile';

  return { browser, os, device };
}

const sentViews = new Set<string>();

export async function trackEvent(token: string, event_type: TrackEvent) {
  try {
    if (typeof window === 'undefined' || !token) return;
    const visitor_id = getVisitorId();

    // Only dedupe view events within the current page load (avoid StrictMode/rerender double-fire).
    // Clicks are never deduped — every click counts toward Total.
    if (event_type === 'view_link' || event_type === 'view_checkout') {
      const key = `${token}:${event_type}`;
      if (sentViews.has(key)) return;
      sentViews.add(key);
    }

    const ua = navigator.userAgent || '';
    const { browser, os, device } = parseUA(ua);
    await supabase.from('link_events').insert({
      token,
      event_type,
      visitor_id,
      browser,
      os,
      device,
      user_agent: ua.slice(0, 500),
    });
  } catch (err) {
    // silent — tracking failures never break UX
    console.debug('trackEvent failed', err);
  }
}
