# OpenPIMS Firefox Extension

Automatic cookie banner blocking through domain-specific HMAC-SHA256 subdomain generation for Firefox.

## Description

OpenPIMS Firefox Extension blocks cookie banners by generating unique, domain-specific URLs using deterministic HMAC-SHA256 hashing. Each website you visit gets its own unique OpenPIMS identifier that rotates daily for enhanced privacy.

## Key Features

- **Automatic Cookie Banner Blocking** - No manual interaction needed
- **Domain-Specific Protection** - Each website gets a unique OpenPIMS URL
- **Daily Rotation** - Subdomains regenerate every 24 hours for privacy
- **HMAC-SHA256 Security** - Cryptographically secure subdomain generation
- **WebRequest Blocking API** - Real-time header modification
- **Zero Configuration** - Works immediately after login

## Demo

Try the extension: https://addons.mozilla.org/de/firefox/addon/openpims/

## Other Versions

- [Chromium Extension](https://github.com/openpims/chromium)
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
5. The extension automatically blocks cookie banners on all websites

## Technical Details

### How It Works
The extension generates domain-specific subdomains using HMAC-SHA256:
- **Input**: `userId + visitedDomain + dayTimestamp`
- **Key**: User's secret token (from authentication)
- **Output**: 32-character hex subdomain (DNS compliant)
- **Result**: `https://{subdomain}.openpims.de` unique per domain

### Platform Capabilities
| Feature | Firefox | Chromium | Safari |
|---------|---------|----------|---------|
| X-OpenPIMS Headers | ✅ | ✅ | ✅ |
| Cookie Injection | ✅ | ✅ | Desktop: ❌ Mobile: ✅ |
| User-Agent Modification | ✅ | ✅ | ✅ Domain-specific |
| Implementation | Manifest V2 | Manifest V3 | Safari Web Extension |

### API Response Format
```json
{
    "userId": "user123",
    "token": "secret_key_for_hmac",
    "domain": "openpims.de"
}
```

### Testing the API
```bash
curl -u "email@example.com:password" https://me.openpims.de
```

## Files

- `manifest.json` - Manifest V2 configuration with webRequest permissions
- `background.js` - Background script with HMAC subdomain generation
- `action.html` - Popup interface (300px width)
- `options.js` - Login flow and storage management
- `styles.css` - Responsive popup styling
- `openpims.png` - Extension icon

## Security

- **HMAC-SHA256** - Cryptographically secure subdomain generation
- **Daily Rotation** - Subdomains change every 24 hours
- **Domain Isolation** - Each website gets its own unique identifier
- **No Tracking** - No data collection or analytics
- **Local Processing** - All hashing done client-side

## Author

Stefan Böck

## Version

0.1.0

## License

See LICENSE file for details.
