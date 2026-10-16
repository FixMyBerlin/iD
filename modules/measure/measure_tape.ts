import { dispatch as d3_dispatch } from 'd3-dispatch';

import { actionChangeTags } from '../actions/change_tags';
import { t } from '../core/localizer';
import type { EntityId } from '../osm';
import { utilRebind } from '../util/rebind';
import { formatTapeValue, tapeLength, type TapeEnds } from './initial_tape';

/** The measuring tape on the map (feature 21). Ends are [lon, lat]. */
export type MeasureTapeState = {
    entityID: EntityId;
    /** the tag key the measured length is written to */
    key: string;
    ends: TapeEnds;
    /** true while an end or the whole tape is dragged */
    dragging: boolean;
};


/**
 * Where a length measured on the map comes from, like the Radinfra mappers write it: `Luftbild 2026`
 * (the year of the aerial imagery in the background, if its id or name has one).
 */
export function measuredSource(context: iD.Context) {
    const source = context.background().baseLayerSource() as { id?: string; name?: () => string } | undefined;
    const year = `${source?.id ?? ''} ${source?.name?.() ?? ''}`.match(/\b(19|20)\d{2}\b/)?.[0];
    return year ? `Luftbild ${year}` : 'Luftbild';
}


/**
 * Holds the tape that the map draws.
 *
 * Events:
 *   'change' - the tape started, moved, or ended
 */
function createMeasureTape() {
    const dispatch = d3_dispatch('change');
    let _state: MeasureTapeState | null = null;

    const measureTape = {
        state: () => _state,

        start(entityID: EntityId, key: string, ends: TapeEnds) {
            _state = { entityID, key, ends, dragging: false };
            dispatch.call('change');
            return measureTape;
        },

        stop() {
            if (!_state) return measureTape;
            _state = null;
            dispatch.call('change');
            return measureTape;
        },

        setEnds(ends: TapeEnds, dragging: boolean) {
            if (!_state) return measureTape;
            _state = { ..._state, ends, dragging };
            dispatch.call('change');
            return measureTape;
        },

        /** The measured length as a tag value: 0.05 m steps, no trailing zeros */
        value: () => _state ? formatTapeValue(tapeLength(_state.ends)) : undefined,

        /**
         * Writes the measured length to the tag, and where it comes from to `source:<key>`
         * (`source:cycleway:right:width`): one undo step. Nothing happens when the tag already has this value.
         */
        commit(context: iD.Context) {
            if (!_state) return measureTape;
            const entity = context.graph().hasEntity(_state.entityID);
            const value = measureTape.value();
            if (!entity || !value || entity.tags[_state.key] === value) return measureTape;

            const tags = { ...entity.tags, [_state.key]: value, [`source:${_state.key}`]: measuredSource(context) };
            context.perform(actionChangeTags(entity.id, tags), t('inspector.measure_tape.annotation'));
            return measureTape;
        },
    };

    return utilRebind(measureTape, dispatch, 'on');
}

export const measureTape = createMeasureTape();
