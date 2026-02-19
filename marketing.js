/**
 * Marketing Module
 * Логика расчетов маркетинговой воронки и ROI
 */

const MarketingModule = {
    /**
     * Получить синхронизированные данные за конкретный день
     */
    getSyncedDailyData(date) {
        const marketingReports = StorageModule.getMarketingReports();
        const managerReports = StorageModule.getManagerReports();
        const expertSales = StorageModule.getExpertSales();

        const mReport = marketingReports.find(r => r.date === date) || {};

        // Назначения и КЭВ - сумма от всех менеджеров за этот день
        const dayManagers = managerReports.filter(r => r.date === date);
        const appointments = dayManagers.reduce((sum, m) => sum + (parseInt(m.appointmentsSet) || 0), 0);
        const conducted = dayManagers.reduce((sum, m) => sum + (parseInt(m.appointmentsDone) || 0), 0);

        // Только реальные эксперты — отфильтровываем "призрачные" записи с невалидными expertId
        const validExpertIds = new Set(StorageModule.getExperts().map(e => String(e.id)));

        // Продажи, Выручка - сумма от всех РЕАЛЬНЫХ экспертов за этот день
        const dayExperts = expertSales.filter(e => e.date === date && validExpertIds.has(String(e.expertId)));
        const sales = dayExperts.reduce((sum, e) => sum + (parseInt(e.dealsCount) || 0), 0);
        // Выручка в сумах (для зарплаты)
        const revenue = dayExperts.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
        // Выручка в USD (для маркетинга)
        const revenueUSD = dayExperts.reduce((sum, e) => sum + (parseFloat(e.amountUSD) || parseFloat(e.amountUsd) || 0), 0);

        const offers = dayExperts.reduce((sum, e) => sum + (parseInt(e.offers) || 0), 0);

        return {
            date,
            expenses: parseFloat(mReport.expenses) || 0,
            views: parseInt(mReport.views) || 0,
            clicks: parseInt(mReport.clicks) || 0,
            leads: parseInt(mReport.leads) || 0,
            qualLeads: parseInt(mReport.qualLeads) || 0,
            offers,
            appointments,
            conducted,
            sales,
            revenue,
            revenueUSD
        };
    },

    /**
     * Рассчитать метрики маркетинга за период
     */
    calculateMetrics(startDate, endDate) {
        // Генерируем массив дат в периоде (UTC-safe)
        const start = new Date(startDate);
        const end = new Date(endDate);
        const reports = [];

        for (let i = 1; i <= end.getDate(); i++) {
            const dateStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            reports.push(this.getSyncedDailyData(dateStr));
        }

        const total = reports.reduce((sum, r) => {
            sum.expenses += r.expenses;
            sum.views += r.views;
            sum.clicks += r.clicks;
            sum.leads += r.leads;
            sum.qualLeads += r.qualLeads;
            sum.appointments += r.appointments;
            sum.conducted += r.conducted;
            sum.offers += r.offers;
            sum.sales += r.sales;
            sum.revenue += r.revenue;
            sum.revenueUSD += r.revenueUSD;
            return sum;
        }, {
            expenses: 0, views: 0, clicks: 0, leads: 0, qualLeads: 0,
            appointments: 0, conducted: 0, offers: 0, sales: 0, revenue: 0, revenueUSD: 0
        });

        // Конверсии
        const CTR = total.views > 0 ? (total.clicks / total.views * 100).toFixed(2) : 0;
        const siteConv = total.clicks > 0 ? (total.leads / total.clicks * 100).toFixed(2) : 0;
        const crQual = total.leads > 0 ? (total.qualLeads / total.leads * 100).toFixed(2) : 0;
        const crAppToConducted = total.appointments > 0 ? (total.conducted / total.appointments * 100).toFixed(2) : 0;
        const crConductedToOffer = total.conducted > 0 ? (total.offers / total.conducted * 100).toFixed(2) : 0;
        const crOfferToSale = total.offers > 0 ? (total.sales / total.offers * 100).toFixed(2) : 0;
        const crLeadToConducted = total.leads > 0 ? (total.conducted / total.leads * 100).toFixed(2) : 0;
        const crSaleTotal = total.leads > 0 ? (total.sales / total.leads * 100).toFixed(2) : 0;
        const crSaleFromConducted = total.conducted > 0 ? (total.sales / total.conducted * 100).toFixed(2) : 0;

        // Маркетинг метрики
        const CPL = total.leads > 0 ? (total.expenses / total.leads) : 0;
        const CPK = total.conducted > 0 ? (total.expenses / total.conducted) : 0;
        const CAC = total.sales > 0 ? (total.expenses / total.sales) : 0;
        const ROMI = total.expenses > 0 ? ((total.revenueUSD - total.expenses) / total.expenses * 100).toFixed(2) : 0;

        return {
            ...total,
            CTR, siteConv, crQual, crAppToConducted, crConductedToOffer,
            crOfferToSale, crLeadToConducted, crSaleTotal, crSaleFromConducted,
            CPL, CPK, CAC, ROMI
        };
    }
};
