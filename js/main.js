(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add('js');
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const easeInOutCubic = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  /* ---------- Always start at the top on reload ---------- */
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  scrollTo(0, 0);

  /* ---------- Lenis smooth scroll ---------- */
  let lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new Lenis({ autoRaf: true, lerp: 0.09, smoothWheel: true });
  }
  document.querySelectorAll('a[data-scroll]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href');
      const target = id === '#top' ? 0 : document.querySelector(id);
      if (target === null) return;
      e.preventDefault();
      if (lenis) {
        // Longer trips take longer, and the motion eases in and out instead of
        // shooting off at full speed (Lenis' default curve starts very fast).
        const to = target === 0 ? 0 : target.getBoundingClientRect().top + scrollY;
        const distance = Math.abs(to - scrollY);
        const duration = clamp(1.1 + distance / 5000, 1.2, 2.6);
        lenis.scrollTo(target, { duration, easing: easeInOutCubic });
      }
      else if (target === 0) scrollTo(0, 0);
      else target.scrollIntoView();
    });
  });
  /* ---------- Nav: hover pill, active section, mobile sheet ---------- */
  const navEl = document.querySelector('.nav');
  const links = document.getElementById('links');
  const pill = links.querySelector('.hover-pill');
  const navLinks = [...links.querySelectorAll('a')];
  navLinks.forEach(a => a.addEventListener('mouseenter', () => {
    pill.style.width = a.offsetWidth + 'px';
    pill.style.transform = `translateX(${a.offsetLeft}px)`;
  }));

  const navSecs = navLinks.map(a => document.getElementById(a.dataset.sec));
  const afterNav = document.getElementById('setup'); // past iPhone, nothing is highlighted
  function updateNav() {
    const line = innerHeight * 0.4;
    let active = -1;
    navSecs.forEach((s, i) => { if (s && s.getBoundingClientRect().top <= line) active = i; }); // Legal has no section
    if (afterNav.getBoundingClientRect().top <= line) active = -1;
    navLinks.forEach((a, i) => a.classList.toggle('active', i === active));
  }

  const burger = document.getElementById('burger');
  const setSheet = open => {
    navEl.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', open);
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };
  burger.addEventListener('click', () => setSheet(!navEl.classList.contains('open')));
  document.querySelectorAll('.sheet a').forEach(a => a.addEventListener('click', () => setSheet(false)));
  addEventListener('keydown', e => { if (e.key === 'Escape') setSheet(false); });

  /* ---------- Contract address buttons ---------- */
  const CA = '0000000000000000000000000000000000000000pump';
  const SHOWN = 6;
  const cas = [...document.querySelectorAll('.ca')];
  cas.forEach(btn => {
    btn.querySelector('.ca-v').innerHTML =
      `<span>${CA.slice(0, SHOWN)}</span><span class="ca-dots">…</span><span class="ca-rest">${CA.slice(SHOWN)}</span>`;
    btn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(CA); }
      catch {
        const t = document.createElement('textarea');
        t.value = CA; t.style.position = 'fixed'; t.style.opacity = '0';
        document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
      }
      btn.querySelector('.ca-l').textContent = 'COPIED';
      btn.classList.add('copied');
      clearTimeout(btn._t);
      btn._t = setTimeout(() => {
        btn.classList.remove('copied');
        btn.querySelector('.ca-l').textContent = 'CA';
      }, 1600);
    });
  });
  // The hidden part animates open to its real width, so the button grows in place.
  function sizeCAs() {
    cas.forEach(btn => {
      btn.style.setProperty('--rw', btn.querySelector('.ca-rest').scrollWidth + 'px');
    });
  }
  sizeCAs();
  document.fonts && document.fonts.ready.then(sizeCAs);

  /* ---------- Blur-in headings (drone-style) ---------- */
  document.querySelectorAll('.blur-in').forEach(el => {
    const words = el.textContent.trim().split(/\s+/);
    el.innerHTML = words.map((w, i) => `<span class="w" style="--i:${i}">${w}</span>`).join(' ');
  });
  const blurObserver = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('in'); blurObserver.unobserve(en.target); }
    });
  }, { threshold: 0.4 });
  document.querySelectorAll('.blur-in').forEach(el => {
    if (el.closest('.hero')) setTimeout(() => el.classList.add('in'), 150);
    else blurObserver.observe(el);
  });

  /* ---------- Small ripple wherever you click the background ---------- */
  if (!reduce) {
    addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('a, button, input, label, .q')) return;
      ['', 'r2'].forEach(extra => {
        const r = document.createElement('span');
        r.className = 'ripple-fx ' + extra;
        r.style.left = e.clientX + 'px';
        r.style.top = e.clientY + 'px';
        document.body.appendChild(r);
        r.addEventListener('animationend', () => r.remove());
      });
    });
  }

  /* ---------- Page-wide dot field that reacts to the cursor ---------- */
  (() => {
    const cvs = document.getElementById('dots');
    const heroEl = document.getElementById('hero');
    const ctx = cvs.getContext('2d');
    const GAP = 28, RADIUS = 170, PUSH = 10;
    let w = 0, h = 0, dpr = 1;
    let mx = -9999, my = -9999;      // where the cursor is
    let ex = -9999, ey = -9999;      // eased position, so the effect trails smoothly
    let strength = 0, target = 0, running = false;

    function resize() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      w = innerWidth; h = innerHeight;
      cvs.width = w * dpr; cvs.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      // Dots scroll with the page, except while the hero is pinned: the hero stands
      // still during its steps, so the dots do too.
      const pinned = heroEl.offsetHeight - innerHeight;
      const moved = scrollY <= pinned ? 0 : scrollY - pinned;
      const offY = -(moved % GAP);
      for (let y = offY; y < h + GAP; y += GAP) {
        for (let x = GAP / 2; x < w; x += GAP) {
          let px = x, py = y, k = 0;
          if (strength > 0.01) {
            const dx = x - ex, dy = y - ey, d = Math.hypot(dx, dy);
            if (d < RADIUS) {
              k = (1 - d / RADIUS) ** 2 * strength;
              px += (dx / (d || 1)) * PUSH * k;
              py += (dy / (d || 1)) * PUSH * k;
            }
          }
          // base dots are faint white; near the cursor they grow and shift toward purple
          const r = 0.9 + 1.5 * k;
          const a = 0.08 + 0.55 * k;
          ctx.fillStyle = k > 0
            ? `rgba(${Math.round(255 - 132 * k)},${Math.round(255 - 163 * k)},255,${a})`
            : 'rgba(255,255,255,.08)';
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    function tick() {
      ex += (mx - ex) * 0.18;
      ey += (my - ey) * 0.18;
      strength += (target - strength) * 0.12;
      draw();
      const settled = Math.abs(mx - ex) < 0.5 && Math.abs(my - ey) < 0.5 && Math.abs(target - strength) < 0.01;
      if (settled) running = false;
      else requestAnimationFrame(tick);
    }
    const kick = () => { if (!running) { running = true; requestAnimationFrame(tick); } };

    if (!reduce && matchMedia('(pointer: fine)').matches) {
      addEventListener('pointermove', e => {
        if (ex < -999) { ex = e.clientX; ey = e.clientY; }
        mx = e.clientX; my = e.clientY; target = 1; kick();
      }, { passive: true });
      document.addEventListener('pointerleave', () => { target = 0; kick(); });
    }
    addEventListener('scroll', () => { if (!running) draw(); }, { passive: true });
    addEventListener('resize', resize);
    resize();
  })();

  /* ---------- Letter-by-letter fill on scroll (drone-style) ---------- */
  const fills = [...document.querySelectorAll('.fill')].map(el => {
    const words = el.textContent.trim().split(/\s+/);
    el.innerHTML = words.map(w =>
      `<span class="fw">${[...w].map(c => `<span class="ch">${c}</span>`).join('')}</span>`
    ).join(' ');
    const base = el.classList.contains('statement') ? 0.14 : 0.2;
    return { el, chars: [...el.querySelectorAll('.ch')], base };
  });
  const EDGE = 14; // how many letters are mid-fade at once
  function updateFills() {
    const vh = innerHeight;
    for (const f of fills) {
      const r = f.el.getBoundingClientRect();
      if (r.bottom < -vh || r.top > vh * 2) continue;
      const p = reduce ? 1 : clamp((vh * 0.88 - r.top) / (vh * 0.43 + r.height), 0, 1);
      const head = p * (f.chars.length + EDGE);
      f.chars.forEach((c, i) => {
        const t = clamp((head - i) / EDGE, 0, 1);
        c.style.setProperty('--o', (f.base + (1 - f.base) * t).toFixed(3));
      });
    }
  }

  /* ---------- Hero: scale the stage to fit ---------- */
  const stage = document.getElementById('stage');
  const stageBox = document.getElementById('stageBox');
  const DESIGN_W = 480, DESIGN_H = 620;
  new ResizeObserver(() => {
    const s = Math.min(stageBox.clientWidth / DESIGN_W, stageBox.clientHeight / DESIGN_H, 1.15);
    stage.style.setProperty('--s', Math.max(s, 0.3).toFixed(3));
  }).observe(stageBox);

  /* ---------- Hero: the habit, acted out on scroll ---------- */
  const hero = document.getElementById('hero');
  const rail = document.getElementById('rail');
  const steps = [...rail.querySelectorAll('.step')];
  const win = stage.querySelector('.win');
  let edges = [], lineLen = 0, current = -1, loaded = false, timers = [];

  // Line runs centre-to-centre; offsetLeft ignores the active dot's scale.
  function measureRail() {
    const dots = steps.map(s => {
      const d = s.querySelector('.dot');
      return { left: s.offsetLeft + d.offsetLeft, w: d.offsetWidth };
    });
    const start = dots[0].left + dots[0].w / 2;
    lineLen = dots[dots.length - 1].left + dots[dots.length - 1].w / 2 - start;
    edges = dots.map(d => d.left - start);
    rail.style.setProperty('--ll', start + 'px');
    rail.style.setProperty('--lw', lineLen + 'px');
  }

  const later = (ms, fn) => timers.push(setTimeout(fn, reduce ? 0 : ms));
  const set = (k, v) => { stage.dataset[k] = v; };
  const flag = (cls, on) => stage.classList.toggle(cls, on);
  const pulse = (cls, ms) => { flag(cls, false); void stage.offsetWidth; flag(cls, true); later(ms, () => flag(cls, false)); };

  // Window tilt per step, for a bit of drama between states.
  const TILT = [[-10, 4], [-4, 2], [6, -2], [2, 0], [-12, 5]];

  function goTo(n) {
    if (n === current) return;
    const prev = current;
    current = n;
    timers.forEach(clearTimeout); timers = [];
    ['typing', 'pressU', 'pressS', 'confirmed', 'burst'].forEach(c => flag(c, false));

    win.style.setProperty('--ry', TILT[n][0] + 'deg');
    win.style.setProperty('--rx', TILT[n][1] + 'deg');

    const plugged = loaded && n <= 3;
    flag('spent', n === 4);

    if (n === 0) {
      flag('unlocked', false);
      set('screen', 'home');
      set('status', plugged ? 'usb' : 'locked');
    }
    if (n === 1) {
      flag('unlocked', false);
      set('screen', 'pass');
      set('status', 'usb');
      later(250, () => flag('typing', true));
      later(1050, () => flag('pressU', true));
      later(1250, () => {
        flag('pressU', false);
        flag('unlocked', true);
        set('status', 'open');
        flag('burst', true);
        later(900, () => flag('burst', false));
      });
      later(1650, () => set('screen', 'home'));
    }
    if (n === 2) {
      flag('unlocked', true);
      set('status', 'open');
      set('screen', 'review');
    }
    if (n === 3) {
      flag('unlocked', true);
      set('status', 'open');
      set('screen', 'review');
      later(350, () => flag('pressS', true));
      later(1000, () => set('screen', 'sent'));
      later(2300, () => flag('confirmed', true));
    }
    if (n === 4) {
      flag('unlocked', false);
      set('screen', 'home');
      set('status', 'after');
      if (prev !== -1) later(450, () => pulse('lockclank', 600));
    }
  }

  function updateHero() {
    const travel = hero.offsetHeight - innerHeight;
    const p = clamp(-hero.getBoundingClientRect().top / travel, 0, 1);
    // The line touches Unplug exactly at the end of the pinned scroll,
    // so the page moves on the moment Unplug lights up.
    const lastEdge = edges[edges.length - 1];
    const tip = p * lastEdge;
    rail.style.setProperty('--fill', lineLen > 0 ? (tip / lineLen).toFixed(4) : 0);
    let active = 0;
    if (lineLen > 0) edges.forEach((e, i) => { if (tip >= e - 0.5) active = i; });
    steps.forEach((s, i) => {
      s.classList.toggle('on', i === active);
      s.classList.toggle('done', i < active);
    });
    goTo(active);
  }

  // Hovering the window tilts it toward the cursor, like turning it in your hand.
  if (!reduce && matchMedia('(pointer: fine)').matches) {
    win.addEventListener('pointermove', e => {
      const r = win.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      stage.style.setProperty('--hy', (x * 18).toFixed(2) + 'deg');
      stage.style.setProperty('--hx', (-y * 14).toFixed(2) + 'deg');
    });
    win.addEventListener('pointerleave', () => {
      stage.style.setProperty('--hy', '0deg');
      stage.style.setProperty('--hx', '0deg');
    });
  }

  /* ---------- QR pattern for the Receive card ---------- */
  const qr = document.querySelector('.qr');
  if (qr) {
    const N = 21; let seed = 7;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const finder = (r, c) => {
      for (const [fr, fc] of [[0, 0], [0, N - 7], [N - 7, 0]]) {
        const y = r - fr, x = c - fc;
        if (y >= 0 && y < 7 && x >= 0 && x < 7)
          return y === 0 || y === 6 || x === 0 || x === 6 || (y >= 2 && y <= 4 && x >= 2 && x <= 4) ? 1 : 0;
      }
      return -1;
    };
    let html = '';
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const f = finder(r, c);
      html += (f === 1 || (f === -1 && rnd() > 0.52)) ? '<i></i>' : '<span></span>';
    }
    qr.innerHTML = html;
  }

  /* ---------- FAQ accordion ---------- */
  document.querySelectorAll('.qa').forEach(qa => {
    const btn = qa.querySelector('.q');
    btn.addEventListener('click', () => {
      const open = !qa.classList.contains('open');
      qa.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open);
    });
  });

  /* ---------- Looping card demos (only run while the card is on screen) ---------- */
  const wait = ms => new Promise(r => setTimeout(r, ms));
  function whileVisible(el, run) {
    let on = false;
    new IntersectionObserver(([en]) => {
      if (en.isIntersecting && !on) { on = true; (async () => { while (on) await run(); })(); }
      if (!en.isIntersecting) on = false;
    }, { threshold: 0.3 }).observe(el);
  }

  if (!reduce) {
    // Accounts: the selection moves between accounts
    const accts = [...document.querySelectorAll('.ua')];
    let ai = 0;
    whileVisible(document.querySelector('.ui-accts'), async () => {
      await wait(2600);
      accts[ai].classList.remove('on');
      ai = (ai + 1) % accts.length;
      accts[ai].classList.add('on');
    });

    // Tokens: paste, read details, clear, again
    const tokIn = document.querySelector('.ut-in'), tokOut = document.querySelector('.ut-out');
    const tokText = tokIn.firstChild.nodeValue;
    whileVisible(document.querySelector('.ui-token'), async () => {
      await wait(4200);
      tokOut.classList.remove('show');
      await wait(500);
      await new Promise(done => typeInto(tokIn, tokText, done));
      tokOut.classList.add('show');
    });

    // Receive: switch networks right on the Receive screen
    const recv = document.querySelector('.ui-recv'), net = recv.querySelector('.ur-n');
    const nets = [['Base', '#0052ff'], ['Ethereum', '#627eea'], ['Arbitrum One', '#28a0f0'], ['Polygon', '#8247e5']];
    let ni = 0;
    whileVisible(recv, async () => {
      await wait(2400);
      ni = (ni + 1) % nets.length;
      net.classList.add('swap'); recv.classList.add('flash');
      await wait(260);
      net.querySelector('span').textContent = nets[ni][0];
      net.querySelector('b').style.background = nets[ni][1];
      net.classList.remove('swap'); recv.classList.remove('flash');
    });

    // Approvals: revoke the unlimited allowance, then reset
    const appr = document.querySelector('.uap'), apprBtn = appr.querySelector('b'), apprAmt = appr.querySelector('em');
    whileVisible(document.querySelector('.ui-appr'), async () => {
      await wait(1800);
      appr.classList.add('press'); await wait(180); appr.classList.remove('press');
      appr.classList.add('revoking'); apprBtn.textContent = 'Revoking';
      await wait(1500);
      appr.classList.replace('revoking', 'revoked'); apprBtn.textContent = 'Revoked'; apprAmt.textContent = '0';
      await wait(2600);
      appr.classList.remove('revoked'); apprBtn.textContent = 'Revoke'; apprAmt.textContent = 'Unlimited';
    });

    // Activity: a new transaction arrives as pending, then confirms
    const act = document.querySelector('.ui-act');
    const pool = [['in', '↓', 'Received 120 USDC'], ['', '↑', 'Sent 0.1 ETH'], ['in', '↓', 'Received 0.5 ETH'], ['', '↑', 'Sent 40 USDC'], ['', '↑', 'Sent 0.25 ETH']];
    let pi = 0;
    whileVisible(act, async () => {
      await wait(1600);
      const pending = act.querySelector('.pnd');
      if (pending) { pending.classList.remove('pnd'); pending.textContent = 'Confirmed'; }
      await wait(1800);
      const [cls, arrow, label] = pool[pi++ % pool.length];
      const row = document.createElement('div');
      row.className = 'uac enter';
      row.innerHTML = `<i class="${cls}">${arrow}</i><span>${label}<small class="pnd">Pending</small></span>`;
      const last = act.lastElementChild;
      act.prepend(row);
      last.classList.add('leave');
      await wait(450);
      last.remove();
    });

  }
  /* ---------- Giant background words drift sideways as their section passes ---------- */
  const giants = [...document.querySelectorAll('.giant')].map(g => ({
    sec: g.parentElement, span: g.querySelector('span'), dir: +g.dataset.dir || 1
  }));
  function updateGiants() {
    if (reduce) return;
    giants.forEach(({ sec, span, dir }) => {
      const r = sec.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return;
      const p = (innerHeight - r.top) / (innerHeight + r.height); // 0 → 1 while on screen
      span.style.setProperty('--gx', (dir * (p - 0.5) * 360).toFixed(1) + 'px');
    });
  }

  /* ---------- Footer wordmark rises in as you reach the bottom ---------- */
  const mark = document.querySelector('.foot-mark span');
  function updateMark() {
    const r = mark.parentElement.getBoundingClientRect();
    const p = reduce ? 1 : clamp((innerHeight - r.top) / r.height, 0, 1);
    mark.style.setProperty('--my', ((1 - p) * 40).toFixed(1) + '%');
  }

  /* ---------- Polish: scroll progress ---------- */
  const navBar = document.querySelector('.nav');
  function updateProgress() {
    const max = document.documentElement.scrollHeight - innerHeight;
    navBar.style.setProperty('--sp', max > 0 ? (scrollY / max).toFixed(4) : 0);
  }

  /* ---------- Polish: cursor spotlight on cards ---------- */
  document.querySelectorAll('.card, .steps3 li, .ui-review, .recover').forEach(el => {
    el.classList.add('spot');
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      el.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });

  /* ---------- Polish: things that animate once they come into view ---------- */
  // Conveyor belt: a second copy of the logos follows the first, so the loop has no seam.
  const beltTrack = document.getElementById('beltTrack');
  [...beltTrack.children].forEach(li => {
    const copy = li.cloneNode(true);
    copy.setAttribute('aria-hidden', 'true');
    beltTrack.appendChild(copy);
  });

  const countUp = el => {
    const to = parseFloat(el.dataset.count);
    const fmt = v => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (reduce) { el.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = 1600;
    const tick = now => {
      const k = Math.min((now - t0) / dur, 1);
      el.textContent = fmt(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const typeInto = (el, text, done) => {
    const caret = el.querySelector('.caret');
    el.firstChild.nodeValue = '';
    let i = 0;
    const step = () => {
      el.firstChild.nodeValue = text.slice(0, ++i);
      if (i < text.length) setTimeout(step, reduce ? 0 : 55);
      else done();
    };
    if (caret) setTimeout(step, reduce ? 0 : 400);
  };

  const viewObserver = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      const el = en.target;
      el.classList.add('inview');
      viewObserver.unobserve(el);
      const n = el.querySelector('[data-count]');
      if (n) countUp(n);
      const tok = el.querySelector('.ut-in');
      if (tok) {
        const text = tok.firstChild.nodeValue;
        typeInto(tok, text, () => el.querySelector('.ut-out').classList.add('show'));
      }
      if (el.classList.contains('ui-review')) setTimeout(() => el.classList.add('acked'), reduce ? 0 : 2000);
    });
  }, { threshold: 0.35 });
  document.querySelectorAll('.card, .ui-review, .steps3').forEach(el => viewObserver.observe(el));

  /* ---------- Loop ---------- */
  function onScroll() { updateHero(); updateFills(); updateNav(); updateMark(); updateProgress(); updateGiants(); }
  if (lenis) lenis.on('scroll', onScroll);
  else addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => { measureRail(); sizeCAs(); onScroll(); });

  measureRail();
  onScroll();
  // The one load moment: the USB plugs in.
  addEventListener('load', () => setTimeout(() => {
    loaded = true;
    const n = current; current = -1; goTo(n);
  }, reduce ? 0 : 700));
})();
