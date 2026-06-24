const SESSION_KEY = 'japan2026_pwd';

async function checkPwd() {
  const input = document.getElementById('pwd-input');
  const err = document.getElementById('pwd-err');
  const pwd = input.value.trim();
  if (!pwd) return;
  
  const decrypted = await decryptApp(pwd, window.ENCRYPTED_DATA, window.ENCRYPTED_IV, window.ENCRYPTED_SALT);
  if (decrypted) {
    sessionStorage.setItem(SESSION_KEY, pwd);
    document.getElementById('app').innerHTML = decrypted;
    unlock();
  } else {
    input.classList.add('error');
    err.textContent = 'סיסמה שגויה, נסו שוב 🔒';
    setTimeout(() => input.classList.remove('error'), 500);
    input.value = ''; input.focus();
  }
}

async function decryptApp(password, encryptedDataHex, ivHex, saltHex) {
  try {
    const enc = new TextEncoder();
    const dec = new TextDecoder();
    const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), {name: "PBKDF2"}, false, ["deriveKey"]);
    const salt = new Uint8Array(saltHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const iv = new Uint8Array(ivHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const encryptedData = new Uint8Array(encryptedDataHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
      keyMaterial, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
    );
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, encryptedData);
    return dec.decode(decrypted);
  } catch (e) {
    return null;
  }
}

function unlock() {
  document.getElementById('gate').classList.add('hidden');
  document.getElementById('app').classList.add('visible');
  if (typeof renderPlaces === 'function' && placesData.length > 0) renderPlaces();
  if (typeof fetchWeather === 'function') fetchWeather();
  if (typeof initLY091Polling === 'function') initLY091Polling();
}

(async function autoUnlock() {
  const savedPwd = sessionStorage.getItem(SESSION_KEY);
  if (savedPwd) {
     const decrypted = await decryptApp(savedPwd, window.ENCRYPTED_DATA, window.ENCRYPTED_IV, window.ENCRYPTED_SALT);
     if (decrypted) {
       document.getElementById('app').innerHTML = decrypted;
       unlock();
     } else {
       sessionStorage.removeItem(SESSION_KEY);
     }
  }
})();
document.getElementById('pwd-input').addEventListener('keydown', e => { if (e.key === 'Enter') checkPwd(); });

function showSection(id, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  btn.classList.add('active');
  window.scrollTo({top: 0, behavior: 'smooth'});
  setTimeout(observeCards, 100);
  if (id === 'map') setTimeout(tryInitMap, 350);
}

function toggleDay(header) {
  const body = header.nextElementSibling;
  const chevron = header.querySelector('.day-chevron');
  const isOpen = body.classList.contains('open');
  document.querySelectorAll('.day-body.open').forEach(b => {
    b.classList.remove('open');
    b.previousElementSibling.querySelector('.day-chevron').classList.remove('open');
  });
  if (!isOpen) { body.classList.add('open'); chevron.classList.add('open'); }
}

function toggleBooking() {
  document.getElementById('booking-body').classList.toggle('open');
  document.getElementById('booking-chevron').classList.toggle('open');
}

function toggleTips(header) {
  const body = header.nextElementSibling;
  const chevron = header.querySelector('span:last-child');
  body.classList.toggle('open');
  chevron.style.transform = body.classList.contains('open') ? 'rotate(180deg)' : '';
  chevron.style.transition = 'transform 0.3s';
}

function toggleGuide(header) {
  const body = header.nextElementSibling;
  const chevron = header.querySelector('span:last-child');
  body.classList.toggle('open');
  chevron.style.transform = body.classList.contains('open') ? 'rotate(180deg)' : '';
}

function toggleCheck(box) {
  box.classList.toggle('checked');
  box.textContent = box.classList.contains('checked') ? '✓' : '';
}

// ─── LIVE FLIGHT STATUS: LY091 ───
async function fetchLY091Status() {
  const el = document.getElementById('ly091-status-content');
  const updated = document.getElementById('ly091-last-updated');
  if (!el) return;

  el.innerHTML = '<span style="color:#aaa">⏳ טוען נתונים חיים...</span>';

  try {
    const flightDate = new Date('2026-06-23T20:00:00Z');
    const now = new Date();
    const daysDiff = Math.abs((flightDate - now) / (1000 * 60 * 60 * 24));

    if (daysDiff > 3) {
      el.innerHTML = '<span style="color:#f59e0b">⏳ סטאטוס יהיה זמין 24 שעות לפני הטיסה</span>';
      if (updated) updated.textContent = 'עודכן: ' + new Date().toLocaleTimeString('he-IL');
      return;
    }

    // Flight is within 3 days — try OpenSky Network (free, HTTPS, no key)
    const begin = Math.floor(new Date('2026-06-23T18:00:00Z').getTime() / 1000);
    const end   = Math.floor(new Date('2026-06-24T06:00:00Z').getTime() / 1000);

    const resp = await fetch(
      `https://opensky-network.org/api/flights/departure?airport=LLBG&begin=${begin}&end=${end}`,
      { signal: AbortSignal.timeout(8000) }
    );

    if (!resp.ok) throw new Error('API error ' + resp.status);
    const flights = await resp.json();
    const ly091 = flights.find(f => f.callsign && f.callsign.trim().toUpperCase().startsWith('ELY091'));

    if (ly091) {
      const depTime = ly091.firstSeen ? new Date(ly091.firstSeen * 1000).toLocaleTimeString('he-IL') : '—';
      el.innerHTML = `
        <div style="color:#22c55e;font-weight:700">✅ טיסה פעילה / יצאה</div>
        <div style="font-size:0.82rem;margin-top:4px">ICAO24: ${ly091.icao24 || '—'} · יציאה: ${depTime}</div>
      `;
    } else {
      el.innerHTML = '<span style="color:#f59e0b">⏳ טיסה טרם יצאה או נתונים לא זמינים</span>';
    }

    if (updated) updated.textContent = 'עודכן: ' + new Date().toLocaleTimeString('he-IL');

  } catch(e) {
    el.innerHTML = '<span style="color:#aaa">ℹ️ נתונים יהיו זמינים ביום הטיסה · עקוב בקישורים למטה</span>';
    if (updated) updated.textContent = 'שגיאה: ' + new Date().toLocaleTimeString('he-IL');
  }
}

// Initial fetch + auto-refresh every 5 minutes (only within ±2 days of flight)
function initLY091Polling() {
  const flightDate = new Date('2026-06-23T20:00:00Z');
  const daysDiff = Math.abs((flightDate - new Date()) / (1000 * 60 * 60 * 24));
  fetchLY091Status();
  if (daysDiff <= 2) {
    setInterval(fetchLY091Status, 5 * 60 * 1000);
  }
}

window.addEventListener('scroll', () => {
  const btn = document.getElementById('scroll-top');
  btn.classList.toggle('visible', window.scrollY > 300);
});

const manifest = {
  name: 'מסלול יפן 2026', short_name: 'יפן 2026',
  start_url: '.', display: 'standalone',
  background_color: '#0a0e1a', theme_color: '#0a0e1a',
  lang: 'he', dir: 'rtl',
  icons: [{ src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🗾</text></svg>', sizes: '192x192', type: 'image/svg+xml' }]
};
document.getElementById('manifest-link').href = URL.createObjectURL(new Blob([JSON.stringify(manifest)], {type:'application/json'}));

if ('serviceWorker' in navigator) {
  const sw = `const CACHE='japan-v2';self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./','.\/index.html']))));self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));`;
  navigator.serviceWorker.register(URL.createObjectURL(new Blob([sw],{type:'application/javascript'}))).catch(()=>{});
}

// ─── NEIGHBORHOOD ASSIGNMENT ───
function getArea(placeName, city) {
  const n = placeName.toLowerCase();
  const shibuyaKw = ['shibuya','daikanyama','ebisu','harajuku','omotesando','aoyama','meiji jingu','yoyogi','hachiko','pokemon center','hands ','shibuya loft','mega don','tokyu plaza','@cosme','amore vintage','ralph','matcha tokyo','donut','afuri','issai','artbar','cave shibuya','han no','gyukatsu'];
  const shinjukuKw = ['shinjuku','golden gai','golden-gai','gyoen','blue bottle shinjuku','nagi shinjuku','mensho'];
  const asakusaKw = ['asakusa','senso','nakamise','kappabashi','skytree','ueno','akihabara','biccamera','teamlab','tsukiji','hatoya'];
  const ginzaKw = ['ginza','roppongi','tokyo tower','zojo','azabudai','nobu tokyo','yoroniku','jomon roppongi','mori art','21_21','bellwood','benfiddich','gold bar','sg club','edition'];
  const kyotoWestKw = ['arashiyama','bamboo','kinkaku','nijo castle','kimono forest','monkey park','arabica kyoto arashiyama','arabica arashiyama','nintendo museum'];
  const kyotoEastKw = ['fushimi','kiyomizu','gion','yasaka','sannenzaka','ninenzaka','nishiki','pontocho','higashiyama','tofuku','tenju','starbucks kyoto','maccha house','wife & husband','mouriya','chaochao','ichiran kyoto','escamoteur','k36','sugari','manga museum','kyoto national museum'];

  for (const kw of shibuyaKw) if (n.includes(kw)) return 'shibuya';
  for (const kw of shinjukuKw) if (n.includes(kw)) return 'shinjuku';
  for (const kw of asakusaKw) if (n.includes(kw)) return 'asakusa';
  for (const kw of ginzaKw) if (n.includes(kw)) return 'ginza';
  for (const kw of kyotoWestKw) if (n.includes(kw)) return 'kyoto-west';
  for (const kw of kyotoEastKw) if (n.includes(kw)) return 'kyoto-east';
  if (city === 'Kyoto') return 'kyoto-east';
  return 'shibuya';
}

const AREA_LABELS = {
  shibuya: '🗼 שיבויה',
  shinjuku: '🏙️ שינג׳וקו',
  asakusa: '🏮 אסקוסה/מזרח',
  ginza: '🌃 גינזה/רופונגי',
  'kyoto-east': '⛩️ קיוטו מזרח',
  'kyoto-west': '🎋 קיוטו מערב',
};

// ─── PLACES LOGIC ───
let placesData = [];
let currentAreaFilter = 'All';
let currentCatFilter = 'All';
let _mapDataReady = false;

fetch('places.json')
  .then(res => res.json())
  .then(data => {
    placesData = data.map(p => {
      p.area = getArea(p.place, p.city);
      return p;
    });
    placesData.sort((a, b) => {
      if (a.cat < b.cat) return -1;
      if (a.cat > b.cat) return 1;
      if (a.place < b.place) return -1;
      if (a.place > b.place) return 1;
      return 0;
    });
    renderPlaces();
    _mapDataReady = true;
    if (document.getElementById('map').classList.contains('active')) tryInitMap();
  });

function setFilter(type, val, btn) {
  document.querySelectorAll('#' + type + '-filters .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (type === 'area') currentAreaFilter = val;
  if (type === 'cat') currentCatFilter = val;
  renderPlaces();
}

function renderPlaces() {
  const search = document.getElementById('place-search').value.toLowerCase();
  const grid = document.getElementById('places-grid');
  grid.innerHTML = '';
  placesData.forEach(p => {
    if (currentAreaFilter !== 'All' && p.area !== currentAreaFilter) return;
    if (currentCatFilter !== 'All' && !p.cat.includes(currentCatFilter)) return;
    if (search && !p.place.toLowerCase().includes(search) && !p.cat.toLowerCase().includes(search) && !p.city.toLowerCase().includes(search)) return;
    const a = document.createElement('a');
    a.className = 'place-card animate-on-scroll is-visible';
    a.href = 'https://maps.google.com/search?q=' + encodeURIComponent(p.query);
    a.target = '_blank';
    a.innerHTML = '<div class="place-card-title">' + p.place + '</div><div class="place-card-cat">' + (AREA_LABELS[p.area] || p.city) + ' · ' + p.cat.split(' ')[0] + '</div>';
    grid.appendChild(a);
  });
}

// Intersection Observer for animations
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
    }
  });
}, { threshold: 0.1 });

// Start observing when section shown
function observeCards() {
  document.querySelectorAll('.animate-on-scroll:not(.is-visible)').forEach(el => observer.observe(el));
}
observeCards();




// ─── LEAFLET MAP ───
const PLACES_COORDS = {
  "Meiji Jingu": [35.6763, 139.6993],
  "Takeshita Street": [35.6702, 139.7027],
  "Shibuya Scramble Crossing": [35.6595, 139.7005],
  "Hachikō Memorial Statue": [35.6591, 139.7006],
  "Shibuya Sky": [35.6580, 139.7016],
  "Pokemon Center Shibuya": [35.6582, 139.7021],
  "Hands Shibuya": [35.6597, 139.7000],
  "Shibuya Loft": [35.6600, 139.6995],
  "MEGA Don Quijote": [35.6599, 139.6993],
  "Tokyu Plaza Omotesando Omokado": [35.6653, 139.7095],
  "@cosme TOKYO": [35.6658, 139.7060],
  "AMORE Vintage AOYAMA": [35.6660, 139.7130],
  "Nezu Museum": [35.6632, 139.7163],
  "The Matcha Tokyo Omotesandō": [35.6660, 139.7060],
  "Ralph's Coffee Tokyo": [35.6651, 139.7094],
  "I'm donut Harajuku": [35.6695, 139.7029],
  "I'm donut SHIBUYA": [35.6590, 139.7015],
  "AFURI Ebisu": [35.6484, 139.7100],
  "Daikanyama Issai Kassai": [35.6490, 139.7023],
  "Artbar Tokyo Daikanyama": [35.6489, 139.7015],
  "THE MUSIC BAR CAVE SHIBUYA": [35.6590, 139.7000],
  "Han no daidokoro bettei shibuya": [35.6594, 139.6988],
  "Gyukatsu Kyoto Katsugyu Shibuya Dogenzaka": [35.6582, 139.6987],
  "Shinjuku Gyoen National Garden": [35.6850, 139.7100],
  "Shinjuku Golden-Gai": [35.6938, 139.7034],
  "Don Quijote Shinjuku Tonanguchi": [35.6928, 139.7008],
  "Blue Bottle Coffee Shinjuku Cafe": [35.6929, 139.7003],
  "Sugoi Niboshi Rāmen Nagi Shinjuku Golden Gai": [35.6935, 139.7032],
  "Jikasei MENSHO Tokyo": [35.6867, 139.7046],
  "Sensō-ji": [35.7148, 139.7967],
  "Kappabashi Kitchen Tools Street": [35.7173, 139.7942],
  "Hatoya Asakusa": [35.7146, 139.7969],
  "Tokyo Skytree": [35.7101, 139.8107],
  "Tokyo National Museum": [35.7188, 139.7765],
  "National Museum of Nature and Science": [35.7165, 139.7762],
  "Ueno Zoological Gardens": [35.7168, 139.7714],
  "Akihabara": [35.7023, 139.7745],
  "Don Quijote Akihabara": [35.6985, 139.7731],
  "BicCamera AKIBA Store": [35.6993, 139.7729],
  "Tsukiji Outer Market": [35.6654, 139.7707],
  "Matcha Stand Maruni Tokyo Tsukiji": [35.6654, 139.7710],
  "Kaneko Nori Store Tsukiji": [35.6650, 139.7700],
  "teamLab Planets": [35.6479, 139.7948],
  "GINZA SIX": [35.6716, 139.7642],
  "Uniqlo Ginza Flagship Store": [35.6720, 139.7656],
  "MUJI - Ginza Flagship Store": [35.6720, 139.7658],
  "Mitsukoshi Ginza": [35.6718, 139.7648],
  "ART AQUARIUM MUSEUM": [35.6712, 139.7677],
  "Glitch Coffee and Roasters GINZA": [35.6720, 139.7655],
  "X coffee GINZA": [35.6725, 139.7660],
  "Ippudo Ginza": [35.6724, 139.7661],
  "Manten Sushi Marunouchi": [35.6808, 139.7630],
  "Sushi Ginza Onodera Tōryūmon": [35.6718, 139.7644],
  "NOBU Tokyo": [35.6650, 139.7308],
  "Yoroniku Tokyo": [35.6645, 139.7295],
  "Jomon Roppongi": [35.6615, 139.7303],
  "Mori Art Museum": [35.6604, 139.7293],
  "21_21 DESIGN SIGHT": [35.6660, 139.7243],
  "Tokyo Tower": [35.6586, 139.7454],
  "Zōjō-ji": [35.6558, 139.7487],
  "%ARABICA Tokyo Azabudai Hills": [35.6568, 139.7431],
  "The SG Club": [35.6532, 139.7105],
  "Bar Benfiddich": [35.6923, 139.6945],
  "The Bellwood": [35.6602, 139.7254],
  "Gold Bar at EDITION": [35.6650, 139.7301],
  "Imperial Palace": [35.6852, 139.7528],
  "Ghibli Museum": [35.6963, 139.5703],
  "Tokyo Disneyland": [35.6329, 139.8804],
  "Tokyo DisneySea": [35.6267, 139.8854],
  "Sanrio Puroland": [35.6295, 139.4373],
  "Fushimi Inari Taisha": [34.9671, 135.7727],
  "Kiyomizu-dera": [34.9949, 135.7851],
  "Sannenzaka": [34.9985, 135.7815],
  "Yasaka Shrine": [35.0036, 135.7785],
  "Nishiki Market": [35.0046, 135.7659],
  "Pontocho": [35.0080, 135.7700],
  "Tōfuku-ji Temple": [34.9758, 135.7720],
  "Tenju-an Temple": [35.0272, 135.7939],
  "Starbucks Kyoto Ninenzaka Yasaka Chaya": [34.9988, 135.7820],
  "Maccha House Kyoto": [35.0041, 135.7666],
  "WIFE & HUSBAND Kyoto": [35.0437, 135.7582],
  "Kobe Beef Steak Mouriya Gion": [35.0031, 135.7748],
  "Gyoza ChaoChao Shijo Kawaramachi": [35.0040, 135.7689],
  "Ichiran Kyoto Kawaramachi": [35.0036, 135.7683],
  "L'Escamoteur Kyoto": [35.0028, 135.7760],
  "K36 The Bar & Rooftop Kyoto": [35.0032, 135.7744],
  "Wajoryomen Sugari": [35.0038, 135.7610],
  "Kyoto International Manga Museum": [35.0113, 135.7582],
  "Kyoto National Museum": [34.9894, 135.7726],
  "Nijō Castle": [35.0143, 135.7481],
  "Arashiyama Bamboo Forest": [35.0172, 135.6724],
  "Arashiyama": [35.0094, 135.6737],
  "Kinkaku-ji Temple": [35.0394, 135.7292],
  "Kimono Forest Arashiyama": [35.0100, 135.6780],
  "Arashiyama Monkey Park Iwatayama": [35.0077, 135.6760],
  "% ARABICA Kyoto Arashiyama": [35.0136, 135.6751],
  "Nintendo Museum Kyoto": [34.9743, 135.7267],
};

function getCatColor(cat) {
  if (cat.includes('Restaurant')) return '#ef4444';
  if (cat.includes('Bar')) return '#8b5cf6';
  if (cat.includes('Cafe') || cat.includes('cafe') || cat.includes('Bakery') || cat.includes('Coffee')) return '#f97316';
  return '#3b82f6';
}

function findCoords(placeName) {
  if (PLACES_COORDS[placeName]) return PLACES_COORDS[placeName];
  const n = placeName.toLowerCase();
  for (const [key, coords] of Object.entries(PLACES_COORDS)) {
    if (n.includes(key.toLowerCase()) || key.toLowerCase().includes(n)) return coords;
  }
  return null;
}

let leafletMap = null;
let allMarkers = [];

function tryInitMap() {
  if (!_mapDataReady) return;
  if (leafletMap) { leafletMap.invalidateSize(); return; }
  initLeafletMap();
}

function initLeafletMap() {
  if (leafletMap) { leafletMap.invalidateSize(); return; }
  if (typeof L === 'undefined') { setTimeout(initLeafletMap, 300); return; }

  leafletMap = L.map('leaflet-map', { zoomControl: true, tap: false, tapTolerance: 15 }).setView([35.6595, 139.7005], 13);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 20
  }).addTo(leafletMap);

  placesData.forEach(p => {
    const coords = findCoords(p.place);
    if (!coords) return;
    const color = getCatColor(p.cat);
    const marker = L.circleMarker(coords, {
      radius: 8, fillColor: color,
      color: '#fff', weight: 2, opacity: 1, fillOpacity: 0.9
    });
    const mapsUrl = 'https://maps.google.com/search?q=' + encodeURIComponent(p.query || p.place);
    marker.bindPopup(
      '<div class="popup-name">' + p.place + '</div>' +
      '<div class="popup-cat">' + p.cat + '</div>' +
      '<a class="popup-maps-btn" href="' + mapsUrl + '" target="_blank">📍 פתח ב-Maps</a>'
    );
    marker._catKey = p.cat;
    marker.addTo(leafletMap);
    allMarkers.push(marker);
  });

  // Show user location if already available
  updateUserMarker();
  updateNearbyList();
}

function flyTo(lat, lng, zoom, btn) {
  if (!leafletMap) return;
  leafletMap.flyTo([lat, lng], zoom, { duration: 1.2 });
  document.querySelectorAll('.map-area-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function filterMap(cat, btn) {
  document.querySelectorAll('.map-cat-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  allMarkers.forEach(m => {
    if (cat === 'all' || m._catKey.includes(cat)) {
      if (!leafletMap.hasLayer(m)) m.addTo(leafletMap);
    } else {
      if (leafletMap.hasLayer(m)) leafletMap.removeLayer(m);
    }
  });
}


// ─── WEATHER WIDGET ───
async function fetchWeather() {
  async function parseCity(url, elId, fallback) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const txt = (await r.text()).trim();
      const parts = txt.split('|');
      const temp = parts[0] || '?';
      const cond = parts[1] || '';
      const hum  = parts[2] || '';
      const condHe = cond.toLowerCase().includes('rain') ? '🌧️ גשום' :
                     cond.toLowerCase().includes('cloud') ? '⛅ מעונן חלקית' :
                     cond.toLowerCase().includes('overcast') ? '☁️ מעונן' :
                     cond.toLowerCase().includes('sun') || cond.toLowerCase().includes('clear') ? '☀️ שמשי' :
                     cond.toLowerCase().includes('thunder') ? '⛈️ סערה' : '🌤️';
      document.getElementById(elId).innerHTML =
        `<span style="font-size:1.1rem">${temp}</span> ${condHe} <span style="font-size:0.8rem;color:#94a3b8">${hum}</span>`;
    } catch(e) {
      document.getElementById(elId).innerHTML = fallback;
    }
  }
  parseCity('https://wttr.in/Tokyo?format=%t|%C|%h',  'weather-tokyo', '🌧️ ~29°C · לח');
  parseCity('https://wttr.in/Kyoto?format=%t|%C|%h',  'weather-kyoto', '🌧️ ~32°C · חם מאוד');
}

// ─── MISSING TAB CHECKLIST ───
function toggleMissingCheck(item) {
  const box = item.querySelector('.missing-checkbox');
  const isChecked = box.textContent === '✓';
  if (isChecked) {
    box.textContent = '';
    box.style.background = '';
    box.style.borderColor = item.style.borderColor || '#22c55e';
    item.style.opacity = '1';
  } else {
    box.textContent = '✓';
    box.style.background = box.style.borderColor || '#22c55e';
    box.style.color = '#0a0e1a';
    item.style.opacity = '0.6';
  }
  // Update progress
  const total = document.querySelectorAll('.missing-check-item').length;
  const done  = document.querySelectorAll('.missing-checkbox').length -
                [...document.querySelectorAll('.missing-checkbox')].filter(b => !b.textContent).length;
  const doneCnt = [...document.querySelectorAll('.missing-checkbox')].filter(b => b.textContent === '✓').length;
  const prog = document.getElementById('missing-progress');
  if (prog) {
    prog.textContent = doneCnt + ' / ' + total + ' משימות הושלמו';
    if (doneCnt === total) {
      prog.style.color = '#4ade80';
      prog.textContent = '🎉 הכל מוכן לנסיעה!';
    }
  }
}

// ═══════════════════════════════════════════
// GEOLOCATION — show user position on map
// Starts on unlock, stops on page leave
// ═══════════════════════════════════════════

let userLat = null, userLng = null;
let userMarker = null;
let geoWatchId = null;

function startGeolocation() {
  const dbg = document.getElementById('geo-debug');
  function log(msg) { if (dbg) dbg.textContent = msg; console.log('[GEO]', msg); }

  if (!navigator.geolocation) {
    setGeoBtn('unsupported');
    log('geolocation API לא נתמך בדפדפן זה');
    return;
  }
  if (geoWatchId !== null) {
    log('כבר פעיל, watchId=' + geoWatchId);
    return;
  }

  log('מבקש מיקום...');
  setGeoBtn('loading');

  // Check permission state first if API available
  if (navigator.permissions) {
    navigator.permissions.query({name: 'geolocation'}).then(result => {
      log('הרשאה: ' + result.state);
    }).catch(() => {});
  }

  geoWatchId = navigator.geolocation.watchPosition(
    pos => {
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;
      setGeoBtn('active');
      log('מיקום: ' + userLat.toFixed(4) + ', ' + userLng.toFixed(4));
      updateUserMarker();
      updateNearbyList();
    },
    err => {
      const msgs = { 1: 'נדחה — שנה הרשאה בהגדרות Chrome', 2: 'מיקום לא זמין', 3: 'timeout' };
      log('שגיאה ' + err.code + ': ' + (msgs[err.code] || err.message));
      setGeoBtn('denied');
      geoWatchId = null;
    },
    { enableHighAccuracy: false, maximumAge: 60000, timeout: 20000 }
  );
  log('watchPosition נשלח (id=' + geoWatchId + ')');
}

function setGeoBtn(state) {
  const btn = document.getElementById('geo-btn');
  if (!btn) return;
  const states = {
    loading:     { text: '📍 מאתר מיקום...', cls: 'loading' },
    active:      { text: '🔵 מיקום פעיל',   cls: 'active' },
    denied:      { text: '📍 אפשר מיקום',   cls: 'denied' },
    unsupported: { text: '📍 לא נתמך',       cls: 'denied' },
  };
  const s = states[state] || states.denied;
  btn.textContent = s.text;
  btn.className = 'geo-toggle-btn ' + s.cls;
}

function stopGeolocation() {
  if (geoWatchId !== null) {
    navigator.geolocation.clearWatch(geoWatchId);
    geoWatchId = null;
  }
  if (userMarker && leafletMap) {
    leafletMap.removeLayer(userMarker);
    userMarker = null;
  }
  userLat = null; userLng = null;
}

function updateUserMarker() {
  if (!leafletMap || userLat === null) return;
  if (userMarker) {
    userMarker.setLatLng([userLat, userLng]);
  } else {
    const icon = L.divIcon({
      className: '',
      html: '<div class="geo-dot"><div class="geo-pulse"></div></div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });
    userMarker = L.marker([userLat, userLng], { icon, zIndexOffset: 1000 })
      .addTo(leafletMap)
      .bindPopup('<div style="text-align:center;font-weight:700;font-family:Heebo,sans-serif">📍 המיקום שלי</div>');
  }
  updateNearbyList();
}

function haversineDist(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function updateNearbyList() {
  const el = document.getElementById('nearby-list');
  if (!el || userLat === null || !placesData.length) return;

  const withDist = placesData.map(p => {
    const coords = findCoords(p.place);
    if (!coords) return null;
    return { ...p, coords, dist: haversineDist(userLat, userLng, coords[0], coords[1]) };
  }).filter(Boolean).sort((a, b) => a.dist - b.dist).slice(0, 6);

  el.innerHTML = withDist.map(p => {
    const km = p.dist < 1
      ? Math.round(p.dist * 1000) + " מ'"
      : p.dist.toFixed(1) + ' ק"מ';
    const mapsUrl = 'https://maps.google.com/search?q=' + encodeURIComponent(p.query || p.place);
    return '<div class="nearby-item" onclick="flyToAndShow(' + p.coords[0] + ',' + p.coords[1] + ',17)">' +
      '<div class="nearby-dist">' + km + '</div>' +
      '<div class="nearby-info">' +
        '<div class="nearby-name">' + p.place + '</div>' +
        '<div class="nearby-cat">' + p.cat.split(' & ')[0].split(' ')[0] + '</div>' +
      '</div>' +
      '<a class="nearby-maps" href="' + mapsUrl + '" target="_blank" onclick="event.stopPropagation()">↗</a>' +
    '</div>';
  }).join('');
}

function flyToAndShow(lat, lng, zoom) {
  const mapSection = document.getElementById('map');
  const mapTab = document.querySelector('.tab-btn[onclick*="map"]');
  if (mapSection && !mapSection.classList.contains('active')) {
    if (mapTab) showSection('map', mapTab);
    setTimeout(function() { flyTo(lat, lng, zoom, null); }, 450);
  } else {
    flyTo(lat, lng, zoom, null);
  }
}

function haversineDist(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Stop on page leave
window.addEventListener('pagehide', stopGeolocation);
window.addEventListener('beforeunload', stopGeolocation);
