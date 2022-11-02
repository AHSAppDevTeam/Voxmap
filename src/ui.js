import { initializeApp } from "https://www.gstatic.com/firebasejs/9.9.1/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/9.9.1/firebase-database.js";
import { getAuth, signInWithPopup, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/9.9.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDweQSkpqQSGP42qBgoiSm5VAhDoe9dJA8",
  authDomain: "arcadia-high-mobile.firebaseapp.com",
  databaseURL: "https://ahs-app.firebaseio.com",
  projectId: "arcadia-high-mobile",
  storageBucket: "arcadia-high-mobile.appspot.com",
  messagingSenderId: "654225823864",
  appId: "1:654225823864:web:944772a5cadae0c8b7758d",
  measurementId: "G-YGN0551PM8"
};

const map = document.getElementById("map")
const signin = document.getElementById("signin")
const search = document.getElementById("search")


// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase();
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({
  'hd': 'ausd.net'
})

signin.addEventListener("click", event => {
  event.preventDefault()
signInWithPopup(auth, provider)
  .then((result) => {
    // This gives you a Google Access Token. You can use it to access the Google API.
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential.accessToken;
    // The signed-in user info.
    const user = result.user;
    console.log(result)
    // ...
  }).catch((error) => {
    // Handle Errors here.
    const errorCode = error.code;
    const errorMessage = error.message;
    // The email of the user's account used.
    const email = error.customData.email;
    // The AuthCredential type that was used.
    const credential = GoogleAuthProvider.credentialFromError(error);
    // ...
  }).then(() => {

    display()


  })
})

async function display() {
    let places, placeLists, password

    const $places = document.getElementById("places")
    const $placeLists = document.getElementById("placeLists")

    const placesRef = ref(database, 'places');
    const placeListsRef = ref(database, 'placeLists')

    onValue(placesRef, (snapshot) => {
        places = snapshot.val()
        password = places.key.name
        map.src = "map.html?quality=3&password=" + password
        map.focus()
    })
    onValue(placeListsRef, (snapshot) => {
        while($placeLists.firstChild) 
            $placeLists.removeChild($placeLists.firstChild)

        placeLists = Object.fromEntries(
          Object.entries(snapshot.val())
          .sort((a, b) => (a[1].sort - b[1].sort))
        )
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
                map.contentWindow.postMessage(place, "*")
              })
              $places.append($place)
            }
          })

          $placeLists.append($placeList)
        }
    })
    signin.style.display = "none"
}

