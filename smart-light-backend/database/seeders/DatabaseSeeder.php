<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // ── Admin Sarpras ── Full Access (Dashboard, Control, Settings, Analytics)
        User::updateOrCreate(
            ['email' => 'admin@ub.ac.id'],
            [
                'name'     => 'Admin Jaka',
                'password' => bcrypt('admin123'),
                'role'     => 'admin_sarpras',
            ]
        );

        // ── Teknisi ── Dashboard + Control Center + Threshold Settings
        User::updateOrCreate(
            ['email' => 'teknisi@ub.ac.id'],
            [
                'name'     => 'Teknisi Budi',
                'password' => bcrypt('teknisi123'),
                'role'     => 'teknisi',
            ]
        );

        // ── Pimpinan ── Dashboard + Analytics (read-only, untuk evaluasi)
        User::updateOrCreate(
            ['email' => 'pimpinan@ub.ac.id'],
            [
                'name'     => 'Dr. Suyanto, M.T.',
                'password' => bcrypt('pimpinan123'),
                'role'     => 'pimpinan',
            ]
        );
    }
}
