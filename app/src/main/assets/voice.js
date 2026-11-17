/* কল্পক রিডার — ভারতীয় বাংলা কণ্ঠের জন্য লেখা প্রস্তুত করা (সংখ্যা কথায়, চিহ্ন বদল) */
(function (g) {
  'use strict';
  var W = ('শূন্য এক দুই তিন চার পাঁচ ছয় সাত আট নয় দশ ' +
    'এগারো বারো তেরো চৌদ্দ পনেরো ষোলো সতেরো আঠারো উনিশ কুড়ি ' +
    'একুশ বাইশ তেইশ চব্বিশ পঁচিশ ছাব্বিশ সাতাশ আঠাশ উনত্রিশ ত্রিশ ' +
    'একত্রিশ বত্রিশ তেত্রিশ চৌত্রিশ পঁয়ত্রিশ ছত্রিশ সাঁইত্রিশ আটত্রিশ উনচল্লিশ চল্লিশ ' +
    'একচল্লিশ বিয়াল্লিশ তেতাল্লিশ চুয়াল্লিশ পঁয়তাল্লিশ ছেচল্লিশ সাতচল্লিশ আটচল্লিশ উনপঞ্চাশ পঞ্চাশ ' +
    'একান্ন বাহান্ন তিপ্পান্ন চুয়ান্ন পঞ্চান্ন ছাপ্পান্ন সাতান্ন আটান্ন উনষাট ষাট ' +
    'একষট্টি বাষট্টি তেষট্টি চৌষট্টি পঁয়ষট্টি ছেষট্টি সাতষট্টি আটষট্টি উনসত্তর সত্তর ' +
    'একাত্তর বাহাত্তর তিয়াত্তর চুয়াত্তর পঁচাত্তর ছিয়াত্তর সাতাত্তর আটাত্তর উনআশি আশি ' +
    'একাশি বিরাশি তিরাশি চুরাশি পঁচাশি ছিয়াশি সাতাশি আটাশি উননব্বই নব্বই ' +
    'একানব্বই বিরানব্বই তিরানব্বই চুরানব্বই পঁচানব্বই ছিয়ানব্বই সাতানব্বই আটানব্বই নিরানব্বই').split(' ');
  var H = ['', 'একশো', 'দুশো', 'তিনশো', 'চারশো', 'পাঁচশো', 'ছশো', 'সাতশো', 'আটশো', 'নশো'];

  function below1000(n) {
    var out = [];
    if (n >= 100) { out.push(H[Math.floor(n / 100)]); n %= 100; }
    if (n > 0) out.push(W[n]);
    return out.join(' ');
  }
  function words(n) {
    if (n === 0) return W[0];
    if (n >= 1100 && n <= 1999 && n % 100 !== n) {
      /* সাল বা এই মাপের সংখ্যা: উনিশশো সাতচল্লিশ */
      var rest = n % 100;
      return W[Math.floor(n / 100)] + 'শো' + (rest ? ' ' + W[rest] : '');
    }
    var out = [];
    var crore = Math.floor(n / 10000000); n %= 10000000;
    var lakh = Math.floor(n / 100000); n %= 100000;
    var hazar = Math.floor(n / 1000); n %= 1000;
    if (crore) out.push(words(crore) + ' কোটি');
    if (lakh) out.push(W[lakh] + ' লক্ষ');
    if (hazar) out.push(W[hazar] + ' হাজার');
    if (n) out.push(below1000(n));
    return out.join(' ');
  }
  function ascii(d) { return d.replace(/[০-৯]/g, function (c) { return '০১২৩৪৫৬৭৮৯'.indexOf(c); }); }
  function number(str) {
    var d = ascii(str);
    if (d.length > 9 || (d.length > 1 && d.charAt(0) === '0')) {
      return d.split('').map(function (c) { return W[+c]; }).join(' ');
    }
    return words(parseInt(d, 10));
  }

  function norm(text) {
    var t = String(text || '');
    t = t.replace(/[“”„«»]/g, '"').replace(/[‚`´]/g, '’').replace(/…+|\.{2,}/g, ', ').replace(/[–―]/g, '—').replace(/৷/g, '।');
    t = t.replace(/([০-৯0-9]+)[.,]([০-৯0-9]+)/g, function (m, a, b) {
      return number(a) + ' দশমিক ' + ascii(b).split('').map(function (c) { return W[+c]; }).join(' ');
    });
    t = t.replace(/[০-৯0-9]+/g, function (m) { return number(m); });
    t = t.replace(/%/g, ' শতাংশ ').replace(/&/g, ' ও ').replace(/[*_#~|\\/=+^]/g, ' ');
    return t.replace(/\s+/g, ' ').trim();
  }

  g.KVoice = { norm: norm, words: words };
})(typeof window !== 'undefined' ? window : globalThis);
