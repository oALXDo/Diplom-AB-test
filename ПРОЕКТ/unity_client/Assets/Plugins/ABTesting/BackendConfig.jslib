mergeInto(LibraryManager.library, {
  ABTesting_GetBackendBaseUrl: function () {
    var config = window.DiplomTestBackendConfig || {};
    var apiBaseUrl = config.apiBaseUrl;
    if (typeof apiBaseUrl !== "string" || !apiBaseUrl.trim()) {
      return 0;
    }

    apiBaseUrl = apiBaseUrl.trim();
    var bufferSize = lengthBytesUTF8(apiBaseUrl) + 1;
    var buffer = _malloc(bufferSize);
    stringToUTF8(apiBaseUrl, buffer, bufferSize);
    return buffer;
  }
});
