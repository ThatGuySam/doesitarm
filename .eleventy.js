// const eleventyVue = require("@11ty/eleventy-plugin-vue");
import nuxtConfig from './nuxt.config'

module.exports = function ( eleventyConfig ) {
    // eleventyConfig.addPlugin(eleventyVue)

    // console.log('eleventyConfig', eleventyConfig)

    eleventyConfig.addJavaScriptFunction('getNuxt', function () {
        return nuxtConfig
    })
    // eleventyConfig.addGlobalData('nuxt', () => nuxtConfig)



    return {
        dir: {
            input: 'pages-eleventy',
            output: 'dist',
            jsDataFileSuffix: '.json',

            // Relative to input directory.
            data: '../static',
            layouts: '../layouts-eleventy'
        }
    }
}
