/* Full-scene accretion field. Decorative Canvas2D; navigation stays in HTML. */
(() => {
  'use strict';
  const canvas = document.getElementById('orbital-canvas');
  const stage = canvas && canvas.closest('.orbital-stage');
  const ctx = canvas && canvas.getContext('2d', { alpha: true });
  if (!stage || !ctx) return;
  const body = document.body;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const TAU = Math.PI * 2;
  let width = 1, height = 1, size = 1, frame = 0, last = 0, time = 0;
  let visible = true, mobile = false, light = false, interactive = false, rendering = false;
  let intensity = 1, targetIntensity = 1, lastGeometry = null;
  let hooks = {};
  let pointerX = 0, pointerY = 0, driftX = 0, driftY = 0;
  let tone = 207, targetTone = 207;
  let seed = 8147;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const stars = Array.from({ length: 95 }, () => ({ x: random(), y: random(), r: random(), phase: random() * TAU }));
  const particles = Array.from({ length: 2200 }, () => ({
    angle: random() * TAU,
    radius: .335 + Math.pow(random(), 1.65) * 1.13,
    height: (random() - .5) * .052,
    brightness: random(), length: .009 + random() * .033,
    tone: random(), phase: random() * TAU
  }));
  const corona = Array.from({ length: 240 }, () => ({ angle: random() * TAU, radius: .29 + random() * .023, brightness: random(), length: .005 + random() * .03 }));
  const moving = () => !reduce.matches && !body.classList.contains('motion-paused');
  const active = () => visible && !document.hidden;
  const animating = () => moving() || interactive;
  const energy = () => 1 + Math.max(0, intensity - 1) * .24;
  const rgba = (r, g, b, a) => `rgba(${r},${g},${b},${a})`;

  function disk(front) {
    const count = mobile ? 800 : particles.length;
    ctx.globalCompositeOperation = light ? 'source-over' : 'screen';
    for (let i = 0; i < count; i++) {
      const p = particles[i];
      const angle = p.angle + time * (.08 + .105 / p.radius);
      const sin = Math.sin(angle), cos = Math.cos(angle);
      if ((sin > 0) !== front) continue;
      const nearCore = 1 - (p.radius - .335) / 1.13;
      const ripple = 1 + Math.sin(angle * 3 + p.radius * 11 - time * .16) * .016;
      const radius = p.radius * size * ripple;
      const depth = 1 + sin * .12;
      const warp = Math.sin(angle * 2 + p.radius * 7 + time * .06) * .017 * (1 - nearCore);
      const x = cos * radius * depth;
      const y = (sin * (.255 + driftY * .014) + p.height + warp) * radius * depth;
      const hot = .52 + .48 * Math.pow(Math.max(0, -cos), 2);
      const alpha = Math.min(.98, (.28 + p.brightness * .72) * (.24 + nearCore * .95) * hot * energy());
      let color;
      if (light) color = rgba(44, 117, 165, alpha * .8);
      else if (p.radius < .53 && p.tone > .81) color = rgba(255, 218, 151, alpha * .9);
      else if (p.tone > .93) color = `hsla(${tone},84%,76%,${alpha * .7})`;
      else if (p.tone > .39) color = rgba(226, 246, 255, alpha);
      else color = rgba(105, 190, 255, alpha * .9);
      const end = angle + p.length * (.45 + nearCore) * (1 + Math.max(0, intensity - 1) * .12);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(Math.cos(end) * radius * depth, (Math.sin(end) * (.255 + driftY * .014) + p.height + warp) * radius * depth);
      ctx.lineWidth = (p.brightness > .93 ? 1.6 : .82) * (mobile ? .85 : 1);
      ctx.strokeStyle = color;
      ctx.stroke();
      if (!light && p.brightness > .984 && nearCore > .35) {
        ctx.fillStyle = 'rgba(244,251,255,.96)';
        ctx.fillRect(x - .8, y - .8, 1.6, 1.6);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function ribbon(radius, start, end, color, lineWidth) {
    ctx.beginPath();
    const steps = 90;
    for (let i = 0; i <= steps; i++) {
      const a = start + (end - start) * i / steps;
      const r = radius * size * (1 + Math.sin(a * 3 + radius * 11 - time * .16) * .016);
      const x = Math.cos(a) * r, y = Math.sin(a) * r * .255;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.stroke();
  }

  function drawHook(name, geometry) {
    if (typeof hooks[name] !== 'function') return;
    ctx.save();
    try { hooks[name](ctx, geometry); } finally { ctx.restore(); }
  }

  function render(dt = 0) {
    if (!width || !height || rendering) return;
    rendering = true;
    ctx.clearRect(0, 0, width, height);
    const cx = width * (mobile ? .5 : .62) + driftX * (mobile ? 10 : 24);
    const cy = height * (mobile ? .43 : .48) + driftY * 15;
    const core = size * .285;
    const angle = -.35 + driftX * .03 + Math.sin(time * .055) * .025;
    lastGeometry = { cx, cy, size, core, width, height, angle, mobile, time };
    if (typeof hooks.update === 'function') hooks.update(dt, lastGeometry);
    const atmosphere = ctx.createRadialGradient(cx, cy, size * .12, cx, cy, size * 1.6);
    atmosphere.addColorStop(0, light ? 'rgba(69,132,178,.12)' : rgba(48, 105, 170, Math.min(.4, .18 * energy())));
    atmosphere.addColorStop(.42, light ? 'rgba(82,130,163,.05)' : 'rgba(30,75,132,.1)');
    atmosphere.addColorStop(1, 'rgba(22,46,88,0)');
    ctx.fillStyle = atmosphere; ctx.fillRect(0, 0, width, height);
    stars.forEach(star => {
      const alpha = (.3 + .16 * Math.sin(time * .6 + star.phase)) * star.r;
      ctx.fillStyle = light ? rgba(45,85,120,alpha) : rgba(182,219,250,alpha);
      const x = star.x * width + driftX * star.r * 8, y = star.y * height + driftY * star.r * 6;
      ctx.fillRect(x, y, star.r > .94 ? 1.5 : .7, star.r > .94 ? 1.5 : .7);
    });
    drawHook('back', lastGeometry);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    // A dispersed glow supports a field of sharp light, without diagram outlines.
    ctx.save();
    ctx.shadowColor = '#78c6ff'; ctx.shadowBlur = size * .035;
    ribbon(.55, 0, TAU, light ? 'rgba(62,123,166,.08)' : rgba(115, 196, 255, Math.min(.5, .15 * energy())), size * .027);
    ribbon(.39, 0, TAU, light ? 'rgba(62,123,166,.12)' : rgba(207, 239, 255, Math.min(.8, .27 * energy())), size * .012);
    ctx.restore();
    disk(false);
    const halo = ctx.createRadialGradient(0, 0, core * .95, 0, 0, core * 1.7);
    halo.addColorStop(0, 'rgba(199,231,255,0)');
    halo.addColorStop(.045, light ? 'rgba(61,132,180,.3)' : rgba(198, 233, 255, Math.min(.98, .7 * energy())));
    halo.addColorStop(.15, light ? 'rgba(61,132,180,.16)' : rgba(111, 183, 246, Math.min(.65, .24 * energy())));
    halo.addColorStop(.4, 'rgba(57,117,194,.07)');
    halo.addColorStop(1, 'rgba(30,65,127,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(0, 0, core * 1.7, 0, TAU); ctx.fill();
    ctx.fillStyle = '#020509';
    ctx.beginPath(); ctx.arc(0, 0, core, 0, TAU); ctx.fill();
    // The photon rim is a turbulent luminous surface, not a navigation circle.
    ctx.globalCompositeOperation = 'screen';
    for (const p of corona) {
      const angle = p.angle + time * .17;
      const r = p.radius * size;
      const upper = .4 + .6 * Math.max(0, -Math.sin(angle));
      ctx.strokeStyle = p.brightness > .86
        ? rgba(255, 229, 184, upper * .75)
        : rgba(184, 226, 255, (.15 + p.brightness * .75) * upper);
      ctx.lineWidth = p.brightness > .9 ? 1.35 : .65;
      ctx.beginPath(); ctx.arc(0, 0, r, angle, angle + p.length); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    disk(true);
    ctx.save();
    ctx.shadowColor = '#c9ebff'; ctx.shadowBlur = size * .012;
    ribbon(.347, .025, Math.PI * .97, light ? 'rgba(63,128,172,.5)' : 'rgba(237,249,255,.9)', 1.35);
    ribbon(.386, .18, Math.PI * .88, light ? 'rgba(63,128,172,.25)' : 'rgba(255,224,169,.36)', .75);
    ctx.restore();
    ctx.restore();
    drawHook('front', lastGeometry);
    rendering = false;
  }

  function tick(now) {
    frame = 0;
    if (!active() || !animating()) return;
    if (now - last >= (mobile ? 1000 / 30 : 1000 / 45)) {
      const dt = (now - last) / 1000;
      last = now;
      intensity += (targetIntensity - intensity) * (1 - Math.exp(-dt * 6));
      if (moving()) {
        time += dt * intensity;
        driftX += (pointerX - driftX) * .045;
        driftY += (pointerY - driftY) * .045;
        tone += (targetTone - tone) * .035;
      }
      render(dt);
    }
    if (active() && animating() && !frame) frame = requestAnimationFrame(tick);
  }
  function refresh() {
    if (rendering) return;
    light = document.documentElement.dataset.palette === 'light';
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (!active()) return;
    if (!moving()) tone = targetTone;
    render(0);
    if (animating()) { last = performance.now(); frame = requestAnimationFrame(tick); }
  }
  function wake() {
    if (!frame && !rendering && active() && animating()) {
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
  }
  function resize() {
    const rect = stage.getBoundingClientRect();
    width = rect.width; height = rect.height;
    mobile = width <= 700;
    size = mobile ? Math.min(width * .65, height * .38) : Math.min(width * .43, height * .64);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    refresh();
  }
  body.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || !moving()) return;
    const rect = stage.getBoundingClientRect();
    pointerX = Math.max(-.7, Math.min(.7, (event.clientX - rect.left) / rect.width - .5));
    pointerY = Math.max(-.7, Math.min(.7, (event.clientY - rect.top) / rect.height - .5));
  }, { passive: true });
  body.addEventListener('pointerleave', () => { pointerX = 0; pointerY = 0; }, { passive: true });
  window.addEventListener('sector-focus', event => {
    const id = String(event.detail && event.detail.id || '');
    const tones = { cfs: 40, arm: 258, eds: 172, linux: 207, ebpf: 284, tools: 160 };
    const key = Object.keys(tones).find(name => id.toLowerCase().includes(name));
    targetTone = key ? tones[key] : 207;
    if (!moving()) refresh();
  });
  document.addEventListener('visibilitychange', refresh);
  reduce.addEventListener('change', refresh);
  new MutationObserver(refresh).observe(body, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(refresh).observe(document.documentElement, { attributes: true, attributeFilter: ['data-palette'] });
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting; refresh();
  }, { rootMargin: '80px' }).observe(stage);
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
  else window.addEventListener('resize', resize, { passive: true });
  window.OrbitalScene = {
    getGeometry: () => lastGeometry,
    setIntensity(value) {
      if (Number.isFinite(value)) targetIntensity = Math.max(.25, Math.min(8, value));
      wake();
    },
    setHooks(value) { hooks = value || {}; refresh(); },
    setInteractive(value) { interactive = Boolean(value); wake(); },
    requestFrame: refresh
  };
  resize();
  stage.classList.add('scene-ready');
  window.dispatchEvent(new CustomEvent('orbital-ready'));
})();
