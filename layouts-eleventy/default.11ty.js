import config from '../nuxt.config'

const year = new Date().getFullYear()

const makeTag = ( tag, tagName = 'meta') => {

    const attributes = Object.entries(tag).map( ([ name, value ]) => `${name}="${value}"` ).join(' ')

    return `<${tagName} ${attributes}>`
}

const mapMetaTag = ( tag ) => {

    if ( tag.hasOwnProperty('property') ) {
        return [
            `property-${tag.property}`,
            makeTag(tag)
        ]
    }

    if ( tag.hasOwnProperty('name') ) {
        return [
            `name-${tag.name}`,
            makeTag(tag)
        ]
    }

    if ( tag.hasOwnProperty('charset') ) {
        return [
            'charset',
            makeTag(tag)
        ]
    }
}

const mapLinkTag = ( tag ) => {
    return [
        `type-${tag.type}`,
        makeTag(tag, 'link')
    ]
}

const defaultMeta = Object.fromEntries(config.head.meta.map( mapMetaTag ))

const defaultLinkTags = Object.fromEntries(config.head.link.map( mapLinkTag ))

class DefaultLayout {

    generateMetaTags = ( pageMeta = [] ) => {

        const meta = {
            ...defaultMeta,
            ...Object.fromEntries(pageMeta.map(mapMetaTag))
        }

        return Object.values(meta).join('')
    }

    generateLinkTags = ( pageLinkTags = [] ) => {

        const linkTags = {
            ...defaultLinkTags,
            ...Object.fromEntries(pageLinkTags.map( mapLinkTag ))
        }

        return Object.values( linkTags ).join('')
    }

    render({
        content,
        title = null
    }) {
        return /* html */`
            <!doctype html>
            <html lang="${ this.getNuxt().head.htmlAttrs.lang }">
                <head>
                    <title>${ title || this.getNuxt().head.title }</title>

                    ${ this.generateMetaTags() }

                    ${ this.generateLinkTags() }

                    <!-- {{ Script Preloads }} -->

                    <style data-vue-ssr-id="38dfa7e4:0 70363609:0 019e1cef:0 932a8f60:0">/*! normalize.css v8.0.1 | MIT License | github.com/necolas/normalize.css */html{line-height:1.15;-webkit-text-size-adjust:100%}body{margin:0}main{display:block}h1{font-size:2em;margin:.67em 0}hr{box-sizing:content-box;height:0;overflow:visible}pre{font-family:monospace,monospace;font-size:1em}a{background-color:transparent}abbr[title]{border-bottom:none;text-decoration:underline;-webkit-text-decoration:underline dotted;text-decoration:underline dotted}b,strong{font-weight:bolder}code,kbd,samp{font-family:monospace,monospace;font-size:1em}small{font-size:80%}sub,sup{font-size:75%;line-height:0;position:relative;vertical-align:baseline}sub{bottom:-.25em}sup{top:-.5em}img{border-style:none}button,input,optgroup,select,textarea{font-family:inherit;font-size:100%;line-height:1.15;margin:0}button,input{overflow:visible}button,select{text-transform:none}[type=button],[type=submit],button{-webkit-appearance:button}[type=button]::-moz-focus-inner,[type=submit]::-moz-focus-inner,button::-moz-focus-inner{border-style:none;padding:0}[type=button]:-moz-focusring,[type=submit]:-moz-focusring,button:-moz-focusring{outline:1px dotted ButtonText}fieldset{padding:.35em .75em .625em}legend{box-sizing:border-box;color:inherit;display:table;max-width:100%;padding:0;white-space:normal}progress{vertical-align:baseline}textarea{overflow:auto}[type=number]::-webkit-inner-spin-button,[type=number]::-webkit-outer-spin-button{height:auto}[type=search]{-webkit-appearance:textfield;outline-offset:-2px}[type=search]::-webkit-search-decoration{-webkit-appearance:none}details{display:block}summary{display:list-item}[hidden],template{display:none}blockquote,dd,dl,figure,h1,h2,h3,h4,h5,h6,hr,p,pre{margin:0}button{background-color:transparent;background-image:none}button:focus{outline:1px dotted;outline:5px auto -webkit-focus-ring-color}fieldset,ol,ul{margin:0;padding:0}ol,ul{list-style:none}html{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif,BlinkMacSystemFont,"Segoe UI","Helvetica Neue",Arial,"Noto Sans","Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji";line-height:1.5}*,:after,:before{box-sizing:border-box;border:0 solid #e2e8f0}hr{border-top-width:1px}img{border-style:solid}textarea{resize:vertical}input::-moz-placeholder,textarea::-moz-placeholder{color:#a0aec0}input:-ms-input-placeholder,textarea:-ms-input-placeholder{color:#a0aec0}input::placeholder,textarea::placeholder{color:#a0aec0}[role=button],button{cursor:pointer}table{border-collapse:collapse}h1,h2,h3,h4,h5,h6{font-size:inherit;font-weight:inherit}a{color:inherit;text-decoration:inherit}button,input,optgroup,select,textarea{padding:0;line-height:inherit;color:inherit}code,kbd,pre,samp{font-family:Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace}audio,canvas,embed,iframe,img,object,svg,video{display:block;vertical-align:middle}img,video{max-width:100%;height:auto}.container{width:100%;margin-right:auto;margin-left:auto;padding-right:1.5rem;padding-left:1.5rem}@media (min-width:640px){.container{max-width:640px}}@media (min-width:768px){.container{max-width:768px}}@media (min-width:1024px){.container{max-width:1024px}}@media (min-width:1280px){.container{max-width:1280px}}.space-x-0>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0px*var(--space-x-reverse));margin-left:calc(0px*(1 - var(--space-x-reverse)))}.space-y-2>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0.5rem*(1 - var(--space-y-reverse)));margin-bottom:calc(0.5rem*var(--space-y-reverse))}.space-x-2>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0.5rem*var(--space-x-reverse));margin-left:calc(0.5rem*(1 - var(--space-x-reverse)))}.space-y-3>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0.75rem*(1 - var(--space-y-reverse)));margin-bottom:calc(0.75rem*var(--space-y-reverse))}.space-x-3>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(0.75rem*var(--space-x-reverse));margin-left:calc(0.75rem*(1 - var(--space-x-reverse)))}.space-y-4>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1rem*(1 - var(--space-y-reverse)));margin-bottom:calc(1rem*var(--space-y-reverse))}.space-x-4>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1rem*var(--space-x-reverse));margin-left:calc(1rem*(1 - var(--space-x-reverse)))}.space-y-6>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(1.5rem*(1 - var(--space-y-reverse)));margin-bottom:calc(1.5rem*var(--space-y-reverse))}.space-x-6>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1.5rem*var(--space-x-reverse));margin-left:calc(1.5rem*(1 - var(--space-x-reverse)))}.space-y-8>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(2rem*(1 - var(--space-y-reverse)));margin-bottom:calc(2rem*var(--space-y-reverse))}.space-y-12>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(3rem*(1 - var(--space-y-reverse)));margin-bottom:calc(3rem*var(--space-y-reverse))}.divide-y>:not(template)~:not(template){--divide-y-reverse:0;border-top-width:calc(1px*(1 - var(--divide-y-reverse)));border-bottom-width:calc(1px*var(--divide-y-reverse))}.divide-gray-700>:not(template)~:not(template){--divide-opacity:1;border-color:#4a5568;border-color:rgba(74,85,104,var(--divide-opacity))}.appearance-none{-webkit-appearance:none;-moz-appearance:none;appearance:none}.bg-fixed{background-attachment:fixed}.bg-transparent{background-color:transparent}.bg-black{--bg-opacity:1;background-color:#000;background-color:rgba(0,0,0,var(--bg-opacity))}.bg-white{--bg-opacity:1;background-color:#fff;background-color:rgba(255,255,255,var(--bg-opacity))}.bg-gray-900{--bg-opacity:1;background-color:#1a202c;background-color:rgba(26,32,44,var(--bg-opacity))}.bg-red{--bg-opacity:1;background-color:#f52f57;background-color:rgba(245,47,87,var(--bg-opacity))}.bg-orange-500{--bg-opacity:1;background-color:#ed8936;background-color:rgba(237,137,54,var(--bg-opacity))}.bg-green-200{--bg-opacity:1;background-color:#c6f6d5;background-color:rgba(198,246,213,var(--bg-opacity))}.bg-green-500{--bg-opacity:1;background-color:#48bb78;background-color:rgba(72,187,120,var(--bg-opacity))}.bg-teal-100{--bg-opacity:1;background-color:#e6fffa;background-color:rgba(230,255,250,var(--bg-opacity))}.bg-darker{--bg-opacity:1;background-color:#191a1d;background-color:rgba(25,26,29,var(--bg-opacity))}.bg-darkest{--bg-opacity:1;background-color:#121416;background-color:rgba(18,20,22,var(--bg-opacity))}.bg-white-2{background-color:hsla(0,0%,100%,.2)}.hover\:bg-gray-700:hover{--bg-opacity:1;background-color:#4a5568;background-color:rgba(74,85,104,var(--bg-opacity))}.hover\:bg-indigo-400:hover{--bg-opacity:1;background-color:#7f9cf5;background-color:rgba(127,156,245,var(--bg-opacity))}.hover\:bg-darker:hover{--bg-opacity:1;background-color:#191a1d;background-color:rgba(25,26,29,var(--bg-opacity))}.hover\:bg-darkest:hover{--bg-opacity:1;background-color:#121416;background-color:rgba(18,20,22,var(--bg-opacity))}.focus\:bg-gray-700:focus{--bg-opacity:1;background-color:#4a5568;background-color:rgba(74,85,104,var(--bg-opacity))}.bg-gradient-to-tr{background-image:linear-gradient(to top right,var(--gradient-color-stops))}.bg-gradient-to-br{background-image:linear-gradient(to bottom right,var(--gradient-color-stops))}.bg-gradient-to-bl{background-image:linear-gradient(to bottom left,var(--gradient-color-stops))}.from-black{--gradient-from-color:#000;--gradient-color-stops:var(--gradient-from-color),var(--gradient-to-color,transparent)}.from-dark{--gradient-from-color:#34393f;--gradient-color-stops:var(--gradient-from-color),var(--gradient-to-color,rgba(52,57,63,0))}.from-darker{--gradient-from-color:#191a1d;--gradient-color-stops:var(--gradient-from-color),var(--gradient-to-color,rgba(25,26,29,0))}.to-transparent{--gradient-to-color:transparent}.to-dark{--gradient-to-color:#34393f}.to-darker{--gradient-to-color:#191a1d}.border-transparent{border-color:transparent}.border-white{--border-opacity:1;border-color:#fff;border-color:rgba(255,255,255,var(--border-opacity))}.border-gray-200{--border-opacity:1;border-color:#edf2f7;border-color:rgba(237,242,247,var(--border-opacity))}.border-gray-700{--border-opacity:1;border-color:#4a5568;border-color:rgba(74,85,104,var(--border-opacity))}.border-indigo-500{--border-opacity:1;border-color:#667eea;border-color:rgba(102,126,234,var(--border-opacity))}.focus\:border-blue-300:focus{--border-opacity:1;border-color:#90cdf4;border-color:rgba(144,205,244,var(--border-opacity))}.focus\:border-indigo-600:focus{--border-opacity:1;border-color:#5a67d8;border-color:rgba(90,103,216,var(--border-opacity))}.border-opacity-0{--border-opacity:0}.border-opacity-50{--border-opacity:0.5}.border-opacity-100{--border-opacity:1}.hover\:border-opacity-50:hover{--border-opacity:0.5}.rounded-md{border-radius:.375rem}.rounded-lg{border-radius:.5rem}.rounded-2xl{border-radius:1rem}.rounded-full{border-radius:9999px}.rounded-r-full{border-top-right-radius:9999px;border-bottom-right-radius:9999px}.rounded-l-full{border-top-left-radius:9999px;border-bottom-left-radius:9999px}.rounded-bl-lg{border-bottom-left-radius:.5rem}.border-2{border-width:2px}.border{border-width:1px}.border-t-2{border-top-width:2px}.border-t{border-top-width:1px}.border-r{border-right-width:1px}.block{display:block}.inline-block{display:inline-block}.flex{display:flex}.inline-flex{display:inline-flex}.table{display:table}.hidden{display:none}.flex-col{flex-direction:column}.flex-wrap{flex-wrap:wrap}.items-start{align-items:flex-start}.items-end{align-items:flex-end}.items-center{align-items:center}.justify-start{justify-content:flex-start}.justify-center{justify-content:center}.justify-between{justify-content:space-between}.flex-1{flex:1 1 0%}.flex-grow-0{flex-grow:0}.flex-shrink-0{flex-shrink:0}.font-hairline{font-weight:100}.font-medium{font-weight:500}.font-bold{font-weight:700}.h-2{height:.5rem}.h-5{height:1.25rem}.h-6{height:1.5rem}.h-8{height:2rem}.h-10{height:2.5rem}.h-12{height:3rem}.h-16{height:4rem}.h-full{height:100%}.text-xs{font-size:.75rem}.text-sm{font-size:.875rem}.text-base{font-size:1rem}.text-lg{font-size:1.125rem}.text-xl{font-size:1.25rem}.text-2xl{font-size:1.5rem}.text-3xl{font-size:1.875rem}.text-4xl{font-size:2.25rem}.leading-4{line-height:1rem}.leading-5{line-height:1.25rem}.leading-6{line-height:1.5rem}.leading-tight{line-height:1.25}.my-4{margin-top:1rem;margin-bottom:1rem}.my-8{margin-top:2rem;margin-bottom:2rem}.my-12{margin-top:3rem;margin-bottom:3rem}.mx-auto{margin-left:auto;margin-right:auto}.-my-2{margin-top:-.5rem;margin-bottom:-.5rem}.-mx-5{margin-left:-1.25rem;margin-right:-1.25rem}.mt-1{margin-top:.25rem}.mr-2{margin-right:.5rem}.mb-3{margin-bottom:.75rem}.ml-3{margin-left:.75rem}.mb-4{margin-bottom:1rem}.mb-6{margin-bottom:1.5rem}.mt-8{margin-top:2rem}.mb-8{margin-bottom:2rem}.mt-12{margin-top:3rem}.mb-12{margin-bottom:3rem}.-ml-1{margin-left:-.25rem}.-mr-2{margin-right:-.5rem}.-ml-2{margin-left:-.5rem}.-mt-px{margin-top:-1px}.-mr-px{margin-right:-1px}.max-w-4xl{max-width:56rem}.max-w-screen-xl{max-width:1280px}.min-h-screen{min-height:100vh}.object-cover{-o-object-fit:cover;object-fit:cover}.opacity-0{opacity:0}.opacity-50{opacity:.5}.opacity-75{opacity:.75}.hover\:opacity-100:hover,.opacity-100{opacity:1}.focus\:outline-none:focus,.outline-none{outline:2px solid transparent;outline-offset:2px}.overflow-hidden{overflow:hidden}.overflow-x-auto{overflow-x:auto}.overflow-y-visible{overflow-y:visible}.p-2{padding:.5rem}.p-3{padding:.75rem}.p-4{padding:1rem}.p-6{padding:1.5rem}.py-0{padding-top:0;padding-bottom:0}.py-1{padding-top:.25rem;padding-bottom:.25rem}.py-2{padding-top:.5rem;padding-bottom:.5rem}.px-2{padding-left:.5rem;padding-right:.5rem}.py-3{padding-top:.75rem;padding-bottom:.75rem}.px-3{padding-left:.75rem;padding-right:.75rem}.py-4{padding-top:1rem;padding-bottom:1rem}.px-4{padding-left:1rem;padding-right:1rem}.py-5{padding-top:1.25rem;padding-bottom:1.25rem}.px-5{padding-left:1.25rem;padding-right:1.25rem}.py-6{padding-top:1.5rem;padding-bottom:1.5rem}.px-6{padding-left:1.5rem;padding-right:1.5rem}.py-12{padding-top:3rem;padding-bottom:3rem}.py-16{padding-top:4rem;padding-bottom:4rem}.py-24{padding-top:6rem;padding-bottom:6rem}.py-32{padding-top:8rem;padding-bottom:8rem}.pl-1{padding-left:.25rem}.pt-2{padding-top:.5rem}.pb-3{padding-bottom:.75rem}.pb-4{padding-bottom:1rem}.pl-5{padding-left:1.25rem}.pr-6{padding-right:1.5rem}.pl-8{padding-left:2rem}.pt-16{padding-top:4rem}.pb-16{padding-bottom:4rem}.pb-16\/9{padding-bottom:56.25%}.placeholder-white::-moz-placeholder{--placeholder-opacity:1;color:#fff;color:rgba(255,255,255,var(--placeholder-opacity))}.placeholder-white:-ms-input-placeholder{--placeholder-opacity:1;color:#fff;color:rgba(255,255,255,var(--placeholder-opacity))}.placeholder-white::placeholder{--placeholder-opacity:1;color:#fff;color:rgba(255,255,255,var(--placeholder-opacity))}.pointer-events-none{pointer-events:none}.pointer-events-auto{pointer-events:auto}.static{position:static}.fixed{position:fixed}.absolute{position:absolute}.relative{position:relative}.inset-0{right:0;left:0}.inset-0,.inset-y-0{top:0;bottom:0}.inset-x-0{right:0;left:0}.top-0{top:0}.right-0{right:0}.left-0{left:0}.shadow-sm{box-shadow:0 1px 2px 0 rgba(0,0,0,.05)}.shadow{box-shadow:0 1px 3px 0 rgba(0,0,0,.1),0 1px 2px 0 rgba(0,0,0,.06)}.shadow-none{box-shadow:none}.text-left{text-align:left}.text-center{text-align:center}.text-white{--text-opacity:1;color:#fff;color:rgba(255,255,255,var(--text-opacity))}.text-gray-300{--text-opacity:1;color:#e2e8f0;color:rgba(226,232,240,var(--text-opacity))}.text-gray-400{--text-opacity:1;color:#cbd5e0;color:rgba(203,213,224,var(--text-opacity))}.text-gray-500{--text-opacity:1;color:#a0aec0;color:rgba(160,174,192,var(--text-opacity))}.text-red{--text-opacity:1;color:#f52f57;color:rgba(245,47,87,var(--text-opacity))}.text-orange-500{--text-opacity:1;color:#ed8936;color:rgba(237,137,54,var(--text-opacity))}.text-green-200{--text-opacity:1;color:#c6f6d5;color:rgba(198,246,213,var(--text-opacity))}.text-green-500{--text-opacity:1;color:#48bb78;color:rgba(72,187,120,var(--text-opacity))}.text-teal-800{--text-opacity:1;color:#285e61;color:rgba(40,94,97,var(--text-opacity))}.hover\:text-white:hover{--text-opacity:1;color:#fff;color:rgba(255,255,255,var(--text-opacity))}.hover\:text-gray-500:hover{--text-opacity:1;color:#a0aec0;color:rgba(160,174,192,var(--text-opacity))}.hover\:text-gray-900:hover{--text-opacity:1;color:#1a202c;color:rgba(26,32,44,var(--text-opacity))}.focus\:text-white:focus{--text-opacity:1;color:#fff;color:rgba(255,255,255,var(--text-opacity))}.underline{text-decoration:underline}.visible{visibility:visible}.whitespace-normal{white-space:normal}.whitespace-no-wrap{white-space:nowrap}.w-0{width:0}.w-5{width:1.25rem}.w-6{width:1.5rem}.w-8{width:2rem}.w-10{width:2.5rem}.w-12{width:3rem}.w-16{width:4rem}.w-full{width:100%}.w-screen{width:100vw}.w-2x-screen{width:200vw}.z-navbar{z-index:400}.col-span-1{grid-column:span 1/span 1}.transform{--transform-translate-x:0;--transform-translate-y:0;--transform-rotate:0;--transform-skew-x:0;--transform-skew-y:0;--transform-scale-x:1;--transform-scale-y:1;transform:translateX(var(--transform-translate-x)) translateY(var(--transform-translate-y)) rotate(var(--transform-rotate)) skewX(var(--transform-skew-x)) skewY(var(--transform-skew-y)) scaleX(var(--transform-scale-x)) scaleY(var(--transform-scale-y))}.-translate-x-1\/2{--transform-translate-x:-50%}.translate-x-1\/2{--transform-translate-x:50%}.-translate-y-1\/2{--transform-translate-y:-50%}.transition{transition-property:background-color,border-color,color,fill,stroke,opacity,box-shadow,transform}.transition-opacity{transition-property:opacity}.ease-in-out{transition-timing-function:cubic-bezier(.4,0,.2,1)}.duration-150{transition-duration:.15s}.duration-300{transition-duration:.3s}.duration-500{transition-duration:.5s}@-webkit-keyframes spin{to{transform:rotate(1turn)}}@keyframes spin{to{transform:rotate(1turn)}}@-webkit-keyframes ping{75%,to{transform:scale(2);opacity:0}}@keyframes ping{75%,to{transform:scale(2);opacity:0}}@-webkit-keyframes pulse{50%{opacity:.5}}@keyframes pulse{50%{opacity:.5}}@-webkit-keyframes bounce{0%,to{transform:translateY(-25%);-webkit-animation-timing-function:cubic-bezier(.8,0,1,1);animation-timing-function:cubic-bezier(.8,0,1,1)}50%{transform:none;-webkit-animation-timing-function:cubic-bezier(0,0,.2,1);animation-timing-function:cubic-bezier(0,0,.2,1)}}@keyframes bounce{0%,to{transform:translateY(-25%);-webkit-animation-timing-function:cubic-bezier(.8,0,1,1);animation-timing-function:cubic-bezier(.8,0,1,1)}50%{transform:none;-webkit-animation-timing-function:cubic-bezier(0,0,.2,1);animation-timing-function:cubic-bezier(0,0,.2,1)}}.ease{transition-property:all;transition-duration:.4s;transition-timing-function:cubic-bezier(.77,0,.175,1)}.lazyload,.lazyloading{opacity:0}.lazyloaded{transition-property:all;transition-duration:.4s;transition-timing-function:cubic-bezier(.77,0,.175,1);transition-property:opacity;opacity:1}.hover\:neumorphic-shadow:hover,.neumorphic-shadow{box-shadow:-.25rem -.25rem .5rem hsla(0,0%,100%,.07),.25rem .25rem .5rem rgba(0,0,0,.12),-.75rem -.75rem 1.75rem hsla(0,0%,100%,.07),.75rem .75rem 1.75rem rgba(0,0,0,.12),inset 8rem 8rem 8rem rgba(0,0,0,.05),inset -8rem -8rem 8rem hsla(0,0%,100%,.05)}.hover\:neumorphic-shadow-outer:hover,.neumorphic-shadow-outer{box-shadow:-.25rem -.25rem .5rem hsla(0,0%,100%,.07),.25rem .25rem .5rem rgba(0,0,0,.12),-.75rem -.75rem 1.75rem hsla(0,0%,100%,.07),.75rem .75rem 1.75rem rgba(0,0,0,.12)}.hover\:neumorphic-shadow-inner:hover,.neumorphic-shadow-inner{box-shadow:inset -.25rem -.25rem .5rem hsla(0,0%,100%,.07),inset .25rem .25rem .5rem rgba(0,0,0,.12),inset -.75rem -.75rem 1.75rem hsla(0,0%,100%,.07),inset .75rem .75rem 1.75rem rgba(0,0,0,.12)}.bg-blur,.hover\:bg-blur:hover{-webkit-backdrop-filter:blur(15px);backdrop-filter:blur(15px)}@media (min-width:640px){.sm\:space-x-6>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1.5rem*var(--space-x-reverse));margin-left:calc(1.5rem*(1 - var(--space-x-reverse)))}.sm\:text-5xl{font-size:3rem}.sm\:px-6{padding-left:1.5rem;padding-right:1.5rem}}@media (min-width:768px){.md\:space-y-0>:not(template)~:not(template){--space-y-reverse:0;margin-top:calc(0px*(1 - var(--space-y-reverse)));margin-bottom:calc(0px*var(--space-y-reverse))}.md\:space-x-4>:not(template)~:not(template){--space-x-reverse:0;margin-right:calc(1rem*var(--space-x-reverse));margin-left:calc(1rem*(1 - var(--space-x-reverse)))}.md\:flex{display:flex}.md\:flex-row{flex-direction:row}.md\:justify-end{justify-content:flex-end}.md\:text-xl{font-size:1.25rem}.md\:text-2xl{font-size:1.5rem}.md\:text-3xl{font-size:1.875rem}.md\:text-4xl{font-size:2.25rem}.md\:text-5xl{font-size:3rem}.md\:text-6xl{font-size:4rem}.md\:overflow-visible{overflow:visible}.md\:py-4{padding-top:1rem;padding-bottom:1rem}.md\:px-4{padding-left:1rem;padding-right:1rem}.md\:px-10{padding-left:2.5rem;padding-right:2.5rem}.md\:pt-0{padding-top:0}.md\:pb-12{padding-bottom:3rem}.md\:pl-20{padding-left:5rem}.md\:pr-64{padding-right:16rem}.md\:static{position:static}.md\:absolute{position:absolute}.md\:inset-0{top:0;right:0;bottom:0;left:0}.md\:w-64{width:16rem}.md\:w-full{width:100%}}@media (min-width:1024px){.lg\:flex{display:flex}.lg\:hidden{display:none}.lg\:items-center{align-items:center}.lg\:text-5xl{font-size:3rem}.lg\:ml-6{margin-left:1.5rem}.lg\:px-3{padding-left:.75rem;padding-right:.75rem}.lg\:px-6{padding-left:1.5rem;padding-right:1.5rem}.lg\:px-8{padding-left:2rem;padding-right:2rem}}
                        @font-face{font-family:"InterVariable";font-style:normal;font-display:swap;font-weight:100 900;src:url(/_nuxt/fonts/inter-cyrillic-variable-wghtOnly-normal.624f200.woff2) format("woff2");unicode-range:U+0400-045f,U+0490-0491,U+04b0-04b1,U+2116}@font-face{font-family:"InterVariable";font-style:normal;font-display:swap;font-weight:100 900;src:url(/_nuxt/fonts/inter-cyrillic-ext-variable-wghtOnly-normal.9e9fd43.woff2) format("woff2");unicode-range:U+0460-052f,U+1c80-1c88,U+20b4,U+2de0-2dff,U+a640-a69f,U+fe2e-fe2f}@font-face{font-family:"InterVariable";font-style:normal;font-display:swap;font-weight:100 900;src:url(/_nuxt/fonts/inter-greek-variable-wghtOnly-normal.9914692.woff2) format("woff2");unicode-range:U+0370-03ff}@font-face{font-family:"InterVariable";font-style:normal;font-display:swap;font-weight:100 900;src:url(/_nuxt/fonts/inter-greek-ext-variable-wghtOnly-normal.b867239.woff2) format("woff2");unicode-range:U+1f??}@font-face{font-family:"InterVariable";font-style:normal;font-display:swap;font-weight:100 900;src:url(/_nuxt/fonts/inter-latin-variable-wghtOnly-normal.0e55b80.woff2) format("woff2");unicode-range:U+00??,U+0131,U+0152-0153,U+02bb-02bc,U+02c6,U+02da,U+02dc,U+2000-206f,U+2074,U+20ac,U+2122,U+2191,U+2193,U+2212,U+2215,U+feff,U+fffd}@font-face{font-family:"InterVariable";font-style:normal;font-display:swap;font-weight:100 900;src:url(/_nuxt/fonts/inter-latin-ext-variable-wghtOnly-normal.2407e03.woff2) format("woff2");unicode-range:U+0100-024f,U+0259,U+1e??,U+2020,U+20a0-20ab,U+20ad-20cf,U+2113,U+2c60-2c7f,U+a720-a7ff}@font-face{font-family:"InterVariable";font-style:normal;font-display:swap;font-weight:100 900;src:url(/_nuxt/fonts/inter-vietnamese-variable-wghtOnly-normal.5913e4f.woff2) format("woff2");unicode-range:U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01a0-01a1,U+01af-01b0,U+1ea0-1ef9,U+20ab}
                        .nuxt-progress{position:fixed;top:0;left:0;right:0;height:2px;width:0;opacity:1;transition:width .1s,opacity .4s;background-color:#fff;z-index:999999}
                        html{font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:20px;word-spacing:1px;-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;-moz-osx-font-smoothing:grayscale;-webkit-font-smoothing:antialiased;box-sizing:border-box;background:#191a1d}*,:after,:before{box-sizing:border-box;margin:0}
                    </style>

                    <!-- {{ External Styles }} -->

                </head>
                <body>
                    <div id="__nuxt">
                        <!---->
                        <div id="__layout">
                            <div class="app-wrapper text-gray-300 bg-gradient-to-bl from-dark to-darker bg-fixed">
                                <nav class="fixed top-0 left-0 right-0 z-navbar">
                                    <div class="max-w-7xl mx-auto px-4 lg:px-8">
                                        <div class="flex justify-between h-16">
                                            <div class="flex">
                                                <div class="-ml-2 mr-2 flex items-center lg:hidden">
                                                    <button aria-expanded="false" aria-label="Main menu" class="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none focus:bg-gray-700 focus:text-white transition duration-150 ease-in-out">
                                                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6">
                                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
                                                        </svg>
                                                        <!---->
                                                    </button>
                                                </div>
                                                <div class="flex-shrink-0 flex items-center text-4xl lg:text-5xl py-3">
                                                    <div>🦾</div>
                                                </div>
                                                <div class="hidden lg:ml-6 lg:flex lg:items-center space-x-4"><a href="/" class="px-3 py-2 rounded-md text-sm font-medium leading-5 focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out text-gray-300 hover:bg-darker hover:neumorphic-shadow">Home </a><a href="/categories" class="px-3 py-2 rounded-md text-sm font-medium leading-5 focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out text-gray-300 hover:bg-darker hover:neumorphic-shadow">Categories </a><a href="/benchmarks" class="px-3 py-2 rounded-md text-sm font-medium leading-5 focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out text-gray-300 hover:bg-darker hover:neumorphic-shadow">Benchmarks </a><a href="/kind/homebrew" class="px-3 py-2 rounded-md text-sm font-medium leading-5 focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out text-gray-300 hover:bg-darker hover:neumorphic-shadow">Homebrew </a><a href="/games" class="px-3 py-2 rounded-md text-sm font-medium leading-5 focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out text-gray-300 hover:bg-darker hover:neumorphic-shadow">Games</a></div>
                                            </div>
                                            <div class="flex items-center">
                                                <div class="flex-shrink-0"><a href="https://www.producthunt.com/posts/does-it-arm-benchmarks?utm_source=badge-featured&utm_medium=badge&utm_souce=badge-does-it-arm-benchmarks" target="_blank"><img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=279410&theme=light" alt="Does It ARM Benchmarks - Curated App Benchmark Videos for Apple Silicon and Apple M1 | Product Hunt" width="200" height="43" style="width: 200px; height: 43px;"></a></div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="lg:hidden hidden">
                                        <div class="px-2 pt-2 pb-3 lg:px-3"><a href="/" class="mt-1 block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:text-white hover:bg-gray-700 focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out text-gray-300 hover:bg-gray-700">Home </a><a href="/categories" class="mt-1 block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:text-white hover:bg-gray-700 focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out text-gray-300 hover:bg-gray-700">Categories </a><a href="/benchmarks" class="mt-1 block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:text-white hover:bg-gray-700 focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out text-gray-300 hover:bg-gray-700">Benchmarks </a><a href="/kind/homebrew" class="mt-1 block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:text-white hover:bg-gray-700 focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out text-gray-300 hover:bg-gray-700">Homebrew </a><a href="/games" class="mt-1 block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:text-white hover:bg-gray-700 focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out text-gray-300 hover:bg-gray-700">Games</a></div>
                                        <hr>
                                    </div>
                                </nav>
                                <div class="app-main min-h-screen flex items-center">

                                    ${ content }

                                </div>
                                <footer>
                                    <div class="max-w-screen-xl mx-auto py-12 px-4 overflow-hidden space-y-8 sm:px-6 lg:px-8">
                                        <div class="mt-8 flex justify-center space-x-6">
                                            <div class="flex flex-col items-center space-y-4">
                                                <div>
                                                    <div>
                                                        <form class="all-updates-subscribe text-xs relative">
                                                            <!---->
                                                            <div class="mt-1 relative rounded-md shadow-sm">
                                                                <!----> <input id="all-updates-subscribe-17332" placeholder="Send me regular app updates" aria-label="Send me regular app updates" name="all-updates-subscribe" type="email" required class="form-input block w-full rounded-md py-1 neumorphic-shadow bg-darker placeholder-white text-center border border-transparent px-3" style="width: 240px;">
                                                            </div>
                                                        </form>
                                                    </div>
                                                    <!---->
                                                </div>
                                            </div>
                                        </div>
                                        <p class="mt-8 text-center text-base leading-6 text-gray-400">© ${ year } ${ this.getNuxt().head.title } All rights reserved.</p>
                                    </div>
                                </footer>
                            </div>
                        </div>
                    </div>

                    {{ Scripts }}
                </body>
            </html>
        `;
    }
}

module.exports = DefaultLayout
