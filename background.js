// Konstanten
const CONSTANTS = {
    WINDOW_CONFIG: {
        type: 'popup',
        width: 400,
        height: 600
    },
    RULE_ID: 1,
    RULE_PRIORITY: 1
};

// Hilfsfunktionen
const createLoginWindow = () => {
    chrome.windows.create({
        url: 'login.html',
        ...CONSTANTS.WINDOW_CONFIG
    });
};

const getStorageData = async (keys) => {
    return new Promise((resolve) => {
        chrome.storage.local.get(keys, resolve);
    });
};

// Hilfsfunktion für saubere Fehler
function createCleanError(message, status = null) {
    const error = new Error();
    error.message = message;
    if (status !== null) {
        error.status = status;
    }
    // Entferne den Stacktrace
    delete error.stack;
    return error;
}

// Deterministic subdomain generation with daily rotation
async function generateDeterministicSubdomain(userId, secret, domain) {
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
}

// Header Injection via webRequest (Firefox-compatible) with dynamic subdomain generation
let headerListenerRegistered = false;
let userCredentials = null; // {userId, secret, appDomain}

async function onBeforeSendHeadersListener(details) {
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
}

async function registerHeaderListener() {
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
        console.error('Fehler beim Registrieren des Header-Listeners:', error);
    }
}

async function unregisterHeaderListener() {
    try {
        if (headerListenerRegistered) {
            chrome.webRequest.onBeforeSendHeaders.removeListener(onBeforeSendHeadersListener);
            headerListenerRegistered = false;
        }
        userCredentials = null;
    } catch (error) {
        console.error('Fehler beim Entfernen des Header-Listeners:', error);
    }
}

const updateHeaderRules = async () => {
    try {
        const { userId, secret, appDomain } = await getStorageData(['userId', 'secret', 'appDomain']);

        if (!userId || !secret || !appDomain) {
            console.error('Keine User-ID, Secret oder App-Domain für Header-Regeln vorhanden');
            return;
        }

        // Update credentials for header listener
        userCredentials = { userId, secret, appDomain };
        await registerHeaderListener();
    } catch (error) {
        console.error('Fehler beim Aktualisieren der Header-Regeln:', error);
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
        console.error('Fehler bei der Initialisierung:', error);
    }
};

// Event Listener für Storage-Änderungen
chrome.storage.onChanged.addListener(async (changes, namespace) => {
    if (namespace === 'local') {
        if (changes.isLoggedIn) {
            if (changes.isLoggedIn.newValue) {
                await updateHeaderRules();
            } else {
                // Benutzer ausgeloggt
                await unregisterHeaderListener();
            }
        }
    }
});

// Initialisierung
initializeExtension();

// Login-Funktion
async function handleLogin(email, password, serverUrl) {
    try {
        const response = await fetch(serverUrl, {
            method: 'GET',
            headers: {
                'Authorization': 'Basic ' + btoa(email + ':' + password)
            }
        });

        if (!response.ok) {
            let errorMessage;

            switch (response.status) {
                case 401:
                    errorMessage = 'Ungültige E-Mail oder Passwort';
                    break;
                case 403:
                    errorMessage = 'Zugriff verweigert';
                    break;
                case 404:
                    errorMessage = 'Login-Service nicht erreichbar';
                    break;
                case 500:
                    errorMessage = 'Server-Fehler, bitte versuchen Sie es später erneut';
                    break;
                default:
                    errorMessage = `Login fehlgeschlagen (Status: ${response.status})`;
            }

            throw createCleanError(errorMessage, response.status);
        }

        const contentType = response.headers.get('content-type');
        let data;

        if (contentType && contentType.includes('application/json')) {
            // Server gibt JSON zurück
            data = await response.json();

            if (!data.userId || !data.token || !data.domain) {
                throw createCleanError('Keine gültige User-ID, Token oder Domain vom Server erhalten');
            }

            // Speichere die Daten
            await chrome.storage.local.set({
                userId: data.userId,
                secret: data.token,
                appDomain: data.domain,
                email: email,
                serverUrl: serverUrl,
                isLoggedIn: true
            });
        } else {
            // Fallback: Server gibt nur Text zurück (alte API)
            const text = await response.text();

            if (!text || text.trim() === '') {
                throw createCleanError('Keine gültige Antwort vom Server erhalten');
            }

            // Parse als JSON falls möglich
            try {
                data = JSON.parse(text);

                if (!data.userId || !data.token || !data.domain) {
                    throw createCleanError('Keine gültige User-ID, Token oder Domain vom Server erhalten');
                }

                await chrome.storage.local.set({
                    userId: data.userId,
                    secret: data.token,
                    appDomain: data.domain,
                    email: email,
                    serverUrl: serverUrl,
                    isLoggedIn: true
                });
            } catch (e) {
                // Text ist kein JSON - alte API die nur URL zurückgibt
                throw createCleanError('Server-Antwort hat falsches Format. Erwartet JSON mit userId, token und domain.');
            }
        }

        // Aktualisiere die Header-Regeln
        await updateHeaderRules();

        return { success: true };
    } catch (error) {
        if (error.status) {
            console.error(`Login fehlgeschlagen (Status ${error.status}): ${error.message}`);
        } else {
            console.error(`Login fehlgeschlagen: ${error.message}`);
        }
        throw createCleanError(error.message, error.status);
    }
}

// Message Listener für Login-Anfragen
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'login') {
        // Wrapper für die asynchrone Verarbeitung
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

        return true; // Wichtig für asynchrone Antworten
    }
});

