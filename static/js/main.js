// Email validation and sanitization
function sanitizeEmail(email) {
    // Remove leading/trailing whitespace
    email = email.trim();
    
    // Remove any HTML tags (XSS prevention)
    const div = document.createElement('div');
    div.textContent = email;
    email = div.textContent || div.innerText || '';
    
    // Remove any control characters
    email = email.replace(/[\x00-\x1F\x7F]/g, '');
    
    // Convert to lowercase for consistency
    email = email.toLowerCase();
    
    return email;
}

function validateEmail(email) {
    // Basic email regex pattern
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    
    // Check length (RFC 5321 limit)
    if (email.length > 254) {
        return { valid: false, message: 'Email address is too long.' };
    }
    
    // Check for valid format
    if (!emailRegex.test(email)) {
        return { valid: false, message: 'Please enter a valid email address.' };
    }
    
    // Check for common invalid patterns
    if (email.includes('..') || email.startsWith('.') || email.startsWith('@') || email.endsWith('@')) {
        return { valid: false, message: 'Please enter a valid email address.' };
    }
    
    // Check for suspicious patterns (basic XSS prevention)
    const suspiciousPatterns = /<script|javascript:|on\w+\s*=|data:text\/html/i;
    if (suspiciousPatterns.test(email)) {
        return { valid: false, message: 'Invalid characters detected.' };
    }
    
    return { valid: true };
}

// Rate limiting (simple client-side check)
let lastSubmissionTime = 0;
const MIN_SUBMISSION_INTERVAL = 2000; // 2 seconds between submissions

// Handle form submission for both forms
function setupForm(formId, inputId, messageId) {
    const form = document.getElementById(formId);
    const input = document.getElementById(inputId);
    const message = document.getElementById(messageId);
    const submitBtn = form.querySelector('.submit-btn');

    // Real-time validation on input
    input.addEventListener('input', () => {
        const email = input.value.trim();
        if (email && !input.validity.valid) {
            input.classList.add('invalid');
        } else {
            input.classList.remove('invalid');
        }
    });

    // Validation on blur
    input.addEventListener('blur', () => {
        const email = input.value.trim();
        if (email) {
            const validation = validateEmail(email);
            if (!validation.valid) {
                showMessage(message, validation.message, 'error');
                input.classList.add('invalid');
            } else {
                message.textContent = '';
                message.className = 'form-message';
                input.classList.remove('invalid');
            }
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Rate limiting check
        const now = Date.now();
        if (now - lastSubmissionTime < MIN_SUBMISSION_INTERVAL) {
            showMessage(message, 'Please wait a moment before submitting again.', 'error');
            return;
        }
        
        let email = input.value.trim();
        
        // Check if empty
        if (!email) {
            showMessage(message, 'Please enter your email address.', 'error');
            input.focus();
            return;
        }

        // Sanitize email
        email = sanitizeEmail(email);

        // Validate email
        const validation = validateEmail(email);
        if (!validation.valid) {
            showMessage(message, validation.message, 'error');
            input.focus();
            input.classList.add('invalid');
            return;
        }

        // Clear any previous error states
        input.classList.remove('invalid');
        
        // Disable form during submission
        submitBtn.disabled = true;
        submitBtn.textContent = 'SUBMITTING...';
        message.textContent = '';
        message.className = 'form-message';

        try {
            const formData = new FormData();
            formData.append('email', email);

            const response = await fetch('api/submit.php', {
                method: 'POST',
                body: formData,
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            // Update rate limit timestamp
            lastSubmissionTime = Date.now();

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data.success) {
                showMessage(message, data.message || 'Submitted!', 'success');
                input.value = '';
                input.classList.remove('invalid');
            } else {
                showMessage(message, data.message || 'Failed to submit. Please try again.', 'error');
            }
        } catch (error) {
            console.error('Error:', error);
            showMessage(message, 'Failed to connect to server. Please try again.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'SUBMIT';
        }
    });
}

function showMessage(element, text, type) {
    // Sanitize message text to prevent XSS
    const div = document.createElement('div');
    div.textContent = text;
    element.textContent = div.textContent || div.innerText || '';
    element.className = `form-message ${type}`;
}

// Setup both forms when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    setupForm('email-form', 'email-input', 'form-message');
    setupForm('email-form-bottom', 'email-input-bottom', 'form-message-bottom');

    // Smooth scroll offset for fixed nav
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href.startsWith('#')) {
                e.preventDefault();
                const target = document.querySelector(href);
                if (target) {
                    const navHeight = document.querySelector('.pixel-nav').offsetHeight;
                    const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight - 20;
                    window.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });
                }
            }
        });
    });
});

