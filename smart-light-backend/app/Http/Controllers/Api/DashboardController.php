<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\SensorLog;
use App\Models\Device;
use App\Models\DeviceControl;
use App\Models\SystemSetting;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    /**
     * GET /api/dashboard/summary
     */
    public function summary()
    {
        $espCount       = Device::count();  // Jumlah ESP32 fisik
        $cache          = DB::table('device_status_cache')->get();
        $total_zones    = $cache->count();   // Jumlah zona aktif (= jumlah titik lampu)
        $faulty_devices = $cache->where('is_faulty', true)->count();
        $avg_lux        = round($cache->avg('last_lux') ?? 0, 1);
        $lampu_menyala  = $cache->where('last_power', '>', 0)->count();
        $lampu_mati     = $cache->where('last_power', 0)->count();

        // avg_current dari sensor_logs terbaru
        $latestIds = DB::table('sensor_logs')
            ->select(DB::raw('MAX(id) as id'))
            ->groupBy('device_id', 'zone')
            ->pluck('id');

        $avg_current = 0;
        if ($latestIds->isNotEmpty()) {
            $avg_current = round(
                DB::table('sensor_logs')->whereIn('id', $latestIds)->avg('current') ?? 0,
                1
            );
        }

        return response()->json([
            'total_devices'  => $espCount,     // Jumlah ESP32 unit
            'total_zones'    => $total_zones,  // Jumlah zona (titik lampu)
            'active_devices' => $total_zones,  // Alias agar frontend backward-compatible
            'faulty_devices' => $faulty_devices,
            'avg_lux'        => $avg_lux,
            'avg_current'    => $avg_current,
            'lampu_menyala'  => $lampu_menyala,
            'lampu_mati'     => $lampu_mati,
        ]);
    }

    /**
     * GET /api/device/history
     * Optional query params: device_id, zone, limit (default 100)
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

        // Filter bulan: format YYYY-MM
        if ($request->filled('month')) {
            $month = $request->month; // e.g. "2026-05"
            $query->whereRaw("to_char(created_at, 'YYYY-MM') = ?", [$month]);
        }

        $limit = min((int) ($request->get('limit', 100)), 1000);
        $logs  = $query->limit($limit)->get();

        return response()->json($logs);
    }

    /**
     * GET /api/analytics/efficiency
     * Menghitung perbandingan efisiensi: sistem konvensional (timer) vs smart lighting.
     * Baseline konvensional berdasarkan wawancara satpam UB:
     *   - 17:00-23:00 (6 jam): SEMUA lampu nyala 100%
     *   - 23:00-04:00 (5 jam): ~40% lampu nyala 100%
     *   - 04:00-17:00 (13 jam): MATI
     *   - Total per lampu: ~8 jam/hari equivalent
     */
    public function efficiency(Request $request)
    {
        $cache = DB::table('device_status_cache')->get();
        $totalZones = $cache->count();
        if ($totalZones === 0) $totalZones = 1;

        // Asumsi daya per lampu: 100W (lampu jalan konvensional)
        $wattsPerLamp = 100;
        $lampsPerZone = 2;  // 2 lampu per zona

        // ── Baseline Konvensional (per hari) ──
        // 17:00-23:00: 6 jam × semua zona × 100%
        // 23:00-04:00: 5 jam × 40% zona × 100%
        $convHoursFullAll   = 6;   // 6 jam semua nyala
        $convHoursPartial   = 5;   // 5 jam sebagian nyala
        $convPartialRatio   = 0.4; // 40% zona tetap nyala malam
        $convDailyWh = ($totalZones * $convHoursFullAll * $wattsPerLamp * $lampsPerZone)
                     + ($totalZones * $convPartialRatio * $convHoursPartial * $wattsPerLamp * $lampsPerZone);
        $convDailyKwh = round($convDailyWh / 1000, 2);
        $convMonthlyKwh = round($convDailyKwh * 30, 2);

        // ── Smart System (dari data aktual) ──
        // Hitung dari data sensor: rata-rata duty cycle × jam operasi realistis
        // Jam operasi: 17:00-06:00 = 13 jam (malam-subuh, saat lampu diperlukan)
        $smartOperatingHours = 13; // jam realistis per hari lampu beroperasi

        $query = DB::table('sensor_logs')
            ->where('created_at', '>=', now()->subDay());

        if ($request->filled('month')) {
            $month = $request->month;
            $query = DB::table('sensor_logs')
                ->whereRaw("to_char(created_at, 'YYYY-MM') = ?", [$month]);
        }

        $logs = $query->get();
        $totalLogs = $logs->count();

        if ($totalLogs > 0) {
            $avgPwm = $logs->avg('powerLampu');
            // PWM 0-255 → duty cycle 0-100%
            $avgDuty = $avgPwm / 255;
            // Smart system: duty cycle × jam operasi malam
            // Lebih akurat karena smart lighting hanya aktif saat gelap
            $smartHoursPerDay = round($avgDuty * $smartOperatingHours, 2);
            $smartDailyWh = $totalZones * $smartHoursPerDay * $wattsPerLamp * $lampsPerZone;
            $smartDailyKwh = round($smartDailyWh / 1000, 2);
        } else {
            $smartHoursPerDay = 0;
            $smartDailyKwh = 0;
            $avgPwm = 0;
        }

        $smartMonthlyKwh = round($smartDailyKwh * 30, 2);
        // Clamp: minimal 0% (data simulator mungkin tidak sempurna)
        $savingPct = $convMonthlyKwh > 0
            ? max(0, round((($convMonthlyKwh - $smartMonthlyKwh) / $convMonthlyKwh) * 100, 1))
            : 0;

        return response()->json([
            'total_zones'       => $totalZones,
            'lamps_per_zone'    => $lampsPerZone,
            'watts_per_lamp'    => $wattsPerLamp,
            'conventional'      => [
                'daily_kwh'     => $convDailyKwh,
                'monthly_kwh'   => $convMonthlyKwh,
                'hours_per_day' => $convHoursFullAll + ($convPartialRatio * $convHoursPartial),
                'description'   => 'Timer: 17:00-23:00 semua nyala, 23:00-04:00 sebagian nyala',
            ],
            'smart'             => [
                'daily_kwh'     => $smartDailyKwh,
                'monthly_kwh'   => $smartMonthlyKwh,
                'avg_pwm'       => round($avgPwm, 1),
                'avg_duty_pct'  => round(($avgPwm / 255) * 100, 1),
                'hours_per_day' => $smartHoursPerDay,
            ],
            'saving_pct'        => $savingPct,
            'data_points'       => $totalLogs,
        ]);
    }

    /**
     * POST /api/device/control
     */
    public function control(Request $request)
    {
        $request->validate([
            'device_id' => 'required|string',
            'zone'      => 'required|string',
            'action'    => 'required|string|in:ON,OFF,AUTO',
        ]);

        $control = DeviceControl::create([
            'device_id'   => $request->device_id,
            'zone'        => $request->zone,
            'action'      => $request->action,
            'executed_at' => null,
        ]);

        return response()->json([
            'status'  => 'success',
            'message' => 'Command queued for execution',
            'data'    => $control,
        ]);
    }

    /**
     * GET /api/device/control/pending
     * Digunakan oleh simulator/ESP32 untuk mengambil perintah kontrol yang belum dieksekusi.
     */
    public function pendingControl(Request $request)
    {
        $request->validate([
            'device_id' => 'required|string',
        ]);

        // Ambil perintah terbaru per zona yang belum dieksekusi
        $commands = DeviceControl::where('device_id', $request->device_id)
            ->whereNull('executed_at')
            ->orderBy('created_at', 'desc')
            ->get()
            ->unique('zone')  // hanya perintah terbaru per zona
            ->values();

        return response()->json($commands);
    }

    /**
     * POST /api/device/control/ack
     * Simulator/ESP32 mengonfirmasi bahwa perintah sudah dieksekusi.
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
     */
    public function getSettings()
    {
        $settings = SystemSetting::all()->pluck('value', 'key');
        return response()->json($settings);
    }

    /**
     * POST /api/settings
     */
    public function saveSettings(Request $request)
    {
        foreach ($request->all() as $key => $value) {
            SystemSetting::updateOrCreate(['key' => $key], ['value' => $value]);
        }

        return response()->json(['status' => 'success']);
    }
}
