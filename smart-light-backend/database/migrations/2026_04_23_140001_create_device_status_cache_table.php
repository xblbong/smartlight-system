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
        Schema::create('device_status_cache', function (Blueprint $table) {
            $table->id();
            $table->string('device_id');
            $table->string('zone')->nullable();
            $table->float('last_lux')->nullable();
            $table->integer('last_power')->nullable();
            $table->string('last_kondisi')->nullable();
            $table->boolean('is_faulty')->default(false);
            $table->timestamps();

            $table->unique(['device_id', 'zone']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('device_status_cache');
    }
};
