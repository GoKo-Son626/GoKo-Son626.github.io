/* Six small worlds, drawn locally: deterministic stone, relief, light and tidal dust. */
(function () {
  'use strict';
  var SIZE = 256;
  var TAU = Math.PI * 2;
  var worlds = Object.create(null);
  var palettes = {
    cfs:   { seed: 117, low: [44, 32, 27], high: [184, 139, 95], vein: [217, 181, 130], rim: [219, 164, 99], craters: 40, atmosphere: .045 },
    arm:   { seed: 239, low: [27, 26, 36], high: [133, 120, 151], vein: [182, 171, 194], rim: [149, 138, 190], craters: 52, atmosphere: 0 },
    eds:   { seed: 347, low: [26, 54, 66], high: [172, 207, 210], vein: [225, 234, 229], rim: [153, 215, 231], craters: 19, atmosphere: .075 },
    linux: { seed: 463, low: [45, 26, 24], high: [171, 99, 69], vein: [203, 157, 115], rim: [218, 137, 86], craters: 46, atmosphere: .025 },
    ebpf:  { seed: 587, low: [22, 37, 35], high: [111, 149, 128], vein: [172, 190, 151], rim: [139, 191, 167], craters: 30, atmosphere: .035 },
    tools: { seed: 691, low: [30, 34, 40], high: [153, 161, 168], vein: [202, 204, 195], rim: [190, 208, 221], craters: 55, atmosphere: 0 }
  };
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function mix(a, b, t) { return a + (b - a) * t; }
  function random(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var n = Math.imul(seed ^ seed >>> 15, 1 | seed);
      n = n + Math.imul(n ^ n >>> 7, 61 | n) ^ n;
      return ((n ^ n >>> 14) >>> 0) / 4294967296;
    };
  }
  function hash(x, y, z, seed) {
    var n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ seed;
    n = Math.imul(n ^ n >>> 13, 1274126177);
    return ((n ^ n >>> 16) >>> 0) / 4294967295;
  }
  function noise(x, y, z, seed) {
    var ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    var u = x - ix, v = y - iy, w = z - iz;
    u *= u * (3 - 2 * u); v *= v * (3 - 2 * v); w *= w * (3 - 2 * w);
    return mix(mix(mix(hash(ix, iy, iz, seed), hash(ix + 1, iy, iz, seed), u),
      mix(hash(ix, iy + 1, iz, seed), hash(ix + 1, iy + 1, iz, seed), u), v),
      mix(mix(hash(ix, iy, iz + 1, seed), hash(ix + 1, iy, iz + 1, seed), u),
      mix(hash(ix, iy + 1, iz + 1, seed), hash(ix + 1, iy + 1, iz + 1, seed), u), v), w);
  }
  function fbm(x, y, z, seed) {
    return noise(x, y, z, seed) * .53 + noise(x * 2.07, y * 2.07, z * 2.07, seed + 7) * .27
      + noise(x * 4.17, y * 4.17, z * 4.17, seed + 17) * .13
      + noise(x * 8.31, y * 8.31, z * 8.31, seed + 29) * .07;
  }
  function canvas() { var c = document.createElement('canvas'); c.width = c.height = SIZE; return c; }
  function rgba(rgb, alpha) { return 'rgba(' + rgb.join(',') + ',' + clamp(alpha, 0, 1) + ')'; }

  function makeWorld(id) {
    var p = palettes[id] || palettes.tools, rand = random(p.seed), count = SIZE * SIZE;
    var surface = new Float32Array(count * 3), normals = new Float32Array(count * 3);
    var relief = new Float32Array(count), alpha = new Uint8Array(count), mineral = new Float32Array(count);
    var craters = [];
    for (var k = 0; k < p.craters; k++) {
      var az = rand() * TAU, nz = .05 + rand() * .94, xy = Math.sqrt(1 - nz * nz);
      craters.push({ x: Math.cos(az) * xy, y: Math.sin(az) * xy, z: nz,
        radius: .025 + Math.pow(rand(), 2.3) * .24, depth: .6 + rand() * .7 });
    }
    for (var y = 0; y < SIZE; y++) {
      for (var x = 0; x < SIZE; x++) {
        var i = y * SIZE + x, nx = (x + .5 - SIZE / 2) / (SIZE * .47), ny = (y + .5 - SIZE / 2) / (SIZE * .47);
        var angle = Math.atan2(ny, nx);
        var edge = 1 - .011 * Math.sin(angle * 5 + p.seed) - .006 * Math.sin(angle * 11) - .003 * Math.sin(angle * 23 + 1);
        var rr = (nx * nx + ny * ny) / (edge * edge);
        if (rr >= 1) continue;
        var nz2 = Math.sqrt(1 - rr), u = nx * 3.6 + 13, v = ny * 3.6 + 17, w = nz2 * 3.6 + 7;
        var terrain = fbm(u, v, w, p.seed), detail = noise(u * 19, v * 19, w * 19, p.seed + 32);
        var vein = Math.abs(noise(u * 1.7, v * 1.7, w * 1.7, p.seed + 18) - .49);
        var fissure = Math.max(0, 1 - vein * 65);
        var height = terrain * .065, craterTone = 0;
        for (var j = 0; j < craters.length; j++) {
          var c = craters[j];
          var distance2 = (nx - c.x) * (nx - c.x) + (ny - c.y) * (ny - c.y) + (nz2 - c.z) * (nz2 - c.z);
          if (distance2 > c.radius * c.radius * 1.55) continue;
          var t = Math.sqrt(distance2) / c.radius;
          var bowl = t < .86 ? -.025 * c.depth * Math.pow(1 - t * t / .74, 2) : 0;
          var lip = Math.exp(-Math.pow((t - .91) * 15, 2)) * .012 * c.depth;
          height += bowl + lip;
          craterTone += bowl * 2.8 + lip * 3;
        }
        var tone = clamp((terrain - .22) * 1.65 + craterTone + (detail - .5) * .25, 0, 1);
        var ice = id === 'eds' ? Math.pow(clamp((terrain - .36) * 3.1, 0, 1), .65) * .62 : 0;
        relief[i] = height - fissure * .009;
        alpha[i] = Math.round(clamp((1 - Math.sqrt(rr)) * SIZE * .47, 0, 1) * 255);
        mineral[i] = detail > .84 && terrain > .53 ? (detail - .84) * 3.4 : 0;
        normals[i * 3] = nx; normals[i * 3 + 1] = ny; normals[i * 3 + 2] = nz2;
        for (var channel = 0; channel < 3; channel++) {
          var color = mix(p.low[channel], p.high[channel], tone);
          color = mix(color, p.vein[channel], ice + (vein < .018 ? .17 : 0));
          surface[i * 3 + channel] = color * (1 - fissure * (id === 'eds' ? .48 : .22));
        }
      }
    }
    // Relief normals give each crater a lit lip and a shaded wall, even at icon size.
    for (var yy = 1; yy < SIZE - 1; yy++) for (var xx = 1; xx < SIZE - 1; xx++) {
      var at = yy * SIZE + xx;
      if (!alpha[at]) continue;
      var dx = (relief[at + 1] - relief[at - 1]) * 13, dy = (relief[at + SIZE] - relief[at - SIZE]) * 13;
      var ax = normals[at * 3] - dx, ay = normals[at * 3 + 1] - dy, az2 = normals[at * 3 + 2];
      var inv = 1 / Math.sqrt(ax * ax + ay * ay + az2 * az2);
      normals[at * 3] = ax * inv; normals[at * 3 + 1] = ay * inv; normals[at * 3 + 2] = az2 * inv;
    }
    return { palette: p, surface: surface, normals: normals, alpha: alpha, mineral: mineral, frames: new Map() };
  }
  function getWorld(id) { return worlds[id] || (worlds[id] = makeWorld(id)); }
  function frame(world, angle) {
    var key = Math.round(((angle % TAU + TAU) % TAU) / TAU * 40) % 40;
    if (world.frames.has(key)) return world.frames.get(key);
    var c = canvas(), context = c.getContext('2d'), pixels = context.createImageData(SIZE, SIZE), data = pixels.data;
    var a = key / 40 * TAU, lx = Math.cos(a) * .88, ly = Math.sin(a) * .88, lz = .475;
    for (var i = 0; i < SIZE * SIZE; i++) {
      if (!world.alpha[i]) continue;
      var nx = world.normals[i * 3], ny = world.normals[i * 3 + 1], nz = world.normals[i * 3 + 2];
      var dot = nx * lx + ny * ly + nz * lz;
      var diffuse = Math.max(0, dot), earthshine = .12 + Math.max(0, -nx * .25 - ny * .45 + nz * .3) * .09;
      var illumination = earthshine + Math.pow(diffuse, .85) * 1.15;
      var spec = Math.pow(Math.max(0, nx * lx * .58 + ny * ly * .58 + nz * .88), 24) * world.mineral[i] * 110;
      var rim = Math.pow(1 - Math.max(0, nz), 5) * Math.max(0, dot + .3) * world.palette.atmosphere * 250;
      for (var channel = 0; channel < 3; channel++) {
        data[i * 4 + channel] = clamp(world.surface[i * 3 + channel] * illumination + spec + rim * world.palette.rim[channel] / 180, 0, 255);
      }
      data[i * 4 + 3] = world.alpha[i];
    }
    context.putImageData(pixels, 0, 0);
    // Bound retained memory while keeping commonly reused light directions warm.
    if (world.frames.size >= 16) world.frames.delete(world.frames.keys().next().value);
    world.frames.set(key, c);
    return c;
  }

  function draw(ctx, options) {
    var o = options || {}, id = o.id || 'tools', w = getWorld(id);
    var r = Math.max(.1, o.radius || 28), spin = o.spin || 0, light = o.lightAngle == null ? -2.3 : o.lightAngle;
    var opacity = o.opacity == null ? 1 : o.opacity, hover = o.hover || 0, heat = o.heat || 0;
    ctx.save();
    ctx.translate(o.x || 0, o.y || 0);
    ctx.globalAlpha *= clamp(opacity, 0, 1);
    if (hover > .01 || heat > .01 || w.palette.atmosphere > 0) {
      var glowRadius = r * (1.25 + hover * .2 + heat * .2);
      var halo = ctx.createRadialGradient(0, 0, r * .78, 0, 0, glowRadius);
      halo.addColorStop(0, rgba(w.palette.rim, 0));
      halo.addColorStop(.35, rgba(w.palette.rim, .025 + hover * .09 + heat * .1));
      halo.addColorStop(1, rgba(w.palette.rim, 0));
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, glowRadius, 0, TAU); ctx.fill();
    }
    ctx.rotate(light);
    ctx.scale(o.stretch || 1, 1 / Math.sqrt(o.stretch || 1));
    ctx.rotate(spin - light);
    ctx.drawImage(frame(w, light - spin), -r / .94, -r / .94, r * 2 / .94, r * 2 / .94);
    if (heat > .01) {
      ctx.rotate(light - spin);
      ctx.globalCompositeOperation = 'screen';
      var heated = ctx.createRadialGradient(r * .72, 0, 0, r * .1, 0, r);
      heated.addColorStop(0, 'rgba(255,203,141,' + heat * .65 + ')');
      heated.addColorStop(.35, 'rgba(255,135,71,' + heat * .14 + ')');
      heated.addColorStop(1, 'rgba(255,113,50,0)');
      ctx.fillStyle = heated; ctx.beginPath(); ctx.arc(0, 0, r * .98, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawFragments(ctx, options) {
    var o = options || {}, p = palettes[o.id] || palettes.tools, rand = random((o.seed || p.seed) | 0);
    var progress = clamp(o.progress || 0, 0, 1), r = o.radius || 28;
    var x = o.x || 0, y = o.y || 0, tx = o.targetX == null ? x : o.targetX, ty = o.targetY == null ? y : o.targetY;
    var dx = tx - x, dy = ty - y, distance = Math.sqrt(dx * dx + dy * dy), baseAngle = Math.atan2(y - ty, x - tx);
    var fade = (o.opacity == null ? 1 : o.opacity) * Math.pow(1 - progress, .65);
    if (fade <= 0) return;
    ctx.save();
    ctx.globalAlpha *= fade;
    for (var n = 0; n < 54; n++) {
      var offset = rand() * TAU, spread = Math.sqrt(rand()) * r, scale = .3 + rand() * .8;
      var delay = rand() * .2, q = clamp((progress - delay) / (1 - delay), 0, 1);
      var turn = baseAngle + q * (1.5 + scale * 1.7);
      var orbital = distance * Math.pow(1 - q, 1.3);
      var sx = tx + Math.cos(turn) * orbital + Math.cos(offset + q * 2.4) * spread * (1 - q);
      var sy = ty + Math.sin(turn) * orbital + Math.sin(offset + q * 2.4) * spread * (1 - q);
      var shard = r * (.018 + rand() * .075) * (1 - q * .85), rotation = offset + q * (5 + scale * 7);
      var trailAngle = turn + Math.PI / 2 - .35, trail = r * (.2 + q * 2.8) * scale;
      ctx.save();
      ctx.globalAlpha *= 1 - q * .72;
      var tail = ctx.createLinearGradient(sx, sy, sx - Math.cos(trailAngle) * trail, sy - Math.sin(trailAngle) * trail);
      tail.addColorStop(0, rgba(p.rim, .24 + q * .25)); tail.addColorStop(1, rgba(p.rim, 0));
      ctx.strokeStyle = tail; ctx.lineWidth = Math.max(.35, shard * .3);
      ctx.beginPath(); ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(sx - Math.cos(trailAngle - .15) * trail * .55, sy - Math.sin(trailAngle - .15) * trail * .55,
        sx - Math.cos(trailAngle) * trail, sy - Math.sin(trailAngle) * trail); ctx.stroke();
      ctx.translate(sx, sy); ctx.rotate(rotation);
      ctx.beginPath(); ctx.moveTo(-shard, -shard * .4); ctx.lineTo(shard * .36, -shard * .86);
      ctx.lineTo(shard, shard * .22); ctx.lineTo(-shard * .12, shard * .68); ctx.closePath();
      ctx.fillStyle = rgba(p.high.map(function (v) { return Math.min(255, Math.round(v * (.6 + q * .7))); }), .9); ctx.fill();
      ctx.strokeStyle = 'rgba(255,216,165,' + (.2 + q * .55) + ')'; ctx.lineWidth = .5; ctx.stroke();
      if (n % 5 === 0) {
        ctx.globalCompositeOperation = 'screen';
        var glint = ctx.createRadialGradient(0, 0, 0, 0, 0, shard * 3 + 1);
        glint.addColorStop(0, 'rgba(255,231,191,.45)'); glint.addColorStop(1, 'rgba(255,185,110,0)');
        ctx.fillStyle = glint; ctx.fillRect(-shard * 3 - 1, -shard * 3 - 1, shard * 6 + 2, shard * 6 + 2);
      }
      ctx.restore();
    }
    ctx.restore();
  }
  window.PlanetMaterials = { draw: draw, drawFragments: drawFragments };
}());
