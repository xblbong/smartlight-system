<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Tambahkan kolom electrical data (INA219) ke device_status_cache.
     * Diaktifkan karena semua sensor sudah terpasang.
     */
    public function up(): void
    {
        Schema::table('device_status_cache', function (Blueprint $table) {
            if (!Schema::hasColumn('device_status_cache', 'last_voltage')) {
                $table->float('last_voltage')->nullable()->after('last_kondisi');
            }
            if (!Schema::hasColumn('device_status_cache', 'last_current')) {
                $table->float('last_current')->nullable()->after('last_voltage');
            }
        });
    }

    public function down(): void
    {
        Schema::table('device_status_cache', function (Blueprint $table) {
            $table->dropColumn(['last_voltage', 'last_current']);
        });
    }
};
