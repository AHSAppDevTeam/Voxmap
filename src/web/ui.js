import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/9.9.1/firebase-app.js"
import {
    getDatabase,
    ref,
    get
} from "https://www.gstatic.com/firebasejs/9.9.1/firebase-database.js"
import {
    getAuth,
    signInWithPopup,
    GoogleAuthProvider
} from "https://www.gstatic.com/firebasejs/9.9.1/firebase-auth.js"

const firebaseConfig = {
    apiKey: "AIzaSyDweQSkpqQSGP42qBgoiSm5VAhDoe9dJA8",
    authDomain: "arcadia-high-mobile.firebaseapp.com",
    databaseURL: "https://ahs-app.firebaseio.com",
    projectId: "arcadia-high-mobile",
    storageBucket: "arcadia-high-mobile.appspot.com",
    messagingSenderId: "654225823864",
    appId: "1:654225823864:web:944772a5cadae0c8b7758d",
    measurementId: "G-YGN0551PM8"
}

const $map = document.getElementById("map")
const $signin = document.getElementById("signin")
const $searchInput = document.getElementById("search-input")
const $searchReset = document.getElementById("search-reset")

const $places = document.getElementById("places")
const $placeLists = document.getElementById("place-lists")


// Initialize Firebase
const app = initializeApp(firebaseConfig)
const database = getDatabase()

const auth = getAuth(app)
const provider = new GoogleAuthProvider()
provider.setCustomParameters({
    hd: 'ausd.net'
})

const placesRef = ref(database, 'places')
const placeListsRef = ref(database, 'placeLists')
const passwordRef = ref(database, 'ausd-secrets/map')
let places, placeLists, password
let mode = 0
let authed = false

loadPlaces()
load3D()

$signin.addEventListener("click", event => {
    event.preventDefault()
    signInWithPopup(auth, provider)
    .then((result) => {
        // This gives you a Google Access Token. You can use it to access the Google API.
        const credential = GoogleAuthProvider.credentialFromResult(result)
        const token = credential.accessToken
        // The signed-in user info.
        const user = result.user
        console.log(result)
        // ...
    }).catch((error) => {
        // Handle Errors here.
        const errorCode = error.code
        const errorMessage = error.message
        // The email of the user's account used.
        const email = error.customData.email
        // The AuthCredential type that was used.
        const credential = GoogleAuthProvider.credentialFromError(error)
        // ...
    }).then(load3D)
})

function filterPlaces() {
    let query = simplify($searchInput.value)
    $placeLists.classList.toggle("search", query)
    const placeIDs = []
    for(const $placeList of $placeLists.children){
        const $placeListDetails = $placeList.firstChild
        let contains = false
        for(const $place of $placeListDetails.lastChild.children){
            const match = query && simplify($place.name).startsWith(query)
            $place.classList.toggle("match", match)
            if(match) placeIDs.push($place.id)
                contains |= match
        }
        $placeListDetails.open = contains
    }
    focusPlaces(placeIDs)
}

$searchInput.addEventListener("input", filterPlaces)
$searchReset.addEventListener("click", () => {
    $searchInput.value = ""
    filterPlaces()
})

const simplify = query => query.replace(/[\s-]/g, "").toLowerCase()

const sort = (obj, key) =>
Object.fromEntries(
    Object.entries(obj)
    .sort((a, b) => key ? a[1][key] - b[1][key] : a[1] - b[1])
)

async function loadPlaces() {

    await get(placesRef).then((snapshot) => {
        places = sort(snapshot.val())
        $map.contentWindow.postMessage({places}, "*")
    })

    await get(placeListsRef).then((snapshot) => {

        // Remove outdated placeLists
        while ($placeLists.firstChild)
            $placeLists.removeChild($placeLists.firstChild)

        // Sort by database sort key
        placeLists = sort(snapshot.val(), "sort")

        // Draw new placeLists
        for (const placeListKey in placeLists) {
            const placeList = placeLists[placeListKey]
            if(!placeList.places || !placeList.name) continue

                const $placeList = document.createElement("li")
                $placeList.classList.add("place-list")

                const $placeListDetails = document.createElement("details")
                $placeListDetails.classList.add("place-list-details")

                // Add the name & icon of the placeList collection
                $placeList.name = placeList.name
                const $placeListIcon = document.createElement("summary")
                $placeListIcon.title = placeList.name
                $placeListIcon.textContent = placeList.icon
                $placeListIcon.classList.add("place-list-icon")
                $placeListIcon.classList.add("material-symbols-outlined")

                // Add the individual places
                const $places = document.createElement("ul")
                $places.classList.add("place-list-places")
                const placeKeys = Object.fromEntries(
                    Object.entries(placeList.places)
                    .sort((a, b) => (a[1] - b[1]))
                )
                for (const placeKey in placeKeys) {
                    const place = places[placeKey]
                    if(!place) continue

                        const $place = document.createElement("li")
                        $place.classList.add("place")
                        $place.id = placeKey
                        $place.textContent = $place.name = place.name
                        $place.addEventListener("click", event => {
                            focusPlaces([placeKey])
                        })
                        $places.append($place)
                }

                $placeListDetails.append($placeListIcon, $places)
                $placeList.append($placeListDetails)
                $placeLists.append($placeList)
        }
    })
}

async function focusPlaces(placeIDs) {
    $map.contentWindow.postMessage({ focusPlaces: placeIDs })
}

async function load3D() {
    get(passwordRef).then((snapshot) => {
        $signin.style.display = "none"
        password = snapshot.val()
        $map.focus()
        $map.contentWindow.postMessage({password}, "*")
    })
}
