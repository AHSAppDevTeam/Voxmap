// Link up HTML elements
const $debug = document.getElementById("debug")
const $map = document.getElementById("map")
const $overlay = document.getElementById("overlay")
const $toggle = document.getElementById("toggle")
const $download = document.getElementById("download")
gl = $map.getContext("webgl2", { alpha: false, antialias: true } )

//-- Dynamic parameters

const start_time = Date.now() - new Date().getTimezoneOffset() * 60 * 1000
const times = Array(N_time_samples).fill(0)
let frame = 0

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
    first: false
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
    await updateState(now)
    await drawScene(cam.projection_matrix, cam.pos, weather.sun, frame, times[0]/1000)
    await drawOverlay()

    //-- Then do it all again
    requestAnimationFrame(render)
}


const img2d = new Image()
img2d.src = "/res/2d.png"

$toggle.addEventListener("click", event => {
    switch(mode) {
        case MODE_2D:
            mode = MODE_3D
            $toggle.textContent = "2D"
            break
        case MODE_3D:
            mode = MODE_2D
            $toggle.textContent = "3D"
            break
    }
})

async function initOverlay() {
    $overlay.innerHTML = ""
    for(const key in places) {
        place = places[key]
        place.class = key.split("_")[0]
        place.element = document.createElementNS("http://www.w3.org/2000/svg", "text")
        place.element.id = key
        place.element.classList.add("place", place.class)
        place.element.append("short" in place ? place.short : place.name)
        place.element.setAttribute("x", 0)
        place.element.setAttribute("y", 0)
        $overlay.append(place.element)
    }
}
async function drawOverlay() {

    const fog = clamps(1.5 * cam.pos[z] / Z, 0.6, 1)

    const visible = await Promise.all(Object.keys(places).filter(async (key) => {
        const place = places[key]
        place.element.setAttribute("opacity", 0)

        // Multiply by the camera matrix to go from vertex space
        // to view frustum space, then divide by z to get
        // perspective. Remove all with negative z.
        //
        // Basically the same thing as render.vert except WebGL
        // does the z-divide and culling automatically.
        
        const pos = [place.x, place.y, mode == MODE_2D ? 0 : place.z, 1]

        const view = m4.v4(cam.projection_matrix, pos)

        if(view[w] < 0) return false

        view[x] /= view[w]
        view[y] /= view[w]

        // Discard places out of view
        if (Math.abs(view[x]) > 1.1 || Math.abs(view[y]) > 1.1) return false

        const match = matches.includes(key)
        place.element.classList.toggle("match", match)

        const vx = size[x] * (view[x] + 1) / 2
        const vy = -size[y] * (view[y] - 1) / 2
        const vw = view[w]

        const distance = vec.magnitude(vec.subtract(pos.slice(0,3), cam.pos))
        const depth = clamps(distance / 150, 0, 1)
        const proximity = clamps((match ? 30 : 20) / distance, 0.1, 2)

        place.element.setAttribute("opacity", (
            (match) ? (1) :
            (place.class == "room") ? (1 - smoothstep(depth, 0.65, 0.75)) :
            (smoothstep(depth, 0.6, 0.7) * (1 - smoothstep(depth, fog, fog + 0.1)))
        ))
        place.element.setAttribute("transform", "translate("+vx+" "+vy+")"+"scale("+proximity+")" )

        place.sort = vw - match // matches go on top

        return true
    }))
    
    $overlay.append(...visible
                    .sort((a,b) => places[b].sort - places[a].sort)
                    .map(key => places[key].element)
    )

    // Project labels onto scene
    for (const key in places) {
    }

    const b = performance.now()

    //console.log(b-a)
}

const list = {}
async function addListeners() {

    let touch = new Hammer.Manager($overlay)
    touch.add(new Hammer.Pan({ threshold: 0, pointers: 0 } ))
    touch.add(new Hammer.Pinch({ threshold: 0 }).recognizeWith(touch.get("pan")))

    $overlay.addEventListener("dblclick", async (event) => {
        if(false) {
           const name = prompt("name")
            list["room_"+name.replace(" ","_")] = {
                name: name.replace(" ","-"),
                x: cam.pos[x],
                y: cam.pos[y],
                z: 12
            }
            console.log(list)
        } else {
            await drawScene(cam.projection_matrix, cam.pos, weather.sun, frame, times[0]/1000)
            $download.href = $map.toDataURL("image/png")
            $download.download = "map.ahs.app - " + simplify(new Date().toJSON().replace(/\D/g,"")) + ".png"
            $download.click()
        }
    })

    cam.rot = cam.rot.map(a => a % (2 * Math.PI))

    window.addEventListener("keydown", event => {
        controls.shiftKey = event.shiftKey
    })
    window.addEventListener("keyup", event => {
        controls.shiftKey = event.shiftKey
    })

    function projectToGround(vx, vy) {
        // screen to frustum
        const a = m4.v4(cam.inv_projection_matrix, [vx, vy, 1, 1])
        // frustum to ground
        return [a[x]/a[w], a[y]/a[w], a[z]/a[w], 1]
    }
    async function controlsRotate(dx, dy) {
        controls.rot[z] -= clamp(400 * dx, 16)
        controls.rot[x] -= clamp(200 * dy, 8)
    }
    async function controlsMove(cx, cy, dx, dy) {
        const old_pos = projectToGround(dx-cx, cy-dy)
        const new_pos = projectToGround(-cx, cy)
        for(const i of [x,y])
            controls.move[i] += (new_pos[i] - old_pos[i])/(12 - 8*cam.pos[z]/Y)
    }
    async function controlsZoom(dz) {
        controls.move[z] += dz
    }
    touch.on("pinch pinchstart pan panstart", (event) => {
        const isFirst = ["pinchstart", "panstart"].includes(event.type)

        let cx = ( event.center.x / size[x] * 2 - 1 )
        let cy = ( event.center.y / size[y] * 2 + 1 )

        let dx = isFirst ? 0 : cx - controls.prev[x]
        let dy = isFirst ? 0 : cy - controls.prev[y]

        controls.prev[x] = cx
        controls.prev[y] = cy

        if(event.pointers.length == 2 || controls.shiftKey) {
            // Two-finger or shift-key or right-click rotation
            controlsRotate(dx, dy)
            controlsZoom(-Math.log(event.scale))
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
        controlsZoom((event.deltaX + event.deltaY + event.deltaZ)/10)
    })

    // Move (keyboard)
    window.addEventListener('keydown', (event) => {
        const power = event.shiftKey ? 0.2 : 0.1
        switch (event.code) {
            case "KeyW":
                case "ArrowUp":
                controlsMove(0, 0, 0, +power)
            break;
            case "KeyS":
                case "ArrowDown":
                controlsMove(0, 0, 0, -power)
            break;
            case "KeyA":
                case "ArrowLeft":
                controlsMove(0, 0, +power, 0)
            break;
            case "KeyD":
                case "ArrowRight":
                controlsMove(0, 0, -power, 0)
            break;
            case "Space":
                controlsZoom(event.shiftKey ? +5 : -5)
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

    window.addEventListener("message", ({ data }) => {
        if ("password" in data) {
            password = data.password
            $toggle.removeAttribute("disabled")
            $toggle.textContent = "3D"
            loadEncryptedTextures()
        }
        if ("mode" in data) {
            mode = data.mode
        }
        if ("places" in data) {
            places = data.places
            initOverlay()
        }
        if ("place" in data) {
            place = data.place
            cam.sbj = [place.x, place.y, place.z]
        }
        if ("matches" in data) {
            matches = data.matches
            if(matches.length) {

                // Find most extreme points using amazing functional programming
                const minMax = matches // [ "room_A_101", "room_A_102", ... ]
                .map(match => places[match]) // [ { x:1, y:1, z:1 }, { x:2, y:2, z:2 }, ... ]
                .filter(place => ("x" in place) && ("y" in place) && ("z" in place))
                .map(place => [place.x, place.y, place.z]) // [ [1,1,1], [2,2,2], ... ]
                .reduce(
                    (extremes, currentPlace) => ( [x,y,z].map( 
                        (i) => ( [Math.min, Math.max].map(
                            (func, j) => func(extremes[i][j], currentPlace[i])
                        ) )
                    ) ), 
                    [[X,0],[Y,0],[Z,0]]
                ) // [ [1, 999], [1, 999], [1, 999] ]

                // Move camera subject to average of the most extreme points
                cam.sbj = minMax.map(([min, max]) => (min+max)/2) // [ 500, 500, 500 ]

                // Move camera subject up based on distance between the most extreme points
                cam.sbj[z] += Z + vec.magnitude(minMax.map(([min, max]) => max - min))/3

                // Rotate camera straight down
                cam.rot = [0,0,0]
            }
        }
    })
}


async function updateState(now) {

    // Update array of times for calculating average framerate
    times.pop()
    times.unshift(start_time + now)

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
    cam.rot[x] = clamps(cam.rot[x], 0, Math.PI)

    controls.move[x] = controls.move[y] = controls.move[z] = 0
    controls.rot[x] = controls.rot[y] = controls.rot[z] = 0

    const orbit_radius = cam.sbj[z]
    cam.orbit_matrix = m4.multiply(
        m4.translation(...cam.sbj),
        m4.zRotation(cam.rot[z]),
        m4.xRotation(cam.rot[x]),
        m4.translation(0, 0, orbit_radius)
    )
    cam.pos = m4.v4(cam.orbit_matrix, [0, 0, 0, 1]).slice(0,3)

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
        //m4.xRotation(cam.rot[x]),
        m4.inv_projection(fstop(fov), aspect, near, far)
    )

    let hour = 4 * time / 1000 / 60 / 60 / 12 * Math.PI - 0.5
    weather.sun[x] = Math.sin(hour) * Math.sqrt(3 / 4)
    weather.sun[y] = Math.sin(hour) * Math.sqrt(1 / 4)
    weather.sun[z] = Math.abs(Math.cos(hour))

    const num = x => x.toFixed(1)

    const fps = 1000 / delta
    const avg_fps = (N_time_samples - 1) / (time - times[N_time_samples - 1])

    if (!get_param("clean")) debug.innerText =
            `${size.map(num).join(" x ")} @ ${num(fps)} ~ ${num(avg_fps)} fps
        position: ${cam.pos.map(num).join(", ")}
        velocity: ${cam.vel.map(num).join(", ")}
    `

    if (frame % 60 == 0) {
        url.searchParams.set("cam", encodeURIComponent(JSON.stringify(cam)))
        window.history.replaceState(null, "", url.toString())
    }

}

async function resize() {
    size[x] = window.innerWidth * window.devicePixelRatio
    size[y] = window.innerHeight * window.devicePixelRatio
    $map.width = $overlay.width = size[x]
    $map.height = $overlay.height = size[y]
    $overlay.setAttribute("viewBox", [0,0,...size].join(" "))
}

