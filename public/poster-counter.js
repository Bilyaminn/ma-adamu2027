(() => {
  'use strict';

  const wrap = document.getElementById('posterCount');
  if (!wrap) return;

  const numEl = document.getElementById('posterCountNum');
  const labelEl = document.getElementById('posterCountLabel');
  const nf = new Intl.NumberFormat('en-NG');
  const reduce = !!(window.SiteMotion && window.SiteMotion.reduce);

  const setLabel = n => { labelEl.textContent = n === 1 ? 'poster downloaded so far' : 'posters downloaded so far'; };

  function animateTo(target, instant) {
    const from = Number(numEl.textContent.replace(/,/g, '')) || 0;
    if (instant || reduce || target <= from) {
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
    /* Called once a poster download has actually started.
       The number on screen is updated straight away, without waiting for
       the server to answer: on a phone, downloading a poster often opens
       or saves the image immediately, which can leave the page before the
       network reply ever arrives back at this script. The count is still
       recorded on the server either way (see db.js); this just makes sure
       the visitor sees it move. If the reply does arrive while the page is
       still open and someone else's download nudged the real total ahead
       of the guess, the number is corrected up to match. */
    record() {
      if (!window.SiteDB || !window.SiteDB.ready) return;
      const shown = Number(numEl.textContent.replace(/,/g, '')) || 0;
      const guess = shown + 1;
      wrap.hidden = false;
      animateTo(guess, true);
      window.SiteDB.recordPosterDownload().then(total => {
        if (typeof total === 'number' && total > guess) animateTo(total);
      }).catch(() => { /* the download already happened; a missed reconcile is not worth bothering the visitor about */ });
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
