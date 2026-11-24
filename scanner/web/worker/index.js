import { initSync, scan } from '../../pkg/scan_wasm.js';
import module from '../../pkg/scan_wasm_bg.wasm';
import { createHandler } from './handler.js';

initSync({ module });
export default { fetch: createHandler({ scan, outbound: (...args) => fetch(...args) }) };
