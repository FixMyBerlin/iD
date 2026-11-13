import { dispatch as d3_dispatch } from 'd3-dispatch';

/**
 * The image key that "set photo from viewer" writes to (WORKDOC feature 20): the row last focused
 * or clicked in the Mapillary images field, or chosen in the button's dropdown. Shared by the
 * field (row outline) and the viewer button. Kept for one selection only.
 */

const dispatch = d3_dispatch('change');

let _selectionKey: string | undefined;
let _targetKey: string | undefined;


/** @param selectionKey the selected entity ids joined with `,` */
export function getActiveTarget(selectionKey: string): string | undefined {
    return selectionKey === _selectionKey ? _targetKey : undefined;
}


export function setActiveTarget(selectionKey: string, key: string | undefined) {
    if (selectionKey === _selectionKey && key === _targetKey) return;
    _selectionKey = selectionKey;
    _targetKey = key;
    dispatch.call('change');
}


/** Forget the target, e.g. when another entity gets selected */
export function clearActiveTarget() {
    if (_targetKey === undefined && _selectionKey === undefined) return;
    _selectionKey = undefined;
    _targetKey = undefined;
    dispatch.call('change');
}


/** `on('change.namespace', callback)` */
export const activeTargetEvents = { on: dispatch.on.bind(dispatch) as (typeName: string, callback?: () => void) => void };
