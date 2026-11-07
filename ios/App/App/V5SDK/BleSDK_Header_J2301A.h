//
//  BleSDK_Header.h
//  BleSDK
//
//  Created by yang sai on 2022/4/27.
//

#ifndef BleSDK_Header_J2301A_h
#define BleSDK_Header_J2301A_h


typedef NS_ENUM(NSInteger, DATATYPE_J2301A) {
    GetDeviceTime_J2301A = 0,
    SetDeviceTime_J2301A = 1,
    GetPersonalInfo_J2301A = 2,
    SetPersonalInfo_J2301A = 3,
    GetDeviceInfo_J2301A = 4,
    SetDeviceInfo_J2301A = 5,
    SetDeviceID_J2301A = 6,
    GetDeviceGoal_J2301A = 7,
    SetDeviceGoal_J2301A = 8,
    GetDeviceBattery_J2301A = 9,
    GetDeviceMacAddress_J2301A = 10,
    GetDeviceVersion_J2301A = 11,
    FactoryReset_J2301A = 12,
    MCUReset_J2301A = 13,
    MotorVibration_J2301A = 14,
    GetDeviceName_J2301A = 15,
    SetDeviceName_J2301A = 16,
    GetAutomaticMonitoring_J2301A = 17,
    SetAutomaticMonitoring_J2301A = 18,
    GetAlarmClock_J2301A = 19,
    SetAlarmClock_J2301A = 20,
    DeleteAllAlarmClock_J2301A = 21,
    GetSedentaryReminder_J2301A = 22,
    SetSedentaryReminder_J2301A = 23,
    RealTimeStep_J2301A = 24,
    TotalActivityData_J2301A = 25,
    DetailActivityData_J2301A = 26,
    DetailSleepData_J2301A = 27,
    DynamicHR_J2301A = 28,
    StaticHR_J2301A = 29,
    ActivityModeData_J2301A = 30,
    StartActivityMode_J2301A = 31,
    StopActivityMode_J2301A = 32,
    PauseActivityMode_J2301A = 33,
    ContinueActivityMode_J2301A = 34,
    GetActivityMode_J2301A = 35,
    DeviceSendDataToAPP_J2301A = 36,
    EnterTakePhotoMode_J2301A = 37,
    StartTakePhoto_J2301A = 38,
    StopTakePhoto_J2301A = 39,
    BackHomeView_J2301A = 40,
    HRVData_J2301A = 41,
    GPSData_J2301A = 42,
    SetSocialDistanceReminder_J2301A = 43,
    GetSocialDistanceReminder_J2301A = 44,
    AutomaticSpo2Data_J2301A = 45,
    ManualSpo2Data_J2301A = 46,
    FindMobilePhone_J2301A = 47,
    TemperatureData_J2301A = 48,
    AxillaryTemperatureData_J2301A = 49,
    SOS_J2301A  =  50,
    ECG_HistoryData_J2301A = 51,
 
    StartECG_J2301A = 52,
    StopECG_J2301A  = 53,
    ECG_RawData_J2301A = 54,
    ECG_Success_Result_J2301A  = 55,
    ECG_Status_J2301A  = 56,
    ECG_Failed_J2301A =  57,
    DeviceMeasurement_HR_J2301A =  58,
    DeviceMeasurement_HRV_J2301A =  59,
    DeviceMeasurement_Spo2_J2301A =  60,
    unLockScreen_J2301A = 61,
    lockScreen_J2301A = 62,
    clickYesWhenUnLockScreen_J2301A = 63,
    clickNoWhenUnLockScreen_J2301A = 64,
    setWeather_J2301A  =  65,
    openRRInterval_J2301A  =  66,
    closeRRInterval_J2301A  =  67,
    realtimeRRIntervalData_J2301A  =  68,
    realtimePPIData_J2301A  =  69,
    realtimePPGData_J2301A  =  70,
    ppgStartSucessed_J2301A = 71,
    ppgStartFailed_J2301A = 72,
    ppgResult_J2301A = 73,
    ppgStop_J2301A = 74,
    ppgQuit_J2301A = 75,
    ppgMeasurementProgress_J2301A = 76,
    clearAllHistoryData_J2301A = 77,
    setMenstruationInfo_J2301A = 78,
    setPregnancyInfo_J2301A = 79,
    DeviceMeasurement_J2301A =  80,
    
    
    DataError_J2301A =  255
};



typedef struct DeviceTime_J2301A {
    int year;
    int month;
    int day;
    int hour;
    int minute;
    int second;
} MyDeviceTime_J2301A;

typedef struct PersonalInfo_J2301A {
    int gender;
    int age;
    int height;
    int weight;
    int stride;
} MyPersonalInfo_J2301A;

typedef struct NotificationType_J2301A {
    int call;
    int SMS;
    int wechat;
    int facebook;
    int instagram;
    int skype;
    int telegram;
    int twitter;
    int vkclient;
    int whatsapp;
    int qq;
    int In;
} MyNotificationType_J2301A;

typedef struct DeviceInfo_J2301A {
    int distanceUnit;
    int timeUnit;
    int wristOn;
    int temperatureUnit;
    int notDisturbMode;
    int ANCS;
    MyNotificationType_J2301A notificationType;
    int baseHeartRate;
    int screenBrightness;
    int watchFaceStyle;
    int socialDistanceRemind;
    int language;
} MyDeviceInfo_J2301A;




typedef struct Weeks_J2301A {
    BOOL sunday;
    BOOL monday;
    BOOL Tuesday;
    BOOL Wednesday;
    BOOL Thursday;
    BOOL Friday;
    BOOL Saturday;
} MyWeeks_J2301A;


/**
 AutomaticMonitoring
 mode:工作模式，0：关闭  1:时间段工作方式，2： 时间段内间隔工作方式
 startTime_Hour: 开始时间的小时
 startTime_Minutes: 开始时间的分钟
 endTime_Hour:
*/

typedef struct AutomaticMonitoring_J2301A {
    int mode;
    int startTime_Hour;
    int startTime_Minutes;
    int endTime_Hour;
    int endTime_Minutes;
    MyWeeks_J2301A weeks;
    int intervalTime;
    int dataType;// 1 means heartRate  2 means spo2  3 means temperature  4 means HRV
} MyAutomaticMonitoring_J2301A;





typedef struct BPCalibrationParameter_J2301A {
    int gender;
    int age;
    int height;
    int weight;
    int BP_high;
    int BP_low;
    int heartRate;
} MyBPCalibrationParameter_J2301A;


typedef struct WeatherParameter_J2301A {
    int weatherType;
    int currentTemperature;
    int highestTemperature;
    int lowestTemperature;
    NSString * strCity;
} MyWeatherParameter_J2301A;

typedef struct BreathParameter_J2301A {
    int breathMode; //  0  1  2 three mode 
    int DurationOfBreathingExercise;
} MyBreathParameter_J2301A;

typedef struct SocialDistanceReminder_J2301A {
    char scanInterval;
    char scanTime;
    char signalStrength;
} MySocialDistanceReminder_J2301A;


typedef NS_ENUM(NSInteger, MeasurementDataType_J2301A) {
    heartRateData_J2301A    = 2,
    spo2Data_J2301A = 3
  
};

typedef NS_ENUM(NSInteger, ACTIVITYMODE_J2301A) {
   
    
    
    Run = 0,
    Cycling = 1,
    Walking = 2,
    Badminton = 3,
    Football = 4,
    Tennis = 5,
    BreathingTraining = 6,
    Dancing = 7,
    Basketball = 8,
    Weightlifting = 9,
    Cricket = 10,
    Hiking = 11,
    Aerobics = 12,
    TableTennis = 13,
    JumpRope = 14,
    Situps = 15,
    Volleyball = 16,
    Handball = 17,
    Baseball = 18,
    FieldHockey = 19,
    Fencing = 20,
    Boxing = 21,
    MixedMartialArts = 22,
    Wrestling = 23,
    JavelinThrow = 24,
    PoleVault = 25,
    HighJump = 26,
    Rowing = 27,
    Sailing = 28,
    DoubleRowing = 29,
    BalanceBeam = 30,
    ArtisticGymnastics = 31,
    LongJump = 32,
    ShotPut = 33,
    HammerThrow = 34,
    Trampoline = 35,
    Rings = 36,
    PommelHorse = 37,
    HorizontalBar = 38,
    Triathlon = 39,
    Bowling = 40,
    Skiing = 41,
    IceSkating = 42,
    Treadmill = 43,
    Spinning = 44
    
    
    
};

typedef NS_ENUM(NSInteger, WORKMODE_J2301A) {
    startActivity = 1,
    pauseActivity    = 2,
    continueActivity = 3,
    stopActivity    = 4
};


#endif /* BleSDK_Header_J2301A_h */
