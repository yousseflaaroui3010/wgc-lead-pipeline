# Runbook: deploy to the real server — the click-by-click guide

Written for a first-time deployer. Follow in order; each part says what
you should see. Total time: ~2 hours.

Server: SolusVM "2 GB KVM (Unmetered)" from vpshostingservice.co,
$24.95/year (bought 2026-07-13; goes on Jon's invoice). 2 GB RAM is
comfortable for this stack (n8n ~400 MB + nginx). No Supabase or any
external database is needed on a real server — that was only a crutch for
the free-demo plan (deploy-free-demo.md); here n8n keeps its memory on
the server itself.

**Shopping list:**
1. GitHub (free) — so the server can download our code
2. Brevo (free) — sends the real emails (needs activation, start it early)
3. The VPS above — already bought, wait for the welcome email
4. UptimeRobot (free) — watches the site and warns you if it dies

---

## Part 0 — Put the code on GitHub (~10 min)

The server needs to download the code from somewhere. GitHub is that
somewhere.

1. Go to github.com → sign in (or create an account).
2. In VS Code, open the Source Control panel (the branching icon on the
   left, or Ctrl+Shift+G).
3. Under the **wgc-lead-pipeline** repository, click **Publish Branch**.
4. VS Code asks where to publish — choose
   **"Publish to GitHub PRIVATE repository"**. PRIVATE matters: the code
   is client work.
5. When it finishes, note your repo address; it looks like
   `https://github.com/YOUR-USERNAME/wgc-lead-pipeline`.

**You should see:** the repo on github.com when you visit that address.

---

## Part 1 — Brevo, the email sender (~10 min + possible activation wait)

Mailpit was fake; this is the real thing. Every lead email goes through it.
(Menu paths verified against Brevo's help docs, 2026-07-13.)

1. Go to brevo.com → **Sign up free** → confirm your email and fill in
   the company details honestly (Westrom Group / property management) —
   Brevo reviews new accounts before letting them send.
2. In the left menu open **Transactional** → **Settings** →
   **Configuration** → **SMTP relay** (older accounts: profile name
   top-right → SMTP & API).
   - If you see a message that transactional email needs **activation**,
     follow its prompt now (usually a short form about what you'll send —
     answer: "lead notifications from our own website form"). Approval can
     take a few hours, so kick this off early and continue with Part 2
     while you wait.
3. Click **Generate a new SMTP key** → name it `wgc` → **COPY IT NOW**
   (it's shown only once). Also note the **Login** shown next to it.
   The server is `smtp-relay.brevo.com`, port `587`.
4. Go to **Senders, Domains & Dedicated IPs → Senders** → make sure the
   address you'll send FROM is listed and verified (your own address is
   fine to start; authenticating the whole domain improves deliverability
   later).

**Keep handy for later:** login, SMTP key, sender address.

---

## Part 2 — Get into your SolusVM server (~15 min once it's active)

The order is "pending" until the provider sets it up. You'll get a
**welcome email** containing: the server's **IP address**, the **root
password**, and a link to the **SolusVM control panel** (plus its own
login). Keep all of it safe.

1. Wait for the welcome email. If nothing arrives within a day, open a
   support ticket at vpshostingservice.co — pending that long isn't normal.
2. Everywhere this guide says **SERVER-IP**, type the IP from that email.
3. **Check the operating system.** We need **Ubuntu 24.04** (22.04 also
   works). The welcome email usually says which OS was installed. If it's
   something else (CentOS, AlmaLinux, Debian…):
   - Log in to the SolusVM panel from the email → select your server →
     find the **Reinstall** tab → choose **Ubuntu 24.04 64-bit** →
     confirm. Takes a few minutes and sets a new root password (the panel
     shows or emails it).
   - If Ubuntu isn't in the list, ask their support to install it.
4. First login, from your PC's terminal:
   `ssh root@SERVER-IP`
   - First time it asks "are you sure?" → type `yes`.
   - Password: the root password from the email (typing shows nothing on
     screen — that's normal — paste and press Enter).
   **You should see** a prompt like `root@yourserver:~#`. You are now
   typing INTO the server.
5. Immediately change the password (providers email them in plain text):
   type `passwd` → enter a new strong password twice → store it in your
   password manager.
6. Cheap-VPS reality check (30 seconds, still on the server):
   `free -h` should show ~2.0 total memory, and `df -h /` shows your disk.
   If either is wildly less than advertised, ticket the provider now.

---

## Part 3 — Point the domain at the server (~5 min + waiting)

1. Log in wherever wgcassetguide.com is registered (Namecheap, GoDaddy,
   Cloudflare…).
2. Find **DNS settings** / **Manage DNS** for the domain.
3. Add or edit the **A record**: Host/Name = `@`, Value/Points to =
   SERVER-IP, TTL = default. If an A record for `@` already exists,
   change its value instead of adding a second one.
4. Delete any other A record for `@` pointing somewhere else.

**Check it worked** (can take minutes to a few hours): on your PC run
`nslookup wgcassetguide.com` — the answer should show SERVER-IP.
Don't continue to Part 5 until it does (the certificate step needs it).

---

## Part 4 — Prepare the server (~15 min)

1. Reconnect if you closed the window (`ssh root@SERVER-IP`, then your
   new password from Part 2.5).
2. Install updates, then Docker and git (three lines, a few minutes):
   ```
   apt-get update && apt-get upgrade -y
   curl -fsSL https://get.docker.com | sh
   apt-get install -y git
   ```
3. Download the code:
   `git clone https://github.com/YOUR-USERNAME/wgc-lead-pipeline.git /opt/wgc`
   - If the repo is private (it should be), GitHub asks you to log in:
     username = your GitHub name, password = a **token**, not your real
     password. Make one at github.com → Settings → Developer settings →
     Personal access tokens → Fine-grained → Generate (give it read
     access to this one repo). Paste it when asked.
4. Check it's there: `ls /opt/wgc` — you should see `widget`, `n8n`,
   `infra`, `page`, `qa`, `docs`.
5. Turn on the door-guard (firewall) — allows only SSH and web traffic,
   blocks everything else. Run exactly this, in this order (allowing SSH
   FIRST matters, or you lock yourself out):
   ```
   ufw allow OpenSSH
   ufw allow 80/tcp
   ufw allow 443/tcp
   ufw --force enable
   ```
   **You should see:** "Firewall is active and enabled on system startup".

---

## Part 5 — The secrets file (~10 min)

1. Still on the server:
   ```
   cd /opt/wgc/infra
   cp .env.example .env
   ```
2. Generate the three random secrets (run each, copy each output):
   ```
   openssl rand -hex 32   # -> N8N_ENCRYPTION_KEY
   openssl rand -hex 32   # -> WGC_HMAC_SECRET
   openssl rand -hex 8    # -> WGC_HOOK_ID
   ```
3. Open the file: `nano .env` — type the values in after each `=`:
   - the three secrets from step 2
   - `LEADSIMPLE_API_KEY=` stays empty (until Jon's admin sends it)
   - `PARSE_ADDRESS=` → the LeadSimple parse address from Ashley; until
     you have it, put YOUR OWN email so you can see leads arriving
   - `NOTIFY_EMAILS=` → Jon's + Ashley's + your email, comma-separated,
     no spaces
   - `ALERT_EMAIL=` → your email
   - `MAIL_FROM=` → the sender address you verified at Brevo (Part 1.4)
   Save and exit nano: **Ctrl+O**, Enter, **Ctrl+X**.
4. ⚠️ Copy N8N_ENCRYPTION_KEY somewhere OUTSIDE the server too (password
   manager, private note). If the server ever dies, backups are useless
   without this key.
5. Build the little nginx file that hides our webhook address:
   `sh backup/render-hook-id.sh`
   **You should see:** `rendered nginx/hook_id.conf`

---

## Part 6 — Certificate + liftoff (~10 min)

The padlock certificate must exist before the web server can start, so we
fetch it once in standalone mode (only works AFTER Part 3's DNS check
passes):

1. ```
   docker run --rm -p 80:80 -v wgc_certbot_certs:/etc/letsencrypt certbot/certbot certonly --standalone -d wgcassetguide.com --agree-tos -m YOUR-EMAIL --no-eff-email
   ```
   **You should see:** "Successfully received certificate."
2. Start everything:
   ```
   cd /opt/wgc/infra
   docker compose up -d
   ```
3. Checks, from your PC's browser:
   - https://wgcassetguide.com/analysis → the form, with a padlock ✔
   - https://wgcassetguide.com/hook/token → gives an error page for now —
     normal, n8n isn't wired yet.

---

## Part 7 — Wire n8n (~15 min — you've done this before)

The editor is hidden from the internet; you reach it through an SSH side
door:

1. On your PC, open a NEW terminal and run (leave it open the whole time):
   `ssh -L 5678:127.0.0.1:5678 root@SERVER-IP`
2. In your browser: http://localhost:5678 → n8n setup screen.
3. Now repeat **qa/simple-guide.md Part 2** exactly, with THREE
   differences:
   - **Door names:** instead of `dev-hook`, use your WGC_HOOK_ID value
     from Part 5 (read it back anytime with
     `grep WGC_HOOK_ID /opt/wgc/infra/.env`). So the Paths are
     `YOURHOOKID/token` and `YOURHOOKID/lead`.
   - **SMTP credential = Brevo, not mailpit:** Host `smtp-relay.brevo.com`,
     Port `587`, User = your Brevo login, Password = the SMTP key,
     SSL/TLS **OFF** (it upgrades automatically on 587; if test emails
     fail, try port 465 with SSL/TLS ON instead).
   - Everything else identical: import 4 workflows (WF-3 first), pick the
     credential in all 5 email boxes, connect WF-1's dispatch box to WF-2,
     set WF-3 as Error Workflow in WF-1 and WF-2, and **Publish all four**
     (Shift+P — and re-publish after ANY later edit).
4. Test the door from your PC:
   `curl https://wgcassetguide.com/hook/token`
   **You should see:** a long scrambled token. That's the pipeline live
   on the internet.

---

## Part 8 — Watchdog + backups (~15 min)

**Watchdog:**
1. uptimerobot.com → free account → **+ New Monitor** →
   Type: HTTP(s) → URL: `https://wgcassetguide.com/analysis` →
   interval 5 min → your email for alerts → Create.

**Nightly backups:**
2. On the server, open the schedule table: `crontab -e` (pick nano if
   asked) and add this line at the bottom:
   ```
   15 3 * * * OFFSITE_DEST=skip /opt/wgc/infra/backup/backup.sh >> /var/log/wgc-backup.log 2>&1
   ```
   Save (Ctrl+O, Enter, Ctrl+X). That's 3:15 AM nightly, kept 14 days on
   the server.
3. `OFFSITE_DEST=skip` keeps backups on the server only. A copy OFF the
   server matters (if the server dies, backups on it die too) — simplest
   habit: once a week, from YOUR PC run:
   `scp root@SERVER-IP:/var/backups/wgc/$(date +%Y%m)*.tar.gz ~/Downloads/`
   or ask Claude to set up automatic off-server copies (rclone → any
   cloud drive) when you're ready.
4. Fire one manually to check: `OFFSITE_DEST=skip sh /opt/wgc/infra/backup/backup.sh`
   then `ls /var/backups/wgc` — a `.tar.gz` file should be there.

---

## Part 9 — Final tests (~10 min)

Run qa/simple-guide.md Parts 3–5 against the REAL site:
1. https://wgcassetguide.com/analysis → submit a lead with "TEST" in the
   message → the notification email arrives in the real inboxes within a
   minute, and the parse-path email arrives wherever PARSE_ADDRESS points.
2. `sh qa/probes/bot-probes.sh https://wgcassetguide.com/hook` (from the
   repo folder on your PC) → three `{"ok":true}`, no emails.
3. https://wgcassetguide.com/hostile-host.html doesn't exist in prod —
   host CSS isolation was proven locally; the real-site equivalent comes
   with the Goodjuju embed later.

Done. It now runs by itself, forever, with alarms.

---

## Updating the widget later (after code changes)

1. On your PC, in the repo: `npm run check` (must be green), commit, push.
2. On the server:
   ```
   cd /opt/wgc
   cp widget/dist/embed.js widget/dist/embed.prev.js
   git pull
   ```
3. Visitors get the new version within 5 minutes (cache window). No
   restarts needed for form/page changes.

**Rollback** (if the new widget misbehaves):
`cp /opt/wgc/widget/dist/embed.prev.js /opt/wgc/widget/dist/embed.js`

## Updating workflows later

Edit in the n8n editor (through the SSH side door) → **Publish** → also
export the JSON back into `n8n/workflows/` in git so the repo stays the
source of truth → smoke test with one TEST lead.
