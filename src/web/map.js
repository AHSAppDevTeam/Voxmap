// Link up HTML elements
const $debug = document.getElementById("debug")
const $map3d = document.getElementById("map-3d")
const $map2d = document.getElementById("map-2d")
const $overlay = document.getElementById("map-overlay")
const $toggle = document.getElementById("toggle")
gl = $map3d.getContext("webgl2", { alpha: false, antialias: false } )
const map2d = $map2d.getContext("2d")
const overlay = $overlay.getContext("2d")

//-- Dynamic parameters

const start_time = Date.now() - new Date().getTimezoneOffset() * 60 * 1000
const times = Array(N_time_samples).fill(0)
let frame = 0

let quality = get_param("quality") || "2" // render quality

const weather = get_json_param("weather") || {
    sun: [0.0, 0.0, 1.0]
}

const cam = get_json_param(".cam") || {
    sbj: [381.5, 128.1, Y/2], // camera subject
    pos: [0, 0, 0],
    vel: [0, 0, 0],
    acc: [0, 0, 0],
    rot: [0, 0, 0],
    orbit_matrix: Array(16),
    projection_matrix: Array(16),
}

const controls = {
    move: [0, 0, 0],
    rot: [0.01, 0, -0.2],
    size: 100,
    prev: [0, 0],
    shiftKey: false,
}


//-- Helper functions

// Do the thing
main()

// (the thing:)
async function main() {
    resize()

    await initGl()
    await initPrograms()
    await loadTextures()
    if(!encrypted) await loadEncryptedTextures()

    // Add event listeners to keyboard and touchscreen inputs
    addListeners()

    // Begin render loop
    requestAnimationFrame(render)
}

async function render(now) {

    // Update camera position, orientation, and world parameters
    await update_state(now)
    await drawScene(cam.projection_matrix, cam.pos, weather.sun, frame, times[0])
    await drawOverlay()

    //-- Then do it all again
    requestAnimationFrame(render)
}


const img2d = new Image()
img2d.src = "/res/2d.png"

overlay.lineWidth = 3
overlay.lineJoin = "round"
overlay.textAlign = "center"
overlay.shadowColor = '#000'

$toggle.addEventListener("click", event => {
    switch(mode) {
        case MODE_2D:
            mode = MODE_3D
            $toggle.style.backgroundImage = 'url("/res/2d.png")'
            break
        case MODE_3D:
            mode = MODE_2D
            $toggle.style.backgroundImage = 'url("/res/render.png")'
            break
    }
})

async function drawOverlay() {

    overlay.clearRect(0, 0, size[x], size[y])
    map2d.clearRect(0, 0, size[x], size[y])

    const s = 3 // scale
    const center = [
        size[x] / 2 - cam.sbj[x] * s,
        size[y] / 2 + cam.sbj[y] * s
    ]

    let visible = {}

    // Project labels onto scene
    for (const key in places) {
        const place = places[key]

        // Multiply by the camera matrix to go from vertex space
        // to view frustum space, then divide by z to get
        // perspective. Remove all with negative z.
        //
        // Basically the same thing as render.vert except WebGL
        // does the z-divide and culling automatically.

        const view = m4.v4(cam.projection_matrix, [place.x, place.y, place.z, 1.0])

        if (view[w] < 0) continue // Discard places behind the camera

            view[x] /= view[w]
            view[y] /= view[w]

            if (Math.abs(view[x]) > 1.1 || Math.abs(view[y]) > 1.1) continue // Behind places out of view

                place.vx = size[x] * (view[x] + 1) / 2
                place.vy = -size[y] * (view[y] - 1) / 2
                place.vw = view[w]
                visible[key] = place
    }

    visible = sort(visible, "vw", -1)

    for (const key in visible) {
        const place = visible[key]

        /*
           let flag = false
           for(kb in places) {
           if(key == kb) continue
           const pb = places[kb]
           if( place.vz > pb.vz && Math.abs(place.vx-pb.vx) < 20 && Math.abs(place.vy-pb.vy) < 10 )
           flag = true
           }
           if(flag) continue
           */

        const dx = place.x - cam.pos[x]
        const dy = place.y - cam.pos[y]
        const dz = place.z - cam.pos[z]

        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
        const depth = clamps(distance / 150, 0, 1)
        const proximity = clamps(15 / distance, 0.1, 2)
        const fog = clamps(cam.pos[z] / Z, 0.6, 1)

        if (key.startsWith("room_")) {
            overlay.globalAlpha = 1 - smoothstep(depth, 0.3, 0.4)
            overlay.font = `${4*proximity}rem "Josefin Sans", sans-serif`
            overlay.lineJoin = "miter"
            overlay.lineWidth = 4 * 2 * proximity
            overlay.strokeStyle = "#000"
            overlay.fillStyle = "#fff"
        } else if (key.startsWith("building_")) {
            overlay.globalAlpha = smoothstep(depth, 0.3, 0.4) * (1 - smoothstep(depth, fog, fog + 0.1))
            overlay.font = `${12*proximity}rem "Quicksand", sans-serif`
            overlay.lineJoin = "round"
            overlay.lineWidth = 8 * 2 * proximity
            overlay.strokeStyle = "#fffc"
            overlay.fillStyle = "#000c"
        } else {
            overlay.globalAlpha = 0.5;
            overlay.font = `${14}px sans-serif`
        }

        if (focusPlaces.includes(key)) {
            overlay.strokeStyle = "orchid"
            overlay.globalAlpha = 1
        }

        overlay.strokeText(place.name, place.vx, place.vy)
        overlay.fillText(place.name, place.vx, place.vy)
    }
}

const list = {}
async function addListeners() {

    let touch = new Hammer.Manager($overlay)
    touch.add(new Hammer.Pan({ threshold: 0, pointers: 0 } ))
    touch.add(new Hammer.Pinch({ threshold: 0 }).recognizeWith(touch.get("pan")))

    $overlay.addEventListener('click', (event) => {
        /*
           const name = prompt("name")
            //list["room_"+name.replace("-","_")] = {
            console.log({
name: name+" row",
x: event.offsetX,
y: Y-event.offsetY,
z: 12
})
*/
        event.preventDefault()
        //$overlay.requestPointerLock()
    })

    cam.rot = cam.rot.map(a => a % (2 * Math.PI))

    window.addEventListener("keydown", event => {
        controls.shiftKey = event.shiftKey
    })
    window.addEventListener("keyup", event => {
        controls.shiftKey = event.shiftKey
    })

    async function controlsRotate(dx, dy) {
        controls.rot[z] -= 2 * dx
        controls.rot[x] -= dy
    }
    async function controlsMove(cx, cy, dx, dy) {
        let old_projection = m4.v4(
            cam.inv_projection_matrix,
            [-(cx-dx)/size[x], (cy-dy)/size[y], 0, 0]
        )
        let new_projection = m4.v4(
            cam.inv_projection_matrix,
            [-(cx)/size[x], (cy)/size[y], 0, 0]
        )
        controls.move[x] += 200*(new_projection[x] - old_projection[x])
        controls.move[y] += 200*(new_projection[y] - old_projection[y])
    }
    touch.on("pinch pan", (event) => {
        let cx = event.center.x
        let cy = event.center.y
        let dx = event.deltaX - controls.prev[x]
        let dy = event.deltaY - controls.prev[y]
        controls.prev[x] = event.isFinal ? 0 : event.deltaX
        controls.prev[y] = event.isFinal ? 0 : event.deltaY

        if(event.pointers.length == 2 || controls.shiftKey) {
            // Two-finger or shift-key or right-click rotation
            controlsRotate(dx,dy)
        } else {
            controlsMove(cx, cy, dx,dy)
        }
    })
    $overlay.addEventListener("mousemove", (event) => {
        if(event.buttons == 2 /*right click*/ || event.buttons == 4 /*middle click*/) {
            controlsRotate(event.movementX, event.movementY)
            event.preventDefault()
        }
    })
    $overlay.addEventListener("contextmenu", (event) => {
        event.preventDefault()
    })

    $overlay.addEventListener("wheel", (event) => {
        controls.move[z] += event.deltaX + event.deltaY + event.deltaZ
    })

    // Move (keyboard)
    window.addEventListener('keydown', (event) => {
        const power = event.shiftKey ? 5 : 10
        switch (event.code) {
            case "KeyW":
                case "ArrowUp":
                controls.move[y] += power
            break;
            case "KeyS":
                case "ArrowDown":
                controls.move[y] -= power
            break;
            case "KeyA":
                case "ArrowLeft":
                controls.move[x] -= power
            break;
            case "KeyD":
                case "ArrowRight":
                controls.move[x] += power
            break;
            case "Space":
                controls.move[z] += event.shiftKey ? -1 : 1
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


async function update_state(now) {

    // Update array of times for calculating average framerate
    times.pop()
    times.unshift((start_time + now) / 1000)

    const time = times[0]
    const delta = times[0] - times[1]

    frame++

    cam.sbj = cam.sbj.map((p, i) => p + controls.move[i])
    cam.sbj = [
        clamps(cam.sbj[x], -X, 2 * X),
        clamps(cam.sbj[y], -Y, 2 * Y),
        clamps(cam.sbj[z], H_ground, Y)
    ]

    cam.rot = cam.rot.map((a, i) => a + controls.rot[i]/100)

    controls.move[x] = controls.move[y] = controls.move[z] = 0
    controls.rot[x] = controls.rot[y] = controls.rot[z] = 0

    const orbit_radius = cam.sbj[z]
    cam.orbit_matrix = m4.multiply(
        m4.translation(...cam.sbj),
        m4.zRotation(cam.rot[z]),
        m4.xRotation(cam.rot[x]),
        m4.translation(0, 0, orbit_radius)
    )
    cam.pos = m4.v4(cam.orbit_matrix, [0, 0, 0, 1]).slice(0, 3)

    const fov = 60 // Field of view
    const aspect = size[x] / size[y]
    const near = 1
    const far = X
    cam.projection_matrix = m4.multiply(
        m4.projection(fstop(fov), aspect, near, far),
        m4.xRotation(-cam.rot[x]),
        m4.zRotation(-cam.rot[z]),
        m4.translation(...cam.pos.map(a => -a))
    )
    cam.inv_projection_matrix = m4.multiply(
        m4.translation(...cam.pos),
        m4.zRotation(cam.rot[z]),
        m4.xRotation(cam.rot[x]),
        m4.inv_projection(fstop(fov), aspect, near, far)
    )

    let hour = time / 60 / 60 / 12 * Math.PI
    weather.sun[x] = Math.sin(hour) * Math.sqrt(3 / 4)
    weather.sun[y] = Math.sin(hour) * Math.sqrt(1 / 4)
    weather.sun[z] = Math.abs(Math.cos(hour))

    const num = x => x.toFixed(1)

    const fps = 1 / delta
    const avg_fps = (N_time_samples - 1) / (time - times[N_time_samples - 1])

    if (frame % 100 == 0) {
        if (avg_fps > 30 && quality < 3) {
            quality++
        } else if (avg_fps < 20 && quality > 1) {
            quality--
        }
    }

    if (!get_param("clean")) debug.innerText =
            `${size.map(num).join(" x ")} @ ${num(fps)} ~ ${num(avg_fps)} fps
        position: ${cam.pos.map(num).join(", ")}
    velocity: ${cam.vel.map(num).join(", ")}
    quality: ${quality} / 3
    `

    if (frame % 60 == 0) {
        url.searchParams.set("cam", encodeURIComponent(JSON.stringify(cam)))
        window.history.replaceState(null, "", url.toString())
    }

}

async function resize() {
    size[0] = window.innerWidth * window.devicePixelRatio
    size[1] = window.innerHeight * window.devicePixelRatio
    $map3d.width = $map2d.width = $overlay.width = size[0]
    $map3d.height = $map2d.height = $overlay.height = size[1]
}

