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
    Route::post('/device/control', [DashboardController::class, 'control']);
    
    // Settings
    Route::get('/settings', [DashboardController::class, 'getSettings']);
    Route::post('/settings', [DashboardController::class, 'saveSettings']);

    // Analytics
    Route::get('/analytics/efficiency', [DashboardController::class, 'efficiency']);
});

// ── IoT Device (Public — ESP32/Python tidak pakai token) ───────────────
// Endpoint untuk menerima data dari Python/ESP32
Route::post('/device/data', [SensorController::class, 'store']);

// Endpoint untuk simulator/ESP32 mengambil dan acknowledge perintah kontrol
Route::get('/device/control/pending', [DashboardController::class, 'pendingControl']);
Route::post('/device/control/ack', [DashboardController::class, 'ackControl']);

// Settings GET juga public agar simulator bisa fetch threshold
Route::get('/settings', [DashboardController::class, 'getSettings']);