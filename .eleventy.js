/**
 *
 * Eleventy command line debugging codes
 *
 *
 * Eleventy:Config
 * Eleventy:UserConfig
 * Eleventy:TemplateConfig
 *
 * Eleventy:CommandCheck
 *
 * Eleventy:EleventyFiles
 * Eleventy:TemplateWriter
 * Eleventy:TemplatePassthroughManager
 * Eleventy:TemplatePassthrough
 * Eleventy:TemplateData
 * Eleventy:Template
 *
 * Eleventy:ComputedData
 *
 * Eleventy:Benchmark
 *
 * EleventyAssets
 */


import fs from 'fs'
import replace_css_url from 'replace-css-url'
import dotenv from 'dotenv'
import { InlineCodeManager } from '@11ty/eleventy-assets'
import { transformSync } from 'esbuild'


import nuxtConfig from './nuxt.config'

// Setup dotenv
dotenv.config()


function getAssetFilePath(componentName) {
	return `./${componentName}`
}

const inlineAssetCache = new Map()

module.exports = function ( eleventyConfig ) {
    // console.log('eleventyConfig', eleventyConfig)

    // Global Nuxt data
    eleventyConfig.addJavaScriptFunction('getNuxt', function () {
        return nuxtConfig
    })
    // eleventyConfig.addGlobalData('nuxt', () => nuxtConfig)

    const cssManager = new InlineCodeManager()
    const jsManager = new InlineCodeManager()

    eleventyConfig.addJavaScriptFunction('usingComponent', async function ( componentName ) {
        // console.log('Getting component', componentName)

        const assetFileName = getAssetFilePath( componentName )

        // console.log('Cache size', inlineAssetCache)

        if ( componentName.includes('.js') ) {

            // If a never before seen component, add the JS code
            if( !inlineAssetCache.has( assetFileName ) ) {

                let contents = ''

                // if ( inlineAssetCache.has( assetFileName ) ) {
                //     console.log('Reading component from cache', componentName)
                //     console.log('Cache size', inlineAssetCache.size)

                //     contents = inlineAssetCache.get( assetFileName )

                // } else {

                // }

                console.log('Reading component file', componentName)
                const javascriptCode = fs.readFileSync( assetFileName, { encoding: "UTF-8" })

                console.log('Minifying code', componentName)
                const minified = await transformSync(javascriptCode, {
                    // loader: 'ts',
                    // bundle: true,
                    minify: true,
                    // format: 'iife',
                })//minify( javascriptCode )

                // console.log('minified', minified)

                contents = minified.code

                inlineAssetCache.set( assetFileName, contents )

                // console.log('Got component', componentName, componentCss)

                jsManager.addComponentCode(componentName, contents)
            }

            // Log usage for this url
            // this.page.url is supported on Eleventy 0.11.0 and newer
            jsManager.addComponentForUrl(componentName, this.page.url)
        } else if ( componentName.includes('.css') ) {
            // If a never before seen component, add the CSS code
            if(!cssManager.hasComponentCode(componentName)) {
                const fileContents = fs.readFileSync( assetFileName, { encoding: "UTF-8" })

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
        // https://www.11ty.dev/docs/config/#template-formats
        // Default: html,liquid,ejs,md,hbs,mustache,haml,pug,njk,11ty.js
        templateFormats: [ '11ty.js' ],

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
