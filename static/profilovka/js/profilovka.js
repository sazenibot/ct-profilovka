/*
 * Profilovka s rámečkem České televize – vanilla JS, bez závislostí.
 * Inicializuje každý prvek [data-profilovka] na stránce. Konfigurace: profilovka.config.js.
 * Fotka se zpracovává jen v prohlížeči (canvas), na server se posílá pouze id rámečku při stažení.
 */
(function () {
  'use strict';

  var DESIGN = 1080; // logical coordinate space of the editor; export is scaled to cfg.outputSize
  var ZOOM_MAX = 4;

  var DEFAULTS = {
    outputSize: 1080,
    fileName: 'profilovka.png',
    maxFileSizeMB: 30,
    maxWorkingPx: 2048,
    frames: [],
  };

  var ua = navigator.userAgent || '';
  var IS_IOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var IS_IN_APP = /FBAN|FBAV|FB_IAB|Instagram|Messenger|LinkedInApp|\bLine\/|Twitter|TikTok|Snapchat|GSA\//i.test(ua);
  var IS_MOBILE = IS_IOS || /Android|Mobi/i.test(ua);

  var MSG = {
    notImage: 'Tento soubor není obrázek. Nahrajte prosím fotku ve formátu JPG, PNG nebo WebP.',
    tooBig: function (mb, max) {
      return 'Fotka je příliš velká (' + mb + ' MB). Nahrajte prosím soubor do ' + max + ' MB.';
    },
    heic: 'Formát HEIC (fotky z iPhonu) tento prohlížeč neumí otevřít. Zkuste to v Safari, nebo fotku nejdřív uložte jako JPG.',
    decode: 'Fotku se nepodařilo otevřít. Zkuste prosím jiný soubor (JPG nebo PNG).',
    frame: 'Rámeček se nepodařilo načíst. Zkuste obnovit stránku.',
    export: 'Obrázek se nepodařilo vytvořit. Zkuste to prosím znovu nebo v jiném prohlížeči.',
  };

  function $(root, sel) { return root.querySelector('[data-ctp-' + sel + ']'); }
  function $$(root, sel) { return Array.prototype.slice.call(root.querySelectorAll('[data-ctp-' + sel + ']')); }

  function getCookie(name) {
    var m = document.cookie.match('(?:^|; )' + name + '=([^;]*)');
    return m ? decodeURIComponent(m[1]) : '';
  }

  function dataUrlToBlob(dataUrl) {
    var parts = dataUrl.split(',');
    var mime = parts[0].match(/:(.*?);/)[1];
    var bin = atob(parts[1]);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  function isHeic(file) {
    return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name || '');
  }

  function Profilovka(root, cfg) {
    this.root = root;
    this.cfg = cfg;
    this.framesBase = root.getAttribute('data-frames-base') || '';
    this.countUrl = root.getAttribute('data-count-url') || '';
    this.csrfToken = root.getAttribute('data-csrf-token') || '';

    this.canvas = $(root, 'canvas');
    this.ctx = this.canvas.getContext('2d');
    this.stage = $(root, 'stage');
    this.fileInput = $(root, 'file');
    this.zoomInput = $(root, 'zoom');
    this.zoomValue = $(root, 'zoom-value');
    this.circleInput = $(root, 'circle');
    this.downloadBtn = $(root, 'download');
    this.resetBtn = $(root, 'reset');
    this.repickBtn = $(root, 'repick');
    this.fallbackLink = $(root, 'fallback');
    this.errorEl = $(root, 'error');
    this.emptyEl = $(root, 'empty');
    this.loadingEl = $(root, 'loading');
    this.moveHint = $(root, 'move-hint');
    this.framesEl = $(root, 'frames');
    this.overlay = $(root, 'overlay');
    this.overlayImg = $(root, 'overlay-img');
    this.overlayClose = $(root, 'overlay-close');

    this.photo = null;
    this.zoom = 1;
    this.offX = 0;
    this.offY = 0;
    this.frameIndex = 0;
    this.frameImages = [];
    this.lastDataUrl = '';

    this.buildFrames();
    this.bind();
    this.draw();
  }

  Profilovka.prototype.buildFrames = function () {
    var self = this;
    this.cfg.frames.forEach(function (frame, i) {
      var url = self.framesBase + frame.file;
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () { if (i === self.frameIndex) self.draw(); };
      img.onerror = function () {
        img.failed = true;
        if (i === self.frameIndex) self.showError(MSG.frame);
      };
      img.src = url;
      self.frameImages.push(img);

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ctp-frame';
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', i === 0 ? 'true' : 'false');
      btn.tabIndex = i === 0 ? 0 : -1;
      btn.dataset.index = String(i);
      btn.title = frame.label;
      btn.innerHTML = '<span class="ctp-frame-thumb"><img alt="" loading="lazy"></span><span class="ctp-frame-label"></span>';
      btn.querySelector('img').src = url;
      btn.querySelector('.ctp-frame-label').textContent = frame.label;
      self.framesEl.appendChild(btn);
    });
  };

  Profilovka.prototype.bind = function () {
    var self = this;

    $$(this.root, 'pick').forEach(function (b) {
      b.addEventListener('click', function () { self.fileInput.click(); });
    });
    this.fileInput.addEventListener('change', function () {
      if (self.fileInput.files && self.fileInput.files[0]) self.loadFile(self.fileInput.files[0]);
      self.fileInput.value = '';
    });

    ['dragenter', 'dragover'].forEach(function (type) {
      self.stage.addEventListener(type, function (e) {
        e.preventDefault();
        self.stage.classList.add('is-dragover');
      });
    });
    ['dragleave', 'dragend', 'drop'].forEach(function (type) {
      self.stage.addEventListener(type, function (e) {
        e.preventDefault();
        if (type !== 'dragleave' || !self.stage.contains(e.relatedTarget)) self.stage.classList.remove('is-dragover');
      });
    });
    this.stage.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) self.loadFile(f);
    });

    this.bindPointer();

    this.canvas.addEventListener('keydown', function (e) {
      if (!self.photo) return;
      var step = e.shiftKey ? 60 : 15;
      var moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      var m = moves[e.key];
      if (!m) return;
      e.preventDefault();
      self.offX += m[0];
      self.offY += m[1];
      self.clamp();
      self.draw();
    });

    this.zoomInput.addEventListener('input', function () {
      var next = 1 + (Number(self.zoomInput.value) / 100) * (ZOOM_MAX - 1);
      var ratio = next / self.zoom;
      self.zoom = next;
      self.offX *= ratio;
      self.offY *= ratio;
      self.clamp();
      self.updateZoomLabel();
      self.draw();
    });

    this.circleInput.addEventListener('change', function () { self.draw(); });

    this.framesEl.addEventListener('click', function (e) {
      var btn = e.target.closest('.ctp-frame');
      if (btn) self.selectFrame(Number(btn.dataset.index), false);
    });
    this.framesEl.addEventListener('keydown', function (e) {
      var delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!delta) return;
      e.preventDefault();
      var n = self.cfg.frames.length;
      self.selectFrame((self.frameIndex + delta + n) % n, true);
    });

    this.downloadBtn.addEventListener('click', function () { self.download(); });
    this.resetBtn.addEventListener('click', function () { self.reset(); });
    this.fallbackLink.addEventListener('click', function (e) {
      e.preventDefault();
      if (self.lastDataUrl) self.showOverlay(self.lastDataUrl);
    });

    this.overlayClose.addEventListener('click', function () { self.hideOverlay(); });
    this.overlay.addEventListener('click', function (e) { if (e.target === self.overlay) self.hideOverlay(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !self.overlay.hidden) self.hideOverlay();
    });
  };

  Profilovka.prototype.bindPointer = function () {
    var self = this;
    var active = null;

    this.canvas.addEventListener('pointerdown', function (e) {
      if (!self.photo || (e.pointerType === 'mouse' && e.button !== 0)) return;
      active = { id: e.pointerId, x: e.clientX, y: e.clientY };
      self.canvas.setPointerCapture(e.pointerId);
      self.stage.classList.add('is-dragging');
    });
    this.canvas.addEventListener('pointermove', function (e) {
      if (!active || e.pointerId !== active.id) return;
      var k = DESIGN / self.canvas.getBoundingClientRect().width;
      self.offX += (e.clientX - active.x) * k;
      self.offY += (e.clientY - active.y) * k;
      active.x = e.clientX;
      active.y = e.clientY;
      self.clamp();
      self.draw();
    });
    function end(e) {
      if (!active || e.pointerId !== active.id) return;
      active = null;
      self.stage.classList.remove('is-dragging');
    }
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
  };

  Profilovka.prototype.selectFrame = function (index, focus) {
    this.frameIndex = index;
    var buttons = this.framesEl.querySelectorAll('.ctp-frame');
    Array.prototype.forEach.call(buttons, function (b, i) {
      b.setAttribute('aria-checked', i === index ? 'true' : 'false');
      b.tabIndex = i === index ? 0 : -1;
    });
    if (focus) buttons[index].focus();
    var img = this.frameImages[index];
    if (img && img.failed) this.showError(MSG.frame);
    this.draw();
  };

  Profilovka.prototype.loadFile = function (file) {
    var self = this;
    this.hideError();
    var heic = isHeic(file);

    if (!/^image\//.test(file.type) && !heic) return this.showError(MSG.notImage);
    var maxBytes = this.cfg.maxFileSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      return this.showError(MSG.tooBig((file.size / 1048576).toFixed(0), this.cfg.maxFileSizeMB));
    }

    this.setLoading(true);
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      if (!img.naturalWidth || !img.naturalHeight) {
        self.setLoading(false);
        return self.showError(heic ? MSG.heic : MSG.decode);
      }
      self.setPhoto(self.downscale(img));
      self.setLoading(false);
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      self.setLoading(false);
      self.showError(heic ? MSG.heic : MSG.decode);
    };
    img.src = url;
  };

  // Large phone photos (48 Mpx) are reduced once so dragging stays smooth and iOS canvas memory limits are not hit.
  Profilovka.prototype.downscale = function (img) {
    var max = this.cfg.maxWorkingPx;
    var w = img.naturalWidth;
    var h = img.naturalHeight;
    var s = Math.min(1, max / Math.max(w, h));
    var c = document.createElement('canvas');
    c.width = Math.round(w * s);
    c.height = Math.round(h * s);
    var cx = c.getContext('2d');
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  };

  Profilovka.prototype.setPhoto = function (photo) {
    this.photo = photo;
    this.zoom = 1;
    this.offX = 0;
    this.offY = 0;
    this.zoomInput.value = '0';
    this.zoomInput.disabled = false;
    this.downloadBtn.disabled = false;
    this.emptyEl.hidden = true;
    this.resetBtn.hidden = false;
    this.repickBtn.hidden = false;
    this.moveHint.hidden = false;
    this.fallbackLink.hidden = true;
    this.root.classList.add('has-photo');
    this.updateZoomLabel();
    this.draw();
  };

  Profilovka.prototype.reset = function () {
    this.photo = null;
    this.zoom = 1;
    this.offX = 0;
    this.offY = 0;
    this.zoomInput.value = '0';
    this.zoomInput.disabled = true;
    this.downloadBtn.disabled = true;
    this.emptyEl.hidden = false;
    this.resetBtn.hidden = true;
    this.repickBtn.hidden = true;
    this.moveHint.hidden = true;
    this.fallbackLink.hidden = true;
    this.lastDataUrl = '';
    this.root.classList.remove('has-photo');
    this.hideError();
    this.updateZoomLabel();
    this.draw();
  };

  Profilovka.prototype.coverScale = function () {
    return Math.max(DESIGN / this.photo.width, DESIGN / this.photo.height);
  };

  Profilovka.prototype.clamp = function () {
    if (!this.photo) return;
    var s = this.coverScale() * this.zoom;
    var maxX = Math.max(0, (this.photo.width * s - DESIGN) / 2);
    var maxY = Math.max(0, (this.photo.height * s - DESIGN) / 2);
    this.offX = Math.max(-maxX, Math.min(maxX, this.offX));
    this.offY = Math.max(-maxY, Math.min(maxY, this.offY));
  };

  Profilovka.prototype.updateZoomLabel = function () {
    this.zoomValue.textContent = Math.round(this.zoom * 100) + ' %';
  };

  Profilovka.prototype.render = function (ctx, size, preview) {
    var k = size / DESIGN;
    ctx.save();
    ctx.clearRect(0, 0, size, size);

    if (this.photo) {
      var s = this.coverScale() * this.zoom * k;
      var w = this.photo.width * s;
      var h = this.photo.height * s;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this.photo, (size - w) / 2 + this.offX * k, (size - h) / 2 + this.offY * k, w, h);
    } else {
      drawPlaceholder(ctx, size);
    }

    var frame = this.frameImages[this.frameIndex];
    if (frame && frame.complete && frame.naturalWidth && !frame.failed) {
      ctx.drawImage(frame, 0, 0, size, size);
    }

    if (preview && this.circleInput.checked) {
      ctx.beginPath();
      ctx.rect(0, 0, size, size);
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2, true);
      ctx.fillStyle = 'rgba(16, 22, 34, 0.62)';
      ctx.fill('evenodd');
    }
    ctx.restore();
  };

  Profilovka.prototype.draw = function () {
    this.render(this.ctx, DESIGN, true);
  };

  // Export must stay synchronous: an await before navigator.share / a.click() loses the user gesture on iOS.
  Profilovka.prototype.download = function () {
    if (!this.photo) return;
    var size = this.cfg.outputSize;
    var c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    this.render(c.getContext('2d'), size, false);

    var dataUrl;
    try {
      dataUrl = c.toDataURL('image/png');
    } catch (err) {
      return this.showError(MSG.export);
    }
    this.lastDataUrl = dataUrl;
    var blob = dataUrlToBlob(dataUrl);
    var name = this.cfg.fileName;

    this.countDownload();

    if (IS_IN_APP) return this.showOverlay(dataUrl);

    if (IS_IOS) {
      var file = typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        var self = this;
        navigator.share({ files: [file] }).catch(function (err) {
          if (!err || err.name !== 'AbortError') self.showOverlay(dataUrl);
        });
      } else {
        this.showOverlay(dataUrl);
      }
      return;
    }

    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
    if (IS_MOBILE) this.fallbackLink.hidden = false;
  };

  Profilovka.prototype.countDownload = function () {
    var frame = this.cfg.frames[this.frameIndex];
    if (!frame) return;
    this.root.dispatchEvent(new CustomEvent('profilovka:download', { bubbles: true, detail: { frame: frame.id } }));
    if (!this.countUrl || !window.fetch) return;
    fetch(this.countUrl, {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': this.csrfToken || getCookie('csrftoken'),
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ frame: frame.id }),
    }).catch(function () { /* counting must never break the download */ });
  };

  Profilovka.prototype.showOverlay = function (dataUrl) {
    this.overlayImg.src = dataUrl;
    this.overlay.hidden = false;
    document.documentElement.classList.add('ctp-no-scroll');
    this.overlayClose.focus();
  };

  Profilovka.prototype.hideOverlay = function () {
    this.overlay.hidden = true;
    document.documentElement.classList.remove('ctp-no-scroll');
    this.downloadBtn.focus();
  };

  Profilovka.prototype.setLoading = function (on) {
    this.loadingEl.hidden = !on;
    this.stage.classList.toggle('is-loading', on);
  };

  Profilovka.prototype.showError = function (msg) {
    this.errorEl.textContent = msg;
    this.errorEl.hidden = false;
  };

  Profilovka.prototype.hideError = function () {
    this.errorEl.hidden = true;
    this.errorEl.textContent = '';
  };

  function drawPlaceholder(ctx, size) {
    var g = ctx.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, '#F2F4F8');
    g.addColorStop(1, '#DEE0E4');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#C3C6CC';
    ctx.beginPath();
    ctx.arc(size / 2, size * 0.36, size * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(size / 2, size * 0.98, size * 0.34, size * 0.4, 0, Math.PI, 0);
    ctx.fill();
  }

  function init() {
    var cfg = Object.assign({}, DEFAULTS, window.PROFILOVKA_CONFIG || {});
    var roots = document.querySelectorAll('[data-profilovka]');
    Array.prototype.forEach.call(roots, function (root) {
      if (root.__profilovka) return;
      root.__profilovka = new Profilovka(root, cfg);
    });
  }

  window.Profilovka = { init: init };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
