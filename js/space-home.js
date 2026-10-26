/* The front page is a fixed scene. Navigation remains ordinary, shareable links. */
(() => {
  'use strict';
  const body = document.body;
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const hover = matchMedia('(hover: hover) and (pointer: fine)');
  const motion = document.querySelector('[data-motion]');
  const caption = document.getElementById('focus-kicker');
  const detail = document.getElementById('focus-description');
  const nodes = Array.from(document.querySelectorAll('.star-node'));
  const canvas = document.getElementById('space-stars');
  const ctx = canvas && canvas.getContext('2d');
  let paused = false;
  try { paused = localStorage.getItem('goko-space-motion-paused') === 'true'; } catch (_) {}
  let width = innerWidth, height = innerHeight, frame = 0, last = 0, elapsed = 0;
  let pointerX = 0, pointerY = 0, viewX = 0, viewY = 0;
  const stars = Array.from({ length: 75 }, () => ({ x: Math.random(), y: Math.random() * .75, r: .3 + Math.random() * .75, phase: Math.random() * 6.28, depth: .25 + Math.random() * .75 }));
  const moving = () => !paused && !reduce.matches && !document.hidden;

  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    stars.forEach(star => {
      const opacity = .16 + (Math.sin(elapsed * .45 + star.phase) + 1) * .16;
      ctx.fillStyle = `rgba(195,225,250,${opacity})`;
      ctx.beginPath();
      ctx.arc(star.x * width + viewX * star.depth, star.y * height + viewY * star.depth, star.r, 0, Math.PI * 2);
      ctx.fill();
    });
    // A brief, quiet meteor high in the sky; absent when motion is paused.
    const phase = elapsed % 24;
    if (moving() && phase > 17 && phase < 18.2) {
      const t = (phase - 17) / 1.2;
      const x = width * (.78 - t * .18), y = height * (.08 + t * .12);
      const tail = ctx.createLinearGradient(x, y, x + 80, y - 40);
      tail.addColorStop(0, `rgba(213,234,255,${Math.sin(t * Math.PI) * .55})`);
      tail.addColorStop(1, 'rgba(213,234,255,0)');
      ctx.strokeStyle = tail; ctx.lineWidth = .8;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 80, y - 40); ctx.stroke();
    }
  }
  function tick(now) {
    frame = 0;
    if (!moving()) return;
    if (now - last > 33) {
      elapsed += Math.min((now - last) / 1000, .07); last = now;
      viewX += (pointerX - viewX) * .055; viewY += (pointerY - viewY) * .055;
      root.style.setProperty('--view-x', `${viewX.toFixed(2)}px`);
      root.style.setProperty('--view-y', `${viewY.toFixed(2)}px`);
      draw();
    }
    frame = requestAnimationFrame(tick);
  }
  function refresh() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    body.classList.toggle('motion-paused', paused || reduce.matches);
    motion.setAttribute('aria-pressed', String(paused));
    motion.setAttribute('aria-label', paused ? '恢复场景动画' : '暂停场景动画');
    motion.querySelector('.motion-label').textContent = paused ? '恢复动态' : '暂停动态';
    if (!document.hidden) draw();
    if (moving()) { last = performance.now(); frame = requestAnimationFrame(tick); }
  }
  function resize() {
    width = innerWidth; height = innerHeight;
    if (ctx) {
      const ratio = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = width * ratio; canvas.height = height * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    refresh();
  }
  window.addEventListener('pointermove', event => {
    if (!hover.matches || !moving()) return;
    pointerX = (event.clientX / width - .5) * 28;
    pointerY = (event.clientY / height - .5) * 20;
  }, { passive: true });
  document.addEventListener('pointerleave', () => { pointerX = 0; pointerY = 0; });
  motion.addEventListener('click', () => {
    paused = !paused;
    try { localStorage.setItem('goko-space-motion-paused', String(paused)); } catch (_) {}
    refresh();
  });
  function showNode(node) {
    caption.textContent = `${node.dataset.name} · ${node.dataset.count} 篇手记`;
    window.dispatchEvent(new CustomEvent('sector-focus', { detail: { id: node.dataset.sector } }));
    detail.textContent = node.dataset.detail;
  }
  function clearNode() {
    caption.textContent = '学习 · 实践 · 记录';
    window.dispatchEvent(new CustomEvent('sector-focus', { detail: { id: 'default' } }));
    detail.textContent = '选择一个方向，打开文章目录。';
  }
  nodes.forEach(node => {
    node.addEventListener('pointerenter', () => showNode(node));
    node.addEventListener('pointerleave', clearNode);
    node.addEventListener('focus', () => showNode(node));
    node.addEventListener('blur', clearNode);
  });
  const sceneToggle = document.querySelector('[data-scene-toggle]');
  const navigation = document.getElementById('space-navigation');
  const footer = document.getElementById('space-footer');
  function setSceneOnly(enabled) {
    body.classList.toggle('scene-only', enabled);
    navigation.inert = enabled;
    footer.inert = enabled;
    sceneToggle.setAttribute('aria-pressed', String(enabled));
    sceneToggle.setAttribute('aria-label', enabled ? '显示导航' : '隐藏导航，专注星空');
    sceneToggle.querySelector('span').textContent = enabled ? '返回导航' : '专注星空';
  }
  sceneToggle.addEventListener('click', () => setSceneOnly(!body.classList.contains('scene-only')));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && body.classList.contains('scene-only')) {
      setSceneOnly(false); sceneToggle.focus();
    }
  });
  let departing = false;
  document.querySelectorAll('a[href]').forEach(link => {
    const destination = new URL(link.href, location.href);
    if (destination.origin !== location.origin || !destination.pathname.endsWith('/explore/')) return;
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || link.target || !moving()) return;
      event.preventDefault();
      if (departing) return;
      departing = true;
      link.classList.add('is-leaving');
      body.classList.add('departing');
      setTimeout(() => location.assign(link.href), 300);
    });
  });
  window.addEventListener('pageshow', () => {
    departing = false; body.classList.remove('departing');
    nodes.forEach(node => node.classList.remove('is-leaving'));
    refresh();
  });
  document.addEventListener('keydown', event => {
    if ((event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey)) || event.key === '/') {
      event.preventDefault();
      const target = document.querySelector('.header-explore');
      if (target) location.assign(target.href + '?focus=search');
    }
  });
  reduce.addEventListener('change', refresh);
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('resize', resize, { passive: true });
  resize();
})();
