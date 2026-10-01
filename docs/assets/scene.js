// Background "scene view": a perspective ground grid seen from eye height,
// and slowly rotating wireframe solids placed along the walk.
// Scrolling walks the camera forward.
(function () {
  var grid = document.getElementById('grid');
  if (!grid) return;
  var g = grid.getContext('2d');
  var dark = matchMedia('(prefers-color-scheme: dark)');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var EYE = 1.6, PATH_X = 5, FAR = 40, NEAR = 0.6;

  // ---------- wireframe solids (unit size, centered) ----------
  function edgesByLength(v) {            // connect every pair at the shortest distance
    var min = Infinity, e = [];
    for (var i = 0; i < v.length; i++) for (var j = i + 1; j < v.length; j++) min = Math.min(min, dist(v[i], v[j]));
    for (i = 0; i < v.length; i++) for (j = i + 1; j < v.length; j++) if (dist(v[i], v[j]) < min * 1.01) e.push([i, j]);
    return e;
  }
  function dist(a, b) { var x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2]; return Math.sqrt(x * x + y * y + z * z); }
  function norm(v) { return v.map(function (p) { var l = Math.hypot(p[0], p[1], p[2]); return [p[0] / l, p[1] / l, p[2] / l]; }); }
  function poly(v) { v = norm(v); return { v: v, e: edgesByLength(v) }; }

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
      var v = [], e = [], LAT = 7, LON = 14;
      for (var i = 1; i < LAT; i++) for (var j = 0; j < LON; j++) {
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
    return { solid: SOLIDS[p[0]], size: p[1], x: PATH_X + p[2], y: p[3], z: 9 + i * 3.6, spin: p[4], tilt: (i * 0.7) % 1.2 };
  });
  var SHOW = 20, SOLID = 11;                       // solids fade in between these depths

  // ---------- rendering ----------
  var W = 0, H = 0, dpr = 1;
  var yaw = 0, yawT = 0, pitch = 0.09, pitchT = 0.09;
  var start = performance.now();

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    grid.width = W * dpr; grid.height = H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  var anyVisible = false;
  function drawScene(time) {
    var isDark = dark.matches;
    var ink = isDark ? '255,255,255' : '0,0,0';
    var f = H * 0.9;
    var horizon = H * 0.38 - Math.tan(pitch) * f;
    var travel = window.scrollY * 0.006;
    var cy = Math.cos(yaw), sy = Math.sin(yaw);

    function cam(x, y, z) {
      x -= PATH_X; z -= travel;
      return [x * cy - z * sy, y, x * sy + z * cy];
    }
    function screen(c) { return [W / 2 + f * c[0] / c[2], horizon + f * (EYE - c[1]) / c[2]]; }

    g.clearRect(0, 0, W, H);

    // ground grid
    g.lineWidth = 1;
    function line(x1, z1, x2, z2, major) {
      var a = cam(x1, 0, z1), b = cam(x2, 0, z2);
      if (a[2] < NEAR || b[2] < NEAR) return;
      var d = (a[2] + b[2]) / 2;
      var alpha = Math.max(0, 1 - d / FAR) * (major ? 0.16 : 0.07) * (isDark ? 0.9 : 1);
      var p = screen(a), q = screen(b);
      g.strokeStyle = 'rgba(' + ink + ',' + alpha.toFixed(3) + ')';
      g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke();
    }
    var z0 = Math.floor(travel) + 1, span = 40;
    for (var x = -span + PATH_X; x <= span + PATH_X; x++)
      for (var z = z0 - 1; z < z0 + FAR; z += 4) line(x, Math.max(z, travel + NEAR + 0.01), x, z + 4, (x - PATH_X) % 10 === 0);
    for (var zl = z0; zl < z0 + FAR; zl++) line(PATH_X - span, zl, PATH_X + span, zl, zl % 10 === 0);

    // wireframe solids
    anyVisible = false;
    g.lineWidth = 1.2;
    PLACE.forEach(function (o) {
      var depth = o.z - travel;
      if (depth < NEAR + o.size || depth > SHOW) return;
      anyVisible = true;
      var t = Math.min(1, Math.max(0, (depth - SOLID) / (SHOW - SOLID)));
      var alpha = (isDark ? 0.55 : 0.5) * (1 - t * t * (3 - 2 * t));
      var a = o.tilt, b = o.spin * time;
      var ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
      var pts = o.solid.v.map(function (p) {
        var x1 = p[0] * cb + p[2] * sb, z1 = -p[0] * sb + p[2] * cb;        // spin around y
        var y2 = p[1] * ca - z1 * sa, z2 = p[1] * sa + z1 * ca;            // tilt around x
        var c = cam(o.x + x1 * o.size, o.y + y2 * o.size, o.z + z2 * o.size);
        return c[2] < NEAR ? null : screen(c);
      });
      g.strokeStyle = 'rgba(' + ink + ',' + alpha.toFixed(3) + ')';
      g.beginPath();
      o.solid.e.forEach(function (e) {
        var p = pts[e[0]], q = pts[e[1]];
        if (!p || !q) return;
        g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]);
      });
      g.stroke();
      if (o.solid.v.length <= 20) {                                         // mark vertices of the platonic solids
        g.fillStyle = 'rgba(' + ink + ',' + (alpha * 1.2).toFixed(3) + ')';
        pts.forEach(function (p) { if (p) g.fillRect(p[0] - 1.5, p[1] - 1.5, 3, 3); });
      }
    });
  }

  // Redraw on input; keep animating only while a solid is on screen.
  var queued = false;
  function frame() {
    queued = false;
    yaw += (yawT - yaw) * (reduce ? 1 : 0.12);
    pitch += (pitchT - pitch) * (reduce ? 1 : 0.12);
    var time = reduce ? 0 : (performance.now() - start) / 1000;
    drawScene(time);
    var easing = Math.abs(yawT - yaw) > 0.0005 || Math.abs(pitchT - pitch) > 0.0005;
    if (!reduce && !document.hidden && (anyVisible || easing)) request();
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
  dark.addEventListener('change', request);
  resize(); request();
})();
