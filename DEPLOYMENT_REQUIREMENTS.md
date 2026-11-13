# cPanel Production Deployment Requirements: HambakTech Enterprise
**Target Host**: Production Cloud Host  
**Server IP**: `<CPANEL_HOST>`  
**SFTP Port**: `1624`  
**cPanel Username**: `<CPANEL_USER>`  
**Primary Domain**: `hambaktech.com.ng`  
**Target Path**: `<CPANEL_HOME>/public_html`

---

## 1. Hosting Environment Prerequisites

Ensure the following features are enabled in the cPanel account:
1. **PHP Version**: PHP 8.2+ (Recommended: `ea-php82` or `alt-php82`).
2. **PHP Extensions Required**:
   * `pdo` & `pdo_mysql`: Database communication.
   * `curl`: Outbound API requests to 2SureVerify, Veripine, UlamaData, VTpass, and Flutterwave.
   * `openssl`: Token generation and SSL certificate verification.
   * `mbstring`: UTF-8 string sanitization.
   * `json`: Payload encoding/decoding.
3. **Web Server**: Apache 2.4+ / LiteSpeed with `mod_rewrite` enabled.
4. **Database**: MySQL 8.0+ or MariaDB 10.5+ with InnoDB storage engine.

---

## 2. Directory Layout on cPanel (`public_html`)

```text
<CPANEL_HOME>/public_html/
├── .htaccess                 # Directs API calls to /api and SPA routes to index.html
├── index.html                # Compiled Vite production entry
├── assets/                   # Compiled CSS, JS, and font chunks
│   ├── index-*.js
│   └── index-*.css
├── favicon.ico
└── api/                      # PHP 8.2 Backend (from /backend)
    ├── .htaccess             # API URL rewriter to index.php
    ├── index.php             # Front controller
    ├── config/
    │   ├── config.php        # Protected configuration & credentials
    │   └── database.php      # PDO MySQL singleton
    ├── core/
    │   ├── Router.php
    │   ├── Response.php
    │   ├── Security.php
    │   └── Auth.php
    ├── adapters/
    │   ├── verification/     # 2SureVerify & Veripine
    │   ├── telecom/          # UlamaData & VTpass
    │   └── payment/          # Flutterwave & Moniepoint
    └── database/
        ├── schema.sql        # MySQL schema
        └── seed.sql          # Seed data
```

---

## 3. Step-by-Step Deployment Instructions

### Step 1: Build the Static Frontend Assets
In your local environment, run:
```bash
npm run build
```
This produces minified static production files in the `/dist` directory.

### Step 2: Provision MySQL Database in cPanel
1. Log into cPanel: `http://<CPANEL_HOST>:2083` with user `<CPANEL_USER>`.
2. Go to **MySQL Databases** and create a new database: `<DB_NAME>`.
3. Create a database user: `<DB_USER>` with a strong password.
4. Assign the user to the database with **ALL PRIVILEGES**.
5. Go to **phpMyAdmin**, click `<DB_NAME>`.
6. Import `backend/database/schema.sql`, then import `backend/database/seed.sql`.

### Step 3: Configure Database Credentials in `config.php`
Edit `backend/config/config.php` on the server to match your cPanel database:
```php
'database' => [
    'host' => 'localhost',
    'port' => 3306,
    'database' => '<DB_NAME>',
    'username' => '<DB_USER>',
    'password' => 'YOUR_DB_PASSWORD',
    'charset' => 'utf8mb4',
],
```

### Step 4: Transfer Files via SFTP
Connect to Production Cloud Host SFTP:
* **Host**: `sftp://<CPANEL_HOST>`
* **Port**: `1624`
* **Username**: `<CPANEL_USER>`
* **Password**: `<CPANEL_SFTP_PASSWORD>`

Upload actions:
1. Upload the contents of `/dist` to `<CPANEL_HOME>/public_html/`.
2. Upload the `/backend` folder to `<CPANEL_HOME>/public_html/api/`.

### Step 5: Root `.htaccess` for Dual Routing
Create `<CPANEL_HOME>/public_html/.htaccess`:
```apache
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteBase /

    # Route API requests to PHP backend
    RewriteRule ^api/(.*)$ api/index.php [QSA,L]

    # Route all other requests to Vite SPA index.html
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule ^(.*)$ index.html [L]
</IfModule>
```

### Step 6: Post-Deployment Smoke Test
1. Visit `https://hambaktech.com.ng/api/health` -> verify JSON status `ONLINE`.
2. Visit `https://hambaktech.com.ng` -> verify landing page loads instantly with all assets.
3. Test login with `admin@hambaktech.com.ng`.
