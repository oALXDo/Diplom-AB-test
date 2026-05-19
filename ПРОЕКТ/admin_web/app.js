const API_BASE = '/api';
const STORAGE_USER_KEY = 'parametrika_user';
const STORAGE_APP_ICONS_KEY = 'parametrika_app_icons';
const STORAGE_ACTIVITY_KEY = 'parametrika_activity';
const SITE_ICON_SRC = 'assets/site-icon.png';

const state = {
  currentUser: readStoredUser(),
  authMode: 'login',
  view: 'applications',
  selectedApplicationId: null,
  editingApplicationId: null,
  selectedParameterId: null,
  selectedExperimentId: null,
  applications: [],
  parameters: [],
  experiments: [],
  appSearch: '',
  parameterSearch: '',
  experimentSearch: '',
  isLoading: false
};

const root = document.querySelector('#app');
let toastTimer = null;

function readAppIcons() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_APP_ICONS_KEY)) || {};
  } catch (error) {
    return {};
  }
}

function writeAppIcon(applicationId, iconValue) {
  const icons = readAppIcons();
  icons[String(applicationId)] = iconValue;
  localStorage.setItem(STORAGE_APP_ICONS_KEY, JSON.stringify(icons));
}

function visualAppIcon(app, fallbackIndex = 0) {
  const icons = readAppIcons();
  return icons[String(app.application_id)] || appIcon(fallbackIndex);
}

function readActivityMap() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_ACTIVITY_KEY)) || {};
  } catch (error) {
    return {};
  }
}

function writeActivityMap(activityMap) {
  localStorage.setItem(STORAGE_ACTIVITY_KEY, JSON.stringify(activityMap));
}

function activityKey(type, id) {
  return `${type}:${id}`;
}

function touchActivity(type, id, when = Date.now()) {
  if (!id) return;
  const activityMap = readActivityMap();
  activityMap[activityKey(type, id)] = when;
  writeActivityMap(activityMap);
}

function removeActivity(type, id) {
  const activityMap = readActivityMap();
  delete activityMap[activityKey(type, id)];
  writeActivityMap(activityMap);
}

function getActivityTime(type, item, idField, fallbackField = 'created_at') {
  const activityMap = readActivityMap();
  const stored = Number(activityMap[activityKey(type, item[idField])]);
  if (stored) return stored;
  return new Date(item[fallbackField] || 0).getTime() || 0;
}

function sortByActivity(items, type, idField, fallbackField = 'created_at') {
  return [...items].sort((a, b) => getActivityTime(type, b, idField, fallbackField) - getActivityTime(type, a, idField, fallbackField));
}

function touchSelectedApplication() {
  touchActivity('application', state.selectedApplicationId);
}

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_USER_KEY));
  } catch (error) {
    return null;
  }
}

function storeUser(user) {
  state.currentUser = user;
  localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
}

function clearUser() {
  state.currentUser = null;
  localStorage.removeItem(STORAGE_USER_KEY);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formToObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.error || `Ошибка запроса. Код ответа: ${response.status}`);
  }

  return data;
}

function translateToastMessage(message) {
  const text = String(message || '').trim();
  const translations = {
    'email and password are required': 'Введите email и пароль.',
    'Account with this email already exists': 'Аккаунт с таким email уже существует.',
    'Invalid email or password': 'Неверный email или пароль.',
    'account_id and name are required': 'Укажите аккаунт и название приложения.',
    'account_id is required': 'Укажите аккаунт.',
    'name is required': 'Укажите название.',
    'Application not found': 'Приложение не найдено.',
    'parameter_key, parameter_name, parameter_type and parameter_value are required': 'Заполните ключ, название, тип и значение параметра.',
    'parameter_value is required': 'Укажите значение параметра.',
    'Parameter not found': 'Параметр не найден.',
    'application_id, user_id and parameter_key are required': 'Укажите приложение, пользователя и ключ параметра.',
    'parameter_id, variant_a_value and variant_b_value are required': 'Укажите параметр и значения вариантов A и B.',
    'Parameter not found for this experiment application': 'Параметр не найден в выбранном приложении.',
    'Experiment parameter not found': 'Параметр эксперимента не найден.',
    'Experiment not found or is not in draft status': 'Эксперимент не найден или уже не является черновиком.',
    'Only one active experiment is allowed per application': 'Для одного приложения может быть активен только один эксперимент.',
    'Experiment not found': 'Эксперимент не найден.',
    'int value must be an integer number': 'Значение типа int должно быть целым числом.',
    'float value must be a number': 'Значение типа float должно быть числом.',
    'parameter_type must be one of: int, float, bool, string': 'Тип параметра должен быть одним из: int, float, bool, string.',
    'winner_variant_code must be A or B': 'Победитель должен быть вариантом A или B.',
    'Internal server error': 'Внутренняя ошибка сервера.'
  };

  if (translations[text]) return translations[text];
  if (/^HTTP\s+\d+$/i.test(text)) return `Ошибка запроса. Код ответа: ${text.replace(/\D/g, '')}.`;
  if (/duplicate key value violates unique constraint/i.test(text)) return 'Такая запись уже существует.';
  if (/violates foreign key constraint/i.test(text)) return 'Связанная запись не найдена.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(text)) return 'Не удалось подключиться к серверу.';
  return text || 'Неизвестная ошибка.';
}

function showToast(message, isError = false) {
  const toast = document.querySelector('#toast');
  toast.textContent = translateToastMessage(message);
  toast.className = `toast ${isError ? 'toast-error' : 'toast-success'}`;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 3400);
}

function icon(name) {
  const icons = {
    logo: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Z" stroke="currentColor" stroke-width="2"/><path d="M18.5 12c0-.4 0-.8-.1-1.1l2-1.5-2-3.5-2.4 1a7 7 0 0 0-1.9-1.1L13.8 3H10l-.4 2.8c-.7.3-1.3.6-1.9 1.1l-2.4-1-2 3.5 2 1.5a7.7 7.7 0 0 0 0 2.2l-2 1.5 2 3.5 2.4-1c.6.5 1.2.8 1.9 1.1l.4 2.8h3.9l.4-2.8c.7-.3 1.3-.6 1.9-1.1l2.4 1 2-3.5-2-1.5c.1-.3.1-.7.1-1.1Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    user: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M20 21a8 8 0 0 0-16 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" stroke="currentColor" stroke-width="2"/></svg>',
    plus: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    back: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12.5 5 7.5 10l5 5M8 10h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    search: '<svg width="23" height="23" viewBox="0 0 23 23" fill="none"><path d="m16.7 16.7 4 4M10.3 18.1a7.8 7.8 0 1 0 0-15.6 7.8 7.8 0 0 0 0 15.6Z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    sliders: '<svg width="25" height="25" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8 4v4M15 10v4M10 16v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    flask: '<svg width="25" height="25" viewBox="0 0 24 24" fill="none"><path d="M9 3h6M10 3v6l-5 9.2A2 2 0 0 0 6.8 21h10.4a2 2 0 0 0 1.8-2.8L14 9V3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.5 16h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    api: '<svg width="25" height="25" viewBox="0 0 24 24" fill="none"><path d="M7 7h10v10H7z" stroke="currentColor" stroke-width="2"/><path d="M4 9h3M4 15h3M17 9h3M17 15h3M9 4v3M15 4v3M9 17v3M15 17v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    trash: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3.75 5.25h10.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M7.25 3.5h3.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M5.25 7.25 5.9 14a1.25 1.25 0 0 0 1.25 1.15h3.7A1.25 1.25 0 0 0 12.1 14l.65-6.75" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 8.25v4.5M10 8.25v4.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    edit: '<svg width="19" height="19" viewBox="0 0 20 20" fill="none"><path d="M11.7 4.2 15.8 8.3M3.5 16.5l4.2-.8 8.7-8.7a2 2 0 0 0-2.8-2.8L4.8 13l-1.3 3.5Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    upload: '<svg width="44" height="44" viewBox="0 0 44 44" fill="none"><path d="M22 30V12M14 20l8-8 8 8" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 30v6h20v-6" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    eye: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" stroke-width="2"/></svg>',
    eyeOff: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="m3 3 18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M10.6 6.2A9.7 9.7 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.4 3.1M6.4 7.8C3.9 9.5 2.5 12 2.5 12s3.5 6 9.5 6c1.7 0 3.2-.5 4.4-1.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  return icons[name] || '';
}

function appIcon(index) {
  const icons = ['🛍️', '📱', '⚙️', '🎮', '🧪', '📊'];
  return icons[index % icons.length];
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('ru-RU');
}

function appVersion(app) {
  return `v${app.application_id}.0.0`;
}

function normalizeStatus(status) {
  if (status === 'active') return { text: 'Активен', cls: 'badge-active' };
  if (status === 'finished') return { text: 'Завершен', cls: 'badge-finished' };
  return { text: 'Черновик', cls: 'badge-draft' };
}

function statusBadge(status) {
  const normalized = normalizeStatus(status);
  return `<span class="badge ${normalized.cls}">${normalized.text}</span>`;
}

function typeBadge(type) {
  return `<span class="badge badge-${escapeHtml(type)}">${escapeHtml(type)}</span>`;
}

function selectedApp() {
  return state.applications.find((app) => Number(app.application_id) === Number(state.selectedApplicationId));
}

function selectedParameter() {
  return state.parameters.find((parameter) => Number(parameter.parameter_id) === Number(state.selectedParameterId));
}

function selectedExperiment() {
  return state.experiments.find((experiment) => Number(experiment.experiment_id) === Number(state.selectedExperimentId));
}

function valueToString(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function currentValue(parameter) {
  return valueToString(parameter?.parameter_value);
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(String(text));
    return;
  }

  const input = document.createElement('textarea');
  input.value = String(text);
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  input.remove();
}

function valuePlaceholder(type) {
  if (type === 'int') return 'Например: 100';
  if (type === 'float') return 'Например: 1.5';
  if (type === 'bool') return '';
  return 'Например: welcome_bonus';
}

function normalizeBoolValue(value) {
  return String(value) === 'false' ? 'false' : 'true';
}

function typedValueControl({ name, value = '', type = 'float', field = '', disabled = false, readonly = false }) {
  const safeName = name ? ` name="${escapeHtml(name)}"` : '';
  const safeField = field ? ` data-field="${escapeHtml(field)}"` : '';
  const safeType = escapeHtml(type);
  const common = `${safeName}${safeField} class="mono" data-value-type="${safeType}" ${disabled ? 'disabled' : ''} ${readonly ? 'readonly' : ''} required`;

  if (type === 'bool') {
    const selected = normalizeBoolValue(value);
    return `
      <select${safeName}${safeField} class="mono" data-value-type="bool" ${disabled ? 'disabled' : ''} required>
        <option value="true" ${selected === 'true' ? 'selected' : ''}>true</option>
        <option value="false" ${selected === 'false' ? 'selected' : ''}>false</option>
      </select>
    `;
  }

  if (type === 'int') {
    return `<input${common} inputmode="numeric" pattern="[0-9]*" placeholder="${valuePlaceholder(type)}" value="${escapeHtml(value)}">`;
  }

  if (type === 'float') {
    return `<input${common} inputmode="decimal" pattern="[0-9]*[.]?[0-9]*" placeholder="${valuePlaceholder(type)}" value="${escapeHtml(value)}">`;
  }

  return `<input${common} placeholder="${valuePlaceholder(type)}" value="${escapeHtml(value)}">`;
}

function sanitizeTypedValue(value, type) {
  const text = String(value || '');
  if (type === 'int') return text.replace(/\D/g, '');
  if (type === 'float') {
    const cleaned = text.replace(/[^0-9.]/g, '');
    const firstDot = cleaned.indexOf('.');
    if (firstDot === -1) return cleaned;
    return `${cleaned.slice(0, firstDot + 1)}${cleaned.slice(firstDot + 1).replace(/\./g, '')}`;
  }
  return text;
}

function bindTypedValueControls(scope = document) {
  scope.querySelectorAll('input[data-value-type="int"], input[data-value-type="float"]').forEach((input) => {
    input.addEventListener('input', () => {
      const nextValue = sanitizeTypedValue(input.value, input.dataset.valueType);
      if (input.value !== nextValue) input.value = nextValue;
    });
  });
}

async function loadApplications() {
  const query = new URLSearchParams({ account_id: state.currentUser.account_id }).toString();
  const applications = await requestJson(`${API_BASE}/applications?${query}`);
  state.applications = sortByActivity(applications, 'application', 'application_id');

  const selectedExists = state.applications.some((app) => Number(app.application_id) === Number(state.selectedApplicationId));
  if (!selectedExists) {
    state.selectedApplicationId = state.applications[0]?.application_id || null;
  }

  if (state.selectedApplicationId) {
    await loadApplicationData();
  }
}

async function loadApplicationData() {
  if (!state.selectedApplicationId) {
    state.parameters = [];
    state.experiments = [];
    return;
  }

  const [parameters, experiments] = await Promise.all([
    requestJson(`${API_BASE}/applications/${state.selectedApplicationId}/parameters`),
    requestJson(`${API_BASE}/applications/${state.selectedApplicationId}/experiments`)
  ]);

  state.parameters = sortByActivity(parameters, 'parameter', 'parameter_id');
  state.experiments = sortByActivity(experiments, 'experiment', 'experiment_id');
}

function renderTopbar() {
  return `
    <header class="topbar">
      <div class="brand" id="homeBrand" role="button" tabindex="0" title="На главную">
        <span class="brand-mark"><img src="${SITE_ICON_SRC}" alt="Параметрика"></span>
        <span>Параметрика</span>
      </div>
      <button class="user-pill" id="logoutButton" title="Выйти">${icon('user')}</button>
    </header>
  `;
}

function renderAuth() {
  const isRegister = state.authMode === 'register';
  root.innerHTML = `
    <main class="auth-page">
      <section class="auth-center">
        <div class="auth-heading">
          <h1>Параметрика</h1>
          <p>Управление параметрами и экспериментами веб-приложений</p>
        </div>
        <form class="auth-card form-grid" id="authForm">
          <label class="field">
            <span>Email</span>
            <input name="email" type="email" placeholder="your@email.com" value="${isRegister ? '' : 'admin@example.com'}" required>
          </label>
          <label class="field">
            <span>Пароль</span>
            <div class="password-control">
              <input name="password" type="text" class="masked-password" placeholder="••••••••" autocomplete="current-password" required>
              <button type="button" class="password-toggle" data-toggle-password title="Показать пароль">${icon('eye')}</button>
            </div>
          </label>
          ${isRegister ? `
            <label class="field">
              <span>Повторите пароль</span>
              <div class="password-control">
                <input name="password_repeat" type="text" class="masked-password" placeholder="••••••••" autocomplete="new-password" required>
                <button type="button" class="password-toggle" data-toggle-password title="Показать пароль">${icon('eye')}</button>
              </div>
            </label>
          ` : ''}
          <button class="primary-button" type="submit">${isRegister ? 'Создать аккаунт' : 'Войти'}</button>
          <p class="auth-switch" id="authSwitch">${isRegister ? 'Уже есть аккаунт? Войти' : 'Создать аккаунт'}</p>
        </form>
      </section>
    </main>
  `;

  document.querySelector('#authSwitch').addEventListener('click', () => {
    state.authMode = isRegister ? 'login' : 'register';
    renderAuth();
  });

  document.querySelector('#authForm').addEventListener('submit', handleAuthSubmit);
  bindPasswordToggles();
}

function bindPasswordToggles() {
  document.querySelectorAll('[data-toggle-password]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = button.closest('.password-control').querySelector('input');
      const shouldShow = input.classList.contains('masked-password');
      input.classList.toggle('masked-password', !shouldShow);
      button.innerHTML = icon(shouldShow ? 'eyeOff' : 'eye');
      button.title = shouldShow ? 'Скрыть пароль' : 'Показать пароль';
    });
  });
}

function applyTableFilter(inputId, rowSelector) {
  const input = document.querySelector(`#${inputId}`);
  if (!input) return;

  const query = input.value.trim().toLowerCase();
  document.querySelectorAll(rowSelector).forEach((row) => {
    const text = row.dataset.searchText || '';
    row.classList.toggle('hidden', query && !text.includes(query));
  });
}

function confirmDialog({ title = 'Подтверждение', message, confirmText = 'Подтвердить', danger = false }) {
  return new Promise((resolve) => {
    const existing = document.querySelector('#confirmDialog');
    existing?.remove();

    const modal = document.createElement('div');
    modal.id = 'confirmDialog';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <section class="modal-card confirm-card">
        <button class="modal-close" data-confirm-cancel title="Закрыть">×</button>
        <h2>${escapeHtml(title)}</h2>
        <p class="muted">${escapeHtml(message)}</p>
        <div class="form-actions modal-actions">
          <button class="${danger ? 'danger-button' : 'primary-button'}" data-confirm-ok>${escapeHtml(confirmText)}</button>
          <button class="secondary-button" data-confirm-cancel>Отмена</button>
        </div>
      </section>
    `;

    const close = (value) => {
      modal.remove();
      resolve(value);
    };

    document.body.appendChild(modal);
    modal.querySelector('[data-confirm-ok]').addEventListener('click', () => close(true));
    modal.querySelectorAll('[data-confirm-cancel]').forEach((button) => {
      button.addEventListener('click', () => close(false));
    });
    modal.addEventListener('click', (event) => {
      if (event.target === modal) close(false);
    });
  });
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formToObject(form);

  if (state.authMode === 'register' && data.password !== data.password_repeat) {
    showToast('Пароли не совпадают', true);
    return;
  }

  try {
    const endpoint = state.authMode === 'register' ? 'register' : 'login';
    const user = await requestJson(`${API_BASE}/accounts/${endpoint}`, {
      method: 'POST',
      body: JSON.stringify({
        email: data.email,
        password: data.password
      })
    });

    storeUser(user);
    state.view = 'applications';
    await loadApplications();
    render();
  } catch (error) {
    showToast(error.message, true);
  }
}

function renderApplicationsPage() {
  const applications = sortByActivity(state.applications, 'application', 'application_id');
  const rows = applications.map((app, index) => `
    <tr data-open-app="${app.application_id}" data-search-text="${escapeHtml(`${app.name} ${app.description || ''}`.toLowerCase())}">
      <td><span class="app-icon">${visualAppIcon(app, index)}</span></td>
      <td><strong>${escapeHtml(app.name)}</strong></td>
      <td class="muted">${escapeHtml(app.description || 'Без описания')}</td>
      <td class="mono">${appVersion(app).replace('v', '')}</td>
      <td class="muted">${formatDate(app.created_at)}</td>
      <td>
        <button class="icon-button" data-edit-app="${app.application_id}" title="Редактировать">${icon('edit')}</button>
        <button class="icon-button" data-delete-app="${app.application_id}" title="Удалить">${icon('trash')}</button>
      </td>
    </tr>
  `).join('');

  root.innerHTML = `
    ${renderTopbar()}
    <main class="page">
      <div class="page-head">
        <h1 class="page-title">Приложения</h1>
        <button class="primary-button" id="addApplicationButton">${icon('plus')} Добавить приложение</button>
      </div>
      <div class="search-wrap">
        ${icon('search')}
        <input class="search-input" id="appSearch" placeholder="Поиск по названию" value="${escapeHtml(state.appSearch)}">
      </div>
      ${state.applications.length ? `
        <section class="table-card">
          <table class="data-table">
            <thead>
              <tr>
                <th>Иконка</th>
                <th>Название</th>
                <th>Описание</th>
                <th>Версия</th>
                <th>Дата создания</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </section>
      ` : `
        <section class="empty-state">Приложений пока нет. Нажмите “Добавить приложение”, чтобы создать первое.</section>
      `}
    </main>
  `;

  bindCommonEvents();
  document.querySelector('#addApplicationButton').addEventListener('click', () => {
    state.editingApplicationId = null;
    state.view = 'applicationForm';
    render();
  });
  document.querySelector('#appSearch').addEventListener('input', (event) => {
    state.appSearch = event.target.value;
    applyTableFilter('appSearch', '[data-open-app]');
  });
  applyTableFilter('appSearch', '[data-open-app]');
  document.querySelectorAll('[data-open-app]').forEach((row) => {
    row.addEventListener('click', async () => {
      state.selectedApplicationId = Number(row.dataset.openApp);
      state.view = 'parameters';
      await loadApplicationData();
      render();
    });
  });
  document.querySelectorAll('[data-delete-app]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      await deleteApplication(Number(button.dataset.deleteApp));
    });
  });
  document.querySelectorAll('[data-edit-app]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      state.editingApplicationId = Number(button.dataset.editApp);
      state.view = 'applicationForm';
      renderApplicationForm();
    });
  });
}

function renderApplicationForm() {
  const app = state.editingApplicationId
    ? state.applications.find((item) => Number(item.application_id) === Number(state.editingApplicationId))
    : null;
  const isEdit = Boolean(app);

  root.innerHTML = `
    ${renderTopbar()}
    <main class="page page-narrow">
      <a class="back-link" id="backToApps">${icon('back')} Назад к приложениям</a>
      <h1 class="page-title">${isEdit ? 'Редактировать приложение' : 'Добавить приложение'}</h1>
      <form class="form-card form-grid" id="applicationForm">
        <div class="upload-row">
          <div class="upload-box" id="appIconPreview">${escapeHtml(app ? visualAppIcon(app) : '🛍️')}</div>
          <div class="upload-copy">
            <strong>Иконка приложения</strong>
            <span class="muted">В MVP иконка хранится локально в браузере, без изменения структуры БД.</span>
          </div>
        </div>
        <label class="field">
          <span>Выбрать иконку</span>
          <select name="icon_value" id="appIconSelect">
            ${['🛍️', '📱', '⚙️', '🎮', '🧪', '📊', '🚀', '💎'].map((item) => `<option value="${item}" ${item === (app ? visualAppIcon(app) : '🛍️') ? 'selected' : ''}>${item}</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span>Название приложения</span>
          <input name="name" placeholder="Например: E-commerce Platform" value="${escapeHtml(app?.name || '')}" required>
        </label>
        <label class="field">
          <span>Описание</span>
          <textarea name="description" placeholder="Краткое описание приложения">${escapeHtml(app?.description || '')}</textarea>
        </label>
        <div class="form-actions">
          <button class="primary-button" type="submit">${isEdit ? 'Сохранить изменения' : 'Создать приложение'}</button>
          <button class="secondary-button" type="button" id="cancelApplicationForm">Отмена</button>
        </div>
      </form>
    </main>
  `;

  bindCommonEvents();
  document.querySelector('#backToApps').addEventListener('click', () => {
    state.editingApplicationId = null;
    state.view = 'applications';
    render();
  });
  document.querySelector('#cancelApplicationForm').addEventListener('click', () => {
    state.editingApplicationId = null;
    state.view = 'applications';
    render();
  });
  document.querySelector('#appIconSelect').addEventListener('change', (event) => {
    document.querySelector('#appIconPreview').textContent = event.target.value;
  });
  document.querySelector('#applicationForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = formToObject(event.currentTarget);
    if (isEdit) {
      await requestJson(`${API_BASE}/applications/${app.application_id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: data.name,
          description: data.description
        })
      });
      writeAppIcon(app.application_id, data.icon_value);
      touchActivity('application', app.application_id);
      showToast('Приложение обновлено');
    } else {
      const created = await requestJson(`${API_BASE}/applications`, {
        method: 'POST',
        body: JSON.stringify({
          account_id: state.currentUser.account_id,
          name: data.name,
          description: data.description
        })
      });
      state.selectedApplicationId = created.application_id;
      writeAppIcon(created.application_id, data.icon_value);
      touchActivity('application', created.application_id);
      showToast('Приложение создано');
    }
    state.editingApplicationId = null;
    state.view = isEdit ? 'applications' : 'parameters';
    await loadApplications();
    render();
  });
}

function renderAppShell(content) {
  const app = selectedApp();
  if (!app) {
    state.view = 'applications';
    renderApplicationsPage();
    return;
  }

  root.innerHTML = `
    ${renderTopbar()}
    <main class="app-shell">
      <aside class="sidebar">
        <h2 class="sidebar-title">${escapeHtml(app.name)}</h2>
        <p class="sidebar-version">${appVersion(app)}</p>
        <button class="app-id-copy" type="button" data-copy-app-id="${app.application_id}" title="Скопировать ID приложения">
          <span>ID приложения</span>
          <strong>${app.application_id}</strong>
        </button>
        <nav class="side-nav">
          <div class="side-link ${state.view === 'parameters' ? 'active' : ''}" data-side-view="parameters">${icon('sliders')} Параметры</div>
          <div class="side-link ${state.view === 'experiments' ? 'active' : ''}" data-side-view="experiments">${icon('flask')} Эксперименты</div>
          <div class="side-link ${state.view === 'clientTest' ? 'active' : ''}" data-side-view="clientTest">${icon('api')} Проверка API</div>
        </nav>
        <div class="form-actions">
          <button class="secondary-button" id="backToApplications">К приложениям</button>
        </div>
      </aside>
      <section class="content">${content}</section>
    </main>
  `;

  bindCommonEvents();
  document.querySelector('[data-copy-app-id]')?.addEventListener('click', async (event) => {
    const applicationId = event.currentTarget.dataset.copyAppId;
    await copyTextToClipboard(applicationId);
    showToast(`ID приложения ${applicationId} скопирован`);
  });
  document.querySelectorAll('[data-side-view]').forEach((link) => {
    link.addEventListener('click', () => {
      state.view = link.dataset.sideView;
      state.selectedParameterId = null;
      state.selectedExperimentId = null;
      render();
    });
  });
  document.querySelector('#backToApplications').addEventListener('click', () => {
    state.view = 'applications';
    render();
  });
}

function renderParametersPage() {
  const q = state.parameterSearch.trim().toLowerCase();

  const parameters = sortByActivity(state.parameters, 'parameter', 'parameter_id');
  const rows = parameters.map((parameter) => `
    <tr data-open-parameter="${parameter.parameter_id}" data-search-text="${escapeHtml(`${parameter.parameter_name} ${parameter.parameter_key}`.toLowerCase())}">
      <td class="mono"><strong>${escapeHtml(parameter.parameter_key)}</strong><div class="muted">${escapeHtml(parameter.parameter_name)}</div></td>
      <td>${typeBadge(parameter.parameter_type)}</td>
      <td class="mono">${escapeHtml(currentValue(parameter))}</td>
      <td>
        <button class="icon-button" data-delete-parameter="${parameter.parameter_id}" title="Удалить">${icon('trash')}</button>
      </td>
    </tr>
  `).join('');

  const content = `
    <div class="page-head">
      <h1 class="page-title">Параметры</h1>
      <button class="primary-button" id="addParameterButton">${icon('plus')} Добавить параметр</button>
    </div>
    <div class="search-wrap">
      ${icon('search')}
      <input class="search-input" id="parameterSearch" placeholder="Поиск по названию или ключу" value="${escapeHtml(state.parameterSearch)}">
    </div>
    ${state.parameters.length ? `
      <section class="table-card">
        <table class="data-table">
          <thead>
            <tr>
              <th>Название</th>
              <th>Тип</th>
              <th>Текущее значение</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
    ` : '<section class="empty-state">Параметров пока нет.</section>'}
  `;

  renderAppShell(content);
  document.querySelector('#addParameterButton').addEventListener('click', () => {
    state.selectedParameterId = null;
    state.view = 'parameterForm';
    renderParameterForm();
  });
  document.querySelector('#parameterSearch').addEventListener('input', (event) => {
    state.parameterSearch = event.target.value;
    applyTableFilter('parameterSearch', '[data-open-parameter]');
  });
  applyTableFilter('parameterSearch', '[data-open-parameter]');
  document.querySelectorAll('[data-open-parameter]').forEach((row) => {
    row.addEventListener('click', () => {
      state.selectedParameterId = Number(row.dataset.openParameter);
      state.view = 'parameterForm';
      renderParameterForm();
    });
  });
  document.querySelectorAll('[data-delete-parameter]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      await deleteParameter(Number(button.dataset.deleteParameter));
    });
  });
}

function renderParameterForm() {
  const parameter = selectedParameter();
  const isEdit = Boolean(parameter);
  const title = isEdit ? parameter.parameter_key : 'Добавить параметр';
  const parameterType = parameter?.parameter_type || 'float';
  const content = `
    <a class="back-link" id="backToParameters">${icon('back')} Назад к параметрам</a>
    <h1 class="page-title">${escapeHtml(title)}</h1>
    <form class="form-card form-grid" id="parameterForm">
      <label class="field">
        <span>Ключ параметра для Unity</span>
        <input name="parameter_key" class="mono" value="${escapeHtml(parameter?.parameter_key || '')}" placeholder="reward_multiplier" ${isEdit ? 'disabled' : 'required'}>
      </label>
      <label class="field">
        <span>Название</span>
        <input name="parameter_name" value="${escapeHtml(parameter?.parameter_name || '')}" placeholder="Множитель награды" required>
      </label>
      <label class="field">
        <span>Тип</span>
        <select name="parameter_type" id="parameterTypeSelect" ${isEdit ? 'disabled' : ''} required>
          ${['float', 'int', 'string', 'bool'].map((type) => `<option value="${type}" ${parameter?.parameter_type === type ? 'selected' : ''}>${type}</option>`).join('')}
        </select>
      </label>
      <label class="field">
        <span>Текущее значение</span>
        <div id="parameterValueControl">${typedValueControl({
          name: 'parameter_value',
          type: parameterType,
          value: currentValue(parameter)
        })}</div>
      </label>
      <label class="field">
        <span>Описание</span>
        <textarea name="description" placeholder="Описание параметра">${escapeHtml(parameter?.description || '')}</textarea>
      </label>
      <div class="form-actions">
        <button class="primary-button" type="submit">${isEdit ? 'Сохранить изменения' : 'Создать параметр'}</button>
        <button class="secondary-button" type="button" id="cancelParameterForm">Отмена</button>
        ${isEdit ? '<button class="danger-button" type="button" id="deleteCurrentParameter">Удалить</button>' : ''}
      </div>
    </form>
  `;

  renderAppShell(content);
  document.querySelector('#backToParameters').addEventListener('click', () => {
    state.view = 'parameters';
    renderParametersPage();
  });
  document.querySelector('#cancelParameterForm').addEventListener('click', () => {
    state.view = 'parameters';
    renderParametersPage();
  });
  if (isEdit) {
    document.querySelector('#deleteCurrentParameter').addEventListener('click', () => deleteParameter(parameter.parameter_id));
  }
  bindTypedValueControls(document.querySelector('#parameterForm'));
  document.querySelector('#parameterTypeSelect')?.addEventListener('change', (event) => {
    const type = event.target.value;
    const value = type === 'bool' ? 'true' : '';
    document.querySelector('#parameterValueControl').innerHTML = typedValueControl({
      name: 'parameter_value',
      type,
      value
    });
    bindTypedValueControls(document.querySelector('#parameterValueControl'));
  });
  document.querySelector('#parameterForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = formToObject(event.currentTarget);

    if (isEdit) {
      await requestJson(`${API_BASE}/parameters/${parameter.parameter_id}`, {
        method: 'PUT',
        body: JSON.stringify({
          parameter_name: data.parameter_name,
          parameter_value: data.parameter_value,
          description: data.description
        })
      });
      touchActivity('parameter', parameter.parameter_id);
      touchSelectedApplication();
      showToast('Параметр обновлен');
    } else {
      const created = await requestJson(`${API_BASE}/applications/${state.selectedApplicationId}/parameters`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
      touchActivity('parameter', created.parameter_id);
      touchSelectedApplication();
      showToast('Параметр создан');
    }

    await loadApplicationData();
    state.view = 'parameters';
    renderParametersPage();
  });
}

function renderExperimentsPage() {
  const experiments = sortByActivity(state.experiments, 'experiment', 'experiment_id');
  const rows = experiments.map((experiment) => `
    <tr data-open-experiment="${experiment.experiment_id}" data-search-text="${escapeHtml(`${experiment.name} ${experiment.description || ''}`.toLowerCase())}">
      <td><strong>${escapeHtml(experiment.name)}</strong><div class="muted">${escapeHtml(experiment.description || '')}</div></td>
      <td class="muted">${formatDate(experiment.started_at)}</td>
      <td>${statusBadge(experiment.status)}</td>
      <td>${(experiment.tested_parameters || []).length}</td>
      <td>
        <button class="icon-button" data-delete-experiment="${experiment.experiment_id}" title="Удалить">${icon('trash')}</button>
      </td>
    </tr>
  `).join('');

  const content = `
    <div class="page-head">
      <h1 class="page-title">Эксперименты</h1>
      <button class="primary-button" id="addExperimentButton">${icon('plus')} Добавить эксперимент</button>
    </div>
    <div class="search-wrap">
      ${icon('search')}
      <input class="search-input" id="experimentSearch" placeholder="Поиск по названию" value="${escapeHtml(state.experimentSearch)}">
    </div>
    ${state.experiments.length ? `
      <section class="table-card">
        <table class="data-table">
          <thead>
            <tr>
              <th>Название</th>
              <th>Начало эксперимента</th>
              <th>Статус</th>
              <th>Параметров</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
    ` : '<section class="empty-state">Экспериментов пока нет.</section>'}
  `;

  renderAppShell(content);
  document.querySelector('#addExperimentButton').addEventListener('click', () => {
    state.selectedExperimentId = null;
    state.view = 'experimentForm';
    renderExperimentEditor();
  });
  document.querySelector('#experimentSearch').addEventListener('input', (event) => {
    state.experimentSearch = event.target.value;
    applyTableFilter('experimentSearch', '[data-open-experiment]');
  });
  applyTableFilter('experimentSearch', '[data-open-experiment]');
  document.querySelectorAll('[data-open-experiment]').forEach((row) => {
    row.addEventListener('click', () => {
      state.selectedExperimentId = Number(row.dataset.openExperiment);
      state.view = 'experimentDetail';
      renderExperimentEditor();
    });
  });
  document.querySelectorAll('[data-delete-experiment]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      await deleteExperiment(Number(button.dataset.deleteExperiment));
    });
  });
}

function experimentRowsSource(experiment) {
  if (!experiment || !(experiment.tested_parameters || []).length) {
    return [{ parameter_id: state.parameters[0]?.parameter_id || '', variant_a_value: currentValue(state.parameters[0]), variant_b_value: '' }];
  }

  return experiment.tested_parameters.map((parameter) => ({
    parameter_id: parameter.parameter_id,
    variant_a_value: valueToString(parameter.variant_a_value),
    variant_b_value: valueToString(parameter.variant_b_value)
  }));
}

function parameterOptions(selectedId) {
  return state.parameters.map((parameter) => `
    <option value="${parameter.parameter_id}" ${Number(parameter.parameter_id) === Number(selectedId) ? 'selected' : ''}>
      ${escapeHtml(parameter.parameter_key)}
    </option>
  `).join('');
}

function experimentValueControl(field, parameter, value, isFinished) {
  return typedValueControl({
    field,
    type: parameter?.parameter_type || 'string',
    value,
    readonly: isFinished,
    disabled: isFinished && parameter?.parameter_type === 'bool'
  });
}

function variantCellClass(experiment, variantCode) {
  if (!experiment || experiment.status !== 'finished' || !experiment.winner_variant_code) {
    return '';
  }
  return experiment.winner_variant_code === variantCode ? 'winner-cell' : 'loser-cell';
}

function configRowHtml(row = {}, experiment = null) {
  const parameter = state.parameters.find((item) => Number(item.parameter_id) === Number(row.parameter_id)) || state.parameters[0];
  const parameterId = row.parameter_id || parameter?.parameter_id || '';
  const variantA = row.variant_a_value !== undefined ? row.variant_a_value : currentValue(parameter);
  const isFinished = experiment?.status === 'finished';

  return `
    <tr class="config-row ${isFinished ? 'finished-row' : ''}">
      <td>
        <select data-field="parameter_id" ${state.parameters.length && !isFinished ? '' : 'disabled'}>
          ${state.parameters.length ? parameterOptions(parameterId) : '<option value="">Нет параметров</option>'}
        </select>
      </td>
      <td data-field="type">${parameter ? typeBadge(parameter.parameter_type) : ''}</td>
      <td class="${variantCellClass(experiment, 'A')}">${experimentValueControl('variant_a_value', parameter, variantA, isFinished)}</td>
      <td class="${variantCellClass(experiment, 'B')}">${experimentValueControl('variant_b_value', parameter, row.variant_b_value || '', isFinished)}</td>
      <td>${isFinished ? '' : `<button type="button" class="icon-button" data-remove-config-row title="Удалить">${icon('trash')}</button>`}</td>
    </tr>
  `;
}

function renderExperimentEditor() {
  const experiment = selectedExperiment();
  const isCreate = !experiment;
  const rows = experimentRowsSource(experiment);
  const status = experiment?.status || 'draft';
  const winnerNotice = experiment?.status === 'finished' && experiment.winner_variant_code
    ? `<p class="winner-notice">Победил вариант ${experiment.winner_variant_code}. Победившие значения перенесены в рабочие параметры.</p>`
    : '';

  const content = `
    <a class="back-link" id="backToExperiments">${icon('back')} Назад к экспериментам</a>
    ${isCreate ? `
      <h1 class="page-title">Добавить эксперимент</h1>
      <form class="form-card form-grid" id="experimentMetaForm">
        <label class="field">
          <span>Название эксперимента</span>
          <input name="name" placeholder="Тест новой главной страницы" required>
        </label>
        <label class="field">
          <span>Описание</span>
          <textarea name="description" placeholder="Что проверяем в эксперименте"></textarea>
        </label>
      </form>
    ` : `
      <div class="detail-title">
        <h1>${escapeHtml(experiment.name)}</h1>
        ${statusBadge(experiment.status)}
      </div>
      <p class="muted">Начало: ${formatDate(experiment.started_at)}</p>
      ${winnerNotice}
    `}
    ${!isCreate ? `
      <section class="config-card" id="experimentConfigCard">
        <p class="traffic-title">Распределение трафика</p>
        <div class="traffic-grid">
          <div class="traffic-box"><strong>50%</strong><span>Вариант A</span></div>
          <span class="muted">/</span>
          <div class="traffic-box"><strong>50%</strong><span>Вариант B</span></div>
        </div>
        <p class="muted">Фиксированное распределение 50/50 по hash от user_id.</p>
        <div class="parameter-config">
          <p class="traffic-title">Конфигурация параметров</p>
          <table class="config-table">
            <thead>
              <tr>
                <th>Параметр</th>
                <th>Тип</th>
                <th>Значение A</th>
                <th>Значение B</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="configRows">${rows.map((row) => configRowHtml(row, experiment)).join('')}</tbody>
          </table>
          ${status !== 'finished' ? `<span class="add-row-link" id="addConfigRow">${icon('plus')} Добавить параметр</span>` : ''}
        </div>
      </section>
    ` : `
      <section class="config-card" id="createExperimentConfig">
        <p class="traffic-title">Конфигурация параметров</p>
        <table class="config-table">
          <thead>
            <tr>
              <th>Параметр</th>
              <th>Тип</th>
              <th>Значение A</th>
              <th>Значение B</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="configRows">${rows.map((row) => configRowHtml(row, experiment)).join('')}</tbody>
        </table>
        <span class="add-row-link" id="addConfigRow">${icon('plus')} Добавить параметр</span>
      </section>
    `}
    <div class="form-actions">
      ${status !== 'finished' ? `<button class="primary-button" id="saveExperimentButton">${isCreate ? 'Создать эксперимент' : 'Сохранить конфигурацию'}</button>` : ''}
      ${!isCreate && status === 'draft' ? '<button class="secondary-button" id="startExperimentButton">Запустить эксперимент</button>' : ''}
      ${!isCreate && status === 'active' ? `
        <button class="primary-button" id="finishExperimentButton">Завершить эксперимент</button>
      ` : ''}
      ${!isCreate ? '<button class="danger-button" id="deleteCurrentExperiment">Удалить</button>' : ''}
    </div>
  `;

  renderAppShell(content);
  bindExperimentConfigEvents();
  document.querySelector('#backToExperiments').addEventListener('click', () => {
    state.view = 'experiments';
    renderExperimentsPage();
  });
  document.querySelector('#saveExperimentButton')?.addEventListener('click', () => saveExperimentEditor(isCreate));
  if (!isCreate && status === 'draft') {
    document.querySelector('#startExperimentButton').addEventListener('click', () => startExperiment(experiment.experiment_id));
  }
  if (!isCreate && status === 'active') {
    document.querySelector('#finishExperimentButton').addEventListener('click', () => openFinishExperimentModal(experiment.experiment_id));
  }
  if (!isCreate) {
    document.querySelector('#deleteCurrentExperiment').addEventListener('click', () => deleteExperiment(experiment.experiment_id));
  }
}

function bindExperimentConfigEvents() {
  const addButton = document.querySelector('#addConfigRow');
  const body = document.querySelector('#configRows');
  if (!addButton || !body) return;
  bindTypedValueControls(body);

  addButton.addEventListener('click', () => {
    body.insertAdjacentHTML('beforeend', configRowHtml());
    bindExperimentConfigEvents();
  }, { once: true });

  body.querySelectorAll('[data-field="parameter_id"]').forEach((select) => {
    select.onchange = () => {
      const row = select.closest('.config-row');
      const parameter = state.parameters.find((item) => Number(item.parameter_id) === Number(select.value));
      row.querySelector('[data-field="type"]').innerHTML = parameter ? typeBadge(parameter.parameter_type) : '';
      row.children[2].innerHTML = experimentValueControl('variant_a_value', parameter, currentValue(parameter), false);
      row.children[3].innerHTML = experimentValueControl('variant_b_value', parameter, parameter?.parameter_type === 'bool' ? 'false' : '', false);
      bindTypedValueControls(row);
    };
  });

  body.querySelectorAll('[data-remove-config-row]').forEach((button) => {
    button.onclick = () => {
      const rows = body.querySelectorAll('.config-row');
      if (rows.length === 1) {
        showToast('В эксперименте должна остаться хотя бы одна строка', true);
        return;
      }
      button.closest('.config-row').remove();
    };
  });
}

function collectConfigRows() {
  return [...document.querySelectorAll('.config-row')].map((row) => ({
    parameter_id: row.querySelector('[data-field="parameter_id"]').value,
    variant_a_value: row.querySelector('[data-field="variant_a_value"]').value,
    variant_b_value: row.querySelector('[data-field="variant_b_value"]').value
  }));
}

function validateConfigRows(rows) {
  if (!rows.length) return 'Добавьте хотя бы один параметр';
  if (rows.some((row) => !row.parameter_id || row.variant_a_value === '' || row.variant_b_value === '')) {
    return 'Заполните параметр, значение A и значение B во всех строках';
  }
  const unique = new Set(rows.map((row) => row.parameter_id));
  if (unique.size !== rows.length) return 'Один параметр нельзя добавить дважды';
  return null;
}

async function saveExperimentEditor(isCreate) {
  const rows = collectConfigRows();
  const validationError = validateConfigRows(rows);
  if (validationError) {
    showToast(validationError, true);
    return;
  }

  let experiment = selectedExperiment();

  if (isCreate) {
    const metaForm = document.querySelector('#experimentMetaForm');
    const meta = formToObject(metaForm);
    experiment = await requestJson(`${API_BASE}/applications/${state.selectedApplicationId}/experiments`, {
      method: 'POST',
      body: JSON.stringify(meta)
    });
  } else {
    const existingIds = new Set((experiment.tested_parameters || []).map((parameter) => String(parameter.parameter_id)));
    const nextIds = new Set(rows.map((row) => String(row.parameter_id)));
    for (const parameterId of existingIds) {
      if (!nextIds.has(parameterId)) {
        await requestJson(`${API_BASE}/experiments/${experiment.experiment_id}/parameters/${parameterId}`, { method: 'DELETE' });
      }
    }
  }

  for (const row of rows) {
    await requestJson(`${API_BASE}/experiments/${experiment.experiment_id}/parameters`, {
      method: 'POST',
      body: JSON.stringify(row)
    });
  }

  touchActivity('experiment', experiment.experiment_id);
  touchSelectedApplication();
  state.selectedExperimentId = experiment.experiment_id;
  state.view = 'experimentDetail';
  await loadApplicationData();
  showToast(isCreate ? 'Эксперимент создан' : 'Конфигурация сохранена');
  renderExperimentEditor();
}

function renderClientTestPage() {
  const app = selectedApp();
  const content = `
    <div class="page-head">
      <h1 class="page-title">Проверка Unity API</h1>
    </div>
    <section class="client-test">
      <form class="form-card form-grid" id="clientTestForm">
        <label class="field">
          <span>Приложение</span>
          <select name="application_id">
            ${state.applications.map((item) => `<option value="${item.application_id}" ${Number(item.application_id) === Number(app.application_id) ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span>User ID</span>
          <input name="user_id" value="test_user_1" required>
        </label>
        <label class="field">
          <span>Parameter Key из Unity</span>
          <input name="parameter_key" class="mono" value="reward_multiplier" placeholder="reward_multiplier" required>
        </label>
        <button class="primary-button" type="submit">Получить JSON</button>
        <p class="muted">Ключ вводится вручную, чтобы проверить сценарий с резервным значением, когда Unity запрашивает несуществующий параметр.</p>
      </form>
      <pre id="clientTestResult">{}</pre>
    </section>
  `;

  renderAppShell(content);
  document.querySelector('#clientTestForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = formToObject(event.currentTarget);
    const query = new URLSearchParams(data).toString();
    const result = await requestJson(`${API_BASE}/parameter?${query}`);
    document.querySelector('#clientTestResult').textContent = JSON.stringify(result, null, 2);
    if (!result.found) {
      showToast('Параметр не найден: Unity должен использовать резервное значение.', true);
    }
  });
}

function openFinishExperimentModal(experimentId) {
  const existing = document.querySelector('#finishExperimentModal');
  existing?.remove();

  const modal = document.createElement('div');
  modal.id = 'finishExperimentModal';
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <section class="modal-card">
      <button class="modal-close" id="closeFinishModal" title="Закрыть">×</button>
      <h2>Какой вариант оставить?</h2>
      <p class="muted">После завершения эксперимента значения выбранного варианта будут перенесены в рабочие параметры.</p>
      <div class="winner-options">
        <button type="button" class="winner-option selected" data-winner-option="A">
          <strong>Вариант A</strong>
          <span>Оставить значения A</span>
        </button>
        <button type="button" class="winner-option" data-winner-option="B">
          <strong>Вариант B</strong>
          <span>Оставить значения B</span>
        </button>
      </div>
      <div class="form-actions modal-actions">
        <button class="primary-button" id="confirmFinishExperiment">Завершить эксперимент</button>
      </div>
    </section>
  `;

  document.body.appendChild(modal);
  let selectedWinner = 'A';

  modal.querySelectorAll('[data-winner-option]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedWinner = button.dataset.winnerOption;
      modal.querySelectorAll('[data-winner-option]').forEach((item) => item.classList.remove('selected'));
      button.classList.add('selected');
    });
  });

  const close = () => modal.remove();
  modal.querySelector('#closeFinishModal').addEventListener('click', close);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) close();
  });
  modal.querySelector('#confirmFinishExperiment').addEventListener('click', async () => {
    await finishExperiment(experimentId, selectedWinner);
    close();
  });
}

function bindCommonEvents() {
  document.querySelector('#logoutButton')?.addEventListener('click', () => {
    clearUser();
    state.view = 'applications';
    renderAuth();
  });
  document.querySelector('#homeBrand')?.addEventListener('click', () => {
    state.view = 'applications';
    state.selectedParameterId = null;
    state.selectedExperimentId = null;
    renderApplicationsPage();
  });
  document.querySelector('#homeBrand')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      state.view = 'applications';
      renderApplicationsPage();
    }
  });
}

async function deleteApplication(applicationId) {
  const app = state.applications.find((item) => Number(item.application_id) === Number(applicationId));
  const confirmed = await confirmDialog({
    title: 'Удалить приложение?',
    message: `Приложение "${app?.name || applicationId}" и связанные параметры/эксперименты будут удалены.`,
    confirmText: 'Удалить',
    danger: true
  });
  if (!confirmed) return;

  await requestJson(`${API_BASE}/applications/${applicationId}`, { method: 'DELETE' });
  removeActivity('application', applicationId);
  await loadApplications();
  showToast('Приложение удалено');
  render();
}

async function deleteParameter(parameterId) {
  const parameter = state.parameters.find((item) => Number(item.parameter_id) === Number(parameterId));
  const confirmed = await confirmDialog({
    title: 'Удалить параметр?',
    message: `Параметр "${parameter?.parameter_key || parameterId}" будет удалён из приложения и экспериментов.`,
    confirmText: 'Удалить',
    danger: true
  });
  if (!confirmed) return;

  await requestJson(`${API_BASE}/parameters/${parameterId}`, { method: 'DELETE' });
  removeActivity('parameter', parameterId);
  touchSelectedApplication();
  await loadApplicationData();
  state.view = 'parameters';
  showToast('Параметр удален');
  renderParametersPage();
}

async function deleteExperiment(experimentId) {
  const experiment = state.experiments.find((item) => Number(item.experiment_id) === Number(experimentId));
  const confirmed = await confirmDialog({
    title: 'Удалить эксперимент?',
    message: `Эксперимент "${experiment?.name || experimentId}" и назначения пользователей будут удалены.`,
    confirmText: 'Удалить',
    danger: true
  });
  if (!confirmed) return;

  await requestJson(`${API_BASE}/experiments/${experimentId}`, { method: 'DELETE' });
  removeActivity('experiment', experimentId);
  touchSelectedApplication();
  await loadApplicationData();
  state.view = 'experiments';
  showToast('Эксперимент удален');
  renderExperimentsPage();
}

async function startExperiment(experimentId) {
  await requestJson(`${API_BASE}/experiments/${experimentId}/start`, { method: 'POST' });
  touchActivity('experiment', experimentId);
  touchSelectedApplication();
  await loadApplicationData();
  showToast('Эксперимент запущен');
  renderExperimentsPage();
}

async function finishExperiment(experimentId, winner) {
  await requestJson(`${API_BASE}/experiments/${experimentId}/finish`, {
    method: 'POST',
    body: JSON.stringify({ winner_variant_code: winner })
  });
  touchActivity('experiment', experimentId);
  touchSelectedApplication();
  await loadApplicationData();
  showToast('Эксперимент завершен, победившие значения применены');
  state.selectedExperimentId = experimentId;
  state.view = 'experimentDetail';
  renderExperimentEditor();
}

function render() {
  if (!state.currentUser) {
    renderAuth();
    return;
  }

  if (state.view === 'applications') return renderApplicationsPage();
  if (state.view === 'applicationForm') return renderApplicationForm();
  if (state.view === 'parameters') return renderParametersPage();
  if (state.view === 'parameterForm') return renderParameterForm();
  if (state.view === 'experiments') return renderExperimentsPage();
  if (state.view === 'experimentForm' || state.view === 'experimentDetail') return renderExperimentEditor();
  if (state.view === 'clientTest') return renderClientTestPage();

  renderApplicationsPage();
}

async function init() {
  try {
    await requestJson('/health');
    if (state.currentUser) {
      await loadApplications();
    }
    render();
  } catch (error) {
    showToast(error.message, true);
    render();
  }
}

window.addEventListener('unhandledrejection', (event) => {
  showToast(event.reason?.message || 'Ошибка запроса', true);
});

init();
