// Background "scene view": a perspective ground grid seen from eye height,
// plus an axis gizmo in the corner. Redraws only on scroll / pointer / resize.
(function () {
  var grid = document.getElementById('grid');
  var gizmo = document.getElementById('gizmo');
  if (!grid || !gizmo) return;
  var g = grid.getContext('2d');
  var gz = gizmo.getContext('2d');
  var dark = matchMedia('(prefers-color-scheme: dark)');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  function drawGrid() {
    var ink = dark.matches ? '255,255,255' : '0,0,0';
    var eye = 1.6;                               // camera height (m)
    var f = H * 0.9;                             // focal length (px)
    var horizon = H * 0.38 - Math.tan(pitch) * f;
    var travel = window.scrollY * 0.006;         // scrolling walks forward
    var cy = Math.cos(yaw), sy = Math.sin(yaw);
    var step = 1, near = 0.6, far = 40, span = 40;

    g.clearRect(0, 0, W, H);
    g.lineWidth = 1;

    function project(x, z) {                     // world (x, 0, z) -> screen
      x -= 5;                                    // stand between major lines
      var xr = x * cy - z * sy, zr = x * sy + z * cy;
      if (zr < near) return null;
      return [W / 2 + f * xr / zr, horizon + f * eye / zr, zr];
    }
    function line(x1, z1, x2, z2, major) {
      var a = project(x1, z1), b = project(x2, z2);
      if (!a || !b) return;
      var d = (a[2] + b[2]) / 2;
      var alpha = Math.max(0, 1 - d / far) * (major ? 0.16 : 0.07) * (dark.matches ? 0.9 : 1);
      g.strokeStyle = 'rgba(' + ink + ',' + alpha.toFixed(3) + ')';
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    }

    var off = travel % step;
    for (var x = -span; x <= span; x += step) {  // lines running away from the camera
      for (var z = near; z < far; z += 4) line(x, z, x, Math.min(z + 4, far), x % 10 === 0);
    }
    var first = Math.ceil(travel / step) * step;
    for (var k = 0; k * step < far; k++) {       // lines across
      var zw = near + (k * step - off);
      if (zw < near) continue;
      var idx = Math.round(first + k * step);
      line(-span, zw, span, zw, idx % 10 === 0);
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
    drawGrid(); drawGizmo();
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
