using System.Collections.Generic;
using UnityEngine;

public class ShopItemController : MonoBehaviour
{
    [SerializeField] private ParameterService parameterService;
    [SerializeField] private YandexMetricaAnalyticsService analyticsService;
    [SerializeField] private string itemId;

    public void Buy()
    {
        Dictionary<string, object> parameters = BuildPurchaseEventParameters();
        parameters["item_id"] = itemId;
        analyticsService?.TrackEvent("purchase", parameters);
    }

    private Dictionary<string, object> BuildPurchaseEventParameters()
    {
        Dictionary<string, object> parameters = new Dictionary<string, object>();
        ParameterService service = GetParameterService();

        if (service != null && service.IsInitialized)
        {
            parameters["application_id"] = service.ApplicationId;
            parameters["user_id"] = service.UserId;

            if (service.LastExperimentId.HasValue)
            {
                parameters["experiment_id"] = service.LastExperimentId.Value;
            }

            if (service.LastVariantId.HasValue)
            {
                parameters["variant_id"] = service.LastVariantId.Value;
            }
            else if (!string.IsNullOrEmpty(service.LastVariantCode))
            {
                parameters["variant_id"] = service.LastVariantCode;
            }

            if (!string.IsNullOrEmpty(service.LastVariantCode))
            {
                parameters["variant_code"] = service.LastVariantCode;
            }
        }

        return parameters;
    }

    private ParameterService GetParameterService()
    {
        return parameterService != null ? parameterService : FindObjectOfType<ParameterService>();
    }
}
