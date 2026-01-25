// Application Form Modal Logic
// Handles modal open/close, searchable dropdowns, validation, and submission

(function() {
    'use strict';

    // ============================================
    // CONFIGURATION
    // ============================================
    const CONFIG = {
        RATE_LIMIT_MS: 5000, // 5 seconds between submissions
        MAX_LENGTHS: {
            first_name: 100,
            last_name: 100,
            email: 254,
            phone: 20,
            school: 200,
            country: 100,
            linkedin_url: 200,
            dietary_other: 500,
            additional_comments: 1000
        }
    };

    // State
    let lastSubmissionTime = 0;
    let activeDropdown = null;
    let formHasData = false;

    // ============================================
    // MODAL CONTROLS
    // ============================================
    
    window.openApplicationModal = function() {
        const modal = document.getElementById('application-modal');
        if (!modal) return;
        
        modal.setAttribute('aria-hidden', 'false');
        modal.classList.add('active');
        document.body.classList.add('modal-open');
        
        // Focus first input after animation
        setTimeout(() => {
            const firstInput = modal.querySelector('input:not([type="hidden"])');
            if (firstInput) firstInput.focus();
        }, 100);
        
        // Trap focus inside modal
        trapFocus(modal);
    };

    window.closeApplicationModal = function() {
        const modal = document.getElementById('application-modal');
        if (!modal) return;
        
        modal.setAttribute('aria-hidden', 'true');
        modal.classList.remove('active');
        document.body.classList.remove('modal-open');
        
        // Close any open dropdowns
        closeAllDropdowns();
        
        // Clear focus trap
        document.removeEventListener('keydown', handleFocusTrap);
    };

    // Focus trap for accessibility
    let focusTrapHandler = null;
    
    function trapFocus(modal) {
        const focusableElements = modal.querySelectorAll(
            'button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstFocusable = focusableElements[0];
        const lastFocusable = focusableElements[focusableElements.length - 1];

        focusTrapHandler = function(e) {
            if (e.key === 'Tab') {
                if (e.shiftKey) {
                    if (document.activeElement === firstFocusable) {
                        lastFocusable.focus();
                        e.preventDefault();
                    }
                } else {
                    if (document.activeElement === lastFocusable) {
                        firstFocusable.focus();
                        e.preventDefault();
                    }
                }
            }
            
            // Close on Escape
            if (e.key === 'Escape') {
                closeApplicationModal();
            }
        };

        document.addEventListener('keydown', focusTrapHandler);
    }

    function handleFocusTrap(e) {
        if (focusTrapHandler) focusTrapHandler(e);
    }

    // ============================================
    // SEARCHABLE DROPDOWNS
    // ============================================

    function initSearchableDropdowns() {
        // Initialize school dropdown
        initDropdown('school', MLH_SCHOOLS);
        
        // Initialize country dropdown
        initDropdown('country', COUNTRIES);
    }

    function initDropdown(type, data) {
        const input = document.getElementById(`apply-${type}`);
        const hiddenInput = document.getElementById(`apply-${type}-value`);
        const list = document.getElementById(`${type}-list`);
        const dropdown = document.getElementById(`${type}-dropdown`);
        
        if (!input || !list || !dropdown) return;

        let highlightedIndex = -1;
        let filteredData = [];

        // Populate initial list
        function populateList(searchTerm = '') {
            const term = searchTerm.toLowerCase().trim();
            
            if (term === '') {
                // Show first 50 items when empty
                filteredData = data.slice(0, 50);
            } else {
                // Filter and limit results
                filteredData = data.filter(item => 
                    item.toLowerCase().includes(term)
                ).slice(0, 100);
            }

            list.innerHTML = '';
            highlightedIndex = -1;

            if (filteredData.length === 0) {
                list.innerHTML = '<div class="dropdown-no-results">No results found</div>';
                return;
            }

            filteredData.forEach((item, index) => {
                const div = document.createElement('div');
                div.className = 'dropdown-item';
                div.textContent = item;
                div.dataset.index = index;
                div.dataset.value = item;
                
                div.addEventListener('click', () => selectItem(item));
                div.addEventListener('mouseenter', () => {
                    highlightedIndex = index;
                    updateHighlight();
                });
                
                list.appendChild(div);
            });
        }

        function selectItem(value) {
            input.value = value;
            hiddenInput.value = value;
            closeDropdown();
            input.classList.remove('invalid');
            input.classList.add('valid');
            clearError(type);
        }

        function openDropdown() {
            populateList(input.value);
            list.classList.add('active');
            activeDropdown = type;
        }

        function closeDropdown() {
            list.classList.remove('active');
            highlightedIndex = -1;
            if (activeDropdown === type) activeDropdown = null;
        }

        function updateHighlight() {
            const items = list.querySelectorAll('.dropdown-item');
            items.forEach((item, index) => {
                item.classList.toggle('highlighted', index === highlightedIndex);
            });
            
            // Scroll highlighted item into view
            if (highlightedIndex >= 0 && items[highlightedIndex]) {
                items[highlightedIndex].scrollIntoView({ block: 'nearest' });
            }
        }

        // Event listeners
        input.addEventListener('focus', openDropdown);
        
        input.addEventListener('input', () => {
            populateList(input.value);
            if (!list.classList.contains('active')) {
                openDropdown();
            }
            // Clear hidden value when typing
            hiddenInput.value = '';
            input.classList.remove('valid');
        });

        input.addEventListener('keydown', (e) => {
            if (!list.classList.contains('active')) return;

            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    highlightedIndex = Math.min(highlightedIndex + 1, filteredData.length - 1);
                    updateHighlight();
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    highlightedIndex = Math.max(highlightedIndex - 1, 0);
                    updateHighlight();
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (highlightedIndex >= 0 && filteredData[highlightedIndex]) {
                        selectItem(filteredData[highlightedIndex]);
                    }
                    break;
                case 'Escape':
                    closeDropdown();
                    break;
                case 'Tab':
                    closeDropdown();
                    break;
            }
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target)) {
                closeDropdown();
            }
        });

        // Validate on blur - check if value is in list
        input.addEventListener('blur', () => {
            setTimeout(() => {
                if (activeDropdown === type) return; // Still focused in dropdown
                
                const value = input.value.trim();
                if (value && !data.includes(value)) {
                    // Check for close match
                    const match = data.find(item => 
                        item.toLowerCase() === value.toLowerCase()
                    );
                    if (match) {
                        input.value = match;
                        hiddenInput.value = match;
                        input.classList.add('valid');
                    } else {
                        // Allow custom entry for "Other" case
                        hiddenInput.value = value;
                    }
                } else if (value) {
                    hiddenInput.value = value;
                }
            }, 200);
        });
    }

    function closeAllDropdowns() {
        document.querySelectorAll('.dropdown-list').forEach(list => {
            list.classList.remove('active');
        });
        activeDropdown = null;
    }

    // ============================================
    // FORM VALIDATION
    // ============================================

    function validateField(name, value, showError = true) {
        let isValid = true;
        let message = '';

        switch (name) {
            case 'first_name':
            case 'last_name':
                if (!value.trim()) {
                    isValid = false;
                    message = 'This field is required.';
                } else if (value.length > CONFIG.MAX_LENGTHS[name]) {
                    isValid = false;
                    message = `Maximum ${CONFIG.MAX_LENGTHS[name]} characters.`;
                }
                break;

            case 'email':
                const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
                if (!value.trim()) {
                    isValid = false;
                    message = 'Email is required.';
                } else if (!emailRegex.test(value)) {
                    isValid = false;
                    message = 'Please enter a valid email address.';
                } else if (value.length > CONFIG.MAX_LENGTHS.email) {
                    isValid = false;
                    message = 'Email is too long.';
                }
                break;

            case 'phone':
                const phoneRegex = /^[\d\s\-\+\(\)\.]+$/;
                if (!value.trim()) {
                    isValid = false;
                    message = 'Phone number is required.';
                } else if (!phoneRegex.test(value)) {
                    isValid = false;
                    message = 'Please enter a valid phone number.';
                } else if (value.replace(/\D/g, '').length < 7) {
                    isValid = false;
                    message = 'Phone number seems too short.';
                }
                break;

            case 'age':
                if (!value) {
                    isValid = false;
                    message = 'Please select your age.';
                }
                break;

            case 'school':
                if (!value.trim()) {
                    isValid = false;
                    message = 'Please select or enter your school.';
                }
                break;

            case 'level_of_study':
                if (!value) {
                    isValid = false;
                    message = 'Please select your level of study.';
                }
                break;

            case 'country':
                if (!value.trim()) {
                    isValid = false;
                    message = 'Please select or enter your country.';
                }
                break;

            case 'linkedin_url':
                if (value.trim()) {
                    try {
                        const url = new URL(value);
                        if (!url.hostname.includes('linkedin.com')) {
                            isValid = false;
                            message = 'Please enter a valid LinkedIn URL.';
                        }
                    } catch {
                        isValid = false;
                        message = 'Please enter a valid URL.';
                    }
                }
                break;

            case 'mlh_code_of_conduct':
            case 'mlh_privacy_policy':
                if (!value) {
                    isValid = false;
                    message = 'You must agree to continue.';
                }
                break;

            case 'conhacks_college_student':
                if (!value) {
                    isValid = false;
                    message = 'You must confirm you are a college student.';
                }
                break;

            case 'conhacks_in_person':
                if (!value) {
                    isValid = false;
                    message = 'You must confirm you can attend in person.';
                }
                break;
        }

        if (showError) {
            const errorId = getErrorId(name);
            const errorEl = document.getElementById(errorId);
            if (errorEl) {
                errorEl.textContent = message;
            }

            const input = getInputElement(name);
            if (input) {
                input.classList.toggle('invalid', !isValid && value !== '');
                input.classList.toggle('valid', isValid && value !== '');
            }
        }

        return { isValid, message };
    }

    function getErrorId(name) {
        const mapping = {
            'first_name': 'error-first-name',
            'last_name': 'error-last-name',
            'email': 'error-email',
            'phone': 'error-phone',
            'age': 'error-age',
            'school': 'error-school',
            'level_of_study': 'error-level',
            'country': 'error-country',
            'linkedin_url': 'error-linkedin',
            'mlh_code_of_conduct': 'error-mlh-coc',
            'mlh_privacy_policy': 'error-mlh-privacy',
            'conhacks_college_student': 'error-conhacks-college',
            'conhacks_in_person': 'error-conhacks-inperson'
        };
        return mapping[name] || '';
    }

    function getInputElement(name) {
        const mapping = {
            'first_name': 'apply-first-name',
            'last_name': 'apply-last-name',
            'email': 'apply-email',
            'phone': 'apply-phone',
            'age': 'apply-age',
            'school': 'apply-school',
            'level_of_study': 'apply-level',
            'country': 'apply-country',
            'linkedin_url': 'apply-linkedin',
            'mlh_code_of_conduct': 'mlh-coc',
            'mlh_privacy_policy': 'mlh-privacy',
            'conhacks_college_student': 'conhacks-college',
            'conhacks_in_person': 'conhacks-inperson'
        };
        return document.getElementById(mapping[name]);
    }

    function clearError(name) {
        const errorId = getErrorId(name);
        const errorEl = document.getElementById(errorId);
        if (errorEl) {
            errorEl.textContent = '';
        }
    }

    function validateForm() {
        const form = document.getElementById('application-form');
        if (!form) return { isValid: false, data: null };

        const formData = new FormData(form);
        let isValid = true;
        let firstInvalidField = null;

        // Required text/email fields
        const requiredFields = [
            'first_name', 'last_name', 'email', 'phone', 
            'age', 'school', 'level_of_study', 'country'
        ];

        requiredFields.forEach(field => {
            let value = formData.get(field) || '';
            
            // For searchable dropdowns, use hidden value if available
            if (field === 'school') {
                value = document.getElementById('apply-school-value').value || 
                        document.getElementById('apply-school').value;
            }
            if (field === 'country') {
                value = document.getElementById('apply-country-value').value || 
                        document.getElementById('apply-country').value;
            }
            
            const result = validateField(field, value);
            if (!result.isValid) {
                isValid = false;
                if (!firstInvalidField) {
                    firstInvalidField = getInputElement(field);
                }
            }
        });

        // Optional LinkedIn validation
        const linkedinUrl = formData.get('linkedin_url') || '';
        if (linkedinUrl) {
            const result = validateField('linkedin_url', linkedinUrl);
            if (!result.isValid) {
                isValid = false;
                if (!firstInvalidField) {
                    firstInvalidField = document.getElementById('apply-linkedin');
                }
            }
        }

        // Required checkboxes
        const requiredCheckboxes = [
            'mlh_code_of_conduct', 'mlh_privacy_policy',
            'conhacks_college_student', 'conhacks_in_person'
        ];

        requiredCheckboxes.forEach(name => {
            const checkbox = document.querySelector(`input[name="${name}"]`);
            const checked = checkbox ? checkbox.checked : false;
            const result = validateField(name, checked);
            if (!result.isValid) {
                isValid = false;
                if (!firstInvalidField) {
                    firstInvalidField = checkbox;
                }
            }
        });

        // Focus first invalid field
        if (!isValid && firstInvalidField) {
            firstInvalidField.focus();
            firstInvalidField.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        return { isValid, firstInvalidField };
    }

    // ============================================
    // FORM SUBMISSION
    // ============================================

    function collectFormData() {
        const form = document.getElementById('application-form');
        if (!form) return null;

        // Collect dietary restrictions as array
        const dietaryCheckboxes = form.querySelectorAll('input[name="dietary_restrictions"]:checked');
        const dietaryRestrictions = Array.from(dietaryCheckboxes).map(cb => cb.value);

        const data = {
            email: document.getElementById('apply-email').value.trim().toLowerCase(),
            first_name: document.getElementById('apply-first-name').value.trim(),
            last_name: document.getElementById('apply-last-name').value.trim(),
            age: document.getElementById('apply-age').value,
            phone: document.getElementById('apply-phone').value.trim(),
            school: document.getElementById('apply-school-value').value || 
                    document.getElementById('apply-school').value.trim(),
            level_of_study: document.getElementById('apply-level').value,
            country: document.getElementById('apply-country-value').value || 
                     document.getElementById('apply-country').value.trim(),
            linkedin_url: document.getElementById('apply-linkedin').value.trim(),
            dietary_restrictions: JSON.stringify(dietaryRestrictions),
            dietary_other: document.getElementById('apply-dietary-other').value.trim(),
            mlh_code_of_conduct: document.getElementById('mlh-coc').checked,
            mlh_privacy_policy: document.getElementById('mlh-privacy').checked,
            mlh_emails: document.getElementById('mlh-emails').checked,
            conhacks_college_student: document.getElementById('conhacks-college').checked,
            conhacks_in_person: document.getElementById('conhacks-inperson').checked,
            conhacks_discord: false, // Removed from form
            additional_comments: document.getElementById('apply-comments').value.trim()
        };

        return data;
    }

    async function submitApplication(e) {
        e.preventDefault();

        const messageEl = document.getElementById('application-form-message');
        const submitBtn = document.getElementById('submit-application-btn');

        // Rate limiting
        const now = Date.now();
        if (now - lastSubmissionTime < CONFIG.RATE_LIMIT_MS) {
            showFormMessage(messageEl, 'Please wait a moment before submitting again.', 'error');
            return;
        }

        // Validate form
        const { isValid } = validateForm();
        if (!isValid) {
            showFormMessage(messageEl, 'Please fix the errors above.', 'error');
            return;
        }

        // Collect data
        const data = collectFormData();
        if (!data) {
            showFormMessage(messageEl, 'Error collecting form data.', 'error');
            return;
        }

        // Disable button
        submitBtn.disabled = true;
        submitBtn.textContent = 'SUBMITTING...';
        showFormMessage(messageEl, '', '');

        try {
            const formData = new FormData();
            Object.entries(data).forEach(([key, value]) => {
                if (typeof value === 'boolean') {
                    formData.append(key, value ? '1' : '0');
                } else {
                    formData.append(key, value);
                }
            });

            const response = await fetch('api/apply.php', {
                method: 'POST',
                body: formData,
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            lastSubmissionTime = Date.now();

            const result = await response.json();

            if (result.success) {
                showFormMessage(messageEl, result.message || 'Application submitted successfully!', 'success');
                
                // Reset form data flag
                formHasData = false;
                
                // Reset form after delay
                setTimeout(() => {
                    document.getElementById('application-form').reset();
                    document.getElementById('apply-school-value').value = '';
                    document.getElementById('apply-country-value').value = '';
                    document.getElementById('comments-count').textContent = '0';
                    document.querySelectorAll('.form-input, .form-select').forEach(el => {
                        el.classList.remove('valid', 'invalid');
                    });
                    closeApplicationModal();
                }, 2000);
            } else {
                showFormMessage(messageEl, result.message || 'Submission failed. Please try again.', 'error');
            }
        } catch (error) {
            console.error('Submission error:', error);
            showFormMessage(messageEl, 'Failed to connect to server. Please try again.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'SUBMIT APPLICATION';
        }
    }

    function showFormMessage(element, text, type) {
        if (!element) return;
        element.textContent = text;
        element.className = 'form-message' + (type ? ' ' + type : '');
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================

    function initEventListeners() {
        const form = document.getElementById('application-form');
        if (!form) return;

        // Form submission
        form.addEventListener('submit', submitApplication);

        // Real-time validation on blur
        const textInputs = form.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="url"]');
        textInputs.forEach(input => {
            input.addEventListener('blur', () => {
                const name = input.name;
                if (name) {
                    validateField(name, input.value);
                }
            });
            
            // Clear error on input
            input.addEventListener('input', () => {
                input.classList.remove('invalid');
                const errorId = getErrorId(input.name);
                const errorEl = document.getElementById(errorId);
                if (errorEl) errorEl.textContent = '';
            });
        });

        // Select validation
        const selects = form.querySelectorAll('select');
        selects.forEach(select => {
            select.addEventListener('change', () => {
                validateField(select.name, select.value);
            });
        });

        // Checkbox validation
        const requiredCheckboxes = ['mlh-coc', 'mlh-privacy', 'conhacks-college', 'conhacks-inperson'];
        requiredCheckboxes.forEach(id => {
            const checkbox = document.getElementById(id);
            if (checkbox) {
                checkbox.addEventListener('change', () => {
                    validateField(checkbox.name, checkbox.checked);
                });
            }
        });

        // Character counter for comments
        const commentsInput = document.getElementById('apply-comments');
        const commentsCount = document.getElementById('comments-count');
        if (commentsInput && commentsCount) {
            commentsInput.addEventListener('input', () => {
                commentsCount.textContent = commentsInput.value.length;
            });
        }

        // Prevent modal close on backdrop click (as per requirements)
        const modal = document.getElementById('application-modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                // Only close if clicking the overlay itself, not the container
                // But per requirements, we should NOT close on backdrop click
                // So we do nothing here
            });
        }
    }

    // ============================================
    // BEFOREUNLOAD WARNING
    // ============================================

    function setupBeforeUnloadWarning() {
        const form = document.getElementById('application-form');
        if (!form) return;

        // Track if form has data
        form.addEventListener('input', () => {
            formHasData = true;
        });

        form.addEventListener('change', () => {
            formHasData = true;
        });

        // Warn before leaving if modal is open and form has data
        window.addEventListener('beforeunload', (e) => {
            const modal = document.getElementById('application-modal');
            if (modal && modal.getAttribute('aria-hidden') === 'false' && formHasData) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes in your application. Are you sure you want to leave?';
                return e.returnValue;
            }
        });
    }


    // ============================================
    // INITIALIZATION
    // ============================================

    function init() {
        initSearchableDropdowns();
        initEventListeners();
        setupBeforeUnloadWarning();
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
