# HAMBAKTECH ENTERPRISE — STAGE 2: DATABASE BACKUP & RESTORATION GUIDE
**Platform**: MySQL 8.0+ / MariaDB 10.11+  
**Target Environment**: Production Cloud Host Cloud / cPanel Shared Hosting  
**Scope**: Disaster Recovery, Automated Cron Exports, phpMyAdmin Procedures

---

## 1. Automated PHP Backup Utility

HambakTech includes a native, standalone backup engine located at `/backend/database/backup.php`. It requires no external shell tools (`mysqldump`) and operates within restricted cPanel hosting environments.

### 1.1 Running Backup via CLI / Terminal
```bash
# Navigate to the backend directory and execute:
php backend/database/backup.php
```
The script will output:
```
Starting MySQL database backup...
Backup saved successfully to /home/[user]/public_html/backend/storage/backups/hambaktech_backup_20261109_164500.sql (184.20 KB).
```

---

## 2. Setting Up Automated Nightly Cron in cPanel

To ensure zero data loss, configure a nightly cron job within your cPanel dashboard:

1. Log into your cPanel account.
2. Under the **Advanced** section, click **Cron Jobs**.
3. Under **Add New Cron Job**, select Common Settings: **Once Per Day (0 0 * * *)** (Midnight Africa/Lagos time).
4. Enter the command:
   ```bash
   /usr/local/bin/php /home/USERNAME/public_html/backend/database/backup.php > /dev/null 2>&1
   ```
   *(Replace `USERNAME` with your actual cPanel username).*
5. Click **Add New Cron Job**.

---

## 3. Alternative Backup via `mysqldump`

If SSH or Terminal access is enabled on your hosting account:

```bash
# Create compressed database backup:
mysqldump -u cpanel_dbuser -p --single-transaction --quick --routines --triggers cpanel_dbname | gzip > ~/backups/hambaktech_$(date +%Y%m%d_%H%M%S).sql.gz
```

---

## 4. Manual Backup via cPanel phpMyAdmin

1. Log into **cPanel** and click **phpMyAdmin** under the **Databases** group.
2. Select `hambaktech_db` from the left sidebar.
3. Click the **Export** tab in the top navigation bar.
4. Choose **Quick - display only the minimal options**.
5. Set Format to **SQL**.
6. Click **Export** to download the complete `.sql` file to your local computer.

---

## 5. Complete Database Restoration Procedures

### 5.1 CLI Restoration (Fastest for large databases)
```bash
# 1. Decompress if gzipped:
gunzip hambaktech_backup.sql.gz

# 2. Import into MySQL/MariaDB:
mysql -u cpanel_dbuser -p cpanel_dbname < hambaktech_backup.sql
```

### 5.2 phpMyAdmin Restoration
1. Open **phpMyAdmin** and select the destination database.
2. Click the **Import** tab.
3. Click **Choose File** and select your `.sql` or `.sql.gz` backup file.
4. Verify Character Set is **utf-8**.
5. Click **Import** at the bottom of the page.
6. Verify that all 46 tables are restored and row counts match previous metrics.

---

## 6. Disaster Recovery Checklist

In the event of server failure or migration to a new hosting provider:
1. [ ] Provision a new database in cPanel (`hambaktech_db`).
2. [ ] Create a database user with `ALL PRIVILEGES` on `hambaktech_db`.
3. [ ] Update database credentials in `/backend/config/config.php` or root `.env`.
4. [ ] Import the latest SQL backup or run `/backend/database/schema.sql` followed by `/backend/database/seed.sql`.
5. [ ] Execute `php backend/database/migrate.php` if restoring from JSON data.
6. [ ] Test `/api/health` in browser: verify response shows `"status": "healthy"` and MySQL driver `"pdo_mysql"`.
7. [ ] Perform a test login with `admin@hambaktech.com.ng` to confirm password verification and wallet balance.
