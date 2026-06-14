<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class DeviceAuth
{
    /**
     * Handle requests from ESP32/IoT devices.
     * Validates X-API-Key header against DEVICE_API_KEY in .env
     */
    public function handle(Request $request, Closure $next): Response
    {
        $apiKey = $request->header('X-API-Key');
        $validKey = config('app.device_api_key');

        // Jika tidak ada key di .env, skip validasi (development mode)
        if (empty($validKey)) {
            return $next($request);
        }

        if (!$apiKey || $apiKey !== $validKey) {
            return response()->json([
                'status' => 'error',
                'message' => 'Unauthorized — API key tidak valid',
            ], 401);
        }

        return $next($request);
    }
}
