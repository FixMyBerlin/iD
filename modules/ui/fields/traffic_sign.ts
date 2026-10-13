import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';
import * as countryCoder from '@rapideditor/country-coder';

import { t } from '../../core/localizer';
import { importableAssetUrl } from '../../traffic_sign/asset_url';
import { loadSignRecommender } from '../../traffic_sign/recommender';
import { signTagPlan, type Recommend, type SignPlanRow } from '../../traffic_sign/sign_tag_plan';
import { svgIcon } from '../../svg/icon';
import { utilGetSetValue, utilNoAuto, utilRebind, utilTotalExtent } from '../../util';
import { uiCombobox } from '../combobox';
import { drawTagPlan, tagPlanChanges, type TagPlanRow } from '../tag_plan';
import { uiTooltip } from '../tooltip';

type TrafficSignFieldModule = {
    createTrafficSignField: (field: unknown, context: iD.Context, deps: Record<string, unknown>) => any;
};

let _loadFieldPromise: Promise<[void, TrafficSignFieldModule]> | null = null;


function loadTrafficSignFieldCss(context: iD.Context) {
    const href = context.asset('traffic-sign-field/id-field.css');

    return new Promise<void>((resolve, reject) => {
        const existing = d3_select<HTMLLinkElement, unknown>('#ideditor-traffic-sign-field-css');

        if (!existing.empty()) {
            const node = existing.node()!;
            if (node.sheet || node.href === href) {
                resolve();
                return;
            }
            existing
                .attr('href', href)
                .on('load.trafficSignField', () => resolve())
                .on('error.trafficSignField', reject);
            return;
        }

        d3_select('head')
            .append('link')
            .attr('id', 'ideditor-traffic-sign-field-css')
            .attr('rel', 'stylesheet')
            .attr('href', href)
            .on('load.trafficSignField', () => resolve())
            .on('error.trafficSignField', reject);
    });
}


function ensureTrafficSignFieldLoaded(context: iD.Context) {
    if (_loadFieldPromise) return _loadFieldPromise;

    _loadFieldPromise = Promise.all([
        loadTrafficSignFieldCss(context),
        import(importableAssetUrl(context, 'traffic-sign-field/id-field.esm.js')) as Promise<TrafficSignFieldModule>
    ]).catch((err: unknown) => {
        _loadFieldPromise = null;
        console.error('traffic sign field load error:', err);  // eslint-disable-line no-console
        throw new Error('traffic sign field failed to load');
    });

    return _loadFieldPromise;
}


export function uiFieldTrafficSign(field: unknown, context: iD.Context) {
    const dispatch = d3_dispatch('change');
    const fieldKey = (field as { key: string }).key;
    let _impl: any;
    let _entityIDs: string[] = [];
    let _pendingTags: TagsMulti | null = null;
    let _tags: TagsMulti = {};
    let _selection: d3.Selection | null = null;
    let _recommend: Recommend | null = null;
    /** sign values seen while this way is selected: the previous one explains which tags to remove */
    let _seenSign = false;
    let _lastSign: string | undefined;
    let _previousSign: string | undefined | null = null;   // null: not changed while selected


    function trackSign(value: string | undefined) {
        if (!_seenSign) {
            _seenSign = true;
            _lastSign = value;
        } else if (value !== _lastSign) {
            _previousSign = _lastSign;
            _lastSign = value;
        }
    }


    function rowReason(row: SignPlanRow, tags: Tags, previousSign: string | undefined) {
        if (row.cause === 'normalize') return t('inspector.traffic_sign_plan.cause.normalize');
        if (row.cause === 'restore') return t('inspector.traffic_sign_plan.cause.restore', { sign: previousSign ?? '' });
        if (row.cause === 'previous_sign') return t('inspector.traffic_sign_plan.cause.previous_sign', { sign: previousSign ?? '' });
        return t('inspector.traffic_sign_plan.cause.sign', { sign: tags[fieldKey] ?? '' });
    }


    /**
     * Below the field: the tags the (changed) sign implies, with an apply button, like the
     * TILDA section's tag plan. After applying, the TILDA section reads the new tags.
     */
    function drawSuggestions() {
        if (!_selection) return;

        let rows: TagPlanRow[] = [];
        const tags = _tags;
        const single = _entityIDs.length === 1 && Object.values(tags).every(value => !Array.isArray(value));
        if (single && _recommend) {
            const plainTags = tags as Tags;
            // changed while selected, else compared with the downloaded version
            const originalTags = context.history().base().hasEntity(_entityIDs[0] as iD.OsmEntity['id'])?.tags;
            const previousSign = _previousSign !== null ? _previousSign : originalTags?.[fieldKey];
            const plan = signTagPlan({ key: fieldKey, tags: plainTags, previousSign, originalTags, recommend: _recommend });
            rows = (plan ?? []).map(row => ({ ...row, reason: rowReason(row, plainTags, previousSign) }));
        }

        // not `traffic-sign-suggestions`: the package's own (switched off) suggestions use that class
        // and would remove this box
        let box = _selection.selectAll<HTMLDivElement, number>('.traffic-sign-plan')
            .data(rows.length ? [0] : []);
        box.exit().remove();
        const boxEnter = box.enter()
            .append('div')
            .attr('class', 'traffic-sign-plan');
        boxEnter.append('div')
            .attr('class', 'traffic-sign-plan-header')
            .call(t.append('inspector.traffic_sign_plan.header'));
        box = box.merge(boxEnter);

        drawTagPlan(box, rows.length ? {
            rows,
            canApply: true,
            applyLabel: t('inspector.traffic_sign_plan.apply'),
            onApply: () => dispatch.call('change', trafficSign, tagPlanChanges(rows))
        } : undefined);
    }


    /** Below an empty field: one click for "there is no sign here" (`traffic_sign=none`) */
    function drawNoneButton() {
        if (!_selection) return;
        const empty = _entityIDs.length > 0 && _tags[fieldKey] === undefined;

        const button = _selection.selectAll<HTMLButtonElement, number>('.traffic-sign-none')
            .data(empty ? [0] : []);
        button.exit().remove();
        button.enter()
            .append('button')
            .attr('type', 'button')
            .attr('class', 'traffic-sign-none')
            .attr('title', t('inspector.traffic_sign_none.tooltip', { tag: `${fieldKey}=none` }))
            .call(t.append('inspector.traffic_sign_none.label'))
            .on('click', (d3_event: MouseEvent) => {
                d3_event.preventDefault();
                dispatch.call('change', trafficSign, { [fieldKey]: 'none' });
            });
    }


    function createImpl(fieldModule: TrafficSignFieldModule) {
        const { createTrafficSignField } = fieldModule;

        return createTrafficSignField(field, context, {
            // this field shows its own tag suggestions below (`drawSuggestions`)
            suggestTags: false,
            uiCombobox: uiCombobox,
            utilRebind: utilRebind,
            utilGetSetValue: utilGetSetValue,
            utilNoAuto: utilNoAuto,
            utilTotalExtent: utilTotalExtent,
            uiTooltip: uiTooltip,
            svgIcon: svgIcon,
            t: t,
            countryCoder: countryCoder,
            loadConverter: function() {
                return import(importableAssetUrl(context, 'traffic-sign-converter/id-field-browser.js'));
            },
            loadCountryCatalogue: function(countryPrefix: string) {
                return import(importableAssetUrl(context, 'traffic-sign-converter/data/' + countryPrefix + '.js'));
            },
            getSvgAssetUrl: function(countryPrefix: string, svgName: string) {
                return context.asset('traffic-sign-converter/data-svgs/' + countryPrefix + '/svgs/' + svgName + '.svg');
            }
        }).on('change', function(tags: TagsUpdate) {
            dispatch.call('change', trafficSign, tags);
        });
    }


    function trafficSign(selection: d3.Selection) {
        ensureTrafficSignFieldLoaded(context)
            .then(function(results) {
                const fieldModule = results[1];

                if (!_impl) {
                    _impl = createImpl(fieldModule);
                    if (_entityIDs.length) {
                        _impl.entityIDs(_entityIDs);
                    }
                    if (_pendingTags) {
                        _impl.tags(_pendingTags);
                        _pendingTags = null;
                    }
                }

                selection.call(_impl);
                _selection = selection;
                drawSuggestions();
                drawNoneButton();
                return loadSignRecommender(context);
            })
            .then(function(recommend) {
                if (_recommend) return;
                _recommend = recommend;
                drawSuggestions();
            })
            .catch(function(err: unknown) {
                console.error('traffic sign field:', err);  // eslint-disable-line no-console
            });
    }


    trafficSign.tags = function(tags: TagsMulti) {
        _tags = tags;
        const value = tags[fieldKey];
        trackSign(typeof value === 'string' ? value : undefined);
        drawSuggestions();
        drawNoneButton();
        if (_impl) {
            _impl.tags(tags);
        } else {
            _pendingTags = tags;
        }
        return trafficSign;
    };


    trafficSign.entityIDs = function(val?: string[]) {
        if (val === undefined) return _entityIDs;
        if (val.join() !== _entityIDs.join()) {
            _seenSign = false;
            _previousSign = null;
        }
        _entityIDs = val;
        if (_impl) _impl.entityIDs(_entityIDs);
        return trafficSign;
    };


    trafficSign.focus = function() {
        if (_impl) _impl.focus();
        return trafficSign;
    };


    return utilRebind(trafficSign, dispatch, 'on');
}
