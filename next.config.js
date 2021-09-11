const path = require("path")
const CopyPlugin = require("copy-webpack-plugin")

module.exports = {
    // target: "serverless",
    // future: {
    //     webpack5: true,
    // },
    webpack: function (config, { dev, isServer }) {
        // Fixes npm packages that depend on `fs` module
        if (!isServer) {
            config.resolve.fallback.fs = false
        }
        // Copy files to serverless functions
        if (!dev) {
            config.plugins.push(
                new CopyPlugin({
                    patterns: [{
                        from: 'static',
                        to: 'static'
                    }],
                })
            )
        }

        return config
    },
}
