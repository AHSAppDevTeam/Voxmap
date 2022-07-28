const debug = document.getElementById("debug")
const canvas = document.getElementById("canvas")
const joystick = document.getElementById("joystick")
const form = document.getElementById("form")
const gl = canvas.getContext("webgl2", { alpha: false, antialias: true } )

const x = 0
const y = 1
const z = 2

const Z = 32 // height
const Y = 256 // N-S length
const X = 1024 // E-W width
const C = 4 // 4 channels

let size = []

let quality = get_param("quality") || "3"

const encrypted = url.protocol === "https:"

// Shaders
const S = {
    "render.h": 0,
    "render.vert": 0,
    "render.frag": 0,
    "composit.h": 0,
    "composit.vert": 0,
    "composit.frag": 0,
}
// Programs
const P = {}
// Shader uniforms
const U = {}
// Vertex attributes
const A = {}
// Textures
const T = {}
// Objects
const O = {}
// Buffers
const B = {}

const H_ground = 5.0
const H_human = 1.6

const N_int8 = 1
const N_int16 = 2
const N_stride = 6 * N_int16 + 4 * N_int8
const N_time_samples = 120
const times = Array(N_time_samples).fill(0)

let frame = 0

const start_time = Date.now() - new Date().getTimezoneOffset() * 60 * 1000

const weather = get_json_param("weather") || {
    sun: [0.0, 0.0, 1.0]
}
const cam = get_json_param(".cam") || {
    pos: [381.5, 128.1, H_ground + H_human],
    vel: [0, 0, 0],
    acc: [0, 0, 0],
    rot: [0, 0, 0],
}

const controls = {
    move: [0, 0, 0],
    rot: [0.01, 0, -0.2],
    size: 100,
}

const fetch_array = (regular_url, encrypted_url) => 
    fetch(encrypted ? encrypted_url : regular_url)
    .then(response => response.arrayBuffer())
    .then(buffer => encrypted ? decrypt(buffer) : buffer)
    .then(buffer => new Uint8Array(buffer))
    .then(array => pako.ungzip(array))

const map_array = fetch_array("out/texture.bin.gz", "src/map.blob")
const vertex_array = fetch_array("out/vertex.bin.gz", "src/vertex.blob")
const noise_array = fetch_array("out/noise.bin.gz", "src/noise.blob")
const composit_array = new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
    -1,  1,
     1, -1,
     1,  1,
])

const clamp_xyzc = (xyzc) => [X,Y,Z,C].map((max, i) => clamps(xyzc[i], 0, max - 1))
const project_xyzc = ([_x, _y, _z, _c]) => C*(X*(Y*(_z)+_y)+_x)+_c
const tex = (xyz) => Promise.all(
    [0,1,2].map( _c => map_array.then(map => map[project_xyzc(clamp_xyzc([...xyz, _c]))]))
)

main()

function updateColorTexture(texture){
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 
                  ...size, 0,
                  gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
}
function updateDepthTexture(texture){
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24,
                  ...size, 0,
                  gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
}

async function main() {
    resize()

    await Promise.all(Object.keys(S).map(file => 
        fetch("src/shaders/" + file)
        .then(res => res.text())
        .then(text => S[file] = text)
    ))

    S["render.h"] = S["render.h"]
        .replace(
            "#define QUALITY 3", 
            "#define QUALITY " + quality
        )

    // setup GLSL program
    P.renderer = createProgramFromSources(gl, [
        S["render.vert"], 
        S["render.frag"]
    ].map(s => S["render.h"]+s))

    P.compositor = createProgramFromSources(gl, [
        S["composit.vert"], 
        S["composit.frag"]
    ].map(s => S["composit.h"]+s))

    gl.useProgram(P.renderer)

    A.cellPos = gl.getAttribLocation(P.renderer, "a_cellPos")
    A.fractPos = gl.getAttribLocation(P.renderer, "a_fractPos")
    A.color = gl.getAttribLocation(P.renderer, "a_color")
    A.normal = gl.getAttribLocation(P.renderer, "a_normal")
    A.id = gl.getAttribLocation(P.renderer, "a_id")

    U.matrix = gl.getUniformLocation(P.renderer, "u_matrix")
    U.cellPos = gl.getUniformLocation(P.renderer, "u_cellPos")
    U.fractPos = gl.getUniformLocation(P.renderer, "u_fractPos")
    U.frame = gl.getUniformLocation(P.renderer, "u_frame")
    U.time = gl.getUniformLocation(P.renderer, "u_time")
    U.sunDir = gl.getUniformLocation(P.renderer, "u_sunDir")

    U.map = gl.getUniformLocation(P.renderer, "u_map")
    U.noise = gl.getUniformLocation(P.renderer, "u_noise")

    T.diffuse = gl.createTexture()
    updateColorTexture(T.diffuse)
    
    T.reflection = gl.createTexture()
    updateColorTexture(T.reflection)

    T.depth = gl.createTexture()
    updateDepthTexture(T.depth)

    // Create separate render buffer for storing diffuse
    // and reflection passes before merging them together
    B.render = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, B.render)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                            gl.TEXTURE_2D, T.diffuse, 0)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1,
                            gl.TEXTURE_2D, T.reflection, 0)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT,
                            gl.TEXTURE_2D, T.depth, 0)
    console.log(gl.checkFramebufferStatus(gl.FRAMEBUFFER), gl.FRAMEBUFFER_COMPLETE)

    
    T.map = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_3D, T.map)
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA,
        X, Y, Z, 0,
        gl.RGBA, gl.UNSIGNED_BYTE, await map_array)
    gl.generateMipmap(gl.TEXTURE_3D)
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_3D, T.map)
    gl.uniform1i(U.map, 0)

    T.noise = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, T.noise)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
        X, X, 0,
        gl.RGBA, gl.UNSIGNED_BYTE, await noise_array)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, T.noise)
    gl.uniform1i(U.noise, 1)

    O.vertex_array = gl.createVertexArray()
    gl.bindVertexArray(O.vertex_array)

    B.cellPos = gl.createBuffer()
    gl.enableVertexAttribArray(A.cellPos)
    gl.bindBuffer(gl.ARRAY_BUFFER, B.cellPos)
    gl.bufferData(gl.ARRAY_BUFFER, await vertex_array, gl.STATIC_DRAW)
    gl.vertexAttribIPointer(
        A.cellPos, 3, gl.SHORT,
        N_stride, 0
    )

    B.fractPos = gl.createBuffer()
    gl.enableVertexAttribArray(A.fractPos)
    gl.bindBuffer(gl.ARRAY_BUFFER, B.fractPos)
    gl.bufferData(gl.ARRAY_BUFFER, await vertex_array, gl.STATIC_DRAW)
    gl.vertexAttribIPointer(
        A.fractPos, 3, gl.SHORT,
        N_stride, 3 * N_int16
    )

    B.color = gl.createBuffer()
    gl.enableVertexAttribArray(A.color)
    gl.bindBuffer(gl.ARRAY_BUFFER, B.color)
    gl.bufferData(gl.ARRAY_BUFFER, await vertex_array, gl.STATIC_DRAW)
    gl.vertexAttribIPointer(
        A.color, 1, gl.BYTE,
        N_stride, 6 * N_int16
    )

    B.normal = gl.createBuffer()
    gl.enableVertexAttribArray(A.normal)
    gl.bindBuffer(gl.ARRAY_BUFFER, B.normal)
    gl.bufferData(gl.ARRAY_BUFFER, await vertex_array, gl.STATIC_DRAW)
    gl.vertexAttribIPointer(
        A.normal, 1, gl.BYTE,
        N_stride, 6 * N_int16 + 1 * N_int8
    )

    B.id = gl.createBuffer()
    gl.enableVertexAttribArray(A.id)
    gl.bindBuffer(gl.ARRAY_BUFFER, B.id)
    gl.bufferData(gl.ARRAY_BUFFER, await vertex_array, gl.STATIC_DRAW)
    gl.vertexAttribIPointer(
        A.id, 1, gl.BYTE,
        N_stride, 6 * N_int16 + 2 * N_int8
    )

    gl.enable(gl.DEPTH_TEST)
    gl.enable(gl.CULL_FACE)
    gl.cullFace(gl.BACK)
    
    //////////////////////

    gl.useProgram(P.compositor)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)

    A.texCoord = gl.getAttribLocation(P.compositor, "a_texCoord")
    U.diffuse = gl.getUniformLocation(P.compositor, "u_diffuse")
    U.reflection = gl.getUniformLocation(P.compositor, "u_reflection")

    O.composit_array = gl.createVertexArray()
    gl.bindVertexArray(O.composit_array)

    B.texCoord = gl.createBuffer()
    gl.enableVertexAttribArray(A.texCoord)
    gl.bindBuffer(gl.ARRAY_BUFFER, B.texCoord)
    gl.bufferData(gl.ARRAY_BUFFER, composit_array, gl.STATIC_DRAW)
    gl.vertexAttribPointer(A.texCoord, 2, gl.FLOAT, false, 0, 0)

    requestAnimationFrame(render)
    add_listeners()
}

async function decrypt(buffer) {
    const crypto_initial = new Uint8Array([
        55, 44, 146, 89,
        30, 93, 68, 30,
        209, 23, 56, 140,
        88, 149, 55, 221
    ])

    const crypto_key = await crypto.subtle.importKey("jwk", {
            "alg": "A256CBC",
            "ext": true,
            "k": url.searchParams.get("password") || prompt("password"),
            "key_ops": ["encrypt", "decrypt"],
            "kty": "oct"
        }, {
            "name": "AES-CBC"
        },
        false,
        ["encrypt", "decrypt"]
    )

    return crypto.subtle.decrypt({
            'name': 'AES-CBC',
            'iv': crypto_initial
        }, crypto_key, buffer)
}

async function add_listeners() {
    canvas.addEventListener('click', (event) => {
        event.preventDefault()
        canvas.requestPointerLock()
    })
    cam.rot = cam.rot.map(a => a % (2 * Math.PI))
    canvas.addEventListener('pointermove', (event) => {
        controls.rot[z] -= 2 * event.movementX / controls.size
        controls.rot[x] -= event.movementY / controls.size
        controls.rot[x] = clamp(controls.rot[x], Math.PI/2)
    })
    joystick.addEventListener('touchstart', () => {
        controls.active = true
    })
    joystick.addEventListener('pointermove', (event) => {
        if (controls.active) {
            controls.move[x] = +2*clamp(event.offsetX / controls.size - 1, 1)
            controls.move[y] = -2*clamp(event.offsetY / controls.size - 1, 1)
        }
    })
    joystick.addEventListener('touchend', (event) => {
        controls.active = false
        controls.move[x] = 0
        controls.move[y] = 0
    })
    window.addEventListener('keydown', (event) => {
        const power = event.shiftKey ? 1.2 : 0.8
        switch (event.code) {
            case "KeyW":
            case "ArrowUp":
                controls.move[y] = power
                break;
            case "KeyS":
            case "ArrowDown":
                controls.move[y] = -power
                break;
            case "KeyA":
            case "ArrowLeft":
                controls.move[x] = -power
                break;
            case "KeyD":
            case "ArrowRight":
                controls.move[x] = power
                break;
            case "Space":
                controls.move[z] = power
                break;
        }
    })
    window.addEventListener('keyup', (event) => {
        switch (event.code) {
            case "KeyW":
            case "KeyS":
            case "ArrowUp":
            case "ArrowDown":
                controls.move[y] = 0
                break;
            case "KeyA":
            case "KeyD":
            case "ArrowLeft":
            case "ArrowRight":
                controls.move[x] = 0
                break;
            case "Space":
                controls.move[z] = 0
                break;
        }
    })
    window.addEventListener('resize', resize)
    window.addEventListener('resize', updateTextures)
}

const floor = x => Math.floor(x)
const fract = x => x - floor(x)
const pow = (x, p) => Math.sign(x) * Math.pow(Math.abs(x), p)
const clamps = (x, a, b) => Math.min(Math.max(x, a), b)
const clamp = (x, a) => clamps(x, -a, a)

async function render(now) {
    times.pop()
    times.unshift((start_time + now) / 1000)

    update_state(times[0], times[0] - times[1])

    ////////

    gl.bindFramebuffer(gl.FRAMEBUFFER, B.render)
    gl.viewport(0, 0, ...size)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.useProgram(P.renderer)
    gl.bindVertexArray(O.vertex_array)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_3D, T.map)

    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, T.noise)

    const distance = ((x, y) => Math.sqrt(x*x + y*y))(...size)
    const matrix = m4.multiply(
        m4.projection(...size, distance),
        m4.xRotation(-Math.PI/2),
        m4.xRotation(-cam.rot[x]),
        m4.zRotation(-cam.rot[z]),
        m4.translation(...cam.pos.map(a=>-a/2))
    )

    // Set the matrix.
    gl.uniformMatrix4fv(U.matrix, false, matrix)

    gl.uniform3i(U.cellPos, ...cam.pos.map(floor))
    gl.uniform3f(U.fractPos, ...cam.pos.map(fract))
    gl.uniform3f(U.sunDir, ...weather.sun)
    gl.uniform1i(U.frame, frame)
    gl.uniform1f(U.time, times[0] % 1e3)

    gl.uniform1i(U.map, 0)

    gl.drawBuffers([
       gl.COLOR_ATTACHMENT0,
       gl.COLOR_ATTACHMENT1,
    ])
    gl.drawArrays(gl.TRIANGLES, 0, (await vertex_array).length / N_stride)
    
    ////////////////

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, ...size)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.useProgram(P.compositor)
    gl.bindVertexArray(O.composit_array)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, T.diffuse)

    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, T.reflection)

    gl.uniform1i(U.diffuse, 0)
    gl.uniform1i(U.reflection, 1)

    gl.drawArrays(gl.TRIANGLES, 0, 6)

    //////////////

    requestAnimationFrame(render)
}

async function update_state(time, delta) {

    frame++
    let sin = Math.sin(cam.rot[z])
    let cos = Math.cos(cam.rot[z])

    let f = controls.move.map(f => f * 100)

    cam.acc = [
        f[x] * cos - f[y] * sin,
        f[x] * sin + f[y] * cos,
        f[z],
    ]

    const feet_pos = [...cam.pos]
    feet_pos[z] -= H_human
    let [above, below, color] = await tex(feet_pos.map(floor))
    if(below < 1) cam.acc[z] += 20
    if(below > 1) cam.acc[z] -= 20

    let drag = 1 / 8

    cam.acc = cam.acc.map((a, i) => a - cam.vel[i] * drag / delta)
    cam.vel = cam.vel.map((v, i) => v + cam.acc[i] * delta)
    cam.pos = cam.pos.map((p, i) => p + cam.vel[i] * delta)

    cam.rot = cam.rot.map( 
        (a, i) => cam.rot[i] + 
        clamp( pow(controls.rot[i] - cam.rot[i], 1.5), 10*delta)
    )
    cam.rot = controls.rot

    let hour = time / 60 / 60 / 12 * Math.PI
    weather.sun[x] = Math.sin(hour) * Math.sqrt(3 / 4)
    weather.sun[y] = Math.sin(hour) * Math.sqrt(1 / 4)
    weather.sun[z] = Math.abs(Math.cos(hour))

    joystick.firstElementChild.style.transform =
        `translate(${controls.move[x]*15}%, ${-controls.move[y]*15}%)`

    const num = x => x.toFixed(1)

    const fps = 1 / delta
    const avg_fps = (N_time_samples - 1) / (time - times[N_time_samples - 1])
    if (!get_param("clean")) debug.innerText = 
        `${size.map(num).join(" x ")} @ ${num(fps)} ~ ${num(avg_fps)} fps
        position: ${cam.pos.map(num).join(", ")}
        velocity: ${cam.vel.map(num).join(", ")}
        quality: ${quality} / 4
        `

    if (frame % 60 == 0) {
        url.searchParams.set("cam", encodeURIComponent(JSON.stringify(cam)))
        window.history.replaceState(null, "", url.toString())
    }
}

async function resize() {
    size[0] = window.innerWidth * window.devicePixelRatio
    size[1] = window.innerHeight * window.devicePixelRatio
    canvas.width = size[0]
    canvas.height = size[1]
}
async function updateTextures() {
    updateColorTexture(T.diffuse)
    updateColorTexture(T.reflection)
    updateDepthTexture(T.depth)
}
