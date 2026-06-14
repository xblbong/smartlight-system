<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // sensor_logs: indexes untuk GROUP BY, WHERE, dan ORDER BY
        Schema::table('sensor_logs', function (Blueprint $table) {
            $table->index(['device_id', 'zone'], 'idx_sensor_logs_device_zone');
            $table->index(['device_id', 'zone', 'created_at'], 'idx_sensor_logs_device_zone_time');
            $table->index('created_at', 'idx_sensor_logs_created_at');
        });

        // device_controls: indexes untuk pendingControl() query
        Schema::table('device_controls', function (Blueprint $table) {
            $table->index(['device_id', 'executed_at', 'created_at'], 'idx_controls_pending');
        });
    }

    public function down(): void
    {
        Schema::table('sensor_logs', function (Blueprint $table) {
            $table->dropIndex('idx_sensor_logs_device_zone');
            $table->dropIndex('idx_sensor_logs_device_zone_time');
            $table->dropIndex('idx_sensor_logs_created_at');
        });

        Schema::table('device_controls', function (Blueprint $table) {
            $table->dropIndex('idx_controls_pending');
        });
    }
};
