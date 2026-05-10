<?php

use Illuminate\Database\Migrations\Migration;
use App\Models\SystemSetting;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Ensure lux_threshold exists with default value 100
        // (Lux < 100 = gelap, perlu lampu)
        SystemSetting::updateOrCreate(
            ['key' => 'lux_threshold'],
            ['value' => '100']
        );
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        SystemSetting::where('key', 'lux_threshold')->delete();
    }
};
