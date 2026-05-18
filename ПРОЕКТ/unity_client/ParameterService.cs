using System;
using System.Collections;
using System.Text.RegularExpressions;
using UnityEngine;
using UnityEngine.Networking;

// Пример Unity-клиента для WebGL/Standalone.
// Unity обращается только к backend API и не подключается напрямую к PostgreSQL.
public class ParameterService : MonoBehaviour
{
    [SerializeField] private string apiBaseUrl = "http://localhost:3000";
    [SerializeField] private long applicationId = 1;
    [SerializeField] private string userId = "test_user_1";

    public long? LastExperimentId { get; private set; }
    public string LastVariantCode { get; private set; }

    public void GetFloat(string parameterKey, float fallbackValue, Action<float> onComplete)
    {
        StartCoroutine(GetParameter(parameterKey, fallbackValue, value => onComplete(Convert.ToSingle(value))));
    }

    public void GetInt(string parameterKey, int fallbackValue, Action<int> onComplete)
    {
        StartCoroutine(GetParameter(parameterKey, fallbackValue, value => onComplete(Convert.ToInt32(value))));
    }

    public void GetBool(string parameterKey, bool fallbackValue, Action<bool> onComplete)
    {
        StartCoroutine(GetParameter(parameterKey, fallbackValue, value => onComplete(Convert.ToBoolean(value))));
    }

    public void GetString(string parameterKey, string fallbackValue, Action<string> onComplete)
    {
        StartCoroutine(GetParameter(parameterKey, fallbackValue, value => onComplete(Convert.ToString(value))));
    }

    private IEnumerator GetParameter<T>(string parameterKey, T fallbackValue, Action<object> onComplete)
    {
        string url = $"{apiBaseUrl}/api/parameter?application_id={applicationId}&user_id={UnityWebRequest.EscapeURL(userId)}&parameter_key={UnityWebRequest.EscapeURL(parameterKey)}";

        using (UnityWebRequest request = UnityWebRequest.Get(url))
        {
            yield return request.SendWebRequest();

            if (request.result != UnityWebRequest.Result.Success)
            {
                Debug.LogWarning($"Parameter request failed, using fallback. Error: {request.error}");
                ClearExperimentMeta();
                onComplete(fallbackValue);
                yield break;
            }

            string json = request.downloadHandler.text;
            ParameterResponse response = JsonUtility.FromJson<ParameterResponse>(json);

            if (response == null || !response.found || response.use_fallback)
            {
                ClearExperimentMeta();
                onComplete(fallbackValue);
                yield break;
            }

            if (response.experiment_id > 0)
            {
                LastExperimentId = response.experiment_id;
            }
            else
            {
                LastExperimentId = null;
            }
            LastVariantCode = string.IsNullOrEmpty(response.variant_code) ? null : response.variant_code;

            try
            {
                string rawValue = ExtractJsonValue(json, "parameter_value");
                if (rawValue == null)
                {
                    onComplete(fallbackValue);
                    yield break;
                }

                onComplete(ConvertValue(rawValue, typeof(T)));
            }
            catch (Exception exception)
            {
                Debug.LogWarning($"Parameter conversion failed, using fallback. Error: {exception.Message}");
                onComplete(fallbackValue);
            }
        }
    }

    private string ExtractJsonValue(string json, string key)
    {
        Match match = Regex.Match(json, $"\"{key}\"\\s*:\\s*(\"(?:\\\\.|[^\"])*\"|true|false|null|-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)");
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

    private object ConvertValue(string value, Type targetType)
    {
        if (targetType == typeof(float))
        {
            return float.Parse(value, System.Globalization.CultureInfo.InvariantCulture);
        }

        if (targetType == typeof(int))
        {
            return int.Parse(value, System.Globalization.CultureInfo.InvariantCulture);
        }

        if (targetType == typeof(bool))
        {
            return value.Equals("true", StringComparison.OrdinalIgnoreCase) || value == "1";
        }

        return value;
    }

    private void ClearExperimentMeta()
    {
        LastExperimentId = null;
        LastVariantCode = null;
    }

    [Serializable]
    private class ParameterResponse
    {
        public bool found;
        public string parameter_key;
        public string parameter_type;
        public string source;
        public long experiment_id;
        public string variant_code;
        public bool use_fallback;
    }
}
