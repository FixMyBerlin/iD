import { debounce } from 'es-toolkit';

import { select as d3_select } from 'd3-selection';

import {
    modeAddNote,
    modeAddTildaNote,
    modeBrowse
} from '../../modes';

import { t } from '../../core/localizer';
import { svgIcon } from '../../svg';
import { uiTooltip } from '../tooltip';

export function uiToolNotes(context) {

    var tool = {
        id: 'notes',
        label: t.append('modes.add_note.label')
    };

    // Public OSM notes and internal TILDA notes (WORKDOC feature 29): one button per enabled layer
    var osmMode = Object.assign(modeAddNote(context), { layerId: 'notes', title: t.append('tilda_notes.add.osm_title') });
    var modes = [osmMode, modeAddTildaNote(context)];

    function enabled(d) {
        return layerEnabled(d) && notesEditable();
    }

    function layerEnabled(d) {
        var noteLayer = context.layers().layer(d.layerId);
        return noteLayer && noteLayer.enabled();
    }

    function notesEditable() {
        var mode = context.mode();
        return context.map().withinEditableZoom() && mode && mode.id !== 'save';
    }

    modes.forEach(function(mode) {
        context.keybinding().on(mode.key, function(d3_event) {
            if (!enabled(mode)) return;

            d3_event.preventDefault();

            if (mode.id === context.mode().id) {
                context.enter(modeBrowse(context));
            } else {
                context.enter(mode);
            }
        });
    });

    tool.render = function(selection) {

        var debouncedUpdate = debounce(update, 500, { edges: ['leading', 'trailing'] });

        context.map()
            .on('move.notes', debouncedUpdate)
            .on('drawn.notes', debouncedUpdate);

        context
            .on('enter.notes', update);

        update();


        function update() {
            var data = modes.filter(layerEnabled);

            var buttons = selection.selectAll('button.add-button')
                .data(data, function(d) { return d.id; });

            // exit
            buttons.exit()
                .remove();

            // enter
            var buttonsEnter = buttons.enter()
                .append('button')
                .attr('class', function(d) { return d.id + ' add-button bar-button'; })
                .on('click.notes', function(d3_event, d) {
                    if (!enabled(d)) return;

                    // When drawing, ignore accidental clicks on mode buttons - #4042
                    var currMode = context.mode().id;
                    if (/^draw/.test(currMode)) return;

                    if (d.id === currMode) {
                        context.enter(modeBrowse(context));
                    } else {
                        context.enter(d);
                    }
                })
                .call(uiTooltip()
                    .placement('bottom')
                    .title(function(d) { return d.description; })
                    .keys(function(d) { return [d.key]; })
                    .scrollContainer(context.container().select('.top-toolbar'))
                );

            buttonsEnter
                .each(function(d) {
                    d3_select(this)
                        .call(svgIcon(d.icon || '#iD-icon-' + d.button))
                        .append('span')
                        .attr('class', 'label')
                        .call(d.title);
                });

            // if we are adding/removing the buttons, check if toolbar has overflowed
            if (buttons.enter().size() || buttons.exit().size()) {
                context.ui().checkOverflow('.top-toolbar', true);
            }

            // update
            buttons
                .merge(buttonsEnter)
                .classed('disabled', function(d) { return !enabled(d); })
                .attr('aria-disabled', function(d) { return !enabled(d); })
                .classed('active', function(d) { return context.mode() && context.mode().button === d.button; })
                .attr('aria-pressed', function(d) { return context.mode() && context.mode().button === d.button; });
        }
    };

    tool.uninstall = function() {
        context
            .on('enter.editor.notes', null)
            .on('exit.editor.notes', null)
            .on('enter.notes', null);

        context.map()
            .on('move.notes', null)
            .on('drawn.notes', null);
    };

    return tool;
}
