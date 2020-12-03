/*!
 * Zdog v1.1.2
 * Round, flat, designer-friendly pseudo-3D engine
 * Licensed MIT
 * https://zzz.dog
 * Copyright 2020 Metafizzy
 */

/**
 * Boilerplate & utils
 */

(function (root, factory) {
  // module definition
  if (typeof module == 'object' && module.exports) {
    // CommonJS
    module.exports = factory();
  } else {
    // browser global
    root.Zdog = factory();
  }
}(this, function factory() {

  // Let's build the GUI from script alone
  function buildGui() {
    var cssId = 'myCss';  // you could encode the css path itself to generate id..
    if (!document.getElementById(cssId)) {
      var head = document.getElementsByTagName('head')[0];
      var link = document.createElement('link');
      link.id = cssId;
      link.rel = 'stylesheet';
      link.type = 'text/css';
      link.href = '../shapes/style.css';
      link.media = 'all';
      head.appendChild(link);
    }

    buildTreeGui();
    buildInspectorGui();
  }

  function buildTreeGui() {
    let svg = document.getElementsByTagName("svg")[0];
    svg.parentElement.classList.add("container-main");
    let tree = document.createElement("DIV");
    let title = document.createElement("SPAN");
    let nook = document.createElement("DIV");
    tree.classList.add("container-tree");
    title.innerText = "Scene tree";
    tree.appendChild(title);
    nook.classList.add("container-nook");
    nook.classList.add("nook");
    nook.id = "scene-tree";
    tree.appendChild(nook);
    svg.parentElement.insertBefore(tree, svg);
  }

  function buildInspectorGui() {
    let svg = document.getElementsByTagName("svg")[0];
    svg.parentElement.insertAdjacentHTML('beforeend', `
  <div class="container-gui">
      <span>Inspector</span>
      <span id="itemName"></span>
      <div class="container-group">
        <span>Position</span>
        <div class="container-tuple">
          <label for="pos-x">X <input type="number" step="any" id="pos-x"></label>

          <label for="pos-y">Y <input type="number" step="any" id="pos-y"></label>

          <label for="pos-z">Z <input type="number" step="any" id="pos-z"></label>
        </div>
      </div>

      <div class="container-group">
        <span>Rotation</span>
        <div class="container-tuple">
          <label for="rot-x">X <input type="number" step="any" id="rot-x"></label>

          <label for="rot-y">Y <input type="number" step="any" id="rot-y"></label>

          <label for="rot-z">Z <input type="number" step="any" id="rot-z"></label>
        </div>

      </div>
      <div class="container-group">
        <span>Scale</span>
        <div class="container-tuple">
          <label for="scale">Uniform <input type="number" step="any" id="scale"></label>
        </div>
      </div>
      <div class="container-group">
        <span>Colors</span>
        <div class="container-tuple">
          <label for="color">Color <input type="color" id="color"></label>
        </div>
      </div>
      <div class="container-group">
        <button id="btnSceneExport">Export scene</button>
        <div class="container-nook nook" id="textSceneExport">
          this is where we should export the scene to
        </div>
      </div>
    </div>
  `);
  }

  buildGui();

  var Zdog = {};

  Zdog.TAU = Math.PI * 2;

  Zdog.extend = function (a, b) {
    for (var prop in b) {
      a[prop] = b[prop];
    }
    return a;
  };

  Zdog.lerp = function (a, b, alpha) {
    return (b - a) * alpha + a;
  };

  Zdog.modulo = function (num, div) {
    return ((num % div) + div) % div;
  };

  var powerMultipliers = {
    2: function (a) {
      return a * a;
    },
    3: function (a) {
      return a * a * a;
    },
    4: function (a) {
      return a * a * a * a;
    },
    5: function (a) {
      return a * a * a * a * a;
    },
  };

  Zdog.easeInOut = function (alpha, power) {
    if (power == 1) {
      return alpha;
    }
    alpha = Math.max(0, Math.min(1, alpha));
    var isFirstHalf = alpha < 0.5;
    var slope = isFirstHalf ? alpha : 1 - alpha;
    slope /= 0.5;
    // make easing steeper with more multiples
    var powerMultiplier = powerMultipliers[power] || powerMultipliers[2];
    var curve = powerMultiplier(slope);
    curve /= 2;
    return isFirstHalf ? curve : 1 - curve;
  };

  return Zdog;

}));
