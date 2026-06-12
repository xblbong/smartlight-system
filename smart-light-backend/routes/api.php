<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\SensorController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DashboardController;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/

// ── Auth (Public) ──────────────────────────────────────────────────────
Route::post('/login',  [AuthController::class, 'login']);

// ── Auth (Protected) ───────────────────────────────────────────────────
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me',      [AuthController::class, 'me']);

    // Dashboard & Sensor endpoints (hanya admin yang login)
    Route::get('/device/latest', [SensorController::class, 'latest']);
    Route::get('/sensor/logs',   [SensorController::class, 'logs']);

    // New Dashboard routes
    Route::get('/dashboard/summary', [DashboardController::class, 'summary']);
    Route::get('/device/history', [DashboardController::class, 'history']);
    Route::get('/device/zones', [DashboardController::class, 'zones']);
    Route::post('/device/control', [DashboardController::class, 'control']);
    
    // Settings
    Route::get('/settings', [DashboardController::class, 'getSettings']);
    Route::post('/settings', [DashboardController::class, 'saveSettings']);

    // Analytics
    Route::get('/analytics/efficiency', [DashboardController::class, 'efficiency']);
});

// ── IoT Device (Protected with API Key) ─────────────────────────────
// Endpoint untuk ESP32/Python — wajib X-API-Key header
Route::middleware('device.auth')->group(function () {
    // Kirim data sensor
    Route::post('/device/data', [SensorController::class, 'store']);

    // Ambil dan acknowledge perintah kontrol
    Route::get('/device/control/pending', [DashboardController::class, 'pendingControl']);
    Route::post('/device/control/ack', [DashboardController::class, 'ackControl']);

    // Settings GET agar ESP32 bisa fetch threshold
    Route::get('/settings', [DashboardController::class, 'getSettings']);
});