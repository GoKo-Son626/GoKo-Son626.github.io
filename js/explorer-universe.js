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
    all: '171,197,225', cfs: '131,181,255', arm: '193,160,239',
    eds: '163,219,249', linux: '162,171,247', ebpf: '123,205,221', tools: '199,218,237'
  };
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const validId = value => ids.includes(value) ? value : 'all';
  let current = validId(new URLSearchParams(location.search).get('stack') || document.body.dataset.collection);
  try {
    const entry = JSON.parse(sessionStorage.getItem('goko-arrival'));
    sessionStorage.removeItem('goko-arrival');
    if (entry && entry.id === current && Date.now() - entry.at < 5000)
      stage.classList.add(current === 'all' ? 'system-arrival' : 'planet-arrival');
  } catch (_) {}
  let width = 0, height = 0, ratio = 1, small = false;
  let clock = 0, lastFrame = 0, animation = 0, resizeTimer = 0;
  let paused = reducedMotion.matches, transitionAge = 1, previousFrame = null;
  let starField = null, orbitalDust = null;
  let cloudMask = null, foregroundStars = [], nextMeteor = 3.8, meteor = null;
  let previewId = null, previewStrength = 0, meteorNumber = 0, lastRipple = -10;
  const cloudCache = new Map(), ripples = [];
  const pointer = { x: 0, y: 0, active: false, strength: 0, shiftX: 0, shiftY: 0 };
  const blockedSkyTarget = '.entry-title-link,.stack-repository,.collection-link,.explorer-header,.index-controls,.index-status,.index-bottom,.explorer-footer,.sidebar-footnote,button,input,select';
  const readyWorlds = new Set();
  let warmScheduled = false;

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
      stars.fillStyle = i % 9 === 0 ? rgba('198,187,240', opacity) : rgba('177,199,224', opacity);
      stars.beginPath(); stars.arc(x, y, r, 0, TAU); stars.fill();
      if (r > 1.15) {
        stars.strokeStyle = rgba('187,212,239', .27);
        stars.lineWidth = .9;
        stars.beginPath(); stars.moveTo(x - 5.5, y); stars.lineTo(x + 5.5, y);
        stars.moveTo(x, y - 5.5); stars.lineTo(x, y + 5.5); stars.stroke();
      }
    }
    // Ten existing stars become brighter beacons across both margins; no new loop.
    const beaconPositions = [[.045,.19],[.95,.22],[.18,.37],[.84,.40],[.07,.55],
      [.94,.58],[.16,.72],[.85,.75],[.045,.88],[.96,.90]];
    foregroundStars = Array.from({ length: small ? 48 : 110 }, (_, index) => {
      const beacon = index < beaconPositions.length;
      return {
        x: beacon ? beaconPositions[index][0] : index % 3 === 0 ? rand() * .24 : index % 3 === 1 ? .24 + rand() * .52 : .76 + rand() * .24,
        y: beacon ? beaconPositions[index][1] : rand(),
        radius: beacon ? 1.55 + rand() * 1.4 : 1.05 + rand() * 1.5,
        phase: rand() * TAU, speed: beacon ? TAU / (3 + rand() * 4) : .16 + rand() * .24,
        depth: .35 + rand() * .65, beacon, spike: beacon && index % 4 === 0
      };
    });
    // A single transparent plate carries the diffuse orbital plane at every viewport size.
    if (!orbitalDust) {
      orbitalDust = makeSurface(768, 384);
      const dust = orbitalDust.getContext('2d');
      if (dust) {
        const rand = seeded(627);
        for (let i = 0; i < 5300; i++) {
          const a = rand() * TAU;
          const band = .70 + .29 * rand() + (rand() - .5) * .06;
          const x = 384 + 365 * band * Math.cos(a);
          const y = 192 + 179 * band * Math.sin(a);
          dust.fillStyle = rgba(i % 6 ? '178,198,225' : '177,190,243', .08 + .33 * rand());
          dust.fillRect(x, y, .5 + rand() * .8, .6);
        }
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
      const wave = .5 + Math.sin(clock * star.speed + star.phase) * .5;
      const pulse = star.beacon ? wave * wave * (3 - 2 * wave) : .34 + wave * .32;
      const alpha = star.beacon ? .12 + pulse * .82 : .28 + pulse * .45 + attraction * .24;
      context.fillStyle = rgba(rgb, alpha);
      context.beginPath(); context.arc(x, y, star.radius + attraction * .8 + (star.beacon ? pulse * .3 : 0), 0, TAU); context.fill();
      if (star.radius > 1.08 || attraction > .5) {
        halo(x, y, (star.beacon ? 11 + pulse * 5 : 8) + attraction * 6, rgb,
          (star.beacon ? .035 + pulse * .3 : .11) + attraction * .18);
      }
      if (star.spike) {
        const reach = star.radius * (1.4 + pulse * 1.1);
        context.strokeStyle = rgba(rgb, pulse * .55); context.lineWidth = .7;
        context.beginPath(); context.moveTo(x - reach, y); context.lineTo(x + reach, y);
        context.moveTo(x, y - reach); context.lineTo(x, y + reach); context.stroke();
      }
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
  let litWorld = null, litAt = 0;
  window.addEventListener('explorer:title', event => {
    litWorld = event.detail;
    litAt = clock;
    requestFrame();
  });
  function world(id, x, y, radius, spin, light, opacity) {
    const pulse = !paused && id === litWorld ? Math.max(0, 1 - (clock - litAt) / .85) : 0;
    if (pulse) halo(x, y, radius * 1.42, colors[id], pulse * .28);
    if (window.PlanetMaterials && readyWorlds.has(id)) {
      window.PlanetMaterials.draw(context, { id, x, y, radius, spin, lightAngle: light, opacity, highlight: pulse });
    } else fallbackWorld(id, x, y, radius, opacity);
  }
  // The lit limb has a separate composition for each collection. The ring material
  // supplies its own optical shadow; a second outline would flatten the silhouette.
  const portraits = {
    cfs:   { x: .80, y: .02, scale: 1.03, light: -2.36 },
    arm:   { x: .82, y: .00, scale: .94, light: -2.60 },
    eds:   { x: .79, y: -.02, scale: 1.04, light: -2.05 },
    linux: { x: .85, y: .02, scale: 1.10, light: -2.86 },
    ebpf:  { x: .79, y: .00, scale: .93, light: -2.3 },
    tools: { x: .78, y: -.02, scale: .85, light: -2.70 }
  };
  function singleWorld(id) {
    const portrait = portraits[id];
    const radius = (small ? Math.min(width * .235, 124) : Math.min(height * .165, width * .135, 194)) * portrait.scale;
    const x = width * (small ? .82 : portrait.x);
    const y = (small ? 68 : 84) + clamp(height * (.17 + portrait.y), small ? 80 : 92, small ? 156 : 197);
    const spin = clock * .004 + ids.indexOf(id) * .41;
    halo(x - radius * .55, y - radius * .5, radius * 1.9, colors[id], .11);
    world(id, x, y, radius, spin, portrait.light, 1);
  }
  function orbitPoint(theta, major, minor, tilt, cx, cy) {
    const x = Math.cos(theta) * major, y = Math.sin(theta) * minor;
    return { x: cx + x * Math.cos(tilt) - y * Math.sin(tilt),
      y: cy + x * Math.sin(tilt) + y * Math.cos(tilt), depth: Math.sin(theta) };
  }
  function planetarySystem() {
    const cx = width * (small ? .73 : .77);
    const cy = (small ? 68 : 84) + clamp(height * .18, 86, 188);
    const major = small ? width * .25 : Math.min(width * .186, height * .30, 300);
    const minor = major * .50, tilt = -.29;
    halo(cx, cy, major * 1.6, colors.all, .09);
    // A remote source illuminates every world from the upper left.
    const sunX = cx - major * .47, sunY = cy - minor * .47;
    halo(sunX, sunY, major * .18, '141,183,255', .32);
    halo(sunX, sunY, major * .035, '222,238,255', .80);
    context.save(); context.translate(cx, cy); context.rotate(tilt);
    if (orbitalDust) context.drawImage(orbitalDust, -major * 1.16, -minor * 1.16, major * 2.32, minor * 2.32);
    context.restore();
    const worlds = ids.map((id, i) => {
      const theta = i * TAU / 6 - 1.34 + clock * .023;
      const point = orbitPoint(theta, major, minor, tilt, cx, cy);
      const base = small ? width * .035 : clamp(major * .145, 21, 44);
      return { id, index: i, ...point, radius: base * (1 + point.depth * .48) * [1.1, .88, .97, 1, .84, .78][i] };
    }).sort((a, b) => a.depth - b.depth);
    worlds.forEach(p => {
      const light = Math.atan2(sunY - p.y, sunX - p.x);
      halo(p.x, p.y, p.radius * 1.5, colors[p.id], .055);
      world(p.id, p.x, p.y, p.radius, p.index * .7 + clock * .018, light, .70 + (p.depth + 1) * .15);
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
    livingStars();
    context.save(); context.translate(pointer.shiftX * .55, pointer.shiftY * .55);
    if (current === 'all') planetarySystem(); else singleWorld(current);
    context.restore();
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
    scheduleWarm();
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
  function nextWorld() {
    return current === 'all' ? ids.find(id => !readyWorlds.has(id)) : !readyWorlds.has(current) && current;
  }
  function scheduleWarm() {
    if (warmScheduled || document.hidden || !window.PlanetMaterials || !nextWorld()) return;
    warmScheduled = true;
    if ('requestIdleCallback' in window) requestIdleCallback(warmNext, { timeout: 160 });
    else setTimeout(warmNext, 25);
  }
  function warmNext() {
    warmScheduled = false;
    const id = nextWorld();
    if (!id || document.hidden) return;
    const scratch = makeSurface(1, 1).getContext('2d');
    if (!scratch) return;
    window.PlanetMaterials.draw(scratch, { id, radius: 1, lightAngle: -2.25 });
    readyWorlds.add(id);
    lastFrame = 0;
    requestFrame();
    scheduleWarm();
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
    else { lastFrame = 0; requestFrame(); scheduleWarm(); }
  });
  reducedMotion.addEventListener('change', event => {
    paused = event.matches; previousFrame = null; updateMotionButton(); lastFrame = 0; requestFrame();
  });
  if (motionButton) motionButton.addEventListener('click', () => {
    paused = !paused; updateMotionButton(); lastFrame = 0; requestFrame();
  });
  updateMotionButton(); resize();
  scheduleWarm();
})();
