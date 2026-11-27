"""Verify a PyPI PEP 740 attestation for one wheel, in pure Python.

PyPI serves provenance at /integrity/<project>/<version>/<filename>/provenance.
We do not trust PyPI's own check. For the exact wheel digest we verify:

1. the bundle's publisher is GitHub `yt-dlp/yt-dlp`, workflow `release.yml`;
2. the in-toto statement names this wheel file and its SHA-256;
3. the DSSE signature over the statement verifies with the signing certificate;
4. the signing certificate was issued by Sigstore's Fulcio intermediate (pinned
   below), names the yt-dlp release workflow, and was issued by GitHub Actions OIDC;
5. the Rekor transparency-log entry is signed by Rekor's key (pinned), records this
   exact signature and payload, sits in the log's Merkle tree (inclusion proof and
   signed checkpoint), and was logged while the short-lived certificate was valid.

No third-party packages: DER parsing and ECDSA (P-256, P-384) verification are
implemented here so the same code runs in CPython tests and in Pyodide.
"""

import base64
import hashlib
import json

EXPECTED_PUBLISHER = {"kind": "GitHub", "repository": "yt-dlp/yt-dlp", "workflow": "release.yml"}
WORKFLOW_URI_PREFIX = "https://github.com/yt-dlp/yt-dlp/.github/workflows/release.yml@refs/"
OIDC_ISSUER = "https://token.actions.githubusercontent.com"
STATEMENT_TYPE = "https://in-toto.io/Statement/v1"
PREDICATE_TYPE = "https://docs.pypi.org/attestations/publish/v1"
PAYLOAD_TYPE = "application/vnd.in-toto+json"

# Sigstore public-good trust root (sigstore/root-signing targets/trusted_root.json).
# Fulcio intermediate "sigstore-intermediate", valid 2022-04-13 to 2031-10-05.
FULCIO_INTERMEDIATE_B64 = (
    "MIICGjCCAaGgAwIBAgIUALnViVfnU0brJasmRkHrn/UnfaQwCgYIKoZIzj0EAwMwKjEVMBMGA1UEChMMc2lnc3RvcmUuZGV2"
    "MREwDwYDVQQDEwhzaWdzdG9yZTAeFw0yMjA0MTMyMDA2MTVaFw0zMTEwMDUxMzU2NThaMDcxFTATBgNVBAoTDHNpZ3N0b3Jl"
    "LmRldjEeMBwGA1UEAxMVc2lnc3RvcmUtaW50ZXJtZWRpYXRlMHYwEAYHKoZIzj0CAQYFK4EEACIDYgAE8RVS/ysH+NOvuDZy"
    "PIZtilgUF9NlarYpAd9HP1vBBH1U5CV77LSS7s0ZiH4nE7Hv7ptS6LvvR/STk798LVgMzLlJ4HeIfF3tHSaexLcYpSASr1kS"
    "0N/RgBJz/9jWCiXno3sweTAOBgNVHQ8BAf8EBAMCAQYwEwYDVR0lBAwwCgYIKwYBBQUHAwMwEgYDVR0TAQH/BAgwBgEB/wIB"
    "ADAdBgNVHQ4EFgQU39Ppz1YkEZb5qNjpKFWixi4YZD8wHwYDVR0jBBgwFoAUWMAeX5FFpWapesyQoZMi0CrFxfowCgYIKoZI"
    "zj0EAwMDZwAwZAIwPCsQK4DYiZYDPIaDi5HFKnfxXx6ASSVmERfsynYBiX2X6SJRnZU84/9DZdnFvvxmAjBOt6QpBlc4J/0D"
    "xvkTCqpclvziL6BCCPnjdlIB3Pu3BxsPmygUY7Ii2zbdCdliiow="
)
# Fulcio root "sigstore" (only used by tests to check the intermediate).
FULCIO_ROOT_B64 = (
    "MIIB9zCCAXygAwIBAgIUALZNAPFdxHPwjeDloDwyYChAO/4wCgYIKoZIzj0EAwMwKjEVMBMGA1UEChMMc2lnc3RvcmUuZGV2"
    "MREwDwYDVQQDEwhzaWdzdG9yZTAeFw0yMTEwMDcxMzU2NTlaFw0zMTEwMDUxMzU2NThaMCoxFTATBgNVBAoTDHNpZ3N0b3Jl"
    "LmRldjERMA8GA1UEAxMIc2lnc3RvcmUwdjAQBgcqhkjOPQIBBgUrgQQAIgNiAAT7XeFT4rb3PQGwS4IajtLk3/OlnpgangaB"
    "clYpsYBr5i+4ynB07ceb3LP0OIOZdxexX69c5iVuyJRQ+Hz05yi+UF3uBWAlHpiS5sh0+H2GHE7SXrk1EC5m1Tr19L9gg92j"
    "YzBhMA4GA1UdDwEB/wQEAwIBBjAPBgNVHRMBAf8EBTADAQH/MB0GA1UdDgQWBBRYwB5fkUWlZql6zJChkyLQKsXF+jAfBgNV"
    "HSMEGDAWgBRYwB5fkUWlZql6zJChkyLQKsXF+jAKBggqhkjOPQQDAwNpADBmAjEAj1nHeXZp+13NWBNa+EDsDP8G1WWg1tCM"
    "WP/WHPqpaVo0jhsweNFZgSs0eE7wYI4qAjEA2WB9ot98sIkoF3vZYdd3/VtWB5b9TNMea7Ix/stJ5TfcLLeABLE4BNJOsQ4v"
    "nBHJ"
)
# Rekor v1 (rekor.sigstore.dev) log key, ECDSA P-256. Log ID = SHA-256 of this DER.
REKOR_KEY_B64 = (
    "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE2G2Y+2tabdTV5BcGiBIx0a9fAFwrkBbmLSGtks4L3qX6yYY0zufBnhC8Ur/i"
    "y55GhWP/9A/bY2LhC30M9+RYtw=="
)
REKOR_ORIGIN_PREFIX = "rekor.sigstore.dev - "

OID_EC_PUBLIC_KEY = "1.2.840.10045.2.1"
OID_P256 = "1.2.840.10045.3.1.7"
OID_P384 = "1.3.132.0.34"
OID_ECDSA_SHA256 = "1.2.840.10045.4.3.2"
OID_ECDSA_SHA384 = "1.2.840.10045.4.3.3"
OID_SAN = "2.5.29.17"
OID_FULCIO_ISSUER_V1 = "1.3.6.1.4.1.57264.1.1"
OID_FULCIO_ISSUER_V2 = "1.3.6.1.4.1.57264.1.8"
OID_FULCIO_SOURCE_REPO = "1.3.6.1.4.1.57264.1.12"


class AttestationError(ValueError):
    pass


def _fail(message):
    raise AttestationError(message)


# ---------------------------------------------------------------- DER

def _tlv(data, pos):
    """Return (tag, value_start, value_end) for the DER element at pos."""
    tag = data[pos]
    length = data[pos + 1]
    pos += 2
    if length & 0x80:
        count = length & 0x7F
        if count == 0 or count > 4:
            _fail("unsupported DER length")
        length = int.from_bytes(data[pos:pos + count], "big")
        pos += count
    end = pos + length
    if end > len(data):
        _fail("truncated DER")
    return tag, pos, end


def _children(data, start, end):
    out = []
    pos = start
    while pos < end:
        tag, vstart, vend = _tlv(data, pos)
        out.append((tag, vstart, vend, pos))
        pos = vend
    return out


def _oid(raw):
    first = raw[0]
    parts = [first // 40, first % 40]
    value = 0
    for byte in raw[1:]:
        value = (value << 7) | (byte & 0x7F)
        if not byte & 0x80:
            parts.append(value)
            value = 0
    return ".".join(str(p) for p in parts)


def _time(data, tag, start, end):
    text = data[start:end].decode("ascii")
    if tag == 0x17:  # UTCTime YYMMDDHHMMSSZ
        year = int(text[0:2])
        year += 2000 if year < 50 else 1900
        text = f"{year:04d}{text[2:]}"
    # GeneralizedTime YYYYMMDDHHMMSSZ
    import calendar
    return calendar.timegm((int(text[0:4]), int(text[4:6]), int(text[6:8]),
                            int(text[8:10]), int(text[10:12]), int(text[12:14]), 0, 0, 0))


def parse_spki(data, start=0, end=None):
    """SubjectPublicKeyInfo -> (curve_oid, (x, y))."""
    if end is None:
        _, start, end = _tlv(data, 0)
    alg, bits = _children(data, start, end)[:2]
    alg_items = _children(data, alg[1], alg[2])
    if _oid(data[alg_items[0][1]:alg_items[0][2]]) != OID_EC_PUBLIC_KEY:
        _fail("public key is not an EC key")
    curve = _oid(data[alg_items[1][1]:alg_items[1][2]])
    point = data[bits[1] + 1:bits[2]]  # skip the unused-bits byte
    if point[0] != 4:
        _fail("compressed EC points are not supported")
    size = (len(point) - 1) // 2
    return curve, (int.from_bytes(point[1:1 + size], "big"), int.from_bytes(point[1 + size:], "big"))


def parse_certificate(der):
    _, start, end = _tlv(der, 0)
    tbs, sig_alg, sig_bits = _children(der, start, end)[:3]
    cert = {
        "tbs": der[tbs[3]:tbs[2]],
        "sig_alg": _oid(der[_children(der, sig_alg[1], sig_alg[2])[0][1]:_children(der, sig_alg[1], sig_alg[2])[0][2]]),
        "signature": der[sig_bits[1] + 1:sig_bits[2]],
        "extensions": {},
        "san_uris": [],
    }
    fields = _children(der, tbs[1], tbs[2])
    index = 1 if fields[0][0] == 0xA0 else 0  # optional [0] version
    validity = fields[index + 3]
    not_before, not_after = _children(der, validity[1], validity[2])[:2]
    cert["not_before"] = _time(der, not_before[0], not_before[1], not_before[2])
    cert["not_after"] = _time(der, not_after[0], not_after[1], not_after[2])
    spki = fields[index + 5]
    cert["curve"], cert["public_key"] = parse_spki(der, spki[1], spki[2])
    for field in fields[index + 6:]:
        if field[0] != 0xA3:
            continue
        seq = _children(der, field[1], field[2])[0]
        for ext in _children(der, seq[1], seq[2]):
            items = _children(der, ext[1], ext[2])
            oid = _oid(der[items[0][1]:items[0][2]])
            value = items[-1]
            cert["extensions"][oid] = der[value[1]:value[2]]
    san = cert["extensions"].get(OID_SAN)
    if san:
        _, s, e = _tlv(san, 0)
        for tag, vs, ve, _pos in _children(san, s, e):
            if tag == 0x86:  # uniformResourceIdentifier
                cert["san_uris"].append(san[vs:ve].decode("utf-8"))
    return cert


def _ext_text(cert, oid):
    raw = cert["extensions"].get(oid)
    if raw is None:
        return None
    if oid == OID_FULCIO_ISSUER_V1:
        return raw.decode("utf-8")  # legacy: raw string bytes
    _, s, e = _tlv(raw, 0)  # newer: DER UTF8String
    return raw[s:e].decode("utf-8")


# ---------------------------------------------------------------- ECDSA

CURVES = {
    OID_P256: {
        "p": 0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF,
        "a": -3,
        "n": 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551,
        "gx": 0x6B17D1F2E12C4247F8BCE6E563A440F277037D812DEB33A0F4A13945D898C296,
        "gy": 0x4FE342E2FE1A7F9B8EE7EB4A7C0F9E162BCE33576B315ECECBB6406837BF51F5,
        "b": 0x5AC635D8AA3A93E7B3EBBD55769886BC651D06B0CC53B0F63BCE3C3E27D2604B,
    },
    OID_P384: {
        "p": int("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFE"
                 "FFFFFFFF0000000000000000FFFFFFFF", 16),
        "a": -3,
        "n": int("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFC7634D81F4372DDF"
                 "581A0DB248B0A77AECEC196ACCC52973", 16),
        "gx": int("AA87CA22BE8B05378EB1C71EF320AD746E1D3B628BA79B9859F741E082542A38"
                  "5502F25DBF55296C3A545E3872760AB7", 16),
        "gy": int("3617DE4A96262C6F5D9E98BF9292DC29F8F41DBD289A147CE9DA3113B5F0B8C0"
                  "0A60B1CE1D7E819D7A431D7C90EA0E5F", 16),
        "b": int("B3312FA7E23EE7E4988E056BE3F82D19181D9C6EFE8141120314088F5013875A"
                 "C656398D8A2ED19D2A85C8EDD3EC2AEF", 16),
    },
}


def _jacobian_double(point, curve):
    x, y, z = point
    p = curve["p"]
    if y == 0 or z == 0:
        return (0, 0, 0)
    yy = y * y % p
    s = 4 * x * yy % p
    zz = z * z % p
    m = (3 * x * x + curve["a"] * zz * zz) % p
    nx = (m * m - 2 * s) % p
    ny = (m * (s - nx) - 8 * yy * yy) % p
    nz = 2 * y * z % p
    return (nx, ny, nz)


def _jacobian_add(p1, p2, curve):
    if p1[2] == 0:
        return p2
    if p2[2] == 0:
        return p1
    p = curve["p"]
    x1, y1, z1 = p1
    x2, y2, z2 = p2
    z1z1 = z1 * z1 % p
    z2z2 = z2 * z2 % p
    u1 = x1 * z2z2 % p
    u2 = x2 * z1z1 % p
    s1 = y1 * z2 * z2z2 % p
    s2 = y2 * z1 * z1z1 % p
    if u1 == u2:
        if s1 != s2:
            return (0, 0, 0)
        return _jacobian_double(p1, curve)
    h = (u2 - u1) % p
    r = (s2 - s1) % p
    hh = h * h % p
    hhh = h * hh % p
    v = u1 * hh % p
    nx = (r * r - hhh - 2 * v) % p
    ny = (r * (v - nx) - s1 * hhh) % p
    nz = h * z1 * z2 % p
    return (nx, ny, nz)


def _multiply(point, k, curve):
    result = (0, 0, 0)
    addend = point
    while k:
        if k & 1:
            result = _jacobian_add(result, addend, curve)
        addend = _jacobian_double(addend, curve)
        k >>= 1
    return result


def _affine_x(point, curve):
    x, _y, z = point
    if z == 0:
        return None
    p = curve["p"]
    zinv = pow(z, p - 2, p)
    return x * zinv * zinv % p


def _on_curve(curve, x, y):
    p = curve["p"]
    return (y * y - (x * x * x + curve["a"] * x + curve["b"])) % p == 0


def _der_signature(sig):
    _, s, e = _tlv(sig, 0)
    r_item, s_item = _children(sig, s, e)[:2]
    return int.from_bytes(sig[r_item[1]:r_item[2]], "big"), int.from_bytes(sig[s_item[1]:s_item[2]], "big")


def ecdsa_verify(curve_oid, public_key, digest, der_sig):
    curve = CURVES.get(curve_oid)
    if curve is None:
        _fail(f"unsupported curve {curve_oid}")
    qx, qy = public_key
    if not _on_curve(curve, qx, qy):
        _fail("public key is not on the curve")
    r, s = _der_signature(der_sig)
    n = curve["n"]
    if not (1 <= r < n and 1 <= s < n):
        return False
    bits = n.bit_length()
    e = int.from_bytes(digest, "big")
    if len(digest) * 8 > bits:
        e >>= len(digest) * 8 - bits
    w = pow(s, n - 2, n)
    u1 = e * w % n
    u2 = r * w % n
    point = _jacobian_add(_multiply((curve["gx"], curve["gy"], 1), u1, curve),
                          _multiply((qx, qy, 1), u2, curve), curve)
    x = _affine_x(point, curve)
    return x is not None and x % n == r


def verify_cert_signature(cert, issuer):
    hash_fn = {OID_ECDSA_SHA256: hashlib.sha256, OID_ECDSA_SHA384: hashlib.sha384}.get(cert["sig_alg"])
    if hash_fn is None:
        _fail(f"unsupported certificate signature algorithm {cert['sig_alg']}")
    return ecdsa_verify(issuer["curve"], issuer["public_key"], hash_fn(cert["tbs"]).digest(), cert["signature"])


# ---------------------------------------------------------------- Rekor

def _merkle_root(leaf_hash, index, tree_size, proof):
    """RFC 6962 / 9162 inclusion proof verification. Returns the computed root."""
    if index >= tree_size:
        _fail("inclusion proof index outside the tree")
    fn, sn = index, tree_size - 1
    node = leaf_hash
    for sibling in proof:
        if sn == 0:
            _fail("inclusion proof too long")
        if fn & 1 or fn == sn:
            node = hashlib.sha256(b"\x01" + sibling + node).digest()
            if not fn & 1:
                while fn and not fn & 1:
                    fn >>= 1
                    sn >>= 1
        else:
            node = hashlib.sha256(b"\x01" + node + sibling).digest()
        fn >>= 1
        sn >>= 1
    if sn != 0:
        _fail("inclusion proof too short")
    return node


def _verify_checkpoint(envelope, root_hash, tree_size, rekor_key):
    body, _, signatures = envelope.partition("\n\n")
    lines = body.split("\n")
    if len(lines) < 3 or not lines[0].startswith(REKOR_ORIGIN_PREFIX):
        _fail("checkpoint origin is not rekor.sigstore.dev")
    if int(lines[1]) != tree_size or base64.b64decode(lines[2]) != root_hash:
        _fail("checkpoint does not match the inclusion proof")
    signed = (body + "\n").encode("utf-8")
    for line in signatures.strip().split("\n"):
        if not line.startswith("— rekor.sigstore.dev "):
            continue
        blob = base64.b64decode(line.split(" ")[-1])
        if ecdsa_verify(rekor_key[0], rekor_key[1], hashlib.sha256(signed).digest(), blob[4:]):
            return
    _fail("checkpoint signature does not verify with the Rekor key")


def verify_tlog_entry(entry, leaf_cert, signature_b64, statement_bytes):
    rekor_der = base64.b64decode(REKOR_KEY_B64)
    rekor_key = parse_spki(rekor_der)
    log_id = base64.b64decode(entry["logId"]["keyId"])
    if log_id != hashlib.sha256(rekor_der).digest():
        _fail("transparency entry is not from the pinned Rekor log")
    if entry.get("kindVersion", {}).get("kind") != "dsse":
        _fail("transparency entry is not a DSSE entry")
    body_bytes = base64.b64decode(entry["canonicalizedBody"])
    body = json.loads(body_bytes)
    spec = body.get("spec") or {}
    if (spec.get("payloadHash") or {}).get("value") != hashlib.sha256(statement_bytes).hexdigest():
        _fail("transparency entry payload hash does not match the statement")
    sigs = spec.get("signatures") or []
    if len(sigs) != 1 or sigs[0].get("signature") != signature_b64:
        _fail("transparency entry does not record this signature")
    verifier_pem = base64.b64decode(sigs[0].get("verifier", "")).decode("ascii", "replace")
    pem_b64 = "".join(l for l in verifier_pem.splitlines() if l and not l.startswith("-----"))
    if base64.b64decode(pem_b64) != leaf_cert["der"]:
        _fail("transparency entry names a different signing certificate")

    integrated = int(entry["integratedTime"])
    if not leaf_cert["not_before"] <= integrated <= leaf_cert["not_after"]:
        _fail("entry was logged outside the certificate's validity window")

    # Signed entry timestamp (Rekor's promise to include this entry).
    set_sig = base64.b64decode((entry.get("inclusionPromise") or {}).get("signedEntryTimestamp", ""))
    payload = json.dumps({
        "body": entry["canonicalizedBody"],
        "integratedTime": integrated,
        "logID": log_id.hex(),
        "logIndex": int(entry["logIndex"]),
    }, sort_keys=True, separators=(",", ":")).encode("utf-8")
    if not set_sig or not ecdsa_verify(rekor_key[0], rekor_key[1], hashlib.sha256(payload).digest(), set_sig):
        _fail("signed entry timestamp does not verify with the Rekor key")

    # Inclusion proof and signed checkpoint.
    proof = entry.get("inclusionProof")
    if not proof:
        _fail("transparency entry has no inclusion proof")
    root = base64.b64decode(proof["rootHash"])
    computed = _merkle_root(hashlib.sha256(b"\x00" + body_bytes).digest(), int(proof["logIndex"]),
                            int(proof["treeSize"]), [base64.b64decode(h) for h in proof["hashes"]])
    if computed != root:
        _fail("inclusion proof does not lead to the logged root hash")
    _verify_checkpoint(proof["checkpoint"]["envelope"], root, int(proof["treeSize"]), rekor_key)
    return integrated


# ---------------------------------------------------------------- top level

def _pae(payload_type, payload):
    t = payload_type.encode("utf-8")
    return b"DSSEv1 %d %s %d %s" % (len(t), t, len(payload), payload)


def verify_provenance(provenance, filename, sha256):
    """Raise AttestationError unless provenance proves yt-dlp's release workflow built this file.

    Returns a summary dict for logs.
    """
    if not isinstance(provenance, dict) or provenance.get("version") != 1:
        _fail("provenance is missing or has an unknown version")
    intermediate = parse_certificate(base64.b64decode(FULCIO_INTERMEDIATE_B64))
    errors = []
    for bundle in provenance.get("attestation_bundles") or []:
        publisher = bundle.get("publisher") or {}
        if any(publisher.get(k) != v for k, v in EXPECTED_PUBLISHER.items()):
            errors.append(f"publisher {publisher} is not {EXPECTED_PUBLISHER}")
            continue
        for attestation in bundle.get("attestations") or []:
            try:
                return _verify_attestation(attestation, intermediate, filename, sha256, publisher)
            except (AttestationError, KeyError, ValueError, TypeError, IndexError) as err:
                errors.append(f"{type(err).__name__}: {err}")
    _fail("no valid attestation: " + ("; ".join(errors)[:600] or "no attestation bundles"))


def _verify_attestation(attestation, intermediate, filename, sha256, publisher):
    if attestation.get("version") != 1:
        _fail("unknown attestation version")
    envelope = attestation["envelope"]
    statement_bytes = base64.b64decode(envelope["statement"])
    statement = json.loads(statement_bytes)
    if statement.get("_type") != STATEMENT_TYPE or statement.get("predicateType") != PREDICATE_TYPE:
        _fail("statement is not a PyPI publish attestation")
    subjects = statement.get("subject") or []
    if len(subjects) != 1 or subjects[0].get("name") != filename \
            or (subjects[0].get("digest") or {}).get("sha256") != sha256:
        _fail(f"statement subject does not match {filename} {sha256}")

    material = attestation["verification_material"]
    der = base64.b64decode(material["certificate"])
    leaf = parse_certificate(der)
    leaf["der"] = der
    if not verify_cert_signature(leaf, intermediate):
        _fail("signing certificate was not issued by the pinned Fulcio intermediate")
    if not any(uri.startswith(WORKFLOW_URI_PREFIX) for uri in leaf["san_uris"]):
        _fail(f"signing identity {leaf['san_uris']} is not the yt-dlp release workflow")
    issuer = _ext_text(leaf, OID_FULCIO_ISSUER_V2) or _ext_text(leaf, OID_FULCIO_ISSUER_V1)
    if issuer != OIDC_ISSUER:
        _fail(f"certificate OIDC issuer {issuer!r} is not GitHub Actions")

    signature_b64 = envelope["signature"]
    if not ecdsa_verify(leaf["curve"], leaf["public_key"],
                        hashlib.sha256(_pae(PAYLOAD_TYPE, statement_bytes)).digest(),
                        base64.b64decode(signature_b64)):
        _fail("DSSE signature does not verify with the signing certificate")

    entries = material.get("transparency_entries") or []
    if not entries:
        _fail("no transparency log entry")
    integrated = verify_tlog_entry(entries[0], leaf, signature_b64, statement_bytes)
    return {
        "publisher": publisher,
        "identity": leaf["san_uris"][0],
        "source_repository": _ext_text(leaf, OID_FULCIO_SOURCE_REPO),
        "logged_at": integrated,
        "log_index": int(entries[0]["logIndex"]),
    }
