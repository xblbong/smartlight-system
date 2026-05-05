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
        $devices        = Device::count();
        $cache          = DB::table('device_status_cache')->get();
        $active_devices = $cache->count();
        // INA219 belum siap → faulty selalu 0 sampai sensor terpasang
        $faulty_devices = 0;
        $avg_lux        = round((float) ($cache->avg('last_lux') ?? 0), 1);
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
            'total_devices'  => $devices,
            'active_devices' => $active_devices,
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

        $limit = min((int) ($request->get('limit', 100)), 500);
        $logs  = $query->limit($limit)->get();

        return response()->json($logs);
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
