const { subtle } = require("crypto").webcrypto
const fs = require("fs")

(async function() {

    const initial = Uint8Array.from([
        55, 44, 146, 89,
        30, 93, 68, 30,
        209, 23, 56, 140,
        88, 149, 55, 221
    ])

    const key = await crypto.subtle.importKey("jwk", {
            "alg": "A256CBC",
            "ext": true,
            "k": process.env.KEY,
            "key_ops": ["encrypt", "decrypt"],
            "kty": "oct"
        }, {
            "name": "AES-CBC"
        },
        false,
        ["encrypt", "decrypt"]
    )

    const data = await fs.open("maps/texture.png")

    const encrypted = subtle.encrypt({
        'name': 'AES-CBC',
        'iv': initial
    }, key, data)

    const blob = new Blob([encrypted], {
        type: "application/octet-stream"
    })

    fs.createWriteStream("src/map.blob").write(blob)

})()
