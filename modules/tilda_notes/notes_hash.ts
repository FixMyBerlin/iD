/**
 * The `notes` hash parameter lists the note layers that are on: `notes=osm,tilda`.
 * Upstream's `notes=true` stands for the OSM notes.
 */
function notesHashLayers(value: string | undefined) {
    const layers = new Set((value ?? '').split(',').map(part => part.trim()).filter(Boolean));
    if (layers.delete('true')) layers.add('osm');
    return layers;
}

export function notesHashHas(value: string | undefined, layer: 'osm' | 'tilda') {
    return notesHashLayers(value).has(layer);
}

/** The new value of the `notes` parameter with this layer on or off; `null` when no layer is on */
export function notesHashWith(value: string | undefined, layer: 'osm' | 'tilda', enabled: boolean) {
    const layers = notesHashLayers(value);
    if (enabled) {
        layers.add(layer);
    } else {
        layers.delete(layer);
    }
    return ['osm', 'tilda'].filter(name => layers.has(name)).join(',') || null;
}
