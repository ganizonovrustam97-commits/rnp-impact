/**
 * Decomposition Module
 * Логика декомпозиции планов на месяц
 */

const DecompositionModule = {
    /**
     * Получить данные декомпозиции для конкретного месяца
     */
    getDecompositionForMonth(monthLabel) {
        const list = StorageModule.getDecomposition();
        const found = list.find(d => d.month === monthLabel);

        const defaults = {
            targetRevenue: 0,
            avgTicket: 0,
            crOfferToSale: 0,
            crConductedToOffer: 0,
            crLeadToConducted: 0,
            cpl: 0,
            month: monthLabel
        };

        return found ? { ...defaults, ...found } : defaults;
    },

    /**
     * Сохранить данные декомпозиции
     */
    saveDecomposition(data) {
        let list = StorageModule.getDecomposition();
        const index = list.findIndex(d => d.month === data.month);

        if (index !== -1) {
            list[index] = { ...list[index], ...data };
        } else {
            list.push(data);
        }

        StorageModule.set('rnp_decomposition', list);
    },

    /**
     * Рассчитать показатели на основе введенных данных
     */
    calculate(data) {
        const revenue = parseFloat(data.targetRevenue) || 0;
        const avgTicket = parseFloat(data.avgTicket) || 0;

        // 1. Продажи
        const salesNeeded = avgTicket > 0 ? Math.ceil(revenue / avgTicket) : 0;

        // 2. Офферы
        const crSale = parseFloat(data.crOfferToSale) || 0;
        const offersNeeded = crSale > 0 ? Math.ceil(salesNeeded / (crSale / 100)) : 0;

        // 3. Пров КЭВ
        const crOffer = parseFloat(data.crConductedToOffer) || 0;
        const conductedNeeded = crOffer > 0 ? Math.ceil(offersNeeded / (crOffer / 100)) : 0;

        // 4. Лиды
        const crConducted = parseFloat(data.crLeadToConducted) || 0;
        const leadsNeeded = crConducted > 0 ? Math.ceil(conductedNeeded / (crConducted / 100)) : 0;

        // 5. Бюджет
        const cpl = parseFloat(data.cpl) || 0;
        const budgetNeeded = leadsNeeded * cpl;

        // 6. ROI
        const roi = budgetNeeded > 0 ? (revenue / budgetNeeded * 100).toFixed(0) : 0;

        return {
            ...data,
            salesNeeded,
            offersNeeded,
            conductedNeeded,
            leadsNeeded,
            budgetNeeded,
            roi
        };
    }
};

window.DecompositionModule = DecompositionModule;
