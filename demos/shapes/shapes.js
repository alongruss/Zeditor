// ----- setup ----- //




var sceneSize = 24;
var isSpinning = false;
var TAU = Zdog.TAU;
var offWhite = '#FFEEDD';
var gold = '#EEAA00';
var orange = '#EE6622';
var garnet = '#CC2255';
var eggplant = '#663366';

var lastSelectedItem;

var currentColor = {
  color: '#888888',
  stroke: '#888888',
};

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

function populateTree() {
  document.getElementById("scene-tree").innerHTML = "";
  document.getElementById("scene-tree").innerHTML += "root";
  document.getElementById("scene-tree").innerHTML += "<ul id='treeList'></ul>";
  for (let i = 0; i < illo.children.length; i++) {

    if (illo.children[i].selected) {
      document.getElementById("treeList").innerHTML += "<li class='blue' onclick='selectChild(event);'>" + illo.children[i].id + "</li>";
    } else {
      document.getElementById("treeList").innerHTML += "<li onclick='selectChild(event);'>" + illo.children[i].id + "</li>";
    }

  }
}

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

populateTree();
buildContextMenus();
animate();


function updateGuiValueOfSelected() {
  let svg = document.getElementsByTagName('svg')[0];

  // get selected item
  let selectedItem;

  for (let i = 0; i < svg.children.length; i++) {
    if (svg.children[i] != null) {
      if (svg.children[i].getAttribute("selected") == "true") {
        selectedItem = svg.children[i];
      }
    }
  }

  if (lastSelectedItem != selectedItem && selectedItem != null) {
    // populateTree();
    highLightTree();
    document.getElementById("itemName").innerText = selectedItem.getAttribute("type");

    // get current translation and reset GUI
    currentTransform.translation = JSON.parse(selectedItem.getAttribute("translation"));
    document.getElementById("pos-x").value = currentTransform.translation.x;
    document.getElementById("pos-y").value = currentTransform.translation.y;
    document.getElementById("pos-z").value = currentTransform.translation.z;
    // get current rotation and reset GUI
    currentTransform.rotation = JSON.parse(selectedItem.getAttribute("rotation"));
    document.getElementById("rot-x").value = currentTransform.rotation.x;
    document.getElementById("rot-y").value = currentTransform.rotation.y;
    document.getElementById("rot-z").value = currentTransform.rotation.z;
    // get current scale and reset GUI
    currentTransform.scale = JSON.parse(selectedItem.getAttribute("scale"));
    document.getElementById("scale").value = currentTransform.scale.x;

    currentColor.color = selectedItem.getAttribute("originalColor") ?? '#888888';
    document.getElementById("color").value = currentColor.color;
    resetControls();
  }
  else {
    resetControls();
    document.getElementById("itemName").innerText = "";
    currentTransform.translation = { x: 0, y: 0, z: 0 };
    currentTransform.rotation = { x: 0, y: 0, z: 0 };
    currentTransform.scale = { x: 1, y: 1, z: 1 };
  }
}


function updateIllustration() {
  //console.log(currentTransform);
  illo.shapeShifter(currentTransform);
  illo.colorShifter(currentColor);
}

function buildContextMenus() {
  let contextMenu = document.createElement("DIV");
  contextMenu.innerHTML = `
  <div id="svg-context-menu"> 
    
  </div>
  `
  document.body.appendChild(contextMenu);
}

function clickContextMenu(e) {
  e.preventDefault();
  closeAllMenus();
  elementMouseIsOver = document.elementFromPoint(e.pageX, e.pageY);
  document.getElementById("svg-context-menu").style.display = "block";
  document.getElementById("svg-context-menu").style.position = "absolute";
  document.getElementById("svg-context-menu").style.top = e.pageY + "px";
  document.getElementById("svg-context-menu").style.left = e.pageX + "px";
  if (elementMouseIsOver.tagName == 'svg') {
    document.getElementById("svg-context-menu").innerHTML = `
    <button onclick="{
      addIlloChild();
      closeAllMenus();
    }">Add</button>
    <button onclick="{
      resetIllo();
      closeAllMenus();
    }">Clear all</button>
    `
  }
  else {
    document.getElementById("svg-context-menu").innerHTML = `
    <button onclick="{
      removeIlloChildById(elementMouseIsOver.id);
      closeAllMenus();
    }">Remove</button>
    <button onclick="{closeAllMenus();}">Reset</button>
    `
  }
}

function resetIllo() {
  illo.children = [];
  populateTree();
}

function addIlloChild() {
  illo.children.push(new Zdog.Box({
    width: 5,
    height: 5,
    depth: 5,
    translate: { x: 8, y: 8, z: 0 },
    color: orange,
    topFace: gold,
    leftFace: garnet,
    rightFace: garnet,
    bottomFace: eggplant,
    stroke: false,
  }));
  populateTree();
}

function removeIlloChildById(id) {
  console.log("removing " + id);
  for (let i = 0; i < illo.children.length; i++) {
    if (illo.children[i].id == id) {
      illo.children.splice(i, 1);
    }
  }
  populateTree();
}

function closeAllMenus() {
  document.getElementById("svg-context-menu").style.display = "none";
}

document.getElementsByTagName("svg")[0].addEventListener("contextmenu", (e) => { clickContextMenu(e) });
document.getElementsByTagName("svg")[0].addEventListener("click", (e) => { closeAllMenus() });


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
  currentTransform.rotation.x = parseFloat(e.target.value);
  updateIllustration();
});
document.getElementById("rot-y").addEventListener("input", (e) => {
  currentTransform.rotation.y = parseFloat(e.target.value);
  updateIllustration();
});
document.getElementById("rot-z").addEventListener("input", (e) => {
  currentTransform.rotation.z = parseFloat(e.target.value);
  updateIllustration();
});
document.getElementById("scale").addEventListener("input", (e) => {
  currentTransform.scale.x = parseFloat(e.target.value);
  currentTransform.scale.y = parseFloat(e.target.value);
  currentTransform.scale.z = parseFloat(e.target.value);
  updateIllustration();
});
document.getElementById("color").addEventListener("input", (e) => {
  currentColor.color = e.target.value;
  updateIllustration();
});
document.getElementById("btnSceneExport").addEventListener("click", (e) => {
  var result = "";
  for (let i = 0; i < illo.children.length; i++) {
    result += "new Zdog." + illo.children[i].type + "({";
    result += "<br>";
    result += "addTo : illo,";
    result += "<br>";
    result += returnIlloValue(i, "sides", false);
    result += returnIlloValue(i, "radius", false);
    result += returnIlloValue(i, "cornerRadius", false);
    result += returnIlloValue(i, "diameter", false);
    result += returnIlloValue(i, "length", false);
    result += returnIlloValue(i, "stroke", false);
    result += returnIlloValue(i, "fill", false);
    result += returnIlloValue(i, "closed", false);
    result += returnIlloValue(i, "visible", false);
    result += returnIlloValue(i, "width", false);
    result += returnIlloValue(i, "height", false);
    result += returnIlloValue(i, "depth", false);
    result += returnIlloValue(i, "translate", true);
    result += returnIlloValue(i, "rotate", true);
    result += returnIlloValue(i, "scale", true);
    result += returnIlloValue(i, "color", true);
    result += returnIlloValue(i, "path", true);
    result += returnIlloValue(i, "front", true);
    result += returnIlloValue(i, "backface", true);
    result += returnIlloValue(i, 'rearFace', true);
    result += returnIlloValue(i, 'leftFace', true);
    result += returnIlloValue(i, 'rightFace', true);
    result += returnIlloValue(i, 'topFace', true);
    result += returnIlloValue(i, 'bottomFace', true);
    result += returnIlloValue(i, "frontface", true);
    result += "});";
    result += "<br>";
    result += "<br>";
  }
  document.getElementById("textSceneExport").innerHTML = result;
});

function returnIlloValue(index, valueName, isObject) {
  let result = '';
  if (illo.children[index][valueName]) {
    result += valueName + " : ";
    if (isObject) {
      result += JSON.stringify(illo.children[index][valueName]);
    } else {
      result += illo.children[index][valueName];
    }
    result += ",";
    result += "<br>";
  }
  return result;
}

function selectChild(e) {
  deselectAll();

  var x = illo.children;
  var i;
  for (i = 0; i < x.length; i++) {
    if (x[i].id == e.target.innerText) {
      illo.children[i].selected = "true";
    }
  }
  illo.updateRenderGraph();
  updateGuiValueOfSelected();
  requestAnimationFrame(animate);
  highLightTree();
}

function deselectAll() {
  var x = illo.children;
  var i;
  for (i = 0; i < x.length; i++) {
    illo.children[i].selected = "";
  }
}
function highLightTree() {
  var x = illo.children;
  var i;
  for (i = 0; i < x.length; i++) {
    if (illo.children[i].selected == "true" || illo.children[i].selected == true) {
      document.getElementById("scene-tree").getElementsByTagName("li")[i].className = "blue";
    } else {
      document.getElementById("scene-tree").getElementsByTagName("li")[i].className = "";
    }
  }
}

function resetControls() {
  if (document.getElementById("itemName").innerText == "") {
    var x = document.getElementsByTagName("input");
    var i;
    for (i = 0; i < x.length; i++) {
      x[i].disabled = true;
    }
  } else {
    var x = document.getElementsByTagName("input");
    var i;
    for (i = 0; i < x.length; i++) {
      x[i].disabled = false;
    }
  }
}