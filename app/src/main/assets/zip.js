/* কল্পক রিডার — ছোট ZIP পাঠক (DOCX, ODT, EPUB খোলার জন্য) */
(function (g) {
  'use strict';
  var dec = new TextDecoder('utf-8');

  async function inflate(data) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('WEBVIEW_OLD');
    }
    var ds = new DecompressionStream('deflate-raw');
    var stream = new Blob([data]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function open(buffer) {
    var u = new Uint8Array(buffer);
    var dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
    var eocd = -1;
    var min = Math.max(0, u.length - 65557);
    for (var i = u.length - 22; i >= min; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('NOT_ZIP');
    var count = dv.getUint16(eocd + 10, true);
    var p = dv.getUint32(eocd + 16, true);
    var entries = {};
    var names = [];
    for (var n = 0; n < count; n++) {
      if (p + 46 > u.length || dv.getUint32(p, true) !== 0x02014b50) break;
      var method = dv.getUint16(p + 10, true);
      var csize = dv.getUint32(p + 20, true);
      var nlen = dv.getUint16(p + 28, true);
      var elen = dv.getUint16(p + 30, true);
      var clen = dv.getUint16(p + 32, true);
      var lho = dv.getUint32(p + 42, true);
      var name = dec.decode(u.subarray(p + 46, p + 46 + nlen));
      entries[name] = { method: method, csize: csize, lho: lho };
      names.push(name);
      p += 46 + nlen + elen + clen;
    }

    async function bytes(name) {
      var e = entries[name];
      if (!e) return null;
      var nlen = dv.getUint16(e.lho + 26, true);
      var elen = dv.getUint16(e.lho + 28, true);
      var start = e.lho + 30 + nlen + elen;
      var data = u.subarray(start, start + e.csize);
      if (e.method === 0) return data;
      if (e.method === 8) return inflate(data);
      throw new Error('ZIP_METHOD');
    }
    async function text(name) {
      var b = await bytes(name);
      return b ? dec.decode(b) : null;
    }
    return {
      names: names,
      has: function (n) { return !!entries[n]; },
      bytes: bytes,
      text: text
    };
  }

  g.KZip = { open: open };
})(typeof window !== 'undefined' ? window : globalThis);
