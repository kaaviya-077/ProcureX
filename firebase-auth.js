import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';

const placeholderValues = Object.values(firebaseConfig).some((value) => value.includes('replace-with-'));
let auth = null;
let firebaseConfigurationError = null;

if (placeholderValues) {
  firebaseConfigurationError = new Error('Firebase web configuration is still using placeholder values.');
} else {
  try {
    const firebaseApp = initializeApp(firebaseConfig);
    auth = getAuth(firebaseApp);
  } catch (error) {
    firebaseConfigurationError = error;
  }
}

export {
  auth,
  firebaseConfigurationError,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
};