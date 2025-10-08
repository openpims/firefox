/*
  OpenPIMS popup script (Firefox, MV2).
  This file is used by action.html as the popup logic (login/logout).
  options.html is deprecated and not used.
*/

// Helper function to update UI based on login state
const updateLoginUI = (isLoggedIn, email, serverUrl) => {
    const loggedInContent = document.getElementById('loggedInContent');
    const loginForm = document.getElementById('loginForm');
    const urlElement = document.getElementById('url');

    if (isLoggedIn && email) {
        // Clear previous content
        urlElement.textContent = '';

        // Create logged-in display
        const emailDiv = document.createElement('div');
        emailDiv.style.marginBottom = '10px';
        emailDiv.textContent = `Logged in as: ${email}`;

        const serverDiv = document.createElement('div');
        serverDiv.style.fontSize = '0.9em';
        serverDiv.style.color = '#666';
        serverDiv.textContent = `Server: ${serverUrl || 'https://me.openpims.de'}`;

        urlElement.appendChild(emailDiv);
        urlElement.appendChild(serverDiv);

        loggedInContent.classList.remove('hidden');
        loginForm.classList.add('hidden');
    } else {
        loggedInContent.classList.add('hidden');
        loginForm.classList.remove('hidden');
    }
};

// Load stored data on popup open
chrome.storage.local.get(['userId', 'isLoggedIn', 'email', 'serverUrl'], (result) => {
    updateLoginUI(
        result.isLoggedIn && result.userId,
        result.email || 'Unknown',
        result.serverUrl
    );
});

// Wait until DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const loginButton = document.getElementById('loginButton');
    if (!loginButton) {
        console.error('Login button not found!');
        return;
    }

    // Login button event listener
    loginButton.addEventListener('click', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const serverUrl = document.getElementById('serverUrl').value;
        const errorMessage = document.getElementById('errorMessage');
        const button = document.getElementById('loginButton');

        // Reset UI state
        errorMessage.textContent = '';
        errorMessage.classList.remove('visible');
        button.disabled = true;
        button.textContent = 'Logging in...';

        if (!email || !password || !serverUrl) {
            errorMessage.textContent = 'Please fill in all fields.';
            errorMessage.classList.add('visible');
            button.disabled = false;
            button.textContent = 'Login';
            return;
        }

        try {
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    action: 'login',
                    email: email,
                    password: password,
                    serverUrl: serverUrl
                }, response => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(response);
                    }
                });
            });

            if (!response.success) {
                throw new Error(response.error);
            }

            // Storage was already set in background.js
            // Get updated data
            const result = await new Promise((resolve) => {
                chrome.storage.local.get(['userId', 'email', 'serverUrl'], resolve);
            });

            // Update UI
            updateLoginUI(true, result.email, result.serverUrl);

        } catch (error) {
            // Only update UI, no logging
            errorMessage.textContent = error.message;
            errorMessage.classList.add('visible');

            // Reset password field
            document.getElementById('password').value = '';
            document.getElementById('password').focus();
        } finally {
            // Reset UI state
            button.disabled = false;
            button.textContent = 'Login';
        }
    });

    // Logout button event listener
    document.getElementById('logoutButton').addEventListener('click', async () => {
        try {
            // Delete stored data
            await chrome.storage.local.remove(['userId', 'secret', 'appDomain', 'isLoggedIn', 'email', 'serverUrl']);

            // Update display
            const emailInput = document.getElementById('email');
            const passwordInput = document.getElementById('password');
            const errorMessage = document.getElementById('errorMessage');

            // Reset form fields
            emailInput.value = '';
            passwordInput.value = '';
            errorMessage.textContent = '';

            // Update UI
            updateLoginUI(false, '', '');
        } catch (error) {
            console.error('Error during logout:', error);
        }
    });
});
