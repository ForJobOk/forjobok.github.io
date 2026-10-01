// Background "scene view": a perspective ground grid seen from eye height,
// voxel props from past projects placed along the walk, and an axis gizmo.
// Scrolling walks the camera forward. Redraws only on scroll / pointer / resize.
(function () {
  var grid = document.getElementById('grid');
  var gizmo = document.getElementById('gizmo');
  if (!grid || !gizmo) return;
  var g = grid.getContext('2d');
  var gz = gizmo.getContext('2d');
  var dark = matchMedia('(prefers-color-scheme: dark)');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var EYE = 1.6, PATH_X = 5, FAR = 40, NEAR = 0.6;

  // ---------- voxel models ----------
  // Pixel art (front view, top row first) extruded `depth` voxels back.
  function art(rows, pal, depth) {
    var out = [], h = rows.length;
    for (var r = 0; r < h; r++) for (var c = 0; c < rows[r].length; c++) {
      var col = pal[rows[r][c]];
      if (!col) continue;
      for (var d = 0; d < depth; d++) out.push([c, h - 1 - r, d, col]);
    }
    return out;
  }
  function solid(fn, R) {          // voxels where fn(x,y,z) returns a color
    var out = [];
    for (var x = -R; x <= R; x++) for (var y = 0; y <= R * 2; y++) for (var z = -R; z <= R; z++) {
      var col = fn(x, y, z);
      if (col) out.push([x, y, z, col]);
    }
    return out;
  }
  function seeded(seed) { return function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }

  var M = {
    headset: art([
      'SDDDDDDDDS',
      'SDGGGGGGDS',
      'SDGGGGGGDS',
      'SDDDDDDDDS'], { S: '#24272d', D: '#3b3f48', G: '#5d6474' }, 4),
    glasses: art([
      'KKKKKKKKKKKK',
      'KBBBK..KBBBK',
      'KKKKK..KKKKK'], { K: '#1d1f24', B: '#4a7bd0' }, 1).concat(
      [[0, 2, 1, '#1d1f24'], [0, 2, 2, '#1d1f24'], [0, 2, 3, '#1d1f24'], [11, 2, 1, '#1d1f24'], [11, 2, 2, '#1d1f24'], [11, 2, 3, '#1d1f24']]),
    helmet: solid(function (x, y, z) {
      var r = Math.sqrt(x * x + y * y + z * z);
      if (y === 0 && x * x + z * z <= 26) return '#e0ad1c';
      return r <= 4.2 ? '#f2c230' : null;
    }, 5),
    extinguisher: solid(function (x, y, z) {
      var r2 = x * x + z * z;
      if (y <= 8 && r2 <= 4) return y === 8 ? '#9b1f1a' : '#d8342c';
      if (y === 9 && r2 <= 1) return '#222';
      if (y === 10 && x === 0 && z <= 0 && z >= -2) return '#222';
      return null;
    }, 5),
    house: art([
      '....RR....',
      '...RRRR...',
      '..RRRRRR..',
      '.RRRRRRRR.',
      'RRRRRRRRRR',
      '.WWWWWWWW.',
      '.WBBWWDDW.',
      '.WBBWWDDW.',
      '.WWWWWDDW.'], { R: '#b5483a', W: '#ede6d8', B: '#7fb2e0', D: '#7a5232' }, 7),
    city: (function () {
      var out = [], rnd = seeded(7);
      var towers = [[0, 0, 7], [3, 0, 11], [6, 1, 5], [1, 3, 9], [4, 4, 14], [7, 3, 6]];
      towers.forEach(function (t) {
        var shade = ['#8a93a3', '#a3abb8', '#6f7889'][Math.floor(rnd() * 3)];
        for (var x = 0; x < 2; x++) for (var z = 0; z < 2; z++) for (var y = 0; y < t[2]; y++)
          out.push([t[0] + x, y, t[1] + z, y === t[2] - 1 ? '#c9d3e3' : shade]);
      });
      return out;
    })(),
    dome: solid(function (x, y, z) {
      var r = Math.sqrt(x * x + (y * 1.9) * (y * 1.9) + z * z);
      if (y === 0 && x * x + z * z <= 64) return '#9aa1ab';
      return r <= 7.5 && r > 6.2 ? '#f1f2f4' : null;
    }, 8),
    kaiju: art([
      '...GGG......',
      '..GGWGG.....',
      '..GGGGG.....',
      '...GGGG..S..',
      '.GGGGGGGGS..',
      'GGGGGGGGGG..',
      'GGGGGGGGGGGG',
      '..GG..GG..GG',
      '..GG..GG....'], { G: '#4f9a4a', W: '#fff', S: '#2f6b2b' }, 3),
    heart: art([
      '.RR.RR.',
      'RRRRRRR',
      'RRRRRRR',
      '.RRRRR.',
      '..RRR..',
      '...R...'], { R: '#d64550' }, 2),
    baseball: solid(function (x, y, z) {
      var yy = y - 3, r = Math.sqrt(x * x + yy * yy + z * z);
      if (r > 3.2) return null;
      return Math.abs(Math.abs(x) - 1.6) < 0.6 && Math.abs(z) < 2.6 ? '#d8423a' : '#f4f1ea';
    }, 4).concat((function () {
      var out = [];
      for (var i = 0; i < 16; i++) out.push([6, i, 0, i < 4 ? '#5b3a1f' : '#a8763e']);
      return out;
    })()),
    fireworks: (function () {
      var out = [], rnd = seeded(42), cols = ['#ff5a4e', '#ffd34a', '#59d0ff', '#ff7ad9', '#9dff6a'];
      for (var i = 0; i < 90; i++) {
        var u = rnd() * 2 - 1, t = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u), r = 5 + rnd() * 2;
        out.push([Math.round(s * Math.cos(t) * r), Math.round(u * r) + 7, Math.round(s * Math.sin(t) * r), cols[i % cols.length]]);
      }
      for (var y = 0; y < 5; y++) out.push([0, y, 0, '#e8e2d2']);
      return out;
    })(),
    fishA: art([
      '..OOO...',
      '.OOOOO.O',
      'OKOOOOOO',
      '.OOOOO.O',
      '..OOO...'], { O: '#f08a2c', K: '#222' }, 2),
    fishB: art([
      '..BBB...',
      '.BBBBB.B',
      'BKBBBBBB',
      '.BBBBB.B',
      '..BBB...'], { B: '#3fa7c9', K: '#222' }, 2),
    pencil: art([
      '.K.', 'TTT', 'YYY', 'YYY', 'YYY', 'YYY', 'YYY', 'YYY', 'YYY', 'SSS', 'PPP', 'PPP'],
      { K: '#333', T: '#e4c38f', Y: '#f2c230', S: '#b8bcc4', P: '#ee8fa0' }, 3),
    avatar: art([
      'HHHHHH',
      'HSSSSH',
      'SKSSKS',
      'SSSSSS',
      'SSPPSS',
      '.SSSS.'], { H: '#7b5cd6', S: '#f4d2bb', K: '#2a2a2a', P: '#e0707e' }, 5),
    trophy: art([
      'YYYYYYY',
      'YYYYYYY',
      '.YYYYY.',
      '..YYY..',
      '...Y...',
      '..YYY..',
      '.DDDDD.'], { Y: '#e6b422', D: '#5a4632' }, 3)
  };

  // [model, voxel size (m), x offset from path (+ right / - left), y (m)]
  // Placed one after another along the walk; they only appear when close.
  var PLACE = [
    ['headset', 0.15, -5.5, 0.9],
    ['helmet', 0.15, 5.5, 0],
    ['extinguisher', 0.13, -5.5, 0],
    ['house', 0.2, 6, 0],
    ['glasses', 0.13, -5.5, 0.9],
    ['city', 0.4, 8.5, 0],
    ['kaiju', 0.18, -6, 0],
    ['dome', 0.35, 9.5, 0],
    ['heart', 0.2, -5.5, 0.9],
    ['baseball', 0.13, 5.5, 0],
    ['fireworks', 0.25, -8, 0],
    ['fishA', 0.18, 5.5, 1.0],
    ['fishB', 0.15, 6, 0.5],
    ['pencil', 0.15, -5.5, 0],
    ['avatar', 0.22, 5.5, 0.6],
    ['trophy', 0.2, -5.5, 0]
  ].map(function (p, i) { return p.concat(9 + i * 3.6); });
  var SHOW = 15, SOLID = 9;                       // props fade in between these depths

  // pre-bake world-space voxels with hidden-face culling
  var VOX = [];
  PLACE.forEach(function (p) {
    var vox = M[p[0]], s = p[1], occ = {};
    var minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    vox.forEach(function (v) {
      occ[v[0] + ',' + v[1] + ',' + v[2]] = 1;
      minX = Math.min(minX, v[0]); maxX = Math.max(maxX, v[0]);
      minZ = Math.min(minZ, v[2]); maxZ = Math.max(maxZ, v[2]);
    });
    var cx = (minX + maxX + 1) / 2, cz = (minZ + maxZ + 1) / 2;
    vox.forEach(function (v) {
      var k = function (dx, dy, dz) { return occ[(v[0] + dx) + ',' + (v[1] + dy) + ',' + (v[2] + dz)]; };
      VOX.push({
        x: PATH_X + p[2] + (v[0] - cx) * s, y: p[3] + v[1] * s, z: p[4] + (v[2] - cz) * s, s: s,
        rgb: hex(v[3]),
        open: { top: !k(0, 1, 0), bottom: !k(0, -1, 0), front: !k(0, 0, -1), left: !k(-1, 0, 0), right: !k(1, 0, 0) }
      });
    });
  });
  function hex(h) { var n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }

  // ---------- rendering ----------
  var W = 0, H = 0, dpr = 1;
  var yaw = 0, yawT = 0, pitch = 0.09, pitchT = 0.09;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    grid.width = W * dpr; grid.height = H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var s = gizmo.clientWidth;
    gizmo.width = s * dpr; gizmo.height = s * dpr;
    gz.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawScene() {
    var isDark = dark.matches;
    var ink = isDark ? '255,255,255' : '0,0,0';
    var bg = isDark ? [17, 17, 17] : [255, 255, 255];
    var f = H * 0.9;
    var horizon = H * 0.38 - Math.tan(pitch) * f;
    var travel = window.scrollY * 0.006;
    var cy = Math.cos(yaw), sy = Math.sin(yaw);

    function cam(x, y, z) {                      // world -> camera space
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

    // voxels: collect visible faces, then paint far-to-near
    var faces = [];
    for (var i = 0; i < VOX.length; i++) {
      var v = VOX[i], s = v.s;
      var depth = v.z - travel;
      if (depth < NEAR + s || depth > SHOW) continue;
      var cam0 = cam(v.x + s / 2, v.y + s / 2, v.z + s / 2);
      if (cam0[2] < NEAR) continue;
      var t = Math.min(1, Math.max(0, (cam0[2] - SOLID) / (SHOW - SOLID)));
      var mute = 0.25 + 0.75 * t * t * (3 - 2 * t);   // blend into the background when far
      var X0 = v.x, X1 = v.x + s, Y0 = v.y, Y1 = v.y + s, Z0 = v.z, Z1 = v.z + s;
      var camX = PATH_X;
      if (v.open.front) faces.push([cam0[2], v, 1.0, mute, [[X0, Y0, Z0], [X1, Y0, Z0], [X1, Y1, Z0], [X0, Y1, Z0]]]);
      if (v.open.top && Y1 < EYE) faces.push([cam0[2] - 0.001, v, 1.18, mute, [[X0, Y1, Z0], [X1, Y1, Z0], [X1, Y1, Z1], [X0, Y1, Z1]]]);
      if (v.open.bottom && Y0 > EYE) faces.push([cam0[2] - 0.001, v, 0.7, mute, [[X0, Y0, Z0], [X1, Y0, Z0], [X1, Y0, Z1], [X0, Y0, Z1]]]);
      if (v.open.left && X0 > camX) faces.push([cam0[2] - 0.0005, v, 0.82, mute, [[X0, Y0, Z0], [X0, Y0, Z1], [X0, Y1, Z1], [X0, Y1, Z0]]]);
      if (v.open.right && X1 < camX) faces.push([cam0[2] - 0.0005, v, 0.82, mute, [[X1, Y0, Z0], [X1, Y0, Z1], [X1, Y1, Z1], [X1, Y1, Z0]]]);
    }
    faces.sort(function (a, b) { return b[0] - a[0]; });
    for (var k = 0; k < faces.length; k++) {
      var fc = faces[k], rgb = fc[1].rgb, lit = fc[2], m = fc[3];
      var col = [0, 1, 2].map(function (j) { return Math.round(Math.min(255, rgb[j] * lit) * (1 - m) + bg[j] * m); });
      g.fillStyle = 'rgb(' + col.join(',') + ')';
      g.beginPath();
      for (var n = 0; n < 4; n++) {
        var p = screen(cam(fc[4][n][0], fc[4][n][1], fc[4][n][2]));
        if (n === 0) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]);
      }
      g.closePath(); g.fill();
    }
  }

  function drawGizmo() {
    var s = gizmo.clientWidth, c = s / 2, L = s * 0.36;
    var cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch + 0.35), sp = Math.sin(pitch + 0.35);
    var axes = [
      { v: [1, 0, 0], col: '#e8524a', label: 'x' },
      { v: [0, 1, 0], col: '#8bc34a', label: 'y' },
      { v: [0, 0, 1], col: '#3e8ef7', label: 'z' }
    ].map(function (a) {
      var x = a.v[0], y = a.v[1], z = a.v[2];
      var x1 = x * cyw - z * syw, z1 = x * syw + z * cyw;
      var y1 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      return { col: a.col, label: a.label, x: c + x1 * L, y: c - y1 * L, z: z2 };
    }).sort(function (a, b) { return b.z - a.z; });

    gz.clearRect(0, 0, s, s);
    gz.lineWidth = 2; gz.lineCap = 'round';
    gz.font = '600 11px -apple-system, "Segoe UI", sans-serif';
    gz.textAlign = 'center'; gz.textBaseline = 'middle';
    axes.forEach(function (a) {
      gz.strokeStyle = a.col; gz.fillStyle = a.col;
      gz.beginPath(); gz.moveTo(c, c); gz.lineTo(a.x, a.y); gz.stroke();
      gz.beginPath(); gz.arc(a.x, a.y, 7, 0, Math.PI * 2); gz.fill();
      gz.fillStyle = '#fff'; gz.fillText(a.label, a.x, a.y + 0.5);
    });
    gz.fillStyle = dark.matches ? '#bbb' : '#555';
    gz.beginPath(); gz.arc(c, c, 3, 0, Math.PI * 2); gz.fill();
  }

  var queued = false;
  function frame() {
    queued = false;
    yaw += (yawT - yaw) * (reduce ? 1 : 0.12);
    pitch += (pitchT - pitch) * (reduce ? 1 : 0.12);
    drawScene(); drawGizmo();
    if (!reduce && (Math.abs(yawT - yaw) > 0.0005 || Math.abs(pitchT - pitch) > 0.0005)) request();
  }
  function request() { if (!queued) { queued = true; requestAnimationFrame(frame); } }

  window.addEventListener('pointermove', function (e) {
    yawT = (e.clientX / W - 0.5) * 0.25;
    pitchT = 0.09 + (e.clientY / H - 0.5) * 0.06;
    request();
  }, { passive: true });
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', function () { resize(); request(); });
  dark.addEventListener('change', request);
  resize(); request();
})();
