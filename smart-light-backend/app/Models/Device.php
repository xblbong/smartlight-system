<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Device extends Model
{
    protected $fillable = ['device_id', 'name'];

    public function zones()
    {
        return $this->hasMany(Zone::class, 'device_id', 'device_id');
    }
}
