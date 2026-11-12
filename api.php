<?php
// SIAKAD Learn - PHP Backend API for XAMPP (Apache + SQLite/MySQL)
header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, x-auth-token');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Database Connection via PDO SQLite
$dbFile = __DIR__ . '/database.sqlite';
try {
    $pdo = new PDO('sqlite:' . $dbFile);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA foreign_keys = ON;');
} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => 'Gagal koneksi database: ' . $e->getMessage()]);
    exit;
}

// Helper: Response
function jsonResponse($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

function jsonError($message, $code = 400) {
    jsonResponse(['success' => false, 'error' => $message], $code);
}

// Resolve Route
$method = $_SERVER['REQUEST_METHOD'];
$endpoint = isset($_GET['endpoint']) ? $_GET['endpoint'] : '';

if (empty($endpoint)) {
    $uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    // Remove base path /lms-kampus/ or /
    $uri = preg_replace('#^/lms-kampus/#', '/', $uri);
    $uri = preg_replace('#^/api/#', '', $uri);
    $endpoint = trim($uri, '/');
}

// Read JSON input
$input = json_decode(file_get_contents('php://input'), true) ?? [];

// Helper: Authenticated Student
function getAuthStudent($pdo) {
    $token = '';
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    
    if (empty($authHeader) && function_exists('getallheaders')) {
        $headers = getallheaders();
        $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    }
    
    if (strpos($authHeader, 'Bearer ') === 0) {
        $token = trim(substr($authHeader, 7));
    } elseif (isset($_SERVER['HTTP_X_AUTH_TOKEN'])) {
        $token = trim($_SERVER['HTTP_X_AUTH_TOKEN']);
    } elseif (isset($headers['x-auth-token'])) {
        $token = trim($headers['x-auth-token']);
    } elseif (isset($_GET['token'])) {
        $token = trim($_GET['token']);
    }

    if (empty($token)) return null;

    $stmt = $pdo->prepare("
        SELECT s.* 
        FROM auth_sessions a
        JOIN students s ON a.student_id = s.id
        WHERE a.token = ? AND a.expires_at > datetime('now')
    ");
    $stmt->execute([$token]);
    return $stmt->fetch() ?: null;
}

// 1. POST auth/login
if ($method === 'POST' && $endpoint === 'auth/login') {
    $nim = trim($input['nim'] ?? '');
    $password = trim($input['password'] ?? '');

    if (!$nim || !$password) {
        jsonError('NIM dan Password wajib diisi.');
    }

    $stmt = $pdo->prepare('SELECT * FROM students WHERE nim = ? OR email = ?');
    $stmt->execute([$nim, $nim]);
    $student = $stmt->fetch();

    if (!$student) {
        jsonError('NIM mahasiswa tidak terdaftar dalam sistem akademik.', 401);
    }

    if ($student['password'] !== $password) {
        jsonError('Password salah! (Petunjuk demo: gunakan password "123456")', 401);
    }

    $token = bin2hex(random_bytes(16));
    $now = date('Y-m-d H:i:s');
    $expires = date('Y-m-d H:i:s', strtotime('+7 days'));

    $stmt = $pdo->prepare('INSERT INTO auth_sessions (token, student_id, created_at, expires_at) VALUES (?, ?, ?, ?)');
    $stmt->execute([$token, $student['id'], $now, $expires]);

    unset($student['password']);
    jsonResponse([
        'success' => true,
        'message' => 'Selamat datang, ' . $student['name'] . '!',
        'token' => $token,
        'student' => $student
    ]);
}

// 2. GET auth/me
if ($method === 'GET' && $endpoint === 'auth/me') {
    $student = getAuthStudent($pdo);
    if (!$student) jsonError('Sesi telah berakhir atau belum login.', 401);
    unset($student['password']);
    jsonResponse(['success' => true, 'student' => $student]);
}

// 3. POST auth/logout
if ($method === 'POST' && $endpoint === 'auth/logout') {
    $headers = getallheaders();
    $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    $token = strpos($authHeader, 'Bearer ') === 0 ? trim(substr($authHeader, 7)) : '';
    if ($token) {
        $stmt = $pdo->prepare('DELETE FROM auth_sessions WHERE token = ?');
        $stmt->execute([$token]);
    }
    jsonResponse(['success' => true, 'message' => 'Berhasil logout.']);
}

// Protected routes check
$student = getAuthStudent($pdo);
if (!$student) {
    jsonError('Silakan login terlebih dahulu untuk mengakses LMS.', 401);
}
$studentId = $student['id'];

// 4. GET krs
if ($method === 'GET' && $endpoint === 'krs') {
    $stmt = $pdo->prepare("
        SELECT c.*, k.id as krs_id, k.enrolled_at, k.status as krs_status
        FROM krs k
        JOIN courses c ON k.course_id = c.id
        WHERE k.student_id = ?
        ORDER BY c.code ASC
    ");
    $stmt->execute([$studentId]);
    $enrolled = $stmt->fetchAll();

    $enrolledIds = array_column($enrolled, 'id');
    $totalSksTaken = array_sum(array_column($enrolled, 'sks'));

    $allCourses = $pdo->query('SELECT * FROM courses ORDER BY code ASC')->fetchAll();
    $catalog = array_map(function($c) use ($enrolledIds) {
        $c['isEnrolled'] = in_array($c['id'], $enrolledIds);
        return $c;
    }, $allCourses);

    jsonResponse([
        'success' => true,
        'data' => [
            'semester' => (int)$student['semester'],
            'academicYear' => '2026/2027 Gasal',
            'maxSks' => (int)$student['max_sks'],
            'totalSksTaken' => (int)$totalSksTaken,
            'remainingSks' => (int)$student['max_sks'] - (int)$totalSksTaken,
            'status' => 'Disetujui Dosen Pembimbing Akademik',
            'enrolled' => $enrolled,
            'catalog' => $catalog
        ]
    ]);
}

// 5. POST krs/enroll
if ($method === 'POST' && $endpoint === 'krs/enroll') {
    $courseId = $input['courseId'] ?? '';
    if (!$courseId) jsonError('ID Mata Kuliah wajib disertakan.');

    $stmt = $pdo->prepare('SELECT * FROM courses WHERE id = ?');
    $stmt->execute([$courseId]);
    $course = $stmt->fetch();
    if (!$course) jsonError('Mata kuliah tidak ditemukan.', 404);

    $stmt = $pdo->prepare('SELECT id FROM krs WHERE student_id = ? AND course_id = ?');
    $stmt->execute([$studentId, $courseId]);
    if ($stmt->fetch()) jsonError('Mata kuliah ini sudah Anda ambil.');

    $stmt = $pdo->prepare("
        SELECT COALESCE(SUM(c.sks), 0) as total
        FROM krs k JOIN courses c ON k.course_id = c.id
        WHERE k.student_id = ?
    ");
    $stmt->execute([$studentId]);
    $currentSks = (int)$stmt->fetchColumn();

    if ($currentSks + (int)$course['sks'] > (int)$student['max_sks']) {
        jsonError('Batas maksimal SKS terlampaui! Maksimal ' . $student['max_sks'] . ' SKS.');
    }

    $krsId = 'krs-' . time() . '-' . rand(100, 999);
    $now = date('Y-m-d H:i:s');
    $stmt = $pdo->prepare("INSERT INTO krs (id, student_id, course_id, semester, academic_year, status, enrolled_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute([$krsId, $studentId, $courseId, $student['semester'], '2026/2027 Gasal', 'Disetujui', $now]);

    jsonResponse([
        'success' => true,
        'message' => 'Berhasil menambahkan mata kuliah ' . $course['name'] . ' (' . $course['sks'] . ' SKS) ke KRS Anda!'
    ]);
}

// 6. POST krs/drop
if ($method === 'POST' && $endpoint === 'krs/drop') {
    $courseId = $input['courseId'] ?? '';
    if (!$courseId) jsonError('ID Mata Kuliah wajib disertakan.');

    $stmt = $pdo->prepare('DELETE FROM krs WHERE student_id = ? AND course_id = ?');
    $stmt->execute([$studentId, $courseId]);

    jsonResponse(['success' => true, 'message' => 'Mata kuliah berhasil dihapus dari KRS Anda.']);
}

// 7. GET dashboard
if ($method === 'GET' && $endpoint === 'dashboard') {
    $stmt = $pdo->prepare("
        SELECT c.* 
        FROM krs k JOIN courses c ON k.course_id = c.id
        WHERE k.student_id = ?
        ORDER BY c.day, c.time_start ASC
    ");
    $stmt->execute([$studentId]);
    $myCourses = $stmt->fetchAll();
    $myCourseIds = array_column($myCourses, 'id');

    $attendancePercentage = 100;
    $present = 0; $permission = 0; $sick = 0; $alpha = 0;
    $pendingAssignments = 0;
    $submittedAssignments = 0;
    $activeSessionsWithStatus = [];

    if (!empty($myCourseIds)) {
        $inQuery = implode(',', array_fill(0, count($myCourseIds), '?'));
        
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM sessions WHERE course_id IN ($inQuery) AND (is_active = 1 OR session_no < 8)");
        $stmt->execute($myCourseIds);
        $totalSessions = (int)$stmt->fetchColumn();

        $stmt = $pdo->prepare("
            SELECT a.status, COUNT(*) as cnt 
            FROM attendance a JOIN sessions s ON a.session_id = s.id
            WHERE a.student_id = ? AND s.course_id IN ($inQuery)
            GROUP BY a.status
        ");
        $stmt->execute(array_merge([$studentId], $myCourseIds));
        $myAttendance = $stmt->fetchAll();

        foreach ($myAttendance as $a) {
            if ($a['status'] === 'Hadir') $present = (int)$a['cnt'];
            if ($a['status'] === 'Izin') $permission = (int)$a['cnt'];
            if ($a['status'] === 'Sakit') $sick = (int)$a['cnt'];
            if ($a['status'] === 'Alpa') $alpha = (int)$a['cnt'];
        }

        $attendancePercentage = $totalSessions > 0 ? round(($present / $totalSessions) * 100) : 100;

        $stmt = $pdo->prepare("SELECT id FROM assignments WHERE course_id IN ($inQuery)");
        $stmt->execute($myCourseIds);
        $allAssignments = $stmt->fetchAll();

        $stmt = $pdo->prepare("SELECT assignment_id FROM submissions WHERE student_id = ?");
        $stmt->execute([$studentId]);
        $subSet = array_flip($stmt->fetchAll(PDO::FETCH_COLUMN, 0));

        foreach ($allAssignments as $asg) {
            if (isset($subSet[$asg['id']])) $submittedAssignments++;
            else $pendingAssignments++;
        }

        $stmt = $pdo->prepare("
            SELECT s.*, c.name as course_name, c.code as course_code, c.lecturer, c.room, c.color
            FROM sessions s JOIN courses c ON s.course_id = c.id
            WHERE s.is_active = 1 AND s.course_id IN ($inQuery)
        ");
        $stmt->execute($myCourseIds);
        $activeSessions = $stmt->fetchAll();

        foreach ($activeSessions as $sess) {
            $stmtAtt = $pdo->prepare("SELECT * FROM attendance WHERE session_id = ? AND student_id = ?");
            $stmtAtt->execute([$sess['id'], $studentId]);
            $att = $stmtAtt->fetch();
            $sess['hasCheckedIn'] = (bool)$att;
            $sess['myAttendance'] = $att ?: null;
            $activeSessionsWithStatus[] = $sess;
        }
    }

    $totalSksTaken = array_sum(array_column($myCourses, 'sks'));
    $announcements = $pdo->query("SELECT * FROM announcements ORDER BY date DESC LIMIT 3")->fetchAll();
    $todayCourses = array_filter($myCourses, fn($c) => $c['day'] === 'Kamis');

    unset($student['password']);
    jsonResponse([
        'success' => true,
        'data' => [
            'student' => $student,
            'stats' => [
                'ipk' => (float)$student['ipk'],
                'totalCourses' => count($myCourses),
                'totalSks' => $totalSksTaken,
                'maxSks' => (int)$student['max_sks'],
                'attendanceRate' => $attendancePercentage,
                'presentCount' => $present,
                'permissionCount' => $permission,
                'sickCount' => $sick,
                'alphaCount' => $alpha,
                'pendingAssignments' => $pendingAssignments,
                'submittedAssignments' => $submittedAssignments,
                'isEligibleUas' => $attendancePercentage >= 75
            ],
            'activeSessions' => array_values($activeSessionsWithStatus),
            'todayCourses' => array_values($todayCourses),
            'announcements' => $announcements
        ]
    ]);
}

// 8. GET courses
if ($method === 'GET' && $endpoint === 'courses') {
    $stmt = $pdo->prepare("
        SELECT c.* 
        FROM krs k JOIN courses c ON k.course_id = c.id
        WHERE k.student_id = ?
        ORDER BY c.code ASC
    ");
    $stmt->execute([$studentId]);
    $myCourses = $stmt->fetchAll();

    $coursesWithStats = [];
    foreach ($myCourses as $course) {
        $stmtHeld = $pdo->prepare("SELECT id, session_no, is_active FROM sessions WHERE course_id = ? AND (is_active = 1 OR session_no < 8)");
        $stmtHeld->execute([$course['id']]);
        $held = $stmtHeld->fetchAll();

        $stmtAtt = $pdo->prepare("
            SELECT a.status, a.is_late 
            FROM attendance a JOIN sessions s ON a.session_id = s.id
            WHERE s.course_id = ? AND a.student_id = ?
        ");
        $stmtAtt->execute([$course['id'], $studentId]);
        $myAtt = $stmtAtt->fetchAll();

        $presentCount = count(array_filter($myAtt, fn($a) => $a['status'] === 'Hadir'));
        $permissionCount = count(array_filter($myAtt, fn($a) => $a['status'] === 'Izin'));
        $sickCount = count(array_filter($myAtt, fn($a) => $a['status'] === 'Sakit'));
        $totalHeld = count($held);
        $percent = $totalHeld > 0 ? round(($presentCount / $totalHeld) * 100) : 100;

        $stmtActive = $pdo->prepare("SELECT * FROM sessions WHERE course_id = ? AND is_active = 1");
        $stmtActive->execute([$course['id']]);
        $activeSession = $stmtActive->fetch();

        $activeSessionStatus = null;
        if ($activeSession) {
            $stmtAttSess = $pdo->prepare("SELECT * FROM attendance WHERE session_id = ? AND student_id = ?");
            $stmtAttSess->execute([$activeSession['id'], $studentId]);
            $attRec = $stmtAttSess->fetch();
            $activeSessionStatus = array_merge($activeSession, [
                'hasCheckedIn' => (bool)$attRec,
                'attendanceRecord' => $attRec ?: null
            ]);
        }

        $course['stats'] = [
            'totalMeetings' => 16,
            'heldMeetings' => $totalHeld,
            'presentCount' => $presentCount,
            'permissionCount' => $permissionCount,
            'sickCount' => $sickCount,
            'percentage' => $percent,
            'isEligibleUas' => $percent >= 75
        ];
        $course['activeSession'] = $activeSessionStatus;
        $coursesWithStats[] = $course;
    }

    jsonResponse(['success' => true, 'data' => $coursesWithStats]);
}

// 9. GET courses/:id
if ($method === 'GET' && preg_match('#^courses/([a-zA-Z0-9_-]+)$#', $endpoint, $matches)) {
    $courseId = $matches[1];
    $stmt = $pdo->prepare('SELECT * FROM courses WHERE id = ?');
    $stmt->execute([$courseId]);
    $course = $stmt->fetch();
    if (!$course) jsonError('Mata kuliah tidak ditemukan.', 404);

    $stmt = $pdo->prepare("
        SELECT s.*, 
               a.id as att_id, 
               a.status as att_status, 
               a.attendance_time, 
               a.note as att_note, 
               a.file_proof as att_file_proof,
               a.is_late as att_is_late
        FROM sessions s
        LEFT JOIN attendance a ON s.id = a.session_id AND a.student_id = ?
        WHERE s.course_id = ?
        ORDER BY s.session_no ASC
    ");
    $stmt->execute([$studentId, $courseId]);
    $sessions = $stmt->fetchAll();

    $stmt = $pdo->prepare("
        SELECT a.*, 
               sub.id as sub_id,
               sub.file_name as sub_file_name,
               sub.file_path as sub_file_path,
               sub.file_size as sub_file_size,
               sub.submitted_at as sub_submitted_at,
               sub.notes as sub_notes,
               sub.score as sub_score,
               sub.feedback as sub_feedback
        FROM assignments a
        LEFT JOIN submissions sub ON a.id = sub.assignment_id AND sub.student_id = ?
        WHERE a.course_id = ?
        ORDER BY a.deadline ASC
    ");
    $stmt->execute([$studentId, $courseId]);
    $assignments = $stmt->fetchAll();

    jsonResponse(['success' => true, 'data' => ['course' => $course, 'sessions' => $sessions, 'assignments' => $assignments]]);
}

// 10. POST attendance/submit
if ($method === 'POST' && $endpoint === 'attendance/submit') {
    $sessionId = $_POST['sessionId'] ?? ($input['sessionId'] ?? '');
    $status = $_POST['status'] ?? ($input['status'] ?? '');
    $passcode = $_POST['passcode'] ?? ($input['passcode'] ?? '');
    $note = $_POST['note'] ?? ($input['note'] ?? '');

    if (!$sessionId) jsonError('ID Sesi wajib disertakan.');
    if (!in_array($status, ['Hadir', 'Izin', 'Sakit'])) jsonError('Status presensi tidak valid.');

    $stmt = $pdo->prepare('SELECT * FROM sessions WHERE id = ?');
    $stmt->execute([$sessionId]);
    $session = $stmt->fetch();
    if (!$session) jsonError('Sesi perkuliahan tidak ditemukan.', 404);
    if ((int)$session['is_active'] !== 1) jsonError('Sesi presensi perkuliahan ini sedang ditutup.');

    $stmt = $pdo->prepare('SELECT id, status, attendance_time FROM attendance WHERE session_id = ? AND student_id = ?');
    $stmt->execute([$sessionId, $studentId]);
    $existing = $stmt->fetch();
    if ($existing) jsonError('Anda sudah mengisi presensi sesi ini pada ' . $existing['attendance_time'] . ' dengan status: ' . $existing['status']);

    if ($session['passcode'] && strtoupper(trim($passcode)) !== strtoupper(trim($session['passcode']))) {
        jsonError('Kode token presensi salah! (Petunjuk: "' . $session['passcode'] . '")');
    }

    $fileProofName = null;
    if (isset($_FILES['proofFile']) && $_FILES['proofFile']['size'] > 0) {
        $cleanName = time() . '_' . preg_replace('/[^a-zA-Z0-9._-]/', '_', $_FILES['proofFile']['name']);
        move_uploaded_file($_FILES['proofFile']['tmp_name'], __DIR__ . '/uploads/surat/' . $cleanName);
        $fileProofName = $cleanName;
    }

    $now = date('Y-m-d H:i:s');
    $attId = 'att-' . time() . '-' . rand(100, 999);
    $stmt = $pdo->prepare('INSERT INTO attendance (id, session_id, student_id, status, attendance_time, note, file_proof, is_late) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute([$attId, $sessionId, $studentId, $status, $now, $note ?: null, $fileProofName, 0]);

    jsonResponse(['success' => true, 'message' => "Presensi berhasil dicatat! Status: $status"]);
}

// 11. GET assignments
if ($method === 'GET' && $endpoint === 'assignments') {
    $filter = $_GET['filter'] ?? 'all';

    $stmt = $pdo->prepare("
        SELECT a.*, 
               c.name as course_name, 
               c.code as course_code, 
               c.color as course_color,
               c.lecturer,
               s.id as sub_id,
               s.file_name as sub_file_name,
               s.file_path as sub_file_path,
               s.file_size as sub_file_size,
               s.submitted_at as sub_submitted_at,
               s.is_late as sub_is_late,
               s.notes as sub_notes,
               s.score as sub_score,
               s.feedback as sub_feedback
        FROM assignments a
        JOIN courses c ON a.course_id = c.id
        JOIN krs k ON c.id = k.course_id AND k.student_id = ?
        LEFT JOIN submissions s ON a.id = s.assignment_id AND s.student_id = ?
        ORDER BY a.deadline ASC
    ");
    $stmt->execute([$studentId, $studentId]);
    $assignments = $stmt->fetchAll();

    if ($filter === 'pending') {
        $assignments = array_values(array_filter($assignments, fn($a) => empty($a['sub_id'])));
    } elseif ($filter === 'submitted') {
        $assignments = array_values(array_filter($assignments, fn($a) => !empty($a['sub_id']) && $a['sub_score'] === null));
    } elseif ($filter === 'graded') {
        $assignments = array_values(array_filter($assignments, fn($a) => !empty($a['sub_id']) && $a['sub_score'] !== null));
    }

    jsonResponse(['success' => true, 'data' => $assignments]);
}

// 12. GET assignments/:id
if ($method === 'GET' && preg_match('#^assignments/([a-zA-Z0-9_-]+)$#', $endpoint, $matches)) {
    $asgId = $matches[1];
    $stmt = $pdo->prepare("
        SELECT a.*, 
               c.name as course_name, 
               c.code as course_code, 
               c.color as course_color,
               c.lecturer,
               s.id as sub_id,
               s.file_name as sub_file_name,
               s.file_path as sub_file_path,
               s.file_size as sub_file_size,
               s.submitted_at as sub_submitted_at,
               s.is_late as sub_is_late,
               s.notes as sub_notes,
               s.score as sub_score,
               s.feedback as sub_feedback
        FROM assignments a
        JOIN courses c ON a.course_id = c.id
        LEFT JOIN submissions s ON a.id = s.assignment_id AND s.student_id = ?
        WHERE a.id = ?
    ");
    $stmt->execute([$studentId, $asgId]);
    $asg = $stmt->fetch();
    if (!$asg) jsonError('Tugas tidak ditemukan.', 404);
    jsonResponse(['success' => true, 'data' => $asg]);
}

// 13. POST assignments/:id/submit
if ($method === 'POST' && preg_match('#^assignments/([a-zA-Z0-9_-]+)/submit$#', $endpoint, $matches)) {
    $asgId = $matches[1];
    $notes = $_POST['notes'] ?? '';

    if (!isset($_FILES['file']) || $_FILES['file']['size'] === 0) {
        jsonError('Silakan pilih berkas dokumen tugas.');
    }

    $sanitized = time() . '_' . preg_replace('/[^a-zA-Z0-9._-]/', '_', $_FILES['file']['name']);
    $relPath = 'uploads/assignments/' . $sanitized;
    move_uploaded_file($_FILES['file']['tmp_name'], __DIR__ . '/' . $relPath);

    $now = date('Y-m-d H:i:s');
    $stmt = $pdo->prepare('SELECT id FROM submissions WHERE assignment_id = ? AND student_id = ?');
    $stmt->execute([$asgId, $studentId]);
    $existing = $stmt->fetch();

    if ($existing) {
        $stmt = $pdo->prepare("UPDATE submissions SET file_name = ?, file_path = ?, file_size = ?, notes = ?, submitted_at = ? WHERE id = ?");
        $stmt->execute([$_FILES['file']['name'], $relPath, $_FILES['file']['size'], $notes, $now, $existing['id']]);
    } else {
        $subId = 'sub-' . time() . '-' . rand(100, 999);
        $stmt = $pdo->prepare("INSERT INTO submissions (id, assignment_id, student_id, file_name, file_path, file_size, notes, submitted_at, is_late) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([$subId, $asgId, $studentId, $_FILES['file']['name'], $relPath, $_FILES['file']['size'], $notes, $now, 0]);
    }

    jsonResponse(['success' => true, 'message' => 'Tugas berhasil diunggah!']);
}

// 14. DELETE assignments/:id/submission
if (($method === 'DELETE' || ($method === 'POST' && isset($_GET['action']) && $_GET['action'] === 'delete')) && preg_match('#^assignments/([a-zA-Z0-9_-]+)/submission$#', $endpoint, $matches)) {
    $asgId = $matches[1];
    $stmt = $pdo->prepare('DELETE FROM submissions WHERE assignment_id = ? AND student_id = ? AND score IS NULL');
    $stmt->execute([$asgId, $studentId]);
    jsonResponse(['success' => true, 'message' => 'Pengumpulan tugas berhasil dibatalkan.']);
}

jsonError('Endpoint tidak ditemukan: ' . $endpoint, 404);
