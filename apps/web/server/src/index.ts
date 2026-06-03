// Entry for the editor sandbox tRPC server (Fastify + WebSocket on :8080).
// Pulls in the full router graph, including the authed sandbox file/command
// proxy in ./sandbox (which spawns + health-checks each project's dev server).
import { editorServerConfig } from '@weblab/rpc';

import { createServer } from './server';

const server = createServer(editorServerConfig);

server.start();
