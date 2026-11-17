/* কল্পক রিডার — মূল অ্যাপ */
(function () {
  'use strict';
  var N = window.KalpakNative || null;
  var bn = KParse.bn, esc = KParse.esc;
  var app = document.getElementById('app');
  var picker = document.getElementById('picker');

  /* ---------- সঞ্চয় ---------- */
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* জায়গা না থাকলে বাদ */ } }
  };
  var mem = {};
  var Books = {
    save: function (id, obj) { var j = JSON.stringify(obj); if (N) N.saveBook(id, j); else mem[id] = j; },
    load: function (id) { var j = N ? N.loadBook(id) : mem[id]; return j ? JSON.parse(j) : null; },
    del: function (id) { if (N) N.deleteBook(id); else delete mem[id]; }
  };
  var lib = store.get('lib', []);
  var marks = store.get('marks', []);
  var prefs = Object.assign({ font: 'serif', size: 19, gap: 'm', theme: 'paper', rate: 1, voice: 'phone' }, store.get('prefs', {}));
  var FONTS = {
    serif: { name: 'নোটো সেরিফ', css: "'K Serif', serif" },
    tiro: { name: 'তিরো বাংলা', css: "'K Tiro', 'K Serif', serif" },
    sans: { name: 'নোটো স্যান্স', css: "'K Sans', 'K Serif', sans-serif" },
    hind: { name: 'হিন্দ শিলিগুড়ি', css: "'K Hind', 'K Serif', sans-serif" }
  };
  var GAPS = { s: { name: 'ঘন', v: 1.6 }, m: { name: 'মাঝারি', v: 1.85 }, l: { name: 'ফাঁকা', v: 2.15 } };
  var THEMES = { paper: 'কাগজ', white: 'সাদা', night: 'রাত্রি' };

  function applyPrefs() {
    var r = document.documentElement.style;
    r.setProperty('--doc', (FONTS[prefs.font] || FONTS.serif).css);
    r.setProperty('--size', prefs.size + 'px');
    r.setProperty('--lh', (GAPS[prefs.gap] || GAPS.m).v);
    document.body.className = 't-' + prefs.theme;
    store.set('prefs', prefs);
    if (N && N.setRate) N.setRate(prefs.rate);
  }

  /* ---------- ছোট সহায়ক ---------- */
  var I = {
    back: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    toc: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
    mark: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v16l-5-4-5 4z"/></svg>',
    lib: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h6v15H4zM10 5h5v15h-5zM16 7l4 1-3 12-3-1"/></svg>',
    set: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>',
    plus: '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    del: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>',
    play: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M9 6v12M15 6v12"/></svg>',
    prev: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-8 6 8 6zM7 6v12"/></svg>',
    next: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l8 6-8 6zM17 6v12"/></svg>',
    stop: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg>',
    ear: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 10v4h3l5 4V6L8 10zM17 9c1 1 1 5 0 6"/></svg>'
  };
  var toastTimer = 0;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }
  function busy(on, msg) {
    document.getElementById('busytext').textContent = msg || 'নথি খোলা হচ্ছে…';
    document.getElementById('busy').hidden = !on;
  }
  function ask(msg, okLabel) {
    return new Promise(function (res) {
      var d = document.getElementById('dialog');
      d.innerHTML = '<div class="dbox" role="dialog" aria-modal="true"><p>' + esc(msg) + '</p><div class="acts"><button class="ghost" data-a="0">থাক</button><button class="primary" data-a="1">' + esc(okLabel) + '</button></div></div>';
      d.hidden = false;
      d.onclick = function (e) {
        var b = e.target.closest('button');
        if (!b && e.target !== d) return;
        d.hidden = true; d.onclick = null;
        res(!!b && b.dataset.a === '1');
      };
    });
  }
  function ago(ts) {
    var d = Math.floor((Date.now() - ts) / 86400000);
    if (d <= 0) return 'আজ';
    if (d === 1) return 'গতকাল';
    if (d < 7) return bn(d) + ' দিন আগে';
    if (d < 30) return bn(Math.floor(d / 7)) + ' সপ্তাহ আগে';
    return bn(Math.floor(d / 30)) + ' মাস আগে';
  }
  function pctText(m) {
    var p = Math.round((m.pct || 0) * 100);
    if (p >= 99) return 'পড়া শেষ';
    if (p <= 0) return 'শুরু হয়নি';
    return bn(p) + '% পড়া';
  }
  function saveLib() { store.set('lib', lib); }

  /* ---------- দিকনির্দেশ ---------- */
  var view = 'library';
  var settingsFrom = 'library';
  var cur = null; /* {meta, book, ch, sents} */

  function nav(active) {
    function b(id, label, icon) { return '<button data-nav="' + id + '" class="' + (active === id ? 'on' : '') + '">' + icon + label + '</button>'; }
    return '<nav class="nav">' + b('library', 'গ্রন্থাগার', I.lib) + b('marks', 'পৃষ্ঠাচিহ্ন', I.mark) + b('settings', 'সজ্জা', I.set) + '</nav>';
  }
  function show(v) {
    if (view === 'reader' && v !== 'reader') { ttsStop(); saveProgress(); }
    view = v;
    if (v === 'library') renderLibrary();
    else if (v === 'marks') renderMarks();
    else if (v === 'settings') renderSettings();
    else if (v === 'reader') renderReader();
  }

  /* ---------- গ্রন্থাগার ---------- */
  function renderLibrary() {
    var h = '<section class="view"><div class="brandbar"><div class="logo"><img src="logo.png" alt="কল্পক"></div></div><div class="scroll"><div class="pad">';
    if (!lib.length) {
      h += '<div class="empty">এখনও কোনো নথি খোলা হয়নি।<br>নিচের “নথি খুলুন” বোতামে ছুঁয়ে<br>DOCX, ODT, EPUB বা TXT ফাইল বেছে নিন।</div>';
    } else {
      var last = lib.slice().sort(function (a, b) { return (b.opened || 0) - (a.opened || 0); })[0];
      h += '<h2 class="sec">পড়া চলছে</h2><div class="card"><div class="now"><div class="cover">' + esc((last.title || 'ক').trim().charAt(0)) + '</div><div class="meta"><div class="btitle">' + esc(last.title) + '</div>' +
        '<div class="small">' + (last.author ? esc(last.author) + ' · ' : '') + last.format + '</div><div class="bar"><div style="width:' + Math.round((last.pct || 0) * 100) + '%"></div></div>' +
        '<div class="small">' + pctText(last) + ' · ' + esc(last.chTitle || '') + '</div></div></div>' +
        '<button class="primary" data-open="' + last.id + '">যেখানে ছিলেন সেখান থেকে পড়ুন</button></div>';
      h += '<h2 class="sec">সব নথি</h2><div>';
      lib.forEach(function (m) {
        h += '<div class="row"><button class="open" data-open="' + m.id + '"><span class="chip ' + m.format + '">' + m.format + '</span><span><span class="name">' + esc(m.title) + '</span><br><span class="small">' + ago(m.opened || m.added) + ' · ' + pctText(m) + '</span></span></button>' +
          '<button class="icon" data-del="' + m.id + '" aria-label="মুছে ফেলুন">' + I.del + '</button></div>';
      });
      h += '</div>';
    }
    h += '</div></div><button class="fab" data-pick="1">' + I.plus + 'নথি খুলুন</button>' + nav('library') + '</section>';
    app.innerHTML = h;
  }

  /* ---------- নথি খোলা ---------- */
  var ERR = {
    WEBVIEW_OLD: 'এই ফোনের Android System WebView পুরোনো। Play Store থেকে সেটি হালনাগাদ করে আবার চেষ্টা করুন।',
    UNSUPPORTED: 'এই ধরনের ফাইল এখনও খোলা যায় না। DOCX, ODT, EPUB বা TXT ফাইল দিন।',
    UNKNOWN: 'ফাইলটি চেনা গেল না। DOCX, ODT, EPUB বা TXT ফাইল দিন।',
    EMPTY: 'এই বইয়ে পড়ার মতো কোনো লেখা পাওয়া যায়নি।'
  };
  async function importFile(name, buf) {
    busy(true);
    await new Promise(function (r) { setTimeout(r, 30); });
    try {
      var book = await KParse.parse(buf, name);
      var old = lib.filter(function (m) { return m.file === name && m.bytes === buf.byteLength; })[0];
      var id = old ? old.id : 'b' + Date.now().toString(36);
      Books.save(id, book);
      var meta = old || { id: id, added: Date.now(), ch: 0, pos: 0, pct: 0 };
      meta.title = book.title; meta.author = book.author; meta.format = book.format;
      meta.file = name; meta.bytes = buf.byteLength; meta.count = book.chapters.length;
      meta.chTitle = book.chapters[meta.ch] ? book.chapters[meta.ch].title : book.chapters[0].title;
      if (!old) lib.unshift(meta);
      saveLib();
      busy(false);
      openBook(id);
    } catch (e) {
      busy(false);
      toast(ERR[e && e.message] || 'ফাইলটি খোলা গেল না। ফাইলটি নষ্ট হয়ে থাকতে পারে।');
    }
  }
  picker.addEventListener('change', function () {
    var f = picker.files && picker.files[0];
    picker.value = '';
    if (!f) return;
    f.arrayBuffer().then(function (buf) { importFile(f.name, buf); });
  });
  function takeIncoming() {
    if (!N || !N.takePendingFile) return;
    var j = N.takePendingFile();
    if (!j) return;
    try {
      var o = JSON.parse(j);
      var bin = atob(o.b64);
      var u = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      importFile(o.name || 'নথি', u.buffer);
    } catch (e) { toast('ফাইলটি খোলা গেল না।'); }
  }
  window.kalpakIncoming = takeIncoming;

  function openBook(id, at) {
    var meta = lib.filter(function (m) { return m.id === id; })[0];
    if (!meta) return;
    var book = Books.load(id);
    if (!book) {
      toast('এই নথির সঞ্চিত লেখা পাওয়া গেল না। ফাইলটি আবার খুলুন।');
      return;
    }
    meta.opened = Date.now();
    cur = { meta: meta, book: book, ch: Math.min(meta.ch || 0, book.chapters.length - 1), sents: [], jump: at || null };
    if (at) cur.ch = Math.min(at.ch, book.chapters.length - 1);
    saveLib();
    show('reader');
  }

  /* ---------- পাঠ ---------- */
  function wrapSentences(root) {
    var sents = [];
    var si = 0;
    var blocks = root.querySelectorAll('p,h2,h3,h4,li,blockquote');
    Array.prototype.forEach.call(blocks, function (b) {
      if (b.querySelector('p,li,blockquote')) return;
      var tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
      var nodes = [];
      while (tw.nextNode()) nodes.push(tw.currentNode);
      var used = false;
      nodes.forEach(function (n) {
        var t = n.nodeValue;
        if (!t) return;
        var frag = document.createDocumentFragment();
        function push(a, z, end) {
          if (z > a) {
            var sp = document.createElement('span');
            sp.className = 's'; sp.dataset.s = si; sp.textContent = t.slice(a, z);
            frag.appendChild(sp);
            sents[si] = (sents[si] || '') + t.slice(a, z);
            used = true;
          }
          if (end && used) { si++; used = false; }
        }
        var start = 0, i = 0, L = t.length;
        while (i < L) {
          var c = t[i];
          if ('।!?'.indexOf(c) >= 0 || (c === '.' && (i + 1 >= L || /[\s"'’”)]/.test(t[i + 1])))) {
            var j = i + 1;
            while (j < L && '।!?….'.indexOf(t[j]) >= 0) j++;
            while (j < L && '"\'’”)]'.indexOf(t[j]) >= 0) j++;
            while (j < L && /\s/.test(t[j])) j++;
            push(start, j, true); start = j; i = j;
          } else i++;
        }
        push(start, L, false);
        n.parentNode.replaceChild(frag, n);
      });
      if (used) { si++; used = false; }
    });
    for (var k = 0; k < si; k++) if (sents[k] === undefined) sents[k] = '';
    return sents;
  }

  function renderReader() {
    var m = cur.meta;
    var h = '<section class="view" id="rv"><header class="top"><button class="icon" data-back="1" aria-label="ফিরে যান">' + I.back + '</button>' +
      '<div class="titles"><div class="t1">' + esc(m.title) + '</div><div class="t2" id="chname"></div></div>' +
      '<button class="icon" data-toc="1" aria-label="সূচিপত্র">' + I.toc + '</button>' +
      '<button class="icon" data-addmark="1" aria-label="পৃষ্ঠাচিহ্ন দিন">' + I.mark + '</button>' +
      '<button class="icon glyph" data-nav="settings" aria-label="পাঠসজ্জা">অ</button></header>' +
      '<div class="scroll" id="sc"><article id="page"></article></div>' +
      '<div class="prog"><div class="bar"><div id="pbar"></div></div><span id="ptext"></span></div>' +
      '<section class="listen" id="listen"></section></section>';
    app.innerHTML = h;
    renderChapter(cur.jump ? null : (m.pos || 0));
    renderListen();
    document.getElementById('sc').addEventListener('scroll', onScroll, { passive: true });
  }
  function renderChapter(pos) {
    var c = cur.book.chapters[cur.ch];
    var page = document.getElementById('page');
    var navh = '<div class="chnav">' + (cur.ch > 0 ? '<button data-ch="-1">আগের অধ্যায়</button>' : '') +
      (cur.ch < cur.book.chapters.length - 1 ? '<button data-ch="1">পরের অধ্যায়</button>' : '') + '</div>';
    page.innerHTML = '<div id="body">' + c.html + '</div>' + navh;
    cur.sents = wrapSentences(document.getElementById('body'));
    document.getElementById('chname').textContent = c.title;
    cur.meta.ch = cur.ch; cur.meta.chTitle = c.title;
    var sc = document.getElementById('sc');
    sc.scrollTop = 0;
    if (cur.jump) {
      var el = page.querySelector('[data-s="' + cur.jump.s + '"]');
      if (el) sc.scrollTop = Math.max(0, el.offsetTop - 60);
      cur.jump = null;
    } else if (pos) {
      sc.scrollTop = pos * Math.max(0, sc.scrollHeight - sc.clientHeight);
    }
    updateProgress();
  }
  function updateProgress() {
    var sc = document.getElementById('sc');
    if (!sc || !cur) return;
    var max = sc.scrollHeight - sc.clientHeight;
    var pos = max > 4 ? Math.min(1, sc.scrollTop / max) : 1;
    cur.meta.pos = max > 4 ? pos : 0;
    cur.meta.pct = Math.min(1, (cur.ch + pos) / cur.book.chapters.length);
    var p = Math.round(cur.meta.pct * 100);
    document.getElementById('pbar').style.width = p + '%';
    document.getElementById('ptext').textContent = bn(p) + '%';
  }
  var scrollTimer = 0;
  function onScroll() {
    updateProgress();
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(saveLib, 500);
  }
  function saveProgress() { if (cur) { saveLib(); } }
  function gotoChapter(n, pos) {
    if (n < 0 || n >= cur.book.chapters.length) return false;
    cur.ch = n;
    renderChapter(pos || 0);
    saveLib();
    return true;
  }
  function firstVisibleSentence() {
    var sc = document.getElementById('sc');
    var top = sc.getBoundingClientRect().top;
    var spans = document.querySelectorAll('#body .s');
    for (var i = 0; i < spans.length; i++) {
      if (spans[i].getBoundingClientRect().bottom > top + 4) return parseInt(spans[i].dataset.s, 10);
    }
    return 0;
  }
  function showToc() {
    var d = document.createElement('div');
    d.className = 'sheet';
    var h = '<div class="box"><h2>সূচিপত্র</h2><div class="list">';
    cur.book.chapters.forEach(function (c, i) {
      h += '<button class="item' + (i === cur.ch ? ' on' : '') + '" data-goto="' + i + '">' + esc(c.title) + '</button>';
    });
    d.innerHTML = h + '</div></div>';
    d.addEventListener('click', function (e) {
      var b = e.target.closest('[data-goto]');
      if (b) { ttsStop(); gotoChapter(parseInt(b.dataset.goto, 10)); }
      if (b || e.target === d) d.remove();
    });
    document.body.appendChild(d);
    var onEl = d.querySelector('.item.on');
    if (onEl) onEl.scrollIntoView({ block: 'center' });
  }
  function addMark() {
    var s = firstVisibleSentence();
    var text = (cur.sents[s] || '').trim().slice(0, 70);
    marks.unshift({ book: cur.meta.id, ch: cur.ch, s: s, text: text, at: Date.now() });
    store.set('marks', marks);
    toast('পৃষ্ঠাচিহ্ন রাখা হল।');
  }

  /* ---------- পাঠ শোনা ---------- */
  var tts = { on: false, paused: false, i: 0, uid: 0, sim: 0 };
  var ttsState = N && N.ttsStatus ? N.ttsStatus() : 'ready';
  /* ভারতীয় বাংলা কণ্ঠ (ফোনের ভেতরে চলা মডেল) */
  var voiceState = N && N.voiceStatus ? N.voiceStatus() : 'none';
  var VOICES = { female: 'নারীকণ্ঠ', male: 'পুরুষকণ্ঠ', phone: 'ফোনের কণ্ঠ' };
  function useVoice() { return !!(N && N.voiceSpeak) && voiceState === 'ready' && (prefs.voice === 'female' || prefs.voice === 'male'); }
  function voiceLabel() { return useVoice() ? VOICES[prefs.voice] : VOICES.phone; }
  window.kalpakVoice = function (kind, arg) {
    if (kind === 'progress') {
      voiceState = 'downloading:' + arg;
      var el = document.getElementById('vpct');
      if (el) el.textContent = 'নামছে ' + bn(arg) + '%';
      else if (view === 'settings') renderSettings();
      return;
    }
    if (kind === 'ready') {
      voiceState = 'ready';
      if (prefs.voice === 'phone') { prefs.voice = 'female'; applyPrefs(); }
      toast('ভারতীয় বাংলা কণ্ঠ তৈরি। এখন থেকে এই কণ্ঠেই পাঠ হবে।');
    } else if (kind === 'error') {
      voiceState = 'none';
      toast('কণ্ঠ নামানো গেল না। নেট সংযোগ দেখে আবার চেষ্টা করুন।');
    } else if (kind === 'deleted') {
      voiceState = 'none'; prefs.voice = 'phone'; applyPrefs();
    }
    if (view === 'settings') renderSettings();
  };
  function nextVoiceText() {
    if (!cur) return '';
    for (var k = tts.i + 1; k < cur.sents.length; k++) {
      if (speakable(cur.sents[k])) return KVoice.norm(cur.sents[k]);
    }
    return '';
  }
  function setWaiting(on) {
    tts.waiting = on;
    var el = document.getElementById('linfo');
    if (el) el.textContent = infoText();
  }
  function infoText() {
    if (tts.paused) return 'পাঠ থেমে আছে · ' + voiceLabel();
    if (tts.waiting) return 'বাক্য তৈরি হচ্ছে… · ' + voiceLabel();
    return 'পাঠ শোনা চলছে · ' + voiceLabel();
  }
  function speakable(t) { return /[ঀ-৿A-Za-z0-9]/.test(t || ''); }
  function nativeSpeak(text, uid) {
    if (useVoice()) {
      setWaiting(true);
      N.voiceSpeak(KVoice.norm(text), String(uid), prefs.voice === 'male' ? 2 : 1, prefs.rate, nextVoiceText());
      return;
    }
    if (N && N.speak) { N.speak(text, String(uid)); return; }
    if (window.speechSynthesis && window.SpeechSynthesisUtterance) {
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'bn-IN'; u.rate = prefs.rate;
      u.onend = function () { window.kalpakTts('done', String(uid)); };
      u.onerror = function () { window.kalpakTts('error', String(uid)); };
      speechSynthesis.speak(u);
      return;
    }
    tts.sim = setTimeout(function () { window.kalpakTts('done', String(uid)); }, 600);
  }
  function nativeStop() {
    tts.waiting = false;
    if (N && N.voiceStop) N.voiceStop();
    if (N && N.stopSpeak) N.stopSpeak();
    else if (window.speechSynthesis) speechSynthesis.cancel();
    clearTimeout(tts.sim);
  }
  function highlight(i) {
    var olds = document.querySelectorAll('#body .s.hl');
    Array.prototype.forEach.call(olds, function (e) { e.classList.remove('hl'); });
    if (i < 0) return;
    var els = document.querySelectorAll('#body [data-s="' + i + '"]');
    Array.prototype.forEach.call(els, function (e) { e.classList.add('hl'); });
    if (els[0]) {
      var sc = document.getElementById('sc');
      var r = els[0].getBoundingClientRect(), b = sc.getBoundingClientRect();
      if (r.top < b.top + 20 || r.bottom > b.bottom - 60) sc.scrollTop += r.top - b.top - b.height * 0.3;
    }
  }
  function speakCur() {
    if (!tts.on || tts.paused || !cur) return;
    while (tts.i < cur.sents.length && !speakable(cur.sents[tts.i])) tts.i++;
    if (tts.i >= cur.sents.length) {
      if (gotoChapter(cur.ch + 1)) { tts.i = 0; speakCur(); }
      else { ttsStop(); toast('নথি পড়া শেষ হল।'); }
      return;
    }
    highlight(tts.i);
    tts.uid++;
    nativeSpeak(cur.sents[tts.i].trim(), tts.uid);
  }
  window.kalpakTts = function (ev, arg) {
    if (ev === 'status') { ttsState = arg; if (view === 'settings') renderSettings(); return; }
    if (ev === 'start') { if (String(tts.uid) === String(arg)) setWaiting(false); return; }
    if ((ev === 'done' || ev === 'error') && tts.on && !tts.paused && String(tts.uid) === String(arg)) {
      tts.fail = ev === 'error' ? (tts.fail || 0) + 1 : 0;
      if (tts.fail >= 3) { ttsStop(); toast('কণ্ঠ লেখাটি পড়তে পারছে না। “সজ্জা” থেকে কণ্ঠের সেটিং দেখে নিন।'); return; }
      tts.i++; speakCur();
    }
  };
  function ttsStart() {
    if (N && N.voiceStatus) voiceState = N.voiceStatus();
    if (N && N.ttsStatus) ttsState = N.ttsStatus();
    if (useVoice()) { /* নিজস্ব মডেল থাকলে ফোনের কণ্ঠের অবস্থা দেখার দরকার নেই */ }
    else if (ttsState === 'nolang' || ttsState === 'none') {
      toast('এই ফোনে বাংলা পাঠের কণ্ঠ পাওয়া যায়নি। “সজ্জা” থেকে কণ্ঠের সেটিং খুলে বাংলা কণ্ঠ নামিয়ে নিন।');
      return;
    }
    if (!useVoice() && ttsState === 'init') { toast('কণ্ঠ তৈরি হচ্ছে, একটু পরে আবার চেষ্টা করুন।'); return; }
    tts.on = true; tts.paused = false; tts.fail = 0; tts.i = firstVisibleSentence();
    if (N && N.keepAwake) N.keepAwake(true);
    renderListen(); speakCur();
  }
  function ttsStop() {
    if (!tts.on) return;
    tts.on = false; tts.paused = false; tts.uid++;
    nativeStop(); highlight(-1);
    if (N && N.keepAwake) N.keepAwake(false);
    if (view === 'reader' && document.getElementById('listen')) renderListen();
  }
  function ttsToggle() {
    if (tts.paused) { tts.paused = false; renderListen(); speakCur(); }
    else { tts.paused = true; tts.uid++; nativeStop(); renderListen(); }
  }
  function ttsSkip(d) {
    tts.uid++; nativeStop();
    tts.i = Math.max(0, tts.i + d);
    if (tts.paused) highlight(Math.min(tts.i, cur.sents.length - 1)); else speakCur();
  }
  var RATES = [0.8, 1, 1.2, 1.4];
  function rateLabel() { return bn(prefs.rate.toFixed(1)) + '×'; }
  function renderListen() {
    var el = document.getElementById('listen');
    if (!el) return;
    if (!tts.on) {
      el.innerHTML = '<button class="start" data-tts="start">' + I.ear + 'পাঠ শুনুন</button>';
      return;
    }
    el.innerHTML = '<div class="info"><span id="linfo">' + esc(infoText()) + '</span><span>গতি ' + rateLabel() + '</span></div><div class="ctl">' +
      '<button class="rb" data-tts="rate" aria-label="গতি বদলান">' + rateLabel() + '</button>' +
      '<button class="rb plain" data-tts="prev" aria-label="আগের বাক্য">' + I.prev + '</button>' +
      '<button class="play" data-tts="toggle" aria-label="' + (tts.paused ? 'চালান' : 'থামান') + '">' + (tts.paused ? I.play : I.pause) + '</button>' +
      '<button class="rb plain" data-tts="next" aria-label="পরের বাক্য">' + I.next + '</button>' +
      '<button class="rb" data-tts="stop" aria-label="শোনা বন্ধ করুন">' + I.stop + '</button></div>';
  }

  /* ---------- পৃষ্ঠাচিহ্ন ---------- */
  function renderMarks() {
    var h = '<section class="view"><header class="top"><h1>পৃষ্ঠাচিহ্ন</h1></header><div class="scroll"><div class="pad">';
    var live = marks.filter(function (k) { return lib.some(function (m) { return m.id === k.book; }); });
    if (!live.length) {
      h += '<div class="empty">কোনো পৃষ্ঠাচিহ্ন নেই।<br>পড়ার সময় ওপরের পৃষ্ঠাচিহ্ন বোতামে ছুঁলে<br>জায়গাটা এখানে জমা থাকবে।</div>';
    } else {
      live.forEach(function (k) {
        var m = lib.filter(function (x) { return x.id === k.book; })[0];
        h += '<div class="row"><button class="open" data-mark="' + k.at + '"><span><span class="name">' + esc(k.text || 'চিহ্নিত জায়গা') + '…</span><br><span class="small">' + esc(m.title) + ' · ' + ago(k.at) + '</span></span></button>' +
          '<button class="icon" data-delmark="' + k.at + '" aria-label="পৃষ্ঠাচিহ্ন মুছুন">' + I.del + '</button></div>';
      });
    }
    app.innerHTML = h + '</div></div>' + nav('marks') + '</section>';
  }

  /* ---------- সজ্জা ---------- */
  function renderSettings() {
    var fromReader = settingsFrom === 'reader';
    var h = '<section class="view"><header class="top">' + (fromReader ? '<button class="icon" data-back="1" aria-label="ফিরে যান">' + I.back + '</button>' : '') + '<h1>পাঠসজ্জা ও কণ্ঠ</h1></header><div class="scroll"><div class="pad">';
    h += '<h2 class="sec">হরফ</h2><div class="grid2">';
    Object.keys(FONTS).forEach(function (k) {
      h += '<button class="opt' + (prefs.font === k ? ' on' : '') + '" data-font="' + k + '" style="font-family:' + FONTS[k].css.replace(/"/g, '&quot;') + '">' + FONTS[k].name + '</button>';
    });
    h += '</div><h2 class="sec">হরফের মাপ ও পঙ্‌ক্তির ব্যবধান</h2><div class="sizer"><button class="opt" data-size="-1" aria-label="হরফ ছোট করুন" style="font-size:15px">অ</button><div class="val">' + bn(prefs.size) + '</div><button class="opt" data-size="1" aria-label="হরফ বড় করুন" style="font-size:23px">অ</button></div><div class="grid3">';
    Object.keys(GAPS).forEach(function (k) { h += '<button class="opt' + (prefs.gap === k ? ' on' : '') + '" data-gap="' + k + '">' + GAPS[k].name + '</button>'; });
    h += '</div><h2 class="sec">পটভূমি</h2><div class="grid3">';
    Object.keys(THEMES).forEach(function (k) { h += '<button class="opt th-' + k + (prefs.theme === k ? ' on' : '') + '" data-theme="' + k + '">' + THEMES[k] + '</button>'; });
    var st = { ready: 'চালু আছে', init: 'তৈরি হচ্ছে', nolang: 'বাংলা কণ্ঠ নেই', none: 'পাওয়া যায়নি' }[ttsState] || 'তৈরি হচ্ছে';
    if (N && N.voiceStatus) voiceState = N.voiceStatus();
    var vReady = voiceState === 'ready';
    var vDown = voiceState.indexOf('downloading') === 0;
    var active = useVoice() ? prefs.voice : 'phone';
    h += '</div><h2 class="sec">কোন কণ্ঠে পড়বে</h2><div class="grid3">';
    ['female', 'male', 'phone'].forEach(function (k) {
      var off = k !== 'phone' && !vReady;
      h += '<button class="opt' + (active === k ? ' on' : '') + '" data-voice="' + k + '"' + (off ? ' disabled style="opacity:.45"' : '') + '>' + VOICES[k] + '</button>';
    });
    h += '</div><h2 class="sec">পাঠের কণ্ঠ</h2><div class="card"><div class="voice"><div><div class="vn">ভারতীয় বাংলা কণ্ঠ</div><div class="small">নেট ছাড়াই চলে · নারী ও পুরুষ</div></div>';
    if (vReady) h += '<div class="pill">বসানো আছে</div>';
    else if (vDown) h += '<div class="pill wait" id="vpct">নামছে ' + bn(voiceState.split(':')[1] || '0') + '%</div>';
    else if (N && N.voiceDownload) h += '<button class="ghost" data-vdl="1">নামান · ১১৯ এমবি</button>';
    else h += '<div class="pill wait">এখানে চলে না</div>';
    h += '</div>';
    if (vReady) h += '<button class="ghost" data-vdel="1" style="margin-top:10px">কণ্ঠ-মডেল মুছুন</button>';
    h += '<div class="sep"></div><div class="voice"><div><div class="vn">ফোনের নিজস্ব কণ্ঠ</div><div class="small">ফোনে বসানো বাংলা কণ্ঠ ব্যবহার করে</div></div><div class="pill' + (ttsState === 'ready' ? '' : ' wait') + '">' + st + '</div></div>';
    if (N && N.openTtsSettings) h += '<button class="ghost" data-ttsset="1" style="margin-top:10px">ফোনের কণ্ঠের সেটিং খুলুন</button>';
    h += '</div>';
    h += '<div class="rate"><span>পড়ার গতি</span><input id="rate" type="range" min="0.6" max="1.6" step="0.1" value="' + prefs.rate + '" aria-label="পড়ার গতি"><span id="ratev">' + rateLabel() + '</span></div>';
    h += '<div class="about">কল্পক রিডার' + (N && N.appVersion ? ' · সংস্করণ ' + esc(N.appVersion()) : '') + '<br>হরফ: Noto Serif Bengali, Noto Sans Bengali, Tiro Bangla, Hind Siliguri — SIL Open Font License 1.1-এর অধীনে ব্যবহৃত।</div>';
    app.innerHTML = h + '</div></div>' + (fromReader ? '' : nav('settings')) + '</section>';
    var r = document.getElementById('rate');
    r.addEventListener('input', function () {
      prefs.rate = parseFloat(r.value);
      document.getElementById('ratev').textContent = rateLabel();
      applyPrefs();
    });
  }

  /* ---------- ঘটনা ---------- */
  app.addEventListener('click', function (e) {
    var t = e.target.closest('button');
    if (t) {
      var d = t.dataset;
      if (d.pick) { picker.click(); return; }
      if (d.nav) {
        if (d.nav === 'settings') settingsFrom = view === 'reader' ? 'reader' : 'library';
        show(d.nav); return;
      }
      if (d.open) { openBook(d.open); return; }
      if (d.del) {
        ask('এই নথিটি গ্রন্থাগার থেকে মুছে ফেলবেন? ফোনের মূল ফাইলটি যেমন আছে তেমনই থাকবে।', 'মুছুন').then(function (ok) {
          if (!ok) return;
          Books.del(d.del);
          lib = lib.filter(function (m) { return m.id !== d.del; });
          marks = marks.filter(function (k) { return k.book !== d.del; });
          saveLib(); store.set('marks', marks); renderLibrary();
        });
        return;
      }
      if (d.back) { goBack(); return; }
      if (d.toc) { showToc(); return; }
      if (d.addmark) { addMark(); return; }
      if (d.ch) { ttsStop(); gotoChapter(cur.ch + parseInt(d.ch, 10)); return; }
      if (d.tts) {
        if (d.tts === 'start') ttsStart();
        else if (d.tts === 'stop') ttsStop();
        else if (d.tts === 'toggle') ttsToggle();
        else if (d.tts === 'prev') ttsSkip(-1);
        else if (d.tts === 'next') ttsSkip(1);
        else if (d.tts === 'rate') {
          var idx = RATES.indexOf(prefs.rate);
          prefs.rate = RATES[(idx + 1) % RATES.length];
          applyPrefs(); renderListen();
        }
        return;
      }
      if (d.mark) {
        var k = marks.filter(function (x) { return String(x.at) === d.mark; })[0];
        if (k) openBook(k.book, { ch: k.ch, s: k.s });
        return;
      }
      if (d.delmark) { marks = marks.filter(function (x) { return String(x.at) !== d.delmark; }); store.set('marks', marks); renderMarks(); return; }
      if (d.font) { prefs.font = d.font; applyPrefs(); renderSettings(); return; }
      if (d.size) { prefs.size = Math.max(14, Math.min(30, prefs.size + parseInt(d.size, 10))); applyPrefs(); renderSettings(); return; }
      if (d.gap) { prefs.gap = d.gap; applyPrefs(); renderSettings(); return; }
      if (d.theme) { prefs.theme = d.theme; applyPrefs(); renderSettings(); return; }
      if (d.ttsset) { N.openTtsSettings(); return; }
      if (d.voice) { prefs.voice = d.voice; applyPrefs(); renderSettings(); return; }
      if (d.vdl) {
        ask('প্রায় ১১৯ এমবি নামবে, তাই ওয়াই-ফাই থাকলে ভালো। নামানো শুরু করবেন?', 'নামান').then(function (ok) {
          if (!ok) return;
          N.voiceDownload(); voiceState = 'downloading:0'; renderSettings();
        });
        return;
      }
      if (d.vdel) {
        ask('ভারতীয় বাংলা কণ্ঠ-মডেল ফোন থেকে মুছে ফেলবেন? পরে আবার নামানো যাবে।', 'মুছুন').then(function (ok) {
          if (ok) N.voiceDelete();
        });
        return;
      }
      return;
    }
    /* পাতায় ছোঁয়া: বাঁয়ে আগের পর্দা, ডানে পরের পর্দা, মাঝে দণ্ড লুকানো */
    if (view === 'reader' && e.target.closest('#sc')) {
      var sel = window.getSelection && String(window.getSelection());
      if (sel) return;
      var sc = document.getElementById('sc');
      var x = e.clientX / window.innerWidth;
      if (x < 0.28) sc.scrollBy({ top: -sc.clientHeight * 0.88 });
      else if (x > 0.72) sc.scrollBy({ top: sc.clientHeight * 0.88 });
      else document.getElementById('rv').classList.toggle('bare');
    }
  });

  function goBack() {
    var dlg = document.getElementById('dialog');
    if (!dlg.hidden) { dlg.click(); return true; }
    var sheet = document.querySelector('.sheet');
    if (sheet) { sheet.remove(); return true; }
    if (view === 'settings' && settingsFrom === 'reader' && cur) { show('reader'); return true; }
    if (view === 'reader') { show('library'); return true; }
    if (view !== 'library') { show('library'); return true; }
    return false;
  }
  window.kalpakBack = goBack;
  window.addEventListener('pagehide', saveProgress);
  document.addEventListener('visibilitychange', function () { if (document.hidden) saveProgress(); });

  applyPrefs();
  show('library');
  takeIncoming();
})();
