<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Models\User;

class AuthController extends Controller
{
    /**
     * Normalize role ke format lowercase_underscore.
     * DB mungkin simpan 'ADMIN SARPRAS' → jadi 'admin_sarpras'
     */
    private function normalizeRole(?string $role): string
    {
        if (!$role) return 'admin_sarpras';
        return strtolower(str_replace(' ', '_', trim($role)));
    }
    /**
     * Login admin dan kembalikan token Sanctum.
     * POST /api/login
     */
    public function login(Request $request)
    {
        $request->validate([
            'email'    => 'required|email',
            'password' => 'required|string|min:4',
        ], [
            'email.required'    => 'Email wajib diisi.',
            'email.email'       => 'Format email tidak valid.',
            'password.required' => 'Password wajib diisi.',
            'password.min'      => 'Password minimal 4 karakter.',
        ]);

        // Cek kredensial
        if (!Auth::attempt(['email' => $request->email, 'password' => $request->password])) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Username atau password salah',
            ], 401);
        }

        /** @var User $user */
        $user  = Auth::user();
        $token = $user->createToken('smart-lighting-admin')->plainTextToken;

        return response()->json([
            'status'  => 'success',
            'message' => 'Login berhasil',
            'token'   => $token,
            'user'    => [
                'id'    => $user->id,
                'name'  => $user->name,
                'email' => $user->email,
                'role'  => $this->normalizeRole($user->role),
            ],
        ], 200);
    }

    /**
     * Logout — revoke token yang sedang dipakai.
     * POST /api/logout  (middleware: auth:sanctum)
     */
    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json([
            'status'  => 'success',
            'message' => 'Logout berhasil',
        ], 200);
    }

    /**
     * Cek apakah token masih valid.
     * GET /api/me  (middleware: auth:sanctum)
     */
    public function me(Request $request)
    {
        $user = $request->user();
        return response()->json([
            'status' => 'success',
            'user'   => [
                'id'    => $user->id,
                'name'  => $user->name,
                'email' => $user->email,
                'role'  => $this->normalizeRole($user->role),
            ],
        ]);
    }
}
