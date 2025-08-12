/*
  openPIMS popup script (Firefox, MV2).
  This file is used by action.html as the popup logic (login/logout).
  options.html is deprecated and not used.
*/
// Lade die gespeicherte URL
chrome.storage.local.get(['openPimsUrl', 'isLoggedIn', 'email'], (result) => {
    const loggedInContent = document.getElementById('loggedInContent');
    const loginForm = document.getElementById('loginForm');
    const urlElement = document.getElementById('url');

    if (result.isLoggedIn && result.openPimsUrl) {
        // Safely render user and URL without using innerHTML
        while (urlElement.firstChild) {
            urlElement.removeChild(urlElement.firstChild);
        }
        const userDiv = document.createElement('div');
        userDiv.style.marginBottom = '10px';
        userDiv.textContent = `Angemeldet als: ${result.email || 'Unbekannt'}`;
        const urlDiv = document.createElement('div');
        urlDiv.style.fontSize = '0.9em';
        urlDiv.style.color = '#666';
        urlDiv.textContent = `URL: ${result.openPimsUrl}`;
        urlElement.appendChild(userDiv);
        urlElement.appendChild(urlDiv);
        loggedInContent.classList.remove('hidden');
        loginForm.classList.add('hidden');
    } else {
        loggedInContent.classList.add('hidden');
        loginForm.classList.remove('hidden');
    }
});

// Warte bis das DOM vollständig geladen ist
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM geladen, registriere Event-Listener');
    
    const loginButton = document.getElementById('loginButton');
    if (!loginButton) {
        console.error('Login-Button nicht gefunden!');
        return;
    }

    loginButton.addEventListener('click', async function(e) {
        console.log('Login-Button geklickt');
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const errorMessage = document.getElementById('errorMessage');
        const loginButton = document.getElementById('loginButton');

        // UI-Status zurücksetzen
        errorMessage.textContent = '';
        errorMessage.classList.remove('visible');
        loginButton.disabled = true;
        loginButton.textContent = 'Anmeldung läuft...';

        console.log('E-Mail:', email);
        console.log('Passwort-Länge:', password.length);

        if (!email || !password) {
            errorMessage.textContent = 'Bitte füllen Sie alle Felder aus.';
            errorMessage.classList.add('visible');
            loginButton.disabled = false;
            loginButton.textContent = 'Anmelden';
            return;
        }

        try {
            console.log('Sende Login-Anfrage...');
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    action: 'login',
                    email: email,
                    password: password
                }, response => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(response);
                    }
                });
            });

            console.log('Antwort erhalten:', response);

            if (!response.success) {
                throw new Error(response.error);
            }

            const data = response.data;
            console.log('Login erfolgreich');
            
            await chrome.storage.local.set({ 
                openPimsUrl: data.token,
                email: email,
                isLoggedIn: true
            });
            
            // UI aktualisieren
            document.getElementById('loginForm').classList.add('hidden');
            document.getElementById('loggedInContent').classList.remove('hidden');
            const urlElement = document.getElementById('url');
            while (urlElement.firstChild) {
                urlElement.removeChild(urlElement.firstChild);
            }
            const userDiv = document.createElement('div');
            userDiv.style.marginBottom = '10px';
            userDiv.textContent = `Angemeldet als: ${email}`;
            const urlDiv = document.createElement('div');
            urlDiv.style.fontSize = '0.9em';
            urlDiv.style.color = '#666';
            urlDiv.textContent = `URL: ${data.token}`;
            urlElement.appendChild(userDiv);
            urlElement.appendChild(urlDiv);
            
        } catch (error) {
            // Nur die UI aktualisieren, keine Protokollierung
            errorMessage.textContent = error.message;
            errorMessage.classList.add('visible');
            
            // Setze das Passwort-Feld zurück
            document.getElementById('password').value = '';
            document.getElementById('password').focus();
        } finally {
            // UI-Status zurücksetzen
            loginButton.disabled = false;
            loginButton.textContent = 'Anmelden';
        }
    });
});

// Logout-Button Event Listener
document.getElementById('logoutButton').addEventListener('click', async () => {
    try {
        // Lösche die gespeicherten Daten
        await chrome.storage.local.remove(['openPimsUrl', 'isLoggedIn', 'token', 'email']);
        
        // Aktualisiere die Anzeige
        const loggedInContent = document.getElementById('loggedInContent');
        const loginForm = document.getElementById('loginForm');
        const urlElement = document.getElementById('url');
        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');
        const errorMessage = document.getElementById('errorMessage');

        // Setze Formularfelder zurück
        emailInput.value = '';
        passwordInput.value = '';
        errorMessage.textContent = '';

        loggedInContent.classList.add('hidden');
        loginForm.classList.remove('hidden');
        urlElement.textContent = '';
    } catch (error) {
        console.error('Fehler beim Ausloggen:', error);
    }
});