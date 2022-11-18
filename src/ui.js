import { initializeApp } from "https://www.gstatic.com/firebasejs/9.9.1/firebase-app.js"
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/9.9.1/firebase-database.js"
import { getAuth, signInWithPopup, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/9.9.1/firebase-auth.js"

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
const $search = document.getElementById("search")

// Initialize Firebase
const app = initializeApp(firebaseConfig)
const database = getDatabase()

const auth = getAuth(app)
const provider = new GoogleAuthProvider()
provider.setCustomParameters({ hd: 'ausd.net' })

const placesRef = ref(database, 'places')
const placeListsRef = ref(database, 'placeLists')
const passwordRef = ref(database, 'ausd-secrets/map')
let places, placeLists, password
let mode = 0
let authed = false

display2D()
display3D()

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
  }).then(display3D)
})

const sort = (obj, key) => 
    Object.fromEntries(
      Object.entries(obj)
      .sort((a, b) => key ? a[1][key]-b[1][key] : a[1]-b[1] )
    )

async function display2D() {

    const $places = document.getElementById("places")
    const $placeLists = document.getElementById("placeLists")

    await get(placesRef).then((snapshot) => {
        places = sort(snapshot.val())
        //$map.contentWindow.postMessage({ places }, "*")
    })

    await get(placeListsRef).then((snapshot) => {
        while($placeLists.firstChild) 
            $placeLists.removeChild($placeLists.firstChild)

        placeLists = sort(snapshot.val(), "sort")

        for(const placeListKey in placeLists) {
          const placeList = placeLists[placeListKey]
          const $placeList = document.createElement("li")

          const $icon = document.createElement("span")
          $icon.textContent = placeList.icon
          $icon.classList.add("material-symbols-outlined")

          $placeList.append($icon, placeList.name)
          $placeList.addEventListener("click", event => {
            while($places.firstChild) 
                $places.removeChild($places.firstChild)

            $placeList.after($places)

            const placeKeys = Object.fromEntries(
              Object.entries(placeList.places)
              .sort((a, b) => (a[1] - b[1]))
            )
            console.log(placeKeys)
            for(const placeKey in placeKeys) {
              const $place = document.createElement("li")
              const place = places[placeKey]
              $place.textContent = place.name
              $place.addEventListener("click", event => {
                $map.contentWindow.postMessage({ place }, "*")
              })
              $places.append($place)
            }
          })

          $placeLists.append($placeList)
        }
    })
}

async function display3D() {
    $signin.style.display = "none"
    get(passwordRef).then((snapshot) => {
        password = snapshot.val()
        $map.src = "map.html?quality=2&password=" + password
        $map.focus()
        $map.addEventListener("load",()=>{
          $map.contentWindow.postMessage({ places }, "*")
        })
    })
}

