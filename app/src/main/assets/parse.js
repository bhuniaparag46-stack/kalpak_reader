/* কল্পক রিডার — নথি থেকে অধ্যায় বানানো (DOCX, ODT, EPUB, TXT) */
(function (g) {
  'use strict';

  var BN = '০১২৩৪৫৬৭৮৯';
  function bn(n) { return String(n).replace(/\d/g, function (d) { return BN[d]; }); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function baseName(name) {
    return String(name || '').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '') || 'নামহীন নথি';
  }
  function xml(str, type) {
    return new DOMParser().parseFromString(str, type || 'application/xml');
  }
  function b64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }

  /* blocks: {kind:'h'|'p', level, html, text, center, newChapter}  →  chapters */
  function buildChapters(blocks, docTitle) {
    var chapters = [];
    var cur = null;
    function start(title) { cur = { title: title, html: [] }; chapters.push(cur); }
    var numOnly = /^[০-৯0-9]{1,3}[.।)]?$/;

    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      var t = (b.text || '').trim();
      if (!t && !b.raw) continue;

      if (b.kind === 'h' && b.level <= 1) {
        start(t);
        cur.html.push('<h2>' + b.html + '</h2>');
        continue;
      }
      if (b.kind === 'p' && numOnly.test(t)) {
        var title = 'অধ্যায় ' + bn(t.replace(/[.।)]/g, '').replace(/[০-৯]/g, function (d) { return BN.indexOf(d); }));
        var next = null;
        for (var j = i + 1; j < blocks.length; j++) {
          if ((blocks[j].text || '').trim()) { next = blocks[j]; break; }
        }
        var nt = next ? next.text.trim() : '';
        if (next && nt.length <= 40 && !/[।?!.…]$/.test(nt) && !numOnly.test(nt)) {
          start(title + ' · ' + nt);
          cur.html.push('<h2><span class="chno">' + esc(t) + '</span> ' + next.html + '</h2>');
          i = blocks.indexOf(next);
        } else {
          start(title);
          cur.html.push('<h2>' + esc(t) + '</h2>');
        }
        continue;
      }
      if (!cur) start(docTitle || 'শুরু');
      if (b.raw) cur.html.push(b.raw);
      else if (b.kind === 'h') cur.html.push('<h3>' + b.html + '</h3>');
      else cur.html.push('<p' + (b.center ? ' class="c"' : '') + '>' + b.html + '</p>');
    }

    /* অধ্যায়ের চিহ্ন না থাকলে লম্বা নথিকে অংশে ভাগ */
    var out = [];
    chapters.forEach(function (c) {
      if (c.html.length <= 260) { out.push({ title: c.title, html: c.html.join('\n') }); return; }
      var parts = Math.ceil(c.html.length / 200);
      for (var k = 0; k < parts; k++) {
        out.push({
          title: c.title + ' (' + bn(k + 1) + ')',
          html: c.html.slice(k * 200, (k + 1) * 200).join('\n')
        });
      }
    });
    if (!out.length) out.push({ title: docTitle || 'শুরু', html: '<p>এই নথিতে পড়ার মতো কোনো লেখা পাওয়া যায়নি।</p>' });
    return out;
  }

  /* ---------- DOCX ---------- */
  function on(el) {
    if (!el) return false;
    var v = el.getAttribute('w:val');
    return !(v === '0' || v === 'false' || v === 'off');
  }
  async function parseDocx(buf, name) {
    var zip = KZip.open(buf);
    var docXml = await zip.text('word/document.xml');
    if (!docXml) throw new Error('BAD_DOCX');
    var doc = xml(docXml);
    var title = baseName(name);
    var author = '';
    if (zip.has('docProps/core.xml')) {
      try {
        var core = xml(await zip.text('docProps/core.xml'));
        var ct = core.getElementsByTagName('dc:title')[0];
        var cc = core.getElementsByTagName('dc:creator')[0];
        if (ct && ct.textContent.trim() && !/[\u0980-\u09FFA-Za-z0-9]/.test(title)) title = ct.textContent.trim();
        if (cc && cc.textContent.trim()) author = cc.textContent.trim();
      } catch (e) { /* শিরোনাম না পেলে ফাইলের নাম থাকবে */ }
    }
    var ps = doc.getElementsByTagName('w:p');
    var blocks = [];
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      var ppr = null;
      for (var c = p.firstChild; c; c = c.nextSibling) { if (c.nodeName === 'w:pPr') { ppr = c; break; } }
      var style = '';
      var center = false;
      if (ppr) {
        var st = ppr.getElementsByTagName('w:pStyle')[0];
        if (st) style = st.getAttribute('w:val') || '';
        var jc = ppr.getElementsByTagName('w:jc')[0];
        if (jc && jc.getAttribute('w:val') === 'center') center = true;
      }
      var html = '';
      var text = '';
      var runs = p.getElementsByTagName('w:r');
      for (var r = 0; r < runs.length; r++) {
        var run = runs[r];
        var rpr = null;
        var piece = '';
        for (var k = run.firstChild; k; k = k.nextSibling) {
          if (k.nodeName === 'w:rPr') rpr = k;
          else if (k.nodeName === 'w:t') piece += k.textContent;
          else if (k.nodeName === 'w:tab') piece += ' ';
          else if (k.nodeName === 'w:br' || k.nodeName === 'w:cr') piece += '\n';
        }
        if (!piece) continue;
        text += piece;
        var h = esc(piece).replace(/\n/g, '<br>');
        if (rpr) {
          var bEl = null, iEl = null;
          for (var q = rpr.firstChild; q; q = q.nextSibling) {
            if (q.nodeName === 'w:b') bEl = q;
            if (q.nodeName === 'w:i') iEl = q;
          }
          if (on(bEl)) h = '<strong>' + h + '</strong>';
          if (on(iEl)) h = '<em>' + h + '</em>';
        }
        html += h;
      }
      var m = /^(heading|title)\s*([1-6])?/i.exec(style);
      if (m) blocks.push({ kind: 'h', level: m[1].toLowerCase() === 'title' ? 1 : parseInt(m[2] || '1', 10), html: html, text: text });
      else blocks.push({ kind: 'p', html: html, text: text, center: center });
    }
    return { title: title, author: author, format: 'DOCX', chapters: buildChapters(blocks, title) };
  }

  /* ---------- ODT ---------- */
  async function parseOdt(buf, name) {
    var zip = KZip.open(buf);
    var cx = await zip.text('content.xml');
    if (!cx) throw new Error('BAD_ODT');
    var doc = xml(cx);
    var title = baseName(name);
    var author = '';
    if (zip.has('meta.xml')) {
      try {
        var meta = xml(await zip.text('meta.xml'));
        var mt = meta.getElementsByTagName('dc:title')[0];
        var mc = meta.getElementsByTagName('dc:creator')[0] || meta.getElementsByTagName('meta:initial-creator')[0];
        if (mt && mt.textContent.trim() && !/[\u0980-\u09FFA-Za-z0-9]/.test(title)) title = mt.textContent.trim();
        if (mc && mc.textContent.trim()) author = mc.textContent.trim();
      } catch (e) { /* ফাইলের নামই থাকবে */ }
    }
    var styles = {};
    var sts = doc.getElementsByTagName('style:style');
    for (var i = 0; i < sts.length; i++) {
      var s = sts[i];
      var tp = s.getElementsByTagName('style:text-properties')[0];
      var pp = s.getElementsByTagName('style:paragraph-properties')[0];
      styles[s.getAttribute('style:name')] = {
        b: !!tp && tp.getAttribute('fo:font-weight') === 'bold',
        i: !!tp && tp.getAttribute('fo:font-style') === 'italic',
        c: !!pp && pp.getAttribute('fo:text-align') === 'center'
      };
    }
    function inline(node) {
      var html = '';
      for (var c = node.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) { html += esc(c.nodeValue); continue; }
        if (c.nodeType !== 1) continue;
        var nm = c.nodeName;
        if (nm === 'text:s') { html += new Array((parseInt(c.getAttribute('text:c') || '1', 10)) + 1).join(' '); }
        else if (nm === 'text:tab') html += ' ';
        else if (nm === 'text:line-break') html += '<br>';
        else if (nm === 'text:note' || nm === 'office:annotation' || nm === 'text:tracked-changes') { /* বাদ */ }
        else if (nm === 'text:span') {
          var st = styles[c.getAttribute('text:style-name')] || {};
          var inner = inline(c);
          if (st.b) inner = '<strong>' + inner + '</strong>';
          if (st.i) inner = '<em>' + inner + '</em>';
          html += inner;
        } else html += inline(c);
      }
      return html;
    }
    function plain(html) { return html.replace(/<br>/g, '\n').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'); }
    var blocks = [];
    var body = doc.getElementsByTagName('office:text')[0] || doc.documentElement;
    var all = body.getElementsByTagName('*');
    for (var j = 0; j < all.length; j++) {
      var el = all[j];
      if (el.nodeName !== 'text:p' && el.nodeName !== 'text:h') continue;
      var skip = false;
      for (var a = el.parentNode; a && a !== body; a = a.parentNode) {
        var an = a.nodeName;
        if (an === 'text:p' || an === 'text:h' || an === 'text:note' || an === 'office:annotation' || an === 'text:tracked-changes') { skip = true; break; }
      }
      if (skip) continue;
      var h = inline(el);
      var st2 = styles[el.getAttribute('text:style-name')] || {};
      if (el.nodeName === 'text:h') blocks.push({ kind: 'h', level: parseInt(el.getAttribute('text:outline-level') || '1', 10), html: h, text: plain(h) });
      else blocks.push({ kind: 'p', html: h, text: plain(h), center: !!st2.c });
    }
    return { title: title, author: author, format: 'ODT', chapters: buildChapters(blocks, title) };
  }

  /* ---------- EPUB ---------- */
  function resolve(base, rel) {
    rel = decodeURIComponent(String(rel).split('#')[0]);
    if (rel.charAt(0) === '/') return rel.slice(1);
    var parts = base.split('/'); parts.pop();
    rel.split('/').forEach(function (seg) {
      if (seg === '..') parts.pop();
      else if (seg && seg !== '.') parts.push(seg);
    });
    return parts.join('/');
  }
  var MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };

  async function parseEpub(buf, name) {
    var zip = KZip.open(buf);
    var cont = await zip.text('META-INF/container.xml');
    if (!cont) throw new Error('BAD_EPUB');
    var rf = xml(cont).getElementsByTagName('rootfile')[0];
    var opfPath = rf.getAttribute('full-path');
    var opf = xml(await zip.text(opfPath));
    function first(tag) {
      var e = opf.getElementsByTagName(tag)[0] || opf.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', tag.replace(/^dc:/, ''))[0];
      return e ? e.textContent.trim() : '';
    }
    var title = first('dc:title') || baseName(name);
    var author = first('dc:creator');
    var items = {};
    var its = opf.getElementsByTagName('item');
    for (var i = 0; i < its.length; i++) items[its[i].getAttribute('id')] = its[i].getAttribute('href');
    var spine = opf.getElementsByTagName('itemref');
    var chapters = [];
    var imgBudget = 6 * 1024 * 1024;

    async function walk(node, docPath, out) {
      for (var c = node.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) { out.push(esc(c.nodeValue)); continue; }
        if (c.nodeType !== 1) continue;
        var t = c.localName.toLowerCase();
        if (t === 'script' || t === 'style' || t === 'head' || t === 'nav' && false) continue;
        if (t === 'img' || t === 'image') {
          var src = c.getAttribute('src') || c.getAttribute('xlink:href') || c.getAttribute('href');
          if (!src) continue;
          var path = resolve(docPath, src);
          var ext = (path.split('.').pop() || '').toLowerCase();
          var data = MIME[ext] ? await zip.bytes(path) : null;
          if (data && data.length <= imgBudget && data.length < 1500000) {
            imgBudget -= data.length;
            out.push('<img alt="' + esc(c.getAttribute('alt') || '') + '" src="data:' + MIME[ext] + ';base64,' + b64(data) + '">');
          }
          continue;
        }
        if (t === 'br') { out.push('<br>'); continue; }
        if (t === 'hr') { out.push('<hr>'); continue; }
        var map = { p: 'p', h1: 'h2', h2: 'h3', h3: 'h3', h4: 'h4', h5: 'h4', h6: 'h4', blockquote: 'blockquote', li: 'li', ul: 'ul', ol: 'ol', em: 'em', i: 'em', strong: 'strong', b: 'strong', sup: 'sup', sub: 'sub' };
        var tag = map[t];
        if (tag) out.push('<' + tag + '>');
        await walk(c, docPath, out);
        if (tag) out.push('</' + tag + '>');
      }
    }

    for (var s = 0; s < spine.length; s++) {
      var href = items[spine[s].getAttribute('idref')];
      if (!href) continue;
      var path = resolve(opfPath, href);
      var src = await zip.text(path);
      if (!src) continue;
      var d = xml(src, 'application/xhtml+xml');
      if (d.getElementsByTagName('parsererror').length) d = xml(src, 'text/html');
      var body = d.getElementsByTagName('body')[0];
      if (!body) continue;
      var out = [];
      await walk(body, path, out);
      var html = out.join('');
      var hasText = html.replace(/<[^>]+>/g, '').trim().length > 0;
      if (!hasText && html.indexOf('<img') < 0) continue;
      var hEl = body.querySelector('h1,h2,h3');
      var ct = hEl && hEl.textContent.trim();
      if (!ct) { var te = d.getElementsByTagName('title')[0]; ct = te && te.textContent.trim(); }
      if (!ct || ct.length > 80) ct = 'অংশ ' + bn(chapters.length + 1);
      if (!/<(p|h2|h3|h4|li|blockquote)>/.test(html)) html = '<p>' + html + '</p>';
      chapters.push({ title: ct, html: html });
    }
    if (!chapters.length) throw new Error('EMPTY');
    return { title: title, author: author, format: 'EPUB', chapters: chapters };
  }

  /* ---------- TXT / MD ---------- */
  function parseText(buf, name) {
    var u = new Uint8Array(buf);
    var str;
    if (u[0] === 0xFF && u[1] === 0xFE) str = new TextDecoder('utf-16le').decode(u);
    else if (u[0] === 0xFE && u[1] === 0xFF) str = new TextDecoder('utf-16be').decode(u);
    else str = new TextDecoder('utf-8').decode(u);
    str = str.replace(/^﻿/, '');
    var blocks = [];
    str.split(/\r?\n/).forEach(function (line) {
      var t = line.trim();
      if (!t) return;
      var m = /^(#{1,3})\s+(.*)$/.exec(t);
      if (m) blocks.push({ kind: 'h', level: m[1].length, html: esc(m[2]), text: m[2] });
      else blocks.push({ kind: 'p', html: esc(t), text: t });
    });
    var title = baseName(name);
    return { title: title, author: '', format: 'TXT', chapters: buildChapters(blocks, title) };
  }

  async function parse(buf, name) {
    var ext = (String(name).split('.').pop() || '').toLowerCase();
    var u = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
    var isZip = u[0] === 0x50 && u[1] === 0x4B;
    if (isZip) {
      var zip = KZip.open(buf);
      if (zip.has('word/document.xml')) return parseDocx(buf, name);
      if (zip.has('META-INF/container.xml')) return parseEpub(buf, name);
      if (zip.has('content.xml')) return parseOdt(buf, name);
      throw new Error('UNKNOWN');
    }
    if (ext === 'txt' || ext === 'md' || ext === 'text') return parseText(buf, name);
    if (ext === 'doc' || ext === 'pdf' || ext === 'rtf') throw new Error('UNSUPPORTED');
    return parseText(buf, name);
  }

  g.KParse = { parse: parse, bn: bn, esc: esc };
})(typeof window !== 'undefined' ? window : globalThis);
