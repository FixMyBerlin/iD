import { t } from '../../core/localizer';
import { uiPane } from '../pane';

import { uiSectionDataLayers } from '../sections/data_layers';
import { uiSectionCustomDataLayers } from '../sections/custom_data_layers';
import { uiSectionLiveTouched } from '../sections/live_touched';
import { uiSectionOverlayList } from '../sections/overlay_list';

export function uiPaneMapData(context) {

    var mapDataPane = uiPane('map-data', context)
        .key(t('map_data.key'))
        .label(t.append('map_data.title'))
        .description(t.append('map_data.description'))
        .iconName('iD-icon-data')
        .sections([
            uiSectionDataLayers(context),
            uiSectionCustomDataLayers(context),
            // overlays are extra data on top of the map, like the custom data layers;
            // the background's display options and offset do not apply to them
            uiSectionOverlayList(context),
            uiSectionLiveTouched(context)
        ]);

    return mapDataPane;
}
