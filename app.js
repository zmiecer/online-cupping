(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────
  let currentUser = null;
  let coffeesData = [];
  let currentCoffee = null;
  let lastRating = null;

  // ── Lightbox ────────────────────────────────────────────────
  function openLightbox(src) {
    var lb = document.getElementById('lightbox');
    var img = document.getElementById('lightbox-img');
    img.src = src;
    lb.classList.add('active');
  }
  document.addEventListener('DOMContentLoaded', function () {
    var lb = document.getElementById('lightbox');
    if (!lb) return;
    lb.addEventListener('click', function (e) {
      if (e.target.id !== 'lightbox-img') {
        lb.classList.remove('active');
      }
    });
  });

  const CATEGORIES = [
    { key: 'fragrance_aroma', i18n: 'cat_fragrance_aroma' },
    { key: 'flavor',          i18n: 'cat_flavor' },
    { key: 'aftertaste',      i18n: 'cat_aftertaste' },
    { key: 'acidity',         i18n: 'cat_acidity' },
    { key: 'sweetness',       i18n: 'cat_sweetness' },
    { key: 'mouthfeel',       i18n: 'cat_mouthfeel' },
    { key: 'overall',         i18n: 'cat_overall' },
  ];

  function catLabel(cat) { return I18N.t(cat.i18n); }

  // ── DOM helpers ────────────────────────────────────────────
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => [...(ctx || document).querySelectorAll(sel)];

  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }

  // ── Navigation ─────────────────────────────────────────────
  function navigate(pageId) {
    $$('.page').forEach(p => p.classList.remove('active'));
    const page = $(`#page-${pageId}`);
    if (page) page.classList.add('active');

    $$('.nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.page === pageId);
    });

    window.scrollTo(0, 0);
  }

  // ── Data loading ───────────────────────────────────────────
  async function loadCoffees() {
    const resp = await fetch('data/coffees.json');
    const data = await resp.json();
    coffeesData = data.coffees || [];
  }

  function findCoffeeBySample(num) {
    return coffeesData.find(c => c.sample_number === num);
  }

  function getCoffeeName(coffee) {
    if (coffee.coffee_name) return coffee.coffee_name;
    const origin = I18N.geo(coffee.origin_country) || 'Unknown';
    const process = coffee.process ? I18N.geo(coffee.process) : '';
    return process ? `${origin} ${process}` : origin;
  }

  // ── Welcome page ───────────────────────────────────────────
  function initWelcome() {
    const select = $('#participant-select');
    const btnStart = $('#btn-start');

    (CONFIG.PARTICIPANTS || []).forEach(n => {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = I18N.name(n);
      select.appendChild(opt);
    });

    const saved = localStorage.getItem('cupping_user');
    if (saved && CONFIG.PARTICIPANTS.includes(saved)) {
      select.value = saved;
      btnStart.disabled = false;
    }

    select.addEventListener('change', () => {
      btnStart.disabled = !select.value;
    });

    btnStart.addEventListener('click', () => {
      currentUser = select.value;
      localStorage.setItem('cupping_user', currentUser);
      enterApp();
    });

    if (saved && CONFIG.PARTICIPANTS.includes(saved)) {
      currentUser = saved;
      enterApp();
    }
  }

  function enterApp() {
    $('#user-badge').textContent = I18N.name(currentUser);
    show($('#user-badge'));
    show($('#main-nav'));
    navigate('rate');
  }

  // ── Rate page ──────────────────────────────────────────────
  function initRate() {
    const input = $('#sample-input');
    const btnLookup = $('#btn-lookup');
    const errorMsg = $('#sample-error');

    input.addEventListener('input', () => {
      const val = input.value.replace(/[^1-9]/g, '').slice(0, 3);
      input.value = val;
      btnLookup.disabled = val.length < 3;
      hide(errorMsg);
    });

    btnLookup.addEventListener('click', async () => {
      const num = parseInt(input.value, 10);
      const coffee = findCoffeeBySample(num);
      if (!coffee) {
        errorMsg.textContent = I18N.t('sample_not_found');
        show(errorMsg);
        return;
      }
      const allRatings = await getAllRatings();
      const alreadyRated = allRatings.some(
        r => r.participant === currentUser && Number(r.sample_number) === num
      );
      if (alreadyRated) {
        errorMsg.textContent = I18N.t('already_rated');
        show(errorMsg);
        return;
      }
      hide(errorMsg);
      currentCoffee = coffee;
      showRatingForm(coffee);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !btnLookup.disabled) {
        btnLookup.click();
      }
    });
  }

  function showRatingForm(coffee) {
    const form = $('#rating-form');
    show(form);
    hide($('#sample-input-card'));
    $('#form-sample-number').textContent = coffee.sample_number;

    $$('.score-circles', form).forEach(container => {
      container.innerHTML = '';
      for (let i = 1; i <= 9; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'score-circle';
        btn.textContent = i;
        btn.dataset.value = i;
        btn.addEventListener('click', () => {
          $$('.score-circle', container).forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          checkFormComplete();
        });
        container.appendChild(btn);
      }
    });

    checkFormComplete();

    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function checkFormComplete() {
    const overallCard = $('.category-card[data-category="overall"]');
    const overallSelected = !!$('.score-circle.selected', overallCard);
    $('#btn-submit').disabled = !overallSelected;
  }

  function roastAge(dateStr) {
    if (!dateStr) return '—';
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    const w = Math.floor(days / 7);
    const d = days % 7;
    if (w === 0) return `${d}d`;
    return d === 0 ? `${w}w` : `${w}w ${d}d`;
  }

  function renderDrinkingOrder() {
    const sorted = [...coffeesData]
      .sort((a, b) => {
        if (!a.roast_date && !b.roast_date) return 0;
        if (!a.roast_date) return 1;
        if (!b.roast_date) return -1;
        return a.roast_date.localeCompare(b.roast_date);
      });

    $('#drinking-order-list').innerHTML = sorted.map((c, i) => {
      const age = roastAge(c.roast_date);
      let cls = '';
      if (c.roast_date) {
        const days = Math.floor((Date.now() - new Date(c.roast_date).getTime()) / 86400000);
        if (days >= 26) cls = ' age-late';
        else if (days >= 10) cls = ' age-prime';
      }
      return `
      <div class="drinking-order-row${cls}">
        <span class="drinking-order-num">${i + 1}.</span>
        <span class="sample-badge small">${c.sample_number}</span>
        <span class="drinking-order-age">${age}</span>
        <span class="drinking-order-date">${c.roast_date || '—'}</span>
      </div>`;
    }).join('');
  }

  function initRatingForm() {
    $('#rating-form').addEventListener('submit', (e) => {
      e.preventDefault();
      submitRating();
    });
  }

  function collectRating() {
    const rating = {
      timestamp: new Date().toISOString(),
      participant: currentUser,
      sample_number: currentCoffee.sample_number,
    };

    $$('.category-card').forEach(card => {
      const cat = card.dataset.category;
      const selected = $('.score-circle.selected', card);
      rating[cat] = selected ? parseInt(selected.dataset.value, 10) : null;
      rating[cat + '_notes'] = ($('.notes-input', card) || {}).value || '';
    });

    return rating;
  }

  async function submitRating() {
    const btn = $('#btn-submit');
    if (btn.disabled) return;
    btn.disabled = true;

    const rating = collectRating();
    lastRating = rating;

    saveRatingLocal(rating);

    try {
      await submitToBackend(rating);
    } catch (err) {
      console.warn('Failed to submit rating:', err);
    }

    showReveal(currentCoffee, rating);
  }

  function resetRateForm() {
    const form = $('#rating-form');
    hide(form);
    show($('#sample-input-card'));
    $('#sample-input').value = '';
    $('#btn-lookup').disabled = true;
    $$('.score-circle', form).forEach(b => b.classList.remove('selected'));
    $$('.notes-input', form).forEach(t => { t.value = ''; });
    $('#btn-submit').disabled = true;
    currentCoffee = null;
  }

  // ── Local storage ──────────────────────────────────────────
  function saveRatingLocal(rating) {
    const key = 'cupping_ratings';
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    existing.push(rating);
    localStorage.setItem(key, JSON.stringify(existing));
  }

  function getLocalRatings() {
    return JSON.parse(localStorage.getItem('cupping_ratings') || '[]');
  }

  // ── Firebase Realtime DB ──────────────────────────────────
  let _fbDb = null;

  function firebaseDb() {
    if (!_fbDb) {
      firebase.initializeApp(CONFIG.FIREBASE);
      _fbDb = firebase.database();
    }
    return _fbDb;
  }

  async function submitToFirebase(rating) {
    await firebaseDb().ref('ratings').push(rating);
  }

  async function fetchRatingsFromFirebase() {
    const snap = await firebaseDb().ref('ratings').once('value');
    const val = snap.val();
    if (!val) return [];
    return Object.values(val);
  }

  // ── Google Sheets API (fallback) ─────────────────────────
  async function submitToSheet(rating) {
    const payload = encodeURIComponent(JSON.stringify(rating));
    const url = CONFIG.GOOGLE_SCRIPT_URL + '?action=submit&data=' + payload;
    const resp = await fetch(url);
    const result = await resp.json();
    if (result.status !== 'ok') throw new Error(result.message || 'Submit failed');
  }

  async function fetchRatingsFromSheet() {
    const url = CONFIG.GOOGLE_SCRIPT_URL + '?action=getRatings&t=' + Date.now();
    const resp = await fetch(url);
    return resp.json();
  }

  // ── Backend router ───────────────────────────────────────
  function useFirebase() {
    return CONFIG.BACKEND === 'firebase' && CONFIG.FIREBASE && CONFIG.FIREBASE.databaseURL;
  }

  async function submitToBackend(rating) {
    if (useFirebase()) return submitToFirebase(rating);
    if (CONFIG.GOOGLE_SCRIPT_URL) return submitToSheet(rating);
  }

  async function fetchFromBackend() {
    if (useFirebase()) return fetchRatingsFromFirebase();
    if (CONFIG.GOOGLE_SCRIPT_URL) {
      const data = await fetchRatingsFromSheet();
      return data.ratings || data || [];
    }
    return [];
  }

  // ── Reveal page ────────────────────────────────────────────
  function showReveal(coffee, rating) {
    navigate('reveal');

    const scoreCard = $('#reveal-scores').parentElement;
    show(scoreCard);

    $('#reveal-sample-number').textContent = coffee.sample_number;

    const scoresHtml = CATEGORIES.map(cat => `
      <div class="reveal-score-item">
        <span class="label">${catLabel(cat)}</span>
        <span class="value">${rating[cat.key] || '-'}</span>
      </div>
    `).join('');
    $('#reveal-scores').innerHTML = scoresHtml;

    const overall = rating.overall || '-';
    const attrCats = CATEGORIES.filter(c => c.key !== 'overall');
    const attrAvg = attrCats.reduce((s, c) => s + (parseFloat(rating[c.key]) || 0), 0) / attrCats.length;
    $('#reveal-total').innerHTML = `
      <div class="reveal-total-row">
        <span>${I18N.t('overall_label')}</span>
        <span class="value">${overall}<small> / 9</small></span>
      </div>
      <div class="reveal-total-row secondary">
        <span>${I18N.t('avg_attributes')}</span>
        <span class="value">${attrAvg.toFixed(1)}<small> / 9</small></span>
      </div>
    `;

    const btnBack = $('#btn-rate-another');
    btnBack.textContent = I18N.t('rate_another');
    btnBack.dataset.action = 'rate';

    const name = getCoffeeName(coffee);
    $('#reveal-name').textContent = name;

    const roasteryText = coffee.roastery_en || '';
    const roasteryKr = coffee.roastery || '';
    $('#reveal-roastery').textContent = roasteryKr + (roasteryText ? ` (${roasteryText})` : '');

    renderCoffeeBody(coffee, name);

    renderCoffeeExtras(coffee);
  }

  function renderCoffeeBody(coffee, name) {
    const details = [];
    if (coffee.origin_country) details.push([I18N.t('detail_origin'), I18N.geo(coffee.origin_country)]);
    if (coffee.region) details.push([I18N.t('detail_region'), coffee.region]);
    if (coffee.variety) details.push([I18N.t('detail_variety'), coffee.variety]);
    if (coffee.process) details.push([I18N.t('detail_process'), I18N.geo(coffee.process)]);
    if (coffee.roast_level) details.push([I18N.t('detail_roast'), coffee.roast_level]);
    if (coffee.city) {
      const loc = coffee.district
        ? `${I18N.geo(coffee.city)}, ${I18N.geo(coffee.district)}`
        : I18N.geo(coffee.city);
      details.push([I18N.t('detail_roasted_in'), loc]);
    }
    if (coffee.roast_date) details.push([I18N.t('detail_roast_date'), coffee.roast_date]);

    $('#reveal-details').innerHTML = details.map(([label, value]) => `
      <span class="reveal-detail-label">${label}</span>
      <span class="reveal-detail-value">${value}</span>
    `).join('');

    if (coffee.flavor_notes) {
      show($('#reveal-flavor-section'));
      $('#reveal-flavor-notes').textContent = I18N.notes(coffee.flavor_notes);
    } else {
      hide($('#reveal-flavor-section'));
    }

    const photoContainer = $('#reveal-photos');
    photoContainer.innerHTML = '';
    const photoFiles = getPhotoFiles(coffee.id);
    photoFiles.forEach(file => {
      const img = document.createElement('img');
      img.src = `data/photos/${file}`;
      img.alt = `${name} package`;
      img.loading = 'lazy';
      img.onerror = () => img.remove();
      img.addEventListener('click', function (e) {
        e.stopPropagation();
        openLightbox(img.src);
      });
      photoContainer.appendChild(img);
    });

    const linksContainer = $('#reveal-links');
    linksContainer.innerHTML = '';
    if (coffee.instagram) {
      linksContainer.innerHTML += `<a href="${coffee.instagram}" target="_blank" rel="noopener" class="reveal-link">Instagram</a>`;
    }
    if (coffee.google_maps) {
      linksContainer.innerHTML += `<a href="${coffee.google_maps}" target="_blank" rel="noopener" class="reveal-link">Maps</a>`;
    }
    if (coffee.website) {
      linksContainer.innerHTML += `<a href="${coffee.website}" target="_blank" rel="noopener" class="reveal-link">${I18N.t('link_website')}</a>`;
    }
  }

  function renderCoffeeExtras(coffee) {
    const badgesEl = $('#reveal-badges');
    badgesEl.innerHTML = '';

    const isBB = coffee.from_batch_baby_guide === 'Yes';
    if (isBB) {
      badgesEl.innerHTML += `
        <a href="https://www.instagram.com/batchbabycoffee" target="_blank" rel="noopener" class="badge-batch-baby">
          <img src="data/batch_baby.png" alt="Batch Baby" class="badge-batch-baby-img active">
          <span class="badge-batch-baby-text active">${I18N.t('batch_baby_yes')}</span>
        </a>`;
    } else {
      badgesEl.innerHTML += `
        <div class="badge-batch-baby">
          <img src="data/batch_baby.png" alt="Batch Baby" class="badge-batch-baby-img inactive">
          <span class="badge-batch-baby-text inactive">${I18N.t('batch_baby_no')}</span>
        </div>`;
    }

    if (coffee.look_like_tax_avoidance === 'Yes') {
      badgesEl.innerHTML += `
        <div class="badge-tax-avoidance">${I18N.t('tax_avoidance')}</div>`;
    }

    const pnSection = $('#reveal-personal-note');
    const pnText = $('#reveal-personal-note-text');
    if (coffee.personal_note) {
      pnText.textContent = I18N.personalNote(coffee.id, coffee.personal_note);
      show(pnSection);
    } else {
      hide(pnSection);
    }

    const cafePhotosSection = $('#reveal-cafe-photos');
    const cafePhotosGrid = $('#cafe-photos-grid');
    const photos = getCafePhotos(coffee.roastery_en);
    if (photos.length) {
      cafePhotosGrid.innerHTML = photos.map(src =>
        `<img src="${src}" class="cafe-photo" alt="" loading="lazy">`
      ).join('');
      cafePhotosGrid.querySelectorAll('.cafe-photo').forEach(img => {
        img.addEventListener('click', function (e) {
          e.stopPropagation();
          openLightbox(img.src);
        });
      });
      show(cafePhotosSection);
    } else {
      hide(cafePhotosSection);
    }

    const aiSection = $('#reveal-additional-info');
    const aiText = $('#reveal-additional-info-text');
    if (coffee.additional_info) {
      aiText.textContent = coffee.additional_info;
      show(aiSection);
    } else {
      hide(aiSection);
    }
  }

  const CAFE_PHOTOS = {
    'aery': ['aery_1.png', 'aery_2.png'],
    'Always Au8ust Roasters': ['always_au8ust.png'],
    'Anthracite Coffee Roasters': ['anthracite_1.png', 'anthracite_2.png', 'anthracite_3.png'],
    'camouflage': ['camouflage_1.png', 'camouflage_2.png'],
    'Die Synthese': ['die_synthese_1.png', 'die_synthese_2.png'],
    'Fritz Coffee Company': ['fritz_1.png', 'fritz_2.png'],
    'Mesh Coffee': ['mesh_1.png', 'mesh_2.png', 'mesh_3.png'],
    'MOMOS COFFEE': ['momos_1.png', 'momos_2.png', 'momos_3.png'],
    'RECEPTION': ['reception_1.png', 'reception_2.png'],
    'Tide Coffee Roasters': ['tide_1.png', 'tide_2.png'],
    'tonti': ['tonti.png'],
    'Werk Roasters': ['werk_1.png', 'werk_2.png'],
  };

  function getCafePhotos(roasteryEn) {
    const files = CAFE_PHOTOS[roasteryEn] || [];
    return files.map(f => 'data/cafe_photos/' + f);
  }

  function getPhotoFiles(coffeeId) {
    return [
      `${coffeeId}_front.png`,
      `${coffeeId}_front_2.png`,
      `${coffeeId}_back.png`,
    ];
  }

  function initReveal() {
    $('#btn-rate-another').addEventListener('click', () => {
      const btn = $('#btn-rate-another');
      if (btn.dataset.action === 'map') {
        navigate('map');
        loadMap();
      } else {
        resetRateForm();
        navigate('rate');
      }
    });
  }

  // ── Map ────────────────────────────────────────────────────
  let mapInstance = null;

  function initMap() {
    if (mapInstance) return;
    const container = document.getElementById('roastery-map');
    if (!container) return;

    mapInstance = L.map(container, { zoomControl: true }).setView([36.5, 128.0], 7);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://osm.org/copyright">OSM</a>',
      subdomains: 'abcd',
    }).addTo(mapInstance);
  }

  async function loadMap() {
    if (!mapInstance) initMap();
    setTimeout(() => mapInstance.invalidateSize(), 200);

    const allRatings = await getAllRatings();
    const myRatings = allRatings.filter(r => r.participant === currentUser);
    const mySamples = new Set(myRatings.map(r => Number(r.sample_number)));

    const roasteryMap = {};
    coffeesData.forEach(c => {
      const key = c.roastery_en || c.roastery;
      if (!roasteryMap[key]) {
        roasteryMap[key] = {
          name: key,
          nameKr: c.roastery,
          city: c.city,
          district: c.district || '',
          lat: c.lat,
          lng: c.lng,
          instagram: c.instagram,
          google_maps: c.google_maps,
          website: c.website,
          coffees: [],
          revealed: false,
        };
      }
      const tasted = mySamples.has(c.sample_number);
      const coffeeRatings = allRatings.filter(r => Number(r.sample_number) === c.sample_number);
      const avgScore = coffeeRatings.length
        ? coffeeRatings.reduce((s, r) => s + getOverall(r), 0) / coffeeRatings.length
        : null;
      roasteryMap[key].coffees.push({
        name: getCoffeeName(c),
        sample: c.sample_number,
        id: c.id,
        tasted,
        avgScore,
        ratingCount: coffeeRatings.length,
      });
      if (tasted) roasteryMap[key].revealed = true;
    });

    mapInstance.eachLayer(layer => {
      if (layer instanceof L.Marker || layer instanceof L.CircleMarker) {
        mapInstance.removeLayer(layer);
      }
    });

    const revealedIcon = L.divIcon({
      className: '',
      html: '<div style="width:28px;height:28px;background:#2D6B50;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    const hiddenIcon = L.divIcon({
      className: '',
      html: '<div style="width:22px;height:22px;background:#B0B8C4;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.2)"></div>',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });

    let revealedCount = 0;
    const total = Object.keys(roasteryMap).length;
    const bounds = [];

    Object.values(roasteryMap).forEach(r => {
      if (!r.lat || !r.lng) return;
      bounds.push([r.lat, r.lng]);

      if (r.revealed) {
        revealedCount++;
        const coffeeList = r.coffees.map(c => {
          if (c.tasted) {
            const scoreTag = c.avgScore !== null
              ? ` <span class="map-popup-score">${c.avgScore.toFixed(1)}</span>`
              : '';
            return `&#10003; <a href="#" class="map-coffee-link" data-sample="${c.sample}">${c.name}</a>${scoreTag}`;
          }
          return '&#9675; ???';
        }).join('<br>');

        const links = [];
        if (r.instagram) links.push(`<a href="${r.instagram}" target="_blank">Instagram</a>`);
        if (r.google_maps) links.push(`<a href="${r.google_maps}" target="_blank">Maps</a>`);
        if (r.website) links.push(`<a href="${r.website}" target="_blank">${I18N.t('link_website')}</a>`);

        const popup = `
          <div class="map-popup-title">${r.name}</div>
          <div class="map-popup-sub">${r.nameKr} · ${I18N.geo(r.city)}${r.district ? ', ' + I18N.geo(r.district) : ''}</div>
          <div class="map-popup-coffees">${coffeeList}</div>
          <div class="map-popup-links">${links.join(' ')}</div>
        `;

        L.marker([r.lat, r.lng], { icon: revealedIcon })
          .bindPopup(popup, { maxWidth: 220 })
          .addTo(mapInstance);
      } else {
        L.marker([r.lat, r.lng], { icon: hiddenIcon })
          .bindPopup(`<div class="map-popup-title">${I18N.t('map_hidden_title')}</div><div class="map-popup-sub">${I18N.t('map_hidden_sub')}</div>`, { maxWidth: 200 })
          .addTo(mapInstance);
      }
    });

    mapInstance.on('popupopen', () => {
      document.querySelectorAll('.map-coffee-link').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const sample = parseInt(link.dataset.sample, 10);
          const coffee = findCoffeeBySample(sample);
          if (coffee) showCoffeeDetail(coffee);
        });
      });
    });

    if (bounds.length > 1) {
      mapInstance.fitBounds(bounds, { padding: [40, 40] });
    } else if (bounds.length === 1) {
      mapInstance.setView(bounds[0], 13);
    }

    const countEl = document.getElementById('map-count');
    if (countEl) countEl.textContent = `${revealedCount}/${total} ${I18N.t('discovered')}`;

    mapBoundsByCity = {};
    Object.values(roasteryMap).forEach(r => {
      if (!r.lat || !r.lng) return;
      const city = r.city || 'Unknown';
      if (!mapBoundsByCity[city]) mapBoundsByCity[city] = [];
      mapBoundsByCity[city].push([r.lat, r.lng]);
    });
    mapBoundsByCity.all = bounds;

    initMapCityButtons();
    renderTastedList(roasteryMap);
  }

  let mapBoundsByCity = {};

  function initMapCityButtons() {
    document.querySelectorAll('.btn-map-city').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.btn-map-city').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const city = btn.dataset.city;
        const pts = mapBoundsByCity[city] || mapBoundsByCity.all || [];
        if (pts.length > 1) {
          mapInstance.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
        } else if (pts.length === 1) {
          mapInstance.setView(pts[0], 14);
        }
      };
    });
  }

  function renderTastedList(roasteryMap) {
    const container = document.getElementById('map-tasted-list');
    if (!container) return;

    const byCity = {};
    Object.values(roasteryMap).forEach(r => {
      const tasted = r.coffees.filter(c => c.tasted);
      if (!tasted.length) return;
      const city = r.city || 'Unknown';
      if (!byCity[city]) byCity[city] = [];
      byCity[city].push({ roastery: r.name, coffees: tasted });
    });

    if (!Object.keys(byCity).length) {
      container.innerHTML = `<p class="tasted-empty">${I18N.t('no_coffees_tasted')}</p>`;
      return;
    }

    let html = `<h3 class="tasted-title">${I18N.t('you_tasted')}</h3>`;
    Object.entries(byCity).sort((a, b) => a[0].localeCompare(b[0])).forEach(([city, roasteries]) => {
      html += `<div class="tasted-city">${I18N.geo(city)}</div>`;
      roasteries.forEach(r => {
        r.coffees.forEach(c => {
          const scoreHtml = c.avgScore !== null
            ? `<span class="tasted-score">${c.avgScore.toFixed(1)}<small>/9</small></span>`
            : '';
          html += `<a href="#" class="tasted-item" data-sample="${c.sample}">
            <div class="tasted-info">
              <span class="tasted-roastery">${r.roastery}</span>
              <span class="tasted-coffee">${c.name}</span>
            </div>
            ${scoreHtml}
          </a>`;
        });
      });
    });

    container.innerHTML = html;
    container.querySelectorAll('.tasted-item').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const sample = parseInt(el.dataset.sample, 10);
        const coffee = findCoffeeBySample(sample);
        if (coffee) showCoffeeDetail(coffee);
      });
    });
  }

  async function showCoffeeDetail(coffee) {
    navigate('reveal');

    $('#reveal-sample-number').textContent = coffee.sample_number;

    const scoreCard = $('#reveal-scores').parentElement;
    const allRatings = await getAllRatings();
    const myRating = allRatings.find(
      r => r.participant === currentUser && Number(r.sample_number) === coffee.sample_number
    );

    if (myRating) {
      show(scoreCard);
      const scoresHtml = CATEGORIES.map(cat => `
        <div class="reveal-score-item">
          <span class="label">${catLabel(cat)}</span>
          <span class="value">${myRating[cat.key] || '-'}</span>
        </div>
      `).join('');
      $('#reveal-scores').innerHTML = scoresHtml;
      const overall = myRating.overall || '-';
      const attrCats = CATEGORIES.filter(c => c.key !== 'overall');
      const attrAvg = attrCats.reduce((s, c) => s + (parseFloat(myRating[c.key]) || 0), 0) / attrCats.length;
      $('#reveal-total').innerHTML = `
        <div class="reveal-total-row">
          <span>${I18N.t('your_overall')}</span>
          <span class="value">${overall}<small> / 9</small></span>
        </div>
        <div class="reveal-total-row secondary">
          <span>${I18N.t('avg_attributes')}</span>
          <span class="value">${attrAvg.toFixed(1)}<small> / 9</small></span>
        </div>
      `;
    } else {
      hide(scoreCard);
    }

    const name = getCoffeeName(coffee);
    $('#reveal-name').textContent = name;

    const roasteryText = coffee.roastery_en || '';
    const roasteryKr = coffee.roastery || '';
    $('#reveal-roastery').textContent = roasteryKr + (roasteryText ? ` (${roasteryText})` : '');

    renderCoffeeBody(coffee, name);
    renderCoffeeExtras(coffee);

    const btnBack = $('#btn-rate-another');
    btnBack.textContent = I18N.t('back_to_map');
    btnBack.dataset.action = 'map';
  }

  // ── Shared rating fetcher ─────────────────────────────────
  async function getAllRatings() {
    try {
      const ratings = await fetchFromBackend();
      if (ratings && ratings.length) return ratings;
    } catch (err) {
      console.warn('Backend fetch failed, using local:', err);
    }
    return getLocalRatings();
  }

  // ── Leaderboard ────────────────────────────────────────────
  async function loadLeaderboard() {
    const loading = $('#leaderboard-loading');
    const content = $('#leaderboard-content');
    const empty = $('#leaderboard-empty');
    const error = $('#leaderboard-error');
    const scope = $('#leaderboard-scope');

    show(loading);
    hide(content);
    hide(empty);
    hide(error);
    hide(scope);

    const allRatings = await getAllRatings();

    hide(loading);

    if (!allRatings.length) {
      show(empty);
      return;
    }

    const myRatings = allRatings.filter(r => r.participant === currentUser);
    const mySamples = new Set(myRatings.map(r => Number(r.sample_number)));

    const scopedRatings = allRatings.filter(r => mySamples.has(Number(r.sample_number)));

    if (!scopedRatings.length) {
      show(empty);
      return;
    }

    const scopeEl = $('#leaderboard-scope');
    scopeEl.textContent = I18N.tpl('lb_scope', { n: mySamples.size });
    show(scopeEl);

    renderLeaderboard(scopedRatings);
    show(content);
  }

  function renderLeaderboard(ratings) {
    const statsEl = $('#leaderboard-stats');
    const participants = [...new Set(ratings.map(r => r.participant))];
    const samples = [...new Set(ratings.map(r => r.sample_number))];

    statsEl.innerHTML = `
      <div class="stat-item">
        <div class="stat-value">${ratings.length}</div>
        <div class="stat-label">${I18N.t('lb_ratings')}</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${participants.length}</div>
        <div class="stat-label">${I18N.t('lb_tasters')}</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${samples.length}</div>
        <div class="stat-label">${I18N.t('lb_coffees_tried')}</div>
      </div>
    `;

    const ended = CONFIG.VOTING_ENDED;

    $('#title-top-coffees').textContent = I18N.t(ended ? 'lb_top_coffees' : 'lb_current_top_coffees');
    $('#title-top-roasteries').textContent = I18N.t(ended ? 'lb_top_roasteries' : 'lb_current_top_roasteries');

    renderTopCoffees(ratings);
    renderTopRoasteries(ratings);

    const finalEl = $('#final-sections');
    if (ended) {
      renderBestByCategory(ratings);
      renderMostDivisive(ratings);
      renderMostConsistent(ratings);
      renderBestByOrigin(ratings);
      renderBestByProcess(ratings);
      renderCityBattle(ratings);
      renderFancyVsProle(ratings);
      show(finalEl);
    } else {
      hide(finalEl);
    }
  }

  function getOverall(rating) {
    return parseFloat(rating.overall) || 0;
  }

  function renderTopCoffees(ratings) {
    const bySample = {};
    ratings.forEach(r => {
      const sn = r.sample_number;
      if (!bySample[sn]) bySample[sn] = [];
      bySample[sn].push(r);
    });

    const coffeeScores = Object.entries(bySample).map(([sn, rList]) => {
      const avg = rList.reduce((s, r) => s + getOverall(r), 0) / rList.length;
      const coffee = findCoffeeBySample(parseInt(sn, 10));
      return {
        sample: sn,
        name: coffee ? getCoffeeName(coffee) : `#${sn}`,
        roastery: coffee ? (coffee.roastery_en || coffee.roastery || '') : '',
        avg: avg,
        count: rList.length,
      };
    });

    coffeeScores.sort((a, b) => b.avg - a.avg);

    $('#top-coffees').innerHTML = coffeeScores.slice(0, 10).map((c, i) => `
      <div class="ranking-item">
        <div class="ranking-position">${i + 1}</div>
        <div class="ranking-info">
          <div class="ranking-name">${c.name}</div>
          <div class="ranking-sub">${c.roastery} · ${I18N.tpl('lb_rating_count', { n: c.count })}</div>
        </div>
        <div class="ranking-score">${c.avg.toFixed(1)}<small>/9</small></div>
      </div>
    `).join('');
  }

  function renderTopRoasteries(ratings) {
    const byRoastery = {};
    ratings.forEach(r => {
      const coffee = findCoffeeBySample(parseInt(r.sample_number, 10));
      if (!coffee) return;
      const key = coffee.roastery_en || coffee.roastery || 'Unknown';
      if (!byRoastery[key]) byRoastery[key] = { ratings: [], city: coffee.city || '', district: coffee.district || '' };
      byRoastery[key].ratings.push(r);
    });

    const roasteryScores = Object.entries(byRoastery).map(([name, data]) => ({
      name,
      city: data.city,
      district: data.district,
      avg: data.ratings.reduce((s, r) => s + getOverall(r), 0) / data.ratings.length,
      count: data.ratings.length,
    }));

    roasteryScores.sort((a, b) => b.avg - a.avg);

    $('#top-roasteries').innerHTML = roasteryScores.slice(0, 10).map((r, i) => `
      <div class="ranking-item">
        <div class="ranking-position">${i + 1}</div>
        <div class="ranking-info">
          <div class="ranking-name">${r.name}</div>
          <div class="ranking-sub">${I18N.geo(r.city)}${r.district ? ', ' + I18N.geo(r.district) : ''} · ${I18N.tpl('lb_rating_count', { n: r.count })}</div>
        </div>
        <div class="ranking-score">${r.avg.toFixed(1)}<small>/9</small></div>
      </div>
    `).join('');
  }

  function renderBestByCategory(ratings) {
    const html = CATEGORIES.map(cat => {
      const bySample = {};
      ratings.forEach(r => {
        const sn = r.sample_number;
        if (!bySample[sn]) bySample[sn] = [];
        bySample[sn].push(parseFloat(r[cat.key]) || 0);
      });

      let best = { sample: '', avg: 0, name: '', roastery: '' };
      Object.entries(bySample).forEach(([sn, scores]) => {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        if (avg > best.avg) {
          const coffee = findCoffeeBySample(parseInt(sn, 10));
          best = {
            sample: sn,
            avg,
            name: coffee ? getCoffeeName(coffee) : `#${sn}`,
            roastery: coffee ? (coffee.roastery_en || coffee.roastery || '') : '',
          };
        }
      });

      const sub = [best.roastery, best.name].filter(Boolean).join(' · ');
      return `
        <div class="ranking-item">
          <div class="ranking-info">
            <div class="ranking-name">${catLabel(cat)}</div>
            <div class="ranking-sub">${sub}</div>
          </div>
          <div class="ranking-score">${best.avg.toFixed(1)}<small>/9</small></div>
        </div>
      `;
    }).join('');

    $('#best-by-category').innerHTML = html;
  }

  function stdDev(arr) {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
  }

  function getCoffeeVariance(ratings) {
    const bySample = {};
    ratings.forEach(r => {
      const sn = r.sample_number;
      if (!bySample[sn]) bySample[sn] = [];
      bySample[sn].push(getOverall(r));
    });

    return Object.entries(bySample)
      .filter(([, scores]) => scores.length >= 2)
      .map(([sn, scores]) => {
        const coffee = findCoffeeBySample(parseInt(sn, 10));
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        return {
          sample: sn,
          name: coffee ? getCoffeeName(coffee) : `#${sn}`,
          roastery: coffee ? (coffee.roastery_en || coffee.roastery || '') : '',
          avg,
          std: stdDev(scores),
          count: scores.length,
        };
      });
  }

  function renderMostDivisive(ratings) {
    const items = getCoffeeVariance(ratings).sort((a, b) => b.std - a.std);
    $('#most-divisive').innerHTML = items.slice(0, 5).map((c, i) => `
      <div class="ranking-item">
        <div class="ranking-position">${i + 1}</div>
        <div class="ranking-info">
          <div class="ranking-name">${c.name}</div>
          <div class="ranking-sub">${c.roastery} · ${c.avg.toFixed(1)}/9 · ${I18N.tpl('lb_std', { n: c.std.toFixed(2) })}</div>
        </div>
        <div class="ranking-score">${c.std.toFixed(1)}</div>
      </div>
    `).join('');
  }

  function renderMostConsistent(ratings) {
    const items = getCoffeeVariance(ratings).sort((a, b) => a.std - b.std);
    $('#most-consistent').innerHTML = items.slice(0, 5).map((c, i) => `
      <div class="ranking-item">
        <div class="ranking-position">${i + 1}</div>
        <div class="ranking-info">
          <div class="ranking-name">${c.name}</div>
          <div class="ranking-sub">${c.roastery} · ${c.avg.toFixed(1)}/9 · ${I18N.tpl('lb_std', { n: c.std.toFixed(2) })}</div>
        </div>
        <div class="ranking-score">${c.avg.toFixed(1)}<small>/9</small></div>
      </div>
    `).join('');
  }

  function renderBestByOrigin(ratings) {
    const byOrigin = {};
    ratings.forEach(r => {
      const coffee = findCoffeeBySample(parseInt(r.sample_number, 10));
      if (!coffee || !coffee.origin_country) return;
      const key = coffee.origin_country.startsWith('Blend') ? 'Blend' : coffee.origin_country;
      if (!byOrigin[key]) byOrigin[key] = [];
      byOrigin[key].push(getOverall(r));
    });

    const originScores = Object.entries(byOrigin).map(([origin, scores]) => ({
      name: I18N.geo(origin),
      avg: scores.reduce((a, b) => a + b, 0) / scores.length,
      count: scores.length,
    }));

    originScores.sort((a, b) => b.avg - a.avg);

    $('#best-by-origin').innerHTML = originScores.slice(0, 10).map((o, i) => `
      <div class="ranking-item">
        <div class="ranking-position">${i + 1}</div>
        <div class="ranking-info">
          <div class="ranking-name">${o.name}</div>
          <div class="ranking-sub">${I18N.tpl('lb_rating_count', { n: o.count })}</div>
        </div>
        <div class="ranking-score">${o.avg.toFixed(1)}<small>/9</small></div>
      </div>
    `).join('');
  }

  function renderBestByProcess(ratings) {
    const byProcess = {};
    ratings.forEach(r => {
      const coffee = findCoffeeBySample(parseInt(r.sample_number, 10));
      if (!coffee || !coffee.process) return;
      const key = coffee.process;
      if (!byProcess[key]) byProcess[key] = [];
      byProcess[key].push(getOverall(r));
    });

    const processScores = Object.entries(byProcess).map(([process, scores]) => ({
      name: I18N.geo(process),
      avg: scores.reduce((a, b) => a + b, 0) / scores.length,
      count: scores.length,
    }));

    processScores.sort((a, b) => b.avg - a.avg);

    $('#best-by-process').innerHTML = processScores.slice(0, 10).map((p, i) => `
      <div class="ranking-item">
        <div class="ranking-position">${i + 1}</div>
        <div class="ranking-info">
          <div class="ranking-name">${p.name}</div>
          <div class="ranking-sub">${I18N.tpl('lb_rating_count', { n: p.count })}</div>
        </div>
        <div class="ranking-score">${p.avg.toFixed(1)}<small>/9</small></div>
      </div>
    `).join('');
  }

  function renderBattleCard(container, left, right) {
    const leftWins = left.avg > right.avg;
    const rightWins = right.avg > left.avg;
    container.innerHTML = `
      <div class="battle-side${leftWins ? ' winner' : ''}">
        <div class="battle-name">${left.name}</div>
        <div class="battle-score">${left.avg.toFixed(1)}<small>/9</small></div>
        <div class="battle-count">${I18N.tpl('lb_rating_count', { n: left.count })}</div>
      </div>
      <div class="battle-vs">${I18N.t('lb_vs')}</div>
      <div class="battle-side${rightWins ? ' winner' : ''}">
        <div class="battle-name">${right.name}</div>
        <div class="battle-score">${right.avg.toFixed(1)}<small>/9</small></div>
        <div class="battle-count">${I18N.tpl('lb_rating_count', { n: right.count })}</div>
      </div>
    `;
  }

  function renderCityBattle(ratings) {
    const byCity = {};
    ratings.forEach(r => {
      const coffee = findCoffeeBySample(parseInt(r.sample_number, 10));
      if (!coffee || !coffee.city) return;
      if (!byCity[coffee.city]) byCity[coffee.city] = [];
      byCity[coffee.city].push(getOverall(r));
    });

    const cities = Object.entries(byCity).map(([city, scores]) => ({
      name: I18N.geo(city),
      avg: scores.reduce((a, b) => a + b, 0) / scores.length,
      count: scores.length,
    }));

    cities.sort((a, b) => b.count - a.count);
    if (cities.length >= 2) {
      renderBattleCard($('#city-battle'), cities[0], cities[1]);
    }
  }

  function renderFancyVsProle(ratings) {
    const groups = { fancy: [], prole: [] };
    ratings.forEach(r => {
      const coffee = findCoffeeBySample(parseInt(r.sample_number, 10));
      if (!coffee) return;
      if (coffee.look_like_tax_avoidance === 'Yes') {
        groups.fancy.push(getOverall(r));
      } else {
        groups.prole.push(getOverall(r));
      }
    });

    if (!groups.fancy.length || !groups.prole.length) {
      hide($('#fancy-vs-prole'));
      return;
    }

    const fancy = {
      name: I18N.t('lb_fancy'),
      avg: groups.fancy.reduce((a, b) => a + b, 0) / groups.fancy.length,
      count: groups.fancy.length,
    };
    const prole = {
      name: I18N.t('lb_proletarian'),
      avg: groups.prole.reduce((a, b) => a + b, 0) / groups.prole.length,
      count: groups.prole.length,
    };

    renderBattleCard($('#fancy-vs-prole'), fancy, prole);
  }

  function initLeaderboard() {
    $('#btn-refresh-leaderboard').addEventListener('click', loadLeaderboard);
  }

  // ── User badge (change user) ───────────────────────────────
  function initUserBadge() {
    $('#user-badge').addEventListener('click', () => {
      localStorage.removeItem('cupping_user');
      currentUser = null;
      hide($('#user-badge'));
      hide($('#main-nav'));
      resetRateForm();
      navigate('welcome');
    });
  }

  // ── Nav ────────────────────────────────────────────────────
  function initNav() {
    $$('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const page = btn.dataset.page;
        navigate(page);
        if (page === 'leaderboard') loadLeaderboard();
        if (page === 'map') loadMap();
      });
    });
  }

  function refreshNames() {
    if (currentUser) {
      $('#user-badge').textContent = I18N.name(currentUser);
    }
    $$('#participant-select option').forEach(opt => {
      if (opt.value) opt.textContent = I18N.name(opt.value);
    });
  }

  // ── Locale toggle ──────────────────────────────────────────
  function initLocaleToggle() {
    const sel = $('#locale-toggle');
    if (!sel) return;

    I18N.allLocales().forEach(l => {
      const opt = document.createElement('option');
      opt.value = l.code;
      opt.textContent = l.label;
      sel.appendChild(opt);
    });
    sel.value = I18N.locale();

    sel.addEventListener('change', () => {
      I18N.setLocale(sel.value);
      refreshNames();
      const activePage = $('.page.active');
      if (activePage) {
        const pageId = activePage.id.replace('page-', '');
        if (pageId === 'leaderboard') loadLeaderboard();
        if (pageId === 'map') loadMap();
      }
    });
  }

  // ── Init ───────────────────────────────────────────────────
  async function init() {
    await loadCoffees();
    I18N.apply();
    initLocaleToggle();
    initWelcome();
    initRate();
    initRatingForm();
    renderDrinkingOrder();
    initReveal();
    initLeaderboard();
    initUserBadge();
    initNav();
  }

  init();
})();
