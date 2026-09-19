import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDvbjhHdu7-FThxPv6B_UYM_HrtOy425bw",
  authDomain: "rifa-sthe.firebaseapp.com",
  projectId: "rifa-sthe",
  storageBucket: "rifa-sthe.firebasestorage.app",
  messagingSenderId: "954135608185",
  appId: "1:954135608185:web:e60704da066dc06858cda8"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Inicializa e exporta a base de dados (Firestore)
export const db = getFirestore(app);