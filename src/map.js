// Link up HTML elements
const debug = document.getElementById("debug")
const canvas = document.getElementById("canvas")
const joystick = document.getElementById("joystick")
const form = document.getElementById("form")
const gl = canvas.getContext("webgl2", { alpha: false, antialias: false } )

//-- Numerical constants

// heights of things
const H_ground = 5.0
const H_human = 1.6

// sizes of basic data, in bytes
const N_int8 = 1
const N_int16 = 2
const N_stride = 6 * N_int16 + 4 * N_int8

// How long to average fps over
const N_time_samples = 120

// This is so I can do vector[x]
const x = 0
const y = 1
const z = 2

// World parameters
const Z = 32 // height
const Y = 256 // N-S length
const X = 1024 // E-W width
const C = 4 // 4 channels (RGBA)

// if not over HTTPS, probably means we're in debug mode
const encrypted = url.protocol === "https:"

//-- Single-letter "folders" for organizing WebGL objects
// Also has some helper functions

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
// Textures: for rendering to and reading data from
const T = {
    colorUpdate: t => {
        gl.bindTexture(gl.TEXTURE_2D, t)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 
                      ...size, 0,
                      gl.RGBA, gl.UNSIGNED_BYTE, null)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    }
}
// Renderbuffers: like textures, but for multisampled rendering
const RB = {
    colorUpdate: rb => {
        gl.bindRenderbuffer(gl.RENDERBUFFER, rb)
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, 
                                          gl.getParameter(gl.MAX_SAMPLES), 
                                          gl.RGBA8, ...size)
    },
    depthUpdate: rb => {
        gl.bindRenderbuffer(gl.RENDERBUFFER, rb)
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, 
                                          gl.getParameter(gl.MAX_SAMPLES), 
                                          gl.DEPTH_COMPONENT24, ...size)
    }
}
// Objects
const O = {}
// Buffers
const B = {}

//-- Dynamic parameters

const start_time = Date.now() - new Date().getTimezoneOffset() * 60 * 1000
const times = Array(N_time_samples).fill(0)
let frame = 0

const size = [100, 100] // size of canvas
let quality = get_param("quality") || "3" // render quality

const weather = get_json_param("weather") || {
    sun: [0.0, 0.0, 1.0]
}
const cam = get_json_param("cam") || {
    pos: [381.5, 128.1, H_ground + H_human],
    vel: [0, 0, 0],
    acc: [0, 0, 0],
    rot: [0, 0, 0],
    matrix: Array(16),
}
window.addEventListener("message", event => {
    const place = event.data
    cam.pos = [ place.x, place.y, place.z + H_human ]
})

const controls = {
    move: [0, 0, 0],
    rot: [0.01, 0, -0.2],
    size: 100,
}

//-- Pregenerated array fetching

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

//-- Helper functions

const floor = x => Math.floor(x)
const fract = x => x - floor(x)
const pow = (x, p) => Math.sign(x) * Math.pow(Math.abs(x), p)
const clamps = (x, a, b) => Math.min(Math.max(x, a), b)
const clamp = (x, a) => clamps(x, -a, a)

const clamp_xyzc = (xyzc) => [X,Y,Z,C].map((max, i) => clamps(xyzc[i], 0, max - 1))
const project_xyzc = ([_x, _y, _z, _c]) => C*(X*(Y*(_z)+_y)+_x)+_c
const tex = (xyz) => Promise.all(
    [0,1,2].map( _c => map_array.then(map => map[project_xyzc(clamp_xyzc([...xyz, _c]))]))
)

// Do the thing
main()

// (the thing:)
async function main() {
    resize()

    //-- Enable some features

    // Depth testing so closer objects occlude farther ones
    gl.enable(gl.DEPTH_TEST)

    // Blending colors by alpha is needed for glass
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    // Cull back-facing faces based on normal
    // (which is in turn based on vertex order)
    gl.enable(gl.CULL_FACE)
    gl.cullFace(gl.BACK)

    //-- Set up GLSL programs
    // The map drawing pipeline is made of two programs:
    // the renderer and the compositor.
    //
    // The renderer takes in the school mesh and spits out a rendering that
    // includes the base color, shadows, and the sky (the diffuse pass),
    // and another rendering which has the UV coordinates of where the
    // reflections go.
    //
    // The compositor takes the diffuse pass and the reflections UV and adds
    // reflections to the final rendering.

    // Load shaders
    await Promise.all(Object.keys(S).map(file => 
        fetch("src/shaders/" + file)
        .then(res => res.text())
        .then(text => S[file] = text)
    ))

    // Set custom quality parameter
    S["render.h"] = S["render.h"]
        .replace(
            "#define QUALITY 3", 
            "#define QUALITY " + quality
        )

    // Create programs
    // Each has a vertex and fragment shader,
    // along with shared header inserted at the top of both shaders.
    P.renderer = createProgramFromSources(gl, [
        S["render.vert"], 
        S["render.frag"]
    ].map(s => S["render.h"]+s))

    P.compositor = createProgramFromSources(gl, [
        S["composit.vert"], 
        S["composit.frag"]
    ].map(s => S["composit.h"]+s))

    //-- Set renderer parameters

    gl.useProgram(P.renderer)

    // Initialize vertex attributes to pass from the mesh
    A.cellPos = gl.getAttribLocation(P.renderer, "a_cellPos")
    A.fractPos = gl.getAttribLocation(P.renderer, "a_fractPos")
    A.color = gl.getAttribLocation(P.renderer, "a_color")
    A.normal = gl.getAttribLocation(P.renderer, "a_normal")
    A.id = gl.getAttribLocation(P.renderer, "a_id")

    // Initialize uniforms for view matrix, camera position, and other scene parameters
    U.matrix = gl.getUniformLocation(P.renderer, "u_matrix")
    U.cellPos = gl.getUniformLocation(P.renderer, "u_cellPos")
    U.fractPos = gl.getUniformLocation(P.renderer, "u_fractPos")
    U.frame = gl.getUniformLocation(P.renderer, "u_frame")
    U.time = gl.getUniformLocation(P.renderer, "u_time")
    U.sunDir = gl.getUniformLocation(P.renderer, "u_sunDir")

    // Initialize uniform texture samplers for the SDF (necessary for shadows and
    // reflections raymarching) and noise texture (for clouds and stuff)
    U.map = gl.getUniformLocation(P.renderer, "u_map")
    U.noise = gl.getUniformLocation(P.renderer, "u_noise")

    // The renderer is broken down into two parts: a rasterizer and a sampler.
    //
    // The rasterizer first outputs its diffuse, reflection, and depth passes into
    // multisample-supporting render buffers, which the sampler then converts into
    // 1x-sampled textures for the compositor to use.
    //
    // This is necessary in order to antialias (smoothen) the edges of the
    // polygons, as we first need to render at a higher sample rate and then
    // downsample that with smooth interpolation.
    RB.diffuse = gl.createRenderbuffer()
    RB.reflection = gl.createRenderbuffer()
    RB.depth = gl.createRenderbuffer()

    RB.colorUpdate(RB.diffuse)
    RB.colorUpdate(RB.reflection)
    RB.depthUpdate(RB.depth)

    B.raster = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, B.raster)
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                               gl.RENDERBUFFER, RB.diffuse)
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1,
                               gl.RENDERBUFFER, RB.reflection)
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT,
                               gl.RENDERBUFFER, RB.depth)

    // Load in the pregenerated textures
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

    // Load in the vertex data, which contains the quad positions (cellPos),
    // vertex positions relative to their respective quads (fractPos), along
    // with quad color, normal, and id attributes.
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
    
    // Create textures for the sampler to output to from downsampling (aka
    // blitting) the render bufers.
    T.diffuse = gl.createTexture()
    T.reflection = gl.createTexture()

    T.colorUpdate(T.diffuse)
    T.colorUpdate(T.reflection)

    B.sampler = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, B.sampler)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                               gl.TEXTURE_2D, T.diffuse, 0)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1,
                               gl.TEXTURE_2D, T.reflection, 0)

    // Set up the parameters for the compositor, which uses the 1x-sampled
    // default framebuffer.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.useProgram(P.compositor)

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

    // Add event listeners to keyboard and touchscreen inputs
    add_listeners()

    // Begin render loop
    requestAnimationFrame(render)
}

async function render(now) {

    // Update array of times for calculating average framerate
    times.pop()
    times.unshift((start_time + now) / 1000)

    // Update camera position, orientation, and world parameters
    await update_state(times[0], times[0] - times[1])


    //-- Begin drawing stuff
    // First draw to the multisampling raster framebuffer, which rasterizes the
    // mesh and outputs a diffuse and a reflection pass into its renderbuffers. 
    gl.bindFramebuffer(gl.FRAMEBUFFER, B.raster)

    gl.viewport(0, 0, ...size)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    gl.useProgram(P.renderer)
    gl.bindVertexArray(O.vertex_array)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_3D, T.map)

    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, T.noise)

    // Set the matrix.
    gl.uniformMatrix4fv(U.matrix, false, cam.matrix)
    gl.uniform3i(U.cellPos, ...cam.pos.map(floor))
    gl.uniform3f(U.fractPos, ...cam.pos.map(fract))
    gl.uniform3f(U.sunDir, ...weather.sun)
    gl.uniform1i(U.frame, frame)
    gl.uniform1f(U.time, times[0] % 1e3)
    gl.uniform1i(U.map, 0)

    gl.drawBuffers([
       gl.COLOR_ATTACHMENT0,
       gl.COLOR_ATTACHMENT1
    ])
    gl.drawArrays(gl.TRIANGLES, 0, (await vertex_array).length / N_stride)
    
    // Then downsample (blit) the raster framebuffer's renderbuffers into the
    // sampler framebuffer's 1x-sampling textures.
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, B.raster)
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, B.sampler)
    gl.readBuffer(gl.COLOR_ATTACHMENT0)
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, null])
    gl.blitFramebuffer(0, 0, ...size, 0, 0, ...size,
                     gl.COLOR_BUFFER_BIT, gl.LINEAR)
    gl.readBuffer(gl.COLOR_ATTACHMENT1)
    gl.drawBuffers([null, gl.COLOR_ATTACHMENT1])
    gl.blitFramebuffer(0, 0, ...size, 0, 0, ...size,
                     gl.COLOR_BUFFER_BIT, gl.LINEAR)

    // Finally send these textures to the default framebuffer to composit into
    // the final image.
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

    //-- Then do it all again
    requestAnimationFrame(render)
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

    const distance = ((x, y) => Math.sqrt(x*x + y*y))(...size)
    cam.matrix = m4.multiply(
        m4.projection(...size, distance),
        m4.xRotation(-Math.PI/2),
        m4.xRotation(-cam.rot[x]),
        m4.zRotation(-cam.rot[z]),
        m4.translation(...cam.pos.map(a=>-a/2))
    )

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
async function resize() {
    size[0] = window.innerWidth * window.devicePixelRatio
    size[1] = window.innerHeight * window.devicePixelRatio
    canvas.width = size[0]
    canvas.height = size[1]
}
async function updateTextures() {
    T.colorUpdate(T.diffuse)
    T.colorUpdate(T.reflection)
    RB.colorUpdate(RB.diffuse)
    RB.colorUpdate(RB.reflection)
    RB.depthUpdate(RB.depth)
}
