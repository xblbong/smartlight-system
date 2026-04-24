<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('sensor_logs', function (Blueprint $table) {
            $table->id();
            $table->string('device_id');
            $table->string('zone')->nullable();
            $table->float('lux')->nullable();
            $table->float('jarak')->nullable();
            $table->boolean('sedangAdaOrang')->default(false);
            $table->boolean('masihMasaTunggu')->default(false);
            $table->boolean('tombol')->default(false);
            $table->float('voltage')->nullable();
            $table->float('current')->nullable();
            $table->string('ldr_status')->nullable();
            $table->string('ultrasonic_status')->nullable();
            $table->string('ina219_status')->nullable();
            $table->string('trigger')->nullable();
            $table->string('kondisi')->nullable();
            $table->integer('powerLampu')->nullable();
            $table->timestamp('timestamp')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('sensor_logs');
    }
};
