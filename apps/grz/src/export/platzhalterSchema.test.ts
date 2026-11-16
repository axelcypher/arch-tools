import { buildSampleTemplate } from './excel';
import { fileURLToPath } from 'node:url';
import { schemaMarkdown } from '@core/excel/referenz';
import { dokuTest, schemaTests } from '@core/excel/schemaTest';
import { TERRIO_SCHEMA } from './platzhalterSchema';
import { platzhalterKontext } from './platzhalterTestdaten';

schemaTests(TERRIO_SCHEMA, platzhalterKontext, buildSampleTemplate);
dokuTest(fileURLToPath(new URL('../../../../docs/excel-vorlagen.md', import.meta.url)), 'terrio', () => schemaMarkdown(TERRIO_SCHEMA));
