// if not over HTTPS, probably means we're in debug mode
const sort = (obj, key, order = 1) =>
Object.fromEntries(
    Object.entries(obj)
    .sort((a, b) => order * (key ? a[1][key] - b[1][key] : a[1] - b[1]))
)

const simplify = query => query.replace(/[\s-_]/g, "").toLowerCase()

async function decrypt(buffer, password) {
    const crypto_initial = new Uint8Array([
        55, 44, 146, 89,
        30, 93, 68, 30,
        209, 23, 56, 140,
        88, 149, 55, 221
    ])

    const crypto_key = await crypto.subtle.importKey("jwk", {
        "alg": "A256CBC",
        "ext": true,
        "k": password,
        "key_ops": ["encrypt", "decrypt"],
        "kty": "oct"
    }, { "name": "AES-CBC" }, false, ["encrypt", "decrypt"])

    return crypto.subtle.decrypt({
        'name': 'AES-CBC',
        'iv': crypto_initial
    }, crypto_key, buffer)
}
