/**
 * V5BandPlugin — Capacitor plugin for direct BLE communication with V5 smart band
 *
 * Wraps the V5 SDK (BleSDK_J2301A + NewBle) to expose scan, connect, and
 * health data sync capabilities to the JavaScript layer.
 *
 * Data flow: V5 Band → BLE → this plugin → JavaScript → Supabase
 */

import Foundation
import Capacitor
import CoreBluetooth

@objc(V5BandPlugin)
public class V5BandPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "V5BandPlugin"
    public let jsName = "V5Band"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getConnectionStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncHealthData", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getBatteryLevel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reconnectSaved", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "fetchRecentHR", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startHRMonitoring", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopHRMonitoring", returnType: CAPPluginReturnPromise),
    ]

    /// UserDefaults key for persisting the last-connected device UUID
    private static let savedDeviceUUIDKey = "V5BandLastDeviceUUID"

    // MARK: - State

    private var ble: NewBle?
    private var sdk: BleSDK_J2301A?
    private var bleDelegate: V5BleDelegate?

    /// Discovered peripherals keyed by identifier string
    private var discoveredPeripherals: [String: CBPeripheral] = [:]

    /// Currently pending scan call
    private var scanCall: CAPPluginCall?
    private var scanTimer: Timer?

    /// Currently pending connect call
    private var connectCall: CAPPluginCall?

    /// Currently pending data sync
    private var syncCall: CAPPluginCall?
    private var syncResult: [String: Any] = [:]

    // MARK: - Plugin Lifecycle

    override public func load() {
        ble = NewBle.sharedManager()
        sdk = BleSDK_J2301A.sharedManager()
        bleDelegate = V5BleDelegate(plugin: self)
        ble?.delegate = bleDelegate
        ble?.setUpCentralManager()
        NSLog("[V5BandPlugin] Plugin loaded, BLE manager initialized")

        // WHOOP-style: attempt auto-reconnect to saved device (skip scan)
        attemptAutoReconnect()
    }

    /// Try to reconnect to the saved device without scanning.
    /// Uses retrievePeripheralsWithIdentifiers which returns peripherals from the
    /// system BLE cache — no active scan needed.
    private func attemptAutoReconnect() {
        guard let savedUUID = UserDefaults.standard.string(forKey: V5BandPlugin.savedDeviceUUIDKey),
              let ble = ble else {
            NSLog("[V5BandPlugin] No saved device UUID, skipping auto-reconnect")
            return
        }

        NSLog("[V5BandPlugin] Attempting auto-reconnect to saved UUID: \(savedUUID)")

        // Wait briefly for CBCentralManager to power on
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            guard let self = self, let ble = self.ble else { return }

            if let peripheral = ble.retrievePeripheral(withUUID: savedUUID) {
                NSLog("[V5BandPlugin] Retrieved saved peripheral: \(peripheral.name ?? "unknown")")
                self.discoveredPeripherals[savedUUID] = peripheral

                if peripheral.state == .connected {
                    // Already connected from state restoration — re-discover services
                    NSLog("[V5BandPlugin] Peripheral already connected (state restoration)")
                    peripheral.delegate = (ble as! CBPeripheralDelegate)
                    peripheral.discoverServices(nil)
                } else if peripheral.state != .connecting {
                    // Request connection (iOS handles this even in background)
                    ble.connectDevice(peripheral)
                }
            } else {
                NSLog("[V5BandPlugin] Could not retrieve peripheral for UUID \(savedUUID)")
            }
        }
    }

    // MARK: - Scan

    @objc func startScan(_ call: CAPPluginCall) {
        guard let ble = ble else {
            call.reject("BLE not initialized")
            return
        }

        discoveredPeripherals.removeAll()
        scanCall = call

        // Scan for devices with the V5 service UUID (FFF0)
        let serviceUUIDs = [CBUUID(string: "FFF0")]
        ble.startScanning(withServices: serviceUUIDs)
        NSLog("[V5BandPlugin] Started scanning for V5 bands")

        // Auto-stop scan after 10 seconds and return results
        DispatchQueue.main.async { [weak self] in
            self?.scanTimer?.invalidate()
            self?.scanTimer = Timer.scheduledTimer(withTimeInterval: 10.0, repeats: false) { _ in
                self?.finishScan()
            }
        }
    }

    @objc func stopScan(_ call: CAPPluginCall) {
        ble?.stopscan()
        scanTimer?.invalidate()
        scanTimer = nil

        if let pendingCall = scanCall {
            returnScanResults(pendingCall)
            scanCall = nil
        }

        call.resolve(["stopped": true])
    }

    private func finishScan() {
        ble?.stopscan()
        scanTimer?.invalidate()
        scanTimer = nil

        if let call = scanCall {
            returnScanResults(call)
            scanCall = nil
        }
    }

    private func returnScanResults(_ call: CAPPluginCall) {
        var devices: [[String: Any]] = []
        for (id, peripheral) in discoveredPeripherals {
            devices.append([
                "deviceId": id,
                "name": peripheral.name ?? "Unknown V5 Band",
            ])
        }
        call.resolve(["devices": devices])
    }

    // Called by delegate when a device is discovered
    func onDeviceDiscovered(peripheral: CBPeripheral, rssi: NSNumber) {
        let id = peripheral.identifier.uuidString
        if discoveredPeripherals[id] == nil {
            discoveredPeripherals[id] = peripheral
            NSLog("[V5BandPlugin] Discovered: \(peripheral.name ?? "unknown") (\(id)) RSSI: \(rssi)")
        }
    }

    // MARK: - Connect / Disconnect

    @objc func connect(_ call: CAPPluginCall) {
        guard let deviceId = call.getString("deviceId") else {
            call.reject("deviceId is required")
            return
        }

        guard let peripheral = discoveredPeripherals[deviceId] else {
            call.reject("Device not found. Run startScan first.")
            return
        }

        connectCall = call
        ble?.connectDevice(peripheral)
        NSLog("[V5BandPlugin] Connecting to \(peripheral.name ?? deviceId)...")
    }

    @objc func disconnect(_ call: CAPPluginCall) {
        // Clear saved UUID so background reconnect stops
        UserDefaults.standard.removeObject(forKey: V5BandPlugin.savedDeviceUUIDKey)
        UserDefaults.standard.synchronize()
        NSLog("[V5BandPlugin] Cleared saved device UUID (explicit disconnect)")

        ble?.disconnect()
        call.resolve(["disconnected": true])
    }

    @objc func getConnectionStatus(_ call: CAPPluginCall) {
        let connected = ble?.isActivityPeripheral() ?? false
        let connecting = ble?.isConnectOrConnecting() ?? false
        let deviceName = ble?.activityPeripheral?.name ?? ""
        let deviceId = ble?.activityPeripheral?.identifier.uuidString ?? ""

        call.resolve([
            "connected": connected,
            "connecting": connecting,
            "deviceName": deviceName,
            "deviceId": deviceId,
        ])
    }

    /// Reconnect to the saved device without scanning (for JS layer to call)
    @objc func reconnectSaved(_ call: CAPPluginCall) {
        guard let savedUUID = UserDefaults.standard.string(forKey: V5BandPlugin.savedDeviceUUIDKey),
              let ble = ble else {
            call.reject("No saved device")
            return
        }

        // Already connected?
        if ble.isActivityPeripheral() {
            let name = ble.activityPeripheral?.name ?? "V5 Band"
            let id = ble.activityPeripheral?.identifier.uuidString ?? ""
            call.resolve([
                "connected": true,
                "alreadyConnected": true,
                "deviceName": name,
                "deviceId": id,
            ])
            return
        }

        // Try to retrieve the peripheral from system cache (no scan needed)
        if let peripheral = ble.retrievePeripheral(withUUID: savedUUID) {
            discoveredPeripherals[savedUUID] = peripheral
            connectCall = call
            ble.connectDevice(peripheral)
            NSLog("[V5BandPlugin] reconnectSaved: connecting to \(peripheral.name ?? savedUUID)")
        } else {
            call.reject("Saved device not found in system cache — scan required")
        }
    }

    // Called by delegate
    func onConnected() {
        NSLog("[V5BandPlugin] Connected successfully")
        // Don't resolve yet — wait for EnableCommunicate (characteristics discovered)
    }

    func onCommunicationEnabled() {
        NSLog("[V5BandPlugin] Communication enabled (characteristics ready)")

        let name = ble?.activityPeripheral?.name ?? "V5 Band"
        let id = ble?.activityPeripheral?.identifier.uuidString ?? ""

        // Persist device UUID for background reconnect and next-launch auto-connect
        if !id.isEmpty {
            UserDefaults.standard.set(id, forKey: V5BandPlugin.savedDeviceUUIDKey)
            UserDefaults.standard.synchronize()
            NSLog("[V5BandPlugin] Saved device UUID: \(id)")
        }

        // Resolve the pending JS connect promise (if any)
        if let call = connectCall {
            call.resolve([
                "connected": true,
                "deviceName": name,
                "deviceId": id,
            ])
            connectCall = nil
        }

        // Always emit connected event — handles background reconnections
        // where no JS connectCall is pending
        notifyListeners("v5band:connected", data: [
            "deviceName": name,
            "deviceId": id,
        ])

        // Auto-start HR monitoring for continuous strain tracking
        if !isHRMonitoringActive {
            isHRMonitoringActive = true
            NSLog("[V5BandPlugin] HR monitoring auto-started on connect (15-min interval)")
            DispatchQueue.main.async { [weak self] in
                self?.hrMonitoringTimer?.invalidate()
                self?.hrMonitoringTimer = Timer.scheduledTimer(withTimeInterval: 900.0, repeats: true) { [weak self] _ in
                    self?.periodicHRFetch()
                }
            }
            // Do an initial HR fetch after a delay.
            // Must wait long enough for JS to register its v5band:hrUpdate listener
            // (~2s for the useEffect timer + async listener setup).
            // 8s gives ample margin for the full React lifecycle to complete.
            DispatchQueue.main.asyncAfter(deadline: .now() + 8.0) { [weak self] in
                self?.periodicHRFetch()
            }
        }
    }

    func onDisconnected(error: Error?) {
        NSLog("[V5BandPlugin] Disconnected: \(error?.localizedDescription ?? "no error")")

        // Auto-stop HR monitoring on disconnect
        if isHRMonitoringActive {
            stopHRMonitoringInternal()
        }

        notifyListeners("v5band:disconnected", data: [
            "error": error?.localizedDescription ?? "",
        ])
    }

    func onConnectFailed(error: Error?) {
        NSLog("[V5BandPlugin] Connect failed: \(error?.localizedDescription ?? "unknown")")
        if let call = connectCall {
            call.reject("Connection failed: \(error?.localizedDescription ?? "unknown error")")
            connectCall = nil
        }
    }

    // MARK: - HR Monitoring Methods

    /// Lightweight HR-only query — fetches stored HR from the last 2 hours.
    /// Much faster than a full sync (~3-8 sec vs 60 sec).
    @objc func fetchRecentHR(_ call: CAPPluginCall) {
        guard let sdk = sdk, let ble = ble, ble.isActivityPeripheral() else {
            call.reject("Not connected to a V5 band")
            return
        }
        guard !isSyncing else {
            call.reject("Full sync in progress — try again after sync completes")
            return
        }
        guard !isHRFetching else {
            call.reject("HR fetch already in progress")
            return
        }

        isHRFetching = true
        hrFetchCall = call
        hrFetchReadings = []

        // Query HR from 2 hours ago to capture recent data
        let twoHoursAgo = Calendar.current.date(byAdding: .hour, value: -2, to: Date()) ?? Date()
        let cmd = sdk.getContinuousHRData(withMode: Int32(0), withStart: twoHoursAgo)

        NSLog("[V5BandPlugin] HR Fetch: sending lightweight HR query (last 2 hours)")

        // 15-second timeout for HR-only fetch
        DispatchQueue.main.async { [weak self] in
            self?.hrFetchTimer?.invalidate()
            self?.hrFetchTimer = Timer.scheduledTimer(withTimeInterval: 15.0, repeats: false) { _ in
                NSLog("[V5BandPlugin] HR Fetch: timed out. Returning \(self?.hrFetchReadings.count ?? 0) readings collected so far.")
                self?.finishHRFetch()
            }
        }

        if let peripheral = ble.activityPeripheral, let data = cmd {
            ble.writeValue("FFF0", characteristicUUID: "FFF6", p: peripheral, data: data as Data)
        } else {
            isHRFetching = false
            hrFetchCall = nil
            call.reject("Failed to send HR command")
        }
    }

    /// Complete an HR-only fetch — package readings and resolve the JS promise.
    /// Guard: if isHRFetching is already false, this was already called (double-call safety).
    private func finishHRFetch() {
        guard isHRFetching else { return } // prevent double-call from end marker + SDK dataEnd
        hrFetchTimer?.invalidate()
        hrFetchTimer = nil
        isHRFetching = false

        // Group readings by hour
        var byHour: [Int: [Int]] = [:]
        for r in hrFetchReadings {
            byHour[r.hour, default: []].append(r.hr)
        }

        let readings = byHour.map { (hour, values) -> [String: Any] in
            return ["hour": hour, "values": values]
        }.sorted { ($0["hour"] as! Int) < ($1["hour"] as! Int) }

        let totalReadings = hrFetchReadings.count
        NSLog("[V5BandPlugin] HR Fetch complete: \(totalReadings) readings across \(byHour.count) hours")

        if let call = hrFetchCall {
            call.resolve(["readings": readings, "totalReadings": totalReadings])
            hrFetchCall = nil
        }

        // Also emit as event for monitoring listeners
        if isHRMonitoringActive && totalReadings > 0 {
            notifyListeners("v5band:hrUpdate", data: [
                "readings": readings,
                "totalReadings": totalReadings,
            ])
        }
    }

    /// Start periodic HR monitoring — fetches stored HR every 15 minutes.
    /// The V5 band records HR continuously (~15 readings/minute at 4-sec intervals).
    /// This polling approach fetches stored data periodically to compute strain.
    @objc func startHRMonitoring(_ call: CAPPluginCall) {
        guard ble?.isActivityPeripheral() ?? false else {
            call.reject("Not connected to a V5 band")
            return
        }
        guard !isHRMonitoringActive else {
            call.resolve(["started": true, "alreadyActive": true])
            return
        }

        isHRMonitoringActive = true
        NSLog("[V5BandPlugin] HR monitoring started (15-min interval)")

        // Create repeating 15-minute timer
        DispatchQueue.main.async { [weak self] in
            self?.hrMonitoringTimer?.invalidate()
            self?.hrMonitoringTimer = Timer.scheduledTimer(withTimeInterval: 900.0, repeats: true) { [weak self] _ in
                self?.periodicHRFetch()
            }
        }

        call.resolve(["started": true])
    }

    /// Stop periodic HR monitoring.
    @objc func stopHRMonitoring(_ call: CAPPluginCall) {
        stopHRMonitoringInternal()
        call.resolve(["stopped": true])
    }

    private func stopHRMonitoringInternal() {
        isHRMonitoringActive = false
        DispatchQueue.main.async { [weak self] in
            self?.hrMonitoringTimer?.invalidate()
            self?.hrMonitoringTimer = nil
        }
        NSLog("[V5BandPlugin] HR monitoring stopped")
    }

    /// Called by the 15-minute timer — does a lightweight HR fetch if not busy.
    private func periodicHRFetch() {
        guard !isSyncing && !isHRFetching else {
            NSLog("[V5BandPlugin] HR monitoring: skipping fetch (sync or fetch in progress)")
            return
        }
        guard let ble = ble, ble.isActivityPeripheral() else {
            NSLog("[V5BandPlugin] HR monitoring: skipping fetch (not connected)")
            return
        }
        guard let sdk = sdk else { return }

        isHRFetching = true
        hrFetchReadings = []

        let twoHoursAgo = Calendar.current.date(byAdding: .hour, value: -2, to: Date()) ?? Date()
        let cmd = sdk.getContinuousHRData(withMode: Int32(0), withStart: twoHoursAgo)

        NSLog("[V5BandPlugin] HR monitoring: periodic fetch starting")

        DispatchQueue.main.async { [weak self] in
            self?.hrFetchTimer?.invalidate()
            self?.hrFetchTimer = Timer.scheduledTimer(withTimeInterval: 15.0, repeats: false) { _ in
                NSLog("[V5BandPlugin] HR monitoring: periodic fetch timed out")
                self?.finishHRFetch()
            }
        }

        if let peripheral = ble.activityPeripheral, let data = cmd {
            ble.writeValue("FFF0", characteristicUUID: "FFF6", p: peripheral, data: data as Data)
        } else {
            isHRFetching = false
            NSLog("[V5BandPlugin] HR monitoring: failed to send HR command")
        }
    }

    // MARK: - Battery

    @objc func getBatteryLevel(_ call: CAPPluginCall) {
        guard let sdk = sdk, let ble = ble, ble.isActivityPeripheral() else {
            call.reject("Not connected to a V5 band")
            return
        }

        let cmd = sdk.getDeviceBatteryLevel()
        sendCommand(cmd) { deviceData in
            guard let data = deviceData else {
                call.reject("No battery response")
                return
            }

            if data.dataType == DATATYPE_J2301A(rawValue: 9), let dic = data.dicData {
                // GetDeviceBattery_J2301A = 9
                NSLog("[V5BandPlugin] Battery response keys: \(dic.keys), values: \(dic)")
                let level = dic["battery"] as? Int
                    ?? dic["Battery"] as? Int
                    ?? dic["batteryLevel"] as? Int
                    ?? dic["deviceBatteryLevel"] as? Int
                    ?? (dic.values.first as? Int)
                    ?? -1
                call.resolve(["batteryLevel": level])
            } else {
                call.reject("Unexpected response type")
            }
        }
    }

    // MARK: - Sync Health Data
    //
    // Architecture: Fire-and-route
    //
    // We send commands sequentially (with delays to avoid BLE collisions),
    // but data arrives asynchronously and may interleave across command boundaries.
    // When a complete response arrives (dataEnd == true), we route it by its
    // dataType to the correct parser. We track received types and finish when
    // all expected types have been received (or timed out).
    //
    // DATATYPE_J2301A raw values:
    //   DynamicHR_J2301A = 28, HRVData_J2301A = 41, DetailSleepData_J2301A = 27,
    //   AutomaticSpo2Data_J2301A = 45, TemperatureData_J2301A = 48,
    //   TotalActivityData_J2301A = 25, GetDeviceBattery_J2301A = 9

    /// Which data types we're still waiting for
    private var pendingDataTypes: Set<Int> = []
    /// Overall sync timeout
    private var syncTimer: Timer?
    /// Whether we're in sync mode (routing all received data to parsers)
    private var isSyncing = false

    // MARK: - HR Monitoring (Strain Tracking)

    /// Whether we're doing a lightweight HR-only fetch (separate from full sync)
    private var isHRFetching = false
    /// Pending fetchRecentHR call
    private var hrFetchCall: CAPPluginCall?
    /// HR readings accumulated during an HR-only fetch (kept separate from sync arrays)
    private var hrFetchReadings: [(hour: Int, hr: Int)] = []
    /// Timer for HR fetch timeout
    private var hrFetchTimer: Timer?
    /// Timer for periodic HR monitoring (fires every 15 minutes)
    private var hrMonitoringTimer: Timer?
    /// Whether HR monitoring is active
    private var isHRMonitoringActive = false

    /// Start of today (midnight) — used for activity/step queries (daytime only)
    private var startOfToday: Date {
        Calendar.current.startOfDay(for: Date())
    }

    /// 30 hours ago — used for overnight data queries (sleep, HR, HRV, SpO2, temp).
    /// Sleep and related metrics span the previous evening through this morning,
    /// so we need to query back to yesterday evening to capture the full night.
    private var overnightQueryStart: Date {
        Calendar.current.date(byAdding: .hour, value: -30, to: Date()) ?? Date()
    }

    /// Today's date as BCD-encoded bytes (YY, MM, DD) for matching raw BLE packet headers.
    /// The V5 band uses BCD encoding: year 2026 → 0x26 (38 decimal), day 21 → 0x21 (33 decimal).
    private var todayBCD: (yy: UInt8, mm: UInt8, dd: UInt8) {
        let cal = Calendar.current
        let y = cal.component(.year, from: Date()) % 100  // 2026 → 26
        let m = cal.component(.month, from: Date())
        let d = cal.component(.day, from: Date())
        // Convert to BCD: 26 → 0x26 = (2 << 4) | 6
        func toBCD(_ val: Int) -> UInt8 {
            UInt8((val / 10) << 4 | (val % 10))
        }
        return (toBCD(y), toBCD(m), toBCD(d))
    }

    @objc func syncHealthData(_ call: CAPPluginCall) {
        guard let sdk = sdk, let ble = ble, ble.isActivityPeripheral() else {
            call.reject("Not connected to a V5 band")
            return
        }

        syncCall = call
        syncResult = [:]
        sleepNights = [:]
        sleepNightOrder = []
        sleepPages = []
        rawHRValues = []
        allSDKHRValues = []
        rawHRReadingsWithHour = []
        rawHRVReadings = []
        deepSleepMinutesByHour = [:]
        rawDetailActivitySteps = 0
        rawDetailActivityCalories = 0
        rawDetailActivityDistance = 0
        rawDetailActivityCount = 0
        isSyncing = true
        pendingDataTypes = [28, 41, 27, 45, 48, 25] // HR, HRV, Sleep, SpO2, Temp, TotalActivity

        NSLog("[V5BandPlugin] Starting health data sync (fire-and-route)...")

        // Overall sync timeout — 65 seconds for all data types (7 cmds × 2s spacing + response time)
        DispatchQueue.main.async { [weak self] in
            self?.syncTimer?.invalidate()
            self?.syncTimer = Timer.scheduledTimer(withTimeInterval: 65.0, repeats: false) { _ in
                NSLog("[V5BandPlugin] Overall sync timed out. Finishing with what we have.")
                self?.finishSync()
            }
        }

        guard let peripheral = ble.activityPeripheral else {
            finishSync()
            return
        }

        // Send all 7 commands with 2-second delays between them.
        // Order: DetailActivity FIRST (sent early so 0x52 BLE packets have maximum time
        // to arrive before finishSync), then lightweight queries, HR last (largest/most paginated).
        // 2s spacing gives the band time to finish each response before the next query.
        //
        // DetailActivity triggers 0x52 BLE packets (raw-parsed in onDataReceived).
        // Type 26 is NOT in pendingDataTypes — the SDK never fires dataEnd for it, so we don't
        // wait for it. The 0x52 parser accumulates steps/cal/dist and finishSync() applies them.
        // Query starts from startOfToday — we only want today's activity, and this avoids
        // BCD date-matching issues with yesterday's leftover data.
        let commands: [(String, NSMutableData?)] = [
            ("DetailActivity",   sdk.getDetailActivityData(withMode: Int32(0), withStart: startOfToday)),
            ("TotalActivity",    sdk.getTotalActivityData(withMode: Int32(0), withStart: startOfToday)),
            ("HRV",   sdk.getHRVData(withMode: Int32(0), withStart: overnightQueryStart)),
            ("SpO2",  sdk.getAutomaticSpo2Data(withMode: Int32(0), withStart: overnightQueryStart)),
            ("Temp",  sdk.getTemperatureData(withMode: Int32(0), withStart: overnightQueryStart)),
            ("Sleep", sdk.getDetailSleepData(withMode: Int32(0), withStart: overnightQueryStart)),
            ("HR",    sdk.getContinuousHRData(withMode: Int32(0), withStart: overnightQueryStart)),
        ]

        for (i, (label, cmdData)) in commands.enumerated() {
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(i) * 2.0) { [weak self] in
                guard let self = self, self.isSyncing, let data = cmdData else { return }
                NSLog("[V5BandPlugin] Sending \(label) query (\(i + 1)/\(commands.count))...")
                ble.writeValue("FFF0", characteristicUUID: "FFF6", p: peripheral, data: data as Data)
            }
        }
    }

    /// Route a complete response to the correct parser based on dataType
    private func routeCompletedData(_ deviceData: DeviceData_J2301A) {
        let typeRaw = deviceData.dataType.rawValue
        NSLog("[V5BandPlugin] Completed data type: \(typeRaw), has dicData: \(deviceData.dicData != nil ? "yes" : "no")")

        guard let dic = deviceData.dicData else {
            NSLog("[V5BandPlugin] No dicData for type \(typeRaw)")
            pendingDataTypes.remove(Int(typeRaw))
            checkSyncComplete()
            return
        }

        switch Int(typeRaw) {
        case 28: // DynamicHR
            parseContinuousHR(dic)
            pendingDataTypes.remove(28)
        case 41: // HRV
            parseHRV(dic)
            pendingDataTypes.remove(41)
        case 27: // DetailSleep
            parseSleep(dic)
            pendingDataTypes.remove(27)
        case 45: // SpO2
            parseSpO2(dic)
            pendingDataTypes.remove(45)
        case 48: // Temperature
            parseTemperature(dic)
            pendingDataTypes.remove(48)
        case 25: // TotalActivity
            parseActivity(dic)
            pendingDataTypes.remove(25)
        case 26: // DetailActivity — per-interval granular data
            parseDetailActivity(dic)
            pendingDataTypes.remove(26)
        case 9: // Battery response — may arrive during sync from prior getBatteryLevel call
            NSLog("[V5BandPlugin] Battery response arrived during sync — ignoring")
        default:
            NSLog("[V5BandPlugin] Unknown data type \(typeRaw) — ignoring")
        }

        checkSyncComplete()
    }

    private func checkSyncComplete() {
        if pendingDataTypes.isEmpty {
            NSLog("[V5BandPlugin] All data types received!")
            finishSync()
        } else {
            NSLog("[V5BandPlugin] Still waiting for types: \(pendingDataTypes.map { String($0) }.joined(separator: ", "))")
        }
    }

    // ── Parsers (now take dicData directly) ──

    /// Raw HR values accumulated from BLE packets (0x54 data type).
    /// Each byte (after 9-byte header) is a heart rate reading.
    private var rawHRValues: [UInt8] = []
    /// All valid HR values from SDK array (accumulated during parseContinuousHR)
    private var allSDKHRValues: [Int] = []
    /// HR readings with hour-level timestamps from raw BLE packets (0x54).
    /// Each entry is (dateKey: String "YYMMDD", hour: Int, hr: Int). Used to filter HR to sleep hours for RHR.
    private var rawHRReadingsWithHour: [(dateKey: String, hour: Int, hr: Int)] = []

    /// Raw HRV readings parsed from BLE packets (0x56 data type).
    /// The SDK's dataParsing collapses all HRV data into 1 arrayHrvData entry,
    /// but the raw BLE packets contain hourly readings with timestamps.
    /// Each entry is (dateKey: String "YYMMDD", hour: Int, hrv: Int, stress: Int).
    private var rawHRVReadings: [(dateKey: String, hour: Int, hrv: Int, stress: Int)] = []

    /// Deep sleep minutes per clock hour, from the most recent night's sleep stages.
    /// Populated during sleep packet accumulation (0x53).
    /// Key = clock hour (0-23), value = number of deep-sleep minutes in that hour.
    /// Used by finishSync to compute WHOOP-style deep-sleep HRV.
    private var deepSleepMinutesByHour: [Int: Int] = [:]

    /// Raw DetailActivity (0x52) accumulators — parsed directly from BLE packets
    /// because the SDK's dataParsing never fires dataEnd for type 26.
    private var rawDetailActivitySteps: Int = 0
    private var rawDetailActivityCalories: Int = 0
    private var rawDetailActivityDistance: Int = 0
    private var rawDetailActivityCount: Int = 0

    private func parseContinuousHR(_ dic: [AnyHashable: Any]) {
        // Try SDK-parsed array first (multiple possible key names)
        // NOTE: RHR calculation is deferred to finishSync() where sleep data is also available
        // for WHOOP-style deep-sleep proxy calculation.
        let hrArray: [[String: Any]]? =
            dic["arrayHR"] as? [[String: Any]] ??
            dic["arrayDynamicHRData"] as? [[String: Any]] ??
            dic["arrayContinuousHRData"] as? [[String: Any]]

        if let hrArray = hrArray, !hrArray.isEmpty {
            var latestHR = 0
            for entry in hrArray {
                if let hr = entry["heartRate"] as? Int, hr > 0 {
                    allSDKHRValues.append(hr)
                    latestHR = hr
                }
            }
            if latestHR > 0 { syncResult["latest_heart_rate"] = latestHR }
            NSLog("[V5BandPlugin] HR (SDK array): \(allSDKHRValues.count) values accumulated, latest=\(latestHR) — RHR deferred to finishSync")
        } else {
            // Fallback: will use raw accumulated HR bytes in finishSync
            let validCount = rawHRValues.filter { $0 > 30 && $0 < 220 }.count
            NSLog("[V5BandPlugin] HR SDK array not found (keys: \(Array(dic.keys))). Raw HR bytes: \(validCount) valid of \(rawHRValues.count) total — RHR deferred to finishSync")
            if let lastValid = rawHRValues.last(where: { $0 > 30 && $0 < 220 }) {
                syncResult["latest_heart_rate"] = Int(lastValid)
            }
        }
    }

    /// Compute RHR using deep-sleep proportional sampling (WHOOP-style proxy).
    /// Takes the lowest N% of HR readings where N = deep sleep proportion of total sleep.
    /// This approximates "HR during deep sleep" without per-reading timestamps.
    /// Fallback: if no sleep data, uses standard 5th percentile.
    /// Compute RHR from a pool of HR readings (already filtered to deep-sleep hours).
    /// WHOOP measures the HR nadir during slow-wave sleep — the lowest sustained HR.
    /// We use a fixed 30-reading nadir window (≈2 min at 1 reading per 4 sec) rather
    /// than a percentage, because percentages scale with pool size and dilute the nadir.
    private func computeRHR(from values: [Int]) -> Int? {
        let valid = values.filter { $0 > 30 && $0 < 220 }
        guard !valid.isEmpty else { return nil }

        let sorted = valid.sorted()

        // WHOOP-aligned: use the average of the lower half of deep-sleep HR readings.
        // This approximates WHOOP's "average HR during slow-wave sleep" rather than
        // the absolute nadir. The nadir (lowest 30) produces values ~10-15 bpm below
        // what WHOOP reports because it captures momentary HR dips, not sustained RHR.
        // Lower-half average: filters out light-sleep/REM HR elevation while avoiding
        // transient dips that don't represent true resting rate.
        let lowerHalfCount = max(1, sorted.count / 2)
        let lowerHalf = Array(sorted.prefix(lowerHalfCount))
        let avg = lowerHalf.reduce(0, +) / lowerHalf.count

        NSLog("[V5BandPlugin] RHR calc: \(valid.count) valid HR values, lower-half avg (\(lowerHalfCount) values) = \(avg), median=\(sorted[sorted.count / 2]), absolute min=\(sorted.first ?? 0)")
        return avg
    }

    private func parseHRV(_ dic: [AnyHashable: Any]) {
        // The SDK's dataParsing collapses all HRV data into 1 arrayHrvData entry.
        // We prefer raw BLE packet parsing (rawHRVReadings) which captures all hourly readings.
        // Final HRV computation is deferred to finishSync() where sleep stage data is also
        // available for WHOOP-style deep-sleep filtering.

        // Log what the SDK gave us for diagnostics
        if let hrvArray = dic["arrayHrvData"] as? [[String: Any]] {
            NSLog("[V5BandPlugin] HRV SDK array count: \(hrvArray.count) (raw BLE readings: \(rawHRVReadings.count))")

            // If raw BLE readings are empty, extract from SDK as fallback
            if rawHRVReadings.isEmpty {
                for entry in hrvArray {
                    if let hrv = entry["hrv"] as? Int, hrv > 0 {
                        let stress = entry["stressLevel"] as? Int ?? 0
                        rawHRVReadings.append((dateKey: "unknown", hour: -1, hrv: hrv, stress: stress))
                    }
                }
                NSLog("[V5BandPlugin] HRV: extracted \(rawHRVReadings.count) readings from SDK fallback")
            }
        } else {
            NSLog("[V5BandPlugin] HRV SDK array empty/missing. Raw BLE readings: \(rawHRVReadings.count). SDK keys: \(Array(dic.keys))")
        }

        // Log all readings for diagnostics (final computation in finishSync)
        if !rawHRVReadings.isEmpty {
            let readingLog = rawHRVReadings.map { "h\($0.hour)=\($0.hrv)ms" }.joined(separator: ", ")
            NSLog("[V5BandPlugin] HRV readings by hour: \(readingLog)")
            NSLog("[V5BandPlugin] HRV computation deferred to finishSync (needs sleep data for deep-sleep filtering)")
        }
    }

    /// Raw sleep data grouped by night. Key = "YY-MM-DD", value = accumulated stage bytes.
    /// We track dates from the BLE packet headers to separate nights.
    private var sleepNights: [String: [UInt8]] = [:]
    /// Track order of nights so we can pick the most recent
    private var sleepNightOrder: [String] = []
    /// Sleep pages with start-hour info for deep-sleep-hour mapping.
    /// Each entry: (nightKey, startHour, minuteOffset from byte[7], stageBytes).
    private var sleepPages: [(nightKey: String, startHour: Int, startMinute: Int, stages: [UInt8])] = []

    private func parseSleep(_ dic: [AnyHashable: Any]) {
        NSLog("[V5BandPlugin] Raw sleep dictionary keys: \(Array(dic.keys))")

        // The SDK's arrayDetailSleepData is often empty for this band model.
        // We parse raw sleep stage bytes ourselves (accumulated in sleepNights).
        // Each byte represents 1 minute: 0=none, 1=deep, 2=light, 3=REM, 5=awake

        NSLog("[V5BandPlugin] Sleep nights found: \(sleepNightOrder) (\(sleepNights.count) total)")

        // Use only the MOST RECENT night's data.
        // Sort by date descending (nightKey format "YY-MM-DD" sorts correctly).
        // BLE packets may arrive in any order, so we can't rely on insertion order.
        let sortedNights = sleepNightOrder.sorted { $0 > $1 }
        guard let mostRecentNight = sortedNights.first,
              let nightStages = sleepNights[mostRecentNight] else {
            NSLog("[V5BandPlugin] No sleep night data found")
            return
        }

        NSLog("[V5BandPlugin] Using most recent night: \(mostRecentNight) (\(nightStages.count) raw bytes)")

        // Filter out 0x00 (no data / padding)
        let stages = nightStages.filter { $0 != 0 }
        NSLog("[V5BandPlugin] Raw sleep stages: \(stages.count) minutes of data (night \(mostRecentNight))")

        if stages.isEmpty {
            NSLog("[V5BandPlugin] No sleep stage data found")
            return
        }

        var deepMinutes = 0
        var lightMinutes = 0
        var remMinutes = 0
        var awakeMinutes = 0

        for stage in stages {
            switch stage {
            case 1: deepMinutes += 1
            case 2: lightMinutes += 1
            case 3: remMinutes += 1
            case 5: awakeMinutes += 1
            default: break
            }
        }

        let totalMinutes = deepMinutes + lightMinutes + remMinutes + awakeMinutes
        let actualSleepMinutes = deepMinutes + lightMinutes + remMinutes
        // Report total time in bed (including awake epochs) as sleep_hours.
        // This aligns with WHOOP which reports total sleep duration including
        // brief awakenings. The V5 band's "awake" minutes are still in-bed time
        // (brief arousals, not "got out of bed"), so they should count toward
        // the headline sleep duration for accurate WHOOP comparison.
        let totalSleepHours = Double(totalMinutes) / 60.0
        let actualSleepHours = Double(actualSleepMinutes) / 60.0

        syncResult["sleep_hours"] = round(totalSleepHours * 10) / 10
        syncResult["sleep_deep_minutes"] = deepMinutes
        syncResult["sleep_light_minutes"] = lightMinutes
        syncResult["sleep_rem_minutes"] = remMinutes
        syncResult["sleep_awake_minutes"] = awakeMinutes

        let sleepEfficiency = totalMinutes > 0 ? Double(actualSleepMinutes) / Double(totalMinutes) : 0
        let durationScore = min(actualSleepHours / 8.0, 1.0) * 50
        let qualityScore = sleepEfficiency * 30
        let deepScore = actualSleepMinutes > 0 ? min(Double(deepMinutes) / Double(actualSleepMinutes) / 0.25, 1.0) * 20 : 0
        let sleepScore = min(durationScore + qualityScore + deepScore, 100)
        syncResult["sleep_score"] = round(sleepScore)

        NSLog("[V5BandPlugin] Sleep: total=\(String(format: "%.1f", totalSleepHours))h (actual sleep=\(String(format: "%.1f", actualSleepHours))h, awake=\(awakeMinutes)min), deep=\(deepMinutes)min, light=\(lightMinutes)min, REM=\(remMinutes)min, score=\(Int(sleepScore))")

        // ── Build deep-sleep-by-hour map for WHOOP-style HRV filtering ──
        // Use sleepPages to determine which clock hours had deep sleep.
        // Each page has a startHour and 120 stage bytes (each = 1 minute).
        // Minute N of a page corresponds to clock hour = (startHour + N/60) % 24.
        let nightPages = sleepPages.filter { $0.nightKey == mostRecentNight }

        deepSleepMinutesByHour = [:]
        for page in nightPages {
            for (minuteIdx, stage) in page.stages.enumerated() {
                if stage == 1 { // 1 = deep sleep
                    let clockHour = (page.startHour + (page.startMinute + minuteIdx) / 60) % 24
                    deepSleepMinutesByHour[clockHour, default: 0] += 1
                }
            }
        }

        let deepHoursSorted = deepSleepMinutesByHour.sorted { $0.key < $1.key }
        let deepHoursLog = deepHoursSorted.map { "h\($0.key)=\($0.value)min" }.joined(separator: ", ")
        NSLog("[V5BandPlugin] Deep sleep by hour: \(deepHoursLog) (total: \(deepSleepMinutesByHour.values.reduce(0, +)) min)")
    }

    private func parseSpO2(_ dic: [AnyHashable: Any]) {
        // SDK key is "arrayAutomaticSpo2Data" (not "arraySpo2")
        if let spo2Array = dic["arrayAutomaticSpo2Data"] as? [[String: Any]], let latest = spo2Array.last {
            NSLog("[V5BandPlugin] SpO2 entry: \(latest)")
            // The SDK nests the value under "automaticSpo2Data" (not "spo2")
            let spo2Value: Int? =
                latest["spo2"] as? Int ??
                latest["automaticSpo2Data"] as? Int ??
                latest["spO2"] as? Int
            if let spo2 = spo2Value, spo2 > 0 && spo2 <= 100 {
                syncResult["spo2"] = spo2
                NSLog("[V5BandPlugin] SpO2: \(spo2)%%")
            } else {
                NSLog("[V5BandPlugin] SpO2 entry has no valid spo2 value. Entry: \(latest)")
            }
        } else {
            NSLog("[V5BandPlugin] SpO2 dicData has no arrayAutomaticSpo2Data. Keys: \(Array(dic.keys))")
        }
    }

    private func parseTemperature(_ dic: [AnyHashable: Any]) {
        // V5 band measures wrist/skin surface temperature (~30-36°C), NOT core body temperature.
        // WHOOP-style: We sync the raw skin temp and display it as a DELTA from personal baseline
        // (e.g., "-0.7°F") rather than an absolute value. Deviations signal illness/overtraining.
        let tempArray: [[String: Any]]? =
            dic["arrayemperatureData"] as? [[String: Any]] ??
            dic["arrayTemperatureData"] as? [[String: Any]] ??
            dic["arrayTemperature"] as? [[String: Any]]

        if let tempArray = tempArray, !tempArray.isEmpty {
            // Average all temperature entries (not just first) for a more stable reading
            var celsiusValues: [Double] = []
            for entry in tempArray {
                if let c = extractTemperature(from: entry) {
                    celsiusValues.append(c)
                }
            }

            if !celsiusValues.isEmpty {
                let avgCelsius = celsiusValues.reduce(0, +) / Double(celsiusValues.count)
                let fahrenheit = round((avgCelsius * 9.0 / 5.0 + 32.0) * 10) / 10 // Round to 1 decimal
                syncResult["skin_temperature_f"] = fahrenheit
                NSLog("[V5BandPlugin] Temp: wrist skin avg = \(String(format: "%.1f", avgCelsius))°C / \(String(format: "%.1f", fahrenheit))°F (\(celsiusValues.count) of \(tempArray.count) entries) — synced for baseline delta")
            } else {
                NSLog("[V5BandPlugin] Temp: \(tempArray.count) entries but no valid temperatures extracted")
            }
        } else {
            NSLog("[V5BandPlugin] Temp: no data (keys: \(Array(dic.keys)))")
        }
    }

    /// Extract a Celsius temperature from an SDK temperature entry dictionary.
    /// Handles various SDK value formats: raw Int (÷10), Double, and different key names.
    private func extractTemperature(from entry: [String: Any]) -> Double? {
        // Try "temperature" key
        if let tempDouble = entry["temperature"] as? Double, tempDouble > 0 {
            if tempDouble > 100 {
                return tempDouble / 10.0 // e.g., 365 → 36.5°C
            } else if tempDouble > 20 && tempDouble < 45 {
                return tempDouble // e.g., 36.5°C directly
            }
        } else if let tempInt = entry["temperature"] as? Int, tempInt > 0 {
            if tempInt > 100 {
                return Double(tempInt) / 10.0 // e.g., 365 → 36.5°C
            } else if tempInt > 20 && tempInt < 45 {
                return Double(tempInt) // e.g., 36 → 36.0°C
            }
        }

        // Try alternate key names
        if let t = entry["temperatureData"] as? Double, t > 20 { return t }
        if let t = entry["temperatureData"] as? Int, t > 200 { return Double(t) / 10.0 }
        if let t = entry["bodyTemperature"] as? Double, t > 20 { return t }

        return nil
    }

    private func parseActivity(_ dic: [AnyHashable: Any]) {
        // SDK key is "arrayTotalActivityData" (not "arrayActivity")
        // Sum ALL entries — the array may contain multiple hourly intervals,
        // and taking only .last would miss most of the day's steps.
        if let actArray = dic["arrayTotalActivityData"] as? [[String: Any]], !actArray.isEmpty {
            NSLog("[V5BandPlugin] Activity array count: \(actArray.count)")

            var totalSteps = 0
            var totalCalories = 0.0
            var totalDistance = 0.0

            for (i, entry) in actArray.enumerated() {
                let s = entry["step"] as? Int ?? 0
                let c = entry["calories"] as? Double ?? 0
                let d = entry["distance"] as? Double ?? 0
                totalSteps += s
                totalCalories += c
                totalDistance += d
                NSLog("[V5BandPlugin] Activity[\(i)]: steps=\(s), cal=\(c), dist=\(d)")
            }

            if totalSteps > 0 { syncResult["step_count"] = totalSteps }
            if totalCalories > 0 { syncResult["active_energy"] = Int(totalCalories) }
            if totalDistance > 0 { syncResult["distance_meters"] = Int(totalDistance * 1000) } // km → meters

            NSLog("[V5BandPlugin] Activity TOTAL: steps=\(totalSteps), cal=\(Int(totalCalories)), dist=\(Int(totalDistance * 1000))m")
        } else {
            NSLog("[V5BandPlugin] Activity dicData has no arrayTotalActivityData. Keys: \(Array(dic.keys))")
        }
    }

    /// Parse DetailActivityData (type 26) — per-interval granular step/calorie data.
    /// The SDK key is "arrayDetailActivityData". Each entry is a time interval
    /// (typically 5-15 min). We sum all intervals for a full-day total.
    /// If the detail total exceeds the TotalActivity value, we override — this
    /// fixes undercounting from TotalActivity returning a single partial bucket.
    private func parseDetailActivity(_ dic: [AnyHashable: Any]) {
        // Try the SDK's standard key first
        let keyOptions = ["arrayDetailActivityData", "arrayDetailActivity"]
        var detailArray: [[String: Any]]? = nil
        for key in keyOptions {
            if let arr = dic[key] as? [[String: Any]], !arr.isEmpty {
                detailArray = arr
                break
            }
        }

        guard let entries = detailArray else {
            NSLog("[V5BandPlugin] DetailActivity: no data found. Keys: \(Array(dic.keys))")
            return
        }

        NSLog("[V5BandPlugin] DetailActivity array count: \(entries.count)")

        var totalSteps = 0
        var totalCalories = 0.0
        var totalDistance = 0.0

        for (i, entry) in entries.enumerated() {
            // Detail entries may use "step"/"steps", "calories"/"calorie", "distance"
            let s = (entry["step"] as? Int) ?? (entry["steps"] as? Int) ?? 0
            let c = (entry["calories"] as? Double) ?? (entry["calorie"] as? Double) ?? 0
            let d = (entry["distance"] as? Double) ?? 0
            totalSteps += s
            totalCalories += c
            totalDistance += d
            if i < 5 || i == entries.count - 1 {
                NSLog("[V5BandPlugin] DetailActivity[\(i)]: steps=\(s), cal=\(c), dist=\(d)")
            }
        }
        if entries.count > 6 {
            NSLog("[V5BandPlugin] DetailActivity: ... (\(entries.count - 6) more entries omitted)")
        }

        NSLog("[V5BandPlugin] DetailActivity TOTAL: steps=\(totalSteps), cal=\(Int(totalCalories)), dist=\(Int(totalDistance * 1000))m")

        // Override TotalActivity values if Detail total is higher
        // (TotalActivity often returns a single under-counted bucket)
        let existingSteps = syncResult["step_count"] as? Int ?? 0
        if totalSteps > existingSteps {
            NSLog("[V5BandPlugin] DetailActivity steps (\(totalSteps)) > TotalActivity steps (\(existingSteps)) — using detail total")
            syncResult["step_count"] = totalSteps
        }
        let existingCal = syncResult["active_energy"] as? Int ?? 0
        if Int(totalCalories) > existingCal {
            syncResult["active_energy"] = Int(totalCalories)
        }
        let existingDist = syncResult["distance_meters"] as? Int ?? 0
        if Int(totalDistance * 1000) > existingDist {
            syncResult["distance_meters"] = Int(totalDistance * 1000)
        }
    }

    private func finishSync() {
        guard isSyncing else { return } // Prevent double-finish
        isSyncing = false

        DispatchQueue.main.async { [weak self] in
            self?.syncTimer?.invalidate()
            self?.syncTimer = nil
        }

        // Apply raw DetailActivity data if accumulated from 0x52 BLE packets.
        // The end marker may or may not have arrived; use whatever we accumulated.
        if rawDetailActivityCount > 0 {
            NSLog("[V5BandPlugin] finishSync: applying raw DetailActivity — \(rawDetailActivityCount) intervals, steps=\(rawDetailActivitySteps), cal=\(rawDetailActivityCalories), dist=\(rawDetailActivityDistance)m")
            let existingSteps = syncResult["step_count"] as? Int ?? 0
            if rawDetailActivitySteps > existingSteps {
                syncResult["step_count"] = rawDetailActivitySteps
            }
            let existingCal = syncResult["active_energy"] as? Int ?? 0
            if rawDetailActivityCalories > existingCal {
                syncResult["active_energy"] = rawDetailActivityCalories
            }
            let existingDist = syncResult["distance_meters"] as? Int ?? 0
            if rawDetailActivityDistance > existingDist {
                syncResult["distance_meters"] = rawDetailActivityDistance
            }
        }

        // If sleep data never completed via SDK routing, try raw stages
        // (must happen before RHR calc since we need sleep data for deep-sleep proxy)
        let totalSleepStages = sleepNights.values.reduce(0) { $0 + $1.count }
        if pendingDataTypes.contains(27) && totalSleepStages > 0 {
            NSLog("[V5BandPlugin] Sleep never completed via SDK — parsing \(totalSleepStages) raw stages from \(sleepNights.count) nights")
            parseSleep([:]) // Will use sleepNights
            pendingDataTypes.remove(27)
        }

        // If HRV data never completed via SDK routing, use raw BLE readings
        if pendingDataTypes.contains(41) && !rawHRVReadings.isEmpty {
            NSLog("[V5BandPlugin] HRV never completed via SDK — using \(rawHRVReadings.count) raw BLE readings")
            parseHRV([:]) // Will use rawHRVReadings
            pendingDataTypes.remove(41)
        }

        // If HR data never completed via SDK routing, convert raw bytes to int array
        if pendingDataTypes.contains(28) && !rawHRValues.isEmpty {
            NSLog("[V5BandPlugin] HR never completed via SDK — converting \(rawHRValues.count) raw bytes")
            let converted = rawHRValues.filter { $0 > 30 && $0 < 220 }.map { Int($0) }
            allSDKHRValues.append(contentsOf: converted)
            if let lastValid = rawHRValues.last(where: { $0 > 30 && $0 < 220 }) {
                syncResult["latest_heart_rate"] = Int(lastValid)
            }
            pendingDataTypes.remove(28)
        }

        // ── WHOOP-style HRV: Last SWS (slow-wave sleep) epoch ──
        // WHOOP computes HRV (rMSSD) during the LAST slow-wave sleep epoch, not all deep sleep.
        // This gives a lower, more accurate reading because HRV trends lower in later sleep cycles.
        // We approximate by taking HRV readings from the LAST 1-2 hours that had significant
        // deep sleep (≥10 min), rather than averaging across all deep-sleep hours.
        if !rawHRVReadings.isEmpty {
            // Filter to most recent night's readings only (data spans multiple nights)
            // The first dateKey in the array is the most recent date. The overnight sleep
            // spans 2 calendar dates (e.g., bed at 23:00 on 2/19, wake at 8:00 on 2/20).
            // Keep the 2 most recent dates to cover the full overnight period.
            let uniqueDates = Array(NSOrderedSet(array: rawHRVReadings.map { $0.dateKey })) as! [String]
            let recentDates = Set(uniqueDates.prefix(2))
            let recentHRVReadings = rawHRVReadings.filter { recentDates.contains($0.dateKey) }
            NSLog("[V5BandPlugin] HRV: \(rawHRVReadings.count) total readings across \(uniqueDates.count) dates, filtered to \(recentHRVReadings.count) from recent dates \(recentDates)")

            let allHRVs = recentHRVReadings.map { $0.hrv }
            let allStress = recentHRVReadings.map { $0.stress }.filter { $0 > 0 }

            // Find hours with significant deep sleep (≥10 min), sorted chronologically
            // Handle midnight crossing: sort so overnight hours are in order
            let deepHours = deepSleepMinutesByHour
                .filter { $0.value >= 10 }
                .map { $0.key }

            // Sort hours accounting for midnight crossing (e.g., 22,23,0,1,2,3,4,5,6)
            let sortedDeepHours: [Int]
            if let minH = deepHours.min(), let maxH = deepHours.max(), maxH - minH > 12 {
                // Midnight crossing: hours >= 12 come first, then hours < 12
                sortedDeepHours = deepHours.sorted { a, b in
                    let aAdj = a < 12 ? a + 24 : a
                    let bAdj = b < 12 ? b + 24 : b
                    return aAdj < bAdj
                }
            } else {
                sortedDeepHours = deepHours.sorted()
            }

            // Take LAST 2 deep-sleep hours (the final SWS epoch)
            let lastSWSHours = Set(sortedDeepHours.suffix(2))
            let lastSWSHRVs = recentHRVReadings.filter { reading in
                reading.hour >= 0 && lastSWSHours.contains(reading.hour)
            }.map { $0.hrv }

            // All deep-sleep hours HRVs (broader fallback)
            let allDeepSleepHRVs = recentHRVReadings.filter { reading in
                reading.hour >= 0 && (deepSleepMinutesByHour[reading.hour] ?? 0) >= 10
            }.map { $0.hrv }

            // Sleep-period HRVs (broadest fallback)
            let allSleepHours = Set(deepSleepMinutesByHour.keys)
            let sleepHourRange: Set<Int>
            if let minSleepHour = allSleepHours.min(), let maxSleepHour = allSleepHours.max() {
                if maxSleepHour - minSleepHour > 12 {
                    sleepHourRange = Set((0...maxSleepHour).map { $0 } + (minSleepHour...23).map { $0 })
                } else {
                    sleepHourRange = Set((minSleepHour...maxSleepHour).map { $0 })
                }
            } else {
                sleepHourRange = Set<Int>()
            }
            let sleepPeriodHRVs = recentHRVReadings.filter { reading in
                reading.hour >= 0 && sleepHourRange.contains(reading.hour)
            }.map { $0.hrv }

            // Priority: last SWS epoch > all deep-sleep hours > sleep-period > all
            let chosenHRVs: [Int]
            let hrvSource: String
            if lastSWSHRVs.count >= 2 {
                chosenHRVs = lastSWSHRVs
                hrvSource = "last SWS epoch (hours \(lastSWSHours.sorted()))"
            } else if allDeepSleepHRVs.count >= 3 {
                chosenHRVs = allDeepSleepHRVs
                hrvSource = "all deep-sleep hours"
            } else if sleepPeriodHRVs.count >= 3 {
                chosenHRVs = sleepPeriodHRVs
                hrvSource = "sleep-period hours"
            } else {
                chosenHRVs = allHRVs
                hrvSource = "all hours (no sleep filter)"
            }

            // WHOOP uses average rMSSD during SWS
            let avgHRV = chosenHRVs.reduce(0, +) / chosenHRVs.count
            let minHRV = chosenHRVs.min() ?? 0
            let maxHRV = chosenHRVs.max() ?? 0
            syncResult["hrv"] = avgHRV

            NSLog("[V5BandPlugin] HRV (WHOOP-style, \(hrvSource)): avg=\(avgHRV) ms (\(chosenHRVs.count) readings, min=\(minHRV), max=\(maxHRV))")
            NSLog("[V5BandPlugin] HRV breakdown: lastSWS=\(lastSWSHRVs.count) readings, allDeepSleep=\(allDeepSleepHRVs.count), sleepPeriod=\(sleepPeriodHRVs.count), total=\(allHRVs.count)")
            NSLog("[V5BandPlugin] Deep sleep hours: \(sortedDeepHours.map { "h\($0)=\(deepSleepMinutesByHour[$0] ?? 0)min" }.joined(separator: ", ")), last SWS: \(lastSWSHours.sorted())")

            // Stress: average of all valid readings
            if !allStress.isEmpty {
                let avgStress = allStress.reduce(0, +) / allStress.count
                syncResult["stress_level"] = avgStress
                NSLog("[V5BandPlugin] Stress avg: \(avgStress) (from \(allStress.count) readings)")
            }

            // ── Respiratory rate estimated from sleep HRV via RSA ──
            // Breathing modulates HR via respiratory sinus arrhythmia (RSA).
            // Higher HRV during sleep = slower, more relaxed breathing.
            // Linear approximation validated against WHOOP/Oura ranges:
            //   rMSSD 20-30ms → ~16-18 bpm, 50-80ms → ~12-14 bpm, 80-120ms → ~10-13 bpm
            let estimatedRespRate = max(10.0, min(22.0, 21.0 - Double(avgHRV) * 0.08))
            syncResult["respiratory_rate"] = round(estimatedRespRate * 10) / 10
            NSLog("[V5BandPlugin] Respiratory rate estimated from HRV \(avgHRV)ms: \(round(estimatedRespRate * 10) / 10) bpm")
        } else {
            NSLog("[V5BandPlugin] No HRV data available")
        }

        // ── WHOOP-style RHR: HR during deep-sleep hours only ──
        // WHOOP measures RHR as the nadir HR during slow-wave sleep (SWS).
        // Filter HR readings to ONLY deep-sleep hours (≥10 min deep), then take
        // the lowest 5th percentile. This avoids light/REM sleep HR which runs
        // 10-15 bpm higher and inflates the average.
        if !rawHRReadingsWithHour.isEmpty || !allSDKHRValues.isEmpty {
            // Filter HR to most recent 2 dates (overnight spans 2 calendar dates)
            let hrUniqueDates = Array(NSOrderedSet(array: rawHRReadingsWithHour.map { $0.dateKey })) as! [String]
            let hrRecentDates = Set(hrUniqueDates.prefix(2))
            let recentHRReadings = rawHRReadingsWithHour.filter { hrRecentDates.contains($0.dateKey) }
            NSLog("[V5BandPlugin] RHR: \(rawHRReadingsWithHour.count) total HR readings across \(hrUniqueDates.count) dates, filtered to \(recentHRReadings.count) from recent dates \(hrRecentDates)")

            // Deep-sleep hours only: hours with ≥10 min of deep sleep (same threshold as HRV)
            let deepSleepHours = Set(deepSleepMinutesByHour.filter { $0.value >= 10 }.map { $0.key })
            NSLog("[V5BandPlugin] RHR: deep-sleep hours (≥10 min deep): \(deepSleepHours.sorted()), deepSleepMinutesByHour: \(deepSleepMinutesByHour)")

            // Filter HR to deep-sleep hours only (using most recent night's data)
            var deepSleepHRValues: [Int] = []
            if !recentHRReadings.isEmpty && !deepSleepHours.isEmpty {
                deepSleepHRValues = recentHRReadings
                    .filter { deepSleepHours.contains($0.hour) }
                    .map { $0.hr }
                NSLog("[V5BandPlugin] RHR: filtered \(recentHRReadings.count) recent HR readings to \(deepSleepHRValues.count) in deep-sleep hours \(deepSleepHours.sorted())")
            }

            // Fallback chain: deep-sleep hours → full sleep-period → all hours
            let hrSource: String
            let hrPool: [Int]
            if deepSleepHRValues.count >= 30 {
                hrPool = deepSleepHRValues
                hrSource = "deep-sleep hours"
            } else {
                // Fallback: build full sleep-period range from all deepSleepMinutesByHour keys
                let allSleepHours = Set(deepSleepMinutesByHour.keys)
                var sleepHRValues: [Int] = []
                if !recentHRReadings.isEmpty && !allSleepHours.isEmpty {
                    if let minH = allSleepHours.min(), let maxH = allSleepHours.max() {
                        let sleepHourRange: Set<Int>
                        if maxH - minH > 12 {
                            sleepHourRange = Set((0...maxH).map { $0 } + (minH...23).map { $0 })
                        } else {
                            sleepHourRange = Set((minH...maxH).map { $0 })
                        }
                        sleepHRValues = recentHRReadings
                            .filter { sleepHourRange.contains($0.hour) }
                            .map { $0.hr }
                    }
                }
                if sleepHRValues.count >= 30 {
                    hrPool = sleepHRValues
                    hrSource = "sleep-period hours (fallback, deep-sleep HR count: \(deepSleepHRValues.count))"
                } else {
                    hrPool = allSDKHRValues.isEmpty
                        ? recentHRReadings.map { $0.hr }
                        : allSDKHRValues
                    hrSource = "all hours (insufficient sleep-period HR)"
                }
            }

            let rhr = computeRHR(from: hrPool)
            if let rhr = rhr {
                syncResult["resting_heart_rate"] = rhr
                NSLog("[V5BandPlugin] RHR (\(hrSource)): \(rhr) bpm")
            }
        } else {
            NSLog("[V5BandPlugin] No HR data available for RHR calculation")
        }

        NSLog("[V5BandPlugin] Sync complete. Data keys: \(Array(syncResult.keys))")

        if let call = syncCall {
            syncResult["source"] = "v5-direct"
            syncResult["synced_at"] = ISO8601DateFormatter().string(from: Date())
            call.resolve(syncResult as [String: Any])
            syncCall = nil
        }
    }

    // MARK: - BLE Command Helper (used only for non-sync single commands like battery)

    private let commandTimeout: TimeInterval = 10.0
    private var commandCallback: ((DeviceData_J2301A?) -> Void)?
    private var commandTimer: Timer?

    private func sendCommand(_ cmdData: NSMutableData?, completion: @escaping (DeviceData_J2301A?) -> Void) {
        guard let data = cmdData, let ble = ble, let peripheral = ble.activityPeripheral else {
            completion(nil)
            return
        }

        commandCallback = completion

        DispatchQueue.main.async { [weak self] in
            self?.commandTimer?.invalidate()
            self?.commandTimer = Timer.scheduledTimer(withTimeInterval: self?.commandTimeout ?? 10.0, repeats: false) { _ in
                NSLog("[V5BandPlugin] Command timed out")
                let cb = self?.commandCallback
                self?.commandCallback = nil
                cb?(nil)
            }
        }

        ble.writeValue("FFF0", characteristicUUID: "FFF6", p: peripheral, data: data as Data)
    }

    /// Called by delegate when data is received from the band
    func onDataReceived(data: Data) {
        guard let sdk = sdk else { return }

        // Accumulate raw bytes before SDK parsing for data types where the SDK
        // doesn't properly populate its arrays.
        // BLE notifications may contain multiple concatenated sub-packets.
        // Also handle HR packets during HR-only fetch mode (strain monitoring).
        if (isSyncing || isHRFetching) && data.count >= 2 {
            let cmdByte = data[0]

            // Sleep packets: 0x53 (83).
            // Format: 53 [page] 00 [YY] [MM] [DD] [HH] [MM] [??] [count] [stage bytes...]
            // 10-byte header, then stage bytes. Each stage: 0=none, 1=deep, 2=light, 3=REM, 5=awake
            // End marker: 53 FF (2 bytes)
            // Night boundaries detected by date change in header bytes[3..5] (YY MM DD).
            // bytes[6] = start hour, bytes[7] = start minute of this page's stages.
            if cmdByte == 0x53 {
                if data[1] == 0xFF {
                    // End marker
                    let totalMinutes = sleepNights.values.reduce(0) { $0 + $1.count }
                    NSLog("[V5BandPlugin] Sleep data end marker. \(sleepNights.count) nights, \(totalMinutes) total raw stages, order: \(sleepNightOrder)")
                } else if data.count > 10 {
                    // Extract BCD-encoded date from header: bytes[3]=YY, bytes[4]=MM, bytes[5]=DD
                    // BCD: 0x26 = year 26 (2026), 0x21 = day 21, etc.
                    let yy = Int(data[3] >> 4) * 10 + Int(data[3] & 0x0F)
                    let mm = Int(data[4] >> 4) * 10 + Int(data[4] & 0x0F)
                    let dd = Int(data[5] >> 4) * 10 + Int(data[5] & 0x0F)
                    let nightKey = String(format: "%02d-%02d-%02d", yy, mm, dd)

                    // Track night order (first seen = most recent, since packets arrive newest first)
                    if !sleepNightOrder.contains(nightKey) {
                        sleepNightOrder.append(nightKey)
                        sleepNights[nightKey] = []
                        NSLog("[V5BandPlugin] Sleep: new night detected: \(nightKey)")
                    }

                    // Skip 10-byte header, rest are stage bytes
                    let stageBytes = Array(data[10...])
                    sleepNights[nightKey, default: []].append(contentsOf: stageBytes)

                    // Track page start hour for deep-sleep-hour mapping (BCD-decoded)
                    let startHour = Int(data[6] >> 4) * 10 + Int(data[6] & 0x0F)
                    let startMinute = Int(data[7] >> 4) * 10 + Int(data[7] & 0x0F)
                    sleepPages.append((nightKey: nightKey, startHour: startHour, startMinute: startMinute, stages: stageBytes))
                }
            }

            // HR packets: 0x54 (84).
            // BLE notifications contain multiple 24-byte sub-packets concatenated.
            // Each sub-packet: [type 1B][pageLo 1B][pageHi 1B][YY][MM][DD][HH][MM][??][15 HR values]
            // Byte offsets: 0=type, 1=pageLo, 2=pageHi, 3=YY, 4=MM, 5=DD, 6=HH, 7=MM, 8=??, 9-23=15 HR values
            // HR values are BPM readings (0x00 = no data, 0x3C = 60 BPM, etc.)
            if cmdByte == 0x54 {
                let bytes = Array(data)
                let subPacketSize = 24 // Each HR sub-packet is 24 bytes (9 header + 15 data)
                var offset = 0
                var hitEndMarker = false
                while offset < bytes.count {
                    if bytes[offset] == 0x54 {
                        if offset + 1 < bytes.count && bytes[offset + 1] == 0xFF {
                            NSLog("[V5BandPlugin] HR data end marker. Total raw HR values: \(rawHRValues.count), with-hour: \(rawHRReadingsWithHour.count), hrFetch: \(hrFetchReadings.count)")
                            hitEndMarker = true
                            break
                        }
                        if offset + subPacketSize <= bytes.count {
                            // BCD-decode date bytes
                            let yy = Int(bytes[offset + 3] >> 4) * 10 + Int(bytes[offset + 3] & 0x0F)
                            let mm = Int(bytes[offset + 4] >> 4) * 10 + Int(bytes[offset + 4] & 0x0F)
                            let dd = Int(bytes[offset + 5] >> 4) * 10 + Int(bytes[offset + 5] & 0x0F)
                            let dateKey = String(format: "%02d%02d%02d", yy, mm, dd)
                            let hour = Int(bytes[offset + 6] >> 4) * 10 + Int(bytes[offset + 6] & 0x0F)
                            // Extract 15 HR values from bytes[offset+9] to bytes[offset+23]
                            let hrBytes = Array(bytes[(offset + 9)..<(offset + subPacketSize)])
                            if isSyncing {
                                rawHRValues.append(contentsOf: hrBytes)
                            }
                            // Store with hour + date for sleep-period filtering (sync) and strain (HR fetch)
                            for hrByte in hrBytes {
                                let hr = Int(hrByte)
                                if hr > 30 && hr < 220 {
                                    if isSyncing {
                                        rawHRReadingsWithHour.append((dateKey: dateKey, hour: hour, hr: hr))
                                    }
                                    if isHRFetching {
                                        hrFetchReadings.append((hour: hour, hr: hr))
                                    }
                                }
                            }
                            offset += subPacketSize
                        } else {
                            // Partial sub-packet at end — extract what we can
                            if offset + 9 < bytes.count {
                                let hrBytes = Array(bytes[(offset + 9)...])
                                if isSyncing {
                                    rawHRValues.append(contentsOf: hrBytes)
                                }
                            }
                            break
                        }
                    } else {
                        break // Not an HR packet
                    }
                }
                // If HR fetch mode and we got the end marker, finish the HR fetch
                if isHRFetching && hitEndMarker {
                    finishHRFetch()
                    // If not also syncing, skip SDK parsing for this packet
                    if !isSyncing { return }
                }
            }

            // HRV packets: 0x56 (86).
            // The SDK's dataParsing collapses all HRV data into a single arrayHrvData entry,
            // but the raw BLE packets contain hourly readings spanning the full overnight period.
            // BLE notifications contain multiple 15-byte sub-packets concatenated.
            // Each sub-packet: 56 [pageLo] [pageHi] [YY] [MM] [DD] [HH] [??] [??] [HRV] [??] [??] [stress?] [??] [??]
            // HRV value at byte offset 9, stress at byte offset 12.
            // End marker: 56 FF (2 bytes)
            if cmdByte == 0x56 {
                let bytes = Array(data)
                let subPacketSize = 15
                var offset = 0
                while offset < bytes.count {
                    if bytes[offset] == 0x56 {
                        if offset + 1 < bytes.count && bytes[offset + 1] == 0xFF {
                            NSLog("[V5BandPlugin] HRV data end marker. Total raw HRV readings: \(rawHRVReadings.count)")
                            break
                        }
                        if offset + subPacketSize <= bytes.count {
                            // BCD-decode date bytes
                            let yy = Int(bytes[offset + 3] >> 4) * 10 + Int(bytes[offset + 3] & 0x0F)
                            let mm = Int(bytes[offset + 4] >> 4) * 10 + Int(bytes[offset + 4] & 0x0F)
                            let dd = Int(bytes[offset + 5] >> 4) * 10 + Int(bytes[offset + 5] & 0x0F)
                            let dateKey = String(format: "%02d%02d%02d", yy, mm, dd)
                            let hour = Int(bytes[offset + 6] >> 4) * 10 + Int(bytes[offset + 6] & 0x0F)
                            let hrvVal = Int(bytes[offset + 9])
                            // Byte 12 appears to be stress level based on JCVitalPro comparison
                            let stressVal = Int(bytes[offset + 12])
                            if hrvVal > 0 && hrvVal < 255 {
                                rawHRVReadings.append((dateKey: dateKey, hour: hour, hrv: hrvVal, stress: stressVal))
                            }
                            offset += subPacketSize
                        } else {
                            // Partial sub-packet at end
                            break
                        }
                    } else {
                        break // Not an HRV packet
                    }
                }
            }

            // DetailActivity packets: 0x52 (82).
            // The SDK's dataParsing never fires dataEnd for type 26, so we parse raw.
            // Sub-packet: 25 bytes each (175 bytes per BLE notification / 7 sub-packets).
            // Layout: [52][pageLo][pageHi][YY][MM][DD][HH][MM_start][??]
            //         [stepLo][stepHi][calLo][calHi][distLo][distHi]
            //         [...9 more bytes...]
            // End marker: 52 FF (2 bytes)
            // We log the first 3 packets' raw bytes to verify the byte positions,
            // then accumulate steps from each sub-packet.
            if cmdByte == 0x52 {
                let bytes = Array(data)
                let subPacketSize = 25
                var offset = 0
                while offset < bytes.count {
                    guard bytes[offset] == 0x52 else {
                        offset += 1
                        continue
                    }
                    // End marker check
                    if offset + 1 < bytes.count && bytes[offset + 1] == 0xFF {
                        NSLog("[V5BandPlugin] DetailActivity end marker. \(rawDetailActivityCount) intervals, today-only steps=\(rawDetailActivitySteps), cal=\(rawDetailActivityCalories), dist=\(rawDetailActivityDistance)m")
                        // Override syncResult if raw total > existing
                        let existingSteps = syncResult["step_count"] as? Int ?? 0
                        if rawDetailActivitySteps > existingSteps {
                            syncResult["step_count"] = rawDetailActivitySteps
                            NSLog("[V5BandPlugin] DetailActivity steps (\(rawDetailActivitySteps)) > TotalActivity (\(existingSteps)) — using detail")
                        }
                        let existingCal = syncResult["active_energy"] as? Int ?? 0
                        if rawDetailActivityCalories > existingCal {
                            syncResult["active_energy"] = rawDetailActivityCalories
                        }
                        let existingDist = syncResult["distance_meters"] as? Int ?? 0
                        if rawDetailActivityDistance > existingDist {
                            syncResult["distance_meters"] = rawDetailActivityDistance
                        }
                        break
                    }
                    // Parse sub-packet
                    if offset + subPacketSize <= bytes.count {
                        // Log first 3 packets' full hex for byte-position verification
                        if rawDetailActivityCount < 3 {
                            let packetBytes = bytes[offset..<(offset + subPacketSize)]
                            let hexStr = packetBytes.map { String(format: "%02x", $0) }.joined(separator: " ")
                            NSLog("[V5BandPlugin] DetailActivity[\(rawDetailActivityCount)] raw: \(hexStr)")
                        }
                        // No date filter needed — query already starts from startOfToday,
                        // so all packets are from today. Previous BCD date filter was causing
                        // missed steps when band's internal clock had minor drift.
                        // Steps at bytes 9-10 (little-endian uint16)
                        let stepLo = Int(bytes[offset + 9])
                        let stepHi = Int(bytes[offset + 10])
                        let steps = stepLo | (stepHi << 8)
                        // Calories at bytes 11-12 (little-endian uint16)
                        let calLo = Int(bytes[offset + 11])
                        let calHi = Int(bytes[offset + 12])
                        let calories = calLo | (calHi << 8)
                        // Distance at bytes 13-14 (little-endian uint16, meters)
                        let distLo = Int(bytes[offset + 13])
                        let distHi = Int(bytes[offset + 14])
                        let distance = distLo | (distHi << 8)
                        rawDetailActivitySteps += steps
                        rawDetailActivityCalories += calories
                        rawDetailActivityDistance += distance
                        rawDetailActivityCount += 1
                        offset += subPacketSize
                    } else {
                        // Partial sub-packet at end of notification
                        break
                    }
                }
            }
        }

        let deviceData = sdk.dataParsing(with: data)

        // HR-only fetch mode (not syncing): the raw byte parser above handles accumulation
        // and end marker detection. If HR fetch already finished (via end marker), skip further
        // SDK processing. If SDK says data is complete for type 28, also finish the HR fetch.
        if isHRFetching && !isSyncing {
            if let dd = deviceData, dd.dataEnd && dd.dataType.rawValue == 28 {
                // SDK completed HR data — finish if not already done by end marker
                finishHRFetch()
            }
            // During HR-only fetch, ignore non-HR SDK completions
            return
        }

        // If we're in sync mode, route completed data to parsers by type
        if isSyncing {
            // Still accumulating pages — wait
            if let dd = deviceData, !dd.dataEnd {
                return
            }
            // Complete data arrived — route it
            if let dd = deviceData, dd.dataEnd {
                routeCompletedData(dd)
            }
            // nil deviceData during sync = SDK still accumulating, ignore
            return
        }

        // Non-sync mode: single-command callback pattern (e.g., battery)
        if let dd = deviceData, !dd.dataEnd {
            // Reset timeout for multi-page
            DispatchQueue.main.async { [weak self] in
                self?.commandTimer?.invalidate()
                self?.commandTimer = Timer.scheduledTimer(withTimeInterval: self?.commandTimeout ?? 10.0, repeats: false) { _ in
                    NSLog("[V5BandPlugin] Command timed out waiting for more pages")
                    let cb = self?.commandCallback
                    self?.commandCallback = nil
                    cb?(nil)
                }
            }
            return
        }

        DispatchQueue.main.async { [weak self] in
            self?.commandTimer?.invalidate()
            self?.commandTimer = nil
        }

        let cb = commandCallback
        commandCallback = nil
        cb?(deviceData)
    }
}

// MARK: - BLE Delegate

/// Objective-C delegate bridge for NewBle events → Swift plugin
///
/// Method names must exactly match the ObjC selectors in NewBle.h:
///   ConnectSuccessfully, Disconnect:, scanWithPeripheral:advertisementData:RSSI:,
///   ConnectFailedWithError:, EnableCommunicate, BleCommunicateWithPeripheral:data:
class V5BleDelegate: NSObject, MyBleDelegate {
    weak var plugin: V5BandPlugin?

    init(plugin: V5BandPlugin) {
        self.plugin = plugin
        super.init()
    }

    @objc(ConnectSuccessfully)
    func connectSuccessfully() {
        plugin?.onConnected()
    }

    @objc(EnableCommunicate)
    func enableCommunicate() {
        plugin?.onCommunicationEnabled()
    }

    @objc(Disconnect:)
    func disconnect(_ error: Error?) {
        plugin?.onDisconnected(error: error)
    }

    @objc(ConnectFailedWithError:)
    func connectFailed(withError error: Error?) {
        plugin?.onConnectFailed(error: error)
    }

    @objc(scanWithPeripheral:advertisementData:RSSI:)
    func scan(withPeripheral peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
        plugin?.onDeviceDiscovered(peripheral: peripheral, rssi: RSSI)
    }

    @objc(BleCommunicateWithPeripheral:data:)
    func bleCommunicate(withPeripheral peripheral: CBPeripheral, data: Data) {
        plugin?.onDataReceived(data: data)
    }
}
