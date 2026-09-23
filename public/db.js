/* Read-only data access for the public pages (Supabase).
   The public client never stores a login, so visitors - and even an admin who
   is signed in on the same browser - only ever see published entries. */
(() => {
  'use strict';

  const data = window.SITE_DATA || { LGAS: [], BUCKET: 'programme-photos' };
  const conf = data.readConfig ? data.readConfig() : { url: '', key: '', ok: false };
  const url = conf.url;
  const key = conf.key;
  const configured = conf.ok && !!window.supabase;

  const client = configured
    ? window.supabase.createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      })
    : null;

  const publicUrl = path =>
    `${url}/storage/v1/object/public/${data.BUCKET}/${String(path).split('/').map(encodeURIComponent).join('/')}`;

  function shape(row) {
    const media = (row.programme_media || [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
      .map(m => ({ id: m.id, url: publicUrl(m.path), thumb: publicUrl(m.thumb_path) }));
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      lga: row.lga,
      community: row.community,
      category: row.category,
      description: row.description,
      eventDate: row.event_date,
      beneficiaries: row.beneficiaries,
      sourceUrl: row.source_url,
      media
    };
  }

  /* Quote a search word for PostgREST's or=(...) syntax and make % _ literal. */
  const likeEscape = s => s.replace(/[\\%_]/g, m => '\\' + m).replace(/["\\]/g, m => '\\' + m);

  async function list({ type = '', lga = '', q = '', page = 1, pageSize = 6 } = {}) {
    if (!client) throw new Error('not-configured');
    let query = client
      .from('programmes')
      .select('*, programme_media(id, path, thumb_path, sort_order)', { count: 'exact' })
      .eq('status', 'published');

    if (type === 'work' || type === 'empowerment') query = query.eq('type', type);

    /* Picking an LGA also shows statewide entries, because they cover it. */
    if (lga === 'Statewide') query = query.eq('lga', 'Statewide');
    else if (data.LGAS.includes(lga)) query = query.or(`lga.eq.${lga},lga.eq.Statewide`);

    const term = String(q || '').trim().slice(0, 60);
    if (term) {
      const like = `"%${likeEscape(term)}%"`;
      query = query.or(['title', 'community', 'category', 'description'].map(c => `${c}.ilike.${like}`).join(','));
    }

    const from = (page - 1) * pageSize;
    const { data: rows, error, count } = await query
      .order('event_date', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .order('sort_order', { referencedTable: 'programme_media', ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      if (error.code === 'PGRST103') return { total: 0, items: [], outOfRange: true };
      throw error;
    }
    return { total: count || 0, items: rows.map(shape) };
  }

  async function summary() {
    if (!client) throw new Error('not-configured');
    const { data: result, error } = await client.rpc('programme_summary');
    if (error) throw error;
    return result;
  }

  /* A raw fetch (not the Supabase client) so we can set keepalive: true.
     Mobile browsers often navigate to the poster image right after the
     download is triggered; a normal request started around the same time
     can get cancelled by that navigation before it reaches the server.
     A keepalive request is explicitly allowed to outlive the page that
     started it, so the count still gets recorded. */
  async function callRpc(name) {
    if (!configured) throw new Error('not-configured');
    const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      keepalive: true,
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: '{}'
    });
    if (!res.ok) throw new Error(`${name} failed (${res.status})`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  const recordPosterDownload = () => callRpc('record_poster_download');
  const posterDownloadCount = () => callRpc('poster_download_count');

  window.SiteDB = { ready: !!client, list, summary, publicUrl, shape, recordPosterDownload, posterDownloadCount };
})();
