// Starts the local server. Everything runs on your computer.
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { resolvers, typeDefs } from './api/schema.ts';
import { config, hasApiKey } from './config.ts';
import { pollBatches, resumeJobs } from './importer/job.ts';
import { addSampleExplainers, seedSample } from './seed/sample.ts';

if (seedSample()) console.log('Added the built-in sample library.');
addSampleExplainers();

const server = new ApolloServer({ typeDefs, resolvers });
const { url } = await startStandaloneServer(server, { listen: { port: config.port, host: '127.0.0.1' } });

console.log(`Server ready at ${url}`);
console.log(hasApiKey() ? 'Claude API key found. Imports and AI grading are on.' : 'No Claude API key set. The sample library works. Add ANTHROPIC_API_KEY to .env to import your own docs.');

resumeJobs();
// While the app is open, check on batches that are still with Claude.
setInterval(() => { pollBatches().catch((err) => console.error(err)); }, config.batchPollSeconds * 1000);
pollBatches().catch((err) => console.error(err));
