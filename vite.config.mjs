// We keep a separate vite config file that vite-node, vitest, and Astro can reference
// so that our environment is as close as possible for all of them.

// yarn add --dev @esbuild-plugins/node-globals-polyfill
// import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill'
// yarn add --dev @esbuild-plugins/node-modules-polyfill
// import { NodeModulesPolyfillPlugin } from '@esbuild-plugins/node-modules-polyfill'
// You don't need to add this to deps, it's included by @esbuild-plugins/node-modules-polyfill
// import rollupNodePolyFill from 'rollup-plugin-node-polyfills'

import tsconfigPaths from 'vite-tsconfig-paths'
// import { viteCommonjs } from '@originjs/vite-plugin-commonjs'

import { makeViteDefinitions } from './helpers/public-runtime-config.mjs'


export default {
    // Vite: https://vitejs.dev/config/#define
    // esbuild: https://esbuild.github.io/api/#define
    define: {
        ...makeViteDefinitions()
    },
    plugins: [
        tsconfigPaths(),
        // viteCommonjs()
    ],
    resolve: {
        alias: {
            // This Rollup aliases are extracted from @esbuild-plugins/node-modules-polyfill,
            // see https://github.com/remorses/esbuild-plugins/blob/master/node-modules-polyfill/src/polyfills.ts
            // process and buffer are excluded because already managed
            // by node-globals-polyfill
            // util: 'rollup-plugin-node-polyfills/polyfills/util',
            // sys: 'util',
            // events: 'rollup-plugin-node-polyfills/polyfills/events',
            // stream: 'rollup-plugin-node-polyfills/polyfills/stream',
            // path: 'rollup-plugin-node-polyfills/polyfills/path',
            // querystring: 'rollup-plugin-node-polyfills/polyfills/qs',
            // punycode: 'rollup-plugin-node-polyfills/polyfills/punycode',
            // url: 'rollup-plugin-node-polyfills/polyfills/url',
            // string_decoder:
            //     'rollup-plugin-node-polyfills/polyfills/string-decoder',
            // http: 'rollup-plugin-node-polyfills/polyfills/http',
            // https: 'rollup-plugin-node-polyfills/polyfills/http',
            // os: 'rollup-plugin-node-polyfills/polyfills/os',
            // assert: 'rollup-plugin-node-polyfills/polyfills/assert',
            // constants: 'rollup-plugin-node-polyfills/polyfills/constants',
            // _stream_duplex:
            //     'rollup-plugin-node-polyfills/polyfills/readable-stream/duplex',
            // _stream_passthrough:
            //     'rollup-plugin-node-polyfills/polyfills/readable-stream/passthrough',
            // _stream_readable:
            //     'rollup-plugin-node-polyfills/polyfills/readable-stream/readable',
            // _stream_writable:
            //     'rollup-plugin-node-polyfills/polyfills/readable-stream/writable',
            // _stream_transform:
            //     'rollup-plugin-node-polyfills/polyfills/readable-stream/transform',
            // timers: 'rollup-plugin-node-polyfills/polyfills/timers',
            // console: 'rollup-plugin-node-polyfills/polyfills/console',
            // vm: 'rollup-plugin-node-polyfills/polyfills/vm',
            // zlib: 'rollup-plugin-node-polyfills/polyfills/zlib',
            // tty: 'rollup-plugin-node-polyfills/polyfills/tty',
            // domain: 'rollup-plugin-node-polyfills/polyfills/domain'
        }
    },
    optimizeDeps: {
        esbuildOptions: {
            // Node.js global to browser globalThis
            // define: {
            //     global: 'globalThis',
            // },
            // Enable esbuild polyfill plugins
            plugins: [
                // NodeGlobalsPolyfillPlugin({
                //     // process: true,
                //     buffer: true
                // }),
                // NodeModulesPolyfillPlugin()
            ]
        }
    },
    build: {
        commonjsOptions: {
            transformMixedEsModules: true
        },
        rollupOptions: {
            plugins: [
                // Enable rollup polyfills plugin
                // used during production bundling
                // rollupNodePolyFill()
            ]
        }
    }
}
