import {
    CONSENT_VERSION,
    createLiveTouchedSession,
    LIVE_TOUCHED_BACKEND,
    type LiveState,
    type LiveTouchedOptions,
    type LiveTouchedSession,
    type LocalObject
} from '@osm-editor-kit/live-touched';

import { prefs } from '../core/preferences';

/**
 * Live touched: shows which objects other mappers are editing right now, and shares
 * the objects the local user has changed but not uploaded yet.
 * The session logic lives in `@osm-editor-kit/live-touched` (~/Development/OSM/osm-live-touched);
 * this module connects it to iD's history, map, uploader and OSM login.
 * See its `packages/live-touched/README.md` ("iD integration guide") and `docs/concept.md`.
 */

const ENABLED_PREF = 'live-touched-enabled';
const CONSENT_PREF = 'live-touched-consent';

const HIGHLIGHT_CLASSES = 'live-touched live-touched-touched live-touched-stale live-touched-saved live-touched-conflict';

type OsmService = { getAccessToken?: () => string | null; authenticated?: () => boolean };

export type LiveTouched = {
    session: LiveTouchedSession;
    state(): LiveState;
    /** The user agreed to the current consent version */
    hasConsent(): boolean;
    /** Turns the feature on. Call only after the consent dialog was accepted. */
    enable(): Promise<void>;
    disable(): Promise<void>;
    nukeMyData(): Promise<{ deleted: number }>;
};


export function hasLiveTouchedConsent() {
    return prefs(CONSENT_PREF) === String(CONSENT_VERSION);
}


/** The locally changed objects, as the session expects them (only existing objects, no new ones) */
function modifiedObjects(context: iD.Context): LocalObject[] {
    const graph = context.graph();
    const base = context.history().base();
    const objects: LocalObject[] = [];

    for (const { entity, changeType } of context.history().difference().summary()) {
        if (changeType === 'created') continue;     // new objects are not shared (v1)

        const osmID = Number(entity.id.slice(1));
        if (!(osmID > 0) || entity.version === undefined) continue;

        const extent = entity.extent(changeType === 'deleted' ? base : graph);
        if (!extent) continue;

        objects.push({
            type: entity.type as LocalObject['type'],
            id: osmID,
            baseVersion: Number(entity.version),
            bbox: [extent[0][0], extent[0][1], extent[1][0], extent[1][1]]
        });
    }
    return objects;
}


/** `overrides` replace session options, e.g. a fake backend client in tests */
export function setupLiveTouched(context: iD.Context, overrides: Partial<LiveTouchedOptions> = {}): LiveTouched {
    const session = createLiveTouchedSession({
        ...LIVE_TOUCHED_BACKEND,
        getOsmToken: () => (context.connection() as OsmService | undefined)?.getAccessToken?.() ?? null,
        editor: `iD ${context.version}`,
        getLocalVersion: (type, id) => {
            const entity = context.hasEntity(`${type[0]}${id}` as `w${number}`);
            return entity?.version === undefined ? undefined : Number(entity.version);
        },
        ...overrides
    });

    let _state = session.getState();


    function reportModified() {
        session.setModified(modifiedObjects(context));
    }

    function reportViewport() {
        const extent = context.map().extent();
        session.setViewport([extent[0][0], extent[0][1], extent[1][0], extent[1][1]]);
    }

    /** Classes on the map elements of objects that others edit, e.g. `.w789` → `.live-touched-touched` */
    function applyHighlight() {
        const surface = context.surface();
        if (!surface || surface.empty()) return;

        surface.selectAll('.live-touched')
            .classed(HIGHLIGHT_CLASSES, false);

        for (const item of _state.items) {
            surface.selectAll(`.${item.type[0]}${item.id}`)
                .classed('live-touched', true)
                .classed(`live-touched-${item.status}`, true)
                .classed('live-touched-conflict', item.hint === 'parallel' || item.hint === 'outdated');
        }
    }


    session.subscribe(state => {
        _state = state;
        applyHighlight();
    });

    context.history().on('change.liveTouched', reportModified);
    context.uploader().on('resultSuccess.liveTouched', (changeset: { id?: string | number } | undefined) => {
        session.markSaved(Number(changeset?.id) || undefined);
    });
    context.map()
        .on('move.liveTouched', reportViewport)
        .on('drawn.liveTouched', applyHighlight);


    const liveTouched: LiveTouched = {
        session,
        state: () => _state,
        hasConsent: hasLiveTouchedConsent,

        async enable() {
            prefs(CONSENT_PREF, String(CONSENT_VERSION));
            prefs(ENABLED_PREF, 'true');
            reportViewport();
            reportModified();
            await session.enable();
        },

        async disable() {
            prefs(ENABLED_PREF, null);
            await session.disable();
        },

        nukeMyData() {
            prefs(ENABLED_PREF, null);
            return session.nukeMyData();
        }
    };

    // turn back on after a reload, if the user agreed to the current consent version
    if (prefs(ENABLED_PREF) === 'true' && hasLiveTouchedConsent()) {
        liveTouched.enable().catch((err: unknown) => {
            console.error('live touched:', err);  // eslint-disable-line no-console
        });
    }

    return liveTouched;
}
