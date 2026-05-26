import { sampleThreads } from '../../mail-core/src/index.js';
import { buildSearchRows, createInMemorySearchIndex } from '../src/index.js';

const index = createInMemorySearchIndex();
index.seed(sampleThreads);
console.log(JSON.stringify({
  seeded: sampleThreads.map(buildSearchRows),
  demoQuery: 'invoice next week',
  results: index.search('invoice next week').map(({ id, subject, sender, score }) => ({ id, subject, sender, score })),
}, null, 2));
