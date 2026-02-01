/**
 * Firebase Configuration & Initialization
 */

// Поскольку мы используем CDN версию без сборщика (Webpack), 
// мы будем использовать глобальный объект `firebase` из скриптов в index.html
// (compat версия)

const firebaseConfig = {
    apiKey: "AIzaSyA15pwZj10k0tvjK0s5Poly_0TEmJGBMeQ",
    authDomain: "rustam-21c98.firebaseapp.com",
    projectId: "rustam-21c98",
    storageBucket: "rustam-21c98.firebasestorage.app",
    messagingSenderId: "566986718548",
    appId: "1:566986718548:web:2f736a3fd72b0510771cc1",
    measurementId: "G-W3GSS00CDM"
};

let db;
let auth;

try {
    // Инициализация Firebase (проверка на повторную инициализацию)
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }

    // Инициализация сервисов
    db = firebase.firestore();
    auth = firebase.auth();

    // Включаем оффлайн-поддержку (кэширование)
    db.enablePersistence()
        .catch((err) => {
            if (err.code == 'failed-precondition') {
                console.warn('Firebase persistense failed: Multiple tabs open');
            } else if (err.code == 'unimplemented') {
                console.warn('Firebase persistense not supported by browser');
            }
        });

    console.log("Firebase initialized successfully");

} catch (error) {
    console.error("Error initializing Firebase:", error);
}

// Экспортируем глобально для использования в других модулях
window.FirebaseConfig = {
    db: db,
    auth: auth
};
