import type { BundledLens } from '../core/lenses';
import { tildaQaClasses } from '../tilda/qa_state';

/**
 * "Radnetz QA" lens: colors ways by how complete their tags are for the Radnetz dataset
 * (the TILDA checklist, see `modules/tilda/qa_state.ts`).
 * Bike infrastructure is drawn wide, roads without bike infrastructure thin; everything else fades.
 */
const CSS = `
/* fade everything that the QA does not cover */
path.line.stroke,
path.line.casing,
path.area.stroke,
path.area.fill {
    opacity: 0.3;
}

path.line.stroke.tilda-qa,
path.line.casing.tilda-qa {
    opacity: 1;
    stroke-dasharray: none;
}
path.line.casing.tilda-qa {
    stroke: #222;
}

path.line.stroke.tilda-qa-complete { stroke: #2fb344; }
path.line.stroke.tilda-qa-incomplete { stroke: #ff9500; }
path.line.stroke.tilda-qa-unclear { stroke: #ff2d55; }

/* bike infrastructure wide, roads (mixed traffic) thin */
path.line.stroke.tilda-qa-bike { stroke-width: 7; }
path.line.casing.tilda-qa-bike { stroke-width: 10; }
path.line.stroke.tilda-qa-road { stroke-width: 3; }
path.line.casing.tilda-qa-road { stroke-width: 5; opacity: 0.6; }

.low-zoom path.line.stroke.tilda-qa-bike { stroke-width: 4; }
.low-zoom path.line.casing.tilda-qa-bike { stroke-width: 6; }
.low-zoom path.line.stroke.tilda-qa-road { stroke-width: 2; }
.low-zoom path.line.casing.tilda-qa-road { stroke-width: 3; }
`;

export const RADNETZ_QA_LENS: BundledLens = {
    id: 'radnetz-qa',
    nameID: 'map_data.lens.bundled.radnetz_qa.name',
    tooltipID: 'map_data.lens.bundled.radnetz_qa.tooltip',
    shortcut: 'q',
    css: CSS,
    classes: tildaQaClasses
};
