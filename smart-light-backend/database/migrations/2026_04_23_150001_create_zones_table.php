<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('zones', function (Blueprint $table) {
            $table->id();
            $table->string('device_id');
            $table->string('zone_code');
            $table->string('zone_name')->nullable();
            $table->timestamps();
            
            $table->unique(['device_id', 'zone_code']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('zones');
    }
};
