const debug = document.getElementById("debug")
const canvas = document.getElementById("canvas")
const joystick = document.getElementById("joystick")
const form = document.getElementById("form")
const gl = canvas.getContext("webgl2")

const x = 0
const y = 1
const z = 2

const Z = 16 // height
const Y = 256 // N-S length
const X = 1024 // E-W width
const C = 4 // 4 channels

const encrypted = url.protocol === "https:"

// look up where the vertex data needs to go.
const handles = {}

const HEIGHT = 1.6
let size = 100

const time_samples = 10
const times = Array(time_samples).fill(0)

let target_fps = get_param("fps") || 30
let fps = target_fps

let frame = 0

const start_time = Date.now() - new Date().getTimezoneOffset() * 60 * 1000

const weather = get_json_param("weather") || {
    sun: [0.0, 0.0, 1.0]
}
const cam = get_json_param("cam") || {
    pos: [381.5, 128.1, 1 + HEIGHT],
    vel: [0, 0, 0],
    acc: [0, 0, 0],
    rot: [0, 0, 0],
}

const controls = {
    move: [0, 0, 0],
    rot: [0.01, 0, -0.2]
}


const map_texture = fetch(encrypted ? "src/map.blob" : "out/texture.bin.gz")
    .then(response => response.arrayBuffer())
    .then(buffer => encrypted ? decrypt(buffer) : buffer)
    .then(buffer => new Uint8Array(buffer))
    .then(array => pako.ungzip(array))

const positionArray = fetch(encrypted ? "src/position.blob" : "out/position.bin.gz")
    .then(response => response.arrayBuffer())
    .then(buffer => encrypted ? decrypt(buffer) : buffer)
    .then(buffer => new Uint8Array(buffer))
    .then(array => pako.ungzip(array))
    .then(array => new Uint16Array(array.buffer))
    .then(array => new Float32Array(array))

const colorArray = fetch(encrypted ? "src/color.blob" : "out/color.bin.gz")
    .then(response => response.arrayBuffer())
    .then(buffer => encrypted ? decrypt(buffer) : buffer)
    .then(buffer => new Uint8Array(buffer))
    .then(array => pako.ungzip(array))

const tex = ([_x, _y, _z]) => Promise.all(
    [0,1,2]
    .map( _c => map_texture.then(map => map[C*(X*(Y*(_z)+_y)+_x)+_c]))
)


main()

async function main() {
    const sources = ["march.vertex.glsl", "test.fragment.glsl"]
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

    handles.a_position = gl.getAttribLocation(program, "a_position")
    handles.a_color = gl.getAttribLocation(program, "a_color")
    handles.u_matrix = gl.getUniformLocation(program, "u_matrix")

    const texture = gl.createTexture()

    gl.bindTexture(gl.TEXTURE_3D, texture)
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA,
        1024, 256, 16, 0,
        gl.RGBA, gl.UNSIGNED_BYTE, await map_texture)
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_3D, texture)
    gl.uniform1i(handles.mapSampler, 0)

    const positionBuffer = gl.createBuffer()
    const vertexArrayObject = gl.createVertexArray()
    gl.bindVertexArray(vertexArrayObject)
    gl.enableVertexAttribArray(handles.a_position)
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, await positionArray, gl.STATIC_DRAW)
    gl.vertexAttribPointer(
        handles.a_position, 3, gl.FLOAT,
        false, 0, 0
    )

    const colorBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, await colorArray, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(handles.a_color)
    gl.vertexAttribPointer(
        handles.a_color, 1, gl.UNSIGNED_BYTE,
        true, 0, 0
    )

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
        controls.rot[z] -= 4 * event.movementX / size
        controls.rot[x] -= 2 * event.movementY / size
        controls.rot[x] = clamp(controls.rot[x], 0.8)
    })
    joystick.addEventListener('touchstart', () => {
        controls.active = true
    })
    joystick.addEventListener('pointermove', (event) => {
        if (controls.active) {
            controls.move[x] = +2*clamp(event.offsetX * 2 / size - 1, 1)
            controls.move[y] = -2*clamp(event.offsetY * 2 / size - 1, 1)
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
                cam.pos[z] += (event.shiftKey) ? -1 : 1
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
        }
    })
    window.addEventListener('resize', resize)
    resize()
}

const floor = x => Math.floor(x)
const fract = x => x - floor(x)
const pow = (x, p) => Math.sign(x) * Math.pow(Math.abs(x), p)
const clamp = (x, a) => Math.min(Math.max(x, -a), a)

async function render(now) {
    times.pop()
    times.unshift((start_time + now) / 1000)

    update_state(times[0], times[0] - times[1])

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)

    gl.drawArrays(gl.TRIANGLES, 0, (await positionArray).length / 3)
    
    let matrix = m4.translation(-cam.pos[x], -cam.pos[y], 0)
    matrix = m4.scale(matrix, 0.005, 0.005, 0.005)
    matrix = m4.zRotate(matrix, cam.rot[z])
    matrix = m4.xRotate(matrix, -cam.rot[x])
    matrix = m4.xRotate(matrix, -Math.PI/2)

    // Set the matrix.
    gl.uniformMatrix4fv(handles.u_matrix, false, matrix);


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
        0,
    ]

    let drag = 1 / 8

    cam.acc = cam.acc.map((a, i) => a - cam.vel[i] * drag / delta)
    cam.vel = cam.vel.map((v, i) => v + cam.acc[i] * delta)
    cam.pos = cam.pos.map((p, i) => p + cam.vel[i] * delta)

    const feet_pos = cam.pos
    feet_pos.z -= HEIGHT;
    const [above, below, color] = await tex(feet_pos.map(floor))
    cam.pos[z] -= Math.round(below - HEIGHT) * 2 * delta;

    cam.rot = cam.rot.map( 
        (a, i) => cam.rot[i] + 
        clamp( pow(controls.rot[i] - cam.rot[i], 1.5), 10*delta)
    )

    let hour = time / 60 / 60 / 12 * Math.PI
    weather.sun[x] = Math.sin(hour) * Math.sqrt(3 / 4)
    weather.sun[y] = Math.sin(hour) * Math.sqrt(1 / 4)
    weather.sun[z] = Math.abs(Math.cos(hour))

    joystick.firstElementChild.style.transform =
        `translate(${controls.move[x]*15}%, ${-controls.move[y]*15}%)`

    const num = x => x.toFixed(1)
    const ft = x => num(x)

    if (!get_param("clean")) debug.innerText = `${num(fps)} fps
        position: ${cam.pos.map(ft).join(", ")}
        velocity: ${cam.vel.map(ft).join(", ")}
        by: Xing :D
    `

    if (frame % 60 == 0) {
        url.searchParams.set("cam", encodeURIComponent(JSON.stringify(cam)))
        window.history.replaceState(null, "", url.toString())
    }
}

async function resize() {
    size = Math.min(window.innerWidth, window.innerHeight) * 0.5
    resizeCanvasToDisplaySize(gl.canvas, 1)
}
