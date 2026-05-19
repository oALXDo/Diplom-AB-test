using System;
using System.Collections;
using System.Globalization;
using System.Text.RegularExpressions;
using UnityEngine;
using UnityEngine.Networking;

// Клиент Unity обращается только к backend API.
// Прямого подключения к PostgreSQL здесь нет.
public class ParameterService : MonoBehaviour
{
    [Header("Сервер")]
    [SerializeField] private string apiBaseUrl = "https://your-domain.example";
    [SerializeField] private bool logWarnings = true;

    private long applicationId;
    private string userId;

    public bool IsInitialized { get; private set; }
    public long? LastExperimentId { get; private set; }
    public string LastVariantCode { get; private set; }
    public string LastSource { get; private set; }

    public void Initialize(string serverBaseUrl, long appId, string stableUserId)
    {
        if (string.IsNullOrWhiteSpace(serverBaseUrl))
        {
            throw new ArgumentException("Адрес сервера не указан.", nameof(serverBaseUrl));
        }

        if (appId <= 0)
        {
            throw new ArgumentException("ID приложения должен быть больше нуля.", nameof(appId));
        }

        if (string.IsNullOrWhiteSpace(stableUserId))
        {
            throw new ArgumentException("User ID не указан.", nameof(stableUserId));
        }

        apiBaseUrl = NormalizeBaseUrl(serverBaseUrl);
        applicationId = appId;
        userId = stableUserId.Trim();
        IsInitialized = true;
        ClearExperimentMeta();
    }

    public void Initialize(long appId, string stableUserId)
    {
        Initialize(apiBaseUrl, appId, stableUserId);
    }

    public void ResetClient()
    {
        applicationId = 0;
        userId = null;
        IsInitialized = false;
        ClearExperimentMeta();
    }

    public void GetFloat(string parameterKey, float defaultValue, Action<float> onComplete)
    {
        StartCoroutine(GetParameter(parameterKey, defaultValue, onComplete));
    }

    public void GetInt(string parameterKey, int defaultValue, Action<int> onComplete)
    {
        StartCoroutine(GetParameter(parameterKey, defaultValue, onComplete));
    }

    public void GetBool(string parameterKey, bool defaultValue, Action<bool> onComplete)
    {
        StartCoroutine(GetParameter(parameterKey, defaultValue, onComplete));
    }

    public void GetString(string parameterKey, string defaultValue, Action<string> onComplete)
    {
        StartCoroutine(GetParameter(parameterKey, defaultValue, onComplete));
    }

    private IEnumerator GetParameter<T>(string parameterKey, T defaultValue, Action<T> onComplete)
    {
        if (!CanRequestParameter(parameterKey))
        {
            onComplete?.Invoke(defaultValue);
            yield break;
        }

        string url =
            $"{apiBaseUrl}/api/parameter" +
            $"?application_id={applicationId}" +
            $"&user_id={UnityWebRequest.EscapeURL(userId)}" +
            $"&parameter_key={UnityWebRequest.EscapeURL(parameterKey)}";

        using (UnityWebRequest request = UnityWebRequest.Get(url))
        {
            UnityWebRequestAsyncOperation operation;

            try
            {
                operation = request.SendWebRequest();
            }
            catch (InvalidOperationException exception)
            {
                Warn($"Запрос параметра не отправлен. Проверьте настройки HTTP/HTTPS в Unity. Используется значение по умолчанию. Ошибка: {exception.Message}");
                ClearExperimentMeta();
                onComplete?.Invoke(defaultValue);
                yield break;
            }

            yield return operation;

            if (RequestFailed(request))
            {
                Warn($"Запрос параметра завершился ошибкой. Используется значение по умолчанию. Ошибка: {request.error}");
                ClearExperimentMeta();
                onComplete?.Invoke(defaultValue);
                yield break;
            }

            string json = request.downloadHandler.text;
            ParameterResponse response = JsonUtility.FromJson<ParameterResponse>(json);

            if (response == null || !response.found || response.use_fallback)
            {
                if (response != null && (!response.found || response.source_reason == "unknown_parameter_key"))
                {
                    Warn($"Неизвестный ключ параметра \"{parameterKey}\". Параметр не был найден, установлено значение по умолчанию.");
                }

                ClearExperimentMeta();
                onComplete?.Invoke(defaultValue);
                yield break;
            }

            RememberExperimentMeta(response);
            LogSystemParameterReason(response);

            try
            {
                string rawValue = ExtractJsonValue(json, "parameter_value");
                onComplete?.Invoke(rawValue == null ? defaultValue : ConvertValue(rawValue, defaultValue));
            }
            catch (Exception exception)
            {
                Warn($"Не получилось преобразовать значение параметра. Используется значение по умолчанию. Ошибка: {exception.Message}");
                onComplete?.Invoke(defaultValue);
            }
        }
    }

    private bool CanRequestParameter(string parameterKey)
    {
        if (!IsInitialized)
        {
            Warn("ParameterService не инициализирован. Сначала нужно вызвать Initialize(apiBaseUrl, applicationId, userId).");
            ClearExperimentMeta();
            return false;
        }

        if (string.IsNullOrWhiteSpace(parameterKey))
        {
            Warn("Ключ параметра пустой. Используется значение по умолчанию.");
            ClearExperimentMeta();
            return false;
        }

        return true;
    }

    private void RememberExperimentMeta(ParameterResponse response)
    {
        LastExperimentId = response.experiment_id > 0 ? response.experiment_id : (long?)null;
        LastVariantCode = string.IsNullOrEmpty(response.variant_code) ? null : response.variant_code;
        LastSource = string.IsNullOrEmpty(response.source) ? null : response.source;
    }

    private void LogSystemParameterReason(ParameterResponse response)
    {
        if (response.source == "working_value" && response.source_reason == "no_active_experiment")
        {
            Warn("Активный эксперимент не найден. Взяли значение параметра из системы.");
        }
    }

    private void ClearExperimentMeta()
    {
        LastExperimentId = null;
        LastVariantCode = null;
        LastSource = null;
    }

    private T ConvertValue<T>(string value, T defaultValue)
    {
        Type targetType = typeof(T);

        if (targetType == typeof(float))
        {
            return (T)(object)float.Parse(value, CultureInfo.InvariantCulture);
        }

        if (targetType == typeof(int))
        {
            return (T)(object)int.Parse(value, CultureInfo.InvariantCulture);
        }

        if (targetType == typeof(bool))
        {
            if (bool.TryParse(value, out bool boolValue))
            {
                return (T)(object)boolValue;
            }

            return (T)(object)(value == "1");
        }

        if (targetType == typeof(string))
        {
            return (T)(object)value;
        }

        return defaultValue;
    }

    private string ExtractJsonValue(string json, string key)
    {
        Match match = Regex.Match(
            json,
            $"\"{key}\"\\s*:\\s*(\"(?:\\\\.|[^\"])*\"|true|false|null|-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)"
        );

        if (!match.Success || match.Groups[1].Value == "null")
        {
            return null;
        }

        string value = match.Groups[1].Value;

        if (value.StartsWith("\"") && value.EndsWith("\""))
        {
            value = value.Substring(1, value.Length - 2);
            return Regex.Unescape(value);
        }

        return value;
    }

    private string NormalizeBaseUrl(string value)
    {
        return value.Trim().TrimEnd('/');
    }

    private bool RequestFailed(UnityWebRequest request)
    {
#if UNITY_2020_2_OR_NEWER
        return request.result != UnityWebRequest.Result.Success;
#else
        return request.isNetworkError || request.isHttpError;
#endif
    }

    private void Warn(string message)
    {
        if (logWarnings)
        {
            Debug.LogWarning(message);
        }
    }

    [Serializable]
    private class ParameterResponse
    {
        public bool found;
        public string parameter_key;
        public string parameter_type;
        public string source;
        public string source_reason;
        public long experiment_id;
        public string variant_code;
        public bool use_fallback;
    }
}
