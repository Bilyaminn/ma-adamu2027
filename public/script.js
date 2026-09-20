(() => {
  'use strict';

  /* ------------------------------------------------------------------
     Mobile navigation
  ------------------------------------------------------------------ */
  const menu = document.querySelector('.menu');
  const nav = document.querySelector('.nav nav');

  const setMenu = open => {
    nav.classList.toggle('open', open);
    menu.setAttribute('aria-expanded', String(open));
  };
  menu.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
  /* Tapping anywhere outside the open menu closes it. pointerdown is used
     (not click) because iOS Safari does not send click events for taps on
     plain page areas. */
  document.addEventListener('pointerdown', e => {
    if (!nav.classList.contains('open')) return;
    if (nav.contains(e.target) || menu.contains(e.target)) return;
    setMenu(false);
  }, { passive: true });
  window.addEventListener('resize', () => { if (window.innerWidth > 800) setMenu(false); });

  /* ------------------------------------------------------------------
     Page position. Refreshing always starts at the top, and in-page links
     (menu, buttons, "Back to top") scroll smoothly without leaving a #hash
     in the address bar, which is what used to make a refresh jump back to
     that section.
  ------------------------------------------------------------------ */
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (!window.location.hash) window.scrollTo(0, 0);

  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      const id = link.getAttribute('href').slice(1);
      const toTop = !id || id === 'top' || id === 'home';
      const target = toTop ? null : document.getElementById(id);
      if (!toTop && !target) return;
      e.preventDefault();
      const behavior = prefersReduced ? 'auto' : 'smooth';
      if (toTop) {
        window.scrollTo({ top: 0, behavior });
        const brand = document.querySelector('.brand');
        if (brand && link.classList.contains('to-top')) brand.focus({ preventScroll: true });
      } else {
        target.scrollIntoView({ behavior, block: 'start' });
      }
      history.replaceState(null, '', window.location.pathname + window.location.search);
    });
  });

  /* ------------------------------------------------------------------
     Header: soft shadow and a slimmer bar once the page scrolls
  ------------------------------------------------------------------ */
  const topbar = document.querySelector('.topbar');
  const onScroll = () => topbar.classList.toggle('scrolled', window.scrollY > 24);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ------------------------------------------------------------------
     Scrolling campaign banner: repeat the phrases until they cover the
     screen, then duplicate the group so the loop is seamless.
  ------------------------------------------------------------------ */
  const track = document.querySelector('.ticker-track');
  if (track) {
    const group = track.querySelector('.ticker-group');
    let guard = 0;
    while (group.scrollWidth < window.innerWidth + 80 && guard++ < 6) {
      Array.from(group.children).forEach(node => group.appendChild(node.cloneNode(true)));
    }
    const copy = group.cloneNode(true);
    copy.setAttribute('aria-hidden', 'true');
    track.appendChild(copy);
  }

  /* ------------------------------------------------------------------
     Scroll reveals. Elements marked .reveal fade in as they enter the
     screen. Once shown, the reveal classes are removed
     so hover effects stay snappy.
  ------------------------------------------------------------------ */
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const timeline = document.querySelector('.timeline');

  const finishReveal = el => {
    const cleanup = e => {
      if (e.target !== el || e.propertyName !== 'opacity') return;
      el.classList.remove('reveal', 'in');
      el.style.removeProperty('--d');
      el.removeEventListener('transitionend', cleanup);
    };
    el.addEventListener('transitionend', cleanup);
  };

  let io = null;
  if (!reduceMotion && 'IntersectionObserver' in window) {
    io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        io.unobserve(el);
        el.classList.add('in');
        if (el.classList.contains('reveal')) finishReveal(el);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
  }

  /* Also used by programmes.js for cards that arrive after the page loads. */
  window.SiteMotion = {
    reduce: reduceMotion,
    reveal(el, delay = 0) {
      el.classList.add('reveal');
      if (delay) el.style.setProperty('--d', `${delay}s`);
      if (io) io.observe(el); else el.classList.add('in');
    },
    watch(el, callback) {
      if (!io) return callback();
      const once = new IntersectionObserver(items => {
        if (items.some(i => i.isIntersecting)) { once.disconnect(); callback(); }
      }, { threshold: 0.3 });
      once.observe(el);
    }
  };

  document.querySelectorAll('.reveal').forEach(el => window.SiteMotion.reveal(el));
  if (timeline) {
    if (io) io.observe(timeline); else timeline.classList.add('in');
  }

  /* ------------------------------------------------------------------
     Campaign poster
     - The candidate photo and SDP logo are fixed (poster-assets.js).
     - The supporter can only change their name, community and photo.
  ------------------------------------------------------------------ */
  const canvas = document.getElementById('poster');
  const ctx = canvas.getContext('2d');
  const nameInput = document.getElementById('supporterName');
  const areaInput = document.getElementById('supporterArea');
  const photoInput = document.getElementById('supporterPhoto');
  const downloadBtn = document.getElementById('downloadCard');

  const W = canvas.width;   // 1080
  const H = canvas.height;  // 1350
  const MARGIN = 64;

  const COLOR = {
    orange: '#F26B1D',       // SDP orange (shapes)
    orangeText: '#E45B0B',   // slightly deeper for text on white
    green: '#159A47',        // SDP green
    deep: '#0A3D25',         // deep green for headlines
    mist: '#E8EFEA',
    muted: '#56675E',
    white: '#FFFFFF'
  };
  const DISPLAY = '"Barlow Condensed","Arial Narrow",Impact,sans-serif';
  const BODY = '"DM Sans",system-ui,-apple-system,"Segoe UI",Arial,sans-serif';

  const CANDIDATE_NAME = 'Rtd. IGP Muhammad Abubakar Adamu';
  const TAG_LINE_1 = 'for Governor';
  const TAG_LINE_2 = 'Nasarawa State 2027';
  const STAND_WITH = 'I Stand With';
  const CREDIT = 'Crafted by Bilyaminu™';

  let candidateImg = null;
  let logoImg = null;
  let supporterImg = null;

  const loadImage = src => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

  /* Draw an image so it fills (x, y, w, h). fx / fy choose which part
     of the overflow is kept: 0 = top/left, 1 = bottom/right. */
  function cover(img, x, y, w, h, fx = 0.5, fy = 0.5) {
    const r = Math.max(w / img.width, h / img.height);
    const nw = img.width * r;
    const nh = img.height * r;
    ctx.drawImage(img, x - (nw - w) * fx, y - (nh - h) * fy, nw, nh);
  }

  /* Shrink a font until the text fits maxW, then ellipsize as a last resort. */
  function fitText(text, weight, family, maxW, start, min) {
    let size = start;
    ctx.font = `${weight} ${size}px ${family}`;
    while (size > min && ctx.measureText(text).width > maxW) {
      size -= 1;
      ctx.font = `${weight} ${size}px ${family}`;
    }
    if (ctx.measureText(text).width > maxW) {
      let t = text;
      while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
      return { size, text: t.trimEnd() + '…' };
    }
    return { size, text };
  }

  /* A swoosh echoing the SDP logo: everything below the curve is filled. */
  function swoosh(y0, c1x, c1y, c2x, c2y, y3, fill) {
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, W, y3);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  /* "for Governor" on orange, "Nasarawa State 2027" on deep green. */
  function drawOfficeBar(x, y, w, h) {
    const pad = 30;
    const slant = 30;
    let size = 84;
    const measure = t => ctx.measureText(t).width;
    const total = sz => {
      ctx.font = `700 ${sz}px ${DISPLAY}`;
      return pad + measure(TAG_LINE_1) + pad + slant + pad + measure(TAG_LINE_2) + pad;
    };
    while (size > 40 && total(size) > w) size -= 1;
    ctx.font = `700 ${size}px ${DISPLAY}`;
    const leftW = pad + measure(TAG_LINE_1) + pad;
    // Spread any spare width evenly so the bar always spans the full width.
    const spare = Math.max(0, w - total(size));
    const leftBlock = leftW + spare / 2;

    ctx.save();
    roundRect(x, y, w, h, 14);
    ctx.clip();
    ctx.fillStyle = COLOR.deep;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = COLOR.orange;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + leftBlock + slant, y);
    ctx.lineTo(x + leftBlock, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    const baseline = y + h / 2 + size * 0.3;
    ctx.fillStyle = COLOR.white;
    ctx.fillText(TAG_LINE_1, x + pad + spare / 4, baseline);
    ctx.fillText(TAG_LINE_2, x + leftBlock + slant + pad - slant / 2 + spare / 4, baseline);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawSupporterPhoto(cx, cy, r) {
    // Outer orange ring with a white gap, then the photo.
    ctx.save();
    ctx.shadowColor = 'rgba(10,61,37,.28)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 14, 0, Math.PI * 2);
    ctx.fillStyle = COLOR.white;
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, r + 12, 0, Math.PI * 2);
    ctx.lineWidth = 6;
    ctx.strokeStyle = COLOR.orange;
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    if (supporterImg) {
      cover(supporterImg, cx - r, cy - r, r * 2, r * 2, 0.5, 0.3);
    } else {
      // Placeholder silhouette until a photo is added.
      ctx.fillStyle = COLOR.mist;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.fillStyle = '#B9CBC0';
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.16, r * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx, cy + r * 0.92, r * 0.72, r * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    // Base
    ctx.fillStyle = COLOR.white;
    ctx.fillRect(0, 0, W, H);

    // 1. Candidate photograph, full width across the top
    ctx.fillStyle = '#0B1424';
    ctx.fillRect(0, 0, W, 900);
    if (candidateImg) cover(candidateImg, 0, 0, W, 900, 0.5, 0.1);

    // 2. Swoosh: green, orange, then the white text panel
    swoosh(754, 320, 839, 700, 659, 690, COLOR.green);
    swoosh(782, 330, 862, 710, 696, 726, COLOR.orange);
    swoosh(800, 340, 876, 720, 714, 748, COLOR.white);

    // 3. SDP logo, top left
    if (logoImg) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.4)';
      ctx.shadowBlur = 26;
      ctx.shadowOffsetY = 8;
      ctx.drawImage(logoImg, 44, 44, 196, 196);
      ctx.restore();
    }

    // 4. "I Stand With" reads straight into the candidate's name and office
    const maxW = W - MARGIN * 2;
    ctx.font = `700 46px ${DISPLAY}`;
    ctx.fillStyle = COLOR.orangeText;
    ctx.fillText(STAND_WITH, MARGIN, 884);
    const standW = ctx.measureText(STAND_WITH).width;
    ctx.fillStyle = '#D3E2D8';
    ctx.fillRect(MARGIN + standW + 24, 866, maxW - standW - 24, 4);

    const nameFit = fitText(CANDIDATE_NAME, 800, DISPLAY, maxW, 112, 60);
    ctx.fillStyle = COLOR.deep;
    ctx.fillText(nameFit.text, MARGIN, 974);

    // Office bar: an orange block and a deep-green block, joined by a slanted edge
    drawOfficeBar(MARGIN, 998, maxW, 88);

    // 5. Supporter: small round photo with name and community
    const r = 76;
    const cx = MARGIN + 14 + r;
    const cy = 1194;
    drawSupporterPhoto(cx, cy, r);

    const textX = cx + r + 44;
    const textMax = W - MARGIN - textX;
    const hasName = nameInput.value.trim().length > 0;
    const n = fitText(hasName ? nameInput.value.trim() : 'Your name', 700, BODY, textMax, 42, 22);
    ctx.fillStyle = hasName ? COLOR.deep : '#8A9A91';
    ctx.fillText(n.text, textX, cy - 2);

    const hasArea = areaInput.value.trim().length > 0;
    const a = fitText(hasArea ? areaInput.value.trim() : 'Community, LGA', 500, BODY, textMax, 28, 16);
    ctx.fillStyle = hasArea ? COLOR.muted : '#8A9A91';
    ctx.fillText(a.text, textX, cy + 38);

    // 7. Footer bar with the designer's mark
    const barH = 46;
    const barY = H - barH;
    ctx.fillStyle = COLOR.deep;
    ctx.fillRect(0, barY, W, barH);
    ctx.fillStyle = COLOR.green;
    ctx.fillRect(0, barY, W * 0.72, 6);
    ctx.fillStyle = COLOR.orange;
    ctx.fillRect(W * 0.72, barY, W * 0.28, 6);
    ctx.font = `600 19px ${BODY}`;
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.textAlign = 'right';
    ctx.fillText(CREDIT, W - MARGIN, barY + 33);
    ctx.textAlign = 'left';
  }

  /* ---- Inputs ---- */
  [nameInput, areaInput].forEach(input => input.addEventListener('input', draw));

  photoInput.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (!file || !file.type.startsWith('image/')) {
      supporterImg = null;
      draw();
      return;
    }
    const reader = new FileReader();
    reader.onload = () => loadImage(reader.result).then(img => {
      supporterImg = img;
      draw();
    });
    reader.readAsDataURL(file);
  });

  downloadBtn.addEventListener('click', () => {
    const slug = nameInput.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const fileName = `nasarawa-2027-poster${slug ? '-' + slug : ''}.png`;
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  });

  /* ---- Start: wait for fonts and fixed artwork, then paint ---- */
  const assets = window.POSTER_ASSETS || {};
  const fontsReady = document.fonts
    ? Promise.all([
        '800 100px "Barlow Condensed"',
        '700 74px "Barlow Condensed"',
        '700 34px "DM Sans"',
        '500 26px "DM Sans"'
      ].map(f => document.fonts.load(f))).catch(() => {})
    : Promise.resolve();

  draw();
  Promise.all([
    loadImage(assets.candidate).then(img => { candidateImg = img; }).catch(() => {}),
    loadImage(assets.logo).then(img => { logoImg = img; }).catch(() => {}),
    fontsReady
  ]).then(draw);
})();
