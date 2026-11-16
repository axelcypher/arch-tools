import { buildSampleTemplate } from './excel';
import { fileURLToPath } from 'node:url';
import { schemaMarkdown } from '@core/excel/referenz';
import { dokuTest, schemaTests } from '@core/excel/schemaTest';
import { NUMIO_SCHEMA } from './platzhalterSchema';
import { platzhalterKontext } from './platzhalterTestdaten';

schemaTests(NUMIO_SCHEMA, platzhalterKontext, buildSampleTemplate);
dokuTest(fileURLToPath(new URL('../../../../docs/excel-vorlagen.md', import.meta.url)), 'numio', () => schemaMarkdown(NUMIO_SCHEMA));
