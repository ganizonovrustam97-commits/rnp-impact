/**
 * Utils Module
 * Общие утилиты для форматирования, валидации и работы с данными
 */

const Utils = {
    /**
     * Форматирование чисел с разделителями тысяч
     */
    formatNumber(num) {
        if (num === null || num === undefined || isNaN(num)) return '0';
        return new Intl.NumberFormat('ru-RU').format(num);
    },

    /**
     * Форматирование валюты (сум)
     */
    formatCurrency(num) {
        if (num === null || num === undefined || isNaN(num)) return '0 сум';
        return new Intl.NumberFormat('ru-RU').format(num) + ' сум';
    },

    /**
     * Форматирование валюты (USD)
     */
    formatUSD(num) {
        if (num === null || num === undefined || isNaN(num)) return '$0';
        return new Intl.NumberFormat('ru-RU', { 
            style: 'currency', 
            currency: 'USD', 
            minimumFractionDigits: 0 
        }).format(num);
    },

    /**
     * Форматирование даты
     */
    formatDate(str) {
        if (!str) return '';
        try {
            return new Date(str).toLocaleDateString('ru-RU');
        } catch (e) {
            return str;
        }
    },

    /**
     * Показать уведомление (можно заменить на toast в будущем)
     */
    showNotification(msg, type = 'info') {
        // Пока используем alert, но можно заменить на красивый toast
        if (type === 'error') {
            alert('❌ ' + msg);
        } else if (type === 'success') {
            alert('✅ ' + msg);
        } else {
            alert(msg);
        }
    },

    /**
     * Загрузить данные текущего месяца
     */
    loadCurrentMonthData() {
        const now = window.AppState?.currentMonth || new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        // Корректировка часового пояса
        start.setMinutes(start.getMinutes() - start.getTimezoneOffset());
        end.setMinutes(end.getMinutes() - end.getTimezoneOffset());
        return { 
            startDate: start.toISOString().split('T')[0], 
            endDate: end.toISOString().split('T')[0] 
        };
    },

    /**
     * Валидация числа (не отрицательное)
     */
    validatePositiveNumber(value, defaultValue = 0) {
        const num = parseInt(value) || defaultValue;
        return Math.max(0, num);
    },

    /**
     * Валидация числа с плавающей точкой
     */
    validatePositiveFloat(value, defaultValue = 0) {
        const num = parseFloat(value) || defaultValue;
        return Math.max(0, num);
    },

    /**
     * Проверка доступности localStorage
     */
    isStorageAvailable() {
        try {
            const test = '__storage_test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (e) {
            return false;
        }
    },

    /**
     * Безопасное получение данных из AppState или Storage
     */
    getAppData(key) {
        if (window.AppState?.isArchiveMode && window.AppState?.archiveData) {
            return window.AppState.archiveData[key] || [];
        }

        // В обычном режиме берем из Storage
        switch (key) {
            case 'managers': return StorageModule.getManagers();
            case 'experts': return StorageModule.getExperts();
            case 'managerReports': return StorageModule.getManagerReports();
            case 'expertSales': return StorageModule.getExpertSales();
            case 'marketingReports': return StorageModule.getMarketingReports();
            default: return [];
        }
    }
};

// Экспорт глобальных функций для обратной совместимости
window.formatNumber = Utils.formatNumber.bind(Utils);
window.formatCurrency = Utils.formatCurrency.bind(Utils);
window.formatUSD = Utils.formatUSD.bind(Utils);
window.formatDate = Utils.formatDate.bind(Utils);
window.showNotification = Utils.showNotification.bind(Utils);
window.getAppData = Utils.getAppData.bind(Utils);
