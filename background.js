// Helper functions
const getStorageData = async (keys) => {
    return new Promise((resolve) => {
        chrome.storage.local.get(keys, resolve);
    });
};

// Helper function for clean errors
const createCleanError = (message, status = null) => {
    const error = new Error();
    error.message = message;
    if (status !== null) {
        error.status = status;
    }
    // Remove stacktrace
    delete error.stack;
    return error;
}

// Deterministic subdomain generation with daily rotation
const generateDeterministicSubdomain = async (userId, secret, domain) => {
    // Get current day timestamp (same as PHP: floor(time() / 86400))
    const dayTimestamp = Math.floor(Math.floor(Date.now() / 1000) / 86400);

    // Concatenate inputs: userId + domain + dayTimestamp (secret is used as HMAC key, not in message)
    const message = `${userId}${domain}${dayTimestamp}`;

    // Convert to Uint8Array
    const encoder = new TextEncoder();
    const messageData = encoder.encode(message);
    const secretData = encoder.encode(secret);

    // Import secret as HMAC key
    const key = await crypto.subtle.importKey(
        'raw',
        secretData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    // Generate HMAC
    const signature = await crypto.subtle.sign('HMAC', key, messageData);

    // Convert to hex string (full 64 chars)
    const hashArray = Array.from(new Uint8Array(signature));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Truncate to 32 chars (16 bytes = 128 bits) to fit DNS label limit of 63 chars
    return hashHex.substring(0, 32);
};

// Header Injection via webRequest (Firefox-compatible) with dynamic subdomain generation
let headerListenerRegistered = false;
let userCredentials = null; // {userId, secret, appDomain}

const onBeforeSendHeadersListener = async (details) => {
    // Clone headers to avoid mutation issues
    const headers = details.requestHeaders ? [...details.requestHeaders] : [];

    // Remove existing x-openpims to avoid duplicates
    const lower = 'x-openpims';
    for (let i = headers.length - 1; i >= 0; i--) {
        if ((headers[i].name || '').toLowerCase() === lower) {
            headers.splice(i, 1);
        }
    }

    if (userCredentials) {
        try {
            // Extract domain from URL
            const url = new URL(details.url);
            const domain = url.hostname;

            // Generate domain-specific subdomain
            const subdomain = await generateDeterministicSubdomain(
                userCredentials.userId,
                userCredentials.secret,
                domain
            );
            const openPimsUrl = `https://${subdomain}.${userCredentials.appDomain}`;

            headers.push({ name: 'x-openpims', value: openPimsUrl });
        } catch (error) {
            console.error('Error generating subdomain:', error);
        }
    }

    return { requestHeaders: headers };
};

const registerHeaderListener = async () => {
    try {
        if (headerListenerRegistered) {
            return;
        }
        chrome.webRequest.onBeforeSendHeaders.addListener(
            onBeforeSendHeadersListener,
            { urls: ["<all_urls>"] },
            ["blocking", "requestHeaders"]
        );
        headerListenerRegistered = true;
    } catch (error) {
        console.error('Error registering header listener:', error);
    }
};

const unregisterHeaderListener = async () => {
    try {
        if (headerListenerRegistered) {
            chrome.webRequest.onBeforeSendHeaders.removeListener(onBeforeSendHeadersListener);
            headerListenerRegistered = false;
        }
        userCredentials = null;
    } catch (error) {
        console.error('Error removing header listener:', error);
    }
};

const updateHeaderRules = async () => {
    try {
        const { userId, secret, appDomain } = await getStorageData(['userId', 'secret', 'appDomain']);

        if (!userId || !secret || !appDomain) {
            console.error('No user ID, secret, or app domain available for header rules');
            return;
        }

        // Update credentials for header listener
        userCredentials = { userId, secret, appDomain };
        await registerHeaderListener();
    } catch (error) {
        console.error('Error updating header rules:', error);
    }
};

// Event Listener
const initializeExtension = async () => {
    try {
        const { isLoggedIn } = await getStorageData(['isLoggedIn']);

        if (isLoggedIn) {
            await updateHeaderRules();
        }
    } catch (error) {
        console.error('Error during initialization:', error);
    }
};

// Event Listener for storage changes
chrome.storage.onChanged.addListener(async (changes, namespace) => {
    if (namespace === 'local') {
        if (changes.isLoggedIn) {
            if (changes.isLoggedIn.newValue) {
                await updateHeaderRules();
            } else {
                // User logged out
                await unregisterHeaderListener();
            }
        }
    }
});

// Initialization
initializeExtension();

// Helper function for UTF-8 safe Base64 encoding
const utf8ToBase64 = (str) => {
    try {
        // TextEncoder for correct UTF-8 encoding
        const bytes = new TextEncoder().encode(str);
        // Convert to binary string
        const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join('');
        return btoa(binString);
    } catch (e) {
        // Fallback to simple btoa
        return btoa(str);
    }
};

// Login function
const handleLogin = async (email, password, serverUrl) => {
    try {
        const response = await fetch(serverUrl, {
            method: 'GET',
            headers: {
                'Authorization': 'Basic ' + utf8ToBase64(email + ':' + password)
            }
        });

        if (!response.ok) {
            let errorMessage;

            switch (response.status) {
                case 401:
                    errorMessage = 'Invalid email or password';
                    break;
                case 403:
                    errorMessage = 'Access denied';
                    break;
                case 404:
                    errorMessage = 'Login service not reachable';
                    break;
                case 500:
                    errorMessage = 'Server error, please try again later';
                    break;
                default:
                    errorMessage = `Login failed (Status: ${response.status})`;
            }

            throw createCleanError(errorMessage, response.status);
        }

        // Parse response as JSON
        let data;
        try {
            data = await response.json();
        } catch (e) {
            throw createCleanError('Server response has wrong format. Expected JSON with userId, token and domain.');
        }

        if (!data.userId || !data.token || !data.domain) {
            throw createCleanError('No valid user ID, token or domain received from server');
        }

        // Save data
        await chrome.storage.local.set({
            userId: data.userId,
            secret: data.token,
            appDomain: data.domain,
            email: email,
            serverUrl: serverUrl,
            isLoggedIn: true
        });

        // Update header rules
        await updateHeaderRules();

        return { success: true };
    } catch (error) {
        if (error.status) {
            console.error(`Login failed (Status ${error.status}): ${error.message}`);
        } else {
            console.error(`Login failed: ${error.message}`);
        }
        throw createCleanError(error.message, error.status);
    }
};

// Message listener for login requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'login') {
        // Wrapper for async processing
        (async () => {
            try {
                const data = await handleLogin(request.email, request.password, request.serverUrl);
                sendResponse({ success: true, data });
            } catch (error) {
                sendResponse({
                    success: false,
                    error: error.message
                });
            }
        })();

        return true; // Important for async responses
    }
});

