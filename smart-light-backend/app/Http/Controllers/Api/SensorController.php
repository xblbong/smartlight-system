<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\SensorLog;
use App\Models\Device;
use App\Models\Zone;
use App\Models\SystemSetting;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;

class SensorController extends Controller
{
    /**
     * Terima data dari ESP32 / Python simulator dan simpan ke DB.
     * POST /api/device/data
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'device_id'        => 'required|string|max:50',
            'zone'             => 'required|string|max:10',
            'zone_name'        => 'nullable|string|max:100',
            'lux'              => 'nullable|numeric',
            'jarak'            => 'nullable|numeric',
            'sedangAdaOrang'   => 'nullable|boolean',
            'masihMasaTunggu'  => 'nullable|boolean',
            'tombol'           => 'nullable|boolean',
            'voltage'          => 'nullable|numeric',
            'current'          => 'nullable|numeric',
            'trigger'          => 'nullable|string',
            'kondisi'          => 'nullable|string',
            'powerLampu'       => 'nullable|integer',
            'timestamp'        => 'nullable|string',
            'sensor_status'    => 'nullable|array',
        ]);

        // Auto-register Device & Zone — skip jika sudah ada (hemat query)
        $deviceKey = "device.exists.{$validated['device_id']}";
        if (!Cache::has($deviceKey)) {
            Device::updateOrCreate(
                ['device_id' => $validated['device_id']],
                ['name' => 'ESP32 Device']
            );
            Cache::put($deviceKey, true, 3600);
        }

        $zoneKey = "zone.exists.{$validated['device_id']}.{$validated['zone']}";
        if (!Cache::has($zoneKey)) {
            Zone::updateOrCreate(
                ['device_id' => $validated['device_id'], 'zone_code' => $validated['zone']],
                ['zone_name' => $validated['zone_name'] ?? null]
            );
            Cache::put($zoneKey, true, 3600);
        }

        // Parse sensor status
        $sensorStatus = is_array($validated['sensor_status'] ?? null)
            ? $validated['sensor_status']
            : json_decode($validated['sensor_status'] ?? '{}', true) ?? [];

        // Parse timestamp
        $timestamp = null;
        if ($validated['timestamp'] ?? null) {
            try {
                $timestamp = \Carbon\Carbon::parse($validated['timestamp']);
            } catch (\Exception $e) {
                $timestamp = now();
            }
        } else {
            $timestamp = now();
        }

        // Simpan ke SensorLogs
        SensorLog::create([
            'device_id' => $validated['device_id'],
            'zone' => $validated['zone'],
            'lux' => $validated['lux'] ?? null,
            'jarak' => $validated['jarak'] ?? null,
            'sedangAdaOrang' => (bool) ($validated['sedangAdaOrang'] ?? false),
            'masihMasaTunggu' => (bool) ($validated['masihMasaTunggu'] ?? false),
            'tombol' => (bool) ($validated['tombol'] ?? false),
            'voltage' => $validated['voltage'] ?? null,
            'current' => $validated['current'] ?? null,
            'ldr_status' => $sensorStatus['ldr'] ?? 'OK',
            'ultrasonic_status' => $sensorStatus['ultrasonic'] ?? 'OK',
            'ina219_status' => $sensorStatus['ina219'] ?? 'OK',
            'trigger' => $validated['trigger'] ?? null,
            'kondisi' => $validated['kondisi'] ?? null,
            'powerLampu' => $validated['powerLampu'] ?? 0,
            'timestamp' => $timestamp,
        ]);

        // Update device_status_cache
        $is_faulty = (
            isset($validated['kondisi']) &&
            str_contains(strtoupper($validated['kondisi']), 'RUSAK')
        );
        $now = now();

        DB::table('device_status_cache')->upsert(
            [
                [
                    'device_id'    => $validated['device_id'],
                    'zone'         => $validated['zone'],
                    'last_lux'     => $validated['lux'] ?? null,
                    'last_power'   => $validated['powerLampu'] ?? 0,
                    'last_kondisi' => $validated['kondisi'] ?? null,
                    'last_voltage' => $validated['voltage'] ?? null,
                    'last_current' => $validated['current'] ?? null,
                    'is_faulty'    => $is_faulty,
                    'created_at'   => $now,
                    'updated_at'   => $now,
                ],
            ],
            ['device_id', 'zone'],
            ['last_lux', 'last_power', 'last_kondisi', 'last_voltage', 'last_current', 'is_faulty', 'updated_at']
        );

        // Invalidate read caches
        Cache::forget('api.summary');
        Cache::forget('api.latest');

        return response()->json([
            'status' => 'success',
            'message' => 'Data berhasil diterima',
            'received_at' => now(),
        ], 201);
    }

    /**
     * Ambil status terbaru lengkap untuk tiap zona.
     * GET /api/device/latest
     * Cached 3 detik — real-time tapi tidak membebani DB
     */
    public function latest()
    {
        $data = Cache::remember('api.latest', 3, function () {
            // Sub-query: id terbesar per device+zone
            // Dengan index (device_id, zone, created_at), query ini sangat cepat
            $latestIds = DB::table('sensor_logs')
                ->select(DB::raw('MAX(id) as id'))
                ->groupBy('device_id', 'zone')
                ->pluck('id');

            if ($latestIds->isEmpty()) {
                return [];
            }

            $logs = DB::table('sensor_logs as sl')
                ->leftJoin('device_status_cache as dsc', function ($join) {
                    $join->on('sl.device_id', '=', 'dsc.device_id')
                         ->on('sl.zone', '=', 'dsc.zone');
                })
                ->leftJoin('zones as z', function ($join) {
                    $join->on('sl.device_id', '=', 'z.device_id')
                         ->on('sl.zone', '=', 'z.zone_code');
                })
                ->whereIn('sl.id', $latestIds)
                ->select(
                    'sl.device_id',
                    'sl.zone',
                    'z.zone_name',
                    'sl.lux',
                    'sl.jarak',
                    'sl.sedangAdaOrang',
                    'sl.masihMasaTunggu',
                    'sl.tombol',
                    'sl.voltage',
                    'sl.current',
                    'sl.ldr_status',
                    'sl.ultrasonic_status',
                    'sl.ina219_status',
                    'sl.trigger',
                    'sl.kondisi',
                    'sl.powerLampu',
                    'sl.timestamp',
                    'sl.created_at',
                    'dsc.is_faulty',
                    'dsc.updated_at as cache_updated_at'
                )
                ->orderBy('sl.device_id')
                ->orderBy('sl.zone')
                ->get();

            $defaultLampCount = (int) (Cache::remember('setting.lamps_per_zone', 3600, function () {
                return SystemSetting::where('key', 'lamps_per_zone')->value('value') ?? 2;
            }));

            return $logs->map(function ($item) use ($defaultLampCount) {
                $zoneName = $item->zone_name ?? ('Zone ' . $item->zone);

                return [
                    'device_id' => $item->device_id,
                    'zone'      => $item->zone,
                    'zone_name' => $zoneName,
                    'lamp_count' => $defaultLampCount,
                    'latest_data' => [
                        'lux' => round((float) $item->lux, 1),
                        'jarak' => round((float) $item->jarak, 1),
                        'sedangAdaOrang' => (bool) $item->sedangAdaOrang,
                        'masihMasaTunggu' => (bool) $item->masihMasaTunggu,
                        'tombol' => (bool) $item->tombol,
                        'voltage' => (float) $item->voltage,
                        'current' => (float) $item->current,
                        'sensor_status' => [
                            'ldr' => $item->ldr_status ?? 'OK',
                            'ultrasonic' => $item->ultrasonic_status ?? 'OK',
                            'ina219' => $item->ina219_status ?? 'N/A',
                        ],
                        'trigger' => $item->trigger,
                        'kondisi' => $item->kondisi,
                        'powerLampu' => (int) $item->powerLampu,
                        'is_faulty' => (bool) $item->is_faulty,
                        'is_online' => $item->created_at ? \Carbon\Carbon::parse($item->created_at)->diffInMinutes(now()) < 5 : false,
                        'timestamp' => \Carbon\Carbon::parse($item->created_at)->toIso8601String(),
                        'cache_updated_at' => $item->cache_updated_at ? \Carbon\Carbon::parse($item->cache_updated_at)->toIso8601String() : null,
                    ],
                ];
            });
        });

        return response()->json($data);
    }
}
