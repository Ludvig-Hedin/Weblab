import { editorServerConfig } from '@weblab/rpc';

import { createServer } from './server';

const server = createServer(editorServerConfig);

server.start();
