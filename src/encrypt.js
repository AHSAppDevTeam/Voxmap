const crypto = require("crypto").webcrypto
const fs = require("fs")

let keystring
if("KEY" in process.env) {
    keystring = process.env.KEY
} else {
    console.log("Missing encryption key. Please set it as your environment variable.")
    process.exit(1)
}

const initial = Uint8Array.from([
    55, 44, 146, 89,
    30, 93, 68, 30,
    209, 23, 56, 140,
    88, 149, 55, 221
])

function encrypt(input, output) {
    Promise.all([
        crypto.subtle.importKey("jwk", {
                "alg": "A256CBC",
                "ext": true,
                "k": keystring,
                "key_ops": ["encrypt", "decrypt"],
                "kty": "oct"
            }, {
                "name": "AES-CBC"
            },
            false,
            ["encrypt", "decrypt"]
        ),
        fs.promises.readFile(input)
    ])
    .then(([key, data]) =>
        crypto.subtle.encrypt({
            'name': 'AES-CBC',
            'iv': initial
        }, key, data)
    )
    .then(buffer => new Uint8Array(buffer))
    .then(array => fs.createWriteStream(output).write(array))
}

encrypt("out/map.bin.gz", "src/map.blob")
encrypt("out/vertex.bin.gz", "src/vertex.blob")
encrypt("out/noise.bin.gz", "src/noise.blob")

