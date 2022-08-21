import axios from 'axios'

;(async () => {

    const { data } = await axios.get(`https://master--doesitarm.netlify.app/apple-silicon-app-test`)

    console.log( data.slice(0, 100) )

    process.exit()
})()
