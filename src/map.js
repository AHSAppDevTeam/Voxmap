const debug = document.getElementById("debug")
const canvas = document.getElementById("canvas")
const joystick = document.getElementById("joystick")
const form = document.getElementById("form")
const gl = canvas.getContext("webgl2")

const Z = 16
const Y = 256
const X = 1024

// look up where the vertex data needs to go.
const handles = {}

const N = 10
const HEIGHT = 1.6
let size = 100
const times = Array(N).fill(0)
const deltas = Array(N).fill(0)
let delta = 1
let fps = 30
let upSample = 2
let running = false
let frame = 0

const weather = get_json_param("weather") || {
    sun: {
        x: 0.0,
        y: 0.0,
        z: 1.0
    }
}
const camera = get_json_param("camera") || {
    pos: {
        x: 381.5,
        y: 128.1,
        z: 1 + HEIGHT
    },
    vel: {
        x: 0,
        y: 0,
        z: 0
    },
    rot: {
        x: 0,
        y: 0,
        z: 0
    },
}

const controls = {
    move: {
        x: 0,
        y: 0,
        z: 0
    },
    rot: {
        x: 0.01,
        y: 0,
        z: -0.2
    },
}

main()


async function main() {
    const vert = (await (await fetch("src/shaders/march.vertex.glsl"))
            .text())
        .replace("#version 330 core", "#version 300 es")

    const frag = (await (await fetch("src/shaders/march.fragment.glsl"))
            .text())
        .replace("#version 330 core", "#version 300 es")
        .replace("#define QUALITY 3", "#define QUALITY " + (get_param("quality") || "3"))

    // setup GLSL program
    const program = createProgramFromSources(gl, [vert, frag])

    handles.position = gl.getUniformLocation(program, "vPosition")
    handles.coord = gl.getAttribLocation(program, "TexCoord")
    handles.resolution = gl.getUniformLocation(program, "iResolution")
    handles.time = gl.getUniformLocation(program, "iTime")
    handles.rotation = gl.getUniformLocation(program, "iCamRot")
    handles.cellPos = gl.getUniformLocation(program, "iCamCellPos")
    handles.fractPos = gl.getUniformLocation(program, "iCamFractPos")
    handles.sun = gl.getUniformLocation(program, "iSunDir")
    handles.frame = gl.getUniformLocation(program, "iFrame")

    const texture = gl.createTexture()

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8UI,
        1024, 4096, 0,
        gl.RGB_INTEGER, gl.UNSIGNED_BYTE, await map_texture())
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.uniform1i(handles.textureSampler, 0)

    const positionBuffer = gl.createBuffer();

    // Bind it to ARRAY_BUFFER (think of it as ARRAY_BUFFER = positionBuffer)
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, // first triangle
        +1, -1,
        -1, +1,
        -1, +1, // second triangle
        +1, -1,
        +1, +1,
    ]), gl.STATIC_DRAW)

    gl.vertexAttribPointer(
        handles.position,
        2, // 2 components per iteration
        gl.FLOAT, // the data is 32bit floats
        false, // don't normalize the data
        0, // 0 = move forward size * sizeof(type) each iteration to get the next position
        0, // start at the beginning of the buffer
    )

    gl.enable(gl.CULL_FACE)
    gl.cullFace(gl.BACK)

    gl.useProgram(program)
    gl.enableVertexAttribArray(handles.position)

    start()
    add_listeners()
}

async function map_texture() {

    if(url.protocol === "http:")
        return new Uint8Array(await (await fetch("maps/texture.bin")).arrayBuffer())

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

    const texture_buffer = await fetch("src/map.blob")
        .then(response => response.blob())
        .then(blob => blob.arrayBuffer())
        .then(buffer => crypto.subtle.decrypt({
            'name': 'AES-CBC',
            'iv': crypto_initial
        }, crypto_key, buffer))
        .then(buffer => new Blob([buffer]).stream())
        .then(stream => stream.pipeThrough(new DecompressionStream(
            'gzip')))
        .then(stream => new Response(stream).arrayBuffer())
        .then(buffer => new Uint8Array(buffer))

    const texture = gl.createTexture()
}

async function add_listeners() {
    canvas.addEventListener('click', (event) => {
        event.preventDefault()
        canvas.requestPointerLock()
    })
    canvas.addEventListener('pointermove', (event) => {
        controls.rot.z -= event.movementX / size
        controls.rot.x -= event.movementY / size
        controls.rot.x = Math.max(-0.2, Math.min(controls
            .rot.x,
            0.2))
    })
    joystick.addEventListener('touchstart', () => {
        controls.move.active = true
    })
    joystick.addEventListener('pointermove', (event) => {
        if (controls.move.active) {
            controls.move.x = +2 * (event.offsetX * 2 /
                size - 1)
            controls.move.y = -2 * (event.offsetY * 2 /
                size - 1)
        }
    })
    joystick.addEventListener('touchend', (event) => {
        controls.move.active = false
        controls.move.x = 0
        controls.move.y = 0
    })
    window.addEventListener('keydown', (event) => {
        const power = event.shiftKey ? 1.2 : 0.8
        switch (event.code) {
            case "KeyW":
            case "ArrowUp":
                controls.move.y = power
                break;
            case "KeyS":
            case "ArrowDown":
                controls.move.y = -power
                break;
            case "KeyA":
            case "ArrowLeft":
                controls.move.x = -power
                break;
            case "KeyD":
            case "ArrowRight":
                controls.move.x = power
                break;
            case "Space":
                camera.pos.z += (event.shiftKey) ? -1 : 1
                break;
        }
    })
    window.addEventListener('keyup', (event) => {
        switch (event.code) {
            case "KeyW":
            case "KeyS":
            case "ArrowUp":
            case "ArrowDown":
                controls.move.y = 0
                break;
            case "KeyA":
            case "KeyD":
            case "ArrowLeft":
            case "ArrowRight":
                controls.move.x = 0
                break;
        }
    })
    window.addEventListener('resize', resize)
    setInterval(() => {
        let target = 30
        let delta = fps - target
        if (delta < 5 && delta > -15) return;

        upSample *= target / fps
        upSample = Math.pow(2, Math.round(Math.max(-2, Math
            .log(
                upSample))))
        resize()
    }, 1000)
    resize()
}

function floor(x) {
    return Math.floor(x)
}

function fract(x) {
    return x - floor(x)
}

function render(now) {
    times.pop()
    times.unshift(now / 1000)

    deltas.pop()
    deltas.unshift(times[0] - times[1])

    update_state(times[0], deltas[0])

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)

    gl.uniform2f(handles.resolution, gl.canvas.width, gl.canvas.height)
    gl.uniform1f(handles.time, times[0])
    gl.uniform3f(handles.fractPos, fract(camera.pos.x), fract(camera.pos.y), fract(camera.pos.z))
    gl.uniform3i(handles.cellPos, floor(camera.pos.x), floor(camera.pos.y), floor(camera.pos.z))
    gl.uniform3f(handles.rotation, camera.rot.x, camera.rot.y, camera.rot.z)
    gl.uniform3f(handles.sun, weather.sun.x, weather.sun.y, weather.sun.z)
    gl.uniform1i(handles.frame, frame)

    gl.drawArrays(gl.TRIANGLES, 0, 6)

    if (running) requestAnimationFrame(render)
}

async function update_state(time, delta) {

    frame++
    fps = N / deltas.reduce((a, b) => a + b, 0)
    let Fx = Math.pow(controls.move.x, 3)
    let Fy = Math.pow(controls.move.y, 3)
    let sin = Math.sin(camera.rot.z)
    let cos = Math.cos(camera.rot.z)
    let ax = 100 * (Fx * cos - Fy * sin)
    let ay = 100 * (Fx * sin + Fy * cos)

    let drag = 1 / 8
    ax -= camera.vel.x / delta * drag
    ay -= camera.vel.y / delta * drag

    camera.vel.x += ax * delta
    camera.vel.y += ay * delta

    camera.pos.x += camera.vel.x * delta
    camera.pos.y += camera.vel.y * delta
    camera.pos.z += camera.vel.z * delta

    camera.rot.x = controls.rot.x * Math.PI * 2
    camera.rot.z = controls.rot.z * Math.PI

    let hour = 1 + time / 60 / 60 * Math.PI / 180
    weather.sun.x = Math.cos(hour) / Math.sqrt(2)
    weather.sun.y = Math.cos(hour) / Math.sqrt(2)
    weather.sun.z = Math.abs(Math.sin(hour))

    joystick.firstElementChild.style.transform =
        `translate(${controls.move.x*15}%, ${-controls.move.y*15}%)`

    const num = x => x.toFixed(1)
    const ft = x => num(x * 3)

    if(!get_param("clean")) debug.innerText = `${num(fps)} fps, ${num(upSample)} upscaling
        position (ft): ${ft(camera.pos.x)}, ${ft(camera.pos.y)}, ${ft(camera.pos.z)}
        velocity (ft/s): ${ft(camera.vel.x)}, ${ft(camera.vel.y)}, ${ft(camera.vel.z)}
        by: Xing :D
    `

    if(frame % 10 == 0) {
        url.searchParams.set("camera", encodeURIComponent(JSON.stringify(camera)))
        window.history.replaceState(null, "", url.toString())
    }
}

function stop() {
    running = false
}

function start() {
    if (running) return
    running = true
    requestAnimationFrame(render)
}

async function resize() {
    size = Math.min(window.innerWidth, window.innerHeight) * 0.5
    resizeCanvasToDisplaySize(gl.canvas, 1 / upSample)
    canvas.style.imageRendering = upSample > 1 ? 'pixelated' :
        'auto'
}
