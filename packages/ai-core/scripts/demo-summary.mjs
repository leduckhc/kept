import { sampleThreads } from '../../mail-core/src/index.js';
import { createAISettings, createProviderAdapter } from '../src/index.js';

const settings = createAISettings({ enabled: true, provider: 'ollama', model: 'local-mock' });
const adapter = createProviderAdapter(settings);
const pending = await adapter.summarizeThread(sampleThreads[0]);
const approved = await adapter.summarizeThread(sampleThreads[0], { approved: true });
console.log(JSON.stringify({ pending, approved }, null, 2));
