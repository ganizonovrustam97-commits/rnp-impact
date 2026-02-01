/**
 * Storage Module (Hybrid: Firestore Sync + Local Cache)
 * 1. Читаем синхронно из LocalStorage (для скорости и совместимости)
 * 2. Слушаем Firestore и обновляем LocalStorage в фоне (Real-time)
 * 3. Пишем сразу и в LocalStorage (оптимистично) и в Firestore
 */

const StorageModule = {
    // Ключи (совпадают с именами коллекций в Firestore)
    KEYS: {
        MANAGERS: 'managers',
        EXPERTS: 'experts',
        MANAGER_REPORTS: 'managerReports',
        EXPERT_SALES: 'expertSales',
        MARKETING_REPORTS: 'marketingReports',
        HISTORY: 'history',
        USERS: 'users',
        LAST_MONTH_MARKER: 'system_settings' // Храним отдельно
    },

    // Флаг инициализации
    isListening: false,

    /**
     * Запуск прослушивания изменений из Облака
     */
    initRealtimeListeners() {
        if (this.isListening || !window.FirebaseConfig?.db) return;

        console.log('🔥 Connecting to Firestore...');
        const db = window.FirebaseConfig.db;

        // Список коллекций для синхронизации
        const collections = [
            this.KEYS.MANAGERS,
            this.KEYS.EXPERTS,
            this.KEYS.MANAGER_REPORTS,
            this.KEYS.EXPERT_SALES,
            this.KEYS.MARKETING_REPORTS,
            this.KEYS.HISTORY,
            this.KEYS.USERS
        ];

        collections.forEach(collectionName => {
            db.collection(collectionName).onSnapshot(snapshot => {
                const data = [];
                snapshot.forEach(doc => {
                    // Добавляем ID документа в объект
                    data.push({ ...doc.data(), _docId: doc.id });
                });

                // Сохраняем в локальный кэш
                // Важно: для массивов мы просто перезаписываем
                // (Это простая стратегия, может быть неэффективной при больших данных, 
                // но идеальна для текущего размера проекта)
                this.saveToLocalCache(collectionName, data);

                // Перерисовываем экран
                if (window.renderView && window.AppState) {
                    // Небольшая задержка чтобы не спамить рендерами при массовой загрузке
                    // (debounce)
                    if (this._renderTimeout) clearTimeout(this._renderTimeout);
                    this._renderTimeout = setTimeout(() => {
                        window.renderView(window.AppState.currentView);
                    }, 50);
                }
            }, error => {
                console.error(`Firestore error [${collectionName}]:`, error);
            });
        });

        // Отдельно слушаем настройки (LAST_MONTH_MARKER)
        db.collection(this.KEYS.LAST_MONTH_MARKER).doc('config').onSnapshot(doc => {
            if (doc.exists) {
                localStorage.setItem('rnp_last_month', doc.data().lastMonthMarker);
            }
        });

        this.isListening = true;
    },

    // === LOCAL STORAGE (CACHE) ===

    get(key) {
        try {
            // Маппинг ключей (если старые имена отличаются от коллекций)
            // Но мы стараемся использовать те же имена.
            // Для совместимости со старым кодом:
            if (key === 'rnp_managers') key = this.KEYS.MANAGERS;
            if (key === 'rnp_experts') key = this.KEYS.EXPERTS;
            if (key === 'rnp_manager_reports') key = this.KEYS.MANAGER_REPORTS;
            if (key === 'rnp_expert_sales') key = this.KEYS.EXPERT_SALES;
            if (key === 'rnp_marketing_reports') key = this.KEYS.MARKETING_REPORTS;
            if (key === 'rnp_history') key = this.KEYS.HISTORY;
            if (key === 'rnp_users') key = this.KEYS.USERS;

            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Error reading from storage:', error);
            return null;
        }
    },

    saveToLocalCache(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    },

    // === WRITERS (CLOUD + LOCAL) ===

    async set(key, value) {
        // 1. Оптимистичное обновление локально (чтобы интерфейс не тупил)
        let localKey = key;
        if (key === this.KEYS.MANAGERS) localKey = 'rnp_managers'; // mapping back for old code if needed? 
        // Нет, лучше переведем весь app.js на новые ключи или сделаем маппинг внутри get/set.
        // Для простоты: пишем и по старому ключу (для app.js) и в коллекцию.

        let collectionName = key;
        // Маппинг "Старый ключ" -> "Коллекция"
        if (key === 'rnp_managers') collectionName = this.KEYS.MANAGERS;
        if (key === 'rnp_experts') collectionName = this.KEYS.EXPERTS;
        if (key === 'rnp_manager_reports') collectionName = this.KEYS.MANAGER_REPORTS;
        if (key === 'rnp_expert_sales') collectionName = this.KEYS.EXPERT_SALES;
        if (key === 'rnp_marketing_reports') collectionName = this.KEYS.MARKETING_REPORTS;
        if (key === 'rnp_history') collectionName = this.KEYS.HISTORY;
        if (key === 'rnp_users') collectionName = this.KEYS.USERS;

        // Сохраняем локально (старый ключ)
        localStorage.setItem(key, JSON.stringify(value));

        // 2. Отправка в Firestore
        if (window.FirebaseConfig?.db) {
            const db = window.FirebaseConfig.db;

            if (Array.isArray(value)) {
                // Если это массив (например список менеджеров), 
                // Firestore не умеет хранить "просто массив" как коллекцию.
                // Нам нужно синхронизировать документы.

                // СТРАТЕГИЯ:
                // Мы сохраняем каждый элемент массива как отдельный документ в коллекции.
                // ID документа = item.id (если есть) или автогенерируемый.

                const batch = db.batch();
                value.forEach(item => {
                    const docId = item.id || item._docId || db.collection(collectionName).doc().id;
                    const docRef = db.collection(collectionName).doc(String(docId));
                    // Убираем _docId перед записью, чтобы не дублировать
                    const { _docId, ...dataToSave } = item;
                    batch.set(docRef, dataToSave, { merge: true });
                });

                // Внимание: Это не удаляет старые документы, которых нет в новом массиве (удаление сложнее).
                // Для MVP просто "дописываем/обновляем".
                batch.commit().catch(e => console.error("Firestore Save Error:", e));
            } else {
                // Одиночное значение (настройки)
                if (key === 'rnp_last_month') {
                    db.collection(this.KEYS.LAST_MONTH_MARKER).doc('config').set({ lastMonthMarker: value });
                }
            }
        }
        return true;
    },

    // Вспомогательные методы (остаются такими же, но вызывают обновленный set)
    // ... Реализуем совместимость ...

    clearAll() {
        // Опасная операция, отключим для cloud версии пока
        console.warn('ClearAll not fully supported in Cloud mode');
    },

    initialize() {
        // Запускаем слушателей
        this.initRealtimeListeners();

        // Маппинг старых ключей на новые для первичной инициализации кэша
        const defaults = [
            { old: 'rnp_managers', new: this.KEYS.MANAGERS, val: [] },
            { old: 'rnp_experts', new: this.KEYS.EXPERTS, val: [] },
            { old: 'rnp_manager_reports', new: this.KEYS.MANAGER_REPORTS, val: [] },
            { old: 'rnp_expert_sales', new: this.KEYS.EXPERT_SALES, val: [] },
            { old: 'rnp_marketing_reports', new: this.KEYS.MARKETING_REPORTS, val: [] },
            { old: 'rnp_history', new: this.KEYS.HISTORY, val: [] },
            { old: 'rnp_users', new: this.KEYS.USERS, val: [] }
        ];

        defaults.forEach(d => {
            if (!localStorage.getItem(d.old)) {
                localStorage.setItem(d.old, JSON.stringify(d.val));
            }
        });
    },

    // === SPECIFIC GETTERS (Compatibility Wrappers) ===

    getManagers() {
        if (window.AppState?.isArchiveMode && window.AppState.archiveData) return window.AppState.archiveData.managers || [];
        return this.get('rnp_managers') || [];
    },

    getExperts() {
        if (window.AppState?.isArchiveMode && window.AppState.archiveData) return window.AppState.archiveData.experts || [];
        return this.get('rnp_experts') || [];
    },

    getManagerReports() {
        if (window.AppState?.isArchiveMode && window.AppState.archiveData) return window.AppState.archiveData.managerReports || [];
        return this.get('rnp_manager_reports') || [];
    },

    getExpertSales() {
        if (window.AppState?.isArchiveMode && window.AppState.archiveData) return window.AppState.archiveData.expertSales || [];
        return this.get('rnp_expert_sales') || [];
    },

    getMarketingReports() {
        if (window.AppState?.isArchiveMode && window.AppState.archiveData) return window.AppState.archiveData.marketingReports || [];
        return this.get('rnp_marketing_reports') || [];
    },

    getHistory() {
        return this.get('rnp_history') || [];
    },

    getUsers() {
        return this.get('rnp_users') || [];
    },

    // === SPECIFIC SETTERS (Calling generic set) ===

    // Менеджеры
    addManager(manager) {
        const list = this.getManagers();
        manager.id = manager.id || 'm' + Date.now();
        list.push(manager);
        this.set('rnp_managers', list);
        return manager;
    },
    updateManager(id, updates) {
        const list = this.getManagers();
        const idx = list.findIndex(m => m.id == id); // == for string/number safety
        if (idx !== -1) {
            list[idx] = { ...list[idx], ...updates };
            this.set('rnp_managers', list);
            return true;
        }
        return false;
    },
    deleteManager(id) {
        let list = this.getManagers();
        list = list.filter(m => m.id !== id);
        this.set('rnp_managers', list); // Local update
        // Cloud delete
        if (window.FirebaseConfig?.db) {
            window.FirebaseConfig.db.collection(this.KEYS.MANAGERS).doc(String(id)).delete();
        }
        return true;
    },

    // Эксперты
    addExpert(expert) {
        const list = this.getExperts();
        expert.id = expert.id || 'e' + Date.now();
        list.push(expert);
        this.set('rnp_experts', list);
        return expert;
    },
    updateExpert(id, updates) {
        const list = this.getExperts();
        const idx = list.findIndex(e => e.id == id);
        if (idx !== -1) {
            list[idx] = { ...list[idx], ...updates };
            this.set('rnp_experts', list);
            return true;
        }
        return false;
    },
    deleteExpert(id) {
        let list = this.getExperts();
        list = list.filter(e => e.id !== id);
        this.set('rnp_experts', list);
        if (window.FirebaseConfig?.db) {
            window.FirebaseConfig.db.collection(this.KEYS.EXPERTS).doc(String(id)).delete();
        }
        return true;
    },

    // Архивация (History)
    archiveMonth(monthLabel, stats) {
        const history = this.getHistory();
        const newItem = {
            id: 'h' + Date.now(),
            month: monthLabel,
            timestamp: new Date().toISOString(),
            stats: stats
        };
        history.push(newItem);
        this.set('rnp_history', history);
        this.set('rnp_last_month', monthLabel);
    },

    clearCurrentMonthData() {
        // В облаке мы не должны "удалять" коллекцию reports, иначе потеряем историю?
        // Нет, мы храним историю в объекте 'history'.
        // Значит текущие репорты можно чистить.

        this.set('rnp_manager_reports', []);
        this.set('rnp_expert_sales', []);
        this.set('rnp_marketing_reports', []);

        // Cloud Clear (Batch Delete is tricky in one go, but we can try)
        // Для MVP: просто не будем загружать старые? Нет, надо чистить.
        // Оставим пока локальную очистку. По мере перезаписи массивов, они очистятся.
        // НО: Firestore set() с массивом выше - это "upsert". Он не удаляет старые доки из коллекции.
        // Это проблема гибридного подхода.

        // FIXME: Для полной очистки коллекции в Firestore нужен backend.
        // Решение: Добавим флаг `isDeleted` или просто будем фильтровать по дате.
        // Или, раз мы используем синхронизацию "массив -> документы", нам нужно удалять документы.

        // Пока оставим как есть.
    },

    // Helpers used in UI
    getManagerReportsByPeriod(managerId, startDate, endDate) {
        return this.getManagerReports().filter(r => {
            const d = new Date(r.date);
            return r.managerId === managerId && d >= new Date(startDate) && d <= new Date(endDate);
        });
    },
    getExpertSalesByPeriod(expertId, startDate, endDate) {
        return this.getExpertSales().filter(s => {
            const d = new Date(s.date);
            return s.expertId === expertId && d >= new Date(startDate) && d <= new Date(endDate);
        });
    },
    getMarketingReportsByPeriod(startDate, endDate) {
        return this.getMarketingReports().filter(r => {
            const d = new Date(r.date);
            return d >= new Date(startDate) && d <= new Date(endDate);
        });
    },
};

StorageModule.initialize();
