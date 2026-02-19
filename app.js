/**
 * Main Application Logic
 * РНП Impact - BI Система Payroll
 */

// Глобальное состояние приложения
window.AppState = {
    currentView: 'dashboard',
    currentMonth: (function () {
        const saved = localStorage.getItem('rnp_selected_month');
        return saved ? new Date(saved) : new Date();
    })(),
    isArchiveMode: false,
    archiveData: null,
    archiveMonthLabel: '',
    openSections: {}
};



/**
 * Инициализация приложения
 */
document.addEventListener('DOMContentLoaded', () => {
    StorageModule.initialize();
    HistoryModule.checkAndUpgradeLegacyArchives(); // Авто-миграция старых данных
    HistoryModule.checkAndAutoArchiveMonth();
    updateExpertSalesFieldNames(); // Миграция полей выручки экспертов
    // restoreJanuary2026(); // ВРЕМЕННО ОТКЛЮЧЕНО

    // === АВТО-ВОССТАНОВЛЕНИЕ ДАННЫХ ===
    // Проверяем, остались ли данные за Январь в текущем хранилище (не в архиве)
    const allReports = StorageModule.getManagerReports();
    const hasJanReports = allReports.some(r => r.date && r.date.startsWith('2026-01'));

    const allSales = StorageModule.getExpertSales();
    const hasJanSales = allSales.some(s => s.date && s.date.startsWith('2026-01'));

    const history = StorageModule.getHistory();
    const janArchive = history.some(h => h.month.toLowerCase().includes('январь 2026'));

    if ((hasJanReports || hasJanSales) && !janArchive) {
        // Если данные есть, а архива нет — значит месяц не закрылся. Закрываем принудительно.
        console.warn('Recovering orphaned January data...');
        alert('⚠️ Обнаружены незакрытые данные за Январь 2026.\n\nСистема сейчас перенесет их в АРХИВ, чтобы они не потерялись.');
        HistoryModule.archiveCurrentMonth('январь 2026');
        setTimeout(() => location.reload(), 1000);
    }

    // Проверяем авторизацию
    if (AuthModule.isAuthenticated()) {
        showMainApp();
    } else {
        showLoginScreen();
    }

    // Обработчик формы входа
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Обработчик кнопки выхода
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
});


/**
 * Показать экран входа
 */
function showLoginScreen() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('main-app').style.display = 'none';
}

/**
 * Показать главное приложение
 */
function showMainApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';

    const user = AuthModule.getCurrentUser();
    if (user) {
        // Показываем имя пользователя
        const userNameEl = document.getElementById('current-user-name');
        if (userNameEl) {
            userNameEl.textContent = user.username;
        }

        // Настраиваем интерфейс в зависимости от роли
        setupUIForRole(user.role);
    }

    initializeNavigation();
    initializeForms();

    // Переключаемся на соответствующий раздел в зависимости от роли
    if (user && user.role === 'manager') {
        renderView('managers');
    } else if (user && user.role === 'expert') {
        renderView('experts');
    } else if (user && user.role === 'marketer') {
        renderView('marketing');
    } else {
        renderView('dashboard');
    }
}

/**
 * Настройка интерфейса в зависимости от роли пользователя
 */
function setupUIForRole(role) {
    const nav = document.getElementById('main-nav');
    const adminSelector = document.getElementById('admin-month-selector');

    if (role === 'admin') {
        // Админ видит все разделы
        if (nav) nav.style.display = 'flex';
        if (adminSelector) adminSelector.style.display = 'flex';
        updateAdminMonthPicker();
    } else if (role === 'marketer') {
        // Маркетолог видит навигацию, но мы можем ограничить видимые вкладки
        if (nav) {
            nav.style.display = 'flex';
            // Скрываем все кнопки кроме Маркетинга и Дашборда (опционально)
            const buttons = nav.querySelectorAll('.nav-btn');
            buttons.forEach(btn => {
                const view = btn.dataset.view;
                if (view !== 'marketing' && view !== 'dashboard') {
                    btn.style.display = 'none';
                } else {
                    btn.style.display = 'flex';
                }
            });
        }
        if (adminSelector) adminSelector.style.display = 'none';
    } else {
        // Сотрудники не видят навигацию
        if (nav) nav.style.display = 'none';
        if (adminSelector) adminSelector.style.display = 'none';

        // Переключаемся на соответствующий раздел
        if (role === 'manager') {
            window.AppState.currentView = 'managers';
        } else if (role === 'expert') {
            window.AppState.currentView = 'experts';
        }
    }
}

/**
 * Обновление значения в селекторе месяцев для админа
 */
window.updateAdminMonthPicker = function () {
    const input = document.getElementById('admin-date-input');
    if (input && window.AppState.currentMonth) {
        const year = window.AppState.currentMonth.getFullYear();
        const month = String(window.AppState.currentMonth.getMonth() + 1).padStart(2, '0');
        input.value = `${year}-${month}`;
    }
};

/**
 * Обработчик изменения месяца админом
 */
window.handleAdminMonthChange = function (e) {
    const dateStr = e.target.value; // "YYYY-MM"
    if (!dateStr) return;

    const [year, month] = dateStr.split('-').map(Number);
    const targetDate = new Date(year, month - 1, 1);

    // 1. Ищем, есть ли этот месяц в архиве
    const history = StorageModule.getHistory();
    const monthNames = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
        'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
    const label = `${monthNames[month - 1]} ${year}`;
    const archiveItem = history.find(h => h.month.toLowerCase().includes(label.toLowerCase()));

    if (archiveItem) {
        console.log(`Found archive for ${label}, switching to Archive Mode.`);
        HistoryModule.loadArchiveState(archiveItem);
    } else {
        console.log(`No archive for ${label}, switching to Live Mode for this month.`);
        // Если нет в архиве — выходим из режима архива и переходим на этот месяц в "живом" режиме
        window.AppState.isArchiveMode = false;
        window.AppState.currentArchiveId = null;
        window.AppState.archiveData = null;
        window.AppState.currentMonth = targetDate;

        // Сохраняем выбранный месяц
        localStorage.setItem('rnp_selected_month', targetDate.toISOString());
        document.body.classList.remove('archive-mode-active');
        HistoryModule.updateArchiveBanner();

        // Перерисовываем текущий вид
        renderView(window.AppState.currentView);
    }
};

/**
 * Обработчик входа
 */
function handleLogin(e) {
    e.preventDefault();

    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');

    const result = AuthModule.login(username, password);

    if (result.success) {
        errorEl.style.display = 'none';
        showMainApp();
    } else {
        errorEl.textContent = result.error;
        errorEl.style.display = 'block';
    }
}

/**
 * Обработчик выхода
 */
function handleLogout() {
    AuthModule.logout();
    showLoginScreen();

    // Очищаем поля формы
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    document.getElementById('login-error').style.display = 'none';
}

/**
 * ВРЕМЕННАЯ ФУНКЦИЯ: Восстановление данных за Январь 2026
 */
function restoreJanuary2026() {
    // Получаем историю
    const history = StorageModule.getHistory();
    // Ищем запись за Январь 2026
    const janIndex = history.findIndex(h => h.month.toLowerCase().includes('январь') && h.month.includes('2026'));

    if (janIndex !== -1) {
        const archive = history[janIndex];
        if (archive.stats && archive.stats.rawData) {
            console.log('Restoring January 2026 data...');
            const raw = archive.stats.rawData;

            // Восстанавливаем отчеты менеджеров
            if (raw.managerReports) StorageModule.set(StorageModule.KEYS.MANAGER_REPORTS, raw.managerReports);
            // Восстанавливаем продажи экспертов
            if (raw.expertSales) StorageModule.set(StorageModule.KEYS.EXPERT_SALES, raw.expertSales);
            // Восстанавливаем маркетинг
            if (raw.marketingReports) StorageModule.set(StorageModule.KEYS.MARKETING_REPORTS, raw.marketingReports);

            // Удаляем архивную запись
            history.splice(janIndex, 1);
            StorageModule.set(StorageModule.KEYS.HISTORY, history);

            // Обновляем маркер последнего месяца на текущий реальный месяц, чтобы не сработала авто-архивация
            const now = new Date();
            const currentMonthLabel = now.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
            StorageModule.set(StorageModule.KEYS.LAST_MONTH_MARKER, currentMonthLabel);

            // Устанавливаем текущей датой Январь 2026, чтобы открыть его в редакторе
            // Устанавливаем в AppState но это сбросится при перезагрузке.
            // Однако, restore запускается при загрузке. Если мы сейчас перезагрузим страницу, скрипт снова сработает?
            // Нет, потому что `janIndex` уже не будет найден (мы его удалили)!

            // Итак:
            // 1. Скрипт находит архив.
            // 2. Восстанавливает данные.
            // 3. Удаляет архив.
            // 4. Перезагружает страницу.
            // 5. После перезагрузки скрипт не находит архив и ничего не делает.
            // 6. Пользователь видит восстановленные данные.

            // ЕДИНСТВЕННОЕ НО: AppState.currentMonth по умолчанию new Date().
            // Нам нужно чтобы при старте (если мы только что восстановили) или вообще всегда пока мы "в прошлом"
            // AppState ставился на Январь.

            alert('✅ Данные Января 2026 восстановлены. Теперь вы можете их редактировать.');
            window.location.reload();
        }
    }
}


/**
 * Навигация между разделами
 */
function initializeNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Проверяем права доступа
            const user = AuthModule.getCurrentUser();
            const allowedViews = ['dashboard', 'marketing'];

            if (user && user.role !== 'admin') {
                // Если не админ, проверяем разрешен ли вид для этой роли
                if (user.role === 'marketer') {
                    if (!allowedViews.includes(btn.dataset.view)) return;
                } else {
                    // Менеджеры и эксперты вообще не должны видеть кликабельный нав
                    return;
                }
            }

            navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const view = btn.dataset.view;
            window.AppState.currentView = view;
            renderView(view);
        });
    });

    // Обработчик изменения месяца для админа
    const adminDateInput = document.getElementById('admin-date-input');
    if (adminDateInput) {
        adminDateInput.addEventListener('change', window.handleAdminMonthChange);
    }
}

function renderView(view) {
    // Скрываем все разделы
    document.querySelectorAll('.view').forEach(section => { // Changed from .view-section to .view
        section.classList.remove('active'); // Changed from style.display = 'none' to remove active class
    });

    // Показываем нужный раздел
    const targetSection = document.getElementById(`${view}-view`);
    if (targetSection) {
        targetSection.classList.add('active');
    }

    // Обновляем активную кнопку в навигации
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
        if (btn.dataset.view === view) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Обновляем селектор месяцев (на случай если переход был не через него)
    if (typeof updateAdminMonthPicker === 'function') {
        updateAdminMonthPicker();
    }

    // Рендерим контент
    switch (view) {
        case 'dashboard':
            renderDashboard();
            break;
        case 'marketing':
            renderMarketingView();
            break;
        case 'managers':
            renderManagersView();
            break;
        case 'experts':
            renderExpertsView();
            break;
        case 'history':
            HistoryModule.renderHistoryView();
            break;
        case 'settings':
            renderSettingsView();
            break;
        default:
            renderDashboard();
    }
}

/**
 * Инициализация форм
 */
function initializeForms() {
    const addManagerForm = document.getElementById('add-manager-form');
    if (addManagerForm) {
        addManagerForm.addEventListener('submit', window.handleAddManager);
        const hireDateField = document.getElementById('manager-hire-date');
        if (hireDateField) hireDateField.value = new Date().toISOString().split('T')[0];
    }

    const addExpertForm = document.getElementById('add-expert-form');
    if (addExpertForm) addExpertForm.addEventListener('submit', window.handleAddExpert);
}

// === МЕНЕДЖЕРЫ ===

function renderManagerInputTable() {
    const container = document.getElementById('managers-monthly-input');
    if (!container) return;

    const { startDate, endDate } = Utils.loadCurrentMonthData();
    const date = window.AppState.currentMonth;
    const currentMonthName = date.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
    const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

    let managers = Utils.getAppData('managers');

    // Фильтруем данные для не-админов
    if (!AuthModule.isAdmin()) {
        const linkedId = AuthModule.getLinkedEntityId();
        managers = managers.filter(m => m.id == linkedId);
    }

    container.innerHTML = `<div style="margin-bottom: 1rem; color: var(--accent-primary); font-size: 1.1rem; text-transform: capitalize; font-weight: bold;">${currentMonthName}</div>`;

    if (managers.length === 0) {
        container.innerHTML += '<p class="text-muted">Нет менеджеров</p>';
        return;
    }

    const allReports = Utils.getAppData('managerReports');

    managers.forEach(manager => {
        const sectionId = `manager-${manager.id}`;
        // Проверяем сохраненное состояние или открываем по умолчанию, если в архиве
        const isOpen = window.AppState.openSections[sectionId] !== undefined
            ? window.AppState.openSections[sectionId]
            : window.AppState.isArchiveMode;

        const details = document.createElement('details');
        details.className = 'accordion-section';
        if (isOpen) details.open = true;

        // Сохраняем состояние при переключении
        details.addEventListener('toggle', () => {
            window.AppState.openSections[sectionId] = details.open;
        });

        details.innerHTML = `
            <summary class="accordion-header">👤 ${manager.name}</summary>
            <div class="accordion-content">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Дата</th>
                            <th>Звонки</th>
                            <th>Дозвоны</th>
                            <th>Время (мин)</th>
                            <th>Назн.</th>
                            <th>Пров.</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${generateManagerRows(manager.id, daysInMonth, allReports)}
                    </tbody>
                </table>
            </div>
        `;
        container.appendChild(details);
    });
}

function generateManagerRows(managerId, days, allReports) {
    let html = '';
    const date = window.AppState.currentMonth;
    const month = date.getMonth();
    const year = date.getFullYear();
    // Разрешаем редактирование архива только админу
    const isAdmin = AuthModule.isAdmin();
    const isArchive = window.AppState.isArchiveMode;
    const isReadOnly = isArchive && !isAdmin;

    console.log(`Debug ManagerRows: Archive=${isArchive}, Admin=${isAdmin}, ReadOnly=${isReadOnly}`);

    for (let i = 1; i <= days; i++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const r = allReports.find(report => report.managerId == managerId && report.date === dateStr) || {};

        // В архиве "сегодня" не подсвечиваем как активный день
        const isToday = !window.AppState.isArchiveMode && i === new Date().getDate() && month === new Date().getMonth();
        const rowStyle = isToday ? 'background: rgba(91, 141, 239, 0.1);' : '';

        // Проверяем нарушение нормативов для подсветки строки
        const hasViolation = typeof ManagersModule !== 'undefined'
            ? ManagersModule.isDailyNormViolated({
                callsTotal: r.callsTotal || 0,
                callsQuality: r.callsQuality || 0,
                appointmentsSet: r.appointmentsSet || 0,
                appointmentsDone: r.appointmentsDone || 0,
                // Для старых данных crmOk может отсутствовать
                crmOk: (typeof r.crmOk === 'undefined') ? true : r.crmOk
            })
            : false;
        const violationClass = hasViolation ? 'violation-row' : '';

        if (isReadOnly) {
            html += `
                <tr class="${violationClass}" style="${rowStyle}">
                    <td>${i} ${date.toLocaleString('ru-RU', { month: 'short' })}</td>
                    <td>${r.callsTotal || 0}</td>
                    <td>${r.callsConnected || 0}</td>
                    <td>${r.callsQuality || 0}</td>
                    <td>${r.appointmentsSet || 0}</td>
                    <td>${r.appointmentsDone || 0}</td>
                </tr>
            `;
        } else {
            html += `
                <tr class="${violationClass}" style="${rowStyle}">
                    <td>${i} ${date.toLocaleString('ru-RU', { month: 'short' })}</td>
                    <td><input type="number" class="table-input" min="0" value="${r.callsTotal || 0}" onchange="saveCellManager('${managerId}', '${dateStr}', 'callsTotal', this.value)"></td>
                    <td><input type="number" class="table-input" min="0" value="${r.callsConnected || 0}" onchange="saveCellManager('${managerId}', '${dateStr}', 'callsConnected', this.value)"></td>
                    <td><input type="number" class="table-input" min="0" value="${r.callsQuality || 0}" onchange="saveCellManager('${managerId}', '${dateStr}', 'callsQuality', this.value)"></td>
                    <td><input type="number" class="table-input" min="0" value="${r.appointmentsSet || 0}" onchange="saveCellManager('${managerId}', '${dateStr}', 'appointmentsSet', this.value)"></td>
                    <td><input type="number" class="table-input" min="0" value="${r.appointmentsDone || 0}" onchange="saveCellManager('${managerId}', '${dateStr}', 'appointmentsDone', this.value)"></td>
                </tr>
            `;
        }
    }
    return html;
}

window.saveCellManager = function (managerId, date, field, value) {
    // В архиве блокируем для всех, кроме админа
    if (window.AppState.isArchiveMode && !AuthModule.isAdmin()) return;

    // В архиве getManagerReports возвращает ссылку на данные внутри архива
    let reports = StorageModule.getManagerReports();
    let index = reports.findIndex(r => r.managerId == managerId && r.date === date);

    if (index === -1) {
        const newR = {
            managerId,
            date,
            callsTotal: 0,
            callsConnected: 0,
            callsQuality: 0,
            appointmentsSet: 0,
            appointmentsDone: 0,
            discipline: false,
            crmOk: true
        };
        newR[field] = field === 'discipline' || field === 'crmOk'
            ? value
            : Utils.validatePositiveNumber(value);
        reports.push(newR);
    } else {
        // Обновляем только запрошенное поле
        if (field === 'discipline' || field === 'crmOk') {
            reports[index][field] = value;
        } else {
            reports[index][field] = Utils.validatePositiveNumber(value);
        }
    }

    if (window.AppState.isArchiveMode) {
        // В режиме архива сохраняем через HistoryModule
        HistoryModule.saveArchiveChanges();
        // В архиве тоже перерисовываем статистику
        renderManagerStatsOnly();
    } else {
        StorageModule.set(StorageModule.KEYS.MANAGER_REPORTS, reports);
        // Перерисовываем только статистику — таблицу НЕ трогаем (чтобы не сбросить ввод)
        renderManagerStatsOnly();
    }
};

/**
 * Обновляет только блок статистики менеджеров (без пересоздания таблицы ввода)
 */
function renderManagerStatsOnly() {
    const { startDate, endDate } = Utils.loadCurrentMonthData();
    let stats = ManagersModule.getAllManagersStats(startDate, endDate);

    if (!AuthModule.isAdmin()) {
        const linkedId = AuthModule.getLinkedEntityId();
        stats = stats.filter(s => s.managerId == linkedId);
    }

    const container = document.getElementById('manager-stats-container');
    if (!container) return;

    if (stats.length === 0) {
        container.innerHTML = '<p class="text-muted">Нет данных за период</p>';
    } else {
        container.innerHTML = stats.map(stat => {
            const salary = ManagersModule.calculateSalary(stat.managerId, startDate, endDate);
            return `
                <div class="card card-stats">
                    <h3>${stat.managerName}</h3>
                    <div class="stats-grid-small">
                        <div><p class="label">План</p><p class="val">${stat.planPercent}%</p></div>
                        <div><p class="label">Зв→Наз</p><p class="val">${stat.conversionCallsToSet}%</p></div>
                        <div><p class="label">Наз→Пр</p><p class="val">${stat.conversionSetToDone}%</p></div>
                        <div><p class="label">Зарплата</p><p class="val text-success">${formatCurrency(salary ? salary.totalSalary : 0)}</p></div>
                    </div>
                </div>
            `;
        }).join('');
    }
    renderManagerHistory();
}

function renderManagersView() {
    renderManagerInputTable();
    const { startDate, endDate } = Utils.loadCurrentMonthData();
    let stats = ManagersModule.getAllManagersStats(startDate, endDate);

    // Фильтруем статистику для не-админов
    if (!AuthModule.isAdmin()) {
        const linkedId = AuthModule.getLinkedEntityId();
        stats = stats.filter(s => s.managerId == linkedId);
    }

    const container = document.getElementById('manager-stats-container');
    if (!container) return;

    if (stats.length === 0) {
        container.innerHTML = '<p class="text-muted">Нет данных за период</p>';
    } else {
        container.innerHTML = stats.map(stat => {
            const salary = ManagersModule.calculateSalary(stat.managerId, startDate, endDate);
            const penaltiesCount = salary ? salary.penaltiesCount : 0;
            const penaltiesAmount = salary ? salary.penaltiesAmount : 0;
            return `
                <div class="card card-stats">
                    <h3>${stat.managerName}</h3>
                    <div class="stats-grid-small">
                        <div><p class="label">План</p><p class="val">${stat.planPercent}%</p></div>
                        <div><p class="label">Зв→Наз</p><p class="val">${stat.conversionCallsToSet}%</p></div>
                        <div><p class="label">Наз→Пр</p><p class="val">${stat.conversionSetToDone}%</p></div>
                        <div><p class="label">Зарплата</p><p class="val text-success">${formatCurrency(salary.totalSalary)}</p></div>
                    </div>
                </div>
            `;
        }).join('');
    }
    renderManagerHistory();
}

function renderManagerHistory() {
    const tbody = document.querySelector('#manager-history-table tbody');
    if (!tbody) return;

    let reports = Utils.getAppData('managerReports').sort((a, b) => new Date(b.date) - new Date(a.date));

    // Фильтруем историю для не-админов
    if (!AuthModule.isAdmin()) {
        const linkedId = AuthModule.getLinkedEntityId();
        reports = reports.filter(r => r.managerId == linkedId);
    }

    reports = reports.slice(0, 20);
    const managers = Utils.getAppData('managers');

    if (reports.length === 0) {
        tbody.innerHTML = '<tr class="no-data"><td colspan="7">Нет данных</td></tr>';
        return;
    }

    tbody.innerHTML = reports.map(r => {
        const m = managers.find(man => man.id == r.managerId);
        return `<tr><td>${formatDate(r.date)}</td><td>${m ? m.name : '?'}</td><td>${r.callsTotal}</td><td>${r.callsQuality || 0}</td><td>${r.appointmentsSet}</td><td>${r.appointmentsDone}</td></tr>`;
    }).join('');
}

// === ЭКСПЕРТЫ ===

function renderExpertInputTable() {
    const container = document.getElementById('experts-monthly-input');
    if (!container) return;

    const date = window.AppState.currentMonth;
    const currentMonthName = date.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
    const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

    let experts = Utils.getAppData('experts');

    // Фильтруем данные для не-админов
    if (!AuthModule.isAdmin()) {
        const linkedId = AuthModule.getLinkedEntityId();
        const currentUser = AuthModule.getCurrentUser();
        let filtered = experts.filter(e => e.id == linkedId);
        // Fallback: если по ID не нашли — ищем по имени
        if (filtered.length === 0 && currentUser) {
            filtered = experts.filter(e => e.name === currentUser.username);
            // Если нашли по имени — синхронизируем linkedEntityId в сессии
            if (filtered.length > 0) {
                const session = AuthModule.currentSession;
                if (session) session.linkedEntityId = filtered[0].id;
            }
        }
        experts = filtered;
    }

    container.innerHTML = `<div style="margin-bottom: 1rem; color: var(--accent-primary); font-size: 1.1rem; text-transform: capitalize; font-weight: bold;">${currentMonthName}</div>`;

    if (experts.length === 0) {
        container.innerHTML += '<p class="text-muted">Нет экспертов</p>';
        return;
    }

    const allSales = Utils.getAppData('expertSales');

    experts.forEach(expert => {
        const sectionId = `expert-${expert.id}`;
        const isOpen = window.AppState.openSections[sectionId] !== undefined
            ? window.AppState.openSections[sectionId]
            : window.AppState.isArchiveMode;

        const details = document.createElement('details');
        details.className = 'accordion-section';
        if (isOpen) details.open = true;

        details.addEventListener('toggle', () => {
            window.AppState.openSections[sectionId] = details.open;
        });

        details.innerHTML = `
            <summary class="accordion-header">💼 ${expert.name}</summary>
            <div class="accordion-content">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Дата</th>
                            <th>Пров.</th>
                            <th>Оффер</th>
                            <th>Прод.</th>
                            <th>Выручка (сум)</th>
                            <th>Выручка (USD)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${generateExpertRows(expert.id, daysInMonth, allSales)}
                    </tbody>
                </table>
            </div>
        `;
        container.appendChild(details);
    });
}

/**
 * Миграция: переименование полей amountSum -> amount и amountUsd -> amountUSD
 */
function updateExpertSalesFieldNames() {
    let sales = StorageModule.getExpertSales();
    if (!sales || sales.length === 0) return;

    let modified = false;
    const migratedSales = sales.map(s => {
        let entryModified = false;

        // amountSum -> amount
        if (s.hasOwnProperty('amountSum') && !s.hasOwnProperty('amount')) {
            s.amount = s.amountSum;
            delete s.amountSum;
            entryModified = true;
        }

        // amountUsd -> amountUSD
        if (s.hasOwnProperty('amountUsd') && !s.hasOwnProperty('amountUSD')) {
            s.amountUSD = s.amountUsd;
            delete s.amountUsd;
            entryModified = true;
        }

        if (entryModified) modified = true;
        return s;
    });

    if (modified) {
        StorageModule.set(StorageModule.KEYS.EXPERT_SALES, migratedSales);
        console.log('Expert sales field names updated to unified format.');
    }
}

function generateExpertRows(expertId, days, allSales) {
    let html = '';
    const date = window.AppState.currentMonth;
    const month = date.getMonth();
    const year = date.getFullYear();
    // Разрешаем редактирование архива только админу
    const isReadOnly = window.AppState.isArchiveMode && !AuthModule.isAdmin();

    for (let i = 1; i <= days; i++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const s = allSales.find(sale => sale.expertId == expertId && sale.date === dateStr) || {};

        const isToday = !window.AppState.isArchiveMode && i === new Date().getDate() && month === new Date().getMonth();
        const rowStyle = isToday ? 'background: rgba(16, 185, 129, 0.1);' : '';

        if (isReadOnly) {
            html += `
                <tr style="${rowStyle}">
                    <td>${i} ${date.toLocaleString('ru-RU', { month: 'short' })}</td>
                    <td>${s.conductedMeetings || 0}</td>
                    <td>${s.offers || 0}</td>
                    <td>${s.dealsCount || 0}</td>
                    <td>${formatCurrency(s.amount || s.amountSum || 0)}</td>
                    <td>${s.amountUSD || s.amountUsd ? formatUSD(s.amountUSD || s.amountUsd) : '-'}</td>
                </tr>
            `;
        } else {
            html += `
                <tr style="${rowStyle}">
                    <td>${i} ${date.toLocaleString('ru-RU', { month: 'short' })}</td>
                    <td><input type="number" class="table-input" min="0" value="${s.conductedMeetings || 0}" onchange="saveCellExpert('${expertId}', '${dateStr}', 'conductedMeetings', this.value)"></td>
                    <td><input type="number" class="table-input" min="0" value="${s.offers || 0}" onchange="saveCellExpert('${expertId}', '${dateStr}', 'offers', this.value)"></td>
                    <td><input type="number" class="table-input" min="0" value="${s.dealsCount || 0}" onchange="saveCellExpert('${expertId}', '${dateStr}', 'dealsCount', this.value)"></td>
                    <td><input type="number" class="table-input" min="0" step="0.01" value="${s.amount || s.amountSum || 0}" onchange="saveCellExpert('${expertId}', '${dateStr}', 'amount', this.value)"></td>
                    <td><input type="number" class="table-input" min="0" step="0.01" value="${s.amountUSD || s.amountUsd || 0}" onchange="saveCellExpert('${expertId}', '${dateStr}', 'amountUSD', this.value)"></td>
                </tr>
            `;
        }
    }
    return html;
}

window.saveCellExpert = function (expertId, date, field, value) {
    if (window.AppState.isArchiveMode && !AuthModule.isAdmin()) return;

    let sales = StorageModule.getExpertSales();
    let index = sales.findIndex(s => s.expertId == expertId && s.date === date);

    if (index === -1) {
        const newS = { expertId, date, conductedMeetings: 0, offers: 0, dealsCount: 0, amount: 0, amountUSD: 0, discipline: false };
        newS[field] = field === 'discipline' ? value : (field === 'amount' || field === 'amountUSD' ? Utils.validatePositiveFloat(value) : Utils.validatePositiveNumber(value));
        sales.push(newS);
    } else {
        sales[index][field] = field === 'discipline' ? value : (field === 'amount' || field === 'amountUSD' ? Utils.validatePositiveFloat(value) : Utils.validatePositiveNumber(value));
    }

    if (window.AppState.isArchiveMode) {
        HistoryModule.saveArchiveChanges();
        renderExpertStatsOnly();
    } else {
        StorageModule.set(StorageModule.KEYS.EXPERT_SALES, sales);
        // Перерисовываем только статистику — таблицу НЕ трогаем (чтобы не сбросить ввод)
        renderExpertStatsOnly();
    }
};

/**
 * Обновляет только блок статистики экспертов (без пересоздания таблицы ввода)
 */
function renderExpertStatsOnly() {
    const { startDate, endDate } = Utils.loadCurrentMonthData();
    let stats = ExpertsModule.getAllExpertsStats(startDate, endDate);

    if (!AuthModule.isAdmin()) {
        const linkedId = AuthModule.getLinkedEntityId();
        const currentUser = AuthModule.getCurrentUser();
        let filtered = stats.filter(s => s.expertId == linkedId);
        if (filtered.length === 0 && currentUser) {
            filtered = stats.filter(s => s.expertName === currentUser.username);
        }
        stats = filtered;
    }

    const container = document.getElementById('expert-stats-container');
    if (!container) return;

    if (stats.length === 0) {
        container.innerHTML = '<p class="text-muted">Нет данных за период</p>';
    } else {
        container.innerHTML = stats.map(stat => {
            const salary = ExpertsModule.calculateSalary(stat.expertId, startDate, endDate);
            return `
                <div class="card card-stats">
                    <h3>${stat.expertName}</h3>
                    <div class="stats-grid-small">
                        <div><p class="label">Выручка</p><p class="val">${formatCurrency(stat.totalRevenue)}</p></div>
                        <div><p class="label">План</p><p class="val">${stat.planPercent}%</p></div>
                        <div><p class="label">Пров→Офф</p><p class="val">${(stat.totalOffers / (stat.conductedMeetings || 1) * 100).toFixed(1)}%</p></div>
                        <div><p class="label">Офф→Прд</p><p class="val">${(stat.totalDeals / (stat.totalOffers || 1) * 100).toFixed(1)}%</p></div>
                        <div><p class="label">Комиссия (${(salary.commissionRate * 100).toFixed(0)}%)</p><p class="val">${formatCurrency(salary.commission)}</p></div>
                        <div><p class="label">Фикс+Дисц</p><p class="val">${formatCurrency(salary.baseFix)}</p></div>
                        <div><p class="label">Лучший месяца</p><p class="val">${formatCurrency(salary.bestMonthBonus)}</p></div>
                        <div><p class="label">ИТОГО ЗП</p><p class="val text-success" style="font-size:1.1rem">${formatCurrency(salary.totalSalary)}</p></div>
                    </div>
                </div>
            `;
        }).join('');
    }
    renderExpertHistory();
}

function renderExpertsView() {
    renderExpertInputTable();
    const { startDate, endDate } = Utils.loadCurrentMonthData();
    let stats = ExpertsModule.getAllExpertsStats(startDate, endDate);

    // Фильтруем статистику для не-админов
    if (!AuthModule.isAdmin()) {
        const linkedId = AuthModule.getLinkedEntityId();
        const currentUser = AuthModule.getCurrentUser();
        let filtered = stats.filter(s => s.expertId == linkedId);
        // Fallback: если по ID не нашли — ищем по имени
        if (filtered.length === 0 && currentUser) {
            filtered = stats.filter(s => s.expertName === currentUser.username);
        }
        stats = filtered;
    }

    const container = document.getElementById('expert-stats-container');
    if (!container) return;

    if (stats.length === 0) {
        container.innerHTML = '<p class="text-muted">Нет данных за период</p>';
    } else {
        container.innerHTML = stats.map(stat => {
            const salary = ExpertsModule.calculateSalary(stat.expertId, startDate, endDate);
            return `
                <div class="card card-stats">
                    <h3>${stat.expertName}</h3>
                    <div class="stats-grid-small">
                        <div><p class="label">Выручка</p><p class="val">${formatCurrency(stat.totalRevenue)}</p></div>
                        <div><p class="label">План</p><p class="val">${stat.planPercent}%</p></div>
                        <div><p class="label">Пров→Офф</p><p class="val">${(stat.totalOffers / (stat.conductedMeetings || 1) * 100).toFixed(1)}%</p></div>
                        <div><p class="label">Офф→Прд</p><p class="val">${(stat.totalDeals / (stat.totalOffers || 1) * 100).toFixed(1)}%</p></div>
                        <div><p class="label">Комиссия (${(salary.commissionRate * 100).toFixed(0)}%)</p><p class="val">${formatCurrency(salary.commission)}</p></div>
                        <div><p class="label">Фикс+Дисц</p><p class="val">${formatCurrency(salary.baseFix)}</p></div>
                        <div><p class="label">Лучший месяца</p><p class="val">${formatCurrency(salary.bestMonthBonus)}</p></div>
                        <div><p class="label">ИТОГО ЗП</p><p class="val text-success" style="font-size:1.1rem">${formatCurrency(salary.totalSalary)}</p></div>
                    </div>
                </div>
            `;
        }).join('');
    }
    renderExpertHistory();
}

function renderExpertHistory() {
    const tbody = document.querySelector('#expert-history-table tbody');
    if (!tbody) return;

    let sales = Utils.getAppData('expertSales').sort((a, b) => new Date(b.date) - new Date(a.date));

    // Фильтруем историю для не-админов
    if (!AuthModule.isAdmin()) {
        const linkedId = AuthModule.getLinkedEntityId();
        const currentUser = AuthModule.getCurrentUser();
        let filtered = sales.filter(s => s.expertId == linkedId);
        // Fallback: если по ID не нашли — ищем по имени через список экспертов
        if (filtered.length === 0 && currentUser) {
            const allExperts = Utils.getAppData('experts');
            const myExpert = allExperts.find(e => e.name === currentUser.username);
            if (myExpert) filtered = sales.filter(s => s.expertId == myExpert.id);
        }
        sales = filtered;
    }

    sales = sales.slice(0, 20);
    const experts = Utils.getAppData('experts');

    if (sales.length === 0) {
        tbody.innerHTML = '<tr class="no-data"><td colspan="5">Нет данных</td></tr>';
        return;
    }

    tbody.innerHTML = sales.map(s => {
        const e = experts.find(ex => ex.id === s.expertId);
        return `<tr><td>${formatDate(s.date)}</td><td>${e ? e.name : '?'}</td><td>${s.offers || 0}</td><td>${formatCurrency(s.amount || s.amountSum || 0)}</td><td>${s.discipline ? '✅' : '❌'}</td></tr>`;
    }).join('');
}

// === МАРКЕТИНГ ===

function renderMarketingView() {
    const { startDate, endDate } = Utils.loadCurrentMonthData();
    const metrics = MarketingModule.calculateMetrics(startDate, endDate);

    const cardsContainer = document.getElementById('marketing-cards-container');
    if (cardsContainer) {
        cardsContainer.innerHTML = `
            <div class="card card-primary"><div class="card-icon">💰</div><div class="card-content"><h3>Расходы</h3><p class="card-value">${formatUSD(metrics.expenses)}</p></div></div>
            <div class="card card-success"><div class="card-icon">📈</div><div class="card-content"><h3>ROMI</h3><p class="card-value">${metrics.ROMI}%</p></div></div>
            <div class="card card-warning"><div class="card-icon">🎯</div><div class="card-content"><h3>CPL</h3><p class="card-value">${formatUSD(metrics.CPL)}</p></div></div>
            <div class="card card-info"><div class="card-icon">💎</div><div class="card-content"><h3>CAC</h3><p class="card-value">${formatUSD(metrics.CAC)}</p></div></div>
        `;
    }

    const funnelInner = document.getElementById('marketing-funnel-container');
    if (!funnelInner) {
        const view = document.getElementById('marketing-view');
        const sec = document.createElement('div');
        sec.className = 'section';
        sec.innerHTML = '<h3 class="section-title">📊 Воронка конверсий</h3><div id="marketing-funnel-container" class="table-container"></div>';
        view.appendChild(sec);
    }

    document.getElementById('marketing-funnel-container').innerHTML = `
        <table class="data-table">
            <thead><tr><th>Показатель</th><th>Значение</th><th>Тип</th></tr></thead>
            <tbody>
                <tr><td>CTR</td><td><strong>${metrics.CTR}%</strong></td><td>Просм→Клик</td></tr>
                <tr><td>CR Сайт (в лид)</td><td><strong>${metrics.siteConv}%</strong></td><td>Лиды/Клик</td></tr>
                <tr><td>CR Лид→КЭВ</td><td><strong>${metrics.crLeadToConducted}%</strong></td><td>КЭВ/Лид</td></tr>
                <tr><td>CR КЭВ→Оффер</td><td><strong>${metrics.crConductedToOffer}%</strong></td><td>Оффер/КЭВ</td></tr>
                <tr><td>CR Оффер→Прод</td><td><strong>${metrics.crOfferToSale}%</strong></td><td>Прод/Оффер</td></tr>
                <tr><td>CPK (цена КЭВ)</td><td><strong>${formatUSD(metrics.CPK)}</strong></td><td>Маркетинг</td></tr>
                <tr style="background:rgba(16,185,129,0.1)"><td><strong>CAC (цена продажи)</strong></td><td><strong>${formatUSD(metrics.CAC)}</strong></td><td>Итого</td></tr>
            </tbody>
        </table>
    `;

    renderMarketingInputTable();
    renderMarketersSalary();
    renderDecomposition();
}

/**
 * Рендер таблицы декомпозиции
 */
window.renderDecomposition = function () {
    const monthLabel = window.AppState.archiveMonthLabel || (window.AppState.currentMonth || new Date()).toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
    const data = DecompositionModule.getDecompositionForMonth(monthLabel);

    const inputs = {
        revenue: document.getElementById('decomp-revenue'),
        avgTicket: document.getElementById('decomp-avg-ticket'),
        crSale: document.getElementById('decomp-cr-sale'),
        crOffer: document.getElementById('decomp-cr-offer'),
        crLead: document.getElementById('decomp-cr-lead'),
        cpl: document.getElementById('decomp-cpl')
    };

    if (!inputs.revenue) return;

    // Заполняем инпуты
    inputs.revenue.value = data.targetRevenue || '';
    inputs.avgTicket.value = data.avgTicket || '';
    inputs.crSale.value = data.crOfferToSale || '';
    inputs.crOffer.value = data.crConductedToOffer || '';
    inputs.crLead.value = data.crLeadToConducted || '';
    inputs.cpl.value = data.cpl || '';

    // Блокируем в архиве
    Object.values(inputs).forEach(inp => inp.disabled = window.AppState.isArchiveMode && !AuthModule.isAdmin());

    // Навешиваем живой пересчет
    Object.values(inputs).forEach(inp => {
        inp.oninput = () => calculateDecompositionLive();
    });

    calculateDecompositionLive();
};

function calculateDecompositionLive() {
    const data = {
        targetRevenue: parseFloat(document.getElementById('decomp-revenue').value) || 0,
        avgTicket: parseFloat(document.getElementById('decomp-avg-ticket').value) || 0,
        crOfferToSale: parseFloat(document.getElementById('decomp-cr-sale').value) || 0,
        crConductedToOffer: parseFloat(document.getElementById('decomp-cr-offer').value) || 0,
        crLeadToConducted: parseFloat(document.getElementById('decomp-cr-lead').value) || 0,
        cpl: parseFloat(document.getElementById('decomp-cpl').value) || 0
    };

    const res = DecompositionModule.calculate(data);

    document.getElementById('res-revenue').textContent = formatUSD(res.targetRevenue);
    document.getElementById('res-sales').textContent = res.salesNeeded + ' продаж';
    document.getElementById('res-offers').textContent = res.offersNeeded + ' офферов';
    document.getElementById('res-conducted').textContent = res.conductedNeeded + ' КЭВ';
    document.getElementById('res-leads').textContent = res.leadsNeeded + ' лидов';
    document.getElementById('res-budget').textContent = formatUSD(res.budgetNeeded) + ' бюджет';
    document.getElementById('res-roi').textContent = res.roi + '%';
}

window.saveDecomposition = function () {
    if (window.AppState.isArchiveMode && !AuthModule.isAdmin()) return;

    const monthLabel = window.AppState.archiveMonthLabel || (window.AppState.currentMonth || new Date()).toLocaleString('ru-RU', { month: 'long', year: 'numeric' });

    const data = {
        month: monthLabel,
        targetRevenue: parseFloat(document.getElementById('decomp-revenue').value) || 0,
        avgTicket: parseFloat(document.getElementById('decomp-avg-ticket').value) || 0,
        crOfferToSale: parseFloat(document.getElementById('decomp-cr-sale').value) || 0,
        crConductedToOffer: parseFloat(document.getElementById('decomp-cr-offer').value) || 0,
        crLeadToConducted: parseFloat(document.getElementById('decomp-cr-lead').value) || 0,
        cpl: parseFloat(document.getElementById('decomp-cpl').value) || 0
    };

    DecompositionModule.saveDecomposition(data);
    Utils.showNotification('План декомпозиции сохранен на ' + monthLabel, 'success');
};

function renderMarketersSalary() {
    const tbody = document.querySelector('#marketers-salary-table tbody');
    if (!tbody) return;

    const { startDate, endDate } = Utils.loadCurrentMonthData();
    const stats = MarketersModule.getAllMarketersStats(startDate, endDate);

    if (stats.length === 0) {
        tbody.innerHTML = '<tr class="no-data"><td colspan="7">Нет данных</td></tr>';
        return;
    }

    tbody.innerHTML = stats.map(s => `
        <tr>
            <td>${s.name}</td>
            <td>$${s.baseFix}</td>
            <td>${s.roi.toFixed(1)}%</td>
            <td>$${s.budget.toLocaleString()}</td>
            <td>${s.bonusPercent}%</td>
            <td>$${s.bonusAmount.toFixed(2)}</td>
            <td style="font-weight:bold; color:var(--accent-success)">$${s.totalSalary.toFixed(2)}</td>
        </tr>
    `).join('');
}

function renderMarketingInputTable() {
    const container = document.getElementById('marketing-monthly-input');
    if (!container) return;
    const { startDate, endDate } = Utils.loadCurrentMonthData();
    const date = window.AppState.currentMonth || new Date();
    const days = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const year = date.getFullYear();
    const month = date.getMonth();
    // Разрешаем редактирование архива только админу
    const isReadOnly = window.AppState.isArchiveMode && !AuthModule.isAdmin();

    let html = `<table class="data-table"><thead><tr><th>Дата</th><th>Расходы</th><th>Просмотры</th><th>Клики</th><th>Лиды</th><th>Назначено</th><th>Проведено</th><th>Оффер</th><th>Продажи</th><th>Выручка (USD)</th><th>ROMI (USD)</th></tr></thead><tbody>`;
    for (let i = 1; i <= days; i++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const r = MarketingModule.getSyncedDailyData(dateStr);
        const isToday = !window.AppState.isArchiveMode && i === new Date().getDate() && month === new Date().getMonth();
        const rowStyle = isToday ? 'font-weight:bold; background:rgba(16,185,129,0.05)' : '';

        // Рассчитываем ROMI для каждого дня
        const dailyROMI = r.expenses > 0 ? ((r.revenueUSD - r.expenses) / r.expenses * 100).toFixed(1) : 0;

        if (isReadOnly) {
            html += `<tr style="${rowStyle}">
                <td>${i} ${date.toLocaleString('ru-RU', { month: 'short' })}</td>
                <td>${formatUSD(r.expenses || 0)}</td>
                <td>${formatNumber(r.views || 0)}</td>
                <td>${formatNumber(r.clicks || 0)}</td>
                <td>${formatNumber(r.leads || 0)}</td>
                <td>${formatNumber(r.appointments || 0)}</td>
                <td>${formatNumber(r.conducted || 0)}</td>
                <td>${formatNumber(r.offers || 0)}</td>
                <td>${r.sales}</td>
                <td>${formatUSD(r.revenueUSD)}</td>
                <td>${dailyROMI}%</td>
            </tr>`;
        } else {
            html += `<tr style="${rowStyle}">
                <td>${i} ${date.toLocaleString('ru-RU', { month: 'short' })}</td>
                <td><input type="number" class="table-input" min="0" step="0.01" value="${r.expenses || 0}" onchange="saveCellMarketing('${dateStr}', 'expenses', this.value)"></td>
                <td><input type="number" class="table-input" min="0" value="${r.views || 0}" onchange="saveCellMarketing('${dateStr}', 'views', this.value)"></td>
                <td><input type="number" class="table-input" min="0" value="${r.clicks || 0}" onchange="saveCellMarketing('${dateStr}', 'clicks', this.value)"></td>
                <td><input type="number" class="table-input" min="0" value="${r.leads || 0}" onchange="saveCellMarketing('${dateStr}', 'leads', this.value)"></td>
                <td><input type="number" class="table-input" value="${r.appointments || 0}" readonly style="background:rgba(0,0,0,0.1)" title="Синхронно из Менеджеров"></td>
                <td><input type="number" class="table-input" value="${r.conducted || 0}" readonly style="background:rgba(0,0,0,0.1)" title="Синхронно из Менеджеров"></td>
                <td><input type="number" class="table-input" value="${r.offers || 0}" readonly style="background:rgba(0,0,0,0.1)" title="Синхронно из Экспертов"></td>
                <td><input type="number" class="table-input" value="${r.sales}" readonly style="background:rgba(0,0,0,0.1)" title="Синхронно из Экспертов"></td>
                <td><input type="number" class="table-input" value="${r.revenueUSD}" readonly style="background:rgba(0,0,0,0.1)" title="Синхронно из Экспертов"></td>
                <td style="font-weight:bold; color: ${dailyROMI > 0 ? 'var(--accent-success)' : 'var(--accent-danger)'}">${dailyROMI}%</td>
            </tr>`;
        }
    }
    html += `</tbody></table>`;
    container.innerHTML = html;
}

window.saveCellMarketing = function (date, field, value) {
    if (window.AppState.isArchiveMode && !AuthModule.isAdmin()) return;

    let reports = StorageModule.getMarketingReports();
    let index = reports.findIndex(r => r.date === date);
    if (index === -1) {
        const newR = { date, expenses: 0, views: 0, clicks: 0, leads: 0, qualLeads: 0, appointments: 0, conducted: 0, offers: 0, sales: 0, revenue: 0 };
        newR[field] = Utils.validatePositiveFloat(value);
        reports.push(newR);
    } else {
        reports[index][field] = Utils.validatePositiveFloat(value);
    }

    if (window.AppState.isArchiveMode) {
        HistoryModule.saveArchiveChanges();
    } else {
        StorageModule.set(StorageModule.KEYS.MARKETING_REPORTS, reports);
    }

    renderMarketingView();
};

// === ОБЩИЕ ФУНКЦИИ ===

window.renderDashboard = function renderDashboard() {
    const { startDate, endDate } = Utils.loadCurrentMonthData();
    const mStats = ManagersModule.getAllManagersStats(startDate, endDate);
    const eStats = ExpertsModule.getAllExpertsStats(startDate, endDate);

    const totalCalls = mStats.reduce((sum, m) => sum + m.totalQuality, 0);
    const totalDone = mStats.reduce((sum, m) => sum + m.totalDone, 0);
    const totalRevenue = eStats.reduce((sum, e) => sum + e.totalRevenue, 0);

    const allExperts = StorageModule.getExperts();
    const totalPlan = allExperts.reduce((sum, e) => sum + (parseInt(e.monthPlan) || 0), 0);
    const planPerc = totalPlan > 0 ? (totalRevenue / totalPlan * 100).toFixed(1) : 0;

    document.getElementById('total-calls').textContent = formatNumber(totalCalls);
    document.getElementById('total-done').textContent = formatNumber(totalDone);
    document.getElementById('total-revenue').textContent = formatCurrency(totalRevenue);
    document.getElementById('plan-percent').textContent = planPerc + '%';

    renderManagersRanking(mStats);
    renderExpertsRanking(eStats);
};

function renderManagersRanking(stats) {
    const tbody = document.querySelector('#managers-ranking tbody');
    if (!tbody) return;
    if (stats.length === 0) { tbody.innerHTML = '<tr class="no-data"><td colspan="6">Нет данных</td></tr>'; return; }
    tbody.innerHTML = stats.map((s, i) => `<tr><td>${i + 1}</td><td>${s.managerName}</td><td>${s.totalDone}</td><td>${s.planPercent}%</td><td>${s.conversionSetToDone}%</td><td>${formatCurrency(s.salary)}</td></tr>`).join('');
}

function renderExpertsRanking(stats) {
    const tbody = document.querySelector('#experts-ranking tbody');
    if (!tbody) return;
    if (stats.length === 0) { tbody.innerHTML = '<tr class="no-data"><td colspan="7">Нет данных</td></tr>'; return; }
    tbody.innerHTML = stats.map((s, i) => `<tr><td>${i + 1}</td><td>${s.expertName}</td><td>${s.totalDeals}</td><td>${formatCurrency(s.totalRevenue)}</td><td>${s.planPercent}%</td><td>${s.conversionConductedToSale}%</td><td>${formatCurrency(s.salary)}</td></tr>`).join('');
}

function renderSettingsView() {
    const managersList = document.getElementById('managers-list');
    const expertsList = document.getElementById('experts-list');
    const marketersList = document.getElementById('marketers-list');

    if (managersList) {
        managersList.innerHTML = StorageModule.getManagers().map(m => `
            <li class="user-item">
                <span>${m.name} (План: ${m.monthPlan}) ${m.promoted ? '⭐' : ''}</span>
                <div style="display: flex; gap: 5px;">
                    <button class="btn btn-sm btn-secondary" onclick="window.openEditModal('${m.id}', 'manager')" ${window.AppState.isArchiveMode ? 'disabled' : ''}>✏️</button>
                    <button class="btn btn-sm btn-danger" onclick="window.deleteManager('${m.id}')" ${window.AppState.isArchiveMode ? 'disabled' : ''}>🗑️</button>
                </div>
            </li>
        `).join('') || '<li class="text-muted">Нет сотрудников</li>';
    }

    if (expertsList) {
        expertsList.innerHTML = StorageModule.getExperts().map(e => `
            <li class="user-item">
                <span>${e.name} (План: ${formatCurrency(e.monthPlan)})</span>
                <div style="display: flex; gap: 5px;">
                    <button class="btn btn-sm btn-secondary" onclick="window.openEditModal('${e.id}', 'expert')" ${window.AppState.isArchiveMode ? 'disabled' : ''}>✏️</button>
                    <button class="btn btn-sm btn-danger" onclick="window.deleteExpert('${e.id}')" ${window.AppState.isArchiveMode ? 'disabled' : ''}>🗑️</button>
                </div>
            </li>
        `).join('') || '<li class="text-muted">Нет сотрудников</li>';
    }

    if (marketersList) {
        marketersList.innerHTML = StorageModule.getMarketers().map(m => `
            <li class="user-item">
                <span>${m.name} (Фикс: $${m.baseFix || 200})</span>
                <div style="display: flex; gap: 5px;">
                    <button class="btn btn-sm btn-secondary" onclick="window.openEditModal('${m.id}', 'marketer')" ${window.AppState.isArchiveMode ? 'disabled' : ''}>✏️</button>
                    <button class="btn btn-sm btn-danger" onclick="window.deleteMarketer('${m.id}')" ${window.AppState.isArchiveMode ? 'disabled' : ''}>🗑️</button>
                </div>
            </li>
        `).join('') || '<li class="text-muted">Нет сотрудников</li>';
    }

    // Обработчики кнопок управления данными
    const archiveBtn = document.getElementById('archive-month-btn');
    const clearBtn = document.getElementById('clear-all-btn');

    if (archiveBtn) {
        const newBtn = archiveBtn.cloneNode(true);
        archiveBtn.parentNode.replaceChild(newBtn, archiveBtn);

        if (window.AppState.isArchiveMode) {
            newBtn.disabled = true;
            newBtn.title = "Недоступно в режиме архива";
        } else {
            newBtn.disabled = false;
            newBtn.onclick = () => {
                if (confirm('Вы уверены, что хотите закрыть текущий месяц? Все данные будут перемещены в архив, а текущие таблицы очищены.')) {
                    HistoryModule.archiveCurrentMonth();
                }
            };
        }
    }

    if (clearBtn) {
        const newBtn = clearBtn.cloneNode(true);
        clearBtn.parentNode.replaceChild(newBtn, clearBtn);

        if (window.AppState.isArchiveMode) {
            newBtn.disabled = true;
            newBtn.title = "Недоступно в режиме архива";
        } else {
            newBtn.disabled = false;
            newBtn.onclick = () => {
                if (confirm('ВНИМАНИЕ: Это полностью удалит ВСЕ данные (менеджеры, эксперты, отчеты, история). Это действие необратимо. Продолжить?')) {
                    StorageModule.clearAll();
                    StorageModule.initialize();
                    location.reload();
                }
            };
        }
    }

    // === BACKUP / RESTORE ===
    const backupBtn = document.getElementById('backup-data-btn');
    if (backupBtn) {
        // Клонируем кнопку, чтобы удалить старые обработчики
        const newBtn = backupBtn.cloneNode(true);
        backupBtn.parentNode.replaceChild(newBtn, backupBtn);
        newBtn.onclick = () => {
            const data = {
                managers: StorageModule.getManagers(),
                experts: StorageModule.getExperts(),
                managerReports: StorageModule.getManagerReports(),
                expertSales: StorageModule.getExpertSales(),
                marketingReports: StorageModule.getMarketingReports(),
                history: StorageModule.getHistory(),
                timestamp: new Date().toISOString()
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `rnp_backup_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            Utils.showNotification('Резервная копия скачана', 'success');
        };
    }

    const restoreInput = document.getElementById('restore-data-input');
    const restoreBtn = document.getElementById('restore-data-btn');

    if (restoreBtn && restoreInput) {
        const newBtn = restoreBtn.cloneNode(true);
        restoreBtn.parentNode.replaceChild(newBtn, restoreBtn);

        newBtn.onclick = () => restoreInput.click();

        restoreInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    if (confirm(`Найдена резервная копия от ${new Date(data.timestamp).toLocaleString()}. \nВНИМАНИЕ: Текущие данные будут ЗАМЕНЕНЫ. Продолжить?`)) {
                        if (data.managers) StorageModule.set(StorageModule.KEYS.MANAGERS, data.managers);
                        if (data.experts) StorageModule.set(StorageModule.KEYS.EXPERTS, data.experts);
                        if (data.managerReports) StorageModule.set(StorageModule.KEYS.MANAGER_REPORTS, data.managerReports);
                        if (data.expertSales) StorageModule.set(StorageModule.KEYS.EXPERT_SALES, data.expertSales);
                        if (data.marketingReports) StorageModule.set(StorageModule.KEYS.MARKETING_REPORTS, data.marketingReports);
                        if (data.history) StorageModule.set(StorageModule.KEYS.HISTORY, data.history);

                        alert('✅ Данные успешно восстановлены! Страница будет перезагружена.');
                        location.reload();
                    }
                } catch (err) {
                    alert('❌ Ошибка чтения файла: ' + err.message);
                }
            };
            reader.readAsText(file);
            e.target.value = ''; // Сброс, чтобы можно было выбрать тот же файл снова
        };
    }

    // Блокировка форм добавления
    const forms = document.querySelectorAll('#settings-view form');
    forms.forEach(f => {
        const inputs = f.querySelectorAll('input, button');
        inputs.forEach(inp => inp.disabled = window.AppState.isArchiveMode);
    });
}

// === HANDLERS ===

window.deleteManager = function (id) {
    if (window.AppState.isArchiveMode) return;
    if (!confirm('Удалить менеджера?')) return;
    StorageModule.deleteManager(id);
    AuthModule.deleteUserForEmployee(id); // Удаляем пользователя
    renderSettingsView();
    renderDashboard();
};

window.deleteExpert = function (id) {
    if (window.AppState.isArchiveMode) return;
    if (!confirm('Удалить эксперта?')) return;
    StorageModule.deleteExpert(id);
    AuthModule.deleteUserForEmployee(id);
    renderSettingsView();
    renderDashboard();
};

window.deleteMarketer = function (id) {
    if (window.AppState.isArchiveMode) return;
    if (!confirm('Удалить маркетолога?')) return;
    StorageModule.deleteMarketer(id);
    AuthModule.deleteUserForEmployee(id);
    renderSettingsView();
    renderMarketingView();
};

window.handleAddManager = function (e) {
    e.preventDefault();
    if (window.AppState.isArchiveMode) return;

    const name = document.getElementById('new-manager-name').value.trim();
    const hireDate = document.getElementById('manager-hire-date').value;
    const plan = document.getElementById('manager-plan').value;

    if (!name) {
        Utils.showNotification('Введите имя менеджера', 'error');
        return;
    }

    const newManager = StorageModule.addManager({
        name,
        hireDate,
        monthPlan: Utils.validatePositiveNumber(plan)
    });

    // Создаем пользователя для нового менеджера
    AuthModule.createUserForEmployee(name, newManager.id, 'manager');

    e.target.reset();
    renderSettingsView();
    Utils.showNotification('Менеджер добавлен', 'success');
};

window.handleAddExpert = function (e) {
    e.preventDefault();
    if (window.AppState.isArchiveMode) return;

    const name = document.getElementById('new-expert-name').value.trim();
    const plan = document.getElementById('expert-plan').value;

    if (!name) {
        Utils.showNotification('Введите имя эксперта', 'error');
        return;
    }

    const newExpert = StorageModule.addExpert({
        name,
        monthPlan: Utils.validatePositiveNumber(plan)
    });

    AuthModule.createUserForEmployee(name, newExpert.id, 'expert');

    e.target.reset();
    renderSettingsView();
    Utils.showNotification('Эксперт добавлен', 'success');
};

window.handleAddMarketer = function (e) {
    e.preventDefault();
    if (window.AppState.isArchiveMode) return;

    const name = document.getElementById('new-marketer-name').value.trim();

    if (!name) {
        Utils.showNotification('Введите имя маркетолога', 'error');
        return;
    }

    const newMarketer = StorageModule.addMarketer({
        name,
        baseFix: 200
    });

    AuthModule.createUserForEmployee(name, newMarketer.id, 'marketer');

    e.target.reset();
    renderSettingsView();
    Utils.showNotification('Маркетолог добавлен', 'success');
};

window.updateManagerPlan = function (id, val) {
    const managers = StorageModule.getManagers();
    const i = managers.findIndex(m => m.id == id);
    if (i !== -1) {
        managers[i].monthPlan = Utils.validatePositiveNumber(val);
        StorageModule.set(StorageModule.KEYS.MANAGERS, managers);
        renderDashboard();
    }
};

window.updateExpertPlan = function (id, val) {
    const experts = StorageModule.getExperts();
    const i = experts.findIndex(e => e.id == id);
    if (i !== -1) {
        experts[i].monthPlan = Utils.validatePositiveNumber(val);
        StorageModule.set(StorageModule.KEYS.EXPERTS, experts);
        renderDashboard();
    }
};

/**
 * Открытие модалки редактирования
 */
window.openEditModal = function (id, type) {
    const modal = document.getElementById('edit-user-modal');
    const nameInput = document.getElementById('edit-user-name');
    const planInput = document.getElementById('edit-user-plan');
    const idInput = document.getElementById('edit-user-id');
    const typeInput = document.getElementById('edit-user-type');
    const title = document.getElementById('edit-modal-title');

    const planLabel = planInput.parentElement.querySelector('label');

    // Сброс базовых настроек вида модалки
    planLabel.textContent = 'Месячный план (или Фикса):';
    planInput.parentElement.style.display = 'block';

    let user;
    if (type === 'manager') {
        user = StorageModule.getManagers().find(m => m.id == id);
        title.textContent = 'Редактировать SDR менеджера';
        planInput.value = user.monthPlan || 0;
    } else if (type === 'expert') {
        user = StorageModule.getExperts().find(e => e.id == id);
        title.textContent = 'Редактировать эксперта';
        planInput.value = user.monthPlan || 0;
    } else if (type === 'marketer') {
        user = StorageModule.getMarketers().find(m => m.id == id);
        title.textContent = 'Редактировать маркетолога';
        planLabel.textContent = 'Фикса ($):';
        planInput.value = user.baseFix || 200;
    }

    if (user) {
        idInput.value = id;
        typeInput.value = type;
        nameInput.value = user.name;
        modal.style.display = 'flex';
    }
};

window.closeEditModal = function () {
    document.getElementById('edit-user-modal').style.display = 'none';
};

/**
 * Обработка сохранения редактирования
 */
window.handleEditUser = function (e) {
    e.preventDefault();
    const id = document.getElementById('edit-user-id').value;
    const type = document.getElementById('edit-user-type').value;
    const name = document.getElementById('edit-user-name').value;
    const plan = parseInt(document.getElementById('edit-user-plan').value) || 0;

    let success = false;
    if (type === 'manager') {
        success = StorageModule.updateManager(id, { name, monthPlan: plan });
    } else if (type === 'expert') {
        success = StorageModule.updateExpert(id, { name, monthPlan: plan });
    } else if (type === 'marketer') {
        success = StorageModule.updateMarketer(id, { name, baseFix: plan });
    }

    if (success) {
        Utils.showNotification('Данные сотрудника обновлены', 'success');
        window.closeEditModal();
        renderSettingsView(); // Обновляем список
        renderDashboard();    // Обновляем дашборд (планы могли измениться)
    } else {
        Utils.showNotification('Ошибка при обновлении данных', 'error');
    }
};

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    const editForm = document.getElementById('edit-user-form');
    if (editForm) editForm.addEventListener('submit', window.handleEditUser);

    const managerForm = document.getElementById('add-manager-form');
    if (managerForm) managerForm.addEventListener('submit', window.handleAddManager);

    const expertForm = document.getElementById('add-expert-form');
    if (expertForm) expertForm.addEventListener('submit', window.handleAddExpert);

    const marketerForm = document.getElementById('add-marketer-form');
    if (marketerForm) marketerForm.addEventListener('submit', window.handleAddMarketer);

    // UX: Автоматическая очистка "0" при нажатии на ячейку ввода
    document.addEventListener('focusin', (e) => {
        if (e.target.classList.contains('table-input') && (e.target.type === 'number' || e.target.type === 'text')) {
            if (e.target.value === '0' || e.target.value === '0.00') {
                e.target.value = '';
            }
        }
    });

    // Возвращаем "0" если пользователь ничего не ввел и ушел из ячейки
    document.addEventListener('focusout', (e) => {
        if (e.target.classList.contains('table-input') && e.target.type === 'number') {
            if (e.target.value === '') {
                e.target.value = '0';
            }
        }
    });

    // UX: Обработка вставки (Paste) для очистки данных от мусора (пробелы, символы валют)
    document.addEventListener('paste', (e) => {
        if (e.target.classList.contains('table-input') && e.target.type === 'number') {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text');
            // Очищаем: убираем всё кроме цифр, точек и запятых
            const cleaned = text.replace(/\s/g, '').replace(/[^\d.,-]/g, '').replace(',', '.');
            if (cleaned !== '') {
                e.target.value = cleaned;
                // Триггерим событие изменения, чтобы сработал saveCell...
                e.target.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    });
});


