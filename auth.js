/**
 * Authentication Module
 * Управление авторизацией и доступом пользователей
 */

const AuthModule = {
    /**
     * Текущая сессия пользователя
     */
    currentSession: null,

    /**
     * Инициализация модуля авторизации
     */
    initialize() {
        // Проверяем, есть ли сохраненная сессия
        const savedSession = sessionStorage.getItem('rnp_session');
        if (savedSession) {
            try {
                this.currentSession = JSON.parse(savedSession);
            } catch (e) {
                console.error('Error loading session:', e);
                this.currentSession = null;
            }
        }

        // Создаем пользователей при первом запуске
        this.ensureUsersExist();
    },

    /**
     * Создание пользователей для всех менеджеров и экспертов
     */
    ensureUsersExist() {
        let users = StorageModule.get(StorageModule.KEYS.USERS);

        if (!users || users.length === 0) {
            users = [];

            // Создаем админа
            users.push({
                id: 'admin',
                username: 'Администратор',
                password: 'Qweqwe145',
                role: 'admin',
                linkedEntityId: null
            });

            // Создаем пользователей для менеджеров
            const managers = StorageModule.getManagers();
            managers.forEach(manager => {
                users.push({
                    id: `user_${manager.id}`,
                    username: manager.name,
                    password: 'Qweqwe145',
                    role: 'manager',
                    linkedEntityId: manager.id
                });
            });

            // Создаем пользователей для экспертов
            const experts = StorageModule.getExperts();
            experts.forEach(expert => {
                users.push({
                    id: `user_${expert.id}`,
                    username: expert.name,
                    password: 'Qweqwe145',
                    role: 'expert',
                    linkedEntityId: expert.id
                });
            });

            StorageModule.set(StorageModule.KEYS.USERS, users);
        }
    },

    /**
     * Вход в систему
     */
    login(username, password) {
        const users = StorageModule.get(StorageModule.KEYS.USERS) || [];
        const user = users.find(u => u.username === username && u.password === password);

        if (user) {
            this.currentSession = {
                userId: user.id,
                username: user.username,
                role: user.role,
                linkedEntityId: user.linkedEntityId
            };
            sessionStorage.setItem('rnp_session', JSON.stringify(this.currentSession));
            return { success: true, user: this.currentSession };
        }

        return { success: false, error: 'Неверный логин или пароль' };
    },

    /**
     * Выход из системы
     */
    logout() {
        this.currentSession = null;
        sessionStorage.removeItem('rnp_session');
    },

    /**
     * Получить текущего пользователя
     */
    getCurrentUser() {
        return this.currentSession;
    },

    /**
     * Проверка, является ли пользователь администратором
     */
    isAdmin() {
        return this.currentSession && this.currentSession.role === 'admin';
    },

    /**
     * Проверка, авторизован ли пользователь
     */
    isAuthenticated() {
        return this.currentSession !== null;
    },

    /**
     * Проверка прав на редактирование сущности
     */
    canEdit(entityId) {
        if (!this.currentSession) return false;
        if (this.isAdmin()) return true;
        return this.currentSession.linkedEntityId === entityId;
    },

    /**
     * Получить ID связанной сущности (менеджера или эксперта)
     */
    getLinkedEntityId() {
        return this.currentSession ? this.currentSession.linkedEntityId : null;
    },

    /**
     * Получить роль текущего пользователя
     */
    getRole() {
        return this.currentSession ? this.currentSession.role : null;
    },

    /**
     * Обновить пароль пользователя (только для админа)
     */
    updatePassword(userId, newPassword) {
        if (!this.isAdmin()) {
            return { success: false, error: 'Недостаточно прав' };
        }

        const users = StorageModule.get(StorageModule.KEYS.USERS) || [];
        const userIndex = users.findIndex(u => u.id === userId);

        if (userIndex === -1) {
            return { success: false, error: 'Пользователь не найден' };
        }

        users[userIndex].password = newPassword;
        StorageModule.set(StorageModule.KEYS.USERS, users);

        return { success: true };
    },

    /**
     * Создать пользователя для нового сотрудника
     */
    createUserForEmployee(employeeName, employeeId, role) {
        const users = StorageModule.get(StorageModule.KEYS.USERS) || [];

        const newUser = {
            id: `user_${employeeId}`,
            username: employeeName,
            password: 'Qweqwe145',
            role: role, // 'manager' или 'expert'
            linkedEntityId: employeeId
        };

        users.push(newUser);
        StorageModule.set(StorageModule.KEYS.USERS, users);

        return newUser;
    },

    /**
     * Удалить пользователя при удалении сотрудника
     */
    deleteUserForEmployee(employeeId) {
        let users = StorageModule.get(StorageModule.KEYS.USERS) || [];
        users = users.filter(u => u.linkedEntityId !== employeeId);
        StorageModule.set(StorageModule.KEYS.USERS, users);
    },

    /**
     * Получить всех пользователей (только для админа)
     */
    getAllUsers() {
        if (!this.isAdmin()) return [];
        return StorageModule.get(StorageModule.KEYS.USERS) || [];
    }
};

// Инициализация при загрузке модуля
AuthModule.initialize();
