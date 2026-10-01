// Background: a geometric "space" seen from eye height.
// Starfield with depth, a faint neon ground grid, and glowing wireframe solids
// placed along the walk. Scrolling walks the camera forward.
(function () {
  var cv = document.getElementById('grid');
  if (!cv) return;
  var g = cv.getContext('2d');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var EYE = 1.6, PATH_X = 5, FAR = 40, NEAR = 0.6;
  var BG = '#05060d';

  // ---------- wireframe solids (unit size, centered) ----------
  function dist(a, b) { var x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2]; return Math.sqrt(x * x + y * y + z * z); }
  function edgesByLength(v) {            // connect every pair at the shortest distance
    var min = Infinity, e = [], i, j;
    for (i = 0; i < v.length; i++) for (j = i + 1; j < v.length; j++) min = Math.min(min, dist(v[i], v[j]));
    for (i = 0; i < v.length; i++) for (j = i + 1; j < v.length; j++) if (dist(v[i], v[j]) < min * 1.01) e.push([i, j]);
    return e;
  }
  function poly(v) {
    v = v.map(function (p) { var l = Math.hypot(p[0], p[1], p[2]); return [p[0] / l, p[1] / l, p[2] / l]; });
    return { v: v, e: edgesByLength(v) };
  }

  var P = (1 + Math.sqrt(5)) / 2;
  var SOLIDS = {
    tetra: poly([[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]]),
    cube: poly([[-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1], [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1]]),
    octa: poly([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]),
    icosa: poly([[-1, P, 0], [1, P, 0], [-1, -P, 0], [1, -P, 0], [0, -1, P], [0, 1, P], [0, -1, -P], [0, 1, -P], [P, 0, -1], [P, 0, 1], [-P, 0, -1], [-P, 0, 1]]),
    dodeca: (function () {
      var a = 1 / P, v = [];
      [-1, 1].forEach(function (x) { [-1, 1].forEach(function (y) { [-1, 1].forEach(function (z) { v.push([x, y, z]); }); }); });
      [-1, 1].forEach(function (s) { [-1, 1].forEach(function (t) {
        v.push([0, s * a, t * P]); v.push([s * a, t * P, 0]); v.push([s * P, 0, t * a]);
      }); });
      return poly(v);
    })(),
    torus: (function () {
      var v = [], e = [], R = 0.7, r = 0.3, U = 24, V = 10;
      for (var i = 0; i < U; i++) for (var j = 0; j < V; j++) {
        var u = i / U * Math.PI * 2, w = j / V * Math.PI * 2;
        v.push([(R + r * Math.cos(w)) * Math.cos(u), r * Math.sin(w), (R + r * Math.cos(w)) * Math.sin(u)]);
        var k = i * V + j;
        e.push([k, ((i + 1) % U) * V + j], [k, i * V + (j + 1) % V]);
      }
      return { v: v, e: e };
    })(),
    sphere: (function () {
      var v = [], e = [], LAT = 7, LON = 14, i, j;
      for (i = 1; i < LAT; i++) for (j = 0; j < LON; j++) {
        var th = i / LAT * Math.PI, ph = j / LON * Math.PI * 2;
        v.push([Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)]);
        var k = (i - 1) * LON + j;
        e.push([k, (i - 1) * LON + (j + 1) % LON]);
        if (i < LAT - 1) e.push([k, k + LON]);
      }
      var top = v.length, bot = top + 1;
      v.push([0, 1, 0], [0, -1, 0]);
      for (j = 0; j < LON; j++) { e.push([top, j]); e.push([bot, (LAT - 2) * LON + j]); }
      return { v: v, e: e };
    })()
  };

  var NEON = ['108,240,255', '167,139,255', '255,122,217', '125,255,176'];

  // [solid, size (m), x offset from path (+ right / - left), y center (m), spin speed]
  var PLACE = [
    ['icosa', 1.1, -5.5, 2.2, 0.25],
    ['torus', 1.6, 6, 1.4, -0.2],
    ['octa', 0.9, -6, 1.0, 0.35],
    ['dodeca', 1.2, 5.5, 2.4, 0.18],
    ['sphere', 1.3, -6.5, 1.8, -0.12],
    ['cube', 0.9, 6, 0.9, 0.3],
    ['tetra', 1.0, -5.5, 2.6, -0.28],
    ['icosa', 1.5, 6.5, 1.6, 0.15],
    ['torus', 1.2, -6, 2.0, 0.22],
    ['octa', 1.3, 5.8, 2.2, -0.2],
    ['dodeca', 0.9, -5.6, 1.1, 0.26],
    ['sphere', 1.6, 6.5, 2.0, 0.1],
    ['cube', 1.2, -6.2, 2.3, -0.18],
    ['tetra', 1.2, 5.6, 1.2, 0.3],
    ['icosa', 1.0, -5.6, 1.6, -0.24],
    ['torus', 1.8, 6.4, 2.2, 0.14]
  ].map(function (p, i) {
    return { solid: SOLIDS[p[0]], size: p[1], x: PATH_X + p[2], y: p[3], z: 9 + i * 3.6, spin: p[4], tilt: (i * 0.7) % 1.2, rgb: NEON[i % NEON.length] };
  });
  var SHOW = 20, SOLID = 11;                       // solids fade in between these depths

  // ---------- stars: far points in a slab ahead of the camera ----------
  var STARS = [], STAR_DEPTH = 120;
  (function () {
    var seed = 11;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var i = 0; i < 520; i++) {
      STARS.push({
        x: PATH_X + (rnd() * 2 - 1) * 140,
        y: 2 + rnd() * 70,
        z: rnd() * STAR_DEPTH,
        r: rnd() < 0.08 ? 1.6 : 0.5 + rnd() * 0.8,
        tw: rnd() * Math.PI * 2,
        tint: rnd() < 0.15 ? NEON[Math.floor(rnd() * NEON.length)] : '235,240,255'
      });
    }
  })();

  // ---------- rendering ----------
  var W = 0, H = 0, dpr = 1;
  var yaw = 0, yawT = 0, pitch = 0.09, pitchT = 0.09;
  var start = performance.now();

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(time) {
    var f = H * 0.9;
    var horizon = H * 0.38 - Math.tan(pitch) * f;
    var travel = window.scrollY * 0.006;
    var cy = Math.cos(yaw), sy = Math.sin(yaw);

    function cam(x, y, z) {
      x -= PATH_X; z -= travel;
      return [x * cy - z * sy, y, x * sy + z * cy];
    }
    function screen(c) { return [W / 2 + f * c[0] / c[2], horizon + f * (EYE - c[1]) / c[2]]; }

    // deep space + faint nebulae
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = BG; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    [[0.18, 0.22, 0.55, '90,70,200', 0.18], [0.85, 0.15, 0.45, '30,140,200', 0.14], [0.7, 0.75, 0.5, '200,60,160', 0.07]]
      .forEach(function (n) {
        var x = n[0] * W - yaw * W * 0.3, y = n[1] * H, r = n[2] * Math.max(W, H);
        var grad = g.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, 'rgba(' + n[3] + ',' + n[4] + ')');
        grad.addColorStop(1, 'rgba(' + n[3] + ',0)');
        g.fillStyle = grad; g.fillRect(0, 0, W, H);
      });

    // stars (wrap around the walk so the sky never runs out)
    STARS.forEach(function (s) {
      var z = travel + ((s.z - travel) % STAR_DEPTH + STAR_DEPTH) % STAR_DEPTH + 20;
      var c = cam(s.x, s.y, z);
      if (c[2] < NEAR) return;
      var p = screen(c);
      if (p[0] < -4 || p[0] > W + 4 || p[1] < -4 || p[1] > H + 4) return;
      var a = 0.55 + 0.45 * Math.sin(time * 1.3 + s.tw);
      g.fillStyle = 'rgba(' + s.tint + ',' + (a * 0.9).toFixed(3) + ')';
      g.beginPath(); g.arc(p[0], p[1], s.r, 0, Math.PI * 2); g.fill();
      if (s.r > 1.2) {                                   // a few bright stars get a halo
        var halo = g.createRadialGradient(p[0], p[1], 0, p[0], p[1], s.r * 6);
        halo.addColorStop(0, 'rgba(' + s.tint + ',' + (a * 0.35).toFixed(3) + ')');
        halo.addColorStop(1, 'rgba(' + s.tint + ',0)');
        g.fillStyle = halo;
        g.beginPath(); g.arc(p[0], p[1], s.r * 6, 0, Math.PI * 2); g.fill();
      }
    });

    // neon ground grid
    g.lineWidth = 1;
    function line(x1, z1, x2, z2, major) {
      var a = cam(x1, 0, z1), b = cam(x2, 0, z2);
      if (a[2] < NEAR || b[2] < NEAR) return;
      var d = (a[2] + b[2]) / 2;
      var alpha = Math.max(0, 1 - d / FAR) * (major ? 0.3 : 0.12);
      var p = screen(a), q = screen(b);
      g.strokeStyle = 'rgba(90,170,255,' + alpha.toFixed(3) + ')';
      g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke();
    }
    var z0 = Math.floor(travel) + 1, span = 40, x, z;
    for (x = -span + PATH_X; x <= span + PATH_X; x++)
      for (z = z0 - 1; z < z0 + FAR; z += 4) line(x, Math.max(z, travel + NEAR + 0.01), x, z + 4, (x - PATH_X) % 10 === 0);
    for (z = z0; z < z0 + FAR; z++) line(PATH_X - span, z, PATH_X + span, z, z % 10 === 0);

    // glowing wireframe solids
    // On narrow screens pull them toward the path so they stay in view, and dim them a little.
    var lat = Math.min(1, W / 1000), shrink = Math.sqrt(lat), dim = W < 700 ? 0.6 : 1;
    PLACE.forEach(function (o) {
      var ox = PATH_X + (o.x - PATH_X) * lat;
      var depth = o.z - travel;
      if (depth < NEAR + o.size || depth > SHOW) return;
      var t = Math.min(1, Math.max(0, (depth - SOLID) / (SHOW - SOLID)));
      var alpha = 0.85 * dim * (1 - t * t * (3 - 2 * t));
      var a = o.tilt, b = o.spin * time;
      var ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
      var pts = o.solid.v.map(function (p) {
        var x1 = p[0] * cb + p[2] * sb, z1 = -p[0] * sb + p[2] * cb;        // spin around y
        var y2 = p[1] * ca - z1 * sa, z2 = p[1] * sa + z1 * ca;            // tilt around x
        var sz = o.size * shrink;
        var c = cam(ox + x1 * sz, o.y + y2 * sz, o.z + z2 * sz);
        return c[2] < NEAR ? null : screen(c);
      });
      var path = new Path2D();
      o.solid.e.forEach(function (e) {
        var p = pts[e[0]], q = pts[e[1]];
        if (p && q) { path.moveTo(p[0], p[1]); path.lineTo(q[0], q[1]); }
      });
      // glow pass, then a crisp core
      g.shadowColor = 'rgba(' + o.rgb + ',' + alpha.toFixed(3) + ')';
      g.shadowBlur = 14;
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(' + o.rgb + ',' + (alpha * 0.55).toFixed(3) + ')';
      g.stroke(path);
      g.shadowBlur = 0;
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(' + o.rgb + ',' + alpha.toFixed(3) + ')';
      g.stroke(path);
      if (o.solid.v.length <= 20) {                                         // vertices as points of light
        g.fillStyle = 'rgba(255,255,255,' + alpha.toFixed(3) + ')';
        pts.forEach(function (p) { if (p) { g.beginPath(); g.arc(p[0], p[1], 1.8, 0, Math.PI * 2); g.fill(); } });
      }
    });
    g.globalCompositeOperation = 'source-over';
  }

  var queued = false;
  function frame() {
    queued = false;
    yaw += (yawT - yaw) * (reduce ? 1 : 0.12);
    pitch += (pitchT - pitch) * (reduce ? 1 : 0.12);
    draw(reduce ? 0 : (performance.now() - start) / 1000);
    if (!reduce && !document.hidden) request();          // stars twinkle continuously
  }
  function request() { if (!queued) { queued = true; requestAnimationFrame(frame); } }

  window.addEventListener('pointermove', function (e) {
    yawT = (e.clientX / W - 0.5) * 0.25;
    pitchT = 0.09 + (e.clientY / H - 0.5) * 0.06;
    request();
  }, { passive: true });
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', function () { resize(); request(); });
  document.addEventListener('visibilitychange', request);
  resize(); request();
})();
