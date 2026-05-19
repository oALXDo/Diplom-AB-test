# Информационная система A/B-тестирования параметров Unity WebGL

Локальный MVP для диплома: администратор управляет приложениями, рабочими параметрами и A/B-экспериментами, а Unity-клиент получает значения только через backend API. Прямого подключения Unity к PostgreSQL нет.

## 1. Создание БД в pgAdmin

1. Откройте pgAdmin.
2. Подключитесь к локальному серверу PostgreSQL.
3. Нажмите правой кнопкой по `Databases` и выберите `Create` -> `Database`.
4. Укажите имя базы, например `unity_ab_testing`.
5. Сохраните базу.

## 2. Выполнение `database/schema.sql`

1. В pgAdmin выберите базу `unity_ab_testing`.
2. Откройте `Query Tool`.
3. Откройте файл `database/schema.sql`.
4. Выполните скрипт кнопкой `Execute`.

Скрипт создаёт 7 таблиц: `accounts`, `applications`, `application_accounts`, `parameters`, `experiments`, `experiment_parameters`, `user_variant_assignments`.

## 3. Выполнение `database/seed.sql`

В том же `Query Tool` откройте и выполните `database/seed.sql`. Он создаст тестовый аккаунт, демо-приложение, связь аккаунта с приложением, несколько параметров и тестовый эксперимент.

## 4. Настройка `.env`

Скопируйте `.env.example` в файл `.env` в корне проекта и заполните пароль PostgreSQL:

```env
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=unity_ab_testing
DB_USER=postgres
DB_PASSWORD=your_password_here
```

Файл `.env` с реальным паролем не добавляйте в публичный репозиторий.

## 5. Установка зависимостей backend

```bash
cd backend
npm install
```

## 6. Запуск сервера

```bash
npm start
```

После запуска backend и админ-панель будут доступны по адресу:

```text
http://localhost:3000
```

## 7. Работа с админкой

Откройте `http://localhost:3000` в браузере. На одной странице можно:

- войти в MVP или создать тестовый аккаунт;
- создать приложение;
- выбрать приложение из списка;
- увидеть активный эксперимент выбранного приложения;
- создать и изменить рабочие параметры;
- создать эксперимент;
- добавить один или несколько параметров в эксперимент и указать значения A/B;
- посмотреть, какие параметры уже тестируются в каждом эксперименте;
- запустить эксперимент;
- завершить эксперимент с выбором победителя A или B;
- удалить приложение, параметр или эксперимент;
- проверить JSON-ответ Unity API.

Для тестового seed-аккаунта используйте:

```text
email: admin@example.com
password: admin
```

В админке выбор приложения и эксперимента сделан через выпадающие списки. Параметры при настройке эксперимента фильтруются по выбранному приложению, чтобы случайно не добавить параметр из другого приложения. В блоке проверки `/api/parameter` ключ параметра вводится вручную, как это делает Unity-клиент.

Доступ пользователей к приложениям хранится в таблице `application_accounts`. Благодаря этому одно приложение может быть доступно нескольким аккаунтам, а список приложений в админке показывается только для текущего пользователя.

Для одного приложения одновременно может быть только один active-эксперимент. Это контролируется частичным уникальным индексом PostgreSQL.

## 8. Проверка endpoint `/api/parameter`

Пример запроса:

```text
http://localhost:3000/api/parameter?application_id=1&user_id=test_user_1&parameter_key=item_1_price
```

Если активный эксперимент есть и параметр участвует в нём, ответ будет содержать `source: "ab_test"`, `experiment_id` и `variant_code`.

Если активного эксперимента нет или параметр не участвует в нём, backend вернёт рабочее значение с `source: "working_value"`.

## 9. Использование Unity-скрипта

Файл `unity_client/ParameterService.cs` добавьте на GameObject в Unity. В инспекторе укажите:

- `Api Base Url`: `http://localhost:3000`;
- `Application Id`: ID приложения из админки;
- `User Id`: стабильный идентификатор пользователя.

Пример использования:

```csharp
public class DemoUsage : MonoBehaviour
{
    [SerializeField] private ParameterService parameterService;

    private void Start()
    {
        parameterService.GetInt("item_1_price", 20, value =>
        {
            Debug.Log("Цена предмета: " + value);
            Debug.Log("Experiment: " + parameterService.LastExperimentId);
            Debug.Log("Variant: " + parameterService.LastVariantCode);
        });
    }
}
```

Если backend недоступен, параметр не найден или сервер вернул `use_fallback: true`, Unity использует локальное fallback-значение.

## Основные команды запуска

```bash
cd backend
npm install
npm start
```

Затем откройте `http://localhost:3000`.
