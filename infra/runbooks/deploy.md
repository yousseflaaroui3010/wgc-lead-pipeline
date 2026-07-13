# Runbook: deploy to the real server — the click-by-click guide

Written for a first-time deployer. Follow in order; each part says what
you should see. Total time: ~2 hours. Cost: ~€4–6/month for the server
(goes on Jon's invoice) + free email plan.

**Shopping list (accounts you'll create):**
1. GitHub (free) — so the server can download our code
2. Brevo (free) — sends the real emails
3. Hetzner (~€4–6/mo) — the server itself
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

## Part 1 — Brevo, the email sender (~10 min)

Mailpit was fake; this is the real thing. Every lead email goes through it.

1. Go to brevo.com → **Sign up free** → confirm your email.
2. Click your name (top-right) → **SMTP & API** → tab **SMTP**.
3. You'll see: **SMTP server** (`smtp-relay.brevo.com`), **Port** (587),
   **Login** (your email), and a **SMTP key value** — click
   **Generate a new SMTP key**, name it `wgc`, and COPY IT SOMEWHERE SAFE
   (it's shown once).
4. Go to **Senders, Domains & Dedicated IPs → Senders** → make sure the
   email you'll send FROM is listed and verified (your own address is
   fine to start).

**Keep handy for later:** server, port, login, SMTP key, sender address.

---

## Part 2 — Rent the server at Hetzner (~15 min)

1. Go to hetzner.com → **Cloud** → sign up (needs a card or PayPal).
2. In the Cloud Console (console.hetzner.cloud) → **+ New Project** →
   name it `wgc` → open it.
3. Click **Add Server** and choose:
   - **Location:** Ashburn, VA (closest to Texas visitors)
   - **Image:** Ubuntu 24.04
   - **Type:** Shared vCPU → the cheapest x86 option (~€4–6/mo)
   - **Networking:** leave IPv4 + IPv6 ticked
4. **SSH key** (your key to the server — do this, it beats passwords):
   - On your PC, open a terminal and run: `ssh-keygen -t ed25519`
     — press Enter at every question (no passphrase needed).
   - Show the public half: `cat ~/.ssh/id_ed25519.pub`
   - Copy that whole line (starts with `ssh-ed25519`).
   - Back in Hetzner: **Add SSH key** → paste it → name it `my-pc`.
5. Skip volumes/backups/placement (Hetzner's paid backup option is nice
   but our own backups cover us; add it later if you want belt AND
   suspenders).
6. Name the server `wgc-prod` → **Create & Buy Now**.

**You should see:** the server appear with an **IP address** like
`203.0.113.42`. Copy it — you'll use it everywhere below. (Everywhere this
guide says SERVER-IP, type that number.)

7. Optional but smart — the firewall: left menu **Firewalls** →
   **Create Firewall** → add three inbound rules: TCP 22, TCP 80, TCP 443
   → **Apply to** → pick `wgc-prod` → Create.

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

1. From your PC's terminal, connect:
   `ssh root@SERVER-IP`
   First time it asks "are you sure?" → type `yes`. You should land on a
   prompt like `root@wgc-prod:~#`. You are now typing INTO the server.
2. Install Docker (one line, takes a minute):
   `curl -fsSL https://get.docker.com | sh`
3. Download the code:
   `git clone https://github.com/YOUR-USERNAME/wgc-lead-pipeline.git /opt/wgc`
   - If the repo is private (it should be), GitHub asks you to log in:
     username = your GitHub name, password = a **token**, not your real
     password. Make one at github.com → Settings → Developer settings →
     Personal access tokens → Fine-grained → Generate (give it read
     access to this one repo). Paste it when asked.
4. Check it's there: `ls /opt/wgc` — you should see `widget`, `n8n`,
   `infra`, `page`, `qa`, `docs`.

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
