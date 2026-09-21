(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const views = { login: $('loginView'), list: $('listView'), form: $('formView') };
  const TYPE_LABEL = { work: 'Project', empowerment: 'Empowerment programme' };

  const DATA = window.SITE_DATA;
  const BUCKET = DATA.BUCKET;
  const conf = DATA.readConfig();
  const url = conf.url;
  const key = conf.key;
  const configured = conf.ok && !!window.supabase;

  const sb = configured
    ? window.supabase.createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'adamu-admin-auth' }
      })
    : null;
  const storage = () => sb.storage.from(BUCKET);

  const state = {
    items: [],
    filter: 'all',
    editingId: null,
    photos: [],           // saved: { id, path, thumbPath, url }   new: { full, thumb, url }
    saving: false
  };

  /* ------------------------------------------------------------ helpers */
  function show(name) {
    Object.entries(views).forEach(([k, node]) => { node.hidden = k !== name; });
    window.scrollTo({ top: 0 });
  }

  let toastTimer;
  function toast(message, isError) {
    const t = $('toast');
    t.textContent = message;
    t.classList.toggle('error', !!isError);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3400);
  }

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  const publicUrl = path =>
    `${url}/storage/v1/object/public/${BUCKET}/${String(path).split('/').map(encodeURIComponent).join('/')}`;

  const uuid = () => (window.crypto && crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 3) | 8).toString(16);
      }));

  function friendly(err) {
    if (!err) return 'Something went wrong. Please try again.';
    const msg = String(err.message || err);
    if (err.code === '42501' || /row-level security|not authorized|unauthorized|Unauthorized/i.test(msg)) {
      return 'Not allowed. Sign in again with your admin account.';
    }
    if (err.code === '23514') return 'One of the fields has a value that is not allowed. Check the form and try again.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Could not reach the server. Check your internet connection.';
    if (/Payload too large|exceeded the maximum allowed size/i.test(msg)) return 'A photo is too large. Try a smaller one.';
    return msg;
  }

  const fail = (node, message) => { node.textContent = message; node.hidden = false; };

  /* -------------------------------------------------------------- login */
  async function isAdmin() {
    const { data, error } = await sb.rpc('is_admin');
    return !error && data === true;
  }

  async function enter(email) {
    $('who').textContent = email || '';
    $('barRight').hidden = false;
    fillSelects();
    await loadList();
    show('list');
  }

  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('loginError');
    err.hidden = true;
    if (!sb) return fail(err, 'The site is not connected yet. Fill in config.js with your Supabase details.');
    const btn = $('loginBtn');
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    try {
      const { data, error } = await sb.auth.signInWithPassword({
        email: $('loginUser').value.trim(),
        password: $('loginPass').value
      });
      if (error) throw error;
      if (!(await isAdmin())) {
        await sb.auth.signOut();
        throw new Error('This account is not an admin. Add it to the admins table (see SETUP-FREE.md, step 5).');
      }
      $('loginPass').value = '';
      await enter(data.user && data.user.email);
    } catch (ex) {
      fail(err, /Invalid login credentials/i.test(String(ex.message)) ? 'Wrong email or password.' : friendly(ex));
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  });

  $('logout').addEventListener('click', async () => {
    manualLogout = true;
    if (sb) { try { await sb.auth.signOut(); } catch { /* ignore */ } }
    manualLogout = false;
    $('barRight').hidden = true;
    $('loginError').hidden = true;
    show('login');
  });

  let manualLogout = false;
  if (sb) {
    sb.auth.onAuthStateChange(event => {
      /* The session ended by itself (expired or signed out elsewhere). */
      if (event === 'SIGNED_OUT' && !manualLogout && views.login.hidden && !state.saving) {
        $('barRight').hidden = true;
        show('login');
        fail($('loginError'), 'Your session ended. Please sign in again.');
      }
    });
  }

  /* --------------------------------------------------------------- list */
  const SELECT = '*, programme_media(id, path, thumb_path, sort_order)';

  function shape(row) {
    const media = (row.programme_media || [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
      .map(m => ({ id: m.id, path: m.path, thumbPath: m.thumb_path, url: publicUrl(m.thumb_path) }));
    return {
      id: row.id, type: row.type, title: row.title, lga: row.lga, community: row.community,
      category: row.category, description: row.description, eventDate: row.event_date,
      beneficiaries: row.beneficiaries, sourceUrl: row.source_url, status: row.status,
      updatedAt: row.updated_at, media
    };
  }

  async function loadList() {
    const { data, error } = await sb
      .from('programmes')
      .select(SELECT)
      .order('updated_at', { ascending: false })
      .order('sort_order', { referencedTable: 'programme_media', ascending: true });
    if (error) throw error;
    state.items = data.map(shape);
    renderList();
  }

  function renderList() {
    const all = state.items;
    const published = all.filter(i => i.status === 'published').length;
    $('counts').textContent = all.length
      ? `${all.length} in total, ${published} published, ${all.length - published} draft`
      : '';

    const items = state.filter === 'all' ? all : all.filter(i => i.status === state.filter);
    const rows = $('rows');
    rows.replaceChildren();
    $('emptyList').hidden = items.length > 0;
    $('emptyList').textContent = all.length
      ? 'No entries in this view.'
      : 'Nothing here yet. Add the first work or empowerment programme with the button above.';

    items.forEach((item, i) => {
      const row = el('article', 'row');
      row.style.animationDelay = `${Math.min(i, 8) * 0.04}s`;

      const thumb = el('div', 'row-thumb');
      if (item.media.length) {
        const img = el('img');
        img.src = item.media[0].url;
        img.alt = '';
        thumb.appendChild(img);
      } else {
        thumb.textContent = 'No photo';
      }
      row.appendChild(thumb);

      const info = el('div');
      info.appendChild(el('p', 'row-title', item.title));
      const meta = el('p', 'row-meta');
      meta.appendChild(el('span', `pill ${item.status}`, item.status === 'published' ? 'Published' : 'Draft'));
      meta.appendChild(el('span', 'pill type', TYPE_LABEL[item.type]));
      meta.appendChild(el('span', '', item.lga === 'Statewide' ? 'All 13 LGAs' : `${item.lga} LGA`));
      if (item.media.length) meta.appendChild(el('span', '', `${item.media.length} photo${item.media.length > 1 ? 's' : ''}`));
      info.appendChild(meta);
      row.appendChild(info);

      const actions = el('div', 'row-actions');
      const edit = el('button', 'btn ghost sm', 'Edit');
      edit.type = 'button';
      edit.addEventListener('click', () => openForm(item));
      const toggle = el('button', 'btn ghost sm', item.status === 'published' ? 'Unpublish' : 'Publish');
      toggle.type = 'button';
      toggle.addEventListener('click', () => setStatus(item, item.status === 'published' ? 'draft' : 'published'));
      const del = el('button', 'btn danger sm', 'Delete');
      del.type = 'button';
      del.addEventListener('click', () => remove(item));
      actions.append(edit, toggle, del);
      row.appendChild(actions);
      rows.appendChild(row);
    });
  }

  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-pressed', String(t === tab)));
    state.filter = tab.dataset.filter;
    renderList();
  }));

  async function setStatus(item, status) {
    const { error } = await sb.from('programmes').update({ status }).eq('id', item.id);
    if (error) return toast(friendly(error), true);
    item.status = status;
    renderList();
    toast(status === 'published' ? 'Published on the website.' : 'Moved back to drafts.');
  }

  async function remove(item) {
    if (!window.confirm(`Delete "${item.title}"?\n\nIts photos will be removed too. This cannot be undone.`)) return;
    const { error } = await sb.from('programmes').delete().eq('id', item.id);
    if (error) return toast(friendly(error), true);
    const files = item.media.flatMap(m => [m.path, m.thumbPath]);
    if (files.length) await storage().remove(files).catch(() => {});
    state.items = state.items.filter(i => i.id !== item.id);
    renderList();
    toast('Entry deleted.');
  }

  $('newBtn').addEventListener('click', () => openForm(null));

  /* A plain-text copy of the entries. Photos stay in Supabase Storage. */
  $('backupBtn').addEventListener('click', () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      note: 'Photo files are stored in the Supabase Storage bucket "programme-photos"; "path" and "thumbPath" are their file names.',
      entries: state.items
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `programmes-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });

  /* --------------------------------------------------------------- form */
  function fillSelects() {
    const lga = $('fLga');
    if (lga.options.length) return;
    lga.appendChild(new Option('Choose…', ''));
    DATA.LGAS.forEach(name => lga.appendChild(new Option(name === 'Statewide' ? 'All 13 LGAs (Statewide)' : name, name)));
    const cat = $('fCategory');
    cat.appendChild(new Option('No category', ''));
    DATA.CATEGORIES.forEach(name => cat.appendChild(new Option(name, name)));
  }

  function radio(name, value) {
    const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (input) input.checked = true;
  }

  function releasePhotos() {
    state.photos.forEach(p => { if (p.full) URL.revokeObjectURL(p.url); });
    state.photos = [];
  }

  async function openForm(item) {
    releasePhotos();
    state.editingId = item ? item.id : null;
    $('formTitle').textContent = item ? 'Edit entry' : 'New entry';
    radio('type', item ? item.type : 'work');
    radio('status', item ? item.status : 'draft');
    $('fTitle').value = item ? item.title : '';
    $('fLga').value = item ? item.lga : '';
    $('fCommunity').value = item ? item.community : '';
    $('fCategory').value = item ? item.category : '';
    $('fDate').value = item && item.eventDate ? item.eventDate : '';
    $('fPeople').value = item && item.beneficiaries != null ? item.beneficiaries : '';
    $('fDesc').value = item ? item.description : '';
    $('fSource').value = item ? item.sourceUrl : '';
    $('fFiles').value = '';
    $('formError').hidden = true;
    $('progress').hidden = true;
    if (item) state.photos = item.media.map(m => ({ id: m.id, path: m.path, thumbPath: m.thumbPath, url: m.url }));
    updateCounter();
    renderPhotos();
    show('form');
  }

  function closeForm() {
    releasePhotos();
    show('list');
  }
  $('backBtn').addEventListener('click', closeForm);
  $('cancelBtn').addEventListener('click', closeForm);

  function updateCounter() {
    $('descCount').textContent = `${$('fDesc').value.length} / 4000`;
  }
  $('fDesc').addEventListener('input', updateCounter);

  /* ------------------------------------------------------------- photos */
  function renderPhotos() {
    const list = $('photos');
    list.replaceChildren();
    state.photos.forEach((p, i) => {
      const li = el('li', 'photo');
      const img = el('img');
      img.src = p.url;
      img.alt = `Photo ${i + 1}`;
      li.appendChild(img);
      if (i === 0) li.appendChild(el('span', 'cover-tag', 'Cover'));

      const tools = el('div', 'tools');
      const left = el('button', '', '←');
      left.type = 'button';
      left.setAttribute('aria-label', 'Move earlier');
      left.disabled = i === 0;
      left.addEventListener('click', () => movePhoto(i, -1));
      const right = el('button', '', '→');
      right.type = 'button';
      right.setAttribute('aria-label', 'Move later');
      right.disabled = i === state.photos.length - 1;
      right.addEventListener('click', () => movePhoto(i, 1));
      const rm = el('button', 'rm', '×');
      rm.type = 'button';
      rm.setAttribute('aria-label', 'Remove photo');
      rm.addEventListener('click', () => removePhoto(i));
      tools.append(left, rm, right);
      li.appendChild(tools);
      list.appendChild(li);
    });
  }

  function movePhoto(i, delta) {
    const j = i + delta;
    if (j < 0 || j >= state.photos.length) return;
    [state.photos[i], state.photos[j]] = [state.photos[j], state.photos[i]];
    renderPhotos();
  }

  function removePhoto(i) {
    const [gone] = state.photos.splice(i, 1);
    if (gone.full) URL.revokeObjectURL(gone.url);
    renderPhotos();
  }

  /* Re-encode a photo in the browser: fixes rotation, removes GPS/EXIF data,
     caps the size and makes the small card thumbnail. */
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(objectUrl); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('This photo could not be read. Try a JPG, PNG or WebP image.')); };
      img.src = objectUrl;
    });
  }

  async function canvasBlob(canvas) {
    let blob = await new Promise(res => canvas.toBlob(res, 'image/webp', 0.8));
    if (!blob || blob.type !== 'image/webp') {
      blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
    }
    return blob;
  }

  async function processPhoto(file) {
    const img = await loadImage(file);
    const w = img.naturalWidth;
    const h = img.naturalHeight;

    const scale = Math.min(1, 1600 / Math.max(w, h));
    const full = document.createElement('canvas');
    full.width = Math.max(1, Math.round(w * scale));
    full.height = Math.max(1, Math.round(h * scale));
    full.getContext('2d').drawImage(img, 0, 0, full.width, full.height);

    const thumb = document.createElement('canvas');
    thumb.width = 640;
    thumb.height = 480;
    const cover = Math.max(640 / w, 480 / h);
    const sw = 640 / cover;
    const sh = 480 / cover;
    thumb.getContext('2d').drawImage(img, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, 640, 480);

    const [fullBlob, thumbBlob] = await Promise.all([canvasBlob(full), canvasBlob(thumb)]);
    return { full: fullBlob, thumb: thumbBlob, url: URL.createObjectURL(thumbBlob) };
  }

  async function addFiles(fileList) {
    const max = DATA.MAX_IMAGES;
    const incoming = [...fileList].filter(f => /^image\/(jpeg|png|webp)$/.test(f.type));
    if (incoming.length < fileList.length) toast('Only JPG, PNG or WebP photos can be added.', true);
    for (const file of incoming) {
      if (state.photos.length >= max) { toast(`You can add up to ${max} photos.`, true); break; }
      try {
        state.photos.push(await processPhoto(file));
      } catch (ex) {
        toast(ex.message, true);
      }
      renderPhotos();
    }
  }

  $('fFiles').addEventListener('change', async e => {
    await addFiles(e.target.files);
    e.target.value = '';
  });
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => addFiles(e.dataTransfer.files));

  /* ------------------------------------------------------------- submit */
  const extOf = blob => (blob.type === 'image/webp' ? 'webp' : 'jpg');

  async function uploadNewPhotos(photos, onStep) {
    const uploaded = [];
    try {
      for (const p of photos) {
        const id = uuid();
        const ext = extOf(p.full);
        const path = `photos/${id}.${ext}`;
        const thumbPath = `photos/${id}-thumb.${ext}`;
        const opts = { contentType: p.full.type, cacheControl: '31536000', upsert: false };
        let r = await storage().upload(path, p.full, opts);
        if (r.error) throw r.error;
        uploaded.push(path);
        onStep();
        r = await storage().upload(thumbPath, p.thumb, { ...opts, contentType: p.thumb.type });
        if (r.error) throw r.error;
        uploaded.push(thumbPath);
        onStep();
        p.path = path;
        p.thumbPath = thumbPath;
      }
    } catch (err) {
      if (uploaded.length) await storage().remove(uploaded).catch(() => {});
      throw err;
    }
    return uploaded;
  }

  $('progForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (state.saving) return;
    const err = $('formError');
    err.hidden = true;

    const val = id => $(id).value.trim();
    if (val('fTitle').length < 3) return fail(err, 'Please add a title.');
    if (!val('fLga')) return fail(err, 'Choose an LGA (or All 13 LGAs).');
    if (val('fDesc').length < 10) return fail(err, 'Please add a short description (at least 10 characters).');
    if (val('fSource') && !/^https?:\/\//i.test(val('fSource'))) return fail(err, 'Reference link must start with http:// or https://');
    const people = val('fPeople');
    if (people !== '' && !(Number.isInteger(Number(people)) && Number(people) >= 0)) return fail(err, 'Beneficiaries must be a whole number.');

    const payload = {
      type: document.querySelector('input[name="type"]:checked').value,
      status: document.querySelector('input[name="status"]:checked').value,
      title: val('fTitle'),
      lga: val('fLga'),
      community: val('fCommunity'),
      category: val('fCategory'),
      event_date: val('fDate') || null,
      beneficiaries: people === '' ? null : Number(people),
      description: $('fDesc').value.replace(/\r\n?/g, '\n').trim(),
      source_url: val('fSource')
    };

    state.saving = true;
    const btn = $('saveBtn');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    const fresh = state.photos.filter(p => p.full);
    const totalSteps = fresh.length * 2 + 3;
    let done = 0;
    const bar = $('progressBar');
    const step = () => { done += 1; bar.style.width = `${Math.min(100, Math.round((done / totalSteps) * 100))}%`; };
    $('progress').hidden = fresh.length === 0;
    bar.style.width = '0%';

    let uploaded = [];
    let createdId = null;
    let dbTouched = false;
    try {
      uploaded = await uploadNewPhotos(fresh, step);

      const editing = state.editingId != null;
      let id = state.editingId;
      let removedFiles = [];

      if (editing) {
        const { error } = await sb.from('programmes').update(payload).eq('id', id);
        if (error) throw error;
        dbTouched = true;
        const keep = new Set(state.photos.filter(p => p.id).map(p => p.id));
        const before = state.items.find(i => i.id === id);
        const gone = (before ? before.media : []).filter(m => !keep.has(m.id));
        if (gone.length) {
          const { error: delErr } = await sb.from('programme_media').delete().in('id', gone.map(m => m.id));
          if (delErr) throw delErr;
          removedFiles = gone.flatMap(m => [m.path, m.thumbPath]);
        }
      } else {
        const { data, error } = await sb.from('programmes').insert(payload).select('id').single();
        if (error) throw error;
        id = createdId = data.id;
        dbTouched = true;
      }
      step();

      for (let i = 0; i < state.photos.length; i += 1) {
        const p = state.photos[i];
        if (p.id) {
          const { error } = await sb.from('programme_media').update({ sort_order: i }).eq('id', p.id);
          if (error) throw error;
        } else {
          const { error } = await sb.from('programme_media').insert({
            programme_id: id, path: p.path, thumb_path: p.thumbPath, sort_order: i
          });
          if (error) throw error;
        }
      }
      step();

      if (removedFiles.length) await storage().remove(removedFiles).catch(() => {});
      releasePhotos();
      await loadList();
      show('list');
      toast(editing ? 'Changes saved.' : 'Entry added.');
      step();
    } catch (ex) {
      if (createdId != null) {
        await sb.from('programmes').delete().eq('id', createdId);     // media rows go with it
        if (uploaded.length) await storage().remove(uploaded).catch(() => {});
      } else if (!dbTouched && uploaded.length) {
        await storage().remove(uploaded).catch(() => {});
      }
      fail(err, friendly(ex));
      err.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } finally {
      state.saving = false;
      btn.disabled = false;
      btn.textContent = 'Save';
      $('progress').hidden = true;
    }
  });

  /* -------------------------------------------------------------- start */
  (async () => {
    if (!sb) {
      show('login');
      fail($('loginError'), 'This site is not connected to Supabase yet. Open public/config.js and fill in your project URL and key (see SETUP-FREE.md).');
      return;
    }
    try {
      const { data } = await sb.auth.getSession();
      if (data.session && (await isAdmin())) {
        await enter(data.session.user.email);
        return;
      }
    } catch { /* fall through to the login form */ }
    show('login');
  })();
})();
