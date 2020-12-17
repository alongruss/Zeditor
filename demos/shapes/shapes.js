// ----- setup ----- //
var svg = document.getElementsByTagName('svg')[0];
var selectedItem = lastSelectedItem = null;
var indexOfLastChild = 0;
var indexOfGizmo = 0;


const gizmoMode = {
  NONE: null,
  POSX: 'posX',
  POSY: 'posY',
  POSZ: 'posZ',
  ROTX: 'rotX',
  ROTY: 'rotY',
  ROTZ: 'rotZ',
  SCALEX: 'scaleX',
  SCALEY: 'scaleY',
  SCALEZ: 'scaleZ',
}

var currentGizmoMode = gizmoMode.NONE;

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


// Create an illustration for rendering
var illo = new Zdog.Illustration({
  onDragMove: function () {
    reselect(illo);
  },
  onDragStart: function () {
    deselectAll(illo);
  },
  onResize: function (width, height) {
    this.zoom = Math.floor(Math.min(width, height) / 24);
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
  color: "#ee6622",
});

new Zdog.RoundedRect({
  addTo: illo,
  width: 4,
  height: 4,
  cornerRadius: 1,
  translate: { x: -4, y: 4, z: -4 },
  stroke: 1,
  color: "#33AA6633",
});

new Zdog.Ellipse({
  addTo: illo,
  diameter: 4,
  translate: { x: 4, y: 4, z: 4 },
  stroke: 1,
  color: "#cc2255",
});

new Zdog.Polygon({
  addTo: illo,
  sides: 3,
  radius: 2.5,
  translate: { x: 4, y: -4, z: -4 },
  stroke: 1,
  color: "#ee6622",
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
  color: "#FFEEDD",
});

new Zdog.Hemisphere({
  addTo: illo,
  diameter: 5,
  translate: { x: -4, y: -4, z: -4 },
  color: "#cc2255",
  backface: "#eeaa00",
  stroke: false,
});

new Zdog.Cylinder({
  addTo: illo,
  diameter: 5,
  length: 4,
  translate: { x: -4, y: 4, z: 4 },
  color: "#eeaa00",
  backface: "#FFEEDD",
  stroke: false,
});

new Zdog.Cone({
  addTo: illo,
  diameter: 5,
  length: 4,
  translate: { x: 12, y: -4, z: 4 },
  color: "#663366",
  backface: "#cc2255",
  stroke: false,
});

/*new Zdog.Gizmo({
  addTo: illo,
  diameter: 5,
  length: 4,
  translate: { x: 4, y: -4, z: 4 },
  color: "#663366",
  backface: "#cc2255",
  stroke: false,
});*/

new Zdog.Box({
  addTo: illo,
  width: 5,
  height: 5,
  depth: 5,
  translate: { x: 4, y: 4, z: -4 },
  color: "#ee6622",
  topFace: "#eeaa00",
  leftFace: "#cc2255",
  rightFace: "#cc2255",
  bottomFace: "#663366",
  stroke: false,
});

// ----- animate ----- //


function updateTree() {
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
  illo.updateRenderGraph();
  requestAnimationFrame(animate);
}

// Populate the scene tree
updateTree();

// Build context menus HTML
buildContextMenus();

addEventListeners();

// Start animation loop
animate();


function updateGuiValueOfSelected() {
  // get selected item
  for (let i = 0; i < svg.children.length; i++) {
    if (svg.children[i] != null) {
      if (svg.children[i].getAttribute("selected") == "true") {
        selectedItem = svg.children[i];
        window.selectedItem = svg.children[i];

        // Draw selection rectangle
        svg.children[i].style.outline = "0.1px solid rgba(0,0,0,.2)";
      } else {
        svg.children[i].style.outline = "none";
      }
    }
  }

  // If we've selected a different and non-null item
  if (lastSelectedItem != selectedItem && selectedItem != null) {
    deselectAll(illo);
    // set lastSelectedItem
    lastSelectedItem = selectedItem;

    highLightTree();
    document.getElementById("itemName").innerText = selectedItem.getAttribute("type") + " " + selectedItem.getAttribute("name");

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
      illo.clearAll(true);
      updateTree();
      closeAllMenus();
    }">Clear all</button>
    `
  }
  else {
    document.getElementById("svg-context-menu").innerHTML = `
    <button onclick="{
      removeIlloChildById(illo,elementMouseIsOver.id);
      closeAllMenus();
    }">Remove</button>
    <button onclick="{closeAllMenus();}">Reset</button>
    `
  }
}



function addIlloChild(newElement) {
  illo.children.push(new Zdog.Box({ width: 5, height: 5, depth: 5, color: "#ee6622", stroke: false }));
  updateTree();
}

function removeIlloChildById(element, id) {
  console.log("removing " + id);
  for (let i = 0; i < element.children.length; i++) {
    if (element.children[i].id == id) {
      element.children.splice(i, 1);
    } else {
      removeIlloChildById(element.children[i], id);
    }
  }
  deselectAll(illo);
  updateTree();
}

function closeAllMenus() {
  //console.log("closeAllMenus");
  document.getElementById("svg-context-menu").style.display = "none";
}

document.getElementsByTagName("svg")[0].addEventListener("contextmenu", (e) => { clickContextMenu(e) });
document.getElementsByTagName("svg")[0].addEventListener("click", (e) => {
  updateGuiValueOfSelected();
  closeAllMenus();
});


function addEventListeners() {
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
    var text = result.replaceAll("<br>", "\n"),
      blob = new Blob([text], { type: 'text/plain' }),
      anchor = document.createElement('a');

    anchor.download = "zeditor.js";
    anchor.href = (window.webkitURL || window.URL).createObjectURL(blob);
    anchor.dataset.downloadurl = ['text/plain', anchor.download, anchor.href].join(':');
    anchor.click();
  });
}



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
  console.log("selectChild");
  deselectAll(illo);

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

function deselectAll(element) {
  console.log("deselectAll");
  window.lastDragElement = null;
  var x = element.children;
  var i;
  for (i = 0; i < x.length; i++) {
    if(x[i].selected == "true"){
      window.lastDragElement = element.children[i];
      element.children[i].selected = "";
    }else{
    // deselectAll(element.children[i]);
    if (element.children[i].type == "Gizmo") {
      element.children.splice(i, 1);
    }
  }}
  setTimeout(function(){ testGizmo(); }, 500);
  highLightTree();
}

function reselect(){
  if(window.lastDragElement != null){
    window.lastDragElement.selected = "true";
  }
}

function highLightTree() {
  //console.log("highLightTree");
  var x = illo.children;
  var i;
  for (i = 0; i < x.length; i++) {
    if (illo.children[i].type != "Gizmo") {
      if (illo.children[i].selected == "true" || illo.children[i].selected == true) {
        document.getElementById("scene-tree").getElementsByTagName("li")[i].className = "blue";
      } else {
        document.getElementById("scene-tree").getElementsByTagName("li")[i].className = "";
      }
    }
  }
}
function testGizmo(){
  var x = illo.children;
  var i;
  for (i = 0; i < x.length-1; i++) {
    if(illo.children[i].renderFront.x == illo.children[illo.children.length-1].renderFront.x && illo.children[i].renderFront.y == illo.children[illo.children.length-1].renderFront.y && illo.children[i].renderFront.z == illo.children[illo.children.length-1].renderFront.z){
      console.log(illo.children[i].type);
      illo.children[i].selected = "true";
      highLightTree();
    }
}
}

function resetControls() {
  //console.log("resetControls");
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