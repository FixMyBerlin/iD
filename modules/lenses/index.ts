import type { BundledLens } from '../core/lenses';
import { RADNETZ_QA_LENS } from './radnetz_qa';

/** Lenses that are part of this editor, listed after the default lens */
export const BUNDLED_LENSES: BundledLens[] = [RADNETZ_QA_LENS];
