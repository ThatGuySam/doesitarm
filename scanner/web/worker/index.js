import { createScanner } from '../../pkg/worker/scan_wasm_factory.js';
import module from '../../pkg/worker/scan_wasm_bg.wasm';
import { createHandler } from './handler.js';

export default { fetch: createHandler({ createScan: () => createScanner(module), outbound: (...args) => fetch(...args) }) };
