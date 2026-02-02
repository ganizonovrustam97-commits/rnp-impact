/**
 * Marketers Module
 * Логика расчета зарплаты для таргетологов на основе ROI и бюджета
 */

const MarketersModule = {
    // Константы для расчета
    FIXED_SALARY: 200, // $200 фикса

    // Таблица соответствия ROI и % от рекламного бюджета
    BONUS_TABLE: [
        { roi: 1400, percent: 36 },
        { roi: 1300, percent: 33 },
        { roi: 1200, percent: 30 },
        { roi: 1100, percent: 27 },
        { roi: 1000, percent: 24 },
        { roi: 900, percent: 21 },
        { roi: 800, percent: 18 },
        { roi: 700, percent: 15 },
        { roi: 600, percent: 12 },
        { roi: 500, percent: 9 },
        { roi: 400, percent: 7 },
        { roi: 300, percent: 5 },
        { roi: 200, percent: 4 }
    ],

    /**
     * Получить процент бонуса на основе ROI
     */
    getBonusPercent(roiPercent) {
        // Ищем первое значение roi в таблице, которое меньше или равно текущему roiPercent
        // Таблица отсортирована по убыванию
        const match = this.BONUS_TABLE.find(item => roiPercent >= item.roi);
        return match ? match.percent : 0;
    },

    /**
     * Расчет зарплаты маркетолога за период
     */
    calculateSalary(marketerId, startDate, endDate) {
        const marketers = StorageModule.getMarketers();
        const marketer = marketers.find(m => m.id == marketerId) || {};
        const baseFix = marketer.baseFix || this.FIXED_SALARY;

        // В текущей логике все маркетологи получают бонус от общих показателей маркетинга
        const marketingStats = MarketingModule.calculateMetrics(startDate, endDate);

        const expenses = marketingStats.expenses || 0;
        const revenueUSD = marketingStats.revenueUSD || 0;

        // ROI в формате окупаемости (Выручка / Расходы * 100%)
        const roi = expenses > 0 ? (revenueUSD / expenses * 100) : 0;
        const budget = expenses;

        const bonusPercent = this.getBonusPercent(roi);
        const bonusAmount = (budget * bonusPercent) / 100;

        return {
            baseFix: baseFix,
            roi: roi,
            budget: budget,
            bonusPercent: bonusPercent,
            bonusAmount: bonusAmount,
            totalSalary: baseFix + bonusAmount
        };
    },

    /**
     * Получить статистику по всем маркетологам
     */
    getAllMarketersStats(startDate, endDate) {
        const marketers = StorageModule.getMarketers();
        const marketingStats = MarketingModule.calculateMetrics(startDate, endDate);

        return marketers.map(m => {
            const salary = this.calculateSalary(m.id, startDate, endDate);
            return {
                id: m.id,
                name: m.name,
                ...salary
            };
        });
    }
};

window.MarketersModule = MarketersModule;
