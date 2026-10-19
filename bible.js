/* =====================================================================
   DV-NOTE PLUS — BIBLE MODULE (King James Version, 66 books)
   Independent module: delete this file and its script tag and the app
   keeps working (the Bible button simply disappears).
   Reads kjv.json (getbible v2 shape: books > chapters > verses > text)
   from the same folder, cleans it once, and stores it in IndexedDB.
   Deep links: index.html#bible=john-3   #bible=matthew   #bible=1-corinthians-13
   ===================================================================== */
(function () {
  try {
    /* ===== BOOK DATA (canonical order) ===== */
    var bookNames = ['Genesis','Exodus','Leviticus','Numbers','Deuteronomy','Joshua','Judges','Ruth','1 Samuel','2 Samuel','1 Kings','2 Kings','1 Chronicles','2 Chronicles','Ezra','Nehemiah','Esther','Job','Psalms','Proverbs','Ecclesiastes','Song of Solomon','Isaiah','Jeremiah','Lamentations','Ezekiel','Daniel','Hosea','Joel','Amos','Obadiah','Jonah','Micah','Nahum','Habakkuk','Zephaniah','Haggai','Zechariah','Malachi','Matthew','Mark','Luke','John','Acts','Romans','1 Corinthians','2 Corinthians','Galatians','Ephesians','Philippians','Colossians','1 Thessalonians','2 Thessalonians','1 Timothy','2 Timothy','Titus','Philemon','Hebrews','James','1 Peter','2 Peter','1 John','2 John','3 John','Jude','Revelation'];
    var chapCounts = [50,40,27,36,34,24,21,4,31,24,22,25,29,36,10,13,10,42,150,31,12,8,66,52,5,48,12,14,3,9,1,4,7,3,3,3,2,14,4,28,16,24,21,28,16,16,13,6,6,4,4,5,3,6,4,3,1,13,5,5,3,5,1,1,1,22];
    var slugs = bookNames.map(function (n) { return n.toLowerCase().replace(/ /g, '-'); });
    var slugIdx = {};
    slugs.forEach(function (s, i) { slugIdx[s] = i; });

    /* ===== STATE ===== */
    var DATA = null, LIST = [], SHOWN = 0, SRCH = null;
    var BI = 0, CI = 0, HL = 0, MODE = 'chapter', SEL = [], SHARE = null;

    /* ===== HELPERS ===== */
    function Q(s) { return document.querySelector(s); }
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function clean(v) { return String(v).replace(/\{[HG]\d+\}/g, '').replace(/[{}]/g, '').replace(/<[^>]*>/g, '').replace(/\u00B6/g, '').replace(/\[/g, '').replace(/\]/g, '').replace(/\b[HG]\d{1,4}\b/g, '').replace(/\s+/g, ' ').trim(); }
    function slugOf(bi, ci) { return (typeof ci === 'number') ? slugs[bi] + '-' + (ci + 1) : slugs[bi]; }
    function baseUrl() { return window.location.origin + window.location.pathname; }
    function linkFor(s) { return baseUrl() + '#bible=' + s; }
    function T(m, t) { if (typeof showToast === 'function') showToast(m, t || 'info'); }
    function chCount(bi) { return DATA ? DATA[bi].c.length : chapCounts[bi]; }

    /* ===== STORAGE (own database, filled once from kjv.json) ===== */
    function openDB() {
      return new Promise(function (res, rej) {
        var r = indexedDB.open('dvNoteBibleKJV', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('b'); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(); };
      });
    }
    function getStored() {
      return openDB().then(function (db) {
        return new Promise(function (res, rej) {
          var q = db.transaction('b').objectStore('b').get('kjv');
          q.onsuccess = function () { res(q.result || null); };
          q.onerror = function () { rej(); };
        });
      });
    }
    function putStored(d) {
      return openDB().then(function (db) {
        return new Promise(function (res, rej) {
          var q = db.transaction('b', 'readwrite').objectStore('b').put(d, 'kjv');
          q.onsuccess = function () { res(); };
          q.onerror = function () { rej(); };
        });
      });
    }

    /* ===== HIGHLIGHT COLOURS (gold default) ===== */
    var hlColors = [
      { n: 'Gold', c: '#FFD700', t: '#000' },
      { n: 'Light Gold', c: '#FFE88C', t: '#000' },
      { n: 'Yellow', c: '#FFFF4D', t: '#000' },
      { n: 'Green', c: '#8EE59B', t: '#000' },
      { n: 'Sky', c: '#8FD3FF', t: '#000' },
      { n: 'Pink', c: '#FFB3D1', t: '#000' },
      { n: 'Orange', c: '#FFB066', t: '#000' },
      { n: 'Light Dark', c: '#5A5F66', t: '#fff' }
    ];
    var hlIdx = 0, hlMap = {};
    try { hlIdx = Math.min(hlColors.length - 1, Math.max(0, +localStorage.getItem('dvBibleColor') || 0)); } catch (e) {}
    try { hlMap = JSON.parse(localStorage.getItem('dvBibleHl') || '{}') || {}; } catch (e) { hlMap = {}; }
    function hlPersist() { try { localStorage.setItem('dvBibleHl', JSON.stringify(hlMap)); } catch (e) {} }
    function hlCSS() {
      var s = '.bib-v.bib-on{box-shadow:inset 0 0 0 3px var(--primary)}';
      hlColors.forEach(function (k, i) {
        s += '.bib-v.bib-c' + i + '{background:' + k.c + ';color:' + k.t + ';border-left-color:' + k.t + '}';
        s += '.bib-v.bib-c' + i + ' b{color:' + k.t + '}';
      });
      s += '.bib-v.bib-hl{background:#FFD700;color:#000;border-left-color:#000}.bib-v.bib-hl b{color:#000}';
      return s;
    }

    /* ===== STYLES (never below the 19px floor, no max-width, no breakpoints) ===== */
    var css =
      '#modalBible [hidden],#modalBibleShare [hidden]{display:none !important}' +
      '#modalBibleShare{z-index:2300}' +
      '.bib-body{display:flex;flex-direction:column;gap:8px;flex:1 0 auto}' +
      '#bibRead{display:flex;flex-direction:column;gap:8px}' +
      '.bib-card{background:var(--surface);border-top:2px solid var(--border);border-bottom:2px solid var(--border);padding:16px;display:flex;flex-direction:column;gap:12px}' +
      '.bib-row{display:flex;align-items:center;gap:10px}' +
      '.bib-row .primary-btn,.bib-row .secondary-btn{flex:1;width:auto}' +
      '.bib-sel{flex:1;min-width:0;padding:12px;border:2px solid var(--border);border-radius:12px;background:var(--surface-alt);color:var(--text-main);font-weight:700;min-height:52px}' +
      '.bib-a{font-weight:700;color:var(--text-muted)}' +
      '#bibSize{flex:1;accent-color:var(--primary)}' +
      '.bib-find{width:100%;padding:12px 16px;border:2px solid var(--border);border-radius:12px;background:var(--surface-alt);color:var(--text-main)}' +
      '.bib-head{font-size:calc(var(--font-size) + 4px);font-weight:800;color:var(--text-main)}' +
      '.bib-hint{color:var(--text-muted);line-height:1.5}' +
      '.bib-text{font-family:Georgia,"Times New Roman",serif}' +
      '.bib-v{font-size:var(--bs,23px);line-height:1.7;color:var(--text-main);margin-bottom:6px;padding:4px 8px;border-radius:8px;cursor:pointer;border-left:4px solid transparent}' +
      '.bib-v b{color:var(--primary);margin-right:6px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}' +
      hlCSS() +
      '.bib-ref{display:block;font-weight:800;color:var(--primary);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}' +
      '.bib-credit{text-align:center;color:var(--text-muted);padding-top:6px}' +
      '.bib-selbar{position:sticky;bottom:0;margin-top:auto;z-index:5;flex-shrink:0;background:var(--surface);border-top:2px solid var(--border);box-shadow:0 -2px 12px rgba(0,0,0,0.25);padding:10px 12px;display:flex;flex-direction:column;gap:8px}' +
      '.bib-selrow{display:flex;align-items:center;gap:8px}' +
      '.bib-selrow .primary-btn,.bib-selrow .secondary-btn{flex:1;width:auto;padding:10px 8px}' +
      '.bib-selrow span{flex:1;font-weight:800;color:var(--text-main)}' +
      '#bibSelClear{flex:none;padding:8px 18px}' +
      '.bib-sw{display:flex;gap:6px;justify-content:space-between;width:100%}' +
      '.bib-swb{width:34px;height:34px;flex:none;border-radius:50%;border:3px solid transparent;cursor:pointer;padding:0}' +
      '.bib-swb.bib-act{border-color:var(--text-main)}' +
      '.bib-prev{background:var(--surface);border-top:2px solid var(--border);border-bottom:2px solid var(--border);padding:16px;line-height:1.5;display:flex;flex-direction:column;gap:8px;overflow-wrap:anywhere}' +
      '.bib-prev span{color:var(--primary);font-weight:700}' +
      '.bib-opt{display:flex;align-items:center;gap:14px;width:100%;text-align:left;padding:16px;background:var(--surface);color:var(--text-main);border:0;border-bottom:2px solid var(--border);font-weight:700;cursor:pointer}' +
      '.bib-opt:active{background:var(--surface-alt)}' +
      '.bib-opt svg{flex-shrink:0}' +
      '.bib-wa{color:#25d366}.bib-fb{color:#1877f2}.bib-tw{color:var(--text-main)}.bib-nat{color:var(--primary)}' +
      '.bib-exit{width:100%;padding:16px;background:var(--surface-alt);color:var(--danger);border:0;font-weight:800;cursor:pointer}';
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);

    /* ===== ICONS ===== */
    var icoShare = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>';
    var icoShareSm = icoShare.replace('width="26" height="26"', 'width="22" height="22"');
    var icoCopy = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    var icoImg = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
    var icoWa = '<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';
    var icoFb = '<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>';
    var icoTw = '<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg>';

    /* ===== MARKUP ===== */
    var html =
      '<div id="modalBible" class="fullscreen-modal" role="dialog" aria-modal="true">' +
        '<header class="modal-header"><h2>Holy Bible (KJV)</h2><button class="close-modal-btn" id="bibClose">Close</button></header>' +
        '<div class="bib-body">' +
          '<div class="bib-card" id="bibGet">' +
            '<p class="bib-hint" id="bibMsg">Loading the Bible...</p>' +
            '<button class="primary-btn" id="bibRetry" hidden>Retry</button>' +
          '</div>' +
          '<div id="bibRead" hidden>' +
            '<div class="bib-card">' +
              '<div class="bib-row">' +
                '<select id="bibBook" class="bib-sel" aria-label="Book"></select>' +
                '<select id="bibCh" class="bib-sel" aria-label="Chapter"></select>' +
              '</div>' +
              '<div class="bib-row">' +
                '<button class="secondary-btn" id="bibPrev">&#8249; Prev</button>' +
                '<button class="secondary-btn" id="bibNext">Next &#8250;</button>' +
              '</div>' +
              '<div class="bib-row">' +
                '<span class="bib-a">A</span>' +
                '<input type="range" id="bibSize" min="23" max="26" step="1" value="23" aria-label="Text size">' +
                '<span class="bib-a">A+</span>' +
              '</div>' +
              '<div class="bib-row">' +
                '<button class="primary-btn" id="bibShareBook">' + icoShareSm + '<span>Share Book</span></button>' +
                '<button class="primary-btn" id="bibShareCh">' + icoShareSm + '<span>Share Chapter</span></button>' +
              '</div>' +
              '<input id="bibFind" class="bib-find" type="text" inputmode="search" autocomplete="off" placeholder="Search the Bible">' +
            '</div>' +
            '<div class="bib-card">' +
              '<div class="bib-head" id="bibHead"></div>' +
              '<div class="bib-hint" id="bibTip">Tap any verse to select it, then highlight, copy, or share it as text or as an image.</div>' +
              '<div class="bib-text" id="bibText"></div>' +
              '<div class="bib-row" id="bibFoot">' +
                '<button class="secondary-btn" id="bibPrev2">&#8249; Prev</button>' +
                '<button class="secondary-btn" id="bibNext2">Next &#8250;</button>' +
              '</div>' +
              '<div class="bib-credit">King James Version &middot; Public Domain</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="bib-selbar" id="bibSelBar" hidden>' +
          '<div class="bib-selrow"><span id="bibSelCount"></span><button class="secondary-btn" id="bibSelClear" aria-label="Clear selection">&#10005;</button></div>' +
          '<div class="bib-sw" id="bibSw"></div>' +
          '<div class="bib-selrow">' +
            '<button class="primary-btn" id="bibSelShare">Share</button>' +
            '<button class="secondary-btn" id="bibSelCopy">Copy</button>' +
            '<button class="secondary-btn" id="bibSelErase" hidden>Erase</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div id="modalBibleShare" class="fullscreen-modal" role="dialog" aria-modal="true">' +
        '<header class="modal-header"><h2>Share</h2><button class="close-modal-btn" id="bibShareClose">Close</button></header>' +
        '<div class="bib-body">' +
          '<div class="bib-prev"><p id="bibSharePrev"></p><span id="bibShareUrl"></span></div>' +
          '<button class="bib-opt bib-nat" id="bibShImg" hidden>' + icoImg + 'Share as Image</button>' +
          '<button class="bib-opt bib-wa" id="bibShWa">' + icoWa + 'Share to WhatsApp</button>' +
          '<button class="bib-opt bib-fb" id="bibShFb">' + icoFb + 'Share to Facebook</button>' +
          '<button class="bib-opt bib-tw" id="bibShTw">' + icoTw + 'Share to Twitter / X</button>' +
          '<button class="bib-opt bib-nat" id="bibShLink">' + icoCopy + 'Copy Link</button>' +
          '<button class="bib-opt bib-nat" id="bibShNat">' + icoShare + 'Share via Android Sheet</button>' +
          '<button class="bib-exit" id="bibShExit">Exit Share Page</button>' +
        '</div>' +
      '</div>';
    document.body.insertAdjacentHTML('beforeend', html);

    /* ===== LOADING kjv.json ===== */
    async function doLoad() {
      var stored = null;
      try { stored = await getStored(); } catch (e) {}
      if (stored && stored.length === 66) return stored;
      var r = await fetch('kjv.json');
      if (!r.ok) throw new Error('missing');
      var d = JSON.parse((await r.text()).replace(/^\uFEFF/, ''));
      if (!(d.books && d.books.length >= 66)) throw new Error('shape');
      await new Promise(function (res) { setTimeout(res, 30); });
      var out = d.books.map(function (b) {
        return { n: b.name, c: b.chapters.map(function (ch) { return ch.verses.map(function (v) { return clean(v.text); }); }) };
      });
      try { await putStored(out); } catch (e) {}
      return out;
    }

    async function loadData() {
      var msg = Q('#bibMsg');
      Q('#bibGet').hidden = false;
      Q('#bibRead').hidden = true;
      Q('#bibRetry').hidden = true;
      msg.textContent = 'Loading the Bible...';
      try {
        DATA = (typeof withSpinner === 'function') ? await withSpinner(doLoad) : await doLoad();
      } catch (e) {
        DATA = null;
        msg.textContent = (e && e.message === 'shape')
          ? 'kjv.json was found but its structure was not recognised. Expected books, chapters, verses and text.'
          : 'The Bible file (kjv.json) could not be loaded. Make sure kjv.json is uploaded beside index.html, then tap Retry.';
        Q('#bibRetry').hidden = false;
        return false;
      }
      Q('#bibGet').hidden = true;
      Q('#bibRead').hidden = false;
      return true;
    }

    /* ===== READER ===== */
    function setHash(slug) {
      try { history.replaceState(null, '', window.location.pathname + '#bible=' + slug); } catch (e) {}
    }

    async function openBible(bi, ci, hl) {
      Q('#modalBible').classList.add('active');
      if (!DATA) { var ok = await loadData(); if (!ok) return; }
      if (!Q('#bibBook').options.length) {
        var h = '<optgroup label="Old Testament">';
        for (var i = 0; i < bookNames.length; i++) {
          if (i === 39) h += '</optgroup><optgroup label="New Testament">';
          h += '<option value="' + i + '">' + esc(bookNames[i]) + '</option>';
        }
        Q('#bibBook').innerHTML = h + '</optgroup>';
      }
      if (typeof bi !== 'number') {
        var last = null;
        try { last = (localStorage.getItem('dvBibleLast') || '').split(':'); } catch (e) {}
        if (last && last.length === 2 && bookNames[+last[0]]) { bi = +last[0]; ci = +last[1]; } else { bi = 0; ci = 0; }
      }
      goChapter(bi, ci, hl);
    }

    function goChapter(bi, ci, hl) {
      var n = DATA[bi].c.length;
      if (ci >= n || ci < 0) ci = 0;
      BI = bi; CI = ci; HL = hl || 0;
      Q('#bibBook').value = bi;
      var h = '';
      for (var i = 0; i < n; i++) h += '<option value="' + i + '">Ch. ' + (i + 1) + '</option>';
      Q('#bibCh').innerHTML = h;
      Q('#bibCh').value = ci;
      showChapter();
    }

    function showChapter() {
      MODE = 'chapter';
      SEL = [];
      selUpdate();
      LIST = DATA[BI].c[CI].map(function (t, i) { return { n: i + 1, t: t }; });
      var h = '';
      for (var i = 0; i < LIST.length; i++) {
        h += '<p class="bib-v" id="bibV' + LIST[i].n + '" data-v="' + LIST[i].n + '"><b>' + LIST[i].n + '</b>' + esc(LIST[i].t) + '</p>';
      }
      Q('#bibText').innerHTML = h;
      paint();
      Q('#bibHead').textContent = bookNames[BI] + ' ' + (CI + 1);
      Q('#bibTip').hidden = false;
      Q('#bibFoot').hidden = false;
      var atStart = BI === 0 && CI === 0;
      var atEnd = BI === 65 && CI === DATA[65].c.length - 1;
      ['#bibPrev', '#bibPrev2'].forEach(function (s) { Q(s).disabled = atStart; });
      ['#bibNext', '#bibNext2'].forEach(function (s) { Q(s).disabled = atEnd; });
      try { localStorage.setItem('dvBibleLast', BI + ':' + CI); } catch (e) {}
      setHash(slugOf(BI, CI));
      if (HL) {
        var el = Q('#bibV' + HL);
        HL = 0;
        if (el) { el.classList.add('bib-hl'); el.scrollIntoView({ block: 'center' }); return; }
      }
      Q('#modalBible').scrollTop = 0;
    }

    function paint() {
      var m = hlMap[BI + ':' + CI] || {};
      document.querySelectorAll('#bibText .bib-v[data-v]').forEach(function (p) {
        for (var i = 0; i < hlColors.length; i++) p.classList.remove('bib-c' + i);
        var c = m[p.getAttribute('data-v')];
        if (c !== undefined) p.classList.add('bib-c' + c);
      });
    }

    function swatches() {
      document.querySelectorAll('#bibSw .bib-swb').forEach(function (s, i) {
        s.classList.toggle('bib-act', i === hlIdx);
      });
    }

    function leave() {
      SEL = [];
      selUpdate();
    }

    function closeBible() {
      leave();
      Q('#modalBible').classList.remove('active');
      Q('#modalBibleShare').classList.remove('active');
      try { history.replaceState(null, '', window.location.pathname); } catch (e) {}
    }

    function step(dir) {
      var bi = BI, ci = CI + dir;
      if (ci < 0) { bi--; if (bi < 0) return; ci = DATA[bi].c.length - 1; }
      else if (ci >= DATA[BI].c.length) { bi++; if (bi > 65) return; ci = 0; }
      goChapter(bi, ci);
    }

    /* ===== SEARCH ===== */
    function resetResults() {
      SHOWN = 0;
      Q('#bibText').innerHTML = '';
      moreResults();
    }
    function moreResults() {
      var box = Q('#bibText'), old = box.querySelector('.bib-more');
      if (old) old.remove();
      if (!LIST.length) { box.innerHTML = '<p class="bib-hint">No verses found.</p>'; return; }
      var end = Math.min(SHOWN + 25, LIST.length), h = '';
      for (var i = SHOWN; i < end; i++) {
        var v = LIST[i];
        h += '<p class="bib-v" data-g="' + v.g + '"><span class="bib-ref">' + esc(v.r) + '</span>' + esc(v.t) + '</p>';
      }
      box.insertAdjacentHTML('beforeend', h);
      SHOWN = end;
      var rem = LIST.length - end;
      if (rem > 0) box.insertAdjacentHTML('beforeend', '<button class="secondary-btn bib-more">Show more &mdash; ' + rem + ' verses remaining</button>');
    }
    function findVerses(q) {
      q = q.trim().toLowerCase();
      if (q.length < 3) { if (MODE === 'search') showChapter(); return; }
      var out = [];
      DATA.forEach(function (b, bi) {
        b.c.forEach(function (ch, ci) {
          ch.forEach(function (t, vi) {
            if (t.toLowerCase().indexOf(q) !== -1) out.push({ r: bookNames[bi] + ' ' + (ci + 1) + ':' + (vi + 1), g: bi + ':' + ci + ':' + vi, t: t });
          });
        });
      });
      MODE = 'search';
      SEL = [];
      selUpdate();
      LIST = out;
      Q('#bibHead').textContent = out.length + ' result' + (out.length === 1 ? '' : 's');
      Q('#bibTip').hidden = true;
      Q('#bibFoot').hidden = true;
      resetResults();
    }
    function jumpTo(g) {
      var p = g.split(':');
      Q('#bibFind').value = '';
      goChapter(+p[0], +p[1], (+p[2]) + 1);
    }

    /* ===== VERSE SELECTION ===== */
    function refOf(nums) {
      var parts = [], s = nums[0], p = nums[0];
      for (var i = 1; i < nums.length; i++) {
        if (nums[i] === p + 1) { p = nums[i]; continue; }
        parts.push(s === p ? '' + s : s + '-' + p);
        s = p = nums[i];
      }
      parts.push(s === p ? '' + s : s + '-' + p);
      return bookNames[BI] + ' ' + (CI + 1) + ':' + parts.join(',');
    }
    function selText() {
      var nums = SEL.slice().sort(function (a, b) { return a - b; });
      var body = nums.map(function (n) { return (nums.length > 1 ? n + ' ' : '') + LIST[n - 1].t; }).join(' ');
      return { ref: refOf(nums), body: body, plain: nums.map(function (n) { return LIST[n - 1].t; }).join(' ') };
    }
    function selUpdate() {
      var bar = Q('#bibSelBar');
      if (!bar) return;
      bar.hidden = !SEL.length;
      Q('#bibSelCount').textContent = SEL.length + ' selected';
      var m = hlMap[BI + ':' + CI] || {};
      Q('#bibSelErase').hidden = !SEL.some(function (n) { return m[n] !== undefined; });
      document.querySelectorAll('#bibText .bib-v[data-v]').forEach(function (p) {
        p.classList.toggle('bib-on', SEL.indexOf(+p.getAttribute('data-v')) !== -1);
      });
    }

    /* ===== SHARING ===== */
    function ctxBook() {
      return { slug: slugOf(BI), text: 'Read the book of ' + bookNames[BI] + ' in the King James Bible.' };
    }
    function ctxChapter() {
      var v1 = LIST.length && MODE === 'chapter' ? LIST[0].t : '';
      return { slug: slugOf(BI, CI), text: bookNames[BI] + ' ' + (CI + 1) + ' (KJV)' + (v1 ? '\n\u201C' + v1 + '\u201D' : '') };
    }
    function ctxVerses() {
      var s = selText();
      return { slug: slugOf(BI, CI), text: '\u201C' + s.body + '\u201D \u2014 ' + s.ref + ' (KJV)', image: { text: s.plain, ref: s.ref } };
    }
    function shareOpen(ctx) {
      ctx.url = linkFor(ctx.slug);
      SHARE = ctx;
      Q('#bibSharePrev').textContent = ctx.text;
      Q('#bibShareUrl').textContent = ctx.url;
      Q('#bibShImg').hidden = !ctx.image;
      Q('#modalBibleShare').classList.add('active');
    }
    function shareClose() { Q('#modalBibleShare').classList.remove('active'); }
    function shareMsg() { return SHARE.text + '\n\n' + SHARE.url; }
    function copyText(text, done) {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function () { T(done, 'success'); }).catch(function () { T('Clipboard access was blocked.', 'danger'); });
      } else {
        T('Clipboard is not available.', 'danger');
      }
    }

    function wrapText(x, text, maxW) {
      var words = text.split(' '), lines = [], line = '';
      for (var i = 0; i < words.length; i++) {
        var t = line ? line + ' ' + words[i] : words[i];
        if (x.measureText(t).width > maxW && line) { lines.push(line); line = words[i]; } else line = t;
      }
      if (line) lines.push(line);
      return lines;
    }
    function makeImage(text, ref, cb) {
      var W = 1080, H = 1080, c = document.createElement('canvas');
      c.width = W; c.height = H;
      var x = c.getContext('2d');
      var cs = getComputedStyle(document.body);
      var p1 = cs.getPropertyValue('--primary').trim() || '#0284c7';
      var p2 = cs.getPropertyValue('--primary-hover').trim() || '#0369a1';
      var g = x.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, p1); g.addColorStop(1, p2);
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'top';
      var q = '\u201C' + text + '\u201D', size = 60, lh = 84, lines = [];
      for (; size >= 26; size -= 2) {
        x.font = 'italic ' + size + 'px Georgia, serif';
        lh = Math.round(size * 1.4);
        lines = wrapText(x, q, 860);
        if (lines.length * lh <= 640) break;
      }
      var top = Math.round((H - lines.length * lh) / 2 - 70);
      lines.forEach(function (l, i) { x.fillText(l, W / 2, top + i * lh); });
      x.font = 'bold 44px Roboto, Arial, sans-serif';
      x.fillText(ref + ' (KJV)', W / 2, top + lines.length * lh + 50);
      x.globalAlpha = 0.85;
      x.font = '32px Roboto, Arial, sans-serif';
      x.fillText('DV-NOTE plus', W / 2, H - 120);
      x.fillText(window.location.host, W / 2, H - 76);
      c.toBlob(cb, 'image/png');
    }
    function shareImage() {
      var im = SHARE && SHARE.image;
      if (!im) return;
      if (im.text.length > 700) { T('Select fewer verses for an image', 'info'); return; }
      makeImage(im.text, im.ref, function (blob) {
        if (!blob) return;
        var name = im.ref.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.png';
        var file = null;
        try { file = new File([blob], name, { type: 'image/png' }); } catch (e) {}
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], text: shareMsg() }).catch(function () {});
        } else {
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = name;
          document.body.appendChild(a); a.click(); a.remove();
          T('Image saved', 'success');
        }
        shareClose();
      });
    }

    /* ===== BINDINGS ===== */
    (function () {
      var z = 23;
      try { z = Math.min(26, Math.max(23, +localStorage.getItem('dvBibleFont') || 23)); } catch (e) {}
      document.documentElement.style.setProperty('--bs', z + 'px');
      Q('#bibSize').value = z;
      Q('#bibSize').oninput = function (e) {
        document.documentElement.style.setProperty('--bs', e.target.value + 'px');
        try { localStorage.setItem('dvBibleFont', e.target.value); } catch (er) {}
      };
      Q('#bibRetry').onclick = function () { openBible(); };
      Q('#bibClose').addEventListener('click', closeBible);
      Q('#bibBook').onchange = function () { goChapter(+Q('#bibBook').value, 0); };
      Q('#bibCh').onchange = function () { goChapter(BI, +Q('#bibCh').value); };
      Q('#bibPrev').onclick = Q('#bibPrev2').onclick = function () { step(-1); };
      Q('#bibNext').onclick = Q('#bibNext2').onclick = function () { step(1); };
      Q('#bibFind').oninput = function (e) {
        clearTimeout(SRCH);
        SRCH = setTimeout(function () { findVerses(e.target.value); }, 300);
      };
      Q('#bibText').onclick = function (e) {
        if (e.target.closest('.bib-more')) { moreResults(); return; }
        var p = e.target.closest('.bib-v');
        if (!p) return;
        if (p.getAttribute('data-g')) { jumpTo(p.getAttribute('data-g')); return; }
        var n = +p.getAttribute('data-v'), at = SEL.indexOf(n);
        if (at === -1) SEL.push(n); else SEL.splice(at, 1);
        selUpdate();
      };
      Q('#bibShareBook').onclick = function () { shareOpen(ctxBook()); };
      Q('#bibShareCh').onclick = function () {
        if (MODE !== 'chapter') showChapter();
        shareOpen(ctxChapter());
      };
      Q('#bibSelShare').onclick = function () { shareOpen(ctxVerses()); };
      Q('#bibSelCopy').onclick = function () {
        var c = ctxVerses();
        copyText(c.text + '\n\n' + linkFor(c.slug), 'Verse copied');
      };
      Q('#bibSw').innerHTML = hlColors.map(function (k, i) {
        return '<button class="bib-swb" data-c="' + i + '" style="background:' + k.c + ';" aria-label="' + k.n + ' highlight"></button>';
      }).join('');
      Q('#bibSw').onclick = function (e) {
        var s = e.target.closest('.bib-swb');
        if (!s) return;
        hlIdx = +s.getAttribute('data-c');
        try { localStorage.setItem('dvBibleColor', hlIdx); } catch (er) {}
        swatches();
        var key = BI + ':' + CI;
        hlMap[key] = hlMap[key] || {};
        SEL.forEach(function (n) { hlMap[key][n] = hlIdx; });
        hlPersist();
        paint();
        selUpdate();
        T('Highlighted', 'success');
      };
      swatches();
      Q('#bibSelErase').onclick = function () {
        var key = BI + ':' + CI;
        if (hlMap[key]) {
          SEL.forEach(function (n) { delete hlMap[key][n]; });
          if (!Object.keys(hlMap[key]).length) delete hlMap[key];
        }
        hlPersist();
        paint();
        selUpdate();
        T('Highlight removed', 'info');
      };
      Q('#bibSelClear').onclick = function () { SEL = []; selUpdate(); };
      Q('#bibShareClose').addEventListener('click', shareClose);
      Q('#bibShExit').onclick = shareClose;
      Q('#bibShImg').onclick = shareImage;
      Q('#bibShWa').onclick = function () {
        window.open('https://wa.me/?text=' + encodeURIComponent(shareMsg()), '_blank');
        shareClose();
      };
      Q('#bibShFb').onclick = function () {
        window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(SHARE.url) + '&quote=' + encodeURIComponent(SHARE.text), '_blank');
        shareClose();
      };
      Q('#bibShTw').onclick = function () {
        window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(SHARE.text) + '&url=' + encodeURIComponent(SHARE.url), '_blank');
        shareClose();
      };
      Q('#bibShLink').onclick = function () {
        copyText(SHARE.url, 'Link copied');
        shareClose();
      };
      Q('#bibShNat').onclick = function () {
        if (navigator.share) {
          navigator.share({ title: 'King James Bible', text: SHARE.text, url: SHARE.url }).catch(function () {});
        } else {
          copyText(shareMsg(), 'Copied to clipboard');
        }
        shareClose();
      };
    })();

    /* ===== LEFT DRAWER BUTTON ===== */
    var nav = Q('#leftSidebar .drawer-nav');
    if (nav) {
      var navBtn = document.createElement('button');
      navBtn.className = 'nav-link-btn';
      navBtn.id = 'bibNavBtn';
      navBtn.textContent = 'Holy Bible (KJV)';
      navBtn.addEventListener('click', function () {
        if (typeof closeDrawers === 'function') closeDrawers();
        openBible();
      });
      nav.appendChild(navBtn);
    }

    /* ===== DEEP LINKS: #bible=john-3  #bible=matthew ===== */
    function parseSlug(slug) {
      var bi = slugIdx[slug], ci = 0;
      if (bi !== undefined) return { bi: bi, ci: 0 };
      var m = /^(.+)-(\d+)$/.exec(slug);
      if (!m || slugIdx[m[1]] === undefined) return null;
      bi = slugIdx[m[1]];
      ci = parseInt(m[2], 10) - 1;
      if (ci < 0 || ci >= chapCounts[bi]) return null;
      return { bi: bi, ci: ci };
    }
    function routeHash() {
      var h = window.location.hash.replace(/^#/, '');
      if (h.indexOf('bible=') === -1) return;
      var s = '';
      try { s = new URLSearchParams(h).get('bible') || ''; } catch (e) {}
      var t = parseSlug(s);
      if (t) openBible(t.bi, t.ci); else openBible();
    }
    window.addEventListener('hashchange', routeHash);
    routeHash();
  } catch (e) {}
})();