#import <Capacitor/Capacitor.h>

// Register the HealthKit plugin with Capacitor
CAP_PLUGIN(HealthKitPlugin, "HealthKit",
    CAP_PLUGIN_METHOD(isAvailable, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(requestAuthorization, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(queryDayData, CAPPluginReturnPromise);
)
