import { KvError } from '@osm-editor-kit/key-value-db-client';

import { t } from './localizer';

/**
 * Why a request to our key-value DB failed, in words a mapper can act on.
 * Used by every feature that writes there (checks, progress, live edits).
 */
export function kvErrorMessage(err: unknown): string {
    if (err instanceof KvError) {
        switch (err.code) {
            case 'origin_not_allowed':
            case 'invalid_project_key':
                return t('kv_errors.origin_not_allowed', { origin: window.location.origin });
            case 'unauthenticated':
            case 'forbidden_user':
                return t('kv_errors.login');
            case 'rate_limited':
                return t('kv_errors.rate_limited');
            case 'osm_unavailable':
                return t('kv_errors.osm_unavailable');
            default:
                return t('kv_errors.server', { status: err.status, code: err.code });
        }
    }
    // `fetch` throws a TypeError when the request does not get through: offline, or blocked by
    // the browser because the DB does not allow this address (CORS)
    return t('kv_errors.network', { origin: window.location.origin });
}
