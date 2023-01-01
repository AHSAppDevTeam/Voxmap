const MODE_2D = 0
const MODE_3D = 1

let mode = MODE_2D
let password = ""
let place = {}
let places = {}
let focusPlaces = []
window.addEventListener("message", ({ data }) => {
    if ("password" in data) {
        password = data.password
        loadEncryptedTextures()
    }
    if ("mode" in data) {
        mode = data.mode
    }
    if ("places" in data) {
        places = data.places
    }
    if ("place" in data) {
        place = data.place
        cam.sbj = [place.x, place.y, place.z]
    }
    if ("focusPlaces" in data) {
        focusPlaces = data.focusPlaces
    }
})
