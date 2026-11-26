import { createResolver } from '../../pkg/worker/scan_wasm_factory.js';
import module from '../../pkg/worker/scan_wasm_bg.wasm';
import { createHandler } from './handler.js';

export default {
  fetch: createHandler({
    createRuntime: () => createResolver(module),
    outbound: (...args) => fetch(...args),
    logUnresolved: (record) => console.log(JSON.stringify(record)),
  }),
};
