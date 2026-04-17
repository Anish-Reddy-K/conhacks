<?php
/**
 * ConHacks Application Form Submission Handler
 * 
 * Security features:
 * - Rate limiting via session (max 3 submissions per 5 minutes)
 * - Input sanitization and validation
 * - Length limits on all text fields
 * - Email and URL validation
 * - XSS prevention via htmlspecialchars
 * - SQL injection prevention (PocketBase handles this, but we sanitize anyway)
 */

// Applications are closed
header('Content-Type: application/json');
http_response_code(403);
echo json_encode([
    'success' => false,
    'message' => 'Applications for ConHacks 2026 are closed. See you next year!'
]);
exit;

// Start session for rate limiting
session_start();

// Load environment variables from .env file
function loadEnv($path = null) {
    if ($path === null) {
        $paths = [
            __DIR__ . '/.env',
            __DIR__ . '/../.env',
            dirname(__DIR__) . '/.env',
        ];
        
        foreach ($paths as $tryPath) {
            if (file_exists($tryPath)) {
                $path = $tryPath;
                break;
            }
        }
    }
    
    if ($path && file_exists($path)) {
        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            if (strpos(trim($line), '#') === 0) {
                continue;
            }
            
            if (strpos($line, '=') !== false) {
                list($key, $value) = explode('=', $line, 2);
                $key = trim($key);
                $value = trim($value);
                $value = trim($value, '"\'');
                $_ENV[$key] = $value;
                putenv("$key=$value");
            }
        }
    }
}

// Load environment variables
loadEnv();

// Set headers first (before any output)
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'success' => false, 
        'message' => 'Invalid request method. Expected POST, got: ' . $_SERVER['REQUEST_METHOD']
    ]);
    exit;
}

// ============================================
// RATE LIMITING
// ============================================

$rateLimitKey = 'application_submissions';
$maxSubmissions = 3;
$timeWindow = 300; // 5 minutes

if (!isset($_SESSION[$rateLimitKey])) {
    $_SESSION[$rateLimitKey] = [];
}

// Clean old entries
$now = time();
$_SESSION[$rateLimitKey] = array_filter($_SESSION[$rateLimitKey], function($timestamp) use ($now, $timeWindow) {
    return ($now - $timestamp) < $timeWindow;
});

// Check rate limit
if (count($_SESSION[$rateLimitKey]) >= $maxSubmissions) {
    http_response_code(429);
    echo json_encode([
        'success' => false, 
        'message' => 'Too many submissions. Please try again in a few minutes.'
    ]);
    exit;
}

// ============================================
// VALIDATION CONFIGURATION
// ============================================

$maxLengths = [
    'first_name' => 100,
    'last_name' => 100,
    'email' => 254,
    'phone' => 20,
    'school' => 200,
    'level_of_study' => 50,
    'country' => 100,
    'linkedin_url' => 200,
    'dietary_other' => 500,
    'additional_comments' => 1000
];

$validLevelsOfStudy = [
    'high_school', 'secondary', 'undergrad_2yr', 'undergrad_3yr',
    'graduate', 'bootcamp', 'vocational', 'postdoc', 'not_student',
    'other', 'prefer_not'
];

$validDietaryOptions = [
    'vegetarian', 'vegan', 'halal', 'kosher', 'celiac', 'allergies'
];

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Sanitize a string input
 */
function sanitizeString($input, $maxLength = 255) {
    if ($input === null) return '';
    
    // Trim whitespace
    $input = trim($input);
    
    // Remove null bytes
    $input = str_replace(chr(0), '', $input);
    
    // Remove control characters except newlines and tabs
    $input = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $input);
    
    // Convert special characters to HTML entities (XSS prevention)
    $input = htmlspecialchars($input, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    
    // Enforce max length
    if (mb_strlen($input) > $maxLength) {
        $input = mb_substr($input, 0, $maxLength);
    }
    
    return $input;
}

/**
 * Validate email format
 */
function validateEmail($email) {
    $email = filter_var(trim($email), FILTER_SANITIZE_EMAIL);
    
    if (empty($email)) {
        return ['valid' => false, 'message' => 'Email is required.', 'value' => ''];
    }
    
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return ['valid' => false, 'message' => 'Invalid email address.', 'value' => ''];
    }
    
    if (strlen($email) > 254) {
        return ['valid' => false, 'message' => 'Email is too long.', 'value' => ''];
    }
    
    return ['valid' => true, 'message' => '', 'value' => strtolower($email)];
}

/**
 * Validate phone number
 */
function validatePhone($phone) {
    $phone = sanitizeString($phone, 20);
    
    if (empty($phone)) {
        return ['valid' => false, 'message' => 'Phone number is required.', 'value' => ''];
    }
    
    // Check for valid phone characters
    if (!preg_match('/^[\d\s\-\+\(\)\.]+$/', $phone)) {
        return ['valid' => false, 'message' => 'Invalid phone number format.', 'value' => ''];
    }
    
    // Check minimum digits
    $digitsOnly = preg_replace('/\D/', '', $phone);
    if (strlen($digitsOnly) < 7) {
        return ['valid' => false, 'message' => 'Phone number seems too short.', 'value' => ''];
    }
    
    return ['valid' => true, 'message' => '', 'value' => $phone];
}

/**
 * Validate URL (optional field)
 */
function validateUrl($url, $requiredDomain = null) {
    $url = trim($url);
    
    // Empty is OK for optional fields
    if (empty($url)) {
        return ['valid' => true, 'message' => '', 'value' => ''];
    }
    
    // Sanitize
    $url = filter_var($url, FILTER_SANITIZE_URL);
    
    // Validate URL format
    if (!filter_var($url, FILTER_VALIDATE_URL)) {
        return ['valid' => false, 'message' => 'Invalid URL format.', 'value' => ''];
    }
    
    // Check domain if required
    if ($requiredDomain) {
        $host = parse_url($url, PHP_URL_HOST);
        if (!$host || strpos($host, $requiredDomain) === false) {
            return ['valid' => false, 'message' => "URL must be from $requiredDomain.", 'value' => ''];
        }
    }
    
    // Length check
    if (strlen($url) > 200) {
        return ['valid' => false, 'message' => 'URL is too long.', 'value' => ''];
    }
    
    return ['valid' => true, 'message' => '', 'value' => $url];
}

/**
 * Validate age
 */
function validateAge($age) {
    if (empty($age)) {
        return ['valid' => false, 'message' => 'Age is required.', 'value' => null];
    }
    
    // Handle "41+" case
    $numericAge = intval($age);
    
    if ($numericAge < 13 || $numericAge > 120) {
        return ['valid' => false, 'message' => 'Please select a valid age.', 'value' => null];
    }
    
    return ['valid' => true, 'message' => '', 'value' => $numericAge];
}

/**
 * Parse boolean from form input
 */
function parseBoolean($value) {
    if ($value === true || $value === 'true' || $value === '1' || $value === 1) {
        return true;
    }
    return false;
}

/**
 * Check if email already exists in PocketBase
 */
function checkEmailExists($email, $apiUrl, $secretKey) {
    // Build the filter query to check for existing email
    $filter = urlencode('email="' . $email . '"');
    $checkUrl = $apiUrl . '?filter=' . $filter . '&fields=id,email';
    
    error_log('Checking for duplicate email: ' . $email);
    error_log('Check URL: ' . $checkUrl);
    
    $ch = curl_init($checkUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPGET, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'X-PB-Secret: ' . $secretKey
    ]);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    
    if (is_resource($ch)) {
        curl_close($ch);
    }
    
    error_log('Check response code: ' . $httpCode);
    error_log('Check response: ' . substr($response, 0, 500));
    if ($curlError) {
        error_log('Check curl error: ' . $curlError);
    }
    
    // If there's an error checking, we'll let the submission proceed
    // and let PocketBase handle the duplicate check
    if ($curlError || $httpCode !== 200) {
        error_log('Email check failed, allowing submission to proceed');
        return false;
    }
    
    $data = json_decode($response, true);
    
    // Check if any records were returned
    if (isset($data['items']) && count($data['items']) > 0) {
        error_log('Duplicate email found!');
        return true;
    }
    
    error_log('No duplicate found');
    return false;
}

/**
 * Validate dietary restrictions array
 */
function validateDietaryRestrictions($json) {
    if (empty($json)) {
        return [];
    }
    
    $restrictions = json_decode($json, true);
    
    if (!is_array($restrictions)) {
        return [];
    }
    
    global $validDietaryOptions;
    
    // Filter to only valid options
    $valid = array_filter($restrictions, function($item) use ($validDietaryOptions) {
        return in_array($item, $validDietaryOptions);
    });
    
    return array_values($valid);
}

// ============================================
// PROCESS FORM DATA
// ============================================

$errors = [];
$data = [];

// Required text fields
$requiredTextFields = ['first_name', 'last_name', 'school', 'country'];
foreach ($requiredTextFields as $field) {
    $value = isset($_POST[$field]) ? $_POST[$field] : '';
    $maxLen = isset($maxLengths[$field]) ? $maxLengths[$field] : 255;
    $sanitized = sanitizeString($value, $maxLen);
    
    if (empty($sanitized)) {
        $errors[$field] = ucfirst(str_replace('_', ' ', $field)) . ' is required.';
    } else {
        $data[$field] = $sanitized;
    }
}

// Email validation
$emailResult = validateEmail(isset($_POST['email']) ? $_POST['email'] : '');
if (!$emailResult['valid']) {
    $errors['email'] = $emailResult['message'];
} else {
    $data['email'] = $emailResult['value'];
}

// Phone validation
$phoneResult = validatePhone(isset($_POST['phone']) ? $_POST['phone'] : '');
if (!$phoneResult['valid']) {
    $errors['phone'] = $phoneResult['message'];
} else {
    $data['phone'] = $phoneResult['value'];
}

// Age validation
$ageResult = validateAge(isset($_POST['age']) ? $_POST['age'] : '');
if (!$ageResult['valid']) {
    $errors['age'] = $ageResult['message'];
} else {
    $data['age'] = $ageResult['value'];
}

// Level of study validation
$levelOfStudy = isset($_POST['level_of_study']) ? $_POST['level_of_study'] : '';
if (empty($levelOfStudy)) {
    $errors['level_of_study'] = 'Level of study is required.';
} elseif (!in_array($levelOfStudy, $validLevelsOfStudy)) {
    $errors['level_of_study'] = 'Invalid level of study.';
} else {
    $data['level_of_study'] = $levelOfStudy;
}

// LinkedIn URL validation (optional)
$linkedinResult = validateUrl(
    isset($_POST['linkedin_url']) ? $_POST['linkedin_url'] : '',
    'linkedin.com'
);
if (!$linkedinResult['valid']) {
    $errors['linkedin_url'] = $linkedinResult['message'];
} else {
    $data['linkedin_url'] = $linkedinResult['value'];
}

// Dietary restrictions (optional)
$dietaryRestrictions = validateDietaryRestrictions(
    isset($_POST['dietary_restrictions']) ? $_POST['dietary_restrictions'] : ''
);
$data['dietary_restrictions'] = $dietaryRestrictions;

// Dietary other (optional)
$data['dietary_other'] = sanitizeString(
    isset($_POST['dietary_other']) ? $_POST['dietary_other'] : '',
    $maxLengths['dietary_other']
);

// MLH Checkboxes (2 required, 1 optional)
$mlhCoc = parseBoolean(isset($_POST['mlh_code_of_conduct']) ? $_POST['mlh_code_of_conduct'] : false);
$mlhPrivacy = parseBoolean(isset($_POST['mlh_privacy_policy']) ? $_POST['mlh_privacy_policy'] : false);
$mlhEmails = parseBoolean(isset($_POST['mlh_emails']) ? $_POST['mlh_emails'] : false);

if (!$mlhCoc) {
    $errors['mlh_code_of_conduct'] = 'You must agree to the MLH Code of Conduct.';
}
if (!$mlhPrivacy) {
    $errors['mlh_privacy_policy'] = 'You must agree to the MLH Privacy Policy and Terms.';
}

$data['mlh_code_of_conduct'] = $mlhCoc;
$data['mlh_privacy_policy'] = $mlhPrivacy;
$data['mlh_emails'] = $mlhEmails;

// ConHacks Checkboxes (2 required, 1 optional)
$conhacksCollege = parseBoolean(isset($_POST['conhacks_college_student']) ? $_POST['conhacks_college_student'] : false);
$conhacksInPerson = parseBoolean(isset($_POST['conhacks_in_person']) ? $_POST['conhacks_in_person'] : false);
$conhacksDiscord = parseBoolean(isset($_POST['conhacks_discord']) ? $_POST['conhacks_discord'] : false);

if (!$conhacksCollege) {
    $errors['conhacks_college_student'] = 'You must confirm you are a college student.';
}
if (!$conhacksInPerson) {
    $errors['conhacks_in_person'] = 'You must confirm you can attend in person.';
}

$data['conhacks_college_student'] = $conhacksCollege;
$data['conhacks_in_person'] = $conhacksInPerson;
$data['conhacks_discord'] = $conhacksDiscord;

// Additional comments (optional)
$data['additional_comments'] = sanitizeString(
    isset($_POST['additional_comments']) ? $_POST['additional_comments'] : '',
    $maxLengths['additional_comments']
);

// ============================================
// CHECK FOR VALIDATION ERRORS
// ============================================

if (!empty($errors)) {
    http_response_code(400);
    $firstError = reset($errors);
    echo json_encode([
        'success' => false,
        'message' => $firstError,
        'errors' => $errors
    ]);
    exit;
}

// ============================================
// SEND TO POCKETBASE
// ============================================

// Get PocketBase configuration from environment
$apiUrl = getenv('POCKETBASE_APPLICATIONS_URL');
$secretKey = getenv('POCKETBASE_SECRET_KEY');

// Fallback to the general URL if specific one not set
if (empty($apiUrl)) {
    $baseUrl = getenv('POCKETBASE_API_URL');
    if ($baseUrl) {
        // Assume same base, different collection
        $apiUrl = str_replace('/emails/records', '/applications/records', $baseUrl);
    }
}

if (empty($apiUrl)) {
    error_log('PocketBase applications URL not configured');
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Server configuration error. Please contact support.'
    ]);
    exit;
}

if (empty($secretKey)) {
    error_log('PocketBase secret key not found');
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Server configuration error. Please contact support.'
    ]);
    exit;
}

// ============================================
// CHECK FOR DUPLICATE EMAIL
// ============================================

if (checkEmailExists($data['email'], $apiUrl, $secretKey)) {
    http_response_code(409); // Conflict status code
    echo json_encode([
        'success' => false,
        'message' => 'You have already applied with this email address. We will email you if you are accepted!'
    ]);
    exit;
}

// Prepare data for PocketBase
$pbData = [
    'email' => $data['email'],
    'first_name' => $data['first_name'],
    'last_name' => $data['last_name'],
    'age' => $data['age'],
    'phone' => $data['phone'],
    'school' => $data['school'],
    'level_of_study' => $data['level_of_study'],
    'country' => $data['country'],
    'linkedin_url' => $data['linkedin_url'],
    'dietary_restrictions' => $data['dietary_restrictions'],
    'dietary_other' => $data['dietary_other'],
    'mlh_code_of_conduct' => $data['mlh_code_of_conduct'],
    'mlh_privacy_policy' => $data['mlh_privacy_policy'],
    'mlh_emails' => $data['mlh_emails'],
    'conhacks_college_student' => $data['conhacks_college_student'],
    'conhacks_in_person' => $data['conhacks_in_person'],
    'conhacks_discord' => $data['conhacks_discord'],
    'additional_comments' => $data['additional_comments']
];

// Initialize cURL
$ch = curl_init($apiUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($pbData));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'X-PB-Secret: ' . $secretKey
]);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 15);

// Execute request
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
$curlErrno = curl_errno($ch);

// Close cURL handle
if (is_resource($ch)) {
    curl_close($ch);
}

// Handle cURL errors
if ($curlError || $curlErrno) {
    error_log('PocketBase API cURL Error [' . $curlErrno . ']: ' . $curlError);
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Failed to connect to server. Please try again.'
    ]);
    exit;
}

// Handle HTTP response codes
if ($httpCode >= 200 && $httpCode < 300) {
    // Record successful submission for rate limiting
    $_SESSION[$rateLimitKey][] = time();
    
    http_response_code(200);
    echo json_encode([
        'success' => true,
        'message' => 'Application submitted successfully! We\'ll be in touch soon.'
    ]);
} else {
    // Log error for debugging (server-side only)
    error_log('PocketBase API HTTP Error: ' . $httpCode . ' - Response: ' . substr($response, 0, 500));
    
    // Try to parse error response from PocketBase
    $errorMessage = 'Failed to submit application. Please try again.';
    if ($response) {
        $errorData = json_decode($response, true);
        if (isset($errorData['message'])) {
            $errorMessage = $errorData['message'];
        } elseif (isset($errorData['data']) && isset($errorData['data']['email'])) {
            // Handle duplicate email case
            $errorMessage = 'An application with this email already exists.';
        }
    }
    
    http_response_code($httpCode >= 400 && $httpCode < 500 ? $httpCode : 500);
    echo json_encode([
        'success' => false,
        'message' => $errorMessage
    ]);
}
?>
