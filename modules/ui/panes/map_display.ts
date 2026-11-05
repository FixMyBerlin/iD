import { t } from '../../core/localizer';
import { uiPane } from '../pane';

import { uiSectionLenses } from '../sections/lenses';
import { uiSectionMapFeatures } from '../sections/map_features';
import { uiSectionMapStyleOptions } from '../sections/map_style_options';

/**
 * How the OSM map is drawn: area fill, lens and which feature types are shown.
 * Split off the Map Data pane, which keeps "which data is loaded".
 */
export function uiPaneMapDisplay(context: iD.Context) {
    return (uiPane('map-display', context) as any)
        .key('⇧' + t('map_display.key'))
        .label(t.append('map_display.title'))
        .description(t.append('map_display.description'))
        .iconName('fas-palette')
        .sections([
            uiSectionMapStyleOptions(context),
            uiSectionLenses(context),
            uiSectionMapFeatures(context)
        ]);
}
