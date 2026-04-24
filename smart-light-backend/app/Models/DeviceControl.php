<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DeviceControl extends Model
{
    protected $fillable = ['device_id', 'zone', 'action', 'executed_at'];
}
