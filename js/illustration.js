/**
 * Illustration
 */

(function (root, factory) {
  // module definition
  if (typeof module == 'object' && module.exports) {
    // CommonJS
    module.exports = factory(require('./boilerplate'), require('./anchor'),
      require('./dragger'));
  } else {
    // browser global
    var Zdog = root.Zdog;
    Zdog.Illustration = factory(Zdog, Zdog.Anchor, Zdog.Dragger);
  }
}(this, function factory(utils, Anchor, Dragger) {

  function noop() { }
  var TAU = utils.TAU;

  var Illustration = Anchor.subclass({

    centered: true,
    element: '.illo',
    dragRotate: true,
    resize: 'fullscreen',
    zoom: 24,
    onPrerender: noop,
    onDragStart: noop,
    onDragMove: noop,
    onDragEnd: noop,
    onResize: noop,
  });

  utils.extend(Illustration.prototype, Dragger.prototype);

  Illustration.prototype.create = function (options) {
    Anchor.prototype.create.call(this, options);
    Dragger.prototype.create.call(this, options);
    this.setElement(this.element);
    this.setDragRotate(this.dragRotate);
    this.setResize(this.resize);
  };

  // Clear all the children of the illustration
  Illustration.prototype.clearAll = function (reset) {
    if (reset) this.children = [];
  };


  Illustration.prototype.setElement = function (element) {
    element = this.getQueryElement(element);
    if (!element) {
      throw new Error('Zdog.Illustration element required. Set to ' + element);
    }

    var nodeName = element.nodeName.toLowerCase();
    if (nodeName == 'canvas') {
      this.setCanvas(element);
    } else if (nodeName == 'svg') {
      this.setSvg(element);
    }
  };

  Illustration.prototype.setSize = function (width, height) {
    width = Math.round(width);
    height = Math.round(height);
    if (this.isCanvas) {
      this.setSizeCanvas(width, height);
    } else if (this.isSvg) {
      this.setSizeSvg(width, height);
    }
  };

  Illustration.prototype.setResize = function (resize) {
    this.resize = resize;
    // create resize event listener
    if (!this.resizeListener) {
      this.resizeListener = this.onWindowResize.bind(this);
    }
    // add/remove event listener
    if (resize) {
      window.addEventListener('resize', this.resizeListener);
      this.onWindowResize();
    } else {
      window.removeEventListener('resize', this.resizeListener);
    }
  };

  // TODO debounce this?
  Illustration.prototype.onWindowResize = function () {
    this.setMeasuredSize();
    this.onResize(this.width, this.height);
  };

  Illustration.prototype.setMeasuredSize = function () {
    var width, height;
    var isFullscreen = this.resize == 'fullscreen';
    if (isFullscreen) {
      width = window.innerWidth;
      height = window.innerHeight;
    } else {
      var rect = this.element.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
    }
    this.setSize(width, height);
  };

  // ----- render ----- //

  Illustration.prototype.renderGraph = function (item) {
    if (this.isCanvas) {
      this.renderGraphCanvas(item);
    } else if (this.isSvg) {
      this.renderGraphSvg(item);
    }
  };

  // combo method
  Illustration.prototype.updateRenderGraph = function (item) {
    this.updateGraph();
    this.renderGraph(item);
  };

  // ----- canvas ----- //

  Illustration.prototype.setCanvas = function (element) {
    this.element = element;
    this.isCanvas = true;
    // update related properties
    this.ctx = this.element.getContext('2d');
    // set initial size
    this.setSizeCanvas(element.width, element.height);
  };

  Illustration.prototype.setSizeCanvas = function (width, height) {
    this.width = width;
    this.height = height;
    // up-rez for hi-DPI devices
    var pixelRatio = this.pixelRatio = window.devicePixelRatio || 1;
    this.element.width = this.canvasWidth = width * pixelRatio;
    this.element.height = this.canvasHeight = height * pixelRatio;
    var needsHighPixelRatioSizing = pixelRatio > 1 && !this.resize;
    if (needsHighPixelRatioSizing) {
      this.element.style.width = width + 'px';
      this.element.style.height = height + 'px';
    }
  };

  Illustration.prototype.renderGraphCanvas = function (item) {
    item = item || this;
    this.prerenderCanvas();
    Anchor.prototype.renderGraphCanvas.call(item, this.ctx);
    this.postrenderCanvas();
  };

  Illustration.prototype.prerenderCanvas = function () {
    var ctx = this.ctx;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    ctx.save();
    if (this.centered) {
      var centerX = this.width / 2 * this.pixelRatio;
      var centerY = this.height / 2 * this.pixelRatio;
      ctx.translate(centerX, centerY);
    }
    var scale = this.pixelRatio * this.zoom;
    ctx.scale(scale, scale);
    this.onPrerender(ctx);
  };

  Illustration.prototype.postrenderCanvas = function () {
    this.ctx.restore();
  };

  // ----- svg ----- //

  Illustration.prototype.setSvg = function (element) {
    this.element = element;
    this.isSvg = true;
    this.pixelRatio = 1;
    // set initial size from width & height attributes
    var width = element.getAttribute('width');
    var height = element.getAttribute('height');
    this.element.setAttribute('selectedId', "svg");
    this.setSizeSvg(width, height);
  };

  Illustration.prototype.setSizeSvg = function (width, height) {
    this.width = width;
    this.height = height;
    var viewWidth = width / this.zoom;
    var viewHeight = height / this.zoom;
    var viewX = this.centered ? -viewWidth / 2 : 0;
    var viewY = this.centered ? -viewHeight / 2 : 0;
    this.element.setAttribute('viewBox', viewX + ' ' + viewY + ' ' +
      viewWidth + ' ' + viewHeight);
    if (this.resize) {
      // remove size attributes, let size be determined by viewbox
      this.element.removeAttribute('width');
      this.element.removeAttribute('height');
    } else {
      this.element.setAttribute('width', width);
      this.element.setAttribute('height', height);
    }
  };

  Illustration.prototype.renderGraphSvg = function (item) {
    item = item || this;
    empty(this.element);
    this.onPrerender(this.element);
    Anchor.prototype.renderGraphSvg.call(item, this.element);
  };

  function empty(element) {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  // ----- drag ----- //

  Illustration.prototype.setDragRotate = function (item) {
    if (!item) {
      return;
    } else if (item === true) {
      /* eslint consistent-this: "off" */
      item = this;
    }
    this.dragRotate = item;

    this.bindDrag(this.element);
  };

  Illustration.prototype.dragStart = function (event, pointer) {
    this.dragStartRX = this.dragRotate.rotate.x;
    this.dragStartRY = this.dragRotate.rotate.y;

    Dragger.prototype.dragStart.apply(this, arguments);

    // get element under pointer
    var elementMouseIsOver = document.elementFromPoint(pointer.pageX, pointer.pageY);
    //console.log(elementMouseIsOver.id);


    if (elementMouseIsOver.getAttribute("name") == "gizmoX") {
      currentGizmoMode = gizmoMode.POSX;
    } else if (elementMouseIsOver.getAttribute("name") == "gizmoY") {
      currentGizmoMode = gizmoMode.POSY;
    } else if (elementMouseIsOver.getAttribute("name") == "gizmoZ") {
      currentGizmoMode = gizmoMode.POSZ;
    } else if (elementMouseIsOver.getAttribute("name") == "gizmoRotX") {
      currentGizmoMode = gizmoMode.ROTX;
    } else if (elementMouseIsOver.getAttribute("name") == "gizmoRotY") {
      currentGizmoMode = gizmoMode.ROTY;
    } else if (elementMouseIsOver.getAttribute("name") == "gizmoRotZ") {
      currentGizmoMode = gizmoMode.ROTZ;
    } else {
      currentGizmoMode = gizmoMode.NONE;
      this.selectElement(this.children, elementMouseIsOver.id);
    }



  };

  Illustration.prototype.selectElement = function (children, id) {
    for (let i = 0; i < children.length; i++) {
      if (children[i].id == id) {
        children[i].selected = true;
        // selectedItem = children[i];
        
        indexOfGizmo = illo.children[illo.children.length];
        setTimeout(function(){ updateGuiValueOfSelected(); }, 100);
        new Zdog.Gizmo(
          { addTo: illo, translate: children[i].translate }
        );
        indexOfLastChild = i;

      } else {
        if (children[i]) {
          this.selectElement(children[i].children, id);
        }
        children[i].selected = false;
      }
    }
  };

  Illustration.prototype.dragMove = function (event, pointer) {
    if (currentGizmoMode != null) {
      for (let i = 0; i < illo.children.length; i++) {
        if (this.children[i].type == "Gizmo") {
          indexOfGizmo = i;
        }
      }
      let a = pointer.pageX - this.dragStartX;
      let b = pointer.pageY - this.dragStartY;
      let sign = (a + b) / Math.abs(a + b);
      let dist = Math.sqrt(a * a + b * b);

      //TODO: need to update gizmo location

      console.log(currentGizmoMode);
      switch (currentGizmoMode) {
        case gizmoMode.POSX:
          this.children[indexOfLastChild].translate.x = dist * sign;
          this.children[indexOfGizmo].translate.x = dist * sign;
          break;
        case gizmoMode.POSY:
          this.children[indexOfLastChild].translate.y = dist * sign;
          this.children[indexOfGizmo].translate.y = dist * sign;
          break;
        case gizmoMode.POSZ:
          this.children[indexOfLastChild].translate.z = dist * sign;
          this.children[indexOfGizmo].translate.z = dist * sign;
          break;
        case gizmoMode.ROTX:
          this.children[indexOfLastChild].rotate.x = dist * sign * Math.PI / 180;
          break;
        case gizmoMode.ROTY:
          this.children[indexOfLastChild].rotate.y = dist * sign * Math.PI / 180;
          break;
        case gizmoMode.ROTZ:
          this.children[indexOfLastChild].rotate.z = dist * sign * Math.PI / 180;
          break;
        default:
          break;
      }

      /*if (currentGizmoMode == gizmoMode.POSX) {
        this.children[0].translate.x = dist * sign;
      } else if (currentGizmoMode == gizmoMode.POSY) {
        this.children[0].translate.y = dist * sign;
      } else if (currentGizmoMode == gizmoMode.POSZ) {
        this.children[0].translate.z = dist * sign;
      }*/

    } else {
      var moveX = pointer.pageX - this.dragStartX;
      var moveY = pointer.pageY - this.dragStartY;
      var displaySize = Math.min(this.width, this.height);
      var moveRY = moveX / displaySize * TAU;
      var moveRX = moveY / displaySize * TAU;
      this.dragRotate.rotate.x = this.dragStartRX - moveRX;
      this.dragRotate.rotate.y = this.dragStartRY - moveRY;
      Dragger.prototype.dragMove.apply(this, arguments);
    }
  };

  return Illustration;

}));
