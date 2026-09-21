/* Lists shared by the public site and the admin panel.
   Keep in sync with supabase/schema.sql if you ever change them. */
window.SITE_DATA = {
  LGAS: ['Akwanga', 'Awe', 'Doma', 'Karu', 'Keana', 'Keffi', 'Kokona', 'Lafia',
         'Nasarawa', 'Nasarawa Eggon', 'Obi', 'Toto', 'Wamba', 'Statewide'],
  CATEGORIES: ['Agriculture', 'Community', 'Education', 'Healthcare', 'Infrastructure',
               'Security', 'Skills & Training', 'Small Business', 'Water & Sanitation',
               'Women', 'Youth', 'Other'],
  MAX_IMAGES: 10,
  BUCKET: 'programme-photos'
};

/* Reads window.SITE_CONFIG and works out the real Supabase address.
   People often paste the dashboard address (supabase.com/dashboard/project/<id>)
   instead of the Project URL (https://<id>.supabase.co); that is fixed here. */
window.SITE_DATA.readConfig = () => {
  const cfg = window.SITE_CONFIG || {};
  const raw = String(cfg.supabaseUrl || '').trim();
  const key = String(cfg.supabaseAnonKey || '').trim();
  const dash = raw.match(/supabase\.(?:com|io)\/dashboard\/project\/([a-z0-9]{10,})/i);

  let url = '';
  if (dash) {
    url = `https://${dash[1].toLowerCase()}.supabase.co`;
  } else {
    try { url = new URL(raw).origin; } catch { url = ''; }
  }
  const placeholder = !url || /YOUR/i.test(raw) || !key || /YOUR/i.test(key);
  const badHost = /^https:\/\/(www\.|app\.)?supabase\.(com|io)$/i.test(url);
  return { url, key, ok: !placeholder && !badHost, placeholder, badHost };
};

