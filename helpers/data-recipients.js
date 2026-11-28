export const cookieBannerConsent = 'Required before loading'

const onAffiliateClick = 'On an affiliate link click. The destination handles any consent for its cookies.'

export const dataRecipients = [
    {
        name: 'Cloudflare',
        purpose: 'Host the site, scanner and MCP server, serve images (including vumbnail.com), handle logs and rate limits, store signups and requests in D1, and send confirmations, alerts and service emails through Email Sending.',
        data: 'IP address, browser and request metadata, scanner URL requests, MCP requests in transit, rate-limit keys, email addresses, signup and service request details, and transactional email contents.',
        surfaces: [ 'Website', 'Scanner', 'Email', 'MCP' ],
        cookies: 'May set security cookies.',
        euConsent: 'Essential hosting and abuse prevention. Email is sent in response to a signup or request.',
        privacyPolicy: 'https://www.cloudflare.com/privacypolicy/',
        consentCategory: 'necessary'
    },
    {
        name: 'Cloudflare (offer analytics)',
        purpose: 'Count views, clicks and submissions for different service offer headlines.',
        data: 'Offer, headline variant, experiment, interaction and control, page path and random browser ID.',
        surfaces: [ 'Website' ],
        cookies: 'The site uses local storage for the variant and browser ID.',
        euConsent: cookieBannerConsent,
        privacyPolicy: 'https://www.cloudflare.com/privacypolicy/',
        consentCategory: 'analytics'
    },
    {
        name: 'Cloudflare Turnstile',
        purpose: 'Check for abuse on service request forms.',
        data: 'Browser and device signals, IP address and challenge verification token.',
        surfaces: [ 'Website' ],
        cookies: 'Uses a challenge token. A security cookie is possible if pre-clearance is enabled.',
        euConsent: 'Essential form security.',
        privacyPolicy: 'https://www.cloudflare.com/turnstile-privacy-policy/',
        consentCategory: 'necessary'
    },
    {
        name: 'Vercel',
        purpose: 'Run data functions, including the scan report endpoint that writes reports to Google Sheets.',
        data: 'Request metadata and the scan report fields listed above.',
        surfaces: [ 'Website', 'Scanner' ],
        cookies: 'The data functions require no browser cookies.',
        euConsent: 'Backend processing. See the scanner section for sharing choices.',
        privacyPolicy: 'https://vercel.com/legal/privacy-policy',
        consentCategory: 'necessary'
    },
    {
        name: 'Google Sheets and Forms',
        purpose: 'Store scan reports and collect game compatibility submissions.',
        data: 'Scan report fields listed above, and anything you submit through the linked game report form.',
        surfaces: [ 'Website', 'Scanner' ],
        cookies: 'Scan reports are stored server-side. Google Forms may use cookies on its own site.',
        euConsent: 'Backend storage or a form you open on Google. Google handles any consent on its site.',
        privacyPolicy: 'https://policies.google.com/privacy',
        consentCategory: 'necessary'
    },
    {
        name: 'Google Analytics 4',
        purpose: 'Measure traffic and interactions with service offers.',
        data: 'Page visits, referrer, device and browser details, approximate location, analytics identifiers and service offer events.',
        surfaces: [ 'Website', 'Scanner' ],
        cookies: 'Sets first-party analytics cookies.',
        euConsent: cookieBannerConsent,
        privacyPolicy: 'https://policies.google.com/privacy',
        consentCategory: 'analytics'
    },
    {
        name: 'Carbon Ads (BuySellAds)',
        purpose: 'Serve and measure ads.',
        data: 'IP address, browser and device details, ad placement and interactions.',
        surfaces: [ 'Website' ],
        cookies: 'May use advertising cookies.',
        euConsent: cookieBannerConsent,
        privacyPolicy: 'https://www.carbonads.net/privacy',
        consentCategory: 'advertising'
    },
    {
        name: 'Kit',
        purpose: 'Confirm newsletter subscriptions, send app updates and manage unsubscribes and bounces.',
        data: 'Email address, signup referrer, subscription and delivery status.',
        surfaces: [ 'Email' ],
        cookies: 'The site sends signups server-side without loading Kit browser cookies.',
        euConsent: 'Newsletter signup and email confirmation.',
        privacyPolicy: 'https://kit.com/privacy',
        consentCategory: 'necessary'
    },
    {
        name: 'YouTube (Google)',
        purpose: 'Show thumbnails on video pages and load the privacy-enhanced youtube-nocookie.com player when you start a video.',
        data: 'IP address, browser metadata and video ID for thumbnails. Playback can also send player interactions to Google.',
        surfaces: [ 'Website' ],
        cookies: 'The player may use browser storage after activation.',
        euConsent: 'The embedded player loads when you choose to play or select a timestamp.',
        privacyPolicy: 'https://policies.google.com/privacy',
        consentCategory: 'necessary'
    },
    {
        name: 'Amazon Associates',
        purpose: 'Attribute referrals and purchases through Amazon links (amzn.to).',
        data: 'Referral ID and request metadata. Amazon handles any purchase details.',
        surfaces: [ 'Website' ],
        cookies: 'May set cookies after you follow the link.',
        euConsent: onAffiliateClick,
        privacyPolicy: 'https://www.amazon.com/privacy',
        consentCategory: 'advertising'
    },
    {
        name: 'Partnerize (prf.hn)',
        purpose: 'Attribute Parallels referrals.',
        data: 'Referral ID, IP address, browser and device information, and conversion data from the merchant.',
        surfaces: [ 'Website' ],
        cookies: 'May set cookies after you follow the link.',
        euConsent: onAffiliateClick,
        privacyPolicy: 'https://partnerize.com/legal/privacy-policy',
        consentCategory: 'advertising'
    },
    {
        name: 'PartnerStack',
        purpose: 'Attribute referrals from the Notion and Restream affiliate links.',
        data: 'Referral ID, click metadata and any conversion attributed to the link.',
        surfaces: [ 'Website' ],
        cookies: 'May set cookies after you follow the link.',
        euConsent: onAffiliateClick,
        privacyPolicy: 'https://partnerstack.com/legal/privacy-policy',
        consentCategory: 'advertising'
    },
    {
        name: 'Awin (ShareASale)',
        purpose: 'Handle the Wondershare affiliate link (shrsl.com).',
        data: 'Referral ID, click metadata and any conversion attributed to the link.',
        surfaces: [ 'Website' ],
        cookies: 'May set cookies after you follow the link.',
        euConsent: onAffiliateClick,
        privacyPolicy: 'https://www.awin.com/us/privacy',
        consentCategory: 'advertising'
    },
    {
        name: 'Jotform',
        purpose: 'Attribute referrals from the Jotform link (link.jotform.com).',
        data: 'Referral ID, click metadata and any conversion attributed to the link.',
        surfaces: [ 'Website' ],
        cookies: 'May set cookies after you follow the link.',
        euConsent: onAffiliateClick,
        privacyPolicy: 'https://www.jotform.com/privacy/',
        consentCategory: 'advertising'
    },
    {
        name: 'GitHub',
        purpose: 'Host the public repo, contributions, issue forms and MCP documentation.',
        data: 'Request metadata if you follow a GitHub link, and any profile details or content you post there.',
        surfaces: [ 'Website', 'MCP' ],
        cookies: 'GitHub may use cookies on its own site.',
        euConsent: 'GitHub handles any consent when you visit its site.',
        privacyPolicy: 'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement',
        consentCategory: 'necessary'
    },
    {
        name: 'Netlify',
        purpose: 'Host the website and functions when the alternate Netlify deployment is used.',
        data: 'IP address, browser and request metadata.',
        surfaces: [ 'Website', 'Scanner' ],
        cookies: 'No site cookies are needed for this hosting.',
        euConsent: 'Essential hosting.',
        privacyPolicy: 'https://www.netlify.com/privacy/',
        consentCategory: 'necessary'
    }
]
