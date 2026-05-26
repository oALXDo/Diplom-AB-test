using System.Collections.Generic;
using UnityEngine;

public class YandexMetricaAnalyticsService : MonoBehaviour
{
    [SerializeField] private ParameterService parameterService;

    private int counterId;
    private long applicationId;
    private string userId;
    private long? currentExperimentId;
    private long? currentVariantId;
    private string currentVariantCode;

    public void Initialize(int yandexMetricaCounterId, long appId, string stableUserId, ParameterService service)
    {
        counterId = yandexMetricaCounterId;
        BindParameterService(service);
        Initialize(appId, stableUserId);
    }

    public void Initialize(long appId, string stableUserId)
    {
        applicationId = appId;
        userId = stableUserId;
    }

    public void BindParameterService(ParameterService service)
    {
        if (parameterService != null)
        {
            parameterService.ParameterApplied -= OnParameterApplied;
            parameterService.ParameterFallbackUsed -= OnParameterFallbackUsed;
        }

        parameterService = service;

        if (parameterService != null)
        {
            parameterService.ParameterApplied += OnParameterApplied;
            parameterService.ParameterFallbackUsed += OnParameterFallbackUsed;
        }
    }

    public void TrackEvent(string eventName, Dictionary<string, object> payload = null)
    {
        Dictionary<string, object> fullPayload = BuildBasePayload();
        Merge(fullPayload, payload);
        Debug.Log($"YandexMetrica event {eventName}: {MiniJson(fullPayload)}");
    }

    public void TrackGoal(string goalName, Dictionary<string, object> payload = null)
    {
        Dictionary<string, object> fullPayload = BuildBasePayload();
        Merge(fullPayload, payload);
        Debug.Log($"YandexMetrica goal {goalName}: {MiniJson(fullPayload)}");
    }

    private void OnParameterApplied(ParameterService.ParameterAnalyticsContext context)
    {
        if (context.HasExperimentAssignment)
        {
            currentExperimentId = context.ExperimentId;
            currentVariantId = context.VariantId;
            currentVariantCode = context.VariantCode;

            TrackGoal("experiment_exposure", new Dictionary<string, object>
            {
                ["parameter_key"] = context.ParameterKey,
                ["parameter_type"] = context.ParameterType,
                ["parameter_value"] = context.ParameterValue,
                ["source"] = context.Source,
                ["source_reason"] = context.SourceReason
            });
        }

        TrackEvent("parameter_applied", new Dictionary<string, object>
        {
            ["parameter_key"] = context.ParameterKey,
            ["parameter_type"] = context.ParameterType,
            ["parameter_value"] = context.ParameterValue,
            ["source"] = context.Source,
            ["source_reason"] = context.SourceReason
        });
    }

    private void OnParameterFallbackUsed(ParameterService.ParameterAnalyticsContext context)
    {
        TrackEvent("parameter_fallback_used", new Dictionary<string, object>
        {
            ["parameter_key"] = context.ParameterKey,
            ["parameter_value"] = context.ParameterValue,
            ["source_reason"] = context.SourceReason
        });
    }

    private Dictionary<string, object> BuildBasePayload()
    {
        Dictionary<string, object> payload = new Dictionary<string, object>
        {
            ["counter_id"] = counterId,
            ["application_id"] = applicationId,
            ["user_id"] = userId
        };

        if (currentExperimentId.HasValue)
        {
            payload["experiment_id"] = currentExperimentId.Value;
        }

        if (currentVariantId.HasValue)
        {
            payload["variant_id"] = currentVariantId.Value;
        }
        else if (!string.IsNullOrEmpty(currentVariantCode))
        {
            payload["variant_id"] = currentVariantCode;
        }

        if (!string.IsNullOrEmpty(currentVariantCode))
        {
            payload["variant_code"] = currentVariantCode;
        }

        return payload;
    }

    private void Merge(Dictionary<string, object> target, Dictionary<string, object> source)
    {
        if (source == null)
        {
            return;
        }

        foreach (KeyValuePair<string, object> pair in source)
        {
            target[pair.Key] = pair.Value;
        }
    }

    private string MiniJson(Dictionary<string, object> payload)
    {
        List<string> parts = new List<string>();
        foreach (KeyValuePair<string, object> pair in payload)
        {
            string value = pair.Value == null ? "null" : pair.Value is string ? $"\"{pair.Value}\"" : pair.Value.ToString();
            parts.Add($"\"{pair.Key}\":{value}");
        }

        return "{" + string.Join(",", parts) + "}";
    }

    private void OnDestroy()
    {
        BindParameterService(null);
    }
}
