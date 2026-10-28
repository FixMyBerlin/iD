import { select as d3_select } from 'd3-selection';

import { uiTooltip } from './tooltip';

/**
 * Tooltip for rows and row buttons in a side pane (Map Data, Background).
 * Placed above the element and shifted to stay inside the pane: the panes clip
 * overflow, so tooltips placed to the left or centered on the right edge get cut off.
 * Attach it to the row's `label` and to each button, never to the `li`, so only
 * one tooltip shows at a time.
 */
export function uiPaneTooltip() {
    return (uiTooltip() as any)
        .placement('top')
        .scrollContainer(function(this: Element) {
            return d3_select(this.closest('.pane-content'));
        });
}
