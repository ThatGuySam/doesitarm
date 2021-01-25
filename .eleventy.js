import fs from 'fs'
import replace_css_url from 'replace-css-url'
import dotenv from 'dotenv'
import { InlineCodeManager } from '@11ty/eleventy-assets'

import nuxtConfig from './nuxt.config'

// Setup dotenv
dotenv.config()


function getAssetFilePath(componentName) {
	return `./${componentName}`
}

module.exports = function ( eleventyConfig ) {
    // console.log('eleventyConfig', eleventyConfig)

    // Global Nuxt data
    eleventyConfig.addJavaScriptFunction('getNuxt', function () {
        return nuxtConfig
    })
    // eleventyConfig.addGlobalData('nuxt', () => nuxtConfig)

    const cssManager = new InlineCodeManager()
    const jsManager = new InlineCodeManager()

    eleventyConfig.addJavaScriptFunction('usingComponent', function ( componentName ) {
        // console.log('Getting component', componentName)

        if ( componentName.includes('.js') ) {
            // If a never before seen component, add the JS code
            if(!jsManager.hasComponentCode(componentName)) {
                const fileContents = fs.readFileSync(getAssetFilePath(componentName), { encoding: "UTF-8" })

                // console.log('Got component', componentName, componentCss)

                jsManager.addComponentCode(componentName, fileContents)
            }

            // Log usage for this url
            // this.page.url is supported on Eleventy 0.11.0 and newer
            jsManager.addComponentForUrl(componentName, this.page.url)
        } else if ( componentName.includes('.css') ) {
            // If a never before seen component, add the CSS code
            if(!cssManager.hasComponentCode(componentName)) {
                const fileContents = fs.readFileSync(getAssetFilePath(componentName), { encoding: "UTF-8" })

                // Replace urls in css with relative urls for dist folder
                const parsedCss = replace_css_url(
                    fileContents,
                    function( path ) {
                        const fileName = path.split('/').pop().split('#')[0].split('?')[0]

                        return '/fonts/' + fileName
                    }
                )

                cssManager.addComponentCode(componentName, parsedCss)
            }

            // Log usage for this url
            // this.page.url is supported on Eleventy 0.11.0 and newer
            cssManager.addComponentForUrl(componentName, this.page.url)
        }

        return
    })


    // Copy Inter font files
    eleventyConfig.addPassthroughCopy({
        "node_modules/@fontsource/inter/**/*.woff2": "fonts"
    })

    // This needs to be called in a Layout template.
	eleventyConfig.addJavaScriptFunction('getJs', function ( url = this.page.url ) {
        // console.log( 'jsManager.getCodeForUrl(url)', url )

		return jsManager.getCodeForUrl(url)
    })

    // This needs to be called in a Layout template.
	eleventyConfig.addJavaScriptFunction('getCss', function ( url = this.page.url ) {
        // console.log( 'jsManager.getCodeForUrl(url)', url )

		return cssManager.getCodeForUrl(url)
    })

    eleventyConfig.addJavaScriptFunction('boundComponent', function ( Component ) {
		return Component.bind(this)
	})



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
