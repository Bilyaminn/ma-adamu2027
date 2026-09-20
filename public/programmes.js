(() => {
  'use strict';

  const grid = document.getElementById('progGrid');
  if (!grid) return;

  const summaryEl = document.getElementById('progSummary');
  const emptyEl = document.getElementById('progEmpty');
  const pager = document.getElementById('progPager');
  const countEl = document.getElementById('progCount');
  const searchInput = document.getElementById('progSearch');
  const toolbar = document.getElementById('progToolbar');
  const lgaSelect = document.getElementById('progLga');
  const chips = [...document.querySelectorAll('.chip')];

  const dialog = document.getElementById('progDialog');
  const dlg = {
    gallery: document.getElementById('dlgGallery'),
    stage: document.getElementById('dlgStage'),
    main: document.getElementById('dlgMain'),
    bg: document.getElementById('dlgBg'),
    prev: document.getElementById('dlgPrev'),
    next: document.getElementById('dlgNext'),
    count: document.getElementById('dlgCount'),
    thumbs: document.getElementById('dlgThumbs'),
    badges: document.getElementById('dlgBadges'),
    title: document.getElementById('dlgTitle'),
    facts: document.getElementById('dlgFacts'),
    desc: document.getElementById('dlgDesc'),
    foot: document.getElementById('dlgFoot'),
    source: document.getElementById('dlgSource'),
    close: document.getElementById('dlgClose'),
    scroll: dialog.querySelector('.dlg-scroll')
  };

  const PAGE = 6;
  const state = { type: '', lga: '', q: '', page: 1, total: 0, loading: false };
  const TYPE_LABEL = { work: 'Work', empowerment: 'Empowerment' };
  const nf = new Intl.NumberFormat('en-NG');
  const lgaLabel = lga => (lga === 'Statewide' ? 'All 13 LGAs' : `${lga} LGA`);
  const placeOf = item => [item.community, lgaLabel(item.lga)].filter(Boolean).join(', ');

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  const fmtDate = iso => {
    if (!iso) return '';
    const d = new Date(`${iso}T00:00:00`);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-NG', { year: 'numeric', month: 'long' });
  };

  /* ------------------------------------------------------------ summary */
  function countUp(node, target) {
    if (window.SiteMotion && window.SiteMotion.reduce) { node.textContent = nf.format(target); return; }
    const start = performance.now();
    const duration = 1300;
    const tick = now => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      node.textContent = nf.format(Math.round(target * eased));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function renderSummary(s) {
    if (!s.total) return;
    summaryEl.hidden = false;
    document.getElementById('sumPeopleWrap').hidden = !s.beneficiaries;
    const targets = [
      [document.getElementById('sumTotal'), s.total],
      [document.getElementById('sumLgas'), s.lgasReached],
      [document.getElementById('sumPeople'), s.beneficiaries]
    ];
    const run = () => targets.forEach(([node, value]) => countUp(node, value));
    if (window.SiteMotion) window.SiteMotion.watch(summaryEl, run); else run();

    (s.lgas || []).forEach(l => {
      const opt = el('option', '', `${l.lga} (${l.count})`);
      opt.value = l.lga;
      lgaSelect.appendChild(opt);
    });
  }

  /* -------------------------------------------------------------- cards */
  function badge(type) {
    return el('span', `badge badge-${type}`, TYPE_LABEL[type] || type);
  }

  function card(item, index) {
    const article = el('article', 'prog-card');

    const cover = el('div', 'prog-cover');
    if (item.media.length) {
      const img = el('img');
      img.src = item.media[0].thumb;
      img.alt = '';
      img.loading = 'lazy';
      img.width = 640;
      img.height = 480;
      cover.appendChild(img);
    } else {
      cover.classList.add('no-photo');
      cover.appendChild(el('span', '', item.category || TYPE_LABEL[item.type]));
    }
    cover.appendChild(badge(item.type));
    if (item.media.length > 1) cover.appendChild(el('span', 'photo-count', `${item.media.length} photos`));
    article.appendChild(cover);

    const body = el('div', 'prog-body');
    body.appendChild(el('p', 'prog-place', placeOf(item)));
    const h3 = el('h3');
    const open = el('button', 'prog-open', item.title);
    open.type = 'button';
    open.addEventListener('click', () => openDialog(item, open));
    h3.appendChild(open);
    body.appendChild(h3);
    body.appendChild(el('p', 'prog-excerpt', item.description));

    const facts = [fmtDate(item.eventDate), item.beneficiaries != null ? `${nf.format(item.beneficiaries)} beneficiaries` : '']
      .filter(Boolean).join('  •  ');
    if (facts) body.appendChild(el('p', 'prog-facts', facts));
    body.appendChild(el('span', 'prog-cta', 'Read more'));
    article.appendChild(body);

    if (window.SiteMotion) window.SiteMotion.reveal(article, (index % 3) * 0.09);
    return article;
  }

  /* ---------------------------------------------------------- data flow */
  function showMessage(text) {
    emptyEl.textContent = text;
    emptyEl.hidden = false;
  }

  function pageList(current, last) {
    const set = new Set([1, last, current - 1, current, current + 1]);
    const pages = [...set].filter(n => n >= 1 && n <= last).sort((x, y) => x - y);
    const out = [];
    pages.forEach((n, i) => {
      if (i && n - pages[i - 1] > 1) out.push('gap');
      out.push(n);
    });
    return out;
  }

  function renderPager() {
    const last = Math.max(1, Math.ceil(state.total / PAGE));
    pager.replaceChildren();
    if (last <= 1) { pager.hidden = true; return; }
    pager.hidden = false;

    const go = n => () => goTo(n);
    const prev = el('button', 'pg pg-nav', '‹ Previous');
    prev.type = 'button';
    prev.disabled = state.page === 1;
    prev.addEventListener('click', go(state.page - 1));
    pager.appendChild(prev);

    pageList(state.page, last).forEach(n => {
      if (n === 'gap') { pager.appendChild(el('span', 'pg-gap', '…')); return; }
      const b = el('button', `pg pg-num${n === state.page ? ' is-current' : ''}`, String(n));
      b.type = 'button';
      b.setAttribute('aria-label', `Page ${n}`);
      if (n === state.page) b.setAttribute('aria-current', 'page');
      b.addEventListener('click', go(n));
      pager.appendChild(b);
    });
    pager.appendChild(el('span', 'pg-status', `Page ${state.page} of ${last}`));

    const next = el('button', 'pg pg-nav', 'Next ›');
    next.type = 'button';
    next.disabled = state.page === last;
    next.addEventListener('click', go(state.page + 1));
    pager.appendChild(next);
  }

  function goTo(page) {
    state.page = page;
    load().then(() => {
      /* Bring the top of the list back into view after using the page buttons. */
      if (toolbar.getBoundingClientRect().top < 70) {
        const reduce = window.SiteMotion && window.SiteMotion.reduce;
        toolbar.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      }
    });
  }

  let requestId = 0;

  /* Always shows the result of the newest request; older, slower answers are ignored. */
  async function load() {
    const mine = ++requestId;
    state.loading = true;
    grid.setAttribute('aria-busy', 'true');
    grid.classList.add('is-loading');
    emptyEl.hidden = true;

    try {
      if (!window.SiteDB || !window.SiteDB.ready) throw new Error('not-configured');
      const data = await window.SiteDB.list({
        type: state.type, lga: state.lga, q: state.q, page: state.page, pageSize: PAGE
      });
      if (mine !== requestId) return;

      /* A page that no longer exists (entries were removed): go back to page 1. */
      if (data.outOfRange && state.page > 1) {
        state.page = 1;
        return load();
      }
      state.total = data.total;
      grid.replaceChildren(...data.items.map((item, i) => card(item, i)));

      if (data.total) {
        const from = (state.page - 1) * PAGE + 1;
        const to = from + data.items.length - 1;
        countEl.textContent = data.total > PAGE
          ? `Showing ${from}–${to} of ${data.total}`
          : `${data.total} ${data.total === 1 ? 'entry' : 'entries'}`;
        countEl.hidden = false;
      } else {
        countEl.hidden = true;
        showMessage(state.type || state.lga || state.q
          ? 'Nothing matches these filters yet. Try another type, LGA or search word.'
          : 'Works and programmes are being added. Please check back soon.');
      }
      renderPager();
    } catch (err) {
      if (mine !== requestId) return;
      grid.replaceChildren();
      countEl.hidden = true;
      pager.hidden = true;
      showMessage(err && err.message === 'not-configured'
        ? 'The works and programmes are not connected yet. Fill in config.js with your Supabase details.'
        : 'The works and programmes could not be loaded right now. Please refresh and try again.');
    } finally {
      if (mine === requestId) {
        state.loading = false;
        grid.removeAttribute('aria-busy');
        grid.classList.remove('is-loading');
      }
    }
  }

  function resetAndLoad() {
    state.page = 1;
    load();
  }

  chips.forEach(chip => chip.addEventListener('click', () => {
    chips.forEach(c => c.setAttribute('aria-pressed', String(c === chip)));
    state.type = chip.dataset.type;
    resetAndLoad();
  }));
  lgaSelect.addEventListener('change', () => { state.lga = lgaSelect.value; resetAndLoad(); });

  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const value = searchInput.value.trim();
      if (value === state.q) return;
      state.q = value;
      resetAndLoad();
    }, 300);
  });

  /* ------------------------------------------------------------- dialog */
  let opener = null;
  let photos = [];
  let current = 0;
  let currentTitle = '';

  function fact(label, value) {
    const box = el('div');
    box.appendChild(el('dt', '', label));
    box.appendChild(el('dd', '', value));
    return box;
  }

  function showPhoto(index, instant) {
    if (!photos.length) return;
    current = (index + photos.length) % photos.length;
    const photo = photos[current];
    const apply = () => {
      dlg.main.src = photo.url;
      dlg.bg.src = photo.url;
      dlg.main.alt = `${currentTitle} - photo ${current + 1} of ${photos.length}`;
      dlg.main.classList.remove('swap');
    };
    if (instant) {
      apply();
    } else {
      dlg.main.classList.add('swap');
      const loader = new Image();
      loader.onload = loader.onerror = apply;
      loader.src = photo.url;
    }
    dlg.count.textContent = `${current + 1} / ${photos.length}`;
    [...dlg.thumbs.children].forEach((b, i) => {
      const active = i === current;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-current', String(active));
      if (active) b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    });
  }

  function openDialog(item, trigger) {
    opener = trigger;
    photos = item.media;
    currentTitle = item.title;

    dlg.badges.replaceChildren(badge(item.type));
    if (item.category) dlg.badges.appendChild(el('span', 'badge badge-plain', item.category));
    dlg.title.textContent = item.title;

    dlg.facts.replaceChildren();
    dlg.facts.appendChild(fact('Location', placeOf(item)));
    if (item.eventDate) dlg.facts.appendChild(fact('Date', fmtDate(item.eventDate)));
    if (item.beneficiaries != null) dlg.facts.appendChild(fact('Beneficiaries', nf.format(item.beneficiaries)));

    dlg.desc.replaceChildren();
    item.description.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map(t => t.trim()).filter(Boolean)
      .forEach(text => dlg.desc.appendChild(el('p', '', text)));

    if (item.sourceUrl) {
      dlg.source.href = item.sourceUrl;
      dlg.foot.hidden = false;
    } else {
      dlg.foot.hidden = true;
    }

    const hasPhotos = photos.length > 0;
    const many = photos.length > 1;
    dialog.classList.toggle('no-gallery', !hasPhotos);
    dlg.gallery.hidden = !hasPhotos;
    dlg.prev.hidden = dlg.next.hidden = dlg.count.hidden = dlg.thumbs.hidden = !many;
    dlg.thumbs.replaceChildren();
    if (many) {
      photos.forEach((m, i) => {
        const b = el('button');
        b.type = 'button';
        b.setAttribute('aria-label', `Show photo ${i + 1} of ${photos.length}`);
        const img = el('img');
        img.src = m.thumb;
        img.alt = '';
        b.appendChild(img);
        b.addEventListener('click', () => showPhoto(i));
        dlg.thumbs.appendChild(b);
      });
    }
    if (hasPhotos) showPhoto(0, true);

    document.documentElement.classList.add('dlg-open');
    dialog.showModal();
    dialog.scrollTop = 0;
    dlg.scroll.scrollTop = 0;
  }

  dlg.prev.addEventListener('click', () => showPhoto(current - 1));
  dlg.next.addEventListener('click', () => showPhoto(current + 1));
  dialog.addEventListener('keydown', e => {
    if (photos.length < 2) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); showPhoto(current - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); showPhoto(current + 1); }
  });

  /* Swipe left / right on the photo (phones) */
  let touchX = null;
  dlg.stage.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  dlg.stage.addEventListener('touchend', e => {
    if (touchX == null || photos.length < 2) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 50) showPhoto(current + (dx < 0 ? 1 : -1));
  }, { passive: true });

  dlg.close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('dlg-open');
    dlg.main.removeAttribute('src');
    dlg.bg.removeAttribute('src');
    if (opener) opener.focus();
  });

  /* -------------------------------------------------------------- start */
  if (window.SiteDB && window.SiteDB.ready) window.SiteDB.summary().then(renderSummary).catch(() => {});
  load();
})();
