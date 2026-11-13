import { prefs } from '../core/preferences';
import { preferredImageId } from './tag_keys';
import { selectedSign } from './sign_select';
import { showMapillaryImage } from './viewer';
import { services } from '../services';
import type { coreContext } from '../core';
import type { EntityId } from '../osm';

/**
 * "Show the way's Mapillary image when selecting it" (WORKDOC feature 19): when a single feature
 * with image keys is selected, the Mapillary layer turns on and the viewer shows its preferred image.
 */

export const AUTO_SHOW_PREF = 'mapillary-auto-show-selected';


/** On unless explicitly switched off */
export function isAutoShowValue(value: string | null | undefined): boolean {
    return value !== 'false';
}

export function autoShowEnabled(): boolean {
    return isAutoShowValue(prefs(AUTO_SHOW_PREF));
}

export function setAutoShowEnabled(enabled: boolean) {
    prefs(AUTO_SHOW_PREF, enabled ? 'true' : 'false');
}


/** Call once per context, after the UI is set up */
export function initMapillaryAutoShow(context: coreContext) {
    context.on('enter.mapillaryAutoShow', function() {
        const mode = context.mode() as unknown as { id: string; selectedIDs?: () => EntityId[] } | null;
        if (!mode || mode.id !== 'select' || !autoShowEnabled()) return;
        // a selected traffic sign keeps its image (feature 26)
        if (selectedSign()) return;
        const ids = mode.selectedIDs?.() ?? [];
        if (ids.length !== 1) return;

        const entity = context.hasEntity(ids[0]);
        const imageId = entity && preferredImageId(entity.tags);
        if (!imageId) return;

        // already showing this image
        if (services.mapillary?.getActiveImage()?.id === imageId) return;

        showMapillaryImage(context, imageId);
    });
}
