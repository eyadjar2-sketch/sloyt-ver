import * as THREE from "./assets/vendor/three/three.module.js";

const root = document.querySelector("#model-canvas");
const fallback = document.querySelector("#model-fallback");
const picker = document.querySelector("#experience-picker");
const scale = document.querySelector("#model-scale");
const objectName = document.querySelector("#model-object-name");
const objectCopy = document.querySelector("#model-object-copy");
const referencePhoto = document.querySelector("#model-reference-photo");
const fallbackImage = document.querySelector("#model-fallback-image");
const referenceCaption = document.querySelector("#model-reference-caption");
const MODEL_CONTENT = {
  cathedral: {
    title: "Спасо-Преображенский собор",
    note: "Условный образ православного соборного здания. Не является проектной или исторической реконструкцией конкретного собора.",
    photo: "./assets/cathedral-current.webp",
    fallback: "./assets/cathedral-current.webp",
    alt: "Современная фотография Спасо-Преображенского собора",
    caption: "Современный воссозданный собор · фото и подпись в карточке маршрута."
  },
  otroch: {
    title: "Успенский собор Отроча",
    note: "Силуэтная схема типа православного храма. Она не воспроизводит точные обмеры сохранившегося Успенского собора.",
    photo: "./assets/otroch-current.webp",
    fallback: "./assets/otroch-current.webp",
    alt: "Современная фотография сохранившегося Успенского собора Отроча",
    caption: "Сохранившийся собор · точный силуэт см. в фотоисточнике."
  },
  zheltikov: {
    title: "Жёлтиков монастырь",
    note: "Схема монастырского ансамбля как группы объёмов; она не показывает доказанное расположение утраченных исторических корпусов.",
    photo: "./assets/zheltikov-current.webp",
    fallback: "./assets/zheltikov-current.webp",
    alt: "Современная фотография Святых врат Желтикова монастыря",
    caption: "Современное состояние территории · отдельные строения сохранились."
  },
  catholic: {
    title: "Католический храм",
    note: "Объёмная схема современного храмового типа, не точная модель тверского здания и не реконструкция исторического костёла.",
    photo: "./assets/catholic-current.webp",
    fallback: "./assets/catholic-current.webp",
    alt: "Современная фотография католического храма Преображения Господня",
    caption: "Современное здание прихода · фото и адрес указаны в карточке."
  },
  mosque: {
    title: "Тверская соборная мечеть",
    note: "Схематический объём мечети с минаретом; это не обмерная 3D-модель здания и не архитектурная реставрация.",
    photo: "./assets/mosque-current.webp",
    fallback: "./assets/mosque-current.webp",
    alt: "Современная фотография Тверской соборной мечети",
    caption: "Фотография сохранившегося здания · подпись и источник в карточке."
  }
};

function material(color, roughness = .8) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: .02 });
}

const mat = {
  cream: material("#f2f5f9"),
  white: material("#ffffff"),
  blue: material("#245ce7"),
  red: material("#ef705d"),
  gold: material("#f0bc4b", .5),
  roof: material("#415c80"),
  brick: material("#ca7767"),
  green: material("#537c82"),
  dark: material("#26364e"),
  line: material("#cad5e4")
};

const scene = new THREE.Scene();
scene.background = new THREE.Color("#e3ebf5");
const camera = new THREE.PerspectiveCamera(34, 1, .1, 100);
camera.position.set(10, 7, 12);
camera.lookAt(0, 2, 0);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.setAttribute("aria-hidden", "true");
root.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight("#fff9e9", "#7d887c", 2.15));
const keyLight = new THREE.DirectionalLight("#fff1d4", 2.7);
keyLight.position.set(-5, 11, 7);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight("#cad9ee", 1.15);
fillLight.position.set(7, 6, -4);
scene.add(fillLight);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), material("#d5dfec"));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -.08;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(30, 30, "#92a9c8", "#c8d5e6");
grid.position.y = -.055;
scene.add(grid);

let building = new THREE.Group();
scene.add(building);
let dragging = false;
let previousX = 0;
let previousY = 0;
let rotationX = -.18;
let rotationY = -.55;

function addMesh(parent, geometry, materialValue, position, cast = true) {
  const mesh = new THREE.Mesh(geometry, materialValue);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function box(parent, dimensions, position, color) {
  return addMesh(parent, new THREE.BoxGeometry(...dimensions), color, position);
}

function cylinder(parent, rTop, rBottom, height, position, color, segments = 24) {
  return addMesh(parent, new THREE.CylinderGeometry(rTop, rBottom, height, segments), color, position);
}

function dome(parent, position, color, radius = .66) {
  cylinder(parent, radius * .78, radius * .78, .46, [position[0], position[1] - .18, position[2]], mat.white, 24);
  const cap = addMesh(parent, new THREE.SphereGeometry(radius, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2), color, [position[0], position[1] + .04, position[2]]);
  cap.scale.y = 1.25;
  cylinder(parent, .025, .035, .34, [position[0], position[1] + radius * 1.34, position[2]], mat.gold, 8);
  addMesh(parent, new THREE.SphereGeometry(.06, 12, 8), mat.gold, [position[0], position[1] + radius * 1.55, position[2]], false);
}

function cross(parent, position, color = mat.gold, scaleValue = 1) {
  box(parent, [.07 * scaleValue, .64 * scaleValue, .07 * scaleValue], position, color);
  box(parent, [.42 * scaleValue, .07 * scaleValue, .07 * scaleValue], [position[0], position[1] + .12 * scaleValue, position[2]], color);
}

function createOrthodox(type) {
  const wall = type === "otroch" ? mat.white : mat.cream;
  const roof = type === "otroch" ? mat.roof : mat.red;
  box(building, [6.3, .45, 4.2], [0, .18, 0], mat.line);
  box(building, [5.2, 2.45, 3.35], [0, 1.48, 0], wall);
  const roofMesh = addMesh(building, new THREE.ConeGeometry(2.55, 1.12, 4), roof, [0, 3.23, 0]);
  roofMesh.rotation.y = Math.PI / 4;
  box(building, [1.35, 1.2, .16], [0, 1.13, 1.76], mat.dark);
  cylinder(building, .66, .71, .52, [0, 3.95, 0], mat.white);
  dome(building, [0, 4.58, 0], mat.gold, .82);
  dome(building, [-1.95, 3.54, .35], mat.blue, .44);
  dome(building, [1.95, 3.54, .35], mat.blue, .44);
  for (const x of [-1.68, -.56, .56, 1.68]) {
    box(building, [.17, 1.28, .13], [x, 1.55, 1.76], mat.white);
    box(building, [.52, .08, .2], [x, 2.23, 1.81], mat.gold);
  }
  if (type === "cathedral") {
    box(building, [1.55, 2.6, 1.55], [2.45, 1.42, -1.3], wall);
    cylinder(building, .44, .52, .32, [2.45, 2.91, -1.3], mat.white);
    dome(building, [2.45, 3.43, -1.3], mat.gold, .48);
  }
}

function createMonastery() {
  box(building, [7.2, .4, 4.8], [0, .12, 0], mat.line);
  box(building, [3.1, 2.1, 2.8], [-1.25, 1.35, -.25], mat.cream);
  box(building, [2.8, 1.55, 2.1], [1.45, 1.08, .4], mat.white);
  box(building, [1.15, 4.6, 1.3], [1.25, 2.7, -1.55], mat.cream);
  box(building, [1.28, .22, 1.43], [1.25, 4.95, -1.55], mat.red);
  cylinder(building, .52, .6, .34, [1.25, 5.24, -1.55], mat.white);
  dome(building, [1.25, 5.7, -1.55], mat.gold, .5);
  for (const x of [-2.1, -1.15, -.2, 1.1, 2.1]) {
    box(building, [.11, .65, .08], [x, 1.45, 1.18], mat.blue);
  }
  box(building, [6.8, .6, .35], [0, .55, 2.4], mat.red);
}

function createCatholic() {
  box(building, [6.1, .42, 4], [0, .18, 0], mat.line);
  box(building, [4.3, 3.2, 2.8], [.35, 1.9, -.2], mat.brick);
  box(building, [4.1, .18, 3], [.35, 3.58, -.2], mat.dark);
  const naveRoof = addMesh(building, new THREE.ConeGeometry(2.55, 1.45, 4), mat.roof, [.35, 4.15, -.2]);
  naveRoof.rotation.y = Math.PI / 4;
  box(building, [1.25, 5, 1.35], [-2.15, 2.8, .75], mat.brick);
  box(building, [1.5, .18, 1.58], [-2.15, 5.4, .75], mat.dark);
  const spire = addMesh(building, new THREE.ConeGeometry(.62, 1.2, 4), mat.roof, [-2.15, 6.06, .75]);
  spire.rotation.y = Math.PI / 4;
  cross(building, [-2.15, 6.98, .75], mat.gold, .78);
  for (const x of [-1.3, -.4, .5, 1.4]) {
    box(building, [.2, 1.15, .12], [x, 1.63, 1.25], mat.cream);
  }
  box(building, [1.15, 1.9, .15], [.35, 1.3, 1.27], mat.dark);
}

function createMosque() {
  box(building, [6.4, .42, 4.4], [0, .17, 0], mat.line);
  box(building, [4.6, 2.6, 3.3], [0, 1.58, 0], mat.cream);
  box(building, [4.8, .22, 3.5], [0, 2.95, 0], mat.red);
  for (const x of [-1.65, -.55, .55, 1.65]) {
    box(building, [.13, 1.3, .13], [x, 1.5, 1.73], mat.red);
    box(building, [.3, .09, .2], [x, 2.1, 1.78], mat.gold);
  }
  box(building, [1.15, 1.25, .14], [0, 1.2, 1.74], mat.dark);
  cylinder(building, .85, .95, .45, [0, 3.24, 0], mat.cream);
  dome(building, [0, 3.82, 0], mat.green, .88);
  cylinder(building, .34, .46, 5.2, [-2.55, 2.8, -1.5], mat.cream);
  cylinder(building, .48, .5, .22, [-2.55, 2.36, -1.5], mat.red);
  cylinder(building, .42, .47, .22, [-2.55, 4.73, -1.5], mat.red);
  addMesh(building, new THREE.ConeGeometry(.36, .9, 20), mat.green, [-2.55, 5.82, -1.5]);
}

function buildFor(type) {
  scene.remove(building);
  building.traverse(child => {
    if (child.geometry) child.geometry.dispose();
  });
  building = new THREE.Group();
  if (type === "zheltikov") createMonastery();
  else if (type === "catholic") createCatholic();
  else if (type === "mosque") createMosque();
  else createOrthodox(type);
  scene.add(building);
  building.rotation.set(rotationX, rotationY, 0);
}

function updateModel(type) {
  const info = MODEL_CONTENT[type] || MODEL_CONTENT.cathedral;
  objectName.textContent = info.title;
  objectCopy.textContent = info.note;
  referencePhoto.src = info.photo;
  referencePhoto.dataset.fallback = info.fallback;
  referencePhoto.dataset.fallbackUsed = "false";
  referencePhoto.alt = info.alt;
  fallbackImage.src = info.photo;
  fallbackImage.dataset.fallback = info.fallback;
  fallbackImage.dataset.fallbackUsed = "false";
  fallbackImage.alt = info.alt;
  referenceCaption.textContent = info.caption;
  attachFallback(referencePhoto);
  attachFallback(fallbackImage);
  buildFor(type);
}

function attachFallback(image) {
  image.addEventListener("error", () => {
    if (image.dataset.fallbackUsed === "true") return;
    image.dataset.fallbackUsed = "true";
    image.src = image.dataset.fallback;
  }, { once: true });
}

function resize() {
  const width = Math.max(1, root.clientWidth);
  const height = Math.max(280, root.clientHeight);
  camera.aspect = width / height;
  camera.position.set(10, 7, 12);
  camera.lookAt(0, 2.3, 0);
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

try {
  resize();
  new ResizeObserver(resize).observe(root);
  window.addEventListener("resize", resize);
  window.addEventListener("place-selected", event => {
    if (event.detail?.id) updateModel(event.detail.id);
  });
  scale.addEventListener("input", () => { building.scale.setScalar(Number(scale.value)); });
  document.querySelector("#model-left").addEventListener("click", () => { rotationY -= .38; building.rotation.y = rotationY; });
  document.querySelector("#model-right").addEventListener("click", () => { rotationY += .38; building.rotation.y = rotationY; });
  renderer.domElement.addEventListener("pointerdown", event => {
    dragging = true;
    previousX = event.clientX;
    previousY = event.clientY;
    renderer.domElement.setPointerCapture(event.pointerId);
  });
  renderer.domElement.addEventListener("pointermove", event => {
    if (!dragging) return;
    const dx = event.clientX - previousX;
    const dy = event.clientY - previousY;
    previousX = event.clientX;
    previousY = event.clientY;
    rotationY += dx * .008;
    rotationX = Math.max(-.75, Math.min(.45, rotationX + dy * .005));
    building.rotation.set(rotationX, rotationY, 0);
  });
  renderer.domElement.addEventListener("pointerup", () => { dragging = false; });
  renderer.domElement.addEventListener("pointercancel", () => { dragging = false; });
  updateModel(picker?.value || "otroch");
  fallback.hidden = true;
  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches && !dragging) {
      rotationY += delta * .1;
      building.rotation.y = rotationY;
    }
    renderer.render(scene, camera);
  }
  animate();
} catch (error) {
  console.error("3D-модуль недоступен:", error);
  fallback.hidden = false;
  const message = document.createElement("div");
  message.className = "model-failure";
  message.textContent = "3D-просмотр недоступен на этом устройстве. Фотография объекта показана ниже.";
  root.appendChild(message);
}

function attachFallbackImages() {
  [referencePhoto, fallbackImage].forEach(attachFallback);
}
attachFallbackImages();
