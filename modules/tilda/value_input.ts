/**
 * The free value input of the TILDA box: OSM numbers take a decimal point, so a typed `2,5` in a
 * width key becomes `2.5`. Only an input helper of this editor; parsing widths is `parseWidth` of
 * `@tilda-geo/bicycle-infrastructure`.
 */

/** A width value (not its `source:` or `note:`): `width`, `cycleway:right:width`, `width:effective`, … */
export function isWidthValueKey(key: string) {
    return !/^(source|note|check_date):/.test(key) && /(^|:)width(:|$)/.test(key);
}


/** OSM numbers take a decimal point: a typed `2,5` becomes `2.5` */
export function normalizeDecimalComma(value: string) {
    return value.replace(/(\d),(\d)/g, '$1.$2');
}
