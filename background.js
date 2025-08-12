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

// Header Injection via webRequest (Firefox-compatible)
let openPimsHeaderUrl = null;
let headerListenerRegistered = false;

function onBeforeSendHeadersListener(details) {
    // Clone headers to avoid mutation issues
    const headers = details.requestHeaders ? [...details.requestHeaders] : [];

    // Remove existing x-openpims to avoid duplicates
    const lower = 'x-openpims';
    for (let i = headers.length - 1; i >= 0; i--) {
        if ((headers[i].name || '').toLowerCase() === lower) {
            headers.splice(i, 1);
        }
    }

    if (openPimsHeaderUrl) {
        headers.push({ name: 'x-openpims', value: openPimsHeaderUrl });
    }

    return { requestHeaders: headers };
}

async function registerHeaderListener(url) {
    openPimsHeaderUrl = url;
    try {
        if (headerListenerRegistered) {
            // already registered, nothing to do (url updated via variable)
            console.log('Header-Listener bereits registriert, aktualisiere URL.');
            return;
        }
        chrome.webRequest.onBeforeSendHeaders.addListener(
            onBeforeSendHeadersListener,
            { urls: ["<all_urls>"] },
            ["blocking", "requestHeaders"]
        );
        headerListenerRegistered = true;
        console.log('Header-Listener registriert');
    } catch (error) {
        console.error('Fehler beim Registrieren des Header-Listeners:', error);
    }
}

async function unregisterHeaderListener() {
    try {
        if (headerListenerRegistered) {
            chrome.webRequest.onBeforeSendHeaders.removeListener(onBeforeSendHeadersListener);
            headerListenerRegistered = false;
            console.log('Header-Listener entfernt');
        }
        openPimsHeaderUrl = null;
    } catch (error) {
        console.error('Fehler beim Entfernen des Header-Listeners:', error);
    }
}

// Kompatibilitätsfunktion für altes API
const updateHeaderRules = async (url) => {
    if (!url) {
        console.error('Keine URL für Header verfügbar');
        await unregisterHeaderListener();
        return;
    }
    await registerHeaderListener(url);
};

// Event Listener
const initializeExtension = async () => {
    try {
        const { isLoggedIn, openPimsUrl } = await getStorageData(['openPimsUrl', 'isLoggedIn']);

        if (isLoggedIn && openPimsUrl) {
            await updateHeaderRules(openPimsUrl);
        }
    } catch (error) {
        console.error('Fehler bei der Initialisierung:', error);
    }
};

// Event Listener für Storage-Änderungen
chrome.storage.onChanged.addListener(async (changes, namespace) => {
    if (namespace === 'local') {
        if (changes.openPimsUrl) {
            if (changes.openPimsUrl.newValue) {
                await updateHeaderRules(changes.openPimsUrl.newValue);
            } else {
                // Wenn die URL entfernt wurde (Logout), entferne die Header-Regeln
                try {
                    await unregisterHeaderListener();
                    console.log('Header-Listener erfolgreich entfernt');
                } catch (error) {
                    console.error('Fehler beim Entfernen des Header-Listeners:', error);
                }
            }
        }
    }
});

// Initialisierung
initializeExtension();

// Login-Funktion
async function handleLogin(email, password) {
    try {
        const response = await fetch('https://me.openpims.de', {
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

        const openPimsUrl = await response.text();

        if (!openPimsUrl || openPimsUrl.trim() === '') {
            throw createCleanError('Keine gültige URL vom Server erhalten');
        }

        // Aktualisiere die Header-Regeln mit der neuen URL
        await updateHeaderRules(openPimsUrl.trim());

        // Speichere die Daten
        await chrome.storage.local.set({
            openPimsUrl: openPimsUrl.trim(),
            email: email,
            isLoggedIn: true
        });

        return { token: openPimsUrl.trim() }; // Wir verwenden die URL als Token
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
                const data = await handleLogin(request.email, request.password);
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

