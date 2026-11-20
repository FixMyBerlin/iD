import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { presetManager } from '../../presets';
import { utilArrayIdentical } from '../../util/array';
import { t } from '../../core/localizer';
import { uiTooltip } from '../tooltip';
import { utilRebind } from '../../util';
import { uiPresetIcon } from '../preset_icon';
import { uiSection } from '../section';
import { uiTagReference } from '../tag_reference';
import { uiFavoriteButton } from '../favorite_button';
import { uiInfra3dButton } from '../infra3d_button';
import { presetFavorites } from '../../core/preset_favorites';


export function uiSectionFeatureType(context) {

    var dispatch = d3_dispatch('choose');

    var _entityIDs = [];
    var _presets = [];

    var _tagReference;
    var _favoriteButton = uiFavoriteButton(context);
    var _infra3dButton = uiInfra3dButton(context);

    var section = uiSection('feature-type', context)
        .label(() => t.append('inspector.feature_type'))
        // Radnetz Berlin: the preset is the sidebar's header, not a collapsible section
        .content(renderDisclosureContent);

    function renderDisclosureContent(selection) {

        selection.classed('preset-list-item', true);
        selection.classed('mixed-types', _presets.length > 1);

        var presetButtonWrap = selection
            .selectAll('.preset-list-button-wrap')
            .data([0])
            .enter()
            .append('div')
            .attr('class', 'preset-list-button-wrap');

        var presetButton = presetButtonWrap
            .append('button')
            .attr('class', 'preset-list-button preset-reset')
            .call(uiTooltip()
                .title(() => t.append('inspector.back_tooltip'))
                .placement('bottom')
            );

        presetButton.append('div')
            .attr('class', 'preset-icon-container');

        presetButton
            .append('div')
            .attr('class', 'label')
            .append('div')
            .attr('class', 'label-inner');

        presetButtonWrap.append('div')
            .attr('class', 'accessory-buttons');

        var tagReferenceBodyWrap = selection
            .selectAll('.tag-reference-body-wrap')
            .data([0]);

        tagReferenceBodyWrap = tagReferenceBodyWrap
            .enter()
            .append('div')
            .attr('class', 'tag-reference-body-wrap')
            .merge(tagReferenceBodyWrap);

        // update header
        if (_tagReference) {
            selection.selectAll('.preset-list-button-wrap .accessory-buttons')
                .style('display', _presets.length === 1 ? null : 'none')
                .call(_tagReference.button);

            tagReferenceBodyWrap
                .style('display', _presets.length === 1 ? null : 'none')
                .call(_tagReference.body);
        }

        selection.selectAll('.preset-list-button-wrap .accessory-buttons')
            .call(_favoriteButton.presets(_presets))
            // Radnetz Berlin: open infra3D at the selected feature
            .call(_infra3dButton.entityIDs(_entityIDs));

        selection.selectAll('.preset-reset')
            .on('click', function() {
                 dispatch.call('choose', this, _presets);
            })
            .on('pointerdown pointerup mousedown mouseup', function(d3_event) {
                d3_event.preventDefault();
                d3_event.stopPropagation();
            });

        var geometries = entityGeometries();
        selection.select('.preset-list-item button')
            .call(uiPresetIcon()
                .geometry(_presets.length === 1 ? (geometries.length === 1 && geometries[0]) : null)
                .preset(_presets.length === 1 ? _presets[0] : presetManager.item('point'))
            );

        var names = _presets.length === 1 ? [
            _presets[0].nameLabel(),
            _presets[0].subtitleLabel()
        ].filter(Boolean) : [ t.append('inspector.multiple_types') ];

        var label = selection.select('.label-inner');

        // Radnetz Berlin: "Feature type" as a small line above the preset name
        label.selectAll('.feature-type-kicker')
            .data([0])
            .enter()
            .insert('div', ':first-child')
            .attr('class', 'feature-type-kicker')
            .call(t.append('inspector.feature_type'));

        var nameparts = label.selectAll('.namepart')
            .data(names, d => d.stringId);

        nameparts.exit()
            .remove();

        nameparts
            .enter()
            .append('div')
            .attr('class', 'namepart')
            .text('')
            .each(function(d) { d(d3_select(this)); });
    }

    section.entityIDs = function(val) {
        if (!arguments.length) return _entityIDs;
        _entityIDs = val;
        return section;
    };

    section.presets = function(val) {
        if (!arguments.length) return _presets;

        // don't reload the same preset
        if (!utilArrayIdentical(val, _presets)) {
            _presets = val;

            if (_presets.length === 1) {
                _tagReference = uiTagReference(_presets[0].reference(), context)
                    .showing(false);
            }
        }

        return section;
    };

    function entityGeometries() {

        var counts = {};

        for (var i in _entityIDs) {
            var geometry = context.graph().geometry(_entityIDs[i]);
            if (!counts[geometry]) counts[geometry] = 0;
            counts[geometry] += 1;
        }

        return Object.keys(counts).sort(function(geom1, geom2) {
            return counts[geom2] - counts[geom1];
        });
    }

    presetFavorites.on('change.featureType', section.reRender);

    return utilRebind(section, dispatch, 'on');
}
