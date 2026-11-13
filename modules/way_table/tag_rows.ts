import type { WayChain } from './chain';

/**
 * How a cell compares to the center way:
 * - `same`: same value as the center way
 * - `changed`: different value
 * - `added`: only this way has the tag
 * - `removed`: only the center way has the tag
 * - `empty`: neither has the tag
 */
export type CellStatus = 'same' | 'changed' | 'added' | 'removed' | 'empty';

export type TagCell = {
    wayID: string;
    value: string | undefined;
    status: CellStatus;
};

export type TagRow = {
    key: string;
    /** the key is used by a field of the center way's preset */
    isPresetKey: boolean;
    /** at least one way has a different value than the center way */
    differs: boolean;
    cells: TagCell[];
};


function cellStatus(centerValue: string | undefined, value: string | undefined): CellStatus {
    if (centerValue === undefined && value === undefined) return 'empty';
    if (centerValue === undefined) return 'added';
    if (value === undefined) return 'removed';
    return centerValue === value ? 'same' : 'changed';
}


/**
 * One row per tag key used on any way of the chain.
 * Preset keys come first, then the other keys, each group sorted by key.
 * `extraKeys` get a row too.
 */
export function buildTagRows(chain: WayChain, presetKeys: Set<string>, extraKeys: Iterable<string> = []): TagRow[] {
    const center = chain.segments[chain.centerIndex];
    // `extraKeys`: keys no way has anymore, e.g. tags removed in this session
    const keys = new Set([...chain.segments.flatMap(segment => Object.keys(segment.tags)), ...extraKeys]);

    return [...keys]
        .sort((a, b) => Number(presetKeys.has(b)) - Number(presetKeys.has(a)) || a.localeCompare(b))
        .map(key => {
            const centerValue = center.tags[key];
            const cells = chain.segments.map((segment, index) => ({
                wayID: segment.wayID,
                value: segment.tags[key],
                status: index === chain.centerIndex
                    ? (centerValue === undefined ? 'empty' : 'same') as CellStatus
                    : cellStatus(centerValue, segment.tags[key])
            }));

            return {
                key,
                isPresetKey: presetKeys.has(key),
                differs: cells.some(cell => cell.status !== 'same' && cell.status !== 'empty'),
                cells
            };
        });
}
