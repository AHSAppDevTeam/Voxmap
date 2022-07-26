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

const encrypted = url.protocol === "https:"

// look up where the vertex data needs to go.
const handles = {}

const HEIGHT = 1.6

const time_samples = 10
const times = Array(time_samples).fill(0)

let target_fps = get_param("fps") || 30
let fps = target_fps

let frame = 0

const start_time = Date.now() - new Date().getTimezoneOffset() * 60 * 1000

const weather = get_json_param("weather") || {
    sun: [0.0, 0.0, 1.0]
}
const cam = get_json_param(".cam") || {
    pos: [381.5, 128.1, 1 + HEIGHT],
    vel: [0, 0, 0],
    acc: [0, 0, 0],
    rot: [0, 0, 0],
}

const controls = {
    move: [0, 0, 0],
    rot: [0.01, 0, -0.2],
    size: 100
}


const map_texture = fetch(encrypted ? "src/map.blob" : "out/texture.bin.gz")
    .then(response => response.arrayBuffer())
    .then(buffer => encrypted ? decrypt(buffer) : buffer)
    .then(buffer => new Uint8Array(buffer))
    .then(array => pako.ungzip(array))

const stride = 16
const vertexArray = fetch(encrypted ? "src/vertex.blob" : "out/vertex.bin.gz")
    .then(response => response.arrayBuffer())
    .then(buffer => encrypted ? decrypt(buffer) : buffer)
    .then(buffer => new Uint8Array(buffer))
    .then(array => pako.ungzip(array))

const clamp_xyzc = (xyzc) => [X,Y,Z,C].map((max, i) => clamps(xyzc[i], 0, max - 1))
const project_xyzc = ([_x, _y, _z, _c]) => C*(X*(Y*(_z)+_y)+_x)+_c
const tex = (xyz) => Promise.all(
    [0,1,2].map( _c => map_texture.then(map => map[project_xyzc(clamp_xyzc([...xyz, _c]))]))
)

const sizeOf = e => ([ e.clientWidth, e.clientHeight ].map(x => x * window.devicePixelRatio ))

main()

async function main() {
    const sources = ["march.vertex.glsl", "march.fragment.glsl"]
        .map(type =>
            fetch("src/shaders/" + type)
            .then(response => response.text())
            .then(text => text
                .replace(
                    "#version 330 core",
                    "#version 300 es"
                )
                .replace(
                    "#define QUALITY 3",
                    "#define QUALITY " + (get_param("quality") || "3")
                )
            )
        )

    // setup GLSL program
    const program = createProgramFromSources(gl, await Promise.all(sources))
    gl.useProgram(program)

    handles.a_cellPos = gl.getAttribLocation(program, "a_cellPos")
    handles.a_fractPos = gl.getAttribLocation(program, "a_fractPos")
    handles.a_color = gl.getAttribLocation(program, "a_color")
    handles.a_normal = gl.getAttribLocation(program, "a_normal")
    handles.a_id = gl.getAttribLocation(program, "a_id")
    handles.u_frame = gl.getUniformLocation(program, "u_frame")
    handles.u_time = gl.getUniformLocation(program, "u_time")
    handles.u_matrix = gl.getUniformLocation(program, "u_matrix")
    handles.u_cellPos = gl.getUniformLocation(program, "u_cellPos")
    handles.u_fractPos = gl.getUniformLocation(program, "u_fractPos")
    handles.u_sunDir = gl.getUniformLocation(program, "u_sunDir")

    const texture = gl.createTexture()

    gl.bindTexture(gl.TEXTURE_3D, texture)
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA,
        X, Y, Z, 0,
        gl.RGBA, gl.UNSIGNED_BYTE, await map_texture)
    gl.generateMipmap(gl.TEXTURE_3D)
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_3D, texture)
    gl.uniform1i(handles.mapSampler, 0)

    const vertexArrayObject = gl.createVertexArray()
    gl.bindVertexArray(vertexArrayObject)

    const cellPosBuffer = gl.createBuffer()
    gl.enableVertexAttribArray(handles.a_cellPos)
    gl.bindBuffer(gl.ARRAY_BUFFER, cellPosBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, await vertexArray, gl.STATIC_DRAW)
    gl.vertexAttribIPointer(
        handles.a_cellPos, 3, gl.SHORT,
        stride, 0
    )

    const fractPosBuffer = gl.createBuffer()
    gl.enableVertexAttribArray(handles.a_fractPos)
    gl.bindBuffer(gl.ARRAY_BUFFER, fractPosBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, await vertexArray, gl.STATIC_DRAW)
    gl.vertexAttribIPointer(
        handles.a_fractPos, 3, gl.SHORT,
        stride, 6
    )

    const colorBuffer = gl.createBuffer()
    gl.enableVertexAttribArray(handles.a_color)
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, await vertexArray, gl.STATIC_DRAW)
    gl.vertexAttribIPointer(
        handles.a_color, 1, gl.BYTE,
        stride, 12
    )

    const normalBuffer = gl.createBuffer()
    gl.enableVertexAttribArray(handles.a_normal)
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, await vertexArray, gl.STATIC_DRAW)
    gl.vertexAttribIPointer(
        handles.a_normal, 1, gl.BYTE,
        stride, 13
    )

    const idBuffer = gl.createBuffer()
    gl.enableVertexAttribArray(handles.a_id)
    gl.bindBuffer(gl.ARRAY_BUFFER, idBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, await vertexArray, gl.STATIC_DRAW)
    gl.vertexAttribIPointer(
        handles.a_id, 1, gl.BYTE,
        stride, 14
    )

    gl.enable(gl.DEPTH_TEST)
    gl.enable(gl.CULL_FACE)
    gl.cullFace(gl.BACK)

    gl.useProgram(program)

    requestAnimationFrame(render)
    add_listeners()
}

async function decrypt(buffer) {
    const crypto_initial = Uint8Array.from([
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
        controls.rot[x] = clamp(controls.rot[x], 0.8)
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
    resize()
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

    gl.viewport(0, 0, ...sizeOf(gl.canvas))

    gl.drawArrays(gl.TRIANGLES, 0, (await vertexArray).length / stride)
    //gl.drawArrays(gl.TRIANGLES, 0, frame*stride)
    
    const size = sizeOf(gl.canvas)
    const distance = ((x, y) => Math.sqrt(x*x + y*y))(...size)
    const matrix = m4.multiply(
        m4.projection(...size, distance),
        m4.xRotation(-Math.PI/2),
        m4.xRotation(-cam.rot[x]),
        m4.zRotation(-cam.rot[z]),
        m4.translation(...cam.pos.map(a=>-a/2))
    )

    // Set the matrix.
    gl.uniformMatrix4fv(handles.u_matrix, false, matrix)
    gl.uniform3i(handles.u_cellPos, ...cam.pos.map(floor))
    gl.uniform3f(handles.u_fractPos, ...cam.pos.map(fract))
    gl.uniform3f(handles.u_sunDir, ...weather.sun)
    gl.uniform1i(handles.u_frame, frame)
    gl.uniform1f(handles.u_time, times[0] % 1e8)

    requestAnimationFrame(render)
}

async function update_state(time, delta) {

    frame++
    fps = (time_samples - 1) / (time - times[time_samples - 1])
    let sin = Math.sin(cam.rot[z])
    let cos = Math.cos(cam.rot[z])

    let f = controls.move.map(f => f * 100)

    cam.acc = [
        f[x] * cos - f[y] * sin,
        f[x] * sin + f[y] * cos,
        f[z],
    ]

    const feet_pos = [...cam.pos]
    feet_pos[z] -= HEIGHT
    let [above, below, color] = await tex(feet_pos.map(floor))
    if(below < 1) cam.acc[z] += 30
    if(below > 1) cam.acc[z] -= 60

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

    if (!get_param("clean")) debug.innerText = 
        `${sizeOf(gl.canvas).join(" x ")} @ ${num(fps)} fps
        position: ${cam.pos.map(num).join(", ")}
        velocity: ${cam.vel.map(num).join(", ")}
        by: Xing :D
        `

    if (frame % 60 == 0) {
        url.searchParams.set("cam", encodeURIComponent(JSON.stringify(cam)))
        window.history.replaceState(null, "", url.toString())
    }
}

async function resize() {
    const size = sizeOf(gl.canvas)
    gl.canvas.width = size[0]
    gl.canvas.height = size[1]
}
