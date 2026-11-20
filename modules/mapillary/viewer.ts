import { services } from '../services';
import type { coreContext } from '../core';

/**
 * Turns on the Mapillary layer and shows an image in the viewer, like a click on a marker does
 * (`svg/mapillary_images.ts`). The viewer centers the map on the image.
 */
export function showMapillaryImage(context: coreContext, id: string) {
    const service = services.mapillary;
    if (!service || !id) return Promise.resolve();

    const layer = context.layers().layer('mapillary');
    if (layer && !layer.enabled()) layer.enabled(true);

    return service.ensureViewerLoaded(context).then(() => {
        service.selectImage({ id } as Parameters<typeof service.selectImage>[0]).showViewer(context);
    });
}


/** Id of the image the viewer currently shows */
export function shownMapillaryImageId(): string | undefined {
    const image = services.mapillary?.getActiveImage?.();
    return image?.id;
}
