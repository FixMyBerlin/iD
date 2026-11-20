import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select, type Selection } from 'd3-selection';

import { t } from '../../core/localizer';
import { presetManager } from '../../presets';
import { utilRebind, utilUniqueDomId } from '../../util';
import { importableAssetUrl } from '../../traffic_sign/asset_url';
import { uiFieldCombo } from './combo';

/**
 * Surface and smoothness in one field, photos first (WORKDOC feature 24). The UI is
 * `@osm-editor-kit/surface-smoothness-id-field`, vendored in `vendor/surface-smoothness-field/`
 * and copied to `dist/surface-smoothness-field/`; it is loaded when the field is first shown.
 * The input row below the photos is iD's own combo for the schema's surface / smoothness field.
 */

type FieldModule = {
    createSurfaceSmoothnessField: (
        field: { surfaceKey?: string; smoothnessKey?: string; safeid?: string },
        context: { assetUrl?: (path: string) => string },
        adapters: {
            t?: (key: string, fallback: string) => string;
            optionLabel?: (key: 'surface' | 'smoothness', value: string) => string | undefined;
            options?: (key: 'surface' | 'smoothness') => string[] | undefined;
            renderInput?: (
                cell: HTMLElement,
                key: 'surface' | 'smoothness',
                value: string | string[] | undefined,
                choose: (value: string | undefined) => void
            ) => void;
        }
    ) => FieldImpl;
};
type FieldImpl = ((selection: Selection<any, any, any, any>) => void) & {
    tags: (tags: TagsMulti) => FieldImpl;
    entityIDs: (ids: string[]) => FieldImpl;
    focus: () => FieldImpl;
    on: (type: string, listener: (patch: TagsUpdate) => void) => FieldImpl;
};

const BASE = 'surface-smoothness-field/';
let _loading: Promise<FieldModule> | undefined;


function loadField(context: iD.Context) {
    if (!_loading) {
        if (d3_select('#ideditor-surface-smoothness-field-css').empty()) {
            d3_select('head').append('link')
                .attr('id', 'ideditor-surface-smoothness-field-css')
                .attr('rel', 'stylesheet')
                .attr('href', context.asset(BASE + 'surface-smoothness-field.css'));
        }
        _loading = (import(importableAssetUrl(context, BASE + 'index.js')) as Promise<FieldModule>)
            .catch(error => {
                _loading = undefined;
                throw error;
            });
    }
    return _loading;
}


/** The label of a value in the schema's own (translated) surface / smoothness field */
function optionLabel(key: 'surface' | 'smoothness', value: string) {
    const field = presetManager.field(key) as unknown as {
        hasTextForStringId: (id: string) => boolean;
        t: (id: string) => string;
    } | undefined;
    if (!field) return undefined;
    if (field.hasTextForStringId(`options.${value}.title`)) return field.t(`options.${value}.title`);
    if (field.hasTextForStringId(`options.${value}`)) return field.t(`options.${value}`);
    return undefined;
}


function fieldTitle(key: string, fallback: string) {
    const field = presetManager.field(key) as unknown as { title?: () => string } | undefined;
    return field?.title?.() || fallback;
}


function fieldPlaceholder(key: string, fallback: string) {
    const field = presetManager.field(key) as unknown as { placeholder?: () => string } | undefined;
    return field?.placeholder?.() || fallback;
}


export function uiFieldSurfaceSmoothness(field: { keys?: string[]; safeid: string }, context: iD.Context) {
    const dispatch = d3_dispatch('change');
    let _impl: FieldImpl | undefined;
    let _tags: TagsMulti = {};
    let _entityIDs: string[] = [];

    const [surfaceKey = 'surface', smoothnessKey = 'smoothness'] = field.keys ?? [];
    const _combos: Partial<Record<'surface' | 'smoothness', any>> = {};


    /** iD's combo for the schema's surface / smoothness field, in the row below the photos */
    function renderCombo(cell: HTMLElement, name: 'surface' | 'smoothness', value: string | string[] | undefined,
        choose: (value: string | undefined) => void) {
        const schemaField = presetManager.field(name);
        if (!schemaField) return;
        const key = name === 'surface' ? surfaceKey : smoothnessKey;
        let combo = _combos[name];
        if (!combo) {
            combo = uiFieldCombo({ ...schemaField, key, domId: utilUniqueDomId(`form-field-${name}`) }, context);
            _combos[name] = combo;
        }
        // typing only shows suggestions; the value is set on choosing or leaving the input
        combo.on('change', (tags: TagsUpdate, onInput?: boolean) => {
            if (!onInput) choose(tags[key] as string | undefined);
        });
        d3_select(cell).call(combo);
        combo.tags({ [key]: value });
    }

    function create(module: FieldModule) {
        return module.createSurfaceSmoothnessField(
            { surfaceKey, smoothnessKey, safeid: field.safeid },
            { assetUrl: path => context.asset(BASE + path) },
            {
                t: (key, fallback) => {
                    if (key === 'surface') return fieldTitle('surface', fallback);
                    if (key === 'smoothness') return fieldTitle('smoothness', fallback);
                    if (key === 'surface_placeholder') return fieldPlaceholder('surface', fallback);
                    if (key === 'smoothness_placeholder') return fieldPlaceholder('smoothness', fallback);
                    return t(`inspector.surface_smoothness.${key}`, { default: fallback });
                },
                optionLabel,
                // the input below the photos offers the schema's values as well
                options: key => (presetManager.field(key) as unknown as { options?: string[] } | undefined)?.options,
                renderInput: renderCombo
            }
        ).on('change', patch => dispatch.call('change', surfaceSmoothness, patch));
    }


    function surfaceSmoothness(selection: Selection<any, unknown, any, any>) {
        loadField(context)
            .then(module => {
                if (!_impl) {
                    _impl = create(module).entityIDs(_entityIDs).tags(_tags);
                }
                selection.call(_impl);
                // the field is loaded later than the related tags lines (feature 25): keep them below
                selection.select('.field-related').raise();
            })
            .catch(error => console.error('surface/smoothness field failed to load:', error));  // eslint-disable-line no-console
    }


    surfaceSmoothness.tags = function(tags: TagsMulti) {
        _tags = tags;
        _impl?.tags(tags);
        return surfaceSmoothness;
    };


    surfaceSmoothness.entityIDs = function(val?: string[]) {
        if (val === undefined) return _entityIDs;
        _entityIDs = val;
        _impl?.entityIDs(val);
        return surfaceSmoothness;
    };


    surfaceSmoothness.focus = function() {
        _impl?.focus();
    };


    return utilRebind(surfaceSmoothness, dispatch, 'on');
}

uiFieldSurfaceSmoothness.supportsMultiselection = true;
