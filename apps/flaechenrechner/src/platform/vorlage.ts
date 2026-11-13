import { vorlagenSpeicher } from '@core/excel/vorlage';

/** Excel-Vorlage von QUADRIO (Projektdatei-Art „vorlage“) */
export const vorlage = vorlagenSpeicher('vorlage', 'arch-flaechen-tool:excel-template');

export const mitVorlage = vorlage.mit;
