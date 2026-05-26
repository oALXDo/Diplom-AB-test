using System;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

public class UIparemetrController : MonoBehaviour
{
    [SerializeField] private ParameterService parameterService;
    [SerializeField] private TextMeshProUGUI[] _itemNames;
    [SerializeField] private TextMeshProUGUI[] _itemCost;
    [SerializeField] private TextMeshProUGUI testVariantText;
    [SerializeField] private Image _backgroundImage;
    [SerializeField] private GameObject _offerObject;

    private int pendingRequests;
    private Action onComplete;

    public void InitUI(Action onInitialServerDataLoaded = null)
    {
        onComplete = onInitialServerDataLoaded;
        pendingRequests = 6;
        UpdateTestVariantText("-");

        parameterService.GetString("item_1_name", "1", value =>
        {
            SetText(_itemNames, 0, value);
            CompleteRequest();
        });

        parameterService.GetInt("item_1_price", 0, value =>
        {
            SetText(_itemCost, 0, value.ToString());
            CompleteRequest();
        });

        parameterService.GetString("item_2_name", "2", value =>
        {
            SetText(_itemNames, 1, value);
            CompleteRequest();
        });

        parameterService.GetFloat("item_2_price", 0.5f, value =>
        {
            SetText(_itemCost, 1, value.ToString("0.##"));
            CompleteRequest();
        });

        parameterService.GetString("background_color", "#F0F4F8", value =>
        {
            ApplyBackgroundColor(value);
            CompleteRequest();
        });

        parameterService.GetBool("offer_1_show", false, value =>
        {
            if (_offerObject != null)
            {
                _offerObject.SetActive(value);
            }
            CompleteRequest();
        });
    }

    private void CompleteRequest()
    {
        UpdateTestVariantText(GetCurrentVariantText());
        pendingRequests -= 1;

        if (pendingRequests <= 0)
        {
            onComplete?.Invoke();
            onComplete = null;
        }
    }

    private string GetCurrentVariantText()
    {
        if (parameterService == null || !parameterService.LastExperimentId.HasValue)
        {
            return "-";
        }

        string variantCode = parameterService.LastVariantCode;

        if (string.Equals(variantCode, "A", StringComparison.OrdinalIgnoreCase))
        {
            return "A";
        }

        if (string.Equals(variantCode, "B", StringComparison.OrdinalIgnoreCase))
        {
            return "B";
        }

        return "-";
    }

    private void UpdateTestVariantText(string value)
    {
        if (testVariantText != null)
        {
            testVariantText.text = value;
        }
    }

    private void ApplyBackgroundColor(string hexColor)
    {
        if (_backgroundImage != null && ColorUtility.TryParseHtmlString(hexColor, out Color color))
        {
            _backgroundImage.color = color;
        }
    }

    private void SetText(TextMeshProUGUI[] labels, int index, string value)
    {
        if (labels != null && index >= 0 && index < labels.Length && labels[index] != null)
        {
            labels[index].text = value;
        }
    }
}
