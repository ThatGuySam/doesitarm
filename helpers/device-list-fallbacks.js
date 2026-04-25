const rawDeviceList = [
    {
        name: '2023 M3 Macbook Pros',
        enabled: 'yes',
        type: 'mac-apple-silicon',
        description: '16 inch and 14 inch M3 Max Macbook Pro designed for pros. ',
        amazonUrl: 'https://www.apple.com/macbook-pro/',
        bhUrl: '',
        adoramaUrl: '',
        slug: '2023-m3-macbook-pros',
        endpoint: '/device/2023-m3-macbook-pros'
    },
    {
        name: '2023 M2 Macbook Pros',
        enabled: 'yes',
        type: 'mac-apple-silicon',
        description: '16 inch and 14 inch M2 Max Macbook Pro designed for pros. ',
        amazonUrl: 'https://amzn.to/3FEuUs1',
        bhUrl: '',
        adoramaUrl: '',
        slug: '2023-m2-macbook-pros',
        endpoint: '/device/2023-m2-macbook-pros'
    },
    {
        name: '2023 M3 iMac',
        enabled: 'yes',
        type: 'mac-apple-silicon',
        description: 'M3 iMac is the new Apple Silicon desktop optimized with the Apple M3 processor. ',
        amazonUrl: 'https://www.apple.com/imac/',
        bhUrl: '',
        adoramaUrl: '',
        slug: '2023-m3-imac',
        endpoint: '/device/2023-m3-imac'
    },
    {
        name: '2023 M2 Pro Mac Mini',
        enabled: 'yes',
        type: 'mac-apple-silicon',
        description: 'M3 Mac Mini is the second generation Apple Silicon iMac for desktop.',
        amazonUrl: 'https://amzn.to/40yxCsV',
        bhUrl: '',
        adoramaUrl: '',
        slug: '2023-m2-pro-mac-mini',
        endpoint: '/device/2023-m2-pro-mac-mini'
    },
    {
        name: 'Intel Macs',
        enabled: 'yes',
        type: 'intel',
        description: 'Intel Macs are the classic Macs that succeed the PowerPC Macs and preceeded Apple Silicon. ',
        amazonUrl: 'https://amzn.to/3h3LQwR',
        bhUrl: '',
        adoramaUrl: '',
        slug: 'intel-macs',
        endpoint: '/device/intel-macs'
    },
    {
        name: 'iPad',
        enabled: 'no',
        type: 'ios',
        description: '',
        amazonUrl: 'https://amzn.to/3b67Inz',
        bhUrl: '',
        adoramaUrl: '',
        slug: 'ipad',
        endpoint: '/device/ipad'
    },
    {
        name: 'iPhone',
        enabled: 'no',
        type: 'ios',
        description: '',
        amazonUrl: 'https://amzn.to/3uovRxs',
        bhUrl: '',
        adoramaUrl: '',
        slug: 'iphone',
        endpoint: '/device/iphone'
    },
    {
        name: '2021 M1 Macbook Pros',
        enabled: 'no',
        type: 'mac-apple-silicon',
        description: 'M1 Pro Macbook Pro and M1 Max Macbook Pro are the new Apple Silicon notebooks optimized with the Apple M1 processor and the first Apple silicon designed for pros. ',
        amazonUrl: 'https://amzn.to/3jiwNQh',
        bhUrl: '',
        adoramaUrl: '',
        slug: '2021-m1-macbook-pros',
        endpoint: '/device/2021-m1-macbook-pros'
    },
    {
        name: 'M1 Macbook Pro',
        enabled: 'no',
        type: 'mac-apple-silicon',
        description: 'M1 Macbook Pro is the portable first generation Apple Silicon Mac for professionals.',
        amazonUrl: 'https://amzn.to/3h3BkG1',
        bhUrl: '',
        adoramaUrl: '',
        slug: 'm1-macbook-pro',
        endpoint: '/device/m1-macbook-pro'
    },
    {
        name: 'M1 Macbook Air',
        enabled: 'no',
        type: 'mac-apple-silicon',
        description: 'M1 Macbook Air is the portable first generation Apple Silicon Mac for users needing a lighter computer.',
        amazonUrl: 'https://amzn.to/3elKVX5',
        bhUrl: '',
        adoramaUrl: '',
        slug: 'm1-macbook-air',
        endpoint: '/device/m1-macbook-air'
    },
    {
        name: 'M1 iPad Pro',
        enabled: 'no',
        type: 'ios',
        description: 'M1 iPad Pro is the first mobile Apple device featuring the M1 Apple processor. ',
        amazonUrl: 'https://amzn.to/3nQY3qe',
        bhUrl: '',
        adoramaUrl: '',
        slug: 'm1-ipad-pro',
        endpoint: '/device/m1-ipad-pro'
    },
    {
        name: 'M1 iMac',
        enabled: 'no',
        type: 'mac-apple-silicon',
        description: 'M1 iMac is the new Apple Silicon desktop optimized with the Apple M1 processor and the first of the second generation of Apple Silicon Macs. ',
        amazonUrl: 'https://amzn.to/3vMUnbA',
        bhUrl: '',
        adoramaUrl: '',
        slug: 'm1-imac',
        endpoint: '/device/m1-imac'
    }
]

export const deviceListingFallbacks = rawDeviceList.filter( device => device.enabled !== 'no' )
