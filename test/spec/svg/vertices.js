import { geoProjection as d3_geoProjection } from 'd3-geo';
import { select as d3_select } from 'd3-selection';


describe('iD.svgVertices', function () {
    var context;
    var surface;
    var projection = d3_geoProjection(function(x, y) { return [x, -y]; })
        .translate([0, 0])
        .scale(iD.geoZoomToScale(17))
        .clipExtent([[0, 0], [Infinity, Infinity]]);


    beforeEach(function () {
        context = iD.coreContext().assetPath('../dist/').init();
        d3_select(document.createElement('div'))
            .attr('class', 'main-map')
            .call(context.map().centerZoom([0, 0], 17));
        surface = context.surface();
    });


    it('adds the .shared class to vertices that are members of two or more ways', function () {
        var node = new iD.osmNode({loc: [0, 0]});
        var way1 = new iD.osmWay({nodes: [node.id], tags: {highway: 'residential'}});
        var way2 = new iD.osmWay({nodes: [node.id], tags: {highway: 'residential'}});
        var graph = new iD.coreGraph([node, way1, way2]);
        var filter = function() { return true; };
        var extent = iD.geoExtent([0, 0], [1, 1]);

        surface.call(iD.svgVertices(projection, context), graph, [node], filter, extent);
        expect(surface.select('.vertex').classed('shared')).toBe(true);
    });


    describe('drawHover', function() {
        var middle, way, graph, extent, drawVertices;

        beforeEach(function() {
            var first = new iD.osmNode({ loc: [-0.0001, 0] });
            middle = new iD.osmNode({ loc: [0, 0] });
            var last = new iD.osmNode({ loc: [0.0001, 0] });
            way = new iD.osmWay({ nodes: [first.id, middle.id, last.id], tags: { highway: 'residential' } });
            graph = new iD.coreGraph([first, middle, last, way]);
            extent = iD.geoExtent([-1, -1], [1, 1]);
            drawVertices = iD.svgVertices(projection, context);
        });

        function hoverTarget(entity) {
            return { properties: { entity: entity } };
        }

        it('redraws nothing outside the draw modes', function() {
            var target = hoverTarget(way);
            expect(drawVertices.drawHover(surface, graph, target, extent)).toBe(false);
            expect(drawVertices.drawHover(surface, graph, undefined, extent)).toBe(false);
            expect(surface.selectAll('.vertex').size()).toBe(0);
        });

        it('draws and removes the hovered vertices in the draw modes', function() {
            context.mode = function() { return { id: 'draw-line' }; };
            var target = hoverTarget(way);
            expect(drawVertices.drawHover(surface, graph, target, extent)).toBe(true);
            expect(surface.selectAll('.layer-osm .vertex.' + middle.id).size()).toBe(1);
            // the same target again: nothing to do
            expect(drawVertices.drawHover(surface, graph, target, extent)).toBe(false);
            expect(drawVertices.drawHover(surface, graph, undefined, extent)).toBe(true);
            expect(surface.selectAll('.layer-osm .vertex.' + middle.id).size()).toBe(0);
        });

        it('removes hovered vertices left over from a draw mode', function() {
            context.mode = function() { return { id: 'draw-line' }; };
            expect(drawVertices.drawHover(surface, graph, hoverTarget(way), extent)).toBe(true);
            context.mode = function() { return { id: 'browse' }; };
            expect(drawVertices.drawHover(surface, graph, undefined, extent)).toBe(true);
            expect(surface.selectAll('.layer-osm .vertex.' + middle.id).size()).toBe(0);
            // a full redraw outside the draw modes leaves no hovered vertices behind
            surface.call(drawVertices, graph, [], function() { return true; }, extent, true);
            expect(drawVertices.drawHover(surface, graph, hoverTarget(way), extent)).toBe(false);
        });
    });


    describe('drawSelected', function() {
        it('only updates the selected vertices when a full redraw follows', function() {
            var first = new iD.osmNode({ loc: [-0.0001, 0] });
            var middle = new iD.osmNode({ loc: [0, 0] });
            var last = new iD.osmNode({ loc: [0.0001, 0] });
            var way = new iD.osmWay({ nodes: [first.id, middle.id, last.id], tags: { highway: 'residential' } });
            var graph = new iD.coreGraph([first, middle, last, way]);
            var extent = iD.geoExtent([-1, -1], [1, 1]);
            var drawVertices = iD.svgVertices(projection, context);
            context.selectedIDs = function() { return [way.id]; };

            drawVertices.drawSelected(surface, graph, extent, true);
            expect(surface.selectAll('.vertex').size()).toBe(0);

            // the full redraw draws them, with the plain middle vertex of the selected way
            surface.call(drawVertices, graph, [first, middle, last, way], function() { return true; }, extent, true);
            expect(surface.selectAll('g.vertex.' + middle.id).size()).toBe(1);
        });
    });
});

