import { t } from '../../core/localizer';

/**
 * Renders the empty state when no favorites exist
 */
export function renderEmptyState(selection: d3.Selection) {
    const emptyState = selection.selectAll('.favorite-presets-empty')
        .data([0]);

    emptyState.exit().remove();

    const emptyStateEnter = emptyState.enter()
        .append('div')
        .attr('class', 'favorite-presets-empty');

    emptyStateEnter
        .append('p')
        .call(t.append('preferences.favorite_presets.empty_message'));
}
