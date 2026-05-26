using System;
using System.Collections;
using System.Globalization;
using System.Text.RegularExpressions;
using UnityEngine;
using UnityEngine.Networking;

public class ParameterService : MonoBehaviour
{
    [Header("Backend")]
    [SerializeField] private string apiBaseUrl = "https://parametrica.space";
    [SerializeField] private bool logWarnings = true;

    private long applicationId;
    private string userId;

    public event Action<ParameterAnalyticsContext> ParameterApplied;
    public event Action<ParameterAnalyticsContext> ParameterFallbackUsed;

    public bool IsInitialized { get; private set; }
    public long ApplicationId => applicationId;
    public string UserId => userId;
    public long? LastExperimentId { get; private set; }
    public long? LastVariantId { get; private set; }
    public string LastVariantCode { get; private set; }
    public string LastSource { get; private set; }
    public string LastSourceReason { get; private set; }

    public void Initialize(string serverBaseUrl, long appId, string stableUserId)
    {
        if (string.IsNullOrWhiteSpace(serverBaseUrl))
        {
            throw new ArgumentException("Backend URL is required.", nameof(serverBaseUrl));
        }

        if (appId <= 0)
        {
            throw new ArgumentException("Application id must be greater than zero.", nameof(appId));
        }

        if (string.IsNullOrWhiteSpace(stableUserId))
        {
            throw new ArgumentException("User id is required.", nameof(stableUserId));
        }

        applicationId = appId;
        userId = stableUserId.Trim();
        apiBaseUrl = NormalizeBaseUrl(serverBaseUrl);
        IsInitialized = true;
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
            NotifyFallback(parameterKey, defaultValue, null, null, "client_not_initialized");
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
            yield return request.SendWebRequest();

            if (RequestFailed(request))
            {
                Warn($"Parameter request failed for \"{parameterKey}\": {request.error}");
                ClearExperimentMeta();
                NotifyFallback(parameterKey, defaultValue, null, null, "network_error");
                onComplete?.Invoke(defaultValue);
                yield break;
            }

            string json = request.downloadHandler.text;
            ParameterResponse response = JsonUtility.FromJson<ParameterResponse>(json);

            if (response == null || !response.found || response.use_fallback)
            {
                ClearExperimentMeta();
                NotifyFallback(parameterKey, defaultValue, response, null, response?.source_reason);
                onComplete?.Invoke(defaultValue);
                yield break;
            }

            string rawValue = ExtractJsonValue(json, "parameter_value");

            try
            {
                T convertedValue = rawValue == null ? defaultValue : ConvertValue(rawValue, defaultValue);
                RememberExperimentMeta(response);
                NotifyApplied(parameterKey, response, rawValue);
                onComplete?.Invoke(convertedValue);
            }
            catch (Exception exception)
            {
                Warn($"Could not convert parameter \"{parameterKey}\" value \"{rawValue}\": {exception.Message}");
                NotifyFallback(parameterKey, defaultValue, response, rawValue, "conversion_error");
                onComplete?.Invoke(defaultValue);
            }
        }
    }

    private bool CanRequestParameter(string parameterKey)
    {
        if (!IsInitialized)
        {
            Warn("ParameterService is not initialized.");
            return false;
        }

        if (string.IsNullOrWhiteSpace(parameterKey))
        {
            Warn("Parameter key is empty.");
            return false;
        }

        return true;
    }

    private void RememberExperimentMeta(ParameterResponse response)
    {
        LastExperimentId = response.experiment_id > 0 ? response.experiment_id : (long?)null;
        LastVariantId = response.variant_id > 0 ? response.variant_id : (long?)null;
        LastVariantCode = string.IsNullOrEmpty(response.variant_code) ? null : response.variant_code;
        LastSource = string.IsNullOrEmpty(response.source) ? null : response.source;
        LastSourceReason = string.IsNullOrEmpty(response.source_reason) ? null : response.source_reason;
    }

    private void ClearExperimentMeta()
    {
        LastExperimentId = null;
        LastVariantId = null;
        LastVariantCode = null;
        LastSource = null;
        LastSourceReason = null;
    }

    private void NotifyApplied(string parameterKey, ParameterResponse response, string rawValue)
    {
        ParameterApplied?.Invoke(BuildContext(parameterKey, response, rawValue, response?.source_reason));
    }

    private void NotifyFallback<T>(string parameterKey, T fallbackValue, ParameterResponse response, string rawValue, string reason)
    {
        ParameterFallbackUsed?.Invoke(BuildContext(parameterKey, response, rawValue ?? Convert.ToString(fallbackValue, CultureInfo.InvariantCulture), reason));
    }

    private ParameterAnalyticsContext BuildContext(string parameterKey, ParameterResponse response, string rawValue, string reason)
    {
        return new ParameterAnalyticsContext
        {
            ParameterKey = parameterKey,
            ParameterType = response?.parameter_type,
            ParameterValue = rawValue,
            Source = response?.source,
            SourceReason = reason,
            ExperimentId = response != null && response.experiment_id > 0 ? response.experiment_id : (long?)null,
            VariantId = response != null && response.variant_id > 0 ? response.variant_id : (long?)null,
            VariantCode = string.IsNullOrEmpty(response?.variant_code) ? null : response.variant_code
        };
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
        public long variant_id;
        public string variant_code;
        public bool use_fallback;
    }

    public struct ParameterAnalyticsContext
    {
        public string ParameterKey;
        public string ParameterType;
        public string ParameterValue;
        public string Source;
        public string SourceReason;
        public long? ExperimentId;
        public long? VariantId;
        public string VariantCode;

        public bool HasExperimentAssignment => ExperimentId.HasValue && (!string.IsNullOrEmpty(VariantCode) || VariantId.HasValue);
    }
}
