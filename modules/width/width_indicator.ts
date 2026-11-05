import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { utilRebind } from '../util/rebind';
import { widthTargetForKey } from './width_tags';

/** The width value to preview on the map while a width input is hovered or focused */
export type WidthIndicatorState = {
    entityIDs: string[];
    key: string;
    /** raw input value, may be empty or unparseable while typing */
    value: string;
};

type FieldDatum = { key?: string; entityIDs?: string[] };


/**
 * Holds the width that the map previews.
 *
 * Events:
 *   'change' - the previewed width changed or was cleared
 */
function createWidthIndicator() {
    const dispatch = d3_dispatch('change');
    let _state: WidthIndicatorState | null = null;

    const widthIndicator = {
        state: () => _state,

        set(state: WidthIndicatorState | null) {
            const same = state === _state || (
                !!state && !!_state &&
                state.key === _state.key &&
                state.value === _state.value &&
                state.entityIDs.join() === _state.entityIDs.join()
            );
            if (same) return widthIndicator;

            _state = state;
            dispatch.call('change');
            return widthIndicator;
        }
    };

    return utilRebind(widthIndicator, dispatch, 'on');
}

export const widthIndicator = createWidthIndicator();


/**
 * Width state for an element in the inspector: a preset field input (`.form-field`)
 * or a row of the raw tag editor (`li.tag-row`).
 */
function stateForElement(element: Element, context: iD.Context): WidthIndicatorState | null {
    const selectedIDs = context.selectedIDs().filter(id => id.startsWith('w'));
    if (!selectedIDs.length) return null;

    const tagRow = element.closest('li.tag-row');
    if (tagRow) {
        const key = tagRow.querySelector<HTMLInputElement>('input.key')?.value ?? '';
        const value = tagRow.querySelector<HTMLInputElement>('input.value')?.value ?? '';
        return widthTargetForKey(key) ? { entityIDs: selectedIDs, key, value } : null;
    }

    const formField = element.closest('.form-field');
    if (!formField) return null;

    const field = d3_select(formField).datum() as FieldDatum | undefined;
    if (!field?.key || !widthTargetForKey(field.key)) return null;

    const input = formField.querySelector<HTMLInputElement>('input');
    const value = input?.value ?? '';
    return { entityIDs: field.entityIDs ?? selectedIDs, key: field.key, value };
}


/**
 * Listens to hover, focus and typing in the inspector and updates `widthIndicator`.
 * Uses event delegation, so the field implementations stay unchanged.
 * Focus wins over hover: while a width input is focused, hovering other fields does not change the preview.
 */
export function installWidthIndicatorListeners(context: iD.Context) {
    let _focused: Element | null = null;

    const update = (element: Element | null) => {
        widthIndicator.set(element ? stateForElement(element, context) : null);
    };

    context.container()
        .on('focusin.widthIndicator', (d3_event: FocusEvent) => {
            const target = d3_event.target as Element;
            _focused = stateForElement(target, context) ? target : null;
            update(_focused);
        })
        .on('focusout.widthIndicator', () => {
            _focused = null;
            update(null);
        })
        .on('input.widthIndicator', (d3_event: Event) => {
            if (_focused) update(d3_event.target as Element);
        })
        .on('pointerover.widthIndicator', (d3_event: PointerEvent) => {
            if (_focused) return;
            update(d3_event.target as Element);
        })
        .on('pointerout.widthIndicator', (d3_event: PointerEvent) => {
            if (_focused) return;
            const next = d3_event.relatedTarget as Element | null;
            update(next);
        });

    context.on('enter.widthIndicator', () => {
        _focused = null;
        widthIndicator.set(null);
    });
}
