/**
 * Firebase Configuration & Initialization
 */

// Поскольку мы используем CDN версию без сборщика (Webpack), 
// мы будем использовать глобальный объект `firebase` из скриптов в index.html
// (compat версия)

const firebaseConfig = {
    apiKey: "AIzaSyBlbQQ_athNeDrRCAMjVavLlW6MQEeh1c0",
    authDomain: "rnp-impact.firebaseapp.com",
    projectId: "rnp-impact",
    storageBucket: "rnp-impact.firebasestorage.app",
    messagingSenderId: "89805533431",
    appId: "1:89805533431:web:85fd9fe535e85674ac23f2",
    measurementId: "G-DJVDNE7BPB"
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
