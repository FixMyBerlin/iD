/**
 * `traffic_sign=none` and then a sign added in the field: the field writes `none;DE:…`.
 * "No sign" and a sign contradict each other, so `none` goes once there is a sign.
 */
export function dropNoneSign(value: string): string {
    const parts = value.split(';');
    const signs = parts.filter(part => part.trim() !== 'none');
    return signs.length && signs.length < parts.length ? signs.join(';') : value;
}

/** The tag update of the traffic sign field, without `none` next to a sign */
export function dropNoneSigns<T extends Record<string, unknown>>(tags: T): T {
    const result: Record<string, unknown> = { ...tags };
    for (const [key, value] of Object.entries(result)) {
        if (/^traffic_sign(:|$)/.test(key) && typeof value === 'string') result[key] = dropNoneSign(value);
    }
    return result as T;
}
