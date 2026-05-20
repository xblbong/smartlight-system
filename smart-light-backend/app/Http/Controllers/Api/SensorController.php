<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\SensorLog;
use App\Models\Device;
use App\Models\Zone;
use App\Models\SystemSetting;
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
        $validated = $request->validate([
            'device_id'        => 'required|string|max:50',
            'zone'             => 'required|string|max:10',
            'zone_name'        => 'nullable|string|max:100', // nama lokasi dari konfigurasi ESP32
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

        // 2. Auto-register Device and Zone (optimized with updateOrCreate)
        Device::updateOrCreate(
            ['device_id' => $validated['device_id']],
            ['name' => 'ESP32 Device']
        );

        // Simpan zone_name dari ESP32 ke tabel zones (sumber kebenaran nama lokasi)
        Zone::updateOrCreate(
            ['device_id' => $validated['device_id'], 'zone_code' => $validated['zone']],
            ['zone_name' => $validated['zone_name'] ?? null]
        );

        // Parse sensor status
        $sensorStatus = is_array($validated['sensor_status'] ?? null)
            ? $validated['sensor_status']
            : json_decode($validated['sensor_status'] ?? '{}', true) ?? [];

        // Parse timestamp (handle ISO 8601 format from ESP32)
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

        // 3. Simpan ke SensorLogs (Historis)
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

        // 4. Fault detection - Mengikuti status 'RUSAK' dari ESP32 (yang memiliki buffer penundaan/failCount)
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

        return response()->json([
            'status' => 'success',
            'message' => 'Data berhasil diterima',
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
                'z.zone_name',              // nama lokasi dari config ESP32
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
                'sl.created_at',            // selalu non-null, gunakan sebagai fallback timestamp
                'dsc.is_faulty',
                'dsc.updated_at as cache_updated_at'
            )
            ->orderBy('sl.device_id')
            ->orderBy('sl.zone')
            ->get();

        $defaultLampCount = (int) (SystemSetting::where('key', 'lamps_per_zone')->value('value') ?? 2);

        $formatted = $logs->map(function ($item) use ($defaultLampCount) {
            // zone_name diambil dari tabel zones (dikirim oleh ESP32 dari konfigurasinya)
            // Fallback: 'Zone {code}' jika ESP32 belum mengirim zone_name
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
                        'ina219' => $item->ina219_status ?? 'N/A',  // Belum siap
                    ],
                    'trigger' => $item->trigger,
                    'kondisi' => $item->kondisi,
                    'powerLampu' => (int) $item->powerLampu,
                    'is_faulty' => (bool) $item->is_faulty,  // INA219 aktif — deteksi real
                    // Kalkulasi online di backend agar tidak ada masalah selisih jam client-server
                    'is_online' => $item->created_at ? \Carbon\Carbon::parse($item->created_at)->diffInMinutes(now()) < 5 : false,
                    'timestamp' => \Carbon\Carbon::parse($item->created_at)->toIso8601String(),
                    'cache_updated_at' => $item->cache_updated_at ? \Carbon\Carbon::parse($item->cache_updated_at)->toIso8601String() : null,
                ],
            ];
        });

        return response()->json($formatted);
    }
}
