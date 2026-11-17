/* কল্পক রিডার — দেবনাগরী ও ইংরেজি হরফকে বাংলা হরফে আনা, যাতে একই বাংলা কণ্ঠ পড়তে পারে */
(function (g) {
  'use strict';

  /* ---------- দেবনাগরী → বাংলা ---------- */
  var DEV = {
    0x0935: 'ব', 0x0933: 'ল', 0x0934: 'ল', 0x0929: 'ন', 0x0931: 'র',
    0x090D: 'এ', 0x090E: 'এ', 0x0911: 'অ', 0x0912: 'ও', 0x0904: 'অ',
    0x0945: 'ে', 0x0946: 'ে', 0x0949: '', 0x094A: 'ো',
    0x093D: '', 0x0950: 'ওঁ', 0x0960: 'ঋ', 0x0944: 'ৃ', 0x0961: 'লি', 0x090C: 'লি',
    0x0958: 'ক', 0x0959: 'খ', 0x095A: 'গ', 0x095B: 'জ', 0x095C: 'ড়', 0x095D: 'ঢ়', 0x095E: 'ফ', 0x095F: 'য়',
    0x0964: '।', 0x0965: '।', 0x0970: '', 0x0971: '', 0x093A: '', 0x093B: '', 0x094E: '', 0x094F: ''
  };
  function devanagari(text) {
    if (!/[ऀ-ॿ]/.test(text)) return text;
    text = text.replace(/ड़/g, 'ড়').replace(/ढ़/g, 'ঢ়').replace(/़/g, '');
    var out = '';
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if (c < 0x0900 || c > 0x097F) { out += text[i]; continue; }
      if (c === 0x092F) {
        /* য: শব্দের শুরুতে বা যুক্তাক্ষরে য, অন্যত্র য় */
        var prev = out.charAt(out.length - 1);
        out += (!prev || !/[ঀ-৿]/.test(prev) || prev === '্') ? 'য' : 'য়';
        continue;
      }
      if (DEV.hasOwnProperty(c)) { out += DEV[c]; continue; }
      if (c >= 0x0951 && c <= 0x0957) continue; /* বৈদিক স্বরচিহ্ন */
      out += String.fromCharCode(c + 0x80);
    }
    return out;
  }

  /* ---------- ইংরেজি → বাংলা ---------- */
  var LETTER = { a: 'এ', b: 'বি', c: 'সি', d: 'ডি', e: 'ই', f: 'এফ', g: 'জি', h: 'এইচ', i: 'আই', j: 'জে', k: 'কে', l: 'এল', m: 'এম', n: 'এন', o: 'ও', p: 'পি', q: 'কিউ', r: 'আর', s: 'এস', t: 'টি', u: 'ইউ', v: 'ভি', w: 'ডাব্লিউ', x: 'এক্স', y: 'ওয়াই', z: 'জেড' };
  var DICT = {};
  ('the দ্য|a এ|an অ্যান|of অফ|and অ্যান্ড|to টু|in ইন|is ইজ|it ইট|you ইউ|that দ্যাট|he হি|she শি|was ওয়াজ|for ফর|on অন|are আর|with উইথ|as অ্যাজ|i আই|his হিজ|they দে|be বি|at অ্যাট|one ওয়ান|have হ্যাভ|this দিস|from ফ্রম|or অর|had হ্যাড|by বাই|not নট|but বাট|what হোয়াট|all অল|were ওয়্যার|we উই|when হোয়েন|your ইয়োর|can ক্যান|said সেড|there দেয়ার|their দেয়ার|which হুইচ|do ডু|does ডাজ|did ডিড|how হাউ|if ইফ|will উইল|up আপ|other আদার|about অ্যাবাউট|out আউট|many মেনি|then দেন|them দেম|these দিজ|those দোজ|so সো|some সাম|her হার|would উড|could কুড|should শুড|make মেক|like লাইক|him হিম|into ইনটু|time টাইম|has হ্যাজ|look লুক|two টু|more মোর|go গো|see সি|no নো|yes ইয়েস|way ওয়ে|people পিপল|my মাই|me মি|than দ্যান|first ফার্স্ট|been বিন|who হু|now নাউ|find ফাইন্ড|long লং|down ডাউন|day ডে|get গেট|give গিভ|come কাম|made মেড|may মে|part পার্ট|over ওভার|new নিউ|after আফটার|work ওয়ার্ক|know নো|take টেক|only ওনলি|little লিটল|year ইয়ার|good গুড|very ভেরি|just জাস্ট|name নেম|great গ্রেট|where হোয়্যার|through থ্রু|much মাচ|before বিফোর|right রাইট|too টু|any এনি|same সেম|want ওয়ান্ট|here হিয়ার|why হোয়াই|ask আস্ক|went ওয়েন্ট|men মেন|man ম্যান|woman উওম্যান|read রিড|need নিড|world ওয়ার্ল্ড|life লাইফ|light লাইট|night নাইট|love লাভ|hello হ্যালো|ok ওকে|okay ওকে|please প্লিজ|thank থ্যাংক|thanks থ্যাংকস|sorry সরি|mr মিস্টার|mrs মিসেস|dr ডক্টর|sir স্যার|one ওয়ান|three থ্রি|four ফোর|five ফাইভ|six সিক্স|seven সেভেন|eight এইট|nine নাইন|ten টেন|water ওয়াটার|mother মাদার|father ফাদার|friend ফ্রেন্ড|house হাউস|school স্কুল|phone ফোন|computer কম্পিউটার|internet ইন্টারনেট|email ইমেল|system সিস্টেম|error এরর|file ফাইল|data ডেটা|online অনলাইন|offline অফলাইন|video ভিডিও|audio অডিও|game গেম|power পাওয়ার|human হিউম্যান|machine মেশিন|science সায়েন্স|fiction ফিকশন|project প্রজেক্ট|loading লোডিং|incoming ইনকামিং|left লেফট|high হাই|low লো|kill কিল|switch সুইচ|bridge ব্রিজ|glitch গ্লিচ|channel চ্যানেল|log লগ|implant ইমপ্ল্যান্ট|confirmed কনফার্মড|running রানিং|place প্লেস|chapter চ্যাপ্টার|page পেজ|book বুক|story স্টোরি|end এন্ড|start স্টার্ট|stop স্টপ|open ওপেন|close ক্লোজ|move মুভ|dont ডোন্ট|cant কান্ট|wont ওন্ট|language ল্যাঙ্গুয়েজ|beautiful বিউটিফুল|because বিকজ|enough এনাফ|laugh লাফ|orange অরেঞ্জ|india ইন্ডিয়া|indian ইন্ডিয়ান|kolkata কলকাতা|bengal বেঙ্গল|bengali বেঙ্গলি|english ইংলিশ|google গুগল|facebook ফেসবুক|whatsapp হোয়াটসঅ্যাপ|youtube ইউটিউব|mobile মোবাইল|android অ্যান্ড্রয়েড|app অ্যাপ|nasa নাসা|hero হিরো|blue ব্লু|true ট্রু|picture পিকচার|future ফিউচার|nature নেচার|doctor ডক্টর|number নাম্বার|sister সিস্টার|brother ব্রাদার|every এভরি|never নেভার|always অলওয়েজ|again এগেন|today টুডে|tomorrow টুমরো|black ব্ল্যাক|white হোয়াইট|dark ডার্ক|dead ডেড|death ডেথ|fear ফিয়ার|ghost গোস্ট|blood ব্লাড|door ডোর|room রুম|road রোড|car কার|train ট্রেন|station স্টেশন|police পুলিশ|office অফিস|college কলেজ|university ইউনিভার্সিটি|hospital হসপিটাল')
    .split('|').forEach(function (p) { var k = p.indexOf(' '); DICT[p.slice(0, k)] = p.slice(k + 1); });

  /* [ধরন, বাংলা]  ধরন: C ব্যঞ্জন, V স্বর (স্বাধীন রূপ|কার), L তৈরি টুকরো, G অর্ধস্বর (ওয়/ইয়) */
  var RULES = [
    ['tion', 'L', 'শন'], ['sion', 'L', 'শন'], ['ture', 'L', 'চার'], ['eigh', 'V', 'এ|ে'], ['igh', 'V', 'আই|াই'], ['ough', 'V', 'ও|ো'],
    ['tch', 'C', 'চ'], ['sch', 'CC', 'স,ক'], ['ch', 'C', 'চ'], ['sh', 'C', 'শ'], ['th', 'C', 'থ'], ['ph', 'C', 'ফ'], ['ck', 'C', 'ক'], ['ng', 'L', 'ং'], ['qu', 'CV', 'ক,উ|ু'], ['wh', 'G', 'হো'],
    ['oo', 'V', 'উ|ু'], ['ee', 'V', 'ঈ|ী'], ['ea', 'V', 'ঈ|ী'], ['ai', 'V', 'এ|ে'], ['ay', 'V', 'এ|ে'], ['ei', 'V', 'এ|ে'], ['ey', 'V', 'এ|ে'], ['oa', 'V', 'ও|ো'], ['ou', 'V', 'আউ|াউ'], ['ow', 'V', 'আউ|াউ'],
    ['oi', 'V', 'অয়|য়'], ['oy', 'V', 'অয়|য়'], ['au', 'V', 'অ|'], ['aw', 'V', 'অ|'], ['ie', 'V', 'ঈ|ী'], ['ue', 'V', 'ইউ|িউ'], ['ew', 'V', 'ইউ|িউ'],
    ['ar', 'VC', 'আ|া,র'], ['er', 'VC', 'আ|া,র'], ['ir', 'VC', 'আ|া,র'], ['ur', 'VC', 'আ|া,র'], ['or', 'VC', 'অ|,র'],
    ['b', 'C', 'ব'], ['d', 'C', 'ড'], ['f', 'C', 'ফ'], ['h', 'C', 'হ'], ['j', 'C', 'জ'], ['k', 'C', 'ক'], ['l', 'C', 'ল'], ['m', 'C', 'ম'], ['n', 'C', 'ন'], ['p', 'C', 'প'], ['q', 'C', 'ক'], ['r', 'C', 'র'], ['s', 'C', 'স'], ['t', 'C', 'ট'], ['v', 'C', 'ভ'], ['z', 'C', 'জ'], ['x', 'CC', 'ক,স'],
    ['a', 'V', 'অ্যা|্যা'], ['e', 'V', 'এ|ে'], ['i', 'V', 'ই|ি'], ['o', 'V', 'অ|'], ['u', 'V', 'আ|া']
  ];
  var MAGIC = { a: 'এ|ে', i: 'আই|াই', o: 'ও|ো', u: 'ইউ|িউ', e: 'ঈ|ী', y: 'আই|াই' };

  function word(w) {
    var lower = w.toLowerCase().replace(/'/g, '');
    if (!lower) return '';
    if (DICT[lower]) return DICT[lower];
    if (lower.length === 1 || (w.length <= 5 && w === w.toUpperCase() && /^[A-Z]+$/.test(w))) {
      return lower.split('').map(function (c) { return LETTER[c]; }).join(' ');
    }
    if (lower.length > 3 && lower.charAt(lower.length - 1) === 's' && DICT[lower.slice(0, -1)]) return DICT[lower.slice(0, -1)] + 'স';
    var s = lower.replace(/^kn/, 'n').replace(/^wr/, 'r').replace(/^ps/, 's').replace(/mb$/, 'm').replace(/([a-z])\1/g, function (m, c) { return 'aeiou'.indexOf(c) >= 0 ? m : c; });
    var items = [];
    s = s.replace(/ation/g, 'eition').replace(/([^aeiou])le$/, '$1ol').replace(/nge$/, 'nj');
    var magic = /(ture|[^aeiou]re)$/.test(s) ? null : /^(.*[^aeiou])?([aeiouy])([^aeiouwy])e$/.exec(s);
    var magicAt = -1;
    if (magic) { s = s.slice(0, -1); magicAt = s.length - 2; }
    var i = 0;
    while (i < s.length) {
      var ch = s.charAt(i), nx = s.charAt(i + 1);
      if (i === magicAt) { items.push(['V', MAGIC[ch]]); i++; continue; }
      if (ch === 'c' && nx !== 'h' && nx !== 'k') { items.push(['C', 'eiy'.indexOf(nx) >= 0 && nx ? 'স' : 'ক']); i++; continue; }
      if (ch === 'g') {
        if (nx === 'h') { if (i === 0) items.push(['C', 'গ']); i += 2; continue; }
        items.push(['C', 'eiy'.indexOf(nx) >= 0 && nx ? 'জ' : 'গ']); i++; continue;
      }
      if (ch === 'w') {
        if (nx === 'i') items.push(items.length && items[items.length - 1][0] === 'C' ? ['V', 'উ|ু'] : ['U', 'উ']);
        else if (nx && 'aeou'.indexOf(nx) >= 0) items.push(items.length && items[items.length - 1][0] === 'C' ? ['V', 'উ|ু'] : ['G', 'ও']);
        i++; continue;
      }
      if (ch === 'y') {
        if (i === 0 && nx) items.push(['G', 'ই']);
        else if (i === s.length - 1) items.push(['V', s.length <= 3 ? 'আই|াই' : 'ই|ি']);
        else items.push(['V', 'ই|ি']);
        i++; continue;
      }
      if (ch === 'e' && i === s.length - 1 && s.length > 2 && items.length && items[items.length - 1][0] !== 'V') { i++; continue; } /* শেষের নীরব e */
      if (ch === 'o' && i === s.length - 1) { items.push(['V', 'ও|ো']); i++; continue; }
      if (ch === 'a' && i === s.length - 1 && s.length > 1) { items.push(['V', 'আ|া']); i++; continue; }
      if (s.substr(i, 2) === 'ow' && i === s.length - 2) { items.push(['V', 'ও|ো']); i += 2; continue; }
      if (s.substr(i, 2) === 'ng' && i + 2 < s.length && 'aeiouy'.indexOf(s.charAt(i + 2)) >= 0) { items.push(['C', 'ঙ']); items.push(['C', 'গ']); i += 2; continue; }
      var hit = null;
      for (var r = 0; r < RULES.length; r++) { if (s.substr(i, RULES[r][0].length) === RULES[r][0]) { hit = RULES[r]; break; } }
      if (!hit) { i++; continue; }
      if (hit[1].length === 1) items.push([hit[1], hit[2]]);
      else { var parts = hit[2].split(','); for (var k = 0; k < parts.length; k++) items.push([hit[1].charAt(k), parts[k]]); }
      i += hit[0].length;
    }
    /* জোড়া লাগানো */
    var out = '';
    var prev = '';
    for (var n = 0; n < items.length; n++) {
      var t = items[n][0], v = items[n][1];
      if (t === 'C') { out += (prev === 'C' ? '্' : '') + v; prev = 'C'; }
      else if (t === 'L') { out += v; prev = v === 'ং' ? 'L' : 'C'; }
      else if (t === 'G') { out += v + 'য়'; prev = 'C'; }
      else if (t === 'U') { out += v; prev = 'V'; }
      else {
        var f = v.split('|');
        if (prev === 'V' && (f[0] === 'অ্যা' || f[0] === 'আ')) out += 'য়া';
        else out += (prev === 'C') ? f[1] : f[0];
        prev = 'V';
      }
    }
    return out;
  }

  function latin(text) {
    if (!/[A-Za-z]/.test(text)) return text;
    return text.replace(/[A-Za-z]+(?:['’][A-Za-z]+)?/g, function (m) { return ' ' + word(m.replace('’', "'")) + ' '; });
  }

  g.KTranslit = { devanagari: devanagari, latin: latin, word: word };
})(typeof window !== 'undefined' ? window : globalThis);
