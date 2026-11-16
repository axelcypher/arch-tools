import { buildSampleTemplate } from '../platform/excel';
import { fileURLToPath } from 'node:url';
import { schemaMarkdown } from '@core/excel/referenz';
import { dokuTest, schemaTests } from '@core/excel/schemaTest';
import { QUADRIO_SCHEMA } from './platzhalterSchema';
import { platzhalterKontext } from './platzhalterTestdaten';

schemaTests(QUADRIO_SCHEMA, platzhalterKontext, buildSampleTemplate);
dokuTest(fileURLToPath(new URL('../../../../docs/excel-vorlagen.md', import.meta.url)), 'quadrio', () => schemaMarkdown(QUADRIO_SCHEMA));
