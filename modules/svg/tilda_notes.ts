import { throttle } from 'es-toolkit';
import { select as d3_select } from 'd3-selection';

import { patchHash } from '../behavior/hash';
import { prefs } from '../core/preferences';
import { notesHashHas, notesHashWith } from '../tilda_notes/notes_hash';
import { utilStringQs } from '../util';
import { modeBrowse } from '../modes/browse';
import { services } from '../services';
import { svgPointTransform } from './helpers';
import type { TildaNote } from '../tilda_notes/note';
import type { Projection } from '../geo/raw_mercator';
import type { LayerDispatch } from './layers';

// A link's `notes` parameter wins (`notes=osm,tilda`); else on unless the user turned the layer off
const _hashNotes = utilStringQs(window.location.hash).notes;
let _enabled = typeof _hashNotes === 'string' ? notesHashHas(_hashNotes, 'tilda') : prefs('tilda-notes.enabled') !== 'false';

const MARKER_PATH = 'm17.5,0l-15,0c-1.37,0 -2.5,1.12 -2.5,2.5l0,11.25c0,1.37 1.12,2.5 2.5,2.5l3.75,0l0,3.28c0,0.38 0.43,0.6 0.75,0.37l4.87,-3.65l5.62,0c1.37,0 2.5,-1.12 2.5,-2.5l0,-11.25c0,-1.37 -1.12,-2.5 -2.5,-2.5z';

import type { Selection as D3Selection } from 'd3-selection';
type NoteSelection = D3Selection<SVGGElement, TildaNote, SVGGElement, unknown>;


/**
 * Map layer of the internal TILDA notes (WORKDOC feature 29), modelled on `svg/notes.js`.
 * The markers share the `.note` styles and get `.tilda-note` for their own colours.
 */
export function svgTildaNotes(projection: Projection, context: iD.Context, dispatch: LayerDispatch) {
    const throttledRedraw = throttle(() => dispatch.call('change'), 300);
    const minZoom = 10;
    let touchLayer: d3.Selection<any> = d3_select(null!);
    let drawLayer: d3.Selection<SVGGElement> = d3_select(null!);
    let _listening = false;

    function getService() {
        const service = services.tildaNotes;
        // loosely coupled: the service may be missing (tests) or not configured
        if (!service || !service.configured()) return null;
        if (!_listening) {
            _listening = true;
            // a layer that is on by default is in the URL too, so a link shows the same note layers
            patchHash((current: Record<string, string>) => ({ notes: notesHashWith(current.notes, 'tilda', _enabled) }));
            service.on('loadedNotes.svg-tilda-notes', throttledRedraw);
        }
        return service;
    }


    function removeMarkers() {
        drawLayer.selectAll('.tilda-note').remove();
        touchLayer.selectAll('.tilda-note').remove();
    }


    function updateMarkers() {
        const service = getService();
        if (!service || !_enabled) return;

        const selectedID = service.selectedID();
        const data = service.notes(projection);
        const getTransform = svgPointTransform(projection);

        function sortY(a: TildaNote, b: TildaNote) {
            if (a.id === selectedID) return 1;
            if (b.id === selectedID) return -1;
            return b.loc[1] - a.loc[1];
        }

        // markers
        const notes = drawLayer.selectAll<SVGGElement, TildaNote>('.tilda-note')
            .data(data, d => d.status + d.id);

        notes.exit().remove();

        const notesEnter = notes.enter()
            .append('g')
            .attr('class', d => `note tilda-note tilda-note-${d.id} ${d.status}`)
            .classed('new', d => d.isNew()) as NoteSelection;

        notesEnter.append('ellipse')
            .attr('cx', 0.5)
            .attr('cy', 1)
            .attr('rx', 6.5)
            .attr('ry', 3)
            .attr('class', 'stroke');

        notesEnter.append('path')
            .attr('class', 'shadow')
            .attr('transform', 'translate(-8, -22)')
            .attr('d', MARKER_PATH);

        notesEnter.append('use')
            .attr('class', 'note-fill')
            .attr('width', '20px')
            .attr('height', '20px')
            .attr('x', '-8px')
            .attr('y', '-22px')
            .attr('xlink:href', '#iD-icon-note');

        // open: question mark (as in TILDA); resolved: check mark; new: plus
        notesEnter.filter(d => !d.isNew() && d.status === 'open')
            .append('text')
            .attr('class', 'tilda-note-annotation')
            .attr('x', 2)
            .attr('y', -10)
            .attr('text-anchor', 'middle')
            .text('?');

        notesEnter.filter(d => d.isNew() || d.status !== 'open')
            .append('use')
            .attr('class', 'icon-annotation')
            .attr('width', '10px')
            .attr('height', '10px')
            .attr('x', '-3px')
            .attr('y', '-19px')
            .attr('xlink:href', d => d.isNew() ? '#iD-icon-plus' : '#iD-icon-apply');

        notes.merge(notesEnter)
            .sort(sortY)
            .classed('selected', d => d.id === selectedID)
            .attr('transform', getTransform);

        // touch targets
        if (touchLayer.empty()) return;
        const fillClass = context.getDebug('target') ? 'pink ' : 'nocolor ';

        const targets = touchLayer.selectAll<SVGRectElement, TildaNote>('.tilda-note')
            .data(data, d => d.id);

        targets.exit().remove();

        targets.enter()
            .append('rect')
            .attr('width', '20px')
            .attr('height', '20px')
            .attr('x', '-8px')
            .attr('y', '-22px')
            .merge(targets)
            .sort(sortY)
            .attr('class', d => `note tilda-note target tilda-note-${d.id} ${fillClass}${d.isNew() ? 'new' : ''}`)
            .attr('transform', getTransform);
    }


    function drawTildaNotes(selection: d3.Selection<SVGGElement>) {
        const service = getService();

        const surface = context.surface();
        if (surface && !surface.empty()) {
            touchLayer = surface.selectAll('.data-layer.touch .layer-touch.markers');
        }

        const layer = selection.selectAll<SVGGElement, number>('.layer-tilda-notes')
            .data(service ? [0] : []);

        layer.exit().remove();

        drawLayer = layer.enter()
            .append('g')
            .attr('class', 'layer-tilda-notes')
            .merge(layer)
            .style('display', _enabled ? 'block' : 'none');

        if (!service) return;

        if (_enabled && ~~context.map().zoom() >= minZoom) {
            service.loadNotes();
            updateMarkers();
        } else {
            removeMarkers();
        }
    }


    drawTildaNotes.enabled = function(val?: boolean) {
        if (!arguments.length) return _enabled && !!getService();

        _enabled = !!val;
        prefs('tilda-notes.enabled', _enabled ? 'true' : 'false');
        patchHash((current: Record<string, string>) => ({ notes: notesHashWith(current.notes, 'tilda', _enabled && !!getService()) }));

        if (!_enabled) {
            throttledRedraw.cancel();
            removeMarkers();
            if (services.tildaNotes?.selectedID()) {
                context.enter(modeBrowse(context) as any);
            }
        }

        dispatch.call('change');
        return drawTildaNotes;
    };


    drawTildaNotes.supported = function() {
        return !!getService();
    };


    return drawTildaNotes;
}
