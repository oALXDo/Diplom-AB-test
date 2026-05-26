using System;
using System.Reflection;
using System.Runtime.InteropServices;
using UnityEngine;

public class Bootstrap : MonoBehaviour
{
    [SerializeField] private ParameterService parameterService;
    [SerializeField] private UIparemetrController _uiParametrController;
    [SerializeField] private YandexMetricaAnalyticsService analyticsService;
    [SerializeField] private GameObject loadingPanel;

    [SerializeField] private string apiBaseUrl = "https://parametrica.space";
    [SerializeField] private long applicationId = 1;
    [SerializeField] private string userIdOverride = "";
    [SerializeField] private int yandexMetricaCounterId = 109320165;

#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")]
    private static extern IntPtr ABTesting_GetBackendBaseUrl();
#endif

    private void Start()
    {
        SetLoadingPanelActive(true);
        WaitForMirraSdk(StartAfterMirraSdkReady);
    }

    private void StartAfterMirraSdkReady()
    {
        string userId = ResolveUserId();
        parameterService.Initialize(ResolveApiBaseUrl(), applicationId, userId);
        InitializeAnalytics(userId);
        _uiParametrController.InitUI(OnInitialServerDataLoaded);
    }

    private void OnInitialServerDataLoaded()
    {
        SetLoadingPanelActive(false);
    }

    private void InitializeAnalytics(string userId)
    {
        if (analyticsService != null)
        {
            analyticsService.Initialize(yandexMetricaCounterId, applicationId, userId, parameterService);
        }
    }

    private string ResolveApiBaseUrl()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        IntPtr urlPtr = ABTesting_GetBackendBaseUrl();
        if (urlPtr != IntPtr.Zero)
        {
            string url = Marshal.PtrToStringAnsi(urlPtr);
            if (!string.IsNullOrWhiteSpace(url))
            {
                return url.Trim();
            }
        }
#endif
        return apiBaseUrl;
    }

    private string ResolveUserId()
    {
        if (!string.IsNullOrWhiteSpace(userIdOverride))
        {
            return userIdOverride.Trim();
        }

        string mirraUserId = TryGetMirraPlayerUniqueId();
        if (!string.IsNullOrWhiteSpace(mirraUserId))
        {
            return mirraUserId.Trim();
        }

        string savedUserId = TryGetMirraDataString("DiplomTest.StableUserId");
        if (!string.IsNullOrWhiteSpace(savedUserId))
        {
            return savedUserId.Trim();
        }

        savedUserId = Guid.NewGuid().ToString("N");
        TrySetMirraDataString("DiplomTest.StableUserId", savedUserId);
        TrySaveMirraData();
        return savedUserId;
    }

    private void SetLoadingPanelActive(bool active)
    {
        if (loadingPanel != null)
        {
            loadingPanel.SetActive(active);
        }
    }

    private void WaitForMirraSdk(Action callback)
    {
        Type sdkType = FindType("MirraSDK");
        MethodInfo waitMethod = sdkType?.GetMethod("WaitForProviders", BindingFlags.Public | BindingFlags.Static);

        if (waitMethod != null)
        {
            waitMethod.Invoke(null, new object[] { callback });
            return;
        }

        callback?.Invoke();
    }

    private string TryGetMirraPlayerUniqueId()
    {
        object player = FindType("MirraSDK")?.GetProperty("Player", BindingFlags.Public | BindingFlags.Static)?.GetValue(null);
        return player?.GetType().GetProperty("UniqueId", BindingFlags.Public | BindingFlags.Instance)?.GetValue(player) as string;
    }

    private string TryGetMirraDataString(string key)
    {
        object data = FindType("MirraSDK")?.GetProperty("Data", BindingFlags.Public | BindingFlags.Static)?.GetValue(null);
        MethodInfo getString = data?.GetType().GetMethod("GetString", new[] { typeof(string) });
        return getString?.Invoke(data, new object[] { key }) as string;
    }

    private void TrySetMirraDataString(string key, string value)
    {
        object data = FindType("MirraSDK")?.GetProperty("Data", BindingFlags.Public | BindingFlags.Static)?.GetValue(null);
        MethodInfo setString = data?.GetType().GetMethod("SetString", new[] { typeof(string), typeof(string) });
        setString?.Invoke(data, new object[] { key, value });
    }

    private void TrySaveMirraData()
    {
        object data = FindType("MirraSDK")?.GetProperty("Data", BindingFlags.Public | BindingFlags.Static)?.GetValue(null);
        data?.GetType().GetMethod("Save", Type.EmptyTypes)?.Invoke(data, null);
    }

    private Type FindType(string typeName)
    {
        foreach (Assembly assembly in AppDomain.CurrentDomain.GetAssemblies())
        {
            Type type = assembly.GetType(typeName);
            if (type != null)
            {
                return type;
            }
        }

        return null;
    }
}
