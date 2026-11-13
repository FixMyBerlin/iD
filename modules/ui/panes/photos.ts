import { t } from '../../core/localizer';
import { uiPane } from '../pane';

import { uiSectionPhotoOverlays } from '../sections/photo_overlays';

/**
 * Street-level photos with their filters and the traffic sign groups.
 * Split off the Map Data pane.
 */
export function uiPanePhotos(context: iD.Context) {
    return (uiPane('photos', context) as any)
        .key(t('photos_pane.key'))
        .label(t.append('photos_pane.title'))
        .description(t.append('photos_pane.description'))
        .iconName('fas-camera')
        .sections([
            uiSectionPhotoOverlays(context)
        ]);
}
