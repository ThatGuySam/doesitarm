let OPERATORS = {
    False: 0,
    True: 1,
    Ident: 2,
    AppleAnchor: 3,
    AnchorHash: 4,
    InfoKeyValue: 5,
    And: 6,
    Or: 7,
    CDHash: 8,
    Not: 9,
    InfoKeyField: 10,
    CertField: 11,
    TrustedCert: 12,
    TrustedCerts: 13,
    CertGeneric: 14,
    AppleGenericAnchor: 15,
    EntitlementField: 16,
    CertPolicy: 17,
    NamedAnchor: 18,
    Platform: 20,
    toString: function() {
        return JSON.stringify(this);
    }
};