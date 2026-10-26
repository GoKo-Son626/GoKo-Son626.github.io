/* Local light on the reading surfaces; filtering and navigation stay in explorer.js. */
(() => {
  'use strict';
  const body = document.body;
  const nav = document.querySelector('.collection-nav');
  if (!body.classList.contains('celestial-index') || !nav) return;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const colors = {
    all: '164,193,226', cfs: '219,164,99', arm: '176,159,218',
    eds: '153,215,231', linux: '218,137,86', ebpf: '139,191,167', tools: '190,208,221'
  };
  const tracer = document.createElement('span');
  tracer.className = 'nav-tracer';
  tracer.setAttribute('aria-hidden', 'true');
  nav.appendChild(tracer);
  let activeSurface = null, previewId = null, frame = 0, x = 0, y = 0;
  let clickedLink = null, clickTimer = 0;
  const enabled = () => finePointer.matches && !reducedMotion.matches && body.dataset.motionPaused !== 'true';
  const surfaceFor = target => target instanceof Element ? target.closest('.entry-title-link, .collection-link') : null;

  function preview(link) {
    const id = link ? link.dataset.collection : null;
    if (id === previewId) return;
    previewId = id;
    nav.classList.toggle('is-previewing', !!link);
    if (link) {
      const bounds = link.getBoundingClientRect(), parent = nav.getBoundingClientRect();
      nav.style.setProperty('--nav-y', `${bounds.top - parent.top + nav.scrollTop}px`);
      nav.style.setProperty('--nav-height', `${bounds.height}px`);
      nav.style.setProperty('--preview-rgb', colors[id] || colors.all);
    }
    window.dispatchEvent(new CustomEvent('explorer:preview', { detail: { id } }));
  }
  function reset() {
    cancelAnimationFrame(frame); frame = 0;
    if (activeSurface) activeSurface.classList.remove('is-pointer-lit');
    activeSurface = null;
    preview(null);
  }
  function illuminate(surface) {
    if (activeSurface === surface) return;
    if (activeSurface) activeSurface.classList.remove('is-pointer-lit');
    activeSurface = surface;
    if (surface) surface.classList.add('is-pointer-lit');
    preview(surface && surface.classList.contains('collection-link') ? surface : null);
  }
  function positionLight() {
    frame = 0;
    if (!enabled() || !activeSurface || !activeSurface.isConnected || activeSurface.hidden) { reset(); return; }
    const rect = activeSurface.getBoundingClientRect();
    activeSurface.style.setProperty('--light-x', `${Math.max(0, Math.min(rect.width, x - rect.left))}px`);
    activeSurface.style.setProperty('--light-y', `${Math.max(0, Math.min(rect.height, y - rect.top))}px`);
  }
  document.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || !enabled()) return;
    x = event.clientX; y = event.clientY;
    illuminate(surfaceFor(event.target));
    if (activeSurface && activeSurface.classList.contains('collection-link') && !frame) frame = requestAnimationFrame(positionLight);
  }, { passive: true });
  document.addEventListener('pointerout', event => { if (!event.relatedTarget) reset(); }, { passive: true });
  document.addEventListener('focusin', event => {
    if (!enabled()) return;
    const surface = surfaceFor(event.target);
    illuminate(surface);
    if (surface && surface.classList.contains('collection-link')) {
      const rect = surface.getBoundingClientRect();
      x = rect.left + rect.width * .28; y = rect.top + rect.height * .45;
      positionLight();
    }
  });
  document.addEventListener('focusout', event => {
    if (surfaceFor(event.relatedTarget) !== activeSurface) reset();
  });
  nav.addEventListener('click', event => {
    const link = event.target instanceof Element ? event.target.closest('.collection-link') : null;
    if (!link || !enabled() || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    clearTimeout(clickTimer);
    if (clickedLink) clickedLink.classList.remove('is-locking');
    clickedLink = link;
    link.classList.add('is-locking');
    preview(null);
    clickTimer = setTimeout(() => { link.classList.remove('is-locking'); clickedLink = null; }, 650);
  });
  window.addEventListener('explorer:collection', reset);
  window.addEventListener('blur', reset);
  window.addEventListener('scroll', reset, { passive: true });
  window.addEventListener('resize', reset, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
  reducedMotion.addEventListener('change', reset);
  finePointer.addEventListener('change', reset);
  new MutationObserver(() => { if (!enabled()) reset(); }).observe(body, {
    attributes: true, attributeFilter: ['data-motion-paused']
  });
})();
