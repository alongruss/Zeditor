// ----- setup ----- //

var sceneSize = 24;
var isSpinning = false;
var TAU = Zdog.TAU;
var offWhite = '#FED';
var gold = '#EA0';
var orange = '#E62';
var garnet = '#C25';
var eggplant = '#636';
var lastSelectedItem;

var currentTransform = {
  translation: {
    x: 0,
    y: 0,
    z: 0
  },
  rotation: {
    x: 0,
    y: 0,
    z: 0
  },
  scale: {
    x: 1,
    y: 1,
    z: 1
  },
};

var illo = new Zdog.Illustration({
  element: '.illo',
  dragRotate: true,
  resize: 'fullscreen',
  zoom: 24,
  onDragStart: function () {
    isSpinning = false;
  },
  onResize: function (width, height) {
    this.zoom = Math.floor(Math.min(width, height) / sceneSize);
  },
});

// ----- model ----- //

new Zdog.Rect({
  addTo: illo,
  width: 4,
  height: 4,
  translate: { x: -4, y: -4, z: 4 },
  //rotate: { x: 0, y: 0, z: 0 },
  scale: 1.0,
  stroke: 1,
  color: orange,
});

new Zdog.RoundedRect({
  addTo: illo,
  width: 4,
  height: 4,
  cornerRadius: 1,
  translate: { x: -4, y: 4, z: -4 },
  stroke: 1,
  color: eggplant,
});

new Zdog.Ellipse({
  addTo: illo,
  diameter: 4,
  translate: { x: 4, y: 4, z: 4 },
  stroke: 1,
  color: garnet,
});

new Zdog.Polygon({
  addTo: illo,
  sides: 3,
  radius: 2.5,
  translate: { x: 4, y: -4, z: -4 },
  stroke: 1,
  color: orange,
});

new Zdog.Shape({
  addTo: illo,
  path: [
    { x: -1 },
    { x: 1 },
    { move: { y: -1 } },
    { y: 1 },
    { move: { z: -1 } },
    { z: 1 },
  ],
  scale: 1.25,
  stroke: 1,
  color: offWhite,
});

new Zdog.Hemisphere({
  addTo: illo,
  diameter: 5,
  translate: { x: -4, y: -4, z: -4 },
  color: garnet,
  backface: gold,
  stroke: false,
});

new Zdog.Cylinder({
  addTo: illo,
  diameter: 5,
  length: 4,
  translate: { x: -4, y: 4, z: 4 },
  color: gold,
  backface: offWhite,
  stroke: false,
});

new Zdog.Cone({
  addTo: illo,
  diameter: 5,
  length: 4,
  translate: { x: 4, y: -4, z: 4 },
  color: eggplant,
  backface: garnet,
  stroke: false,
});

new Zdog.Box({
  addTo: illo,
  width: 5,
  height: 5,
  depth: 5,
  translate: { x: 4, y: 4, z: -4 },
  color: orange,
  topFace: gold,
  leftFace: garnet,
  rightFace: garnet,
  bottomFace: eggplant,
  stroke: false,
});

// ----- animate ----- //

var ticker = 0;
var cycleCount = 360;

function animate() {

  if (isSpinning) {
    var progress = ticker / cycleCount;
    var theta = Zdog.easeInOut(progress % 1, 3) * TAU;
    illo.rotate.y = theta * 2;
    illo.rotate.x = Math.sin(theta) * 0.5;
    ticker++;
  }
  illo.updateRenderGraph();
  updateGuiValueOfSelected();
  requestAnimationFrame(animate);
}

animate();


function updateGuiValueOfSelected() {
  var svg = document.getElementsByTagName('svg')[0];

  // get selected item
  var selectedItem;

  for (let i = 0; i < svg.children.length; i++) {
    if (svg.children[i] != null) {
      if (svg.children[i].getAttribute("selected") == "true") {
        selectedItem = svg.children[i];
      }
    }
  }

  if (lastSelectedItem != selectedItem && selectedItem != null) {
    document.getElementById("itemName").innerText = selectedItem.getAttribute("id");

    // get current translation and reset GUI
    currentTransform.translation = JSON.parse(selectedItem.getAttribute("translation"));
    document.getElementById("pos-x").value = currentTransform.translation.x;
    document.getElementById("pos-y").value = currentTransform.translation.y;
    document.getElementById("pos-z").value = currentTransform.translation.z;
    // get current rotation and reset GUI
    currentTransform.rotation = JSON.parse(selectedItem.getAttribute("rotation"));
    document.getElementById("rot-x").value = currentTransform.rotation.x * 180 / Math.PI;
    document.getElementById("rot-y").value = currentTransform.rotation.y * 180 / Math.PI;
    document.getElementById("rot-z").value = currentTransform.rotation.z * 180 / Math.PI;
    // get current scale and reset GUI
    currentTransform.scale = JSON.parse(selectedItem.getAttribute("scale"));
    document.getElementById("scale").value = currentTransform.scale.x;
  }
  else {
    document.getElementById("itemName").innerText = "";
    currentTransform.translation = { x: 0, y: 0, z: 0 };
    currentTransform.rotation = { x: 0, y: 0, z: 0 };
    currentTransform.scale = { x: 1, y: 1, z: 1 };
  }
}


function updateIllustration() {
  //console.log(currentTransform);
  illo.shapeShifter(currentTransform);

}


document.getElementById("pos-x").addEventListener("input", (e) => {
  currentTransform.translation.x = parseFloat(e.target.value);
  updateIllustration();
});
document.getElementById("pos-y").addEventListener("input", (e) => {
  currentTransform.translation.y = parseFloat(e.target.value);
  updateIllustration();
});
document.getElementById("pos-z").addEventListener("input", (e) => {
  currentTransform.translation.z = parseFloat(e.target.value);
  updateIllustration();
});
document.getElementById("rot-x").addEventListener("input", (e) => {
  currentTransform.rotation.x = 2 * Math.PI * e.target.value / 360;
  updateIllustration();
});
document.getElementById("rot-y").addEventListener("input", (e) => {
  currentTransform.rotation.y = 2 * Math.PI * e.target.value / 360;
  updateIllustration();
});
document.getElementById("rot-z").addEventListener("input", (e) => {
  currentTransform.rotation.z = 2 * Math.PI * e.target.value / 360;
  updateIllustration();
});
document.getElementById("scale").addEventListener("input", (e) => {
  currentTransform.scale.x = parseFloat(e.target.value);
  currentTransform.scale.y = parseFloat(e.target.value);
  currentTransform.scale.z = parseFloat(e.target.value);
  updateIllustration();
});