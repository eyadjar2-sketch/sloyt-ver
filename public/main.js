const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

const ROUTE_ORDER = ["otroch", "zheltikov", "cathedral", "catholic", "mosque"];
const LAYER_LABELS = { erased: "Стёрто", forgotten: "Забыто", returned: "Возвращено" };
const MAP_ICONS = {
  otroch: `<svg viewBox="0 0 48 48"><path d="M8 38h32M12 38V23h24v15M18 23v-5h12v5M16 17c0-6 4-10 8-12 4 2 8 6 8 12H16Z"/><path d="M24 5V1m-3 4h6M18 29v4m12-4v4"/></svg>`,
  zheltikov: `<svg viewBox="0 0 48 48"><path d="M6 39h36M10 39V20h11v19m6 0V15h11v24M13 20v-5l2.5-4L18 15v5m10-5V9l4-5 4 5v6M30 24h4m-4 6h4"/><path d="M32 4V1m-2 3h4"/></svg>`,
  cathedral: `<svg viewBox="0 0 48 48"><path d="M5 39h38M9 39V24h30v15M16 24V17h16v7M12 17c0-4 3-7 6-9 3 2 6 5 6 9H12Zm12 0c0-6 4-10 8-13 4 3 8 7 8 13H24Z"/><path d="M32 4V1m-2 3h4M18 29v4m12-4v4"/></svg>`,
  catholic: `<svg viewBox="0 0 48 48"><path d="M7 39h34M13 39V17h22v22M18 17l6-8 6 8M21 25v14m10-14v14M24 9V2m-3 4h6"/><path d="M18 17h12"/></svg>`,
  mosque: `<svg viewBox="0 0 48 48"><path d="M7 39h34M11 39V23h26v16M14 23c0-6 4-10 10-13 6 3 10 7 10 13H14Zm-3 0V9h5v14m17 0V6h5v17M12 9h3m18-3h3"/><path d="M24 10c-3 2-5 5-5 8 3 1 6 0 8-2-2 0-3-2-3-4 0-1 0-1 0-2Z"/></svg>`
};

let places = [];
let selectedPlaceId = "otroch";
let routeVisible = false;
let activeLayer = "all";
let map;
let routeLine;
let mapMarkers = [];

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
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

function isMain(place) {
  return place.priority === "main";
}

function priorityLabel(place) {
  return isMain(place) ? "Основной храм" : "Дополнительный храм";
}

function layerNames(place) {
  return (place.layers || []).map(layer => LAYER_LABELS[layer] || layer).join(" · ");
}

function updatePlaceCounts() {
  const total = places.length;
  const main = places.filter(isMain).length;
  const additional = total - main;
  const lastTwo = total % 100;
  const last = total % 10;
  const word = lastTwo >= 11 && lastTwo <= 14 ? "мест" : last === 1 ? "место" : last >= 2 && last <= 4 ? "места" : "мест";
  $$('[data-count-total]').forEach(node => { node.textContent = `${total} ${word}`; });
  $$('[data-count-main]').forEach(node => { node.textContent = String(main); });
  $$('[data-count-additional]').forEach(node => { node.textContent = String(additional); });
}

function photoCredit(place, archive = false) {
  const author = archive ? place.archiveCredit : place.photoCredit;
  const source = archive ? place.archiveSource : place.photoSource;
  return `<div class="photo-credit"><span>${escapeHtml(author || "Источник указан в карточке")}</span><a href="${escapeHtml(source || "#sources")}" target="_blank" rel="noopener">Источник ↗</a></div>`;
}

function renderStoryLinks() {
  $$('[data-focus]').forEach(link => link.addEventListener("click", () => {
    const id = link.dataset.focus;
    if (id) window.setTimeout(() => selectPlace(id, true), 120);
  }));
}

function renderPlaces() {
  const root = $("#places-grid");
  root.innerHTML = places.map(place => `
    <article class="place-card ${isMain(place) ? "is-main-place" : "is-additional-place"}" id="place-${escapeHtml(place.id)}">
      <div class="place-card-media">
        <img src="${escapeHtml(place.photo)}" data-fallback="${escapeHtml(place.photoFallback)}" alt="${escapeHtml(place.photoAlt)}" loading="lazy">
        <span>${escapeHtml(place.status)}</span>
      </div>
      ${photoCredit(place)}
      <div class="place-card-body">
        <div class="place-card-meta"><span>${escapeHtml(place.number)}</span><span class="place-priority ${isMain(place) ? "priority-main" : "priority-additional"}">${escapeHtml(priorityLabel(place))}</span></div>
        <h3>${escapeHtml(place.name)}</h3>
        <p class="place-address">${escapeHtml(place.address)}</p>
        <p class="place-card-copy">${escapeHtml(place.lead)}</p>
        <button class="place-card-open" type="button" data-select-place="${escapeHtml(place.id)}">О храме · фото · 3D · аудио <span aria-hidden="true">↗</span></button>
        <a class="place-share-link" href="?place=${encodeURIComponent(place.id)}#experience">Постоянная ссылка на храм ↗</a>
      </div>
    </article>`).join("");
  attachImageFallbacks(root);
  $$('[data-select-place]', root).forEach(button => button.addEventListener("click", () => {
    selectPlace(button.dataset.selectPlace, true);
    $("#experience").scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}

function renderArchives() {
  const root = $("#archive-grid");
  const archived = places.filter(place => place.archivePhoto);
  root.innerHTML = archived.map(place => `
    <article class="archive-card">
      <figure>
        <img src="${escapeHtml(place.archivePhoto)}" data-fallback="${escapeHtml(place.archiveFallback)}" alt="${escapeHtml(place.archiveAlt)}" loading="lazy">
        <figcaption class="archive-card-body">
          <strong>${escapeHtml(place.archiveCaption)}</strong>
          <p>${escapeHtml(place.name)} · историческая фотография</p>
          <small>${escapeHtml(place.archiveCredit)} · <a href="${escapeHtml(place.archiveSource)}" target="_blank" rel="noopener">страница файла ↗</a></small>
        </figcaption>
      </figure>
    </article>`).join("");
  attachImageFallbacks(root);
}

function renderSources() {
  const root = $("#sources-list");
  root.innerHTML = places.map(place => `
    <details>
      <summary>${escapeHtml(place.number)} · ${escapeHtml(place.name)}</summary>
      <ul>${(place.sources || []).map(source => `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener">${escapeHtml(source.title)}</a></li>`).join("")}
      <li><a href="${escapeHtml(place.photoSource)}" target="_blank" rel="noopener">Фотография: ${escapeHtml(place.photoCredit)}</a></li>
      ${place.archiveSource ? `<li><a href="${escapeHtml(place.archiveSource)}" target="_blank" rel="noopener">Архивный снимок: ${escapeHtml(place.archiveCredit)}</a></li>` : ""}
      </ul>
    </details>`).join("");
}

function renderExperience(place) {
  if (!place) return;
  const image = $("#experience-image");
  image.src = place.photo;
  image.dataset.fallback = place.photoFallback;
  image.dataset.fallbackUsed = "false";
  image.alt = place.photoAlt;
  attachImageFallbacks($("#experience-overview"));

  $("#experience-photo-caption").textContent = place.photoCaption || place.photoAlt;
  $("#experience-photo-credit").textContent = place.photoCredit || "";
  const priority = $("#experience-priority");
  priority.textContent = priorityLabel(place);
  priority.className = `place-priority ${isMain(place) ? "priority-main" : "priority-additional"}`;
  $("#experience-status").textContent = place.status;
  $("#experience-layer").textContent = layerNames(place);
  $("#experience-type").textContent = place.type;
  $("#experience-name").textContent = place.fullName || place.name;
  $("#experience-address").textContent = place.address;
  $("#experience-lead").textContent = place.description;
  $("#experience-history-text").textContent = place.history;
  $("#experience-address-note").textContent = `${place.addressNote} Перед посещением уточните режим доступа.`;

  const sourceLink = $("#experience-source-link");
  sourceLink.href = place.sources?.[0]?.url || "#sources";
  sourceLink.textContent = "История и источники ↗";
  sourceLink.target = "_blank";
  sourceLink.rel = "noopener";

  const currentIndex = ROUTE_ORDER.indexOf(place.id);
  const nextId = ROUTE_ORDER[(currentIndex + 1) % ROUTE_ORDER.length];
  const nextPlace = places.find(item => item.id === nextId);
  const nextButton = $("#experience-next");
  nextButton.dataset.nextPlace = nextId;
  nextButton.textContent = nextPlace ? `Следующая точка: ${nextPlace.name} →` : "Следующая точка →";
  $("#experience-audio-title").textContent = place.fullName || place.name;
  $("#experience-audio-status").textContent = `Аудиозапись «${place.name}» появится позже.`;

  const picker = $("#experience-picker");
  if (picker) picker.value = place.id;
  window.dispatchEvent(new CustomEvent("place-selected", { detail: { id: place.id } }));
}

function detailMarkup(place) {
  if (!place) return "";
  const currentIndex = ROUTE_ORDER.indexOf(place.id);
  const nextId = ROUTE_ORDER[(currentIndex + 1) % ROUTE_ORDER.length];
  const nextPlace = places.find(item => item.id === nextId);
  return `<div class="map-detail-image">
      <img src="${escapeHtml(place.photo)}" data-fallback="${escapeHtml(place.photoFallback)}" alt="${escapeHtml(place.photoAlt)}" loading="lazy">
      <span>${escapeHtml(place.status)}</span>
    </div>
    <div class="map-detail-body">
      <span class="detail-index">${escapeHtml(place.number)} · ${escapeHtml(layerNames(place))}</span>
      <h3>${escapeHtml(place.name)}</h3>
      <p class="detail-address">${escapeHtml(place.address)}</p>
      <p class="detail-copy">${escapeHtml(place.lead)}</p>
      <div class="detail-actions">
        <a href="#experience" data-open-experience>Фото · история · 3D · аудио ↗</a>
        <a href="?place=${encodeURIComponent(place.id)}#experience">Ссылка для QR ↗</a>
        <button type="button" data-next-place="${escapeHtml(nextId)}">Дальше: ${escapeHtml(nextPlace?.name || "следующее место")} →</button>
      </div>
    </div>`;
}

function renderMapDetail() {
  const place = places.find(item => item.id === selectedPlaceId) || places[0];
  const detail = $("#map-detail");
  if (!detail || !place) return;
  detail.innerHTML = detailMarkup(place);
  attachImageFallbacks(detail);
  const next = $("[data-next-place]", detail);
  if (next) next.addEventListener("click", () => selectPlace(next.dataset.nextPlace, true));
  const openExperience = $("[data-open-experience]", detail);
  if (openExperience) openExperience.addEventListener("click", () => renderExperience(place));
}

function markerClass(place) {
  const priority = isMain(place) ? "marker-main" : "marker-additional";
  const selected = place.id === selectedPlaceId ? "marker-selected" : "";
  const layerState = activeLayer === "all" || place.layers.includes(activeLayer) ? "" : "marker-muted";
  return `${priority} ${selected} ${layerState}`;
}

function createMapMarker(place) {
  const callout = place.id === "catholic" ? "marker-callout-left" : place.id === "mosque" ? "marker-callout-right" : "";
  const icon = L.divIcon({
    className: `temple-marker ${markerClass(place)}`,
    html: `<span class="temple-marker-layout ${callout}"><span class="temple-marker-card"><span class="temple-marker-symbol">${MAP_ICONS[place.id] || MAP_ICONS.cathedral}</span><span class="temple-marker-number">${escapeHtml(place.number)}</span></span></span>`,
    iconSize: [122, 78],
    iconAnchor: [61, 72]
  });
  const marker = L.marker(place.coordinates, {
    icon,
    keyboard: true,
    title: `${priorityLabel(place)}: ${place.name}`,
    alt: `${place.name}, ${priorityLabel(place)}`
  }).addTo(map);
  marker.bindTooltip(`${escapeHtml(place.name)} · ${escapeHtml(priorityLabel(place))}`, { direction: "top", offset: [0, -42] });
  marker.on("click", () => selectPlace(place.id, false));
  mapMarkers.push(marker);
}

function renderMarkers() {
  if (!map || !window.L) return;
  mapMarkers.forEach(marker => map.removeLayer(marker));
  mapMarkers = [];
  if (routeLine) {
    map.removeLayer(routeLine);
    routeLine = undefined;
  }
  places.forEach(createMapMarker);
  if (routeVisible) {
    const routePlaces = ROUTE_ORDER.map(id => places.find(place => place.id === id)).filter(Boolean);
    if (routePlaces.length > 1) {
      routeLine = L.polyline(routePlaces.map(place => place.coordinates), {
        color: "#245ce7", weight: 4, opacity: .88, dashArray: "4 8", lineCap: "round"
      }).addTo(map);
      routeLine.bringToBack();
    }
  }
  renderMapDetail();
}

function updateRouteButton() {
  const button = $("#route-toggle");
  if (!button) return;
  button.setAttribute("aria-pressed", String(routeVisible));
  button.classList.toggle("is-on", routeVisible);
  button.innerHTML = `<span aria-hidden="true">${routeVisible ? "✓" : "↗"}</span> ${routeVisible ? "Скрыть маршрут" : "Показать маршрут"}`;
}

function initMap() {
  const mapNode = $("#tver-map");
  if (!mapNode) return;
  if (!window.L) {
    mapNode.innerHTML = `<div class="map-error">Карта временно недоступна.<a href="https://www.openstreetmap.org/#map=12/56.8589/35.899" target="_blank" rel="noopener">Откройте карту Твери ↗</a></div>`;
    return;
  }
  map = L.map(mapNode, { scrollWheelZoom: false, zoomControl: true, preferCanvas: true }).setView([56.8589, 35.899], 12);
  const tileNotice = document.createElement("div");
  tileNotice.className = "map-feedback";
  tileNotice.hidden = true;
  tileNotice.innerHTML = `Подложка временно не загрузилась. Метки сохранены — <a href="https://www.openstreetmap.org/#map=12/56.8589/35.899" target="_blank" rel="noopener">открыть карту ↗</a>`;
  mapNode.append(tileNotice);
  let failedTiles = 0;
  const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
  });
  tiles.on("tileerror", () => { failedTiles += 1; if (failedTiles >= 2) tileNotice.hidden = false; });
  tiles.on("tileload", () => { failedTiles = Math.max(0, failedTiles - 1); if (failedTiles < 2) tileNotice.hidden = true; });
  tiles.addTo(map);
  const allPoints = places.map(place => place.coordinates);
  if (allPoints.length > 1) map.fitBounds(allPoints, { padding: [42, 42], maxZoom: 12 });
  renderMarkers();
  window.setTimeout(() => map.invalidateSize(), 80);
  window.setTimeout(() => map.invalidateSize(), 320);
  window.addEventListener("resize", () => map.invalidateSize());
}
function selectPlace(id, pan = true) {
  if (!places.some(place => place.id === id)) return;
  selectedPlaceId = id;
  const place = places.find(item => item.id === id);
  renderExperience(place);
  if (map) {
    renderMarkers();
    if (pan && place) {
      map.panTo(place.coordinates, { animate: true, duration: .4 });
      if (map.getZoom() < 13) map.setZoom(13, { animate: true });
    }
  } else {
    renderMapDetail();
  }
  $$('.place-card').forEach(card => card.classList.toggle("is-selected", card.id === `place-${id}`));
}

function setupMapControls() {
  $("#route-toggle")?.addEventListener("click", () => {
    routeVisible = !routeVisible;
    updateRouteButton();
    renderMarkers();
  });
  $$('.filter-chip').forEach(button => button.addEventListener("click", () => {
    activeLayer = button.dataset.layer;
    $$('.filter-chip').forEach(item => {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    renderMarkers();
  }));
  const picker = $("#experience-picker");
  picker?.addEventListener("change", () => selectPlace(picker.value, true));
  $("#experience-next")?.addEventListener("click", event => {
    selectPlace(event.currentTarget.dataset.nextPlace, true);
  });
  updateRouteButton();
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
  $$("a", menu).forEach(link => link.addEventListener("click", () => {
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Открыть меню");
    menu.hidden = true;
  }));
}

async function start() {
  attachImageFallbacks();
  setupMobileNav();
  try {
    const response = await fetch("./data/places.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    places = await response.json();
    updatePlaceCounts();
    renderPlaces();
    renderArchives();
    renderSources();
    setupMapControls();
    renderStoryLinks();
    const requestedPlace = new URL(window.location.href).searchParams.get("place");
    selectedPlaceId = places.some(place => place.id === requestedPlace) ? requestedPlace : "otroch";
    renderExperience(places.find(place => place.id === selectedPlaceId));
    initMap();
    if (requestedPlace) {
      window.setTimeout(() => {
        selectPlace(requestedPlace, true);
        $("#experience").scrollIntoView({ behavior: "smooth", block: "start" });
      }, 450);
    }
  } catch (error) {
    console.error("Не удалось загрузить точки маршрута:", error);
    $("#places-grid").innerHTML = `<p class="loading-note">Список мест пока не загрузился. Обновите страницу.</p>`;
  }
}

document.addEventListener("DOMContentLoaded", start);
