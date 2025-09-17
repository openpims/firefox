# OpenPIMS Firefox Extension

A Firefox extension for OpenPIMS integration.

## Description

OpenPIMS Firefox Extension provides seamless integration with OpenPIMS services. The extension allows users to authenticate and interact with OpenPIMS directly from their browser.

## Features

- User authentication with OpenPIMS
- Server URL configuration
- Clean, responsive popup interface
- Secure credential management

## Demo

Try the extension: https://addons.mozilla.org/de/firefox/addon/openpims/

## Other Versions

- [Chrome Extension](https://github.com/openpims/chrome)
- [Safari Extension](https://github.com/openpims/safari)
- [mitmproxy Version](https://github.com/openpims/mitmproxy) - For users who prefer not to use browser extensions

## Installation

### Firefox
1. Clone or download this repository
2. Open Firefox and navigate to `about:debugging`
3. Click "This Firefox" in the left sidebar
4. Click "Load Temporary Add-on" and select the `manifest.json` file from the extension directory

## Usage

1. Click the OpenPIMS extension icon in the Firefox toolbar
2. Enter your server URL (defaults to https://me.openpims.de)
3. Provide your email and password credentials
4. Click "Anmelden" to log in

## Files

- `manifest.json` - Extension configuration
- `action.html` - Popup interface
- `options.js` - Extension logic
- `background.js` - Background service worker
- `styles.css` - Stylesheet for the popup
- `openpims.png` - Extension icon

## Author

Stefan Böck

## Version

0.1.0

## License

See LICENSE file for details.
