// const eleventyVue = require("@11ty/eleventy-plugin-vue");


module.exports = function ( eleventyConfig ) {
    // eleventyConfig.addPlugin(eleventyVue)


    return {
        dir: {
            input: 'pages-eleventy',
            output: 'dist',
            jsDataFileSuffix: '.json',

            // Relative to input directory.
            data: '../static',
            layouts: '../layouts'
        }
    }
}
