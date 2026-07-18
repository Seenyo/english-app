import { createRequestAuthorizer } from './auth/authorize.ts';
import { readServerConfig } from './config.ts';
import { createAiBridgeServer } from './http/server.ts';

const config = readServerConfig();
const authorize = createRequestAuthorizer(config);
const server = createAiBridgeServer(config, authorize);

server.listen(config.port, '127.0.0.1', () => {
  console.log(
    `Personal AI bridge listening at http://127.0.0.1:${config.port}`,
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
