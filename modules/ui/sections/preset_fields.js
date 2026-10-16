import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { presetManager } from '../../presets';
import { t, localizer } from '../../core/localizer';
import { utilArrayIdentical } from '../../util/array';
import { utilArrayUnion, utilRebind } from '../../util';
import { geoExtent } from '../../geo/extent';
import { uiField } from '../field';
import { uiFormFields } from '../form_fields';
import { uiSection } from '../section';
import { appendTrafficSignInspectorFields, trafficSignFieldsSignature } from './traffic_sign_inspector_fields';
import { uiSideWidthFields } from './side_width_fields';
import { uiRelatedTags } from './related_tags';

export function uiSectionPresetFields(context) {

    var section = uiSection('preset-fields', context)
        .label(() => t.append('inspector.fields'))
        .disclosureContent(renderDisclosureContent);

    var dispatch = d3_dispatch('change', 'revert');
    var formFields = uiFormFields(context);
    var _state;
    var _fieldsArr;
    var _presets = [];
    var _tags;
    var _entityIDs;
    var _trafficSignFieldsArr = [];
    var _trafficSignFieldsSignature = '';
    var _sideWidthFields = uiSideWidthFields(context, dispatch);
    // Radnetz Berlin: `source:*`, `note:*`, … as small lines below their field (feature 25)
    var _relatedTags = uiRelatedTags(context, dispatch);
    // Radnetz Berlin: another section (TILDA) can color field titles and bring a field into view
    var _fieldStatus = null;
    var _allFields = [];

    function fieldKeys(field) {
        return [field.key].concat(field.keys || []).filter(Boolean);
    }

    function renderDisclosureContent(selection) {
        var graph = context.graph();

        var geometries = Object.keys(_entityIDs.reduce(function(geoms, entityID) {
            geoms[graph.entity(entityID).geometry(graph)] = true;
            return geoms;
        }, {}));

        if (!_fieldsArr) {

            const loc = _entityIDs.reduce(function(extent, entityID) {
                var entity = context.graph().entity(entityID);
                return extent.extend(entity.extent(context.graph()));
            }, geoExtent()).center();

            var presetsManager = presetManager;

            var allFields = [];
            var allMoreFields = [];
            var sharedTotalFields;

            _presets.forEach(function(preset) {
                var fields = preset.fields(loc);
                var moreFields = preset.moreFields(loc);

                allFields = utilArrayUnion(allFields, fields);
                allMoreFields = utilArrayUnion(allMoreFields, moreFields);

                if (!sharedTotalFields) {
                    sharedTotalFields = utilArrayUnion(fields, moreFields);
                } else {
                    sharedTotalFields = sharedTotalFields.filter(function(field) {
                        return fields.indexOf(field) !== -1 || moreFields.indexOf(field) !== -1;
                    });
                }
            });

            var sharedFields = allFields.filter(function(field) {
                return sharedTotalFields.indexOf(field) !== -1;
            });
            var sharedMoreFields = allMoreFields.filter(function(field) {
                return sharedTotalFields.indexOf(field) !== -1;
            });

            _fieldsArr = [];
            _trafficSignFieldsSignature = null;   // the preset's own traffic sign fields may have changed

            sharedFields.forEach(function(field) {
                if (field.matchAllGeometry(geometries)) {
                    _fieldsArr.push(
                        uiField(context, field, _entityIDs)
                    );
                }
            });

            var singularEntity = _entityIDs.length === 1 && graph.hasEntity(_entityIDs[0]);
            if (singularEntity && singularEntity.type === 'node' && singularEntity.isHighwayIntersection(graph) && presetsManager.field('restrictions')) {
                _fieldsArr.push(
                    uiField(context, presetsManager.field('restrictions'), _entityIDs)
                );
            }

            var additionalFields = utilArrayUnion(sharedMoreFields, presetsManager.universal());
            additionalFields.sort(function(field1, field2) {
                return field1.title().localeCompare(field2.title(), localizer.localeCode());
            });

            additionalFields.forEach(function(field) {
                if (sharedFields.indexOf(field) === -1 &&
                    field.matchAllGeometry(geometries)) {
                    _fieldsArr.push(
                        uiField(context, field, _entityIDs, { show: false })
                    );
                }
            });

            _fieldsArr.forEach(function(field) {
                field
                    .on('change', function(t, onInput) {
                        dispatch.call('change', field, _entityIDs, t, onInput);
                    })
                    .on('revert', function(keys) {
                        dispatch.call('revert', field, keys);
                    });
            });
        }

        var signature = trafficSignFieldsSignature(_tags, geometries);
        if (signature !== _trafficSignFieldsSignature) {
            _trafficSignFieldsSignature = signature;
            _trafficSignFieldsArr = [];
            appendTrafficSignInspectorFields(
                _trafficSignFieldsArr,
                _tags,
                context,
                _entityIDs,
                presetManager,
                geometries,
                dispatch,
                _fieldsArr.flatMap(fieldKeys)
            );
        }

        // the bike lane and sidewalk sign fields follow the way's own sign field (feature 27)
        var signIndex = _fieldsArr.findIndex(function(field) { return field.key === 'traffic_sign'; });
        var fieldsToShow = signIndex === -1 ? _fieldsArr.concat(_trafficSignFieldsArr) :
            _fieldsArr.slice(0, signIndex + 1).concat(_trafficSignFieldsArr, _fieldsArr.slice(signIndex + 1));
        var shownKeys = new Set(fieldsToShow.map(function(field) { return field.key; }));
        var widthField = presetManager.field('width');
        fieldsToShow = fieldsToShow.concat(
            _sideWidthFields.fields(_tags, _entityIDs, widthField, shownKeys)
        );

        var isImagesField = function(field) { return field.type === 'mapillaryImages'; };
        fieldsToShow.forEach(function(field) {
            if (!isImagesField(field)) field.state(_state).tags(_tags);
        });

        // Radnetz Berlin: images of another field's key show below that field, not in the images field
        var shownFields = fieldsToShow.filter(function(field) { return field.isAllowed() && field.isShown(); });
        var relatedKeys = _relatedTags.assign(shownFields, _tags, _entityIDs, _state);
        fieldsToShow.filter(isImagesField).forEach(function(field) {
            field.hiddenKeys = relatedKeys;
            field.state(_state).tags(_tags);
        });

        selection
            .call(formFields
                .fieldsArr(fieldsToShow)
                .state(_state)
                .klass('grouped-items-area')
            );

        _relatedTags.render(selection);

        _allFields = fieldsToShow;
        selection.selectAll('.wrap-form-field, .field-related-editor')   // also the editors of related tags
            .each(function(d) {
                var status = _fieldStatus ? _fieldStatus(fieldKeys(d)) : undefined;
                d3_select(this)
                    .classed('field-status-required', status === 'required')
                    .classed('field-status-optional', status === 'optional');
            });
    }

    /** `function(keys) → 'required' | 'optional' | undefined`: marks the titles of fields with these keys */
    section.fieldStatus = function(val) {
        if (!arguments.length) return _fieldStatus;
        _fieldStatus = val;
        return section;
    };

    /** Shows the field for one of `keys` (also a "more field"), scrolls to it and highlights it */
    section.revealField = function(keys) {
        var container = d3_select('.entity-editor .section-preset-fields');
        var summary = container.select('summary.hide-toggle');
        if (!summary.empty() && !summary.classed('expanded')) summary.node().click();   // renders the fields

        var field = _allFields.find(function(f) {
            return fieldKeys(f).some(function(key) { return keys.indexOf(key) !== -1; });
        });
        // a related tag (`source:width`): opens its editor below the field
        if (!field) {
            field = _relatedTags.reveal(keys, _allFields.filter(function(f) { return f.isShown(); }));
        }
        if (!field) return false;
        if (field.show && !field.isShown()) field.show();
        section.reRender();

        var wrap = container.select('.wrap-form-field-' + field.safeid);
        if (wrap.empty()) return false;
        wrap.node().scrollIntoView({ block: 'center', behavior: 'smooth' });
        wrap.classed('field-reveal', false);
        wrap.node().getBoundingClientRect();   // restart the animation (reflow)
        wrap.classed('field-reveal', true);
        return true;
    };

    section.presets = function(val) {
        if (!arguments.length) return _presets;
        if (!_presets || !val || !utilArrayIdentical(_presets, val)) {
            _presets = val;
            _fieldsArr = null;
        }
        return section;
    };

    section.state = function(val) {
        if (!arguments.length) return _state;
        _state = val;
        return section;
    };

    section.tags = function(val) {
        if (!arguments.length) return _tags;
        _tags = val;
        // Don't reset _fieldsArr here.
        return section;
    };

    section.entityIDs = function(val) {
        if (!arguments.length) return _entityIDs;
        if (!val || !_entityIDs || !utilArrayIdentical(_entityIDs, val)) {
            _entityIDs = val;
            _fieldsArr = null;
            _trafficSignFieldsArr = [];
            _trafficSignFieldsSignature = '';
            _sideWidthFields.reset();
            _relatedTags.reset();
        }
        return section;
    };

    return utilRebind(section, dispatch, 'on');
}
