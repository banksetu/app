import { writeFileSync } from 'node:fs';
const commit = process.env.PORTFOLIO_COMMIT || process.env.GITHUB_SHA;
if (!commit) throw Error('Missing deploy commit');
writeFileSync('portfolio-dist/deployment.json',JSON.stringify({commit,builtAt:new Date().toISOString(),kind:'portfolio'},null,2)+'\n');
