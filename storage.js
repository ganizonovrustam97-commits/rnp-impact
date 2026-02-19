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
        MARKETERS: 'marketers',
        DECOMPOSITION: 'decomposition',
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
            this.KEYS.USERS,
            this.KEYS.MARKETERS,
            this.KEYS.DECOMPOSITION
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

    /**
     * Helper to map consistent keys for LocalStorage
     */
    getMappedKey(key) {
        if (key === 'rnp_managers') return this.KEYS.MANAGERS;
        if (key === 'rnp_experts') return this.KEYS.EXPERTS;
        if (key === 'rnp_manager_reports') return this.KEYS.MANAGER_REPORTS;
        if (key === 'rnp_expert_sales') return this.KEYS.EXPERT_SALES;
        if (key === 'rnp_marketing_reports') return this.KEYS.MARKETING_REPORTS;
        if (key === 'rnp_history') return this.KEYS.HISTORY;
        if (key === 'rnp_users') return this.KEYS.USERS;
        if (key === 'rnp_marketers') return this.KEYS.MARKETERS;
        if (key === 'rnp_decomposition') return this.KEYS.DECOMPOSITION;
        if (key === 'rnp_last_month') return 'rnp_last_month'; // Marker
        return key;
    },

    get(key) {
        try {
            const mappedKey = this.getMappedKey(key);
            const data = localStorage.getItem(mappedKey);
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
        const mappedKey = this.getMappedKey(key);
        // 1. Оптимистичное обновление локально
        localStorage.setItem(mappedKey, JSON.stringify(value));

        let collectionName = mappedKey;

        // 2. Отправка в Firestore
        if (window.FirebaseConfig && window.FirebaseConfig.db) {
            console.log(`📤 SYNC: Attempting to save [${collectionName}]...`, value);
            const db = window.FirebaseConfig.db;

            try {
                if (Array.isArray(value)) {
                    if (value.length === 0) {
                        console.log(`ℹ️ [${collectionName}] list empty, nothing to sync.`);
                        return true;
                    }
                    const promises = value.map(item => {
                        let docId;
                        if (collectionName === 'expertSales' && item.expertId && item.date) {
                            docId = `${item.expertId}_${item.date}`;
                        } else if (collectionName === 'managerReports' && item.managerId && item.date) {
                            docId = `${item.managerId}_${item.date}`;
                        } else {
                            docId = String(item.id || item._docId || db.collection(collectionName).doc().id);
                        }
                        const { _docId, ...dataToSave } = item;
                        return db.collection(collectionName).doc(docId).set(dataToSave, { merge: true });
                    });
                    await Promise.all(promises);
                    console.log(`✅ SYNC: Cloud updated [${collectionName}]`);
                } else if (key === 'rnp_last_month') {
                    await db.collection(this.KEYS.LAST_MONTH_MARKER).doc('config').set({ lastMonthMarker: value });
                    console.log(`✅ SYNC: Cloud updated settings`);
                }
            } catch (e) {
                console.error(`❌ SYNC ERROR [${collectionName}]:`, e.message);
            }
        } else {
            console.warn("⚠️ SYNC DISABLED: Firestore not initialized. Check firebase-config.js");
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
            { old: 'rnp_users', new: this.KEYS.USERS, val: [] },
            { old: 'rnp_marketers', new: this.KEYS.MARKETERS, val: [] },
            { old: 'rnp_decomposition', new: this.KEYS.DECOMPOSITION, val: [] }
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
        const fromNew = this.get(this.KEYS.MANAGERS);
        if (fromNew && fromNew.length > 0) return fromNew;
        return this.get('rnp_managers') || [];
    },

    getExperts() {
        if (window.AppState?.isArchiveMode && window.AppState.archiveData) return window.AppState.archiveData.experts || [];
        const fromNew = this.get(this.KEYS.EXPERTS);
        if (fromNew && fromNew.length > 0) return fromNew;
        return this.get('rnp_experts') || [];
    },

    getMarketers() {
        if (window.AppState?.isArchiveMode && window.AppState.archiveData) return window.AppState.archiveData.marketers || [];
        const fromNew = this.get(this.KEYS.MARKETERS);
        if (fromNew && fromNew.length > 0) return fromNew;
        return this.get('rnp_marketers') || [];
    },

    getManagerReports() {
        if (window.AppState?.isArchiveMode && window.AppState.archiveData) return window.AppState.archiveData.managerReports || [];
        const fromNew = this.get(this.KEYS.MANAGER_REPORTS);
        const raw = (fromNew && fromNew.length > 0) ? fromNew : (this.get('rnp_manager_reports') || []);
        // Дедупликация: одна запись на managerId+date (последняя побеждает)
        const map = new Map();
        raw.forEach(r => map.set(`${r.managerId}_${r.date}`, r));
        return Array.from(map.values());
    },

    getExpertSales() {
        if (window.AppState?.isArchiveMode && window.AppState.archiveData) return window.AppState.archiveData.expertSales || [];
        const fromNew = this.get(this.KEYS.EXPERT_SALES);
        const raw = (fromNew && fromNew.length > 0) ? fromNew : (this.get('rnp_expert_sales') || []);
        // Дедупликация: одна запись на expertId+date (последняя побеждает)
        const map = new Map();
        raw.forEach(s => map.set(`${s.expertId}_${s.date}`, s));
        return Array.from(map.values());
    },

    getMarketingReports() {
        if (window.AppState?.isArchiveMode && window.AppState.archiveData) return window.AppState.archiveData.marketingReports || [];
        const fromNew = this.get(this.KEYS.MARKETING_REPORTS);
        if (fromNew && fromNew.length > 0) return fromNew;
        return this.get('rnp_marketing_reports') || [];
    },

    getHistory() {
        return this.get('rnp_history') || [];
    },

    getUsers() {
        return this.get('rnp_users') || [];
    },

    getDecomposition() {
        if (window.AppState?.isArchiveMode && window.AppState.archiveData) return window.AppState.archiveData.decomposition || [];
        return this.get('rnp_decomposition') || [];
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
        const idx = list.findIndex(m => m.id == id);
        if (idx !== -1) {
            list[idx] = { ...list[idx], ...updates };
            this.set('rnp_managers', list);
            // Cloud Update
            if (window.FirebaseConfig?.db) {
                window.FirebaseConfig.db.collection(this.KEYS.MANAGERS).doc(String(id)).update(updates);
            }
            return true;
        }
        return false;
    },
    deleteManager(id) {
        let list = this.getManagers();
        list = list.filter(m => m.id !== id);
        this.set('rnp_managers', list);
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
            // Cloud Update
            if (window.FirebaseConfig?.db) {
                window.FirebaseConfig.db.collection(this.KEYS.EXPERTS).doc(String(id)).update(updates);
            }
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

    // Маркетологи
    addMarketer(marketer) {
        const list = this.getMarketers();
        marketer.id = marketer.id || 'mark' + Date.now();
        list.push(marketer);
        this.set('rnp_marketers', list);
        return marketer;
    },
    updateMarketer(id, updates) {
        const list = this.getMarketers();
        const idx = list.findIndex(m => m.id == id);
        if (idx !== -1) {
            list[idx] = { ...list[idx], ...updates };
            this.set('rnp_marketers', list);
            if (window.FirebaseConfig?.db) {
                window.FirebaseConfig.db.collection(this.KEYS.MARKETERS).doc(String(id)).update(updates);
            }
            return true;
        }
        return false;
    },
    deleteMarketer(id) {
        let list = this.getMarketers();
        list = list.filter(m => m.id !== id);
        this.set('rnp_marketers', list);
        if (window.FirebaseConfig?.db) {
            window.FirebaseConfig.db.collection(this.KEYS.MARKETERS).doc(String(id)).delete();
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

    clearCurrentMonthData(startDate, endDate) {
        if (!startDate || !endDate) {
            this.set('rnp_manager_reports', []);
            this.set('rnp_expert_sales', []);
            this.set('rnp_marketing_reports', []);
            return;
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        const filterFn = r => {
            const d = new Date(r.date);
            return d < start || d > end;
        };

        const mReports = (this.get('rnp_manager_reports') || []).filter(filterFn);
        const eSales = (this.get('rnp_expert_sales') || []).filter(filterFn);
        const markReports = (this.get('rnp_marketing_reports') || []).filter(filterFn);

        this.set('rnp_manager_reports', mReports);
        this.set('rnp_expert_sales', eSales);
        this.set('rnp_marketing_reports', markReports);
    },

    // Helpers used in UI
    getManagerReportsByPeriod(managerId, startDate, endDate) {
        return this.getManagerReports().filter(r => {
            const d = new Date(r.date);
            return r.managerId == managerId && d >= new Date(startDate) && d <= new Date(endDate);
        });
    },
    getExpertSalesByPeriod(expertId, startDate, endDate) {
        return this.getExpertSales().filter(s => {
            const d = new Date(s.date);
            return s.expertId == expertId && d >= new Date(startDate) && d <= new Date(endDate);
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
