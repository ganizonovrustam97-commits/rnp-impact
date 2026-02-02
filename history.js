/**
 * History Module
 * Логика работы с архивом и историей месяцев
 */

const HistoryModule = {
    /**
     * Рендер раздела истории (Список месяцев)
     */
    renderHistoryView() {
        const historyList = document.getElementById('history-list');
        const history = StorageModule.getHistory();

        if (history.length === 0) {
            historyList.innerHTML = '<div class="no-data">Записей в архиве пока нет</div>';
            return;
        }

        historyList.innerHTML = '<div class="archive-grid">' + history.slice().reverse().map(item => {
            const stats = item.stats;
            const isOld = !stats.rawData;

            return `
                <div class="history-card ${isOld ? 'old-format' : 'interactive'}" onclick="${isOld ? '' : `HistoryModule.loadArchiveView('${item.id}')`}">
                    <div class="history-card-header">
                        <h3>${item.month}</h3>
                        ${isOld ? '<span class="badge badge-secondary">Старый формат</span>' : '<span class="badge badge-success">Просмотр</span>'}
                    </div>
                    
                    <div class="mini-stats-grid" style="margin-top: 10px;">
                        <div class="mini-stat"><span>Выручка:</span> <strong>${Utils.formatCurrency(stats.totalRevenue || 0)}</strong></div>
                        <div class="mini-stat"><span>Продажи:</span> <strong>${stats.totalSales || 0}</strong></div>
                    </div>

                    <div class="history-card-footer" style="margin-top: 10px; font-size: 0.8rem; color: #888">
                        ${isOld ? 'Только общая сводка' : 'Нажмите для просмотра полного отчета'}
                    </div>
                </div>
            `;
        }).join('') + '</div>';
    },

    /**
     * Загрузка архивного месяца для просмотра
     */
    loadArchiveView(historyId) {
        const history = StorageModule.getHistory();
        const item = history.find(h => h.id === historyId);
        if (item) {
            this.loadArchiveState(item);
        }
    },

    /**
     * Вход в режим архива (Симуляция)
     */
    loadArchiveState(historyItem) {
        if (!historyItem.stats.rawData) {
            if (typeof Utils !== 'undefined') {
                Utils.showNotification('Для этого месяца нет детальных данных (старый формат)', 'error');
            } else {
                alert('Для этого месяца нет детальных данных (старый формат)');
            }
            return;
        }

        window.AppState.isArchiveMode = true;
        window.AppState.currentArchiveId = historyItem.id; // ID текущего архива для сохранения изменений
        window.AppState.archiveData = historyItem.stats.rawData;
        window.AppState.archiveMonthLabel = historyItem.month;

        // Парсинг месяца для корректного отображения календаря
        const parts = historyItem.month.split(' ');
        if (parts.length === 2) {
            const monthNames = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
                'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
            const mIndex = monthNames.findIndex(m => m.toLowerCase().startsWith(parts[0].toLowerCase()));
            const year = parseInt(parts[1]);
            if (mIndex !== -1 && !isNaN(year)) {
                window.AppState.currentMonth = new Date(year, mIndex, 1);
            }
        }

        document.body.classList.add('archive-mode-active');
        this.updateArchiveBanner();

        // Обновляем селектор месяцев для админа
        if (typeof window.updateAdminMonthPicker === 'function') {
            window.updateAdminMonthPicker();
        }

        if (typeof renderView === 'function') {
            renderView(window.AppState.currentView || 'dashboard');
        }
    },

    /**
     * Сохранение изменений в архиве (Для админа)
     */
    saveArchiveChanges() {
        if (!window.AppState.isArchiveMode || !window.AppState.currentArchiveId) return;

        const history = StorageModule.getHistory();
        const index = history.findIndex(h => h.id === window.AppState.currentArchiveId);

        if (index !== -1) {
            // Обновляем rawData внутри истории текущими данными из AppState
            // Так как объекты передаются по ссылке, AppState.archiveData уже содержит изменения,
            // но нам нужно явно обновить структуру stats и сохранить в LocalStorage.

            // Важно: пересчитываем общие метрики (totalRevenue и т.д.), чтобы в списке истории цифры обновились
            // Для этого нам нужны startDate/endDate этого архива.
            // Мы можем их вычислить так же, как в loadArchiveState

            // Но для простоты редактирования отдельных ячеек, мы пока просто сохраняем rawData.
            // (Полный пересчет stats требует дублирования логики из archiveCurrentMonth).

            // Чтобы "обмануть" систему и обновить превью:
            // Можно просто сохранить rawData.

            history[index].stats.rawData = window.AppState.archiveData;

            // Синхронизируем изменения с постоянным хранилищем
            StorageModule.set(StorageModule.KEYS.HISTORY, history);
            console.log('Archive data updated');
        }
    },

    /**
     * Выход из режима архива
     */
    exitArchiveMode() {
        window.AppState.isArchiveMode = false;
        window.AppState.currentArchiveId = null;
        window.AppState.archiveData = null;
        window.AppState.archiveMonthLabel = '';
        window.AppState.currentMonth = new Date();

        document.body.classList.remove('archive-mode-active');
        this.updateArchiveBanner();

        // Обновляем селектор месяцев для админа
        if (typeof window.updateAdminMonthPicker === 'function') {
            window.updateAdminMonthPicker();
        }

        if (typeof renderView === 'function') {
            renderView('history');
        }
    },

    /**
     * Обновление баннера архива
     */
    updateArchiveBanner() {
        let banner = document.getElementById('archive-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'archive-banner';
            banner.className = 'archive-banner';
            document.body.prepend(banner);
        }

        if (window.AppState.isArchiveMode) {
            banner.innerHTML = `
                <div class="archive-banner-content">
                    <span>👁️ Режим просмотра архива: <strong>${window.AppState.archiveMonthLabel}</strong></span>
                    <button onclick="HistoryModule.exitArchiveMode()" class="btn-exit-archive">Вернуться к текущему месяцу</button>
                </div>
            `;
            banner.style.display = 'block';
        } else {
            banner.style.display = 'none';
        }
    },

    /**
     * Проверка и авто-архивация месяца
     */
    checkAndAutoArchiveMonth() {
        const now = new Date();
        const currentMonthLabel = now.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
        const lastSavedMonth = StorageModule.get(StorageModule.KEYS.LAST_MONTH_MARKER);

        if (lastSavedMonth && lastSavedMonth !== currentMonthLabel) {
            console.log(`Обнаружена смена месяца: ${lastSavedMonth} -> ${currentMonthLabel}. Архивируем данные...`);
            this.archiveCurrentMonth(lastSavedMonth);
        } else if (!lastSavedMonth) {
            StorageModule.set(StorageModule.KEYS.LAST_MONTH_MARKER, currentMonthLabel);
        }
    },

    /**
     * Архивирование текущего месяца
     */
    archiveCurrentMonth(label = null) {
        const now = window.AppState.currentMonth || new Date();
        const monthLabel = label || now.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });

        let startDate, endDate;

        // Если передан label (авто-архивация прошлого месяца), восстанавливаем даты из него
        if (label) {
            const parts = label.split(' ');
            if (parts.length === 2) {
                const monthNames = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
                    'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
                const mIndex = monthNames.findIndex(m => m.toLowerCase().startsWith(parts[0].toLowerCase()));
                const year = parseInt(parts[1]);
                if (mIndex !== -1 && !isNaN(year)) {
                    const start = new Date(year, mIndex, 1);
                    const end = new Date(year, mIndex + 1, 0);
                    // Корректировка часового пояса
                    start.setMinutes(start.getMinutes() - start.getTimezoneOffset());
                    end.setMinutes(end.getMinutes() - end.getTimezoneOffset());
                    startDate = start.toISOString().split('T')[0];
                    endDate = end.toISOString().split('T')[0];
                }
            }
        }

        // Если даты не определились (ручное закрытие текущего), берем текущие
        if (!startDate) {
            const dates = Utils.loadCurrentMonthData();
            startDate = dates.startDate;
            endDate = dates.endDate;
        }

        // Собираем полные данные статистики
        const mStats = ManagersModule.getAllManagersStats(startDate, endDate);
        const eStats = ExpertsModule.getAllExpertsStats(startDate, endDate);
        const marketingStats = MarketingModule.calculateMetrics(startDate, endDate);

        // RAW DATA - Сохраняем абсолютно все данные
        const rawData = {
            managerReports: StorageModule.getManagerReports(),
            expertSales: StorageModule.getExpertSales(),
            marketingReports: StorageModule.getMarketingReports(),
            managers: StorageModule.getManagers(),
            experts: StorageModule.getExperts()
        };

        const totalRevenue = eStats.reduce((sum, e) => sum + (e.totalRevenue || 0), 0);
        const totalSales = eStats.reduce((sum, e) => sum + (e.totalDeals || 0), 0);

        const archiveData = {
            totalRevenue,
            totalSales,
            totalManagers: mStats.length,
            totalExperts: eStats.length,
            mStats,
            eStats,
            marketing: marketingStats,
            rawData
        };

        StorageModule.archiveMonth(monthLabel, archiveData);
        StorageModule.clearCurrentMonthData(startDate, endDate);

        if (!label) {
            StorageModule.set(StorageModule.KEYS.LAST_MONTH_MARKER, monthLabel);
            if (typeof window.renderDashboard === 'function') {
                window.renderDashboard();
            }
            if (typeof Utils !== 'undefined' && Utils.showNotification) {
                Utils.showNotification(`Месяц ${monthLabel} закрыт вручную и перемещен в архив со всеми данными.`, 'success');
            } else {
                alert(`Месяц ${monthLabel} закрыт вручную и перемещен в архив со всеми данными.`);
            }
        }
    },

    /**
     * Миграция старых архивов в новый формат
     */
    checkAndUpgradeLegacyArchives() {
        const history = StorageModule.getHistory();
        let updated = false;

        const upgradedHistory = history.map(item => {
            if (item.stats && item.stats.rawData) {
                return item;
            }

            updated = true;
            const rawData = {
                managerReports: [],
                expertSales: [],
                marketingReports: [],
                managers: StorageModule.getManagers(),
                experts: StorageModule.getExperts()
            };

            const newStats = {
                ...item.stats,
                rawData: rawData
            };

            return {
                ...item,
                stats: newStats
            };
        });

        if (updated) {
            StorageModule.set(StorageModule.KEYS.HISTORY, upgradedHistory);
            console.log('Legacy archive data migrated to Simulation Mode format based on current structure.');
        }
    }
};

// Экспорт для использования в HTML
window.HistoryModule = HistoryModule;
