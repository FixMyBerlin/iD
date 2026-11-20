import { TILDA_LABELS, categoryLabel } from '@tilda-geo/bicycle-infrastructure-tagging';
import { localizer, t } from '../core/localizer';

/**
 * The texts of `@tilda-geo/bicycle-infrastructure-tagging` in iD's language. The package has
 * German and English; every other language gets English.
 */
export function packageLanguage(): 'de' | 'en' {
    return localizer.languageCode().startsWith('de') ? 'de' : 'en';
}


/**
 * The name of a TILDA category as TILDA shows it. The package has German labels only (tilda-geo
 * has no others); English comes from `data/core.yaml` (`inspector.tilda.category.<id>`).
 */
export function categoryName(category: string | undefined) {
    if (!category) return t('inspector.tilda.no_category');
    const german = packageLanguage() === 'de' ? categoryLabel(category, TILDA_LABELS.de) : undefined;
    return german ?? t(`inspector.tilda.category.${category}`, { default: category });
}
