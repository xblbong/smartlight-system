<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\SensorLog;
use App\Models\Device;
use App\Models\DeviceControl;
use App\Models\SystemSetting;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;

class DashboardController extends Controller
{
    /**
     * GET /api/dashboard/summary
     * Cached 5 detik — cukup untuk real-time dashboard tanpa membebani DB
     */
    public function summary()
    {
        $data = Cache::remember('api.summary', 2, function () {
            $espCount = Device::count();

            // Aggregasi di SQL, bukan di PHP
            $agg = DB::table('device_status_cache')
                ->selectRaw('
                    COUNT(*) as total_zones,
                    SUM(CASE WHEN is_faulty = 1 THEN 1 ELSE 0 END) as faulty_devices,
                    SUM(CASE WHEN last_power > 0 THEN 1 ELSE 0 END) as lampu_menyala,
                    SUM(CASE WHEN last_power = 0 OR last_power IS NULL THEN 1 ELSE 0 END) as lampu_mati,
                    ROUND(AVG(last_lux), 1) as avg_lux
                ')
                ->first();

            // avg_current dari cache (sudah update per ESP32 heartbeat)
            $avgCurrent = round(
                (float) DB::table('device_status_cache')->avg('last_current'),
                1
            );

            return [
                'total_devices'  => $espCount,
                'total_zones'    => (int) ($agg->total_zones ?? 0),
                'active_devices' => (int) ($agg->total_zones ?? 0),
                'faulty_devices' => (int) ($agg->faulty_devices ?? 0),
                'avg_lux'        => (float) ($agg->avg_lux ?? 0),
                'avg_current'    => $avgCurrent,
                'lampu_menyala'  => (int) ($agg->lampu_menyala ?? 0),
                'lampu_mati'     => (int) ($agg->lampu_mati ?? 0),
            ];
        });

        return response()->json($data);
    }

    /**
     * GET /api/device/zones
     * Cached 10 detik — zone config jarang berubah
     */
    public function zones()
    {
        $data = Cache::remember('api.zones', 10, function () {
            $zones = DB::table('zones as z')
                ->leftJoin('device_status_cache as dsc', function ($join) {
                    $join->on('z.device_id', '=', 'dsc.device_id')
                         ->on('z.zone_code', '=', 'dsc.zone');
                })
                ->select(
                    'z.device_id',
                    'z.zone_code',
                    'z.zone_name',
                    'dsc.last_power',
                    'dsc.last_lux',
                    'dsc.last_kondisi',
                    'dsc.last_voltage',
                    'dsc.last_current',
                    'dsc.is_faulty',
                    'dsc.updated_at'
                )
                ->orderBy('z.device_id')
                ->orderBy('z.zone_code')
                ->get();

            $defaultLampCount = (int) (Cache::remember('setting.lamps_per_zone', 3600, function () {
                return SystemSetting::where('key', 'lamps_per_zone')->value('value') ?? 2;
            }));

            return $zones->map(function ($z) use ($defaultLampCount) {
                return [
                    'device_id'    => $z->device_id,
                    'zone_code'    => $z->zone_code,
                    'zone_name'    => $z->zone_name ?? ('Zone ' . $z->zone_code),
                    'lamp_count'   => $defaultLampCount,
                    'last_power'   => (int) ($z->last_power ?? 0),
                    'last_lux'     => round((float) ($z->last_lux ?? 0), 1),
                    'last_voltage' => round((float) ($z->last_voltage ?? 0), 2),
                    'last_current' => round((float) ($z->last_current ?? 0), 1),
                    'is_active'    => $z->updated_at !== null,
                    'is_faulty'    => (bool) ($z->is_faulty ?? false),
                ];
            })->toArray();
        });

        return response()->json($data);
    }

    /**
     * GET /api/device/history
     * Tidak di-cache karena data historis berubah per request
     */
    public function history(Request $request)
    {
        $query = SensorLog::orderBy('created_at', 'desc');

        if ($request->filled('device_id')) {
            $query->where('device_id', $request->device_id);
        }

        if ($request->filled('zone')) {
            $query->where('zone', $request->zone);
        }

        if ($request->filled('month')) {
            $month = $request->month;
            $parts = explode('-', $month);
            if (count($parts) === 2) {
                $query->whereYear('created_at', $parts[0])
                      ->whereMonth('created_at', $parts[1]);
            }
        }

        $limit = min((int) ($request->get('limit', 100)), 1000);
        $logs  = $query->limit($limit)->get();

        return response()->json($logs);
    }

    /**
     * GET /api/analytics/efficiency
     * Cached 30 detik — data efisiensi tidak perlu real-time
     */
    public function efficiency(Request $request)
    {
        $monthKey = $request->get('month', 'latest');
        $cacheKey = "api.efficiency.{$monthKey}";

        $data = Cache::remember($cacheKey, 30, function () use ($request) {
            $totalZones = DB::table('device_status_cache')->count();
            if ($totalZones === 0) $totalZones = 1;

            // Asumsi prototype: 1W per lampu, 2 lampu per zona
            $wattsPerLamp = 1;
            $lampsPerZone = 2;
            $totalLamps = $totalZones * $lampsPerZone;

            // ── Konvensional (timer-based) ──
            // 17:00-23:00 (6 jam): SEMUA lampu 100%
            // 23:00-04:00 (5 jam): 40% lampu tetap 100%
            // 04:00-17:00 (13 jam): MATI
            $convHoursOn = 6 + (5 * 0.4); // = 8 jam equivalent per hari
            $convPowerPerHour = $totalLamps * $wattsPerLamp; // Watt jika semua nyala
            $convDailyWh = $convPowerPerHour * $convHoursOn;
            $convDailyKwh = round($convDailyWh / 1000, 3);
            $convMonthlyKwh = round($convDailyKwh * 30, 3);

            // ── Smart System ──
            // Hitung dari data sensor aktual
            $query = DB::table('sensor_logs')
                ->where('created_at', '>=', now()->subDay());

            if ($request->filled('month')) {
                $month = $request->month;
                $parts = explode('-', $month);
                if (count($parts) === 2) {
                    $query = DB::table('sensor_logs')
                        ->whereYear('created_at', $parts[0])
                        ->whereMonth('created_at', $parts[1]);
                }
            }

            // Rata-rata PWM dari data sensor (0-255)
            $avgPwm = (float) ($query->avg('powerLampu') ?? 0);
            $totalLogs = (int) ($query->count() ?? 0);

            // Hitung berapa persen lampu aktif dan pada level berapa
            $avgDuty = $avgPwm / 255; // 0.0 - 1.0

            // Jam operasi smart system = jam gelap (17:00-06:00 = 13 jam)
            // Tapi lampu HANYA nyala saat gelap + ada kebutuhan
            $darkHours = 13; // jam gelap per hari
            $smartEffectiveHours = $avgDuty * $darkHours; // jam lampu benar-benar aktif

            // Daya rata-rata = duty cycle * max power
            $smartAvgPower = $totalLamps * $wattsPerLamp * $avgDuty;
            $smartDailyWh = $smartAvgPower * $smartEffectiveHours;
            $smartDailyKwh = round($smartDailyWh / 1000, 3);
            $smartMonthlyKwh = round($smartDailyKwh * 30, 3);

            // Persentase penghematan
            $savingPct = $convMonthlyKwh > 0
                ? max(0, round((($convMonthlyKwh - $smartMonthlyKwh) / $convMonthlyKwh) * 100, 1))
                : 0;

            return [
                'total_zones'       => $totalZones,
                'lamps_per_zone'    => $lampsPerZone,
                'watts_per_lamp'    => $wattsPerLamp,
                'is_prototype'      => true,
                'conventional'      => [
                    'daily_kwh'     => $convDailyKwh,
                    'monthly_kwh'   => $convMonthlyKwh,
                    'hours_per_day' => round($convHoursOn, 1),
                    'description'   => 'Timer: 17:00-23:00 semua nyala, 23:00-04:00 40% nyala',
                ],
                'smart'             => [
                    'daily_kwh'     => $smartDailyKwh,
                    'monthly_kwh'   => $smartMonthlyKwh,
                    'avg_pwm'       => round($avgPwm, 1),
                    'avg_duty_pct'  => round($avgDuty * 100, 1),
                    'hours_per_day' => round($smartEffectiveHours, 1),
                ],
                'saving_pct'        => $savingPct,
                'data_points'       => $totalLogs,
            ];
        });

        return response()->json($data);
    }

    /**
     * POST /api/device/control
     */
    public function control(Request $request)
    {
        $request->validate([
            'device_id' => 'required|string',
            'zone'      => 'required|string',
            'action'    => 'required|string|in:ON,OFF,AUTO,EMERGENCY',
        ]);

        $control = DeviceControl::create([
            'device_id'   => $request->device_id,
            'zone'        => $request->zone,
            'action'      => $request->action,
            'executed_at' => null,
        ]);

        // Invalidate cache setelah control command
        Cache::forget('api.summary');
        Cache::forget('api.latest');

        return response()->json([
            'status'  => 'success',
            'message' => 'Command queued for execution',
            'data'    => $control,
        ]);
    }

    /**
     * GET /api/device/control/pending
     */
    public function pendingControl(Request $request)
    {
        $request->validate([
            'device_id' => 'required|string',
        ]);

        // Window function: ambil perintah terbaru per zona yang belum dieksekusi
        $commands = DeviceControl::where('device_id', $request->device_id)
            ->whereNull('executed_at')
            ->orderBy('created_at', 'desc')
            ->get()
            ->unique('zone')
            ->values();

        return response()->json($commands);
    }

    /**
     * POST /api/device/control/ack
     */
    public function ackControl(Request $request)
    {
        $request->validate([
            'ids' => 'required|array',
            'ids.*' => 'integer|exists:device_controls,id',
        ]);

        DeviceControl::whereIn('id', $request->ids)
            ->whereNull('executed_at')
            ->update(['executed_at' => now()]);

        return response()->json(['status' => 'success']);
    }

    /**
     * GET /api/settings
     * Cached 1 jam — settings jarang berubah
     */
    public function getSettings()
    {
        $settings = Cache::remember('api.settings', 3600, function () {
            return SystemSetting::all()->pluck('value', 'key')->toArray();
        });

        return response()->json($settings);
    }

    /**
     * POST /api/settings
     */
    public function saveSettings(Request $request)
    {
        $allowed = ['lux_threshold', 'pir_delay', 'lamps_per_zone'];

        foreach ($request->only($allowed) as $key => $value) {
            SystemSetting::updateOrCreate(['key' => $key], ['value' => $value]);
        }

        // Invalidate settings cache
        Cache::forget('api.settings');
        Cache::forget('setting.lamps_per_zone');

        return response()->json(['status' => 'success']);
    }
}
