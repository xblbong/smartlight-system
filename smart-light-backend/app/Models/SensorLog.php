<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SensorLog extends Model
{
    protected $fillable = [
        'device_id',
        'zone',
        'lux',
        'jarak',
        'sedangAdaOrang',
        'masihMasaTunggu',
        'tombol',
        'voltage',
        'current',
        'ldr_status',
        'ultrasonic_status',
        'ina219_status',
        'trigger',
        'kondisi',
        'powerLampu',
        'timestamp',
    ];

    protected $casts = [
        'sedangAdaOrang' => 'boolean',
        'masihMasaTunggu' => 'boolean',
        'tombol' => 'boolean',
        'lux' => 'float',
        'jarak' => 'float',
        'voltage' => 'float',
        'current' => 'float',
        'powerLampu' => 'integer',
        'timestamp' => 'datetime',
    ];
}
