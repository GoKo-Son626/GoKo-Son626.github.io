/* One capture cycle: approach -> orbit -> tidal disruption -> idle. */
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const DURATION = 50;
  const body = document.body;
  const root = document.documentElement;
  const trigger = document.getElementById('black-hole-trigger');
  const status = document.getElementById('gravity-status');
  const focusToggle = document.querySelector('[data-scene-toggle]');
  const focusControls = document.querySelectorAll('.space-header');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const materials = window.PlanetMaterials;
  const colors = ['131,181,255','193,160,239','163,219,249','162,171,247','123,205,221','199,218,237'];
  const planets = Array.from(document.querySelectorAll('.planet-link')).map((link, index) => ({
    id: link.dataset.id, link, index, angle0: -1.48 + index * TAU / 6,
    count: Math.max(0, Number(link.dataset.count) || 0), sizeScale: 1,
    x: 0, y: 0, radius: 28, theta: 0, depth: 0, opacity: 0,
    hover: 0, hovering: false, heldAngle: null, angleOffset: 0,
    spin: index * .91, trail: [], breakup: 0, fragmentOrigin: null,
    end: 46.5 + index * .7, color: colors[index], alive: false
  }));
  const averageCount = planets.reduce((total, p) => total + p.count, 0) / (planets.length || 1);
  // Build-time article totals set a gentle, cached radius adjustment within +/-14%.
  planets.forEach(p => {
    p.sizeScale = 1 + .14 * Math.tanh(Math.log((p.count + 1) / (averageCount + 1)));
  });
  let engine = null, geometry = null, phase = 'idle', elapsed = 0;
  let selected = null, transitionTime = 0, zoomStart = null, didNavigate = false;
  let burstEnded = false, cycleNumber = 0;
  const clamp = (v, low = 0, high = 1) => Math.max(low, Math.min(high, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = v => { const t = clamp(v); return t * t * (3 - 2 * t); };
  const easeOut = t => 1 - Math.pow(1 - clamp(t), 3);

  function setPhase(value) {
    phase = value;
    body.dataset.phase = value;
  }
  function project(radius, theta, g, flatten) {
    const depth = Math.sin(theta);
    const perspective = 1 + depth * .1;
    const x = Math.cos(theta) * radius * perspective;
    const y = depth * radius * flatten * perspective;
    const cosine = Math.cos(g.angle), sine = Math.sin(g.angle);
    return { x: g.cx + x * cosine - y * sine, y: g.cy + x * sine + y * cosine, depth };
  }
  function outerRadius(g, flatten) {
    const ca = Math.cos(g.angle), sa = Math.sin(g.angle);
    const fx = Math.sqrt(ca * ca + flatten * flatten * sa * sa);
    const fy = Math.sqrt(sa * sa + flatten * flatten * ca * ca);
    const horizontal = Math.min(g.cx, g.width - g.cx) - (g.mobile ? 35 : 78);
    const vertical = Math.min(g.cy - (g.mobile ? 100 : 115), g.height - g.cy - 78);
    return Math.max(g.core * 1.85, Math.min(g.size * 1.12, horizontal / fx / 1.1, vertical / fy / 1.1));
  }
  function reset() {
    elapsed = 0; selected = null; transitionTime = 0; zoomStart = null; didNavigate = false;
    burstEnded = false;
    setPhase('idle');
    body.classList.remove('portal-navigating');
    root.style.setProperty('--portal-opacity', '0');
    trigger.disabled = false;
    trigger.setAttribute('aria-label', '点击黑洞，唤出六颗技术方向行星');
    trigger.title = '点击黑洞，唤出技术方向';
    planets.forEach(p => {
      p.alive = false; p.link.hidden = true; p.opacity = 0; p.trail = [];
      p.fragmentOrigin = null; p.breakup = 0; p.hovering = false;
      p.heldAngle = null; p.angleOffset = 0;
    });
    if (engine) { engine.setIntensity(1); engine.setInteractive(false); }
  }
  function summon() {
    if (phase !== 'idle') return;
    if (!engine || !materials) { window.location.assign(trigger.dataset.exploreUrl); return; }
    if (reduce.matches) {
      setPhase('orbiting');
      trigger.title = '查看全部文章';
      trigger.setAttribute('aria-label', trigger.title);
      planets.forEach(p => {
        p.link.hidden = false; p.alive = true;
        if (!p.link.querySelector('canvas')) {
          const icon = document.createElement('canvas');
          icon.width = 80; icon.height = 56;
          icon.setAttribute('aria-hidden', 'true');
          const context = icon.getContext('2d');
          if (context) materials.draw(context, { id: p.id, x: 40, y: 28, radius: 17, lightAngle: -2 });
          p.link.prepend(icon);
        }
      });
      status.textContent = '选择技术方向，或点击黑洞查看全部文章。';
      return;
    }
    cycleNumber++;
    elapsed = 0; burstEnded = false;
    planets.forEach(p => {
      p.alive = true; p.opacity = 0; p.hover = 0; p.hovering = false;
      p.trail = []; p.fragmentOrigin = null; p.breakup = 0; p.link.hidden = true;
      p.heldAngle = null; p.angleOffset = 0;
    });
    trigger.disabled = true;
    trigger.setAttribute('aria-label', '行星正在进入轨道');
    trigger.title = '行星正在进入轨道';
    setPhase('summoning');
    status.textContent = '六个技术方向正在进入轨道。可以点击行星或英文名称，约五十秒后本轮结束。';
    engine.setIntensity(reduce.matches ? 1 : 7.2);
    engine.setInteractive(true);
    engine.requestFrame();
  }
  function positionLink(p, g, clickable) {
    const occluded = p.depth < -.02 && Math.hypot(p.x - g.cx, p.y - g.cy) < g.core + p.radius * .6;
    p.link.hidden = !clickable || occluded;
    if (p.link.hidden) return;
    p.link.style.transform = `translate3d(${p.x.toFixed(2)}px,${p.y.toFixed(2)}px,0)`;
    p.link.style.setProperty('--planet-r', `${p.radius.toFixed(1)}px`);
    p.link.style.opacity = String(clamp(p.opacity));
    p.link.style.zIndex = String(10 + Math.round((p.depth + 1) * 10));
    const labelWidth = g.mobile ? 93 : 135;
    p.link.dataset.side = p.x + p.radius + labelWidth > g.width - 10 ? 'left' : 'right';
    p.link.dataset.depth = p.depth < 0 ? 'back' : 'front';
  }
  function update(dt, g) {
    geometry = g;
    const coreDiameter = g.core * 1.78;
    trigger.style.left = `${g.cx}px`; trigger.style.top = `${g.cy}px`;
    trigger.style.width = `${coreDiameter}px`; trigger.style.height = `${coreDiameter}px`;
    if (phase === 'idle' || didNavigate || reduce.matches) return;
    const step = Math.min(dt, .25);
    if (phase === 'navigating') {
      transitionTime += step;
      const t = clamp(transitionTime);
      root.style.setProperty('--portal-opacity', String(smooth((t - .78) / .22)));
      if (transitionTime >= 1 && !didNavigate) {
        didNavigate = true;
        enterIndex(selected.id, selected.link.href);
      }
      return;
    }
    elapsed += step;
    if (elapsed >= 1 && !burstEnded) {
      burstEnded = true; setPhase('orbiting'); engine.setIntensity(1);
      trigger.disabled = false;
      trigger.setAttribute('aria-label', '点击黑洞，查看全部文章');
      trigger.title = '查看全部文章';
      status.textContent = '点击行星查看对应技术方向，点击黑洞查看全部文章。';
    }
    if (elapsed >= 42 && phase !== 'dissolving') {
      setPhase('dissolving');
      status.textContent = '行星正在逐渐解体。仍可选择尚未消失的行星，或点击黑洞查看全部文章。';
    }
    if (elapsed >= DURATION) {
      reset();
      status.textContent = '本轮行星已消失，可以再次点击黑洞。';
      return;
    }
    const flatten = g.mobile ? .88 : .56;
    const outer = outerRadius(g, flatten);
    planets.forEach(p => {
      const individual = clamp((elapsed - 1) / (p.end - 1));
      const decay = individual < .72
        ? 1 - .15 * smooth(individual / .72)
        : mix(.85, g.core * .52 / outer, smooth((individual - .72) / .28));
      const orbitRadius = outer * decay * (1 + (p.index % 3 - 1) * .035);
      const naturalAngle = p.angle0 + Math.max(0, elapsed - 1) * .073 + Math.pow(individual, 5) * 1.35;
      if (p.hovering && elapsed > 1 && individual < .88) {
        if (p.heldAngle === null) p.heldAngle = naturalAngle + p.angleOffset;
        p.theta = p.heldAngle;
      } else {
        if (p.heldAngle !== null) { p.angleOffset = p.heldAngle - naturalAngle; p.heldAngle = null; }
        p.theta = naturalAngle + p.angleOffset;
      }
      const target = project(orbitRadius, p.theta, g, flatten);
      let x = target.x, y = target.y;
      const entryDelay = p.index * .022;
      const arrival = clamp((elapsed - entryDelay) / (1 - entryDelay));
      if (arrival < 1) {
        const dx = target.x - g.cx, dy = target.y - g.cy;
        const length = Math.hypot(dx, dy) || 1;
        const nx = dx / length, ny = dy / length;
        const distance = Math.hypot(g.width, g.height) * 1.2;
        const bend = (1 - arrival) ** 2 * Math.min(g.width, g.height) * (.48 + p.index * .055);
        const eased = easeOut(arrival);
        x = mix(g.cx + nx * distance, target.x, eased) - ny * bend;
        y = mix(g.cy + ny * distance, target.y, eased) + nx * bend;
      }
      p.x = x; p.y = y; p.depth = target.depth;
      const base = g.mobile ? clamp(g.width * .054, 18, 25) : clamp(g.size * .079, 30, 46);
      p.radius = base * p.sizeScale * (1 + p.depth * .13) * (1 - smooth((individual - .83) / .17) * .32);
      p.spin += step * (.08 + p.index * .008);
      p.hover += ((p.hovering ? 1 : 0) - p.hover) * Math.min(1, step * 8);
      p.opacity = smooth(arrival * 3);
      p.breakup = clamp((elapsed - (p.end - 3.6)) / 3.6);
      p.alive = elapsed < p.end;
      if (p.breakup > 0 && !p.fragmentOrigin) {
        p.fragmentOrigin = { dx: p.x - g.cx, dy: p.y - g.cy, size: g.size, radius: p.radius };
      }
      if (step > 0) {
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > (g.mobile ? 7 : arrival < 1 ? 18 : 9)) p.trail.shift();
      }
      positionLink(p, g, p.alive && elapsed > .55 && p.breakup < .42);
    });
  }
  function drawTrail(ctx, p, arrival) {
    if (reduce.matches || p.trail.length < 3) return;
    const points = p.trail;
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (let i = 1; i < points.length; i++) {
      const alpha = (i / points.length) * (arrival ? .28 : .075) * p.opacity;
      ctx.strokeStyle = `rgba(${p.color},${alpha})`;
      ctx.lineWidth = arrival ? 1.1 : .65;
      ctx.beginPath(); ctx.moveTo(points[i - 1].x, points[i - 1].y); ctx.lineTo(points[i].x, points[i].y); ctx.stroke();
    }
    ctx.restore();
  }
  function drawWorld(ctx, p, g) {
    if (!p.alive || p.opacity <= 0) return;
    drawTrail(ctx, p, elapsed < 1);
    if (p.breakup > 0) {
      const origin = p.fragmentOrigin;
      const scale = g.size / origin.size;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, g.width, g.height);
      ctx.arc(g.cx, g.cy, g.core * .94, 0, TAU, true);
      ctx.clip('evenodd');
      materials.drawFragments(ctx, { id: p.id, x: g.cx + origin.dx * scale, y: g.cy + origin.dy * scale,
        radius: origin.radius * scale, progress: p.breakup, targetX: g.cx, targetY: g.cy,
        seed: 173 + p.index * 147 + cycleNumber, time: elapsed, opacity: 1 });
      ctx.restore();
    }
    const solidOpacity = p.opacity * (1 - smooth(p.breakup / .45));
    if (solidOpacity <= 0) return;
    const heat = smooth((elapsed - (p.end - 8)) / 8);
    materials.draw(ctx, { id: p.id, x: p.x, y: p.y, radius: p.radius,
      spin: p.spin, time: elapsed, opacity: solidOpacity,
      lightAngle: Math.atan2(g.cy - p.y, g.cx - p.x),
      stretch: 1 + heat * .44, highlight: p.hover * .38, hover: p.hover * .5, heat: heat * .62 });
  }
  function drawFront(ctx, g) {
    if (phase === 'idle' || !materials || reduce.matches) return;
    if (phase === 'navigating') {
      const t = clamp(transitionTime);
      const zoom = t * t * t;
      materials.draw(ctx, { id: selected.id, x: mix(zoomStart.x, g.width * .5, smooth(t)),
        y: mix(zoomStart.y, g.height * .5, smooth(t)),
        radius: mix(zoomStart.radius, Math.hypot(g.width, g.height) * .66, zoom),
        spin: zoomStart.spin + t * .32, lightAngle: zoomStart.lightAngle,
        opacity: 1, hover: .7, heat: t * .15, stretch: 1 });
      return;
    }
    // The orbit is outside the luminous disk. Only the silhouette of the
    // central shadow eclipses far-side planets as their orbit finally decays.
    for (const p of planets.slice().sort((a, b) => a.depth - b.depth)) {
      if (p.depth < 0 && Math.hypot(p.x - g.cx, p.y - g.cy) < g.core + p.radius * 2.2) {
        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, g.width, g.height);
        ctx.moveTo(g.cx + g.core, g.cy);
        ctx.arc(g.cx, g.cy, g.core, 0, TAU);
        ctx.clip('evenodd'); drawWorld(ctx, p, g);
        ctx.restore();
      } else {
        drawWorld(ctx, p, g);
      }
    }
  }
  function enterIndex(id, href) {
    try { sessionStorage.setItem('goko-arrival', JSON.stringify({ id, at: Date.now() })); } catch (_) {}
    window.location.assign(href);
  }
  function choose(p, event) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    if (phase === 'idle' || phase === 'navigating' || didNavigate || !p.alive || p.breakup >= .42) { event.preventDefault(); return; }
    event.preventDefault();
    if (reduce.matches) { enterIndex(p.id, p.link.href); return; }
    selected = p; transitionTime = 0; didNavigate = false;
    zoomStart = { x:p.x, y:p.y, radius:p.radius, spin:p.spin,
      lightAngle:Math.atan2(geometry.cy - p.y, geometry.cx - p.x) };
    setPhase('navigating'); body.classList.add('portal-navigating');
    trigger.disabled = true;
    planets.forEach(world => { world.link.hidden = true; });
    status.textContent = `正在进入 ${p.link.dataset.label}。`;
    engine.setIntensity(reduce.matches ? 1 : 2.5);
    engine.setInteractive(true);
  }
  trigger.addEventListener('click', () => {
    if (phase === 'idle') { summon(); return; }
    if (didNavigate || (phase !== 'orbiting' && phase !== 'dissolving')) return;
    didNavigate = true;
    trigger.disabled = true;
    planets.forEach(p => { p.link.hidden = true; });
    status.textContent = '正在打开全部文章。';
    body.classList.add('system-departure');
    if (reduce.matches) enterIndex('all', trigger.dataset.exploreUrl);
    else setTimeout(() => enterIndex('all', trigger.dataset.exploreUrl), 420);
  });
  planets.forEach(p => {
    p.link.addEventListener('click', event => choose(p, event));
    p.link.addEventListener('pointerenter', () => { p.hovering = true; });
    p.link.addEventListener('pointerleave', () => { p.hovering = false; });
    p.link.addEventListener('focus', () => { p.hovering = true; });
    p.link.addEventListener('blur', () => { p.hovering = false; });
  });
  function setFocus(enabled) {
    body.classList.toggle('scene-only', enabled);
    focusControls.forEach(element => { element.inert = enabled; });
    focusToggle.setAttribute('aria-pressed', String(enabled));
    focusToggle.setAttribute('aria-label', enabled ? '显示界面文字' : '专注星空，隐藏界面文字');
    focusToggle.querySelector('span').textContent = enabled ? '退出专注' : '专注星空';
  }
  setFocus(true);
  focusToggle.addEventListener('click', () => setFocus(!body.classList.contains('scene-only')));
  // Consume the wake-up click before it can summon planets or follow a link.
  document.addEventListener('click', event => {
    if (!body.classList.contains('scene-only')) return;
    setFocus(false);
    if (trigger.contains(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && body.classList.contains('scene-only')) { setFocus(false); focusToggle.focus(); }
  });
  reduce.addEventListener('change', reset);
  window.addEventListener('pageshow', () => body.classList.remove('system-departure'));
  let pointerQueued = false;
  window.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || reduce.matches || pointerQueued) return;
    pointerQueued = true;
    requestAnimationFrame(() => {
      root.style.setProperty('--view-x', `${(event.clientX / innerWidth - .5) * 24}px`);
      root.style.setProperty('--view-y', `${(event.clientY / innerHeight - .5) * 18}px`);
      pointerQueued = false;
    });
  }, { passive: true });
  window.addEventListener('pageshow', event => { if (event.persisted && engine) { reset(); engine.requestFrame(); } });
  function start() {
    if (engine || !window.OrbitalScene) return;
    engine = window.OrbitalScene;
    engine.setHooks({ update, front: drawFront });
    // Warm material caches individually, outside the one-second arrival animation.
    const scratch = document.createElement('canvas'); scratch.width = scratch.height = 90;
    const context = scratch.getContext('2d');
    let index = 0;
    function warm() {
      if (phase !== 'idle' || index >= planets.length || !context || !materials) return;
      materials.draw(context, { id: planets[index++].id, x:45, y:45, radius:30, lightAngle:-1, opacity:0 });
      if (index < planets.length) setTimeout(warm, 45);
    }
    if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout:800 });
    else setTimeout(warm, 200);
  }
  window.addEventListener('orbital-ready', start, { once:true });
  start();
})();
