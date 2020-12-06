/**
 * Gizmo composite shape
 */

(function (root, factory) {
    // module definition
    if (typeof module == 'object' && module.exports) {
        // CommonJS
        module.exports = factory(require('./boilerplate'), require('./vector'),
            require('./path-command'), require('./anchor'), require('./ellipse'));
    } else {
        // browser global
        var Zdog = root.Zdog;
        Zdog.Gizmo = factory(Zdog, Zdog.Vector, Zdog.PathCommand,
            Zdog.Anchor, Zdog.Ellipse);
    }
}(this, function factory(utils, Vector, PathCommand, Anchor, Ellipse) {

    var Gizmo = Ellipse.subclass({
        type: "Gizmo",
    });

    var TAU = utils.TAU;

    Gizmo.prototype.create = function ( /* options */) {
        // call super
        Ellipse.prototype.create.apply(this, arguments);
        // composite shape, create child shapes
        this.children.push(new Zdog.Cone({
            name: "gizmoX",
            translate: { x: 4 },
            rotate: { y: -Math.PI * 0.5 },
            // stroke: 1,
            color: "#ff0000",
        }));
        this.children.push(new Zdog.Cone({
            name: "gizmoY",
            translate: { y: -4 },
            rotate: { x: Math.PI * 0.5 },
            //stroke: 1,
            color: "#00FF00",
        }));
        this.children.push(new Zdog.Cone({
            name: "gizmoZ",
            translate: { z: 4 },

            //stroke: 1,
            color: "#0000FF",
        }));
        this.children.push(new Zdog.Shape({
            path: [
                { x: 0 },
                { x: 4 },
                { move: { y: 0 } },
                { y: -4 },
                { move: { z: 0 } },
                { z: 4 },
            ],
            stroke: 0.1,
            color: offWhite,
        }));
    };



    Gizmo.prototype.render = function (ctx, renderer) {

    };

    return Gizmo;

}));
