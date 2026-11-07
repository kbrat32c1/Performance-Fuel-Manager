#import <Capacitor/Capacitor.h>

CAP_PLUGIN(V5BandPlugin, "V5Band",
    CAP_PLUGIN_METHOD(startScan, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(stopScan, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(connect, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(disconnect, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getConnectionStatus, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(syncHealthData, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getBatteryLevel, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(reconnectSaved, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(fetchRecentHR, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(startHRMonitoring, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(stopHRMonitoring, CAPPluginReturnPromise);
)
