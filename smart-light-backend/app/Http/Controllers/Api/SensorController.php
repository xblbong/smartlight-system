<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\SensorLog;
use App\Models\Device;
use App\Models\Zone;
use Illuminate\Support\Facades\DB;

class SensorController extends Controller
{
    /**
     * Terima data dari ESP32 / Python simulator dan simpan ke DB.
     * POST /api/device/data
     */
    public function store(Request $request)
    {
        // 1. Validasi data yang masuk dari ESP32/Python
        $request->validate([
            'device_id'  => 'required|string',
            'zone'       => 'required|string',
            'lux'        => 'required|numeric',
            'current'    => 'required|numeric',
            'powerLampu' => 'required|numeric',
        ]);

        // Auto-register Device and Zone if not exists
        Device::firstOrCreate(['device_id' => $request->device_id], ['name' => 'ESP32 Device']);
        Zone::firstOrCreate(['device_id' => $request->device_id, 'zone_code' => $request->zone]);

        $sensorStatus = is_array($request->sensor_status)
            ? $request->sensor_status
            : json_decode($request->sensor_status, true) ?? [];

        // 2. Simpan ke SensorLogs (Historis)
        SensorLog::create([
            'device_id'         => $request->device_id,
            'zone'              => $request->zone,
            'lux'               => $request->lux,
            'jarak'             => $request->jarak,
            'sedangAdaOrang'    => $request->boolean('sedangAdaOrang'),
            'masihMasaTunggu'   => $request->boolean('masihMasaTunggu'),
            'tombol'            => $request->boolean('tombol'),
            'voltage'           => $request->voltage,
            'current'           => $request->current,
            'ldr_status'        => $sensorStatus['ldr'] ?? 'OK',
            'ultrasonic_status' => $sensorStatus['ultrasonic'] ?? 'OK',
            'ina219_status'     => $sensorStatus['ina219'] ?? 'OK',
            'trigger'           => $request->trigger,
            'kondisi'           => $request->kondisi,
            'powerLampu'        => $request->powerLampu,
            'timestamp'         => $request->timestamp ?? now(),
        ]);

        // 3. Update / Insert Cache (Data terbaru per zona)
        $is_faulty = ($request->current < 10 && $request->powerLampu > 0);

        $now = now();

        DB::table('device_status_cache')->upsert(
            [
                [
                    'device_id'    => $request->device_id,
                    'zone'         => $request->zone,
                    'last_lux'     => $request->lux,
                    'last_power'   => $request->powerLampu,
                    'last_kondisi' => $request->kondisi,
                    'is_faulty'    => $is_faulty,
                    'created_at'   => $now,
                    'updated_at'   => $now,
                ],
            ],
            ['device_id', 'zone'],
            ['last_lux', 'last_power', 'last_kondisi', 'is_faulty', 'updated_at']
        );

        return response()->json([
            'status'      => 'success',
            'message'     => 'Data berhasil diterima',
            'received_at' => now(),
        ], 201);
    }

    /**
     * Ambil status terbaru lengkap untuk tiap zona.
     * GET /api/device/latest
     */
    public function latest()
    {
        // Sub-query: id terbesar per device+zone dari sensor_logs
        $latestIds = DB::table('sensor_logs')
            ->select(DB::raw('MAX(id) as id'))
            ->groupBy('device_id', 'zone')
            ->pluck('id');

        if ($latestIds->isEmpty()) {
            return response()->json([]);
        }

        // Ambil record lengkap dengan join ke cache untuk is_faulty
        $logs = DB::table('sensor_logs as sl')
            ->leftJoin('device_status_cache as dsc', function ($join) {
                $join->on('sl.device_id', '=', 'dsc.device_id')
                     ->on('sl.zone', '=', 'dsc.zone');
            })
            ->whereIn('sl.id', $latestIds)
            ->select(
                'sl.device_id',
                'sl.zone',
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
                'dsc.is_faulty',
                'dsc.updated_at as cache_updated_at',
                'sl.created_at as updated_at'
            )
            ->orderBy('sl.device_id')
            ->orderBy('sl.zone')
            ->get();

        $formatted = $logs->map(function ($item) {
            return [
                'device_id'   => $item->device_id,
                'zone'        => $item->zone,
                'latest_data' => [
                    'lux'             => (float) $item->lux,
                    'jarak'           => (float) $item->jarak,
                    'sedangAdaOrang'  => (bool) $item->sedangAdaOrang,
                    'masihMasaTunggu' => (bool) $item->masihMasaTunggu,
                    'tombol'          => (bool) $item->tombol,
                    'voltage'         => (float) $item->voltage,
                    'current'         => (float) $item->current,
                    'sensor_status'   => [
                        'ldr'        => $item->ldr_status ?? 'OK',
                        'ultrasonic' => $item->ultrasonic_status ?? 'OK',
                        'ina219'     => $item->ina219_status ?? 'OK',
                    ],
                    'trigger'          => $item->trigger,
                    'kondisi'          => $item->kondisi,
                    'powerLampu'       => (int) $item->powerLampu,
                    'is_faulty'        => (bool) $item->is_faulty,
                    'timestamp'        => $item->timestamp,
                    'cache_updated_at' => $item->cache_updated_at,
                ],
            ];
        });

        return response()->json($formatted);
    }
}
