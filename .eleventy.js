import fs from 'fs'

import nuxtConfig from './nuxt.config'

import { InlineCodeManager } from '@11ty/eleventy-assets'


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

                // console.log('Got component', componentName, componentCss)

                cssManager.addComponentCode(componentName, fileContents)
            }

            // Log usage for this url
            // this.page.url is supported on Eleventy 0.11.0 and newer
            cssManager.addComponentForUrl(componentName, this.page.url)
        }

        return
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
