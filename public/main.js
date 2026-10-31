const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const LAYER_LABELS = { erased: "Стёрто", forgotten: "Забыто", returned: "Возвращено" };
const MAP_BOUNDS = [[35.76, 56.785], [36.005, 56.915]];

let places = [];
let activeLayer = "all";
let sortMode = "priority";
let mapInstance;
const MAP_GLYPHS = {
  otroch: '<path d="M19 38h26M22 38V28h20v10M22 27l10-8 10 8M32 19v-5m-3 2.5h6M27 38v-6h10v6"/>',
  zheltikov: '<path d="M18 38h28M21 38V30a11 11 0 0 1 22 0v8M25 38v-8h14v8M30 22v-6h4v6M32 16v-4m-3 2h6"/>',
  cathedral: '<path d="M17 38h30M20 38V31h24v7M20 30a5.5 5.5 0 0 1 11 0M31 30a5.5 5.5 0 0 1 11 0M25.5 24v-4m-2 2h4m9 2v-4m-2 2h4"/>',
  catholic: '<path d="M18 38h28M23 38V27l9-10 9 10v11M28 38v-8h8v8M32 17v-5m-3 2.5h6"/>',
  mosque: '<path d="M17 38h30M22 38V31a10 10 0 0 1 20 0v7M25 38v-6h14v6M43 38V24m-2 0 2-4 2 4m-3-1h2M34 21a4 4 0 1 0 3 6 3.3 3.3 0 0 1-3-6"/>'
};

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function isMain(place) {
  return place.priority === "main";
}

function layerNames(place) {
  return (place.layers || []).map(layer => LAYER_LABELS[layer] || layer).join(" · ");
}

function updatePlaceCounts(visibleCount = places.length) {
  const total = places.length;
  const lastTwo = total % 100;
  const last = total % 10;
  const word = lastTwo >= 11 && lastTwo <= 14 ? "мест" : last === 1 ? "место" : last >= 2 && last <= 4 ? "места" : "мест";
  $$('[data-count-total]').forEach(node => { node.textContent = `${total} ${word}`; });
  const count = $("#collection-count");
  if (count) count.textContent = `${visibleCount} ${visibleCount === 1 ? "место" : "мест"}`;
}

function attachImageFallbacks(scope = document) {
  $$('img[data-fallback]', scope).forEach(image => {
    image.addEventListener("error", () => {
      if (!image.dataset.fallback || image.dataset.fallbackUsed === "true") return;
      image.dataset.fallbackUsed = "true";
      image.src = image.dataset.fallback;
    }, { once: true });
  });
}

function monasteryPhotoPair(place, context = "card") {
  if (!place.archivePhoto) return "";
  const photos = [
    { src: place.archivePhoto, fallback: place.archiveFallback, alt: place.archiveAlt, credit: place.archiveCredit, source: place.archiveSource, label: "Раньше" },
    { src: place.photo, fallback: place.photoFallback, alt: place.photoAlt, credit: place.photoCredit, source: place.photoSource, label: "Сейчас" }
  ];
  return `<div class="${context}-photo-pair" role="group" aria-label="Фотографии ${escapeHtml(place.name)}: раньше и сейчас">${photos.map((photo, index) => `<figure class="${context}-photo-item">
      <img src="${escapeHtml(photo.src)}" data-fallback="${escapeHtml(photo.fallback || photo.src)}" alt="${escapeHtml(photo.alt || place.name)}" loading="lazy">
      ${context === "card" && index === 0 ? `<span class="card-number">${escapeHtml(place.number)}</span>` : ""}
      <figcaption><span class="photo-era">${photo.label}</span><span class="photo-era-credit">${escapeHtml(photo.credit || "")}</span>${photo.source ? `<a href="${escapeHtml(photo.source)}" target="_blank" rel="noopener">Фото ↗</a>` : ""}</figcaption>
    </figure>`).join("")}</div>`;
}

function sortedVisiblePlaces() {
  const visible = places.filter(place => activeLayer === "all" || (place.layers || []).includes(activeLayer));
  if (sortMode === "name") {
    visible.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  } else if (sortMode === "archive") {
    visible.sort((a, b) => Number(Boolean(b.archiveSource)) - Number(Boolean(a.archiveSource)) || a.name.localeCompare(b.name, "ru"));
  } else {
    visible.sort((a, b) => Number(isMain(b)) - Number(isMain(a)) || a.number.localeCompare(b.number, "ru"));
  }
  return visible;
}

function renderPlaceCard(place) {
  const photoSource = place.photoSource || place.sources?.[0]?.url || "#places";
  const historicalSource = place.sources?.[0];
  return `<article class="place-card ${isMain(place) ? "is-main-place" : "is-additional-place"}" id="place-${escapeHtml(place.id)}">
    ${place.archivePhoto ? monasteryPhotoPair(place, "card") : `<figure class="place-card-figure">
      <img src="${escapeHtml(place.photo)}" data-fallback="${escapeHtml(place.photoFallback || place.photo)}" alt="${escapeHtml(place.photoAlt || place.name)}" loading="lazy">
      <span class="card-number">${escapeHtml(place.number)}</span>
      <figcaption class="photo-credit"><span>${escapeHtml(place.photoCredit || "Фото: источник в карточке")}</span><a href="${escapeHtml(photoSource)}" target="_blank" rel="noopener" aria-label="Источник фотографии ${escapeHtml(place.name)}">Фото ↗</a></figcaption>
    </figure>`}
    <div class="place-card-body">
      <div class="place-card-meta"><span class="place-priority ${isMain(place) ? "priority-main" : "priority-additional"}">${isMain(place) ? "Основное" : "Дополнительное"}</span><span class="place-layers">${escapeHtml(layerNames(place))}</span></div>
      <h3>${escapeHtml(place.name)}</h3>
      <p class="place-card-copy">${escapeHtml(place.lead)}</p>
      <div class="place-card-links">
        ${historicalSource ? `<a href="${escapeHtml(historicalSource.url)}" target="_blank" rel="noopener">Источник ↗</a>` : ""}
        ${place.archiveSource ? `<a href="${escapeHtml(place.archiveSource)}" target="_blank" rel="noopener">Архив ↗</a>` : ""}
        <button type="button" data-select-place="${escapeHtml(place.id)}">3D и аудио <span aria-hidden="true">↗</span></button>
      </div>
    </div>
  </article>`;
}

function renderPlaces() {
  const root = $("#places-grid");
  const visible = sortedVisiblePlaces();
  root.innerHTML = visible.length
    ? visible.map(renderPlaceCard).join("")
    : '<p class="empty-collection">В этом разделе пока нет мест.</p>';
  attachImageFallbacks(root);
  updatePlaceCounts(visible.length);
  $$('[data-select-place]', root).forEach(button => button.addEventListener("click", () => selectExperience(button.dataset.selectPlace, true)));
}

function populateExperiencePicker() {
  const picker = $("#experience-picker");
  picker.innerHTML = places.map(place => `<option value="${escapeHtml(place.id)}">${escapeHtml(place.name)}</option>`).join("");
  const initial = places.find(place => isMain(place)) || places[0];
  if (initial) selectExperience(initial.id, false);
}

function selectExperience(id, scroll = false) {
  const place = places.find(item => item.id === id);
  if (!place) return;
  const picker = $("#experience-picker");
  if (picker) picker.value = place.id;
  $("#experience-audio-title").textContent = place.name;
  $("#experience-audio-status").textContent = `Аудиозапись для этого места появится позже.`;
  window.__selectedPlaceId = place.id;
  window.dispatchEvent(new CustomEvent("place-selected", { detail: { id: place.id } }));
  if (scroll) $("#experience").scrollIntoView({ behavior: "smooth", block: "start" });
}

function setupCollectionControls() {
  $$('.filter-chip').forEach(button => button.addEventListener("click", () => {
    activeLayer = button.dataset.layer || "all";
    $$('.filter-chip').forEach(item => {
      const selected = item === button;
      item.classList.toggle("is-active", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
    renderPlaces();
  }));
  $("#places-sort")?.addEventListener("change", event => {
    sortMode = event.currentTarget.value;
    renderPlaces();
  });
  $("#experience-picker")?.addEventListener("change", event => selectExperience(event.currentTarget.value, false));
  window.addEventListener("open-place-experience", event => selectExperience(event.detail?.id, true));
}

function setupMobileNav() {
  const toggle = $(".menu-toggle");
  const menu = $("#mobile-nav");
  if (!toggle || !menu) return;
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
    menu.hidden = !open;
  });
  $$('a', menu).forEach(link => link.addEventListener("click", () => {
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Открыть меню");
    menu.hidden = true;
  }));
}

function pinSvg(icon, priority) {
  const fill = priority === "main" ? "#254f6d" : "#b84b3d";
  const glyph = MAP_GLYPHS[icon] || MAP_GLYPHS.otroch;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="88" viewBox="0 0 72 88">
    <path d="M36 84C28 72 8 49 8 31a28 28 0 1 1 56 0c0 18-20 41-28 53Z" fill="#182833" opacity=".16" transform="translate(0 2)"/>
    <path d="M36 81C28 69 8 47 8 30a28 28 0 1 1 56 0c0 17-20 39-28 51Z" fill="${fill}" stroke="#fffdf8" stroke-width="3"/>
    <circle cx="36" cy="29" r="18" fill="#fffdf8"/>
    <g fill="none" stroke="#183b53" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>
  </svg>`;
}

async function addMapPinImages() {
  const iconTypes = [...new Set(places.map(place => MAP_GLYPHS[place.mapIcon] ? place.mapIcon : "otroch"))];
  const images = iconTypes.flatMap(icon => ["main", "additional"].map(priority => ({
    id: `pin-${icon}-${priority}`,
    svg: pinSvg(icon, priority)
  })));
  await Promise.all(images.map(({ id, svg }) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        if (!mapInstance.hasImage(id)) mapInstance.addImage(id, image, { pixelRatio: 2 });
        resolve();
      } catch (error) { reject(error); }
    };
    image.onerror = () => reject(new Error(`Не удалось загрузить иконку ${id}`));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  })));
}

function renderMapPlacePanel(place) {
  const panel = $("#map-place-panel");
  const content = $("#map-place-panel-content");
  if (!panel || !content) return;
  const source = place.sources?.[0];
  const main = isMain(place);
  content.innerHTML = `${place.archivePhoto ? monasteryPhotoPair(place, "map") : `<figure class="map-place-panel-photo">
      <img src="${escapeHtml(place.photo)}" data-fallback="${escapeHtml(place.photoFallback || place.photo)}" alt="${escapeHtml(place.photoAlt || place.name)}">
      <figcaption>${escapeHtml(place.photoCredit || "")}</figcaption>
    </figure>`}
    <div class="map-place-panel-copy">
      <div class="map-place-panel-meta"><span class="${main ? "priority-main" : "priority-additional"}">${main ? "Основное место" : "Дополнительное место"}</span><span>${escapeHtml(place.status || "")}</span></div>
      <h3 id="map-place-panel-title">${escapeHtml(place.name)}</h3>
      <p>${escapeHtml(place.lead || "")}</p>
      <div class="map-place-panel-actions"><a href="#place-${encodeURIComponent(place.id)}">Подробнее</a><button type="button" data-open-place-experience>3D и аудио ↗</button></div>
      <div class="map-place-panel-sources">${source ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener">Источник ↗</a>` : ""}${place.archiveSource ? `<a href="${escapeHtml(place.archiveSource)}" target="_blank" rel="noopener">Архив ↗</a>` : ""}</div>
    </div>`;
  panel.hidden = false;
  panel.setAttribute("aria-labelledby", "map-place-panel-title");
  attachImageFallbacks(content);
  $(`[data-open-place-experience]`, content)?.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("open-place-experience", { detail: { id: place.id } }));
  });
}

function closeMapPlacePanel() {
  const panel = $("#map-place-panel");
  if (panel) panel.hidden = true;
}

function setupExcursionForm() {
  const form = $("#excursion-form");
  const status = $("#excursion-form-status");
  if (!form || !status) return;
  form.addEventListener("submit", event => {
    event.preventDefault();
    const name = new FormData(form).get("name").toString().trim();
    status.classList.add("excursion-form-status--success");
    status.textContent = `Спасибо, ${name}! Это демонстрация: заявка пока не отправлена. Контакты проекта добавим, когда получим их от владельца.`;
  });
}

async function initMap() {
  const mapNode = $("#tver-map");
  const status = $("#map-loading");
  try {
    const maplibre = await import("./assets/vendor/maplibre/maplibre-gl.mjs");
    mapInstance = new maplibre.Map({
      container: mapNode,
      style: "https://tiles.openfreemap.org/styles/bright",
      bounds: MAP_BOUNDS,
      maxBounds: MAP_BOUNDS,
      minZoom: 11.3,
      maxZoom: 17,
      maxPitch: 0,
      dragRotate: false,
      touchPitch: false,
      renderWorldCopies: false,
      attributionControl: true,
      cooperativeGestures: true,
      pitchWithRotate: false
    });
    mapInstance.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-left");
    mapInstance.scrollZoom.disable();
    let mapReady = false;
    const loadingTimeout = window.setTimeout(() => {
      if (!mapReady && status) {
        status.hidden = false;
        status.classList.add("map-loading--error");
        status.textContent = "Карта временно недоступна. Обновите страницу позже.";
      }
    }, 14000);
    mapInstance.on("load", async () => {
      mapReady = true;
      window.clearTimeout(loadingTimeout);
      if (status) status.hidden = true;
      let customPinsReady = false;
      try {
        await addMapPinImages();
        customPinsReady = true;
      } catch (error) {
        console.warn("Не удалось загрузить SVG-иконки карты, используется запасной маркер:", error);
      }
      const features = places.map(place => ({
        type: "Feature",
        properties: {
          id: place.id,
          name: place.name,
          number: place.number,
          priority: place.priority,
          iconId: `pin-${MAP_GLYPHS[place.mapIcon] ? place.mapIcon : "otroch"}-${isMain(place) ? "main" : "additional"}`
        },
        geometry: { type: "Point", coordinates: [place.coordinates[1], place.coordinates[0]] }
      }));
      mapInstance.addSource("places", {
        type: "geojson",
        data: { type: "FeatureCollection", features },
        cluster: true,
        clusterMaxZoom: 15,
        clusterRadius: 44
      });
      mapInstance.addLayer({
        id: "place-clusters",
        type: "circle",
        source: "places",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#243f55",
          "circle-radius": ["step", ["get", "point_count"], 17, 10, 21, 25, 25],
          "circle-stroke-width": 3,
          "circle-stroke-color": "#fffdf8"
        }
      });
      mapInstance.addLayer({
        id: "place-cluster-count",
        type: "symbol",
        source: "places",
        filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Regular"], "text-size": 12 },
        paint: { "text-color": "#ffffff" }
      });
      if (customPinsReady) {
        mapInstance.addLayer({
          id: "place-points",
          type: "symbol",
          source: "places",
          filter: ["!", ["has", "point_count"]],
          layout: {
            "icon-image": ["get", "iconId"],
            "icon-anchor": "bottom",
            "icon-size": ["interpolate", ["linear"], ["zoom"], 11, 0.72, 16, 0.96],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            "icon-padding": 2
          }
        });
      } else {
        mapInstance.addLayer({
          id: "place-points",
          type: "circle",
          source: "places",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": ["match", ["get", "priority"], "main", "#254f6d", "#b84b3d"],
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 9, 16, 14],
            "circle-stroke-width": 3,
            "circle-stroke-color": "#fffdf8"
          }
        });
      }
      mapInstance.on("click", "place-clusters", async event => {
        const feature = event.features?.[0];
        if (!feature) return;
        const source = mapInstance.getSource("places");
        try {
          const zoom = await source.getClusterExpansionZoom(feature.properties.cluster_id);
          mapInstance.easeTo({ center: feature.geometry.coordinates, zoom: Math.min(zoom, 16), duration: 420 });
        } catch (error) {
          console.warn("Не удалось раскрыть кластер карты:", error);
        }
      });
      mapInstance.on("click", "place-points", event => {
        const feature = event.features?.[0];
        const place = places.find(item => item.id === feature?.properties?.id);
        if (place) renderMapPlacePanel(place);
      });
      ["place-clusters", "place-points"].forEach(layer => {
        mapInstance.on("mouseenter", layer, () => { mapInstance.getCanvas().style.cursor = "pointer"; });
        mapInstance.on("mouseleave", layer, () => { mapInstance.getCanvas().style.cursor = ""; });
      });
      const bounds = new maplibre.LngLatBounds();
      places.forEach(place => bounds.extend([place.coordinates[1], place.coordinates[0]]));
      if (!bounds.isEmpty()) {
        mapInstance.fitBounds(bounds, {
          padding: window.innerWidth < 650 ? 54 : 76,
          maxZoom: 12.7,
          duration: 0
        });
      }
    });
    mapInstance.on("error", event => {
      if (event?.error) console.warn("Ошибка карты:", event.error.message || event.error);
    });
  } catch (error) {
    console.error("MapLibre не загрузился:", error);
    if (status) {
      status.hidden = false;
      status.classList.add("map-loading--error");
      status.textContent = "Не удалось загрузить карту. Проверьте подключение и обновите страницу.";
    }
  }
}

async function start() {
  attachImageFallbacks();
  setupMobileNav();
  setupExcursionForm();
  $("#map-panel-close")?.addEventListener("click", closeMapPlacePanel);
  try {
    const response = await fetch("./data/places.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    places = await response.json();
    setupCollectionControls();
    renderPlaces();
    populateExperiencePicker();
    await initMap();
    const requested = new URL(window.location.href).searchParams.get("place");
    if (places.some(place => place.id === requested)) {
      selectExperience(requested, false);
    }
  } catch (error) {
    console.error("Не удалось загрузить места:", error);
    $("#places-grid").innerHTML = '<p class="empty-collection">Не удалось загрузить список мест. Обновите страницу.</p>';
    if ($("#map-loading")) $("#map-loading").textContent = "Список мест пока не загрузился.";
  }
}

document.addEventListener("DOMContentLoaded", start);
