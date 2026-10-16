import type { Field, Geometry } from '@openstreetmap/id-tagging-schema';
import { localizer, t, type ReplacementsSimple, type LocalizedTextRenderer } from '../core/localizer';
import { utilSafeClassName } from '../util/util';
import { LANGUAGE_SUFFIX_REGEX } from '../ui/fields';
import { isMapillaryKey } from '../mapillary/tag_keys';

export interface presetField extends Omit<Field, 'label' | 'terms' | 'placeholder'> {
  id: string;
  safeid: string;
  matchGeometry(geom: Geometry): boolean;
  matchAllGeometry(geometries: Geometry[]): boolean;
  t: {
    (scope: string, options: ReplacementsSimple): string;
    append: typeof t.append;
  };
  t_all: typeof localizer.t_all;
  hasTextForStringId(scope: string): boolean;
  title(): string;
  label(): LocalizedTextRenderer;
  placeholder(): string;
  originalTerms: string[];
  terms(): string[];
  allKeys(tags: Tags): TagKey[];
  overrideLabel?: string;
  locationSetID?: string;
}

//
// `presetField` decorates a given `field` Object
// with some extra methods for searching and matching geometry
//
export function presetField(fieldID: string, field: Field) {
  const _this = <presetField>(<unknown>Object.assign({}, field));   // shallow copy

  _this.id = fieldID;

  // for use in classes, element ids, css selectors
  _this.safeid = utilSafeClassName(fieldID);

  _this.matchGeometry = (geom) => !_this.geometry || _this.geometry.indexOf(geom) !== -1;

  _this.matchAllGeometry = (geometries) => {
    return !_this.geometry || geometries.every(geom => _this.geometry!.indexOf(geom) !== -1);
  };

  // Radnetz Berlin: fields from a preset customization have untranslated `strings` (option labels, side labels)
  // scopes are `<group>.<value>` or `<group>.<value>.title|description`; values may contain dots (`0.05`)
  const _ownString = (scope: string): string | undefined => {
    const [group, ...rest] = scope.split('.');
    const strings = (field as any).strings?.[group];
    if (!strings) return undefined;
    const name = rest.join('.');
    const detail = name.match(/^(.*)\.(title|description)$/);
    const value = strings[name] ?? (detail ? strings[detail[1]]?.[detail[2]] : undefined);
    return typeof value === 'string' ? value : undefined;
  };
  // our own string wins over a caller's fallback (e.g. the radio field's raw `"value"`)
  const _withDefault = (scope: string, options?: any) =>
    _ownString(scope) !== undefined ? { ...options, default: _ownString(scope) } : options;

  const _t: presetField['t'] = (scope, options) => t(`_tagging.presets.fields.${fieldID}.${scope}`, _withDefault(scope, options));
  _this.t_all = (scope, options) => localizer.t_all(`_tagging.presets.fields.${fieldID}.${scope}`, options);
  _t.append = (scope, options) => t.append(`_tagging.presets.fields.${fieldID}.${scope}`, _withDefault(scope, options));
  _this.t = _t;

  _this.hasTextForStringId = (scope) => localizer.hasTextForStringId(`_tagging.presets.fields.${fieldID}.${scope}`) || _ownString(scope) !== undefined;

  // Radnetz Berlin: fields from a preset customization have an untranslated `label`
  _this.title = () => _this.t('label', { 'default': field.label ?? fieldID });
  _this.label = () => _this.t.append('label', { 'default': field.label ?? fieldID });
  if ((field.type as string) === 'mapillaryImages') {
    // replaces the schema's `mapillary` field, whose translated label would win
    _this.title = () => t('inspector.mapillary_images.label');
    _this.label = () => t.append('inspector.mapillary_images.label');
  }

  _this.placeholder = () => _this.t('placeholder', { 'default': '' });

  _this.originalTerms = field.terms || [];

  _this.terms = () => _this.t_all('terms', { 'default': _this.originalTerms });

  _this.increment = (_this.type === 'number' || _this.type === 'integer') ? (_this.increment || 1) : undefined;

  /** all keys controlled by this field */
  _this.allKeys = (tags) => {
    const allKeys = new Set<TagKey>();
    if (_this.key) allKeys.add(_this.key);
    if (_this.keys) _this.keys.forEach(key => allKeys.add(key));
    if (field.type === 'directionalCombo' && _this.key) {
        // directionalCombo fields can have an additional key describing the for
        // cases where both directions share a "common" value.
        // The field also support *:both. The preset decides which field to write to.
        const baseKey = field.key!.replace(/:both$/, '');
        allKeys.add(baseKey);
        allKeys.add(`${baseKey}:both`);
    }
    if (field.type === 'localized' && field.key && tags) {
        const prefix = `${field.key}:`;
        Object.keys(tags)
            .filter(k => k.startsWith(prefix))
            .filter(k => LANGUAGE_SUFFIX_REGEX.test(k))
            .forEach(key => allKeys.add(key));
    }
    if (field.type === 'multiCombo' && field.key && tags) {
        const prefix = field.key + (field.key.endsWith(':') ? '' : ':');
        Object.keys(tags)
            .filter(k => k.startsWith(prefix))
            .forEach(key => allKeys.add(key));
    }
    if (field.type === ('mapillaryImages' as typeof field.type) && tags) {
        // the image keys of the feature vary (road sides, signs, directions)
        Object.keys(tags).filter(isMapillaryKey).forEach(key => allKeys.add(key));
    }
    return [...allKeys];
  };

  return _this;
}
