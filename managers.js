/**
 * Managers Module  
 * Вся логика расчетов для менеджеров SDR
 */

const ManagersModule = {
    /**
     * Константы для расчета ЗП
     */
    SALARY_CONFIG: {
        HARD_SALARY: 1000000,           // Гарантированный оклад
        DISCIPLINE: 1000000,            // Максимальная дисциплина
        BONUS_PER_DONE: 100000,         // Бонус за 1 проведенное
        PENALTY_PER_DAY: 100000,        // Штраф за невыполнение норм за день

        // Лестница недельных бонусов
        WEEKLY_BONUS: {
            25: 300000,  // >= 25 консов
            23: 200000,  // 23-24 конса
            20: 100000   // 20-22 конса
        },

        BEST_MONTH_BONUS: 600000,        // Бонус лучшему за месяц
        PROMOTED_FIX: 3000000            // Фикс после повышения
    },

    /**
     * Проверка выполнения ежедневных нормативов менеджера
     * Возвращает true, если НАРУШЕНИЕ (для удобства подсчета штрафов)
     */
    isDailyNormViolated(report) {
        if (!report) return false;

        const callsTotal = report.callsTotal || 0;
        const minutesOnLine = report.callsQuality || 0; // Теперь это прямо время на линии в минутах

        // Нормативы:
        // 80–120 звонков в день
        const callsOk = callsTotal >= 80 && callsTotal <= 120;

        // 1.5 часа (90 минут) на линии в день минимум
        const minutesOk = minutesOnLine >= 90;

        // Требования по CRM.
        const crmOk = (typeof report.crmOk === 'undefined') ? true : !!report.crmOk;

        // Дисциплина больше не зависит от назначено/проведено (доходимости)
        const allOk = callsOk && minutesOk && crmOk;
        return !allOk;
    },

    /**
     * Рассчитать KPI менеджера
     */
    calculateKPI(report) {
        const conversionAttendance = report.appointmentsSet > 0
            ? (report.appointmentsDone / report.appointmentsSet * 100).toFixed(2)
            : 0;

        const conversionAppointment = report.callsConnected > 0
            ? (report.appointmentsSet / report.callsConnected * 100).toFixed(2)
            : 0;

        return {
            conversionAttendance,
            conversionAppointment
        };
    },

    /**
     * Рассчитать зарплату менеджера за период
     */
    calculateSalary(managerId, startDate, endDate) {
        const manager = StorageModule.getManagers().find(m => m.id === managerId);
        if (!manager) return null;

        const reports = StorageModule.getManagerReportsByPeriod(managerId, startDate, endDate);

        // Базовый фикс (может быть повышен)
        let baseFix = manager.promoted
            ? this.SALARY_CONFIG.PROMOTED_FIX
            : this.SALARY_CONFIG.HARD_SALARY + this.SALARY_CONFIG.DISCIPLINE;

        // Если не повышен, считаем дисциплину пропорционально
        let disciplineBonus = 0;
        if (!manager.promoted) {
            const totalDays = reports.length;
            const disciplineDays = reports.filter(r => r.discipline).length;
            disciplineBonus = totalDays > 0
                ? (disciplineDays / totalDays) * this.SALARY_CONFIG.DISCIPLINE
                : 0;

            baseFix = this.SALARY_CONFIG.HARD_SALARY + disciplineBonus;
        }

        // Сдельный бонус (100к за каждое проведенное)
        const totalDone = reports.reduce((sum, r) => sum + r.appointmentsDone, 0);
        const pieceBonus = totalDone * this.SALARY_CONFIG.BONUS_PER_DONE;

        // Недельные бонусы
        const weeklyBonuses = this.calculateWeeklyBonuses(reports);

        // Штрафы за нарушения нормативов (один штраф за день с нарушением)
        const penaltiesCount = reports.reduce((count, r) => {
            return count + (this.isDailyNormViolated(r) ? 1 : 0);
        }, 0);
        const penaltiesAmount = penaltiesCount * this.SALARY_CONFIG.PENALTY_PER_DAY;

        // Бонус за лучший месяц (определяем отдельно)
        const isBestOfMonth = this.isBestOfMonth(managerId, startDate, endDate);
        const bestMonthBonus = isBestOfMonth ? this.SALARY_CONFIG.BEST_MONTH_BONUS : 0;

        const totalSalary = baseFix + pieceBonus + weeklyBonuses + bestMonthBonus - penaltiesAmount;

        return {
            managerId,
            managerName: manager.name,
            baseFix,
            disciplineBonus: !manager.promoted ? disciplineBonus : 0,
            pieceBonus,
            weeklyBonuses,
            bestMonthBonus,
            penaltiesCount,
            penaltiesAmount,
            totalSalary,
            totalDone,
            reports: reports.length
        };
    },

    /**
     * Рассчитать недельные бонусы
     */
    calculateWeeklyBonuses(reports) {
        // Группируем отчеты по неделям
        const weeks = this.groupByWeeks(reports);
        let totalWeeklyBonus = 0;

        weeks.forEach(weekReports => {
            const weekDone = weekReports.reduce((sum, r) => sum + r.appointmentsDone, 0);

            if (weekDone >= 25) {
                totalWeeklyBonus += this.SALARY_CONFIG.WEEKLY_BONUS[25];
            } else if (weekDone >= 23) {
                totalWeeklyBonus += this.SALARY_CONFIG.WEEKLY_BONUS[23];
            } else if (weekDone >= 20) {
                totalWeeklyBonus += this.SALARY_CONFIG.WEEKLY_BONUS[20];
            }
        });

        return totalWeeklyBonus;
    },

    /**
     * Группировка отчетов по неделям
     */
    groupByWeeks(reports) {
        const weeks = {};

        reports.forEach(report => {
            const date = new Date(report.date);
            const weekNumber = this.getWeekNumber(date);

            if (!weeks[weekNumber]) {
                weeks[weekNumber] = [];
            }
            weeks[weekNumber].push(report);
        });

        return Object.values(weeks);
    },

    /**
     * Получить номер недели в году
     */
    getWeekNumber(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    },

    /**
     * Определить, является ли менеджер лучшим за месяц
     */
    isBestOfMonth(managerId, startDate, endDate) {
        const allManagers = StorageModule.getManagers();
        let maxDone = 0;
        let bestManagerId = null;

        allManagers.forEach(manager => {
            const reports = StorageModule.getManagerReportsByPeriod(manager.id, startDate, endDate);
            const totalDone = reports.reduce((sum, r) => sum + r.appointmentsDone, 0);

            if (totalDone > maxDone) {
                maxDone = totalDone;
                bestManagerId = manager.id;
            }
        });

        return bestManagerId === managerId;
    },

    /**
     * Проверить условия для повышения
     */
    checkPromotion(managerId) {
        const manager = StorageModule.getManagers().find(m => m.id === managerId);
        if (!manager || manager.promoted) return false;

        // Условие 1: Стаж > 4 месяцев
        const hireDate = new Date(manager.hireDate);
        const now = new Date();
        const monthsDiff = (now.getFullYear() - hireDate.getFullYear()) * 12 +
            (now.getMonth() - hireDate.getMonth());

        if (monthsDiff <= 4) return false;

        // Условие 2: Флаг "Лучший месяца" >= 2 раз
        if (manager.bestMonthCount < 2) return false;

        return true;
    },

    /**
     * Применить повышение
     */
    applyPromotion(managerId) {
        if (this.checkPromotion(managerId)) {
            StorageModule.updateManager(managerId, { promoted: true });
            return true;
        }
        return false;
    },

    /**
     * Получить статистику всех менеджеров за период
     */
    getAllManagersStats(startDate, endDate) {
        const managers = StorageModule.getManagers();
        const stats = [];

        managers.forEach(manager => {
            const reports = StorageModule.getManagerReportsByPeriod(manager.id, startDate, endDate);

            if (reports.length === 0) return;

            const totalCalls = reports.reduce((sum, r) => sum + r.callsTotal, 0);
            const totalConnected = reports.reduce((sum, r) => sum + r.callsConnected, 0);
            const totalQuality = reports.reduce((sum, r) => sum + r.callsQuality, 0);
            const totalSet = reports.reduce((sum, r) => sum + r.appointmentsSet, 0);
            const totalDone = reports.reduce((sum, r) => sum + r.appointmentsDone, 0);

            // Конверсия: Звонки -> Назначения (Set / Calls)
            const conversionCallsToSet = totalCalls > 0
                ? (totalSet / totalCalls * 100).toFixed(2)
                : 0;

            // Конверсия: Назначения -> Проведено (Done / Set)
            const conversionSetToDone = totalSet > 0
                ? (totalDone / totalSet * 100).toFixed(2)
                : 0;

            const salary = this.calculateSalary(manager.id, startDate, endDate);

            // Процент выполнения плана менеджера (Проведено / План)
            const planPercent = manager.monthPlan > 0
                ? (totalDone / manager.monthPlan * 100).toFixed(1)
                : 0;

            stats.push({
                managerId: manager.id,
                managerName: manager.name,
                totalCalls,
                totalConnected,
                totalQuality,
                totalSet,
                totalDone,
                conversionCallsToSet,
                conversionSetToDone,
                monthPlan: manager.monthPlan || 0,
                planPercent,
                salary: salary ? salary.totalSalary : 0,
                penaltiesCount: salary ? salary.penaltiesCount : 0,
                penaltiesAmount: salary ? salary.penaltiesAmount : 0
            });
        });

        // Сортируем по количеству проведенных
        stats.sort((a, b) => b.totalDone - a.totalDone);

        return stats;
    }
};
