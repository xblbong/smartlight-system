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
}
