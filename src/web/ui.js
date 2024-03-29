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
        authed = true
        load3D()
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
    })
})

function filterPlaces(input) {
    $searchInput.value = input

    let query = simplify(input)
    $placeLists.classList.toggle("search", query)
    const placeIDs = []
    for(const $placeList of $placeLists.children){
        const $placeListDetails = $placeList.firstChild
        let contains = false
        for(const $place of $placeListDetails.lastChild.children){
            const match = query && $place.name.split(",")
            .some(word=>simplify(word).startsWith(query))

            $place.classList.toggle("match", match)
            if(match) placeIDs.push($place.id)
                contains |= match
        }
        $placeListDetails.open = contains
    }
    $map.contentWindow.postMessage({ matches: placeIDs })
}

$searchInput.addEventListener("input", () => filterPlaces($searchInput.value))
$searchReset.addEventListener("click", () => filterPlaces(""))


async function loadPlaces() {

    await get(placesRef).then((snapshot) => {
        places = sort(snapshot.val())
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
                $placeListIcon.addEventListener("click", () => {
                    $placeLists.classList.remove("search")
                })

                // Add the individual places
                const $places = document.createElement("ul")
                $places.classList.add("place-list-places")
                const placeKeys = sort(placeList.places)
                for (const placeKey in placeKeys) {
                    const place = places[placeKey]
                    if(!place) continue;

                    const $place = document.createElement("li")
                    $place.classList.add("place")
                    $place.id = placeKey
                    $place.textContent = place.name
                    $place.name = (("short" in place) ? [place.short, ...place.short.split(" ")] : [])
                        .concat([place.name, ...place.name.split(" ")]).join(",")

                    $place.addEventListener("click", () => filterPlaces(place.name))
                    $places.append($place)
                }

                $placeListDetails.append($placeListIcon, $places)
                $placeList.append($placeListDetails)
                $placeLists.append($placeList)
        }
    })
}

async function load3D() {
    get(placesRef).then((snapshot) => {
        places = sort(snapshot.val())
        $map.contentWindow.postMessage({places}, "*")
    })
    get(passwordRef).then(async (snapshot) => {
        $signin.style.display = "none"
        password = snapshot.val()
        $map.focus()
        $map.contentWindow.postMessage({password}, "*")
    })
}

window.addEventListener("load", load3D)
