/**
 * Widths counted in paving stones, as Berlin mappers write them in the width source
 * ("6 Steine à 20 cm"; Berlin extract 2026-11, ~70 such sources). Pure helpers of the stone
 * calculator next to the measuring tape.
 */

/** The stone sizes in the Berlin data, most common first */
export const STONE_SIZES_CM = [20, 10, 16, 35, 50];

export type StoneCount = { count: number; cm: number };

const NUMBER = '(\\d+(?:[.,]\\d+)?)';
const PATTERNS: [RegExp, 'count-size' | 'size-count'][] = [
    // "6 Steine à 20 cm", "7,5 Verbundsteine a 20cm", "~16 Steine a ~16cm", "4 Pfastersteine a 20cm"
    [new RegExp(`~?${NUMBER}\\s*x?\\s*\\S*?steine?\\s*(?:à|a|zu|je)?\\s*~?${NUMBER}\\s*cm`, 'i'), 'count-size'],
    // "Pflastersteine 7x20cm", "Pflastersteine 6,5*20cm"
    [new RegExp(`steine?\\s*${NUMBER}\\s*[x*×]\\s*${NUMBER}\\s*cm`, 'i'), 'count-size'],
    // "3x 50cm Steine"
    [new RegExp(`${NUMBER}\\s*[x*×]\\s*${NUMBER}\\s*cm\\s*\\S*steine?`, 'i'), 'count-size']
];

const toNumber = (text: string) => Number(text.replace(',', '.'));

/** The stones of a width source, or undefined when it is no stone count */
export function parseStoneSource(source: string | undefined): StoneCount | undefined {
    if (!source) return undefined;
    for (const [pattern] of PATTERNS) {
        const match = pattern.exec(source);
        if (!match) continue;
        const count = toNumber(match[1]), cm = toNumber(match[2]);
        if (count > 0 && cm > 0) return { count, cm };
    }
    return undefined;
}

/** "7,5 Steine à 20 cm", as the Berlin mappers write it */
export function formatStoneSource({ count, cm }: StoneCount): string {
    const german = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
    return `${german(count)} Steine à ${german(cm)} cm`;
}

/** The width in meters as an OSM value: `1.5`, not `1.50` */
export function stoneWidth({ count, cm }: StoneCount): string {
    return String(Math.round(count * cm) / 100);
}
