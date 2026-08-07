import { createRequestAuthorizer } from './auth/authorize.ts';
import { initializeCodexState } from './codex/state.ts';
import { readServerConfig } from './config.ts';
import { createAiBridgeServer } from './http/server.ts';

await initializeCodexState();

const config = readServerConfig();
const authorize = createRequestAuthorizer(config);
const server = createAiBridgeServer(config, authorize);

server.listen(config.port, config.host, () => {
  console.log(
    `Personal AI bridge listening at http://${config.host}:${config.port}`,
  );
});

function shutdown() {
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
