import { presetFavorites } from '../../core/preset_favorites';
import { t } from '../../core/localizer';
import { uiSection } from '../section';
import { renderEmptyState } from './favorite_presets_empty';
import { renderFavoritesList } from './favorite_presets_list';
import { renderExplanation } from './favorite_presets_explanation';

export function uiSectionFavoritePresets(context: iD.Context) {
    const section = (uiSection('preferences-favorite-presets', context) as any)
        .label(() => t.append('preferences.favorite_presets.title'))
        .expandedByDefault(true)
        .disclosureContent(renderDisclosureContent);

    function renderDisclosureContent(selection: d3.Selection) {
        const favorites = presetFavorites.getFavoritesInOrder();

        if (favorites.length === 0) {
            selection.selectAll('.favorite-presets-list').remove();
            renderEmptyState(selection);
            renderExplanation(selection, false);
            return;
        }

        selection.selectAll('.favorite-presets-empty').remove();

        const listContainer = selection.selectAll<HTMLOListElement, number>('.favorite-presets-list')
            .data([0]);

        const listContainerEnter = listContainer.enter()
            .append('ol')
            .attr('class', 'favorite-presets-list');

        renderFavoritesList(
            listContainerEnter.merge(listContainer),
            favorites,
            presetId => presetFavorites.removeFavorite(presetId)
        );

        renderExplanation(selection, true);
    }

    presetFavorites.on('change.preferences', section.reRender);

    return section;
}
