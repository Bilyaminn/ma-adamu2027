(() => {
  'use strict';

  const wrap = document.getElementById('posterCount');
  if (!wrap) return;

  const numEl = document.getElementById('posterCountNum');
  const labelEl = document.getElementById('posterCountLabel');
  const nf = new Intl.NumberFormat('en-NG');
  const reduce = !!(window.SiteMotion && window.SiteMotion.reduce);

  const setLabel = n => { labelEl.textContent = n === 1 ? 'poster downloaded so far' : 'posters downloaded so far'; };

  function animateTo(target) {
    const from = Number(numEl.textContent.replace(/,/g, '')) || 0;
    if (reduce || target <= from) {
      numEl.textContent = nf.format(target);
      setLabel(target);
      return;
    }
    const start = performance.now();
    const duration = 900;
    const tick = now => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      numEl.textContent = nf.format(Math.round(from + (target - from) * eased));
      if (t < 1) requestAnimationFrame(tick);
      else setLabel(target);
    };
    requestAnimationFrame(tick);
  }

  window.PosterCounter = {
    /* Called once a poster download has actually started. */
    record() {
      if (!window.SiteDB || !window.SiteDB.ready) return;
      window.SiteDB.recordPosterDownload().then(total => {
        if (typeof total === 'number') animateTo(total);
      }).catch(() => { /* the download already happened; a missed count is not worth bothering the visitor about */ });
    }
  };

  if (window.SiteDB && window.SiteDB.ready) {
    window.SiteDB.posterDownloadCount().then(total => {
      if (typeof total !== 'number') return;
      wrap.hidden = false;
      numEl.textContent = '0';
      animateTo(total);
    }).catch(() => { /* stay hidden if the count can't be read */ });
  }
})();
