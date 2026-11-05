import { t } from '../core/localizer';
import { presetFavorites } from '../core/preset_favorites';
import { svgIcon } from '../svg/icon';
import { uiTooltip } from './tooltip';

type Preset = { id: string };

/** Fallback presets can't be favorites */
const GENERIC_PRESETS = new Set(['point', 'line', 'area', 'vertex', 'relation']);

/**
 * Heart button in the inspector's preset header, which adds or
 * removes the current preset from the favorites.
 * A right-click opens the preferences pane with the favorites list.
 */
export function uiFavoriteButton(context: iD.Context) {
    let _presets: Preset[] = [];

    function currentPresetId() {
        if (_presets.length !== 1) return undefined;
        const presetId = _presets[0].id;
        return GENERIC_PRESETS.has(presetId) ? undefined : presetId;
    }

    function click(d3_event: MouseEvent) {
        d3_event.preventDefault();
        d3_event.stopPropagation();

        const presetId = currentPresetId();
        if (!presetId) return;

        if (presetFavorites.getShortcut(presetId)) {
            presetFavorites.removeFavorite(presetId);
        } else {
            presetFavorites.addFavorite(presetId);
        }
    }

    function contextmenu(d3_event: MouseEvent) {
        d3_event.preventDefault();
        d3_event.stopPropagation();

        const preferencesPane = context.container().select('.map-pane.preferences-pane');
        if (!preferencesPane.empty()) {
            context.ui().togglePanes(preferencesPane);
        }
    }

    const tooltip = (uiTooltip() as any)
        .title(() => {
            const presetId = currentPresetId();
            return presetId && presetFavorites.getShortcut(presetId)
                ? t.append('preferences.favorite_presets.heart_tooltip_active')
                : t.append('preferences.favorite_presets.heart_tooltip_inactive');
        })
        .keys(() => {
            const presetId = currentPresetId();
            const shortcut = presetId && presetFavorites.getShortcut(presetId);
            return shortcut ? [shortcut] : [];
        })
        .placement('bottom');

    function favoriteButton(selection: d3.Selection) {
        const presetId = currentPresetId();

        let button = selection.selectAll<HTMLButtonElement, string>('.favorite-heart-button')
            .data(presetId ? [presetId] : []);

        button.exit()
            .remove();

        const buttonEnter = button.enter()
            .insert('button', ':first-child')
            .attr('class', 'favorite-heart-button')
            .on('click', click)
            .on('contextmenu', contextmenu)
            .call(tooltip);

        const iconEnter = buttonEnter
            .append('div')
            .attr('class', 'heart-icon-container')
            .call(svgIcon('#iD-icon-favorite', ''));

        iconEnter
            .append('kbd')
            .attr('class', 'shortcut shortcut-badge');

        button = button.merge(buttonEnter);

        const shortcut = presetId ? presetFavorites.getShortcut(presetId) : undefined;

        button
            .classed('active', !!shortcut);

        button.select('.shortcut-badge')
            .style('visibility', shortcut ? 'visible' : 'hidden')
            .text(shortcut ?? '');
    }

    favoriteButton.presets = function(val: Preset[]) {
        _presets = val;
        return favoriteButton;
    };

    return favoriteButton;
}
