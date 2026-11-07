import Foundation
import Capacitor
import HealthKit

/// Custom Capacitor plugin for reading Apple HealthKit data.
/// Provides methods to check availability, request authorization,
/// and query health samples for the SPAR Nutrition Cut Score system.
@objc(HealthKitPlugin)
public class HealthKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthKitPlugin"
    public let jsName = "HealthKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queryDayData", returnType: CAPPluginReturnPromise),
    ]

    private let healthStore = HKHealthStore()

    // HealthKit data types we read
    private var readTypes: Set<HKObjectType> {
        var types = Set<HKObjectType>()
        if let t = HKQuantityType.quantityType(forIdentifier: .heartRateVariabilitySDNN) { types.insert(t) }
        if let t = HKQuantityType.quantityType(forIdentifier: .restingHeartRate) { types.insert(t) }
        if let t = HKQuantityType.quantityType(forIdentifier: .oxygenSaturation) { types.insert(t) }
        if let t = HKQuantityType.quantityType(forIdentifier: .bodyTemperature) { types.insert(t) }
        if let t = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned) { types.insert(t) }
        if let t = HKQuantityType.quantityType(forIdentifier: .stepCount) { types.insert(t) }
        if let t = HKCategoryType.categoryType(forIdentifier: .sleepAnalysis) { types.insert(t) }
        return types
    }

    // MARK: - isAvailable

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    // MARK: - requestAuthorization

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("HealthKit is not available on this device")
            return
        }

        healthStore.requestAuthorization(toShare: nil, read: readTypes) { success, error in
            if let error = error {
                call.reject("Authorization failed: \(error.localizedDescription)")
                return
            }
            call.resolve(["authorized": success])
        }
    }

    // MARK: - queryDayData

    /// Query all health metrics for a specific date.
    /// Call with { "date": "2025-01-15" } or omit for today.
    @objc func queryDayData(_ call: CAPPluginCall) {
        let dateString = call.getString("date")
        let calendar = Calendar.current

        let targetDate: Date
        if let dateString = dateString,
           let parsed = ISO8601DateFormatter().date(from: dateString + "T00:00:00Z") {
            targetDate = parsed
        } else if let dateString = dateString {
            // Try simple yyyy-MM-dd format
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            formatter.timeZone = TimeZone.current
            targetDate = formatter.date(from: dateString) ?? Date()
        } else {
            targetDate = Date()
        }

        let startOfDay = calendar.startOfDay(for: targetDate)
        let endOfDay = calendar.date(byAdding: .day, value: 1, to: startOfDay)!

        let group = DispatchGroup()
        var result: [String: Any] = [
            "date": formatDate(startOfDay)
        ]

        // HRV (SDNN) - get the most recent sample
        group.enter()
        queryMostRecentQuantity(
            type: .heartRateVariabilitySDNN,
            start: startOfDay,
            end: endOfDay,
            unit: HKUnit.secondUnit(with: .milli)
        ) { value in
            if let value = value { result["hrv"] = value }
            group.leave()
        }

        // Resting Heart Rate
        group.enter()
        queryMostRecentQuantity(
            type: .restingHeartRate,
            start: startOfDay,
            end: endOfDay,
            unit: HKUnit.count().unitDivided(by: .minute())
        ) { value in
            if let value = value { result["restingHeartRate"] = value }
            group.leave()
        }

        // SpO2
        group.enter()
        queryMostRecentQuantity(
            type: .oxygenSaturation,
            start: startOfDay,
            end: endOfDay,
            unit: HKUnit.percent()
        ) { value in
            // HealthKit returns SpO2 as 0-1 fraction, convert to 0-100
            if let value = value { result["spo2"] = value * 100.0 }
            group.leave()
        }

        // Body Temperature
        group.enter()
        queryMostRecentQuantity(
            type: .bodyTemperature,
            start: startOfDay,
            end: endOfDay,
            unit: HKUnit.degreeFahrenheit()
        ) { value in
            if let value = value { result["bodyTemperature"] = value }
            group.leave()
        }

        // Active Energy (sum for the day)
        group.enter()
        queryCumulativeSum(
            type: .activeEnergyBurned,
            start: startOfDay,
            end: endOfDay,
            unit: HKUnit.kilocalorie()
        ) { value in
            if let value = value { result["activeEnergy"] = value }
            group.leave()
        }

        // Step Count (sum for the day)
        group.enter()
        queryCumulativeSum(
            type: .stepCount,
            start: startOfDay,
            end: endOfDay,
            unit: HKUnit.count()
        ) { value in
            if let value = value { result["stepCount"] = Int(value) }
            group.leave()
        }

        // Sleep Analysis (for the night ending on this date)
        // Sleep data typically spans overnight, so look from 6pm previous day to noon target day
        group.enter()
        let sleepStart = calendar.date(byAdding: .hour, value: -6, to: startOfDay)! // 6pm previous day
        let sleepEnd = calendar.date(byAdding: .hour, value: 12, to: startOfDay)!   // noon target day
        querySleepAnalysis(start: sleepStart, end: sleepEnd) { sleepData in
            if let sleepData = sleepData {
                result["sleepHours"] = sleepData.totalHours
                result["sleepScore"] = sleepData.score
                result["sleepDeepHours"] = sleepData.deepHours
                result["sleepRemHours"] = sleepData.remHours
                result["sleepAwakenings"] = sleepData.awakenings
            }
            group.leave()
        }

        group.notify(queue: .main) {
            call.resolve(result as PluginCallResultData)
        }
    }

    // MARK: - Helper Methods

    private func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone.current
        return formatter.string(from: date)
    }

    /// Query the most recent sample of a quantity type within a date range
    private func queryMostRecentQuantity(
        type: HKQuantityTypeIdentifier,
        start: Date,
        end: Date,
        unit: HKUnit,
        completion: @escaping (Double?) -> Void
    ) {
        guard let quantityType = HKQuantityType.quantityType(forIdentifier: type) else {
            completion(nil)
            return
        }

        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)

        let query = HKSampleQuery(
            sampleType: quantityType,
            predicate: predicate,
            limit: 1,
            sortDescriptors: [sortDescriptor]
        ) { _, samples, error in
            guard error == nil,
                  let sample = samples?.first as? HKQuantitySample else {
                completion(nil)
                return
            }
            let value = sample.quantity.doubleValue(for: unit)
            completion(value)
        }

        healthStore.execute(query)
    }

    /// Query cumulative sum of a quantity type within a date range
    private func queryCumulativeSum(
        type: HKQuantityTypeIdentifier,
        start: Date,
        end: Date,
        unit: HKUnit,
        completion: @escaping (Double?) -> Void
    ) {
        guard let quantityType = HKQuantityType.quantityType(forIdentifier: type) else {
            completion(nil)
            return
        }

        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)

        let query = HKStatisticsQuery(
            quantityType: quantityType,
            quantitySamplePredicate: predicate,
            options: .cumulativeSum
        ) { _, statistics, error in
            guard error == nil,
                  let sum = statistics?.sumQuantity() else {
                completion(nil)
                return
            }
            completion(sum.doubleValue(for: unit))
        }

        healthStore.execute(query)
    }

    /// Sleep analysis data result
    private struct SleepData {
        let totalHours: Double
        let deepHours: Double
        let remHours: Double
        let awakenings: Int
        let score: Double  // 0-100 computed score
    }

    /// A simple date interval for merging overlapping sleep samples
    private struct SleepInterval {
        var start: Date
        var end: Date
        var duration: Foundation.TimeInterval {
            return end.timeIntervalSince(start)
        }
    }

    /// Merge overlapping time intervals so duplicate sources don't inflate totals
    private func mergeIntervals(_ intervals: [SleepInterval]) -> [SleepInterval] {
        guard !intervals.isEmpty else { return [] }
        let sorted = intervals.sorted { $0.start < $1.start }
        var merged = [sorted[0]]
        for i in 1..<sorted.count {
            if sorted[i].start <= merged[merged.count - 1].end {
                // Overlapping — extend the end if needed
                merged[merged.count - 1].end = max(merged[merged.count - 1].end, sorted[i].end)
            } else {
                merged.append(sorted[i])
            }
        }
        return merged
    }

    /// Sum total seconds from merged intervals
    private func totalSeconds(_ intervals: [SleepInterval]) -> Foundation.TimeInterval {
        return mergeIntervals(intervals).reduce(0) { $0 + $1.duration }
    }

    /// Query sleep analysis categories and compute sleep metrics
    private func querySleepAnalysis(
        start: Date,
        end: Date,
        completion: @escaping (SleepData?) -> Void
    ) {
        guard let sleepType = HKCategoryType.categoryType(forIdentifier: .sleepAnalysis) else {
            completion(nil)
            return
        }

        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)

        let query = HKSampleQuery(
            sampleType: sleepType,
            predicate: predicate,
            limit: HKObjectQueryNoLimit,
            sortDescriptors: [sortDescriptor]
        ) { [weak self] _, samples, error in
            guard let self = self,
                  error == nil,
                  let samples = samples as? [HKCategorySample],
                  !samples.isEmpty else {
                completion(nil)
                return
            }

            // Use a single source for sleep data to avoid double-counting.
            // Priority: JCVital Pro (V5 band) > WHOOP (body sensors) > fallback to most samples
            let preferredSources = ["JCVital Pro", "JCVitalPro", "JCVital", "jcvital", "WHOOP", "Whoop"]
            var sourceCounts = [String: Int]()
            for sample in samples {
                let src = sample.sourceRevision.source.name
                sourceCounts[src, default: 0] += 1
            }
            // Try preferred sources first (case-insensitive partial match)
            let preferredMatch = sourceCounts.keys.first { src in
                let lower = src.lowercased()
                return preferredSources.contains(where: { lower.contains($0.lowercased()) })
            }
            let bestSource = preferredMatch ?? sourceCounts.max(by: { $0.value < $1.value })?.key ?? ""
            let filteredSamples = samples.filter { $0.sourceRevision.source.name == bestSource }
            print("[HealthKit Sleep] Sources: \(sourceCounts), using: \(bestSource) (\(filteredSamples.count) samples)")

            // Collect intervals by category, merging overlaps within the chosen source
            var allSleepIntervals = [SleepInterval]()
            var deepIntervals = [SleepInterval]()
            var remIntervals = [SleepInterval]()
            var awakeCount = 0
            var seenAwakeIntervals = [SleepInterval]()

            for sample in filteredSamples {
                let interval = SleepInterval(start: sample.startDate, end: sample.endDate)

                if #available(iOS 16.0, *) {
                    switch sample.value {
                    case HKCategoryValueSleepAnalysis.asleepDeep.rawValue:
                        deepIntervals.append(interval)
                        allSleepIntervals.append(interval)
                    case HKCategoryValueSleepAnalysis.asleepREM.rawValue:
                        remIntervals.append(interval)
                        allSleepIntervals.append(interval)
                    case HKCategoryValueSleepAnalysis.asleepCore.rawValue:
                        allSleepIntervals.append(interval)
                    case HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue:
                        allSleepIntervals.append(interval)
                    case HKCategoryValueSleepAnalysis.awake.rawValue:
                        seenAwakeIntervals.append(interval)
                    default:
                        break
                    }
                } else {
                    // Pre-iOS 16: only asleep (value 1) and awake (value 2) exist
                    switch sample.value {
                    case HKCategoryValueSleepAnalysis.asleep.rawValue:
                        allSleepIntervals.append(interval)
                    case HKCategoryValueSleepAnalysis.awake.rawValue:
                        seenAwakeIntervals.append(interval)
                    default:
                        break
                    }
                }
            }

            // Merge overlapping intervals before calculating totals
            let totalSleepSeconds = self.totalSeconds(allSleepIntervals)
            let deepSleepSeconds = self.totalSeconds(deepIntervals)
            let remSleepSeconds = self.totalSeconds(remIntervals)
            awakeCount = self.mergeIntervals(seenAwakeIntervals).count

            let mergedAll = self.mergeIntervals(allSleepIntervals)
            print("[HealthKit Sleep] Raw intervals: \(allSleepIntervals.count), Merged: \(mergedAll.count)")
            print("[HealthKit Sleep] Total: \(String(format: "%.1f", totalSleepSeconds/3600))h, Deep: \(String(format: "%.1f", deepSleepSeconds/3600))h, REM: \(String(format: "%.1f", remSleepSeconds/3600))h, Awake: \(awakeCount)")

            let totalHours = totalSleepSeconds / 3600.0
            let deepHours = deepSleepSeconds / 3600.0
            let remHours = remSleepSeconds / 3600.0

            // Compute sleep score (0-100)
            var score: Double = 50

            // Duration factor (target: 7-9 hours)
            if totalHours >= 8.0 { score += 20 }
            else if totalHours >= 7.0 { score += 12 }
            else if totalHours >= 6.0 { score += 4 }
            else if totalHours >= 5.0 { score -= 8 }
            else { score -= 20 }

            // Deep sleep factor (target: 15-25% of total)
            if totalHours > 0 {
                let deepPct = deepHours / totalHours
                if deepPct >= 0.15 && deepPct <= 0.25 { score += 15 }
                else if deepPct >= 0.10 { score += 5 }
                else if deepPct < 0.05 && deepPct > 0 { score -= 5 }
            }

            // REM factor (target: 20-25% of total)
            if totalHours > 0 {
                let remPct = remHours / totalHours
                if remPct >= 0.20 { score += 10 }
                else if remPct >= 0.15 { score += 5 }
            }

            // Awakenings penalty
            if awakeCount <= 1 { score += 5 }
            else if awakeCount >= 5 { score -= 10 }
            else if awakeCount >= 3 { score -= 5 }

            score = min(100, max(0, score))

            completion(SleepData(
                totalHours: round(totalHours * 10) / 10,
                deepHours: round(deepHours * 10) / 10,
                remHours: round(remHours * 10) / 10,
                awakenings: awakeCount,
                score: round(score)
            ))
        }

        healthStore.execute(query)
    }
}
