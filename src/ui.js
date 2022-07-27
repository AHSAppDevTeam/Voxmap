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

signin.addEventListener("click", () => {
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

    const keyRef = ref(database, 'places/key/name');
    onValue(keyRef, (snapshot) => {
        map.src = "map.html?quality=3&password=" + snapshot.val()
        map.focus()
    });
    signin.style.display = "none"
  })
})

