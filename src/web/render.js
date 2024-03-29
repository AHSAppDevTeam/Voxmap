let gl

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
const x = 0,
    y = 1,
    z = 2,
    w = 3

// World parameters
const Z = 32 // height
const Y = 256 // N-S length
const X = 1024 // E-W width
const C = 4 // 4 channels (RGBA)
const size = [100, 100] // size of canvas

//-- Single-letter "folders" for organizing WebGL objects
// Also has some helper functions

// Shaders
const S = {
    "render.h": 0,
    "render.vert": 0,
    "render.frag": 0,
}
// Programs
const P = {}
// Shader uniforms
const U = {}
// Vertex attributes
const A = {}
// Textures: for rendering to and reading data from
const T = {}
// Objects
const O = {}
// Buffers
const B = {}
// Data arrays
const D = {
    fetch: (url) => fetch(url)
    .then(response => response.arrayBuffer())
    .then(buffer => url.endsWith(".blob") ? decrypt(buffer, password) : buffer)
    .then(buffer => new Uint8Array(buffer))
    .then(array => pako.ungzip(array))
}

//-- 4-vector operations
const clamp_xyzc = (xyzc) => [X, Y, Z, C].map((max, i) => clamps(xyzc[i], 0, max - 1)) // clamp
const project_xyzc = ([_x, _y, _z, _c]) => C * (X * (Y * (_z) + _y) + _x) + _c // project
const tex = (xyz) => Promise.all( // texture read
    [0, 1, 2].map(_c => D.map.then(map => map[project_xyzc(clamp_xyzc([...xyz, _c]))]))
)

//-- other updateable stuff

const MODE_2D = 0
const MODE_3D = 1

let mode = MODE_2D
let password = ""
let place = {}
let places = {}
let matches = []

async function initGl(){
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
}

async function initPrograms() {

    //-- Set up GLSL programs
    // Load shaders

    await Promise.all(Object.keys(S).map(
        file => fetch("src/shaders/" + file).then(res => res.text()).then(text => S[file] = text)
    ))

    // Create programs
    // Each has a vertex and fragment shader,
    // along with shared header inserted at the top of both shaders.
    P.renderer = gl.createProgram()
    await addShader(P.renderer, S["render.h"] + S["render.vert"], gl.VERTEX_SHADER)
    await addShader(P.renderer, S["render.h"] + S["render.frag"], gl.FRAGMENT_SHADER)
    gl.linkProgram(P.renderer)
    gl.useProgram(P.renderer)

    // Initialize vertex attributes to pass from the mesh
    A.cellPos = gl.getAttribLocation(P.renderer, "a_cellPos")
    A.fractPos = gl.getAttribLocation(P.renderer, "a_fractPos")
    A.color = gl.getAttribLocation(P.renderer, "a_color")
    A.normal = gl.getAttribLocation(P.renderer, "a_normal")
    A.id = gl.getAttribLocation(P.renderer, "a_id")

    // Initialize uniforms for view matrix, camera position, and other scene parameters
    U.quality = gl.getUniformLocation(P.renderer, "u_quality")
    U.matrix = gl.getUniformLocation(P.renderer, "u_matrix")
    U.cellPos = gl.getUniformLocation(P.renderer, "u_cellPos")
    U.fractPos = gl.getUniformLocation(P.renderer, "u_fractPos")
    U.frame = gl.getUniformLocation(P.renderer, "u_frame")
    U.time = gl.getUniformLocation(P.renderer, "u_time")
    U.sunDir = gl.getUniformLocation(P.renderer, "u_sunDir")

    // Initialize uniform texture samplers for the SDF (necessary for shadows and
    // reflections raymarching) and noise texture (for clouds and stuff)
    U.noise = gl.getUniformLocation(P.renderer, "u_noise")
    U.map = gl.getUniformLocation(P.renderer, "u_map")
}

async function loadTextures() {
    gl.useProgram(P.renderer)

    // Load in noise
    D.noise = await D.fetch("res/noise.bin.gz")
    T.noise = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, T.noise)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, X, X, 0, gl.RGBA, gl.UNSIGNED_BYTE, D.noise)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, T.noise)
    gl.uniform1i(U.noise, 0)

    // Load in the 2d vertex data, which contains the quad positions (cellPos),
    // vertex positions relative to their respective quads (fractPos), along
    // with quad color, normal, and id attributes.

    D.vertex2d = await D.fetch("res/vertex2d.bin.gz")
    O.vertex2d = gl.createVertexArray()
    gl.bindVertexArray(O.vertex2d)

    B.cellPos = gl.createBuffer()
    gl.enableVertexAttribArray(A.cellPos)
    gl.bindBuffer(gl.ARRAY_BUFFER, B.cellPos)
    gl.bufferData(gl.ARRAY_BUFFER, D.vertex2d, gl.STATIC_DRAW)
    gl.vertexAttribIPointer( A.cellPos, 3, gl.SHORT, N_stride, 0)

    B.fractPos = gl.createBuffer()
    gl.enableVertexAttribArray(A.fractPos)
    gl.bindBuffer(gl.ARRAY_BUFFER, B.fractPos)
    gl.bufferData(gl.ARRAY_BUFFER, D.vertex2d, gl.STATIC_DRAW)
    gl.vertexAttribIPointer( A.fractPos, 3, gl.SHORT, N_stride, 3 * N_int16)

    B.color = gl.createBuffer()
    gl.enableVertexAttribArray(A.color)
    gl.bindBuffer(gl.ARRAY_BUFFER, B.color)
    gl.bufferData(gl.ARRAY_BUFFER, D.vertex2d, gl.STATIC_DRAW)
    gl.vertexAttribIPointer( A.color, 1, gl.BYTE, N_stride, 6 * N_int16)

    B.normal = gl.createBuffer()
    gl.enableVertexAttribArray(A.normal)
    gl.bindBuffer(gl.ARRAY_BUFFER, B.normal)
    gl.bufferData(gl.ARRAY_BUFFER, D.vertex2d, gl.STATIC_DRAW)
    gl.vertexAttribIPointer( A.normal, 1, gl.BYTE, N_stride, 6 * N_int16 + 1 * N_int8)

    B.id = gl.createBuffer()
    gl.enableVertexAttribArray(A.id)
    gl.bindBuffer(gl.ARRAY_BUFFER, B.id)
    gl.bufferData(gl.ARRAY_BUFFER, D.vertex2d, gl.STATIC_DRAW)
    gl.vertexAttribIPointer( A.id, 1, gl.BYTE, N_stride, 6 * N_int16 + 2 * N_int8)
}

async function loadEncryptedTextures() {
    gl.useProgram(P.renderer)

    // Load in the SDF 3D texture
    D.map = await D.fetch(encrypted ? "res/map.blob" : "out/map.bin.gz" )
    T.map = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_3D, T.map)
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA, X, Y, Z, 0, gl.RGBA, gl.UNSIGNED_BYTE, D.map)
    gl.generateMipmap(gl.TEXTURE_3D)
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_3D, T.map)
    gl.uniform1i(U.map, 1)

    // Load in the vertex data, which contains the quad positions (cellPos),
    // vertex positions relative to their respective quads (fractPos), along
    // with quad color, normal, and id attributes.

    D.vertex = await D.fetch(encrypted ? "res/vertex.blob" : "out/vertex.bin.gz" )
    O.vertex = gl.createVertexArray()
    gl.bindVertexArray(O.vertex)

    B.cellPos = gl.createBuffer()
    gl.enableVertexAttribArray(A.cellPos)
    gl.bindBuffer(gl.ARRAY_BUFFER, B.cellPos)
    gl.bufferData(gl.ARRAY_BUFFER, D.vertex, gl.STATIC_DRAW)
    gl.vertexAttribIPointer( A.cellPos, 3, gl.SHORT, N_stride, 0)

    B.fractPos = gl.createBuffer()
    gl.enableVertexAttribArray(A.fractPos)
    gl.bindBuffer(gl.ARRAY_BUFFER, B.fractPos)
    gl.bufferData(gl.ARRAY_BUFFER, D.vertex, gl.STATIC_DRAW)
    gl.vertexAttribIPointer( A.fractPos, 3, gl.SHORT, N_stride, 3 * N_int16)

    B.color = gl.createBuffer()
    gl.enableVertexAttribArray(A.color)
    gl.bindBuffer(gl.ARRAY_BUFFER, B.color)
    gl.bufferData(gl.ARRAY_BUFFER, D.vertex, gl.STATIC_DRAW)
    gl.vertexAttribIPointer( A.color, 1, gl.BYTE, N_stride, 6 * N_int16)

    B.normal = gl.createBuffer()
    gl.enableVertexAttribArray(A.normal)
    gl.bindBuffer(gl.ARRAY_BUFFER, B.normal)
    gl.bufferData(gl.ARRAY_BUFFER, D.vertex, gl.STATIC_DRAW)
    gl.vertexAttribIPointer( A.normal, 1, gl.BYTE, N_stride, 6 * N_int16 + 1 * N_int8)

    B.id = gl.createBuffer()
    gl.enableVertexAttribArray(A.id)
    gl.bindBuffer(gl.ARRAY_BUFFER, B.id)
    gl.bufferData(gl.ARRAY_BUFFER, D.vertex, gl.STATIC_DRAW)
    gl.vertexAttribIPointer( A.id, 1, gl.BYTE, N_stride, 6 * N_int16 + 2 * N_int8)
}


async function addShader(program, source, type) {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)

    gl.compileShader(shader)
    const compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS)
    if (!compiled) {
        // Something went wrong during compilation; get the error
        const lastError = gl.getShaderInfoLog(shader)
        console.error(
            `Error compiling shader '${shader}': ${lastError}
            ${source.split('\n').map((l, i) => (i+1) + ':' + l).join('\n')}`
        )
        gl.deleteShader(shader)
        return null;
    }

    gl.attachShader(program, shader)
}
async function drawScene(projection_matrix, position, sun, frame, time){
    gl.viewport(0, 0, ...size)

    //-- Begin drawing stuff
    // First draw to the multisampling raster framebuffer, which rasterizes the
    // mesh and outputs a diffuse and a reflection pass into its renderbuffers.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.clearColor(0.9, 0.9, 0.9, 1)

    gl.useProgram(P.renderer)
    gl.bindVertexArray(mode == MODE_2D ? O.vertex2d : O.vertex)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, T.noise)

    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_3D, T.map)

    // Set the matrix.
    gl.uniform1i(U.quality, mode == MODE_2D ? 0 : 1)
    gl.uniformMatrix4fv(U.matrix, false, projection_matrix)
    gl.uniform3i(U.cellPos, ...position.map(floor))
    gl.uniform3f(U.fractPos, ...position.map(fract))
    gl.uniform3f(U.sunDir, ...sun)
    gl.uniform1i(U.frame, frame)
    gl.uniform1f(U.time, time % 1e3)
    gl.uniform1i(U.noise, 0)
    gl.uniform1i(U.map, 1)

    gl.drawArrays(gl.TRIANGLES, 0, (mode == MODE_2D ? D.vertex2d : D.vertex).length / N_stride)
}

