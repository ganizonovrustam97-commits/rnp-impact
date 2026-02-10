/**
 * Experts Module
 * Вся логика расчетов для экспертов (Closers)
 */

const ExpertsModule = {
    SALARY_CONFIG: {
        HARD_SALARY: 2000000,
        DISCIPLINE: 0,
        BEST_MONTH_BONUS: 1000000,
        COMMISSION_TIERS: {
            LOW: { threshold: 90, rate: 0.03 },
            MID: { threshold: 150, rate: 0.05 },
            HIGH: { threshold: Infinity, rate: 0.07 }
        }
    },

    calculateMetrics(expertId, startDate, endDate) {
        const expert = StorageModule.getExperts().find(e => e.id === expertId);
        if (!expert) return null;

        const sales = StorageModule.getExpertSalesByPeriod(expertId, startDate, endDate);

        const conductedMeetings = sales.reduce((sum, s) => sum + (parseInt(s.conductedMeetings) || 0), 0);
        const totalDeals = sales.reduce((sum, s) => sum + (parseInt(s.dealsCount) || 0), 0);
        const totalOffers = sales.reduce((sum, s) => sum + (parseInt(s.offers) || 0), 0);

        // ВЫРУЧКА: Используем amount (Сумы) и amountUSD (USD) с защитой от NaN
        const totalRevenue = sales.reduce((sum, s) => {
            const val = parseFloat(s.amount || s.amountSum || 0) || 0;
            return sum + val;
        }, 0);

        const totalRevenueUsd = sales.reduce((sum, s) => {
            const val = parseFloat(s.amountUSD || s.amountUsd || 0) || 0;
            return sum + val;
        }, 0);

        const planPercent = (expert.monthPlan || 0) > 0
            ? (totalRevenue / expert.monthPlan * 100).toFixed(2)
            : 0;

        return {
            expertId,
            expertName: expert.name,
            conductedMeetings,
            totalDeals,
            totalRevenue, // Сумы
            totalRevenueUsd, // Доллары
            totalOffers,
            monthPlan: expert.monthPlan,
            planPercent,
            sales
        };
    },

    calculateSalary(expertId, startDate, endDate) {
        const expert = StorageModule.getExperts().find(e => e.id === expertId);
        if (!expert) return null;

        const metrics = this.calculateMetrics(expertId, startDate, endDate);
        const sales = StorageModule.getExpertSalesByPeriod(expertId, startDate, endDate);

        const baseFix = this.SALARY_CONFIG.HARD_SALARY;

        const rate = this.getCommissionRate(parseFloat(metrics.planPercent));
        // Комиссия считается только от СУМОВОЙ выручки
        const commission = metrics.totalRevenue * rate;

        const isBest = this.isBestOfMonth(expertId, startDate, endDate);
        const bestMonthBonus = isBest ? this.SALARY_CONFIG.BEST_MONTH_BONUS : 0;

        return {
            expertId,
            expertName: expert.name,
            baseFix,
            commission,
            commissionRate: rate,
            bestMonthBonus,
            totalSalary: baseFix + commission + bestMonthBonus,
            totalRevenue: metrics.totalRevenue, // Сумы
            totalRevenueUsd: metrics.totalRevenueUsd, // USD
            planPercent: metrics.planPercent
        };
    },

    getCommissionRate(planPercent) {
        const config = this.SALARY_CONFIG.COMMISSION_TIERS;
        if (planPercent < config.LOW.threshold) return config.LOW.rate;
        if (planPercent < config.MID.threshold) return config.MID.rate;
        return config.HIGH.rate;
    },

    isBestOfMonth(expertId, startDate, endDate) {
        const allExperts = StorageModule.getExperts();
        let maxRevenue = -1;
        let bestExpertId = null;

        allExperts.forEach(expert => {
            const sales = StorageModule.getExpertSalesByPeriod(expert.id, startDate, endDate);
            // Лучший определяется по СУМОВОЙ выручке (amount) с защитой от NaN
            const revenue = sales.reduce((sum, s) => {
                const val = parseFloat(s.amount || s.amountSum || 0) || 0;
                return sum + val;
            }, 0);
            if (revenue > maxRevenue) {
                maxRevenue = revenue;
                bestExpertId = expert.id;
            }
        });
        return bestExpertId === expertId && maxRevenue > 0;
    },

    getAllExpertsStats(startDate, endDate) {
        const experts = StorageModule.getExperts();
        const stats = [];

        experts.forEach(expert => {
            const metrics = this.calculateMetrics(expert.id, startDate, endDate);
            if (!metrics) return;

            const salary = this.calculateSalary(expert.id, startDate, endDate);
            const conversionConductedToSale = metrics.conductedMeetings > 0
                ? (metrics.totalDeals / metrics.conductedMeetings * 100).toFixed(2)
                : 0;

            stats.push({
                expertId: expert.id,
                expertName: expert.name,
                conductedMeetings: metrics.conductedMeetings,
                totalDeals: metrics.totalDeals,
                totalOffers: metrics.totalOffers,
                totalRevenue: metrics.totalRevenue, // Сумы
                totalRevenueUsd: metrics.totalRevenueUsd, // USD
                planPercent: metrics.planPercent,
                conversionConductedToSale,
                salary: salary ? salary.totalSalary : 0
            });
        });

        // Сортируем по сумовой выручке
        stats.sort((a, b) => b.totalRevenue - a.totalRevenue);
        return stats;
    }
};
