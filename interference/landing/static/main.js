/* ── Interference Landing — JS ──────────────────── */
/* Scroll reveal · Nav state · Smooth scroll · Tab switch · Cursor effect */

(function () {
  'use strict';
  const html = document.documentElement;
  html.classList.remove('no-js');

  /* ── Scroll reveal (Intersection Observer) ─────── */
  const revealEls = document.querySelectorAll(
    '.reveal, .reveal-s1, .reveal-s2, .reveal-s3, .reveal-s4'
  );

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  revealEls.forEach((el) => observer.observe(el));

  /* ── Nav scroll state ──────────────────────────── */
  const nav = document.getElementById('nav');
  if (nav) {
    const onScroll = () => {
      nav.classList.toggle('scrolled', window.scrollY > 20);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ── Smooth scroll for nav links ───────────────── */
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    });
  });

  /* ── Install tab switch ────────────────────────── */
  const tabs = document.querySelectorAll('.install-tab');
  const blocks = document.querySelectorAll('.install-block');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const method = tab.dataset.method;
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      blocks.forEach((b) => {
        b.classList.toggle('hidden', b.dataset.method !== method);
      });
    });
  });

  /* ── Custom cursor (desktop only) ──────────────── */
  const cursor = document.querySelector('.cursor');
  if (cursor && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    let mouseX = 0;
    let mouseY = 0;
    let cursorX = 0;
    let cursorY = 0;

    document.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    });

    const hoverTargets = document.querySelectorAll(
      'a, button, .btn, .card, .spec-card, .badge, .install-tab'
    );

    hoverTargets.forEach((el) => {
      el.addEventListener('mouseenter', () => cursor.classList.add('hover-link'));
      el.addEventListener('mouseleave', () => cursor.classList.remove('hover-link'));
    });

    function animate() {
      cursorX += (mouseX - cursorX) * 0.15;
      cursorY += (mouseY - cursorY) * 0.15;
      cursor.style.left = cursorX + 'px';
      cursor.style.top = cursorY + 'px';
      requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
  }

  /* ── Hero parallax waves ───────────────────────── */
  const waves = document.querySelector('.interference-waves');
  if (waves) {
    let ticking = false;
    window.addEventListener(
      'scroll',
      () => {
        if (!ticking) {
          requestAnimationFrame(() => {
            const scrollY = window.scrollY;
            waves.style.transform = `translateY(${scrollY * 0.15}px)`;
            ticking = false;
          });
          ticking = true;
        }
      },
      { passive: true }
    );
  }

  /* ── Terminal cursor blink pause ───────────────── */
  const blinkCursor = document.querySelector('.blink');
  if (blinkCursor) {
    blinkCursor.addEventListener('click', () => {
      blinkCursor.classList.toggle('blink');
    });
  }
})();
