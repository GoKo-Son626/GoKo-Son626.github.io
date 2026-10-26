/* The article index has its own sky. It never controls the home-page simulation. */
(() => {
  'use strict';
  const canvas = document.getElementById('collection-canvas');
  if (!canvas) return;
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) return;
  const stage = canvas.closest('.collection-universe');
  const motionButton = document.getElementById('scene-motion');
  const motionLabel = motionButton && motionButton.querySelector('[data-motion-label]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(any-pointer: fine)');
  const TAU = Math.PI * 2;
  const ids = ['cfs', 'arm', 'eds', 'linux', 'ebpf', 'tools'];
  const colors = {
    all: '171,197,225', cfs: '219,164,99', arm: '149,138,190',
    eds: '153,215,231', linux: '218,137,86', ebpf: '139,191,167', tools: '190,208,221'
  };
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const validId = value => ids.includes(value) ? value : 'all';
  let current = validId(new URLSearchParams(location.search).get('stack') || document.body.dataset.collection);
  let width = 0, height = 0, ratio = 1, small = false;
  let clock = 0, lastFrame = 0, animation = 0, resizeTimer = 0;
  let paused = reducedMotion.matches, transitionAge = 1, previousFrame = null;
  let starField = null, grain = null;
  let cloudMask = null, foregroundStars = [], nextMeteor = 3.8, meteor = null;
  let previewId = null, previewStrength = 0, meteorNumber = 0, lastRipple = -10;
  const cloudCache = new Map(), ripples = [];
  const pointer = { x: 0, y: 0, active: false, strength: 0, shiftX: 0, shiftY: 0 };
  const blockedSkyTarget = '.entry-title-link,.collection-link,.explorer-header,.index-controls,.index-status,.index-bottom,.explorer-footer,.sidebar-footnote,button,input,select';
  const readyWorlds = new Set();
  const warmQueue = current === 'all' ? ids.slice() : [current, ...ids.filter(id => id !== current)];

  function seeded(seed) {
    return () => {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let n = Math.imul(seed ^ seed >>> 15, 1 | seed);
      n = n + Math.imul(n ^ n >>> 7, 61 | n) ^ n;
      return ((n ^ n >>> 14) >>> 0) / 4294967296;
    };
  }
  function makeSurface(w, h) {
    const surface = document.createElement('canvas');
    surface.width = w; surface.height = h;
    return surface;
  }
  function rgba(rgb, alpha) { return `rgba(${rgb},${alpha})`; }
  function noise(x, y) {
    const hash = (a, b) => {
      let n = Math.imul(a, 374761393) ^ Math.imul(b, 668265263);
      n = Math.imul(n ^ n >>> 13, 1274126177);
      return ((n ^ n >>> 16) >>> 0) / 4294967295;
    };
    const ix = Math.floor(x), iy = Math.floor(y);
    let u = x - ix, v = y - iy;
    u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
    return (hash(ix, iy) * (1 - u) + hash(ix + 1, iy) * u) * (1 - v)
      + (hash(ix, iy + 1) * (1 - u) + hash(ix + 1, iy + 1) * u) * v;
  }
  function nebulaTexture(id) {
    if (cloudCache.has(id)) return cloudCache.get(id);
    if (!cloudMask) {
      cloudMask = makeSurface(320, 240);
      const mask = cloudMask.getContext('2d');
      if (!mask) return null;
      const pixels = mask.createImageData(320, 240);
      for (let y = 0; y < 240; y++) for (let x = 0; x < 320; x++) {
        const nx = x / 320 * 2 - 1, ny = y / 240 * 2 - 1;
        const u = x / 69 + 11, v = y / 61 + 27;
        const turbulence = noise(u, v) * .54 + noise(u * 2.1, v * 2.1) * .28
          + noise(u * 4.3, v * 4.3) * .12 + noise(u * 8.7, v * 8.7) * .06;
        const band = Math.exp(-Math.pow((ny + nx * .42 + Math.sin(nx * 4.1) * .15) * 3.1, 2));
        const envelope = Math.pow(Math.max(0, 1 - nx * nx), 1.3) * Math.pow(Math.max(0, 1 - ny * ny), 1.5);
        const filament = clamp((turbulence - .29) * 2.2, 0, 1);
        const at = (y * 320 + x) * 4;
        pixels.data[at] = pixels.data[at + 1] = pixels.data[at + 2] = 255;
        pixels.data[at + 3] = Math.round(envelope * filament * (.2 + band * .8) * 225);
      }
      mask.putImageData(pixels, 0, 0);
    }
    const surface = makeSurface(320, 240), cloud = surface.getContext('2d');
    if (!cloud) return null;
    const tint = cloud.createLinearGradient(25, 225, 300, 15);
    tint.addColorStop(0, '#253b6e');
    tint.addColorStop(.48, rgba(colors[id], .85));
    tint.addColorStop(.76, '#435a8c');
    tint.addColorStop(1, '#18263e');
    cloud.fillStyle = tint; cloud.fillRect(0, 0, 320, 240);
    cloud.globalCompositeOperation = 'destination-in'; cloud.drawImage(cloudMask, 0, 0);
    cloudCache.set(id, surface);
    return surface;
  }
  function drawNebula() {
    const cloud = nebulaTexture(current), farCloud = nebulaTexture('all');
    if (!cloud || !farCloud) return;
    const breath = .94 + Math.sin(clock * .07) * .06;
    context.save(); context.globalCompositeOperation = 'screen';
    context.globalAlpha *= .90;
    context.drawImage(farCloud, -width * .22 + pointer.shiftX * .32, height * .02 + pointer.shiftY * .25, width * .88, height * 1.12);
    context.globalAlpha *= breath * .95;
    context.drawImage(cloud, width * .49 + pointer.shiftX * .55, -height * .23 + pointer.shiftY * .4, width * .73, height * .95);
    if (previewId && previewStrength > .005) {
      const preview = nebulaTexture(previewId);
      if (preview) {
        context.globalAlpha *= previewStrength * .8;
        context.drawImage(preview, width * .49 + pointer.shiftX * .55, -height * .23 + pointer.shiftY * .4, width * .73, height * .95);
      }
    }
    context.restore();
  }
  function halo(x, y, radius, rgb, alpha, inner = 0) {
    const glow = context.createRadialGradient(x, y, radius * inner, x, y, radius);
    glow.addColorStop(0, rgba(rgb, alpha));
    glow.addColorStop(.48, rgba(rgb, alpha * .3));
    glow.addColorStop(1, rgba(rgb, 0));
    context.fillStyle = glow;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  function makeStars() {
    starField = makeSurface(Math.ceil(width * ratio), Math.ceil(height * ratio));
    const stars = starField.getContext('2d');
    if (!stars) return;
    stars.scale(ratio, ratio);
    const rand = seeded(4026);
    const count = Math.round(clamp(width * height / 4200, 95, 380));
    for (let i = 0; i < count; i++) {
      const x = rand() * width, y = rand() * height;
      const r = .55 + Math.pow(rand(), 3) * 1.8;
      const opacity = .24 + rand() * .48;
      stars.fillStyle = i % 9 === 0 ? rgba('220,185,143', opacity) : rgba('177,199,224', opacity);
      stars.beginPath(); stars.arc(x, y, r, 0, TAU); stars.fill();
      if (r > 1.15) {
        stars.strokeStyle = rgba('187,212,239', .27);
        stars.lineWidth = .9;
        stars.beginPath(); stars.moveTo(x - 5.5, y); stars.lineTo(x + 5.5, y);
        stars.moveTo(x, y - 5.5); stars.lineTo(x, y + 5.5); stars.stroke();
      }
    }
    foregroundStars = Array.from({ length: small ? 48 : 110 }, (_, index) => ({
      x: index % 3 === 0 ? rand() * .24 : index % 3 === 1 ? .24 + rand() * .52 : .76 + rand() * .24,
      y: rand(), radius: 1.05 + rand() * 1.5, phase: rand() * TAU,
      speed: .16 + rand() * .24, depth: .35 + rand() * .65
    }));
    // A still, high-resolution dust layer prevents large upscaled worlds looking flat.
    if (!grain) {
      grain = makeSurface(640, 640);
      const dust = grain.getContext('2d');
      if (dust) {
        const pixels = dust.createImageData(640, 640), random = seeded(6871);
        for (let i = 0; i < pixels.data.length; i += 4) {
          const tone = Math.floor(random() * 230);
          pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = tone;
          pixels.data[i + 3] = Math.floor(random() * 18);
        }
        dust.putImageData(pixels, 0, 0);
      }
    }
  }
  function livingStars() {
    const near = [], rgb = colors[previewId || current];
    foregroundStars.forEach(star => {
      let x = star.x * width + pointer.shiftX * star.depth, y = star.y * height + pointer.shiftY * star.depth;
      const distance = Math.hypot(x - pointer.x, y - pointer.y);
      const attraction = pointer.strength * Math.max(0, 1 - distance / 250);
      x += (pointer.x - x) * attraction * .12; y += (pointer.y - y) * attraction * .12;
      const pulse = .5 + Math.sin(clock * star.speed + star.phase) * .16;
      const alpha = .28 + pulse * .45 + attraction * .24;
      context.fillStyle = rgba(rgb, alpha);
      context.beginPath(); context.arc(x, y, star.radius + attraction * .8, 0, TAU); context.fill();
      if (star.radius > 1.08 || attraction > .5) halo(x, y, 8 + attraction * 6, rgb, .11 + attraction * .18);
      if (attraction > .1) near.push({ x, y, distance, attraction });
    });
    if (pointer.strength > .01) {
      // Connect only the six nearest stars; a quiet local field, not a mesh.
      near.sort((a, b) => a.distance - b.distance) .slice(0, 6).forEach(star => {
        const thread = context.createLinearGradient(pointer.x, pointer.y, star.x, star.y);
        thread.addColorStop(0, rgba(rgb, .12 * pointer.strength));
        thread.addColorStop(1, rgba(rgb, .58 * star.attraction));
        context.strokeStyle = thread; context.lineWidth = 1.3;
        context.beginPath(); context.moveTo(pointer.x, pointer.y); context.lineTo(star.x, star.y); context.stroke();
      });
    }
  }
  function drawMeteor() {
    if (!meteor) return;
    const age = clock - meteor.start, progress = age / 1.65;
    if (progress > 1) { meteor = null; return; }
    const fade = Math.sin(Math.max(0, progress) * Math.PI);
    const x = meteor.x + meteor.dx * progress, y = meteor.y + meteor.dy * progress;
    const tx = x - meteor.dx * .58, ty = y - meteor.dy * .58;
    const streak = context.createLinearGradient(tx, ty, x, y);
    streak.addColorStop(0, 'rgba(164,190,225,0)');
    streak.addColorStop(.72, rgba('172,199,230', fade * .38));
    streak.addColorStop(1, rgba('230,238,251', fade * .95));
    context.strokeStyle = streak; context.lineWidth = 2;
    context.beginPath(); context.moveTo(tx, ty); context.lineTo(x, y); context.stroke();
    halo(x, y, 9, '201,221,247', fade * .6);
  }
  function drawProbe() {
    const rgb = colors[previewId || current];
    if (pointer.strength > .01) halo(pointer.x, pointer.y, 165, rgb, .10 * pointer.strength);
    for (const ripple of ripples) {
      const progress = clamp((clock - ripple.start) / 1.5, 0, 1);
      const radius = 10 + (1 - Math.pow(1 - progress, 2)) * 155;
      const fade = Math.pow(1 - progress, 1.7);
      context.save(); context.translate(ripple.x, ripple.y); context.rotate(-.35);
      context.strokeStyle = rgba(ripple.rgb, fade * .52); context.lineWidth = 1.3;
      context.beginPath(); context.ellipse(0, 0, radius, radius * .64, 0, 0, TAU); context.stroke();
      for (let i = 0; i < 12; i++) {
        const angle = i * TAU / 12 + progress * .24;
        const r = radius * (.68 + i % 3 * .13);
        context.fillStyle = rgba(ripple.rgb, fade * (.18 + i % 2 * .2));
        context.beginPath(); context.arc(Math.cos(angle) * r, Math.sin(angle) * r * .64, .8, 0, TAU); context.fill();
      }
      context.restore();
    }
  }
  function updateAtmosphere(delta) {
    const smoothing = 1 - Math.exp(-delta * 5);
    pointer.strength += ((pointer.active ? 1 : 0) - pointer.strength) * smoothing;
    const targetX = pointer.active ? (pointer.x / width - .5) * 18 : 0;
    const targetY = pointer.active ? (pointer.y / height - .5) * 14 : 0;
    pointer.shiftX += (targetX - pointer.shiftX) * smoothing;
    pointer.shiftY += (targetY - pointer.shiftY) * smoothing;
    previewStrength += ((previewId ? 1 : 0) - previewStrength) * smoothing;
    while (ripples.length && clock - ripples[0].start > 1.5) ripples.shift();
    if (!small && clock >= nextMeteor) {
      const rand = seeded(9107 + meteorNumber++ * 307);
      const left = meteorNumber % 3 === 0;
      meteor = { start: clock, x: width * (left ? .17 : .96), y: height * (.08 + rand() * .24),
        dx: -Math.min(width * (left ? .10 : .12), 160), dy: height * (.13 + rand() * .09) };
      nextMeteor = clock + 10 + rand() * 8;
    }
  }
  function fallbackWorld(id, x, y, radius, opacity) {
    context.save(); context.globalAlpha *= opacity;
    const surface = context.createRadialGradient(x - radius * .4, y - radius * .42, 0, x, y, radius);
    surface.addColorStop(0, rgba(colors[id], .72));
    surface.addColorStop(.45, rgba(colors[id], .28));
    surface.addColorStop(1, '#03060c');
    context.fillStyle = surface;
    context.beginPath(); context.arc(x, y, radius, 0, TAU); context.fill();
    context.restore();
  }
  function world(id, x, y, radius, spin, light, opacity) {
    if (window.PlanetMaterials && readyWorlds.has(id)) {
      window.PlanetMaterials.draw(context, { id, x, y, radius, spin, lightAngle: light, opacity });
    } else fallbackWorld(id, x, y, radius, opacity);
  }
  function singleWorld(id) {
    const radius = small ? width * .46 : Math.min(width * .27, height * .40);
    const x = width * (small ? .87 : .84), y = height * (small ? .29 : .40);
    const rgb = colors[id], spin = clock * .009 + ids.indexOf(id) * .51;
    halo(x - radius * .1, y - radius * .08, radius * 1.68, rgb, .13);
    // A thin, interrupted survey arc sits outside the limb, away from the text.
    context.save(); context.translate(x, y); context.rotate(-.37);
    context.strokeStyle = rgba(rgb, .12); context.lineWidth = .7;
    context.beginPath(); context.ellipse(0, 0, radius * 1.16, radius * 1.08, 0, -.65, 1.48); context.stroke();
    context.strokeStyle = rgba(rgb, .055);
    context.beginPath(); context.ellipse(0, 0, radius * 1.24, radius * 1.16, 0, 2.25, 4.6); context.stroke();
    context.restore();
    world(id, x, y, radius, spin, -2.25, .94);
    if (grain) {
      context.save(); context.translate(x, y); context.rotate(spin);
      context.beginPath(); context.arc(0, 0, radius * .975, 0, TAU); context.clip();
      context.globalAlpha *= .35; context.globalCompositeOperation = 'soft-light';
      context.drawImage(grain, -radius, -radius, radius * 2, radius * 2);
      context.restore();
    }
    // Illumination follows the same upper-left light source as the rock material.
    context.save(); context.translate(x, y); context.rotate(-2.25);
    const limb = context.createLinearGradient(radius * .2, 0, radius * 1.02, 0);
    limb.addColorStop(0, rgba(rgb, 0)); limb.addColorStop(1, rgba(rgb, .42));
    context.strokeStyle = limb; context.lineWidth = small ? .7 : 1.05;
    context.beginPath(); context.arc(0, 0, radius * .992, -.81, .81); context.stroke();
    context.restore();
    halo(x - radius * .64, y - radius * .64, radius * .5, rgb, .035);
  }
  function orbitPoint(theta, major, minor, tilt, cx, cy) {
    const x = Math.cos(theta) * major, y = Math.sin(theta) * minor;
    return { x: cx + x * Math.cos(tilt) - y * Math.sin(tilt),
      y: cy + x * Math.sin(tilt) + y * Math.cos(tilt), depth: Math.sin(theta) };
  }
  function planetarySystem() {
    const cx = width * (small ? .62 : .77), cy = height * (small ? .29 : .38);
    const major = small ? width * .35 : Math.min(width * .24, height * .36);
    const minor = major * .57, tilt = -.32;
    halo(cx, cy, major * 1.58, colors.all, .065);
    halo(cx, cy, major * .36, '177,202,234', .08);
    context.save(); context.translate(cx, cy); context.rotate(tilt);
    [.965, 1, 1.035].forEach((scale, index) => {
      context.beginPath(); context.ellipse(0, 0, major * scale, minor * scale, 0, 0, TAU);
      context.strokeStyle = rgba(colors.all, index === 1 ? .19 : .045);
      context.lineWidth = index === 1 ? .85 : .5; context.stroke();
    });
    context.restore();
    // Fine orbital dust remains slower than the separate distant meteor layer.
    for (let i = 0; i < 36; i++) {
      const p = orbitPoint(i / 36 * TAU + clock * .022, major * 1.02, minor * 1.02, tilt, cx, cy);
      context.fillStyle = rgba(colors.all, .06 + (p.depth + 1) * .05);
      context.beginPath(); context.arc(p.x, p.y, i % 7 === 0 ? 1 : .55, 0, TAU); context.fill();
    }
    const worlds = ids.map((id, i) => {
      const theta = i * TAU / 6 - 1.15 + clock * .038;
      const point = orbitPoint(theta, major, minor, tilt, cx, cy);
      const base = small ? width * .042 : clamp(major * .12, 23, 43);
      return { id, index: i, ...point, radius: base * (1 + point.depth * .2) * [1.1, .88, .97, 1, .84, .78][i] };
    }).sort((a, b) => a.depth - b.depth);
    worlds.forEach(p => {
      const light = Math.atan2(cy - p.y, cx - p.x);
      halo(p.x, p.y, p.radius * 1.5, colors[p.id], .055);
      world(p.id, p.x, p.y, p.radius, p.index * .7 + clock * .018, light, .82 + (p.depth + 1) * .08);
    });
  }
  function paint() {
    if (!width || !height) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const progress = clamp(transitionAge / .62, 0, 1);
    const blend = progress * progress * (3 - 2 * progress);
    context.globalAlpha = previousFrame ? blend : 1;
    drawNebula();
    if (starField) context.drawImage(starField, -12 + pointer.shiftX * .18, -10 + pointer.shiftY * .18, width + 24, height + 20);
    context.save(); context.translate(pointer.shiftX * .38, pointer.shiftY * .38);
    if (current === 'all') planetarySystem(); else singleWorld(current);
    context.restore();
    // Nearby dust and interaction lines stay visible in front of the distant planet.
    livingStars();
    drawMeteor();
    drawProbe();
    context.globalAlpha = 1;
    if (previousFrame) {
      context.save(); context.globalAlpha = 1 - blend;
      context.drawImage(previousFrame, 0, 0, width, height); context.restore();
      if (progress >= 1) previousFrame = null;
    }
    if (stage) stage.classList.add('is-ready');
  }
  function frame(now) {
    animation = 0;
    if (document.hidden) { lastFrame = 0; return; }
    const elapsed = lastFrame ? now - lastFrame : 1000 / 30;
    if (elapsed >= 1000 / 30 - .5) {
      const delta = Math.min(elapsed / 1000, .1);
      lastFrame = now;
      if (!paused) { clock += delta; updateAtmosphere(delta); }
      transitionAge += delta;
      paint();
    }
    if (!paused || previousFrame) animation = requestAnimationFrame(frame);
  }
  function requestFrame() {
    if (!animation && !document.hidden) animation = requestAnimationFrame(frame);
  }
  function resize() {
    width = window.innerWidth; height = window.innerHeight; small = width <= 780;
    ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.ceil(width * ratio); canvas.height = Math.ceil(height * ratio);
    previousFrame = null;
    makeStars(); lastFrame = 0; requestFrame();
  }
  function setCollection(value) {
    const next = validId(value);
    if (next === current) return;
    if (!paused && !reducedMotion.matches && width && height) {
      previousFrame = makeSurface(canvas.width, canvas.height);
      const previous = previousFrame.getContext('2d');
      if (previous) previous.drawImage(canvas, 0, 0); else previousFrame = null;
    } else previousFrame = null;
    current = next; transitionAge = 0;
    // Prioritize a newly selected material if the remaining worlds are still warming.
    const pending = warmQueue.indexOf(current);
    if (pending > 0) warmQueue.unshift(...warmQueue.splice(pending, 1));
    lastFrame = 0; requestFrame();
  }
  function updateMotionButton() {
    document.body.dataset.motionPaused = String(paused);
    if (paused) {
      pointer.active = false; pointer.strength = 0;
      previewId = null; previewStrength = 0; ripples.length = 0;
    }
    if (!motionButton) return;
    motionButton.hidden = false;
    motionButton.setAttribute('aria-pressed', String(paused));
    motionButton.setAttribute('aria-label', paused ? '继续背景动效' : '暂停背景动效');
    if (motionLabel) motionLabel.textContent = paused ? '继续动效' : '暂停动效';
    motionButton.dataset.paused = String(paused);
  }
  function warmNext() {
    if (!warmQueue.length || !window.PlanetMaterials) return;
    if (document.hidden) { setTimeout(warmNext, 400); return; }
    const id = warmQueue.shift(), scratch = makeSurface(96, 96), scratchContext = scratch.getContext('2d');
    if (scratchContext) {
      window.PlanetMaterials.draw(scratchContext, { id, x: 48, y: 48, radius: 40, lightAngle: -2.25 });
      readyWorlds.add(id); requestFrame();
    }
    if (warmQueue.length) {
      if ('requestIdleCallback' in window) requestIdleCallback(warmNext, { timeout: 300 });
      else setTimeout(warmNext, 70);
    }
  }
  function canProbe(event) {
    return !paused && !reducedMotion.matches && !small && finePointer.matches
      && event.clientX >= 0 && event.clientX <= width
      && !(event.target instanceof Element && event.target.closest(blockedSkyTarget));
  }
  window.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || paused || reducedMotion.matches) return;
    pointer.x = event.clientX; pointer.y = event.clientY;
    pointer.active = canProbe(event);
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { pointer.active = false; }, { passive: true });
  window.addEventListener('blur', () => { pointer.active = false; });
  window.addEventListener('scroll', () => { pointer.active = false; }, { passive: true });
  window.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.detail === 0 || !canProbe(event)
      || event.pointerType === 'touch' || clock - lastRipple < .65) return;
    lastRipple = clock;
    if (ripples.length >= 2) ripples.shift();
    ripples.push({ x: event.clientX, y: event.clientY, start: clock, rgb: colors[current] });
    pointer.x = event.clientX; pointer.y = event.clientY; pointer.active = true;
    requestFrame();
  });
  window.addEventListener('explorer:preview', event => {
    if (paused || reducedMotion.matches) return;
    const id = event.detail && event.detail.id;
    previewId = id == null ? null : validId(id);
    requestFrame();
  });
  window.addEventListener('explorer:collection', event => setCollection(event.detail && event.detail.id));
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 120); }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(animation); animation = 0; lastFrame = 0; pointer.active = false; }
    else { lastFrame = 0; requestFrame(); }
  });
  reducedMotion.addEventListener('change', event => {
    paused = event.matches; previousFrame = null; updateMotionButton(); lastFrame = 0; requestFrame();
  });
  if (motionButton) motionButton.addEventListener('click', () => {
    paused = !paused; updateMotionButton(); lastFrame = 0; requestFrame();
  });
  updateMotionButton(); resize();
  if ('requestIdleCallback' in window) requestIdleCallback(warmNext, { timeout: 250 });
  else setTimeout(warmNext, 80);
})();
